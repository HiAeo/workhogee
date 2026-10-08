/* =====================================================================
 * WorkHogee · 佐糖 PicWish（AOS Labs）商用抠图 API 封装（可复用）
 * ---------------------------------------------------------------------
 * 国内服务（techsz.aoscdn.com），支付宝充值，边缘质量优于 RMBG。
 * 同步模式（sync=1）直接返回透明 PNG base64。
 *
 * 需要 env：PICWISH_API_KEY
 *
 * 计费：0.5 算粒/张 ≈ ¥0.021/张；新用户注册送 50 算粒。
 * 文档：https://picwish.com/new-background-removal-api-doc
 * ===================================================================*/

const BASE = 'https://techsz.aoscdn.com';

function dataUrlToBytes(dataUrl) {
  const m = /^data:(image\/(?:jpe?g|png|webp));base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  return { bytes: Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)), mime: m[1] };
}

function bytesToPngDataUrl(u8) {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return 'data:image/png;base64,' + btoa(bin);
}

function pngSize(bytes) {
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  } catch { return { width: 0, height: 0 }; }
}

/**
 * PicWish 智能抠图（商品/物体）。
 * @param {object} env Worker env（含 PICWISH_API_KEY）
 * @param {string} dataUrl 原图 dataURL
 * @param {object} [opts] { type?: 'object'|'person'|'stamp' }
 * @returns {Promise<{ok:true,image:string,width:number,height:number,ms:number}|
 *                    {ok:false,error:{code:string,message?:string}}>}
 */
export async function picwishCutout(env, dataUrl, opts = {}) {
  const t0 = Date.now();
  const key = env.PICWISH_API_KEY;
  if (!key) {
    return { ok: false, error: { code: 'picwish_not_configured', message: 'PICWISH_API_KEY 未配置' } };
  }
  try {
    const info = dataUrlToBytes(dataUrl);
    if (!info) return { ok: false, error: { code: 'bad_dataurl', message: '图片 dataURL 不合法' } };
    const ext = /png$/i.test(info.mime) ? 'png' : 'jpg';
    const fd = new FormData();
    fd.append('sync', '1');
    fd.append('type', opts.type || 'object');
    fd.append('return_type', '2');   // base64
    fd.append('format', 'png');       // transparent
    fd.append('output_type', '2');   // image only
    fd.append('image_file', new Blob([info.bytes], { type: info.mime }), 'image.' + ext);
    const r = await fetch(BASE + '/api/tasks/visual/segmentation', {
      method: 'POST',
      headers: { 'X-API-KEY': key },
      body: fd,
      signal: AbortSignal.timeout(120000),
    });
    const txt = await r.text();
    if (r.status !== 200) {
      return { ok: false, error: { code: 'picwish_http_' + r.status, message: txt.slice(0, 300) } };
    }
    let j;
    try { j = JSON.parse(txt); }
    catch { return { ok: false, error: { code: 'picwish_bad_json', message: txt.slice(0, 200) } }; }
    if (j.status !== 200 || !j.data || j.data.state !== 1) {
      return { ok: false, error: { code: 'picwish_task_failed', message: 'state=' + (j.data && j.data.state) + ' msg=' + (j.message || '').slice(0, 200) } };
    }
    const b64 = j.data.image;
    if (!b64) return { ok: false, error: { code: 'picwish_no_image', message: txt.slice(0, 200) } };
    const out = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const size = pngSize(out);
    return {
      ok: true,
      image: bytesToPngDataUrl(out),
      width: size.width, height: size.height,
      ms: Date.now() - t0,
    };
  } catch (e) {
    return { ok: false, error: { code: 'picwish_exception', message: String(e && e.message || e) } };
  }
}

/**
 * M2.3：用公网图片 URL 调用 PicWish 抠图（Worker 不再中转原图字节）。
 * @param {object} env Worker env
 * @param {string} imageUrl 公网可访问的图片 URL（如 TOS 预签名 GET）
 * @param {object} [opts] { type?: 'object'|'person'|'stamp' }
 * @returns {Promise<{ok:true,image:string,width:number,height:number,ms:number}|
 *                    {ok:false,error:{code,message?}}>}
 *   image 为 data:image/png;base64,...（调用方应立即转存 TOS 并释放该字符串）。
 */
