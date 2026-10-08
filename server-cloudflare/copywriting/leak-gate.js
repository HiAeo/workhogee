/* =====================================================================
 * leak-gate.js —— 阿文文案"泄露门"（根因级隔离）
 * ---------------------------------------------------------------------
 * 历史严重事故：曾把【用户与系统的对话记录】混进文案交付给商家。
 * 根因有三，本门逐条堵死：
 *   1) prompt 里混进了对话/系统上下文 → engine 层已做到 prompt 只含
 *      factsBrief（唯一事实），本门再做兜底拦截；
 *   2) 模型口癖吐出"作为AI/好的这是您的文案/抱歉我无法"等对话腔 → 拦截；
 *   3) 模型输出内部代号（mctx/factsBrief/ARK_API_KEY/文件路径/JSON协议）→ 拦截。
 *
 * 另堵两个历史事故：
 *   4) 拼音首字母碎片（zmjs/wjd 这类无意义缩写混在中文里）→ 拦截；
 *   5) 把背景第三方品牌（bg_brands，如拍摄道具上的 logo）写成自家品牌 → 拦截。
 *
 * 用法：
 *   leakCheck(text, { lang:'zh-CN'|'en', mctx })
 *   -> { pass, hits:[{rule,why}], sanitized }
 *   pass===false 必须重写/拒收；sanitized 可二次过检。
 * ===================================================================*/

/* ---------- 1) 密钥 ---------- */
const SECRET_PATTERNS = [
  /\b(ark-[a-z0-9-]{8,})\b/i,
  /\b(sk-[a-z0-9]{12,})\b/i,
  /\b(cfut_[a-z0-9]{16,})\b/i,
  /\bghp_[a-z0-9]{16,}\b/i,
  /\bBearer\s+[A-Za-z0-9._-]{12,}\b/,
  /\bAKIA[0-9A-Z]{12,}\b/,
  /\bARK_API_KEY\b/,
  /\bAPI[_-]?KEY\s*[:=：]/i,
];

