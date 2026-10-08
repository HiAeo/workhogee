/* =====================================================================
 * WorkHogee · matting 共享底层（API 中立 ES module）
 * ---------------------------------------------------------------------
 * 仅依赖 Web 标准 fetch / FormData / Uint8Array，无 node 内置、无浏览器专有 API。
 * 既可在 Cloudflare Worker 运行，也可在 Node18+ 跑测试。
 *
 * env 需要：
 *   ARK_API_KEY            火山方舟 key（视觉 VL）
 *   VISION_ENDPOINT        默认 https://ark.cn-beijing.volces.com/api/v3/chat/completions
 *   VISION_MODEL           默认 doubao-seed-2-1-turbo-260628
 *   PICWISH_API_KEY        佐糖抠图
 *   PICWISH_BASE           默认 https://techsz.aoscdn.com
 *
 * 像素运算一律作用在调用方传入的 { width, height, data: Uint8Array(RGBA) } 上，
 * 模块本身不解码 PNG/JPEG（解码由调用方：Worker 用 mask PNG + DecompressionStream，
 * 本地测试用 sharp）。
 * ===================================================================*/

export const VISION_ENDPOINT_DEFAULT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
export const VISION_MODEL_DEFAULT = 'doubao-seed-2-1-turbo-260628';
export const PICWISH_BASE_DEFAULT = 'https://techsz.aoscdn.com';

/** dataURL -> { mime, bytes:Uint8Array }；失败返回 null */
export function dataUrlToBytes(dataUrl) {
  const m = /^data:(image\/(?:jpe?g|png|webp));base64,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  const b64 = m[2];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1], bytes };
}

/** bytes -> dataURL */
export function bytesToDataUrl(bytes, mime = 'image/png') {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return `data:${mime};base64,` + btoa(bin);
}

/** 从 VL 文本容错提取第一个 JSON 对象 */
export function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const s = t.indexOf('{');
  const e = t.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

/**
 * 调用火山 VL，要求返回 JSON。
 * @param {object} env
 * @param {{system:string,user:string,images:string[],detail?:string,maxTokens?:number}} o
 * @returns {Promise<{ok:true,data:any,ms:number}|{ok:false,error:string}>}
 */
export async function callVL(env, { system, user, images = [], detail = 'high', maxTokens = 900 } = {}) {
  const key = env.VISION_API_KEY || env.ARK_API_KEY;
  if (!key) return { ok: false, error: 'no_ark_key' };
  const t0 = Date.now();
  const content = [];
  for (const u of images) {
    if (typeof u === 'string' && /^(data:image\/(?:jpe?g|png|webp);base64,|https?:\/\/)/.test(u)) {
      content.push({ type: 'image_url', image_url: { url: u, detail } });
    }
  }
  if (!content.length) return { ok: false, error: 'no_image' };
  content.push({ type: 'text', text: user });
  try {
    const r = await fetch(env.VISION_ENDPOINT || VISION_ENDPOINT_DEFAULT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: env.VISION_MODEL || VISION_MODEL_DEFAULT,
        messages: [
          { role: 'system', content: system || '你是严谨的视觉质检助手，只输出 JSON。' },
          { role: 'user', content },
        ],
        temperature: 0.1, max_tokens: maxTokens, thinking: { type: 'disabled' },
      }),
      signal: AbortSignal.timeout(60000),
    });
    const txt = await r.text();
    if (!r.ok) return { ok: false, error: 'vl_http_' + r.status, detail: txt.slice(0, 200) };
    const j = JSON.parse(txt);
    const ct = j.choices?.[0]?.message?.content;
    const data = extractJson(ct);
    if (!data) return { ok: false, error: 'vl_unparseable', detail: String(ct).slice(0, 200) };
    return { ok: true, data, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: 'vl_exception:' + (e && e.message || e) };
  }
}

/**
 * PicWish 抠图（透明 PNG）。返回 { ok, pngBytes, maskBytes?, ms, credits }。
 * maskBytes 仅当 outputType 取 1 时返回（需再下载 mask URL）。
 */
export async function picwishSegment(env, { bytes, mime = 'image/png', type = 'object', wantMask = false } = {}) {
  const key = env.PICWISH_API_KEY;
  if (!key) return { ok: false, error: 'no_picwish_key' };
  if (!bytes || !bytes.length) return { ok: false, error: 'no_bytes' };
  const t0 = Date.now();
  const fd = new FormData();
  fd.append('sync', '1');
  fd.append('type', type);
  fd.append('return_type', wantMask ? '1' : '2');
  fd.append('format', 'png');
  fd.append('output_type', wantMask ? '1' : '2');
  const ext = /png$/i.test(mime) ? 'png' : 'jpg';
  fd.append('image_file', new Blob([bytes], { type: mime }), 'image.' + ext);
  try {
    const r = await fetch((env.PICWISH_BASE || PICWISH_BASE_DEFAULT) + '/api/tasks/visual/segmentation', {
      method: 'POST', headers: { 'X-API-KEY': key }, body: fd,
      signal: AbortSignal.timeout(120000),
    });
    const txt = await r.text();
    if (r.status !== 200) return { ok: false, error: 'pw_http_' + r.status, detail: txt.slice(0, 200) };
    const j = JSON.parse(txt);
    if (j.status !== 200 || !j.data || j.data.state !== 1) {
      return { ok: false, error: 'pw_task_' + (j.data && j.data.state), detail: (j.message || '').slice(0, 200) };
    }
    let pngBytes = null;
    if (j.data.image && !/^https?:/.test(j.data.image)) pngBytes = Uint8Array.from(atob(j.data.image), c => c.charCodeAt(0));
    else if (j.data.image) {
      const d = await fetch(j.data.image, { signal: AbortSignal.timeout(60000) });
      pngBytes = new Uint8Array(await d.arrayBuffer());
    }
    let maskBytes = null;
    if (wantMask && j.data.mask) {
      const d = await fetch(j.data.mask, { signal: AbortSignal.timeout(60000) });
      maskBytes = new Uint8Array(await d.arrayBuffer());
    }
    return { ok: true, pngBytes, maskBytes, ms: Date.now() - t0, credits: 0.5 };
  } catch (e) {
    return { ok: false, error: 'pw_exception:' + (e && e.message || e) };
  }
}

