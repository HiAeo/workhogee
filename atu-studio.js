/* =====================================================================
 * 阿图操作台 AtuStudio —— 复刻佐糖 listing-image-generator 的布局/模块/交互，
 * 配色沿用 WorkHogee 深色品牌主题。自包含模块（CSS 注入 + 全屏容器 + 逻辑）。
 * 可复用：UI 仅通过全局 services（authPost / HogeeFidelity / callIdentify）调用后端。
 * 进入：AtuStudio.open()；退出：AtuStudio.close()。阿文接口：window.atuToAwen（预留）。
 * ===================================================================*/
(function(){
 "use strict";
 if(window.AtuStudio)return;
 /* === 通过 AtuBridge 访问 workbench 主作用域（UI/业务解耦，可复用） === */
 var B=window.AtuBridge||{};
 function GS(){return B.state;}
 function GF(){return B.HogeeFidelity||window.HogeeFidelity;}
 var $=function(s,r){return B.$?B.$(s,r):document.querySelector(s);};
 var toast=function(m,t){if(B.toast)B.toast(m,t);};
 var authPost=function(p,b,t){return B.authPost(p,b,t);};
 var callIdentify=function(d){return B.callIdentify(d);};
 var openKbPicker=function(){if(B.openKbPicker)B.openKbPicker();};
 var openUrlImport=function(){if(B.openUrlImport)B.openUrlImport();};
 var exitTaskFocus=function(){if(B.exitTaskFocus)B.exitTaskFocus();};
 var _sleep=function(ms){return new Promise(function(r){setTimeout(r,ms);});};
 var _isNetErr=function(j){return !!(j&&j.ok===false&&j.error&&!j.error.code&&/网络|超时|异常/.test(j.error.message||''));};
 var retryCall=function(p,b,t){return (async function(){var j;for(var a=0;a<3;a++){j=await authPost(p,b,t);if(j&&j.ok)return j;if(!_isNetErr(j))return j;if(a<2)await _sleep(800*(a+1));}return j;})();};

 var CSS = " \
#atuStudio{position:fixed;inset:0;z-index:400;display:none;flex-direction:column;background:var(--stage);color:var(--tx);overflow:hidden}\
body.atu-open #atuStudio{display:flex}\
#atuStudio::before{content:'';position:absolute;inset:0;background:radial-gradient(900px 520px at 78% -8%,rgba(251,122,34,.10),transparent 60%),radial-gradient(760px 480px at 12% 110%,rgba(86,140,255,.08),transparent 60%);pointer-events:none}\
.ats-top{position:relative;z-index:2;height:58px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 20px}\
.ats-tl{display:flex;align-items:center;gap:13px}\
.ats-logo svg{height:23px;width:auto;display:block}\
.ats-crumb{display:inline-flex;align-items:center;gap:7px;height:27px;padding:0 12px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid var(--line);font-size:12px;color:var(--tx2);white-space:nowrap}\
.ats-crumb b{color:var(--orange);font-weight:600}\
.ats-tr{display:flex;align-items:center;gap:10px}\
.ats-pill{display:inline-flex;align-items:center;gap:7px;height:30px;padding:0 13px;border-radius:999px;background:rgba(251,122,34,.12);border:1px solid rgba(251,122,34,.28);color:#ffb084;font-size:12px;font-weight:500;white-space:nowrap;flex:none}\.ats-pill svg{width:14px;height:14px;flex:none}\
.ats-back{appearance:none;width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--tx2);display:grid;place-items:center;cursor:pointer;transition:.16s}\
.ats-back:hover{color:var(--orange);border-color:var(--orange);background:var(--orange-soft)}\
.ats-body{position:relative;z-index:1;flex:1;min-height:0;display:flex}\
.ats-rail{flex:none;width:86px;display:flex;flex-direction:column;gap:6px;padding:8px 10px}\
.ats-nav{appearance:none;border:1px solid transparent;background:transparent;color:var(--tx3);border-radius:14px;padding:12px 4px;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;transition:.16s;font-family:inherit}\
.ats-nav svg{width:23px;height:23px;stroke-width:1.9}\
.ats-nav span{font-size:11.5px;line-height:1.2;letter-spacing:.2px}\
.ats-nav:hover{color:var(--tx2);background:rgba(255,255,255,.04)}\
.ats-nav.on{color:var(--orange);background:var(--orange-soft);border-color:rgba(251,122,34,.30)}\
.ats-panel{position:relative;flex:none;width:384px;min-height:0;display:flex;flex-direction:column}\
.ats-scroll{flex:1;min-height:0;overflow-y:auto;padding:4px 14px 134px 4px;display:flex;flex-direction:column;gap:12px}\
.ats-card{background:rgba(255,255,255,.032);border:1px solid var(--line);border-radius:15px;padding:14px}\
.ats-ch{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}\
.ats-ct{font-size:14px;font-weight:600;display:flex;align-items:center;gap:8px}\
.ats-cs{appearance:none;background:transparent;border:0;color:var(--orange);font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-family:inherit;padding:4px 7px;border-radius:7px;white-space:nowrap}\.ats-cs svg{width:14px;height:14px;flex:none}\
.ats-cs:hover{background:var(--orange-soft)}\
.ats-cs.mut{color:var(--tx3);font-weight:500}\
.ats-cs.mut:hover{background:rgba(255,255,255,.06);color:var(--tx2)}\
.ats-thumbs{display:flex;flex-wrap:wrap;gap:9px}\
.ats-thumb{position:relative;width:62px;height:62px;border-radius:11px;overflow:hidden;border:1px solid var(--line)}\
.ats-thumb img{width:100%;height:100%;object-fit:cover;display:block}\
.ats-td{position:absolute;top:3px;right:3px;width:18px;height:18px;border-radius:50%;border:0;background:rgba(8,10,16,.68);color:#fff;font-size:12px;line-height:1;cursor:pointer;display:grid;place-items:center;opacity:0;transition:.15s}\
.ats-thumb:hover .ats-td{opacity:1}\
.ats-add{width:62px;height:62px;border-radius:11px;border:1.5px dashed var(--line2);background:rgba(255,255,255,.02);color:var(--tx3);display:grid;place-items:center;cursor:pointer;transition:.16s}\
.ats-add:hover{border-color:var(--orange);color:var(--orange);background:var(--orange-soft)}\
.ats-add svg{width:24px;height:24px}\
.ats-hint{margin-top:10px;font-size:11.5px;color:var(--tx3);line-height:1.6}\
.ats-ta{width:100%;min-height:118px;resize:vertical;border-radius:11px;background:var(--bg);border:1px solid var(--line);color:var(--tx);padding:11px 12px;font-size:13px;line-height:1.65;font-family:inherit}\
.ats-ta:focus{outline:none;border-color:var(--orange)}\
.ats-ta::placeholder{color:var(--tx3)}\
.ats-spin{font-size:12.5px;color:var(--tx2);display:flex;align-items:center;gap:8px;padding:6px 2px}\
.ats-spin .spin{width:15px;height:15px}\
.ats-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}\
.ats-field{display:flex;flex-direction:column;gap:6px}\
.ats-field.full{grid-column:1/-1}\
.ats-field label{font-size:11.5px;color:var(--tx3)}\
.ats-field select{appearance:none;-webkit-appearance:none;width:100%;height:38px;padding:0 30px 0 11px;border-radius:10px;background:var(--bg);border:1px solid var(--line);color:var(--tx);font-size:12.5px;font-family:inherit;cursor:pointer;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239aa5bd' stroke-width='2.2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 10px center}\
.ats-field select:focus{outline:none;border-color:var(--orange)}\
.ats-more{margin-top:10px;display:none;flex-direction:column;gap:10px}\
.ats-more.show{display:flex}\
.ats-fold{display:flex;align-items:center;justify-content:space-between;cursor:pointer;user-select:none}\
.ats-fold .ats-ct{flex:1}\
.ats-chev{color:var(--tx3);transition:.2s;display:grid}\
.ats-fold.open .ats-chev{transform:rotate(180deg)}\
.ats-foldbody{display:none;margin-top:12px;flex-direction:column;gap:11px}\
.ats-fold.open+.ats-foldbody{display:flex}\
.ats-switch-row{display:flex;align-items:center;justify-content:space-between;font-size:12.5px;color:var(--tx2)}\
.ats-sw{appearance:none;width:38px;height:22px;border-radius:999px;background:rgba(255,255,255,.14);position:relative;cursor:pointer;border:0;transition:.18s;flex:none}\
.ats-sw::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.18s}\
.ats-sw.on{background:var(--orange)}\
.ats-sw.on::after{left:19px}\
.ats-chips{display:flex;flex-wrap:wrap;gap:7px}\
.ats-chip{appearance:none;border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--tx2);font-size:12px;padding:6px 11px;border-radius:999px;cursor:pointer;font-family:inherit;transition:.15s}\
.ats-chip:hover{border-color:var(--tx3);color:var(--tx)}\
.ats-chip.on{background:var(--orange-soft);border-color:rgba(251,122,34,.4);color:var(--orange)}\
.ats-seg{display:inline-flex;background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:10px;padding:3px;gap:2px}\
.ats-seg button{appearance:none;border:0;background:transparent;color:var(--tx3);font-size:12px;padding:6px 14px;border-radius:8px;cursor:pointer;font-family:inherit}\
.ats-seg button.on{background:var(--orange-soft);color:var(--orange)}\
.ats-selcount{font-size:11.5px;color:var(--tx3)}\
.ats-genbar{position:absolute;left:0;right:0;bottom:0;padding:24px 18px 18px;background:linear-gradient(to top,var(--stage) 88%,rgba(19,26,39,0))}\
.ats-free{font-size:11.5px;color:var(--tx3);margin:0 2px 12px;display:flex;align-items:center;gap:6px}\
.ats-free b{color:var(--orange);font-weight:600}\
.ats-gen{width:100%;height:46px;border:0;border-radius:13px;background:linear-gradient(180deg,#fd8a3c,#f2630d);color:#fff;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;font-family:inherit;box-shadow:0 10px 24px rgba(234,88,12,.28);transition:.16s}\
.ats-gen:hover{filter:brightness(1.05)}\
.ats-stage{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;padding:6px 22px 22px}\
.ats-stage-tabs{flex:none;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;min-height:34px}\
.ats-stage-tt{font-size:15px;font-weight:600;display:flex;align-items:center;gap:9px}\
.ats-stage-tt .cnt{font-size:12px;color:var(--tx3);font-weight:500}\
.ats-stage-ops{display:flex;gap:8px}\
.ats-obtn{appearance:none;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--tx2);font-size:12.5px;padding:7px 13px;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit;transition:.15s}\
.ats-obtn:hover{color:var(--tx);border-color:var(--tx3)}\
.ats-obtn.pri{background:var(--orange);border-color:var(--orange);color:#fff}\
.ats-obtn.pri:hover{filter:brightness(1.06)}\
.ats-obtn svg{width:15px;height:15px}\
.ats-canvas{flex:1;min-height:0;overflow-y:auto;position:relative}\
.ats-empty{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px}\
.ats-empty-art{margin-bottom:26px}\
.ats-empty h2{font-size:21px;font-weight:700;margin:0 0 10px;letter-spacing:.3px}\
.ats-empty p{font-size:13.5px;color:var(--tx2);max-width:420px;line-height:1.7;margin:0}\
.ats-errbox{margin-top:22px;display:flex;flex-direction:column;align-items:center;gap:12px;padding:15px 18px;border-radius:14px;background:rgba(251,122,34,.10);border:1px solid rgba(251,122,34,.30);max-width:440px}\
.ats-errbox div{font-size:13px;color:#ffb084;line-height:1.6}\
.ats-errbox button{appearance:none;height:38px;padding:0 26px;border-radius:10px;border:none;background:linear-gradient(135deg,#fb7a22,#f2630d);color:#fff;font-size:13.5px;font-weight:600;cursor:pointer}\
.ats-prog{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:20px;padding:20px}\
.ats-prog-ring{position:relative;width:120px;height:120px}\
.ats-prog-ring svg{transform:rotate(-90deg)}\
.ats-prog-ring .pg-txt{position:absolute;inset:0;display:grid;place-items:center;font-size:13px;color:var(--tx2)}\
.ats-prog-ring .pg-txt b{font-size:24px;color:var(--tx);font-weight:700}\
.ats-prog-msg{font-size:13.5px;color:var(--tx2);text-align:center}\
.ats-prog-note{font-size:12px;color:var(--tx3);text-align:center;max-width:380px;line-height:1.7}\
.ats-stop{appearance:none;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--tx2);padding:9px 18px;border-radius:11px;font-size:13px;cursor:pointer;font-family:inherit;display:inline-flex;gap:7px;align-items:center}\
.ats-stop:hover{color:#ff8a7a;border-color:rgba(255,120,90,.4)}\
.ats-grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:14px}\
.ats-cell{position:relative;border-radius:14px;overflow:hidden;background:rgba(255,255,255,.035);border:1px solid var(--line);aspect-ratio:1/1;transition:.18s}\
.ats-cell:hover{transform:translateY(-3px);border-color:var(--tx3);box-shadow:0 16px 34px rgba(0,0,0,.34)}\
.ats-cell img{width:100%;height:100%;object-fit:cover;display:block;cursor:zoom-in}\
.ats-cell-lab{position:absolute;left:0;right:0;bottom:0;padding:20px 10px 8px;background:linear-gradient(to top,rgba(6,9,15,.82),transparent);font-size:11.5px;color:#fff;pointer-events:none}\
.ats-cell-ops{position:absolute;top:8px;right:8px;display:flex;gap:6px;opacity:0;transition:.15s}\
.ats-cell:hover .ats-cell-ops{opacity:1}\
.ats-co{width:28px;height:28px;border-radius:8px;border:0;background:rgba(8,11,18,.7);color:#fff;display:grid;place-items:center;cursor:pointer}\
.ats-co:hover{background:var(--orange)}\
.ats-co svg{width:15px;height:15px}\
.ats-warnline{font-size:12px;color:#ffb084;background:rgba(251,122,34,.1);border:1px solid rgba(251,122,34,.25);border-radius:10px;padding:9px 12px;margin-bottom:12px}\
.ats-lb{position:fixed;inset:0;z-index:520;display:none;align-items:center;justify-content:center;background:rgba(6,9,15,.86);backdrop-filter:blur(6px)}\
.ats-lb.show{display:flex}\
.ats-lb img{max-width:90vw;max-height:88vh;border-radius:14px;box-shadow:0 30px 90px rgba(0,0,0,.6)}\
.ats-lb-x{position:absolute;top:22px;right:26px;width:42px;height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;font-size:20px;cursor:pointer}\
.ats-lb-x:hover{background:var(--orange);border-color:var(--orange)}\
.ats-srcmenu{position:fixed;z-index:510;min-width:178px;background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:6px;box-shadow:0 20px 50px rgba(0,0,0,.45);display:none}\
.ats-srcmenu.show{display:block}\
.ats-srcmenu button{width:100%;appearance:none;border:0;background:transparent;color:var(--tx2);font-size:13px;padding:9px 10px;border-radius:9px;cursor:pointer;display:flex;align-items:center;gap:10px;font-family:inherit;text-align:left}\
.ats-srcmenu button:hover{background:rgba(255,255,255,.06);color:var(--tx)}\
.ats-srcmenu button svg{width:17px;height:17px;flex:none}\
@media(max-width:880px){\
 .ats-body{flex-direction:column}\
 .ats-rail{width:100%;flex-direction:row;overflow-x:auto;padding:8px 12px;gap:8px}\
 .ats-nav{padding:8px 12px;min-width:74px}\
 .ats-panel{width:100%;max-height:46%;order:2}\
 .ats-stage{order:1;padding:10px 14px}\
 .ats-top{padding:0 14px}\
}\
";
 var styleEl=document.createElement('style');styleEl.id='atuStudioStyle';styleEl.textContent=CSS;
 document.head.appendChild(styleEl);

 var I={
  bag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
  hanger:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7a2 2 0 1 0-2-2"/><path d="M4 16l8-5 8 5"/><path d="M4 19h16"/></svg>',
  layers:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  spark:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4L12 3Z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  back:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l.01 0"/><path d="M18 18H8"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0-4-4m4 4 4-4"/><path d="M5 20h14"/></svg>',
  redo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 6.7"/><path d="M20 17v-6h-6"/></svg>',
  stop:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>',
  folder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1.5-1.5"/></svg>',
  pen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
 };
 var SPIN='<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>';

 var SUITE_TYPES={
  ecom:[['white','白底主图'],['search','搜索主图'],['core','核心卖点图'],['sell','卖点图'],['icon','图标卖点图'],['material','材质图'],['scene','场景展示图'],['model','模特展示图'],['multi','多场景拼图'],['size','尺寸/容量图'],['compare','竞品对比图'],['use','使用对比图']],
  detail:[['hero','首屏主视觉'],['core2','核心卖点'],['detail','产品细节'],['mood','场景氛围'],['scene2','场景展示'],['multi2','多场景拼图'],['angle','多角度图'],['compare2','竞品对比'],['use2','使用对比'],['series','系列展示'],['spec','规格信息'],['guide','使用建议'],['acc','配件/赠品'],['after','售后保障'],['mood2','氛围渲染']],
  fashion:[['fmodel','模特图'],['fseed','种草图'],['fdetail','细节图'],['fwhite','白底图'],['fsell','卖点图'],['ficon','图标卖点'],['ffabric','面料质感'],['fangle','多角度'],['fsearch','搜索主图'],['fscene','多场景图'],['fseries','系列展示'],['fsize','尺码图']]
 };
 var STYLE_TAGS=['简约高级','清新自然','科技质感','温馨居家','国潮国风','轻奢质感','活泼明快','极简留白'];

 var LOGO_FULL='<svg viewBox="0 0 118 19.13" aria-label="WorkHogee"><defs><style>.wb1{fill:#ffffff}.wb2{fill:#ea580c}</style></defs><g transform="translate(-1.06 -28.16)"><path class="wb1" d="M13,32.58,9.81,42.11a1.34,1.34,0,0,1-1.33,1.12h-2a1.35,1.35,0,0,1-1.29-.94L1.13,30a1.36,1.36,0,0,1,1.29-1.78h2a1.35,1.35,0,0,1,1.29.94l2.15,6.58L9.09,32a1.13,1.13,0,0,1,1.07-.74l1.68,0A1.06,1.06,0,0,1,13,32.58Z"/><path class="wb2" d="M12.88,43.23h2a1.38,1.38,0,0,0,1.3-.94l4-12.35a1.36,1.36,0,0,0-1.29-1.78h-2a1.35,1.35,0,0,0-1.3.93l-4,12.35A1.36,1.36,0,0,0,12.88,43.23Z"/><path class="wb1" d="M19.12,37.64a5.39,5.39,0,0,1,5.62-5.58,5.4,5.4,0,0,1,5.64,5.58,5.41,5.41,0,0,1-5.64,5.6A5.4,5.4,0,0,1,19.12,37.64Zm8.35,0a2.74,2.74,0,1,0-5.44,0c0,1.67,1,3.11,2.71,3.11A2.82,2.82,0,0,0,27.47,37.64Z"/><path class="wb1" d="M33.75,32.32a.43,.43,0,0,1,.43.43h0a.43,.43,0,0,0,.69,.34,4.61,4.61,0,0,1,2.26-1,.4,.4,0,0,1,.45.4v1.82a.4,.4,0,0,1-.4.4h-.37a3.68,3.68,0,0,0-2.55,1.1.43,.43,0,0,0-.08.24c0,1,0,6.9,0,6.9h-2.4a.4,.4,0,0,1-.4-.4V32.73a.4,.4,0,0,1,.4-.41Z"/><path class="wb1" d="M42.25,39.39l-.64,.68a.58,.58,0,0,0-.15.39V42.4a.57,.57,0,0,1-.57.57H39.23a.56,.56,0,0,1-.57-.57V28.84a.56,.56,0,0,1,.57-.57h1.66a.57,.57,0,0,1,.57,.57v6.68a.57,.57,0,0,0,1,.37l2.86-3.37a.6,.4,0,0,1,.43-.2h1.93a.57,.57,0,0,1,.43,1L45,36.81a.57,.57,0,0,0,0,.71l3.39,4.54a.57,.57,0,0,1-.45.91H45.86a.56,.56,0,0,1-.47-.24l-2.25-3.28A.57,.57,0,0,0,42.25,39.39Z"/><text x="53" y="42.3" font-family="Trebuchet MS,Trebuchet,Lucida Sans Unicode,sans-serif" font-size="18" font-weight="400" fill="#ffffff">Hogee</text></g></svg>';

 var EMPTY_ART='<svg width="232" height="158" viewBox="0 0 232 158" fill="none"><g opacity=".9"><rect x="14" y="30" width="92" height="92" rx="16" fill="rgba(255,255,255,.045)" stroke="rgba(255,255,255,.18)" stroke-dasharray="5 5"/><circle cx="42" cy="58" r="8" fill="rgba(251,122,34,.55)"/><path d="M28 102l22-20 16 14 14-12 20 18" stroke="rgba(255,255,255,.4)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g><path d="M118 70h22" stroke="#fb7a22" stroke-width="2.4" stroke-linecap="round"/><path d="M132 64l8 6-8 6" stroke="#fb7a22" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><g><rect x="150" y="18" width="68" height="52" rx="11" fill="rgba(251,122,34,.16)" stroke="rgba(251,122,34,.5)"/><rect x="158" y="66" width="68" height="52" rx="11" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.2)"/><rect x="120" y="86" width="68" height="52" rx="11" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.16)"/></g></svg>';

 function el(html){var d=document.createElement('div');d.innerHTML=html;return d.firstChild;}
 var root=el('<div id="atuStudio"></div>');
 root.innerHTML=
  '<div class="ats-top"><div class="ats-tl"><a class="ats-logo" href="/" aria-label="WorkHogee">'+LOGO_FULL+'</a><span class="ats-crumb">阿图 · <b>商品图操作台</b></span></div><div class="ats-tr"><span class="ats-pill">'+I.spark+'Alpha 内测 · 出图不限</span><button class="ats-back" id="atsBack" type="button" title="返回工作台">'+I.back+'</button></div></div>'+
  '<div class="ats-body">'+
   '<div class="ats-rail"><button class="ats-nav on" data-suite="ecom" type="button">'+I.bag+'<span>电商套图</span></button><button class="ats-nav" data-suite="fashion" type="button">'+I.hanger+'<span>服装套图</span></button><button class="ats-nav" data-suite="batch" type="button">'+I.layers+'<span>批量套图</span></button><button class="ats-nav" data-suite="records" type="button">'+I.clock+'<span>生成记录</span></button></div>'+
   '<div class="ats-panel"><div class="ats-scroll" id="atsScroll">'+
     '<div class="ats-card"><div class="ats-ch"><div class="ats-ct">商品原图</div><button class="ats-cs mut" id="atsClear" type="button">清空</button></div><div class="ats-thumbs" id="atsThumbs"></div><div class="ats-hint">同一商品可传多角度（最多 5 张），系统按一套处理；不同商品请分别创建，便于成套出图。</div></div>'+
     '<div class="ats-card"><div class="ats-ch"><div class="ats-ct">商品卖点</div><button class="ats-cs" id="atsAiWrite" type="button">'+I.spark+'AI 帮写</button></div><div id="atsSellingWrap"><textarea class="ats-ta" id="atsSelling" maxlength="2000" placeholder="商品名称、核心卖点、适用人群、使用场景、规格参数都可以写在这里；没准备好就点「AI 帮写」，伙计看图先给你一版。"></textarea></div></div>'+
     '<div class="ats-card"><div class="ats-ch"><div class="ats-ct">生成设置</div><button class="ats-cs mut" id="atsMoreBtn" type="button">更多设置</button></div><div class="ats-grid">'+
       '<div class="ats-field"><label>电商平台</label><select id="setPlatform"><option>通用（全平台适配）</option><option>亚马逊 Amazon</option><option>淘宝/天猫</option><option>京东</option><option>抖音商城</option><option>小红书</option><option>速卖通 AliExpress</option><option>Shopee</option><option>TikTok Shop</option></select></div>'+
       '<div class="ats-field"><label>销售站点 / 区域</label><select id="setRegion"><option>通用</option><option>国内</option><option>北美</option><option>欧洲</option><option>东南亚</option><option>日韩</option></select></div>'+
       '<div class="ats-field"><label>文案语种</label><select id="setLang"><option>跟随站点</option><option>简体中文</option><option>English</option><option>日本語</option><option>한국어</option></select></div>'+
       '<div class="ats-field"><label>清晰度</label><select id="setQ"><option>高清</option><option>标准</option><option>超清</option></select></div>'+
       '<div class="ats-field full"><label>出图模型</label><select id="setModel"><option>智能推荐（按品类自动匹配）</option><option>即梦图片 4.5</option><option>即梦图片 4.0</option><option>改图模型 3.0</option><option>改图模型 2.5</option></select></div></div>'+
       '<div class="ats-more" id="atsMore"><div class="ats-field"><label>图片比例</label><select><option>智能适配图种</option><option>1:1</option><option>3:4</option><option>16:9</option></select></div><div class="ats-field"><label>文件格式</label><select><option>JPG</option><option>PNG（透明底）</option><option>WebP</option></select></div></div></div>'+
     '<div class="ats-card"><div class="ats-fold" id="foldPlan"><div class="ats-ct">智能视觉方案 <span style="font-size:11.5px;color:var(--tx3);font-weight:400">（可选）</span></div><span class="ats-chev"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></span></div><div class="ats-foldbody"><div class="ats-switch-row"><span>智能风格推荐（关闭则由 AI 自动匹配）</span><button class="ats-sw" id="swStyle" type="button"></button></div><div class="ats-chips" id="styleChips" style="display:none">'+STYLE_TAGS.map(function(t,i){return '<button class="ats-chip" data-style="'+i+'" type="button">'+t+'</button>';}).join('')+'</div></div></div>'+
     '<div class="ats-card"><div class="ats-fold open" id="foldSuite"><div class="ats-ct">套图选择 <span class="ats-selcount" id="selCount"></span></div><span class="ats-chev"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></span></div><div class="ats-foldbody" style="display:flex"><div style="display:flex;align-items:center;justify-content:space-between"><div class="ats-seg" id="suiteSeg"><button class="on" data-seg="main" type="button">套图</button><button data-seg="detail" id="segDetail" type="button">详情 / A+</button></div><button class="ats-cs" id="aiSelect" type="button">AI 帮选</button></div><div class="ats-chips" id="suiteChips"></div></div></div>'+
   '</div><div class="ats-genbar"><div class="ats-free">内测剩余额度：<b>不限</b>（正式版按张计费，失败不扣费）</div><button class="ats-gen" id="atsGen" type="button">开始生成</button></div></div>'+
   '<div class="ats-stage"><div class="ats-stage-tabs" id="stageTabs" style="display:none"><div class="ats-stage-tt">交付成品 <span class="cnt" id="stageCnt"></span></div><div class="ats-stage-ops"><button class="ats-obtn" id="dlAll" type="button">'+I.download+'全部下载</button><button class="ats-obtn pri" id="toAwen" type="button">'+I.pen+'交给阿文写文案</button></div></div><div class="ats-canvas" id="atsCanvas"></div></div>'+
  '</div><div class="ats-lb" id="atsLb"><button class="ats-lb-x" id="atsLbX" type="button">×</button><img id="atsLbImg" alt="成品大图"></div>'+
  '<div class="ats-srcmenu" id="atsSrcMenu"></div>';
 document.body.appendChild(root);

 var S={root:root,suite:'ecom',seg:'main',ats:[],_running:false,_abort:false,
  $:function(sel){return root.querySelector(sel);},
  isOpen:function(){return document.body.classList.contains('atu-open');},
  open:function(){
   document.body.classList.add('atu-open');
   try{if(typeof exitTaskFocus==='function')exitTaskFocus();}catch(e){}
   this._lastErr=null;this.renderOrigin();this.renderSuiteChips();this.updateSelCount();this.setCanvas('empty');
  },
  close:function(){
   if(this._running){if(!confirm('伙计正在出图，确定离开吗？已生成的成品会保留。'))return;}
   this._abort=true;this._running=false;
   document.body.classList.remove('atu-open');
   try{if(typeof goHome==='function')goHome();}catch(e){}
  },
  renderOrigin:function(){
   var box=this.$('#atsThumbs');if(!box)return;var imgs=(GS()&&GS().images)||[];
   box.innerHTML=imgs.map(function(it,i){return '<div class="ats-thumb"><img src="'+it.dataUrl+'" alt=""><button class="ats-td" data-del="'+i+'" type="button">×</button></div>';}).join('')+'<button class="ats-add" id="atsAdd" type="button">'+I.plus+'</button>';
   var self=this,add=box.querySelector('#atsAdd');
   if(add)add.addEventListener('click',function(){self.openSrcMenu(add);});
   box.querySelectorAll('.ats-td').forEach(function(b){b.addEventListener('click',function(){GS().images.splice(+b.dataset.del,1);self.renderOrigin();});});
  },
  openSrcMenu:function(anchor){
   var self=this,menu=this.$('#atsSrcMenu');
   menu.innerHTML='<button data-src="local" type="button">'+I.folder+'从本地上传</button><button data-src="kb" type="button">'+I.bag+'从知识库选择</button><button data-src="url" type="button">'+I.link+'通过图片链接</button>';
   menu.classList.add('show');var r=anchor.getBoundingClientRect();
   menu.style.left=Math.min(r.left,window.innerWidth-190)+'px';menu.style.top=(r.bottom+6)+'px';
   function hide(){menu.classList.remove('show');document.removeEventListener('click',hide);}
   setTimeout(function(){document.addEventListener('click',hide);},0);
   menu.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){
    var k=b.dataset.src;menu.classList.remove('show');
    if(k==='local'){var fi=document.getElementById('fileInput');if(fi)fi.click();}
    else if(k==='kb'&&typeof openKbPicker==='function')openKbPicker();
    else if(k==='url'&&typeof openUrlImport==='function')openUrlImport();
   });});
  },
  renderSuiteChips:function(){
   var box=this.$('#suiteChips');if(!box)return;var list;
   if(this.suite==='fashion')list=SUITE_TYPES.fashion;
   else list=(this.seg==='detail')?SUITE_TYPES.detail:SUITE_TYPES.ecom;
   var self=this;
   box.innerHTML=list.map(function(p){
    var on=(self.suite==='fashion')?['fmodel','fdetail','fwhite','fangle'].indexOf(p[0])>=0:(self.seg==='detail'?['hero','detail','mood','spec'].indexOf(p[0])>=0:['white','core','scene','material'].indexOf(p[0])>=0);
    return '<button class="ats-chip'+(on?' on':'')+'" data-type="'+p[0]+'" type="button">'+p[1]+'</button>';
   }).join('');
   box.querySelectorAll('.ats-chip').forEach(function(c){c.addEventListener('click',function(){c.classList.toggle('on');self.updateSelCount();});});
   var sd=this.$('#segDetail');if(sd)sd.style.display=(this.suite==='fashion')?'none':'';
   this.updateSelCount();
  },
  updateSelCount:function(){
   var n=this.$('#suiteChips')?this.$('#suiteChips').querySelectorAll('.ats-chip.on').length:0;
   var c=this.$('#selCount');if(c)c.textContent='已选 '+n+' 个图种';
  },
  setSuite:function(s){
   if(s==='batch'){toast('批量套图即将上线，本期可逐商品创建');s='ecom';}
   if(s==='records'){toast('生成记录在左侧「我的创作」里，可按创作主线查看');s='ecom';}
   this.suite=s;
   root.querySelectorAll('.ats-nav').forEach(function(n){n.classList.toggle('on',n.dataset.suite===s);});
   this.renderSuiteChips();
  },
  autoSelling:function(){
   if(!GS().images||!GS().images.length)return;var wrap=this.$('#atsSellingWrap');if(!wrap)return;
   wrap.innerHTML='<div class="ats-spin">'+SPIN+'正在看图，先帮你拟一版商品卖点…</div>';
   var self=this;
   (async function(){
    var img0=GS().images[0].dataUrl,name='',cat='';
    try{var f=await callIdentify(img0);if(f){
     var built=(typeof productFromFields==='function')?productFromFields(f):null;
     if(built&&built.product){name=built.product.name||'';GS().product=built.product;}
     if(built&&built.identity){cat=built.identity.cat||'';GS().identity=built.identity;}
     if(!name)name=f.name||f.product||f.title||f.category||'';
     if(!cat)cat=f.category||f.cat||name;
    }}catch(e){}
    if(cat&&/(服装|衣|裤|裙|鞋|帽|袜|包|fashion|apparel|cloth|wear|dress|shirt|shoe|bag)/i.test(cat+name))self.setSuite('fashion');
    var j=await authPost('/copy',{product:name||'这款商品',identityType:(GS().identity&&GS().identity.type)||'general',category:cat,channels:['general'],tone:'请提炼这款商品的核心卖点，分条、专业、有吸引力，包含商品名称、核心卖点、适用人群、使用场景和规格参数'});
    wrap.innerHTML='<textarea class="ats-ta" id="atsSelling" maxlength="2000" placeholder="商品名称、核心卖点、适用人群、使用场景、规格参数…"></textarea>';
    var ta=wrap.querySelector('#atsSelling');
    if(j&&j.ok&&j.copy&&j.copy.channels&&j.copy.channels.general)ta.value=j.copy.channels.general;
    ta.addEventListener('input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,260)+'px';});
   })();
  },
  aiWrite:function(){
   var wrap=this.$('#atsSellingWrap');wrap.innerHTML='<div class="ats-spin">'+SPIN+'正在帮写中…</div>';
   (async function(){
    var name=(GS().product&&GS().product.name)||'',cat=(GS().identity&&GS().identity.cat)||'';
    var j=await authPost('/copy',{product:name||'这款商品',category:cat,channels:['general'],tone:'请写出一版结构清晰、卖点突出、适合电商使用的商品卖点文案，分条呈现，包含名称、核心卖点、适用人群、场景、规格'});
    wrap.innerHTML='<textarea class="ats-ta" id="atsSelling" maxlength="2000"></textarea>';
    var ta=wrap.querySelector('#atsSelling');
    if(j&&j.ok&&j.copy&&j.copy.channels&&j.copy.channels.general)ta.value=j.copy.channels.general;
    ta.focus();
    ta.addEventListener('input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,260)+'px';});
   })();
  },
  setCanvas:function(mode){
   var c=this.$('#atsCanvas'),tabs=this.$('#stageTabs');
   if(mode==='empty'){tabs.style.display='none';var eb=this._lastErr?'<div class="ats-errbox"><div>'+this._lastErr+'</div><button id="atsRetryGen" type="button">重新生成</button></div>':'';c.innerHTML='<div class="ats-empty"><div class="ats-empty-art">'+EMPTY_ART+'</div><h2>一键生成爆款商品套图</h2><p>上传商品原图，伙计智能适配全平台尺寸规范，批量产出白底主图、卖点图、场景图、详情页，整套专业电商图一次配齐。</p>'+eb+'</div>';var rb=c.querySelector('#atsRetryGen');if(rb){var self2=this;rb.addEventListener('click',function(){self2._lastErr=null;self2.generate();});}}
   else if(mode==='progress'){tabs.style.display='none';c.innerHTML='<div class="ats-prog"><div class="ats-prog-ring"><svg width="120" height="120"><circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/><circle id="progRing" cx="60" cy="60" r="52" fill="none" stroke="#fb7a22" stroke-width="8" stroke-linecap="round" stroke-dasharray="326.7" stroke-dashoffset="326.7"/></svg><div class="pg-txt"><div><b id="progPct">0</b>%</div></div></div><div class="ats-prog-msg" id="progMsg">正在准备…</div><div class="ats-prog-note">商品原像素 100% 保留，只做抠图、局部放大和画质增强；每处理好一张就先放出来。</div><button class="ats-stop" id="progStop" type="button">'+I.stop+'终止任务</button></div>';
    var self=this;c.querySelector('#progStop').addEventListener('click',function(){self._abort=true;});
   }else if(mode==='result'){tabs.style.display='flex';this.$('#stageCnt').textContent=this.ats.length+' 张';this.renderResults();}
  },
  updateProgress:function(i,total,msg){
   var pct=Math.round((i/total)*100),ring=this.$('#progRing'),p=this.$('#progPct'),m=this.$('#progMsg');
   if(ring)ring.style.strokeDashoffset=String(326.7*(1-pct/100));
   if(p)p.textContent=pct;if(m)m.textContent=msg;
  },
  addNote:function(t){this._notes=this._notes||[];this._notes.push(t);},
  addResult:function(url,label){
   var r={url:url,label:label,ts:Date.now()};this.ats.push(r);
   try{if(typeof persistResult==='function')persistResult({url:url,k:'atu',label:label,ts:Date.now()},label);}catch(e){}
   if(!GS().results)GS().results=[];GS().results.push({url:url,k:'atu',label:label,ts:Date.now()});
  },
  renderResults:function(){
   var c=this.$('#atsCanvas');if(!c)return;
   var notesHtml=(this._notes||[]).map(function(n){return '<div class="ats-warnline">'+n+'</div>';}).join('');
   c.innerHTML=notesHtml+'<div class="ats-grid2">'+this.ats.map(function(r,i){return '<div class="ats-cell"><img src="'+r.url+'" data-zoom="'+i+'" alt=""><div class="ats-cell-lab">'+(r.label||'')+'</div><div class="ats-cell-ops"><button class="ats-co" data-redo="'+i+'" title="重新生成" type="button">'+I.redo+'</button><button class="ats-co" data-dl="'+i+'" title="下载" type="button">'+I.download+'</button></div></div>';}).join('')+'</div>';
   var self=this;
   c.querySelectorAll('[data-zoom]').forEach(function(im){im.addEventListener('click',function(){self.openLb(self.ats[+im.dataset.zoom].url);});});
   c.querySelectorAll('[data-dl]').forEach(function(b){b.addEventListener('click',function(){self.download(self.ats[+b.dataset.dl]);});});
   c.querySelectorAll('[data-redo]').forEach(function(b){b.addEventListener('click',function(){self.redo(+b.dataset.redo);});});
  },
  openLb:function(url){this.$('#atsLbImg').src=url;this.$('#atsLb').classList.add('show');},
  closeLb:function(){this.$('#atsLb').classList.remove('show');},
  download:function(r){var a=document.createElement('a');a.href=r.url;a.download='WorkHogee_'+(r.label||'成品')+'.jpg';document.body.appendChild(a);a.click();a.remove();},
  downloadAll:function(){var self=this;this.ats.forEach(function(r,i){setTimeout(function(){self.download(r);},i*350);});},
  redo:function(i){
   toast('已为该图重新提交…');var self=this;
   (async function(){
    var idx=Math.min(i,GS().images.length-1),cat=(GS().identity&&GS().identity.cat)||'',pn=(GS().product&&GS().product.name)||'这款商品';
    var out=await GF().package({call:retryCall,image:GS().images[idx].dataUrl,category:cat,product:pn});
    if(out&&out.ok){if(out.white)self.ats[i]={url:out.white,label:'白底主图（重做）',ts:Date.now()};self.renderResults();toast('重做完成');}
    else toast('重做失败，稍后再试','err');
   })();
  },
  generate:function(){
   if(!GS().images||!GS().images.length){toast('先上传商品原图','err');return;}
   if(this._running)return;
   this._running=true;this._abort=false;this.ats=[];this._notes=[];this._lastErr=null;this.setCanvas('progress');
   var self=this,total=GS().images.length;
   (async function(){
    var cat=(GS().identity&&GS().identity.cat)||'',pn=(GS().product&&GS().product.name)||'这款商品';
    for(var i=0;i<total;i++){
     if(self._abort)break;
     self.updateProgress(i,total,'正在处理第 '+(i+1)+' / '+total+' 张：抠图保真…');
     var out=null;try{out=await GF().package({call:retryCall,image:GS().images[i].dataUrl,category:cat,product:pn});}catch(e){out=null;}
     if(self._abort)break;
     if(out&&out.rejected){self.addNote('第'+(i+1)+' 张未达保真标准（细结构/背景），建议找纯色墙重拍后再出。');continue;}
     if(!out||!out.ok){self.addNote('第'+(i+1)+' 张处理失败，可点该图重做。');continue;}
     if(out.white)self.addResult(out.white,'白底主图');
     if(out.cabin)self.addResult(out.cabin,'座舱增强');
     (out.details||[]).forEach(function(d){self.addResult(d.image,d.label);});
     if(out.sceneEnhanced)self.addResult(out.sceneEnhanced,'场景展示图');
     self.$('#stageTabs').style.display='flex';self.$('#stageCnt').textContent=self.ats.length+' 张';self.renderResults();
     self.updateProgress(i+1,total,'第 '+(i+1)+' 张完成，继续下一张…');
    }
    self._running=false;
    if(!self.ats.length){self._lastErr=(self._notes&&self._notes[self._notes.length-1])||'生成失败，可能是网络波动，伙计已保留你的原图，点重新生成再试。';self.setCanvas('empty');toast('没有成功生成的成品','err');}
    else{self._lastErr=null;self.setCanvas('result');toast('出图完成，共 '+self.ats.length+' 张');}
   })();
  },
  handToAwen:function(){
   if(typeof window.atuToAwen==='function'){window.atuToAwen(this.ats);return;}
   toast('阿文操作台即将上线，成品已保存到「我的创作」');
  }
 };
 window.AtuStudio=S;

 root.querySelectorAll('.ats-nav').forEach(function(n){n.addEventListener('click',function(){S.setSuite(n.dataset.suite);});});
 S.$('#atsBack').addEventListener('click',function(){S.close();});
 S.$('#atsClear').addEventListener('click',function(){if(GS().images&&GS().images.length){if(confirm('清空全部已传原图？')){GS().images=[];S.renderOrigin();}}});
 S.$('#atsAiWrite').addEventListener('click',function(){S.aiWrite();});
 S.$('#atsMoreBtn').addEventListener('click',function(){var m=S.$('#atsMore'),b=S.$('#atsMoreBtn');m.classList.toggle('show');b.textContent=m.classList.contains('show')?'收起':'更多设置';});
 S.$('#swStyle').addEventListener('click',function(){this.classList.toggle('on');S.$('#styleChips').style.display=this.classList.contains('on')?'flex':'none';});
 S.$('#foldPlan').addEventListener('click',function(){this.classList.toggle('open');});
 S.$('#foldSuite').addEventListener('click',function(){this.classList.toggle('open');});
 S.$('#suiteSeg').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;S.seg=b.dataset.seg;this.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b);});S.renderSuiteChips();});
 S.$('#aiSelect').addEventListener('click',function(){var box=S.$('#suiteChips');box.querySelectorAll('.ats-chip').forEach(function(c,i){c.classList.toggle('on',i<5);});S.updateSelCount();toast('已帮你选 5 个常用图种');});
 S.$('#atsGen').addEventListener('click',function(){S.generate();});
 S.$('#dlAll').addEventListener('click',function(){S.downloadAll();});
 S.$('#toAwen').addEventListener('click',function(){S.handToAwen();});
 S.$('#atsLbX').addEventListener('click',function(){S.closeLb();});
 S.$('#atsLb').addEventListener('click',function(e){if(e.target.id==='atsLb')S.closeLb();});
 document.addEventListener('keydown',function(e){if(e.key==='Escape'&&S.isOpen())S.closeLb();});
})();
