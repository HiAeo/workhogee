/* =====================================================================
 * 阿发 · 复制载荷装配（逐字段一键复制）
 * ---------------------------------------------------------------------
 * 纯文本输出：不带 Markdown 符号、不带 HTML；话题保留 # 号。
 *  - blocks：向后兼容（title/body/tags 三段）
 *  - fields：逐字段复制块 [{key,label,text}]，供预览页内嵌「复制」按钮
 *    电商平台额外产出 title / bullets / description / price / tracking
 * ===================================================================*/

import { isKnownPlatform, isEcommerce, getPlatformMeta } from './platform-data.js';

export function stripMarkdown(s) {
  return String(s == null ? '' : s)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/_{1,3}([^_]*)\_{1,3}/g, '$1')
    .replace(/~{1,3}([^_]*)~{1,3}/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatHashtags(hashtags) {
  const arr = Array.isArray(hashtags) ? hashtags : [];
  return arr.map(t => String(t == null ? '' : t).trim()).filter(Boolean)
    .map(t => (t.startsWith('#') ? t : '#' + t)).join(' ');
}

const n = s => [...String(s == null ? '' : s)].length;

/**
 * 装配某平台复制载荷。
 * @param {object} args
 * @param {string} args.platform
 * @param {object} args.draft  { title, body, hashtags[], bullets[], price }
 * @param {string} [args.trackingLine] 追踪引导行（attachTracking 产物）
 * @returns {{ok, platform, blocks:{title,body,tags}, fields:[{key,label,text}], all, counts}}
 */
export function buildCopyPayload(env, args = {}) {
  const platform = String(args.platform || '');
  if (!isKnownPlatform(platform)) {
    return { ok: false, error: { code: 'bad_platform', message: '未知发布平台: ' + platform }, blocks: { title: '', body: '', tags: '' }, fields: [] };
  }
  const draft = args.draft && typeof args.draft === 'object' ? args.draft : {};
  const meta = getPlatformMeta(platform) || {};
  const ec = isEcommerce(platform);
  const isEn = meta.lang === 'en';

  // 朋友圈无独立标题
  const title = platform === 'wechat_moments' ? '' : stripMarkdown(draft.title);
  const body = stripMarkdown(draft.body);
  const tags = formatHashtags(draft.hashtags);
  const price = stripMarkdown(draft.price);
  const bullets = (Array.isArray(draft.bullets) ? draft.bullets : []).map(stripMarkdown).filter(Boolean);
  const trackingLine = String(args.trackingLine || '').trim();

  // ---- 向后兼容 blocks（社交三段；电商 title/body/tags 仍可用）----
  const blocks = { title, body, tags };

  // ---- 逐字段复制块 ----
  const fields = [];
  if (ec) {
    fields.push({ key: 'title', label: isEn ? 'Product Title' : '商品标题', text: title });
    if (bullets.length) {
      fields.push({
        key: 'bullets',
        label: isEn ? `Bullet Points (${bullets.length})` : `卖点/五点 (${bullets.length})`,
        text: bullets.map((b, i) => (isEn ? `${i + 1}. ${b}` : `${i + 1}. ${b}`)).join('\n')
      });
    }
    if (body) fields.push({ key: 'description', label: isEn ? 'Description' : '详情描述', text: body });
    if (price) fields.push({ key: 'price', label: isEn ? 'Price' : '价格', text: price });
  } else {
    if (title) fields.push({ key: 'title', label: '标题', text: title });
    if (body) fields.push({ key: 'body', label: '正文', text: body });
    if (tags) fields.push({ key: 'tags', label: '话题', text: tags });
  }
  if (trackingLine) fields.push({ key: 'tracking', label: isEn ? 'Tracking link' : '追踪链接', text: trackingLine });

  // ---- 一键全复制 ----
  const parts = [];
  if (title) parts.push(title);
  if (bullets.length) parts.push(bullets.map((b, i) => `${i + 1}. ${b}`).join('\n'));
  if (body) parts.push(body);
  if (price) parts.push(price);
  if (tags) parts.push(tags);
  if (trackingLine) parts.push(trackingLine);
  const all = parts.join('\n\n');

  return {
    ok: true,
    platform,
    blocks,
    fields: fields.filter(f => f.text),
    all,
    counts: { title: n(title), body: n(body), tags: n(tags), bullets: bullets.length, total: n(all) }
  };
}

/** caption.txt 内容（打包用）：字段用 === 分隔。 */
export function buildCaptionTxt(payload) {
  if (!payload || !payload.ok) return '';
  return (payload.fields || []).map(f => `${f.label}\n${f.text}`).join('\n===\n');
}

export default { buildCopyPayload, formatHashtags, stripMarkdown, buildCaptionTxt };
