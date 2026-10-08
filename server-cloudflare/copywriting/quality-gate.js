/* =====================================================================
 * quality-gate.js —— 分平台结构质检门
 * ---------------------------------------------------------------------
 * 每份产出交付前过这道门：
 *   Q1 泄露门（对话/系统/拼音/背景品牌）——致命
 *   Q2 品牌必须出现（"不放logo"事故根因：有品牌却不写品牌）
 *   Q3 语种纯净（中文平台必须有中文；海外平台绝不许夹中文/机翻腔特征）
 *   Q4 标题/正文字符数（按 platform-skeleton 硬指标）
 *   Q5 话题标签数量 / 禁标平台不得有标签
 *   Q6 emoji 预算
 *   Q7 真实事实覆盖（至少用上一个 mctx 里的真数字/材质/型号，防万能小作文）
 *   Q8 广告法极限词（致命）
 *   Q9 亚马逊专规（5 条 bullet / Title Case / 无结尾标点 / <200 字符）
 * ===================================================================*/
import { leakCheck } from './leak-gate.js';
import { PLATFORMS, EXTREME_WORDS } from './platform-skeleton.js';

/* 品牌候选：中英混写串（如 "Audi（奥迪）"）拆成拉丁run/CJKrun 多个候选，命中任一即过。
 * 优先用底座新字段 brand_latin / brand_local；无新字段时兜底自拆分。 */
