/* WorkHogee 全站共享导航交互（子页面统一引用；配合 site.css） */
(function () {
  var nav = document.getElementById('nav');
  if (!nav) return;
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');

  function applyNav() {
    var open = navLinks.classList.contains('open');
    nav.classList.toggle('panel-open', open);
    if (open) {
      nav.classList.remove('atop', 'solid');
    } else if (window.scrollY > 40) {
      nav.classList.remove('atop', 'panel-open');
      nav.classList.add('solid');
    } else {
      nav.classList.remove('solid', 'panel-open');
      nav.classList.add('atop');
    }
  }

  window.addEventListener('scroll', applyNav, { passive: true });
  if (navToggle) navToggle.addEventListener('click', function () {
    navLinks.classList.toggle('open');
    applyNav();
  });
  /* 事件委托：对 member-auth 后注入的登录/用户按钮同样生效 */
  if (navLinks) navLinks.addEventListener('click', function (e) {
    if (e.target.closest('a,button')) {
      navLinks.classList.remove('open');
      applyNav();
    }
  });
  applyNav();

  window.navToast = function (msg) {
    var t = document.getElementById('navToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'navToast';
      t.className = 'nav-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  };
  window.mpNotify = function () {
    window.navToast('Hogee 微信小程序即将上线，敬请期待');
  };
})();
