/* =====================================================================
 * 阿发（发布）· 模块入口（根因级重做 v1.0）
 * ---------------------------------------------------------------------
 * 对外导出（Worker 路由由整合方接线，本文件不碰路由）：
 *   preview(env, args)        统一「已发布」一体预览（社交手机框 / 电商商品页）
 *   checklist(env, args)      逐平台操作清单 + 预检（识别不达标→自动修正）
 *   package_assets(env, args) 按平台自动分包 ZIP（含电商字段 + tracking.txt）
 *   confirm(env, args)        发布确认状态机（packed→published）+ 阿果接口预留
 *   album(env, args)          二维码 H5 画册
 *   tracking(env, args)       构建追踪链接/渠道码（UTM + ch + 二维码），best-effort 衔接阿果
 *   schedule(env, args)       定时/待发布清单
 *   listPlatforms()           9 平台元信息（含 OAuth 状态）
 * ES module，API 中立，可在 Cloudflare Worker 运行。
 * ===================================================================*/

import { renderPreview } from './preview-renderer.js';
import { buildQrAlbum } from './qr-album.js';
import { getChecklist, runPrePublishValidation } from './checklist.js';
import { packageAssets } from './packaging.js';
import { confirmPublish, enqueueScheduled, buildScheduleList } from './state-machine.js';
import { runAfQc } from './qc.js';
import { buildTracking, attachTracking, tryPersist } from './tracking.js';
import { PUBLISH_PLATFORMS, PLATFORM_META, isKnownPlatform, getPlatformMeta } from './platform-data.js';

/**
 * 1) 统一「已发布」一体预览。
 * @param env
 * @param args { platform, mctx?, draft:{title,body,hashtags[],bullets[],price},
 *              media:[{url,type,width,height,durationSec}], trackingLine? }
 */
export async function preview(env, args = {}) {
  const platform = String(args.platform || '');
  if (!isKnownPlatform(platform)) {
    return { ok: false, error: { code: 'bad_platform', message: '未知发布平台: ' + platform } };
  }
  // 若未显式给 trackingLine 但给了 tracking 描述符，自动取 trackingLine
  let trackingLine = args.trackingLine || '';
  if (!trackingLine && args.tracking && args.tracking.shortUrl) {
    const t = attachTracking(args.draft || {}, args.tracking, (getPlatformMeta(platform) || {}).lang);
    trackingLine = t.trackingLine;
  }
  return renderPreview(env, { ...args, trackingLine });
}

/**
 * 2) 操作清单 + 预检（validate:true 时跑规格/合规预检并自动修正）。
 * @param args { platform, validate?, draft?, media? }
 */
export async function checklist(env, args = {}) {
  const base = getChecklist(env, args);
  if (!base.ok) return base;
  if (args.validate) {
    return { ...base, validation: runPrePublishValidation(env, args) };
  }
  return base;
}

/**
 * 3) 多平台素材 ZIP 分包。
 * @param args { platforms[], drafts{}, mediaKeys{}, tracking{} }
 */
export async function package_assets(env, args = {}) {
  return packageAssets(env, args);
}

/**
 * 4) 发布确认（packed→published）。
 */
export async function confirm(env, args = {}) {
  return confirmPublish(env, { from: 'packed', qcPassed: true, hashSeen: false, ...args });
}

/**
 * 5) 二维码 H5 画册。
 */
export async function album(env, args = {}) {
  return buildQrAlbum(env, args);
}

/**
 * 6) 构建追踪链接/渠道码（自动带上）。有 env.MEMBERS+shop 时 best-effort 写阿果。
 * @param args { platform, targetUrl?, campaign?, shop?, persist? }
 */
export async function tracking(env, args = {}) {
  const platform = String(args.platform || '');
  if (!isKnownPlatform(platform)) {
    return { ok: false, error: { code: 'bad_platform', message: '未知发布平台: ' + platform } };
  }
  const trk = buildTracking({
    platform,
    targetUrl: args.targetUrl,
    campaign: args.campaign
  });
  const t = attachTracking(args.draft || {}, trk, (getPlatformMeta(platform) || {}).lang);
  if (args.persist && env && args.shop) {
    trk.persisted = await tryPersist(env, args.shop, trk);
  }
  return { ok: true, platform, tracking: trk, trackingLine: t.trackingLine };
}

/**
 * 7) 定时/待发布清单。
 * @param args { action:'enqueue'|'list', atISO?, platform?, draft?, mediaKeys?, tracking?, items? }
 */
export async function schedule(env, args = {}) {
  if (args.action === 'enqueue') return enqueueScheduled(args);
  return buildScheduleList(args.items || []);
}

/**
 * 8) 平台列表（前端 Tab 用，含 OAuth 状态）。
 */
export function listPlatforms() {
  return PUBLISH_PLATFORMS.map(id => PLATFORM_META[id]);
}

export { runAfQc, runPrePublishValidation, buildTracking, attachTracking, tryPersist };

export default {
  preview, checklist, package_assets, confirm, album, tracking, schedule,
  listPlatforms, runAfQc, runPrePublishValidation
};
