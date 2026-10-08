/* =====================================================================
 * WorkHogee · 阿果（数据/收银伙计）路由模块 agu.js
 * ---------------------------------------------------------------------
 * 闭环：外部平台数据回收（截图 VL / 手动）→ 落 KV → 现算聚合 + 第一方数据
 *       → COPY 模型出报告 → 结构化 insights 落库 → 反哺阿图 /generate、阿文 /copy。
 *
 * 契约：docs/阿果打通-接口契约与验收规格.md（v1 冻结）。路由 / 请求响应 / KV 键 /
 *       字段口径以此为准。所有 LLM/HTTP 单次硬超时（AbortController + 超时竞态）、
 *       整轮总时限、受控并发（有界）、可终止；禁止无界轮询。
 *
 * 导出：
 *   handleAgu(request, env, ctx, origin)  —— worker.js 挂载（在 handleAnalytics 之前）
 *   getTopInsights(env, shop, limit=6)   —— 高信号 insights 记录数组（任何异常返回 []）
 *   buildInsightsContext(env, shop)      —— 拼接好的多行文本（空则 ''）
 * ===================================================================*/

import { chatVisionCustom } from './vision.js';
import { getMemberSession } from './member-auth.js';
import {
  EXT_PLATFORMS, toIntOrNull,
  upsertExtMetric, listExtMetrics,
  addInsight, listInsights,
  recordOauthInterest, listOauthInterests,
  analyticsOverview
} from './analytics-store.js';

// ---------- CORS / JSON / 读体（与 analytics.js 等价） ----------
const ORIGINS = [
  'https://www.workhogee.com', 'http://www.workhogee.com',
  'https://workhogee.com', 'http://workhogee.com',
  'https://hiaeo.github.io', 'http://hiaeo.github.io'
];
function cors(origin) {
  const dev = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
  const allow = (ORIGINS.includes(origin) || dev) ? origin : ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function J(payload, status = 200, origin = '') {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', ...cors(origin) }
  });
}
function readBody(request) {
  return request.text().then(t => { try { return t ? JSON.parse(t) : {}; } catch { return {}; } }).catch(() => ({}));
}

// ---------- 平台目录 ----------
const PLATFORM_META = {
  xhs: { id: 'xhs', name: '小红书' },
  douyin: { id: 'douyin', name: '抖音' },
  pyq: { id: 'pyq', name: '朋友圈' },
  gzh: { id: 'gzh', name: '公众号' },
  shipinhao: { id: 'shipinhao', name: '视频号' },
  kuaishou: { id: 'kuaishou', name: '快手' },
  taobao: { id: 'taobao', name: '淘宝' },
  jd: { id: 'jd', name: '京东' },
  amazon: { id: 'amazon', name: '亚马逊' },
  tiktok: { id: 'tiktok', name: 'TikTok' },
  other: { id: 'other', name: '其他' }
};

// ---------- 受控常量（入参体积 / 并发上限） ----------
const MAX_IMAGE_CHARS = 11_000_000;   // read-shot 单图 base64 上限（约 8MB）
const MAX_METRICS_BATCH = 10;         // metrics 一次最多提交条数
const REPORT_LLM_TIMEOUT_MS = 40_000; // 报告 LLM 单次硬超时（契约 40s）
const READSHOT_TIMEOUT_MS = 45_000;  // read-shot VL 单次硬超时
const CONC = 5;                       // KV 实体读取有界并发

const DATA_URL_IMG_RE = /^data:image\/(jpe?g|png|webp);base64,/;

// ---------- 硬超时 fetch：AbortController + Promise.race 双保险 ----------
function fetchRace(resource, init, ms) {
  const ctrl = new AbortController();
  let abortTimer, raceTimer;
  const done = () => { clearTimeout(abortTimer); clearTimeout(raceTimer); };
  abortTimer = setTimeout(() => { try { ctrl.abort(); } catch {} }, ms);
  const p = fetch(resource, Object.assign({}, init, { signal: ctrl.signal }));
  const timeout = new Promise((_, rej) => {
    raceTimer = setTimeout(() => { try { ctrl.abort(); } catch {}; rej(new Error('upstream_timeout')); }, ms);
  });
  return Promise.race([p, timeout]).finally(done);
}