/* ---------------- 纯 JS 像素运算（作用于 RGBA buffer） ---------------- */

/** RGBA -> 白底 RGB（每像素 out = rgb*a + 255*(1-a)），返回 {width,height,data:Uint8Array(RGB)} */
export function compositeOnWhite(rgba) {
  const { width, height, data } = rgba;
  const out = new Uint8Array(width * height * 3);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 3) {
    const a = data[i + 3] / 255;
    out[p] = Math.round(data[i] * a + 255 * (1 - a));
    out[p + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
    out[p + 2] = Math.round(data[i + 2] * a + 255 * (1 - a));
  }
  return { width, height, data: out };
}

/** 统计 RGBA buffer 里 alpha>thr 的像素数 */
export function countForeground(rgba, thr = 16) {
  let n = 0;
  for (let i = 3; i < rgba.data.length; i += 4) if (rgba.data[i] > thr) n++;
  return n;
}

/* ---------------- 极简 PNG 解码器（edge 端无 sharp，用 DecompressionStream） ----------------
 * 支持：8bit、非隔行、color type 0(灰度) 与 6(RGBA)。用于把 PicWish mask / 透明 PNG
 * 解码成 RGBA buffer，喂给几何质检。Worker 与 Node22 均原生支持 DecompressionStream。
 * ------------------------------------------------------------------------------ */

async function readZlib(bytes) {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** Paeth 预测 */
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
}

/** 解码 PNG bytes -> { width, height, data:Uint8Array(RGBA) } */
export async function decodePng(bytes) {
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) throw new Error('not_png');
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < bytes.length) {
    const len = (bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3];
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const chunk = bytes.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = (chunk[0] << 24) | (chunk[1] << 16) | (chunk[2] << 8) | chunk[3];
      height = (chunk[4] << 24) | (chunk[5] << 16) | (chunk[6] << 8) | chunk[7];
      bitDepth = chunk[8]; colorType = chunk[9]; interlace = chunk[12];
    } else if (type === 'IDAT') {
      idat.push(chunk);
    } else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('png_bitdepth_' + bitDepth);
  if (interlace !== 0) throw new Error('png_interlaced_unsupported');
  // color type: 0=Gray, 2=RGB, 4=Gray+Alpha, 6=RGBA
  const CH = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const channels = CH[colorType] || 0;
  if (!channels) throw new Error('png_colortype_' + colorType);

  // 拼 IDAT 解压
  const total = idat.reduce((s, c) => s + c.length, 0);
  const comp = new Uint8Array(total);
  let p = 0; for (const c of idat) { comp.set(c, p); p += c.length; }
  const raw = await readZlib(comp);

  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const cur = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const v = raw[rp++];
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let r = v;
      if (f === 0) r = v;
      else if (f === 1) r = v + a;
      else if (f === 2) r = v + b;
      else if (f === 3) r = v + ((a + b) >> 1);
      else if (f === 4) r = v + paeth(a, b, c);
      cur[x] = r & 0xff;
    }
    // 展开为 RGBA
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (channels === 1) {            // Gray
        const g = cur[x];
        out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = 255;
      } else if (channels === 2) {      // Gray+Alpha
        const g = cur[x * 2];
        out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = cur[x * 2 + 1];
      } else if (channels === 3) {     // RGB（无 alpha）
        out[o] = cur[x * 3]; out[o + 1] = cur[x * 3 + 1]; out[o + 2] = cur[x * 3 + 2]; out[o + 3] = 255;
      } else {                          // RGBA
        out[o] = cur[x * 4]; out[o + 1] = cur[x * 4 + 1]; out[o + 2] = cur[x * 4 + 2]; out[o + 3] = cur[x * 4 + 3];
      }
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}

/** 把灰度 mask PNG 当成 alpha：单通道 -> RGBA（alpha=灰度值） */
export async function decodeMaskPngToAlpha(bytes) {
  const rgba = await decodePng(bytes);
  // PicWish mask 通常是灰度图（白=前景）。这里 out 已把灰度填进 RGB 且 alpha=255，
  // 需要把"前景"映射成 alpha：取亮度作为 alpha。
  const a = new Uint8Array(rgba.width * rgba.height * 4);
  for (let i = 0, o = 0; i < rgba.data.length; i += 4, o += 4) {
    const lum = rgba.data[i]; // 灰度
    a[o] = 255; a[o + 1] = 255; a[o + 2] = 255; a[o + 3] = lum;
  }
  return { width: rgba.width, height: rgba.height, data: a };
}

/** 把归一化 bbox [x,y,w,h](0~1) 转成像素整数框，带 clamp */
export function normBoxToPx(box, width, height) {
  const [x, y, w, h] = box.map(Number);
  const px = Math.max(0, Math.round(x * width));
  const py = Math.max(0, Math.round(y * height));
  const pw = Math.min(width - px, Math.round(w * width));
  const ph = Math.min(height - py, Math.round(h * height));
  return { left: px, top: py, width: pw, height: ph };
}
