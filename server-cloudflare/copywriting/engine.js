/* =====================================================================
 * engine.js —— 阿文文案生成引擎（根因级重写）
 * ---------------------------------------------------------------------
 * 历史问题根因与本版修法：
 *   ① "文案像随手小作文"  → 不再套固定模板；每平台一次 LLM 调用，
 *      system=该平台真实爆款打法骨架，user=mctx.factsBrief 唯一事实。
 *   ② "各平台差异不明显"  → platform-skeleton 里 9 平台打法彼此正交，
 *      quality-gate 按平台硬指标卡字数/标签/emoji/结构。
 *   ③ "混入对话/系统记录" → prompt 严格只注入 factsBrief + 商家补录，
 *      engine 从不接收聊天历史；leak-gate 再做交付前兜底拦截。
 *   ④ "拼音首字母/不放logo" → leak-gate 拦拼音碎片；quality-gate Q2
 *      硬要求品牌名出现在电商/海外平台文案里。
 *   ⑤ "不懂产品与痛点"     → factsBrief 内含联网品牌卖点+消费者痛点，
 *      prompt 强制"卖点必须回应痛点、数字只能来自事实"。
 *
 * 工程红线：
 *   · 单次 LLM 硬超时 60s；整轮总时限 150s；受控并发 3；AbortController 可终止；
 *   · 质检致命失败即拒收，拒收/拦截 0 计费；成本逐次写入 costBook。
 *
 * 导出：
 *   generateCopy(env, args) —— 主入口
 *     args.mctx           已构建好的统一上下文（worker 对同一商品只构建一次再分发）
 *     args.images/language/selling_text/shop  未传 mctx 时兜底自建
 *     args.platforms[]    平台 key 数组；缺省按语种选全部
 *     args.infoCard{}     商家补录字段（buildPrefill 预填后的值）
 *     args.media{images[]} 与文案成套交付的图/视频（dataURL 或 URL）
 *     args.signal         外部取消
 *     args.costBook[]     出参：逐次成本记录
 * ===================================================================*/
import { PLATFORMS, pickAngles, EXTREME_WORDS } from './platform-skeleton.js';
import { qualityCheck } from './quality-gate.js';
import { fetchWithTimeout } from './http-util.js';
import { getTrendPlaybook } from './platform-trends.js';

const CHAT_ENDPOINT_DEFAULT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
const COPY_MODEL_DEFAULT = 'doubao-seed-2-1-turbo-260628';
// 成本估算（人民币/千 token；doubao-seed-2-1-turbo 保守取值，实测以 usage 为准）
const PRICE = { inPer1k: 0.0008, outPer1k: 0.002 };
const PER_CALL_TIMEOUT = 60000;
const TOTAL_BUDGET = 150000;
const MAX_CONCURRENCY = 3;
const MAX_ATTEMPTS = 2;

/* ---------- 纯文本 LLM 调用（硬超时+外部信号） ---------- */
async function chatText(env, { system, user, maxTokens = 900, temperature = 0.75, timeoutMs = PER_CALL_TIMEOUT, signal }) {
  const key = env && (env.ARK_API_KEY || env.VISION_API_KEY);
  if (!key) return { ok: false, error: 'no_key' };
  // 注意：.dev.vars 里 ARK_ENDPOINT/ARK_MODEL 指向"图像生成"(seedream)，
  // 文案是 chat/completions，必须用 VISION_ENDPOINT（=chat/completions）+ turbo 文本模型。
  const endpoint = env.VISION_ENDPOINT || env.CHAT_ENDPOINT || CHAT_ENDPOINT_DEFAULT;
  const model = env.COPY_MODEL || COPY_MODEL_DEFAULT;
  const t0 = Date.now();
  let resp;
  try {
    resp = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature, max_tokens: maxTokens, thinking: { type: 'disabled' }
      })
    }, timeoutMs, signal);
  } catch (e) { return { ok: false, error: 'net:' + (e && e.message), ms: Date.now() - t0, usage: null }; }
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return { ok: false, error: 'http_' + resp.status, detail: detail.slice(0, 150), ms: Date.now() - t0, usage: null };
  }
  const j = await resp.json().catch(() => null);
  const txt = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  const usage = j && j.usage ? { in_tokens: j.usage.prompt_tokens || 0, out_tokens: j.usage.completion_tokens || 0 } : null;
  if (!txt) {
    try { (await import('node:fs')).writeFileSync(new URL('./artifacts/_chat_empty.json', import.meta.url), JSON.stringify(j).slice(0, 3000)); } catch {}
  }
  return { ok: !!txt, text: txt || '', usage, model, ms: Date.now() - t0 };
}

