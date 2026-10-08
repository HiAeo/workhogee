/* =====================================================================
 * 阿发 · 多平台素材一键打包（ZIP）—— 按平台自动分包
 * ---------------------------------------------------------------------
 * 按平台分文件夹、命名 {platform}_{type}_{seq}.{ext}。
 * 电商平台额外产出 title.txt / bullets.txt / description.txt / tracking.txt。
 * API 中立：纯 JS store 模式 ZIP（无压缩），CRC32 手写，无浏览器/Node fs 依赖。
 * ===================================================================*/

import { PACKAGING, isKnownPlatform, isEcommerce } from './platform-data.js';
import { buildCopyPayload, buildCaptionTxt } from './copy-payload.js';

/* ---------- CRC32 ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const enc = s => new TextEncoder().encode(s);
const DOS_TIME = 0x0000;
const DOS_DATE = 0x0021;

export function buildZip(files) {
  const entries = Object.keys(files).sort();
  const localChunks = [];
  const central = [];
  let offset = 0;

  for (const path of entries) {
    const nameBytes = enc(path);
    let data = files[path];
    if (typeof data === 'string') data = enc(data);
    const crc = crc32(data);
    const dvLocal = new DataView(new ArrayBuffer(30));
    dvLocal.setUint32(0, 0x04034b50, true);
    dvLocal.setUint16(4, 20, true);
    dvLocal.setUint16(6, 0x0800, true);
    dvLocal.setUint16(8, 0, true);
    dvLocal.setUint16(10, DOS_TIME, true);
    dvLocal.setUint32(12, DOS_DATE, true);
    dvLocal.setUint32(14, crc, true);
    dvLocal.setUint32(18, data.length, true);
    dvLocal.setUint32(22, data.length, true);
    dvLocal.setUint16(26, nameBytes.length, true);
    dvLocal.setUint16(28, 0, true);
    localChunks.push(new Uint8Array(dvLocal.buffer), nameBytes, data);

    const dvCent = new DataView(new ArrayBuffer(46));
    dvCent.setUint32(0, 0x02014b50, true);
    dvCent.setUint16(4, 20, true);
    dvCent.setUint16(6, 20, true);
    dvCent.setUint16(8, 0x0800, true);
    dvCent.setUint16(10, 0, true);
    dvCent.setUint16(12, DOS_TIME, true);
    dvCent.setUint32(14, crc, true);
    dvCent.setUint32(16, data.length, true);
    dvCent.setUint32(20, data.length, true);
    dvCent.setUint16(24, data.length, true);
    dvCent.setUint16(28, nameBytes.length, true);
    dvCent.setUint16(30, 0, true);
    dvCent.setUint16(32, 0, true);
    dvCent.setUint16(34, 0, true);
    dvCent.setUint16(36, 0, true);
    dvCent.setUint32(38, 0, true);
    dvCent.setUint32(42, offset, true);
    central.push({ head: new Uint8Array(dvCent.buffer), name: nameBytes });

    offset += 30 + nameBytes.length + data.length;
  }

  const localLen = localChunks.reduce((a, b) => a + b.length, 0);
  const cdLen = central.reduce((a, e) => a + e.head.length + e.name.length, 0);
  const out = new Uint8Array(localLen + cdLen + 22);
  let p = 0;
  for (const c of localChunks) { out.set(c, p); p += c.length; }
  const cdStart = p;
  for (const e of central) { out.set(e.head, p); p += e.head.length; out.set(e.name, p); p += e.name.length; }

  const dvEnd = new DataView(out.buffer, p, 22);
  dvEnd.setUint32(0, 0x06054b50, true);
  dvEnd.setUint16(4, 0, true);
  dvEnd.setUint16(6, 0, true);
  dvEnd.setUint16(8, entries.length, true);
  dvEnd.setUint16(10, entries.length, true);
  dvEnd.setUint32(12, cdLen, true);
  dvEnd.setUint32(16, cdStart, true);
  dvEnd.setUint16(20, 0, true);
  return out;
}

export function uint8ToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/**
 * 组装多平台打包（按平台自动分包）。
 * @param {object} env
 * @param {object} args
 * @param {string[]} args.platforms
 * @param {object}   args.drafts   { [platform]: { title, body, hashtags[], bullets[], price } }
 * @param {object}   args.mediaKeys { [platform]: [{ name, key, type, ext }] }
 * @param {object}   args.tracking { [platform]: { shortUrl, code, trackingLine } } 追踪信息
 * @param {string}   [args.dateTag]
 */
export function packageAssets(env, args = {}) {
  const platforms = (Array.isArray(args.platforms) ? args.platforms : []).filter(isKnownPlatform);
  if (!platforms.length) {
    return { ok: false, error: { code: 'bad_platforms', message: '至少需要一个有效发布平台' } };
  }
  const dateTag = String(args.dateTag || new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  const rootFolder = PACKAGING.rootFolder.replace('{date}', dateTag);
  const stamp = new Date();
  const pad = n => String(n).padStart(2, '0');
  const zipName = PACKAGING.zipName
    .replace('{YYYYMMDD-HHmm}', `${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}`);

  const files = {};
  const manifest = [];

  for (const plat of platforms) {
    const draft = (args.drafts && args.drafts[plat]) || {};
    const trk = (args.tracking && args.tracking[plat]) || {};
    const copy = buildCopyPayload(env, { platform: plat, draft, trackingLine: trk.trackingLine });
    const folder = rootFolder + plat + '/';
    const ec = isEcommerce(plat);

    files[folder + 'caption.txt'] = buildCaptionTxt(copy);
    if (copy.blocks.tags) files[folder + 'hashtags.txt'] = copy.blocks.tags;
    if (plat === 'wechat_official') files[folder + 'digest.txt'] = (copy.blocks.body || '').slice(0, 120);

    // 电商平台：独立字段文件
    if (ec) {
      if (draft.title) files[folder + 'title.txt'] = String(draft.title);
      if (Array.isArray(draft.bullets) && draft.bullets.length) files[folder + 'bullets.txt'] = draft.bullets.map((b, i) => `${i + 1}. ${b}`).join('\n');
      if (draft.body) files[folder + 'description.txt'] = String(draft.body);
    }

    // 追踪信息（渠道码 + 短链 + UTM）
    if (trk.shortUrl) {
      files[folder + 'tracking.txt'] = [
        '渠道码: ' + (trk.code || ''),
        '追踪短链: ' + trk.shortUrl,
        'UTM落地: ' + (trk.utmUrl || ''),
        '发布后请把商品/宝贝链接替换落地页并回贴短链'
      ].join('\n');
    }

    // 素材清单（图/视频已在 TOS，按命名规则登记，不内嵌字节）
    const keys = (args.mediaKeys && args.mediaKeys[plat]) || [];
    keys.forEach((m, i) => {
      const ext = String(m.ext || 'jpg').toLowerCase();
      const type = m.type === 'video' ? 'video' : (i === 0 ? 'cover' : 'img');
      const name = `${plat}_${type}_${String(i + 1).padStart(2, '0')}.${ext}`;
      manifest.push({ path: folder + name, type: m.type || 'image', tosKey: m.key });
    });
  }

  const zipBytes = buildZip(files);
  return {
    ok: true,
    rootFolder,
    zipName,
    zipBase64: uint8ToBase64(zipBytes),
    zipBytes,
    textFiles: Object.keys(files),
    manifest
  };
}

export default { packageAssets, buildZip, uint8ToBase64 };
