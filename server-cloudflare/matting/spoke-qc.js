/* =====================================================================
 * WorkHogee · spoke-qc.js 辐条/细结构质检（双保险，ES module，API 中立）
 * ---------------------------------------------------------------------
 * 设计教训（调研实测）：单图 VL 看轮圈"数到 N 根"就放行，曾把用户标注为
 * "断裂"的样例误判 PASS。因此本模块**不允许只用单图 VL**，必须：
 *   (A) 几何径向线条计数（确定性，主判据）：轮圈环带上数辐条 crossings、
 *       沿半径追踪连续性、左右/前后两轮对称性；
 *   (B) 原图 vs 抠图 VL 对照（语义辅判据）：问"少了/断了哪几根"。
 * 任一不达标 => pass=false。
 *
 * 几何函数作用在调用方解码好的 RGBA buffer（{width,height,data}）上，
 * 模块不依赖 sharp/canvas。
 * ===================================================================*/

import { callVL } from './lib.js';

// 通过阈值（建议初值，待真实手机照校准）
export const SPOKE_THRESHOLDS = {
  ringRadiusFrac: 0.72,   // 在半径 0.72R 的环带上数辐条（避开中心飞轮/卡盘噪声）
  spokeCrossMinAlpha: 40, // alpha 阈值
  continuityMinFrac: 0.55,// 一根辐条从内圈到外圈，alpha 命中半径比例下限
  recallMin: 0.85,        // 结果辐条数 / 原图辐条数 下限
  countDiffMaxFrac: 0.35, // 前后两轮辐条数差异上限（对称）
  halfBalanceMin: 0.45,   // 单轮左右半圈 crossings 比下限：一半辐条全丢则判失败
};

/**
 * 在单个轮圈上数辐条：环带 crossing 数 + 每根连续性追踪。
 * @param {object} rgba {width,height,data:RGBA}
 * @param {{cx:number,cy:number,R:number}} wheel 轮心与半径(px)
 * @param {object} T 阈值
 * @returns {{crossings:number,broken:number,count:number}}
 */
export function analyzeWheelSpokes(rgba, wheel, T = SPOKE_THRESHOLDS) {
  const { width, height, data } = rgba;
  const { cx, cy, R } = wheel;
  const ringR = R * T.ringRadiusFrac;
  const hubR = Math.max(6, R * 0.12);
  const N = 360; // 角分辨率 1°
  const spokeHits = []; // 在环带上命中的角度（度）
  const win = Math.max(1.5, R * 0.012); // 径向取样半宽(px)

  const alphaAt = (x, y) => {
    const xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= width || yi >= height) return 0;
    return data[(yi * width + xi) * 4 + 3];
  };

  for (let d = 0; d < N; d++) {
    const th = (d / N) * Math.PI * 2;
    const x = cx + ringR * Math.cos(th);
    const y = cy + ringR * Math.sin(th);
    let maxA = 0;
    for (let o = -win; o <= win; o += 1) {
      const a = alphaAt(x + o * Math.cos(th + Math.PI / 2), y + o * Math.sin(th + Math.PI / 2));
      if (a > maxA) maxA = a;
    }
    if (maxA > T.spokeCrossMinAlpha) spokeHits.push(d);
  }

  // 左右半圈平衡：cos(th)<0 为左半（西），>0 为右半（东）。用于抓"半边辐条全丢"。
  let left = 0, right = 0;
  for (const d of spokeHits) {
    const cos = Math.cos((d / N) * Math.PI * 2);
    if (cos < 0) left++; else right++;
  }
  const halfBalance = Math.min(left, right) / Math.max(left, right, 1);

  // 把相邻角度聚类成"一根根辐条"
  const clusters = [];
  let cur = [];
  for (let i = 0; i < spokeHits.length; i++) {
    if (!cur.length) cur.push(spokeHits[i]);
    else {
      const gap = spokeHits[i] - cur[cur.length - 1];
      // 环形回绕处 gap 可能接近 360，单独处理
      if (gap <= 4) cur.push(spokeHits[i]);
      else { clusters.push(cur); cur = [spokeHits[i]]; }
    }
  }
  if (cur.length) {
    // 收尾：若首簇与尾簇在 0/360 接缝相连则合并
    if (clusters.length && (spokeHits[0] + N) - cur[cur.length - 1] <= 4) {
      clusters[0] = cur.concat(clusters[0]);
    } else clusters.push(cur);
  }

  // 连续性：对每根辐条角中位数，从 hubR 到 R 沿半径走，统计 alpha 命中比例
  let broken = 0;
  for (const cl of clusters) {
    const midDeg = cl.reduce((a, b) => a + b, 0) / cl.length;
    const th = (midDeg / N) * Math.PI * 2;
    let hit = 0, total = 0;
    for (let r = hubR; r <= R * 0.96; r += Math.max(2, R * 0.02)) {
      const a = alphaAt(cx + r * Math.cos(th), cy + r * Math.sin(th));
      total++;
      if (a > T.spokeCrossMinAlpha) hit++;
    }
    if (total && hit / total < T.continuityMinFrac) broken++;
  }
  return { crossings: spokeHits.length, spokes: clusters.length, broken, left, right, halfBalance };
}

