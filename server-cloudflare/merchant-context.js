/* =====================================================================
 * WorkHogee · 统一商品上下文（根因级共享底座）merchant-context.js
 * ---------------------------------------------------------------------
 * 五个伙计（阿图/阿文/阿视/阿发/阿果）必须「懂同一个商品、同一品牌、
 * 同一份事实、同一语种」。本文件把阿图 v0.9.7 已验证的三段式商品理解管线
 * 抽象为唯一可复用入口 buildMerchantContext：
 *
 *   ① OCR 深读：尽力读出主商品本体自有文字（品牌LOGO/型号/价签/规格/材质/部件），
 *               区分 own_text（自有）与 background_brands（背景/道具/覆盖层第三方）。
 *   ② 联网调研：火山方舟生态下由 Worker 直连公开搜索引擎（web-research.js），
 *               查「品牌官方卖点/参数/定位」+「品类消费者真实痛点」。
 *   ③ 会员洞察：把阿果沉淀的本店历史投放经验（buildInsightsContext）一并并入，
 *               让五个伙计的下一次产出都被同一份历史经验反哺（闭环）。
 *   ④ 归一事实：产出结构化 facts + 唯一事实文本 factsBrief，各伙计只在这份底座上
 *               做各自专业产出，杜绝「阿图认识 DTA、阿文却只写品类」的割裂。
 *
 * 工程红线：所有 LLM/HTTP 调用单次硬超时 + AbortController；整轮总时限；
 *          受控并发；任何一段失败都软降级、绝不阻断、失败段 0 计费。
 *
 * 导出：
 *   buildMerchantContext(env, args) —— 主入口，返回统一上下文
 *   runOcrDeepRead(env, args)       —— ① OCR（marketing-plan 复用，避免重复实现）
 *   buildFactsBrief(mctx)           —— 唯一事实文本（各伙计 prompt 直接注入）
 *   filterResearchRelevance(...)    —— 品牌多义离题过滤（marketing-plan 复用）
 * ===================================================================*/

import { chatVisionCustom } from './vision.js';
import { webResearch, researchToBrief } from './web-research.js';

/* ---------- 语种解析（与 marketing-plan 保持同一逻辑，集中到本文件） ---------- */
const LOCALE_TO_LANG = { US: 'en', EU: 'en', SEA: 'en', generic: 'en', CN: 'zh-CN', JP: 'ja', KR: 'ko' };
const LANG_NAME = { en: 'English', 'zh-CN': 'Simplified Chinese', ja: 'Japanese', ko: 'Korean' };

export function resolveLanguage(language, locale) {
  let lang = String(language || '').toLowerCase();
  if (!lang || lang === 'auto') lang = LOCALE_TO_LANG[String(locale || 'generic').toUpperCase()] || 'en';
  if (lang === 'zh-cn' || lang === 'zh') lang = 'zh-CN';
  else if (!LANG_NAME[lang]) lang = 'en';
  return { code: lang, name: LANG_NAME[lang] };
}

/* =====================================================================
 * ① OCR 深读 prompt（canonical：marketing-plan.js 不再各自维护）
 * ===================================================================*/