function brandCandidates(mctx = {}) {
  const raw = [mctx.brand, mctx.brand_latin, mctx.brand_local,
    mctx.facts && mctx.facts.brand, mctx.facts && mctx.facts.brand_latin, mctx.facts && mctx.facts.brand_local];
  const out = new Set();
  for (const s of raw) {
    const str = String(s || '').trim();
    if (!str) continue;
    // 整串保留
    const whole = str.toLowerCase();
    if (whole.length >= 2) out.add(whole);
    // 按括号/空白/标点切段，再切出拉丁run与CJK run
    for (const piece of str.split(/[（）()\s,，、;；|/·]+/)) {
      for (const run of piece.match(/[A-Za-z0-9][A-Za-z0-9.&'-]*|[一-鿿][一-鿿A-Za-z0-9]*/g) || []) {
        const t = run.trim().toLowerCase();
        if (t.length >= 2) out.add(t);
      }
    }
  }
  // P1：中文品牌→规范外文别名也作为候选（英文稿用 Pechoin 等也判品牌在场）
  const BRAND_EN = { '百雀羚': 'Pechoin', '自然堂': 'Chando', '珀莱雅': 'PROYA', '薇诺娜': 'Winona', '完美日记': 'Perfect Diary', '花西子': 'Florasis', '李宁': 'Li-Ning', '安踏': 'ANTA' };
  const zh = String(mctx.brand || '').trim();
  if (BRAND_EN[zh]) out.add(BRAND_EN[zh].toLowerCase());
  return [...out];
}

const hasCJK = (s) => /[\u4e00-\u9fff]/.test(s || '');
const countEmoji = (s) => new Set((s.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) || [])).size;
const countHashtags = (s) => (s.match(/#[\w\u4e00-\u9fff]+/g) || []).length;

function flatten(draft = {}) {
  return [
    draft.title || '', draft.body || '', draft.detail || '', draft.subtitle || '',
    draft.description || '',
    ...(draft.hashtags || []), ...(draft.selling_points || []), ...(draft.bullets || [])
  ].join('\n');
}

/* 从 mctx 抽出可校验的"真事实 token"：品牌/型号/价格数字、材质、品类词、颜色 */
function factTokens(mctx = {}) {
  const toks = new Set();
  const push = (v) => {
    String(v || '').split(/[\s,，、；;|/()（）]+/).forEach(t => {
      t = t.trim();
      if (t.length >= 2) toks.add(t);
    });
  };
  push(mctx.brand); push(mctx.model); push(mctx.price); push(mctx.color);
  (mctx.materials || []).forEach(push);
  (mctx.key_parts || []).forEach(push);
  push(mctx.category && mctx.category.zh);
  push(mctx.category && mctx.category.en);
  // 英文品类拆词（≥4字母，供英文稿匹配 "headset/serum/bottle"）
  const enCat = String((mctx.category && mctx.category.en) || '');
  enCat.toLowerCase().match(/[a-z][a-z-]{3,}/g)?.forEach(w => toks.add(w));
  // 数字串（含单位）
  (String(mctx.price || '').match(/\d+(\.\d+)?/g) || []).forEach(n => toks.add(n));
  return [...toks].filter(t => t.length >= 2);
}

export function qualityCheck(draft, ctx = {}) {
  const platform = ctx.platform || 'xiaohongshu';
  const mctx = ctx.mctx || {};
  const p = PLATFORMS[platform] || PLATFORMS.xiaohongshu;
  const text = flatten(draft);
  const zh = p.lang === 'zh-CN';
  const fails = [];
  const warns = [];

  /* Q1 泄露门（致命） */
  const leak = leakCheck(text, { lang: p.lang, mctx });
  if (!leak.pass) fails.push({ id: 'Q1_leakage', fatal: true, hits: leak.hits.map(h => h.rule + ':' + h.why) });

  /* Q2 品牌出现（电商/海外平台硬要求；国内社交平台软提醒）
   * 候选命中任一即通过：解决 "Audi（奥迪）" 整串子串匹配误判 */
  const cands = brandCandidates(mctx);
  if (cands.length) {
    const low = text.toLowerCase();
    const mentions = cands.some(c => low.includes(c));
    if (!mentions) {
      const hard = ['taobao', 'jd', 'amazon', 'instagram', 'tiktok'].includes(platform);
      const f = { id: 'Q2_brand', why: '文案未提及真实品牌（候选:' + cands.slice(0, 4).join('/') + '）（不放logo事故）' };
      hard ? fails.push({ ...f, fatal: true }) : warns.push(f);
    }
  }

  /* Q3 语种纯净 */
  if (zh) {
    if (text.replace(/\s/g, '').length > 30 && !hasCJK(text)) fails.push({ id: 'Q3_lang', why: '中文平台产出几乎无中文' });
  } else {
    if (hasCJK(text)) fails.push({ id: 'Q3_lang', fatal: true, why: '海外平台混入中文字符' });
    // 机翻腔特征：连续中式英文结构
    if (/\bvery good\b|\bvery nice\b|\bhigh quality\b|\bgood quality\b/i.test(text)) {
      warns.push({ id: 'Q3_translationese', why: '疑似机翻套话（very good/high quality）' });
    }
  }

  /* Q4 标题/正文字数 */
  if (p.titleMax && draft.title && [...draft.title].length > p.titleMax) {
    fails.push({ id: 'Q4_titleLen', why: `标题${[...draft.title].length}>上限${p.titleMax}` });
  }
  if (p.titleMin && draft.title && [...draft.title].length < p.titleMin && p.fields.includes('title')) {
    fails.push({ id: 'Q4_titleLen', why: `标题过短<${p.titleMin}` });
  }
  if (platform === 'amazon' && draft.title && draft.title.length > p.titleMax) {
    fails.push({ id: 'Q4_titleLen', why: `Amazon标题${draft.title.length}>${p.titleMax}字符` });
  }
  // 正文长度（字数/词数/字符数按平台）
  const bodyText = draft.body || draft.detail || draft.description || '';
  let bodyLen = [...bodyText].length;
  if (p.lang === 'en' && ['instagram', 'amazon'].includes(platform)) bodyLen = (bodyText.split(/\s+/).filter(Boolean)).length;
  if (p.bodyLen && bodyText) {
    const [lo, hi] = p.bodyLen;
    if (bodyLen < lo * 0.6) warns.push({ id: 'Q4_bodyLen', why: `正文偏短 ${bodyLen}<${lo}` });
    if (bodyLen > hi * 1.6) warns.push({ id: 'Q4_bodyLen', why: `正文偏长 ${bodyLen}>${hi}` });
  }

  /* Q5 标签数（以 draft.hashtags 数组为准，不依赖正文里的 # 号） */
  const hc = (draft.hashtags || []).length + countHashtags(draft.body || '');
  const [hmin, hmax] = p.hashtagCount;
  if (p.noHashtag && hc > 0) fails.push({ id: 'Q5_hashtag', why: '该平台不应有#标签' });
  else if (!p.noHashtag && hmax && hc > hmax) fails.push({ id: 'Q5_hashtag', why: `标签${hc}>上限${hmax}` });
  else if (!p.noHashtag && hc < hmin && bodyText.length > 20) warns.push({ id: 'Q5_hashtag', why: `标签偏少 ${hc}<${hmin}` });

  /* Q6 emoji 预算 */
  const ec = countEmoji(text);
  if (ec > p.emojiBudget + 2) fails.push({ id: 'Q6_emoji', why: `emoji种类${ec}>预算${p.emojiBudget}` });

  /* Q7 真实事实覆盖（至少 1 个真 token 出现） */
  const toks = factTokens(mctx);
  const covered = toks.filter(t => text.toLowerCase().includes(t.toLowerCase()));
  if (toks.length && covered.length === 0) {
    fails.push({ id: 'Q7_facts', why: '万能小作文：未使用任何真实商品事实（品牌/型号/材质/价格）' });
  }

  /* Q8 极限词（致命） */
  const hitExt = EXTREME_WORDS.filter(w => text.toLowerCase().includes(w.toLowerCase()));
  if (hitExt.length) fails.push({ id: 'Q8_compliance', fatal: true, why: '极限词:' + hitExt.join(',') });

  /* Q9 亚马逊专规 */
  if (platform === 'amazon') {
    const bullets = (draft.bullets || []);
    if (bullets.length !== 5) warns.push({ id: 'Q9_amazon', why: `bullet 数=${bullets.length}（建议5）` });
    bullets.forEach((b, i) => {
      if (b && /[.。！!？?]\s*$/.test(b.trim())) warns.push({ id: 'Q9_amazon', why: `bullet#${i + 1} 不应有结尾标点` });
      if (b && b.length > 255) warns.push({ id: 'Q9_amazon', why: `bullet#${i + 1}=${b.length}>255字符` });
    });
  }

  const hardFails = fails.filter(f => f.fatal || f.id === 'Q4_titleLen' || f.id === 'Q5_hashtag');
  return {
    pass: fails.length === 0,
    hardFail: hardFails.length > 0,
    fails, warns,
    metrics: { emoji: ec, hashtags: hc, titleLen: draft.title ? [...draft.title].length : 0, bodyLen, factsCovered: covered.length }
  };
}

export default { qualityCheck, factTokens };
