/* =====================================================================
 * 阿发 · 质检门 AF1–AF7
 * ---------------------------------------------------------------------
 * 任一维度 failed -> 该平台预览 rejected，不进入打包/可复制态，cost=0。
 * 全部 passed -> 进入 packed 态。
 * 可确定性判定的（AF2/AF4/AF6/AF7）自动跑；依赖 vision/扫码的（AF1/AF3/AF5）
 * 接受调用方传入的观测结果；未提供观测则 pending（阻断，不判失败也不通过）。
 * ===================================================================*/

import { QC_DIMENSIONS, isKnownPlatform } from './platform-data.js';
import { buildCopyPayload } from './copy-payload.js';
import { runPrePublishValidation } from './checklist.js';

const nfc = s => String(s == null ? '' : s).normalize('NFC');
const REPLACEMENT = '�'; // U+FFFD

function dim(id, status, detail, failAction) {
  const meta = QC_DIMENSIONS.find(d => d.id === id) || {};
  return { id, name: meta.name || id, status, detail, failAction: meta.failAction || '' };
}

/**
 * 跑阿发质检。
 * @param {object} env
 * @param {object} args
 * @param {string} args.platform
 * @param {object} args.draft  { title, body, hashtags[] }
 * @param {Array}  args.media  素材元信息（width/height/sizeMB）
 * @param {string} [args.renderedHtml]  预览 HTML
 * @param {string} [args.albumHtml]     画册 HTML
 * @param {object} [args.observations]  vision/扫码观测：
 *   { layoutMatchPct, mediaTextConsistent, albumOcrMatch, qrScannable, qrHttpOk }
 * @returns {{ok, platform, overall, cost, rejected, dimensions, failures}}
 */
export function runAfQc(env, args = {}) {
  const platform = String(args.platform || '');
  if (!isKnownPlatform(platform)) {
    return { ok: false, error: { code: 'bad_platform', message: '未知发布平台' } };
  }
  const draft = args.draft || {};
  const obs = args.observations || {};
  const dims = [];

  // AF1 版式一致：结构前提（skin/zones 已渲染）+ vision 观测
  const structural = !!args.renderedHtml && /class="screen"/.test(args.renderedHtml);
  if (obs.layoutMatchPct != null) {
    const bad = obs.layoutMatchPct; // 错版率
    dims.push(dim('AF1_layout_match', bad > 0.05 ? 'failed' : 'passed',
      `错版率 ${(bad * 100).toFixed(1)}%（阈值5%），结构前提=${structural}`));
  } else {
    dims.push(dim('AF1_layout_match', structural ? 'pending' : 'failed',
      structural ? '待 vision 真机界面对拍' : '预览未渲染出 screen 容器'));
  }

  // AF2 复制完整：三段拼接与源逐字一致、#号保留
  const copy = buildCopyPayload(env, { platform, draft });
  const rebuilt = [copy.blocks.title, copy.blocks.body, copy.blocks.tags].filter(Boolean).join('\n\n');
  const expect = nfc(copy.all);
  const af2Pass = rebuilt === expect && copy.blocks.tags.split(' ').every(t => !t || t.startsWith('#'));
  dims.push(dim('AF2_copy_integrity', af2Pass ? 'passed' : 'failed',
    `三段拼接与源一致=${rebuilt === expect}，#号保留=${copy.blocks.tags.split(' ').every(t => !t || t.startsWith('#'))}`));

  // AF3 图文不割裂：vision 观测
  if (obs.mediaTextConsistent != null) {
    dims.push(dim('AF3_media_text_not_split', obs.mediaTextConsistent ? 'passed' : 'failed',
      obs.mediaTextConsistent ? '标题关键词与商品/场景对应' : '文不对图，退回阿文重写'));
  } else {
    dims.push(dim('AF3_media_text_not_split', 'pending', '待 vision 图文对拍'));
  }

  // AF4 画册无乱码：NFC + 无替换字符/残缺
  if (args.albumHtml != null) {
    const norm = nfc(args.albumHtml);
    const garbled = norm.includes(REPLACEMENT) || /Ã©|Ã¢|ï¿½|â€/.test(norm);
    let ocrMatch = true;
    if (obs.albumOcrMatch != null) ocrMatch = obs.albumOcrMatch;
    dims.push(dim('AF4_album_no_garbled', (!garbled && ocrMatch) ? 'passed' : 'failed',
      `NFC归一化=${!norm.includes(REPLACEMENT)}，OCR逐字一致=${ocrMatch}`));
  } else {
    dims.push(dim('AF4_album_no_garbled', 'pending', '未提供画册 HTML'));
  }

  // AF5 二维码/链接有效
  if (obs.qrScannable != null || obs.qrHttpOk != null) {
    const ok = obs.qrScannable !== false && obs.qrHttpOk !== false;
    dims.push(dim('AF5_qr_valid', ok ? 'passed' : 'failed', `扫码可解析=${obs.qrScannable}，短链HTTP200=${obs.qrHttpOk}`));
  } else {
    dims.push(dim('AF5_qr_valid', 'pending', '待扫码器实测 + 短链探活'));
  }

  // AF6 硬规格不越界
  const pv = runPrePublishValidation(env, { platform, draft, media: args.media || [] });
  dims.push(dim('AF6_hard_spec_fit', pv.passed ? 'passed' : 'failed',
    pv.passed ? '9条硬规格全部在限内' : pv.results.filter(r => !r.pass).map(r => r.rule).join(','), pv));

  // AF7 无违禁词（广告法 + 导流词双扫）
  const af6b = pv.results.find(r => r.rule === 'ad_law_words' || r.rule === 'sensitive_words');
  const banned = pv.results.filter(r => (r.rule === 'ad_law_words' || r.rule === 'sensitive_words') && !r.pass);
  dims.push(dim('AF7_no_banned_words', banned.length === 0 ? 'passed' : 'failed',
    banned.length ? '命中: ' + banned.map(r => r.hits.join('/')).join('；') : '广告法+导流词双扫 0 命中'));

  // AF8 追踪链接/渠道码已自动带上
  const trackingLine = String(args.trackingLine || '').trim();
  const hasTrack = /(r\/[A-Za-z0-9]{2,12}|ch=|utm_)/.test(trackingLine);
  dims.push(dim('AF8_tracking_attached', hasTrack ? 'passed' : 'pending',
    hasTrack ? '追踪短链/渠道码已带上：' + trackingLine.slice(0, 60) : '未提供 trackingLine（预览仍可产出，待 attachTracking）'));

  const failed = dims.filter(d => d.status === 'failed');
  const pending = dims.filter(d => d.status === 'pending');
  const overall = failed.length ? 'rejected' : (pending.length ? 'pending_observation' : 'passed');
  return {
    ok: true,
    platform,
    overall,
    rejected: failed.length > 0,
    cost: failed.length > 0 ? 0 : (overall === 'passed' ? 0.2 : 0),
    dimensions: dims,
    failures: failed.map(d => ({ id: d.id, detail: d.detail }))
  };
}

export default { runAfQc };
