/* =====================================================================
 * platform-trends.js —— 运行时"当下"爆款打法速写（联网，TTL 缓存，软降级）
 * ---------------------------------------------------------------------
 * 目的：阿文不是背死模板，而是每次（12小时缓存期内）真去搜一遍
 *   "现在小红书标题怎么写在爆 / 海外 TikTok 钩子什么在跑 / 亚马逊规则
 *   有没有更新"，把真实在跑的套路浓缩成 300-500 字 playbook 注入 prompt。
 *
 * 工程红线：
 *   · 整轮总时限 12s（Promise.race 兜底）；单次 fetch 硬超时 7s；
 *   · 失败/被反爬一律软降级 —— 退回 platform-skeleton.js 内置打法，绝不阻断；
 *   · 结果 12h 进程内缓存，避免每次生成都搜（成本与配额红线）。
 *
 * 导出：
 *   getTrendPlaybook({ force }) -> Promise<{ brief, used, sources, ms }>
 * ===================================================================*/

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const TOTAL_MS = 12000;
const TTL_MS = 12 * 60 * 60 * 1000;

let cache = { at: 0, brief: '', used: false, sources: [] };

async function fetchHtml(url, ms = 7000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, ms);
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      signal: ctrl.signal
    });
    if (!r.ok) return '';
    return await r.text();
  } catch { return ''; }
  finally { clearTimeout(timer); }
}

function strip(s) {
  return String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

async function bing(q, en = false) {
  const tail = en ? '&setlang=en-US&cc=US' : '&setlang=zh-CN&cc=CN';
  const t = await fetchHtml('https://www.bing.com/search?q=' + encodeURIComponent(q) + tail);
  if (!t || /b_captcha|captcha\.abuse/.test(t)) return [];
  const out = [];
  const blocks = t.split(/<li class="b_algo"/).slice(1);
  for (const b of blocks) {
    const hm = b.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const pm = b.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    if (!hm) continue;
    const title = strip(hm[2]);
    const snippet = strip(pm ? pm[1] : '').slice(0, 220);
    if (title) out.push({ title, snippet });
    if (out.length >= 6) break;
  }
  return out;
}

async function baidu(q) {
  const t = await fetchHtml('https://www.baidu.com/s?wd=' + encodeURIComponent(q) + '&rn=10');
  if (!t || /百度安全验证|wappass/.test(t)) return [];
  const out = [];
  const blocks = t.split(/<div[^>]+class="[^"]*c-container[^"]*"[^>]*>/).slice(1);
  for (const b of blocks) {
    const hm = b.match(/<h3[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
    if (!hm) continue;
    const title = strip(hm[1]);
    const tail = b.split(/<\/h3>/)[1] || '';
    const snippet = strip(tail).slice(0, 220);
    if (title) out.push({ title, snippet });
    if (out.length >= 6) break;
  }
  return out;
}

const QUERIES = [
  ['zh', '小红书 爆款笔记 标题 套路 2026 种草'],
  ['zh', '抖音 带货短视频 文案 黄金3秒 钩子 2026'],
  ['zh', '淘宝 详情页 卖点文案 转化率 痛点 2026'],
  ['en', 'viral TikTok Instagram caption hook formula 2026 ecommerce'],
  ['en', 'Amazon listing title bullet points best practices 2026'],
];

export async function getTrendPlaybook(opts = {}) {
  const now = Date.now();
  if (!opts.force && cache.brief && (now - cache.at) < TTL_MS) {
    return { brief: cache.brief, used: cache.used, sources: cache.sources, ms: 0, cached: true };
  }
  const t0 = now;
  const collected = [];
  const sources = [];
  const tasks = QUERIES.map(([lang, q]) => (lang === 'zh' ? baidu(q) : bing(q, true)));
  try {
    const settled = await Promise.race([
      Promise.allSettled(tasks),
      new Promise((_, rej) => setTimeout(() => rej(new Error('trends_total_timeout')), TOTAL_MS))
    ]);
    settled.forEach((s, i) => {
      if (s.status !== 'fulfilled' || !Array.isArray(s.value)) return;
      for (const hit of s.value.slice(0, 3)) {
        collected.push((QUERIES[i][1].slice(0, 12) + '｜' + [hit.title, hit.snippet].filter(Boolean).join('：')).slice(0, 260));
      }
    });
  } catch { /* 软降级 */ }

  let brief = '';
  if (collected.length >= 4) {
    brief = [
      '【当下在跑的平台打法速写（联网检索，已去重压缩，供校准语气，不必逐字引用）】',
      ...collected.slice(0, 9).map(x => '- ' + x)
    ].join('\n');
  }
  cache = { at: Date.now(), brief, used: !!brief, sources, ms: Date.now() - t0 };
  return { brief, used: cache.used, sources, ms: cache.ms, cached: false };
}

export default { getTrendPlaybook };
