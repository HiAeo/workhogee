// aview-studio.js —— 阿视（短视频伙计）工作台接入入口
// ---------------------------------------------------------------------------
// 暴露 window.openAviewStudio(mctx, copy, opts)。整合方在 workbench.html 里
// 用户选好商品（已有 mctx）+ 阿文文案（copy）后，一键出抖音/TikTok 短视频。
//
// 全流程（成本可控核心：图文成片，0 Seedance i2v）：
//   1. POST /aview/storyboard  用 mctx+copy 动态生成分镜（hook/卖点/CTA + Ken Burns）
//   2. POST /tts               逐镜合成旁白（mp3 + 逐词 words），英文传英文 speaker
//   3. composeSlideshowVideo   浏览器内：静帧+Ken Burns+旁白+烧字幕 → mp4
//
// 注意：本文件只暴露入口与流程编排；分镜/合成核心在 server-cloudflare/aview/ 与
//       video-composer.js。未改全局路由/主工作台。
import { composeSlideshowVideo } from './video-composer.js';

// 统一走 API base（workbench.html 全局 API）+ 会员鉴权头；避免相对路径打到前端域、避免 401。
function apiBase() { try { return (typeof API !== 'undefined' ? API : '').replace(/\/$/, ''); } catch (e) { return ''; } }
function hh() { const h = { 'Content-Type': 'application/json' }; try { if (window.HogeeMember && window.HogeeMember.authHeaders) Object.assign(h, window.HogeeMember.authHeaders()); } catch (e) {} return h; }

/**
 * 一键出片。
 * @param {object} mctx  buildMerchantContext 产物（共享统一上下文）
 * @param {object|string} copy  阿文文案 {cps:{douyin:{title,body},tiktok:{...}}} 或字符串
 * @param {object} opts { platform:'douyin'|'tiktok', images:[url|dataURL], onProgress?, signal? }
 * @returns {Promise<{blob, durationSec, bytes, shots}>}
 */
export async function openAviewStudio(mctx, copy, opts = {}) {
  const platform = opts.platform || (mctx?.language?.code === 'en' ? 'tiktok' : 'douyin');
  const report = (f, m) => { try { opts.onProgress?.(f, m); } catch {} };

  // 1) 分镜
  report(0.02, '生成分镜…');
  const sbResp = await fetch(apiBase() + '/aview/storyboard', {
    method: 'POST', headers: hh(),
    body: JSON.stringify({ mctx, copy, platform, images: opts.images || [] }),
  });
  if (!sbResp.ok) throw new Error('storyboard http ' + sbResp.status);
  const sb = await sbResp.json();
  if (!sb.ok) throw new Error('storyboard: ' + JSON.stringify(sb.error));

  // 2) 逐镜 TTS（英文用同一解说小明喂英文，已真机验证）
  const shots = [];
  for (let i = 0; i < sb.shots.length; i++) {
    report(0.05 + (i / sb.shots.length) * 0.3, `旁白 ${i + 1}/${sb.shots.length}…`);
    const t = await fetch(apiBase() + '/tts', {
      method: 'POST', headers: hh(),
      body: JSON.stringify({ text: sb.shots[i].narration }),
    }).then(r => r.json());
    // /tts 返回 { mp3(dataURL), words }
    shots.push({
      imageUrl: sb.shots[i].image,
      mp3Url: t.mp3,
      words: t.words || [],
      kenBurns: sb.shots[i].kenBurns,
      onScreenText: sb.shots[i].onScreenText || '',
      role: sb.shots[i].role,
    });
  }

  // 3) 浏览器图文成片
  report(0.4, '浏览器合成…');
  const res = await composeSlideshowVideo({ shots, onProgress: (f, m) => report(0.4 + f * 0.6, m), signal: opts.signal });
  return { blob: res.blob, durationSec: res.durationSec, bytes: res.bytes, shots: sb.shots };
}

// 挂到全局，供工作台直接调用
if (typeof window !== 'undefined') {
  window.openAviewStudio = openAviewStudio;
}

export default { openAviewStudio };
