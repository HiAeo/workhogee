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
 var LOCALE_LANG={US:'en',EU:'en',SEA:'en',JP:'ja',KR:'ko',CN:'zh-CN',generic:'zh-CN'};
 var PLATFORM_REGION={generic:'generic',amazon:'US',taobao:'CN',jd:'CN',douyin:'CN',xiaohongshu:'CN',aliexpress:'JP',shopee:'SEA',tiktokshop:'US'};
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
.ats-free{font-size:11.5px;color:var(--tx3);margin:0 2px 12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;line-height:1.5}\
.ats-free-l{white-space:nowrap;flex:none}\
.ats-free b{color:var(--orange);font-weight:600;white-space:nowrap;flex:none}\
.ats-free-n{min-width:0}\
.ats-gen{width:100%;height:46px;border:0;border-radius:13px;background:linear-gradient(180deg,#fd8a3c,#f2630d);color:#fff;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;font-family:inherit;box-shadow:0 10px 24px rgba(234,88,12,.28);transition:.16s}\
.ats-gen:hover{filter:brightness(1.05)}\
.ats-stage{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;padding:6px 22px 22px}\
.ats-stage-tabs{flex:none;display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;min-height:34px}\
.ats-stage-tt{font-size:15px;font-weight:600;display:flex;align-items:center;gap:9px}\
.ats-stage-tt .cnt{font-size:12px;color:var(--tx3);font-weight:500}\
.ats-stage-ops{display:flex;gap:8px}\
.ats-obtn{appearance:none;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--tx2);font-size:12.5px;padding:7px 13px;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit;transition:.15s;white-space:nowrap;flex:none}\
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
.ats-stop{appearance:none;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--tx2);padding:9px 20px;border-radius:11px;font-size:13px;cursor:pointer;font-family:inherit;display:inline-flex;gap:8px;align-items:center;justify-content:center;white-space:nowrap;min-width:140px;flex:none}\
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
.ats-ost-note{font-size:11px;color:var(--tx3);padding:4px 2px;line-height:1.5}\
.ats-doing{display:inline-flex;align-items:center;gap:5px;background:rgba(251,122,34,.12);border:1px solid rgba(251,122,34,.30);color:#ffb084;font-size:11px;padding:2px 9px;border-radius:999px;white-space:nowrap}\
.ats-livebar-l{flex-wrap:wrap}\
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

 /* === i18n：操作界面 UI 固定中文（zh-CN），不随平台/语种切换；resolvedLang 只决定生成物料的语言 === */
 var I18N_DICT={
 'zh-CN':{
  nav_ecom:'电商套图',nav_fashion:'服装套图',nav_batch:'批量套图',nav_records:'生成记录',crumb_b:'商品图操作台',
  card_origin:'商品原图',btn_clear:'清空',origin_hint:'同一商品可传多角度（最多 5 张），系统按一套处理；主参考图请选主体清晰、背景简洁的实拍图。',
  card_selling:'商品卖点',btn_aiwrite:'AI 帮写',
  selling_ph:'商品名称、核心卖点、适用人群、使用场景、规格参数都可以写在这里；没准备好就点「AI 帮写」，伙计看图先给你一版。',
  planning:'正在读图 + 联网调研…',
  card_settings:'生成设置',btn_more:'更多设置',btn_less:'收起',
  f_platform:'电商平台',f_region:'销售站点 / 区域',f_lang:'文案语种',f_q:'清晰度',f_model:'出图模型',
  plan_title:'图文文案方案',plan_editable:'张可改',
  style_title:'智能视觉风格',style_opt:'（可选）',style_switch:'智能风格推荐（关闭则由 AI 自动匹配）',
  suite_title:'套图选择',sel_n:'已选',sel_unit:'个图种',btn_aipick:'AI 帮选',
  free_left:'内测剩余额度：',free_val:'不限',free_note:'（仅对成功出图计费，失败/审核未出图不扣费）',
  btn_start:'开始生成',
  deliver:'交付成品',deliver_unit:'张',btn_dlall:'全部下载',btn_toawen:'交给阿文写文案',
  ph_headline:'主标题（图上大字，逐字上屏）',ph_sub:'副标题（可空）',ph_icons:'图标标签，逗号分隔',
  ost_notext:'纯抠图图种，画面无文字',
  l_brand:'品牌',l_model:'型号',l_audience:'适用人群',l_scene:'场景',l_material:'材质',l_spec:'规格',
  btn_pause:'暂停',btn_resume:'继续',btn_stop:'终止',btn_stop_full:'终止任务',
  trackA:'正在抠图保真（轨道A）…',
  why_wait:'白底主图走保真抠图（产品原像素 100% 保留）；其余营销图由 AI 渲染，场景/拼图类每张约 30–90 秒，好一张先放一张。',
  prog_ready:'正在准备…',doing_prefix:'正在做',done_prefix:'已完成',eta_prefix:'预计还需',min:'分',sec:'秒',
  empty_h2:'一键生成爆款商品套图',
  empty_p:'上传商品原图，选平台/站点/语种，伙计智能产出白底主图 + 卖点图 + 场景图 + 多场景拼图，整套图文结合的专业电商图一次配齐。',
  retry:'重新生成',other_group:'其他',toast_noplan:'AI 已出图文方案，可逐张改文案后开始生成',toast_nofirst:'先上传商品原图',
  toast_needtype:'先勾选至少一个图种（或点 AI 帮写出方案）',gen_done:'出图完成，共',gen_fail:' 张失败可单张重做',no_success:'没有成功生成的成品',
  t_white_main:'白底主图',t_search_main:'搜索主图',t_core_selling:'核心卖点图',t_selling_point:'卖点图',t_icon_selling:'图标卖点图',t_material:'材质图',t_scene_show:'场景展示图',t_multi_scene:'多场景拼图',t_competitor_compare:'竞品对比图',t_usage_compare:'使用对比图',t_size_chart:'尺寸/容量图',t_product_detail:'产品细节图',t_hero:'首屏主视觉',t_scene_atmosphere:'场景氛围图',t_multi_angle:'多角度图',t_series:'系列展示图',t_ingredients:'商品成分图',t_usage_guide:'使用建议图',t_accessories:'配件/赠品图',t_after_sales:'售后保障图',t_mood:'氛围渲染图',t_f_model:'模特图',t_f_white:'白底图',t_f_search:'搜索主图',t_f_selling:'卖点图',t_f_icon:'图标卖点图',t_f_detail:'细节图',t_f_fabric:'面料质感图',t_f_angle:'多角度视图',t_f_seeding:'种草图',t_f_scene:'多场景图',t_f_series:'系列展示图',t_f_size:'尺码图',p_generic:'通用（全平台适配）',p_amazon:'亚马逊 Amazon',p_taobao:'淘宝/天猫',p_jd:'京东',p_douyin:'抖音商城',p_xhs:'小红书',p_aliexpress:'速卖通 AliExpress',p_shopee:'Shopee',p_tiktokshop:'TikTok Shop',r_generic:'通用',r_cn:'国内（中国大陆）',r_us:'北美（美国）',r_eu:'欧洲',r_sea:'东南亚',r_jp:'日本',r_kr:'韩国',l_auto:'跟随站点',m_auto:'智能推荐（Seedream 4.5）',plan_notready:'当前语种方案生成中，请稍候再开始'
 },
 'en':{
  nav_ecom:'Ecom Suite',nav_fashion:'Fashion Suite',nav_batch:'Batch',nav_records:'History',crumb_b:'Product Image Studio',
  card_origin:'Product Photos',btn_clear:'Clear',origin_hint:'Up to 5 angles of the same product; pick a sharp, clean-background shot as the main reference.',
  card_selling:'Selling Points',btn_aiwrite:'AI Draft',
  selling_ph:'Name, key benefits, audience, usage scenes and specs. Leave it blank and hit AI Draft — the engine reads the photos and writes a first version.',
  planning:'Reading photos + web research…',
  card_settings:'Generation Settings',btn_more:'More',btn_less:'Less',
  f_platform:'Platform',f_region:'Site / Region',f_lang:'Copy Language',f_q:'Quality',f_model:'Model',
  plan_title:'On-screen Copy Plan',plan_editable:'editable',
  style_title:'Visual Style',style_opt:'(optional)',style_switch:'Smart style recommendation (off = automatic)',
  suite_title:'Image Types',sel_n:'Selected',sel_unit:'types',btn_aipick:'AI Pick',
  free_left:'Beta quota left: ',free_val:'Unlimited',free_note:'(Only successful generations are billed; failed / rejected ones are not.)',
  btn_start:'Start Generating',
  deliver:'Deliverables',deliver_unit:'imgs',btn_dlall:'Download All',btn_toawen:'Hand to Awen for copy',
  ph_headline:'Main headline (large on-image text, verbatim)',ph_sub:'Subheadline (optional)',ph_icons:'Icon labels, comma separated',
  ost_notext:'Cutout only — no on-image text',
  l_brand:'Brand',l_model:'Model',l_audience:'Audience',l_scene:'Scene',l_material:'Material',l_spec:'Specs',
  btn_pause:'Pause',btn_resume:'Resume',btn_stop:'Stop',btn_stop_full:'Stop Task',
  trackA:'Cutout fidelity (Track A)…',
  why_wait:'White-background images go through pixel-preserving cutout; other marketing images are AI-rendered per type — scene/collage types take ~30–90s each, released as soon as done.',
  prog_ready:'Preparing…',doing_prefix:'Working on',done_prefix:'Done',eta_prefix:'ETA',min:'min ',sec:'s',
  empty_h2:'One-click on-brand e-commerce image suite',
  empty_p:'Upload product photos, pick platform/region/language, and get white-background, selling-point, lifestyle and multi-scene images — a full professional suite in one go.',
  retry:'Regenerate',other_group:'Others',toast_noplan:'Plan ready — edit per-image copy then generate',toast_nofirst:'Upload product photos first',
  toast_needtype:'Select at least one image type (or hit AI Pick)',gen_done:'Done — ',gen_fail:' failed, redo individually',no_success:'No successful images',
  t_white_main:'White Main',t_search_main:'Search Main',t_core_selling:'Core Selling Points',t_selling_point:'Selling Points',t_icon_selling:'Icon Selling',t_material:'Material',t_scene_show:'Lifestyle Scene',t_multi_scene:'Multi-Scene',t_competitor_compare:'Comparison',t_usage_compare:'Before / After',t_size_chart:'Size Chart',t_product_detail:'Product Detail',t_hero:'Hero Banner',t_scene_atmosphere:'Scene Mood',t_multi_angle:'Multi-Angle',t_series:'Series',t_ingredients:'Ingredients',t_usage_guide:'Usage Guide',t_accessories:'Accessories',t_after_sales:'After-Sales',t_mood:'Mood',t_f_model:'On-Model',t_f_white:'White',t_f_search:'Search Main',t_f_selling:'Selling Points',t_f_icon:'Icon Selling',t_f_detail:'Detail',t_f_fabric:'Fabric',t_f_angle:'Multi-Angle',t_f_seeding:'Seeding',t_f_scene:'Lifestyle',t_f_series:'Series',t_f_size:'Size Chart',p_generic:'General purpose',p_amazon:'Amazon',p_taobao:'Taobao/Tmall',p_jd:'JD',p_douyin:'Douyin',p_xhs:'Xiaohongshu',p_aliexpress:'AliExpress',p_shopee:'Shopee',p_tiktokshop:'TikTok Shop',r_generic:'Global',r_cn:'China',r_us:'USA (North America)',r_eu:'Europe',r_sea:'Southeast Asia',r_jp:'Japan',r_kr:'Korea',l_auto:'Follow site',m_auto:'Auto (Seedream 4.5)',plan_notready:'Plan for the selected language is still generating — please wait'
 },
 'ja':{
  nav_ecom:'ECセット',nav_fashion:'アパレル',nav_batch:'バッチ',nav_records:'履歴',crumb_b:'商品画像スタジオ',
  card_origin:'商品画像',btn_clear:'クリア',origin_hint:'同じ商品を最大5枚まで。メイン参考画像は、主体がはっきり写った背景のすっきりした写真を選んでください。',
  card_selling:'売れ筋ポイント',btn_aiwrite:'AI下書き',
  selling_ph:'商品名・核心的な訴求・対象層・使用シーン・仕様をどうぞ。準備できなければ「AI下書き」を押すと、画像を見て下書きを作成します。',
  planning:'画像を解析 + ウェブ調査中…',
  card_settings:'生成設定',btn_more:'詳細設定',btn_less:'閉じる',
  f_platform:'ECプラットフォーム',f_region:'販売リージョン',f_lang:'コピー言語',f_q:'画質',f_model:'モデル',
  plan_title:'画面コピー案',plan_editable:'枚編集可',
  style_title:'ビジュアルスタイル',style_opt:'（任意）',style_switch:'スマートスタイル提案（オフで自動）',
  suite_title:'画像タイプ',sel_n:'選択中',sel_unit:'種類',btn_aipick:'AIおまかせ',
  free_left:'ベータ枠残数：',free_val:'無制限',free_note:'（成功した画像のみ課金。失敗・審査落ちは課金されません）',
  btn_start:'生成開始',
  deliver:'納品物',deliver_unit:'枚',btn_dlall:'すべてダウンロード',btn_toawen:'コピー作成はアーウェンへ',
  ph_headline:'メインタイトル（画面大文字、一字一句そのまま表示）',ph_sub:'サブタイトル（任意）',ph_icons:'アイコンラベル、カンマ区切り',
  ost_notext:'切り抜きのみ・画面文字なし',
  l_brand:'ブランド',l_model:'モデル',l_audience:'対象層',l_scene:'シーン',l_material:'素材',l_spec:'仕様',
  btn_pause:'一時停止',btn_resume:'再開',btn_stop:'停止',btn_stop_full:'タスク停止',
  trackA:'切り抜き・保真（トラックA）…',
  why_wait:'白背景画像は原像素を保った切り抜き。その他のマーケティング画像はAIが1枚ずつ描画し、シーン・コラージュ系は1枚あたり約30〜90秒です。完成次第、順次公開します。',
  prog_ready:'準備中…',doing_prefix:'作成中',done_prefix:'完了',eta_prefix:'残り約',min:'分',sec:'秒',
  empty_h2:'ワンクリックで売れる商品画像セット',
  empty_p:'商品画像をアップロードし、プラットフォーム・地域・言語を選ぶだけ。白背景・訴求・シーン・マルチシーンまで、プロ仕様のEC画像セットを一括生成。',
  retry:'再生成',other_group:'その他',toast_noplan:'プラン完成・画面コピーを確認後に生成へ',toast_nofirst:'商品画像を先にアップロード',
  toast_needtype:'画像タイプを1つ以上選んでください（AIおまかせも可）',gen_done:'生成完了・計',gen_fail:'枚失敗・個別やり直し可',no_success:'成功した画像がありません',
  t_white_main:'白背景メイン',t_search_main:'検索メイン',t_core_selling:'コア訴求点',t_selling_point:'訴求ポイント',t_icon_selling:'アイコン訴求',t_material:'素材感',t_scene_show:'シーン写真',t_multi_scene:'マルチシーン',t_competitor_compare:'競合比較',t_usage_compare:'使用前後比較',t_size_chart:'サイズ表',t_product_detail:'製品ディテール',t_hero:'ヒーロー',t_scene_atmosphere:'雰囲気',t_multi_angle:'多角度',t_series:'シリーズ',t_ingredients:'成分',t_usage_guide:'使い方',t_accessories:'付属品',t_after_sales:'アフターサービス',t_mood:'ムード',t_f_model:'モデル着用',t_f_white:'白背景',t_f_search:'検索メイン',t_f_selling:'訴求ポイント',t_f_icon:'アイコン訴求',t_f_detail:'ディテール',t_f_fabric:'生地质感',t_f_angle:'多角度ビュー',t_f_seeding:'口コミ',t_f_scene:'ライフシーン',t_f_series:'シリーズ',t_f_size:'サイズ表',p_generic:'汎用（全プラットフォーム対応）',p_amazon:'Amazon',p_taobao:'Taobao/Tmall',p_jd:'JD',p_douyin:'Douyin',p_xhs:'Xiaohongshu',p_aliexpress:'AliExpress',p_shopee:'Shopee',p_tiktokshop:'TikTok Shop',r_generic:'グローバル',r_cn:'中国本土',r_us:'北米（米国）',r_eu:'ヨーロッパ',r_sea:'東南アジア',r_jp:'日本',r_kr:'韓国',l_auto:'サイトに従う',m_auto:'おまかせ（Seedream 4.5）',plan_notready:'選択言語のプランを作成中です。少しお待ちください'
 },
 'ko':{
  nav_ecom:'이커머스 세트',nav_fashion:'의류 세트',nav_batch:'일괄',nav_records:'기록',crumb_b:'상품 이미지 스튜디오',
  card_origin:'상품 이미지',btn_clear:'전체 삭제',origin_hint:'동일 상품을 최대 5장까지. 대표 참고 이미지는 배경이 깔끔한 선명한 사진으로 선택하세요.',
  card_selling:'핵심 판매 포인트',btn_aiwrite:'AI 초안',
  selling_ph:'상품명·핵심 장점·적합 고객·사용 장면·사양을 적어주세요. 준비가 안 됐다면 AI 초안을 누르면 이미지를 보고 첫 초안을 작성합니다.',
  planning:'이미지 분석 + 웹 조사 중…',
  card_settings:'생성 설정',btn_more:'추가 설정',btn_less:'접기',
  f_platform:'플랫폼',f_region:'판매 지역',f_lang:'카피 언어',f_q:'화질',f_model:'모델',
  plan_title:'화면 카피 안',plan_editable:'장 편집 가능',
  style_title:'비주얼 스타일',style_opt:'(선택)',style_switch:'스마트 스타일 추천(끄면 자동)',
  suite_title:'이미지 유형',sel_n:'선택됨',sel_unit:'개',btn_aipick:'AI 추천',
  free_left:'베타 잔여 크레딧: ',free_val:'무제한',free_note:'(성공 건만 과금, 실패·심사 탈락은 과금 없음)',
  btn_start:'생성 시작',
  deliver:'납품 결과물',deliver_unit:'장',btn_dlall:'전체 다운로드',btn_toawen:'카피 작성은 아웨인에게',
  ph_headline:'메인 제목(이미지 큰 글자, 글자 그대로 표시)',ph_sub:'서브 제목(선택)',ph_icons:'아이콘 라벨, 쉼표 구분',
  ost_notext:'누끼 전용 · 화면 문자 없음',
  l_brand:'브랜드',l_model:'모델명',l_audience:'적합 고객',l_scene:'장면',l_material:'소재',l_spec:'사양',
  btn_pause:'일시정지',btn_resume:'계속',btn_stop:'중지',btn_stop_full:'작업 중지',
  trackA:'누끼 보정(트랙 A)…',
  why_wait:'흰색 배경은 원본 화소를 보존하는 누끼 처리, 그 외 마케팅 이미지는 AI가 장당 렌더링합니다. 장면·콜라주 유형은 장당 약 30–90초. 완료되는 대로 바로 공개합니다.',
  prog_ready:'준비 중…',doing_prefix:'작업 중',done_prefix:'완료',eta_prefix:'남은 시간 약',min:'분 ',sec:'초',
  empty_h2:'원클릭으로 완성하는 인기 상품 이미지 세트',
  empty_p:'상품 이미지를 올리고 플랫폼/지역/언어를 선택하면 흰색 배경·포인트·장면·멀티 장면까지 전문 이커머스 이미지 세트를 한 번에 제작합니다.',
  retry:'다시 생성',other_group:'기타',toast_noplan:'기획안 준비 완료 · 장별 카피 확인 후 생성',toast_nofirst:'상품 이미지를 먼저 올려주세요',
  toast_needtype:'이미지 유형을 1개 이상 선택하세요(AI 추천 가능)',gen_done:'생성 완료 · 총',gen_fail:'장 실패 · 개별 재시도 가능',no_success:'성공한 이미지가 없습니다',
  t_white_main:'흰색 메인',t_search_main:'검색 메인',t_core_selling:'핵심 포인트',t_selling_point:'셀링 포인트',t_icon_selling:'아이콘 포인트',t_material:'소재',t_scene_show:'생활 장면',t_multi_scene:'멀티 장면',t_competitor_compare:'경쟁 비교',t_usage_compare:'사용 전후',t_size_chart:'사이즈 차트',t_product_detail:'제품 디테일',t_hero:'히어로 배너',t_scene_atmosphere:'분위기',t_multi_angle:'다각도',t_series:'시리즈',t_ingredients:'성분',t_usage_guide:'사용 가이드',t_accessories:'액세서리',t_after_sales:'애프터 서비스',t_mood:'무드',t_f_model:'모델 착용',t_f_white:'흰색 배경',t_f_search:'검색 메인',t_f_selling:'셀링 포인트',t_f_icon:'아이콘 포인트',t_f_detail:'디테일',t_f_fabric:'원단 질감',t_f_angle:'다각도 뷰',t_f_seeding:'체험 콘텐츠',t_f_scene:'생활 장면',t_f_series:'시리즈',t_f_size:'사이즈 차트',p_generic:'범용(전 플랫폼 대응)',p_amazon:'Amazon',p_taobao:'Taobao/Tmall',p_jd:'JD',p_douyin:'Douyin',p_xhs:'Xiaohongshu',p_aliexpress:'AliExpress',p_shopee:'Shopee',p_tiktokshop:'TikTok Shop',r_generic:'글로벌',r_cn:'중국 본토',r_us:'북미(미국)',r_eu:'유럽',r_sea:'동남아시아',r_jp:'일본',r_kr:'한국',l_auto:'사이트 기준',m_auto:'자동 추천(Seedream 4.5)',plan_notready:'선택한 언어 기획안 생성 중입니다. 잠시 후 시작해 주세요'
 }
 };
 function t(k){var d=I18N_DICT['zh-CN'];if(d&&d[k]!=null)return d[k];return k;}
 function typeLabel(tp){var k='t_'+tp;var v=t(k);return (v===k)?(TYPE_LABELS[tp]||tp):v;}
 function fmtDur(sec){sec=Math.max(0,Math.round(sec));var m=Math.floor(sec/60),s=sec%60;return (m?m+t('min'):'')+s+t('sec');}

 var LOGO_FULL='<svg viewBox="0 0 118 19.13" aria-label="WorkHogee"><defs><style>.wb1{fill:#ffffff}.wb2{fill:#ea580c}</style></defs><g transform="translate(-1.06 -28.16)"><path class="wb1" d="M13,32.58,9.81,42.11a1.34,1.34,0,0,1-1.33,1.12h-2a1.35,1.35,0,0,1-1.29-.94L1.13,30a1.36,1.36,0,0,1,1.29-1.78h2a1.35,1.35,0,0,1,1.29.94l2.15,6.58L9.09,32a1.13,1.13,0,0,1,1.07-.74l1.68,0A1.06,1.06,0,0,1,13,32.58Z"/><path class="wb2" d="M12.88,43.23h2a1.38,1.38,0,0,0,1.3-.94l4-12.35a1.36,1.36,0,0,0-1.29-1.78h-2a1.35,1.35,0,0,0-1.3.93l-4,12.35A1.36,1.36,0,0,0,12.88,43.23Z"/><path class="wb1" d="M19.12,37.64a5.39,5.39,0,0,1,5.62-5.58,5.4,5.4,0,0,1,5.64,5.58,5.41,5.41,0,0,1-5.64,5.6A5.4,5.4,0,0,1,19.12,37.64Zm8.35,0a2.74,2.74,0,1,0-5.44,0c0,1.67,1,3.11,2.71,3.11A2.82,2.82,0,0,0,27.47,37.64Z"/><path class="wb1" d="M33.75,32.32a.43,.43,0,0,1,.43.43h0a.43,.43,0,0,0,.69.34,4.61,4.61,0,0,1,2.26-1,.4,.4,0,0,1,.45.4v1.82a.4,.4,0,0,1-.4.4h-.37a3.68,3.68,0,0,0-2.55,1.1.43,.43,0,0,0-.08.24c0,1,0,6.9,0,6.9h-2.4a.4,.4,0,0,1-.4-.4V32.73a.4,.4,0,0,1,.4-.41Z"/><path class="wb1" d="M42.25,39.39l-.64,.68a.58,.58,0,0,0-.15.39V42.4a.57,.57,0,0,1-.57.57H39.23a.56,.56,0,0,1-.57-.57V28.84a.56,.56,0,0,1,.57-.57h1.66a.57,.57,0,0,1,.57,.57v6.68a.57,.57,0,0,0,1,.37l2.86-3.37a.6,.4,0,0,1,.43-.2h1.93a.57,.57,0,0,1,.43,1L45,36.81a.57,.57,0,0,0,0,.71l3.39,4.54a.57,.57,0,0,1-.45.91H45.86a.56,.56,0,0,1-.47-.24l-2.25-3.28A.57,.57,0,0,0,42.25,39.39Z"/><text x="53" y="42.3" font-family="Trebuchet MS,Trebuchet,Lucida Sans Unicode,sans-serif" font-size="18" font-weight="400" fill="#ffffff">Hogee</text></g></svg>';

 var EMPTY_ART='<svg width="232" height="158" viewBox="0 0 232 158" fill="none"><g opacity=".9"><rect x="14" y="30" width="92" height="92" rx="16" fill="rgba(255,255,255,.045)" stroke="rgba(255,255,255,.18)" stroke-dasharray="5 5"/><circle cx="42" cy="58" r="8" fill="rgba(251,122,34,.55)"/><path d="M28 102l22-20 16 14 14-12 20 18" stroke="rgba(255,255,255,.4)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g><path d="M118 70h22" stroke="#fb7a22" stroke-width="2.4" stroke-linecap="round"/><path d="M132 64l8 6-8 6" stroke="#fb7a22" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><g><rect x="150" y="18" width="68" height="52" rx="11" fill="rgba(251,122,34,.16)" stroke="rgba(251,122,34,.5)"/><rect x="158" y="66" width="68" height="52" rx="11" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.2)"/><rect x="120" y="86" width="68" height="52" rx="11" fill="rgba(255,255,255,.04)" stroke="rgba(255,255,255,.16)"/></g></svg>';

 function el(html){var d=document.createElement('div');d.innerHTML=html;return d.firstChild;}
 var root=el('<div id="atuStudio"></div>');
 root.innerHTML=
  '<div class="ats-top"><div class="ats-tl"><a class="ats-logo" href="/" aria-label="WorkHogee">'+LOGO_FULL+'</a><span class="ats-crumb">阿图 · <b data-i18n="crumb_b">商品图操作台</b></span></div><div class="ats-tr"><span class="ats-pill">'+I.spark+'Alpha 内测 · 出图不限</span><button class="ats-back" id="atsBack" type="button" title="返回工作台">'+I.back+'</button></div></div>'+
  '<div class="ats-body">'+
   '<div class="ats-rail"><button class="ats-nav on" data-suite="ecom" type="button">'+I.bag+'<span data-i18n="nav_ecom">电商套图</span></button><button class="ats-nav" data-suite="fashion" type="button">'+I.hanger+'<span data-i18n="nav_fashion">服装套图</span></button><button class="ats-nav" data-suite="batch" type="button">'+I.layers+'<span data-i18n="nav_batch">批量套图</span></button><button class="ats-nav" data-suite="records" type="button">'+I.clock+'<span data-i18n="nav_records">生成记录</span></button></div>'+
   '<div class="ats-panel"><div class="ats-scroll" id="atsScroll">'+
     '<div class="ats-card"><div class="ats-ch"><div class="ats-ct" data-i18n="card_origin">商品原图</div><button class="ats-cs mut" id="atsClear" type="button"><span data-i18n="btn_clear">清空</span></button></div><div class="ats-thumbs" id="atsThumbs"></div><div class="ats-hint" data-i18n="origin_hint">同一商品可传多角度（最多 5 张），系统按一套处理；主参考图请选主体清晰、背景简洁的实拍图。</div></div>'+
     '<div class="ats-card"><div class="ats-ch"><div class="ats-ct" data-i18n="card_selling">商品卖点</div><button class="ats-cs" id="atsAiWrite" type="button">'+I.spark+'<span data-i18n="btn_aiwrite">AI 帮写</span></button></div><div id="atsSellingWrap"><textarea class="ats-ta" id="atsSelling" maxlength="2000" data-i18n-ph="selling_ph" placeholder="商品名称、核心卖点、适用人群、使用场景、规格参数都可以写在这里；没准备好就点「AI 帮写」，伙计看图先给你一版。"></textarea></div></div>'+
     '<div class="ats-card"><div class="ats-ch"><div class="ats-ct" data-i18n="card_settings">生成设置</div><button class="ats-cs mut" id="atsMoreBtn" type="button"><span data-i18n="btn_more">更多设置</span></button></div><div class="ats-grid">'+
       '<div class="ats-field"><label data-i18n="f_platform">电商平台</label><select id="setPlatform"><option value="generic">通用（全平台适配）</option><option value="amazon">亚马逊 Amazon</option><option value="taobao">淘宝/天猫</option><option value="jd" selected>京东</option><option value="douyin">抖音商城</option><option value="xiaohongshu">小红书</option><option value="aliexpress">速卖通 AliExpress</option><option value="shopee">Shopee</option><option value="tiktokshop">TikTok Shop</option></select></div>'+
       '<div class="ats-field"><label data-i18n="f_region">销售站点 / 区域</label><select id="setRegion"><option value="generic">通用</option><option value="CN" selected>国内（中国大陆）</option><option value="US">北美（美国）</option><option value="EU">欧洲</option><option value="SEA">东南亚</option><option value="JP">日本</option><option value="KR">韩国</option></select></div>'+
       '<div class="ats-field"><label data-i18n="f_lang">文案语种</label><select id="setLang"><option value="auto" selected>跟随站点</option><option value="en">English</option><option value="zh-CN">简体中文</option><option value="ja">日本語</option><option value="ko">한국어</option></select></div>'+
       '<div class="ats-field"><label data-i18n="f_q">清晰度</label><select id="setQ"><option>高清</option><option>标准</option><option>超清</option></select></div>'+
       '<div class="ats-field full"><label data-i18n="f_model">出图模型</label><select id="setModel"><option>智能推荐（Seedream 4.5）</option><option>即梦图片 4.5</option><option>即梦图片 4.0</option><option>改图模型 3.0</option><option>改图模型 2.5</option></select></div></div>'+
       '<div class="ats-more" id="atsMore"><div class="ats-field"><label>图片比例</label><select><option>智能适配图种</option><option>1:1</option><option>3:4</option><option>16:9</option></select></div><div class="ats-field"><label>文件格式</label><select><option>JPG</option><option>PNG（透明底）</option><option>WebP</option></select></div></div></div>'+
     '<div class="ats-card" id="planCard" style="display:none"><div class="ats-fold open" id="foldPlanText"><div class="ats-ct" data-i18n="plan_title">图文文案方案 <span class="ats-selcount" id="planCount"></span></div><span class="ats-chev"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></span></div><div class="ats-foldbody" style="display:flex" id="planTextBody"></div></div>'+
     '<div class="ats-card"><div class="ats-fold" id="foldPlan"><div class="ats-ct"><span data-i18n="style_title">智能视觉风格</span> <span style="font-size:11.5px;color:var(--tx3);font-weight:400" data-i18n="style_opt">（可选）</span></div><span class="ats-chev"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></span></div><div class="ats-foldbody"><div class="ats-switch-row"><span data-i18n="style_switch">智能风格推荐（关闭则由 AI 自动匹配）</span><button class="ats-sw" id="swStyle" type="button"></button></div><div class="ats-chips" id="styleChips" style="display:none">'+STYLE_TAGS.map(function(t,i){return '<button class="ats-chip" data-style="'+i+'" type="button">'+t+'</button>';}).join('')+'</div></div></div>'+
     '<div class="ats-card"><div class="ats-fold open" id="foldSuite"><div class="ats-ct" data-i18n="suite_title">套图选择 <span class="ats-selcount" id="selCount"></span></div><span class="ats-chev"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></span></div><div class="ats-foldbody" style="display:flex"><div style="display:flex;align-items:center;justify-content:space-between"><div class="ats-seg" id="suiteSeg"><button class="on" data-seg="main" type="button">套图</button><button data-seg="detail" id="segDetail" type="button">详情 / A+</button></div><button class="ats-cs" id="aiSelect" type="button"><span data-i18n="btn_aipick">AI 帮选</span></button></div><div class="ats-chips" id="suiteChips"></div></div></div>'+
   '</div><div class="ats-genbar"><div class="ats-free"><span class="ats-free-l" data-i18n="free_left">内测剩余额度：</span><b data-i18n="free_val">不限</b><span class="ats-free-n" data-i18n="free_note">（仅对成功出图计费，失败/审核未出图不扣费）</span></div><button class="ats-gen" id="atsGen" type="button"><span data-i18n="btn_start">开始生成</span></button></div></div>'+
   '<div class="ats-stage"><div class="ats-stage-tabs" id="stageTabs" style="display:none"><div class="ats-stage-tt"><span data-i18n="deliver">交付成品</span> <span class="cnt" id="stageCnt"></span></div><div class="ats-stage-ops"><button class="ats-obtn" id="dlAll" type="button">'+I.download+'<span data-i18n="btn_dlall">全部下载</span></button><button class="ats-obtn pri" id="toAwen" type="button">'+I.pen+'<span data-i18n="btn_toawen">交给阿文写文案</span></button></div></div><div class="ats-canvas" id="atsCanvas"></div></div>'+
  '</div><div class="ats-lb" id="atsLb"><button class="ats-lb-x" id="atsLbX" type="button">×</button><img id="atsLbImg" alt="成品大图"></div>'+
  '<div class="ats-srcmenu" id="atsSrcMenu"></div>';
 document.body.appendChild(root);

 var S={root:root,suite:'ecom',seg:'main',ats:[],sel:{},planResp:null,planByType:{},ostEdits:{},_running:false,_abort:false,_paused:false,_cleanImage:null,_failed:{},_totalTasks:0,_doneTasks:0,_progMsg:'',
  $:function(sel){return root.querySelector(sel);},
  isOpen:function(){return document.body.classList.contains('atu-open');},
  open:function(){
   document.body.classList.add('atu-open');
   try{if(typeof exitTaskFocus==='function')exitTaskFocus();}catch(e){}
   this._lastErr=null;
   this._restoreSession(); // 有已存会话则自动恢复（刷新/重登后接着看）
   this.applyI18n();this.renderOrigin();this.renderSuiteChips();this.updateSelCount();this._syncGenBtn();
   if(this.ats&&this.ats.length)this.setCanvas('result');else this.setCanvas('empty');
  },
  /* ================= 会话持久化（localStorage，刷新/重登不丢） ================= */
  SESSION_KEY:'hogee_atu_session_v1',
  hasSavedSession:function(){try{return !!localStorage.getItem(this.SESSION_KEY);}catch(e){return false;}},
  _compress:function(dataUrl){
   return new Promise(function(res){
    if(!dataUrl||dataUrl.indexOf('data:image/')!==0)return res(dataUrl);
    var im=new Image();
    im.onload=function(){
     try{
      var MAX=1000,w=im.width,h=im.height;
      if(!w||!h)return res(dataUrl);
      if(w<=MAX&&h<=MAX)return res(dataUrl);
      var k=MAX/Math.max(w,h),cv=document.createElement('canvas');
      cv.width=Math.round(w*k);cv.height=Math.round(h*k);
      cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);
      res(cv.toDataURL('image/jpeg',0.72));
     }catch(e){res(dataUrl);}
    };
    im.onerror=function(){res(dataUrl);};
    im.src=dataUrl;
   });
  },
  _saveSession:function(){ // 关键节点防抖保存；体积感知：超限先丢图，方案+成品优先保留
   clearTimeout(this._svT);var self=this;
   this._svT=setTimeout(function(){
    var imgs=(GS()&&GS().images)||[];
    Promise.all(imgs.map(function(it){return self._compress(it.dataUrl);})).then(function(cd){
     var s={v:1,ts:Date.now(),
      platform:self.platform(),region:self.locale(),lang:(self.$('#setLang')||{}).value||'auto',
      suite:self.suite,seg:self.seg,sel:self.sel,
      planResp:self.planResp,planRespLang:self.planRespLang,planByType:self.planByType,ostEdits:self.ostEdits,
      selling:(self.$('#atsSelling')||{}).value||'',
      results:self.ats.map(function(r){return {url:r.url,label:r.label,type:r.type,ts:r.ts||Date.now()};}),
      notes:self._notes||[],images:cd};
     try{localStorage.setItem(self.SESSION_KEY,JSON.stringify(s));}
     catch(e){try{s.images=[];localStorage.setItem(self.SESSION_KEY,JSON.stringify(s));}catch(e2){}
     }
    });
   },400);
  },
  _clearSession:function(){try{localStorage.removeItem(this.SESSION_KEY);}catch(e){}},
  _restoreSession:function(){
   var raw=null;try{raw=localStorage.getItem(this.SESSION_KEY);}catch(e){}
   if(!raw)return;var s=null;try{s=JSON.parse(raw);}catch(e){}
   if(!s||s.v!==1)return;
   if(s.platform){var p=this.$('#setPlatform');if(p)p.value=s.platform;}
   if(s.region){var r=this.$('#setRegion');if(r)r.value=s.region;}
   if(s.lang){var l=this.$('#setLang');if(l)l.value=s.lang;}
   if(s.suite)this.suite=s.suite;
   if(s.seg)this.seg=s.seg;
   root.querySelectorAll('.ats-nav').forEach(function(n){n.classList.toggle('on',n.dataset.suite===(s.suite||'ecom'));});
   if(Array.isArray(s.images)&&s.images.length){if(!GS().images)GS().images=[];GS().images=s.images.map(function(d){return {dataUrl:d,qc:{}};});}
   if(s.planResp)this.planResp=s.planResp;
   this.planRespLang=s.planRespLang||null;
   this.planByType=s.planByType||{};this.ostEdits=s.ostEdits||{};this.sel=s.sel||{};
   if(Array.isArray(s.results)&&s.results.length){this.ats=s.results.map(function(r){return {url:r.url,label:r.label,type:r.type||'',ts:r.ts||Date.now()};});}
   if(s.selling){var ta=this.$('#atsSelling');if(ta)ta.value=s.selling;}
   if(Array.isArray(s.notes))this._notes=s.notes;
  },
  /* ---- i18n：把带 data-i18n / data-i18n-ph 的静态文案随当前语种刷一遍 ---- */
  applyI18n:function(){
   var self=this;
   root.querySelectorAll('[data-i18n]').forEach(function(n){
    var v=t(n.getAttribute('data-i18n'));
    // 含 <span class="ats-selcount"> 等子节点的容器：只替换首个文本，不覆盖子节点
    var sp=n.querySelector('.ats-selcount');
    if(sp){n.childNodes[0].nodeValue=v+' ';}
    else n.textContent=v;
   });
   root.querySelectorAll('[data-i18n-ph]').forEach(function(n){n.placeholder=t(n.getAttribute('data-i18n-ph'));});
   // 按钮文字（更多设置/收起）
   var mb=this.$('#atsMoreBtn');if(mb)mb.innerHTML=(this.$('#atsMore').classList.contains('show')?t('btn_less'):t('btn_more'));
   // 下拉选项标签随语种
   var PL={generic:'p_generic',amazon:'p_amazon',taobao:'p_taobao',jd:'p_jd',douyin:'p_douyin',xiaohongshu:'p_xhs',aliexpress:'p_aliexpress',shopee:'p_shopee',tiktokshop:'p_tiktokshop'};
   var RG={generic:'r_generic',CN:'r_cn',US:'r_us',EU:'r_eu',SEA:'r_sea',JP:'r_jp',KR:'r_kr'};
   function relabel(selId,map){var el=self.$(selId);if(!el)return;[].forEach.call(el.options,function(o){var k=map[o.value];if(k)o.textContent=t(k);});}
   relabel('#setPlatform',PL);relabel('#setRegion',RG);
   var sl=this.$('#setLang');if(sl){var ao=sl.querySelector('option[value="auto"]');if(ao)ao.textContent=t('l_auto');}
   var md=this.$('#setModel');if(md&&md.options[0])md.options[0].textContent=t('m_auto');
   this.renderSuiteChips();this.renderPlanText();this.updateSelCount();
  },
  close:function(){
   if(this._running){if(!confirm('伙计正在出图，确定离开吗？已生成的成品会保留。'))return;}
   this._abortAll();this._running=false;
   document.body.classList.remove('atu-open');
   try{if(typeof goHome==='function')goHome();}catch(e){}
  },
  /* ---- 生成设置取值（契约 §2 枚举） ---- */
  platform:function(){return this.$('#setPlatform').value||'generic';},
  locale:function(){return this.$('#setRegion').value||'generic';},
  resolvedLang:function(){var l=this.$('#setLang').value;if(l&&l!=='auto')return l;return LOCALE_LANG[this.locale()]||'zh-CN';},
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
    return '<button class="ats-chip'+(self.sel[p[0]]?' on':'')+'" data-type="'+p[0]+'" type="button">'+esc(typeLabel(p[0]))+'</button>';
   }).join('');
   box.querySelectorAll('.ats-chip').forEach(function(c){c.addEventListener('click',function(){var t=c.dataset.type;self.sel[t]=!self.sel[t];c.classList.toggle('on',!!self.sel[t]);self.updateSelCount();self._saveSession();});});
   var sd=this.$('#segDetail');if(sd)sd.style.display=(this.suite==='fashion')?'none':'';
   this.updateSelCount();
  },
  updateSelCount:function(){
   var n=Object.keys(this.sel).filter(function(k){return S.sel[k];}).length;
   var c=this.$('#selCount');if(c)c.textContent=t('sel_n')+' '+n+' '+t('sel_unit');
  },
  setSuite:function(s){
   if(s==='batch'){toast('批量套图即将上线，本期可逐商品创建');s='ecom';}
   if(s==='records'){toast('生成记录在左侧「我的创作」里，可按创作主线查看');s='ecom';}
   this.suite=s;this.sel={};this.planResp=null;this.planByType={};this.ostEdits={};
   this._clearSession();
   var pc=this.$('#planCard');if(pc)pc.style.display='none';
   root.querySelectorAll('.ats-nav').forEach(function(n){n.classList.toggle('on',n.dataset.suite===s);});
   this.renderSuiteChips();
  },
  /* 生成按钮门控：当前语种的方案未就绪时不可点，杜绝旧语种方案被拿去出图 */
  _syncGenBtn:function(){
   var b=this.$('#atsGen');if(!b)return;
   var ready=this.planResp&&(this.planRespLang===this.resolvedLang());
   b.disabled=!!this._planRunning||!ready;
   b.style.opacity=b.disabled?'.5':'';b.style.cursor=b.disabled?'not-allowed':'';
  },
  /* === /marketing/plan：卖点 + 图种规划 + on_screen_text === */
  runPlan:function(){
   if(this._planRunning)return; // 防重入：自动触发/追加上传并发点击时只跑一轮
   var imgs=(GS()&&GS().images)||[];if(!imgs.length){toast(t('toast_nofirst'),'err');return;}
   this._planRunning=true;
   this._planSeq=(this._planSeq||0)+1;var mySeq=this._planSeq; // 方案请求序号：语种变化后只认最新一次
   this._syncGenBtn();
   var self=this;
   var sellingTa=this.$('#atsSelling'),sellingText=sellingTa?sellingTa.value:'';
   var wrap=this.$('#atsSellingWrap');if(wrap)wrap.innerHTML='<div class="ats-spin">'+SPIN+t('planning')+'</div>';
   (async function(){
    try{
    var body={images:imgs.map(function(x){return x.dataUrl;}).slice(0,5),
     kit_type:self.kitType(),platform:self.platform(),locale:self.locale(),language:self.resolvedLang(),
     selling_text:sellingText,selected_types:self.selectedTypes()};
    var j=null;try{j=await authPost('/marketing/plan',body,180000);}catch(e){j=null;}
    if(mySeq!==self._planSeq){self._planRunning=false;return;} // 语种/平台已变，旧方案作废，不落地
    // 还原 textarea（保留 data-i18n-ph 占位）
    if(wrap){wrap.innerHTML='<textarea class="ats-ta" id="atsSelling" maxlength="2000" data-i18n-ph="selling_ph" placeholder="'+esc(t('selling_ph'))+'"></textarea>';}
    var ta=wrap&&wrap.querySelector('#atsSelling');
    if(j&&j.ok){
     if(j.kit_type==='fashion'&&self.suite!=='fashion')self.setSuite('fashion');
     self.planResp=j;self.planRespLang=j.language||self.resolvedLang(); // 记录方案语种，防止旧英文方案被用于中文/日文出图
     self.planByType={};self.ostEdits={};
     (j.plan||[]).forEach(function(e){self.planByType[e.type]=e;});
     var p=j.product||{},lines=[];
     if(p.brand)lines.push(t('l_brand')+'：'+p.brand);
     if(p.name)lines.push(p.name);
     if(p.model)lines.push(t('l_model')+'：'+p.model);
     if(Array.isArray(p.core_points))p.core_points.forEach(function(c){lines.push('· '+c);});
     if(p.audience)lines.push(t('l_audience')+'：'+p.audience);
     var L=self.resolvedLang(),sk=(L==='ja')?'ja':((L==='ko')?'ko':((L==='zh-CN')?'zh':''));
     if(Array.isArray(p.scenes))p.scenes.forEach(function(s){lines.push(t('l_scene')+'：'+(s[sk]||s.en||s.zh||''));});
     if(Array.isArray(p.materials)&&p.materials.length)lines.push(t('l_material')+'：'+p.materials.join(' / '));
     if(Array.isArray(p.specs)&&p.specs.length)lines.push(t('l_spec')+'：'+p.specs.join(' / '));
     if(ta)ta.value=lines.join('\n')||sellingText;
     self.sel={};(j.recommended_types||[]).forEach(function(tp){self.sel[tp]=true;});
     self.renderSuiteChips();self.updateSelCount();self.renderPlanText();
     self._saveSession();
     toast(t('toast_noplan'));
    }else{
     if(ta)ta.value=sellingText;
     // 后端未就绪时软降级：保留旧 /copy 帮写卖点，不阻断手动出图
     self._fallbackCopy(ta);
    }
    if(ta)ta.addEventListener('input',function(){this.style.height='auto';this.style.height=Math.min(this.scrollHeight,260)+'px';self._saveSession();});
    }finally{self._planRunning=false;self._syncGenBtn();self._saveSession();}
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
  /* 轨道A 纯抠图图种：本就无文字槽位，不再渲染主/副标题空框（排版乱的根因之一） */
  NOTEXT_TYPES:{white_main:1,search_main:1,f_white:1,f_search:1},
  renderPlanText:function(){
   var card=this.$('#planCard');if(!card)return;var list=(this.planResp&&this.planResp.plan)||[];
   if(!list.length){card.style.display='none';return;}
   card.style.display='';var body=this.$('#planTextBody');var self=this;
   var NT=this.NOTEXT_TYPES;
   body.innerHTML=list.map(function(e){
    var ost=e.on_screen_text||{};
    var icons=(ost.icons||[]).map(function(i){return i.label||'';}).filter(Boolean).join(', ');
    var rows='';
    if(NT[e.type]){
     rows='<div class="ats-ost-note">'+esc(t('ost_notext'))+'</div>';
    }else{
     // 只渲染后端真正给了内容的文字槽：不留空白「可空」表单堆给客户
     rows+='<input class="ats-ost-inp" data-f="headline" value="'+esc(ost.headline||'')+'" placeholder="'+esc(t('ph_headline'))+'">';
     if(ost.subheadline)rows+='<input class="ats-ost-inp" data-f="subheadline" value="'+esc(ost.subheadline)+'" placeholder="'+esc(t('ph_sub'))+'">';
     if(icons)rows+='<input class="ats-ost-inp" data-f="iconLabels" value="'+esc(icons)+'" placeholder="'+esc(t('ph_icons'))+'">';
    }
    return '<div class="ats-ost" data-osttype="'+e.type+'">'+
     '<div class="ats-ost-h">'+esc(typeLabel(e.type))+' <span>'+esc(e.ratio||'')+'</span></div>'+rows+
    '</div>';
   }).join('');
   body.querySelectorAll('.ats-ost-inp').forEach(function(inp){
    inp.addEventListener('input',function(){
     var block=inp.closest('.ats-ost');var tp=block.dataset.osttype;
     self.ostEdits[tp]=self.ostEdits[tp]||{};self.ostEdits[tp][inp.dataset.f]=inp.value;
     self._saveSession();
    });
   });
   var pc=this.$('#planCount');if(pc)pc.textContent=list.length+' '+t('plan_editable');
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
   if(mode==='empty'){tabs.style.display='none';this._stopEtaTimer();var eb=this._lastErr?'<div class="ats-errbox"><div>'+esc(this._lastErr)+'</div><button id="atsRetryGen" type="button">'+esc(t('retry'))+'</button></div>':'';c.innerHTML='<div class="ats-empty"><div class="ats-empty-art">'+EMPTY_ART+'</div><h2>'+esc(t('empty_h2'))+'</h2><p>'+esc(t('empty_p'))+'</p>'+eb+'</div>';var rb=c.querySelector('#atsRetryGen');if(rb){var self2=this;rb.addEventListener('click',function(){self2._lastErr=null;self2.generate();});}}
   else if(mode==='progress'){tabs.style.display='none';c.innerHTML='<div class="ats-prog"><div class="ats-prog-ring"><svg width="120" height="120"><circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="8"/><circle id="progRing" cx="60" cy="60" r="52" fill="none" stroke="#fb7a22" stroke-width="8" stroke-linecap="round" stroke-dasharray="326.7" stroke-dashoffset="326.7"/></svg><div class="pg-txt"><div><b id="progPct">0</b>%</div></div></div><div class="ats-prog-msg" id="progMsg">'+esc(t('prog_ready'))+'</div><div class="ats-prog-note">'+esc(t('why_wait'))+'</div><button class="ats-stop" id="progStop" type="button">'+I.stop+'<span>'+esc(t('btn_stop_full'))+'</span></button></div>';var self=this;c.querySelector('#progStop').addEventListener('click',function(){self._abortAll();});this._startEtaTimer();this.paintLiveInfo();}
   else if(mode==='result'){this.paint();}
  },
  setProgMsg:function(m){this._progMsg=m;this.paintLiveInfo();},
  /* ---- 等待体验：耗时记录 + 滑动平均 ETA + 进行中张并列展示 ---- */
  _etaSec:function(){
   var total=this._totalTasks||0,rem=Math.max(0,total-this._doneTasks);
   if(!rem)return 0;
   var d=(this._durations||[]).slice(-5);
   var avg=d.length?(d.reduce(function(a,b){return a+b;},0)/d.length/1000):85; // 无实测时前置估算 ~85s/张
   var c=Math.max(1,this.GEN_CONCURRENCY||2); // 并发池：剩余张按并发折算墙钟
   return Math.ceil(Math.ceil(rem/c)*avg);
  },
  _activeLabels:function(){return Object.keys(this._activeTasks||{}).map(typeLabel);},
  _ringMsg:function(){
   var act=this._activeLabels();
   if(act.length)return t('doing_prefix')+'：'+act.join('、');
   return this._progMsg||t('prog_ready');
  },
  paintLiveInfo:function(){
   var done=this._doneTasks||0,total=this._totalTasks||0;
   var lb=this.$('#lbCount');if(lb)lb.textContent=done+'/'+total;
   var eta=this._etaSec(),act=this._activeLabels();
   var e=this.$('#lbEta');
   if(e){ // 任何阶段都给合理文案：100% 显示完成；暂停显示暂停；否则显示 ETA
    if(total&&done>=total)e.innerHTML=' · '+esc(t('done_prefix'));
    else if(this._paused)e.innerHTML=' · '+esc(t('btn_pause'));
    else if(eta>0)e.innerHTML=' · '+esc(t('eta_prefix'))+' '+fmtDur(eta);
    else e.innerHTML='';
   }
   var d=this.$('#lbDoing');
   if(d)d.innerHTML=act.length?(' <span>'+esc(t('doing_prefix'))+'：</span>'+act.map(function(a){return '<span class="ats-doing">'+esc(a)+'</span>';}).join(' ')):'';
   var pm=this.$('#progMsg');if(pm)pm.textContent=this._ringMsg();
   var pp=this.$('#progPct');if(pp)pp.textContent=total?Math.round(done/total*100):0;
   var ring=this.$('#progRing');if(ring){var off=326.7*(1-(total?done/total:0));ring.setAttribute('stroke-dashoffset',off);}
  },
  _startEtaTimer:function(){this._stopEtaTimer();var self=this;this._etaTimer=setInterval(function(){if(self._running)self.paintLiveInfo();else self._stopEtaTimer();},1000);},
  _stopEtaTimer:function(){if(this._etaTimer){clearInterval(this._etaTimer);this._etaTimer=null;}},
  addNote:function(t){this._notes=this._notes||[];this._notes.push(t);},
  addResult:function(url,label,type){
   var r={url:url,label:label,type:type||'',ts:Date.now()};this.ats.push(r);
   this._saveSession();
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
    head='<div class="ats-livebar"><div class="ats-livebar-l"><b id="lbCount">'+done+'/'+total+'</b><span id="lbDoing"></span><span id="lbEta"></span></div><div class="ats-livebar-r"><button class="ats-obtn" id="btnPause" type="button">'+(this._paused?I.play:I.pause)+'<span>'+(this._paused?esc(t('btn_resume')):esc(t('btn_pause')))+'</span></button><button class="ats-obtn" id="btnStop" type="button">'+I.stop+'<span>'+esc(t('btn_stop'))+'</span></button></div></div><div class="ats-livebar-track"><div style="width:'+pct+'%"></div></div>';
   }
   tabs.style.display=this.ats.length?'flex':'none';
   var cnt=this.$('#stageCnt');if(cnt)cnt.textContent=this.ats.length+' '+t('deliver_unit');
   var notesHtml=(this._notes||[]).map(function(n){return '<div class="ats-warnline">'+esc(n)+'</div>';}).join('');
   var order=this.selectedTypes();
   var groups='',rendered={};
   order.forEach(function(gt){
    var items=self.ats.filter(function(r){return r.type===gt;});if(!items.length)return;rendered[gt]=1;
    groups+='<div class="ats-tgroup"><div class="ats-tgroupt">'+esc(typeLabel(gt))+' <span>'+items.length+' '+esc(t('deliver_unit'))+'</span></div><div class="ats-grid2">'+items.map(function(r){return self._cellHtml(r);}).join('')+'</div></div>';
   });
   var extra=this.ats.filter(function(r){return !rendered[r.type]&&r.type;});
   if(extra.length)groups+='<div class="ats-tgroup"><div class="ats-tgroupt">'+esc(t('other_group'))+' <span>'+extra.length+' '+esc(t('deliver_unit'))+'</span></div><div class="ats-grid2">'+extra.map(function(r){return self._cellHtml(r);}).join('')+'</div></div>';
   c.innerHTML=head+notesHtml+groups;
   this.paintLiveInfo();
   c.querySelectorAll('[data-zoom]').forEach(function(im){im.addEventListener('click',function(){self.openLb(self.ats[+im.dataset.zoom].url);});});
   c.querySelectorAll('[data-dl]').forEach(function(b){b.addEventListener('click',function(){self.download(self.ats[+b.dataset.dl]);});});
   c.querySelectorAll('[data-redo]').forEach(function(b){b.addEventListener('click',function(){self.redo(+b.dataset.redo);});});
   var bp=c.querySelector('#btnPause');if(bp)bp.addEventListener('click',function(){self._paused=!self._paused;self.paint();});
   var bs=c.querySelector('#btnStop');if(bs)bs.addEventListener('click',function(){self._abortAll();});
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
    toast('重做'+typeLabel(t)+'（轨道A 保真）…');
    (async function(){
     var cat=(GS().identity&&GS().identity.cat)||'',pn=(GS().product&&GS().product.name)||'这款商品';
     var out=null;try{out=await GF().package({call:retryCall,image:GS().images[0].dataUrl,category:cat,product:pn,doDetails:false,doScene:false});}catch(e){out=null;}
     if(out&&out.rejected){toast('抠图保真仍不达标，请换纯色背景重拍','err');return;}
     if(out&&out.ok&&out.white){self._cleanImage=out.white;self.replaceResultByType(t,out.white);self.paint();toast('重做完成');}
     else toast('重做失败，稍后再试','err');
    })();return;
   }
   toast('重做'+typeLabel(t)+'…');
   (async function(){
    await self.makeMarketingRef();
    var req={image:self._mktRef||self._cleanImage,type:t,size:self.planSize(t),language:self.resolvedLang(),on_screen_text:self.ostForType(t),product_facts:self.buildProductFacts(),domain:(self.planResp&&self.planResp.product?self.planResp.product.domain:''),scenes:(self.planResp&&self.planResp.product?self.planResp.product.scenes:[]),design_requirements:''};
    var j=null;try{j=await authPost('/marketing/generate',req,150000);}catch(e){j=null;}
    if(j&&j.ok){var fin=await self.resolveResultImage(j);if(fin){self.replaceResultByType(t,fin);self.paint();toast('重做完成');return;}}
    toast('重做失败：'+((j&&j.error&&j.error.message)||'稍后再试'),'err');
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
  /* 单次营销生成：429/限流做指数退避、瞬时网络/超时自动重试（失败/审核未出图本就不计费） */
  _isRateLimit:function(j){
   if(!(j&&j.ok===false))return false;
   var c=j.error&&(j.error.code||''),m=(j.error&&j.error.message)||'';
   return /429|rate.?limit|too.?many|quota|频率|限流|繁忙|频繁/i.test(c+' '+m);
  },
  genMarketing:function(req){
   var self=this;var REQ_TIMEOUT=150000; // 后端含一次 QC 重生成，给足硬超时
   var ac=new AbortController();(self._reqAborts=self._reqAborts||{})[req.type]=ac; // 在途请求可被「终止任务」真正 abort
   return (async function(){
    var j=await authPost('/marketing/generate',req,REQ_TIMEOUT,{signal:ac.signal});
    if(j&&j.ok)return j;
    if(self._abort)return j;
    var backoff=1800,tries=0;
    while(tries<2){
     if(self._abort)return j;
     if(self._isRateLimit(j))backoff=Math.min(backoff*2,9000);      // 429 退避
     else if(_isNetErr(j))backoff=Math.min(backoff*1.6,6000);        // 瞬时网络抖动
     else break;                                                      // 业务失败（审核拒绝/参数）不重试
     await _sleep(backoff);
     if(self._abort)return j;
     j=await authPost('/marketing/generate',req,REQ_TIMEOUT,{signal:ac.signal});
     if(j&&j.ok)return j;
     tries++;
    }
    return j;
   })();
  },
  /* ========== r-background 联合背景（产品保真）：前端编排 ========== */
  RBG_TYPES:{core_selling:1,selling_point:1,icon_selling:1,material:1,scene_show:1,product_detail:1,multi_scene:1,mood:1,hero:1,scene_atmosphere:1,ingredients:1},
  _layCfg:{
   scene_show:{cx:.50,bottom:.93,h:.64},mood:{cx:.42,bottom:.90,h:.66},scene_atmosphere:{cx:.5,bottom:.95,h:.72},
   selling_point:{cx:.50,bottom:.97,h:.76},hero:{cx:.5,bottom:.96,h:.78},
   core_selling:{cx:.50,bottom:.97,h:.74},icon_selling:{cx:.5,bottom:.66,h:.52},ingredients:{cx:.5,bottom:.60,h:.48},
   material:{cx:.5,bottom:.95,h:.72},product_detail:{cx:.5,bottom:.95,h:.80},
   default:{cx:.5,bottom:.95,h:.72}
  },
  _sceneEnv:{
   lifestyle:'a bright airy real-life setting with soft natural daylight and tasteful context props, gentle background blur, warm inviting commercial lifestyle photography',
   hero:'a clean premium studio-lifestyle setting, soft gradient backdrop with gentle bokeh, cinematic key light, aspirational premium mood',
   info:'a clean modern minimalist studio, smooth neutral light-gray backdrop, soft even lighting, subtle soft shadows, uncluttered premium commercial look',
   macro:'a soft neutral seamless backdrop, gentle diffused lighting, delicate soft highlights, refined texture, elegant premium product close-up',
   mood:'an atmospheric cinematic scene, soft moody light, gentle haze, rich color grading, emotional premium ambiance'
  },
  _typeScene:{scene_show:'lifestyle',mood:'mood',scene_atmosphere:'mood',selling_point:'hero',hero:'hero',core_selling:'info',icon_selling:'info',ingredients:'info',material:'macro',product_detail:'macro'},
  /* 品类无关「姿态/支撑」判定（基于产品真实形态，不联网、不依赖品牌）：整套只判一次 */
  detectPose:function(fg){
   var self=this;
   return (async function(){
    try{
     var ask='请只看这张已抠图商品（透明底），判断它在真实世界的自然放置方式，只输出JSON：'+
      '{"pose":"stand|hang|hand|lay","loop":false,"loopPos":"top|bottom|side|none","flatBase":false}。'+
      'stand=底部能竖直立在台面/地面（多数家电、3C、瓶罐、箱包、可自立的便携吹风机）；'+
      'hang=挂环/挂孔位于产品【上部】、挂点在重心之上、设计为悬挂（淋浴挂件、挂饰）；'+
      'hand=主要靠手握且无法自立；lay=平放或斜靠。'+
      '特别注意：若挂环在产品【最底端】（例如吹风机手柄底端的电源线收纳小环），这不是悬挂，产品仍竖直放置=stand。'+
      '"loop"=是否带挂环/孔；"loopPos"=挂环位置 top上部/bottom底端/side侧面/none无；"flatBase"=底部是否为可自立平整面。';
     var r=await authPost('/vision-json',{image:fg,ask:ask,system:'你是严谨的视觉分析助手，只输出JSON。',maxTokens:400},60000);
     if(r&&r.ok&&r.data){
      var p=['stand','hang','hand','lay'].indexOf(r.data.pose)>=0?r.data.pose:'stand';
      var loopTop=r.data.loopPos==='top';
      if(p==='hang'&&!loopTop)p=r.data.flatBase?'stand':'hand';   // 挂点不在上部 → 不悬挂
      if(p==='stand'&&loopTop&&!r.data.flatBase)p='hang';        // 上部挂点且无平底 → 悬挂
      return {pose:p,loop:!!r.data.loop,loopPos:r.data.loopPos||'none',flatBase:!!r.data.flatBase};
     }
    }catch(e){}
    return {pose:'stand',loop:false,loopPos:'none',flatBase:true};
   })();
  },
  ensurePose:function(fg){
   if(!this._posePromise)this._posePromise=this.detectPose(fg);
   return this._posePromise;
  },
  buildRbgPrompt:function(type,o,pose){
   o=o||{};pose=pose||'stand';var group=this._typeScene[type]||'info';var domain=String(o.domain||'product').toLowerCase();
   var keep='Photorealistic commercial product photo. The product (already cut out and placed on this transparent canvas) must keep its EXACT real shape, proportions, colors, materials and every printed label, logo and text on its packaging. Do NOT redraw, repaint, warp, distort, erase or alter the product. The generated BACKGROUND must contain absolutely NO words, letters, numbers, captions, logos, price tags, posters, stickers or watermarks.';
   var sceneTypes={scene_show:1,mood:1,scene_atmosphere:1};
   var place;
   if(pose==='hang'||pose==='hand'){
    place='The product is ALREADY hanging on the simple support already drawn on the canvas. Render only a real photographic bright room wall behind it (tidy bathroom / entry / bedroom), soft natural daylight, gentle background blur, clear empty wall below. Do NOT add any hook, rail, rod, bracket, shelf, table, counter, pedestal, box, package or furniture — the support and product already exist.';
   }else if(sceneTypes[type]){
    place='Place the product standing upright in a real photographic interior with strong depth: a real foreground floor, a mid-ground and a distant softly blurred recognizable room (bright bathroom / bedroom / hotel / living room), large windows with natural daylight ('+this._sceneEnv[group]+'). The product stands directly on the real floor with a thin soft contact shadow and a subtle floor reflection. A few tasteful distant props may appear far in the background but must never touch or surround the product.';
   }else{
    place='The product stands upright in front of a clean bright light-gray wall that is a completely smooth, flat, even, seamless solid surface with absolutely NO surface texture, soft even studio lighting, a subtle smooth vertical gradient and a faint horizontal surface line near the bottom; minimal, premium and uncluttered. Render a thin soft contact shadow where it meets the surface.';
   }
   var cord='If the product has a short power cord at its base, the cord rests naturally on the surface right beside the base with a slight curve; it must NOT extend away, hang into the distance, or plug into any block, box, tank, socket or object.';
   var ban='CRITICAL: NO fabric, cloth, woven or textile weave texture filling the frame, NO noisy speckled or knitted texture, NO pedestal, cube, acrylic block, glass water tank, rubble, stones, rocks, floating platform, box, package, paper, table or shelf inserted under or around the product, and NO text anywhere in the background.';
   return keep+' '+place+' '+cord+' '+ban+' High detail, sharp focus on the product, professional e-commerce advertising photo, natural color.'+(o.variant?(' '+o.variant):'');
  },
  layoutCutout:function(fg,type,sizeStr,pose){
   var self=this;return new Promise(function(res,rej){
    var sz=String(sizeStr||'1920x1920').split('x'),W=+sz[0]||1920,H=+sz[1]||1920;
    var im=new Image();
    im.onload=function(){
     var cfg=self._layCfg[type]||self._layCfg.default;
     var cv=document.createElement('canvas');cv.width=W;cv.height=H;var ctx=cv.getContext('2d');
     var dw,dh,px,py,sc;
     if(pose==='hang'||pose==='hand'){
      // 悬挂：产品挂环扣在「确定性绘制的水平墙杆」上，杆压在环前形成真实遮挡；整体悬空、下方留空
      dh=H*0.56;sc=dh/im.naturalHeight;dw=im.naturalWidth*sc;
      px=W*cfg.cx-dw/2;
      var railY=H*0.155,py=railY-H*0.012;
      ctx.drawImage(im,px,py,dw,dh);
      var x1=W*0.10,x2=W*0.90,rr=H*0.011;
      var rg=ctx.createLinearGradient(0,railY-rr,0,railY+rr);
      rg.addColorStop(0,'#7c8185');rg.addColorStop(0.34,'#d6d9db');rg.addColorStop(0.5,'#f3f5f6');rg.addColorStop(0.66,'#c0c4c7');rg.addColorStop(1,'#696e72');
      ctx.fillStyle=rg;ctx.fillRect(x1,railY-rr,x2-x1,rr*2);
      ctx.fillStyle='#999fa3';
      [x1,x2].forEach(function(x){ctx.beginPath();ctx.arc(x,railY,rr*1.95,0,Math.PI*2);ctx.fill();});
     }else{
      dh=H*cfg.h;sc=dh/im.naturalHeight;dw=im.naturalWidth*sc;
      px=W*cfg.cx-dw/2;py=H*cfg.bottom-dh;
      ctx.drawImage(im,px,py,dw,dh);
     }
     res(cv.toDataURL('image/png'));
    };
    im.onerror=function(){rej(new Error('fg_fail'));};im.src=fg;
   });
  },
  buildTextLayersFE:function(recipe,ost){
   var L=[];
   function clean(t){return String(t==null?'':t).replace(/^\s*\d{1,2}\s*[.、)]\s*/,'').replace(/^\s*[•·\-▪◦▫]\s*/,'').trim();}
   function push(s,t,x,y,w,h,o){t=clean(t);if(!t)return;o=o||{};L.push({slot:s,text:t,x:x,y:y,w:w,h:h,align:o.align||'left',baseline:o.baseline||'body',color:o.color||'#141b28',bold:!!o.bold,max_lines:o.max_lines||2});}
   var hl=String(ost.headline||'').trim(),sub=String(ost.subheadline||'').trim();
   var icons=(ost.icons||[]).slice(0,6),panels=(ost.panels||[]).slice(0,3);
   if(recipe==='core_selling'){
    push('headline',hl,.06,.07,.88,.15,{baseline:'h1',bold:true,max_lines:2});
    if(sub)push('sub',sub,.06,.23,.84,.09,{baseline:'body'});
   }else if(recipe==='selling_point'||recipe==='hero'){
    push('headline',hl,.06,.07,.88,.15,{baseline:'h1',bold:true,max_lines:2});
    if(sub)push('sub',sub,.06,.23,.84,.09,{baseline:'body'});
   }else if(recipe==='scene_show'){
    push('headline',hl,.05,.06,.9,.15,{baseline:'h1',bold:true,max_lines:2});
    if(sub)push('sub',sub,.05,.22,.86,.09,{baseline:'body'});
   }else if(recipe==='mood'||recipe==='scene_atmosphere'){
    push('headline',hl,.07,.08,.72,.12,{baseline:'h2',bold:true,color:'#FFFFFF',max_lines:1});
   }else if(recipe==='material'){
    push('headline',hl,.06,.07,.88,.13,{baseline:'h2',bold:true,max_lines:2});
    if(sub)push('sub',sub,.06,.21,.84,.08,{baseline:'body'});
   }else if(recipe==='product_detail'){
    push('headline',hl,.06,.07,.88,.14,{baseline:'h2',bold:true,max_lines:2});
    if(sub)push('sub',sub,.06,.22,.84,.08,{baseline:'body'});
   }else if(recipe==='icon_selling'||recipe==='ingredients'){
    push('headline',hl,.08,.05,.84,.12,{baseline:'h1',bold:true,align:'center',max_lines:2});
    icons.forEach(function(ic,i){var col=i%3,row=Math.floor(i/3);push('ic'+i,ic.label,.08+col*.30,.66+row*.16,.27,.13,{baseline:'label',align:'center',max_lines:2});});
   }else if(recipe==='multi_scene'){
    push('headline',hl,.05,.04,.9,.11,{baseline:'h1',bold:true,align:'center',max_lines:1});
    panels.forEach(function(p,i){push('pc'+i,p.caption||p.title,.012+i*.333,.86,.31,.10,{baseline:'body',align:'center',max_lines:2});});
   }else if(hl)push('headline',hl,.06,.07,.88,.14,{baseline:'h1',bold:true,max_lines:2});
   return L;
  },
  genScene:function(req){
   var self=this;var ac=new AbortController();(self._reqAborts=self._reqAborts||{})[req.type]=ac;
   return (async function(){
    try{
    var fg=self._fg||null;
    if(!fg){
     // 1) 原图/干净图本身就是透明底已抠图（如 RGBA 商品图），直接复用，不再重复抠图
     var cand=self._cleanImage||req.image||null;
     if(cand){try{if(await GF().isCutoutBase(cand))fg=cand;}catch(e0){}}
    }
    if(!fg&&req.image){
     // 2) 调 /cutout 获取透明主体；失败/超时不直接判死
     try{var co=await authPost('/cutout',{image:req.image,strategy:'picwish'},80000);if(co&&co.ok&&co.image)fg=co.image;}catch(ce){}
    }
    // 3) 实在拿不到透明主体：用原图继续（保证不零输出、不卡死、不要求重拍）
    if(!fg)fg=self._cleanImage||req.image;
    if(fg&&!self._fg)self._fg=fg;   // 主体只取一次并缓存，其余图种复用，避免并发重复抠图超时
    if(self._abort)return {ok:false};
    var pose=await self.ensurePose(fg),poseName=pose.pose;
    var canvasPng;
    try{canvasPng=await self.layoutCutout(fg,req.type,req.size,poseName);}catch(e){return {ok:false,error:{code:'layout_fail',message:'构图失败'}};}
    var prompt=self.buildRbgPrompt(req.type,{domain:req.domain,scenes:req.scenes},poseName);
    var neg='fabric, cloth, textile, woven, knitted, knit, weave, wall texture, plaster texture, concrete texture, rough surface, grain, noisy speckled texture, text, words, letters, watermark, table, shelf, stand, bracket, pedestal, platform, cube, box, package, paper, furniture, stones, water, hand, clutter';
    var sleepFE=function(ms){return new Promise(function(r){setTimeout(r,ms);});};
    // 安全请求：520/502/503/超时/网络等瞬时错误自动退避重试，且绝不把异常抛给外层
    var postRobust=async function(path,body,to,retries){
      var last=null;
      for(var a=0;a<=retries;a++){
       if(self._abort)return {ok:false,abort:true};
       try{
        var r=await authPost(path,body,to);
        if(r&&r.ok)return r;
        var c=''+((r&&r.error&&(r.error.code||r.error.message))||'');
        last=r;
        if(!c.match(/520|502|503|521|522|524|timeout|超时|network|fetch|failed/i)||a===retries)return r;
       }catch(e){last={ok:false,error:{code:'network',message:''+((e&&e.message)||e)}};}
       await sleepFE(1800*(a+1));
      }
      return last;
    };
    var callScene=async function(){
      var s=await postRobust('/marketing/scene',{image:canvasPng,prompt:prompt,batch_size:2,pose:poseName,negative_prompt:neg},30000,3);
      if(!s||s.ok!==true||!s.task_id)return s||{ok:false,error:{code:'scene_submit_fail',message:'背景任务提交失败'}};
      var tid=s.task_id,deadline=Date.now()+130000;
      while(Date.now()<deadline){
       if(self._abort)return {ok:false};
       await sleepFE(2000);
       var q=await postRobust('/marketing/scene-result',{task_id:tid},20000,1);
       if(q&&q.ok===true&&q.images&&q.images.length)return q;
       if(q&&q.ok===false&&q.error){
        var c=''+(q.error.code||q.error.message||'');
        // 仅 PicWish 业务终态才判死；边缘错误继续轮询到超时
        if(c.match(/picwish|invalid|bad_|illegal/i))return q;
       }
      }
      return {ok:false,error:{code:'scene_timeout',message:'背景生成超时，已为你兜底出图'}};
    };
    var j=await callScene();
    var base;
    if(j&&j.ok&&j.images&&j.images.length){
    // 前端多候选质检：背景乱码 / 多余承托物 / 主体缺失（浏览器端，无 Worker 资源限制）
    var qcAsk='Inspect this e-commerce product photo: a real product cutout composited over an AI background'+(poseName==='hang'?' (the product hangs on the simple horizontal support)':' (the product stands upright)')+'. Return JSON exactly: {"strayText":true if ANY readable or gibberish letters, words or numbers appear on the background, walls, props, boxes or papers (IGNORE text printed on the product itself),"fakeSupport":true if any generated table, shelf, stand, bracket, pedestal, platform, cube, box, package, paper pile, rubble or other object touches or supports the product that should not be there (for hang the only allowed support is the simple rail; for stand only the real surface directly under it, and a short cord may rest on that surface beside the base),"fabricBg":true if the background is entirely or mostly filled with fabric, cloth, woven or knitted textile, noisy speckled texture, or a flat texture with NO recognizable room depth and NO smooth clean plaster wall,"productHero":true if the product is complete, sharp and the clear main subject,"score": an integer 1 to 10 for overall realism and selling appeal}.';
    var reviewOne=async function(im){var v=await authPost('/vision-json',{image:im,ask:qcAsk,system:'You are a strict QA reviewer for AI product photos. Reply with JSON only.',maxTokens:320},60000);var tex=await self.bgTextureRatio(im);return {image:im,qc:(v&&v.ok)?v.data:{},tex:tex};};
    var reviewed=await Promise.all(j.images.map(reviewOne));
    var isClean=function(q){return q.qc&&q.qc.strayText===false&&q.qc.fakeSupport===false&&q.qc.fabricBg===false&&q.qc.productHero!==false&&(typeof q.tex!=='number'||q.tex<=0.30);};
    var clean=reviewed.filter(isClean);
    if(!clean.length){
      var j2=await callScene();
      if(j2&&j2.ok&&j2.images&&j2.images.length){reviewed=reviewed.concat(await Promise.all(j2.images.map(reviewOne)));clean=reviewed.filter(isClean);}
    }
    var scoreOf=function(q){var n=parseInt(q.qc&&q.qc.score,10);return isFinite(n)?n:5;};
    if(clean.length){
      clean.sort(function(a,b){return scoreOf(b)-scoreOf(a);});
      base=clean[0].image;
      try{var up=await authPost('/superres',{image:base,scale:2},90000);if(up&&up.ok&&up.image)base=up.image;}catch(e){}
    }else{
      // AI 背景两轮均未通过质检：绝不交付已知劣质背景（织物/乱码/假支撑），改用确定性干净棚拍背景（背景完全程序化，物理上无任何瑕疵）
      base=await self.fallbackSceneBase(canvasPng);
    }
    }else{
    // 确定性兜底：干净浅墙 + 真实主体，绝不零输出、不要求客户重拍
    base=await self.fallbackSceneBase(canvasPng);
    }
    var layers=self.buildTextLayersFE(req.type,self.ostForType(req.type));
    var finalUrl=await self.composeFrontend({size:req.size,base_image:base,text_layers:layers});
    return {ok:true,image:finalUrl,type:req.type,size:req.size};
    }catch(genErr){
     try{
      var fbAny=canvasPng||fg||null;
      if(fbAny){
       var bE=await self.fallbackSceneBase(fbAny);
       var lE=self.buildTextLayersFE(req.type,self.ostForType(req.type));
       var fE=await self.composeFrontend({size:req.size,base_image:bE,text_layers:lE});
       return {ok:true,image:fE,type:req.type,size:req.size,degraded:true};
      }
     }catch(e2){}
     return {ok:false,error:{code:'gen_exception',message:'生成失败，可点该图单张重做'}};
    }
   })();
  },
  /* 确定性兜底背景：r-background 失败/超时时，用干净浅灰白微水泥渐变 + 真实主体，保证不零输出 */
  fallbackSceneBase:function(canvasPng){
   return new Promise(function(res){
    var im=new Image();
    im.onload=function(){
     try{
      var W=im.width,H=im.height,c=document.createElement('canvas');c.width=W;c.height=H;
      var x=c.getContext('2d');
      var g=x.createLinearGradient(0,0,0,H);
      g.addColorStop(0,'#f4f6f9');g.addColorStop(0.72,'#eceff3');g.addColorStop(1,'#e3e7ed');
      x.fillStyle=g;x.fillRect(0,0,W,H);
      x.strokeStyle='rgba(120,130,145,0.28)';x.lineWidth=Math.max(1,Math.round(H*0.004));
      x.beginPath();x.moveTo(W*0.08,H*0.86);x.lineTo(W*0.92,H*0.86);x.stroke();
      x.drawImage(im,0,0);
      res(c.toDataURL('image/jpeg',0.95));
     }catch(e){res(canvasPng);}
    };
    im.onerror=function(){res(canvasPng);};
    im.src=canvasPng;
   });
  },
  /* 客观背景纹理检测：取图像上下边缘条带（r-background 原始图无文字、产品居中，边缘基本是背景），
     用 Sobel 梯度统计高密度纹理占比。满屏织物/流体/大理石纹理→高；干净棚拍墙面→低。纯像素判定，不依赖 VL。 */
  bgTextureRatio:function(dataUrl){
   return new Promise(function(res){
    var im=new Image();
    im.onload=function(){
     try{
      var W=im.width,H=im.height,N=256,band=0.15;
      var c=document.createElement('canvas');c.width=N;c.height=Math.round(N*0.6);
      var x=c.getContext('2d',{willReadFrequently:true});
      x.drawImage(im,0,0,W,H*band,0,0,N,N*0.30);
      x.drawImage(im,0,H*(1-band),W,H*band,0,N*0.30,N,N*0.30);
      var dd=x.getImageData(0,0,c.width,c.height),w=c.width,h=c.height;
      var g=new Float32Array(w*h);
      for(var y=0;y<h;y++)for(var xx=0;xx<w;xx++){var i=(y*w+xx)*4;g[y*w+xx]=0.299*dd.data[i]+0.587*dd.data[i+1]+0.114*dd.data[i+2];}
      var hi=0,tot=0;
      for(var yy=1;yy<h-1;yy++)for(var xxx=1;xxx<w-1;xxx++){
       var k=yy*w+xxx,gx=g[k+1]-g[k-1],gy=g[k+w]-g[k-w],m=Math.sqrt(gx*gx+gy*gy);
       tot++;if(m>40)hi++;
      }
      res(hi/Math.max(1,tot));
     }catch(e){res(0);}
    };
    im.onerror=function(){res(0);};
    im.src=dataUrl;
   });
  },
  /* 终止任务：不仅停止派发，真正 abort 所有在途 fetch */
  _abortAll:function(){
   this._abort=true;var self=this;
   Object.keys(this._reqAborts||{}).forEach(function(k){try{self._reqAborts[k].abort();}catch(e){}delete self._reqAborts[k];});
  },
  /* === 契约 §B2：ja/ko 前端文字层合成。baked 直接用 image；frontend 用 base_image+text_layers 本地 Canvas 合成 === */
  resolveResultImage:function(j){
   if(j&&(j.composite==='white_cutout'||j.composite==='white_passthrough')&&j.base_image){
    return this.composeWhiteCutout(j);
   }
   if(j&&j.composite==='pose_compose'&&j.base_image){
    return this.composePose(j);
   }
   if(j&&j.composite==='frontend'&&j.base_image&&(j.type==='material'||j.recipe==='material')){
    return this.composeMaterialMacro(j);
   }
   if(j&&j.composite==='frontend'&&j.base_image&&Array.isArray(j.text_layers)){
    return this.composeFrontend(j);
   }
   return Promise.resolve(j&&j.image);
  },
  /* === 轨道A 白底确定性合成（浏览器 canvas）。服务端 edge 无 canvas，只回透明 cutout PNG + white_spec；
     浏览器按规格合成：alpha>阈值求 bbox → 正方形 S=max(原图长边,min_size) → 占比 ratio、放大封顶 max_scale
     → 纯白 #FFFFFF 居中 → JPEG。无阴影/倒影/灰渐变；产品像素来自保真抠图，绝不重绘。 === */
  composeWhiteCutout:function(j){
   var spec=j.white_spec||{};
   var minSize=spec.min_size||2048, ratio=spec.ratio||0.86, maxScale=spec.max_scale||1.6;
   var alphaThr=spec.alpha_threshold||12, q=spec.jpeg_quality||0.95;
   return new Promise(function(res){
    var im=new Image();
    im.onload=function(){
     try{
      var pre=document.createElement('canvas');pre.width=im.width;pre.height=im.height;
      var pctx=pre.getContext('2d',{willReadFrequently:true});
      pctx.drawImage(im,0,0);
      var d=pctx.getImageData(0,0,im.width,im.height).data;
      var x0=im.width,y0=im.height,x1=0,y1=0;
      for(var y=0;y<im.height;y++){for(var x=0;x<im.width;x++){
       if(d[(y*im.width+x)*4+3]>alphaThr){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}
      }}
      if(x1<=x0||y1<=y0){res(j.base_image);return;}
      var sw=x1-x0+1,sh=y1-y0+1;
      var S=Math.max(im.width,im.height,minSize);
      var longB=Math.max(sw,sh);
      var scale=(S*ratio)/longB;if(scale>maxScale)scale=maxScale;
      var dw=Math.round(sw*scale),dh=Math.round(sh*scale);
      var dx=Math.round((S-dw)/2),dy=Math.round((S-dh)/2);
      var cv=document.createElement('canvas');cv.width=S;cv.height=S;
      var ctx=cv.getContext('2d');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,S,S);
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(im,x0,y0,sw,sh,dx,dy,dw,dh);
      res(cv.toDataURL('image/jpeg',q));
     }catch(e){res(j.base_image);}
    };
    im.onerror=function(){res(j.base_image);};
    im.src=j.base_image;
   });
  },
  /* === 轨道B 确定性姿态合成（品类无关，edge 无 canvas，全在浏览器做）：
     产品像素来自真实 PicWish 透明 cutout，不重绘不变形。
     hang：干净墙面+确定性挂钩，产品挂环挂钩、机身自然垂下不碰台面；
     lay：产品旋转平放于台面，仅真实接触区一道柔和接触阴影（非灰椭圆/非底座）。 === */
  composePose:function(j){
   var spec=j.pose_spec||{}, pose=spec.pose||'lay', S=spec.min_size||2048;
   return new Promise(function(res){
    var im=new Image();
    im.onload=function(){
     try{
      var pre=document.createElement('canvas');pre.width=im.width;pre.height=im.height;
      var pc=pre.getContext('2d',{willReadFrequently:true});pc.drawImage(im,0,0);
      var d=pc.getImageData(0,0,im.width,im.height).data;
      var x0=im.width,y0=im.height,x1=0,y1=0,thr=12;
      for(var y=0;y<im.height;y++)for(var x=0;x<im.width;x++){if(d[(y*im.width+x)*4+3]>thr){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
      var pw=x1-x0+1, ph=y1-y0+1;
      var cv=document.createElement('canvas');cv.width=S;cv.height=S;var ctx=cv.getContext('2d');
      // 干净中性渐变背景
      var g=ctx.createLinearGradient(0,0,0,S);g.addColorStop(0,'#f2f0ec');g.addColorStop(1,'#e6e3dd');
      ctx.fillStyle=g;ctx.fillRect(0,0,S,S);
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      var scale=(S*0.7)/Math.max(pw,ph);
      if(pose==='hang'){
        // 顶部挂钩
        var hx=S/2, hy=S*0.20;
        ctx.strokeStyle='#b8b4ac';ctx.lineWidth=10;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(hx,hy-40);ctx.lineTo(hx,hy);ctx.quadraticCurveTo(hx,hy+22,hx+26,hy+18);ctx.stroke();
        // 产品挂环挂到钩，机身垂下
        var dw=pw*scale, dh=ph*scale;
        ctx.drawImage(im,x0,y0,pw,ph, hx-dw/2, hy, dw, dh);
      }else{
        // lay：旋转90°平放，放台面线~72%
        var dw2=pw*scale, dh2=ph*scale;
        var surfY=S*0.74;
        // 柔和接触阴影
        ctx.fillStyle='rgba(0,0,0,0.10)';
        ctx.beginPath();ctx.ellipse(S/2,surfY+dh2*0.05, dw2*0.5, 18, 0, 0, Math.PI*2);ctx.fill();
        ctx.save();ctx.translate(S/2,surfY);ctx.rotate(-Math.PI/2);
        ctx.drawImage(im,x0,y0,pw,ph,-dh2/2,-dw2/2,dh2,dw2);
        ctx.restore();
      }
      res(cv.toDataURL('image/jpeg',0.95));
     }catch(e){res(j.base_image);}
    };
    im.onerror=function(){res(j.base_image);};
    im.src=j.base_image;
   });
  },
  /* === 材质图确定性微距裁切（品类无关，不靠模型自觉）：
     对生成的材质底图居中裁出 tight 区域（边长≈短边×0.55），放大铺满输出，保证是局部特写而非整产品远景。 === */
  composeMaterialMacro:function(j){
   var S=2048, cropFrac=0.55;
   return new Promise(function(res){
    var im=new Image();
    im.onload=function(){
     try{
      var sw=Math.round(Math.min(im.width,im.height)*cropFrac);
      var sx=Math.round((im.width-sw)/2), sy=Math.round((im.height-sw)/2);
      var cv=document.createElement('canvas');cv.width=S;cv.height=S;var ctx=cv.getContext('2d');
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      ctx.drawImage(im,sx,sy,sw,sw,0,0,S,S);
      res(cv.toDataURL('image/jpeg',0.95));
     }catch(e){res(j.base_image);}
    };
    im.onerror=function(){res(j.base_image);};
    im.src=j.base_image;
   });
  },
  composeFrontend:function(j){
   var self=this;return new Promise(function(res){
    var size=String(j.size||'1920x1920').split('x');var W=+size[0]||1920,H=+size[1]||1920;
    var cv=document.createElement('canvas');cv.width=W;cv.height=H;var ctx=cv.getContext('2d');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);
    var im=new Image();
    im.onload=function(){
     try{ctx.drawImage(im,0,0,W,H);}catch(e){}
     (j.text_layers||[]).forEach(function(L){self._drawLayer(ctx,L,W,H);});
     try{res(cv.toDataURL('image/jpeg',0.92));}catch(e){res(j.base_image);}
    };
    im.onerror=function(){res(j.base_image);};
    im.src=j.base_image;
   });
  },
  _drawLayer:function(ctx,L,W,H){
   var text=String(L.text||'').trim();if(!text)return;
   var bx=(L.x||0)*W,by=(L.y||0)*H,bw=(L.w||1)*W,bh=(L.h||1)*H;
   var FS={h1:0.34,h2:0.26,label:0.17,body:0.14}[L.baseline]||0.15;
   var FONT="'Hiragino Sans','Yu Gothic','Meiryo','Malgun Gothic','Apple SD Gothic Neo','Microsoft YaHei UI','Microsoft YaHei','Noto Sans CJK SC','Noto Sans JP',sans-serif";
   var maxLines=L.max_lines||1;
   function wrapAt(fs){
    ctx.font=(L.bold?'700 ':'400 ')+fs+'px '+FONT;
    var tokens=text.match(/[A-Za-z0-9&%'’\.\/\+\-]+|\s+|./g)||[text];
    var lines=[],cur='';
    for(var i=0;i<tokens.length&&lines.length<maxLines;i++){
     var tk=tokens[i];
     if(/^\s+$/.test(tk)){cur+=' ';continue;}
     if(cur&&ctx.measureText(cur+tk).width>bw){lines.push(cur.replace(/\s+$/,''));cur=tk;}
     else cur+=tk;
    }
    if(cur&&lines.length<maxLines)lines.push(cur);
    return lines;
   }
   var fs=Math.floor(bh*FS),lines=[];
   for(;fs>=10;fs-=2){lines=wrapAt(fs);if(lines.length<=maxLines)break;}
   if(!lines.length)lines=[text];
   ctx.font=(L.bold?'700 ':'400 ')+fs+'px '+FONT;
   ctx.fillStyle=L.color||'#101826';
   var isLight=/^#?(fff|ffffff|white)/i.test(String(L.color||''));
   if(isLight){ctx.shadowColor='rgba(0,0,0,.45)';ctx.shadowBlur=fs*.18;ctx.shadowOffsetY=Math.max(1,fs*.05);}
   else{ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetY=0;}
   ctx.textAlign=L.align||'left';ctx.textBaseline='top';
   var lh=fs*1.28,totalH=lines.length*lh,ty=by+Math.max(0,(bh-totalH)/2);
   lines.forEach(function(ln,i){
    var tx=bx;
    if(L.align==='center')tx=bx+bw/2;else if(L.align==='right')tx=bx+bw;
    ctx.fillText(ln,tx,ty+i*lh);
   });
  },
  /* 受控并发：其余营销图并发 GEN_CONCURRENCY 张并行（方舟 RPM 确认后可到 3） */
  GEN_CONCURRENCY:2,
  generate:function(){
   if(!GS().images||!GS().images.length){toast(t('toast_nofirst'),'err');return;}
   if(this._running)return;
   var types=this.selectedTypes();
   if(!types.length){toast(t('toast_needtype'),'err');return;}
   if(this._planRunning||!this.planResp||this.planRespLang!==this.resolvedLang()){toast(t('plan_notready'),'err');return;} // 当前语种方案未就绪，拒绝旧方案出图
   this._running=true;this._abort=false;this._paused=false;this.ats=[];this._notes=[];this._lastErr=null;this._failed={};this._cleanImage=null;
   this._durations=[];this._activeTasks={};this._taskStart={};this._reqAborts={};this._posePromise=null;
   this._totalTasks=types.length;this._doneTasks=0;this._progMsg='';
   this.setCanvas('progress');
   var self=this;
   (async function(){
    var cat=(GS().identity&&GS().identity.cat)||'',pn=(GS().product&&GS().product.name)||'这款商品';
    var needTrackA=(types.indexOf('white_main')>=0||types.indexOf('search_main')>=0);
    var fidOut=null;
    // 轨道A：只取干净白底主体（不再产裸局部/假影棚）——仍先行
    if(needTrackA){
     self.setProgMsg(t('trackA'));
     try{fidOut=await GF().package({call:retryCall,image:GS().images[0].dataUrl,category:cat,product:pn,doDetails:false,doScene:false});}catch(e){fidOut=null;}
    }
    if(self._abort){self._finish();return;}
    self._cleanImage=(fidOut&&fidOut.ok&&fidOut.white)?fidOut.white:GS().images[0].dataUrl;
    self._fg=(fidOut&&fidOut.ok&&fidOut.fg)?fidOut.fg:null;
    await self.makeMarketingRef();
    // 白底主图（保真失败也兜底出图，绝不零输出、不要求重拍）
    if(types.indexOf('white_main')>=0){
     var wImg=(fidOut&&fidOut.white)||self._cleanImage;
     if(wImg){self.addResult(wImg,typeLabel('white_main'),'white_main');if(fidOut&&fidOut.degraded)self.addNote(typeLabel('white_main')+'：保真服务异常，已用原图兜底，可点该图单张重做。');}
     else{self.addNote(typeLabel('white_main')+'：处理失败，可点该图单张重做。');self._failed['white_main']='fail';}
     self._doneTasks++;self.paintLiveInfo();self.liveRender();
    }
    // 搜索主图（同走轨道A，复用干净抠图；失败同样兜底）
    if(types.indexOf('search_main')>=0){
     var sImg=(fidOut&&fidOut.white)||self._cleanImage;
     if(sImg){self.addResult(sImg,typeLabel('search_main'),'search_main');}
     else{self.addNote(typeLabel('search_main')+'：处理失败。');self._failed['search_main']='fail';}
     self._doneTasks++;self.paintLiveInfo();self.liveRender();
    }
    // 其余图种：受控并发池（并发2，可配置3），好一张立即推送一张
    var lang=self.resolvedLang(),facts=self.buildProductFacts();
    var queue=types.filter(function(tp){return tp!=='white_main'&&tp!=='search_main';});
    if(self._abort){self._finish();return;}
    self._progMsg='';self.paint(); // 切到 livebar 视图
    var n=Math.max(1,Math.min(self.GEN_CONCURRENCY,queue.length));
    var pool=[];
    for(var w=0;w<n;w++){
     pool.push((async function(){
      while(true){
       if(self._abort)return;
       var tp=queue.shift();if(!tp)return;
       await self.gatePause();            // 暂停时不派发新任务（在途请求自然结束）
       if(self._abort)return;
       var req={image:self._mktRef||self._cleanImage,type:tp,size:self.planSize(tp),language:lang,on_screen_text:self.ostForType(tp),product_facts:facts,domain:(self.planResp&&self.planResp.product?self.planResp.product.domain:''),scenes:(self.planResp&&self.planResp.product?self.planResp.product.scenes:[]),design_requirements:''};
       self._taskStart[tp]=Date.now();self._activeTasks[tp]=Date.now();
       self.paintLiveInfo();
       var j=self.RBG_TYPES[tp]?await self.genScene(req):await self.genMarketing(req);
       delete self._activeTasks[tp];delete self._reqAborts[tp];
       if(self._abort)return;             // 中止后在途结束即收尾，不再计张、不再发新请求
       var dur=Date.now()-(self._taskStart[tp]||Date.now());self._durations.push(dur);
       self._doneTasks++;
       if(j&&j.ok){
        var url=await self.resolveResultImage(j);
        if(url)self.addResult(url,typeLabel(tp),tp);
        else{self._failed[tp]='empty';self.addNote(typeLabel(tp)+'：'+(j.error&&j.error.message?j.error.message:'返回空图'));}
       }else{
        var em=(j&&j.error&&j.error.message)||'生成失败';self._failed[tp]=em;
        self.addNote(typeLabel(tp)+' 失败：'+em+'（已保留，可点该图单张重做，不计成功张）');
       }
       self.paintLiveInfo();self.liveRender();
      }
     })());
    }
    await Promise.all(pool);
    self._finish();
   })();
  },
  _finish:function(){
   this._running=false;this._stopEtaTimer();this._activeTasks={};
   if(!this.ats.length){
    var fails=Object.keys(this._failed);
    this._lastErr=fails.length?('全部失败：'+fails.map(typeLabel).join('、')+'。'+(this._failed[fails[0]]||'')):'生成失败，可能是网络波动，已保留你的原图，点重新生成再试。';
    this.setCanvas('empty');toast(t('no_success'),'err');
   }else{
    this._lastErr=null;this.setCanvas('result');
    var fN=Object.keys(this._failed).length;
    toast(t('gen_done')+this.ats.length+t('deliver_unit')+(fN?('，'+fN+t('gen_fail')):''));
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
 S.$('#atsClear').addEventListener('click',function(){if(GS().images&&GS().images.length){if(confirm('清空全部已传原图？')){GS().images=[];S.planResp=null;S.planByType={};S.ostEdits={};S.ats=[];S._notes=[];S.renderOrigin();S._clearSession();S.setCanvas('empty');}}});
 S.$('#atsAiWrite').addEventListener('click',function(){S.aiWrite();});
 S.$('#atsMoreBtn').addEventListener('click',function(){var m=S.$('#atsMore'),b=S.$('#atsMoreBtn');m.classList.toggle('show');b.textContent=m.classList.contains('show')?t('btn_less'):t('btn_more');});
 S.$('#swStyle').addEventListener('click',function(){this.classList.toggle('on');S.$('#styleChips').style.display=this.classList.contains('on')?'flex':'none';});
 S.$('#foldPlan').addEventListener('click',function(){this.classList.toggle('open');});
 S.$('#foldPlanText').addEventListener('click',function(){this.classList.toggle('open');});
 S.$('#foldSuite').addEventListener('click',function(){this.classList.toggle('open');});
 S.$('#suiteSeg').addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;S.seg=b.dataset.seg;this.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b);});S.renderSuiteChips();S._saveSession();});
 S.$('#aiSelect').addEventListener('click',function(){var list=S.currentList();list.slice(0,5).forEach(function(p){S.sel[p[0]]=true;});S.renderSuiteChips();toast(t('btn_aipick'));});
 S.$('#atsGen').addEventListener('click',function(){S.generate();});
 S.$('#dlAll').addEventListener('click',function(){S.downloadAll();});
 S.$('#toAwen').addEventListener('click',function(){S.handToAwen();});
 S.$('#atsLbX').addEventListener('click',function(){S.closeLb();});
 S.$('#atsLb').addEventListener('click',function(e){if(e.target.id==='atsLb')S.closeLb();});
 document.addEventListener('keydown',function(e){if(e.key==='Escape'&&S.isOpen())S.closeLb();});
 function _refreshPlan(){if(S.planResp&&GS().images&&GS().images.length){clearTimeout(S._plT);S._plT=setTimeout(function(){S.runPlan();},350);}}
 var _sp=S.$('#setPlatform'),_sr=S.$('#setRegion'),_sl=S.$('#setLang');
 function _onLocaleChange(){S.applyI18n();S._syncGenBtn();_refreshPlan();S._saveSession();}
 if(_sp)_sp.addEventListener('change',function(){var rg=PLATFORM_REGION[_sp.value];if(rg&&_sr)_sr.value=rg;_onLocaleChange();});
 if(_sr)_sr.addEventListener('change',_onLocaleChange);
 if(_sl)_sl.addEventListener('change',_onLocaleChange);
 // 刷新/重登后：有已存会话则自动打开阿图并恢复（方案+成品+设置）
 window.addEventListener('load',function(){
  try{if(S.hasSavedSession()){if(typeof renderUploadCard==='function')renderUploadCard();else S.open();}}catch(e){}
 });
})();
