/* =====================================================================
 * 强制质检门禁 qc-gate.js（生成后自动、全维度；任一不过即重试/拒绝，绝不漏给用户）
 * - Q3 场景-品类匹配 / Q4 语种 / Q5 文字安全区不溢出无错字 / Q6 多宫格一致 / Q7 品牌保真
 *   ：本队实现，用 vision 审核。
 * - Q1 主体正确性（无手/人体/道具）/ Q2 细结构完整（辐条等）：由抠图队 matting 模块承载，
 *   这里只定义统一调用接口与预留接入点，不实现。
 *
 * 统一门禁接口约定（供本队与抠图队共用）：
 *   qcCheck(env, { image, type, domain, lang, reference, gt })
 *     -> { pass:bool, failures:[{code,reason}], metrics:{}, retryable:bool }
 * 失败动作分级：同底座重试≤1 → 换 prompt 种子≤1 → rejected（不计费）。
 * ===================================================================*/

import { chatVisionCustom } from '../vision.js';
import { detectProductAndHuman, decideIsolation } from '../matting/product-isolate.js';

// —— 预留接入点：抠图队 matting 模块实现后注入 ——
// Q1 主体正确性（无手/人体/道具）：VL 预检商品是否被手握相连，连手即 rejected。
// Q2 细结构（辐条）：需边缘像素解码（PicWish mask + DecompressionStream）后开启，本期留接口。
export async function mattingQc(env, input) {
  try {
    const pre = await detectProductAndHuman(env, input.image);
    if (!pre || !pre.ok) return { pass: true, skipped: true, reason: 'precheck unavailable' };
    const dec = await decideIsolation(env, { pre });
    if (dec.status === 'rejected') {
      return { pass: false, failures: [{ code: 'Q1_hand_holds_product', reason: dec.reason || 'product held by hand', guide: dec.guide || '' }], metrics: pre.metrics || {} };
    }
    return { pass: true, failures: [], metrics: pre.metrics || {} };
  } catch (e) {
    return { pass: true, skipped: true, reason: 'matting qc error: ' + (e && e.message) };
  }
}

const DOMAIN_HINT = {
  food: 'cold/ice/fresh food & drink tabletop', drink: 'cold fizzy refreshing drink',
  beauty: 'makeup vanity warm light', tech: 'minimal modern desk cool tone',
  home: 'cozy home interior', fashion: 'lifestyle street natural light',
  sports_outdoor: 'outdoor trail/greenway trees', auto: 'road/car setting',
  flower: 'flowers by window soft light', general: 'clean neutral'
};

// 语言码归一化：统一小写、去地区后缀，zh* 一律归到 'zh-cn'。
// （原 bug：'zh-CN'.toLowerCase()='zh-cn'，而旧表键是 'zh'/'zhCN'，命中不了回退 English，
//   导致中文带字图被 Q4 按英文校验、整批误拒。）
function normalizeLangCode(lang) {
  let c = String(lang || 'en').toLowerCase().trim();
  c = c.split(/[-_]/)[0];            // zh-cn / en-us / ko_kr -> zh / en / ko
  if (c.startsWith('zh')) c = 'zh-cn'; // zh / zhcn / zh-cn 一律归中文
  return c;
}
const LANG_NAME_TABLE = {
  en: 'English', 'zh-cn': 'Simplified Chinese', ja: 'Japanese',
  ko: 'Korean', pt: 'Portuguese', ru: 'Russian'
};
function langName(lang) {
  return LANG_NAME_TABLE[normalizeLangCode(lang)] || 'English';
}

/**
 * 归一化 chatVisionCustom 的返回：data 已被 vision.js 的 extractJson 解析成对象，
 * 直接用；只有在极少数情况返回字符串时才再从中 extract JSON。
 * （原实现对对象做 String()→"[object Object]"→正则匹配失败→返回 null，导致 Q1~Q8 静默空过。）
 */
function parseVerdict(data) {
  if (data && typeof data === 'object') return data;
  if (typeof data === 'string' && data.trim()) {
    const m = data.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return data.trim();
  }
  return null;
}

/** 跑一条 vision 判定 */
async function judge(env, system, user, image) {
  const r = await chatVisionCustom(env, {
    system, user, images: [image], maxTokens: 400, temperature: 0.1, timeoutMs: 45000
  });
  if (!r.ok) return null;
  return parseVerdict(r.data);
}

/**
 * @param {object} ctx {image, type, domain, lang, reference, expectedText}
 * @returns {pass, failures, metrics}
 */
