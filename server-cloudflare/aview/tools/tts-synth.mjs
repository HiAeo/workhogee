// aview/tools/tts-synth.mjs — 阿视本地真机 TTS 合成器（Node 直连 seed-tts，绕过 Worker）
// ---------------------------------------------------------------------------
// 复用 composer-proof/gen-tts.mjs 已真机验证的官方二进制帧协议（与 tts/index.js 一致）。
// 用途：本地真机验证时，逐镜头把旁白文本合成 mp3 + 逐字时间戳 words.json。
//   * 同一 WebSocket 连接内串行跑多个 session，避免频繁建连被限流；
//   * 单次整体硬超时 60s，到点强退，绝不无界等待；
//   * speaker 可逐 job 指定（中文默认 zh_male_jieshuoxiaoming_uranus_bigtts）。
//
// 用法：
//   node tts-synth.mjs <jobs.json> <outDir>
//   jobs.json: [{"file":"zh-1","text":"...","speaker":"...可选"}]
// 产物: <outDir>/<file>.mp3 + <outDir>/<file>.words.json  (words.json={text,words:[{word,startTime,endTime}]})
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..", ".."); // workhogee/server-cloudflare/../.. = workhogee
const VARS = path.join(ROOT, "server-cloudflare", ".dev.vars");

function readVars() {
  const txt = fs.readFileSync(VARS, "utf8");
  const get = (k) => {
    const m = txt.match(new RegExp("^" + k + "=(.*)$", "m"));
    return m ? m[1].trim() : "";
  };
  return {
    key: get("TTS_API_KEY"),
    defaultSpeaker: get("TTS_SPEAKER") || "zh_male_jieshuoxiaoming_uranus_bigtts",
    resourceId: get("TTS_RESOURCE_ID") || "seed-tts-2.0",
    wss: get("TTS_WSS") || "wss://openspeech.bytedance.com/api/v3/tts/bidirection",
  };
}

const E = {
  START_CONNECTION: 1, FINISH_CONNECTION: 2,
  CONNECTION_STARTED: 50, CONNECTION_FAILED: 51, CONNECTION_FINISHED: 52,
  START_SESSION: 100, FINISH_SESSION: 102,
  SESSION_STARTED: 150, SESSION_FINISHED: 152, SESSION_FAILED: 153,
  TASK_REQUEST: 200,
  TTS_RESPONSE: 352, TTS_SUBTITLE: 364,
};

function buildFrame(event, sid, payloadObj) {
  const h = Buffer.from([0x11, 0x14, 0x10, 0x00]);
  const ev = Buffer.alloc(4); ev.writeUInt32BE(event, 0);
  const parts = [h, ev];
  if (sid != null) {
    const sb = Buffer.from(sid, "utf8");
    const sl = Buffer.alloc(4); sl.writeUInt32BE(sb.length, 0);
    parts.push(sl, sb);
  }
  const p = Buffer.from(JSON.stringify(payloadObj), "utf8");
  const pl = Buffer.alloc(4); pl.writeUInt32BE(p.length, 0);
  parts.push(pl, p);
  return Buffer.concat(parts);
}

function parseFrame(buf) {
  const hb = (buf[0] & 0x0f) * 4;
  const mt = buf[1] >> 4, flags = buf[1] & 0x0f, ser = buf[2] >> 4;
  let o = hb, event = null;
  if (flags & 0x04) { event = buf.readUInt32BE(o); o += 4; }
  let rsid = null;
  if ([1, 9, 11].includes(mt)) {
    const sl = buf.readUInt32BE(o); o += 4;
    rsid = buf.slice(o, o + sl).toString("utf8"); o += sl;
  }
  const pl = buf.readUInt32BE(o); o += 4;
  const payload = buf.slice(o, o + pl);
  return { mt, ser, event, sid: rsid, payload };
}

const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