/** 容错提取 JSON：模型常把 body 字符串里的换行直接写成裸换行（未转义），
 *  导致 JSON.parse 失败。这里用状态机只对"字符串内部"的裸控制字符做转义。 */
function repairJson(raw) {
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (esc) { out += c; esc = false; continue; }
    if (c === '\\') { out += c; esc = true; continue; }
    if (c === '"') { out += c; inStr = !inStr; continue; }
    if (inStr) {
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\r') continue;
      if (c === '\t') { out += '\\t'; continue; }
    }
    out += c;
  }
  return out;
}

function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const s = t.indexOf('{'), e = t.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  const candidate = t.slice(s, e + 1);
  try { return JSON.parse(candidate); } catch {}
  try { return JSON.parse(repairJson(candidate)); } catch {}
  return null;
}

/* ---------- 平台 system prompt（只含打法，不含任何商品事实） ---------- */
function buildSystem(p, mctx, trendBrief) {
  const lang = p.lang === 'en' ? 'English' : '简体中文';
  const angleList = pickAngles(mctx.category && mctx.category.zh).slice(0, 4).join('；');
  const L = [];
  L.push('你是「阿文」，一名深耕' + p.label + '的资深电商文案。现在只用' + lang + '写这一份稿子。');
  L.push('【平台打法】' + p.label + '（lang=' + p.lang + '）：');
  L.push('- 语气：' + p.tone);
  L.push('- 标题打法：' + p.titleFormulas.join('；'));
  L.push('- 开头：' + p.hook);
  L.push('- 正文结构：' + p.structure.join(' | '));
  L.push('- CTA：' + p.cta);
  if (p.emojiBudget) L.push('- emoji 至多 ' + p.emojiBudget + ' 个不同种类；' + (p.noHashtag ? '本平台不要任何 #话题标签。' : '话题标签 ' + p.hashtagCount[0] + '-' + p.hashtagCount[1] + ' 个。'));
  else L.push('- 全文不要 emoji；本平台不要任何 #话题标签。');
  L.push('- 篇幅：标题 ' + (p.titleMax ? '≤' + p.titleMax : '无标题') + '；正文 ' + p.bodyLen.join('~') + '（' + (p.lang === 'en' ? (p.fields.includes('bullets') ? '字符/词' : '词') : '字') + '）。');
  L.push('【可切入的角度】' + angleList);
  if (trendBrief) L.push('\n' + trendBrief);
  L.push('');
  L.push('【铁律】');
  L.push('1) 商品事实（品牌/型号/价格/材质/数字）只能来自下面给定的"商品事实"，缺了就不写，严禁编造任何参数、销量、评价、奖项。');
  L.push('2) 卖点必须回应"消费者痛点"里列出的真实关注点，不要写放之四海皆准的形容词。');
  L.push('3) 严禁极限词（最/第一/100%/永久/best seller 等）；严禁提到图中背景第三方品牌。');
  L.push('4) 严禁出现任何对话腔（"好的这是您的文案/作为AI/希望有帮助"）、内部代号、JSON 片段、拼音缩写。');
  L.push(p.lang === 'en'
    ? '5) 全程地道母语 English，禁止任何中文字符、禁止机翻套话（very good/high quality 式空话）。'
    : '5) 全程简体中文（品牌/型号英文专名除外），不要夹无意义拼音首字母。');
  L.push('6) 只输出一个 JSON 对象，不要 markdown/解释。');

  // 输出 schema
  let schema;
  if (p.fields.includes('bullets')) {
    schema = '{"title":"...(≤200字符,Title Case)","bullets":["要点1","要点2","要点3","要点4","要点5"],"description":"3-5段,300-900词"}';
  } else if (p.key === 'taobao') {
    schema = '{"title":"商品搜索标题≤30汉字","subtitle":"首屏一句话卖点≤12字","selling_points":["3-5条短句卖点"],"detail":"详情页正文300-700字"}';
  } else if (p.key === 'jd') {
    schema = '{"title":"品牌+品名+型号规格≤30汉字","selling_points":["3-5条,先参数后好处"],"detail":"详情正文300-600字"}';
  } else if (p.key === 'wechat_moments') {
    schema = '{"body":"40-150字第一人称生活碎片,无标题无标签"}';
  } else if (p.key === 'wechat_official') {
    schema = '{"title":"13-22字","body":"800-1500字,带小标题"}';
  } else if (p.key === 'instagram') {
    schema = '{"title":"hook首行≤125字符","body":"120-300词","hashtags":["3-5个"]}';
  } else if (p.key === 'tiktok') {
    schema = '{"title":"≤150字符整段caption","body":"","hashtags":["3-5个"]}';
  } else {
    schema = '{"title":"≤' + p.titleMax + '字","body":"' + p.bodyLen.join('-') + '字","hashtags":["' + p.hashtagCount[0] + '-' + p.hashtagCount[1] + '个话题"]}';
  }
  L.push('输出 JSON：' + schema);
  return L.join('\n');
}

