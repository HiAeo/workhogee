/* ============================================================
   WorkHogee 主题切换（theme.js）
   三态：auto（跟随本地时间，07:00-19:00 浅色 / 其余深色）
        light（固定浅色） dark（固定深色）
   持久化：localStorage['hogee_theme']
   说明：各页 <head> 内联了同逻辑的防闪烁引导脚本；本文件负责
   运行时切换按钮、昼夜自动翻转、可见性重算与跨标签同步。
   ============================================================ */
(function () {
  'use strict';
  var KEY = 'hogee_theme';
  var DAY_START = 7;   // 07:00 起进入浅色
  var DAY_END = 19;    // 19:00 起进入深色
  var VALID = { auto: 1, light: 1, dark: 1 };

  function readMode() {
    try {
      var m = localStorage.getItem(KEY);
      return VALID[m] ? m : 'auto';
    } catch (e) { return 'auto'; }
  }
  function effective(mode, date) {
    if (mode === 'light' || mode === 'dark') return mode;
    var h = (date || new Date()).getHours();
    return (h >= DAY_START && h < DAY_END) ? 'light' : 'dark';
  }
  function apply(mode) {
    var eff = effective(mode);
    var el = document.documentElement;
    el.setAttribute('data-theme', eff);
    el.setAttribute('data-theme-mode', mode);
    return eff;
  }

  var ICONS = {
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.1" fill="currentColor" stroke="none"/><g stroke="currentColor"><line x1="12" y1="2.6" x2="12" y2="4.8"/><line x1="12" y1="19.2" x2="12" y2="21.4"/><line x1="2.6" y1="12" x2="4.8" y2="12"/><line x1="19.2" y1="12" x2="21.4" y2="12"/><line x1="5.4" y1="5.4" x2="6.9" y2="6.9"/><line x1="17.1" y1="17.1" x2="18.6" y2="18.6"/><line x1="5.4" y1="18.6" x2="6.9" y2="17.1"/><line x1="17.1" y1="6.9" x2="18.6" y2="5.4"/></g></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.3 14.1A8.3 8.3 0 1 1 9.9 3.7a6.7 6.7 0 0 0 10.4 10.4z"/></svg>',
    auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8.6" fill="currentColor" fill-opacity=".16"/><path d="M12 3.4a8.6 8.6 0 0 0 0 17.2z" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="8.6"/></svg>'
  };
  function labelOf(mode) {
    var eff = effective(mode);
    if (mode === 'light') return '当前：浅色模式。点击切换为深色';
    if (mode === 'dark') return '当前：深色模式。点击切换为跟随时间自动';
    return '当前：自动模式（白天浅色、夜间深色，此刻为' + (eff === 'light' ? '浅色' : '深色') + '）。点击固定为浅色';
  }
  function nextMode(mode) {
    return mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto';
  }

  function render(btn, mode) {
    if (!btn) return;
    btn.innerHTML = ICONS[mode] || ICONS.auto;
    var tip = labelOf(mode);
    btn.setAttribute('title', '外观主题 · ' + tip);
    btn.setAttribute('aria-label', '外观主题，' + tip);
  }

  function setMode(mode) {
    if (!VALID[mode]) mode = 'auto';
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    apply(mode);
    render(document.getElementById('hogeeThemeBtn'), mode);
  }

  function mount() {
    var existing = document.getElementById('hogeeThemeBtn');
    if (existing) { render(existing, readMode()); return true; }
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'hogeeThemeBtn';
    btn.className = 'hogee-theme-btn';
    btn.addEventListener('click', function () {
      setMode(nextMode(readMode()));
    });
    render(btn, readMode());

    // 官网 / 子页：导航右侧（汉堡按钮之前）
    var navInner = document.querySelector('.nav-inner');
    if (navInner) {
      var toggle = navInner.querySelector('.nav-toggle');
      if (toggle && toggle.parentNode === navInner) navInner.insertBefore(btn, toggle);
      else navInner.appendChild(btn);
      return true;
    }
    // 操作台：挂到左栏底部 .rail-foot（账号区上方）；不存在时回退品牌行
    var railFoot = document.querySelector('.rail-foot');
    if (railFoot) { railFoot.insertBefore(btn, railFoot.firstChild); return true; }
    var railBrand = document.querySelector('.rail-brand');
    if (railBrand) { railBrand.appendChild(btn); return true; }
    return false;
  }

  // 启动：先校正一次状态，再尝试挂载（操作台 DOM 可能异步渲染，做有限重试）
  apply(readMode());
  var tries = 0;
  function tryMount() {
    if (mount() || tries++ > 40) { if (mountedTimer) clearInterval(mountedTimer); }
  }
  var mountedTimer = setInterval(tryMount, 500);
  tryMount();

  // 昼夜自动翻转：每 30s 轻量校正（auto 下跨过 07:00/19:00 即切换）
  setInterval(function () {
    var mode = readMode();
    var eff = effective(mode);
    if (document.documentElement.getAttribute('data-theme') !== eff) {
      apply(mode);
      render(document.getElementById('hogeeThemeBtn'), mode);
    }
  }, 30000);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      var mode = readMode();
      apply(mode);
      render(document.getElementById('hogeeThemeBtn'), mode);
    }
  });
  // 跨标签页同步
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) {
      var mode = readMode();
      apply(mode);
      render(document.getElementById('hogeeThemeBtn'), mode);
    }
  });

  window.HogeeTheme = {
    getMode: readMode,
    setMode: setMode,
    effective: function () { return effective(readMode()); },
    cycle: function () { setMode(nextMode(readMode())); }
  };
})();