export const OCR_SYSTEM = [
  '你是资深电商商品图 OCR 与视觉信息提取引擎。请尽力、仔细地看清这 1~5 张商品实拍图，',
  '把「主商品本体上印着/贴着/挂着/刻着的全部文字」逐条照录出来。',
  '【特别要求：尽力识别、不要保守】尽力辨认并照录主商品本体上的——自有品牌 LOGO（如 DTA、小米、XDS，照原样大小写）、',
  '型号/款号、价格标签（如 ¥399 / $59.9）、规格/参数标签（尺寸/材质/容量/承重/尺寸档等）、颜色、可见材质、关键部件。',
  '【美妆/个护/食品必须判定包装形态 package_form】按整体形状与开口区分，不要只看颜色或盖子：',
  '- tube 软管：可挤压的软质圆柱/锥形管，顶配翻盖/压嘴/小旋盖（洁面膏、牙膏、洗面奶、护手霜）；',
  '- jar 罐：宽口、矮胖、硬质，配大旋盖（面霜、面膜、发膜）；',
  '- bottle 瓶：较高、窄口、硬质，配泵头/小旋盖（精华水、乳液、饮料）；另有 box 盒 / can 听 / pouch 袋 / stick 棒。',
  '不要因为管身/瓶身是绿色、配金色盖就判成玻璃罐；材质描述必须与实际形状一致。',
  '不要因为字小/略模糊就留空：先尽力辨认，确实完全不可辨再留空字符串/空数组。绝不主动跳过品牌、型号、价格。',
  '【必须区分两类文字】',
  '- own_text：印在/贴在/挂在主商品本体上的自有文字（品牌LOGO、铭牌、标签、洗水标）。',
  '- background_brands：出现在背景、道具、环境、或后期叠加营销覆盖层里的第三方品牌名/Logo/营销大字——',
  '  这些不是本店商品品牌，单列进 background_brands，不要混进 own_text，也不要当成自有品牌填进 brand。',
  '只输出一个 JSON 对象（不要 markdown/代码块/解释）：',
  '{',
  '  "brand":"主商品本体自有品牌名照录,如 DTA;看不清空字符串",',
  '  "model":"图中型号/款号文字,空则空串",',
  '  "price":"图中价格标签文字(带货币符号),没有则空串",',
  '  "color":"主商品可见颜色",',
  '  "materials":["可见材质/工艺,如 PC聚碳酸酯硬壳/铝合金拉杆/静音万向轮"],',
  '  "package_form":"包装形态:tube软管/bottle瓶/jar罐/box盒/can听/pouch袋/stick棒;非容器类或不确定填空串",',
  '  "category_guess":"具体子品类中文,如 拉杆箱/头戴降噪耳机/纯棉T恤/洁面软管",',
  '  "en_category":"英文品类,如 luggage suitcase / over-ear headphones",',
  '  "own_text":["主商品本体自有文字逐条照录原文"],',
  '  "background_brands":["背景/道具/覆盖层里的第三方品牌或营销大字"],',
  '  "key_parts":["2-4个最值得放大拍细节的部件"]',
  '}'
].join('\n');

/* ---------- 整轮 / 各段时限（工程红线） ---------- */
const TIMEOUTS = {
  ocrMs: 35000,      // ① OCR 单次硬超时
  researchMs: 22000, // ② 联网调研整轮总时限
  insightsMs: 3000,  // ③ 会员洞察硬超时（拿不到即放弃，绝不阻塞）
  totalMs: 90000     // 整轮总时限兜底
};

/**
 * ① OCR 深读（硬超时；失败软降级返回空对象，绝不阻断）。
 * @returns {object} ocr 结构化结果（失败为 {}）
 */
export async function runOcrDeepRead(env, args = {}) {
  const images = (args.images || []).slice(0, 5);
  if (!images.length) return {};
  try {
    const r = await chatVisionCustom(env, {
      system: OCR_SYSTEM,
      user: '这是本店要上架商品的实拍图，共 ' + images.length + ' 张。请尽力读出主商品本体上的品牌/型号/价格/规格等全部自有文字，并区分背景第三方品牌。只输出 JSON。'
        + (args.selling_text ? '\n商家补充信息：' + String(args.selling_text).slice(0, 400) : ''),
      images,
      maxTokens: 1400, temperature: 0.1, timeoutMs: TIMEOUTS.ocrMs
    });
    if (r.ok && r.data) return r.data;
  } catch {}
  return {};
}

/* =====================================================================
 * 品牌多义离题过滤（DTA=差热分析、LEVEL8 撞卡西欧时间显示等）
 * 只剔「明显离题且不含品类词」的品牌结果，消费者需求组不动。
 * ===================================================================*/
const OFFTOPIC_RE = /差热|热分析|thermal analysis|differential thermal|卡西欧|casio|腕?時?計|手表|\bwatch(es)?\b|游戏|game|数码|相机|镜头|app|软件|股票|基金|期货|医学|临床|考试|教程|电视|冰箱|洗衣机/i;