// 容错提取 JSON（与 vision.js 同思路，本地副本避免循环依赖）
function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

// 会员门禁：未登录 401，suspended 403
async function requireMember(request, env) {
  const s = await getMemberSession(env, request);
  if (!s) return { err: J({ ok: false, error: { code: 'unauthorized', message: '请先登录' } }, 401) };
  if (s.status === 'suspended') return { err: J({ ok: false, error: { code: 'forbidden', message: '账号已停用' } }, 403) };
  return { shop: s.id };
}

/* =====================================================================
 * POST /agu/read-shot —— 截图 VL 真识别（识别不出为 null，禁编造）
 * ===================================================================*/
const READSHOT_SYSTEM = [
  '你是严谨的电商平台后台数据截图识别引擎。用户给你一张小红书/抖音/朋友圈/公众号/视频号/快手/淘宝/京东/亚马逊/TikTok 等',
  '内容后台或笔记数据截图。你的唯一任务：把截图里真实可见的数据读数原样抽出来。',
  '铁律：',
  '1) 只输出一个 JSON 对象，不要 markdown、不要代码块、不要任何解释文字；',
  '2) platform 只能取：xhs, douyin, pyq, gzh, shipinhao, kuaishou, taobao, jd, amazon, tiktok, other；',
  '3) 识别截图中的：数据日期 date(YYYY-MM-DD，识别不到给 null)、发布天数 days(整数)、浏览/播放 views、',
  '   点赞 likes、收藏 collects、评论 comments、分享 shares、咨询/留资 leads、成交 deals、内容标题 post_title；',
  '4) 数字统一成整数：1.2万→12000、3.5k→3500、"1,200"→1200；',
  '5) 截图里没有的字段一律给 null，严禁估算、严禁编造、严禁用常识补全；',
  '6) post_title 照录截图里的内容标题原文，看不清给 null；',
  '7) 另给 fields_present：你成功读到的字段名数组（如 ["views","likes","comments"]）。',
  'schema：{"platform":"","date":null,"days":null,"views":null,"likes":null,"collects":null,"comments":null,"shares":null,"leads":null,"deals":null,"post_title":null,"fields_present":[]}'
].join('\n');

async function handleReadShot(request, env, origin, shop) {
  const body = await readBody(request);
  const image = body && body.image;
  if (typeof image !== 'string' || !DATA_URL_IMG_RE.test(image)) {
    return J({ ok: false, error: { code: 'bad_image', message: '缺少合法的截图 dataURL（jpeg/png/webp）' } }, 400, origin);
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return J({ ok: false, error: { code: 'image_too_large', message: '截图过大，请压缩后重试' } }, 413, origin);
  }
  const hint = PLATFORM_META[body.platform_hint] ? body.platform_hint : '';
  const userText = hint ? ('（该截图平台提示：' + PLATFORM_META[hint].name + '，若截图与提示不符以截图实际为准）请识别这张数据截图。')
                        : '请识别这张数据截图。';

  const r = await chatVisionCustom(env, {
    system: READSHOT_SYSTEM,
    user: userText,
    images: [image],
    maxTokens: 900,
    temperature: 0,
    timeoutMs: READSHOT_TIMEOUT_MS
  });
  // 业务失败统一 HTTP 200 + ok:false，前端据此降级手动填
  if (!r.ok) {
    const code = r.error === 'vision_timeout' ? 'vision_timeout'
      : r.error === 'no_api_key' ? 'no_key'
      : 'read_shot_failed';
    return J({ ok: false, error: { code, message: '截图识别失败，请手动填写' } }, 200, origin);
  }
  const d = r.data || {};
  const platform = EXT_PLATFORMS.includes(d.platform) ? d.platform : 'other';
  const out = {
    platform,
    date: (typeof d.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.date)) ? d.date : null,
    days: toIntOrNull(d.days),
    views: toIntOrNull(d.views),
    likes: toIntOrNull(d.likes),
    collects: toIntOrNull(d.collects),
    comments: toIntOrNull(d.comments),
    shares: toIntOrNull(d.shares),
    leads: toIntOrNull(d.leads),
    deals: toIntOrNull(d.deals),
    post_title: (typeof d.post_title === 'string' && d.post_title.trim()) ? d.post_title.trim().slice(0, 200) : null
  };
  // fields_present：服务端据实重算，不信模型自报
  const fieldsPresent = [];
  for (const k of ['date', 'days', 'views', 'likes', 'collects', 'comments', 'shares', 'leads', 'deals', 'post_title']) {
    if (out[k] !== null) fieldsPresent.push(k);
  }
  out.fields_present = fieldsPresent;
  return J({ ok: true, data: out }, 200, origin);
}

