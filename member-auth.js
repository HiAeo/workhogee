/* =====================================================================
 * WorkHogee · 会员认证共享脚本（member-auth.js，纯原生、无依赖）
 * ---------------------------------------------------------------------
 * 官网与 Web 工作台共用：
 *   - 顶部导航放 <div class="member-nav" data-member-nav></div>，自动渲染
 *     「Hogee会员注册 / 登录」，登录后变为「账号 / 退出」；
 *   - 工作台 <body data-member-gate> 会在未登录时显示全屏门禁；
 *   - 生图请求用 HogeeMember.authFetch() 自动带会员令牌；
 *   - 流程内可用 await HogeeMember.requireAuth() 强制先登录。
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
    if (/^1[3-9]\d{9}$/.test(a)) return 'phone';
    if (/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(a)) return 'email';
    return null;
  }

  /* ---------------- 样式（黑 / 橙品牌，无彩色图标） ---------------- */
  var CSS = [
    '.hm-wm{font-family:"Trebuchet MS","Trebuchet","Lucida Sans Unicode",sans-serif;font-size:22px;letter-spacing:.2px;line-height:1;}',
    '.hm-wm b{font-weight:700;color:#fff;}',
    '.hm-wm i{font-style:normal;color:#ea580c;}',
    /* 顶部导航会员区 */
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
    /* 遮罩 + 卡片 */
    '.hm-overlay{position:fixed;inset:0;z-index:2147483001;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(10,8,6,.62);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}',
    '.hm-overlay.hm-show{display:flex;animation:hmFade .22s ease;}',
    '@keyframes hmFade{from{opacity:0}to{opacity:1}}',
    '.hm-card{width:100%;max-width:400px;background:#14110d;border:1px solid rgba(255,255,255,.10);border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.55);padding:30px 30px 26px;color:#fff;position:relative;animation:hmPop .26s cubic-bezier(.2,.8,.2,1);}',
    '@keyframes hmPop{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}',
    '.hm-close{position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:50%;border:0;background:transparent;color:rgba(255,255,255,.6);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .18s,color .18s;}',
    '.hm-close:hover{background:rgba(255,255,255,.08);color:#fff;}',
    '.hm-brand{display:flex;flex-direction:column;gap:10px;margin-bottom:20px;}',
    '.hm-tagline{font-size:12.5px;color:rgba(255,255,255,.55);letter-spacing:.4px;}',
    '.hm-seg{display:flex;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:4px;margin-bottom:20px;}',
    '.hm-seg button{flex:1;appearance:none;border:0;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;color:rgba(255,255,255,.6);background:transparent;border-radius:9px;padding:9px 0;transition:all .18s;}',
    '.hm-seg button.hm-active{background:#ea580c;color:#fff;box-shadow:0 4px 14px rgba(234,88,12,.3);}',
    '.hm-field{margin-bottom:14px;}',
    '.hm-field label{display:block;font-size:12.5px;color:rgba(255,255,255,.62);margin-bottom:6px;}',
    '.hm-input{width:100%;box-sizing:border-box;appearance:none;border:1px solid rgba(255,255,255,.14);background:#1d1813;color:#fff;border-radius:10px;padding:12px 13px;font-size:14px;font-family:inherit;transition:border-color .18s,box-shadow .18s;}',
    '.hm-input::placeholder{color:rgba(255,255,255,.32);}',
    '.hm-input:focus{outline:none;border-color:#ea580c;box-shadow:0 0 0 3px rgba(234,88,12,.18);}',
    '.hm-submit{width:100%;appearance:none;border:0;cursor:pointer;font-family:inherit;font-size:15px;font-weight:700;color:#fff;background:#ea580c;border-radius:11px;padding:13px 0;margin-top:6px;transition:background .18s,transform .18s;}',
    '.hm-submit:hover{background:#c2410c;}',
    '.hm-submit:active{transform:translateY(1px);}',
    '.hm-submit[disabled]{opacity:.6;cursor:not-allowed;}',
    '.hm-err{display:none;margin-top:12px;font-size:13px;line-height:1.5;color:#fb923c;background:rgba(234,88,12,.12);border:1px solid rgba(234,88,12,.35);border-radius:9px;padding:9px 12px;}',
    '.hm-err.hm-show{display:block;}',
    '.hm-note{margin-top:16px;font-size:12px;line-height:1.6;color:rgba(255,255,255,.42);text-align:center;}',
    /* 工作台全屏门禁 */
    '.hm-gate{position:fixed;inset:0;z-index:2147483000;display:none;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;background:radial-gradient(1200px 600px at 50% -10%,#1c1712 0%,#0d0b09 60%);}',
    '.hm-gate.hm-show{display:flex;animation:hmFade .3s ease;}',
    'html.hm-layer-open,html.hm-layer-open body{overflow:hidden;}',
    'html.hm-layer-open body *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}',
    '.hm-gate .hm-wm{font-size:30px;}',
    '.hm-gate h3{color:#fff;font-size:21px;font-weight:700;margin:22px 0 10px;letter-spacing:.3px;}',
    '.hm-gate p{color:rgba(255,255,255,.58);font-size:14px;line-height:1.7;max-width:380px;margin:0 0 26px;}',
    '.hm-gate-btns{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;}',
    '.hm-gate-btns .hm-navbtn{padding:12px 26px;font-size:15px;}',
    '.hm-gate-badge{margin-bottom:26px;font-size:12px;letter-spacing:2px;color:#fb923c;border:1px solid rgba(251,146,60,.4);border-radius:999px;padding:6px 16px;}',
    /* 工作台登录后右上角小胶囊 */
    '.hm-chip{position:fixed;top:12px;right:12px;z-index:2147482990;display:none;align-items:center;gap:10px;background:rgba(13,11,9,.72);border:1px solid rgba(255,255,255,.16);border-radius:999px;padding:7px 8px 7px 14px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}',
    '.hm-chip.hm-show{display:flex;}',
    '.hm-chip .hm-chip-name{font-size:12.5px;color:#fff;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.hm-chip button{appearance:none;border:0;cursor:pointer;font-family:inherit;font-size:12px;color:#fff;background:#ea580c;border-radius:999px;padding:5px 12px;}',
    '.hm-chip button:hover{background:#c2410c;}',
    /* 「好货的好伙计」品牌徽章（浅色导航 / 白色工作台版，与首页 logo 旁徽章同款） */
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
    /* 内容页浅色导航：logo 与徽章水平并排（部分旧模板 .nav-logo 非 flex） */
    '.nav.light .nav-logo{display:inline-flex;align-items:center;gap:10px;}',
    /* 浅色导航适配：首页滚动(.nav.solid)/移动面板(.nav.panel-open)、内容页(.nav.light)、白色工作台(.topbar) */
    '.nav.solid .hm-navbtn-ghost,.nav.panel-open .hm-navbtn-ghost,.nav.light .hm-navbtn-ghost,.topbar .hm-navbtn-ghost{background:#fff;color:#1c1917;border:1px solid rgba(28,25,23,.28);}',
    '.nav.solid .hm-navbtn-ghost:hover,.nav.panel-open .hm-navbtn-ghost:hover,.nav.light .hm-navbtn-ghost:hover,.topbar .hm-navbtn-ghost:hover{border-color:#1c1917;background:#f5f5f4;}',
    '.nav.solid .hm-navuser,.nav.panel-open .hm-navuser,.nav.light .hm-navuser,.topbar .hm-navuser{color:#1c1917;background:rgba(28,25,23,.06);border:1px solid rgba(28,25,23,.16);}',
    '.nav.solid .hm-navlogout,.nav.panel-open .hm-navlogout,.nav.light .hm-navlogout,.topbar .hm-navlogout{color:rgba(28,25,23,.62);}',
    '.nav.solid .hm-navlogout:hover,.nav.panel-open .hm-navlogout:hover,.nav.light .hm-navlogout:hover,.topbar .hm-navlogout:hover{color:#ea580c;}',
    '@media(max-width:860px){.hm-badge{display:none;}}',
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

  var MODAL_HTML =
    '<div class="hm-overlay" id="hmOverlay">' +
      '<div class="hm-card" role="dialog" aria-modal="true" aria-label="WorkHogee 会员登录注册">' +
        '<button type="button" class="hm-close" id="hmClose" aria-label="关闭">' + xIcon() + '</button>' +
        '<div class="hm-brand"><span class="hm-wm"><b>Work</b><i>Hogee</i></span>' +
        '<span class="hm-tagline">生意伙计 · 会员账号</span></div>' +
        '<div class="hm-seg">' +
          '<button type="button" id="hmTabLogin" class="hm-active">登录</button>' +
          '<button type="button" id="hmTabRegister">注册</button>' +
        '</div>' +
        '<form id="hmForm" autocomplete="on">' +
          '<div class="hm-field" id="hmNameField" style="display:none;">' +
            '<label for="hmName">联系人 / 商户名（选填）</label>' +
            '<input class="hm-input" id="hmName" type="text" maxlength="40" placeholder="便于称呼您，如：XX店铺 / 张先生">' +
          '</div>' +
          '<div class="hm-field">' +
            '<label for="hmAccount">手机号 / 邮箱</label>' +
            '<input class="hm-input" id="hmAccount" type="text" inputmode="email" autocomplete="username" placeholder="用于登录与找回账号">' +
          '</div>' +
          '<div class="hm-field">' +
            '<label for="hmPassword">密码</label>' +
            '<input class="hm-input" id="hmPassword" type="password" autocomplete="current-password" placeholder="至少 8 位">' +
          '</div>' +
          '<div class="hm-field" id="hmConfirmField" style="display:none;">' +
            '<label for="hmConfirm">确认密码</label>' +
            '<input class="hm-input" id="hmConfirm" type="password" autocomplete="new-password" placeholder="再次输入密码">' +
          '</div>' +
          '<button type="submit" class="hm-submit" id="hmSubmit">登录</button>' +
          '<div class="hm-err" id="hmErr"></div>' +
        '</form>' +
        '<div class="hm-note">内测期间，注册并登录后即可使用工作台生图。<br>我们不会向第三方泄露您的账号信息。</div>' +
      '</div>' +
    '</div>';

  var GATE_HTML =
    '<div class="hm-gate" id="hmGate">' +
      '<div class="hm-gate-badge">WORKHOGEE · 内测中</div>' +
      '<span class="hm-wm"><b>Work</b><i>Hogee</i></span>' +
      '<h3 id="hmGateTitle">登录后开始使用工作台</h3>' +
      '<p>注册一个 WorkHogee 会员账号，即可在工作台为你的商品生成可上架、可合规的专业图片与图文。内测期间登录即可使用。</p>' +
      '<div class="hm-gate-btns">' +
        '<button type="button" class="hm-navbtn hm-navbtn-primary" data-hm="register">Hogee会员注册</button>' +
        '<button type="button" class="hm-navbtn hm-navbtn-ghost" data-hm="login">登录</button>' +
      '</div>' +
    '</div>' +
    '<div class="hm-chip" id="hmChip"><span class="hm-chip-name" id="hmChipName"></span><button type="button" data-hm="logout">退出</button></div>';

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

    el('hmTabLogin').addEventListener('click', function () { setMode('login'); });
    el('hmTabRegister').addEventListener('click', function () { setMode('register'); });
    el('hmClose').addEventListener('click', function () { cancelAuth(); });
    el('hmOverlay').addEventListener('click', function (e) {
      if (e.target === el('hmOverlay')) cancelAuth();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el('hmOverlay') && el('hmOverlay').classList.contains('hm-show')) cancelAuth();
    });
    el('hmForm').addEventListener('submit', onSubmit);

    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-hm]') : null;
      if (!t) return;
      var act = t.getAttribute('data-hm');
      if (act === 'register') openAuth('register');
      else if (act === 'login') openAuth('login');
      else if (act === 'logout') logout();
    });
  }

  function setMode(mode) {
    state.mode = mode;
    var reg = mode === 'register';
    el('hmTabLogin').classList.toggle('hm-active', !reg);
    el('hmTabRegister').classList.toggle('hm-active', reg);
    el('hmNameField').style.display = reg ? '' : 'none';
    el('hmConfirmField').style.display = reg ? '' : 'none';
    el('hmSubmit').textContent = reg ? '注册并登录' : '登录';
    el('hmPassword').setAttribute('autocomplete', reg ? 'new-password' : 'current-password');
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

  // 全屏层（门禁/登录弹层）显示时：锁定滚动并临时关闭页面所有 backdrop-filter，
  // 规避 Chromium 中 backdrop-filter 元素把 fixed 覆盖层错误裁剪的合成 bug。
  function syncLayerClass() {
    var gateOn = state.gate && el('hmGate') && el('hmGate').classList.contains('hm-show');
    var ovOn = el('hmOverlay') && el('hmOverlay').classList.contains('hm-show');
    var root = document.documentElement;
    if (gateOn || ovOn) root.classList.add('hm-layer-open');
    else root.classList.remove('hm-layer-open');
  }
  function openAuth(mode) {
    injectUI();
    setMode(mode || 'login');
    var ov = el('hmOverlay');
    ov.classList.add('hm-show');
    syncLayerClass();
    setTimeout(function () { var a = el('hmAccount'); if (a) a.focus(); }, 60);
  }
  function closeAuth() {
    var ov = el('hmOverlay');
    if (ov) ov.classList.remove('hm-show');
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

  function onSubmit(e) {
    e.preventDefault();
    hideErr();
    var reg = state.mode === 'register';
    var account = (el('hmAccount').value || '').trim();
    var password = el('hmPassword').value || '';
    if (!accountType(account)) { showErr('请输入正确的手机号或邮箱'); return; }
    if (password.length < 8 || password.length > 64) { showErr('密码长度需为 8-64 位'); return; }
    if (reg) {
      var confirm = el('hmConfirm').value || '';
      if (confirm !== password) { showErr('两次输入的密码不一致'); return; }
    }
    var btn = el('hmSubmit');
    btn.disabled = true;
    btn.textContent = reg ? '注册中…' : '登录中…';

    var payload = reg
      ? { account: account, password: password, contactName: (el('hmName').value || '').trim() }
      : { account: account, password: password };
    var path = reg ? '/api/member/register' : '/api/member/login';

    api(path, payload).then(function (r) {
      var j = r.json;
      if (r.status === 200 && j && j.ok && j.token) {
        saveSession(j.token, j.member);
        closeAuth();
        renderNav();
        renderGate();
        dispatch('hogee:auth');
        if (state.waitResolve) { var rs = state.waitResolve; state.waitResolve = null; state.waitReject = null; rs(j.member); }
        // 重置表单
        el('hmForm').reset();
      } else {
        showErr((j && j.error && j.error.message) || (reg ? '注册失败，请稍后再试' : '登录失败，请检查账号密码'));
      }
    }).catch(function () {
      showErr('网络异常，请检查连接后重试');
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = reg ? '注册并登录' : '登录';
    });
  }

  function logout() {
    // 先本地即时清态并显示门禁，不等待后端 /logout（国内网络慢也能立即锁定工作台）
    var t = state.token;
    clearSession();
    renderNav();
    renderGate();
    dispatch('hogee:logout');
    // 再异步通知后端销毁会话（fire-and-forget，不阻塞 UI）
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
    // 页面顶部导航已含会员区（data-member-nav）时，登录态由导航承担，不再弹右上角悬浮胶囊，避免重复与遮挡
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
    /** 带会员令牌的 fetch；401 时清除登录态并抛错 */
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
    /** 流程内强制登录：未登录弹出，登录成功 resolve，取消则 reject(AUTH_CANCELLED) */
    requireAuth: function () {
      if (state.token) return Promise.resolve(state.user);
      var self = this;
      return new Promise(function (resolve, reject) {
        state.waitResolve = resolve;
        state.waitReject = reject;
        openAuth('login');
      });
    },
    /** 启动时用 /me 校验本地令牌是否仍有效 */
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
