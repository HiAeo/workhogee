/* =====================================================================
 * WorkHogee · 会员认证共享脚本（member-auth.js，纯原生、无依赖）
 * ---------------------------------------------------------------------
 * 官网与 Web 工作台共用：
 *   - 顶部导航放 <div class="member-nav" data-member-nav></div>，自动渲染
 *     「Hogee会员注册 / 登录」，登录后变为「账号 / 退出」；
 *   - 工作台 <body data-member-gate> 会在未登录时显示全屏门禁；
 *   - 生图请求用 HogeeMember.authFetch() 自动带会员令牌；
 *   - 流程内可用 await HogeeMember.requireAuth() 强制先登录。
 * 登录弹窗为「即梦式」左右分屏：左侧五个伙计幻灯片，右侧手机号 +
 * 验证码登录（未注册自动注册），另保留低调的账号密码登录入口。
 * 令牌仅存 localStorage，绝不写进任何页面源码；所有请求走 api 子域。
 * ===================================================================*/
(function () {
  'use strict';

  var API_BASE = 'https://api.workhogee.com';
  var LS_TOKEN = 'hogee_mtoken';
  var LS_USER = 'hogee_muser';

  var state = {
    token: null,
    user: null,
    mode: 'login',
    authKind: 'code',
    memberType: null,
    injected: false,
    gate: false,
    waitResolve: null,
    waitReject: null
  };

  try {
    state.token = localStorage.getItem(LS_TOKEN) || null;
    state.user = JSON.parse(localStorage.getItem(LS_USER) || 'null');
  } catch (e) { state.token = null; state.user = null; }

  /* ---------------- 工具 ---------------- */
  function el(id) { return document.getElementById(id); }
  function saveSession(token, user) {
    state.token = token; state.user = user;
    try {
      localStorage.setItem(LS_TOKEN, token);
      localStorage.setItem(LS_USER, JSON.stringify(user || {}));
    } catch (e) {}
  }
  function clearSession() {
    state.token = null; state.user = null;
    try { localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_USER); } catch (e) {}
  }
  function dispatch(name) {
    try { document.dispatchEvent(new CustomEvent(name, { detail: state.user })); } catch (e) {}
  }
  function accountType(a) {
    a = String(a || '').trim().toLowerCase();
    if (a === 'workhogee') return 'admin'; // 官方运营账号（用户名 + 密码登录）
    if (/^1[3-9]\d{9}$/.test(a)) return 'phone';
    if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(a)) return 'email';
    return null;
  }

  /* ---------------- 样式 ---------------- */
  var CSS = [
    /* ===== 顶部导航会员区 ===== */
    '.member-nav{display:flex;align-items:center;gap:10px;}',
    '.hm-navbtn{appearance:none;border:0;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;border-radius:999px;padding:9px 18px;line-height:1;white-space:nowrap;transition:transform .18s ease,background-color .18s ease,border-color .18s ease,color .18s ease;}',
    '.hm-navbtn:active{transform:translateY(1px);}',
    '.hm-navbtn-primary{background:#ea580c;color:#fff;box-shadow:0 6px 18px rgba(234,88,12,.28);}',
    '.hm-navbtn-primary:hover{background:#c2410c;}',
    '.hm-navbtn-ghost{background:rgba(13,11,9,.50);color:#fff;border:1px solid rgba(255,255,255,.55);}',
    '.hm-navbtn-ghost:hover{border-color:#fff;background:rgba(13,11,9,.72);}',
    '.hm-navuser{display:inline-flex;align-items:center;gap:8px;max-width:180px;font-size:13px;color:#fff;background:rgba(13,11,9,.50);border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:8px 14px;white-space:nowrap;}',
    '.hm-navuser .hm-dot{width:7px;height:7px;border-radius:50%;background:#ea580c;flex:none;}',
    '.hm-navuser span{overflow:hidden;text-overflow:ellipsis;}',
    '.hm-navlogout{appearance:none;cursor:pointer;font-family:inherit;font-size:12px;color:rgba(255,255,255,.72);background:transparent;border:0;padding:4px 2px;}',
    '.hm-navlogout:hover{color:#fff;}',
    /* ===== 遮罩 + 分屏卡片 ===== */
    '.hm-overlay{position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(8,7,6,.66);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}',
    '.hm-overlay.hm-show{display:flex;animation:hmFade .22s ease;}',
    '@keyframes hmFade{from{opacity:0}to{opacity:1}}',
    '.hm-card{width:min(900px,94vw);height:560px;max-height:94vh;display:grid;grid-template-columns:1.04fr 1fr;background:#0d1119;border:1px solid rgba(255,255,255,.09);border-radius:20px;overflow:hidden;box-shadow:0 36px 90px rgba(0,0,0,.6);color:#fff;position:relative;animation:hmPop .28s cubic-bezier(.2,.8,.2,1);}',
    '.hm-card::before{content:"";position:absolute;inset:0;z-index:0;pointer-events:none;background:radial-gradient(700px 460px at 16% -14%,rgba(99,102,241,.22),rgba(99,102,241,0) 60%),radial-gradient(770px 490px at 50% -26%,rgba(251,122,34,.20),rgba(251,122,34,0) 63%),radial-gradient(660px 460px at 90% -16%,rgba(239,68,68,.16),rgba(239,68,68,0) 60%),radial-gradient(550px 420px at 82% 26%,rgba(56,189,248,.11),rgba(56,189,248,0) 62%),radial-gradient(620px 430px at 50% 122%,rgba(251,122,34,.09),rgba(251,122,34,0) 68%);animation:hmAurora 28s ease-in-out infinite alternate;}',
    '@keyframes hmAurora{0%{transform:translate3d(-2.2%,0,0) scale(1)}100%{transform:translate3d(2.4%,-2.5%,0) scale(1.09)}}',
    '@media(prefers-reduced-motion:reduce){.hm-card::before{animation:none}}',
    '@keyframes hmPop{from{opacity:0;transform:translateY(16px) scale(.98)}to{opacity:1;transform:none}}',
    /* ===== 左侧：伙计幻灯片 ===== */
    '.hm-hero{position:relative;z-index:1;overflow:hidden;background:transparent;min-width:0;}',
    '.hh-viewport{position:absolute;inset:0;overflow:hidden;}',
    '.hh-track{display:flex;height:100%;transition:transform .58s cubic-bezier(.22,.8,.24,1);}',
    '.hh-slide{flex:0 0 100%;position:relative;display:flex;align-items:flex-end;justify-content:center;height:100%;}',
    '.hh-slide::after{content:"";position:absolute;left:50%;bottom:46px;width:190px;height:26px;transform:translateX(-50%);background:radial-gradient(closest-side,rgba(0,0,0,.55),transparent 72%);filter:blur(1px);}',
    '.hh-slide img{position:relative;z-index:1;height:88%;width:auto;object-fit:contain;object-position:bottom center;filter:drop-shadow(0 18px 30px rgba(0,0,0,.45));}',
    '.hh-arrow{position:absolute;top:50%;transform:translateY(-50%);z-index:5;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(12,11,15,.4);color:rgba(255,255,255,.78);cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);transition:background .18s,color .18s,border-color .18s;}',
    '.hh-arrow:hover{background:rgba(234,88,12,.82);border-color:transparent;color:#fff;}',
    '.hh-arrow.prev{left:14px;}.hh-arrow.next{right:14px;}',
    '.hh-scrim{position:absolute;left:0;right:0;bottom:0;z-index:3;height:38%;background:linear-gradient(to top,rgba(10,9,14,.85),transparent);pointer-events:none;}',
    '.hh-meta{position:absolute;left:0;right:0;bottom:0;z-index:4;padding:0 22px 20px;display:flex;flex-direction:column;align-items:center;text-align:center;}',
    '.hh-name{font-size:21px;font-weight:700;letter-spacing:.5px;}',
    '.hh-role{font-size:13px;color:#fd9b53;margin-top:3px;letter-spacing:1px;}',
    '.hh-dots{display:flex;gap:7px;margin-top:12px;}',
    '.hh-dots button{width:7px;height:7px;border-radius:50%;border:0;padding:0;cursor:pointer;background:rgba(255,255,255,.32);transition:all .22s;}',
    '.hh-dots button.on{background:#fb7a22;width:18px;border-radius:4px;}',
    /* ===== 右侧：登录表单 ===== */
    '.hm-pane{padding:26px 32px 22px;display:flex;flex-direction:column;position:relative;z-index:1;min-width:0;min-height:0;overflow-y:auto;}',
    '.hp-top{display:flex;align-items:center;justify-content:space-between;flex:none;}',
    '.hp-logo svg{display:block;height:25px;width:auto;}',
    '.hm-close{width:34px;height:34px;border-radius:50%;border:0;background:transparent;color:rgba(255,255,255,.58);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .18s,color .18s;}',
    '.hm-close:hover{background:rgba(255,255,255,.08);color:#fff;}',
    '.hp-title{font-size:23px;font-weight:700;margin:22px 0 4px;letter-spacing:.2px;}',
    '.hp-sub{font-size:12.5px;color:rgba(255,255,255,.45);margin:0 0 30px;}',
    '#hmForm{display:flex;flex-direction:column;}',
    '.hm-field{margin-bottom:13px;flex:none;}',
    '.hm-input{width:100%;box-sizing:border-box;appearance:none;border:1px solid rgba(255,255,255,.1);background:#1e1a15;color:#fff;border-radius:12px;padding:13px 14px;font-size:14px;font-family:inherit;transition:border-color .18s,box-shadow .18s;}',
    '.hm-input::placeholder{color:rgba(255,255,255,.3);}',
    '.hm-input:focus{outline:none;border-color:#ea580c;box-shadow:0 0 0 3px rgba(234,88,12,.16);}',
    '.hm-input:-webkit-autofill,.hm-input:-webkit-autofill:hover,.hm-input:-webkit-autofill:focus{-webkit-text-fill-color:#fff;-webkit-box-shadow:0 0 0 1000px #1e1a15 inset;caret-color:#fff;transition:background-color 9999s ease-in-out 0s;}',
    '.hm-coderow{display:flex;gap:10px;}',
    '.hm-coderow .hm-input{flex:1;min-width:0;}',
    '.hm-codebtn{appearance:none;flex:none;cursor:pointer;font-family:inherit;font-size:13px;font-weight:600;color:#fd9b53;background:rgba(251,122,34,.1);border:1px solid rgba(251,122,34,.5);border-radius:12px;padding:0 15px;white-space:nowrap;transition:background .18s,border-color .18s,color .18s;}',
    '.hm-codebtn:hover:not(:disabled){background:rgba(251,122,34,.2);border-color:#fb7a22;}',
    '.hm-codebtn:disabled{opacity:.6;cursor:not-allowed;color:rgba(255,255,255,.5);border-color:rgba(255,255,255,.14);background:transparent;}',
    '.hm-submit{width:100%;flex:none;appearance:none;border:0;cursor:pointer;font-family:inherit;font-size:15px;font-weight:600;color:#fff;background:#ea580c;border-radius:12px;padding:13px 0;margin-top:5px;transition:background .18s,transform .18s,box-shadow .18s;box-shadow:0 8px 22px rgba(234,88,12,.26);}',
    '.hm-submit:hover:not(:disabled){background:#d24e0a;}',
    '.hm-submit:active:not(:disabled){transform:translateY(1px);}',
    '.hm-submit[disabled]{background:#2b2721;color:rgba(255,255,255,.4);box-shadow:none;cursor:not-allowed;}',
    '.hp-switch{flex:none;align-self:flex-end;appearance:none;border:0;background:transparent;cursor:pointer;font-family:inherit;font-size:12.5px;color:rgba(255,255,255,.5);padding:4px 2px;margin:0 0 8px;transition:color .18s;}',
    '.hp-switch:hover{color:#fd9b53;}',
    '.hm-err{display:none;flex:none;margin-top:11px;font-size:13px;line-height:1.5;color:#fb923c;background:rgba(234,88,12,.12);border:1px solid rgba(234,88,12,.35);border-radius:10px;padding:9px 12px;}',
    '.hm-err.hm-show{display:block;}',
    '.hm-soon{display:none;flex:none;margin-top:11px;font-size:12.5px;line-height:1.55;color:#fde68a;background:rgba(202,138,4,.1);border:1px solid rgba(202,138,4,.32);border-radius:10px;padding:9px 12px;}',
    '.hm-soon.hm-show{display:block;animation:hmFade .2s ease;}',
    /* ===== 其他登录方式 ===== */
    '.hm-others{flex:none;display:flex;align-items:center;gap:11px;margin:13px 0 13px;}',
    '.hm-others .ho-line{flex:1;height:1px;background:rgba(255,255,255,.12);}',
    '.hm-others .ho-t{font-size:12px;color:rgba(255,255,255,.42);white-space:nowrap;}',
    '.hm-social{flex:none;display:flex;align-items:center;justify-content:center;gap:16px;}',
    '.hm-soc{width:46px;height:46px;border-radius:50%;appearance:none;cursor:pointer;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);transition:border-color .18s,background .18s,transform .18s;}',
    '.hm-soc:hover{border-color:#fb7a22;background:rgba(251,122,34,.14);transform:translateY(-2px);}',
    '.hm-soc svg{width:23px;height:23px;flex:none;}',
    /* ===== 协议勾选 ===== */
    '.hm-agree{flex:none;display:flex;align-items:flex-start;gap:8px;margin-top:16px;font-size:12px;line-height:1.6;color:rgba(255,255,255,.5);cursor:pointer;}',
    '.hm-agree input{appearance:none;flex:none;width:15px;height:15px;margin-top:2px;border-radius:4px;border:1px solid rgba(255,255,255,.35);background:transparent;cursor:pointer;position:relative;transition:background .16s,border-color .16s;}',
    '.hm-agree input:checked{background:#ea580c;border-color:#ea580c;}',
    '.hm-agree input:checked::after{content:"";position:absolute;left:4.5px;top:1.5px;width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(42deg);}',
    '.hm-agree a{color:#fd9b53;text-decoration:none;}',
    '.hm-agree a:hover{text-decoration:underline;}',
    /* ===== 工作台全屏门禁 ===== */
    '.hm-gate{position:fixed;inset:0;z-index:2147483000;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;background:radial-gradient(1200px 600px at 50% -10%,#1c1712 0%,#0d0b09 60%);}',
    '.hm-gate.hm-show{display:flex;animation:hmFade .3s ease;}',
    'html.hm-layer-open,html.hm-layer-open body{overflow:hidden;}',
    'html.hm-layer-open body *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}',
    '.hm-gate .hm-logo{height:38px;width:auto;margin-bottom:4px;}',
    '.hm-gate h3{color:#fff;font-size:21px;font-weight:700;margin:22px 0 10px;letter-spacing:.3px;}',
    '.hm-gate p{color:rgba(255,255,255,.58);font-size:14px;line-height:1.7;max-width:380px;margin:0 0 26px;}',
    '.hm-gate-btns{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;}',
    '.hm-gate-btns .hm-navbtn{padding:12px 26px;font-size:15px;}',
    '.hm-gate-badge{margin-bottom:26px;font-size:12px;letter-spacing:2px;color:#fb923c;border:1px solid rgba(251,146,60,.4);border-radius:999px;padding:6px 16px;}',
    /* ===== 登录后右上角小胶囊 ===== */
    '.hm-chip{position:fixed;top:12px;right:12px;z-index:2147482990;display:none;align-items:center;gap:10px;background:rgba(13,11,9,.72);border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:7px 8px 7px 14px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}',
    '.hm-chip.hm-show{display:flex;}',
    '.hm-chip .hm-chip-name{font-size:12.5px;color:#fff;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.hm-chip button{appearance:none;border:0;cursor:pointer;font-family:inherit;font-size:12px;color:#fff;background:#ea580c;border-radius:999px;padding:5px 12px;}',
    '.hm-chip button:hover{background:#c2410c;}',
    /* ===== 品牌徽章（与首页 logo 旁徽章同款） ===== */
    '@property --hm-tag-ang{syntax:"<angle>";initial-value:0deg;inherits:false;}',
    '.hm-badge{position:relative;display:inline-flex;align-items:center;height:31px;padding:0 15px;margin-left:4px;border-radius:999px;border:1px solid rgba(28,25,23,.28);color:#44403c;font-size:12px;font-weight:500;letter-spacing:3px;line-height:1;white-space:nowrap;animation:hmTagFloat 3.8s ease-in-out infinite;transition:color .3s,border-color .3s;}',
    '.hm-badge>span{position:relative;z-index:1;}',
    '.hm-badge::before{content:"";position:absolute;inset:-1px;border-radius:inherit;padding:1px;background:conic-gradient(from var(--hm-tag-ang),#ea580c,#ca8a04,#16a34a,#0891b2,#7c3aed,#db2777,#ea580c);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;opacity:0;transition:opacity .3s;animation:hmTagSpin 2.6s linear infinite;pointer-events:none;}',
    '.hm-badge:hover{border-color:transparent;}',
    '.hm-badge:hover::before{opacity:1;}',
    '.hm-badge:hover>span{background:linear-gradient(90deg,#ea580c,#ca8a04,#16a34a,#0891b2,#7c3aed,#db2777,#ea580c);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:hmTagTxt 2.2s linear infinite;}',
    '@keyframes hmTagFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}',
    '@keyframes hmTagSpin{to{--hm-tag-ang:360deg}}',
    '@keyframes hmTagTxt{to{background-position:-220% 0}}',
    '.nav.light .nav-logo{display:inline-flex;align-items:center;gap:10px;}',
    '.nav.solid .hm-navbtn-ghost,.nav.panel-open .hm-navbtn-ghost,.nav.light .hm-navbtn-ghost,.topbar .hm-navbtn-ghost{background:#fff;color:#1c1917;border:1px solid rgba(28,25,23,.28);}',
    '.nav.solid .hm-navbtn-ghost:hover,.nav.panel-open .hm-navbtn-ghost:hover,.nav.light .hm-navbtn-ghost:hover,.topbar .hm-navbtn-ghost:hover{border-color:#1c1917;background:#f5f5f4;}',
    '.nav.solid .hm-navuser,.nav.panel-open .hm-navuser,.nav.light .hm-navuser,.topbar .hm-navuser{color:#1c1917;background:rgba(28,25,23,.06);border:1px solid rgba(28,25,23,.16);}',
    '.nav.solid .hm-navlogout,.nav.panel-open .hm-navlogout,.nav.light .hm-navlogout,.topbar .hm-navlogout{color:rgba(28,25,23,.62);}',
    '.nav.solid .hm-navlogout:hover,.nav.panel-open .hm-navlogout:hover,.nav.light .hm-navlogout:hover,.topbar .hm-navlogout:hover{color:#ea580c;}',
    /* ===== 响应式：移动端隐藏左侧幻灯片 ===== */
    '@media(max-width:760px){.hm-card{grid-template-columns:1fr;height:auto;max-height:94vh;}.hm-hero{display:none;}.hm-pane{padding:24px 22px 20px;}.hp-title{margin-top:16px;}.hm-badge{display:none;}}',
    '@media(max-width:860px){',
    '  .nav .member-nav{flex-direction:column;align-items:stretch;width:100%;gap:8px;}',
    '  .nav .hm-navbtn{width:100%;padding:13px 18px;text-align:center;}',
    '  .nav .hm-navuser{max-width:none;justify-content:center;}',
    '  .nav .hm-navlogout{text-align:center;}',
    '  .topbar .member-nav{flex-direction:row;align-items:center;gap:8px;}',
    '  .topbar .hm-navbtn{padding:7px 13px;font-size:12px;}',
    '  .topbar .hm-navuser{padding:7px 10px;font-size:12px;max-width:150px;}',
    '  .topbar .hm-navuser span{max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '  .topbar .hm-navlogout{padding:4px 2px;font-size:12px;}',
    '}'
  ].join('\n');

  function xIcon() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  }

  // 官网正式 SVG logo（深色场景：白 Work / 橙 o / 白 Hogee），与首页、footer 同源
  function brandSvg(h) {
    h = h || 30;
    return '<svg class="hm-logo" viewBox="0 0 118 19.13" xmlns="http://www.w3.org/2000/svg" aria-label="WorkHogee" style="height:' + h + 'px;width:auto;display:block;">' +
      '<g transform="translate(-1.06 -28.16)">' +
      '<path fill="#ffffff" d="M13,32.58,9.81,42.11a1.34,1.34,0,0,1-1.33,1.12h-2a1.35,1.35,0,0,1-1.29-.94L1.13,30a1.36,1.36,0,0,1,1.29-1.78h2a1.35,1.35,0,0,1,1.29.94l2.15,6.58L9.09,32a1.13,1.13,0,0,1,1.07-.74l1.68,0A1.06,1.06,0,0,1,13,32.58Z"/>' +
      '<path fill="#ea580c" d="M12.88,43.23h2a1.38,1.38,0,0,0,1.3-.94l4-12.35a1.36,1.36,0,0,0-1.29-1.78h-2a1.35,1.35,0,0,0-1.3.93l-4,12.35A1.36,1.36,0,0,0,12.88,43.23Z"/>' +
      '<path fill="#ffffff" d="M19.12,37.64a5.39,5.39,0,0,1,5.62-5.58,5.4,5.4,0,0,1,5.64,5.58,5.41,5.41,0,0,1-5.64,5.6A5.4,5.4,0,0,1,19.12,37.64Zm8.35,0a2.74,2.74,0,1,0-5.44,0c0,1.67,1,3.11,2.71,3.11A2.82,2.82,0,0,0,27.47,37.64Z"/>' +
      '<path fill="#ffffff" d="M33.75,32.32a.43,.43,0,0,1,.43.43h0a.43,.43,0,0,0,.69,.34,4.61,4.61,0,0,1,2.26-1,.4,.4,0,0,1,.45.4v1.82a.4,.4,0,0,1-.4.4h-.37a3.68,3.68,0,0,0-2.55,1.1.43,.43,0,0,0-.08.24c0,1,0,6.9,0,6.9h-2.4a.4,.4,0,0,1-.4-.4V32.73a.4,.4,0,0,1,.4-.41Z"/>' +
      '<path fill="#ffffff" d="M42.25,39.39l-.64.68a.58,.58,0,0,0-.15.39V42.4a.57,.57,0,0,1-.57.57H39.23a.56,.56,0,0,1-.57-.57V28.84a.56,.56,0,0,1,.57-.57h1.66a.57,.57,0,0,1,.57.57v6.68a.57,.57,0,0,0,1,.37l2.86-3.37a.6,.6,0,0,1,.43-.2h1.93a.57,.57,0,0,1,.43,1L45,36.81a.57,.57,0,0,0,0,.71l3.39,4.54a.57,.57,0,0,1-.45.91H45.86a.56,.56,0,0,1-.47-.24l-2.25-3.28A.57,.57,0,0,0,42.25,39.39Z"/>' +
      '<text x="53" y="42.3" font-family="\'Trebuchet MS\',\'Trebuchet\',\'Lucida Sans Unicode\',sans-serif" font-size="18" font-weight="400" fill="#ffffff">Hogee</text>' +
      '</g></svg>';
  }
  // 纯白单色 logo（登录框左上角）：把橙色 o 也变为白色
  function brandSvgWhite(h) {
    return brandSvg(h).split('#ea580c').join('#ffffff');
  }

  // 第三方品牌标识（取自官方品牌 SVG，仅用于登录方式识别）
  var WECHAT_WHITE = '<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M32.8 18.003 32.5 18C25.732 18 20 22.798 20 29c0 1.007.151 1.976.433 2.894A18 18 0 0 1 18.5 32c-1.809 0-3.54-.274-5.137-.775-.394-.123-1.828.696-3.039 1.389-.927.53-1.724.986-1.824.886-.094-.094.169-.718.476-1.448.446-1.06.986-2.346.664-2.552C6.21 27.305 4 23.866 4 20c0-6.627 6.492-12 14.5-12 7.186 0 13.151 4.326 14.3 10.003M16 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0m7 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4" fill="#ffffff"/><path fill-rule="evenodd" clip-rule="evenodd" d="M44 29c0 3.362-1.908 6.336-4.833 8.149-.13.08.169.858.446 1.583.237.618.459 1.196.387 1.268-.075.075-.802-.327-1.571-.752-.829-.458-1.706-.942-1.871-.888-1.262.413-2.63.64-4.058.64C26.149 39 21 34.523 21 29s5.149-10 11.5-10S44 23.477 44 29m-6-3.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0M28.5 27a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3" fill="#ffffff"/></svg>';
  var ICON_FEISHU = '<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 8c0 1 7 3.5 14.745 16.744 0 0 4.184-4.363 6.255-5.744 1.5-1 2.712-1.332 2.712-1.332C33.712 15.156 29.5 8 28 8z" fill="#00d6b9"/><path d="M43.5 18.5c-1-.667-3.65-1.771-6.5-1.5a15 15 0 0 0-3.288.668S32.5 18 31 19c-2.07 1.38-6.255 5.744-6.255 5.744-1.428 1.397-3.05 2.732-5.245 3.756 0 0 7 3 11.5 3 5.063 0 7-3.5 7-3.5 1.5-3.305 3.5-7 5.5-9.5" fill="#163c9a"/><path d="M4 17.5v17c0 1 6 5.5 15 5.5 10 0 17.05-7.705 19-12 0 0-1.937 3.5-7 3.5-4.5 0-11.5-3-11.5-3-5.117-2.239-10.03-6.577-12.906-9.117C4.974 17.953 4 17.093 4 17.5" fill="#3370ff"/></svg>';
  // 抖音：单色音符（白色），深色圆底中识别
  var ICON_DOUYIN = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="#ffffff" d="M16.72 3.06h.14a4.62 4.62 0 0 0 3.9 3.96v2.66a7.62 7.62 0 0 1-3.92-1.1v5.74a5.74 5.74 0 1 1-5.74-5.74 5.6 5.6 0 0 1 .66.04v2.74a3.06 3.06 0 1 0 2.16 2.92V3.06h2.8z"/></svg>';

  // 登录左侧幻灯片数据（图片用站点根绝对路径，任何目录引用都正确）
  var CREW = [
    { img: '/images/auth-atu.webp', name: '阿图', role: '生图伙计' },
    { img: '/images/auth-awen.webp', name: '阿文', role: '文案伙计' },
    { img: '/images/auth-ashi.webp', name: '阿视', role: '视频伙计' },
    { img: '/images/auth-afa.webp', name: '阿发', role: '发图伙计' },
    { img: '/images/auth-agu.webp', name: '阿果', role: '效果伙计' }
  ];

  function slideHtml(c) {
    return '<div class="hh-slide"><img src="' + c.img + '" alt="' + c.name + '" decoding="async"></div>';
  }

  var MODAL_HTML =
    '<div class="hm-overlay" id="hmOverlay">' +
      '<div class="hm-card" role="dialog" aria-modal="true" aria-label="WorkHogee 会员登录">' +
        '<div class="hm-hero" id="hmHero">' +
          '<div class="hh-viewport"><div class="hh-track" id="hhTrack">' +
            CREW.map(slideHtml).join('') +
          '</div></div>' +
          '<button type="button" class="hh-arrow prev" id="hhPrev" aria-label="上一个伙计">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>' +
          '<button type="button" class="hh-arrow next" id="hhNext" aria-label="下一个伙计">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>' +
          '<div class="hh-scrim"></div>' +
          '<div class="hh-meta">' +
            '<div class="hh-name" id="hhName">阿图</div>' +
            '<div class="hh-role" id="hhRole">生图伙计</div>' +
            '<div class="hh-dots" id="hhDots">' +
              CREW.map(function (c, i) { return '<button type="button" class="' + (i === 0 ? 'on' : '') + '" data-i="' + i + '" aria-label="' + c.name + '"></button>'; }).join('') +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="hm-pane">' +
          '<div class="hp-top">' +
            '<span class="hp-logo">' + brandSvg(25) + '</span>' +
            '<button type="button" class="hm-close" id="hmClose" aria-label="关闭">' + xIcon() + '</button>' +
          '</div>' +
          '<h2 class="hp-title">欢迎登录伙计工作台</h2>' +
          '<p class="hp-sub">未注册的手机号验证后将自动注册</p>' +
          '<form id="hmForm" autocomplete="on">' +
            '<button type="button" class="hp-switch" id="hmSwitch">账号密码登录</button>' +
            '<div class="hm-field">' +
              '<input class="hm-input" id="hmAccount" type="text" inputmode="tel" autocomplete="username" placeholder="请输入手机号">' +
            '</div>' +
            '<div class="hm-field" id="hmCodeField">' +
              '<div class="hm-coderow">' +
                '<input class="hm-input" id="hmCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="请输入验证码">' +
                '<button type="button" class="hm-codebtn" id="hmGetCode">发送验证码</button>' +
              '</div>' +
            '</div>' +
            '<div class="hm-field" id="hmPwField" style="display:none;">' +
              '<input class="hm-input" id="hmPassword" type="password" autocomplete="current-password" placeholder="请输入密码（至少 8 位）">' +
            '</div>' +
            '<button type="submit" class="hm-submit" id="hmSubmit" disabled>登录</button>' +
            '<div class="hm-err" id="hmErr"></div>' +
            '<div class="hm-soon" id="hmSoon"></div>' +
            '<label class="hm-agree" for="hmAgree">' +
              '<input type="checkbox" id="hmAgree">' +
              '<span>已阅读并同意 <a href="/terms.html" target="_blank" rel="noopener">服务协议</a>、<a href="/privacy.html" target="_blank" rel="noopener">隐私政策</a>、<a href="/ai-notice.html" target="_blank" rel="noopener">AI功能使用须知</a></span>' +
            '</label>' +
            '<div class="hm-others"><span class="ho-line"></span><span class="ho-t">其他登录方式</span><span class="ho-line"></span></div>' +
            '<div class="hm-social">' +
              '<button type="button" class="hm-soc" data-provider="wechat" aria-label="微信登录">' + WECHAT_WHITE + '</button>' +
              '<button type="button" class="hm-soc" data-provider="feishu" aria-label="飞书登录">' + ICON_FEISHU + '</button>' +
              '<button type="button" class="hm-soc" data-provider="douyin" aria-label="抖音登录">' + ICON_DOUYIN + '</button>' +
            '</div>' +
          '</form>' +
        '</div>' +
      '</div>' +
    '</div>';

  var GATE_HTML =
    '<div class="hm-gate" id="hmGate">' +
      '<div class="hm-gate-badge">WORKHOGEE · 内测中</div>' +
      brandSvg(40) +
      '<h3 id="hmGateTitle">登录后开始使用工作台</h3>' +
      '<p>注册一个 WorkHogee 会员账号，即可在工作台为你的商品生成可上架、可合规的专业图片、动态图与文案。内测期间登录即可使用。</p>' +
      '<div class="hm-gate-btns">' +
        '<button type="button" class="hm-navbtn hm-navbtn-primary" data-hm="register">Hogee会员注册</button>' +
        '<button type="button" class="hm-navbtn hm-navbtn-ghost" data-hm="login">登录</button>' +
      '</div>' +
    '</div>' +
    '<div class="hm-chip" id="hmChip"><span class="hm-chip-name" id="hmChipName"></span><button type="button" data-hm="logout">退出</button></div>';

  /* ---------------- 幻灯片控制 ---------------- */
  var hhCur = 0, hhTimer = null;
  function hhDots() { return el('hhDots') ? el('hhDots').querySelectorAll('button') : []; }
  function hhGo(i) {
    if (!el('hhTrack')) return;
    hhCur = ((i % CREW.length) + CREW.length) % CREW.length;
    el('hhTrack').style.transform = 'translateX(-' + (hhCur * 100) + '%)';
    el('hhName').textContent = CREW[hhCur].name;
    el('hhRole').textContent = CREW[hhCur].role;
    var ds = hhDots();
    for (var i2 = 0; i2 < ds.length; i2++) ds[i2].classList.toggle('on', i2 === hhCur);
  }
  function hhStop() { if (hhTimer) { clearInterval(hhTimer); hhTimer = null; } }
  function hhStart() { hhStop(); hhTimer = setInterval(function () { hhGo(hhCur + 1); }, 4200); }

  /* ---------------- UI 注入 ---------------- */
  function injectUI() {
    if (state.injected) return;
    state.injected = true;
    var style = document.createElement('style');
    style.setAttribute('data-hm', '1');
    style.textContent = CSS;
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.innerHTML = MODAL_HTML;
    document.body.appendChild(wrap.firstChild);

    if (document.body && document.body.hasAttribute('data-member-gate')) {
      state.gate = true;
      var g = document.createElement('div');
      g.innerHTML = GATE_HTML;
      while (g.firstChild) document.body.appendChild(g.firstChild);
    }

    el('hmClose').addEventListener('click', function () { cancelAuth(); });
    el('hmOverlay').addEventListener('click', function (e) {
      if (e.target === el('hmOverlay')) cancelAuth();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el('hmOverlay') && el('hmOverlay').classList.contains('hm-show')) cancelAuth();
    });
    el('hmForm').addEventListener('submit', onSubmit);
    el('hmGetCode').addEventListener('click', sendCode);
    el('hmSwitch').addEventListener('click', function () {
      setAuthKind(state.authKind === 'code' ? 'password' : 'code');
    });

    // 幻灯片：箭头 / 分页点 / 悬停暂停
    el('hhPrev').addEventListener('click', function () { hhGo(hhCur - 1); hhStart(); });
    el('hhNext').addEventListener('click', function () { hhGo(hhCur + 1); hhStart(); });
    var dotBtns = hhDots();
    for (var di = 0; di < dotBtns.length; di++) {
      dotBtns[di].addEventListener('click', function () { hhGo(+this.getAttribute('data-i')); hhStart(); });
    }
    el('hmHero').addEventListener('mouseenter', hhStop);
    el('hmHero').addEventListener('mouseleave', function () {
      if (el('hmOverlay').classList.contains('hm-show')) hhStart();
    });

    // 登录按钮启用 / 禁用：监听输入与协议勾选
    var acctIn = el('hmAccount'), codeIn = el('hmCode'), pwIn = el('hmPassword'), agree = el('hmAgree');
    acctIn.addEventListener('input', updateSubmit);
    codeIn.addEventListener('input', updateSubmit);
    pwIn.addEventListener('input', updateSubmit);
    agree.addEventListener('change', updateSubmit);

    // 第三方授权：内测期资质未就绪，诚实提示并预留标准 OAuth 接入位
    var PROVIDER_NAME = { wechat: '微信', feishu: '飞书', douyin: '抖音', sms: '手机验证码', dingtalk: '钉钉', qq: 'QQ', alipay: '支付宝' };
    function providerComing(p) {
      // 企业资质与 AppID 就绪后，改为：
      // location.href = API_BASE + '/api/auth/' + p + '/start?redirect=' + encodeURIComponent(location.origin + '/workbench.html');
      var name = PROVIDER_NAME[p] || '该登录方式';
      var box = el('hmSoon');
      hideErr();
      if (box) { box.textContent = '「' + name + '」登录内测期即将开通（需企业资质与开放平台授权），当前请先用手机号 + 验证码登录。'; box.classList.add('hm-show'); }
    }
    var socBtns = document.querySelectorAll('.hm-overlay [data-provider]');
    for (var pi = 0; pi < socBtns.length; pi++) {
      socBtns[pi].addEventListener('click', function () { providerComing(this.getAttribute('data-provider')); });
    }

    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-hm]') : null;
      if (!t) return;
      var act = t.getAttribute('data-hm');
      if (act === 'register') openAuth('register');
      else if (act === 'login') openAuth('login');
      else if (act === 'logout') logout();
    });
  }

  // 登录注册合一（验证码自动注册），setMode 仅做兼容
  function setMode(mode) {
    state.mode = mode || 'login';
    hideErr();
  }

  function showErr(msg) {
    var e = el('hmErr');
    if (!e) return;
    e.textContent = msg;
    e.classList.add('hm-show');
  }
  function hideErr() {
    var e = el('hmErr');
    if (e) { e.textContent = ''; e.classList.remove('hm-show'); }
  }

  // 全屏层显示时：锁定滚动并临时关闭页面所有 backdrop-filter，
  // 规避 Chromium 中 backdrop-filter 元素把 fixed 覆盖层错误裁剪的合成 bug。
  function syncLayerClass() {
    var gateOn = state.gate && el('hmGate') && el('hmGate').classList.contains('hm-show');
    var ovOn = el('hmOverlay') && el('hmOverlay').classList.contains('hm-show');
    var root = document.documentElement;
    if (gateOn || ovOn) root.classList.add('hm-layer-open');
    else root.classList.remove('hm-layer-open');
  }

  function setAuthKind(kind) {
    state.authKind = kind;
    var code = kind === 'code';
    el('hmCodeField').style.display = code ? '' : 'none';
    el('hmPwField').style.display = code ? 'none' : '';
    el('hmAccount').placeholder = code ? '请输入手机号' : '手机号 / 邮箱 / 用户名';
    el('hmAccount').setAttribute('inputmode', code ? 'tel' : 'text');
    el('hmSwitch').textContent = code ? '账号密码登录' : '验证码登录';
    hideErr();
    var sb = el('hmSoon'); if (sb) sb.classList.remove('hm-show');
    updateSubmit();
    setTimeout(function () { el('hmAccount').focus(); }, 40);
  }

  // 登录按钮是否可点
  function updateSubmit() {
    var acct = (el('hmAccount').value || '').trim();
    var ok = false;
    if (state.authKind === 'code') {
      var code = (el('hmCode').value || '').trim();
      ok = !!accountType(acct) && acct.toLowerCase() !== 'workhogee' && code.length >= 4 && el('hmAgree').checked;
    } else {
      var pw = el('hmPassword').value || '';
      ok = !!acct && pw.length >= 8 && el('hmAgree').checked;
    }
    el('hmSubmit').disabled = !ok;
  }

  function openAuth(mode) {
    injectUI();
    setMode(mode || 'login');
    var f = el('hmForm'); if (f) f.reset();
    setAuthKind('code');
    el('hmAgree').checked = false;
    hhGo(0);
    var ov = el('hmOverlay');
    ov.classList.add('hm-show');
    syncLayerClass();
    hhStart();
    setTimeout(function () { el('hmAccount').focus(); }, 60);
  }
  function closeAuth() {
    var ov = el('hmOverlay');
    if (ov) ov.classList.remove('hm-show');
    hhStop();
    syncLayerClass();
  }
  function cancelAuth() {
    closeAuth();
    if (state.waitReject) { var r = state.waitReject; state.waitResolve = null; state.waitReject = null; r(new Error('AUTH_CANCELLED')); }
  }

  /* ---------------- 接口 ---------------- */
  function api(path, body, withAuth) {
    var headers = { 'Content-Type': 'application/json' };
    if (withAuth && state.token) headers['Authorization'] = 'Bearer ' + state.token;
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (resp) {
      return resp.json().catch(function () { return null; }).then(function (j) {
        return { status: resp.status, json: j };
      });
    });
  }

  function successAuth(j) {
    saveSession(j.token, j.member);
    closeAuth();
    renderNav();
    renderGate();
    dispatch('hogee:auth');
    if (state.waitResolve) { var rs = state.waitResolve; state.waitResolve = null; state.waitReject = null; rs(j.member); }
    var f = el('hmForm'); if (f) f.reset();
    state.authKind = 'code';
  }

  var codeTimer = null;
  function sendCode() {
    hideErr();
    var account = (el('hmAccount').value || '').trim();
    if (String(account).trim().toLowerCase() === 'workhogee') { showErr('官方运营账号请使用密码登录'); return; }
    if (!accountType(account)) { showErr('请先输入正确的手机号'); return; }
    var btn = el('hmGetCode');
    btn.disabled = true;
    var oldText = btn.textContent;
    btn.textContent = '发送中…';
    api('/api/member/send-code', { account: account }).then(function (r) {
      var j = r.json || {};
      if (r.status === 200 && j.ok) {
        var sb = el('hmSoon');
        if (j.devCode) { sb.textContent = '内测演示验证码：' + j.devCode + '（短信通道开通后将自动发送到手机）'; }
        else { sb.textContent = '验证码已发送，请查收' + (j.channel ? '（' + j.channel + '）' : ''); }
        sb.classList.add('hm-show');
        var n = 60;
        btn.textContent = n + ' s';
        if (codeTimer) clearInterval(codeTimer);
        codeTimer = setInterval(function () {
          n--;
          if (n <= 0) { clearInterval(codeTimer); codeTimer = null; btn.disabled = false; btn.textContent = '发送验证码'; updateSubmit(); }
          else btn.textContent = n + ' s';
        }, 1000);
        el('hmCode').focus();
      } else {
        btn.disabled = false; btn.textContent = oldText;
        showErr((j.error && j.error.message) || '验证码发送失败，请稍后再试');
      }
    }).catch(function () {
      btn.disabled = false; btn.textContent = oldText;
      showErr('网络异常，请检查连接后重试');
    });
  }

  function submitCodeAuth(account) {
    var code = (el('hmCode').value || '').trim();
    if (!/^\d{4,8}$/.test(code)) { showErr('请输入收到的验证码'); return; }
    var btn = el('hmSubmit');
    btn.disabled = true; btn.textContent = '验证中…';
    api('/api/member/code-auth', { account: account, code: code }).then(function (r) {
      var j = r.json;
      if (r.status === 200 && j && j.ok && j.token) { successAuth(j); }
      else { showErr((j && j.error && j.error.message) || '验证码错误或已失效，请重新获取'); }
    }).catch(function () {
      showErr('网络异常，请检查连接后重试');
    }).finally(function () {
      btn.disabled = false; btn.textContent = '登录'; updateSubmit();
    });
  }

  function onSubmit(e) {
    e.preventDefault();
    hideErr();
    if (!el('hmAgree').checked) { showErr('请先阅读并勾选服务协议、隐私政策与 AI 功能使用须知'); return; }
    var account = (el('hmAccount').value || '').trim();

    if (state.authKind === 'code') {
      if (!accountType(account) || account.toLowerCase() === 'workhogee') { showErr('请输入正确的手机号'); return; }
      return submitCodeAuth(account);
    }

    // 账号密码登录
    if (!account) { showErr('请输入手机号 / 邮箱 / 用户名'); return; }
    var password = el('hmPassword').value || '';
    if (password.length < 8 || password.length > 64) { showErr('密码长度需为 8-64 位'); return; }
    var btn = el('hmSubmit');
    btn.disabled = true; btn.textContent = '登录中…';
    api('/api/member/login', { account: account, password: password }).then(function (r) {
      var j = r.json;
      if (r.status === 200 && j && j.ok && j.token) { successAuth(j); }
      else { showErr((j && j.error && j.error.message) || '登录失败，请检查账号密码'); }
    }).catch(function () {
      showErr('网络异常，请检查连接后重试');
    }).finally(function () {
      btn.disabled = false; btn.textContent = '登录'; updateSubmit();
    });
  }

  function logout() {
    // 先本地即时清态并显示门禁，不等待后端 /logout（国内网络慢也能立即锁定工作台）
    var t = state.token;
    clearSession();
    renderNav();
    renderGate();
    dispatch('hogee:logout');
    if (t) {
      try {
        fetch(API_BASE + '/api/member/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
          body: '{}'
        }).catch(function () {});
      } catch (e) {}
    }
  }

  /* ---------------- 导航 / 门禁渲染 ---------------- */
  function navLoggedIn() {
    var name = (state.user && (state.user.contactName || state.user.merchantName || state.user.account || state.user.name)) || '会员';
    return '<span class="hm-navuser"><span class="hm-dot"></span><span>' + escapeHtml(name) + '</span></span>' +
      '<button type="button" class="hm-navlogout" data-hm="logout">退出</button>';
  }
  function navLoggedOut() {
    return '<button type="button" class="hm-navbtn hm-navbtn-primary" data-hm="register">Hogee会员注册</button>' +
      '<button type="button" class="hm-navbtn hm-navbtn-ghost" data-hm="login">登录</button>';
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function renderNav() {
    var nodes = document.querySelectorAll('[data-member-nav]');
    var html = state.token ? navLoggedIn() : navLoggedOut();
    for (var i = 0; i < nodes.length; i++) nodes[i].innerHTML = html;
  }

  function renderGate() {
    if (!state.gate) return;
    var gate = el('hmGate');
    var chip = el('hmChip');
    var hasNav = document.querySelectorAll('[data-member-nav]').length > 0;
    if (state.token) {
      if (gate) gate.classList.remove('hm-show');
      if (chip && !hasNav) {
        chip.classList.add('hm-show');
        var n = el('hmChipName');
        if (n) n.textContent = (state.user && (state.user.contactName || state.user.merchantName || state.user.account || state.user.name)) || '会员';
      } else if (chip) {
        chip.classList.remove('hm-show');
      }
    } else {
      if (gate) gate.classList.add('hm-show');
      if (chip) chip.classList.remove('hm-show');
    }
    syncLayerClass();
  }

  /* ---------------- 对外 API ---------------- */
  var HogeeMember = {
    isLoggedIn: function () { return !!state.token; },
    getUser: function () { return state.user; },
    getToken: function () { return state.token; },
    open: openAuth,
    close: closeAuth,
    logout: logout,
    authHeaders: function () {
      return state.token ? { 'Authorization': 'Bearer ' + state.token } : {};
    },
    authFetch: function (input, init) {
      init = init || {};
      init.headers = Object.assign({}, init.headers || {}, this.authHeaders());
      return fetch(input, init).then(function (resp) {
        if (resp.status === 401) {
          clearSession();
          renderNav();
          renderGate();
          dispatch('hogee:logout');
        }
        return resp;
      });
    },
    requireAuth: function () {
      if (state.token) return Promise.resolve(state.user);
      return new Promise(function (resolve, reject) {
        state.waitResolve = resolve;
        state.waitReject = reject;
        openAuth('login');
      });
    },
    verify: function () {
      if (!state.token) return Promise.resolve(null);
      return fetch(API_BASE + '/api/member/me', { headers: { 'Authorization': 'Bearer ' + state.token } })
        .then(function (resp) {
          if (!resp.ok) throw new Error('bad');
          return resp.json();
        })
        .then(function (j) {
          if (j && j.ok) {
            state.user = Object.assign({}, state.user || {}, j.member || {});
            try { localStorage.setItem(LS_USER, JSON.stringify(state.user)); } catch (e) {}
            return state.user;
          }
          throw new Error('bad');
        })
        .catch(function () { clearSession(); return null; });
    }
  };

  function init() {
    injectUI();
    renderNav();
    renderGate();
    HogeeMember.verify().then(function () { renderNav(); renderGate(); });
  }

  window.HogeeMember = HogeeMember;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