/* =====================================================================
 * POST/GET /agu/metrics —— 外部指标落库（幂等 upsert）/ 查询
 * ===================================================================*/
async function handleMetricsPost(request, env, origin, shop) {
  const body = await readBody(request);
  const arr = Array.isArray(body) ? body : (body && Array.isArray(body.metrics) ? body.metrics : [body]);
  const items = arr.filter(x => x && typeof x === 'object').slice(0, MAX_METRICS_BATCH);
  if (!items.length) return J({ ok: false, error: { code: 'bad_body', message: '缺少指标数据' } }, 400, origin);

  const results = [];
  for (const it of items) {
    const res = await upsertExtMetric(env, shop, it);
    if (!res.ok) {
      return J({ ok: false, error: { code: res.code || 'bad_metric', message: res.message || '指标非法' } }, 400, origin);
    }
    results.push(res.record);
  }
  return J({ ok: true, results }, 200, origin);
}

async function handleMetricsGet(url, env, origin, shop) {
  const taskId = url.searchParams.get('task_id') || '';
  const from = url.searchParams.get('from') || '';
  const to = url.searchParams.get('to') || '';
  const rows = await listExtMetrics(env, shop, {
    task_id: taskId || undefined,
    from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : undefined,
    to: /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : undefined
  });
  return J({ ok: true, data: rows, meta: { generated_at: Date.now() } }, 200, origin);
}

/* =====================================================================
 * 确定性现算（JS，绝不让 LLM 算数）
 * ===================================================================*/
function groupSum(rows) {
  const s = { views: 0, likes: 0, collects: 0, comments: 0, shares: 0, leads: 0, deals: 0 };
  for (const r of rows) for (const k of Object.keys(s)) s[k] += Number(r[k]) || 0;
  s.engagement = s.likes + s.collects + s.comments;
  s.engagement_rate = s.views ? +(s.engagement / s.views * 100).toFixed(2) : null;
  s.lead_rate = s.views ? +(s.leads / s.views * 100).toFixed(2) : null;
  s.deal_rate = s.leads ? +(s.deals / s.leads * 100).toFixed(2) : null;
  return s;
}