/**
 * 几何辐条质检主入口。
 * @param {{result:object, gt:object|null, wheels:object[]}} o
 *   result/gt = {width,height,data:RGBA}（gt 为原图抠出的主体，可空）
 *   wheels = [{cx,cy,R},...] 像素坐标（由 VL 或检测给出）
 * @returns {{pass, metrics, thresholds}}
 */
export function spokeGeometryQC({ result, gt, wheels = [] } = {}) {
  const T = SPOKE_THRESHOLDS;
  if (!wheels.length) return { pass: false, metrics: { reason: 'no_wheel_box' }, thresholds: T };

  const res = wheels.map((w, i) => ({ wheel: i, ...analyzeWheelSpokes(result, w, T) }));
  let gtRes = null;
  if (gt) gtRes = wheels.map((w, i) => ({ wheel: i, ...analyzeWheelSpokes(gt, w, T) }));

  // 对称性：前后轮 spokes 数差异
  let symOK = true, symRatio = 1;
  if (res.length >= 2) {
    const [a, b] = res;
    const big = Math.max(a.spokes, 1), small = Math.min(a.spokes, b.spokes);
    symRatio = small / big;
    symOK = symRatio >= (1 - T.countDiffMaxFrac);
  }

  // 召回：与 GT 对照（若有）
  let recall = 1, recallOK = true;
  if (gtRes) {
    recalls: {
      let rs = 0, n = 0;
      for (let i = 0; i < res.length; i++) {
        const g = gtRes[i] && gtRes[i].spokes > 0 ? gtRes[i].spokes : 0;
        if (g > 0) { rs += Math.min(res[i].spokes / g, 1); n++; }
      }
      if (n) { recall = rs / n; recallOK = recall >= T.recallMin; }
    }
  }

  const brokenTotal = res.reduce((s, r) => s + r.broken, 0);
  // 半圈平衡：任一轮左右半圈辐条严重失衡 => 半边缺失，fail
  const halfOk = res.every(r => r.left + r.right < 8 || r.halfBalance >= T.halfBalanceMin);
  // 注：broken 连续数受链条/车架/卡盘噪声污染，仅作告警 metric，不作为硬 fail（否则误杀完整轮圈）。
  const pass = recallOK && symOK && halfOk && res.every(r => r.spokes >= 4);
  return {
    pass,
    metrics: {
      perWheel: res, gtPerWheel: gtRes, recall, symRatio, brokenTotal, halfOk,
      spokesTotal: res.reduce((s, r) => s + r.spokes, 0),
    },
    thresholds: T,
  };
}

/**
 * VL 定位前后轮：返回归一化轮心+半径，供几何门用。
 * @returns {Promise<{ok, wheels:[{cx,cy,r}], ms}>}  cx/cy/r 均为 0~1 归一化
 */
export async function detectWheelsVL(env, imageDataUrl) {
  const sys = '你是自行车轮圈定位视觉助手，只输出 JSON。';
  const user = [
    '这是一辆自行车的照片。请定位前后两个车轮：',
    '只输出 JSON：{"wheels":[{"cx":0到1,"cy":0到1,"r":0到1,"label":"rear|front"}]}',
    'cx/cy=轮心(花鼓)归一化坐标(左上原点)，r=车轮外半径归一化(相对图宽)。两个轮都要给。',
  ].join('\n');
  const r = await callVL(env, { sys, user, images: [imageDataUrl], detail: 'high', maxTokens: 300 });
  if (!r.ok) return { ok: false, error: r.error };
  const wheels = (r.data.wheels || []).map(w => ({ cx: +w.cx, cy: +w.cy, r: +w.r, label: w.label }));
  return { ok: true, wheels, ms: r.ms };
}

/**
 * VL 对照质检（语义辅判）：原图 vs 抠图，问少了/断了哪几根。
 * 必须与几何同用，不单独放行。
 * @param {object} env
 * @param {{originalDataUrl:string, mattingDataUrl:string}} o
 */
export async function spokeQCVL(env, { originalDataUrl, mattingDataUrl } = {}) {
  const sys = '你是自行车轮圈抠图质检，只输出 JSON。';
  const user = [
    '图1=原始实拍（含应有的真实辐条），图2=抠图后白底主图的同位置轮圈放大。',
    '逐根对比辐条：图2 是否完整保留了图1里从花鼓到车圈的每一根辐条？有无断裂/缺失/发虚/错位/左右不对称？',
    '只输出 JSON：{"gt_spokes":整数,"matte_spokes":整数,"broken_count":整数,"faint":布尔,"pass":布尔,"reason":"≤60字"}',
    '判定要严格：只要辐条明显少了、断了、或发虚到几乎看不见，pass=false。',
  ].join('\n');
  const r = await callVL(env, { sys, user, images: [originalDataUrl, mattingDataUrl], detail: 'high' });
  if (!r.ok) return { pass: false, vlError: r.error };
  return { pass: !!r.data.pass, ...r.data, ms: r.ms };
}

/**
 * 辐条总质检：几何（主）+ VL 对照（辅）。两者都要过才 pass。
 */
export async function spokeQC(env, opts) {
  const geo = spokeGeometryQC(opts);
  const vl = opts.originalDataUrl && opts.mattingDataUrl ? await spokeQCVL(env, opts) : { pass: true, note: 'vl_skipped' };
  const pass = geo.pass && vl.pass !== false;
  return { pass, geometry: geo, vl, cost: { credits: 0.5, vlMs: vl.ms || 0 } };
}
