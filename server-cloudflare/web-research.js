/* =====================================================================
 * WorkHogee · 服务端联网调研（零新增账号）
 * ---------------------------------------------------------------------
 * 火山方舟唯一已开通的 doubao-seed-2-1-turbo 直连不支持内置 web_search 插件
 * （仅支持 function 工具；其余支持联网的模型未开通，开通需控制台操作）。
 * 故由 Worker 直接 fetch 公开搜索引擎 HTML 解析 + 正文页抓取：
 *   - 百度：中文品牌 / 国内消费者需求（对 DTA 等中文品牌命中最好）
 *   - Bing：英文 / 亚马逊等海外场景与品类通用需求
 *   - DuckDuckGo：尽力（部分网络被阻断）
 * 任何来源失败都软降级，绝不阻断主链路；全部失败时由调用方退回
 * 「OCR 真实信息 + LLM 品类洞察」，绝不写放之四海皆准的模板。
 *
 * 工程红线：每次 fetch 硬超时 + 整轮总时限（AbortController），无界等待禁止。
 * 已知风险：生产环境为 Cloudflare 数据中心出口，搜索引擎可能反爬/验证；
 *   本地（住宅 IP / wrangler dev）正常，部署后必须真机复核，失败则上报。
 * ===================================================================*/

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchTo(url, { ms = 9000, headers = {}, redirect = 'follow' } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, ms);
  try {
    return await fetch(url, {
      redirect,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        ...headers
      },
      signal: ctrl.signal
    });
  } finally { clearTimeout(timer); }
}

/* 确定性清洗网页内联 JSON / JS 噪声（百度等会把 {"clamp":3}、
 * }],"isSingleLine":false,"summarySpan":12 等对象字面量片段混进摘要容器，
 * 这些不是正文。只删"带引号键名的键值对/对象片段"，不碰正常文案。 */