function buildReportData(rows, from, to) {
  const totals_ext = groupSum(rows);

  // 字段覆盖率
  const fields = ['views', 'likes', 'collects', 'comments', 'shares', 'leads', 'deals'];
  const coverage = {};
  for (const f of fields) {
    const present = rows.filter(r => r[f] !== null && r[f] !== undefined).length;
    coverage[f] = rows.length ? +(present / rows.length * 100).toFixed(1) : 0;
  }

  // 分组
  const groupBy = keyFn => {
    const map = {};
    for (const r of rows) {
      const k = String(keyFn(r) || '');
      (map[k] = map[k] || []).push(r);
    }
    return Object.entries(map).map(([k, rs]) => ({ key: k, ...groupSum(rs) }));
  };
  const by_platform = groupBy(r => PLATFORM_META[r.platform] ? r.platform : 'other');
  const by_image = groupBy(r => r.image_type);
  const by_copy = groupBy(r => r.copy_version);

  // 漏斗 views → engagement → leads → deals
  const funnel = [
    { key: 'views', label: '外部触达/播放', count: totals_ext.views },
    { key: 'engagement', label: '互动(赞+藏+评)', count: totals_ext.engagement },
    { key: 'leads', label: '咨询/留资', count: totals_ext.leads },
    { key: 'deals', label: '成交', count: totals_ext.deals }
  ];
  let prev = null;
  for (const s of funnel) {
    s.rate_from_prev = (prev && prev > 0) ? +(s.count / prev * 100).toFixed(2) : 100;
    prev = s.count;
  }

  // 趋势：按日期聚合
  const trendMap = {};
  for (const r of rows) {
    const d = r.date || '未知';
    if (!trendMap[d]) trendMap[d] = { date: d, views: 0, engagement: 0, leads: 0, deals: 0 };
    trendMap[d].views += Number(r.views) || 0;
    trendMap[d].engagement += (Number(r.likes) || 0) + (Number(r.collects) || 0) + (Number(r.comments) || 0);
    trendMap[d].leads += Number(r.leads) || 0;
    trendMap[d].deals += Number(r.deals) || 0;
  }
  const trend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

  // 排名：lead_rate 优先、次 engagement_rate、次 views；views=0 或 key 为空不参与
  const rankCandidates = arr => arr.filter(g => g.key && g.views > 0)
    .sort((a, b) => (b.lead_rate || 0) - (a.lead_rate || 0) || (b.engagement_rate || 0) - (a.engagement_rate || 0) || b.views - a.views);
  const rp = rankCandidates(by_platform);
  const ri = rankCandidates(by_image);
  const rc = rankCandidates(by_copy);
  const ranking = {
    best_platform: rp[0] ? { key: rp[0].key, name: (PLATFORM_META[rp[0].key] || {}).name || rp[0].key, views: rp[0].views, engagement_rate: rp[0].engagement_rate, lead_rate: rp[0].lead_rate } : null,
    best_image: ri[0] ? { key: ri[0].key, views: ri[0].views, engagement_rate: ri[0].engagement_rate, lead_rate: ri[0].lead_rate } : null,
    best_copy: rc[0] ? { key: rc[0].key, views: rc[0].views, engagement_rate: rc[0].engagement_rate, lead_rate: rc[0].lead_rate } : null
  };

  return { totals_ext, by_platform, by_image, by_copy, funnel, ranking, trend, coverage, from, to };
}

/* =====================================================================
 * 报告 LLM（COPY_MODEL，关思考，温度 0.3，超时 40s）
 * ===================================================================*/
const REPORT_MODEL_DEFAULT = 'doubao-seed-2-1-turbo-260628';
const ARK_CHAT_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

const REPORT_SYSTEM = [
  '你是 WorkHogee 阿果，资深电商数据分析师。老板给你一份某推广任务的外部平台投放数据摘要（数字全部真实、已由程序精确计算）。',
  '你的任务：基于这些数字写一份可执行的效果解读报告。',
  '铁律：',
  '1) 只输出一个 JSON 对象，不要 markdown、不要代码块、不要任何解释；',
  '2) 所有结论必须基于给定数字，严禁编造数字、严禁使用给定数据之外的任何事实；',
  '3) 合规：不写绝对化用语（最好/第一/100%/永久/顶级），不写医疗/功效承诺，不做收益承诺；',
  '4) best/why、findings 里的数字必须与给定摘要一致；actions 必须具体可执行——指明改哪个平台/哪张图种/哪个文案版本怎么调，不要空话；',
  '5) insights 每条是「一句话可执行结论」，dimension 取 image/copy/platform/audience/other 之一，',
  '   metric 取 engagement_rate/lead_rate/views/other 之一，positive 表示正向经验(true)还是待改进(false)。',
  'schema：',
  '{',
  '  "headline":"一句话结论，30字内",',
  '  "summary":"3-4句整体解读",',
  '  "best":[{"what":"做对了什么","why":"为什么，引用具体数字"}],',
  '  "findings":["客观发现，每条带具体数字"],',
  '  "actions":[{"action":"具体动作","target":"改哪个平台/图/文案","expected":"预期改善"}],',
  '  "insights":[{"dimension":"","metric":"","text":"一句话可执行结论","detail":"","magnitude":null,"platform":"*","positive":true}],',
  '  "compliance_note":"合规提示，无可写空字符串"',
  '}'
].join('\n');

