/* =====================================================================
 * WorkHogee 轨道B · 营销规划（实例级多模态现场推理）v3
 * ---------------------------------------------------------------------
 * v3（2026-10-03）：商品理解不再在本文件各搞一套，统一调用
 *   ../merchant-context.js 的 buildMerchantContext（OCR深读 + 联网调研 +
 *   会员洞察 + 归一 facts）。阿图只在这份共享底座之上做「图种规划 +
 *   逐图种 on_screen_text」的专业产出，确保与阿文/阿视/阿发懂的是
 *   同一个商品、同一品牌、同一份事实、同一语种。
 *
 * 本文件保留：sanitize 文案确定性清洗、整合生成 prompt、语种硬校验与补救、
 *           plan 组装。输出骨架 {ok,kit_type,language,product,recommended_types,plan} 不变；
 *           sanitizeCopy 仍导出、签名不变。
 *
 * 工程红线：所有 LLM/HTTP 调用单次硬超时 + AbortController，整轮按段独立时限收敛。
 * ===================================================================*/

import { chatVisionCustom } from '../vision.js';
import { validateOnScreen, validateTextLang } from '../lang-util.js';
import { IMAGE_TYPES, RECOMMENDED, inferKitType } from './image-types.js';
import { resolveDomain } from './category-knowledge.js';
import { buildMerchantContext, resolveLanguage } from '../merchant-context.js';

/* ---------- 文案确定性清洗（保留 v2 逻辑） ----------
 * 不维护品牌黑名单去删品牌名；商家自有品牌/型号/价格/规格一律保留。
 * 广告法极限词 → 中性词；硬蹭名牌句式 → 删除；背景第三方品牌在
 * runMarketingPlan 内用 mctx.bg_brands 上下文删除（stripBgBrands）。 */
const EXTREME_WORD_MAP = [
  [/\b(best|number one|no\.?1|#1|top[- ]?rated|world'?s best|premium brand)\b/gi, 'premium'],
  [/\b(guaranteed|100% money back|miracle|cure[- ]?all)\b/gi, 'reliable'],
  [/(最佳|最好|最优|第一|顶级|极品|国家级|世界级|绝无仅有|万能|百分百|100%)/g, '优质'],
  [/(极致|完美)/g, '出色']
];

const FLEX_PHRASE_MAP = [
  /媲美[^，。；;、,，.\s]{1,24}/g,
  /对标[^，。；;、,，.\s]{1,24}/g,
  /(爱马仕|香奈儿|古驰|Gucci|LV|路易威登|普拉达|Prada|迪奥|Dior|Hermes|Chanel|Celine|celine)[^，。；;、,，.]{0,10}同款/g,
  /[一-鿿A-Za-z]{0,8}平替/g
];

export function sanitizeCopy(text) {
  let s = String(text ?? '');
  for (const re of FLEX_PHRASE_MAP) s = s.replace(re, '');
  for (const [re, rep] of EXTREME_WORD_MAP) s = s.replace(re, rep);
  s = s.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,!?;:])/g, '$1').trim();
  return s;
}

/* 用统一上下文识别出的「背景/道具第三方品牌」清单，从上屏文案里删掉这些具体词。
 * 只删背景第三方品牌，绝不碰主商品自有品牌（自有品牌不在此清单内）。 */
function stripBgBrands(text, bgBrands = []) {
  let s = String(text ?? '');
  for (const b of bgBrands) {
    const token = String(b || '').trim();
    if (token.length < 2) continue;
    const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(esc, 'gi'), '');
  }
  return s;
}