/* ---------- 2) 内部路径 / 代码标识 / 基础设施 ---------- */
const INTERNAL_PATTERNS = [
  /\/(api|marketing|cutout|pipeline|upload-url|generate-script|copywriting)\b/i,
  /https?:\/\/[a-z0-9.-]*(workers\.dev|workhogee\.com|volces\.com|bytedance|doubao)\S*/i,
  /(server-cloudflare|marketing-spec|agent_mode|node_modules|wrangler|cloudflare workers)/i,
  /\b(mctx|factsBrief|buildMerchantContext|buildFactsBrief|generateCopy|copywriting)\b/,
  /\b(env\.\w+|process\.env|import\s*\(|export\s+(async\s+)?function|console\.log)\b/,
  /\b(worker\.js|workbench\.html|merchant-context\.js)\b/,
];

/* ---------- 3) 系统提示 / 对话腔 / JSON 协议泄漏 ---------- */
const SYSTEM_PATTERNS = [
  /(你是|You are a?n?\s+(?:helpful\s+)?(?:assistant|AI|copywriter))/i,
  /(系统提示|system prompt|developer message|开发者消息|内部规则|internal rule)/i,
  /(作为一个?AI|作为人工智能|我是一个?AI|作为AI助手|作为语言模型)/,
  /(好的?[，,]?这[是就]?您[的家]|这是[您你]要[的写]|以下是[您你]|希望[对你您]有帮助|如有需要|我可以帮[你您]|抱歉[，,]?我(?:无法|不能|不能))/,
  /(根据[你您]的?要求|按照?指令|as instructed|following (the )?rules?|reply (only )?in json|只输出 JSON|只输出一个)/i,
  /\{[\s\S]{0,30}(ok|error|code|message|cost|elapsed_ms|attempts|rejected)[\s\S]{0,30}\}/,
  /```(?:json)?/,
];

/* ---------- 4) 对话记录混入（用户/助手轮次痕迹） ---------- */
const DIALOG_PATTERNS = [
  /^(用户|user|user:|assistant:|ai:|助手|伙计|店员)[：:]/im,
  /(我之前说|你刚才说|上一轮|上一条|previous turn|chat history|对话记录|聊天记录|我们刚才|前面你说)/i,
  /(请[你您]帮|麻烦[你您]|你能帮|可以帮我|我想让你|给我写一下)/,
];

/* ---------- 5) 拼音首字母碎片（仅中文输出检测） ----------
 * 无意义拼音缩写特征：全小写、2-7 字母、元音占比 ≤ 1/3（如 zmjs/wjd/bsdq）。
 * 白名单：已成梗的网络拼音语（yyds/xswl…）、单位、型号、品牌自有词。
 */
const PINYIN_SLANG = new Set([
  'yyds', 'xswl', 'dbq', 'u1s1', 'emo', 'kswl', 'srds', 'bhs', 'bgm',
  'gg', 'mm', 'dd', '666', '233', 'awsl', 'bd', 'qc', 'pk',
]);
const UNIT_TOKENS = new Set([
  'ml', 'l', 'g', 'kg', 'mg', 'mm', 'cm', 'm', 'km', 'hz', 'ghz', 'db', 'mah',
  'usb', 'typec', 'type-c', 'w', 'v', 'a', 'h', 'oh', 'pro', 'max', 'mini',
  'plus', 'air', 'pods', 'case', 'led', 'lcd', 'oled', 'hd', 'uhd', 'k', 'd',
  'ios', 'android', 'pc', 'app', 'wifi', 'bt', '5g', '4g', 'mp', 'hdr',
]);
const SHORT_EN = new Set([
  'ok', 'vs', 'to', 'in', 'on', 'at', 'me', 'my', 'we', 'it', 'is', 'am',
  'no', 'hi', 'oh', 'ah', 'um', 'top', 'new', 'hot', 'buy', 'get', 'love',
  'good', 'great', 'nice', 'wow', 'hey', 'now', 'out', 'off', 'all', 'any',
  'the', 'and', 'for', 'you', 'your', 'our', 'its', 'fit', 'use', 'day',
  // 电商文案常见英文形容词/动词（不是拼音碎片）
  'hold', 'fast', 'safe', 'easy', 'soft', 'pure', 'deep', 'clear', 'clean',
  'warm', 'long', 'full', 'high', 'low', 'rich', 'light', 'slim', 'smart',
  'quiet', 'smooth', 'strong', 'stable', 'fresh', 'cool', 'wide', 'thin',
]);

const VOWELS = new Set([...'aeiou']);

function latinRuns(text) {
  // 抽出 #hashtag 之外的连续拉丁字母片段（hashtag 内允许任意英文）
  const stripped = text.replace(/#[\p{L}0-9_]+/gu, ' ');
  return stripped.match(/[A-Za-z][A-Za-z0-9]*/g) || [];
}

function findPinyinFragments(text, mctx = {}) {
  const brandTokens = new Set();
  const pushTok = (s) => {
    String(s || '').toLowerCase().split(/[^a-z0-9]+/i).forEach(t => {
      if (t.length >= 2) brandTokens.add(t);
    });
  };
  pushTok(mctx.brand); pushTok(mctx.model);
  (mctx.own_text || []).forEach(pushTok);
  (mctx.key_parts || []).forEach(pushTok);

  const hits = [];
  for (const run of latinRuns(text)) {
    const low = run.toLowerCase();
    if (!/^[a-z][a-z]+$/.test(low)) continue;       // 含数字/大写混合→型号，放过
    if (/^[A-Z]{2,}$/.test(run)) continue;          // 全大写=英文缩写(SUV/CPU/LED)，不是拼音首字母
    if (low.length < 2 || low.length > 7) continue;
    if (PINYIN_SLANG.has(low) || UNIT_TOKENS.has(low) || SHORT_EN.has(low)) continue;
    if ([...brandTokens].some(t => t === low || t.includes(low) || low.includes(t))) continue;
    const vowels = [...low].filter(c => VOWELS.has(c)).length;
    const ratio = vowels / low.length;
    if (ratio <= 0.34) hits.push(run);
  }
  return [...new Set(hits)];
}

/* ---------- 6) 背景第三方品牌污染 ---------- */
function findBgBrandLeak(text, mctx = {}) {
  const t = String(text || '');
  return (mctx.bg_brands || []).filter(b => b && b.length >= 2 && t.includes(b));
}

export function leakCheck(text, opts = {}) {
  if (opts.__depth > 2) return { pass: false, hits: [{ rule: 'recursion_guard', why: '' }], sanitized: String(text), clean_pass: false };
  const t = String(text == null ? '' : text);
  const lang = opts.lang || 'zh-CN';
  const mctx = opts.mctx || {};
  const hits = [];
  for (const re of SECRET_PATTERNS) if (re.test(t)) hits.push({ rule: 'secret', why: re.source.slice(0, 40) });
  for (const re of INTERNAL_PATTERNS) if (re.test(t)) hits.push({ rule: 'internal', why: re.source.slice(0, 40) });
  for (const re of SYSTEM_PATTERNS) if (re.test(t)) hits.push({ rule: 'system_voice', why: re.source.slice(0, 40) });
  for (const re of DIALOG_PATTERNS) if (re.test(t)) hits.push({ rule: 'dialog_history', why: re.source.slice(0, 40) });

  // 中文输出才查拼音首字母（英文输出本来就该是英文）
  if (lang === 'zh-CN') {
    const py = findPinyinFragments(t, mctx);
    if (py.length) hits.push({ rule: 'pinyin_abbr', why: py.join(',') });
  }
  const bg = findBgBrandLeak(t, mctx);
  if (bg.length) hits.push({ rule: 'bg_brand', why: bg.join(',') });

  let sanitized = t;
  for (const re of [...SECRET_PATTERNS, ...INTERNAL_PATTERNS]) sanitized = sanitized.replace(re, '');
  sanitized = sanitized.replace(/\s{2,}/g, ' ').trim();

  return {
    pass: hits.length === 0,
    hits,
    sanitized,
    clean_pass: hits.length === 0 || leakCheck(sanitized, { ...opts, __depth: (opts.__depth || 0) + 1 }).pass
  };
}

/* 连续命中计数 → 拒收（状态由调用方持有） */
export function noteLeakAndDecide(state = {}) {
  state.count = (state.count || 0) + 1;
  return { count: state.count, reject: state.count >= 3, state };
}

export default { leakCheck, noteLeakAndDecide, findPinyinFragments, findBgBrandLeak };