function buildSummaryText(data, firstParty) {
  const t = data.totals_ext;
  const lines = [
    `周期：${data.from} ~ ${data.to}`,
    `外部合计：播放/浏览 ${t.views}，互动(赞+藏+评) ${t.engagement}（互动率 ${t.engagement_rate}%），留资/咨询 ${t.leads}（咨询率 ${t.lead_rate}%），成交 ${t.deals}（成交/留资 ${t.deal_rate}%）`,
    '分平台：' + data.by_platform.map(p => `${p.key}(浏览${p.views}/互动率${p.engagement_rate}%/咨询率${p.lead_rate}%)`).join('；'),
    data.by_image.some(g => g.key) ? ('分图种：' + data.by_image.filter(g => g.key).map(g => `${g.key}(浏览${g.views}/互动率${g.engagement_rate}%/咨询率${g.lead_rate}%)`).join('；')) : '分图种：无（未标注图种）',
    data.by_copy.some(g => g.key) ? ('分文案版本：' + data.by_copy.filter(g => g.key).map(g => `${g.key}(浏览${g.views}/互动率${g.engagement_rate}%/咨询率${g.lead_rate}%)`).join('；')) : '分文案版本：无（未标注版本）',
    '漏斗：' + data.funnel.map(f => `${f.label} ${f.count}`).join(' → '),
    '趋势：' + data.trend.map(g => `${g.date}(浏览${g.views}/咨询${g.leads}/成交${g.deals})`).join('；'),
    data.ranking.best_platform ? `最佳平台：${data.ranking.best_platform.name}（咨询率 ${data.ranking.best_platform.lead_rate}%）` : '最佳平台：样本不足',
    firstParty ? `第一方自有H5：PV ${firstParty.totals.pv}，留资 ${firstParty.totals.leads}（注意：外部播放与自有PV是不同触点，不可直接相加比较）` : '第一方自有H5：无数据'
  ];
  return lines.join('\n');
}

async function callReportLlm(env, summaryText) {
  const key = env.COPY_API_KEY || env.ARK_API_KEY;
  if (!key) return { ok: false, error: 'no_key' };
  let resp;
  try {
    resp = await fetchRace(env.COPY_ENDPOINT || ARK_CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: env.COPY_MODEL || REPORT_MODEL_DEFAULT,
        messages: [
          { role: 'system', content: REPORT_SYSTEM },
          { role: 'user', content: '数据摘要如下，请输出报告 JSON：\n' + summaryText }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        thinking: { type: 'disabled' }
      })
    }, REPORT_LLM_TIMEOUT_MS);
  } catch (e) {
    return { ok: false, error: e && e.message === 'upstream_timeout' ? 'llm_timeout' : 'llm_network' };
  }
  const text = await resp.text();
  if (!resp.ok) return { ok: false, error: 'llm_http_' + resp.status };
  let parsed; try { parsed = JSON.parse(text); } catch { return { ok: false, error: 'llm_bad_json' }; }
  const ct = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
  if (typeof ct !== 'string') return { ok: false, error: 'llm_empty' };
  const d = extractJson(ct);
  if (!d) return { ok: false, error: 'llm_unparseable' };
  return { ok: true, data: d };
}

// 清洗 LLM 报告为安全 schema
function sanitizeNarrative(d) {
  const arrStr = (v, cap) => Array.isArray(v) ? v.map(x => typeof x === 'string' ? x : (x && (x.text || x.action) ? String(x.text || x.action) : '')).filter(Boolean).map(s => s.slice(0, cap)).slice(0, 12) : [];
  return {
    headline: String(d.headline || '').slice(0, 60),
    summary: String(d.summary || '').slice(0, 400),
    best: Array.isArray(d.best) ? d.best.slice(0, 5).map(b => ({
      what: String(b && b.what || '').slice(0, 80), why: String(b && b.why || '').slice(0, 160)
    })) : [],
    findings: arrStr(d.findings, 160),
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 6).map(a => ({
      action: String(a && a.action || '').slice(0, 120),
      target: String(a && a.target || '').slice(0, 80),
      expected: String(a && a.expected || '').slice(0, 120)
    })) : [],
    compliance_note: String(d.compliance_note || '').slice(0, 200)
  };
}