export async function runQc(env, ctx = {}) {
  const failures = [];
  const metrics = {};
  const image = ctx.image;
  const dom = ctx.domain || 'general';
  const ln = langName(ctx.lang);

  // Q3 场景-品类匹配
  const q3 = await judge(env,
    'You are an e-commerce image QA. Reply JSON only: {"match":true/false,"reason":""}.',
    'Does the background/environment of this product image fit a product of category "' + dom + '" (expected vibe: ' + (DOMAIN_HINT[dom] || 'clean neutral') + ')? Reply JSON.',
    image);
  metrics.q3 = q3;
  if (q3 && q3.match === false) failures.push({ code: 'Q3_scene_domain', reason: q3.reason || 'background does not match product category' });

  // Q8 不自然支撑：产品被插入底座/台座/亚克力/石头承托，或靠软电源线直立 → 判失败
  const q8 = await judge(env,
    'You are a product-pose QA. Reply JSON only: {"unnatural_support":true/false,"detail":""}.',
    'Does the product appear to be artificially supported by a display stand, pedestal, acrylic/transparent base, plinth, box, rock/stone, or holder? Or is it standing upright only because a soft power cord/wire is propping it up? Answer true ONLY for such unnatural supports (a product resting on its own flat base/feet on a surface is FINE). Reply JSON.',
    image);
  metrics.q8 = q8;
  if (q8 && q8.unnatural_support === true) failures.push({ code: 'Q8_unnatural_support', reason: q8.detail || 'product on a stand/pedestal/cord-prop' });

  // Q4 语种正确
  if (ctx.lang && ctx.lang !== 'da') {
    const q4 = await judge(env,
      'You are an OCR + language QA. Reply JSON only: {"lang":"","correct":true/false,"texts":[]}.',
      'Read ALL on-screen marketing text in this image. Is it entirely in ' + ln + ' with no other language mixed in? Reply JSON.',
      image);
    metrics.q4 = q4;
    if (q4 && q4.correct === false) failures.push({ code: 'Q4_language', reason: 'on-screen text not in ' + ln });
  }

  // Q5 文字安全区/无错字/不溢出
  const q5 = await judge(env,
    'You are a typography QA. Reply JSON only: {"clipped":true/false,"typos":true/false,"headline_complete":true/false}.',
    'Check the headline/title in this image: is it fully visible (NOT clipped/cut off at left/right edges)? Are there any typos or garbled/wrong characters? Reply JSON.',
    image);
  metrics.q5 = q5;
  if (q5 && (q5.clipped === true || q5.typos === true || q5.headline_complete === false)) failures.push({ code: 'Q5_text_overflow_or_typo', reason: 'title clipped or has typos' });

  // Q6 多宫格一致
  if (ctx.type === 'multi_scene' || ctx.type === 'multi_angle' || ctx.type === 'series') {
    const q6 = await judge(env,
      'You are a product-consistency QA. Reply JSON only: {"consistent":true/false,"reason":""}.',
      'Is the SAME product with consistent colors/parts across all panels/tiles? Reply JSON.',
      image);
    metrics.q6 = q6;
    if (q6 && q6.consistent === false) failures.push({ code: 'Q6_consistency', reason: q6.reason || 'product inconsistent across panels' });
  }

  // Q7 品牌/包装保真
  const q7 = await judge(env,
    'You are a trademark/IP QA. Reply JSON only: {"has_unauthorized_logo":true/false,"detail":""}.',
    'Does this image show any real-world brand logo, trademark, or packaging text that would NOT be on a plain product? (e.g. Coca-Cola, Nike, Amazon smile, Apple logo) Reply JSON.',
    image);
  metrics.q7 = q7;
  if (q7 && q7.has_unauthorized_logo === true) failures.push({ code: 'Q7_trademark', reason: q7.detail || 'unauthorized brand logo appeared' });

  // Q8 主体正确性（主销物体必须=参考商品、且为主角）：防场景图把产品画成别的东西
  if (ctx.ref && ctx.productHint) {
    const r8 = await chatVisionCustom(env, {
      system: 'You are an e-commerce subject-correctness QA. Reply JSON only: {"same_product":true/false,"is_protagonist":true/false,"reason":""}.',
      user: [
        'Image 1 = generated marketing image. Image 2 = reference product photo.',
        'Q1: Is the main promoted object in image 1 the SAME product category as image 2 (both a cola drink, both a bicycle)?',
        'Q2: Is that product the clear protagonist/hero, not a small side prop while another object dominates?',
        'expected product: ' + String(ctx.productHint || '').slice(0, 80),
        'Reply JSON only.'
      ].join('\n'),
      images: [image, ctx.ref], maxTokens: 300, temperature: 0.1, timeoutMs: 45000
    });
    let q8 = null;
    if (r8.ok) q8 = parseVerdict(r8.data);
    metrics.q8 = q8;
    if (q8 && (q8.same_product === false || q8.is_protagonist === false)) {
      failures.push({ code: 'Q8_subject_mismatch', reason: q8.reason || 'main product changed from reference' });
    }
  }
  // Q1 主体正确性（无手/人体）：调抠图队预检
  const mq = await mattingQc(env, ctx);
  if (!mq.pass && mq.failures) failures.push(...mq.failures);
  metrics.matting = mq;

  return { pass: failures.length === 0, failures, metrics, retryable: true };
}
