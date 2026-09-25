/* ============================================================================
 * HogeeFidelity · 阿图保真管线 v2（可复用 / 多端）
 * ----------------------------------------------------------------------------
 * 核心原则：保真类处理绝不走生成式重绘，产品原像素 100% 保留、零变形。
 *
 * v2 路线（全部基于已上线 CV 能力，无需额外开通）：
 *   - saliency_seg（显著主体抠图）：懂“取主体”语义，轮圈镂空干净、零变形。
 *   - lens_nnsr2 超分：把 saliency 前景 x2 放大到高清，不重绘。
 *   - 白底：干净透明前景 -> 去边缘色晕 -> 超分 -> 上白底。
 *   - 卖点局部：原图裁局部 -> saliency 去原场景背景 -> 超分 -> 贴干净特写底。
 *   - 场景图：原图超分 -> 按车体收紧裁剪，放大商品占比（真实背景、零风险）。
 *
 * 分层（遵循「一次开发，多端复用」）：
 *   1. Pixel* 纯像素逻辑：只读写 RGBA buffer，不碰 window/document，可复用。
 *   2. WebPlatform：Web 专用适配（Image / Canvas / 编码），小程序端替换即可。
 *   3. package()：中立 API 编排，token 鉴权、参数通用，PWA/小程序可直接复用。
 *
 * 调用方注入 call(endpoint, body) -> Promise<json>（已含鉴权与超时）。
 * 输出：{ ok, white, fg, details:[{label,image}], sceneEnhanced, meta }
 * ========================================================================== */
