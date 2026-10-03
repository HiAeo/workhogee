/* =====================================================================
 * awen-studio.js —— 阿文·文案工坊（独立深色 UI，自包含）
 * ---------------------------------------------------------------------
 * 入口：window.openAwenStudio(bundle)
 *   bundle = {
 *     product: { image, brand, category, language, bg_brands },
 *     factsBrief: '...',
 *     prefill:  [{key,zh,type,rows,prefill}],   // 已智能预填的补录字段
 *     results:  [{ platform,label,lang, ok, rejected,
 *                  draft:{title,body,subtitle,selling_points[],detail,bullets[],description,hashtags[]},
 *                  qc:{pass,fails,warns,metrics}, media:{images,aspect,suggestion}, cost_cny }],
 *     costTotal: ¥
 *   }
 * 设计：文案与图在同一卡片里成套展示；补录字段大输入框、已预填、无"留白"提示。
 * ===================================================================*/
(function () {
  var CSS = `
  #aww-root{position:fixed;inset:0;background:#0f1115;z-index:95000;overflow:auto;color:#e5e7eb;
    font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px}
  #aww-root .aww-wrap{max-width:1180px;margin:0 auto;padding:22px 20px 90px}
  #aww-root h1{font-size:19px;margin:0;font-weight:700}
  #aww-root .orange{color:#f97316}
  #aww-root .muted{color:#8b93a3;font-size:12px}
  #aww-root .bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0 18px}
  #aww-root .chip{background:#1a1f28;border:1px solid #262d3a;color:#c6ccd8;padding:3px 10px;border-radius:999px;font-size:12px}
  #aww-root .chip.warn{border-color:#b45309;color:#fbbf24}
  #aww-root .chip.bad{border-color:#b91c1c;color:#f87171}
  #aww-root .chip.ok{border-color:#15803d;color:#4ade80}
  #aww-root .grid{display:grid;grid-template-columns:340px 1fr;gap:18px}
  @media(max-width:900px){#aww-root .grid{grid-template-columns:1fr}}
  #aww-root .card{background:#161a20;border:1px solid #232a35;border-radius:14px;padding:16px}
  #aww-root .pimg{width:100%;border-radius:10px;border:1px solid #2a3140;display:block}
  #aww-root .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
  #aww-root .tab{padding:7px 13px;border-radius:9px;background:#1a1f28;border:1px solid #262d3a;cursor:pointer;font-size:13px;color:#c6ccd8}
  #aww-root .tab.on{background:rgba(249,115,22,.15);border-color:#f97316;color:#fb923c}
  #aww-root .field{margin-bottom:12px}
  #aww-root label{display:block;font-size:12px;color:#9aa3b2;margin-bottom:5px}
  #aww-root input[type=text],#aww-root textarea{width:100%;background:#0f1218;border:1px solid #2a3140;border-radius:8px;
    color:#e8ebf0;padding:9px 11px;font-size:13px;box-sizing:border-box;font-family:inherit;resize:vertical}
  #aww-root textarea{line-height:1.6}
  #aww-root .dtitle{font-size:16px;font-weight:700;color:#fff;line-height:1.4}
  #aww-root .dbody{white-space:pre-wrap;line-height:1.75;color:#d6dae3;margin-top:10px}
  #aww-root .dtags{margin-top:12px;color:#60a5fa;font-size:13px}
  #aww-root .rowhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  #aww-root .copybtn{background:#f97316;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:12px;cursor:pointer}
  #aww-root .bullet{background:#0f1218;border-left:3px solid #f97316;padding:8px 12px;border-radius:0 8px 8px 0;margin-bottom:8px;font-size:13px;line-height:1.6}
  #aww-root .sp{background:#0f1218;border:1px solid #2a3140;border-radius:8px;padding:8px 12px;margin-bottom:7px;font-size:13px}
  #aww-root details summary{cursor:pointer;color:#9aa3b2;font-size:12px}
  #aww-root .kv{font-size:12px;color:#8b93a3;line-height:1.9}
  #aww-root .close{position:fixed;top:16px;right:20px;background:#232a35;color:#fff;border:none;border-radius:8px;width:34px;height:34px;cursor:pointer;font-size:16px;z-index:95001}
  `;

  function el(tag, html) { var e = document.createElement(tag); if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function copyText(txt, btn) {
    var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); btn.textContent = '已复制✓'; setTimeout(function(){btn.textContent='复制';}, 1200); } catch (e) {}
    ta.remove();
  }

  function renderDraft(box, r) {
    var d = r.draft || {};
    box.innerHTML = '';
    var head = el('div', '<div class="rowhead"><div class="muted">' + esc(r.label) + ' · ' + esc(r.lang) + ' · ' + esc(r.media && r.media.aspect || '') + '</div></div>');
    box.appendChild(head);

    function block(label, text, mono) {
      var w = el('div');
      w.appendChild(el('div', '<label>' + esc(label) + '</label>'));
      var pre = el('div', '<div class="' + (mono ? 'dbody' : 'dbody') + '"></div>');
      pre.firstChild.textContent = text || '(空)';
      w.appendChild(pre);
      var b = el('button', '复制'); b.className = 'copybtn'; b.style.marginTop = '6px';
      b.onclick = function () { copyText((label + '\n' + (text || '')), b); };
      w.appendChild(b);
      box.appendChild(w);
    }

    if (d.title) block('标题', d.title);
    if (d.subtitle) block('首屏副标题', d.subtitle);
    if (d.selling_points && d.selling_points.length) {
      var sp = el('div'); sp.appendChild(el('div', '<label>核心卖点</label>'));
      d.selling_points.forEach(function (s) { sp.appendChild(el('div', '<div class="sp"></div>')).firstChild.textContent = s; });
      box.appendChild(sp);
    }
    if (d.bullets && d.bullets.length) {
      var bl = el('div'); bl.appendChild(el('div', '<label>五点描述（Amazon）</label>'));
      d.bullets.forEach(function (b, i) { bl.appendChild(el('div', '<div class="bullet"><b>' + (i + 1) + '.</b> </div>')).lastChild.appendChild(document.createTextNode(b)); });
      box.appendChild(bl);
    }
    if (d.body) block('正文', d.body);
    if (d.detail) block('详情页', d.detail);
    if (d.description) block('描述', d.description);
    if (d.hashtags && d.hashtags.length) {
      var h = el('div', '<div class="dtags">' + d.hashtags.map(function (t) { return '#' + esc(t); }).join('  ') + '</div>');
      box.appendChild(h);
    }
  }

  window.openAwenStudio = function (bundle) {
    var old = document.getElementById('aww-root'); if (old) old.remove();
    var root = el('div'); root.id = 'aww-root';
    root.appendChild(el('style')).textContent = CSS;
    var close = el('button', '×'); close.className = 'close'; close.onclick = function () { root.remove(); };
    root.appendChild(close);

    var wrap = el('div'); wrap.className = 'aww-wrap';
    var p = bundle.product || {};

    wrap.appendChild(el('h1', '阿文 · 文案工坊 <span class="orange">/ ' + esc(p.brand || '未识别品牌') + '</span></h1>'));
    var bar = el('div'); bar.className = 'bar';
    bar.appendChild(el('span', '<span class="chip">品类：' + esc((p.category && (p.category.zh + ' / ' + p.category.en)) || '') + '</span>'));
    bar.appendChild(el('span', '<span class="chip">语种：' + esc(p.language && p.language.name || '') + '</span>'));
    bar.appendChild(el('span', '<span class="chip">成本：¥' + (bundle.costTotal != null ? bundle.costTotal : '') + '</span>'));
    (p.bg_brands || []).forEach(function (b) { bar.appendChild(el('span', '<span class="chip warn">背景第三方品牌·禁用：' + esc(b) + '</span>')); });
    wrap.appendChild(bar);

    var grid = el('div'); grid.className = 'grid';

    /* 左：图 + 事实 + 补录 */
    var left = el('div');
    var imgCard = el('div'); imgCard.className = 'card';
    if (p.image) { var im = el('img'); im.className = 'pimg'; im.src = p.image; imgCard.appendChild(im); }
    imgCard.appendChild(el('div', '<div class="muted" style="margin-top:8px">↑ 与右侧文案成套交付（同一件商品）</div>'));
    left.appendChild(imgCard);

    if (bundle.factsBrief) {
      var fb = el('div'); fb.className = 'card'; fb.style.marginTop = '14px';
      fb.appendChild(el('details')).appendChild(el('summary', '查看唯一事实来源（factsBrief）'));
      fb.querySelector('details').appendChild(el('div', '<div class="kv" style="margin-top:8px;white-space:pre-wrap"></div>')).firstChild.textContent = bundle.factsBrief;
      left.appendChild(fb);
    }

    /* 补录卡 */
    if (bundle.prefill && bundle.prefill.length) {
      var pc = el('div'); pc.className = 'card'; pc.style.marginTop = '14px';
      pc.appendChild(el('div', '<b>补录信息（已自动预填，可直接改）</b>'));
      bundle.prefill.forEach(function (f) {
        var v = (bundle.prefillValues && bundle.prefillValues[f.key]) || f.prefill || '';
        var w = el('div'); w.className = 'field';
        w.appendChild(el('label', esc(f.zh)));
        if (f.type === 'readonly') {
          w.appendChild(el('div', '<div class="kv"></div>')).firstChild.textContent = v;
        } else if (f.type === 'multiline') {
          var ta = el('textarea'); ta.rows = f.rows || 4; ta.value = v; w.appendChild(ta);
        } else {
          var inp = el('input'); inp.type = 'text'; inp.value = v; w.appendChild(inp);
        }
        pc.appendChild(w);
      });
      left.appendChild(pc);
    }
    grid.appendChild(left);

    /* 右：平台 tabs */
    var right = el('div'); right.className = 'card';
    var tabs = el('div'); tabs.className = 'tabs';
    var stage = el('div');
    var results = bundle.results || [];
    results.forEach(function (r, idx) {
      var t = el('div', '<div class="tab">' + esc(r.label) + (r.ok ? '' : ' ✗') + '</div>');
      t.onclick = function () {
        tabs.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('on'); });
        t.classList.add('on');
        stage.innerHTML = '';
        renderDraft(stage, r);
        if (r.qc) {
          var status = el('div', '<div class="bar"></div>');
          status.firstChild.appendChild(el('span', r.qc.pass ? '<span class="chip ok">质检通过</span>' : '<span class="chip bad">质检未过：' + esc(r.qc.fails.map(function(f){return f.id;}).join(',')) + '</span>'));
          (r.qc.warns || []).forEach(function (w) { status.firstChild.appendChild(el('span', '<span class="chip warn">' + esc(w.id) + '</span>')); });
          stage.appendChild(status.firstChild);
        }
      };
      tabs.appendChild(t);
      if (idx === 0) t.onclick();
    });
    right.appendChild(tabs);
    right.appendChild(stage);
    grid.appendChild(right);

    wrap.appendChild(grid);
    root.appendChild(wrap);
    document.body.appendChild(root);
  };

  /* 暴露给 worker 接入：POST 到 /copywriting/generate-v2 */
  window.AwenStudio = {
    generate: function (payload) {
      var API = (window.FAPI || '').replace(/\/$/, '');
      var h = { 'Content-Type': 'application/json' };
      try { if (window.HogeeMember && window.HogeeMember.authHeaders) Object.assign(h, window.HogeeMember.authHeaders()); } catch (e) {}
      return fetch(API + '/copywriting/generate-v2', { method: 'POST', headers: h, body: JSON.stringify(payload) }).then(function (r) { return r.json(); });
    }
  };
})();