export async function picwishCutoutByUrl(env, imageUrl, opts = {}) {
  const t0 = Date.now();
  const key = env.PICWISH_API_KEY;
  if (!key) {
    return { ok: false, error: { code: 'picwish_not_configured', message: 'PICWISH_API_KEY 未配置' } };
  }
  if (typeof imageUrl !== 'string' || !/^https?:\/\//.test(imageUrl)) {
    return { ok: false, error: { code: 'bad_image_url', message: 'imageUrl 必须是 http(s) 公网 URL' } };
  }
  try {
    const fd = new FormData();
    fd.append('sync', '1');
    fd.append('type', opts.type || 'object');
    fd.append('return_type', '2');   // base64
    fd.append('format', 'png');       // transparent
    fd.append('output_type', '2');   // image only
    fd.append('image_url', imageUrl);
    const r = await fetch(BASE + '/api/tasks/visual/segmentation', {
      method: 'POST',
      headers: { 'X-API-KEY': key },
      body: fd,
      signal: AbortSignal.timeout(120000),
    });
    const txt = await r.text();
    if (r.status !== 200) {
      return { ok: false, error: { code: 'picwish_http_' + r.status, message: txt.slice(0, 300) } };
    }
    let j;
    try { j = JSON.parse(txt); }
    catch { return { ok: false, error: { code: 'picwish_bad_json', message: txt.slice(0, 200) } }; }
    if (j.status !== 200 || !j.data || j.data.state !== 1) {
      return { ok: false, error: { code: 'picwish_task_failed', message: 'state=' + (j.data && j.data.state) + ' msg=' + (j.message || '').slice(0, 200) } };
    }
    const b64 = j.data.image;
    if (!b64) return { ok: false, error: { code: 'picwish_no_image', message: txt.slice(0, 200) } };
    const out = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const size = pngSize(out);
    return {
      ok: true,
      image: bytesToPngDataUrl(out),
      width: size.width, height: size.height,
      ms: Date.now() - t0,
    };
  } catch (e) {
    return { ok: false, error: { code: 'picwish_exception', message: String(e && e.message || e) } };
  }
}

/* =====================================================================
 * r-background（联合背景生成）：把「透明抠图 PNG + 英文 prompt」丢给佐糖，
 * 模型一次性把产品 + 场景/营销底图重绘融合为一张图（产品+场景一体，不贴回）。
 * ---------------------------------------------------------------------
 * POST {BASE}/api/tasks/visual/r-background
 *   headers: X-API-KEY
 *   multipart: image_file=透明PNG字节, prompt=英文描述, sync=1
 * 响应（sync=1）：
 *   { status:200, data:{ state:1, image_1:url, image_2:url, image_3:'', image_4:'' } }
 *   一次返回最多 4 张候选；空串表示该槽位未出图。
 * 用途：M3 场景图（产品+使用场景联合生成）、营销海报底图（干净背景+产品，无文字）。
 * 注意：输出是 JPG URL（OSS 预签名，1h 过期），调用方须立即转存自有 TOS。
 * ===================================================================*/

/**
 * 调 r-background 联合生成。
 * @param {object} env Worker env（含 PICWISH_API_KEY）
 * @param {Uint8Array} pngBytes 透明抠图 PNG 字节（已从 TOS 下载）
 * @param {string} prompt 英文 prompt（产品描述+场景/底图氛围+光影+道具+负向约束）
 * @param {object} [opts] {}
 * @returns {Promise<{ok:true,urls:string[],taskId:string,ms:number}|
 *                   {ok:false,error:{code:string,message?:string}}>}
 *   urls 为非空候选图 URL 数组（已剔除空串），最多 4 个。
 */