export function filterResearchRelevance(r, catZh, enCat) {
  if (!r || !Array.isArray(r.brandResults)) return r;
  const terms = new Set();
  [catZh, enCat].join(' ').split(/[\s\/,，、;；|]+/).forEach(t => {
    t = t.trim().toLowerCase();
    if (t && t.length >= 2 && t !== 'product') terms.add(t);
  });
  const hasCat = (txt) => [...terms].some(t => txt.includes(t));
  const keepHit = (h) => {
    const txt = ((h.title || '') + ' ' + (h.snippet || '')).toLowerCase();
    if (hasCat(txt)) return true;
    if (OFFTOPIC_RE.test(txt)) return false;
    return true;
  };
  r.brandResults = r.brandResults.filter(keepHit).slice(0, 10);
  if (Array.isArray(r.articles)) {
    r.articles = r.articles.filter(a => {
      const txt = ((a.title || '') + ' ' + (a.text || '')).toLowerCase();
      if (hasCat(txt)) return true;
      if (OFFTOPIC_RE.test(txt)) return false;
      return true;
    }).slice(0, 3);
  }
  return r;
}

/* ---------- ③ 会员洞察（动态 import agu.js，避免静态耦合；硬超时 3s） ---------- */
async function loadInsights(env, shop, signal) {
  if (!shop || !env || !env.MEMBERS) return { text: '', count: 0 };
  const task = (async () => {
    const agu = await import('./agu.js');
    const txt = await agu.buildInsightsContext(env, shop);
    return txt || '';
  })();
  const timer = new Promise(resolve => setTimeout(() => resolve(''), TIMEOUTS.insightsMs));
  try {
    const txt = await Promise.race([task, timer]);
    return { text: txt, count: txt ? txt.split('\n').filter(Boolean).length : 0 };
  } catch {
    return { text: '', count: 0 };
  }
}

/* =====================================================================
 * 唯一事实文本 buildFactsBrief —— 各伙计 prompt 注入的同一份事实
 * ===================================================================*/
export function buildFactsBrief(mctx = {}) {
  const f = mctx.facts || {};
  const L = [];
  L.push('【商品事实 · 唯一事实来源（数字/品牌/型号/规格只能取自此处，缺失即省略，严禁编造）】');
  const isEn = !!mctx.language && /^en/i.test(String(mctx.language.code || mctx.language));
  const hasBrand = !!f.brand;
  let brandShown;
  if (!hasBrand) brandShown = isEn ? '(brand not recognized in image)' : '(图中未识别到)';
  else if (isEn) brandShown = f.brand_latin || f.brand;
  else brandShown = f.brand_local ? (f.brand_local + (f.brand_latin ? '（' + f.brand_latin + '）' : '')) : f.brand;
  L.push((isEn ? 'Brand 品牌（产出中必须出现该品牌名）' : '品牌') + '：' + brandShown +
    (hasBrand && f.brand_source ? '（来源：' + f.brand_source_label + '）' : ''));
  if (f.model) L.push('型号：' + f.model);
  if (f.price) L.push('价格：' + f.price);
  if (f.color) L.push('颜色：' + f.color);
  if ((f.materials || []).length) L.push('可见材质：' + f.materials.join('、'));
  if (f.package_form) {
    const FORM_ZH = { tube: '软管（可挤压，非玻璃罐）', bottle: '瓶', jar: '罐', box: '盒', can: '听/罐', pouch: '袋', stick: '棒' };
    L.push('包装形态：' + (FORM_ZH[f.package_form] || f.package_form));
  }
  L.push('品类：' + f.category_zh + ' / ' + f.category_en);
  if ((f.own_text || []).length) L.push('本体自有文字（照录）：' + f.own_text.join(' | '));
  if ((f.key_parts || []).length) L.push('关键部件：' + f.key_parts.join('、'));
  if ((f.bg_brands || []).length) L.push('背景/第三方品牌（禁止写进任何产出）：' + f.bg_brands.join(' | '));

  const r = f.research || {};
  if ((r.brand_facts || []).length) {
    L.push('');
    L.push('【品牌官方卖点 / 参数（联网，可转成具体卖点）】');
    r.brand_facts.slice(0, 8).forEach(x => L.push('- ' + x));
  }
  if ((r.consumer_needs || []).length) {
    L.push('');
    L.push('【该品类消费者真实痛点 / 关注点（联网，卖点必须回应这些）】');
    r.consumer_needs.slice(0, 8).forEach(x => L.push('- ' + x));
  }
  if (!r.web_used) {
    L.push('');
    L.push('（本次未取到联网结果：请基于上面 OCR 真实信息 + 你对「' + f.category_zh + '」品类真实消费者痛点的洞察来写，不要退回万能模板。）');
  }
  if (mctx.insights && mctx.insights.text) {
    L.push('');
    L.push('【本店历史投放经验（阿果洞察，优先体现在本次产出的方向，并避免重蹈"待改进"项）】');
    L.push(mctx.insights.text);
  }
  return L.join('\n');
}

