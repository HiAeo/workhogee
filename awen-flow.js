/* awen-flow.js —— 阿文→阿发 阶段接力（深色，自包含）
 * 入口：window.openAwenFlow(ctx)  ctx={productName, image, category, platform}
 * 阶段：info_card → copy(阿文) → preview/publish(阿发)。阿视本期仅预留。 */
(function () {
  var API = (window.FAPI || 'https://api.workhogee.com').replace(/\/$/, '');
  function authHeaders() {
    var h = { 'Content-Type': 'application/json' };
    try { if (window.HogeeMember && window.HogeeMember.authHeaders) Object.assign(h, window.HogeeMember.authHeaders()); } catch (e) {}
    return h;
  }
  function post(path, body) {
    return fetch(API + path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body || {}) }).then(function (r) { return r.json(); });
  }
  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:48px;transform:translateX(-50%);background:#1f2937;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;z-index:99999;box-shadow:0 8px 30px rgba(0,0,0,.4)';
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 1600);
  }
  function copyText(txt) {
    var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('已复制✓'); } catch (e) { toast('请手动复制'); }
    ta.remove();
  }

  var PLATFORMS = [
    ['xiaohongshu', '小红书'], ['douyin', '抖音'], ['wechat_moments', '朋友圈'],
    ['wechat_official', '公众号'], ['instagram', 'Instagram'], ['tiktok', 'TikTok']
  ];
  var CATS = [['flower', '鲜花'], ['bike', '自行车'], ['tech3c', '3C数码'], ['beauty', '美妆'], ['clothing', '服装'], ['food', '食品']];

  var state = { stage: 'card', category: 'bike', fields: [], values: {}, results: {}, ctx: {} };

  function shell() {
    var ov = document.getElementById('awenOv'); if (ov) ov.remove();
    ov = document.createElement('div');
    ov.id = 'awenOv';
    ov.style.cssText = 'position:fixed;inset:0;background:#0f1115;z-index:90000;overflow-y:auto;color:#e5e7eb;font-family:inherit';
    ov.innerHTML =
      '<div style="max-width:960px;margin:0 auto;padding:26px 22px 80px">' +
      '<div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">' +
      '<div style="font-size:18px;font-weight:700">阿文写文案 · 阿发发布</div>' +
      '<span id="awStep" style="font-size:12px;color:#9ca3af"></span>' +
      '<button id="awClose" style="margin-left:auto;background:none;border:1px solid #374151;color:#9ca3af;border-radius:9px;padding:6px 14px;cursor:pointer">返回阿图 ✕</button></div>' +
      '<div id="awBody"></div></div>';
    document.body.appendChild(ov);
    ov.querySelector('#awClose').onclick = function () { ov.remove(); };
    return ov;
  }

  function render() {
    var ov = document.getElementById('awenOv'); if (!ov) ov = shell();
    var body = ov.querySelector('#awBody');
    ov.querySelector('#awStep').textContent = '阶段 ' + (state.stage === 'card' ? '1/2 信息卡' : state.stage === 'copy' ? '2/2 文案生成' : '3/3 发布预览');
    if (state.stage === 'card') body.innerHTML = cardHtml();
    else if (state.stage === 'copy') body.innerHTML = copyHtml();
    else body.innerHTML = previewHtml();
    bind();
  }

  function cardHtml() {
    var catSel = CATS.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === state.category ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('');
    var rows = state.fields.map(function (f) {
      var v = state.values[f.key] != null ? state.values[f.key] : (f.prefill || '');
      var inp;
      if (f.inputType === 'multichoice' || f.inputType === 'singlechoice') {
        var opts = (f.options || []).map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + o + '</option>'; }).join('');
        inp = '<select data-f="' + f.key + '" style="width:100%;background:#1f2937;border:1px solid #374151;color:#e5e7eb;border-radius:9px;padding:9px 11px;font-size:13px">' + opts + '</select>';
      } else {
        inp = '<textarea data-f="' + f.key + '" rows="' + (f.multilineLarge ? 4 : 1) + '" placeholder="' + (f.allowBlank ? '可留白' : '必填') + '" style="width:100%;' + (f.multilineLarge ? 'min-height:88px' : 'min-height:38px') + ';background:#1f2937;border:1px solid #374151;color:#e5e7eb;border-radius:9px;padding:9px 11px;font-size:13px;resize:vertical;font-family:inherit">' + v + '</textarea>';
      }
      return '<div style="margin-bottom:13px"><div style="font-size:12.5px;color:#cbd5e1;margin-bottom:5px">' + f.zh + (f.required ? ' <span style="color:#f59e0b">*</span>' : '') + (f.priceRef ? ' <span style="color:#6b7280;font-size:11px">(' + f.priceRef.slice(0, 26) + '…)</span>' : '') + '</div>' + inp + '</div>';
    }).join('');
    return '<div style="display:flex;gap:10px;align-items:center;margin-bottom:18px"><label style="font-size:13px;color:#9ca3af">品类</label><select id="awCat" style="background:#1f2937;border:1px solid #374151;color:#e5e7eb;border-radius:9px;padding:8px 12px">' + catSel + '</select></div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 22px">' + rows + '</div>' +
      '<button id="awToCopy" style="margin-top:18px;background:#f97316;border:none;color:#fff;border-radius:11px;padding:12px 22px;font-size:14px;cursor:pointer">生成文案 →</button>';
  }

  function copyHtml() {
    var p = PLATFORMS.map(function (x) { return '<label style="display:inline-flex;gap:6px;align-items:center;margin-right:14px;font-size:13px;color:#cbd5e1"><input type="checkbox" data-p="' + x[0] + '" checked>' + x[1] + '</label>'; }).join('');
    var cards = Object.keys(state.results).map(function (plat) {
      var d = state.results[plat]; if (!d || !d.draft) return '';
      return '<div style="border:1px solid #262b33;border-radius:14px;padding:16px;margin-bottom:14px;background:#161a20">' +
        '<div style="display:flex;align-items:center;margin-bottom:10px"><b style="font-size:14px">' + (PLATFORMS.find(function (x) { return x[0] === plat; }) || [, plat])[1] + '</b>' +
        '<button data-copyall="' + plat + '" style="margin-left:auto;background:#f97316;border:none;color:#fff;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12.5px">一键复制全部</button></div>' +
        '<div style="font-size:13px;color:#fbbf24;margin-bottom:6px">📌 ' + esc(d.draft.title || '') + '</div>' +
        '<div style="font-size:13px;color:#cbd5e1;white-space:pre-wrap;line-height:1.7">' + esc(d.draft.body || '') + '</div>' +
        '<div style="font-size:12.5px;color:#60a5fa;margin-top:8px">' + (d.draft.hashtags || []).map(function (h) { return '#' + h; }).join(' ') + '</div>' +
        '<div style="margin-top:10px;display:flex;gap:8px">' +
        '<button data-copyt="' + plat + '" style="background:none;border:1px solid #374151;color:#9ca3af;border-radius:7px;padding:5px 10px;cursor:pointer;font-size:12px">复制标题</button>' +
        '<button data-copyb="' + plat + '" style="background:none;border:1px solid #374151;color:#9ca3af;border-radius:7px;padding:5px 10px;cursor:pointer;font-size:12px">复制正文</button>' +
        '</div></div>';
    }).join('');
    return '<div style="margin-bottom:16px">' + p + '</div><button id="awGen" style="background:#f97316;border:none;color:#fff;border-radius:11px;padding:11px 20px;cursor:pointer;font-size:13.5px">生成所选平台文案</button>' +
      (cards ? '<div style="margin-top:20px">' + cards + '</div>' : '') +
      (Object.keys(state.results).length ? '<button id="awToPreview" style="margin-top:18px;margin-left:10px;background:none;border:1px solid #f97316;color:#f97316;border-radius:11px;padding:11px 20px;cursor:pointer;font-size:13.5px">去阿发预览 →</button>' : '');
  }

  function previewHtml() {
    var keys = Object.keys(state.results);
    var frames = keys.map(function (plat) {
      var d = state.results[plat].draft;
      return '<div style="border:1px solid #262b33;border-radius:18px;overflow:hidden;width:300px;flex:none;background:#000">' +
        '<div style="background:#111;height:38px;display:flex;align-items:center;padding:0 14px;font-size:12px;color:#9ca3af">' + esc(PLATFORMS.find(function (x) { return x[0] === plat; })[1]) + ' · 预览</div>' +
        '<div style="padding:14px;font-size:12.5px;color:#e5e7eb;white-space:pre-wrap"><b>' + esc(d.title || '') + '</b>\n\n' + esc(d.body || '') + '\n\n' + (d.hashtags || []).map(function (h) { return '#' + h; }).join(' ') + '</div></div>';
    }).join('');
    return '<div style="display:flex;gap:16px;overflow-x:auto;padding-bottom:14px">' + frames + '</div>' +
      '<div style="margin-top:16px;font-size:13px;color:#9ca3af">操作清单 / 发布前校验 / 最佳时间 / 素材打包下载 / 二维码画册 —— 阿发模块已接入 /publishing/*，此处为预览骨架。</div>' +
      '<button id="awBack" style="margin-top:16px;background:none;border:1px solid #374151;color:#9ca3af;border-radius:10px;padding:10px 18px;cursor:pointer">← 返回修改文案</button>';
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function bind() {
    var body = document.getElementById('awBody');
    var cat = body.querySelector('#awCat');
    if (cat) cat.onchange = function () { state.category = cat.value; loadCard(); };
    var tc = body.querySelector('#awToCopy'); if (tc) tc.onclick = collectValues;
    var gen = body.querySelector('#awGen'); if (gen) gen.onclick = generate;
    var pv = body.querySelector('#awToPreview'); if (pv) pv.onclick = function () { state.stage = 'preview'; render(); };
    var bk = body.querySelector('#awBack'); if (bk) bk.onclick = function () { state.stage = 'copy'; render(); };
    body.querySelectorAll('[data-f]').forEach(function (el) {
      el.oninput = function () { state.values[el.getAttribute('data-f')] = el.value; };
      el.onchange = function () { state.values[el.getAttribute('data-f')] = el.value; };
    });
    body.querySelectorAll('[data-copyall]').forEach(function (b) {
      b.onclick = function () { var d = state.results[b.getAttribute('data-copyall')].draft; copyText(d.title + '\n\n' + d.body + '\n\n' + (d.hashtags || []).map(function (h) { return '#' + h; }).join(' ')); };
    });
    body.querySelectorAll('[data-copyt]').forEach(function (b) { b.onclick = function () { copyText(state.results[b.getAttribute('data-copyt')].draft.title); }; });
    body.querySelectorAll('[data-copyb]').forEach(function (b) { b.onclick = function () { copyText(state.results[b.getAttribute('data-copyb')].draft.body); }; });
  }

  function loadCard() {
    post('/copywriting/info-card', { category: state.category }).then(function (j) {
      if (j.ok) { state.fields = j.fields; state.values = {}; state.fields.forEach(function (f) { if (f.prefill) state.values[f.key] = f.prefill; }); }
      render();
    });
  }
  function collectValues() { state.stage = 'copy'; render(); }
  function generate() {
    var plats = Array.prototype.map.call(document.querySelectorAll('[data-p]:checked'), function (c) { return c.getAttribute('data-p'); });
    if (!plats.length) { toast('至少选一个平台'); return; }
    state.results = {};
    render();
    plats.forEach(function (plat) {
      post('/copywriting/generate', { platform: plat, category: state.category, info_card: state.values, product_name: state.ctx.productName || '' })
        .then(function (j) { state.results[plat] = j; render(); });
    });
  }

  window.openAwenFlow = function (ctx) { state.ctx = ctx || {}; state.category = (ctx && ctx.category) || 'bike'; state.stage = 'card'; loadCard(); };
})();