export async function picwishRBackground(env, pngBytes, prompt, opts = {}) {
  const t0 = Date.now();
  const key = env.PICWISH_API_KEY;
  if (!key) return { ok: false, error: { code: 'picwish_not_configured', message: 'PICWISH_API_KEY 未配置' } };
  if (!(pngBytes instanceof Uint8Array) || pngBytes.length < 100) {
    return { ok: false, error: { code: 'bad_png_bytes', message: 'r-background 需要透明 PNG 字节' } };
  }
  if (!prompt || typeof prompt !== 'string') {
    return { ok: false, error: { code: 'bad_prompt', message: 'r-background 需要英文 prompt' } };
  }
  try {
    const fd = new FormData();
    fd.append('sync', '1');
    fd.append('prompt', prompt);
    fd.append('output_type', '2');   // 返回图片
    fd.append('batch_size', String(opts.batchSize === 1 ? 1 : 2));
    if (opts.negativePrompt) fd.append('negative_prompt', String(opts.negativePrompt).slice(0, 512));
    fd.append('image_file', new Blob([pngBytes], { type: 'image/png' }), 'cutout.png');
    const r = await fetch(BASE + '/api/tasks/visual/r-background', {
      method: 'POST',
      headers: { 'X-API-KEY': key },
      body: fd,
      signal: AbortSignal.timeout(150000),
    });
    const txt = await r.text();
    if (r.status !== 200) {
      return { ok: false, error: { code: 'picwish_rbg_http_' + r.status, message: txt.slice(0, 300) } };
    }
    let j;
    try { j = JSON.parse(txt); }
    catch { return { ok: false, error: { code: 'picwish_rbg_bad_json', message: txt.slice(0, 200) } }; }
    if (j.status !== 200 || !j.data || j.data.state !== 1) {
      return { ok: false, error: { code: 'picwish_rbg_task_failed', message: 'state=' + (j.data && j.data.state) + ' msg=' + (j.message || '').slice(0, 200) } };
    }
    const d = j.data;
    const urls = [d.image_1, d.image_2, d.image_3, d.image_4].filter(u => typeof u === 'string' && /^https?:\/\//.test(u));
    if (!urls.length) {
      return { ok: false, error: { code: 'picwish_rbg_no_image', message: txt.slice(0, 200) } };
    }
    return { ok: true, urls, taskId: d.task_id || '', ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: { code: 'picwish_rbg_exception', message: String(e && e.message || e) } };
  }
}

// ===== r-background 异步模式（避免在一个 Worker 请求里同步长等导致 Cloudflare 520）=====
export async function picwishRBackgroundCreate(env, pngBytes, prompt, opts = {}) {
  const key = env.PICWISH_API_KEY;
  if (!key) return { ok: false, error: { code: 'picwish_not_configured', message: 'PICWISH_API_KEY 未配置' } };
  if (!(pngBytes instanceof Uint8Array) || pngBytes.length < 100) return { ok: false, error: { code: 'bad_png_bytes', message: 'r-background 需要透明 PNG 字节' } };
  if (!prompt) return { ok: false, error: { code: 'bad_prompt', message: 'r-background 需要英文 prompt' } };
  try {
    const fd = new FormData();
    fd.append('sync', '0');
    fd.append('prompt', prompt);
    fd.append('batch_size', String(opts.batchSize === 1 ? 1 : 2));
    if (opts.negativePrompt) fd.append('negative_prompt', String(opts.negativePrompt).slice(0, 512));
    fd.append('image_file', new Blob([pngBytes], { type: 'image/png' }), 'cutout.png');
    const r = await fetch(BASE + '/api/tasks/visual/r-background', {
      method: 'POST', headers: { 'X-API-KEY': key }, body: fd,
      signal: AbortSignal.timeout(30000),
    });
    const txt = await r.text();
    if (r.status !== 200) return { ok: false, error: { code: 'picwish_rbg_http_' + r.status, message: txt.slice(0, 300) } };
    let j; try { j = JSON.parse(txt); } catch { return { ok: false, error: { code: 'picwish_rbg_bad_json', message: txt.slice(0, 200) } }; }
    const tid = j.data && j.data.task_id;
    if (!tid) return { ok: false, error: { code: 'picwish_rbg_no_task', message: txt.slice(0, 200) } };
    return { ok: true, taskId: tid };
  } catch (e) {
    return { ok: false, error: { code: 'picwish_rbg_create_exception', message: String(e && e.message || e) } };
  }
}

export async function picwishRBackgroundQuery(env, taskId) {
  const key = env.PICWISH_API_KEY;
  if (!key) return { ok: false, error: { code: 'picwish_not_configured', message: 'PICWISH_API_KEY 未配置' } };
  if (!taskId) return { ok: false, error: { code: 'bad_task_id', message: '缺少 task_id' } };
  try {
    const r = await fetch(BASE + '/api/tasks/visual/r-background/' + encodeURIComponent(taskId), {
      headers: { 'X-API-KEY': key },
      signal: AbortSignal.timeout(20000),
    });
    const txt = await r.text();
    if (r.status !== 200) return { ok: false, error: { code: 'picwish_rbg_q_http_' + r.status, message: txt.slice(0, 200) } };
    let j; try { j = JSON.parse(txt); } catch { return { ok: false, error: { code: 'picwish_rbg_q_bad_json', message: txt.slice(0, 200) } }; }
    const d = j.data || {};
    const state = Number(d.state);
    if (state < 0) return { ok: false, state, error: { code: 'picwish_rbg_task_failed', message: 'state=' + state + ' ' + (j.message || '').slice(0, 150) } };
    if (state !== 1) return { ok: true, state, pending: true, progress: Number(d.progress) || 0 };
    const urls = [d.image_1, d.image_2, d.image_3, d.image_4].filter(u => typeof u === 'string' && /^https?:\/\//.test(u));
    if (!urls.length) return { ok: false, error: { code: 'picwish_rbg_no_image', message: txt.slice(0, 200) } };
    return { ok: true, state: 1, urls };
  } catch (e) {
    return { ok: false, error: { code: 'picwish_rbg_q_exception', message: String(e && e.message || e) } };
  }
}

/* =====================================================================
 * scale（AI 超分/清晰化）：对抠图 PNG 做 type=clean 超分，注入真实细节。
 * ---------------------------------------------------------------------
 * POST {BASE}/api/tasks/visual/scale
 *   multipart: image_file=PNG字节, sync=1, type=clean, scale_factor=2, format=png
 * 响应：{ status:200, data:{ state:1, image:url } }
 *   返回 URL（OSS预签名1h过期），需下载字节。输出为 RGBA PNG，alpha 保留。
 * 计费：2 算粒/张（≤2048）。
 * 用途：白底工艺 v3——cutout 后先超分再前端白底合成，解决产品柔糊。
 * ===================================================================*/

/**
 * 调 scale 超分（type=clean），返回超分后的 PNG 字节。
 * @param {object} env Worker env（含 PICWISH_API_KEY）
 * @param {Uint8Array} pngBytes 透明抠图 PNG 字节
 * @param {object} [opts] { scaleFactor?: number }
 * @returns {Promise<{ok:true,bytes:Uint8Array,width:number,height:number,ms:number}|
 *                   {ok:false,error:{code,message?}}>}
 */
export async function picwishScale(env, pngBytes, opts = {}) {
  const t0 = Date.now();
  const key = env.PICWISH_API_KEY;
  if (!key) return { ok: false, error: { code: 'picwish_not_configured', message: 'PICWISH_API_KEY 未配置' } };
  if (!(pngBytes instanceof Uint8Array) || pngBytes.length < 100) {
    return { ok: false, error: { code: 'bad_png_bytes', message: 'scale 需要 PNG 字节' } };
  }
  try {
    const fd = new FormData();
    fd.append('sync', '1');
    fd.append('type', 'clean');
    fd.append('scale_factor', String(opts.scaleFactor || 2));
    fd.append('format', 'png');
    const inMime = opts.mime || 'image/png';
    const inExt = /jpe?g/i.test(inMime) ? 'jpg' : 'png';
    fd.append('image_file', new Blob([pngBytes], { type: inMime }), 'cutout.' + inExt);
    const r = await fetch(BASE + '/api/tasks/visual/scale', {
      method: 'POST',
      headers: { 'X-API-KEY': key },
      body: fd,
      signal: AbortSignal.timeout(150000),
    });
    const txt = await r.text();
    if (r.status !== 200) {
      return { ok: false, error: { code: 'picwish_scale_http_' + r.status, message: txt.slice(0, 300) } };
    }
    let j;
    try { j = JSON.parse(txt); }
    catch { return { ok: false, error: { code: 'picwish_scale_bad_json', message: txt.slice(0, 200) } }; }
    if (j.status !== 200 || !j.data || j.data.state !== 1) {
      return { ok: false, error: { code: 'picwish_scale_task_failed', message: 'state=' + (j.data && j.data.state) + ' msg=' + (j.message || '').slice(0, 200) } };
    }
    const imgUrl = j.data.image;
    if (!imgUrl || typeof imgUrl !== 'string') {
      return { ok: false, error: { code: 'picwish_scale_no_image', message: txt.slice(0, 200) } };
    }
    // 下载超分图字节
    const dl = await fetch(imgUrl, { signal: AbortSignal.timeout(60000) });
    if (!dl.ok) {
      return { ok: false, error: { code: 'picwish_scale_dl_http_' + dl.status, message: '下载超分图失败' } };
    }
    const bytes = new Uint8Array(await dl.arrayBuffer());
    const size = pngSize(bytes);
    return { ok: true, bytes, width: size.width, height: size.height, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: { code: 'picwish_scale_exception', message: String(e && e.message || e) } };
  }
}

/**
 * dataURL 友好的 scale 超分封装（可复用）：输入图片 dataURL（jpeg/png/webp），
 * 输出超分后的 PNG dataURL（alpha 保留）。供 /superres 在 AutoDL 不可用时降级使用。
 * @param {object} env Worker env（含 PICWISH_API_KEY）
 * @param {string} dataUrl 输入图片 dataURL
 * @param {object} [opts] { scaleFactor?: number }
 * @returns {Promise<{ok:true,image:string,width:number,height:number,ms:number}|
 *                    {ok:false,error:{code:string,message?:string}}>}
 */
export async function picwishScaleDataUrl(env, dataUrl, opts = {}) {
  const info = dataUrlToBytes(dataUrl);
  if (!info) return { ok: false, error: { code: 'bad_dataurl', message: '图片 dataURL 不合法' } };
  const r = await picwishScale(env, info.bytes, { ...opts, mime: info.mime });
  if (!r.ok) return r;
  return { ok: true, image: bytesToPngDataUrl(r.bytes), width: r.width, height: r.height, ms: r.ms };
}
