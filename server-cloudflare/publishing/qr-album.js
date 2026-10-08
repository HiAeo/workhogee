/* =====================================================================
 * 阿发 · 二维码分享画册（H5）生成器
 * ---------------------------------------------------------------------
 * 4 页自包含 HTML：封面 / 图集 / 文案块 / 联系。
 * 文案由调用方传入（阿文产物），本模块不重写文案。
 * UTF-8 渲染前做 Unicode NFC 归一化，杜绝异体字/乱码。
 * 花名「通俗为主 + 备注学名」，如「绣球 (Hydrangea)」。
 * 产出可托管自包含 HTML（与 TOS 上传衔接：调用方拿 html 经 tosPut 托管）。
 * ===================================================================*/

import { qrSvg } from '../qrcode-svg.js';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// NFC 归一化：组合字符 -> 预组装字符，防乱码/异体字
export function nfc(s) {
  return String(s == null ? '' : s).normalize('NFC');
}

/**
 * 装配花名：通俗名 + 括号备注学名；缺学名则只返回通俗名。
 * @param {string} common  通俗名，如「绣球」
 * @param {string} [latin] 学名，如「Hydrangea」
 */
export function composeFlowerName(common, latin) {
  const c = nfc(common).trim();
  const l = nfc(latin || '').trim();
  if (!c) return '';
  return l ? `${c} (${l})` : c;
}

/**
 * 构建 4 页 H5 画册 HTML。
 * @param {object} env
 * @param {object} args
 * @param {string} args.flowerCommon  通俗花名
 * @param {string} [args.flowerLatin] 学名
 * @param {string} args.sellingPoint 一句卖点（封面）
 * @param {Array}  args.gallery       [{ url, caption }] 按 scene 套餐顺序
 * @param {string} args.momentsBody   朋友圈正文全文（文案块页）
 * @param {string} [args.h5ShortUrl]  画册短链（生成二维码内容；可空则用占位）
 * @param {string} [args.contactQrSvg] 联系/客服二维码 SVG（可空则占位）
 * @param {string} [args.brandSign]   品牌花名落款
 * @returns {{ok:boolean, html:string, flowerName:string, qrSvg:string, pages:string[]}}
 */
export function buildQrAlbum(env, args = {}) {
  const flowerName = composeFlowerName(args.flowerCommon, args.flowerLatin);
  const sellingPoint = nfc(args.sellingPoint || '').trim();
  const gallery = (Array.isArray(args.gallery) ? args.gallery : [])
    .filter(g => g && g.url)
    .map(g => ({ url: nfc(g.url), caption: nfc(g.caption || '').trim() }));
  const momentsBody = nfc(args.momentsBody || '').trim();
  const shortUrl = nfc(args.h5ShortUrl || 'https://example.com/album').trim();
  const contactQr = nfc(args.contactQrSvg || '').trim();
  const brandSign = nfc(args.brandSign || flowerName || '').trim();

  const qr = qrSvg(shortUrl, { fg: '#111', bg: '#fff', quiet: 4 });

  const galleryHtml = gallery.length
    ? gallery.map((g, i) => `
        <figure class="slide">
          <img src="${esc(g.url)}" alt="${esc('图' + (i + 1))}">
          ${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}
        </figure>`).join('')
    : '<div class="slide ph">图集占位</div>';

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(flowerName || '画册')}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-text-size-adjust:100%;}
  body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:#faf8f5;color:#2b2b2b;line-height:1.7;}
  .page{min-height:100vh;padding:48px 22px;max-width:520px;margin:0 auto;}
  .cover{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;min-height:100vh;}
  .cover .hero{width:100%;aspect-ratio:3/4;border-radius:14px;background:#eee;object-fit:cover;}
  .flower{font-size:30px;font-weight:700;margin-top:26px;letter-spacing:1px;}
  .sell{font-size:15px;color:#8a7f6d;margin-top:10px;}
  .gallery .slide{margin:0 0 26px;}
  .gallery img{width:100%;border-radius:12px;display:block;}
  .gallery figcaption{font-size:13px;color:#666;margin-top:8px;text-align:center;}
  .ph{aspect-ratio:3/4;background:#e6e2db;display:flex;align-items:center;justify-content:center;color:#aaa;border-radius:12px;}
  h2{font-size:18px;margin-bottom:14px;}
  .copyblock{white-space:pre-wrap;font-size:15px;background:#fff;border:1px solid #eee;border-radius:12px;padding:18px;}
  .qrwrap{text-align:center;margin-top:30px;}
  .qrwrap svg{width:200px;height:200px;}
  .qrwrap p{font-size:12px;color:#999;margin-top:8px;}
  .contact{text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;}
  .contact .qr{width:220px;height:220px;}
  .sign{margin-top:24px;font-size:14px;color:#8a7f6d;}
  .dots{display:flex;justify-content:center;gap:8px;margin-top:18px;}
  .dots i{width:6px;height:6px;border-radius:50%;background:#d8cfc0;}
</style></head><body>
  <section class="page cover">
    ${gallery[0] ? `<img class="hero" src="${esc(gallery[0].url)}" alt="cover">` : '<div class="hero"></div>'}
    <div class="flower">${esc(flowerName)}</div>
    <div class="sell">${esc(sellingPoint)}</div>
    <div class="dots"><i></i><i></i><i></i><i></i></div>
  </section>
  <section class="page gallery">
    <h2>图集</h2>
    ${galleryHtml}
  </section>
  <section class="page">
    <h2>朋友圈文案</h2>
    <div class="copyblock">${esc(momentsBody)}</div>
    <div class="qrwrap">${qr}<p>扫码查看完整预览</p></div>
  </section>
  <section class="page contact">
    <h2>联系我们</h2>
    ${contactQr ? `<div class="qr">${contactQr}</div>` : '<div class="qr ph">客服二维码占位</div>'}
    <div class="sign">— ${esc(brandSign)} —</div>
  </section>
</body></html>`;

  return {
    ok: true,
    html,
    flowerName,
    qrSvg: qr,
    pages: ['cover', 'gallery', 'copy_block', 'contact'],
    shortUrl
  };
}

export default { buildQrAlbum, nfc, composeFlowerName };