const INSIGHT_DIMS = ['image', 'copy', 'platform', 'audience', 'other'];
const INSIGHT_METRICS = ['engagement_rate', 'lead_rate', 'views', 'other'];

async function handleReportPost(request, env, origin, shop) {
  const body = await readBody(request);
  const taskId = String(body.task_id || '').trim();
  if (!taskId) return J({ ok: false, error: { code: 'bad_task_id', message: '缺少 task_id' } }, 400, origin);
  const cacheKey = `extrep:${shop}:${taskId}`;
  const force = body.force === true;

  if (!force) {
    const cached = await env.MEMBERS.get(cacheKey, 'json');
    if (cached) return J({ ok: true, ...cached, cached: true }, 200, origin);
  }

  const rows = await listExtMetrics(env, shop, { task_id: taskId });
  if (!rows.length) return J({ ok: false, error: { code: 'no_data', message: '该任务还没有外部数据，先录入指标再看报告' } }, 400, origin);

  // 日期范围：缺省 = ext 最小/最大 date
  let from = body.from, to = body.to;
  const dates = rows.map(r => r.date).filter(Boolean).sort();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '')) from = dates[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to || '')) to = dates[dates.length - 1];
  const scoped = rows.filter(r => (!from || r.date >= from) && (!to || r.date <= to));
  if (!scoped.length) return J({ ok: false, error: { code: 'no_data', message: '该日期区间无外部数据' } }, 400, origin);

  const data = buildReportData(scoped, from, to);

  // 第一方 analyticsOverview（失败/无数据 → null，绝不阻断）
  // analyticsOverview 在该会员无任何第一方事件时仍返回 totals 全 0 的对象（恒 truthy），
  // 需自行归一：pv/cta/form/leads 全为 0 时视为「无第一方数据」置 null，
  // 避免 meta.sources 误标 first_party、summary 误打「PV 0，留资 0」。
  let firstParty = null;
  try { firstParty = await analyticsOverview(env, shop, from, to); } catch { firstParty = null; }
  if (firstParty && firstParty.totals) {
    const t = firstParty.totals;
    const allZero = [t.pv, t.cta, t.form, t.leads].every(v => (Number(v) || 0) === 0);
    if (allZero) firstParty = null;
  }
  data.first_party = firstParty;

  // combined：总触达 = 外部播放 + 第一方 PV（不同触点，仅并列合计，meta 注明口径）
  const extViews = data.totals_ext.views;
  const fpv = firstParty && firstParty.totals ? firstParty.totals.pv : 0;
  data.combined = {
    ext_views: extViews,
    first_party_pv: fpv,
    total_reach: extViews + fpv,
    note: '外部播放/浏览与自有 H5 PV 是不同触点，此处仅并列合计「总触达」，不可互相折算'
  };

  // LLM 出 narrative + insights（失败仍返回确定性 data）
  let narrative = { available: false, reason: 'llm_disabled' };
  const insightsOut = [];
  const summaryText = buildSummaryText(data, firstParty);
  const llm = await callReportLlm(env, summaryText);
  if (llm.ok) {
    narrative = Object.assign({ available: true }, sanitizeNarrative(llm.data));
    // insights 落库
    if (Array.isArray(llm.data.insights)) {
      for (const ins of llm.data.insights.slice(0, 8)) {
        if (!ins || !String(ins.text || '').trim()) continue;
        const r = await addInsight(env, shop, {
          task_id: taskId,
          platform: INSIGHT_PLATFORM_OK(ins.platform),
          dimension: INSIGHT_DIMS.includes(ins.dimension) ? ins.dimension : 'other',
          metric: INSIGHT_METRICS.includes(ins.metric) ? ins.metric : 'other',
          text: ins.text, detail: ins.detail,
          magnitude: (typeof ins.magnitude === 'number' && Number.isFinite(ins.magnitude)) ? ins.magnitude : null,
          positive: ins.positive !== false
        });
        if (r.ok) insightsOut.push(r.record);
      }
    }
  } else {
    narrative = { available: false, reason: String(llm.error || 'llm_failed') };
  }

  const report = {
    task_id: taskId, from, to, generated_at: Date.now(),
    data,
    narrative,
    insights: insightsOut,
    meta: {
      sources: ['external', ...(firstParty ? ['first_party'] : [])],
      tz: 'Asia/Shanghai',
      model: env.COPY_MODEL || REPORT_MODEL_DEFAULT,
      data_completeness: data.coverage,
      note: '外部平台数据为商家后台录入；自有 H5 为第一方精确统计；两者触点不同不混算'
    }
  };
  await env.MEMBERS.put(cacheKey, JSON.stringify(report));
  return J({ ok: true, ...report, cached: false }, 200, origin);
}

