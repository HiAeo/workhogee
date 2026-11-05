// WorkHogee 在线客服 - Pages Functions 共享库
// 下划线前缀文件不会被 Pages 当作路由端点，仅用于被同目录模块 import。
// 运行环境：Cloudflare Pages Functions（Web 标准 API + D1 绑定 env.DB），无需 Node 内置模块。

// 与前端 index.html 内联脚本 MAXLEN 保持一致。
export var MAX_TEXT = 2000;

// 前端生成的 sid 形如 UUID，或兜底 's-xxxx'；cid 形如 'm-xxxx' / beacon 重发同一 cid。
// 只允许安全字符，配合 D1 参数绑定，杜绝注入与异常输入。
var SID_RE = /^[A-Za-z0-9._-]{4,80}$/;
var CID_RE = /^[A-Za-z0-9._-]{4,90}$/;
var EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// 统一 JSON 响应：前端只认 content-type 含 application/json 且 body.ok === true，
// 因此所有成功/失败分支都必须经这里返回，绝不能让 Pages/Worker 的默认 HTML 错误页泄漏到该路径。
export function json(data, init) {
  var status = (init && init.status) || 200;
  var headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  };
  return new Response(JSON.stringify(data), { status: status, headers: headers });
}

export function badRequest(msg) {
  return json({ ok: false, error: msg }, { status: 400 });
}

// 取真实连接 IP：生产上 Cloudflare 注入 CF-Connecting-IP；本地 dev 回退 x-forwarded-for。
export function clientIp(request) {
  var cf = request.headers.get('CF-Connecting-IP');
  if (cf) return cf.trim();
  var xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return '0.0.0.0';
}

function cleanString(v, max) {
  if (typeof v !== 'string') return '';
  var s = v.trim();
  return s.length > max ? s.slice(0, max) : s;
}

// 校验并归一化 POST body。返回 { error } 或 { value }。
export function validateBody(b) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return { error: 'invalid body' };

  var sid = cleanString(b.sid, 80);
  var cid = cleanString(b.cid, 90);
  var text = cleanString(b.text, MAX_TEXT);

  if (!SID_RE.test(sid)) return { error: 'invalid sid' };
  if (!CID_RE.test(cid)) return { error: 'invalid cid' };
  if (!text) return { error: 'empty text' };

  var email = cleanString(b.email, 200);
  if (email && !EMAIL_RE.test(email)) email = ''; // 邮箱不合法不致命，降级为空而非拒收

  var path = cleanString(b.path, 255);

  var ts = Number(b.ts);
  if (!isFinite(ts) || ts <= 0) ts = Date.now(); // 客户端时间异常时用服务端时间兜底

  var value = {
    sid: sid,
    cid: cid,
    text: text,
    email: email,
    path: path,
    ts: ts,
    beacon: b.beacon ? 1 : 0
  };
  return { value: value };
}

// 校验 GET history 的 sid，返回归一化 sid 或 null。
export function validateSid(raw) {
  var sid = cleanString(raw, 80);
  return SID_RE.test(sid) ? sid : null;
}

// 基于 D1 的滑窗限流：同一 IP 在 windowMs 内落库消息数达到 maxHits 即拦截。
// 无 KV/外部依赖；D1 计数有毫秒级延迟，对官网客服量级足够。
export async function hitRateLimit(db, ip, windowMs, maxHits) {
  var since = Date.now() - windowMs;
  var row = await db
    .prepare('SELECT COUNT(1) AS n FROM support_messages WHERE ip = ? AND created_at >= ?')
    .bind(ip, since)
    .first();
  return !!row && row.n >= maxHits;
}

// 幂等 upsert 会话：首条建会话，后续只刷新 last_at；邮箱/落地页仅在新值非空时覆盖。
export async function upsertSession(db, v, ip, ua, now) {
  await db
    .prepare(
      'INSERT INTO support_sessions (sid, created_at, last_at, email, path, ip, ua) ' +
        "VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6) " +
        'ON CONFLICT(sid) DO UPDATE SET ' +
        'last_at = ?2, ' +
        'email = CASE WHEN ?3 = \'\' THEN support_sessions.email ELSE ?3 END, ' +
        'path = CASE WHEN ?4 = \'\' THEN support_sessions.path ELSE ?4 END, ' +
        'ua = ?6'
    )
    .bind(v.sid, now, v.email, v.path, ip, ua)
    .run();
}

// 幂等写入消息：cid 为主键，重试 / beacon 重复投递 / 网络重发均 INSERT OR IGNORE。
// 返回 true 表示新插入，false 表示该 cid 已存在（重复但仍向客户端回 ok）。
export async function insertMessage(db, v, ip, ua, now) {
  var res = await db
    .prepare(
      'INSERT OR IGNORE INTO support_messages ' +
        '(cid, sid, role, text, email, path, beacon, ts, ip, ua, created_at) ' +
        "VALUES (?1, ?2, 'me', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
    )
    .bind(v.cid, v.sid, v.text, v.email, v.path, v.beacon, v.ts, ip, ua, now)
    .run();
  // D1 meta.changes：新插入为 1，主键冲突被 IGNORE 时为 0。
  return !res.meta || res.meta.changes !== 0;
}
