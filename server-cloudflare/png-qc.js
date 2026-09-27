/* =====================================================================
 * png-qc.js · 透明抠图 PNG 的确定性白底质检（Worker 端无 Canvas/PIL 的轻量实现）
 * ---------------------------------------------------------------------
 * 为什么在 Worker 端做：fidelity-qc 白底硬门禁要求"角落必须纯白"。
 * 抠图 PNG 是透明底，合成到白底后角落是否纯白 == PNG 角落像素 alpha 是否为 0。
 * 因此不必真的合成白底图，直接解码 alpha 通道采样即可。
 *
 * 仅支持 8-bit RGBA（colorType=6）这一 PicWish 抠图实际产出格式；
 * 其他格式（灰度/索引/RGB无alpha）无法判定 alpha，返回 available:false，
 * 由调用方降级为"不拦截"（视觉模型仍是第二道闸）。
 *
 * PNG 解码：拼 IDAT → DecompressionStream('deflate') 解压 zlib 流 → 逐行 unfilter。
 * ===================================================================*/

/** 读 PNG 大端 uint32 */
function u32(dv, off) { return dv.getUint32(off); }

/**
 * 解出 8-bit RGBA 位图。
 * @param {Uint8Array} bytes PNG 文件字节
 * @returns {Promise<{width:number,height:number,data:Uint8Array}|null>}
 *   data 长度 width*height*4，RGBA 顺序；非 RGBA8 返回 null。
 */
export async function decodePngRgba(bytes) {
  try {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // 8 字节签名
    if (dv.getUint32(0) !== 0x89504e47) return null;
    let off = 8;
    let width = 0, height = 0, bitDepth = 0, colorType = 0;
    const idatParts = [];
    while (off + 8 <= bytes.byteLength) {
      const len = u32(dv, off);
      const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
      const dataStart = off + 8;
      const dataEnd = dataStart + len;
      if (dataEnd + 4 > bytes.byteLength) return null;
      if (type === 'IHDR') {
        width = u32(dv, dataStart);
        height = u32(dv, dataStart + 4);
        bitDepth = bytes[dataStart + 8];
        colorType = bytes[dataStart + 9];
      } else if (type === 'IDAT') {
        idatParts.push(bytes.subarray(dataStart, dataEnd));
      } else if (type === 'IEND') {
        break;
      }
      off = dataEnd + 4; // skip CRC
    }
    if (!width || !height || !idatParts.length) return null;
    // 仅支持 8-bit RGBA（colorType 6）
    if (bitDepth !== 8 || colorType !== 6) return null;

    // 合并 IDAT
    const comp = new Uint8Array(idatParts.reduce((n, p) => n + p.byteLength, 0));
    let p = 0;
    for (const part of idatParts) { comp.set(part, p); p += part.byteLength; }

    // zlib 解压（PNG 用 RFC1950 zlib 包装 → DecompressionStream 'deflate'）
    const ds = new DecompressionStream('deflate');
    const stream = new Blob([comp]).stream().pipeThrough(ds);
    const buf = await new Response(stream).arrayBuffer();
    const raw = new Uint8Array(buf);

    const channels = 4;
    const bpp = channels;
    const stride = width * channels;
    const out = new Uint8Array(width * height * channels);

    // unfilter 逐行重建
    let pos = 0;
    const prev = new Uint8Array(stride);
    for (let y = 0; y < height; y++) {
      const filter = raw[pos++];
      const line = raw.subarray(pos, pos + stride);
      pos += stride;
      const recon = out.subarray(y * stride, y * stride + stride);
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? recon[x - bpp] : 0;        // left
        const b = prev[x];                              // above
        const c = x >= bpp ? prev[x - bpp] : 0;         // above-left
        let v = line[x];
        switch (filter) {
          case 0: break;
          case 1: v = (v + a) & 0xff; break;
          case 2: v = (v + b) & 0xff; break;
          case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
          case 4: {
            const pp = paeth(a, b, c);
            v = (v + pp) & 0xff;
            break;
          }
          default: return null; // 未知 filter
        }
        recon[x] = v;
      }
      prev.set(recon);
    }
    return { width, height, data: out };
  } catch {
    return null;
  }
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return (pb <= pc) ? b : c;
}

/**
 * 白底硬门禁：采样 6 个点（四角 + 上下边中点），各取 patch×patch 块。
 * 每块要求 alpha 全部为 0（合成白底后该处才是 #FFFFFF）。
 * 同时统计全图不透明像素占比（形状一致性的简化版 IoU）。
 *
 * @param {Uint8Array} pngBytes 透明抠图 PNG
 * @returns {Promise<{available:boolean, bgWhiteRatio:number, opaqueRatio:number,
 *                     cornerPatchOk:number, cornerPatchTotal:number, reasons:string[]}>}
 */
export async function checkWhiteBackground(pngBytes) {
  const decoded = await decodePngRgba(pngBytes);
  const reasons = [];
  if (!decoded) {
    return { available: false, bgWhiteRatio: 0, opaqueRatio: 0, cornerPatchOk: 0, cornerPatchTotal: 0,
      reasons: ['png_decode_unsupported'] };
  }
  const { width, height, data } = decoded;
  const px = (x, y) => {
    const i = (y * width + x) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
  };

  // 6 个采样点：左上/右上/左下/右下 + 上边中点 + 下边中点
  const patch = Math.max(8, Math.min(24, Math.floor(Math.min(width, height) / 20)));
  const points = [
    [patch, patch],
    [width - patch - 1, patch],
    [patch, height - patch - 1],
    [width - patch - 1, height - patch - 1],
    [Math.floor(width / 2), patch],
    [Math.floor(width / 2), height - patch - 1]
  ];
  let okPatches = 0;
  for (const [cx, cy] of points) {
    let transparent = 0, total = 0;
    for (let dy = -patch; dy <= patch; dy += 2) {
      for (let dx = -patch; dx <= patch; dx += 2) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        total++;
        if (px(x, y).a === 0) transparent++;
      }
    }
    // 该块 95% 以上像素完全透明才算"背景纯白"
    if (total > 0 && transparent / total >= 0.95) okPatches++;
  }
  const bgWhiteRatio = okPatches / points.length;

  // 不透明像素占比（采样统计，1/16 抽样加速）
  let opaque = 0, total = 0;
  const step = Math.max(1, Math.floor((width * height) / 20000));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      total++;
      if (px(x, y).a > 30) opaque++;
    }
  }
  const opaqueRatio = total ? opaque / total : 0;

  if (bgWhiteRatio < 0.9) reasons.push('bg_not_white:角落未全透明，合成白底后有灰边/背景残留');
  if (opaqueRatio < 0.03) reasons.push('shape_too_small:抠图主体占比<3%，疑似漏抠/产品缺失');
  if (opaqueRatio > 0.95) reasons.push('shape_almost_full:主体占比>95%，疑似背景未抠干净');

  return { available: true, bgWhiteRatio, opaqueRatio, cornerPatchOk: okPatches, cornerPatchTotal: points.length, reasons };
}