function INSIGHT_PLATFORM_OK(p) {
  const s = String(p || '*');
  return (s === '*' || EXT_PLATFORMS.includes(s)) ? s : '*';
}

async function handleReportGet(url, env, origin, shop) {
  const taskId = url.searchParams.get('task_id') || '';
  if (!taskId) return J({ ok: false, error: { code: 'bad_task_id', message: '缺少 task_id' } }, 400, origin);
  const cached = await env.MEMBERS.get(`extrep:${shop}:${taskId}`, 'json');
  if (!cached) return J({ ok: true, task_id: taskId, data: null, cached: false }, 200, origin);
  return J({ ok: true, ...cached, cached: true }, 200, origin);
}

/* =====================================================================
 * /agu/insights —— GET 取 / POST 手动补
 * ===================================================================*/
async function handleInsightsGet(url, env, origin, shop) {
  const taskId = url.searchParams.get('task_id') || '';
  const limit = Number(url.searchParams.get('limit')) || 20;
  const scope = url.searchParams.get('scope') === 'task' ? 'task' : 'all';
  const rows = await listInsights(env, shop, { task_id: taskId || undefined, limit: Math.min(100, limit), scope });
  return J({ ok: true, data: rows, meta: { generated_at: Date.now() } }, 200, origin);
}

async function handleInsightsPost(request, env, origin, shop) {
  const body = await readBody(request);
  if (!body || !String(body.text || '').trim()) {
    return J({ ok: false, error: { code: 'empty_text', message: '缺少 insight text' } }, 400, origin);
  }
  const r = await addInsight(env, shop, body);
  if (!r.ok) return J({ ok: false, error: { code: r.code || 'bad_insight' } }, 400, origin);
  return J({ ok: true, data: r.record }, 200, origin);
}

/* =====================================================================
 * /agu/oauth-interest、/agu/oauth-status —— 「即将开放」登记
 * ===================================================================*/
async function handleOauthInterest(request, env, origin, shop) {
  const body = await readBody(request);
  const platform = String(body.platform || '').trim().toLowerCase();
  if (!EXT_PLATFORMS.includes(platform)) {
    return J({ ok: false, error: { code: 'bad_platform', message: 'platform 非法' } }, 400, origin);
  }
  const list = await recordOauthInterest(env, shop, platform);
  return J({ ok: true, registered: list }, 200, origin);
}

async function handleOauthStatus(env, origin, shop) {
  const registered = await listOauthInterests(env, shop);
  const platforms = Object.values(PLATFORM_META).map(p => ({
    id: p.id, name: p.name,
    registered: registered.includes(p.id)
  }));
  return J({
    ok: true,
    data: {
      platforms,
      note: '各平台官方 OAuth 数据打通即将开放，点「可登记」后我们会第一时间通知你，无需现在授权'
    }
  }, 200, origin);
}

/* =====================================================================
 * 导出给 worker.js：高信号 insights + 上下文文本（绝不抛错、绝不阻塞）
 * ===================================================================*/
