// GET /api/support/history?sid=<urlencoded>
// 返回该会话已落库消息，供前端按 cid 去重合并、跨设备/刷新后保持一致。
// 一期仅回显访客 'me' 消息；二期人工/自动回复以 role='bot' 写入后会一并返回。
import { json, badRequest, validateSid } from './_lib.js';

var HISTORY_LIMIT = 200;

export async function onRequestGet(context) {
  var request = context.request;
  var env = context.env;

  var sid;
  try {
    var url = new URL(request.url);
    sid = validateSid(url.searchParams.get('sid') || '');
  } catch (e) {
    return badRequest('invalid url');
  }
  if (!sid) return badRequest('invalid sid');

  var db = env.DB;
  if (!db) return json({ ok: false, error: 'storage not configured' }, { status: 503 });

  try {
    var result = await db
      .prepare(
        'SELECT cid, role, text, ts FROM support_messages ' +
          'WHERE sid = ? ORDER BY ts ASC, created_at ASC LIMIT ?'
      )
      .bind(sid, HISTORY_LIMIT)
      .all();

    // 只回前端契约需要的四个字段，绝不外泄 ip / ua / email 等隐私列。
    var msgs = (result.results || []).map(function (r) {
      return { cid: r.cid, role: r.role, text: r.text, ts: r.ts };
    });
    return json({ ok: true, msgs: msgs });
  } catch (e) {
    console.error('[support/history] db error:', e && e.message);
    return json({ ok: false, error: 'db error' }, { status: 500 });
  }
}

// 非 GET 一律 JSON 405。
function methodNotAllowed() {
  return json({ ok: false, error: 'method not allowed' }, { status: 405 });
}
export var onRequestPost = methodNotAllowed;
export var onRequestPut = methodNotAllowed;
export var onRequestDelete = methodNotAllowed;
export var onRequestPatch = methodNotAllowed;
export var onRequestHead = methodNotAllowed;
export var onRequestOptions = methodNotAllowed;
