/* =====================================================================
 * WorkHogee · product-isolate.js 商品本体隔离（ES module，API 中立）
 * ---------------------------------------------------------------------
 * 白底主图只留商品本体，剔除 手/手腕/手臂/人体/配饰/道具。
 * 本模块只做「判定 + bbox 裁剪纯函数」；抠图/白底合成由 fine-matting 装配
 * （PicWish 直接出透明 PNG 与白底 JPEG，edge 端无需 canvas）。
 *
 * 铁律：手与商品相连（手指在瓶身上）=> mask 无法干净切分 => rejected + 重拍引导，
 *       绝不输出带手白底。
 * ===================================================================*/

import { callVL, normBoxToPx } from './lib.js';

export const HUMAN_RATIO_MAX = 0.02; // 残留人体占前景比例上限

/** VL 预检：商品 bbox + 人体/手 是否相连 */
export async function detectProductAndHuman(env, imageDataUrl) {
  const sys = '你是电商商品预检视觉助手，只输出 JSON。';
  const user = [
    '这是一张用户实拍、待出白底主图的商品照。请判断：',
    '{"product_bbox":[x,y,w,h],      // 商品本体紧密包围盒，归一化0~1，左上原点；只框商品本身，不要把手框进去',
    ' "has_human":布尔,               // 是否出现人手/手指/手掌/手腕/手臂/人体皮肤/配饰(手环红绳手表)',
    ' "hand_touching_product":布尔,   // 手是否握住/紧贴商品本体（二者物理相连）',
    ' "product_is_held":布尔}',        // 商品是被手持举起（vs 支架/平铺/挂拍）',
    '只输出 JSON，不要解释。',
  ].join('\n');
  const r = await callVL(env, { sys, user, images: [imageDataUrl], detail: 'high', maxTokens: 400 });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ...r.data, ms: r.ms };
}

/** VL 复检白底结果是否残留人体 */
export async function detectHumanResidual(env, whiteDataUrl) {
  const sys = '你是白底商品图质检，只输出 JSON。';
  const user = [
    '这是白底抠图结果。判断除商品本体外是否残留 手/手指/手腕/手臂/人体皮肤/配饰(手环红绳手表)。',
    '只输出 JSON：{"has_human":布尔,"parts":[...],"human_ratio":0到1,"reason":"≤50字"}',
    'human_ratio = 残留人体像素占整张前景非白区域的粗略比例。',
  ].join('\n');
  const r = await callVL(env, { sys, user, images: [whiteDataUrl], detail: 'high', maxTokens: 400 });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ...r.data, ms: r.ms };
}

/**
 * 按商品 bbox 裁剪 RGBA：bbox 外 alpha 清零（剔除伸出 bbox 的腕/臂/道具）。
 * 注意：手指在商品 bbox 内重叠时本函数切不掉——那正是 hand_touching_product=>reject 的情形。
 * @param {{width,height,data:Uint8Array}} rgba RGBA
 * @param {number[]} box 归一化 [x,y,w,h]
 */
export function keepOnlyProductBox(rgba, box) {
  const { width, height, data } = rgba;
  const px = normBoxToPx(box, width, height);
  const pad = Math.round(Math.min(width, height) * 0.01);
  const L = Math.max(0, px.left - pad), T = Math.max(0, px.top - pad);
  const R = Math.min(width, px.left + px.width + pad), B = Math.min(height, px.top + px.height + pad);
  const out = new Uint8Array(data);
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (x < L || x >= R || y < T || y >= B) out[row + x * 4 + 3] = 0;
    }
  }
  return { width, height, data: out };
}

/**
 * 综合判定：预检 + 可选复检 -> accepted/rejected。
 * @param {object} env
 * @param {{pre:object, whiteDataUrl?:string}} o
 */
export async function decideIsolation(env, { pre, whiteDataUrl = null } = {}) {
  // 手持且手与商品相连 => 直接拒
  if (pre.product_is_held && pre.hand_touching_product) {
    return {
      status: 'rejected', reason: 'hand_holds_product',
      guide: '检测到商品被手持、手与商品相连，自动抠图无法把手与商品干净分离。请用支架/挂拍或平铺于纯色背景拍摄，手部不接触商品、不入镜。',
    };
  }
  // 有 bbox 但未手持相连：做一次白底残留复检
  if (whiteDataUrl) {
    const chk = await detectHumanResidual(env, whiteDataUrl);
    if (chk.ok && chk.has_human && (chk.human_ratio || 0) > HUMAN_RATIO_MAX) {
      return {
        status: 'rejected', reason: 'human_residual', humanRatio: chk.human_ratio, parts: chk.parts,
        guide: '白底结果残留人体/手部，无法干净去除。请重新拍摄：商品用支架/挂拍，手部不入镜，背景纯净。',
      };
    }
    return { status: 'accepted', residual: chk.ok ? chk : { error: chk.error } };
  }
  return { status: 'accepted', residual: null };
}
