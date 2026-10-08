// tts/index.js —— 豆包语音 v3 双向流式 TTS 的 Worker 服务端转发
// ---------------------------------------------------------------------------
// 事实源：marketing-spec/tts-access-facts.md（已真机验证）。
//  - 端点：wss://openspeech.bytedance.com/api/v3/tts/bidirection
//  - 鉴权：请求头 X-Api-Key（secret）+ X-Api-Resource-Id（seed-tts-2.0）
//  - 协议：自定义二进制帧（12B 头 + event + 可选 session_id + JSON/二进制 payload）
//  - 调用顺序：StartConnection(1)→收50；StartSession(100, audio_params.enable_subtitle)→收150；
//              TaskRequest(200,{text})；紧接着 FinishSession(102,{})；
//              收集事件 352 的 raw mp3 分片拼接；逐字时间戳只来自事件 364。
//
// 关键工程红线：
//  - 单次合成硬超时 30s（建连 + 收流全周期），到点即关 socket，绝不无界等待；
//  - 受控并发（同一 isolate 内信号量），避免短时频繁建连被服务端限流；
//  - 外部取消信号（AbortSignal）可立即终止并关 socket；
//  - TTS_API_KEY 只从 env 读取，绝不外发前端、绝不落日志。
//
// 说明：Worker 标准 `new WebSocket(url, protocols)` 不支持自定义请求头，无法带
// X-Api-Key。这里改用「fetch + Upgrade: websocket」拿到 outbound WebSocket
// （resp.webSocket）——fetch 请求头可自由携带 X-Api-Key / X-Api-Resource-Id，
// WS 帧的 mask/分片由运行时自动处理，TTS 二进制协议直接作为 WS 消息 payload。

const E = {
  START_CONNECTION: 1, FINISH_CONNECTION: 2,
  CONNECTION_STARTED: 50, CONNECTION_FAILED: 51, CONNECTION_FINISHED: 52,
  START_SESSION: 100, FINISH_SESSION: 102,
  SESSION_STARTED: 150, SESSION_FINISHED: 152, SESSION_FAILED: 153,
  TASK_REQUEST: 200,
  TTS_SENTENCE_START: 350, TTS_SENTENCE_END: 351, TTS_RESPONSE: 352,
  TTS_SUBTITLE: 364,
};

const DEFAULT_WSS = 'wss://openspeech.bytedance.com/api/v3/tts/bidirection';
const DEFAULT_RESOURCE_ID = 'seed-tts-2.0';
const DEFAULT_SPEAKER = 'zh_male_jieshuoxiaoming_uranus_bigtts';
const TTS_TIMEOUT_MS = 30_000;
const MAX_TEXT_CHARS = 2000;

export class TtsError extends Error {
  constructor(code, message) { super(message); this.code = code; this.name = 'TtsError'; }
}

// ---- 受控并发信号量（同 isolate 内存级，免费档够用；短时频繁建连会被服务端限流）----
const MAX_CONCURRENT = 3;
let active = 0;
const waitQueue = [];
function acquireSlot() {
  if (active < MAX_CONCURRENT) { active++; return Promise.resolve(releaseSlot); }
  return new Promise((resolve) => waitQueue.push(() => { active++; resolve(releaseSlot); }));
}
function releaseSlot() {
  active--;
  const next = waitQueue.shift();
  if (next) next();
}

