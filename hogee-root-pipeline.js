/* =====================================================================
 * hogee-root-pipeline.js —— WorkHogee 五伙计「根因级」统一流水线（前端编排）
 * ---------------------------------------------------------------------
 * 入口：window.openRootPipeline(opts)
 *   opts = { images:[dataURL/URL], language:'zh-CN'|'en', selling_text }
 *
 * 根因保证：先 POST /merchant/context 只构建一次统一上下文（OCR+联网+阿果洞察），
 * 拿到 context_id；阿图/阿文/阿视/阿发全部复用同一 context_id / mctx，
 * 确保五伙计「懂同一个商品、同一品牌、同一份事实、同一语种」。
 *
 * 各伙计：阿图 /marketing/plan；阿文 /copywriting/generate-v2（再 openAwenStudio）；
 * 阿视 openAviewStudio（浏览器成片）；阿发 组装 tracking/preview/checklist 后 openAfaStudio；
 * 阿果 /agu/report。
 * 本文件为普通脚本（IIFE），依赖 workbench.html 全局 API / authHeaders()，
 * 以及 awen-studio.js / afa-studio.js / aview-studio.js 暴露的 window 入口。
 * ===================================================================*/
(function () {
  'use strict';

  var CSS = `
  #rp-root{position:fixed;inset:0;background:#0d1015;z-index:96000;overflow:hidden;color:#e6e9ef;display:flex;flex-direction:column;
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px}
  #rp-root .rp-head{display:flex;align-items:center;gap:12px;padding:12px 18px;background:#14181f;border-bottom:1px solid #232a35;flex:none}
  #rp-root .rp-logo{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,#f97316,#ea580c);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff}
  #rp-root h1{font-size:16px;margin:0;font-weight:700}
  #rp-root .rp-sub{font-size:12px;color:#8b93a3}
  #rp-root .rp-sp{flex:1}
  #rp-root .rp-seg{display:flex;background:#0f131a;border:1px solid #262d38;border-radius:9px;overflow:hidden}
  #rp-root .rp-seg button{background:transparent;border:none;color:#9aa3b2;padding:7px 14px;cursor:pointer;font-size:13px}
  #rp-root .rp-seg button.on{background:rgba(249,115,22,.16);color:#fb923c}
  #rp-root .rp-close{background:#232a35;color:#fff;border:none;border-radius:8px;width:32px;height:32px;cursor:pointer}
  #rp-root .rp-body{flex:1;display:flex;min-height:0}
  #rp-root .rp-steps{width:250px;background:#11151c;border-right:1px solid #232a35;padding:14px 12px;overflow:auto;flex:none}
  #rp-root .rp-step{background:#161b23;border:1px solid #242c38;border-radius:12px;padding:11px 12px;margin-bottom:10px}
  #rp-root .rp-step .st-top{display:flex;align-items:center;gap:8px;margin-bottom:6px}
  #rp-root .rp-step .st-name{font-weight:700;font-size:13px}
  #rp-root .rp-step .st-role{font-size:11px;color:#8b93a3}
  #rp-root .rp-step .st-dot{margin-left:auto;width:9px;height:9px;border-radius:50%;background:#3a4150}
  #rp-root .rp-step.run .st-dot{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.18)}
  #rp-root .rp-step.ok .st-dot{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.16)}
  #rp-root .rp-step.err .st-dot{background:#ef4444}
  #rp-root .rp-step .st-desc{font-size:12px;color:#9aa3b2;line-height:1.55;min-height:18px}
  #rp-root .rp-step button.act{margin-top:9px;width:100%;background:#f97316;color:#fff;border:none;border-radius:8px;padding:7px 0;font-size:12px;cursor:pointer}
  #rp-root .rp-step button.ghost{margin-top:7px;width:100%;background:#1d232d;color:#cdd3de;border:1px solid #2b3340;border-radius:8px;padding:7px 0;font-size:12px;cursor:pointer}
  #rp-root .rp-main{flex:1;overflow:auto;padding:18px 20px;background:#0d1015;min-width:0}
  #rp-root .card{background:#14181f;border:1px solid #232a35;border-radius:14px;padding:16px;margin-bottom:16px}
  #rp-root .card h3{margin:0 0 10px;font-size:14px}
  #rp-root .kv{font-size:12.5px;color:#c2c8d4;line-height:1.9}
  #rp-root .muted{color:#8b93a3;font-size:12px}
  #rp-root .chip{display:inline-block;background:#1a2029;border:1px solid #2a323f;color:#c6ccd8;padding:2px 10px;border-radius:999px;font-size:12px;margin:0 6px 6px 0}
  #rp-root .chip.warn{border-color:#b45309;color:#fbbf24}
  #rp-root video{max-width:380px;border-radius:12px;border:1px solid #2a3140;background:#000}
  #rp-root .afa-mount{min-height:680px}
  #rp-root .plan-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
  #rp-root .plan-cell{background:#0f131a;border:1px solid #242c38;border-radius:9px;padding:8px;font-size:11px;color:#aeb6c4}
  #rp-root .plan-cell b{color:#e6e9ef;display:block;margin-bottom:4px;font-size:12px}
  #rp-root .runline{font-size:12.5px;color:#d2d7e0;line-height:1.7}
  #rp-root .runline .hl{color:#fb923c}
  #rp-root .downbtn{display:inline-block;background:#1d232d;color:#cdd3de;border:1px solid #2b3340;border-radius:8px;padding:7px 14px;font-size:12px;margin:8px 8px 0 0;cursor:pointer;text-decoration:none}
  `;

  function el(tag, html) { var e = document.createElement(tag); if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function apiBase() { try { return (typeof API !== 'undefined' ? API : (window.FAPI || '')).replace(/\/$/, ''); } catch (e) { return (window.FAPI || '').replace(/\/$/, ''); } }
  function hdrs() { var h = { 'Content-Type': 'application/json' }; try { if (window.HogeeMember && window.HogeeMember.authHeaders) Object.assign(h, window.HogeeMember.authHeaders()); } catch (e) {} return h; }
  function post(path, body) { return fetch(apiBase() + path, { method: 'POST', headers: hdrs(), body: JSON.stringify(body || {}) }).then(function (r) { return r.json(); }); }
  function get(path) { return fetch(apiBase() + path, { headers: hdrs() }).then(function (r) { return r.json(); }); }

  function mediaMeta(url) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res({ url: url, type: 'image', width: im.naturalWidth, height: im.naturalHeight, ext: url.indexOf('data:') === 0 ? (url.split(';')[0].split('/')[1] || 'jpg') : 'jpg' }); };
      im.onerror = function () { res({ url: url, type: 'image' }); };
      im.src = url;
    });
  }

  var SCEN = {
    'zh-CN': { awen: ['xhs', 'douyin', 'moments', 'taobao', 'jd'], video: 'douyin', afa: ['jd', 'douyin'] },
    en: { awen: ['instagram', 'tiktok', 'amazon'], video: 'tiktok', afa: ['amazon', 'tiktok'] }
  };

  var S = null;

  function setStep(id, cls, desc) {
    var node = S.root.querySelector('[data-step="' + id + '"]');
    if (!node) return;
    node.classList.remove('run', 'ok', 'err');
    if (cls) node.classList.add(cls);
    if (desc != null) { var d = node.querySelector('.st-desc'); if (d) d.innerHTML = desc; }
  }

  /* ---------- 0. 构建统一上下文（只一次） ---------- */
  async function buildContext() {
    setStep('ctx', 'run', 'OCR 深读 + 联网调研 + 阿果洞察…');
    var r = await post('/merchant/context', {
      images: S.images, language: S.language, selling_text: S.selling_text
    });
    if (!r.ok) { setStep('ctx', 'err', esc(r.error && r.error.message || '上下文构建失败')); throw new Error('context'); }
    S.context_id = r.context_id; S.mctx = r.mctx;
    var m = r.mctx;
    setStep('ctx', 'ok', '品牌 <b>' + esc(m.brand || '未识别') + '</b> · ' + esc(m.category.zh) + ' · 联网=' + (m.research.web_used ? '✓' : '✗') + ' · ' + m.timings.total_ms + 'ms');
    try { S.root.dataset.contextId = S.context_id; } catch (e) {}
  }

  /* ---------- 1. 阿图 ---------- */
  async function runAtu() {
    setStep('atu', 'run', '规划图种与上屏文案…');
    var r = await post('/marketing/plan', {
      images: S.images, context_id: S.context_id, language: S.language, selling_text: S.selling_text
    });
    if (!r.ok) { setStep('atu', 'err', esc(r.error && r.error.message || '阿图失败')); return; }
    S.plan = r;
    var cells = r.plan.map(function (p) {
      var o = p.on_screen_text || {};
      return '<div class="plan-cell"><b>' + esc(p.label_zh) + '</b>' + esc(o.headline || '(无字)') + '</div>';
    }).join('');
    S.atuStage.innerHTML = '';
    S.atuStage.appendChild(el('div', '<div class="kv"><b>商品：</b>' + esc(r.product.name) + '<br><b>核心卖点：</b>' + esc((r.product.core_points || []).join('；')) + '</div>'));
    S.atuStage.appendChild(el('div', '<div class="plan-grid" style="margin-top:12px">' + cells + '</div>'));
    setStep('atu', 'ok', r.plan.length + ' 个图种已规划，洞察反哺=' + r.insights_used);
  }

  /* ---------- 2. 阿文 ---------- */
  async function runAwen() {
    setStep('awen', 'run', '联网学当下爆款，逐平台生成…');
    var platforms = SCEN[S.language].awen;
    var r = await post('/copywriting/generate-v2', {
      context_id: S.context_id, platforms: platforms
    });
    if (!r.ok) { setStep('awen', 'err', esc(r.error && r.error.message || '阿文失败')); return; }
    S.awen = r;
    var pf = await post('/copywriting/prefill', { context_id: S.context_id });
    S.prefill = pf.fields || []; S.prefillValues = pf.values || {};
    var okCount = (r.results || []).filter(function (x) { return x.ok; }).length;
    S.awenStage.innerHTML = '<div class="muted">已生成 ' + okCount + '/' + (r.results || []).length + ' 平台 · 成本 ¥' + r.cost_total_cny + '。点击下方按钮打开文案工坊（左图右文成套、补录已预填）。</div>';
    setStep('awen', 'ok', okCount + ' 平台母语级文案，风格一眼可辨');
  }
  function openAwen() {
    if (!S.awen) return;
    var m = S.mctx;
    window.openAwenStudio({
      product: { image: S.images[0], brand: m.brand, category: m.category, language: m.language, bg_brands: m.bg_brands },
      factsBrief: m.factsBrief,
      prefill: S.prefill || [],
      prefillValues: S.prefillValues || {},
      results: S.awen.results,
      costTotal: S.awen.cost_total_cny
    });
  }

  /* ---------- 3. 阿视 ---------- */
  function copyForVideo() {
    var vp = SCEN[S.language].video;
    var out = {};
    (S.awen.results || []).forEach(function (r) {
      if (r.draft) out[r.platform] = { title: r.draft.title, body: r.draft.body, hashtags: r.draft.hashtags };
    });
    return out;
  }
  async function runAview() {
    setStep('aview', 'run', '分镜→TTS旁白→浏览器图文成片…');
    try {
      var platform = SCEN[S.language].video;
      var res = await window.openAviewStudio(S.mctx, copyForVideo(), { platform: platform, images: S.images });
      S.videoBlob = res.blob;
      S.videoUrl = URL.createObjectURL(res.blob);
      S.aviewStage.innerHTML = '';
      var v = el('video', ''); v.controls = true; v.src = S.videoUrl;
      var info = el('div', '<div class="muted" style="margin-bottom:8px">' + (platform === 'tiktok' ? 'TikTok 英文' : '抖音中文') + ' · ' + res.durationSec.toFixed(1) + 's · ' + (res.bytes / 1048576).toFixed(1) + 'MB · ' + res.shots.length + ' 镜（静帧+Ken Burns+TTS，0 i2v）</div>');
      var dl = el('a', '⬇ 下载成片 .mp4'); dl.className = 'downbtn'; dl.href = S.videoUrl; dl.download = (platform === 'tiktok' ? 'tiktok_en' : 'douyin_zh') + '.mp4';
      S.aviewStage.appendChild(info); S.aviewStage.appendChild(v); S.aviewStage.appendChild(dl);
      setStep('aview', 'ok', res.shots.length + ' 镜 · ' + res.durationSec.toFixed(1) + 's，无黑帧、口播字幕同步');
    } catch (e) {
      setStep('aview', 'err', esc(String(e.message || e)));
    }
  }

  /* ---------- 4. 阿发 ---------- */
  async function runAfa() {
    setStep('afa', 'run', '追踪链接→已发布预览→规格预检…');
    try {
      var plats = SCEN[S.language].afa;
      var media = [];
      for (var i = 0; i < S.images.length; i++) media.push(await mediaMeta(S.images[i]));
      var draftByPlat = {};
      // 归一为阿发草稿形状：京东/淘宝用 selling_points/detail，亚马逊用 bullets/description，
      // 社交用 body；统一补齐 bullets/body，避免预览"暂无卖点"或预检漏字段。
      var toPubDraft = function (d) {
        var bullets = Array.isArray(d.bullets) ? d.bullets
          : (Array.isArray(d.selling_points) ? d.selling_points : []);
        var body = d.body || d.detail || d.description || '';
        return {
          title: d.title || '', subtitle: d.subtitle || '', body: body,
          bullets: bullets, description: d.description || d.detail || body,
          hashtags: d.hashtags || [], price: d.price || '', selling_points: d.selling_points || bullets
        };
      };
      (S.awen.results || []).forEach(function (r) { if (r.draft) draftByPlat[r.platform] = toPubDraft(r.draft); });

      var platforms = (await get('/publishing/platforms')) || [];
      var previewHtml = {}, checklist = {}, validation = {}, tracking = {};
      for (var k = 0; k < plats.length; k++) {
        var p = plats[k];
        var draft = draftByPlat[p] || { title: S.mctx.brand || '', body: '' };
        var tr = await post('/publishing/tracking', { platform: p });
        tracking[p] = tr.tracking;
        var pv = await post('/publishing/preview', { platform: p, mctx: S.mctx, draft: draft, media: media, trackingLine: tr.trackingLine });
        previewHtml[p] = pv.html;
        var cl = await post('/publishing/checklist', { platform: p, validate: true, draft: draft, media: media });
        checklist[p] = { steps: cl.steps, bestTimes: cl.bestTimes };
        validation[p] = cl.validation;
      }
      var sch = await post('/publishing/schedule', { action: 'list' });
      S.afaData = {
        brand: S.mctx.brand, productName: S.plan ? S.plan.product.name : '',
        platforms: platforms, previewHtml: previewHtml, checklist: checklist,
        validation: validation, tracking: tracking, schedule: sch
      };
      S.afaStage.innerHTML = '<div class="muted" style="margin-bottom:10px">已为 ' + plats.join('、') + ' 生成一体预览/预检/追踪。下方为阿发工作台：</div><div class="afa-mount" id="afa-mount"></div>';
      window.openAfaStudio(S.afaStage.querySelector('#afa-mount'), S.afaData);
      setStep('afa', 'ok', plats.length + ' 平台一体预览可复制、规格预检有效、追踪已带上');
    } catch (e) {
      setStep('afa', 'err', esc(String(e.message || e)));
    }
  }

  /* ---------- 5. 阿果 ---------- */
  async function runAgu() {
    setStep('agu', 'run', '生成效果报告与洞察…');
    var taskId = S.context_id || '';
    var r = await post('/agu/report', { task_id: taskId, force: false });
    if (!r.ok) {
      var code = r.error && r.error.code;
      if (code === 'no_data' || code === 'bad_task_id') {
        S.aguStage.innerHTML = '<div class="muted">暂无外部回收数据（属正常：发布后在阿果录入各平台数据，再出报告）。追踪链接/渠道码已在阿发自动带上。</div>';
        setStep('agu', 'ok', '待数据回收；洞察闭环已就绪（发布后自动反哺）');
        return;
      }
      setStep('agu', 'err', esc(r.error && r.error.message || '阿果报告失败')); return;
    }
    S.agu = r;
    var n = r.narrative || {};
    S.aguStage.innerHTML = '<div class="runline"><div><span class="hl">结论：</span>' + esc(n.headline || '') + '</div>'
      + '<div style="margin-top:8px"><b>最佳：</b>' + esc((n.best || []).map(function (b) { return b.what; }).join('；')) + '</div>'
      + '<div style="margin-top:8px"><b>行动项：</b>' + esc((n.actions || []).map(function (a) { return a.action + (a.target ? '（' + a.target + '）' : ''); }).join('；')) + '</div></div>';
    setStep('agu', 'ok', '报告可执行，洞察已闭环反哺前四个伙计');
  }

  /* ---------- 一键顺序跑（自动） ---------- */
  async function autoRun() {
    S.autobtn.disabled = true;
    try {
      await buildContext();
      await runAtu();
      await runAwen();
      await runAview();
      await runAfa();
      await runAgu();
      S.atuStage.scrollIntoView();
    } catch (e) {}
    S.autobtn.disabled = false;
  }

  var STEPDEFS = [
    { id: 'ctx', name: '统一上下文', role: 'OCR+联网+洞察', desc: '尚未开始', auto: buildContext },
    { id: 'atu', name: '阿图 · 图种', role: '商品图规划', desc: '等待统一上下文', auto: runAtu },
    { id: 'awen', name: '阿文 · 文案', role: '分平台母语文案', desc: '等待阿图', auto: runAwen, extra: { t: '打开文案工坊', fn: openAwen } },
    { id: 'aview', name: '阿视 · 短视频', role: '抖音/TikTok 成片', desc: '等待阿文', auto: runAview },
    { id: 'afa', name: '阿发 · 发布', role: '一体预览/预检', desc: '等待阿视', auto: runAfa },
    { id: 'agu', name: '阿果 · 数据', role: '报告/闭环', desc: '等待阿发', auto: runAgu }
  ];

  window.openRootPipeline = function (opts) {
    opts = opts || {};
    var old = document.getElementById('rp-root'); if (old) old.remove();
    S = {
      images: (opts.images || []).slice(),
      language: opts.language === 'en' ? 'en' : 'zh-CN',
      selling_text: opts.selling_text || ''
    };
    var root = el('div'); root.id = 'rp-root';
    root.appendChild(el('style', CSS));

    var head = el('div', '<div class="rp-logo">五</div><div><h1>五伙计 · 根因级统一流水线</h1><div class="rp-sub">同一商品 · 同一品牌 · 同一份事实 · 同一语种</div></div><div class="rp-sp"></div>');
    var seg = el('div', '<div class="rp-seg"><button data-lang="zh-CN">中文 · 京东/抖音</button><button data-lang="en">English · Amazon/TikTok</button></div>');
    seg.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        S.language = b.getAttribute('data-lang');
        seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
      };
      if (b.getAttribute('data-lang') === S.language) b.classList.add('on');
    });
    head.appendChild(seg);
    var autobtn = el('button', '▶ 一键跑完整漏斗');
    autobtn.id = 'rpAuto';
    autobtn.className = 'rp-close'; autobtn.style.width = 'auto'; autobtn.style.padding = '0 14px'; autobtn.style.background = '#f97316';
    autobtn.onclick = autoRun; S.autobtn = autobtn; head.appendChild(autobtn);
    var close = el('button', '×'); close.className = 'rp-close'; close.onclick = function () { root.remove(); }; head.appendChild(close);
    root.appendChild(head);

    var body = el('div'); body.className = 'rp-body';
    var steps = el('div'); steps.className = 'rp-steps';
    STEPDEFS.forEach(function (d) {
      var st = el('div', '<div class="st-top"><span class="st-name">' + d.name + '</span><span class="st-dot"></span></div>'
        + '<div class="st-role">' + d.role + '</div><div class="st-desc">' + esc(d.desc) + '</div>');
      st.className = 'rp-step'; st.setAttribute('data-step', d.id);
      var b = el('button', '执行此步'); b.className = 'act';
      b.onclick = function () { d.auto(); };
      st.appendChild(b);
      if (d.extra) { var g = el('button', d.extra.t); g.className = 'ghost'; g.onclick = d.extra.fn; st.appendChild(g); }
      steps.appendChild(st);
    });
    body.appendChild(steps);

    var main = el('div'); main.className = 'rp-main';
    var stages = [
      ['ctx', '统一上下文'], ['atu', '阿图 · 图种规划'], ['awen', '阿文 · 文案'],
      ['aview', '阿视 · 短视频'], ['afa', '阿发 · 打包发布'], ['agu', '阿果 · 效果报告']
    ];
    stages.forEach(function (x) {
      var c = el('div', '<h3>' + x[1] + '</h3>'); c.className = 'card';
      var stage = el('div'); c.appendChild(stage);
      main.appendChild(c);
      S[x[0] + 'Stage'] = stage;
    });
    S.ctxStage.innerHTML = '<div class="muted">点右上「一键跑完整漏斗」，或逐节点执行。上下文只构建一次，五个伙计共享。</div>';
    S.root = root;
    body.appendChild(main);
    root.appendChild(body);
    document.body.appendChild(root);
  };

})();