(function (global) {
  'use strict';

  /* ================= 纯像素工具（可复用，无 DOM） ================= */
  const P = {
    clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; },
    // 兼容 0~1 / 0~100 / 0~1000 的归一化框 -> [x,y,w,h]（0~1）
    normBox(b) {
      const maxv = Math.max(b[0], b[1], b[2], b[3]);
      const m = maxv > 200 ? 1000 : (maxv > 10 ? 100 : 1);
      return [b[0] / m, b[1] / m, b[2] / m, b[3] / m];
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
    // alpha 包围盒（>thr），返回像素框
    alphaBox(rgba, thr) {
      const W = rgba.width, H = rgba.height, d = rgba.data;
      let x0 = W, y0 = H, x1 = 0, y1 = 0, hit = false;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] > thr) {
          hit = true; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return hit ? { px: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } } : null;
    },
    // 判断是否为"真实生活场景"照片；透明底 / 纯色底（抠图、白底主图）返回 false
    hasRealScene(rgba) {
      const W = rgba.width, H = rgba.height, d = rgba.data;
      const bx = Math.max(2, Math.round(W * 0.04)), by = Math.max(2, Math.round(H * 0.04));
      let n = 0, trans = 0, rs = 0, gs = 0, bs = 0;
      const sample = (x, y) => {
        const q = (y * W + x) * 4; n++;
        if (d[q + 3] < 24) { trans++; return; }
        rs += d[q]; gs += d[q + 1]; bs += d[q + 2];
      };
      for (let x = 0; x < W; x++) { for (let y = 0; y < by; y++) { sample(x, y); sample(x, H - 1 - y); } }
      for (let y = 0; y < H; y++) { for (let x = 0; x < bx; x++) { sample(x, y); sample(W - 1 - x, y); } }
      if (n && trans / n > 0.55) return false;
      const den = (n - trans) || 1, mr = rs / den, mg = gs / den, mb = bs / den;
      let same = 0, m2 = 0;
      const near = (x, y) => {
        const q = (y * W + x) * 4; if (d[q + 3] < 24) return;
        m2++;
        if (Math.abs(d[q] - mr) < 14 && Math.abs(d[q + 1] - mg) < 14 && Math.abs(d[q + 2] - mb) < 14) same++;
      };
      for (let x = 0; x < W; x++) { for (let y = 0; y < by; y++) { near(x, y); near(x, H - 1 - y); } }
      for (let y = 0; y < H; y++) { for (let x = 0; x < bx; x++) { near(x, y); near(W - 1 - x, y); } }
      if (m2 && same / m2 > 0.88) return false;
      return true;
    },
    // 在透明前景（整车横图）上检测两个等大、同高的轮胎圆，返回 [{cx,cy,r}*2]
    detectWheels(rgba) {
      const W = rgba.width, H = rgba.height, d = rgba.data;
      const pts = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const q = (y * W + x) * 4;
        if (d[q + 3] > 180 && d[q] < 80 && d[q + 1] < 80 && d[q + 2] < 84) pts.push([x, y]);
      }
      if (pts.length < 200) return null;
      const vote = (cy, R) => {
        const Lb = new Float32Array(Math.ceil(W / 4) + 1), Rb = new Float32Array(Lb.length);
        for (const [px, py] of pts) {
          const dy = py - cy, rad = R * R - dy * dy; if (rad <= 0) continue;
          const dx = Math.sqrt(rad);
          for (const cx of [px - dx, px + dx]) {
            if (cx >= W * 0.10 && cx <= W * 0.46) Lb[Math.round(cx / 4)]++;
            else if (cx >= W * 0.54 && cx <= W * 0.90) Rb[Math.round(cx / 4)]++;
          }
        }
        let li = 0, ri = 0;
        for (let i = 1; i < Lb.length; i++) { if (Lb[i] > Lb[li]) li = i; if (Rb[i] > Rb[ri]) ri = i; }
        return { lx: li * 4, rx: ri * 4, score: Lb[li] + Rb[ri] };
      };
      let best = null;
      for (let cy = H * 0.46; cy <= H * 0.60; cy += 2)
        for (let R = H * 0.40; R <= H * 0.50; R += 2) {
          const v = vote(cy, R);
          if (!best || v.score > best.score) best = Object.assign({ cy, R }, v);
        }
      if (!best || best.score < pts.length * 0.25) return null;
      return [{ cx: best.lx, cy: best.cy, r: best.R }, { cx: best.rx, cy: best.cy, r: best.R }];
    },
    // alpha 二值形态学开运算（可分离：腐蚀min -> 膨胀max，窗口 2k+1），返回新 Uint8 alpha
    morphOpenAlpha(rgba, k) {
      const W = rgba.width, H = rgba.height, d = rgba.data, n = W * H;
      const bin = new Uint8Array(n);
      for (let i = 0; i < n; i++) bin[i] = d[i * 4 + 3] > 120 ? 255 : 0;
      const tmp = new Uint8Array(n);
      const ero = new Uint8Array(n);
      for (let y = 0; y < H; y++) { const row = y * W; for (let x = 0; x < W; x++) {
        let m = 255; for (let kk = -k; kk <= k; kk++) { const xx = x + kk; if (xx >= 0 && xx < W && bin[row + xx] < m) m = bin[row + xx]; }
        tmp[row + x] = m;
      } }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let m = 255; for (let kk = -k; kk <= k; kk++) { const yy = y + kk; if (yy >= 0 && yy < H && tmp[yy * W + x] < m) m = tmp[yy * W + x]; }
        ero[y * W + x] = m;
      }
      for (let y = 0; y < H; y++) { const row = y * W; for (let x = 0; x < W; x++) {
        let m = 0; for (let kk = -k; kk <= k; kk++) { const xx = x + kk; if (xx >= 0 && xx < W && ero[row + xx] > m) m = ero[row + xx]; }
        tmp[row + x] = m;
      } }
      const out = new Uint8Array(n);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let m = 0; for (let kk = -k; kk <= k; kk++) { const yy = y + kk; if (yy >= 0 && yy < H && tmp[yy * W + x] > m) m = tmp[yy * W + x]; }
        out[y * W + x] = m;
      }
      return out;
    },
    // 背景复杂度评分 0~1（品类无关）：在 productBox（归一化[x,y,w,h]）之外
    // 统计边缘密度 + 灰度方差；主体本身纹理（如辐条）不计入。降采样到长边256。
    bgComplexity(rgba, productBox) {
      const W0 = rgba.width, H0 = rgba.height, d = rgba.data;
      const L = 256, sc = L / Math.max(W0, H0), W = Math.max(8, Math.round(W0 * sc)), H = Math.max(8, Math.round(H0 * sc));
      const gray = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const sx = Math.min(W0 - 1, Math.max(0, Math.round(x / sc))), sy = Math.min(H0 - 1, Math.max(0, Math.round(y / sc)));
        const q = (sy * W0 + sx) * 4;
        gray[y * W + x] = 0.299 * d[q] + 0.587 * d[q + 1] + 0.114 * d[q + 2];
      }
      let bx = 0, by = 0, bw = W, bh = 0;
      if (productBox) { bx = productBox[0] * W; by = productBox[1] * H; bw = productBox[2] * W; bh = productBox[3] * H; }
      const pad = Math.round(Math.max(bw, Math.max(bh, 1)) * 0.08);
      const inb = (x, y) => productBox && x > bx - pad && x < bx + bw + pad && y > by - pad && y < by + bh + pad;
      let edgeN = 0, n = 0, rsum = 0, rsq = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        if (inb(x, y)) continue;
        n++;
        const gx = gray[y * W + x + 1] - gray[y * W + x - 1], gyv = gray[(y + 1) * W + x] - gray[(y - 1) * W + x];
        if (Math.abs(gx) + Math.abs(gyv) > 42) edgeN++;
        const g = gray[y * W + x]; rsum += g; rsq += g * g;
      }
      if (n < 20) return 0;
      const edgeDensity = edgeN / n, mean = rsum / n, variance = Math.max(0, rsq / n - mean * mean) / (128 * 128);
      return Math.min(1, edgeDensity * 3.4 + variance * 0.55);
    },
    // alpha 质检：midAlpha=半透明(31..204)占非透明比；coverage=非透明占整图比
    alphaQC(rgba) {
      const W = rgba.width, H = rgba.height, d = rgba.data, N = W * H;
      let solid = 0, mid = 0;
      for (let i = 0; i < N; i++) { const a = d[i * 4 + 3]; if (a >= 205) solid++; else if (a > 30) mid++; }
      const nonT = solid + mid;
      return { midAlpha: nonT ? mid / nonT : 0, coverage: nonT / N, solid, mid };
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
    rgbaToCanvas(rgba) {
      const c = this.create(rgba.width, rgba.height);
      c.getContext('2d').putImageData(new ImageData(rgba.data, rgba.width, rgba.height), 0, 0); return c;
    },
    toDataURL(c, type, q) { return c.toDataURL(type || 'image/jpeg', q || 0.92); },
  };

  /* ================= 保真管线编排（可复用） ================= */
  const HogeeFidelity = { _P: P, _platform: WebPlatform };

  // 品类保真分级：A 只抠不画 / B 抠+轻补全 / C 允许适度重绘（可扩展、品类无关）
  HogeeFidelity.fidelityLevel = function (category) {
    const c = String(category || '').toLowerCase();
    const A = ['自行车','骑行','乐器','吉他','钢琴','提琴','3c','数码','手机','电脑','相机','镜头','机械','设备','家电','电器','汽车','车辆','摩托','五金','工具','钟表','手表','键盘','平板','音响','耳机'];
    const C = ['鲜花','花卉','花束','花艺','食品','零食','餐饮','美食','生鲜','水果','烘焙','蛋糕','饮品','奶茶','咖啡','茶','酒','农产品','蔬菜','宠物'];
    const B = ['服装','男装','女装','童装','鞋','箱包','背包','皮具','家居','家具','家纺','母婴','玩具','运动','户外','饰品','首饰','眼镜'];
    for (const k of A) if (c.includes(k)) return 'A';
    for (const k of C) if (c.includes(k)) return 'C';
    for (const k of B) if (c.includes(k)) return 'B';
    return 'B';
  };

  // 视觉定位：productBox（必有）+ wheels（有轮商品）
  HogeeFidelity.locate = async function (call, image) {
    const ask = '请定位图中待售卖的商品，只输出 JSON：{"productBox":[x,y,w,h] 为紧密包围商品主体的矩形，x、w 按图宽归一化，y、h 按图高归一化；若商品是自行车、车辆等带明显圆形车轮，再给 "wheels":[{"cx","cy","r"}]，cx、r 按图宽归一化、cy 按图高归一化，没有车轮则不要 wheels}。';
    const r = await call('/vision-json', { image, ask, maxTokens: 700 });
    const d = (r && r.data) || {};
    let pb = d.productBox, wheels = d.wheels || null;
    if (!Array.isArray(pb)) return { ok: false };
    pb = P.normBox(pb);
    if (wheels && Array.isArray(wheels)) wheels = wheels.map(z => ({ cx: z.cx, cy: z.cy, r: z.r }));
    else wheels = null;
    return { ok: true, productBox: pb, wheels };
  };

  // 去边缘彩色光晕（轮胎外缘绿边等）：半透明边缘像素去色，保留 alpha
  HogeeFidelity.defringeEdge = function (rgba) {
    const d = rgba.data, N = rgba.width * rgba.height;
    for (let i = 0; i < N; i++) {
      const p = i * 4, A = d[p + 3];
      if (A < 24 || A > 228) continue;
      const R = d[p], G = d[p + 1], B = d[p + 2], lum = (R + G + B) / 3;
      const sat = (Math.max(R, G, B) - Math.min(R, G, B)) / (Math.max(R, G, B) + 1);
      if (sat > 0.20) { d[p] = lum; d[p + 1] = lum; d[p + 2] = lum; }
    }
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
    const gy = top + fh * 0.96;
    const g = x.createRadialGradient(size / 2, gy, 4, size / 2, gy, fw * 0.5);
    g.addColorStop(0, 'rgba(0,0,0,0.20)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(size / 2, gy, fw * 0.5, fw * 0.06, 0, 0, 7); x.fill();
    x.drawImage(WebPlatform.rgbaToCanvas(fgRGBA), left, top, fw, fh);
    return c;
  };

  // 圆形放大镜标注卡：透明部件 cover 进大圆（圆边自然裁切放射辐条/斜管），下方卖点标题
  HogeeFidelity.onSpotCard = async function (partUrl, label, size) {
    size = size || 1200;
    const im = await WebPlatform.loadImage(partUrl);
    const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
    const c = WebPlatform.create(size, size), x = c.getContext('2d');
    const bg = x.createRadialGradient(size / 2, size * 0.36, size * 0.06, size / 2, size / 2, size * 0.8);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#edf0f5');
    x.fillStyle = bg; x.fillRect(0, 0, size, size);
    const cx = size / 2, cy = size * 0.44, R = size * 0.30, D = R * 2;
    // 圆投影（径向渐变，底层）
    const sh = x.createRadialGradient(cx, cy + R * 0.10, R * 0.2, cx, cy + R * 0.10, R * 1.05);
    sh.addColorStop(0, 'rgba(20,28,45,0.18)'); sh.addColorStop(1, 'rgba(20,28,45,0)');
    x.fillStyle = sh; x.beginPath(); x.arc(cx, cy + R * 0.08, R * 1.02, 0, 7); x.fill();
    // 圆内部件
    x.save(); x.beginPath(); x.arc(cx, cy, R, 0, 7); x.clip();
    x.fillStyle = '#ffffff'; x.fillRect(cx - R, cy - R, D, D);
    const sc = Math.max(D / iw, D / ih) * 1.06, dw = iw * sc, dh = ih * sc;
    x.drawImage(im, cx - dw / 2, cy - dh / 2, dw, dh);
    x.restore();
    // 圆边框
    x.beginPath(); x.arc(cx, cy, R, 0, 7); x.lineWidth = 2; x.strokeStyle = '#d6dbe3'; x.stroke();
    // 装饰短线 + 卖点标题
    x.fillStyle = '#fb7a22'; x.fillRect(cx - 24, cy + R + 32, 48, 3);
    x.fillStyle = '#1b2333'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '600 44px "PingFang SC","Microsoft YaHei",sans-serif';
    x.fillText(label || '细节特写', cx, cy + R + 80);
    return c;
  };

  // 轮圈镂空环带：保留叉腿等粗管、去除细辐条（形态学开运算）；中心实体与圈边原样
  HogeeFidelity.cleanWheelSpokes = function (rgba, wheels) {
    const opened = P.morphOpenAlpha(rgba, 2);
    const W = rgba.width, H = rgba.height, d = rgba.data;
    for (const w of wheels) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const dx = x - w.cx, dy = y - w.cy, dd = Math.sqrt(dx * dx + dy * dy) / w.r;
        if (dd > 0.90) continue;
        let t = 0;
        if (dd > 0.33 && dd < 0.83) t = 1;
        else if (dd >= 0.28 && dd <= 0.33) t = (dd - 0.28) / 0.05;
        else if (dd >= 0.83 && dd <= 0.88) t = 1 - (dd - 0.83) / 0.05;
        if (t <= 0) continue;
        const i = (y * W + x) * 4;
        d[i + 3] = Math.round(d[i + 3] * (1 - t) + opened[y * W + x] * t);
      }
    }
  };

  /* 卖点局部（3 张）：视觉选框 -> 原图裁剪 -> saliency 去原背景 -> 超分 -> 干净特写底 */
  HogeeFidelity.details = async function (call, image, category, product) {
    const r = await call('/details-plan', { image, category: category || '', product: product || '' });
    const ds = (r && r.details) || [];
    const srcRGBA = WebPlatform.toRGBA(WebPlatform.fromImage(await WebPlatform.loadImage(image)));
    const tasks = ds.map(async (d) => {
      const crop = P.cropRGBA(srcRGBA, P.normBox(d.bbox), 0.10);
      let partCanvas = WebPlatform.rgbaToCanvas(crop);
      const long = Math.max(crop.width, crop.height);
      if (long > 1024) {
        // 过大：缩小到 1024（原像素，保真）
        const t = 1024 / long, nc = WebPlatform.create(Math.round(crop.width * t), Math.round(crop.height * t));
        nc.getContext('2d').drawImage(partCanvas, 0, 0, nc.width, nc.height); partCanvas = nc;
      } else if (long < 640) {
        // 过小：超分补救；失败则回退原图裁剪（保证 partUrl 永远有效）
        try {
          const sr = await call('/superres', { image: partCanvas.toDataURL('image/png'), quality: 'HQ' });
          if (sr && sr.ok && sr.image) partCanvas = WebPlatform.fromImage(await WebPlatform.loadImage(sr.image));
        } catch (e) { /* 回退原裁剪 */ }
      }
      const partUrl = WebPlatform.toDataURL(partCanvas, 'image/png');
      const bc = await HogeeFidelity.onSpotCard(partUrl, d.label, 1200);
      return { label: d.label, image: WebPlatform.toDataURL(bc, 'image/jpeg', 0.92) };
    });
    return Promise.all(tasks);
  };

  /* 场景图：原图超分 -> 按车体收紧裁剪（放大商品占比、真实背景、零风险） */
  HogeeFidelity.sceneEnhanced = async function (call, image, loc) {
    const im = await WebPlatform.loadImage(image);
    if (!P.hasRealScene(WebPlatform.toRGBA(WebPlatform.fromImage(im)))) return null;
    const w = im.naturalWidth || im.width, h = im.naturalHeight || im.height, long = Math.max(w, h);
    let inUrl = image;
    if (long > 1024) {
      const t = 1024 / long, c = WebPlatform.create(Math.round(w * t), Math.round(h * t));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); inUrl = c.toDataURL('image/png');
    }
    const r = await call('/superres', { image: inUrl, quality: 'MQ' });
    if (!loc || !loc.productBox) return r.image;
    const sim = await WebPlatform.loadImage(r.image);
    const sRGBA = WebPlatform.toRGBA(WebPlatform.fromImage(sim));
    const pb = loc.productBox;
    let cw = Math.min(1, pb[2] / 0.66), ch = Math.min(1, pb[3] / 0.74);
    const cxp = pb[0] + pb[2] / 2, cyp = pb[1] + pb[3] / 2;
    let x0 = Math.max(0, Math.min(1 - cw, cxp - cw / 2));
    let y0 = Math.max(0, Math.min(1 - ch, cyp - ch / 2));
    const crop = P.cropRGBA(sRGBA, [x0, y0, cw, ch], 0);
    return WebPlatform.toDataURL(WebPlatform.rgbaToCanvas(crop), 'image/jpeg', 0.92);
  };

  /* 总入口：一张商品图 -> 保真全套
   * o:{ call, image, category?, product?, doDetails?, doScene? } */
  // alpha 强化（简单/中等背景）：>=150 推255、<=55 推0，灰辐条变实、几何位置不变
  HogeeFidelity.consolidateAlpha = function (rgba) {
    const d = rgba.data, N = rgba.width * rgba.height;
    for (let i = 0; i < N; i++) { const p = i * 4, a = d[p + 3]; if (a >= 150) d[p + 3] = 255; else if (a <= 55) d[p + 3] = 0; }
  };

  HogeeFidelity.package = async function (o) {
    const call = o.call, image = o.image;
    // 0) 视觉定位 productBox（品类由认货阶段 o.category 传入）
    let loc = o.loc || null;
    if (!loc || !loc.ok) { try { loc = await HogeeFidelity.locate(call, image); } catch (e) { loc = { ok: false }; } }
    const category = o.category || '';
    const productBox = loc.ok ? loc.productBox : null;
    // 1) 原图背景复杂度（品类无关、主体框外）+ 保真分级
    const origRGBA = WebPlatform.toRGBA(WebPlatform.fromImage(await WebPlatform.loadImage(image)));
    const bg = P.bgComplexity(origRGBA, productBox);
    const level = HogeeFidelity.fidelityLevel(category);
    const bgComplex = bg >= 0.55, bgSimple = bg < 0.30;
    // 2) AutoDL 自部署 BiRefNet 分块原生分辨率抠图（复杂背景细结构完整、已 refine 去色边）
    const mk = await call('/cutout', { image, strategy: 'autodl' });
    if (!mk || !mk.ok || !mk.image) return { ok: false, error: (mk && mk.error) || 'no_autodl' };
    let fgRGBA = WebPlatform.toRGBA(WebPlatform.fromImage(await WebPlatform.loadImage(mk.image)));
    // 3) 去孤立杂点 -> trim（跳过阈值化/重合成，避免损坏辐条等细结构）
    P.dropSmall(fgRGBA, 1200, 24);
    fgRGBA = HogeeFidelity.trim(fgRGBA, 0.02);
    // 4) 质检（A 级）：主体覆盖率异常低、或实心率过低（整体发虚）即拒绝
    const qc1 = P.alphaQC(fgRGBA);
    const solidRatio = qc1.solid ? qc1.solid / (qc1.solid + qc1.mid) : 0;
    if (level === 'A' && (qc1.coverage < 0.02 || solidRatio < 0.65)) {
      return { ok: false, rejected: true, reason: 'qc_failed', fidelity: level, bg: +bg.toFixed(3), qc: { coverage: +qc1.coverage.toFixed(3), solidRatio: +solidRatio.toFixed(3) } };
    }
    // 5) 白底主图：优先用服务端返回的原生白底（保真），缺失时前端合成
    const whiteOut = mk.white || WebPlatform.toDataURL(HogeeFidelity.onWhite(fgRGBA, 2048, 0.86, 0.84), 'image/jpeg', 0.92);
    const out = {
      ok: true,
      white: whiteOut,
      fg: WebPlatform.rgbaToCanvas(fgRGBA).toDataURL('image/png'),
      meta: { method: 'autodl-birefnet-tile', fidelity: level, bg: +bg.toFixed(3), midAlpha: +qc1.midAlpha.toFixed(3), solidRatio: +solidRatio.toFixed(3) },
    };
    if (o.doDetails !== false) { try { out.details = await HogeeFidelity.details(call, image, category, o.product); } catch (e) { out.details = []; } }
    if (o.doScene !== false) { try { out.sceneEnhanced = await HogeeFidelity.sceneEnhanced(call, image, loc.ok ? loc : null); } catch (e) { out.sceneEnhanced = null; } }
    return out;
  };

  global.HogeeFidelity = HogeeFidelity;
})(typeof window !== 'undefined' ? window : globalThis);
