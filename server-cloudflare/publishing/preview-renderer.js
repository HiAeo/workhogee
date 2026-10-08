/* =====================================================================
 * 阿发 · 「已发布后」真实界面一体预览渲染器（根因级重做 v1.0）
 * ---------------------------------------------------------------------
 * 两类预览：
 *   social   —— 390×844 手机外框；多图轮播 + 可播放视频 + 逐字段内嵌复制按钮
 *   ecommerce—— 1280 桌面商品页；主图组轮播 + 价格/标题/五点/buy box
 *
 * 所见即所得：主副标题、正文、图片/视频、热门标签、追踪链接齐全；
 * 每个字段旁挂「复制」小按钮（内嵌，非割裂罗列）。
 * 输出自包含 HTML（内联 CSS + 交互 JS），离线可开，Playwright 可真机截图。
 * ===================================================================*/

import { MOBILE_FRAME, DESKTOP_FRAME, LAYOUT, isKnownPlatform, isEcommerce, getPlatformMeta } from './platform-data.js';
import { buildCopyPayload } from './copy-payload.js';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const AUTHOR = 'WorkHogee 商家';

/* ---------- 把 #话题# 渲染成蓝色（仅展示，不改复制载荷） ---------- */
function renderBodyWithTags(body, tags, tagColor) {
  let html = esc(body);
  for (const t of (Array.isArray(tags) ? tags : [])) {
    const tag = String(t || '').trim();
    if (!tag) continue;
    const withHash = tag.startsWith('#') ? tag : '#' + tag;
    const bare = tag.replace(/^#/, '');
    if (bare && body.includes(bare)) {
      html = html.split(esc(bare)).join(`<span style="color:${tagColor}">${esc(withHash)}</span>`);
    }
  }
  return html;
}

/* ---------- 多图轮播 + 视频（社交用） ---------- */
function carouselMedia(media, ratio, idPrefix) {
  const arr = Array.isArray(media) ? media : [];
  if (!arr.length) {
    return `<div class="af-media"><div class="af-ph">预览素材占位</div></div>`;
  }
  const slides = arr.map((m, i) => {
    const isVideo = m.type === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(m.url || '');
    if (isVideo) {
      return `<div class="af-slide${i === 0 ? ' on' : ''}"><video controls playsinline preload="metadata" src="${esc(m.url)}" style="width:100%;height:100%;object-fit:cover;"></video></div>`;
    }
    return `<div class="af-slide${i === 0 ? ' on' : ''}"><img src="${esc(m.url)}" alt="media ${i + 1}"></div>`;
  }).join('');
  const dots = arr.length > 1
    ? `<div class="af-dots">${arr.map((_, i) => `<i data-af-dot="${i}" class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>`
    : '';
  const page = arr.length > 1 ? `<div class="af-page">1/${arr.length}</div>` : '';
  return `<div class="af-media" data-af-carousel="${idPrefix}"><div class="af-track">${slides}</div>${dots}${page}</div>`;
}

/* ---------- 电商主图组（缩略图列 + 主图，轮播） ---------- */
function galleryMedia(media) {
  const arr = Array.isArray(media) ? media : [];
  if (!arr.length) {
    return `<div class="eg-main"><div class="eg-ph">主图占位</div></div>`;
  }
  const main = arr.map((m, i) => {
    const isVideo = m.type === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(m.url || '');
    if (isVideo) return `<div class="eg-slide${i === 0 ? ' on' : ''}"><video controls playsinline preload="metadata" src="${esc(m.url)}"></video></div>`;
    return `<div class="eg-slide${i === 0 ? ' on' : ''}"><img src="${esc(m.url)}" alt="main ${i + 1}"></div>`;
  }).join('');
  const thumbs = arr.map((m, i) =>
    `<div class="eg-thumb${i === 0 ? ' on' : ''}" data-af-thumb="${i}"><img src="${esc(m.url)}" alt="t${i + 1}"></div>`
  ).join('');
  return `<div class="eg-gallery" data-af-carousel="eg">
    <div class="eg-thumbs">${thumbs}</div>
    <div class="eg-main">${main}</div>
  </div>`;
}

/* ---------- 字段块 + 内嵌复制按钮 ---------- */
function fieldBlock(copyKey, label, text, opts = {}) {
  if (!text) return '';
  return `<div class="af-field" data-copy-key="${esc(copyKey)}">
    <button class="af-copy" type="button" title="一键复制 ${esc(label)}">复制</button>
    <span class="af-flabel">${esc(label)}</span>
    ${opts.html ? text : `<span class="af-ftext">${esc(text)}</span>`}
  </div>`;
}

/* ---------- 追踪 chip ---------- */
function trackingChip(trackingLine) {
  if (!trackingLine) return '';
  return `<div class="af-track">🔗 ${esc(trackingLine)}</div>`;
}

/* =====================================================================
 * 社交皮肤（手机外框）
 * ===================================================================*/
function phoneShell(innerCss, innerHtml, copyDict) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-text-size-adjust:100%;}
  body{display:flex;align-items:center;justify-content:center;min-height:100vh;background:#0f1115;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Arial,sans-serif;}
  .phone{width:${MOBILE_FRAME.width}px;height:${MOBILE_FRAME.height}px;border-radius:44px;overflow:hidden;position:relative;box-shadow:0 12px 48px rgba(0,0,0,.5);border:10px solid #111;}
  .statusbar{height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;font-size:13px;font-weight:600;color:#111;background:#fff;}
  .scr{height:calc(100% - 34px);overflow:hidden;position:relative;}
  .af-media{position:relative;width:100%;height:100%;background:#e9e9e9;}
  .af-track{display:flex;width:100%;height:100%;transition:transform .25s;}
  .af-slide{min-width:100%;height:100%;}
  .af-slide img{width:100%;height:100%;object-fit:cover;display:block;}
  .af-slide video{width:100%;height:100%;object-fit:cover;background:#000;}
  .af-ph{display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:13px;}
  .af-dots{position:absolute;left:0;right:0;bottom:10px;display:flex;justify-content:center;gap:5px;}
  .af-dots i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.5);}
  .af-dots i.on{background:#fff;}
  .af-page{position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.55);color:#fff;font-size:11px;padding:2px 7px;border-radius:9px;}
  .af-field{position:relative;}
  .af-copy{position:absolute;right:6px;top:2px;font-size:11px;color:#f97316;background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.4);border-radius:6px;padding:2px 8px;cursor:pointer;}
  .af-copy.done{color:#fff;background:#16a34a;border-color:#16a34a;}
  .af-flabel{display:none;}
  .af-ftext{display:none;}
  .af-track{margin:6px 14px;font-size:11px;color:#f97316;}
  ${innerCss}
</style></head><body>
<div class="phone">
  <div class="statusbar"><span>9:41</span><span>●●● 5G ▮</span></div>
  <div class="scr">${innerHtml}</div>
</div>
${interactiveScript(copyDict)}
</body></html>`;
}

function renderXhs(p) {
  const fold = p.body && [...p.body].length > 100;
  return {
    css: `.scr{background:#fff;display:flex;flex-direction:column;}
      .nav{display:flex;align-items:center;gap:8px;padding:10px 12px;font-size:14px;}
      .avatar{width:28px;height:28px;border-radius:50%;background:#ddd;}
      .follow{margin-left:auto;background:#ff2442;color:#fff;font-size:12px;padding:4px 12px;border-radius:14px;border:none;}
      .media{margin:0 12px;height:340px;border-radius:8px;overflow:hidden;}
      .title{font-size:17px;font-weight:700;padding:12px 14px 4px;}
      .body{font-size:14px;line-height:1.6;padding:4px 14px;color:#333;max-height:${fold ? '96px' : 'none'};overflow:hidden;}
      .more{color:#999;font-size:13px;}
      .author{display:flex;align-items:center;gap:8px;padding:10px 14px;font-size:12px;color:#999;}
      .ibar{display:flex;gap:18px;padding:8px 14px;font-size:14px;color:#666;margin-top:auto;}
      .cmt{padding:8px 14px;font-size:12px;color:#bbb;border-top:1px solid #f0f0f0;}`,
    html: `
      <div class="nav"><span>‹</span><div class="avatar"></div><span>${esc(AUTHOR)}</span><div class="follow">关注</div></div>
      <div class="media">${carouselMedia(p.media, '3:4', 'xhs')}</div>
      <div class="title">${fieldBlock('title', '标题', p.title)}${esc(p.title)}</div>
      <div class="body">${fieldBlock('body', '正文', p.body)}${renderBodyWithTags(p.body, p.tags, '#1264ff')}${fold ? '<span class="more"> ...展开</span>' : ''}</div>
      ${trackingChip(p.trackingLine)}
      <div class="author"><div class="avatar" style="width:22px;height:22px;"></div><span>${esc(AUTHOR)} · 刚刚 · 同城</span></div>
      <div class="ibar"><span>♡ 赞</span><span>☰ 评论</span><span>☆ 收藏</span><span>↗ 分享</span></div>
      <div class="cmt">说点什么…</div>`
  };
}

function renderDouyin(p) {
  return {
    css: `.scr{background:#000;position:relative;}
      .top{display:flex;justify-content:center;gap:24px;padding:10px 0;font-size:14px;color:#aaa;}
      .top .on{color:#fff;font-weight:700;}
      .stage{position:absolute;inset:0;}
      .rail{position:absolute;right:8px;bottom:120px;display:flex;flex-direction:column;gap:20px;align-items:center;font-size:18px;}
      .disc{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#333,#000);border:6px solid #222;}
      .bottom{position:absolute;left:0;right:70px;bottom:24px;padding:0 12px;}
      .nick{font-weight:700;font-size:15px;margin-bottom:6px;color:#fff;}
      .cap{font-size:13px;line-height:1.5;color:#eee;max-height:${[...p.body].length > 60 ? '60px' : 'none'};overflow:hidden;}
      .music{font-size:12px;color:#ccc;margin-top:8px;}`,
    html: `
      <div class="stage">${carouselMedia(p.media, '9:16', 'dy')}</div>
      <div class="top"><span>关注</span><span class="on">推荐</span><span>同城</span><span>⌕</span></div>
      <div class="rail"><div class="avatar" style="width:42px;height:42px;border-radius:50%;background:#555;">+</div><span>♡</span><span>☰</span><span>☆</span><span>↗</span><div class="disc"></div></div>
      <div class="bottom">
        <div class="nick">@${esc(AUTHOR)}</div>
        <div class="cap">${fieldBlock('body', '正文', p.body)}${renderBodyWithTags(p.body, p.tags, '#3aa0ff')}${[...p.body].length > 60 ? ' ...more' : ''}</div>
        ${trackingChip(p.trackingLine)}
        <div class="music">♫ 原声 · ${esc(AUTHOR)}</div>
      </div>`
  };
}

function renderMoments(p) {
  return {
    css: `.scr{background:#ededed;}
      .cover{height:120px;background:#cfd8dc;position:relative;}
      .me{position:absolute;right:12px;bottom:-18px;width:54px;height:54px;border-radius:6px;background:#bbb;border:2px solid #fff;}
      .card{display:flex;gap:10px;padding:22px 12px 8px;background:#fff;margin-top:6px;}
      .av{width:40px;height:40px;border-radius:6px;background:#ddd;flex:none;}
      .nm{font-weight:700;font-size:14px;color:#5b6b8c;}
      .txt{font-size:14px;line-height:1.5;margin-top:4px;color:#222;}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:8px;}
      .grid img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px;}
      .eng{margin:8px 12px 0 62px;background:#f2f6fc;color:#5b6b8c;font-size:12px;padding:5px 10px;border-radius:4px;text-align:right;}
      .ts{font-size:11px;color:#999;margin:6px 12px 0 62px;}`,
    html: `
      <div class="cover"><div class="me"></div></div>
      <div class="card"><div class="av"></div><div style="flex:1;">
        <div class="nm">${esc(AUTHOR)}</div>
        <div class="txt">${fieldBlock('body', '正文', p.body)}${esc(p.body)}</div>
        <div class="grid">${(Array.isArray(p.media) ? p.media : []).slice(0,9).map(m => `<img src="${esc(m.url)}" alt="">`).join('') || '<div></div>'}</div>
        ${trackingChip(p.trackingLine)}
      </div></div>
      <div class="eng">♡ 赞&nbsp;&nbsp;&nbsp;☰ 评论</div>
      <div class="ts">刚刚 · 来自微信</div>`
  };
}

function renderOfficial(p) {
  return {
    css: `.scr{background:#fff;overflow:hidden;}
      .cover{height:150px;background:#cfd8dc;}
      .tt{font-size:19px;font-weight:700;line-height:1.4;padding:14px 16px 4px;}
      .meta{font-size:12px;color:#999;padding:0 16px 10px;}
      .bd{font-size:15px;line-height:1.75;padding:0 16px;color:#222;max-height:300px;overflow:hidden;}
      .bd p{margin:0 0 12px;}
      .acct{display:flex;align-items:center;gap:8px;padding:14px 16px;border-top:8px solid #f2f2f2;margin-top:8px;}
      .av{width:36px;height:36px;border-radius:50%;background:#ddd;}
      .follow{margin-left:auto;background:#07c160;color:#fff;font-size:12px;padding:4px 14px;border-radius:4px;border:none;}`,
    html: `
      <div class="cover"></div>
      <div class="tt">${fieldBlock('title', '标题', p.title)}${esc(p.title)}</div>
      <div class="meta">${esc(AUTHOR)} · 公众号 · 刚刚</div>
      <div class="bd">${fieldBlock('body', '正文', p.body)}${esc(p.body).split('\n').map(x => `<p>${esc(x) || '&nbsp;'}</p>`).join('')}</div>
      ${trackingChip(p.trackingLine)}
      <div class="acct"><div class="av"></div><div><div style="font-weight:700;font-size:14px;">${esc(AUTHOR)}</div><div style="font-size:11px;color:#999;">点击关注</div></div><div class="follow">关注</div></div>`
  };
}

function renderInstagram(p) {
  const fold = p.body && [...p.body].length > 125;
  return {
    css: `.scr{background:#fff;display:flex;flex-direction:column;}
      .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;font-size:14px;}
      .av{width:28px;height:28px;border-radius:50%;background:#ddd;}
      .med{height:340px;background:#e9e9e9;}
      .act{display:flex;gap:16px;padding:10px 12px;font-size:18px;}
      .book{margin-left:auto;}
      .likes{font-size:13px;font-weight:700;padding:0 12px;}
      .cap{font-size:13px;line-height:1.5;padding:6px 12px;color:#222;max-height:${fold ? '60px' : 'none'};overflow:hidden;}
      .cap b{margin-right:6px;}
      .ts{font-size:11px;color:#999;padding:0 12px;}`,
    html: `
      <div class="hd"><div class="av"></div><b>${esc(AUTHOR)}</b><span style="margin-left:auto;color:#999;">···</span></div>
      <div class="med">${carouselMedia(p.media, '3:4', 'ig')}</div>
      <div class="act"><span>♡</span><span>☰</span><span>➤</span><span class="book">🔖</span></div>
      <div class="likes">Liked by others</div>
      <div class="cap"><b>${esc(AUTHOR)}</b>${fieldBlock('body', '正文', p.body)}${renderBodyWithTags(p.body, p.tags, '#00376b')}${fold ? ' ...more' : ''}</div>
      ${trackingChip(p.trackingLine)}
      <div class="ts">2h ago</div>`
  };
}

function renderTiktok(p) {
  return {
    css: `.scr{background:#000;position:relative;}
      .top{display:flex;justify-content:center;gap:24px;padding:10px 0;font-size:14px;color:#aaa;}
      .top .on{color:#fff;font-weight:700;}
      .stage{position:absolute;inset:0;}
      .rail{position:absolute;right:8px;bottom:120px;display:flex;flex-direction:column;gap:20px;align-items:center;font-size:18px;}
      .disc{width:44px;height:44px;border-radius:50%;background:radial-gradient(circle,#446 60%,#000);}
      .bottom{position:absolute;left:0;right:70px;bottom:24px;padding:0 12px;}
      .nick{font-weight:700;font-size:15px;margin-bottom:6px;color:#fff;}
      .cap{font-size:13px;line-height:1.5;color:#eee;max-height:${[...p.body].length > 100 ? '54px' : 'none'};overflow:hidden;}
      .music{font-size:12px;color:#ccc;margin-top:8px;}`,
    html: `
      <div class="stage">${carouselMedia(p.media, '9:16', 'tt')}</div>
      <div class="top"><span>Following</span><span class="on">For You</span><span>⌕</span></div>
      <div class="rail"><div class="av" style="width:44px;height:44px;border-radius:50%;background:#555;">+</div><span>♡</span><span>☰</span><span>☆</span><span>↗</span><div class="disc"></div></div>
      <div class="bottom">
        <div class="nick">@${esc(AUTHOR)}</div>
        <div class="cap">${fieldBlock('body', '正文', p.body)}${renderBodyWithTags(p.body, p.tags, '#4ec6ff')}${[...p.body].length > 100 ? ' ...more' : ''}</div>
        ${trackingChip(p.trackingLine)}
        <div class="music">♫ original sound</div>
      </div>`
  };
}

const SOCIAL_RENDERERS = {
  xiaohongshu: renderXhs, douyin: renderDouyin, wechat_moments: renderMoments,
  wechat_official: renderOfficial, instagram: renderInstagram, tiktok: renderTiktok
};

/* =====================================================================
 * 电商皮肤（桌面商品页）
 * ===================================================================*/
function desktopShell(innerCss, innerHtml, copyDict, brandColor, lang) {
  return `<!doctype html><html lang="${lang || 'zh-CN'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",Arial,sans-serif;color:#222;}
  .page{width:${DESKTOP_FRAME.width}px;margin:0 auto;background:#fff;min-height:${DESKTOP_FRAME.height}px;}
  .eg-gallery{display:flex;gap:14px;}
  .eg-thumbs{display:flex;flex-direction:column;gap:8px;}
  .eg-thumb{width:56px;height:56px;border:1px solid #ddd;border-radius:6px;overflow:hidden;cursor:pointer;}
  .eg-thumb.on{border-color:${brandColor};}
  .eg-thumb img{width:100%;height:100%;object-fit:cover;}
  .eg-main{width:460px;height:460px;border:1px solid #eee;border-radius:8px;overflow:hidden;position:relative;background:#fafafa;}
  .eg-slide{display:none;width:100%;height:100%;}
  .eg-slide.on{display:block;}
  .eg-slide img{width:100%;height:100%;object-fit:contain;}
  .eg-slide video{width:100%;height:100%;background:#000;}
  .eg-ph{display:flex;align-items:center;justify-content:center;height:100%;color:#aaa;}
  .af-field{position:relative;}
  .af-copy{position:absolute;right:0;top:0;font-size:11px;color:#f97316;background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.4);border-radius:6px;padding:2px 8px;cursor:pointer;}
  .af-copy.done{color:#fff;background:#16a34a;border-color:#16a34a;}
  .af-flabel{display:none;}
  .af-ftext{display:none;}
  .af-track{color:#f97316;font-size:12px;margin-top:6px;}
  ${innerCss}
</style></head><body>
<div class="page">${innerHtml}</div>
${interactiveScript(copyDict)}
</body></html>`;
}

function renderJd(p) {
  const bullets = (Array.isArray(p.bullets) ? p.bullets : []);
  return {
    css: `
      .jdnav{background:#e1251b;color:#fff;height:44px;display:flex;align-items:center;padding:0 20px;font-size:14px;}
      .jdnav .logo{font-weight:800;font-size:20px;margin-right:24px;}
      .jdnav .search{flex:1;max-width:520px;height:28px;background:#fff;border-radius:2px;display:flex;align-items:center;padding:0 10px;color:#999;font-size:13px;}
      .crumb{padding:10px 20px;font-size:12px;color:#888;}
      .jd-body{display:flex;gap:24px;padding:0 20px;}
      .jd-info{flex:1;}
      .jd-title{font-size:18px;font-weight:700;line-height:1.4;margin:6px 0 10px;padding-right:60px;}
      .jd-price{background:#fff5f5;border-radius:6px;padding:12px 14px;}
      .jd-price .now{color:#e1251b;font-size:26px;font-weight:800;}
      .jd-price .tag{display:inline-block;background:#e1251b;color:#fff;font-size:11px;border-radius:3px;padding:1px 6px;margin-left:8px;}
      .jd-tags{margin:10px 0;font-size:12px;color:#666;}
      .jd-tags i{display:inline-block;border:1px solid #e1251b;color:#e1251b;border-radius:3px;padding:1px 6px;margin-right:6px;font-style:normal;}
      .jd-btns{display:flex;gap:12px;margin-top:16px;}
      .jd-btns button{height:42px;border:none;border-radius:4px;font-size:15px;cursor:pointer;width:160px;}
      .add{background:#fff2e8;color:#e1251b;font-weight:700;}
      .buy{background:#e1251b;color:#fff;font-weight:700;}
      .jd-bullets{margin:16px 0 0;padding:14px 20px;background:#fafafa;}
      .jd-bullets h4{font-size:14px;margin-bottom:8px;}
      .jd-bullets li{font-size:13px;color:#444;line-height:1.9;margin-left:18px;}
      .seller{font-size:12px;color:#888;margin-top:10px;}`,
    html: `
      <div class="jdnav"><span class="logo">京东 JD</span><div class="search">${esc(p.title || '搜索商品')}</div></div>
      <div class="crumb">全部商品 &gt; 自营 &gt; ${esc(p.category || '精选品类')} &gt; 商品详情</div>
      <div class="jd-body">
        ${galleryMedia(p.media)}
        <div class="jd-info">
          <div class="jd-title">${fieldBlock('title', '商品标题', p.title)}${esc(p.title)}</div>
          <div class="jd-tags"><i>自营</i><i>京东物流</i><i>7天无理由</i></div>
          <div class="jd-price">${fieldBlock('price', '价格', p.price)}<span class="now">¥${esc(p.price || '—')}</span><span class="tag">京东价</span></div>
          <div class="jd-btns"><button class="add">加入购物车</button><button class="buy">立即购买</button></div>
          <div class="seller">${esc(AUTHOR)} 京东自营旗舰店 · 好评率 98% · 累计评价 2.3万+</div>
          ${trackingChip(p.trackingLine)}
        </div>
      </div>
      <div class="jd-bullets">
        <h4>商品卖点 / 规格参数</h4>
        ${fieldBlock('bullets', '卖点/五点', bullets.map((b,i)=>`${i+1}. ${b}`).join('\n'))}
        <ul>${bullets.map(b => `<li>${esc(b)}</li>`).join('') || '<li>暂无卖点</li>'}</ul>
      </div>`
  };
}

function renderTaobao(p) {
  const bullets = (Array.isArray(p.bullets) ? p.bullets : []);
  return {
    css: `
      .tbnag{background:#fff;height:44px;display:flex;align-items:center;padding:0 20px;border-bottom:1px solid #eee;}
      .tbnag .logo{color:#ff5000;font-weight:800;font-size:20px;margin-right:24px;}
      .tbnag .search{flex:1;max-width:520px;height:28px;border:1px solid #ff5000;border-radius:14px;display:flex;align-items:center;padding:0 12px;color:#999;font-size:13px;}
      .tb-body{display:flex;gap:24px;padding:16px 20px;}
      .tb-info{flex:1;}
      .tb-title{font-size:17px;font-weight:700;line-height:1.5;margin:4px 0 10px;padding-right:60px;}
      .tb-price{background:#fff7f2;border-radius:6px;padding:12px 14px;}
      .tb-price .now{color:#ff5000;font-size:26px;font-weight:800;}
      .tb-price .origin{color:#bbb;font-size:12px;text-decoration:line-through;margin-left:10px;}
      .tb-sku{margin:12px 0;font-size:13px;color:#666;}
      .tb-sku i{display:inline-block;border:1px solid #ddd;border-radius:4px;padding:3px 10px;margin:0 6px 6px 0;font-style:normal;cursor:pointer;}
      .tb-sku i.on{border-color:#ff5000;color:#ff5000;}
      .tb-btns{display:flex;gap:12px;margin-top:16px;}
      .tb-btns button{height:42px;border:none;border-radius:22px;font-size:15px;cursor:pointer;width:160px;}
      .add{background:#ffe8d9;color:#ff5000;font-weight:700;}
      .buy{background:#ff5000;color:#fff;font-weight:700;}
      .tb-sell{font-size:12px;color:#999;margin-top:10px;}`,
    html: `
      <div class="tbnag"><span class="logo">淘宝网</span><div class="search">${esc(p.title || '搜索宝贝')}</div></div>
      <div class="tb-body">
        ${galleryMedia(p.media)}
        <div class="tb-info">
          <div class="tb-title">${fieldBlock('title', '宝贝标题', p.title)}${esc(p.title)}</div>
          <div class="tb-price">${fieldBlock('price', '价格', p.price)}<span class="now">¥${esc(p.price || '—')}</span><span class="origin">¥${esc((Number(p.price||0)*1.5).toFixed(0))}</span></div>
          <div class="tb-sku"><span>颜色：</span><i class="on">默认</i><i>黑色</i><i>白色</i></div>
          <div class="tb-btns"><button class="add">加入购物车</button><button class="buy">立即购买</button></div>
          <div class="tb-sell">${esc(AUTHOR)} 旗舰店 · 月销 2000+ · 好评 4.9</div>
          ${trackingChip(p.trackingLine)}
        </div>
      </div>`
  };
}

function renderAmazon(p) {
  const bullets = (Array.isArray(p.bullets) ? p.bullets : []);
  return {
    css: `
      .amznav{background:#131921;color:#fff;height:48px;display:flex;align-items:center;padding:0 20px;}
      .amznav .logo{font-weight:800;font-size:20px;margin-right:20px;}
      .amznav .search{flex:1;max-width:640px;height:34px;background:#fff;border-radius:4px;display:flex;align-items:center;padding:0 12px;color:#999;font-size:13px;}
      .amzbody{display:flex;gap:28px;padding:16px 20px;}
      .amzinfo{flex:1;}
      .amz-title{font-size:20px;font-weight:600;line-height:1.3;margin:4px 0 6px;padding-right:60px;}
      .amz-brand{color:#007185;font-size:14px;}
      .amz-rate{color:#007185;font-size:13px;margin:4px 0;}
      .amz-rate .stars{color:#ffa41c;letter-spacing:2px;}
      .amz-price{font-size:22px;color:#b12704;margin:8px 0;}
      .amz-price .sym{font-size:13px;vertical-align:super;}
      .amz-buy{width:280px;border:1px solid #e7e7e7;border-radius:8px;padding:14px;}
      .amz-buy .price2{font-size:26px;color:#b12704;}
      .amz-buy .ship{font-size:12px;color:#565959;margin:8px 0;line-height:1.6;}
      .amz-buy button{width:100%;height:36px;border:none;border-radius:18px;font-size:14px;cursor:pointer;margin-top:8px;}
      .cart{background:#ffd814;color:#111;}
      .buynow{background:#ffa41c;color:#111;}
      .amz-bullets{padding:16px 20px;}
      .amz-bullets h2{font-size:16px;margin-bottom:10px;}
      .amz-bullets ul{margin-left:18px;}
      .amz-bullets li{font-size:14px;line-height:1.8;color:#222;margin-bottom:4px;}
      .amz-desc{padding:0 20px 24px;font-size:14px;line-height:1.7;color:#333;}`,
    html: `
      <div class="amznav"><span class="logo">amazon</span><div class="search">${esc(p.title || 'Search Amazon')}</div></div>
      <div class="amzbody">
        ${galleryMedia(p.media)}
        <div class="amzinfo">
          <div class="amz-brand">Visit the ${esc(p.brand || 'Brand')} Store</div>
          <div class="amz-title">${fieldBlock('title', 'Product Title', p.title)}${esc(p.title)}</div>
          <div class="amz-rate"><span class="stars">★★★★☆</span> 4.6 · ${esc((p.reviews||'1,234'))} ratings</div>
          <div class="amz-price">${fieldBlock('price', 'Price', p.price)}<span class="sym">$</span>${esc(p.price || '—')}</div>
          ${trackingChip(p.trackingLine)}
        </div>
        <div class="amz-buy">
          <div class="price2">$${esc(p.price || '—')}</div>
          <div class="ship">FREE delivery <b>Mon, Dec 15</b><br>Ships from Amazon.com<br>Sold by ${esc(AUTHOR)}</div>
          <button class="cart">Add to Cart</button>
          <button class="buynow">Buy Now</button>
        </div>
      </div>
      <div class="amz-bullets">
        <h2>About this item</h2>
        ${fieldBlock('bullets', 'Bullet Points', bullets.map((b,i)=>`${i+1}. ${b}`).join('\n'))}
        <ul>${bullets.map(b => `<li>${esc(b)}</li>`).join('') || '<li>—</li>'}</ul>
      </div>
      <div class="amz-desc">${fieldBlock('description', 'Description', p.body)}${esc(p.body)}</div>`
  };
}

const EC_RENDERERS = { jd: renderJd, taobao: renderTaobao, amazon: renderAmazon };

/* =====================================================================
 * 交互脚本（复制按钮 + 轮播 + 缩略图）
 * ===================================================================*/
function interactiveScript(copyDict) {
  const json = JSON.stringify(copyDict || {});
  return `<script>
  window.__AF_COPY__ = ${json};
  (function(){
    function copyText(t){
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(t).catch(function(){ return legacy(t); });
      }
      return legacy(t);
    }
    function legacy(t){
      var ta=document.createElement('textarea'); ta.value=t; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch(e){}
      document.body.removeChild(ta); return Promise.resolve();
    }
    document.addEventListener('click', function(e){
      var btn = e.target.closest && e.target.closest('.af-copy');
      if (!btn) return;
      var field = btn.closest('.af-field'); var key = field && field.getAttribute('data-copy-key');
      var text = (window.__AF_COPY__ && window.__AF_COPY__[key]) || '';
      copyText(text).then(function(){
        var old = btn.textContent; btn.textContent = '已复制 ✓'; btn.classList.add('done');
        setTimeout(function(){ btn.textContent = old; btn.classList.remove('done'); }, 1200);
      });
    });
    // 轮播（社交 af-track）
    document.querySelectorAll('[data-af-carousel]').forEach(function(root){
      var slides = root.querySelectorAll('.af-slide');
      if (slides.length < 2) return;
      var dots = root.querySelectorAll('.af-dots i');
      var idx = 0;
      function show(i){
        idx = (i + slides.length) % slides.length;
        var track = root.querySelector('.af-track');
        if (track) track.style.transform = 'translateX(-' + (idx*100) + '%)';
        slides.forEach(function(s,j){ s.classList.toggle('on', j===idx); });
        dots.forEach(function(d,j){ d.classList.toggle('on', j===idx); });
        var pg = root.querySelector('.af-page'); if (pg) pg.textContent = (idx+1) + '/' + slides.length;
      }
      dots.forEach(function(d,i){ d.addEventListener('click', function(){ show(i); }); });
      root._show = show;
    });
    // 电商缩略图
    document.querySelectorAll('[data-af-thumb]').forEach(function(th){
      th.addEventListener('click', function(){
        var i = Number(th.getAttribute('data-af-thumb'));
        var gallery = th.closest('.eg-gallery');
        gallery.querySelectorAll('.eg-thumb').forEach(function(x,j){ x.classList.toggle('on', j===i); });
        gallery.querySelectorAll('.eg-slide').forEach(function(x,j){ x.classList.toggle('on', j===i); });
      });
    });
  })();
</script>`;
}

/**
 * 渲染某平台「已发布界面」一体预览 HTML。
 * @param {object} env
 * @param {object} args
 * @param {string} args.platform
 * @param {object} args.draft   { title, body, hashtags[], bullets[], price }
 * @param {Array}  args.media   [{ url, type:'image'|'video', width, height, caption }]
 * @param {object} [args.mctx]  统一商品上下文（取 brand/category）
 * @param {string} [args.trackingLine]
 * @returns {{ok, platform, kind, skin, zones, html, copy}}
 */
export function renderPreview(env, args = {}) {
  const platform = String(args.platform || '');
  if (!isKnownPlatform(platform)) {
    return { ok: false, error: { code: 'bad_platform', message: '未知发布平台: ' + platform } };
  }
  const draft = args.draft && typeof args.draft === 'object' ? args.draft : {};
  const copy = buildCopyPayload(env, { platform, draft, trackingLine: args.trackingLine });
  const meta = getPlatformMeta(platform) || {};
  const layout = LAYOUT[platform];

  const p = {
    title: copy.blocks.title,
    body: copy.blocks.body,
    tags: Array.isArray(draft.hashtags) ? draft.hashtags : [],
    bullets: Array.isArray(draft.bullets) ? draft.bullets : [],
    price: strip(draft.price),
    media: args.media || [],
    trackingLine: args.trackingLine || '',
    brand: (args.mctx && args.mctx.brand) || draft.brand || '',
    category: (args.mctx && args.mctx.category && args.mctx.category.zh) || draft.category || '',
    reviews: draft.reviews
  };

  // 复制字典：field key -> 纯文本（按钮读取）
  const copyDict = {};
  (copy.fields || []).forEach(f => { copyDict[f.key] = f.text; });

  let html;
  if (isEcommerce(platform)) {
    const r = EC_RENDERERS[platform](p);
    const brandColor = platform === 'jd' ? '#e1251b' : (platform === 'taobao' ? '#ff5000' : '#007185');
    html = desktopShell(r.css, r.html, copyDict, brandColor, meta.lang === 'en' ? 'en' : 'zh-CN');
  } else {
    const r = SOCIAL_RENDERERS[platform](p);
    html = phoneShell(r.css, r.html, copyDict);
  }

  return {
    ok: true,
    platform,
    kind: layout.kind,
    skin: layout.skin,
    zones: layout.zones,
    description: layout.description,
    oauth: meta.oauth,
    oauthNote: meta.oauthNote,
    html,
    copy
  };
}

function strip(s) { return String(s == null ? '' : s); }

export default { renderPreview };
