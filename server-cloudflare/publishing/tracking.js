/* =====================================================================
 * 阿发 · 追踪链接 / 渠道码 / 埋点自动带上（衔接阿果）
 * ---------------------------------------------------------------------
 * 只读复用后端已有 analytics/qrcode 能力，不改 agu.js / analytics.js。
 *  - 渠道码 code：4 位（与阿果 qr:{code} 同体系），短链 /r/{code}，二维码 /q/{code}.svg
 *  - UTM 三件套 + ch 参数，落到阿果 channels 分桶
 *  - 确定性优先：无 KV / 无网络时也能产出完整追踪描述符（degraded），不烧 LLM
 *  - tryPersist：有 env.MEMBERS+shop 时 best-effort 写阿果 createLink（硬超时+软降级）
 *
 * 纯函数 + 可选持久化；ES module，Worker/浏览器/Node 同跑。
 * ===================================================================*/

import { qrSvg } from '../qrcode-svg.js';
import { getPlatformMeta, isEcommerce } from './platform-data.js';

export const SHORT_BASE = 'https://api.workhogee.com';

// 与 analytics-store randomCode 同字母表（去掉易混 0/O/1/l/I）
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 生成渠道码（优先 crypto.getRandomValues，退化 Math.random）。 */
export function genChannelCode(len = 4) {
  try {
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    let s = '';
    for (let i = 0; i < len; i++) s += CODE_ALPHABET[arr[i] % CODE_ALPHABET.length];
    return s;
  } catch {
    let s = '';
    for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    return s;
  }
}

function encQuery(k, v) { return encodeURIComponent(k) + '=' + encodeURIComponent(v); }

/**
 * 给目标链接附加 UTM + ch（渠道码）。
 * @param {string} targetUrl 落地页（商品链接/H5画册）
 * @param {object} o { platform, code, campaign, medium }
 */
export function withUtm(targetUrl, o = {}) {
  const url = String(targetUrl || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return { url: targetUrl || '', params: {} };
  const sep = url.includes('?') ? '&' : '?';
  const params = {
    utm_source: o.platform || 'direct',
    utm_medium: o.medium || (isEcommerce(o.platform) ? 'ecommerce' : 'social'),
    utm_campaign: o.campaign || 'publish',
    utm_content: o.platform || '',
    ch: o.code || ''
  };
  const qs = Object.entries(params).filter(([, v]) => v).map(([k, v]) => encQuery(k, v)).join('&');
  return { url: qs ? url + sep + qs : url, params };
}

/**
 * 构建某平台的追踪描述符。
 * @param {object} o
 * @param {string} o.platform
 * @param {string} [o.targetUrl] 落地页（商品链接/H5）；空则用占位
 * @param {string} [o.campaign]
 * @param {string} [o.code]  可传入已定渠道码；否则新生成
 * @returns {{code, shortUrl, qrUrl, utmUrl, targetUrl, source, medium, campaign, qrSvg, persisted:null}}
 */
export function buildTracking(o = {}) {
  const platform = String(o.platform || '');
  const meta = getPlatformMeta(platform) || {};
  const code = o.code || genChannelCode(4);
  const medium = isEcommerce(platform) ? 'ecommerce' : 'social';
  const campaign = o.campaign || ('publish_' + platform);
  // 落地页：优先商家给的商品链接；否则给阿果 H5 画册占位（/s/xxx?ch=code）
  const fallbackTarget = (o.targetUrl && /^https?:/i.test(o.targetUrl))
    ? o.targetUrl
    : (SHORT_BASE + '/s/welcome?ch=' + code);
  const utm = withUtm(fallbackTarget, { platform, code, campaign, medium });
  const shortUrl = SHORT_BASE + '/r/' + code;
  const qrUrl = SHORT_BASE + '/q/' + code + '.svg';
  const svg = qrSvg(shortUrl, { fg: '#111111', bg: '#ffffff', quiet: 2 });
  return {
    code,
    platform,
    platformName: meta.name || platform,
    targetUrl: fallbackTarget,
    utmUrl: utm.url,
    shortUrl,
    qrUrl,
    qrSvg: svg,
    source: platform,
    medium,
    campaign,
    content: platform,
    persisted: null // tryPersist 后回填 {ok, code, record}
  };
}

/**
 * 把追踪信息「自动带上」：在文案末尾追加一行追踪引导（短链+二维码说明），
 * 并返回带 tracking 的 copy 补充块。电商平台把追踪链放进"客服/详情引导"。
 * @param {object} draft 阿文文案 { title, body, hashtags, bullets, description }
 * @param {object} tracking buildTracking 产物
 * @param {string} [lang]
 */
export function attachTracking(draft = {}, tracking = {}, lang = 'zh-CN') {
  if (!tracking || !tracking.code) return { draft, trackingLine: '' };
  const isEn = lang === 'en';
  const line = isEn
    ? `Shop now: ${tracking.shortUrl} (tracked)`
    : `🛒 购买/了解：${tracking.shortUrl}`;
  // 不污染主文案字段，单独给出 trackingLine，由打包/复制块使用
  return { draft, trackingLine: line, tracking };
}

/**
 * best-effort 把渠道码写进阿果 KV（createLink）。
 * 硬超时 2.5s；无 env.MEMBERS / 无 shop / 失败 一律软降级返回 {ok:false}，绝不阻断预览。
 * @param {object} env
 * @param {string} shop
 * @param {object} tracking buildTracking 产物
 */
export async function tryPersist(env, shop, tracking = {}) {
  if (!env || !env.MEMBERS || !shop || !tracking || !tracking.code) {
    return { ok: false, reason: 'no_kv_or_shop' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, 2500);
  try {
    const mod = await import('../analytics-store.js');
    const createLink = mod.createLink;
    if (typeof createLink !== 'function') return { ok: false, reason: 'no_createLink' };
    const rec = await createLink(env, shop, {
      kind: 'qr',
      target_url: tracking.utmUrl,
      source: tracking.platform,
      medium: tracking.medium,
      campaign: tracking.campaign,
      content: tracking.platform
    });
    tracking.persisted = { ok: true, code: rec.code, record: { code: rec.code, source: rec.source, status: rec.status } };
    return tracking.persisted;
  } catch (e) {
    return { ok: false, reason: 'persist_failed', message: String((e && e.message) || e).slice(0, 120) };
  } finally {
    clearTimeout(timer);
  }
}

export default { buildTracking, attachTracking, tryPersist, withUtm, genChannelCode, SHORT_BASE };