/* 把可能中英混写的品牌串拆成 拉丁 / 本地（中文、日文、韩文）形式。
 * 例："Audi（奥迪）" → { display:'Audi（奥迪）', latin:'Audi', local:'奥迪' }；
 *     "小米 Xiaomi"  → { display, latin:'Xiaomi', local:'小米' }；
 *     "DTA"          → { display, latin:'DTA', local:'' }。
 * 目的：英文语境只呈现拉丁品牌（避免英文稿混入中文、且让品牌校验可匹配），
 *       中文语境呈现本地名（可附拉丁名）。确保五伙计"同一品牌、同一语种"。 */
export function splitBrandForms(brandRaw) {
  const display = String(brandRaw || '').trim();
  const latinRuns = display.match(/[A-Za-z][A-Za-z0-9&.\-' ]*/g) || [];
  const localRuns = display.match(/[㐀-鿿぀-ヿ가-힯]+/g) || [];
  const clean = (arr) => arr.map(s => s.trim()).filter(Boolean);
  const latin = clean(latinRuns).sort((a, b) => b.replace(/\s/g, '').length - a.replace(/\s/g, '').length)[0] || '';
  const local = clean(localRuns)[0] || '';
  return { display, latin, local };
}

/* =====================================================================
 * 主入口 buildMerchantContext
 *
 * @param {object} env Worker env（ARK_API_KEY / MEMBERS 等）
 * @param {object} args
 * @param {string[]} args.images   1-5 张 dataURL 或公网 URL
 * @param {string}  [args.language]  目标语种 code（zh-CN/en/ja/ko；auto 走 locale）
 * @param {string}  [args.locale]
 * @param {string}  [args.selling_text] 商家补充信息
 * @param {string}  [args.shop]    会员 id（用于拉取阿果洞察；不传则跳过）
 * @param {boolean} [args.include_insights=true]
 * @param {AbortSignal} [args.signal]
 *
 * @returns {Promise<object>} 统一上下文 mctx
 *   { ok, language:{code,name}, brand, brand_source, model, price, color,
 *     materials[], category:{zh,en}, own_text[], bg_brands[], key_parts[],
 *     facts:{...}, factsBrief, research, insights:{text,count}, sources[],
 *     timings:{ocr_ms,research_ms,insights_ms,total_ms}, degraded:[] }
 * ===================================================================*/
export async function buildMerchantContext(env, args = {}) {
  const startedAt = Date.now();
  const images = (args.images || []).filter(u => typeof u === 'string'
    && /^(data:image\/(?:jpe?g|png|webp);base64,|https?:\/\/)/.test(u));
  if (!images.length) {
    return { ok: false, error: { code: 'bad_images', message: '至少需要1张商品图' } };
  }
  const language = resolveLanguage(args.language, args.locale);
  const degraded = [];

  /* ① OCR 深读 */
  const ocrT0 = Date.now();
  const ocr = await runOcrDeepRead(env, { images, selling_text: args.selling_text });
  const ocr_ms = Date.now() - ocrT0;
  if (!ocr || (!ocr.brand && !(ocr.own_text || []).length)) degraded.push('ocr_partial');

  const brand = String(ocr.brand || '').trim();
  const brandForms = splitBrandForms(brand);
  const brand_latin = brandForms.latin;
  const brand_local = brandForms.local;
  const model = String(ocr.model || '').trim();
  const price = String(ocr.price || '').trim();
  const color = String(ocr.color || '').trim();
  const materials = Array.isArray(ocr.materials)
    ? ocr.materials.map(String).filter(s => s && s.trim()).slice(0, 6) : [];
  const package_form = String(ocr.package_form || '').trim().toLowerCase();
  const own_text = Array.isArray(ocr.own_text)
    ? ocr.own_text.map(String).filter(s => s && s.trim()).slice(0, 20) : [];
  const bg_brands = Array.isArray(ocr.background_brands)
    ? ocr.background_brands.map(String).filter(s => s && s.trim()).slice(0, 12) : [];
  const key_parts = Array.isArray(ocr.key_parts)
    ? ocr.key_parts.map(String).filter(s => s && s.trim()).slice(0, 6) : [];
  let category_zh = String(ocr.category_guess || '').trim();
  let category_en = String(ocr.en_category || '').trim();
  if (!category_zh) category_zh = (args.selling_text || '').slice(0, 30) || '通用商品';
  if (!category_en) category_en = 'product';

  /* ② 联网调研（总时限；软降级） */
  const researchT0 = Date.now();
  let research = { ok: false, brandResults: [], needResults: [], articles: [], sources: [], blocked: false };
  try {
    research = await webResearch({
      brand, category: category_zh, enCategory: category_en, totalMs: TIMEOUTS.researchMs
    });
  } catch { degraded.push('research_failed'); }
  filterResearchRelevance(research, category_zh, category_en);
  const research_ms = Date.now() - researchT0;

  const brand_source = brand ? 'product_ocr'
    : ((research.brandResults || []).length ? 'web' : 'none');
  const brand_source_label = brand_source === 'product_ocr' ? '商品图OCR'
    : brand_source === 'web' ? '联网调研' : '无';

  const brand_facts = Array.from(new Set([
    ...(research.brandResults || []).map(h => [h.title, h.snippet].filter(Boolean).join('：')),
    ...(research.articles || []).map(a => '《' + a.title + '》')
  ].filter(Boolean))).slice(0, 8);
  const consumer_needs = Array.from(new Set(
    (research.needResults || []).map(h => [h.title, h.snippet].filter(Boolean).join('：'))
  )).slice(0, 8);
  const web_used = !!(research.ok &&
    ((research.brandResults || []).length + (research.needResults || []).length
      + (research.articles || []).length > 0));

  /* ③ 会员洞察（阿果反哺；硬超时；可关闭） */
  const insightsT0 = Date.now();
  const includeInsights = args.include_insights !== false;
  const insights = includeInsights
    ? await loadInsights(env, args.shop, args.signal)
    : { text: '', count: 0 };
  const insights_ms = Date.now() - insightsT0;

  /* ④ 归一 facts */
  const facts = {
    brand,
    brand_latin,
    brand_local,
    brand_source,
    brand_source_label,
    model,
    price,
    color,
    materials,
    package_form,
    category_zh,
    category_en,
    own_text,
    bg_brands,
    key_parts,
    research: {
      web_used,
      blocked: !!research.blocked,
      brand_facts,
      consumer_needs,
      sources: (research.sources || []).slice(0, 14)
    }
  };

  const mctx = {
    ok: true,
    language,
    brand,
    brand_latin,
    brand_local,
    brand_source,
    model,
    price,
    color,
    materials,
    package_form,
    category: { zh: category_zh, en: category_en },
    own_text,
    bg_brands,
    key_parts,
    selling_text: args.selling_text || '',
    facts,
    research: {
      web_used,
      blocked: !!research.blocked,
      brand_facts,
      consumer_needs,
      sources: facts.research.sources,
      raw_brief: researchToBrief(research)
    },
    insights,
    sources: facts.research.sources,
    timings: {
      ocr_ms, research_ms, insights_ms,
      total_ms: Date.now() - startedAt
    },
    degraded
  };
  mctx.factsBrief = buildFactsBrief(mctx);
  return mctx;
}

export default { buildMerchantContext, buildFactsBrief, runOcrDeepRead, resolveLanguage, filterResearchRelevance, splitBrandForms };
