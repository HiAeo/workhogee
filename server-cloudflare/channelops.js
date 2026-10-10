/* =====================================================================
 * WorkHogee · 阿果「频道运营」路由（channelops.js）  —— P0
 * ---------------------------------------------------------------------
 * 定位：阿发把作品「发出去」，阿果管「发出去之后」。本模块只做
 *   第三方内容平台（首批：抖音 / 视频号 / 小红书）上【作品本身】的
 *   数据回收、作品仓库、频道仪表盘与规则化复盘；不碰发布动作。
 *
 * P0 合规数据来源（不爬虫、不存平台密码、不绕风控）：
 *   - official_export 官方创作者后台导出的 CSV/TSV（用户主动上传）
 *   - manual          手工登记 / 手工录入指标
 * P0 不做官方 OAuth 自动拉取（P3）、不做浏览器会话同步（P3）。
 *
 * 纯 Cloudflare KV，沿用 analytics-store 的「单 key 数组索引、读路径零 list」：
 *   chaccindex:{shop}            账号轻量索引数组
 *   chacc:{shop}:{aid}           账号实体
 *   chworkindex:{shop}           作品轻量索引数组（内嵌 latest 指标 + 时速，
 *                                列表 / 看板只读索引，零逐条 get）
 *   chwork:{shop}:{wid}          作品实体（含 snapshots[] 时序快照）
 *
 * 业务接口（会员 token，强制店隔离，shop = session.id）：
 *   POST/GET /channels/accounts
 *   POST     /channels/works                       手动登记作品（可带首条指标）
 *   GET      /channels/works                       作品列表（?platform=&aid=）
 *   GET      /channels/works/:wid                  作品详情（含快照序列）
 *   POST     /channels/works/:wid/metrics          追加一条指标快照
 *   POST     /channels/import                      CSV/TSV 批量导入
 *   GET      /channels/dashboard?range=30          频道仪表盘聚合
 *   GET      /channels/insights?range=30           规则化环比复盘
 * 不匹配返回 null，交由 worker.js 继续路由 / 404。
 * ===================================================================*/

import { randomId, bjParts } from './analytics-store.js';
import { getMemberSession } from './member-auth.js';

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
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}
function J(payload, status = 200, origin = '', extra = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=UTF-8', ...cors(origin), ...extra }
  });
}
async function readBody(request) {
  try { const t = await request.text(); return t ? JSON.parse(t) : {}; } catch { return {}; }
}
async function requireSession(request, env) {
  const s = await getMemberSession(env, request);
  return (s && s.status !== 'suspended') ? s : null;
}

// ---------- 常量 ----------
const PLATFORMS = {
  douyin: { name: '抖音' },
  wechat_channel: { name: '视频号' },
  xhs: { name: '小红书' },
  other: { name: '其他平台' }
};
const FIRST_PARTY = ['douyin', 'wechat_channel', 'xhs'];
function pfName(p) { return (PLATFORMS[p] && PLATFORMS[p].name) || '其他平台'; }
function normPlatform(p) {
  const s = String(p || '').trim().toLowerCase();
  if (s === 'douyin' || s === '抖音' || s === 'dy') return 'douyin';
  if (s === 'wechat_channel' || s === 'wechat' || s === '视频号' || s === 'shipinhao' || s === 'sph') return 'wechat_channel';
  if (s === 'xhs' || s === 'xiaohongshu' || s === '小红书' || s === 'red') return 'xhs';
  return FIRST_PARTY.includes(s) ? s : 'other';
}
const MAX_SNAPSHOTS = 1000;   // 单作品快照上限，防 KV 单 key 膨胀
const MAX_IMPORT_ROWS = 500;

// ---------- KV 基础 ----------
async function getJson(kv, key) { try { return (await kv.get(key, 'json')) || null; } catch { return null; } }
async function putJson(kv, key, val) { await kv.put(key, JSON.stringify(val)); }
async function getIndex(kv, key) { const a = await getJson(kv, key); return Array.isArray(a) ? a : []; }