// ---- 字节工具 ----
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function utf8Encode(s) { return encoder.encode(s); }
function utf8Decode(u8) { return decoder.decode(u8); }
function concatU8(parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---- TTS 二进制帧：组装（客户端→服务端）----
function buildFrame(event, sid, payloadObj) {
  const head = new Uint8Array([0x11, 0x14, 0x10, 0x00]); // v1 / full-client / json / no-compress
  const ev = new Uint8Array(4);
  new DataView(ev.buffer).setUint32(0, event);
  const parts = [head, ev];
  if (sid != null) {
    const sb = utf8Encode(sid);
    const sl = new Uint8Array(4);
    new DataView(sl.buffer).setUint32(0, sb.length);
    parts.push(sl, sb);
  }
  const p = utf8Encode(JSON.stringify(payloadObj));
  const pl = new Uint8Array(4);
  new DataView(pl.buffer).setUint32(0, p.length);
  parts.push(pl, p);
  return concatU8(parts);
}

// ---- TTS 二进制帧：解析（服务端→客户端）----
// 返回 { mt, flags, ser, event, sid, payload(Uint8Array) }
function parseFrame(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const headerBytes = (u8[0] & 0x0f) * 4;
  const mt = u8[1] >> 4;
  const flags = u8[1] & 0x0f;
  const ser = u8[2] >> 4; // 1=JSON, 0=二进制(raw)
  let o = headerBytes;
  let event = null;
  if (flags & 0x04) { event = dv.getUint32(o); o += 4; }
  let sid = null;
  if (mt === 1 || mt === 9 || mt === 11) {
    const sl = dv.getUint32(o); o += 4;
    sid = utf8Decode(u8.subarray(o, o + sl)); o += sl;
  }
  const pl = dv.getUint32(o); o += 4;
  const payload = u8.subarray(o, o + pl);
  return { mt, flags, ser, event, sid, payload };
}

function randomWsKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// 单次合成主流程：打开 outbound WS → 状态机推进 → 收集 mp3 + 364 字幕。
async function runOnce({ text, speaker, apiKey, resourceId, wss, signal }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(new TtsError('timeout', 'TTS 超时(30s)')); } catch {} }, TTS_TIMEOUT_MS);
  const onExtAbort = () => { try { ctrl.abort(new TtsError('aborted', '客户端取消')); } catch {} };
  if (signal) {
    if (signal.aborted) onExtAbort();
    else signal.addEventListener('abort', onExtAbort, { once: true });
  }

  let ws;
  try {
    const httpsUrl = wss.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
    const resp = await fetch(httpsUrl, {
      signal: ctrl.signal,
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Key': randomWsKey(),
        'Sec-WebSocket-Version': '13',
        'X-Api-Key': apiKey,
        'X-Api-Resource-Id': resourceId,
      },
    });
    ws = resp.webSocket;
    if (!ws) {
      const t = await resp.text().catch(() => '');
      throw new TtsError('ws_upgrade_failed', 'status=' + resp.status + ' ' + t.slice(0, 120));
    }
    ws.accept();
    // 关键：Workers 运行时收到的 WS 二进制消息默认是 Blob（本地 dev 可能是 ArrayBuffer），
    // 必须显式设为 arraybuffer，否则 new Uint8Array(ev.data) 会拿到空视图、解析越界。
    try { ws.binaryType = 'arraybuffer'; } catch {}
  } catch (e) {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExtAbort);
    throw (e instanceof TtsError) ? e : new TtsError('connect_failed', String((e && e.message) || e).slice(0, 200));
  }

  const audioChunks = [];
  const words = [];
  const sid = 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  let settled = false;
  let resolveDone, rejectDone;
  const done = new Promise((res, rej) => { resolveDone = res; rejectDone = rej; });

  const safeReject = (err) => {
    if (settled) return; settled = true;
    try { ws.close(1000, String(err.code || 'error')); } catch {}
    rejectDone(err);
  };
  const safeResolve = () => { if (settled) return; settled = true; try { ws.close(1000, 'done'); } catch {}; resolveDone(); };

  ws.addEventListener('message', (ev) => {
    let f;
    try { f = parseFrame(new Uint8Array(ev.data)); } catch { return; }
    // 352 = raw mp3 分片（ser=0），直接累积字节
    if (f.event === E.TTS_RESPONSE) { audioChunks.push(f.payload); return; }

    let j = null;
    if (f.ser === 1) { try { j = JSON.parse(utf8Decode(f.payload)); } catch {} }

    switch (f.event) {
      case E.CONNECTION_STARTED: // 50
        ws.send(buildFrame(E.START_SESSION, sid, {
          event: E.START_SESSION,
          req_params: {
            speaker,
            audio_params: { format: 'mp3', sample_rate: 24000, enable_subtitle: true },
          },
        }));
        break;
      case E.SESSION_STARTED: // 150
        ws.send(buildFrame(E.TASK_REQUEST, sid, { event: E.TASK_REQUEST, req_params: { text } }));
        ws.send(buildFrame(E.FINISH_SESSION, sid, {}));
        break;
      case E.TTS_SUBTITLE: // 364 —— 逐字时间戳唯一来源（350/351 的 words 始终为空）
        if (j && Array.isArray(j.words)) {
          for (const w of j.words) {
            if (w && typeof w.word === 'string') words.push({ word: w.word, startTime: w.startTime, endTime: w.endTime, confidence: w.confidence });
          }
        }
        break;
      case E.SESSION_FINISHED: // 152
        setTimeout(safeResolve, 200);
        break;
      case E.CONNECTION_FAILED: // 51
      case E.SESSION_FAILED:    // 153
        safeReject(new TtsError('tts_failed', 'event=' + f.event + ' ' + utf8Decode(f.payload).slice(0, 160)));
        break;
      default:
        break;
    }
  });
  ws.addEventListener('error', (e) => safeReject(new TtsError('ws_error', String((e && e.message) || 'ws error').slice(0, 160))));
  ws.addEventListener('close', (e) => {
    // 正常流程在 152 后已 resolve；这里兜底：若尚未结束就被对端关闭，视为失败
    if (!settled) safeReject(new TtsError('ws_closed', '连接被对端关闭 code=' + (e && e.code)));
  });

  // 超时 / 外部取消：立即关 socket
  ctrl.signal.addEventListener('abort', () => safeReject(new TtsError('timeout', 'TTS 超时或取消(30s)')), { once: true });

  // 启动握手：StartConnection（无 sid）
  ws.send(buildFrame(E.START_CONNECTION, null, {}));

  try {
    await done;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExtAbort);
    try { ws.close(1000, 'bye'); } catch {}
  }

  const mp3 = concatU8(audioChunks);
  if (!mp3.length) throw new TtsError('no_audio', '合成完成但未收到音频分片');
  return { mp3, words };
}

/**
 * 合成一段文本为 mp3 + 逐字时间戳。
 * @param {object} env  Worker env（读取 TTS_API_KEY / TTS_WSS / TTS_RESOURCE_ID / TTS_SPEAKER）
 * @param {object} opts { text, speaker?, signal? }
 * @returns {Promise<{mp3: Uint8Array, words: Array}>}
 */
export async function synthesize(env, { text, speaker, signal } = {}) {
  if (!env || !env.TTS_API_KEY) throw new TtsError('server_misconfigured', 'TTS 密钥未配置');
  if (typeof text !== 'string' || !text.trim()) throw new TtsError('bad_text', '需要非空文本 text');
  if (text.length > MAX_TEXT_CHARS) throw new TtsError('text_too_long', '文本过长（上限 ' + MAX_TEXT_CHARS + ' 字）');

  const wss = env.TTS_WSS || DEFAULT_WSS;
  const resourceId = env.TTS_RESOURCE_ID || DEFAULT_RESOURCE_ID;
  const spk = speaker || env.TTS_SPEAKER || DEFAULT_SPEAKER;

  const release = await acquireSlot();
  try {
    return await runOnce({ text: text.trim(), speaker: spk, apiKey: env.TTS_API_KEY, resourceId, wss, signal });
  } finally {
    release();
  }
}

export default { synthesize, TtsError };
