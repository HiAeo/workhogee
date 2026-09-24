/* ============================================================================
 * HogeeFidelity · 阿图保真管线（可复用 / 多端）
 * ----------------------------------------------------------------------------
 * 设计目标：保真类处理（抠图 / 局部裁剪 / 合成主体）绝不走生成式重绘，
 *           产品原像素 100% 保留，字母 / Logo / 型号零变形。
 *
 * 分层（遵循「一次开发，多端复用」）：
 *   1. Pixel* 纯像素逻辑：只读写传入的 RGBA buffer，不碰 window/document，可复用。
 *   2. WebPlatform：Web 专用适配（Image / Canvas / 编码）。小程序端替换此对象即可。
 *   3. package()：中立 API 编排，接口 token 鉴权、参数通用，PWA/小程序可直接复用。
 *
 * 调用方注入 call(endpoint, body) -> Promise<json>（已含鉴权与超时）。
 * 输出：{ white, fg, details:[{label,image}], sceneEnhanced, replacedBg:[] }
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ================= 纯像素工具（可复用，无 DOM） ================= */
  const P = {
    clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; },
    // 兼容 0~1 / 0~100 / 0~1000 的归一化框 -> [x,y,w,h]（0~1）
    normBox(b, scaleW, scaleH) {
      let m = 1;
      const maxv = Math.max(b[0], b[1], b[2], b[3]);
      if (maxv > 10) m = maxv > 200 ? 1000 : 100;
      return [b[0] / m, b[1] / m, b[2] / m, b[3] / m];
    },
    // 灰度 mask（dataURL）-> 灰度 Uint8ClampedArray（尺寸 w*h）
    maskToGray(maskImg) {
      const w = maskImg.width, h = maskImg.height, g = new Uint8ClampedArray(w * h);
      const d = maskImg.data;
      for (let i = 0; i < w * h; i++) g[i] = d[i * 4]; // 灰度图 R=G=B，取 R
      return g;
    },
    // mask 灰度的包围盒（>thr）
    maskBox(gray, w, h, thr) {
      let x0 = w, y0 = h, x1 = 0, y1 = 0, hit = false;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (gray[y * w + x] > thr) {
          hit = true; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return hit ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
    },
    iou(a, b) {
      const ax = a.x, ay = a.y, ax2 = a.x + a.w, ay2 = a.y + a.h;
      const bx = b.x, by = b.y, bx2 = b.x + b.w, by2 = b.y + b.h;
      const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(ax, bx));
      const iy = Math.max(0, Math.min(ay2, by2) - Math.max(ay, by));
      const inter = ix * iy, uni = a.w * a.h + b.w * b.h - inter;
      return uni > 0 ? inter / uni : 0;
    },
    // 按归一化框从源 RGBA 裁剪，返回新 {width,height,data}；pad=预留边距比例
    cropRGBA(src, box, pad) {
      const W = src.width, H = src.height;
      let x = box[0] * W, y = box[1] * H, w = box[2] * W, h = box[3] * H;
      if (pad) { x -= w * pad; y -= h * pad; w *= 1 + pad * 2; h *= 1 + pad * 2; }
      x = Math.round(Math.max(0, x)); y = Math.round(Math.max(0, y));
      w = Math.round(Math.min(W - x, w)); h = Math.round(Math.min(H - y, h));
      const data = new Uint8ClampedArray(w * h * 4);
      for (let j = 0; j < h; j++) {
        const sy = (y + j) * W * 4 + x * 4, di = j * w * 4;
        data.set(src.data.subarray(sy, sy + w * 4), di);
      }
      return { width: w, height: h, data };
    },
    // 连通域：返回 {lab(Int32 -1), sizes}，8 邻域，alpha>=thr
    connected(rgba, thr) {
      const W = rgba.width, H = rgba.height, d = rgba.data, N = W * H;
      const lab = new Int32Array(N).fill(-1), sizes = [], stk = [];
      let cur = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (d[i * 4 + 3] < thr || lab[i] !== -1) continue;
        lab[i] = cur; stk.length = 0; stk.push(i); let n = 0;
        while (stk.length) {
          const q = stk.pop(); n++; const qx = q % W, qy = (q / W) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const ni = ny * W + nx; if (d[ni * 4 + 3] < thr || lab[ni] !== -1) continue;
            lab[ni] = cur; stk.push(ni);
          }
        }
        sizes.push(n); cur++;
      }
      return { lab, sizes };
    },
    // 删除与最大主体不相连、且小于 minPx 的碎屑
    dropSmall(rgba, minPx, thr) {
      const { lab, sizes } = P.connected(rgba, thr);
      let big = 0; for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[big]) big = k;
      const d = rgba.data;
      for (let i = 0; i < rgba.width * rgba.height; i++) {
        if (lab[i] >= 0 && lab[i] !== big && sizes[lab[i]] < minPx) d[i * 4 + 3] = 0;
      }
    },
    // alpha 包围盒（>thr），返回归一化 [x,y,w,h] 及像素框
    alphaBox(rgba, thr) {
      const W = rgba.width, H = rgba.height, d = rgba.data;
      let x0 = W, y0 = H, x1 = 0, y1 = 0, hit = false;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > thr) {
          hit = true; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      if (!hit) return null;
      return { px: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
    },
  };

  /* ================= Web 平台适配层（Web 专用） =================
   * 小程序端：用 wx canvas / wx.getImageInfo 实现同名方法即可，上层不变。 */
  const WebPlatform = {
    loadImage(u) {
      return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
    },
    fromImage(img) {
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0); return c;
    },
    create(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
    toRGBA(c) { const im = c.getContext('2d').getImageData(0, 0, c.width, c.height); return { width: c.width, height: c.height, data: im.data }; },
    fromGray(gray, w, h) {
      const c = this.create(w, h), x = c.getContext('2d'), im = x.createImageData(w, h);
      for (let i = 0; i < w * h; i++) { im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = gray[i]; im.data[i * 4 + 3] = 255; }
      x.putImageData(im, 0, 0); return c;
    },
    rgbaToCanvas(rgba) {
      const c = this.create(rgba.width, rgba.height);
      c.getContext('2d').putImageData(new ImageData(rgba.data, rgba.width, rgba.height), 0, 0); return c;
    },
    toDataURL(c, type, q) { return c.toDataURL(type || 'image/jpeg', q || 0.92); },
  };

  /* ================= 保真管线编排（可复用） ================= */
  const HogeeFidelity = { _P: P, _platform: WebPlatform };

  // 视觉定位：productBox（必有）+ wheels（有轮商品）
  HogeeFidelity.locate = async function (call, image) {
    const ask = '请定位图中待售卖的商品，只输出 JSON：{"productBox":[x,y,w,h] 为紧密包围商品主体的矩形，x、w 按图宽归一化，y、h 按图高归一化；若商品是自行车、车辆等带明显圆形车轮，再给 "wheels":[{"cx","cy","r"}]，cx、r 按图宽归一化、cy 按图高归一化，没有车轮则不要 wheels}。';
    const r = await call('/vision-json', { image, ask, maxTokens: 700 });
    const d = (r && r.data) || {};
    let pb = d.productBox, wheels = d.wheels || null;
    if (!Array.isArray(pb)) return { ok: false };
    const m = Math.max(pb[0], pb[1], pb[2], pb[3]) > 200 ? 1000 : (Math.max(pb[0], pb[1], pb[2], pb[3]) > 10 ? 100 : 1);
    pb = [pb[0] / m, pb[1] / m, pb[2] / m, pb[3] / m];
    if (wheels && Array.isArray(wheels)) {
      wheels = wheels.map(z => ({ cx: z.cx, cy: z.cy, r: z.r }));
    } else wheels = null;
    return { ok: true, productBox: pb, wheels };
  };

  // 在多张高清 mask 中选出“商品实体”那一层
  HogeeFidelity.pickMask = function (masks, loc, W, H) {
    const pb = { x: loc.productBox[0] * W, y: loc.productBox[1] * H, w: loc.productBox[2] * W, h: loc.productBox[3] * H };
    const cx = (loc.productBox[0] + loc.productBox[2] / 2) * W, cy = (loc.productBox[1] + loc.productBox[3] / 2) * H;
    const wheels = loc.wheels ? loc.wheels.map(z => ({ cx: z.cx * W, cy: z.cy * H, r: z.r * W })) : [];
    let best = -1, bestScore = -1, stats = [];
    masks.forEach((m, idx) => {
      const g = P.maskToGray(m), mw = m.width, mh = m.height;
      const box = P.maskBox(g, mw, mh, 128);
      let score = box ? P.iou(box, pb) : 0;
      const gi = Math.round(Math.min(mh - 1, Math.max(0, cy))) * mw + Math.round(Math.min(mw - 1, Math.max(0, cx)));
      if (g[gi] > 110) score += 1.5;
      wheels.forEach((wz) => { const wi = Math.round(Math.min(mh - 1, Math.max(0, wz.cy))) * mw + Math.round(Math.min(mw - 1, Math.max(0, wz.cx))); if (g[wi] > 100) score += 1.5; });
      stats.push({ idx, score: Math.round(score * 100) / 100 });
      if (score > bestScore) { bestScore = score; best = idx; }
    });
    return { best, bestScore, stats };
  };

  /* 核心：高清原图 × 商品 mask，再精细键控去背景，返回高清透明前景 RGBA。
   * 有车轮：轮圈环带精细键控（保黑辐条 / 删暗彩背景 / 删灰背景 / 保白反光片）。
   * 通用：productBox 外删绿/褐/灰背景，Box 内仅删强彩背景。 */
  HogeeFidelity.buildFg = function (srcRGBA, maskGray, loc) {
    const W = srcRGBA.width, H = srcRGBA.height, od = new Uint8ClampedArray(srcRGBA.data); // 拷贝像素
    // 1) mask 灰度直接作 alpha
    for (let i = 0; i < W * H; i++) od[i * 4 + 3] = maskGray[i];
    const wheels = loc.wheels ? loc.wheels.map(z => ({ cx: z.cx * W, cy: z.cy * H, r: z.r * W })) : [];
    const pb = loc.productBox;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4, A = od[p + 3]; if (A < 12) continue;
      const R = od[p], G = od[p + 1], B = od[p + 2], lum = (R + G + B) / 3;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B), sat = (mx - mn) / (mx + 1);
      if (R > 150 && R - G > 40 && R - B > 50) continue; // 品牌橙保留
      const inPb = x >= pb[0] * W && x <= (pb[0] + pb[2]) * W && y >= pb[1] * H && y <= (pb[1] + pb[3]) * H;
      // 找车轮归属
      let wh = null;
      for (const wz of wheels) { const dd = Math.hypot(x - wz.cx, y - wz.cy); if (dd < wz.r * 0.98) { wh = { wz, dd }; break; } }
      if (wh) {
        const r = wh.wz.r, dd = wh.dd;
        if (dd > r * 0.85) continue;                       // 黑色轮胎环整体保留
        if (dd < r * 0.24) continue;                       // 中央碟刹花鼓保留
        if (G - R > 12 && G - B > 10) { od[p + 3] = 0; continue; }
        if (lum < 72) continue;                            // 黑辐条
        if (lum >= 72 && lum < 112 && sat > 0.12) { od[p + 3] = 0; continue; }
        if (lum >= 112 && lum <= 178 && sat < 0.38) { od[p + 3] = 0; continue; }
        if (lum > 178 && sat < 0.2) { od[p] = 255; od[p + 1] = 255; od[p + 2] = 255; } // 亮白（反光片+透镂空背景）统一染白保 alpha，叠白底即净
        continue;
      }
      // 非车轮区域
      const isGreen = G - R > 14 && G - B > 12;
      const isBrown = R > G && G >= B && (R - B) > 16 && sat > 0.12 && sat < 0.42 && lum > 98 && lum < 162;
      const isGrey = sat < 0.36 && lum > 104 && lum < 178;
      if (inPb) { if (isGreen) od[p + 3] = 0; continue; }  // 商品内仅删强绿
      if (isGreen || isBrown || isGrey) od[p + 3] = 0;
    }
    // defringe：清抗锯齿边缘的白亮低饱和半透明残留（实体边缘 A 接近 255，不受影响）
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4, A = od[p + 3];
      if (A < 212 && A > 18) {
        const R = od[p], G = od[p + 1], B = od[p + 2], lum = (R + G + B) / 3;
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B), sat = (mx - mn) / (mx + 1);
        if (lum > 150 && sat < 0.25) od[p + 3] = 0;
      }
    }
    const rgba = { width: W, height: H, data: od };
    P.dropSmall(rgba, 1500, 24);
    return rgba;
  };

  // trim 到 alpha 包围盒（+边距）
  HogeeFidelity.trim = function (rgba, margin) {
    const b = P.alphaBox(rgba, 20); if (!b) return rgba;
    const { x, y, w, h } = b.px, m = Math.round(Math.max(w, h) * (margin || 0.02));
    const box = [
      (x - m) / rgba.width, (y - m) / rgba.height,
      (w + m * 2) / rgba.width, (h + m * 2) / rgba.height,
    ];
    return P.cropRGBA(rgba, box, 0);
  };

  // 合成白底电商主图（contain 居中 + 椭圆软阴影）
  HogeeFidelity.onWhite = function (fgRGBA, size, containW, containH) {
    const c = WebPlatform.create(size, size), x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, size, size);
    const sc = Math.min(size * containW / fgRGBA.width, size * containH / fgRGBA.height);
    const fw = fgRGBA.width * sc, fh = fgRGBA.height * sc;
    const left = (size - fw) / 2, top = (size - fh) / 2;
    // 软阴影（贴近底部）
    const gy = top + fh * 0.96;
    const g = x.createRadialGradient(size / 2, gy, 4, size / 2, gy, fw * 0.5);
    g.addColorStop(0, 'rgba(0,0,0,0.20)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(size / 2, gy, fw * 0.5, fw * 0.06, 0, 0, 7); x.fill();
    const fc = WebPlatform.rgbaToCanvas(fgRGBA);
    x.drawImage(fc, left, top, fw, fh);
    return c;
  };

  /* 阶段B：3 张卖点局部（视觉选框 -> 原图裁剪 -> 保真超分 x2），并行 */
  HogeeFidelity.details = async function (call, image, srcRGBA, category, product) {
    const r = await call('/details-plan', { image, category: category || '', product: product || '' });
    const ds = (r && r.details) || [];
    const tasks = ds.map(async (d) => {
      let box = P.normBox(d.bbox);
      box = [box[0], box[1], box[2], box[3]];
      let crop = P.cropRGBA(srcRGBA, box, 0.04);
      // 超分输入边长 [256,1024]：先把最长边标准化到 ~800
      const long = Math.max(crop.width, crop.height);
      let normCanvas = WebPlatform.rgbaToCanvas(crop);
      if (long > 1024 || long < 256) {
        const t = long > 1024 ? 1024 / long : 800 / long;
        const nw = Math.round(crop.width * t), nh = Math.round(crop.height * t);
        const nc = WebPlatform.create(nw, nh); nc.getContext('2d').drawImage(normCanvas, 0, 0, nw, nh); normCanvas = nc;
      }
      const sr = await call('/superres', { image: normCanvas.toDataURL('image/png'), quality: 'MQ' });
      return { label: d.label, image: sr.image };
    });
    return Promise.all(tasks);
  };

  /* 阶段C（默认）：原场景画质增强 = 保真超分，零边缘问题 */
  HogeeFidelity.sceneEnhanced = async function (call, image) {
    // 原图若边长超 1024，超分前先降到 1024 内（超分固定 x2）
    const im = await WebPlatform.loadImage(image);
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, long = Math.max(w, h);
    let inUrl = image;
    if (long > 1024) {
      const t = 1024 / long, c = WebPlatform.create(Math.round(w * t), Math.round(h * t));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); inUrl = c.toDataURL('image/png');
    }
    const r = await call('/superres', { image: inUrl, quality: 'MQ' });
    return r.image;
  };

  /* 总入口：一张商品图 -> 保真全套
   * o:{ call, image, category?, product?, doDetails:true, doScene:true } */
  HogeeFidelity.package = async function (o) {
    const call = o.call, image = o.image;
    const img0 = await WebPlatform.loadImage(image);
    const srcCanvas = WebPlatform.fromImage(img0);
    const srcRGBA = WebPlatform.toRGBA(srcCanvas);
    // 高清 mask 图层
    const layers = await call('/cutout', { image, strategy: 'layers', maxEntity: 12 });
    if (!layers.masks || !layers.masks.length) return { ok: false, error: 'no_mask' };
    const maskRGBAs = await Promise.all(layers.masks.map((u) => WebPlatform.loadImage(u).then((im) => WebPlatform.fromImage(im)).then((cv) => WebPlatform.toRGBA(cv))));
    // 定位
    const loc = await HogeeFidelity.locate(call, image);
    if (!loc.ok) return { ok: false, error: 'no_locate' };
    // 选商品 mask
    const picked = HogeeFidelity.pickMask(maskRGBAs, loc, srcRGBA.width, srcRGBA.height);
    const maskRGBA = maskRGBAs[picked.best];
    const maskGray = P.maskToGray(maskRGBA);
    // 高清透明前景
    let fgRGBA = HogeeFidelity.buildFg(srcRGBA, maskGray, loc);
    fgRGBA = HogeeFidelity.trim(fgRGBA, 0.02);
    const fgCanvas = WebPlatform.rgbaToCanvas(fgRGBA);
    // 白底
    const whiteCanvas = HogeeFidelity.onWhite(fgRGBA, 2048, 0.84, 0.82);
    const out = {
      ok: true,
      white: WebPlatform.toDataURL(whiteCanvas, 'image/jpeg', 0.92),
      fg: fgCanvas.toDataURL('image/png'),
      meta: { picked: picked.best, score: picked.bestScore, stats: picked.stats, wheels: loc.wheels ? loc.wheels.length : 0 },
    };
    // 3 局部
    if (o.doDetails !== false) {
      try { out.details = await HogeeFidelity.details(call, image, srcRGBA, o.category, o.product); }
      catch (e) { out.details = []; }
    }
    // 原场景增强
    if (o.doScene !== false) {
      try { out.sceneEnhanced = await HogeeFidelity.sceneEnhanced(call, image); }
      catch (e) { out.sceneEnhanced = null; }
    }
    return out;
  };

  global.HogeeFidelity = HogeeFidelity;
})(typeof window !== 'undefined' ? window : globalThis);
