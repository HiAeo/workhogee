/* =====================================================================
 * WorkHogee · 阿发（打包发布）工作台 afa-studio.js
 * ---------------------------------------------------------------------
 * 暴露 window.openAfaStudio(mount, data)。深色主题（#0f1115/#161a20，橙 #f97316）。
 * 本文件为纯前端 UI，不直接调用后端；预览 HTML / 预检 / 清单 / 追踪 数据由整合方
 * （Worker / workbench）渲染后注入 data。自包含测试 harness 直接注入 __AFA_DATA__。
 *
 * data = {
 *   brand, productName,
 *   platforms: [{id,name,en,group,oauth,oauthNote}],
 *   previewHtml: { platform: "<完整已发布预览HTML>" },
 *   checklist:   { platform: { steps:[{click,fill,field}], bestTimes:[{window,note}] } },
 *   validation:  { platform: { passed, autoFixedCount, results:[{rule,pass,autoFixed,detail,failedRules?}], fixedDraft:{...} } },
 *   tracking:    { platform: { code, shortUrl, utmUrl, trackingLine, qrSvg } },
 *   schedule:    { due:[], upcoming:[] }
 * }
 * =====================================================================*/
(function () {
  'use strict';

  var CSS = `
  .afa-root{--bg:#0f1115;--panel:#161a20;--panel2:#1e242d;--line:#262d38;--txt:#e6e8eb;--sub:#9aa3af;--acc:#f97316;--ok:#22c55e;--bad:#ef4444;--warn:#eab308;
    background:var(--bg);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Arial,sans-serif;
    border-radius:14px;overflow:hidden;border:1px solid var(--line);display:flex;flex-direction:column;min-height:640px;}
  .afa-head{display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--panel);border-bottom:1px solid var(--line);}
  .afa-logo{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#f97316,#ea580c);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:14px;}
  .afa-title{font-size:15px;font-weight:700;}
  .afa-sub{font-size:12px;color:var(--sub);}
  .afa-head .sp{flex:1;}
  .afa-badge{font-size:11px;padding:3px 9px;border-radius:999px;border:1px solid var(--line);color:var(--sub);}
  .afa-badge.live{color:var(--ok);border-color:rgba(34,197,94,.4);}
  .afa-body{display:flex;flex:1;min-height:0;}
  .afa-tabs{width:150px;background:var(--panel);border-right:1px solid var(--line);padding:10px 8px;overflow:auto;}
  .afa-tabs .grp{font-size:10px;color:var(--sub);letter-spacing:1px;margin:10px 6px 4px;text-transform:uppercase;}
  .afa-tab{display:flex;align-items:center;gap:6px;padding:8px 10px;border-radius:8px;font-size:13px;cursor:pointer;color:var(--sub);margin-bottom:2px;}
  .afa-tab:hover{background:var(--panel2);color:var(--txt);}
  .afa-tab.on{background:rgba(249,115,22,.14);color:var(--acc);font-weight:600;}
  .afa-tab .dot{width:6px;height:6px;border-radius:50%;background:var(--line);}
  .afa-tab.on .dot{background:var(--acc);}
  .afa-main{flex:1;display:flex;flex-direction:column;min-width:0;}
  .afa-stage{flex:1;background:#0a0c10;display:flex;align-items:flex-start;justify-content:center;padding:14px;overflow:auto;}
  .afa-stage iframe{border:none;border-radius:10px;background:#fff;box-shadow:0 8px 40px rgba(0,0,0,.5);max-width:100%;}
  .afa-side{width:330px;background:var(--panel);border-left:1px solid var(--line);display:flex;flex-direction:column;min-height:0;}
  .afa-side .subtabs{display:flex;border-bottom:1px solid var(--line);}
  .afa-side .subtab{flex:1;text-align:center;padding:10px 4px;font-size:12px;color:var(--sub);cursor:pointer;border-bottom:2px solid transparent;}
  .afa-side .subtab.on{color:var(--acc);border-bottom-color:var(--acc);}
  .afa-side .pane{padding:12px;overflow:auto;flex:1;}
  .row{display:flex;gap:8px;align-items:flex-start;margin-bottom:9px;font-size:12px;line-height:1.5;}
  .ic{flex:none;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;margin-top:1px;}
  .ic.ok{background:rgba(34,197,94,.16);color:var(--ok);}
  .ic.bad{background:rgba(239,68,68,.16);color:var(--bad);}
  .ic.warn{background:rgba(234,179,8,.16);color:var(--warn);}
  .rule{color:var(--sub);}
  .autofix{color:var(--acc);font-size:11px;}
  .steps li{margin-bottom:10px;font-size:12px;line-height:1.5;}
  .steps .click{color:var(--txt);}
  .steps .fill{color:var(--sub);margin-top:2px;}
  .steps .field{display:inline-block;font-size:10px;color:var(--acc);border:1px solid rgba(249,115,22,.35);border-radius:4px;padding:0 5px;margin-left:6px;}
  .trackbox{background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12px;}
  .trackbox a{color:var(--acc);word-break:break-all;}
  .trackbox .qr{text-align:center;margin-top:8px;}
  .trackbox .qr svg{background:#fff;padding:6px;border-radius:6px;}
  .oauth{margin-top:10px;font-size:11px;color:var(--warn);background:rgba(234,179,8,.1);border:1px dashed rgba(234,179,8,.4);padding:8px;border-radius:8px;}
  .sched{font-size:12px;border:1px solid var(--line);border-radius:8px;padding:8px;margin-bottom:6px;}
  .sched.due{border-color:rgba(239,68,68,.4);}
  .sched .t{color:var(--sub);font-size:11px;}
  .af-empty{width:560px;min-height:420px;background:var(--panel);border:1px dashed var(--line);border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px;}
  .af-empty .ico{width:46px;height:46px;border-radius:12px;background:rgba(249,115,22,.12);color:var(--acc);display:flex;align-items:center;justify-content:center;font-size:22px;margin-bottom:14px;}
  .af-empty h4{font-size:15px;color:var(--txt);margin:0 0 8px;font-weight:700;}
  .af-empty p{font-size:12px;color:var(--sub);line-height:1.7;margin:0;max-width:380px;}
  .af-empty .tg{margin-top:14px;display:flex;gap:6px;flex-wrap:wrap;justify-content:center;}
  .af-empty .tg i{font-style:normal;font-size:11px;color:var(--acc);border:1px solid rgba(249,115,22,.35);border-radius:999px;padding:3px 10px;}
  .okline{color:var(--ok);font-weight:600;font-size:13px;}
  .badline{color:var(--bad);font-weight:600;font-size:13px;}
  h5{font-size:11px;color:var(--sub);margin:4px 0 8px;font-weight:600;letter-spacing:.5px;}
  `;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k === 'text') el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { if (c != null) el.appendChild(c.nodeType ? c : document.createTextNode(c)); });
    return el;
  }

  function icon(pass, autofix) {
    var cls = pass ? 'ok' : (autofix ? 'warn' : 'bad');
    var t = pass ? '✓' : (autofix ? '✎' : '✕');
    return h('span', { class: 'ic ' + cls, text: t });
  }

  function renderValidation(v) {
    if (!v) return h('div', { class: 'row', text: '该平台未跑预检' });
    var box = h('div', {});
    box.appendChild(v.passed
      ? h('div', { class: 'okline', text: '✓ 预检通过' + (v.autoFixedCount ? '（已自动修正 ' + v.autoFixedCount + ' 项）' : '') })
      : h('div', { class: 'badline', text: '✕ 预检未通过：' + (v.failedRules || []).join('、') }));
    (v.results || []).forEach(function (r) {
      box.appendChild(h('div', { class: 'row' }, [
        icon(r.pass, r.autoFixed),
        h('div', {}, [
          h('div', { class: 'rule', text: r.rule + '：' + r.detail }),
          r.autoFixed ? h('div', { class: 'autofix', text: '→ 已自动修正' + (r.before ? '（' + r.before + ' → ' + r.after + '）' : '') }) : null
        ])
      ]));
    });
    return box;
  }

  function renderChecklist(c) {
    if (!c || !c.steps) return h('div', { class: 'row', text: '无操作清单' });
    var ol = h('ol', { class: 'steps' });
    c.steps.forEach(function (s) {
      var li = h('li', {}, [
        h('div', { class: 'click', text: s.click }),
        h('div', { class: 'fill', text: s.fill || '' }),
        s.field ? h('span', { class: 'field', text: '字段:' + s.field }) : null
      ]);
      ol.appendChild(li);
    });
    if (c.bestTimes && c.bestTimes.length) {
      var bt = h('div', { style: 'margin-top:10px;' }, [h('h5', { text: '最佳发布时间' })]);
      c.bestTimes.forEach(function (b) {
        bt.appendChild(h('div', { class: 'row' }, [h('span', { class: 'ic ok', text: '◷' }), h('div', { text: b.window + ' · ' + b.note })]));
      });
      ol.appendChild(bt);
    }
    return ol;
  }

  function renderTracking(t, meta) {
    if (!t || !t.shortUrl) return h('div', { class: 'row', text: '未生成追踪链接' });
    var box = h('div', { class: 'trackbox' }, [
      h('div', { text: '渠道码：' + t.code }),
      h('div', { style: 'margin:4px 0;' }, [h('span', { text: '短链：' }), h('a', { href: t.shortUrl, text: t.shortUrl })]),
      h('div', { text: 'UTM：' + (t.utmUrl || '') }),
      h('div', { text: t.trackingLine || '' })
    ]);
    if (t.qrSvg) box.appendChild(h('div', { class: 'qr', html: t.qrSvg }));
    if (meta && !meta.oauth) box.appendChild(h('div', { class: 'oauth', text: '🔒 OAuth 一键发布：' + (meta.oauthNote || '即将开放') + '（当前为手动发布，不放假按钮）' }));
    return box;
  }

  function renderSchedule(s) {
    if (!s) return h('div', { class: 'row', text: '无待发布' });
    var box = h('div', {});
    box.appendChild(h('h5', { text: '已到期（' + s.due.length + '）' }));
    s.due.forEach(function (it) {
      box.appendChild(h('div', { class: 'sched due' }, [h('div', { text: it.platform + ' · ' + (it.draft && it.draft.title || '') }), h('div', { class: 't', text: it.atISO })]));
    });
    box.appendChild(h('h5', { text: '定时待发（' + s.upcoming.length + '）' }));
    s.upcoming.forEach(function (it) {
      box.appendChild(h('div', { class: 'sched' }, [h('div', { text: it.platform + ' · ' + (it.draft && it.draft.title || '') }), h('div', { class: 't', text: it.atISO })]));
    });
    if (!s.due.length && !s.upcoming.length) box.appendChild(h('div', { class: 'row', text: '暂无待发布条目' }));
    return box;
  }

  function openAfaStudio(mount, data) {
    data = data || (window.__AFA_DATA__ || {});
    mount = typeof mount === 'string' ? document.querySelector(mount) : mount;
    if (!mount) return;

    var root = h('div', { class: 'afa-root' });
    var style = h('style', { text: CSS });
    mount.appendChild(style);
    mount.appendChild(root);

    var groups = { social: [], ecommerce: [] };
    (data.platforms || []).forEach(function (p) { (groups[p.group] = groups[p.group] || []).push(p); });

    var head = h('div', { class: 'afa-head' }, [
      h('div', { class: 'afa-logo', text: '发' }),
      h('div', {}, [
        h('div', { class: 'afa-title', text: '阿发 · 打包发布工作台' }),
        h('div', { class: 'afa-sub', text: (data.brand || '') + ' · ' + (data.productName || '商品') + ' · 9 平台一体预览 / 预检 / 追踪' })
      ]),
      h('div', { class: 'sp' }),
      h('div', { class: 'afa-badge live', text: '● 已发布效果一体预览' })
    ]);
    root.appendChild(head);

    var body = h('div', { class: 'afa-body' });
    root.appendChild(body);

    // tabs
    var tabs = h('div', { class: 'afa-tabs' });
    body.appendChild(tabs);
    function addGroup(label, list) {
      tabs.appendChild(h('div', { class: 'grp', text: label }));
      list.forEach(function (p) {
        tabs.appendChild(h('div', { class: 'afa-tab', 'data-p': p.id }, [h('span', { class: 'dot' }), h('span', { text: p.name })]));
      });
    }
    addGroup('社交种草', groups.social);
    addGroup('电商上架', groups.ecommerce);

    // main
    var main = h('div', { class: 'afa-main' });
    body.appendChild(main);
    var stage = h('div', { class: 'afa-stage' });
    main.appendChild(stage);

    // side
    var side = h('div', { class: 'afa-side' });
    body.appendChild(side);
    var subtabs = h('div', { class: 'subtabs' }, [
      h('div', { class: 'subtab on', 'data-st': 'qc', text: '规格预检' }),
      h('div', { class: 'subtab', 'data-st': 'steps', text: '操作清单' }),
      h('div', { class: 'subtab', 'data-st': 'track', text: '追踪链接' }),
      h('div', { class: 'subtab', 'data-st': 'sched', text: '待发布' })
    ]);
    side.appendChild(subtabs);
    var pane = h('div', { class: 'pane' });
    side.appendChild(pane);

    var cur = { p: null, st: 'qc' };

    // 按左侧展示顺序（social 分组 -> ecommerce 分组）排列 9 平台 id
    function orderedIds() {
      var out = [];
      (groups.social || []).forEach(function (p) { out.push(p.id); });
      (groups.ecommerce || []).forEach(function (p) { out.push(p.id); });
      return out;
    }
    function hasPreview(id) {
      var h = (data.previewHtml || {})[id];
      return typeof h === 'string' && h.trim().length > 0;
    }
    // 本场景实际生成了预览的平台（空态提示用）
    function scenarioTargets() {
      return orderedIds().filter(hasPreview);
    }

    function emptyState(pid) {
      var tg = scenarioTargets().map(function (id) {
        var m = (data.platforms || []).find(function (p) { return p.id === id; });
        return m ? m.name : id;
      });
      var curMeta = (data.platforms || []).find(function (p) { return p.id === pid; });
      return '<div class="af-empty">' +
        '<div class="ico">◔</div>' +
        '<h4>本场景未生成「' + esc(curMeta ? curMeta.name : pid) + '」的发布预览</h4>' +
        '<p>该平台不在本次文案/媒体产出范围内，故不强行渲染（避免像渲染故障）。' +
        '请从左侧选择已生成的平台查看一体预览。</p>' +
        (tg.length ? '<div class="tg">' + tg.map(function (n) { return '<i>' + esc(n) + '</i>'; }).join('') + '</div>' : '') +
        '</div>';
    }

    function show(pid) {
      cur.p = pid;
      tabs.querySelectorAll('.afa-tab').forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-p') === pid); });
      stage.innerHTML = '';
      if (hasPreview(pid)) {
        stage.appendChild(h('iframe', { srcdoc: (data.previewHtml || {})[pid], width: '560', height: '760' }));
      } else {
        stage.appendChild(h('div', { class: 'af-empty-wrap', html: emptyState(pid) }));
      }
      renderPane();
    }
    function renderPane() {
      pane.innerHTML = '';
      var meta = (data.platforms || []).find(function (p) { return p.id === cur.p; });
      // 本场景未生成的平台：预检/清单给明确空态，而非"未预检"
      if (cur.st === 'qc') {
        if (!hasPreview(cur.p)) pane.appendChild(h('div', { class: 'row', html: '该平台本场景未生成，无需预检。当前场景目标：' + esc(scenarioTargets().join('、') || '无') }));
        else pane.appendChild(renderValidation((data.validation || {})[cur.p]));
      }
      else if (cur.st === 'steps') pane.appendChild(renderChecklist((data.checklist || {})[cur.p]));
      else if (cur.st === 'track') pane.appendChild(renderTracking((data.tracking || {})[cur.p], meta));
      else pane.appendChild(renderSchedule(data.schedule));
    }
    subtabs.addEventListener('click', function (e) {
      var t = e.target.closest('.subtab'); if (!t) return;
      subtabs.querySelectorAll('.subtab').forEach(function (x) { x.classList.toggle('on', x === t); });
      cur.st = t.getAttribute('data-st'); renderPane();
    });
    tabs.addEventListener('click', function (e) {
      var t = e.target.closest('.afa-tab'); if (!t) return;
      show(t.getAttribute('data-p'));
    });

    // 默认：按展示顺序选第一个"本场景确实生成了预览"的平台；
    // 全部都没有预览时才回退到老默认（第一个电商平台，否则第一个平台）。
    var first = orderedIds().filter(hasPreview)[0]
      || (groups.ecommerce[0] && groups.ecommerce[0].id)
      || (data.platforms[0] && data.platforms[0].id);
    show(first);
    return root;
  }

  window.openAfaStudio = openAfaStudio;
})();
