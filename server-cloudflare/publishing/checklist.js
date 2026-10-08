/* =====================================================================
 * 阿发 · 逐平台操作清单 + 发布前规格/合规预检（识别不达标 → 自动修正）
 * ---------------------------------------------------------------------
 *  - getChecklist：每平台「点哪里、填什么」具体步骤（非说明书堆砌）+ 最佳时间
 *  - runPrePublishValidation：确定性预检，文本类不达标自动修正并返回 before→after；
 *    像素/时长类不达标明确提示需阿图重出/剪辑（不假装自动变像素）。
 * 纯函数，不烧 LLM。
 * ===================================================================*/

import {
  BEST_TIMES, PLATFORM_STEPS, HARD_SPECS, AD_LAW_WORDS, AD_LAW_WORDS_EN,
  SENSITIVE_WORDS, isKnownPlatform, isEcommerce, getPlatformMeta
} from './platform-data.js';

const count = s => [...String(s == null ? '' : s)].length;

function dims(s) {
  const m = String(s || '').match(/(\d+)\s*[×x*:]\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
function ratioOf(w, h) { return h ? w / h : 0; }

function scanWords(text, lexicon) {
  const hits = [];
  for (const w of lexicon) if (w && text.toLowerCase().includes(w.toLowerCase())) hits.push(w);
  return Array.from(new Set(hits));
}

/** 把命中词打码（自动修正）：word -> ▇▇▇ */
function redact(text, words) {
  let out = String(text == null ? '' : text);
  for (const w of words) {
    if (!w) continue;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '▇▇▇');
  }
  return out;
}

/**
 * 取某平台操作清单 + 最佳时间 + OAuth 状态。
 */
export function getChecklist(env, args = {}) {
  const platform = String(args.platform || '');
  if (!isKnownPlatform(platform)) {
    return { ok: false, error: { code: 'bad_platform', message: '未知发布平台' } };
  }
  const meta = getPlatformMeta(platform) || {};
  return {
    ok: true,
    platform,
    name: meta.name,
    group: meta.group,
    oauth: meta.oauth,
    oauthNote: meta.oauthNote,
    bestTimes: BEST_TIMES[platform] || [],
    steps: PLATFORM_STEPS[platform] || []
  };
}

/**
 * 发布前预检（含自动修正）。
 * @param {object} env
 * @param {object} args
 * @param {string} args.platform
 * @param {object} args.draft { title, body, hashtags[], bullets[], price }
 * @param {Array}  args.media  [{ type:'image'|'video', width, height, sizeMB, durationSec, ext }]
 * @returns {{ok, platform, passed, results:[{rule,pass,autoFixed,before,after,detail}], fixedDraft}}
 */
export function runPrePublishValidation(env, args = {}) {
  const platform = String(args.platform || '');
  if (!isKnownPlatform(platform)) {
    return { ok: false, error: { code: 'bad_platform', message: '未知发布平台' } };
  }
  const sp = HARD_SPECS[platform] || {};
  const ec = isEcommerce(platform);
  const meta = getPlatformMeta(platform) || {};
  const en = meta.lang === 'en';

  const draft = args.draft && typeof args.draft === 'object' ? args.draft : {};
  const media = Array.isArray(args.media) ? args.media.slice() : [];
  const images = media.filter(m => m.type !== 'video');
  const videos = media.filter(m => m.type === 'video');

  // 可变副本（自动修正写回）
  let title = String(draft.title || '');
  let body = String(draft.body || '');
  let bullets = Array.isArray(draft.bullets) ? draft.bullets.map(String) : [];
  let hashtags = Array.isArray(draft.hashtags) ? draft.hashtags.map(String) : [];
  const price = String(draft.price || '');

  const results = [];
  const push = (rule, pass, detail, extra = {}) =>
    results.push(Object.assign({ rule, pass, detail, autoFixed: false }, extra));

  /* 1 image_count */
  const maxImg = ec ? (sp.mainImageMax || 9) : (sp.imageMaxCount || sp.carouselMaxSlides || sp.photoModeMaxImages);
  const minImg = ec ? (sp.mainImageMin || 1) : (sp.imageMinCount || 1);
  if (images.length > maxImg) {
    media.length = 0; // 重置 media 以保留视频
    // 截断图片到 max，视频保留
    images.length = maxImg;
    media.push(...images, ...videos);
    push('image_count', true, `图片 ${images.length}+视频${videos.length} → 截断图片至上限 ${maxImg}`, { autoFixed: true, before: `图片${images.length + (media.length - images.length - videos.length > 0 ? 0 : 0)}张`, after: `图片${maxImg}张` });
  } else if (images.length < minImg) {
    push('image_count', false, `主图 ${images.length} 张 < 要求最少 ${minImg} 张（需阿图补图，不能自动生成）`);
  } else {
    push('image_count', true, `图片 ${images.length} 张 / 要求 ${minImg}~${maxImg}`);
  }

  /* 2 image_ratio */
  const want = dims(sp.mainImageRecommendedSize || sp.imageRecommendedSize || sp.feedPortrait || sp.videoSize);
  if (want && images.length) {
    const wantR = ratioOf(want[0], want[1]);
    const bad = images.filter(m => m.width && m.height && Math.abs(ratioOf(m.width, m.height) - wantR) > 0.12);
    push('image_ratio', bad.length === 0,
      `建议 ${want[0]}:${want[1]}（≈${wantR.toFixed(2)}）；偏差 ${bad.length} 张` + (bad.length ? ' → 需阿图按目标比例重出' : ''),
      { before: bad.length ? `${bad.length} 张比例偏差` : '符合', after: '符合' });
  } else {
    push('image_ratio', true, '无图或无推荐比例，跳过');
  }

  /* 3 image_resolution */
  if (want && images.length) {
    const longEdge = Math.max(want[0], want[1]);
    const low = images.filter(m => m.width && m.height && Math.max(m.width, m.height) < longEdge * 0.9);
    push('image_resolution', low.length === 0,
      `建议长边≥${longEdge}px${ec ? '（电商需≥1000px支持放大）' : ''}；偏低 ${low.length} 张` + (low.length ? ' → 需阿图重出高清' : ''));
  } else {
    push('image_resolution', true, '无图，跳过');
  }

  /* 4 image_white_bg（电商） */
  if (ec) {
    push('image_white_bg', true, sp.mainImageWhiteBg || '首图要求见平台');
  } else {
    push('image_white_bg', true, '社交平台无白底强制要求');
  }

  /* 5 file_size */
  const maxMB = sp.imageMaxMB || sp.materialImageMaxMB || sp.photoModeMaxMB;
  if (maxMB && images.length) {
    const mbOf = m => (typeof m.sizeMB === 'number' ? m.sizeMB : (m.size ? m.size / 1048576 : 0));
    const big = images.filter(m => mbOf(m) > maxMB);
    push('file_size', big.length === 0, `单图上限 ${maxMB}MB；超限 ${big.length} 个` + (big.length ? ' → 需压缩' : ''));
  } else {
    push('file_size', true, '无文件大小约束或无图，跳过');
  }

  /* 6 format */
  if (sp.formats && images.length) {
    const badFmt = images.filter(m => m.ext && !sp.formats.includes(String(m.ext).toLowerCase()));
    push('format', badFmt.length === 0,
      `接受格式 ${sp.formats.join('/')}；不符 ${badFmt.length} 个` + (badFmt.length ? ' → 需转格式' : ''));
  } else {
    push('format', true, '无格式约束，跳过');
  }

  /* 7 title_length */
  const tMax = sp.titleMax;
  if (tMax && count(title) > tMax) {
    const before = title;
    title = [...title].slice(0, tMax).join('');
    push('title_length', true, `标题 ${count(before)} > ${tMax} 字 → 自动截断`, { autoFixed: true, before: `${count(before)}字`, after: `${count(title)}字`, fixed: title });
  } else {
    push('title_length', tMax ? true : true, tMax ? `标题 ${count(title)}/${tMax} 字` : '该平台无独立标题，跳过');
  }

  /* 8 bullet_count (Amazon) */
  if (sp.bulletCount != null) {
    if (bullets.length > sp.bulletCount) {
      bullets = bullets.slice(0, sp.bulletCount);
      push('bullet_count', true, `五点 ${bullets.length} > ${sp.bulletCount} → 自动截断`, { autoFixed: true, after: `${bullets.length} 条`, fixed: bullets });
    } else if (bullets.length < sp.bulletCount) {
      push('bullet_count', false, `五点 ${bullets.length} < 建议 ${sp.bulletCount} 条（需阿文补写，不能自动编造）`);
    } else {
      push('bullet_count', true, `五点 ${bullets.length} 条`);
    }
  } else {
    push('bullet_count', true, '该平台无五点强制要求');
  }

  /* 9 bullet_length */
  const bMax = sp.bulletMaxChars;
  if (bMax && bullets.length) {
    let changed = false;
    bullets = bullets.map(b => {
      if (count(b) > bMax) { changed = true; return [...b].slice(0, bMax).join(''); }
      return b;
    });
    push('bullet_length', true, changed ? `存在单条>${bMax}字符 → 自动截断` : `每条五点 ≤ ${bMax} 字符`, { autoFixed: changed, fixed: changed ? bullets : undefined });
  } else {
    push('bullet_length', true, '无五点长度约束，跳过');
  }

  /* 10 body_length */
  const bodyMax = sp.bodyMax || sp.descriptionMax;
  if (bodyMax && count(body) > bodyMax) {
    const before = count(body);
    body = [...body].slice(0, bodyMax).join('');
    push('body_length', true, `正文 ${before} > ${bodyMax} 字 → 自动截断`, { autoFixed: true, before: `${before}字`, after: `${count(body)}字`, fixed: body });
  } else {
    push('body_length', true, bodyMax ? `正文 ${count(body)}/${bodyMax} 字` : '无正文硬上限');
  }

  /* 11 video_duration */
  const vMax = sp.videoMaxSec;
  if (vMax && videos.length) {
    const over = videos.filter(v => v.durationSec && v.durationSec > vMax);
    push('video_duration', over.length === 0,
      `视频上限 ${vMax}s；超时 ${over.length} 个` + (over.length ? `（${over.map(v=>v.durationSec+'s').join(',')}）→ 需剪辑至建议${sp.videoRecommendedSec||''}` : ''));
  } else {
    push('video_duration', true, '无视频或无时长约束，跳过');
  }

  /* 12 hashtag_count */
  const hMax = sp.hashtagMax;
  if (hMax != null && hashtags.length > hMax) {
    const before = hashtags.length;
    hashtags = hashtags.slice(0, hMax);
    push('hashtag_count', true, `话题 ${before} > ${hMax} → 自动删尾部`, { autoFixed: true, before: `${before}个`, after: `${hMax}个`, fixed: hashtags });
  } else {
    push('hashtag_count', true, hMax != null ? `话题 ${hashtags.length}/${hMax} 个` : '无话题硬上限（按推荐执行）');
  }

  /* 13 price_required（电商） */
  if (ec && !price) {
    push('price_required', false, '电商平台价格必填 → 请补价格（不能自动编造）');
  } else {
    push('price_required', true, ec ? `价格 ${price || '—'}` : '社交平台无价格字段');
  }

  /* 14 ad_law_words（中文 + 英文）自动打码 */
  const adLexicon = en ? AD_LAW_WORDS_EN : AD_LAW_WORDS;
  const adHits = scanWords(title + ' ' + body + ' ' + bullets.join(' '), adLexicon);
  if (adHits.length) {
    title = redact(title, adHits);
    body = redact(body, adHits);
    bullets = bullets.map(b => redact(b, adHits));
    push('ad_law_words', true, `命中广告法极限词 [${adHits.join('、')}] → 自动打码替换`, { autoFixed: true, before: adHits.join('、'), after: '▇▇▇', fixed: { title, body, bullets } });
  } else {
    push('ad_law_words', true, '广告法/英文促销词 0 命中');
  }

  /* 15 sensitive_words */
  const senHits = scanWords(title + ' ' + body + ' ' + hashtags.join(' '), SENSITIVE_WORDS);
  if (senHits.length) {
    title = redact(title, senHits);
    body = redact(body, senHits);
    push('sensitive_words', true, `命中导流/敏感词 [${senHits.join('、')}] → 自动打码`, { autoFixed: true, before: senHits.join('、'), after: '▇▇▇' });
  } else {
    push('sensitive_words', true, '敏感/导流词 0 命中');
  }

  const passed = results.every(r => r.pass);
  const fixedDraft = { title, body, bullets, hashtags, price };
  return {
    ok: true,
    platform,
    passed,
    results,
    autoFixedCount: results.filter(r => r.autoFixed).length,
    failedRules: results.filter(r => !r.pass).map(r => r.rule),
    fixedDraft
  };
}

export default { getChecklist, runPrePublishValidation };
