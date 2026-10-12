/* ============================================================
   WorkHogee 主题（theme.js）· 恒深色（唯一主题）
   浅色主题已下线：任何情况下都固定为深色，不提供切换按钮，
   不读取 localStorage、不随时间翻转。保留 window.HogeeTheme
   空壳，避免历史页面/脚本引用报错。
   ============================================================ */
(function () {
  'use strict';
  function lockDark() {
    var el = document.documentElement;
    el.setAttribute('data-theme', 'dark');
    el.setAttribute('data-theme-mode', 'dark');
  }
  // 移除任何可能残留的旧版切换按钮
  function removeBtn() {
    var b = document.getElementById('hogeeThemeBtn');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }
  lockDark();
  removeBtn();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { lockDark(); removeBtn(); });
  } else {
    lockDark(); removeBtn();
  }
  // 历史兼容：任何调用都恒为深色
  window.HogeeTheme = {
    getMode: function () { return 'dark'; },
    setMode: function () { lockDark(); removeBtn(); return 'dark'; },
    effective: function () { return 'dark'; },
    cycle: function () { lockDark(); removeBtn(); return 'dark'; }
  };
})();
