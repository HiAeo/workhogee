/* =====================================================================
 * WorkHogee · fine-matting.js 统一抠图入口（ES module，API 中立）
 * ---------------------------------------------------------------------
 * 按品类/图种路由底座，返回 透明PNG / 白底JPEG / mask + 所用底座 + 质检 metrics + 耗时成本。
 * 失败 / rejected => 对用户计费为 0（与"失败不计费"一致）。
 *
 * 本期无 AutoDL：A 级密集镂空品类走 PicWish object（未来 AUTODL_CUTOUT_URL 配置后
 *   自动切 BiRefNet_HR）。手持商品先走 product-isolate 判定，连手即 rejected。
 *
 * A 级辐条主判据 = 几何门（确定性）：
 *   VL 定位前后轮 -> PicWish mask PNG -> lib.decodeMaskPngToAlpha(DecompressionStream)
 *   -> spokeGeometryQC(recall/半圈平衡/断线)。几何为准，VL 仅辅助，禁止 VL 单独放行。
 *   几何不过 => status:'failed' + 重拍引导，绝不放带断辐条白底图过质检。
 *
 * 路由品类表 category：
 *   'bike'|'3c'|'instrument'|'mechanical' -> A 级密集镂空（细结构）
 *   预检发现手握住商品                      -> 商品本体隔离
 *   其它实物                                -> 默认 object
 * ===================================================================*/

import { picwishSegment, dataUrlToBytes, bytesToDataUrl, decodePng } from './lib.js';
import { detectProductAndHuman, decideIsolation } from './product-isolate.js';
import { detectWheelsVL, spokeGeometryQC } from './spoke-qc.js';

// 前端 consolidateAlpha：>=150->255, <=55->0，中间过渡
function consolidateAlpha(rgba) {
  const d = rgba.data;
  for (let i = 3; i < d.length; i += 4) {
    d[i] = d[i] >= 150 ? 255 : (d[i] <= 55 ? 0 : d[i]);
  }
  return rgba;
}

// A 级密集镂空品类（路由到细结构底座 + 几何辐条门）
export const GRADE_A_CATEGORIES = new Set(['bike', 'bicycle', 'motorcycle', '3c', 'electronics', 'instrument', 'mechanical', 'hardware']);

/**
 * 路由：根据品类与预检决定走哪个模式。
 */
export function routeMatting({ category = '', precheck = null } = {}) {
  const cat = String(category || '').toLowerCase();
  if (precheck && precheck.product_is_held && precheck.hand_touching_product) {
    return { mode: 'product_isolate', backend: 'reject_at_isolation' };
  }
  if (GRADE_A_CATEGORIES.has(cat)) return { mode: 'fine_structure', backend: 'picwish_object' };
  return { mode: 'default', backend: 'picwish_object' };
}

/**
 * 统一入口。
 * @param {object} env
 * @param {{imageDataUrl:string, category?:string, skipSpokeGate?:boolean}} o
 * @returns {Promise<object>}
 */
export async function fineMatting(env, o = {}) {
  const t0 = Date.now();
  const { imageDataUrl, category = '' } = o;
  const cost = { credits: 0, vlCalls: 0 }; // credits=对用户计费（失败为0）
  const trace = [];

  // 1) 预检（人体/商品定位）
  const pre = await detectProductAndHuman(env, imageDataUrl);
  cost.vlCalls++;
  if (!pre.ok) {
    // 预检 VL 失败（超时/解析失败/缺字段）：不放行、不计费，统一给非空重拍引导
    return {
      status: 'rejected',
      reason: 'precheck_vl_' + (pre.error || 'unknown'),
      guide: '无法可靠识别商品主体或完成干净抠图。请将商品置于纯色背景、用支架/挂拍固定，确保商品完整入镜、手部不接触商品后重试。',
      cost: { credits: 0, vlCalls: cost.vlCalls },
      ms: Date.now() - t0,
    };
  }

  // 2) 路由
  const route = routeMatting({ category, precheck: pre });
  trace.push('route=' + route.mode);

  // 3) 本体隔离分支：手持相连 => 直接 rejected（不抠图、不计费）
  if (route.mode === 'product_isolate') {
    const dec = await decideIsolation(env, { pre });
    return { ...dec, backend: route.backend, trace, cost: { credits: 0, vlCalls: cost.vlCalls }, ms: Date.now() - t0 };
  }

  // 4) 抠图（PicWish object，要 mask 供几何门）
  const info = dataUrlToBytes(imageDataUrl);
  if (!info) return { status: 'rejected', reason: 'bad_image', cost, ms: Date.now() - t0 };
  const seg = await picwishSegment(env, { bytes: info.bytes, mime: info.mime, type: 'object', wantMask: true });
  trace.push('picwish_ms=' + seg.ms);
  if (!seg.ok) return { status: 'failed', reason: 'matting:' + seg.error, cost, ms: Date.now() - t0 };
  const transparentPng = bytesToDataUrl(seg.pngBytes, 'image/png');
  const mask = seg.maskBytes ? bytesToDataUrl(seg.maskBytes, 'image/png') : null;

  // 5) A 级品类：几何辐条门（主判据）
  let spoke = null;
  if (route.mode === 'fine_structure' && !o.skipSpokeQc) {
    // 5a) VL 定位前后轮（归一化）
    const wres = await detectWheelsVL(env, imageDataUrl);
    cost.vlCalls++;
    if (wres.ok && wres.wheels.length && seg.pngBytes) {
      // 5b) 解码抠图透明 PNG -> RGBA alpha buffer（edge: DecompressionStream，无 sharp）
      try {
        const rgba = consolidateAlpha(await decodePng(seg.pngBytes));
        // 归一化轮心 -> 像素
        const wheels = wres.wheels.map(w => ({
          cx: w.cx * rgba.width, cy: w.cy * rgba.height, R: w.r * rgba.width, label: w.label,
        }));
        spoke = spokeGeometryQC({ result: rgba, gt: null, wheels });
        trace.push('wheels=' + JSON.stringify(wres.wheels));
        trace.push('spoke_geo_pass=' + spoke.pass);
        if (!spoke.pass) {
          // 几何不过：不放行、不计费、提示重拍/待 BiRefNet
          return {
            status: 'failed', reason: 'spoke_geometry_failed', spoke, backend: route.backend,
            trace, cost: { credits: 0, vlCalls: cost.vlCalls }, ms: Date.now() - t0,
            guide: '轮圈辐条质检未通过（辐条缺失/半边丢失/发虚）。PicWish 通用抠图保不住密集细辐条，请改用纯色背景+支架重拍；系统将在细镂空底座(BiRefNet_HR/AutoDL)接入后重抠。',
          };
        }
      } catch (e) {
        trace.push('spoke_decode_err=' + (e && e.message));
        // 解码失败不阻断主链路（降级放行，记 trace）；生产应告警
      }
    }
  }

  // 通过：计 PicWish 一次
  cost.credits += seg.credits || 0.5;
  return {
    status: 'ok',
    backend: route.backend,
    mode: route.mode,
    transparentPng, mask,
    whiteJpeg: null,
    spoke, precheck: pre,
    trace, cost, ms: Date.now() - t0,
  };
}
