/* =====================================================================
 * 阿图操作台 AtuStudio —— 对标佐糖 listing-image-generator 的电商套图操作台。
 * 配色沿用 WorkHogee 深色品牌主题。自包含模块（CSS 注入 + 全屏容器 + 逻辑）。
 *
 * 改造（轨道B · 营销视觉生成）：
 *   1. 平台/站点/语种下拉接冻结 API 契约 §2 枚举，language=auto 时按 locale 推导。
 *   2. 上传图后 /「AI 帮写」调 POST /marketing/plan：回填卖点、按 recommended_types
 *      勾选图种、逐图种 on_screen_text 预览与编辑。
 *   3. generate() 重排：白底/搜索主图走轨道A（HogeeFidelity 保真），A级被拒即提示
 *      重拍、不硬生成；其余图种逐张调 POST /marketing/generate，处理完一张即展示，
 *      支持单张重做 / 暂停 / 终止 / 整体进度，失败张可单张重做、不计成功。
 *
 * 可复用：仅通过 AtuBridge 暴露的 authPost / HogeeFidelity / state / $ / toast 调用后端，
 * 不依赖浏览器专有 API。进入 AtuStudio.open()；退出 AtuStudio.close()。
 * 阿文接口 window.atuToAwen 仅预留不实现。
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
 function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

 /* === 冻结契约枚举（API-CONTRACT §2） === */
 var LOCALE_LANG={US:'en',EU:'en',SEA:'en',JP:'ja',KR:'ko',CN:'zh-CN',generic:'en'};
 var PLATFORM_REGION={generic:'generic',amazon:'US',taobao:'CN',jd:'CN',douyin:'CN',xiaohongshu:'CN',aliexpress:'EU',shopee:'SEA',tiktokshop:'US'};
 /* 图种 → 默认比例 → 尺寸（契约 §0/§1）；plan 返回 size 时优先用 plan 的 */
 var TYPE_RATIO={white_main:'1:1',search_main:'1:1',core_selling:'4:3',selling_point:'16:9',icon_selling:'1:1',material:'1:1',scene_show:'16:9',multi_scene:'16:9',competitor_compare:'4:3',usage_compare:'4:3',size_chart:'1:1',product_detail:'1:1',
   hero:'4:3',scene_atmosphere:'16:9',multi_angle:'1:1',series:'1:1',ingredients:'1:1',usage_guide:'1:1',accessories:'1:1',after_sales:'1:1',mood:'16:9',
   f_model:'3:4',f_white:'1:1',f_search:'1:1',f_selling:'4:3',f_icon:'1:1',f_detail:'1:1',f_fabric:'1:1',f_angle:'1:1',f_seeding:'3:4',f_scene:'16:9',f_series:'1:1',f_size:'1:1'};
 var RATIO_SIZE={'1:1':'1920x1920','4:3':'2240x1680','16:9':'2560x1440','3:4':'1680x2240'};

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
.ats-selcount{font-size:11.5px;color:var(--tx3);font-weight:400}\
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
.ats-tgroup{margin-bottom:18px}\
.ats-tgroupt{font-size:12.5px;font-weight:600;color:var(--tx2);margin:0 0 9px;display:flex;align-items:center;gap:8px}\
.ats-tgroupt span{font-size:11px;color:var(--tx3);font-weight:400}\
.ats-livebar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;padding:9px 13px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--line)}\
.ats-livebar-l{font-size:12.5px;color:var(--tx2);display:flex;align-items:center;gap:8px}\
.ats-livebar-l b{color:var(--orange);font-size:13px}\
.ats-livebar-r{display:flex;gap:7px}\
.ats-livebar-track{height:4px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin:-6px 0 16px}\
.ats-livebar-track>div{height:100%;background:linear-gradient(90deg,#fd8a3c,#f2630d);transition:width .3s}\
.ats-ost{display:flex;flex-direction:column;gap:7px;padding:9px 10px;border-radius:11px;background:rgba(0,0,0,.22);border:1px solid var(--line)}\
.ats-ost-h{font-size:12px;font-weight:600;color:var(--tx);display:flex;justify-content:space-between;align-items:center}\
.ats-ost-h span{font-size:10.5px;color:var(--tx3);font-weight:400}\
.ats-ost-inp{width:100%;height:32px;border-radius:8px;background:var(--bg);border:1px solid var(--line);color:var(--tx);padding:0 10px;font-size:12px;font-family:inherit}\
.ats-ost-inp:focus{outline:none;border-color:var(--orange)}\
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
  pause:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  folder:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg>',
  link:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1.5-1.5"/></svg>',
  pen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
 };
 var SPIN='<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>';

 /* === 图种 ID 与冻结契约 §0 对齐（不再使用旧短码） === */
 var SUITE_TYPES={
  ecom:[['white_main','白底主图'],['search_main','搜索主图'],['core_selling','核心卖点图'],['selling_point','卖点图'],['icon_selling','图标卖点图'],['material','材质图'],['scene_show','场景展示图'],['multi_scene','多场景拼图'],['competitor_compare','竞品对比图'],['usage_compare','使用对比图'],['size_chart','尺寸/容量图'],['product_detail','产品细节图']],
  detail:[['hero','首屏主视觉'],['product_detail','产品细节图'],['scene_atmosphere','场景氛围图'],['multi_angle','多角度图'],['series','系列展示图'],['ingredients','商品成分图'],['usage_guide','使用建议图'],['accessories','配件/赠品图'],['after_sales','售后保障图'],['mood','氛围渲染图']],
  fashion:[['f_model','模特图'],['f_white','白底图'],['f_search','搜索主图'],['f_selling','卖点图'],['f_icon','图标卖点图'],['f_detail','细节图'],['f_fabric','面料质感图'],['f_angle','多角度视图'],['f_seeding','种草图'],['f_scene','多场景图'],['f_series','系列展示图'],['f_size','尺码图']]
 };
 var TYPE_LABELS={};
 SUITE_TYPES.ecom.concat(SUITE_TYPES.detail,SUITE_TYPES.fashion).forEach(function(p){TYPE_LABELS[p[0]]=p[1];});
 var ALL_TYPE_ORDER=SUITE_TYPES.ecom.map(function(p){return p[0];}).concat(SUITE_TYPES.fashion.map(function(p){return p[0];}));
 var STYLE_TAGS=['简约高级','清新自然','科技质感','温馨居家','国潮国风','轻奢质感','活泼明快','极简留白'];

 var LOGO_FULL='<svg viewBox="0 0 118 19.13" aria-label="WorkHogee"><defs><style>.wb1{fill:#ffffff}.wb2{fill:#ea580c}</style></defs><g transform="translate(-1.06 -28.16)"><path class="wb1" d="M13,32.58,9.81,42.11a1.34,1.34,0,0,1-1.33,1.12h-2a1.35,1.35,0,0,1-1.29-.94L1.13,30a1.36,1.36,0,0,1,1.29-1.78h2a1.35,1.35,0,0,1,1.29.94l2.15,6.58L9.09,32a1.13,1.13,0,0,1,1.07-.74l1.68,0A1.06,1.06,0,0,1,13,32.58Z"/><path class="wb2" d="M12.88,43.23h2a1.38,1.38,0,0,0,1.3-.94l4-12.35a1.36,1.36,0,0,0-1.29-1.78h-2a1.35,1.35,0,0,0-1.3.93l-4,12.35A1.36,1.36,0,0,0,12.88,43.23Z"/><path class="wb1" d="M19.12,37.64a5.39,5.39,0,0,1,5.62-5.58,5.4,5.4,0,0,1,5.64,5.58,5.41,5.41,0,0,1-5.64,5.6A5.4,5.4,0,0,1,19.12,37.64Zm8.35,0a2.74,2.74,0,1,0-5.44,0c0,1.67,1,3.11,2.71,3.11A2.82,2.82,0,0,0,27.47,37.64Z"/><path class="wb1" d="M33.75,32.32a.43,.43,0,0,1,.43.43h0a.43,.43,0,0,0,.69.34,4.61,4.61,0,0,1,2.26-1,.4,.4,0,0,1,.45.4v1.82a.4,.4,0,0,1-.4.4h-.37a3.68,3.68,0,0,0-2.55,1.1.43,.43,0,0,0-.08.24c0,1,0,6.9,0,6.9h-2.4a.4,.4,0,0,1-.4-.4V32.73a.4,.4,0,0,1,.4-.41Z"/><path class="wb1" d="M42.25,39.39l-.64,.68a.58,.58,0,0,0-.15.39V42.4a.57,.57,0,0,1-.57.57H39.23a.56,.56,0,0,1-.57-.57V28.84a.56,.56,0,0,1,.57-.57h1.66a.57,.57,0,0,1,.57,.57v6.68a.57,.57,0,0,0,1,.37l2.86-3.37a.6,.4,0,0,1,.43-.2h1.93a.57,.57,0,0,1,.43,1L45,36.81a.57,.57,0,0,0,0,.71l3.39,4.54a.57,.57,0,0,1-.45.91H45.86a.56,.56,0,0,1-.47-.24l-2.25-3.28A.57,.57,0,0,0,42.25,39.39Z"/><text x="53" y="42.3" font-family="Trebuchet MS,Trebuchet,Lucida Sans Unicode,sans-serif" font-size="18" font-weight="400" fill="#ffffff">Hogee</text></g></svg>';

 var EMPTY_ART='<svg width="232" height="158" viewBox="0 0 232 158" fill="none"><g opacity=".9"><rect x="14" y="30" width="92" height="92" rx="16" fill="rgba(255,255,255,.045)" stroke="rgba(255,255,255,.18)" stroke-dasharray="5 5"/><circle cx="42" cy="58" r="8" fill="rgba(251,122,34,.55)"/><path d="M28 102l22-20 16 14 14-12 20 18" stroke="rgba(255,255,255,.4)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g><path d="M118 70h22" stroke="#fb7a22" stroke-width="2.4" stroke-linecap="round"/><path d="M132 64l8 6-8 6" stroke="#fb7a22" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><g><rect x="150" y="18" width="68" height="52" rx="11" fill="rgba(251,122,34,.16)" stroke="rgba(251,122,34,.5)"/><rect x="158" y="66" width="68" height="52" rx="11" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.2)"/><rect x="120" y="86" width="68" height="52" rx="11" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.16)"/></g></svg>';

 function el(html){var d=document.createElement('div');d.innerHTML=html;return d.firstChild;}
 var root=el('<div id="atuStudio"></div>');
 root.innerHTML=
  '<div class="ats-top"><div class="ats-tl"><a class="ats-logo" href="/" aria-label="WorkHogee">'+LOGO_FULL+'</a><span class="ats-crumb">阿图 · <b>商品图操作台</b></span></div><div class="ats-tr"><span class="ats-pill">'+I.spark+'Alpha 内测 · 出图不限</span><button class="ats-back" id="atsBack" type="button" title="返回工作台">'+I.back+'</button></div></div>'+
  '<div class="ats-body">'+
   '<div class="ats-rail"><button class="ats-nav on" data-suite="ecom" type="button">'+I.bag+'<span>电商套图</span></button><button class="ats-nav" data-suite="fashion" type="button">'+I.hanger+'<span>服装套图</span></button><button class="ats-nav" data-suite="batch" type="button">'+I.layers+'<span>批量套图</span></button><button class="ats-nav" data-suite="records" type="button">'+I.clock+'<span>生成记录</span></button></div>'+
   '<div class="ats-panel"><div class="ats-scroll" id="atsScroll">'+
     '<div class="ats-card"><div class="ats-ch"><div class="ats-ct">商品原图</div><button class="ats-cs mut" id="atsClear" type="button">清空</button></div><div class="ats-thumbs" id="atsThumbs"></div><div class="ats-hint">同一商品可传多角度（最多 5 张），系统按一套处理；主参考图请选主体清晰、背景简洁的实拍图。</div></div>'+
     '<div class="ats-card"><div class="ats-ch"><div class="ats-ct">商品卖点</div><button class="ats-cs" id="atsAiWrite" type="button">'+I.spark+'AI 帮写</button></div><div id="atsSellingWrap"><textarea class="ats-ta" id="atsSelling" maxlength="2000" placeholder="商品名称、核心卖点、适用人群、使用场景、规格参数都可以写在这里；没准备好就点「AI 帮写」，伙计看图先给你一版。"></textarea></div></div>'+
     '<div class="ats-card"><div class="ats-ch"><div class="ats-ct">生成设置</div><button class="ats-cs mut" id="atsMoreBtn" type="button">更多设置</button></div><div class="ats-grid">'+
       '<div class="ats-field"><label>电商平台</label><select id="setPlatform"><option value="generic">通用（全平台适配）</option><option value="amazon" selected>亚马逊 Amazon</option><option value="taobao">淘宝/天猫</option><option value="jd">京东</option><option value="douyin">抖音商城</option><option value="xiaohongshu">小红书</option><option value="aliexpress">速卖通 AliExpress</option><option value="shopee">Shopee</option><option value="tiktokshop">TikTok Shop</option></select></div>'+
       '<div class="ats-field"><label>销售站点 / 区域</label><select id="setRegion"><option value="generic">通用</option><option value="CN">国内（中国大陆）</option><option value="US" selected>北美（美国）</option><option value="EU">欧洲</option><option value="SEA">东南亚</option><option value="JP">日本</option><option value="KR">韩国</option></select></div>'+
       '<div class="ats-field"><label>文案语种</label><select id="setLang"><option value="auto" selected>跟随站点</option><option value="en">English</option><option value="zh-CN">简体中文</option><option value="ja">日本語</option><option value="ko">한국어</option></select></div>'+
       '<div class="ats-field"><label>清晰度</label><select id="setQ"><option>高清</option><option>标准</option><option>超清</option></select></div>'+
       '<div class="ats-field full"><label>出图模型</label><select id="setModel"><option>智能推荐（Seedream 4.5）</option><option>即梦图片 4.5</option><option>即梦图片 4.0</option><option>改图模型 3.0</option><option>改图模型 2.5</option></select></div></div>'+
       '<div class="ats-more" id="atsMore"><div class="ats-field"><label>图片比例</label><select><option>智能适配图种</option><option>1:1</option><option>3:4</option><option>16:9</option></select></div><div class="ats-field"><label>文件格式</label><select><option>JPG</option><option>PNG（透明底）</option><option>WebP</option></select></div></div></div>'+
     '<div class="ats-card" id="planCard" style="display:none"><div class="ats-fold open" id="foldPlanText"><div class="ats-ct">图文文案方案 <span class="ats-selcount" id="planCount"></span></div><span class="ats-chev"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></span></div><div class="ats-foldbody" style="display:flex" id="planTextBody"></div></div>'+
     '<div class="ats-card"><div class="ats-fold" id="foldPlan"><div class="ats-ct">智能视觉风格 <span style="font-size:11.5px;color:var(--tx3);font-weight:400">（可选）</span></div><span class="ats-chev"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></span></div><div class="ats-foldbody"><div class="ats-switch-row"><span>智能风格推荐（关闭则由 AI 自动匹配）</span><button class="ats-sw" id="swStyle" type="button"></button></div><div class="ats-chips" id="styleChips" style="display:none">'+STYLE_TAGS.map(function(t,i){return '<button class="ats-chip" data-style="'+i+'" type="button">'+t+'</button>';}).join('')+'</div></div></div>'+
     '<div class="ats-card"><div class="ats-fold open" id="foldSuite"><div class="ats-ct">套图选择 <span class="ats-selcount" id="selCount"></span></div><span class="ats-chev"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></span></div><div class="ats-foldbody" style="display:flex"><div style="display:flex;align-items:center;justify-content:space-between"><div class="ats-seg" id="suiteSeg"><button class="on" data-seg="main" type="button">套图</button><button data-seg="detail" id="segDetail" type="button">详情 / A+</button></div><button class="ats-cs" id="aiSelect" type="button">AI 帮选</button></div><div class="ats-chips" id="suiteChips"></div></div></div>'+
   '</div><div class="ats-genbar"><div class="ats-free">内测剩余额度：<b>不限</b>（仅对成功出图计费，失败/审核未出图不扣费）</div><button class="ats-gen" id="atsGen" type="button">开始生成</button></div></div>'+
   '<div class="ats-stage"><div class="ats-stage-tabs" id="stageTabs" style="display:none"><div class="ats-stage-tt">交付成品 <span class="cnt" id="stageCnt"></span></div><div class="ats-stage-ops"><button class="ats-obtn" id="dlAll" type="button">'+I.download+'全部下载</button><button class="ats-obtn pri" id="toAwen" type="button">'+I.pen+'交给阿文写文案</button></div></div><div class="ats-canvas" id="atsCanvas"></div></div>'+
  '</div><div class="ats-lb" id="atsLb"><button class="ats-lb-x" id="atsLbX" type="button">×</button><img id="atsLbImg" alt="成品大图"></div>'+
  '<div class="ats-srcmenu" id="atsSrcMenu"></div>';
 document.body.appendChild(root);

 var S={root:root,suite:'ecom',seg:'main',ats:[],sel:{},planResp:null,planByType:{},ostEdits:{},_running:false,_abort:false,_paused:false,_cleanImage:null,_failed:{},_totalTasks:0,_doneTasks:0,_progMsg:'',
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
  /* ---- 生成设置取值（契约 §2 枚举） ---- */
  platform:function(){return this.$('#setPlatform').value||'generic';},
  locale:function(){return this.$('#setRegion').value||'generic';},
  resolvedLang:function(){var l=this.$('#setLang').value;if(l&&l!=='auto')return l;return LOCALE_LANG[this.locale()]||'en';},
  kitType:function(){return this.suite==='fashion'?'fashion':'ecom';},
  /* ---- 已选图种（按 ALL_TYPE_ORDER 稳定排序） ---- */
  selectedTypes:function(){var self=this;return ALL_TYPE_ORDER.filter(function(t){return self.sel[t];});},
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
  currentList:function(){if(this.suite==='fashion')return SUITE_TYPES.fashion;return (this.seg==='detail')?SUITE_TYPES.detail:SUITE_TYPES.ecom;},
  renderSuiteChips:function(){
   var box=this.$('#suiteChips');if(!box)return;var list=this.currentList();var self=this;
   box.innerHTML=list.map(function(p){
    return '<button class="ats-chip'+(self.sel[p[0]]?' on':'')+'" data-type="'+p[0]+'" type="button">'+p[1]+'</button>';
   }).join('');
   box.querySelectorAll('.ats-chip').forEach(function(c){c.addEventListener('click',function(){var t=c.dataset.type;self.sel[t]=!self.sel[t];c.classList.toggle('on',!!self.sel[t]);self.updateSelCount();});});
   var sd=this.$('#segDetail');if(sd)sd.style.display=(this.suite==='fashion')?'none':'';
   this.updateSelCount();
  },
  updateSelCount:function(){
   var n=Object.keys(this.sel).filter(function(k){return S.sel[k];}).length;
   var c=this.$('#selCount');if(c)c.textContent='已选 '+n+' 个图种';
  },
  setSuite:function(s){
   if(s==='batch'){toast('批量套图即将上线，本期可逐商品创建');s='ecom';}
   if(s==='records'){toast('生成记录在左侧「我的创作」里，可按创作主线查看');s='ecom';}
   this.suite=s;this.sel={};this.planResp=null;this.planByType={};this.ostEdits={};
   var pc=this.$('#planCard');if(pc)pc.style.display='none';
   root.querySelectorAll('.ats-nav').forEach(function(n){n.classList.toggle('on',n.dataset.suite===s);});
   this.renderSuiteChips();
  },
  /* === /marketing/plan：卖点 + 图种规划 + on_screen_text === */
  runPlan:function(){
   var imgs=(GS()&&GS().images)||[];if(!imgs.length){toast('先上传商品原图','err');return;}
   var sellingTa=this.$('#atsSelling'),sellingText=sellingTa?sellingTa.value:'';
   var wrap=this.$('#atsSellingWrap');if(wrap)wrap.innerHTML='<div class="ats-spin">'+SPIN+'正在看图，规划卖点与图文方案…</div>';
   var self=this;
   (async function(){
    var body={images:imgs.map(function(x){return x.dataUrl;}).slice(0,5),
     kit_type:self.kitType(),platform:self.platform(),locale:self.locale(),language:self.resolvedLang(),
     selling_text:sellingText,selected_types:self.selectedTypes()};
    var j=null;try{j=await authPost('/marketing/plan',body,180000);}catch(e){j=null;}
    // 还原 textarea
    if(wrap){wrap.innerHTML='<textarea class="ats-ta" id="atsSelling" maxlength="2000" placeholder="商品名称、核心卖点、适用人群、使用场景、规格参数…"></textarea>';}
    var ta=wrap&&wrap.querySelector('#atsSelling');
    if(j&&j.ok){
     if(j.kit_type==='fashion'&&self.suite!=='fashion')self.setSuite('fashion');
     self.planResp=j;self.planByType={};self.ostEdits={};
     (j.plan||[]).forEach(function(e){self.planByType[e.type]=e;});
     var p=j.product||{},lines=[];
     if(p.name)lines.push(p.name);
     if(Array.isArray(p.core_points))p.core_points.forEach(function(c){lines.push('· '+c);});
     if(p.audience)lines.push('适用人群：'+p.audience);
     if(Array.isArray(p.scenes))p.scenes.forEach(function(s){lines.push('场景：'+(s.zh||s.en||''));});
     if(Array.isArray(p.materials)&&p.materials.length)lines.push('材质：'+p.materials.join(' / '));
     if(Array.isArray(p.specs)&&p.specs.length)lines.push('规格：'+p.specs.join(' / '));
     if(ta)ta.value=lines.join('\n')||sellingText;
     self.sel={};(j.recommended_types||[]).forEach(function(t){self.sel[t]=true;});
     self.renderSuiteChips();self.updateSelCount();self.renderPlanText();
     toast('AI 已出图文方案，可逐张改文案后开始生成');
    }else{
     if(ta)ta.value=sellingText;
     // 后端未就绪时软降级：保留旧 /copy 帮写卖点，不阻断手动出图
     self._fallbackCopy(ta);
    }
    if(ta)ta.addEventListener('input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,260)+'px';});
   })();
  },
  _fallbackCopy:function(ta){
   if(!ta)return;var self=this;
   (async function(){
    var name=(GS().product&&GS().product.name)||'',cat=(GS().identity&&GS().identity.cat)||'';
    var j=await authPost('/copy',{product:name||'这款商品',category:cat,channels:['general'],tone:'请写出一版结构清晰、卖点突出、适合电商使用的商品卖点文案，分条呈现，包含名称、核心卖点、适用人群、场景、规格'});
    if(j&&j.ok&&j.copy&&j.copy.channels&&j.copy.channels.general&&!ta.value)ta.value=j.copy.channels.general;
    toast('图文规划服务暂不可用，已退回手动模式：可手动勾选图种后直接生成');
   })();
  },
  autoSelling:function(){
   if(!GS().images||!GS().images.length)return;
   var img0=GS().images[0].dataUrl;
   var self=this;
   (async function(){
    try{var f=await callIdentify(img0);if(f){var cat=f.category||f.cat||f.name||'';if(cat&&/(服装|衣|裤|裙|鞋|帽|袜|包|fashion|apparel|cloth|wear|dress|shirt|shoe|bag)/i.test(cat))self.setSuite('fashion');if(f.name)GS().product=GS().product||{};}}catch(e){}
    self.runPlan();
   })();
  },
  aiWrite:function(){this.runPlan();},
  renderPlanText:function(){
   var card=this.$('#planCard');if(!card)return;var list=(this.planResp&&this.planResp.plan)||[];
   if(!list.length){card.style.display='none';return;}
   card.style.display='';var body=this.$('#planTextBody');var self=this;
   body.innerHTML=list.map(function(e){
    var ost=e.on_screen_text||{};
    var icons=(ost.icons||[]).map(function(i){return i.label||'';}).filter(Boolean).join(', ');
    return '<div class="ats-ost" data-osttype="'+e.type+'">'+
     '<div class="ats-ost-h">'+esc(e.label_zh||e.type)+' <span>'+esc(e.ratio||'')+'</span></div>'+
     '<input class="ats-ost-inp" data-f="headline" value="'+esc(ost.headline||'')+'" placeholder="主标题（图上大字，逐字上屏）">'+
     '<input class="ats-ost-inp" data-f="subheadline" value="'+esc(ost.subheadline||'')+'" placeholder="副标题（可空）">'+
     ((ost.icons&&ost.icons.length)?'<input class="ats-ost-inp" data-f="iconLabels" value="'+esc(icons)+'" placeholder="图标标签，逗号分隔">':'')+
    '</div>';
   }).join('');
   body.querySelectorAll('.ats-ost-inp').forEach(function(inp){
    inp.addEventListener('input',function(){
     var block=inp.closest('.ats-ost');var t=block.dataset.osttype;
     self.ostEdits[t]=self.ostEdits[t]||{};self.ostEdits[t][inp.dataset.f]=inp.value;
    });
   });
   var pc=this.$('#planCount');if(pc)pc.textContent=list.length+' 张可改';
  },
  /* 该图种最终 on_screen_text（用户编辑覆盖 plan 原文案） */
  ostForType:function(t){
   var entry=this.planByType[t];
   var base={headline:'',subheadline:'',icons:[],panels:[],callouts:[],bullets:[]};
   if(entry&&entry.on_screen_text){try{base=JSON.parse(JSON.stringify(entry.on_screen_text));}catch(e){}}
   var ed=this.ostEdits[t];
   if(ed){
    if(ed.headline!==undefined)base.headline=ed.headline;
    if(ed.subheadline!==undefined)base.subheadline=ed.subheadline;
    if(ed.iconLabels!==undefined){
     var labs=ed.iconLabels.split(',').map(function(s){return s.trim();}).filter(Boolean);
     var hints=(base.icons||[]).map(function(i){return i.icon_hint||'';});
     base.icons=labs.map(function(lb,idx){return {label:lb,icon_hint:hints[idx]||''};});
    }
   }
   return base;
  },
  planSize:function(t){
   var e=this.planByType[t];if(e&&e.size)return e.size;
   var r=TYPE_RATIO[t]||'1:1';return RATIO_SIZE[r]||'1920x1920';
  },
  buildProductFacts:function(){
   var p=(this.planResp&&this.planResp.product)||GS().product||{};var parts=[];
   if(p.name)parts.push(p.name);
   if(Array.isArray(p.materials)&&p.materials.length)parts.push(p.materials.join(', '));
   if(Array.isArray(p.specs)&&p.specs.length)parts.push(p.specs.join(', '));
   if(Array.isArray(p.core_points)&&p.core_points.length)parts.push(p.core_points.join('; '));
   if(Array.isArray(p.key_parts)&&p.key_parts.length)parts.push(p.key_parts.join(', '));
   if(!parts.length){var ta=this.$('#atsSelling');if(ta&&ta.value)parts.push(ta.value.slice(0,200));}
   return parts.join(', ').slice(0,400);
  },
  setCanvas:function(mode){
   var c=this.$('#atsCanvas'),tabs=this.$('#stageTabs');
   if(mode==='empty'){tabs.style.display='none';var eb=this._lastErr?'<div class="ats-errbox"><div>'+this._lastErr+'</div><button id="atsRetryGen" type="button">重新生成</button></div>':'';c.innerHTML='<div class="ats-empty"><div class="ats-empty-art">'+EMPTY_ART+'</div><h2>一键生成爆款商品套图</h2><p>上传商品原图，选平台/站点/语种，伙计智能产出白底主图 + 卖点图 + 场景图 + 多场景拼图，整套图文结合的专业电商图一次配齐。</p>'+eb+'</div>';var rb=c.querySelector('#atsRetryGen');if(rb){var self2=this;rb.addEventListener('click',function(){self2._lastErr=null;self2.generate();});}}
   else if(mode==='progress'){tabs.style.display='none';c.innerHTML='<div class="ats-prog"><div class="ats-prog-ring"><svg width="120" height="120"><circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/><circle id="progRing" cx="60" cy="60" r="52" fill="none" stroke="#fb7a22" stroke-width="8" stroke-linecap="round" stroke-dasharray="326.7" stroke-dashoffset="326.7"/></svg><div class="pg-txt"><div><b id="progPct">0</b>%</div></div></div><div class="ats-prog-msg" id="progMsg">正在准备…</div><div class="ats-prog-note">白底主图走保真抠图（产品原像素 100% 保留）；其余营销图逐张生成，每好一张就先放出来。</div><button class="ats-stop" id="progStop" type="button">'+I.stop+'终止任务</button></div>';var self=this;c.querySelector('#progStop').addEventListener('click',function(){self._abort=true;});}
   else if(mode==='result'){this.paint();}
  },
  setProgMsg:function(m){this._progMsg=m;var pm=this.$('#progMsg');if(pm)pm.textContent=m;},
  addNote:function(t){this._notes=this._notes||[];this._notes.push(t);},
  addResult:function(url,label,type){
   var r={url:url,label:label,type:type||'',ts:Date.now()};this.ats.push(r);
   try{if(typeof persistResult==='function')persistResult({url:url,k:'atu',label:label,ts:Date.now()},label);}catch(e){}
   if(!GS().results)GS().results=[];GS().results.push({url:url,k:'atu',label:label,ts:Date.now()});
  },
  replaceResultByType:function(t,url){
   var hit=null;for(var i=0;i<this.ats.length;i++){if(this.ats[i].type===t){hit=this.ats[i];break;}}
   if(hit){hit.url=url;hit.ts=Date.now();}else{this.addResult(url,TYPE_LABELS[t]||t,t);}
  },
  /* 统一渲染：进行中=livebar+按图种分组网格；完成=分组网格 */
  paint:function(){
   var c=this.$('#atsCanvas');if(!c)return;var tabs=this.$('#stageTabs');var self=this;
   var head='';
   if(this._running){
    var total=this._totalTasks||0,done=this._doneTasks||0,pct=total?Math.round(done/total*100):0;
    head='<div class="ats-livebar"><div class="ats-livebar-l"><b>'+done+'/'+total+'</b> '+esc(this._progMsg||'生成中…')+'</div><div class="ats-livebar-r"><button class="ats-obtn" id="btnPause" type="button">'+(this._paused?I.play:'暂停')+'</button><button class="ats-obtn" id="btnStop" type="button">'+I.stop+'终止</button></div></div><div class="ats-livebar-track"><div style="width:'+pct+'%"></div></div>';
   }
   tabs.style.display=this.ats.length?'flex':'none';
   var cnt=this.$('#stageCnt');if(cnt)cnt.textContent=this.ats.length+' 张';
   var notesHtml=(this._notes||[]).map(function(n){return '<div class="ats-warnline">'+esc(n)+'</div>';}).join('');
   var order=this.selectedTypes();
   var groups='',rendered={};
   order.forEach(function(gt){
    var items=self.ats.filter(function(r){return r.type===gt;});if(!items.length)return;rendered[gt]=1;
    groups+='<div class="ats-tgroup"><div class="ats-tgroupt">'+esc(TYPE_LABELS[gt]||gt)+' <span>'+items.length+' 张</span></div><div class="ats-grid2">'+items.map(function(r){return self._cellHtml(r);}).join('')+'</div></div>';
   });
   var extra=this.ats.filter(function(r){return !rendered[r.type]&&r.type;});
   if(extra.length)groups+='<div class="ats-tgroup"><div class="ats-tgroupt">其他 <span>'+extra.length+' 张</span></div><div class="ats-grid2">'+extra.map(function(r){return self._cellHtml(r);}).join('')+'</div></div>';
   c.innerHTML=head+notesHtml+groups;
   c.querySelectorAll('[data-zoom]').forEach(function(im){im.addEventListener('click',function(){self.openLb(self.ats[+im.dataset.zoom].url);});});
   c.querySelectorAll('[data-dl]').forEach(function(b){b.addEventListener('click',function(){self.download(self.ats[+b.dataset.dl]);});});
   c.querySelectorAll('[data-redo]').forEach(function(b){b.addEventListener('click',function(){self.redo(+b.dataset.redo);});});
   var bp=c.querySelector('#btnPause');if(bp)bp.addEventListener('click',function(){self._paused=!self._paused;self.paint();});
   var bs=c.querySelector('#btnStop');if(bs)bs.addEventListener('click',function(){self._abort=true;});
  },
  _cellHtml:function(r){
   var idx=this.ats.indexOf(r);
   return '<div class="ats-cell"><img src="'+r.url+'" data-zoom="'+idx+'" alt=""><div class="ats-cell-lab">'+esc(r.label||'')+'</div><div class="ats-cell-ops"><button class="ats-co" data-redo="'+idx+'" title="重新生成" type="button">'+I.redo+'</button><button class="ats-co" data-dl="'+idx+'" title="下载" type="button">'+I.download+'</button></div></div>';
  },
  openLb:function(url){this.$('#atsLbImg').src=url;this.$('#atsLb').classList.add('show');},
  closeLb:function(){this.$('#atsLb').classList.remove('show');},
  download:function(r){var a=document.createElement('a');a.href=r.url;a.download='WorkHogee_'+(r.label||'成品')+'.jpg';document.body.appendChild(a);a.click();a.remove();},
  downloadAll:function(){var self=this;this.ats.forEach(function(r,i){setTimeout(function(){self.download(r);},i*350);});},
  liveRender:function(){if(this._running){if(this.ats.length){this.paint();}}else{this.paint();}},
  gatePause:function(){var self=this;return new Promise(function(res){function chk(){if(!self._paused||self._abort)return res();setTimeout(chk,300);}chk();});},
  /* 单张重做：按结果记录的 type 走对应轨道 */
  redo:function(i){var r=this.ats[i];if(!r)return;this.redoType(r.type,r.label);},
  redoType:function(t,label){
   var self=this;
   if(!t){toast('该图来源不明，无法单张重做');return;}
   if(t==='white_main'||t==='search_main'){
    toast('重做'+(TYPE_LABELS[t]||t)+'（轨道A 保真）…');
    (async function(){
     var cat=(GS().identity&&GS().identity.cat)||'',pn=(GS().product&&GS().product.name)||'这款商品';
     var out=null;try{out=await GF().package({call:retryCall,image:GS().images[0].dataUrl,category:cat,product:pn,doDetails:false,doScene:false});}catch(e){out=null;}
     if(out&&out.rejected){toast('抠图保真仍不达标，请换纯色背景重拍','err');return;}
     if(out&&out.ok&&out.white){self._cleanImage=out.white;self.replaceResultByType(t,out.white);self.paint();toast('重做完成');}
     else toast('重做失败，稍后再试','err');
    })();return;
   }
   toast('重做'+(TYPE_LABELS[t]||t)+'…');
   (async function(){
    await self.makeMarketingRef();
    var req={image:self._mktRef||self._cleanImage,type:t,size:self.planSize(t),language:self.resolvedLang(),on_screen_text:self.ostForType(t),product_facts:self.buildProductFacts(),domain:(self.planResp&&self.planResp.product?self.planResp.product.domain:''),scenes:(self.planResp&&self.planResp.product?self.planResp.product.scenes:[]),design_requirements:''};
    var j=null;try{j=await authPost('/marketing/generate',req,95000);}catch(e){j=null;}
    if(j&&j.ok&&j.image){self.replaceResultByType(t,j.image);self.paint();toast('重做完成');}
    else toast('重做失败：'+((j&&j.error&&j.error.message)||'稍后再试'),'err');
   })();
  },
  /* 营销参考图：把干净主体降采样到长边1280 JPEG。实测高分辨率参考图（2048²）会让
     卖点图/多宫格等复杂图种在 Ark 侧耗时越过边缘~100s 上限；降到1280后约28-40s出图，主体仍清晰 */
  makeMarketingRef:function(){
   var self=this;return new Promise(function(res){
    var src=self._cleanImage||GS().images[0].dataUrl;
    try{var im=new Image();
     im.onload=function(){var longE=1280,sc=Math.min(1,longE/Math.max(im.naturalWidth,im.naturalHeight));
      var w=Math.max(1,Math.round(im.naturalWidth*sc)),h=Math.max(1,Math.round(im.naturalHeight*sc));
      var cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(im,0,0,w,h);
      self._mktRef=cv.toDataURL('image/jpeg',0.85);res(self._mktRef);};
     im.onerror=function(){self._mktRef=src;res(src);};im.src=src;
    }catch(e){self._mktRef=src;res(src);}
   });
  },
  /* 单次营销生成 + 瞬时网络/超时自动重试一次（失败/审核未出图本就不计费） */
  genMarketing:function(req){
   var self=this;return (async function(){
    var j=null;try{j=await authPost('/marketing/generate',req,95000);}catch(e){j=null;}
    if(j&&j.ok)return j;
    if(self._abort)return j;
    await new Promise(function(r){setTimeout(r,1600);});
    try{j=await authPost('/marketing/generate',req,95000);}catch(e){j=null;}
    return j;
   })();
  },
  generate:function(){
   if(!GS().images||!GS().images.length){toast('先上传商品原图','err');return;}
   if(this._running)return;
   var types=this.selectedTypes();
   if(!types.length){toast('先勾选至少一个图种（或点 AI 帮写出方案）','err');return;}
   this._running=true;this._abort=false;this._paused=false;this.ats=[];this._notes=[];this._lastErr=null;this._failed={};this._cleanImage=null;
   this._totalTasks=types.length;this._doneTasks=0;this._progMsg='';
   this.setCanvas('progress');
   var self=this;
   (async function(){
    var cat=(GS().identity&&GS().identity.cat)||'',pn=(GS().product&&GS().product.name)||'这款商品';
    var needTrackA=(types.indexOf('white_main')>=0||types.indexOf('search_main')>=0);
    var fidOut=null;
    // 轨道A：只取干净白底主体（不再产裸局部/假影棚）
    if(needTrackA){
     self.setProgMsg('正在抠图保真（轨道A）…');
     try{fidOut=await GF().package({call:retryCall,image:GS().images[0].dataUrl,category:cat,product:pn,doDetails:false,doScene:false});}catch(e){fidOut=null;}
    }
    if(self._abort){self._finish();return;}
    self._cleanImage=(fidOut&&fidOut.ok&&fidOut.white)?fidOut.white:GS().images[0].dataUrl;
    await self.makeMarketingRef();
    // 白底主图
    if(types.indexOf('white_main')>=0){
     if(fidOut&&fidOut.rejected){self.addNote('白底主图：A级品类抠图保真未达标（'+(fidOut.reason||'qc')+'），请找纯色/干净背景重拍后再出，本次不硬生成。');self._failed['white_main']='rejected';}
     else if(fidOut&&fidOut.ok&&fidOut.white){self.addResult(fidOut.white,'白底主图','white_main');}
     else{self.addNote('白底主图处理失败，可点该图单张重做。');self._failed['white_main']='fail';}
     self._doneTasks++;self.liveRender();
    }
    // 搜索主图（同走轨道A，复用干净抠图）
    if(types.indexOf('search_main')>=0){
     if(fidOut&&fidOut.rejected){self.addNote('搜索主图：轨道A 保真未达标，建议纯色背景重拍。');self._failed['search_main']='rejected';}
     else if(fidOut&&fidOut.ok&&fidOut.white){self.addResult(fidOut.white,'搜索主图','search_main');}
     else{self.addNote('搜索主图处理失败。');self._failed['search_main']='fail';}
     self._doneTasks++;self.liveRender();
    }
    // 其余图种逐张调 /marketing/generate
    var lang=self.resolvedLang(),facts=self.buildProductFacts();
    for(var i=0;i<types.length;i++){
     var t=types[i];
     if(t==='white_main'||t==='search_main')continue;
     if(self._abort)break;
     await self.gatePause();
     if(self._abort)break;
     self.setProgMsg('正在生成：'+(TYPE_LABELS[t]||t)+'…');self.paint();
     var req={image:self._mktRef||self._cleanImage,type:t,size:self.planSize(t),language:lang,on_screen_text:self.ostForType(t),product_facts:facts,domain:(self.planResp&&self.planResp.product?self.planResp.product.domain:''),scenes:(self.planResp&&self.planResp.product?self.planResp.product.scenes:[]),design_requirements:''};
     var j=await self.genMarketing(req);
     if(self._abort)break;
     self._doneTasks++;
     if(j&&j.ok&&j.image){self.addResult(j.image,TYPE_LABELS[t]||t,t);}
     else{var em=(j&&j.error&&j.error.message)||'生成失败';self._failed[t]=em;self.addNote((TYPE_LABELS[t]||t)+' 失败：'+em+'（已保留，可点该图单张重做，不计成功张）');}
     self.liveRender();
    }
    self._finish();
   })();
  },
  _finish:function(){
   this._running=false;
   if(!this.ats.length){
    var fails=Object.keys(this._failed);
    this._lastErr=fails.length?('全部失败：'+fails.map(function(t){return (TYPE_LABELS[t]||t);}).join('、')+'。'+(this._failed[fails[0]]||'')):'生成失败，可能是网络波动，已保留你的原图，点重新生成再试。';
    this.setCanvas('empty');toast('没有成功生成的成品','err');
   }else{
    this._lastErr=null;this.setCanvas('result');
    var fN=Object.keys(this._failed).length;
    toast('出图完成，共 '+this.ats.length+' 张'+(fN?'，'+fN+' 张失败可单张重做':''));
   }
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
 S.$('#foldPlanText').addEventListener('click',function(){this.classList.toggle('open');});
 S.$('#foldSuite').addEventListener('click',function(){this.classList.toggle('open');});
 S.$('#suiteSeg').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;S.seg=b.dataset.seg;this.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b);});S.renderSuiteChips();});
 S.$('#aiSelect').addEventListener('click',function(){var list=S.currentList();list.slice(0,5).forEach(function(p){S.sel[p[0]]=true;});S.renderSuiteChips();toast('已帮你选 5 个常用图种');});
 S.$('#atsGen').addEventListener('click',function(){S.generate();});
 S.$('#dlAll').addEventListener('click',function(){S.downloadAll();});
 S.$('#toAwen').addEventListener('click',function(){S.handToAwen();});
 S.$('#atsLbX').addEventListener('click',function(){S.closeLb();});
 S.$('#atsLb').addEventListener('click',function(e){if(e.target.id==='atsLb')S.closeLb();});
 document.addEventListener('keydown',function(e){if(e.key==='Escape'&&S.isOpen())S.closeLb();});
 function _refreshPlan(){if(S.planResp&&GS().images&&GS().images.length){clearTimeout(S._plT);S._plT=setTimeout(function(){S.runPlan();},350);}}
 var _sp=S.$('#setPlatform'),_sr=S.$('#setRegion'),_sl=S.$('#setLang');
 if(_sp)_sp.addEventListener('change',function(){var rg=PLATFORM_REGION[_sp.value];if(rg&&_sr)_sr.value=rg;_refreshPlan();});
 if(_sr)_sr.addEventListener('change',_refreshPlan);
 if(_sl)_sl.addEventListener('change',_refreshPlan);
})();