export async function getTopInsights(env, shop, limit = 6) {
  try {
    if (!env || !env.MEMBERS || !shop) return [];
    const ids = await env.MEMBERS.get('insindex:' + shop, 'json');
    if (!Array.isArray(ids) || !ids.length) return [];
    const head = ids.slice(0, 40);
    const recs = [];
    let i = 0;
    // 有界并发读实体（CONC=5），单条失败静默跳过
    await Promise.all(Array.from({ length: Math.min(CONC, head.length) }, async () => {
      while (i < head.length) {
        const idx = i++;
        let r = null;
        try { r = await env.MEMBERS.get('ins:' + shop + ':' + head[idx], 'json'); } catch { r = null; }
        if (r && r.shop_id === shop) recs.push(r);
      }
    }));
    // 按 |magnitude| 降序、同 magnitude 新者优先
    recs.sort((a, b) => (Math.abs(b.magnitude || 0) - Math.abs(a.magnitude || 0)) || (b.created_at - a.created_at));
    // image/copy/platform 各保留最强一条保证维度覆盖，其余按强度补
    const keep = [];
    for (const dim of ['image', 'copy', 'platform']) {
      const hit = recs.find(r => r.dimension === dim && !keep.some(k => k.dimension === dim));
      if (hit) keep.push(hit);
    }
    for (const r of recs) {
      if (keep.length >= limit) break;
      if (!keep.includes(r)) keep.push(r);
    }
    return keep.slice(0, limit);
  } catch (e) {
    return [];
  }
}

export async function buildInsightsContext(env, shop) {
  try {
    // 硬超时保护：3s 内拿不到就放弃，绝不阻塞生图/写文案主链路
    const task = getTopInsights(env, shop, 6).then(list => {
      if (!list || !list.length) return '';
      return list.map(r => {
        const dimLabel = { image: '图', copy: '文案', platform: '平台', audience: '人群', other: '经验' }[r.dimension] || '经验';
        const plat = r.platform && r.platform !== '*' ? `·${r.platform}` : '';
        const pos = r.positive ? '' : '（待改进）';
        return `·[${dimLabel}${plat}]${pos} ${r.text}`;
      }).join('\n');
    });
    const timeout = new Promise(res => setTimeout(() => res(''), 3000));
    return await Promise.race([task, timeout]);
  } catch (e) {
    return '';
  }
}

/* =====================================================================
 * 主路由（try/catch 兜底，异常返回带 CORS 的 500 JSON）
 * ===================================================================*/
async function handleAguInner(request, env, ctx, origin) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

  // 以下均需会员
  const { err, shop } = await requireMember(request, env);
  if (err) return err;

  if (path === '/agu/read-shot' && method === 'POST') return handleReadShot(request, env, origin, shop);
  if (path === '/agu/metrics' && method === 'POST') return handleMetricsPost(request, env, origin, shop);
  if (path === '/agu/metrics' && method === 'GET') return handleMetricsGet(url, env, origin, shop);
  if (path === '/agu/report' && method === 'POST') return handleReportPost(request, env, origin, shop);
  if (path === '/agu/report' && method === 'GET') return handleReportGet(url, env, origin, shop);
  if (path === '/agu/insights' && method === 'GET') return handleInsightsGet(url, env, origin, shop);
  if (path === '/agu/insights' && method === 'POST') return handleInsightsPost(request, env, origin, shop);
  if (path === '/agu/oauth-interest' && method === 'POST') return handleOauthInterest(request, env, origin, shop);
  if (path === '/agu/oauth-status' && method === 'GET') return handleOauthStatus(env, origin, shop);

  return null; // 非本模块路由
}

export async function handleAgu(request, env, ctx, origin) {
  try {
    return await handleAguInner(request, env, ctx, origin);
  } catch (err) {
    try { console.log('[agu error]', err && err.stack ? err.stack : String(err)); } catch { /* ignore */ }
    const message = (err && err.message) ? String(err.message).slice(0, 200) : 'agu_error';
    return J({ ok: false, error: { code: 'agu_error', message } }, 500, origin);
  }
}