function buildUser(mctx, infoCard, trendMs) {
  const L = [];
  L.push(mctx.factsBrief || '');
  if (infoCard && Object.keys(infoCard).length) {
    const extra = Object.entries(infoCard)
      .filter(([k, v]) => v && String(v).trim() && k[0] !== '_')
      .map(([k, v]) => '- ' + k + '：' + String(v).slice(0, 300));
    if (extra.length) L.push('\n【商家补录（可直接采用）】\n' + extra.join('\n'));
  }
  L.push('\n请严格按系统给的' + (mctx.language && mctx.language.name) + '打法写。');
  return L.join('\n');
}

/* ---------- 后处理：极限词清除 / 标题裁剪 / 标签剥离 ---------- */
function sanitize(draft, p) {
  let d = { ...draft };
  for (const w of EXTREME_WORDS) {
    for (const k of ['title', 'body', 'subtitle', 'detail', 'description']) {
      if (typeof d[k] === 'string') d[k] = d[k].split(w).join('').replace(/\s{2,}/g, ' ').trim();
    }
    if (Array.isArray(d.hashtags)) d.hashtags = d.hashtags.map(t => String(t).split(w).join(''));
    if (Array.isArray(d.selling_points)) d.selling_points = d.selling_points.map(t => String(t).split(w).join(''));
    if (Array.isArray(d.bullets)) d.bullets = d.bullets.map(t => String(t).split(w).join(''));
  }
  if (p.noHashtag) d.hashtags = [];
  if (p.titleMax && d.title && [...d.title].length > p.titleMax) {
    d.title = [...d.title].slice(0, p.titleMax).join('').replace(/[，。、：:！!？?\s]+$/, '');
  }
  return d;
}