function cleanTitlePunct(s) {
  return String(s || '')
    .replace(/^[\s.,·•・:：、;；|/\\\-—–()\[\]"'「」『』《》!！?？~～]+/, '')
    .replace(/[\s.,·•・:：、;；|/\\\-—–()\[\]"'「」『』《》!！?？~～]+$/, '')
    .trim();
}

function sanitizeOnScreenText(ost = {}, bgBrands = []) {
  const clean = (v) => stripBgBrands(sanitizeCopy(v), bgBrands);
  const out = {
    headline: cleanTitlePunct(clean(ost.headline || '')),
    subheadline: cleanTitlePunct(clean(ost.subheadline || '')),
    icons: [], panels: [], callouts: [], bullets: []
  };
  (ost.icons || []).slice(0, 6).forEach(i => {
    const label = clean(i && i.label);
    if (label) out.icons.push({ label, icon_hint: sanitizeCopy(i && i.icon_hint) });
  });
  (ost.panels || []).slice(0, 4).forEach(p => {
    const title = clean(p && p.title);
    const caption = clean(p && p.caption);
    if (title || caption) out.panels.push({ title, caption });
  });
  (ost.callouts || []).slice(0, 4).forEach(c => {
    const label = clean(c && c.label);
    if (label) out.callouts.push({ label });
  });
  (ost.bullets || []).slice(0, 6).forEach(b => {
    const s = clean(b);
    if (s) out.bullets.push(s);
  });
  return out;
}

/* ---------- 整合生成 prompt（保持 v2） ---------- */
function buildIntegrationSystem(lang, requestedTypes) {
  const typeBrief = requestedTypes.map(id => {
    const t = IMAGE_TYPES[id];
    if (!t) return '';
    return '- "' + id + '"（' + t.name_zh + '）：' + t.purpose + '；需要槽位：' + (t.textSlots.length ? t.textSlots.join(', ') : '无文字（纯照片/无字图，不要写任何上屏文字）');
  }).filter(Boolean).join('\n');

  return [
    '你是 WorkHogee 首席电商视觉总监兼资深广告文案。基于下面给你的【统一商品事实】（已含 OCR、联网调研、本店历史经验），',
    '为「这一件真实商品」写一套可直接烤进图的营销文案与图种规划。',
    '【铁律】',
    '1) 卖点必须具体、有信息量：落到该商品真实可见特征 + 该品类消费者真实痛点。',
    '   严禁空泛模板废话（不要"精选好物""品质生活""宽体拉杆万向轮""商务出行好伴侣"这类放之四海皆准的套话）。',
    '2) 品牌/型号/价格/材质/尺寸等事实只能来自【统一商品事实】。调研查不到的小品牌/白牌：',
    '   就基于 OCR 真实可见信息 + 你对该品类真实消费者痛点的洞察来写，绝不退回万能模板。',
    '3) 不要使用背景/道具里的第三方品牌；不要写硬蹭名牌的话（媲美XX / XX同款 / XX平替 / 对标XX）。',
    '4) 不用广告法极限词（最好/第一/顶级/100%/绝对等），改用中性词。',
    '5) 【语种铁律】所有"展示给买家的人类可读文字"必须整段用 ' + lang.name + ' 书写，不得中英/中日混搭：',
    '   - on_screen_text（headline/subheadline/icons/panels/callouts/bullets）；',
    '   - product.name、product.category、product.core_points[]、product.audience、product.specs[]、product.key_parts[]。',
    '   例外：品牌名(DTA 等专有名词)、型号、数字与规格单位保持原样不译。',
    '   英文：headline 简短有力大写词组(≤5词)；subheadline ≤8个英文单词、一句短卖点；图标 label 全大写≤2词；core_points 每条一个英文短句。',
    '   中文：简洁有力短句，标题 8-14 字。严禁相邻重复词。',
    '6) 文案要自然、地道，像母语广告人写的，不要逐字硬译、不要机翻腔、不要出现混进另一语种的字（尤其日文要自然地道、像日本本土电商文案，不要生造词）。',
    '7) 【本店历史经验】若事实中给出"本店历史投放经验"，请优先采纳其中正向方向、并避免重蹈标注"待改进"的项。',
    '',
    '请输出一个 JSON 对象（不要 markdown/代码块/解释）：',
    '{',
    '  "product": {',
    '    "name":"买家一看懂的商品名(20字内,含颜色/规格)",',
    '    "category":"具体子品类",',
    '    "domain":"beauty|fashion|food|tech|home|auto|general 之一",',
    '    "fidelity_tier":"A|B|C 之一",',
    '    "core_points":[3-5条具体卖点,每条8-22字,落到材质/部件/痛点],',
    '    "audience":"目标人群(20字内)",',
    '    "scenes":[{"zh":"中文场景6-15字","en":"English scene phrase"}],',
    '    "specs":["可见/已确认规格"],',
    '    "key_parts":["2-4个最值得放大的部件"]',
    '  },',
    '  "plan": [ { "type":"<图种id>", "on_screen_text":{ "headline":"","subheadline":"",',
    '      "icons":[{"label":"短标签","icon_hint":"简单线描图形英文描述"}],',
    '      "panels":[{"title":"","caption":""}], "callouts":[{"label":""}], "bullets":[""] } } ]',
    '}',
    '',
    '【需要为以下每个图种各写一条 on_screen_text（不需要的槽位留空数组/空串）】：',
    typeBrief,
    'icon_hint 只写简单可画线描图形的英文描述，不要写文字内容。scenes 给2-3个真实使用场景。',
    '【标题不得留空】凡上面"需要槽位"列出 headline 的图种，都必须给出非空、适合上屏的短标题；标"无文字"的图种（纯白底/纯场景/模特等纯照片类）不要写任何上屏文字，对应槽位留空。'
  ].join('\n');
}

function asJson(v) {
  if (v && typeof v === 'object') return v;
  return null;
}

function stripWrongScript(text, expected) {
  let s = String(text || '');
  if (expected === 'en') s = s.replace(/[぀-ヿ一-鿿豈-﫿가-힯ᄀ-ᇿ]/g, '');
  else if (expected === 'zh-CN') s = s.replace(/[぀-ヿ가-힯ᄀ-ᇿ]/g, '');
  else if (expected === 'ko') s = s.replace(/[぀-ヿ一-鿿豈-﫿]/g, '');
  else if (expected === 'ja') s = s.replace(/[가-힯ᄀ-ᇿ]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

function clipText(s, n) {
  s = String(s || '').trim();
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  if (/^[A-Za-z0-9 .,&'()/-]+$/.test(cut)) {
    const sp = cut.lastIndexOf(' ');
    if (sp > n * 0.55) return cut.slice(0, sp).replace(/[\s,/.-]+$/, '');
  }
  return cut;
}

/** 对所有上屏文案做语种硬校验；发现不符，补一次重写，再做确定性兜底。 */
async function enforceLanguage(env, plan, langCode, langName, deadlineMs) {
  const offenders = [];
  plan.forEach(entry => {
    const v = validateOnScreen(entry.on_screen_text, langCode);
    if (v.length) offenders.push({ type: entry.type, ost: entry.on_screen_text, violations: v });
  });
  if (!offenders.length) return plan;

  if (Date.now() < deadlineMs) {
    try {
      const sys = '你是电商上屏文案语种纠错引擎。下面是若干图种当前的上屏文案，其中部分字段语种不对。请只返回需要修正的图种，把每个有问题的字段改写成「纯 ' + langName + '」、更短（英文headline≤5词、中文≤14字），不要解释、不要markdown。输出 JSON：{"fixed":{"<type>":{"headline":"","subheadline":"","icons":[{"label":""}],"panels":[{"title":"","caption":""}],"callouts":[{"label":""}],"bullets":[""]}}} ，没有内容的槽位留空。';
      const user = JSON.stringify(offenders.map(o => ({ type: o.type, current: o.ost, bad_fields: o.violations.map(vv => vv.field + '=' + vv.text) })));
      const r = await chatVisionCustom(env, { system: sys, user, images: [], maxTokens: 1200, temperature: 0.3, timeoutMs: 30000 });
      if (r.ok && r.data && r.data.fixed) {
        const fixed = r.data.fixed;
        plan.forEach(entry => {
          const f = fixed[entry.type];
          if (f && typeof f === 'object') {
            entry.on_screen_text = Object.assign({}, entry.on_screen_text, f);
          }
        });
      }
    } catch {}
  }

  plan.forEach(entry => {
    const v = validateOnScreen(entry.on_screen_text, langCode);
    if (!v.length) return;
    const ost = entry.on_screen_text;
    v.forEach(vi => {
      const path = vi.field;
      const m = path.match(/^([a-z_]+)(?:\[(\d+)\])?(?:\.(label|title|caption))?$/);
      if (!m) return;
      const [, arr, idx, sub] = m;
      if (!idx && !sub) ost[arr] = stripWrongScript(ost[arr], langCode);
      else if (idx != null && sub) ost[arr][Number(idx)][sub] = stripWrongScript(ost[arr][Number(idx)][sub], langCode);
      else if (idx != null && arr === 'bullets') ost[arr][Number(idx)] = stripWrongScript(ost[arr][Number(idx)], langCode);
    });
  });
  return plan;
}

async function enforceProductLang(env, product, langCode, langName, deadlineMs) {
  const probe = () => {
    const bad = [];
    const chk = (field, val) => {
      const s = String(val || '').trim();
      if (!s) return;
      const r = validateTextLang(s, langCode);
      if (!r.ok) bad.push({ field, text: s, reasons: r.reasons });
    };
    chk('name', product.name);
    chk('category', product.category);
    chk('audience', product.audience);
    product.core_points.forEach((v, i) => chk('core_points[' + i + ']', v));
    product.specs.forEach((v, i) => chk('specs[' + i + ']', v));
    product.key_parts.forEach((v, i) => chk('key_parts[' + i + ']', v));
    return bad;
  };
  if (!probe().length) return;

  if (Date.now() < deadlineMs) {
    try {
      const sys = '你是地道的' + langName + '电商文案母语编辑。把下面商品字段里混进的其它语种（尤其中文）整段改写成地道、自然、简短的「纯 ' + langName + '」；品牌名(DTA等专有名词)、型号、数字与规格单位保持原样不译；不要机翻腔、不要混进别的语种；core_points 保持条数、每条一个短句。只输出 JSON：{"name":"","category":"","audience":"","core_points":[""],"specs":[""],"key_parts":[""]}。';
      const user = JSON.stringify({
        name: product.name, category: product.category, audience: product.audience,
        core_points: product.core_points, specs: product.specs, key_parts: product.key_parts
      });
      const r = await chatVisionCustom(env, { system: sys, user, images: [], maxTokens: 1500, temperature: 0.3, timeoutMs: 30000 });
      if (r.ok && r.data) {
        const f = r.data;
        if (typeof f.name === 'string' && f.name.trim()) product.name = f.name.trim().slice(0, 60);
        if (typeof f.category === 'string' && f.category.trim()) product.category = f.category.trim().slice(0, 30);
        if (typeof f.audience === 'string' && f.audience.trim()) product.audience = f.audience.trim().slice(0, 40);
        if (Array.isArray(f.core_points)) product.core_points = f.core_points.map(String).filter(s => s && s.trim()).slice(0, 5);
        if (Array.isArray(f.specs)) product.specs = f.specs.map(String).filter(s => s && s.trim()).slice(0, 6);
        if (Array.isArray(f.key_parts)) product.key_parts = f.key_parts.map(String).filter(s => s && s.trim()).slice(0, 4);
      }
    } catch {}
  }

  const fix = (v) => {
    const s = String(v || '').trim();
    if (!s) return '';
    return validateTextLang(s, langCode).ok ? s : stripWrongScript(s, langCode);
  };
  product.name = clipText(fix(product.name), 60);
  product.category = clipText(fix(product.category), 30);
  product.audience = clipText(fix(product.audience), 60);
  product.core_points = product.core_points.map(fix).filter(Boolean).slice(0, 5);
  product.specs = product.specs.map(fix).filter(Boolean).slice(0, 6);
  product.key_parts = product.key_parts.map(fix).filter(Boolean).slice(0, 4);
}

/**
 * 跑营销规划（v3：商品理解走统一上下文）。
 * @param {object} env Worker env（需 ARK_API_KEY）
 * @param {object} args
 * @param {string[]} args.images   1-5 张 dataURL 或公网 URL
 * @param {string}  [args.kit_type] ecom|fashion
 * @param {string}  [args.platform]
 * @param {string}  [args.locale]
 * @param {string}  [args.language]
 * @param {string}  [args.selling_text]
 * @param {string}  [args.shop]   会员 id（透传给统一上下文以带阿果洞察）
 * @param {string[]}[args.selected_types]
 */
export async function runMarketingPlan(env, args = {}) {
  const startedAt = Date.now();
  const images = (args.images || []).filter(u => typeof u === 'string' && /^(data:image\/(?:jpe?g|png|webp);base64,|https?:\/\/)/.test(u));
  if (images.length === 0) return { ok: false, error: { code: 'bad_images', message: '至少需要1张商品图' } };

  const { code: langCode, name: langName } = resolveLanguage(args.language, args.locale);

  // 解析要规划的图种（保持原逻辑）
  let requested = Array.isArray(args.selected_types) ? args.selected_types.filter(id => IMAGE_TYPES[id]) : [];
  let kitType = args.kit_type === 'fashion' || args.kit_type === 'ecom' ? args.kit_type : '';
  if (requested.length === 0) requested = (kitType || 'ecom') === 'fashion' ? RECOMMENDED.fashion.slice() : RECOMMENDED.ecom.slice();
  if (!kitType) kitType = requested.some(id => IMAGE_TYPES[id] && IMAGE_TYPES[id].kit === 'fashion') ? 'fashion' : 'ecom';

  /* ===== 统一商品上下文（OCR + 联网 + 会员洞察 + 归一 facts；内部各段硬超时、软降级） ===== */
  let mctx = args.mctx;
  if (!mctx || !mctx.ok) {
    mctx = await buildMerchantContext(env, {
      images,
      language: args.language,
      locale: args.locale,
      selling_text: args.selling_text,
      shop: args.shop,
      signal: args.signal
    });
  }
  if (!mctx.ok) return { ok: false, error: mctx.error };

  const ownBrand = mctx.brand;
  const ownModel = mctx.model;
  const ownPrice = mctx.price;
  const bgBrands = mctx.bg_brands;
  const catZh = mctx.category.zh;
  const enCat = mctx.category.en;

  /* ===== 整合生成（纯文本，硬超时 45s）：facts 直接用统一上下文 factsBrief ===== */
  const factsBlock = mctx.factsBrief;

  let integrated = { product: {}, plan: [] };
  for (let attempt = 0; attempt < 2 && Object.keys(integrated.product).length === 0; attempt++) {
    try {
      const integ = await chatVisionCustom(env, {
        system: buildIntegrationSystem({ code: langCode, name: langName }, requested),
        user: factsBlock + '\n\n请为以下图种各写一条 on_screen_text：' + requested.join(', ') + '。只填该图种需要的槽位，每个图种 icons≤3、bullets≤3；务必输出完整、闭合的 JSON，不要截断。',
        images: [],
        maxTokens: 3500, temperature: attempt === 0 ? 0.4 : 0.2, timeoutMs: 45000
      });
      if (integ.ok && integ.data && integ.data.product && Object.keys(integ.data.product).length) integrated = integ.data;
    } catch {}
  }

  const p = asJson(integrated.product) || {};
  const arr = (v, n = 99) => Array.isArray(v) ? v.map(String).filter(s => s && s.trim()).slice(0, n) : [];
  const scenes = Array.isArray(p.scenes) ? p.scenes.slice(0, 3).map(s => ({
    zh: String((s && s.zh) || '').trim(), en: String((s && s.en) || '').trim()
  })).filter(s => s.zh || s.en) : [];

  const categoryText = [p.name, p.category, catZh].join(' ');
  const finalKit = inferKitType(categoryText) === 'fashion' ? 'fashion' : kitType;

  const brandSource = mctx.brand_source;
  const brandFacts = mctx.research.brand_facts;
  const consumerNeeds = mctx.research.consumer_needs;
  const webUsed = mctx.research.web_used;

  const product = {
    name: sanitizeCopy(p.name || p.category || catZh || '精选商品').slice(0, 60),
    category: String(p.category || catZh || '通用商品').trim().slice(0, 30),
    domain: resolveDomain(p.domain, [p.name, p.category, catZh].join(' ')),
    fidelity_tier: ['A', 'B', 'C'].includes(String(p.fidelity_tier || '').toUpperCase()) ? String(p.fidelity_tier).toUpperCase() : 'B',
    core_points: arr(p.core_points, 5),
    materials: mctx.materials.slice(0, 3),
    audience: clipText(p.audience || '', 60),
    scenes: scenes.length ? scenes : [{ zh: '明亮简约的生活化场景', en: 'a bright minimal lifestyle scene' }],
    specs: arr(p.specs, 6),
    key_parts: arr(p.key_parts, 4),
    brand: ownBrand.slice(0, 40),
    brand_source: brandSource,
    model: ownModel.slice(0, 60),
    price: ownPrice.slice(0, 30),
    research: {
      web_used: webUsed,
      blocked: mctx.research.blocked,
      brand_facts: brandFacts,
      consumer_needs: consumerNeeds,
      sources: mctx.sources.slice(0, 14)
    }
  };
  // 兜底：整合生成彻底失败时，用统一上下文真实可见信息拼具体卖点，绝不退回万能模板。
  if (product.core_points.length === 0) {
    const fb = [];
    if (mctx.materials.length) fb.push(mctx.materials[0] + '，做工扎实耐用');
    if (mctx.key_parts.length) mctx.key_parts.slice(0, 3).forEach(k => fb.push(String(k) + '，细节到位'));
    if (ownBrand) fb.push(ownBrand + ' 品牌正品，实拍所见即所得');
    product.core_points = fb.length ? fb.slice(0, 5) : ['实拍原图，所见即所得'];
  }
  if (product.key_parts.length === 0) product.key_parts = mctx.key_parts.length ? mctx.key_parts.slice(0, 4) : ['商品整体外观'];

  // 组装 plan
  const modelPlan = Array.isArray(integrated.plan) ? integrated.plan : [];
  const byType = {};
  modelPlan.forEach(mp => { if (mp && mp.type) byType[mp.type] = sanitizeOnScreenText(mp.on_screen_text || {}, bgBrands); });

  let plan = requested.map(id => {
    const t = IMAGE_TYPES[id];
    if (!t) return null;
    const ost = byType[id] || sanitizeOnScreenText({}, bgBrands);
    return { type: id, label_zh: t.name_zh, label_en: t.name_en, ratio: t.ratio, size: t.size, on_screen_text: ost };
  }).filter(Boolean);

  plan.forEach(e => {
    const ost = e.on_screen_text;
    const t = IMAGE_TYPES[e.type];
    const wantsHeadline = !!(t && Array.isArray(t.textSlots) && t.textSlots.includes('headline'));
    if (wantsHeadline && !(ost.headline || '').trim()) {
      const fb = (product.core_points[0] || product.audience || product.name || '').trim();
      ost.headline = cleanTitlePunct(clipText(fb, langCode === 'en' || langCode === 'ja' ? 40 : 18));
    }
  });

  /* ===== 语种硬校验 + 补救 ===== */
  try {
    await enforceProductLang(env, product, langCode, langName, startedAt + 150000);
    await enforceLanguage(env, plan, langCode, langName, startedAt + 150000);
  } catch {}

  plan.forEach(e => {
    if (e.on_screen_text.headline) e.on_screen_text.headline = cleanTitlePunct(e.on_screen_text.headline);
    if (e.on_screen_text.subheadline) e.on_screen_text.subheadline = cleanTitlePunct(e.on_screen_text.subheadline);
  });

  const recommended = RECOMMENDED[finalKit] || RECOMMENDED.ecom;
  return {
    ok: true,
    kit_type: finalKit,
    language: langCode,
    product,
    recommended_types: recommended,
    plan,
    insights_used: mctx.insights.count
  };
}