function cleanJsonNoise(s) {
  let x = String(s || '');
  // 键名允许 字母/数字/_/$/连字符（覆盖 $style、rate-text 等内联 JSON/JS 残留）
  const KEY = `["']?[A-Za-z0-9_$-]+["']?`;
  // 1) 形如 {"key":...} / [{"key":...}] 的短对象/数组片段
  x = x.replace(new RegExp(`[\\[{]\\s*${KEY}\\s*:[\\s\\S]{0,160}?[\\]}]`, 'g'), ' ');
  // 2) 孤立的 ,"key":value（value 为 true/false/null/数字/字符串/数组/对象）
  x = x.replace(new RegExp(`,?\\s*${KEY}\\s*:\\s*(?:true|false|null|-?\\d+(?:\\.\\d+)?|"[^"]{0,120}"|'[^']{0,120}'|\\[[^\\]]{0,160}\\]|\\{[^}]{0,160}\\})`, 'g'), ' ');
  // 2b) 悬空的 "key":{ / "key":[（开了括号但后面仍是噪声）
  x = x.replace(new RegExp(`,?\\s*${KEY}\\s*:\\s*[\\[{]`, 'g'), ' ');
  // 3) 连续的括号/引号/逗号符号串（如 }],  }], ）
  x = x.replace(/(?:[\[\]{}]\s*,?\s*){2,}/g, ' ');
  // 4) 空的/仅空格的引号对（" "、""、''），多为对象片段清除后的残留
  x = x.replace(/["']\s*["']/g, ' ');
  // 4b) 中文标点旁残留的直引号（合法中文用“”，直引号必为 JSON 残留）
  x = x.replace(/([。！？，、；：])\s*["']/g, '$1 ');
  x = x.replace(/["']\s*([。！？，、；：])/g, ' $1');
  // 5) 仅清理首尾的空格/逗号/分号（保留句尾句号，勿误删正文）
  x = x.replace(/^[\s,;]+|[\s,;]+$/g, '');
  return x.replace(/\s+/g, ' ').trim();
}

export function stripTags(s) {
  return cleanJsonNoise(String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&ensp;|&emsp;|&#819[45];/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
    .replace(/\s+/g, ' ').trim();
}

function absUrl(href) {
  let h = String(href || '').trim();
  if (!h || h.startsWith('javascript:')) return '';
  if (h.startsWith('//')) h = 'https:' + h;
  else if (h.startsWith('/')) h = ''; // 站点相对地址在搜索结果里无可靠 origin，跳过
  return h;
}

/* ---------- 百度 ---------- */
async function searchBaidu(q) {
  const out = [];
  let r;
  try { r = await fetchTo('https://www.baidu.com/s?wd=' + encodeURIComponent(q) + '&rn=10', { ms: 9000 }); }
  catch { return out; }
  if (!r.ok) return out;
  const t = await r.text();
  // 反爬验证页特征
  if (/百度安全验证|wappass\.baidu\.com|请输入验证码/.test(t)) { out._blocked = true; return out; }
  const blocks = t.split(/<div[^>]+class="[^"]*c-container[^"]*"[^>]*>/).slice(1);
  for (const b of blocks) {
    const hm = b.match(/<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!hm) continue;
    const url = absUrl(hm[1]);
    const title = stripTags(hm[2]);
    // 摘要：多种新版 class，兜底取 h3 之后较长文本
    let snippet = '';
    const sm = b.match(/<(?:span|div)[^>]+class="[^"]*(?:content-right|c-abstract|c-color-text|c-font-normal)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div)>/);
    if (sm) snippet = stripTags(sm[1]);
    if (!snippet) {
      const tail = b.split(/<\/h3>/)[1] || '';
      snippet = stripTags(tail).slice(0, 200);
    }
    if (title) out.push({ title: title.slice(0, 90), url, snippet: snippet.slice(0, 260), src: 'baidu' });
    if (out.length >= 8) break;
  }
  return out;
}

/* ---------- Bing ---------- */
async function searchBing(q, lang = 'zh') {
  const out = [];
  let r;
  const tail = lang === 'en' ? '&setlang=en-US&cc=US' : '&setlang=zh-CN&cc=CN';
  try { r = await fetchTo('https://www.bing.com/search?q=' + encodeURIComponent(q) + tail, { ms: 9000 }); }
  catch { return out; }
  if (!r.ok) return out;
  const t = await r.text();
  if (/b_captcha|captcha\.abuse|verify/.test(t)) { out._blocked = true; return out; }
  const blocks = t.split(/<li class="b_algo"/).slice(1);
  for (const b of blocks) {
    const hm = b.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const pm = b.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (!hm) continue;
    const title = stripTags(hm[2]);
    if (title) out.push({ title: title.slice(0, 90), url: absUrl(hm[1]), snippet: stripTags(pm ? pm[1] : '').slice(0, 260), src: 'bing' });
    if (out.length >= 8) break;
  }
  return out;
}

/* ---------- DuckDuckGo HTML lite（尽力） ---------- */
async function searchDdg(q) {
  const out = [];
  let r;
  try { r = await fetchTo('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), { ms: 8000 }); }
  catch { return out; }
  if (!r.ok) return out;
  const t = await r.text();
  const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(t))) {
    // DDG href 常带 //duckduckgo.com/l/?uddg=<encoded>
    let u = absUrl(m[1]);
    const uddg = m[1].match(/[?&]uddg=([^&]+)/);
    if (uddg) { try { u = decodeURIComponent(uddg[1]); } catch {} }
    out.push({ title: stripTags(m[2]).slice(0, 90), url: u, snippet: stripTags(m[3]).slice(0, 260), src: 'ddg' });
    if (out.length >= 8) break;
  }
  return out;
}

/* ---------- 正文页抓取（搜索结果多为跳转链接，跟随重定向） ---------- */
async function fetchArticle(url, ms = 10000) {
  if (!url || !/^https?:\/\//.test(url)) return '';
  let r;
  try { r = await fetchTo(url, { ms, redirect: 'follow' }); }
  catch { return ''; }
  if (!r.ok) return '';
  const ct = r.headers.get('content-type') || '';
  if (ct && !/text\/html|application\/xhtml/.test(ct)) return '';
  const t = await r.text();
  // 优先正文容器，兜底全文
  let body = '';
  const am = t.match(/<article[\s\S]*?<\/article>/i);
  if (am) body = am[0];
  const dm = t.match(/<div[^>]+class="[^"]*(?:article|content|main|post|artical|txt)[^"]*"[^>]*>[\s\S]{200,}?<\/div>/i);
  if (!body && dm) body = dm[0];
  if (!body) body = t;
  return stripTags(body).slice(0, 2600);
}

function dedupe(list) {
  const seen = new Set(); const out = [];
  for (const it of list) {
    const key = (it.title || '').replace(/\s+/g, '').slice(0, 24);
    if (!key || seen.has(key)) continue;
    seen.add(key); out.push(it);
  }
  return out;
}

/**
 * 联网调研主入口。
 * @param {object} opts
 * @param {string} opts.brand     OCR 读出的品牌（如 DTA），无则空
 * @param {string} opts.category  品类中文名（如 拉杆箱）及/或英文（luggage/suitcase）
 * @param {string} [opts.enCategory] 英文品类（用于海外搜索）
 * @param {number} [opts.totalMs=20000] 整轮总时限
 * @returns {ok, brandResults, needResults, articles, sources, blocked, notes}
 */
export async function webResearch(opts = {}) {
  const started = Date.now();
  const totalMs = opts.totalMs || 22000;
  const timeLeft = () => totalMs - (Date.now() - started);
  const brand = (opts.brand || '').trim();
  const cat = (opts.category || '').trim();
  const enCat = (opts.enCategory || '').trim();
  const notes = [];

  // 品牌查询
  const brandQueries = [];
  if (brand) {
    brandQueries.push(brand + ' ' + cat + ' 卖点 参数 怎么样');
    brandQueries.push(brand + ' ' + cat + ' 测评 评测 是哪个公司品牌');
  }
  // 品类消费者需求查询（中文）
  const needQueriesZh = cat ? [cat + ' 怎么选 消费者最关心 哪些点', cat + ' 选购 避坑 静音 耐用 容量'] : [];
  // 英文（海外）
  const needQueriesEn = enCat ? ['best ' + enCat + ' what to look for buying guide', enCat + ' reviews most important features'] : [];

  const runSearches = async () => {
    const tasks = [];
    for (const q of brandQueries) tasks.push(searchBaidu(q), searchBing(q, 'zh'));
    for (const q of needQueriesZh) tasks.push(searchBaidu(q), searchBing(q, 'zh'));
    for (const q of needQueriesEn) tasks.push(searchBing(q, 'en'));
    const settled = await Promise.allSettled(tasks);
    let brandHits = [], needHits = [], blocked = false;
    settled.forEach((s, i) => {
      if (s.status !== 'fulfilled' || !Array.isArray(s.value)) return;
      if (s.value._blocked) blocked = true;
      const qIndex = i;
      const isBrand = qIndex < brandQueries.length * 2;
      const isEn = qIndex >= (brandQueries.length * 2 + needQueriesZh.length * 2);
      s.value.forEach(it => { (isBrand ? brandHits : needHits).push(it); });
    });
    return { brandHits: dedupe(brandHits), needHits: dedupe(needHits), blocked };
  };

  let brandHits = [], needHits = [], blocked = false;
  try {
    const r = await Promise.race([
      runSearches(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('research_total_timeout')), totalMs))
    ]);
    brandHits = r.brandHits; needHits = r.needHits; blocked = r.blocked;
  } catch (e) { notes.push('search partial/timeout: ' + e.message); }

  // 抓 2-3 个最相关品牌正文（跳转链接解析真实卖点）
  const articles = [];
  const sources = [];
  const prefer = brandHits.filter(h => h.url && /^https?:\/\//.test(h.url)).slice(0, 3);
  for (const h of prefer) {
    if (timeLeft() < 3000) break;
    const txt = await fetchArticle(h.url, Math.min(10000, Math.max(3500, timeLeft())));
    if (txt && txt.length > 180) {
      articles.push({ title: h.title, url: h.url, text: txt });
      sources.push(h.url);
    }
  }
  brandHits.forEach(h => h.url && sources.push(h.url));
  needHits.forEach(h => h.url && sources.push(h.url));

  const ok = (brandHits.length + needHits.length + articles.length) > 0;
  return {
    ok,
    brand, category: cat,
    brandResults: brandHits.slice(0, 10),
    needResults: needHits.slice(0, 10),
    articles: articles.slice(0, 3),
    sources: Array.from(new Set(sources)).slice(0, 14),
    blocked: blocked || false,
    elapsed_ms: Date.now() - started,
    notes
  };
}

/** 把调研结果压成给 LLM 的事实简报（带出处）。 */
export function researchToBrief(r) {
  if (!r || r.ok === false) return '';
  const L = [];
  if (r.brandResults.length) {
    L.push('【联网·品牌相关】');
    r.brandResults.slice(0, 7).forEach(h => L.push('- ' + [h.title, h.snippet].filter(Boolean).join('：')));
  }
  if (r.articles.length) {
    L.push('【联网·测评/正文摘录】');
    r.articles.forEach(a => L.push('- 《' + a.title + '》：' + a.text.slice(0, 900)));
  }
  if (r.needResults.length) {
    L.push('【联网·该品类消费者真实关注点】');
    r.needResults.slice(0, 7).forEach(h => L.push('- ' + [h.title, h.snippet].filter(Boolean).join('：')));
  }
  return L.join('\n');
}