/* 受控并发跑多个平台 */
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function generateCopy(env, args = {}) {
  const startedAt = Date.now();
  const costBook = args.costBook || [];
  const signal = args.signal;

  /* ① 拿 mctx（worker 已构建则直接用；否则兜底自建） */
  let mctx = args.mctx;
  if (!mctx || !mctx.ok) {
    if (!args.images || !args.images.length) {
      return { ok: false, error: { code: 'need_mctx_or_images', message: '必须传入已构建的 mctx，或 images 兜底' } };
    }
    const { buildMerchantContext } = await import('../merchant-context.js');
    mctx = await buildMerchantContext(env, {
      images: args.images, language: args.language, selling_text: args.selling_text, shop: args.shop, signal
    });
    if (!mctx.ok) return { ok: false, error: mctx.error };
  }

  /* ② 当下打法速写（TTL 缓存，软降级） */
  const trend = await getTrendPlaybook().catch(() => ({ brief: '', used: false }));

  /* ③ 平台清单 */
  const langCode = (mctx.language && mctx.language.code) || 'zh-CN';
  let platforms = args.platforms;
  if (!platforms || !platforms.length) {
    platforms = langCode.startsWith('zh')
      ? ['xiaohongshu', 'douyin', 'wechat_moments', 'wechat_official', 'taobao', 'jd']
      : ['instagram', 'tiktok', 'amazon'];
  }
  platforms = platforms.filter(k => PLATFORMS[k]);

  /* ④ 受控并发生成（每平台独立重试+质检） */
  const media = args.media || { images: args.images || [] };
  const results = await mapPool(platforms, MAX_CONCURRENCY, async (platform) => {
    const p = PLATFORMS[platform];
    const sys = buildSystem(p, mctx, trend.brief);
    const usr = buildUser(mctx, args.infoCard, trend.ms);
    let draft = null, qc = null, attempts = 0, rejected = false, lastErr = '';
    for (; attempts < MAX_ATTEMPTS; attempts++) {
      if (Date.now() - startedAt > TOTAL_BUDGET) { rejected = true; break; }
      const r = await chatText(env, { system: sys, user: usr, maxTokens: ['wechat_official', 'amazon', 'xiaohongshu', 'taobao'].includes(platform) ? 1600 : 900, signal });
      if (r.usage) {
        const cost = (r.usage.in_tokens / 1000) * PRICE.inPer1k + (r.usage.out_tokens / 1000) * PRICE.outPer1k;
        costBook.push({ platform, model: r.model, in_tokens: r.usage.in_tokens, out_tokens: r.usage.out_tokens, cost_cny: +cost.toFixed(4), ms: r.ms });
      }
      if (!r.ok) {
        try { (await import('node:fs')).writeFileSync(new URL('./artifacts/_chat_fail.json', import.meta.url), JSON.stringify({ r, userHead: usr.slice(0, 400) }).slice(0, 4000)); } catch {}
        lastErr = (r.error || '') + ' ' + (r.detail || ''); await new Promise(res => setTimeout(res, 300)); continue;
      }
      const parsed = extractJson(r.text);
      if (!parsed) {
        try { (await import('node:fs')).writeFileSync(new URL('./artifacts/_xhs_raw_attempt' + attempts + '.txt', import.meta.url), r.text.slice(0, 4000)); } catch {}
        continue;
      }
      draft = sanitize(parsed, p);
      qc = qualityCheck(draft, { platform, mctx });
      if (qc.pass) break;
      if (qc.fails.some(f => f.fatal)) { rejected = true; break; }
    }
    const costSum = costBook.filter(c => c.platform === platform).reduce((a, c) => a + c.cost_cny, 0);
    return {
      platform, label: p.label, lang: p.lang,
      ok: !rejected && !!(draft && qc && qc.pass),
      rejected,
      reason: rejected ? 'quality_gate_fatal' : (draft ? 'gate_not_passed' : 'llm_failed'),
      draft,
      qc: qc ? { pass: qc.pass, fails: qc.fails, warns: qc.warns, metrics: qc.metrics } : null,
      media: { images: media.images || [], aspect: p.aspect, suggestion: p.key + ' 配图建议：' + p.aspect },
      cost_cny: +costSum.toFixed(4),
      attempts: attempts + 1,
      lastErr
    };
  });

  const cost_total = +costBook.reduce((a, c) => a + c.cost_cny, 0).toFixed(4);
  return {
    ok: results.some(r => r.ok),
    mctx: {
      brand: mctx.brand, category: mctx.category, language: mctx.language,
      bg_brands: mctx.bg_brands, brand_source: mctx.brand_source,
      factsBrief: mctx.factsBrief
    },
    trend: { used: trend.used, ms: trend.ms },
    results,
    cost_total_cny: cost_total,
    costBook,
    total_ms: Date.now() - startedAt
  };
}

export { buildPrefill } from './info-card.js';
export { qualityCheck } from './quality-gate.js';
export { leakCheck } from './leak-gate.js';
export default { generateCopy };
