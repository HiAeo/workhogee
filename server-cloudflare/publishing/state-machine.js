/* =====================================================================
 * 阿发 · 发布确认状态机 + 阿果接口预留
 * ---------------------------------------------------------------------
 * 状态流：draft -> previewed -> packed -> published（任一环节 QC 失败 -> rejected）。
 * contentHash = SHA-256(文案+图指纹)，防重复计费。
 * 仅 status=published 且 contentHash 未重复时计费；preview/packed/QC失败不计费。
 * 阿果 POST /aguo/publish-confirm 本期只定义契约，不真发请求。
 * ===================================================================*/

import { STATUS_FLOW, AGUO_HOOK } from './platform-data.js';

// NFC 归一化内联（避免与 qr-album 循环依赖）
const nfc = s => String(s == null ? '' : s).normalize('NFC');

const ALLOWED = {
  draft: ['previewed', 'rejected'],
  previewed: ['packed', 'rejected'],
  packed: ['published', 'scheduled', 'rejected'],
  scheduled: ['published', 'packed', 'rejected'],
  published: [],
  rejected: []
};

export function canTransition(from, to) {
  return (ALLOWED[from] || []).includes(to);
}

/**
 * 推进状态。非法转移抛错。
 * @param {string} from
 * @param {string} to
 * @returns {{from,to,ok:boolean}}
 */
export function transition(from, to) {
  if (!STATUS_FLOW.includes(from) && from !== 'rejected') {
    throw new Error('未知当前状态: ' + from);
  }
  if (!canTransition(from, to)) {
    return { ok: false, from, to, error: { code: 'bad_transition', message: `不允许 ${from} -> ${to}` } };
  }
  return { ok: true, from, to };
}

/**
 * contentHash：对归一化后的内容指纹做 SHA-256。
 * @param {object} content { title, body, hashtags[], mediaKeys[] }
 * @returns {Promise<string>} hex
 */
export async function computeContentHash(content = {}) {
  const media = (Array.isArray(content.mediaKeys) ? content.mediaKeys : []).join('|');
  const tags = (Array.isArray(content.hashtags) ? content.hashtags : []).join('|');
  const raw = nfc([
    content.platform || '',
    content.title || '',
    content.body || '',
    tags,
    media
  ].join(''));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 组装阿果确认载荷（契约见 AGUO_HOOK）。
 * @param {object} o
 * @param {string} o.platform
 * @param {string} [o.postUrl]
 * @param {string} o.publishedAt ISO8601
 * @param {string} [o.screenshotKey]
 * @param {string} o.contentHash
 * @returns {{endpoint:string, method:string, payload:object}}
 */
export function buildAguoConfirm(o = {}) {
  return {
    endpoint: AGUO_HOOK.endpoint,
    method: 'POST',
    payload: {
      platform: o.platform,
      postUrl: o.postUrl || null,
      publishedAt: o.publishedAt || new Date().toISOString(),
      screenshotKey: o.screenshotKey || null,
      contentHash: o.contentHash
    }
  };
}

/**
 * 计费判定：仅 published 且 contentHash 未重复才计费。
 * @param {string} status 当前状态
 * @param {boolean} hashSeen 该 contentHash 是否已计费过
 * @param {boolean} qcPassed 质检是否通过
 * @returns {{charge:boolean, cost:number, reason:string}}
 */
export function decideBilling(status, hashSeen, qcPassed) {
  if (!qcPassed) return { charge: false, cost: 0, reason: 'qc_failed' };
  if (status !== 'published') return { charge: false, cost: 0, reason: 'not_published' };
  if (hashSeen) return { charge: false, cost: 0, reason: 'duplicate_content_hash' };
  return { charge: true, cost: 0.2, reason: 'first_publish' };
}

/**
 * 「标记已发布」聚合入口：校验状态转移 + 算 hash + 组装阿果载荷 + 计费判定。
 * @param {object} env
 * @param {object} args
 * @param {string} args.platform
 * @param {string} args.from  当前状态（应为 packed）
 * @param {object} args.content  computeContentHash 入参
 * @param {boolean} args.qcPassed
 * @param {boolean} args.hashSeen
 * @param {string} [args.postUrl]
 * @param {string} [args.screenshotKey]
 */
export async function confirmPublish(env, args = {}) {
  const t = transition(args.from || 'packed', 'published');
  if (!t.ok) return { ok: false, error: t.error };
  const contentHash = await computeContentHash({
    platform: args.platform,
    ...(args.content || {})
  });
  const billing = decideBilling('published', !!args.hashSeen, !!args.qcPassed);
  const aguo = buildAguoConfirm({
    platform: args.platform,
    postUrl: args.postUrl,
    screenshotKey: args.screenshotKey,
    publishedAt: new Date().toISOString(),
    contentHash
  });
  return {
    ok: true,
    status: 'published',
    contentHash,
    billing,
    aguo,
    expectResponse: { receiptId: '<string>', charged: '<bool>' }
  };
}

/* =====================================================================
 * 定时 / 待发布清单（scheduled）
 * 纯函数：产出待发条目结构，持久化由整合方（Worker KV）接线。
 * ===================================================================*/
let _seq = 0;
function genId() {
  _seq += 1;
  return 'sched_' + Date.now().toString(36) + '_' + _seq;
}

/**
 * 入队一个定时/待发布条目。
 * @param {object} args { platform, atISO, draft, mediaKeys, tracking, note }
 * @returns {{id, status:'scheduled', platform, atISO, draft, mediaKeys, tracking, note, createdAt}}
 */
export function enqueueScheduled(args = {}) {
  const atISO = String(args.atISO || '').trim();
  if (!atISO || isNaN(Date.parse(atISO))) {
    return { ok: false, error: { code: 'bad_at', message: '需要合法的发布时间 atISO（如 2026-10-04T20:00+08:00）' } };
  }
  return {
    ok: true,
    id: genId(),
    status: 'scheduled',
    platform: args.platform,
    atISO,
    draft: args.draft || {},
    mediaKeys: args.mediaKeys || [],
    tracking: args.tracking || null,
    note: args.note || '',
    createdAt: new Date().toISOString()
  };
}

/**
 * 把条目排成待发清单：按时间升序，标出已到期/未到期。
 * @param {Array} items enqueueScheduled 产物列表
 * @returns {{upcoming:[], due:[], sorted:[]}}
 */
export function buildScheduleList(items = [], now = Date.now()) {
  const arr = (Array.isArray(items) ? items : []).slice().sort((a, b) => new Date(a.atISO) - new Date(b.atISO));
  const due = arr.filter(it => new Date(it.atISO).getTime() <= now);
  const upcoming = arr.filter(it => new Date(it.atISO).getTime() > now);
  return { ok: true, due, upcoming, sorted: arr, total: arr.length };
}

export default { transition, canTransition, computeContentHash, buildAguoConfirm, decideBilling, confirmPublish, enqueueScheduled, buildScheduleList };