// ---------- 数值 / 时间解析（容错，缺失返回 null，绝不编造） ----------
function parseNum(v) {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (!s || s === '-' || /暂无|未知|无数据|--/.test(s)) return null;
  const isPct = s.includes('%');
  s = s.replace(/[,，\s%]/g, '');
  let mult = 1;
  if (/亿/.test(s)) { mult = 1e8; s = s.replace(/亿/, ''); }
  else if (/万|w|W/.test(s)) { mult = 1e4; s = s.replace(/万|[wW]/g, ''); }
  s = s.replace(/[^\d.]/g, '');
  if (!s || isNaN(Number(s))) return null;
  let n = Number(s) * mult;
  if (isPct) n = n / 100;
  return Number.isFinite(n) ? n : null;
}
// 完播率：38 / "38%" -> 0.38；0.38 -> 0.38
function parseFinishRate(v) {
  const n = parseNum(v);
  if (n === null) return null;
  return n > 1 ? n / 100 : n;
}
// 平均播放时长，统一成秒： hh:mm:ss / mm:ss / "1分20秒" / "15秒" / 纯秒
function parseDuration(v) {
  if (v === null || v === undefined) return null;
  const s0 = String(v).trim();
  if (!s0 || /暂无|未知|--/.test(s0)) return null;
  const c = s0.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (c) {
    let sec = Number(c[1]) * 60 + Number(c[2]);
    if (c[3] !== undefined) sec = Number(c[1]) * 3600 + Number(c[2]) * 60 + Number(c[3]);
    return sec;
  }
  let sec = 0, ok = false;
  const h = s0.match(/(\d+(?:\.\d+)?)\s*小时/); if (h) { sec += Number(h[1]) * 3600; ok = true; }
  const min = s0.match(/(\d+(?:\.\d+)?)\s*分/); if (min) { sec += Number(min[1]) * 60; ok = true; }
  const ss = s0.match(/(\d+(?:\.\d+)?)\s*秒/); if (ss) { sec += Number(ss[1]); ok = true; }
  if (ok) return Math.round(sec);
  const n = parseNum(s0.replace(/秒|s|S/g, ''));
  return n !== null && n < 86400 ? Math.round(n) : null;
}
function parseDate(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || /暂无|未知|--/.test(s)) return null;
  if (/^\d{10,13}$/.test(s)) { const n = Number(s); return s.length === 10 ? n * 1000 : n; }
  let norm = s.replace(/年/g, '-').replace(/月/g, '-').replace(/日/g, ' ').replace(/\//g, '-');
  let t = Date.parse(norm.replace(/\s+/g, ' '));
  if (!Number.isFinite(t)) t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
// 任意时间输入（10/13位时间戳、ISO、中文日期、数字）统一成毫秒；非法用兜底
function toTs(v, fallback) {
  const t = parseDate(v);
  if (t) return t;
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  return fallback || Date.now();
}
function clampStr(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }
function normUrl(u) {
  let s = String(u || '').trim().replace(/#.*$/, '');
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
  return s;
}

// 从任意输入提取指标白名单
function toMetrics(b = {}) {
  return {
    play: parseNum(b.play),
    like: parseNum(b.like),
    comment: parseNum(b.comment),
    share: parseNum(b.share),
    favorite: parseNum(b.favorite),
    finish_rate: parseFinishRate(b.finish_rate),
    avg_play_sec: parseDuration(b.avg_play_sec),
    followers: parseNum(b.followers),
    followers_gained: parseNum(b.followers_gained)
  };
}
function emptyMetrics() {
  return { play: null, like: null, comment: null, share: null, favorite: null, finish_rate: null, avg_play_sec: null, followers: null, followers_gained: null };
}

// ---------- 账号 ----------
async function listAccounts(env, shop) {
  return (await getIndex(env.MEMBERS, `chaccindex:${shop}`))
    .slice()
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
}
async function getAccount(env, shop, aid) { return getJson(env.MEMBERS, `chacc:${shop}:${aid}`); }
async function upsertAccountIndex(env, shop, acc) {
  const key = `chaccindex:${shop}`;
  const list = await getIndex(env.MEMBERS, key);
  const item = { aid: acc.aid, platform: acc.platform, name: acc.name, followers: acc.followers ?? null, works_count: acc.works_count ?? 0, updated_at: acc.updated_at };
  const i = list.findIndex(x => x && x.aid === acc.aid);
  if (i >= 0) list[i] = item; else list.push(item);
  await putJson(env.MEMBERS, key, list);
}
async function createAccount(env, shop, body = {}) {
  const platform = normPlatform(body.platform);
  const name = clampStr(body.name, 60) || (pfName(platform) + '默认账号');
  const acc = {
    aid: randomId('cha'),
    shop, platform, name,
    note: clampStr(body.note, 200),
    followers: parseNum(body.followers),
    source_default: 'manual',
    created_at: Date.now(), updated_at: Date.now()
  };
  await putJson(env.MEMBERS, `chacc:${shop}:${acc.aid}`, acc);
  await upsertAccountIndex(env, shop, acc);
  return acc;
}
// 找到 / 自动建某平台的默认账号（P0 不强制先建账号）
async function ensureAccount(env, shop, platform, aid) {
  if (aid) { const a = await getAccount(env, shop, aid); if (a) return a; }
  const list = await listAccounts(env, shop);
  const hit = list.find(x => x.platform === platform) || list.find(x => x.platform === 'other');
  if (hit) { const full = await getAccount(env, shop, hit.aid); if (full) return full; }
  return await createAccount(env, shop, { platform, name: pfName(platform) + '默认账号' });
}
async function refreshAccountCounts(env, shop) {
  const accs = await listAccounts(env, shop);
  const works = await getIndex(env.MEMBERS, `chworkindex:${shop}`);
  for (const a of accs) {
    a.works_count = works.filter(w => w.aid === a.aid).length;
    const full = await getAccount(env, shop, a.aid);
    if (full) { full.works_count = a.works_count; full.updated_at = Date.now(); await putJson(env.MEMBERS, `chacc:${shop}:${a.aid}`, full); }
    await upsertAccountIndex(env, shop, full || a);
  }
}

// ---------- 作品 + 快照 ----------
function workKey(platform, url, title, publishedAt) {
  if (url) return platform + '|u|' + normUrl(url);
  return platform + '|t|' + clampStr(title, 80) + '|' + (publishedAt || 0);
}
function sortSnapshots(arr) {
  return (arr || []).slice().sort((a, b) => (a.snapshot_at || 0) - (b.snapshot_at || 0));
}
function latestSnapshot(w) {
  const s = sortSnapshots(w.snapshots);
  return s.length ? s[s.length - 1] : null;
}
// 时速：优先最近两快照增量/小时；否则发布以来平均
function velocityOf(w, last) {
  const s = sortSnapshots(w.snapshots);
  if (last && s.length >= 2) {
    const prev = s[s.length - 2];
    const dh = (last.snapshot_at - prev.snapshot_at) / 36e5;
    if (dh > 0 && last.play != null && prev.play != null) return { per_hour: Math.max(0, (last.play - prev.play) / dh), kind: 'recent', window_hours: Math.round(dh * 10) / 10 };
  }
  if (last && last.play != null && w.published_at) {
    const age = (last.snapshot_at - w.published_at) / 36e5;
    if (age > 0) return { per_hour: last.play / age, kind: 'avg', window_hours: Math.round(age * 10) / 10 };
  }
  return { per_hour: null, kind: 'none', window_hours: null };
}
function buildIndexItem(w) {
  const last = latestSnapshot(w) || {};
  const vel = velocityOf(w, latestSnapshot(w));
  return {
    wid: w.wid, aid: w.aid, platform: w.platform,
    title: w.title, work_url: w.work_url || '', cover: w.cover || '',
    published_at: w.published_at || null, duration_sec: w.duration_sec || null,
    topic_tags: w.topic_tags || [], status: w.status || 'tracking',
    updated_at: w.updated_at,
    latest: {
      snapshot_at: last.snapshot_at || null,
      source: last.source || null,
      play: last.play ?? null, like: last.like ?? null, comment: last.comment ?? null,
      share: last.share ?? null, favorite: last.favorite ?? null,
      finish_rate: last.finish_rate ?? null, avg_play_sec: last.avg_play_sec ?? null,
      followers: last.followers ?? null, followers_gained: last.followers_gained ?? null
    },
    velocity: vel,
    age_hours: w.published_at ? Math.max(0, Math.round((Date.now() - w.published_at) / 36e5)) : null
  };
}
async function findWidByKey(env, shop, key) {
  const list = await getIndex(env.MEMBERS, `chworkindex:${shop}`);
  const hit = list.find(x => x && x._key === key);
  return hit ? hit.wid : null;
}
async function upsertWorkIndex(env, shop, w) {
  const key = `chworkindex:${shop}`;
  const list = await getIndex(env.MEMBERS, key);
  const item = buildIndexItem(w); item._key = w._key;
  const i = list.findIndex(x => x && x.wid === w.wid);
  if (i >= 0) list[i] = item; else list.push(item);
  await putJson(env.MEMBERS, key, list);
}
async function getWork(env, shop, wid) { return getJson(env.MEMBERS, `chwork:${shop}:${wid}`); }
async function listWorkIndex(env, shop) { return getIndex(env.MEMBERS, `chworkindex:${shop}`); }

// 新建或更新作品；snapshot 可选（首条指标）
async function saveWork(env, shop, input = {}, snapshot = null) {
  const platform = normPlatform(input.platform);
  const title = clampStr(input.title, 120);
  const url = clampStr(input.work_url || input.url, 300);
  if (!title && !url) return { ok: false, code: 'need_title_or_url', message: '作品标题或链接至少填一项' };
  const publishedAt = input.published_at || (input.published_at === 0 ? 0 : parseDate(input.published_at_raw)) || null;
  const key = workKey(platform, url, title, publishedAt);
  const acc = await ensureAccount(env, shop, platform, input.aid);

  let wid = input.wid || await findWidByKey(env, shop, key);
  let w = wid ? await getWork(env, shop, wid) : null;
  const now = Date.now();
  if (!w) {
    w = {
      wid: randomId('chw'), shop, aid: acc.aid, platform,
      title: title || '未命名作品', work_url: url, cover: clampStr(input.cover, 300),
      published_at: publishedAt, duration_sec: input.duration_sec || parseDuration(input.duration_raw) || null,
      topic_tags: Array.isArray(input.topic_tags) ? input.topic_tags.map(x => clampStr(x, 20)).slice(0, 12) : [],
      line_id: clampStr(input.line_id, 60), status: 'tracking', source: input.source || 'manual',
      created_at: now, updated_at: now, snapshots: []
    };
  } else {
    // 元信息合并（仅在原值缺失或新值非空时补）
    if (title) w.title = title;
    if (url) w.work_url = url;
    if (input.cover) w.cover = clampStr(input.cover, 300);
    if (!w.published_at && publishedAt) w.published_at = publishedAt;
    if (!w.duration_sec && (input.duration_sec || input.duration_raw)) w.duration_sec = input.duration_sec || parseDuration(input.duration_raw);
    if (Array.isArray(input.topic_tags) && input.topic_tags.length) {
      const set = new Set([...(w.topic_tags || []), ...input.topic_tags.map(x => clampStr(x, 20))]);
      w.topic_tags = Array.from(set).slice(0, 12);
    }
    if (input.line_id) w.line_id = clampStr(input.line_id, 60);
    w.updated_at = now;
  }
  w._key = key;
  if (snapshot) addSnapshot(w, snapshot);
  await putJson(env.MEMBERS, `chwork:${shop}:${w.wid}`, w);
  await upsertWorkIndex(env, shop, w);
  await refreshAccountCounts(env, shop);
  return { ok: true, work: w, account: acc };
}
function addSnapshot(w, s) {
  const m = { ...emptyMetrics(), ...s };
  const when = toTs(s.snapshot_at);
  const snap = {
    snapshot_at: when,
    source: ['official_api', 'official_export', 'browser_session', 'manual'].includes(s.source) ? s.source : 'manual',
    collected_at: toTs(s.collected_at, when),
    ...m
  };
  const arr = sortSnapshots(w.snapshots);
  const i = arr.findIndex(x => x.snapshot_at === snap.snapshot_at);
  if (i >= 0) arr[i] = { ...arr[i], ...snap }; else arr.push(snap);
  w.snapshots = sortSnapshots(arr).slice(-MAX_SNAPSHOTS);
}

/* =====================================================================
 * CSV / TSV 导入
 * ===================================================================*/
// 有序列名匹配规则：易冲突 / 特异字段放前面；命中即占用该列
const COLUMN_RULES = [
  ['avg_play_sec', ['平均播放时长', '平均播放', '播放时长', '观看时长', 'avgplay', 'averageview', 'averageduration']],
  ['finish_rate', ['完播率', '完播', 'finishrate', 'completionrate', 'completion']],
  ['followers_gained', ['涨粉', '新增粉丝', '粉丝增量', '粉丝增长', 'newfollowers', 'fansgrowth']],
  ['followers', ['粉丝数', '粉丝总量', '总粉丝', '粉丝量', 'followers', 'totalfans']],
  ['snapshot_at', ['采集时间', '统计时间', '数据时间', '更新时间', '抓取时间', '记录时间', 'snapshot']],
  ['published_at', ['发布时间', '发表时间', '发布日期', 'publish', 'published']],
  ['play', ['播放量', '播放数', '播放次数', '累计播放', '总播放', 'views', 'playcount', 'videoviews']],
  ['like', ['点赞数', '点赞量', '点赞', '赞数', 'likes', 'likecount']],
  ['comment', ['评论数', '评论量', '评论', 'comments', 'commentcount']],
  ['share', ['分享数', '转发数', '分享量', '分享', '转发', 'shares', 'sharecount']],
  ['favorite', ['收藏数', '收藏量', '收藏', 'favorites', 'collects', 'collectcount']],
  ['url', ['作品链接', '视频链接', '作品地址', '链接', 'url', 'link']],
  ['topic_tags', ['题材标签', '话题标签', '内容标签', '话题', '标签', 'keywords', 'tags', 'hashtags']],
  ['title', ['作品标题', '视频标题', '作品名称', '视频名称', '标题', 'title', 'subject']]
];
function normHeader(h) { return String(h || '').toLowerCase().replace(/[\s_\-\/\\:：()（）\[\]【】.*]/g, ''); }
function mapColumns(headers) {
  const map = {}; const used = new Set();
  headers.forEach((h, idx) => {
    const nh = normHeader(h);
    if (!nh || used.has(idx)) return;
    for (const [field, keys] of COLUMN_RULES) {
      if (map[field] !== undefined) continue;
      if (keys.some(k => nh.includes(normHeader(k)))) { map[field] = idx; used.add(idx); break; }
    }
  });
  return map;
}
// 解析一行 CSV，支持双引号包裹、引号内逗号
function splitCsvLine(line, sep) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(x => x.trim());
}
function parseDelimited(text) {
  const clean = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = clean.split('\n').map(l => l.trimEnd()).filter(l => l.trim().length);
  if (!lines.length) return { headers: [], rows: [], sep: ',' };
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const headers = splitCsvLine(lines[0], sep).map(h => h.replace(/^﻿/, ''));
  const rows = lines.slice(1).map(l => splitCsvLine(l, sep));
  return { headers, rows, sep };
}
async function importDelimited(env, shop, body) {
  const platform = normPlatform(body.platform);
  const text = String(body.text || '');
  if (!text.trim()) return { ok: false, code: 'empty', message: '没有可导入的内容，请粘贴 CSV/TSV 文本或上传导出文件' };
  const { headers, rows } = parseDelimited(text);
  const col = mapColumns(headers);
  const errors = [];
  let works = 0, snapshots = 0;
  const workIds = [];
  const total = Math.min(rows.length, MAX_IMPORT_ROWS);
  for (let r = 0; r < total; r++) {
    const cells = rows[r];
    const get = f => (col[f] !== undefined ? cells[col[f]] : '');
    const title = clampStr(get('title'), 120);
    const url = clampStr(get('url'), 300);
    if (!title && !url) { errors.push(`第 ${r + 2} 行：缺少标题/链接，已跳过`); continue; }
    const topicTags = String(get('topic_tags') || '').split(/[,，、;；/|#\s]+/).map(s => s.replace(/^#+/, '').trim()).filter(Boolean).slice(0, 12);
    const publishedAt = parseDate(get('published_at'));
    let snapshotAt = parseDate(get('snapshot_at'));
    if (!snapshotAt) snapshotAt = publishedAt || Date.now();
    const m = {
      play: parseNum(get('play')), like: parseNum(get('like')), comment: parseNum(get('comment')),
      share: parseNum(get('share')), favorite: parseNum(get('favorite')),
      finish_rate: parseFinishRate(get('finish_rate')), avg_play_sec: parseDuration(get('avg_play_sec')),
      followers: parseNum(get('followers')), followers_gained: parseNum(get('followers_gained'))
    };
    const hasAny = Object.values(m).some(v => v !== null);
    const res = await saveWork(env, shop, {
      platform, title, work_url: url, published_at: publishedAt,
      topic_tags: topicTags, aid: body.aid, source: 'official_export'
    }, hasAny ? { snapshot_at: snapshotAt, source: 'official_export', ...m } : null);
    if (!res.ok) { errors.push(`第 ${r + 2} 行：${res.message}`); continue; }
    if (hasAny) snapshots++;
    if (!workIds.includes(res.work.wid)) { workIds.push(res.work.wid); works++; }
  }
  return {
    ok: true, platform, imported_works: works, upserted_snapshots: snapshots,
    total_rows: rows.length, parsed_rows: total, skipped: rows.length - total,
    matched_columns: Object.keys(col), errors: errors.slice(0, 50), work_ids: workIds
  };
}

/* =====================================================================
 * 仪表盘聚合（只读作品索引，零逐条 get）
 * ===================================================================*/
function num(x) { return Number(x) || 0; }
function median(arr) {
  const a = arr.filter(v => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
function mean(arr) {
  const a = arr.filter(v => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
}
function inRange(item, fromTs) {
  // 有发布时间按区间过滤；无发布时间的手工作品也纳入（避免录入即消失）
  return !item.published_at || item.published_at >= fromTs;
}
async function buildDashboard(env, shop, rangeDays) {
  const range = Math.min(Math.max(Number(rangeDays) || 30, 1), 365);
  const fromTs = Date.now() - range * 864e5;
  const all = (await listWorkIndex(env, shop)).map(x => { const c = { ...x }; delete c._key; return c; });
  const items = all.filter(x => inRange(x, fromTs));
  const L = x => x.latest || {};
  const sum = f => items.reduce((s, x) => s + num(L(x)[f]), 0);

  // 账号总览
  const accounts = await listAccounts(env, shop);
  const accRows = accounts.map(a => {
    const ws = items.filter(x => x.aid === a.aid);
    return {
      aid: a.aid, platform: a.platform, platform_name: pfName(a.platform), name: a.name,
      works_count: ws.length,
      followers: ws.length ? Math.max(...ws.map(x => num(L(x).followers)).filter(Boolean), a.followers || 0) : (a.followers || 0),
      followers_gained: ws.reduce((s, x) => s + num(L(x).followers_gained), 0),
      plays: ws.reduce((s, x) => s + num(L(x).play), 0)
    };
  }).sort((a, b) => b.plays - a.plays);

  const totals = {
    works: items.length,
    plays: sum('play'), likes: sum('like'), comments: sum('comment'),
    shares: sum('share'), favorites: sum('favorite'),
    followers_gained: sum('followers_gained'),
    engagement: sum('like') + sum('comment') + sum('share') + sum('favorite'),
    avg_finish_rate: mean(items.map(x => L(x).finish_rate))
  };

  // 最新追踪（按发布时间倒序，无时间排后）
  const latest = items.slice().sort((a, b) => (b.published_at || 0) - (a.published_at || 0)).slice(0, 8);
  // 爆款榜
  const top = items.slice().sort((a, b) => num(L(b).play) - num(L(a).play)).slice(0, 10);
  // 上升最快：优先「近期时速」（反映现在是否还在涨），无近期快照再用发布以来平均时速兜底
  const withVel = items.filter(x => x.velocity && x.velocity.per_hour != null);
  const byVel = (a, b) => num(b.velocity.per_hour) - num(a.velocity.per_hour);
  const risingRecent = withVel.filter(x => x.velocity.kind === 'recent').sort(byVel);
  const risingAvg = withVel.filter(x => x.velocity.kind !== 'recent').sort(byVel);
  const rising = [...risingRecent, ...risingAvg].slice(0, 5);

  // 近 14 天发布表现（按北京发布日期聚合当日作品最新播放/互动）
  const dayMap = {};
  items.forEach(x => {
    if (!x.published_at) return;
    const d = bjParts(x.published_at).date;
    if (!dayMap[d]) dayMap[d] = { date: d, works: 0, plays: 0, engagement: 0 };
    dayMap[d].works++; dayMap[d].plays += num(L(x).play);
    dayMap[d].engagement += num(L(x).like) + num(L(x).comment) + num(L(x).share) + num(L(x).favorite);
  });
  const trend_14d = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);

  return {
    meta: { range_days: range, tz: 'Asia/Shanghai', generated_at: Date.now(), source: 'manual+official_export' },
    accounts: accRows, totals, latest, top, rising, trend_14d
  };
}

/* =====================================================================
 * 规则化环比复盘（确定性、可解释、带样本量；样本不足不下因果结论）
 * ===================================================================*/
async function buildInsights(env, shop, rangeDays) {
  const range = Math.min(Math.max(Number(rangeDays) || 30, 1), 365);
  const fromTs = Date.now() - range * 864e5;
  const all = await listWorkIndex(env, shop);
  const items = all.filter(x => inRange(x, fromTs));
  const L = x => x.latest || {};
  const n = items.length;
  const findings = [];
  const suggestions = [];

  if (n < 5) {
    return {
      meta: { range_days: range, sample_size: n, generated_at: Date.now(), confident: false },
      headline: '样本还太少，先把作品数据攒起来',
      findings: [{ level: 'info', title: '至少需要 5 条作品才能开始找规律', detail: `当前区间内只有 ${n} 条作品。建议把官方创作者后台近 30–90 天的作品数据导出后，用「批量导入」一次性录入；达到 20 条以上后，完播线、分享收藏规律、题材与时段结论才比较可靠。` }],
      suggestions: ['导入更多历史作品（CSV/TSV），样本越多结论越准。']
    };
  }

  const byPlay = items.slice().sort((a, b) => num(L(b).play) - num(L(a).play));
  const topCut = Math.max(1, Math.ceil(n * 0.25));
  const hi = byPlay.slice(0, topCut);
  const lo = byPlay.slice(topCut);
  const pct = v => (v == null ? '—' : (v * 100).toFixed(0) + '%');

  // 规律 1：完播率
  const finishItems = items.filter(x => L(x).finish_rate != null);
  if (finishItems.length >= 5) {
    const line = median(hi.map(x => L(x).finish_rate));
    const medAll = median(finishItems.map(x => L(x).finish_rate));
    const below = finishItems.filter(x => L(x).finish_rate < line).length;
    findings.push({
      level: line >= 0.4 ? 'warn' : 'good',
      title: `你的高播放作品，完播率中位数约 ${pct(line)}`,
      detail: `区间内 ${finishItems.length} 条作品有完播率数据，整体中位数 ${pct(medAll)}；播放排名前 25% 的作品完播率中位数为 ${pct(line)}，${below} 条低于这条「爆款完播线」。行业经验里完播率长期低于 40% 很难起量，可把它当作前 3 秒钩子是否有效的体检线。`,
      evidence: { sample: finishItems.length, top_quartile_finish_median: line, overall_finish_median: medAll }
    });
    suggestions.push(`把前 3 秒钩子作为下一批视频的重点，目标把完播率拉到 ${pct(line)} 以上再追量。`);
  } else {
    findings.push({ level: 'info', title: '完播率数据不足', detail: `只有 ${finishItems.length} 条作品带完播率，暂不判断完播线；导入含「完播率」列的官方导出后即可分析。` });
  }

  // 规律 2：分享 / 收藏 与破圈
  const ratio = x => { const p = num(L(x).play); return p ? (num(L(x).share) + num(L(x).favorite)) / p : null; };
  const rHi = mean(hi.map(ratio)); const rLo = mean(lo.map(ratio));
  if (rHi != null && rLo != null && rLo > 0) {
    const mult = rHi / rLo;
    findings.push({
      level: mult >= 1.3 ? 'good' : 'info',
      title: mult >= 1.3 ? `高播放作品的「分享+收藏/播放」是其余作品的 ${mult.toFixed(1)} 倍` : '分享/收藏密度与播放的相关性暂不明显',
      detail: '从 10 万到百万级的差距，往往不在点赞，而在「值得转发」和「值得收藏」。' + (mult >= 1.3 ? `你播放最好的那批作品，每播放带来的分享+收藏明显更高（${(rHi * 100).toFixed(2)}% vs ${(rLo * 100).toFixed(2)}%），说明转发/收藏是你当前破圈的关键杠杆。` : '当前样本下两者差异不大，可在内容里主动设计「可收藏的干货点」和「可转发给朋友的理由」再观察。'),
      evidence: { top_share_fav_per_play: rHi, rest_share_fav_per_play: rLo, multiplier: mult }
    });
    suggestions.push('每条视频至少设计一个「收藏点」（清单/参数/步骤）和一个「分享点」（共鸣/有用/身份表达）。');
  }

  // 规律 3：题材标签（至少 2 条同标签才排名）
  const tagMap = {};
  items.forEach(x => (x.topic_tags || []).forEach(t => {
    if (!t) return;
    if (!tagMap[t]) tagMap[t] = { tag: t, n: 0, plays: 0 };
    tagMap[t].n++; tagMap[t].plays += num(L(x).play);
  }));
  const tagRows = Object.values(tagMap).filter(t => t.n >= 2).map(t => ({ ...t, avg_play: t.plays / t.n })).sort((a, b) => b.avg_play - a.avg_play);
  if (tagRows.length) {
    const best = tagRows[0];
    findings.push({ level: 'good', title: `当前数据最好的题材是「${best.tag}」（均播 ${Math.round(best.avg_play).toLocaleString()}）`, detail: tagRows.slice(0, 3).map(t => `${t.tag}：${t.n} 条，均播 ${Math.round(t.avg_play).toLocaleString()}`).join('；') + '。可把高效题材做成系列，弱题材减少投入。', evidence: { tags: tagRows.slice(0, 5) } });
    suggestions.push(`把「${best.tag}」做成固定系列，用 3–5 条不同切法验证可复制性。`);
  } else {
    findings.push({ level: 'info', title: '还没有可对比的题材标签', detail: '登记作品时补充题材标签（或后续版本从标题自动归类），即可得到「哪类内容更容易爆」的排名。' });
  }

  // 规律 4：发布时段
  const slot = h => (h < 6 ? '深夜(0-6)' : h < 11 ? '上午(6-11)' : h < 14 ? '中午(11-14)' : h < 18 ? '下午(14-18)' : '晚间(18-24)');
  const slotMap = {};
  items.filter(x => x.published_at).forEach(x => {
    const s = slot(new Date(x.published_at + 8 * 36e5).getUTCHours());
    if (!slotMap[s]) slotMap[s] = { slot: s, n: 0, plays: 0 };
    slotMap[s].n++; slotMap[s].plays += num(L(x).play);
  });
  const slotRows = Object.values(slotMap).filter(s => s.n >= 2).map(s => ({ ...s, avg_play: s.plays / s.n })).sort((a, b) => b.avg_play - a.avg_play);
  if (slotRows.length) {
    findings.push({ level: 'info', title: `发布时段上，「${slotRows[0].slot}」平均播放更高`, detail: slotRows.map(s => `${s.slot}：${s.n} 条，均播 ${Math.round(s.avg_play).toLocaleString()}`).join('；') + '。样本偏小时段结论仅供参考，建议固定时段连发观察。', evidence: { slots: slotRows } });
  }

  if (!suggestions.length) suggestions.push('继续按周导入数据，阿果会随样本增加自动校准这些规律。');
  return {
    meta: { range_days: range, sample_size: n, generated_at: Date.now(), confident: n >= 20 },
    headline: n >= 20 ? `基于近 ${range} 天 ${n} 条作品的复盘` : `近 ${range} 天 ${n} 条作品（样本 < 20，结论为初步趋势，勿当定论）`,
    findings, suggestions
  };
}

/* =====================================================================
 * 路由
 * ===================================================================*/
export async function handleChannelOps(request, env, ctx, origin) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (!path.startsWith('/channels')) return null;
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (!env.MEMBERS) return J({ ok: false, error: { code: 'store_unavailable', message: '数据存储未配置' } }, 503, origin);

  const session = await requireSession(request, env);
  if (!session) return J({ ok: false, error: { code: 'unauthorized', message: '请先登录' } }, 401, origin);
  const shop = session.id;
  const body = method === 'GET' ? {} : await readBody(request);
  let m;

  // ----- 账号 -----
  if (path === '/channels/accounts' && method === 'GET') {
    const accs = await listAccounts(env, shop);
    await refreshAccountCounts(env, shop);
    return J({ ok: true, data: await listAccounts(env, shop) }, 200, origin);
  }
  if (path === '/channels/accounts' && method === 'POST') {
    const acc = await createAccount(env, shop, body);
    return J({ ok: true, data: acc }, 200, origin);
  }

  // ----- 导入（在作品通用路由之前匹配） -----
  if (path === '/channels/import' && method === 'POST') {
    const res = await importDelimited(env, shop, body);
    if (!res.ok) return J({ ok: false, error: { code: res.code, message: res.message } }, 400, origin);
    return J({ ok: true, data: res }, 200, origin);
  }

  // ----- 仪表盘 / 复盘 -----
  if (path === '/channels/dashboard' && method === 'GET') {
    return J({ ok: true, data: await buildDashboard(env, shop, url.searchParams.get('range')) }, 200, origin);
  }
  if (path === '/channels/insights' && method === 'GET') {
    return J({ ok: true, data: await buildInsights(env, shop, url.searchParams.get('range')) }, 200, origin);
  }

  // ----- 作品列表 -----
  if (path === '/channels/works' && method === 'GET') {
    let items = (await listWorkIndex(env, shop)).map(x => { const c = { ...x }; delete c._key; return c; });
    const pf = url.searchParams.get('platform');
    const aid = url.searchParams.get('aid');
    if (pf) items = items.filter(x => x.platform === normPlatform(pf));
    if (aid) items = items.filter(x => x.aid === aid);
    items = items.sort((a, b) => (b.published_at || b.updated_at || 0) - (a.published_at || a.updated_at || 0));
    return J({ ok: true, data: items }, 200, origin);
  }

  // ----- 作品登记 -----
  if (path === '/channels/works' && method === 'POST') {
    const snap = body.metrics ? { snapshot_at: toTs(body.metrics.snapshot_at), source: body.source || 'manual', ...toMetrics(body.metrics) } : null;
    const res = await saveWork(env, shop, { ...body, source: body.source || 'manual' }, snap);
    if (!res.ok) return J({ ok: false, error: { code: res.code, message: res.message } }, 400, origin);
    return J({ ok: true, data: buildIndexItem(res.work) }, 200, origin);
  }

  // ----- 作品详情 -----
  if ((m = path.match(/^\/channels\/works\/([A-Za-z0-9_]+)$/)) && method === 'GET') {
    const w = await getWork(env, shop, m[1]);
    if (!w || w.shop !== shop) return J({ ok: false, error: { code: 'not_found', message: '作品不存在' } }, 404, origin);
    const acc = await getAccount(env, shop, w.aid);
    return J({ ok: true, data: { ...w, account: acc ? { aid: acc.aid, name: acc.name, platform: acc.platform } : null } }, 200, origin);
  }

  // ----- 追加指标快照 -----
  if ((m = path.match(/^\/channels\/works\/([A-Za-z0-9_]+)\/metrics$/)) && method === 'POST') {
    const w = await getWork(env, shop, m[1]);
    if (!w || w.shop !== shop) return J({ ok: false, error: { code: 'not_found', message: '作品不存在' } }, 404, origin);
    const snap = { snapshot_at: toTs(body.snapshot_at_raw || body.snapshot_at), source: 'manual', ...toMetrics(body) };
    addSnapshot(w, snap); w.updated_at = Date.now();
    await putJson(env.MEMBERS, `chwork:${shop}:${w.wid}`, w);
    await upsertWorkIndex(env, shop, w);
    return J({ ok: true, data: buildIndexItem(w) }, 200, origin);
  }

  return null; // 非本模块路由
}
