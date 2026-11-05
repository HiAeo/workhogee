// POST /api/support/message
// 接收官网客服 widget 用户消息，幂等落 D1。兼容 fetch 与 navigator.sendBeacon（均为 POST JSON）。
import {
  json,
  badRequest,
  clientIp,
  validateBody,
  hitRateLimit,
  upsertSession,
  insertMessage
} from './_lib.js';

// 同一连接 IP：60 秒滑窗内最多 20 条，超出回 429（前端会把该消息标 pending 并可重试）。
var WINDOW_MS = 60000;
var MAX_HITS = 20;
var UA_MAX = 255;

export async function onRequestPost(context) {
  var request = context.request;
  var env = context.env;

  var body;
  try {
    body = await request.json();
  } catch (e) {
    return badRequest('invalid json');
  }

  var checked = validateBody(body);
  if (checked.error) return badRequest(checked.error);
  var v = checked.value;

  var db = env.DB;
  if (!db) return json({ ok: false, error: 'storage not configured' }, { status: 503 });

  var ip = clientIp(request);
  var ua = (request.headers.get('user-agent') || '').slice(0, UA_MAX);
  var now = Date.now();

  try {
    if (await hitRateLimit(db, ip, WINDOW_MS, MAX_HITS)) {
      return json({ ok: false, error: 'rate limited' }, { status: 429 });
    }

    await upsertSession(db, v, ip, ua, now);
    var stored = await insertMessage(db, v, ip, ua, now);

    // 只要服务端确认该 cid 已持久化（含幂等命中），前端即可置为 sent。
    return json({ ok: true, cid: v.cid, stored: stored, ts: v.ts });
  } catch (e) {
    // 细节仅写服务端日志，不回传客户端；前端按非 ok / 非 JSON 降级 pending，不报错中断。
    console.error('[support/message] db error:', e && e.message);
    return json({ ok: false, error: 'db error' }, { status: 500 });
  }
}

// 非 POST 一律 JSON 405，保证该路径任何响应都是 application/json。
function methodNotAllowed() {
  return json({ ok: false, error: 'method not allowed' }, { status: 405 });
}
export var onRequestGet = methodNotAllowed;
export var onRequestPut = methodNotAllowed;
export var onRequestDelete = methodNotAllowed;
export var onRequestPatch = methodNotAllowed;
export var onRequestHead = methodNotAllowed;
export var onRequestOptions = methodNotAllowed;