const jobsPath = process.argv[2];
const outDir = process.argv[3];
if (!jobsPath || !outDir) { console.error("usage: node tts-synth.mjs <jobs.json> <outDir>"); process.exit(1); }
const jobs = JSON.parse(fs.readFileSync(jobsPath, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

const { key, defaultSpeaker, resourceId, wss } = readVars();
if (!key) { console.error("missing TTS_API_KEY"); process.exit(1); }

const summary = [];
let idx = 0;
let audio = [], words = [], currentSid = null, curJob = null;

const ws = new WebSocket(wss, { headers: { "X-Api-Key": key, "X-Api-Resource-Id": resourceId } });
ws.binaryType = "arraybuffer";

function startNext() {
  if (idx >= jobs.length) {
    try { ws.send(buildFrame(E.FINISH_CONNECTION, null, {})); } catch {}
    setTimeout(() => { try { ws.close(); } catch {} }, 300);
    return;
  }
  curJob = jobs[idx];
  currentSid = "aview-" + Date.now().toString(36) + "-" + idx;
  audio = []; words = [];
  const spk = curJob.speaker || defaultSpeaker;
  console.log(`[job ${idx + 1}/${jobs.length}] file=${curJob.file} speaker=${spk} text="${String(curJob.text).slice(0, 60)}"`);
  ws.send(buildFrame(E.START_SESSION, currentSid, {
    event: E.START_SESSION,
    req_params: { speaker: spk, audio_params: { format: "mp3", sample_rate: 48000, enable_subtitle: true } },
  }));
}

ws.onopen = () => { console.log("[open] " + wss); ws.send(buildFrame(E.START_CONNECTION, null, {})); };

ws.onmessage = (ev) => {
  let f; try { f = parseFrame(Buffer.from(ev.data)); } catch { return; }
  if (f.event === E.TTS_RESPONSE) { audio.push(f.payload); process.stdout.write("."); return; }
  let txt = ""; if (f.ser === 1) txt = f.payload.toString("utf8");

  if (f.event === E.CONNECTION_STARTED) { startNext(); }
  else if (f.event === E.SESSION_STARTED) {
    ws.send(buildFrame(E.TASK_REQUEST, currentSid, { event: E.TASK_REQUEST, req_params: { text: curJob.text } }));
    ws.send(buildFrame(E.FINISH_SESSION, currentSid, {}));
  }
  else if (f.event === E.TTS_SUBTITLE) {
    const pj = safeJson(txt);
    const w = pj?.payload?.words || pj?.words || [];
    if (Array.isArray(w) && w.length) words.push(...w);
  }
  else if (f.event === E.SESSION_FINISHED) {
    console.log(`\n[done] words=${words.length} audioChunks=${audio.length}`);
    const mp3 = Buffer.concat(audio);
    fs.writeFileSync(path.join(outDir, curJob.file + ".mp3"), mp3);
    fs.writeFileSync(path.join(outDir, curJob.file + ".words.json"), JSON.stringify({ text: curJob.text, speaker: curJob.speaker || defaultSpeaker, words }, null, 2));
    // 估算时长（最后一个词 endTime，毫秒）
    const durMs = words.length ? Math.round(words[words.length - 1].endTime) : 0;
    summary.push({ file: curJob.file, bytes: mp3.length, words: words.length, durMs, speaker: curJob.speaker || defaultSpeaker });
    idx++;
    if (idx < jobs.length) setTimeout(startNext, 1200); else finish();
  }
  else if (f.event === E.CONNECTION_FAILED || f.event === E.SESSION_FAILED) {
    console.log("!! FAILED " + f.event + " " + txt.slice(0, 300));
    process.exit(1);
  }
};
ws.onerror = (e) => console.log("[error]", e.message || e.type);
ws.onclose = () => { console.log("[closed]"); console.log("SUMMARY " + JSON.stringify(summary)); process.exit(0); };

function finish() {
  setTimeout(() => { try { ws.close(); } catch {} }, 300);
}
setTimeout(() => { console.log("\nguard timeout"); console.log("SUMMARY " + JSON.stringify(summary)); process.exit(2); }, 90000);
