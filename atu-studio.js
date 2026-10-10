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
 var TYPE_RATIO={white_main:'1:1',search_main:'1:1',core_selling:'4:3',selling_point:'16:9',icon_selling:'1:1',material:'1:1',scene_show:'16:9',multi_scene:'16:9',search_promo:'1:1',competitor_compare:'4:3',usage_compare:'4:3',size_chart:'1:1',product_detail:'1:1',
   hero:'4:3',scene_atmosphere:'16:9',multi_angle:'1:1',series:'1:1',ingredients:'1:1',usage_guide:'1:1',accessories:'1:1',after_sales:'1:1',mood:'16:9',atmosphere:'16:9',model_show:'3:4',
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
.ats-back{appearance:none;height:36px;padding:0 14px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--tx2);display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:500;font-family:inherit;white-space:nowrap;cursor:pointer;transition:.16s}\
.ats-back svg{width:16px;height:16px;flex:none}\
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
  ecom:[['white_main','白底主图'],['search_main','搜索主图'],['search_promo','营销搜索图'],['core_selling','核心卖点图'],['selling_point','卖点图'],['icon_selling','图标卖点图'],['material','材质图'],['scene_show','场景展示图'],['atmosphere','氛围场景图'],['model_show','模特/手持图'],['multi_scene','多场景拼图'],['competitor_compare','竞品对比图'],['usage_compare','使用对比图'],['size_chart','尺寸/容量图'],['product_detail','产品细节图']],
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
 var ARROW_LEFT='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>';
 var root=el('<div id="atuStudio"></div>');
 root.innerHTML=
  '<div class="ats-top"><div class="ats-tl"><a class="ats-logo" href="/" aria-label="WorkHogee">'+LOGO_FULL+'</a><span class="ats-crumb">阿图 · <b data-i18n="crumb_b">商品图操作台</b></span></div><div class="ats-tr"><span class="ats-pill">'+I.spark+'Alpha 内测 · 出图不限</span><button class="ats-back" id="atsBack" type="button" title="返回工作台首页" aria-label="返回工作台首页">'+ARROW_LEFT+'<span class="ats-back-tx">返回首页</span></button></div></div>'+
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
   '<div class="ats-stage"><div class="ats-stage-tabs" id="stageTabs" style="display:none"><div class="ats-stage-tt"><span data-i18n="deliver">交付成品</span> <span class="cnt" id="stageCnt"></span></div><div class="ats-stage-ops"><button class="ats-obtn" id="stageHome" type="button" title="返回工作台首页">'+ARROW_LEFT+'<span>返回首页</span></button><button class="ats-obtn" id="dlAll" type="button">'+I.download+'<span data-i18n="btn_dlall">全部下载</span></button><button class="ats-obtn pri" id="toAwen" type="button">'+I.pen+'<span data-i18n="btn_toawen">交给阿文写文案</span></button></div></div><div class="ats-canvas" id="atsCanvas"></div></div>'+
  '</div><div class="ats-lb" id="atsLb"><button class="ats-lb-x" id="atsLbX" type="button">×</button><img id="atsLbImg" alt="成品大图"></div>'+
  '<div class="ats-srcmenu" id="atsSrcMenu"></div>';
 document.body.appendChild(root);

 var S={root:root,suite:'ecom',seg:'main',ats:[],sel:{},planResp:null,planByType:{},ostEdits:{},_running:false,_abort:false,_paused:false,_cleanImage:null,_failed:{},_totalTasks:0,_doneTasks:0,_progMsg:'',
  $:function(sel){return root.querySelector(sel);},
  isOpen:function(){return document.body.classList.contains('atu-open');},
  open:function(opts){
   opts=opts||{};
   document.body.classList.add('atu-open');
   try{if(typeof exitTaskFocus==='function')exitTaskFocus();}catch(e){}
   this._lastErr=null;
   if(opts.lineId){        /* 从历史对话/我的创作恢复指定商品现场 */
    this._restoreSession(opts.lineId);this._lineId=null;this._bindLine();
   }else if(opts.resume){  /* 流程中返回/显式继续：恢复最近一件商品 */
    this._restoreSession();this._lineId=null;this._bindLine();
   }else{                  /* 默认=全新商品：绝不带上一件的原图/卖点/成品 */
    this._resetStudio();this._bindLine();
   }
   var pn=this.planResp&&this.planResp.product&&this.planResp.product.name;
   if(pn){try{var BN=window.AtuBridge||{};if(BN.setProductName)BN.setProductName(pn);}catch(e){}}
   this._saveSession();
   this.applyI18n();this.renderOrigin();this.renderSuiteChips();this.updateSelCount();this._syncGenBtn();
   if(this.ats&&this.ats.length){
    /* 刷新/恢复后把成品重新同步进 state.results 并补录到“我的创作”（按图种/标签幂等去重，不产生重复），
       根治修复前老会话成品只在操作台、刷新后作品库里找不到的问题 */
    var self=this;this.ats.forEach(function(r){self._ingest(r.url,r.label,r.type,false);});
    this.setCanvas('result');
   }else this.setCanvas('empty');
  },
  /* 全新商品：清空操作台一切商品相关状态（平台/区域/语种等偏好保留），回到干净空态 */
  _resetStudio:function(){
   var G=GS();
   if(G){G.images=[];G.results=[];if(!G.product)G.product={};}
   this.ats=[];this.sel={};this.planResp=null;this.planRespLang=null;this.planByType={};this.ostEdits={};this._notes=[];this._failed={};
   this._lineId=null;this._restoredLineId=null;
   try{var B0=window.AtuBridge||{};if(B0.bindLine)B0.bindLine(null);}catch(e){}
   var ta=this.$('#atsSelling');if(ta)ta.value='';
   var pc=this.$('#planCard');if(pc)pc.style.display='none';
   this.suite='ecom';this.seg='main';
   root.querySelectorAll('.ats-nav').forEach(function(n){n.classList.toggle('on',n.dataset.suite==='ecom');});
  },
  /* ===== 会话持久化：按商品主线分键存储 + current 指针 + LRU（刷新/重登/回看历史都能恢复当时现场） ===== */
  SESSION_KEY:'hogee_atu_session_v1',   /* current 指针 {cur:lineId,ts}；兼容旧版（可能直接是 v:1 完整会话） */
  LINES_INDEX:'hogee_atu_lines',
  MAX_LINES:8,
  _lineKey:function(id){return 'hogee_atu_line_'+id;},
  hasSavedSession:function(){try{var c=this._readCur();return !!(c&&c.cur&&localStorage.getItem(this._lineKey(c.cur)));}catch(e){return false;}},
  hasLineSession:function(id){try{return !!(id&&localStorage.getItem(this._lineKey(id)));}catch(e){return false;}},
  _readCur:function(){try{var raw=localStorage.getItem(this.SESSION_KEY);if(!raw)return null;var o=JSON.parse(raw);return(o&&o.cur)?o:null;}catch(e){return null;}},
  _readIndex:function(){try{var a=JSON.parse(localStorage.getItem(this.LINES_INDEX)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}},
  _writeIndex:function(a){try{localStorage.setItem(this.LINES_INDEX,JSON.stringify(a));}catch(e){}},
  _dropLine:function(id){try{localStorage.removeItem(this._lineKey(id));}catch(e){}},
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
  _saveSession:function(){ // 关键节点防抖保存；按商品分键，体积感知：超限先丢图、再 LRU 淘汰最旧商品现场
   clearTimeout(this._svT);var self=this;
   this._svT=setTimeout(function(){
    self._bindLine();var lid=self._lineId;if(!lid)return;
    var imgs=(GS()&&GS().images)||[];
    Promise.all(imgs.map(function(it){return self._compress(it.dataUrl);})).then(function(cd){
     var label=(((self.planResp&&self.planResp.product&&self.planResp.product.name)||(self.$('#atsSelling')||{}).value||'')+'').split('\n')[0].slice(0,40);
     var s={v:1,ts:Date.now(),lineId:lid,
      platform:self.platform(),region:self.locale(),lang:(self.$('#setLang')||{}).value||'auto',
      suite:self.suite,seg:self.seg,sel:self.sel,
      planResp:self.planResp,planRespLang:self.planRespLang,planByType:self.planByType,ostEdits:self.ostEdits,
      selling:(self.$('#atsSelling')||{}).value||'',
      results:self.ats.map(function(r){return {url:r.url,label:r.label,type:r.type,ts:r.ts||Date.now()};}),
      notes:self._notes||[],images:cd};
     var ok=false;
     try{localStorage.setItem(self._lineKey(lid),JSON.stringify(s));ok=true;}
     catch(e){try{s.images=[];localStorage.setItem(self._lineKey(lid),JSON.stringify(s));ok=true;}catch(e2){ok=false;}}
     if(!ok)return;
     var idx=self._readIndex().filter(function(x){return x.lineId!==lid;});
     idx.unshift({lineId:lid,ts:s.ts,label:label});
     idx.sort(function(a,b){return (b.ts||0)-(a.ts||0);});
     while(idx.length>self.MAX_LINES){var old=idx.pop();if(old&&old.lineId!==lid)self._dropLine(old.lineId);}
     self._writeIndex(idx);
     try{localStorage.setItem(self.SESSION_KEY,JSON.stringify({cur:lid,ts:s.ts}));}
     catch(e){ /* 配额仍不足：逐个淘汰最旧的其它商品现场（成品本身在作品库/IDB，不丢作品，只丢现场） */
      for(var k=idx.length-1;k>=0;k--){if(idx[k].lineId===lid)continue;self._dropLine(idx[k].lineId);idx.splice(k,1);
       try{localStorage.setItem(self.SESSION_KEY,JSON.stringify({cur:lid,ts:s.ts}));self._writeIndex(idx);break;}catch(e3){}}
     }
    });
   },400);
  },
  _clearSession:function(){
   try{
    var lid=this._lineId;
    if(lid)this._dropLine(lid);
    this._writeIndex(this._readIndex().filter(function(x){return x.lineId!==lid;}));
    var cur=this._readCur();if(cur&&cur.cur===lid)localStorage.removeItem(this.SESSION_KEY);
   }catch(e){}
  },
  _applySession:function(s){
   if(!s||s.v!==1)return false;
   /* 先清干净再载入，避免从另一件商品现场切过来时残留其成品/原图/卖点 */
   this.ats=[];this.sel={};this.planResp=null;this.planRespLang=null;this.planByType={};this.ostEdits={};this._notes=[];
   if(GS())GS().images=[];
   var ta0=this.$('#atsSelling');if(ta0)ta0.value='';
   this._restoredLineId=s.lineId||null;
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
   return true;
  },
  _restoreSession:function(lid){
   this._restoredLineId=null;var raw=null,s=null;
   try{
    if(lid){raw=localStorage.getItem(this._lineKey(lid));}
    else{var cur=this._readCur();if(cur&&cur.cur)raw=localStorage.getItem(this._lineKey(cur.cur));
     if(!raw)raw=localStorage.getItem(this.SESSION_KEY);} /* 兼容旧版：该键直接存 v:1 完整会话 */
   }catch(e){raw=null;}
   if(raw){try{s=JSON.parse(raw);}catch(e){s=null;}}
   var applied=this._applySession(s);
   if(applied&&s&&s.lineId&&!this.hasLineSession(s.lineId)){this._lineId=s.lineId;try{this._saveSession();}catch(e){}} /* 旧版首次恢复即迁移到分键 */
   return applied;
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
   try{var _B=window.AtuBridge;if(_B&&_B.goHome)_B.goHome();else if(typeof goHome==='function')goHome();}catch(e){}
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
    var j=null;
    for(var at=0;at<3;at++){
     try{j=await authPost('/marketing/plan',body,180000);}catch(e){j=null;}
     if(j&&j.ok)break;                       // 成功即止
     if(at<2)await new Promise(function(r){setTimeout(r,2000);}); // 瞬时 520/超时退避后重试
    }
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
     if(p.name){try{GS().product=GS().product||{};GS().product.name=p.name;if(B.setProductName)B.setProductName(p.name);}catch(e){}}
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
    try{var f=await callIdentify(img0);if(f){var cat=f.category||f.cat||f.name||'';if(cat&&/(服装|衣|裤|裙|鞋|帽|袜|包|fashion|apparel|cloth|wear|dress|shirt|shoe|bag)/i.test(cat))self.setSuite('fashion');if(f.name){GS().product=GS().product||{};GS().product.name=f.name;try{if(B.setProductName)B.setProductName(f.name);}catch(e){}}}}catch(e){}
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
   // 图标卖点图兜底：后端未给 icons 时，用卖点 bullets / 商品核心卖点确定性补成图标卡（客户给什么图都能出，不依赖规划字段完美）
   if((t==='icon_selling'||t==='ingredients'||t==='search_promo')&&(!base.icons||!base.icons.length)){
    var cp=((this.planResp&&this.planResp.product&&this.planResp.product.core_points)||[]);
    var src=(base.bullets&&base.bullets.length)?base.bullets:cp;
    base.icons=src.slice(0,t==='search_promo'?3:6).map(function(s){return {label:String(s).replace(/^[\s·•\-\d.、]+/,'').slice(0,t==='search_promo'?6:18).replace(/[，,、；;：:]+$/,''),icon_hint:''};});
   }
   // 标题净化：识别不到商品名时规划可能给出“这款商品/该产品”等无信息标题，确定性替换为真实商品名或首个核心卖点，杜绝废话上屏
   var _pr0=(this.planResp&&this.planResp.product)||{};
   var _badHl=/^\s*(这[款个支瓶台件条]?|该|此)?\s*(商品|产品|宝贝|物品|东西)\s*[。.！!]?\s*$/;
   var _hl0=String(base.headline||'').trim();
   if(!_hl0||_badHl.test(_hl0)){
    var _nm=String(_pr0.name||'').trim();
    var _cp=( _pr0.core_points||[]).map(function(s){return String(s).replace(/^[\s·•\-\d.、]+/,'').trim();}).filter(Boolean);
    var _cand=(_nm&&!_badHl.test(_nm))?_nm:(_cp[0]||'');
    if(_cand)base.headline=_cand.slice(0,20);
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
   this._bindLine();
   this._saveSession();
   this._ingest(url,label,type,false);
  },
  /* 绑定“商品创作主线”：优先当前工作台 state.lineId / 已恢复会话 lineId，否则向 workbench 申请新建。
     保证一件商品的图→文→视频跨刷新、跨接力都归同一条“我的创作”。 */
  _bindLine:function(){
   try{var B=window.AtuBridge||{};
    if(!this._lineId){this._lineId=this._restoredLineId||(B.state&&B.state.lineId)||(B.ensureLine?B.ensureLine():null)||null;}
    if(this._lineId&&B.bindLine)B.bindLine(this._lineId);
   }catch(e){}
  },
  /* 成品统一交给 workbench（AtuBridge.ingestResult）：同步 state.results + 持久化到“我的创作”。
     以前这里裸调闭包内 persistResult（作用域不通、恒 undefined），成品只进内存、刷新即丢；桥缺失时兜底写 state.results，不阻断出图。 */
  _ingest:function(url,label,type,replace){
   var ok=false;
   try{var B=window.AtuBridge||{};
    this._bindLine();
    if(B.ingestResult){B.ingestResult({url:url,tosKey:'',label:label,type:type||'',ts:Date.now()},!!replace);ok=true;}
   }catch(e){ok=false;}
   if(!ok){try{var g=GS();if(!g.results)g.results=[];g.results.push({url:url,k:'atu',label:label,type:type||'',ts:Date.now()});}catch(e){}}
  },
  replaceResultByType:function(t,url){
   var hit=null;for(var i=0;i<this.ats.length;i++){if(this.ats[i].type===t){hit=this.ats[i];break;}}
   if(hit){hit.url=url;hit.ts=Date.now();this._bindLine();this._saveSession();this._ingest(url,hit.label||TYPE_LABELS[t]||t,t,true);}
   else{this.addResult(url,TYPE_LABELS[t]||t,t);}
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
  RBG_TYPES:{core_selling:1,selling_point:1,icon_selling:1,material:1,scene_show:1,product_detail:1,multi_scene:1,search_promo:1,model_show:1,mood:1,atmosphere:1,hero:1,scene_atmosphere:1,ingredients:1},
  _layCfg:{
   scene_show:{cx:.44,bottom:.80,h:.50},mood:{cx:.44,bottom:.84,h:.58},atmosphere:{cx:.44,bottom:.84,h:.58},scene_atmosphere:{cx:.5,bottom:.92,h:.70},
   selling_point:{cx:.50,bottom:.98,h:.65},hero:{cx:.5,bottom:.98,h:.65},
   core_selling:{cx:.50,bottom:.98,h:.65},icon_selling:{cx:.5,bottom:.62,h:.45},ingredients:{cx:.5,bottom:.58,h:.41},
   search_promo:{cx:.50,bottom:.80,h:.50},model_show:{cx:.42,bottom:.97,h:.58},
   material:{cx:.5,bottom:.98,h:.67},product_detail:{cx:.5,bottom:.97,h:.64},
   default:{cx:.5,bottom:.97,h:.64}
  },
  _sceneEnv:{
   lifestyle:'a bright airy real-life setting with soft natural daylight, gentle background blur, warm inviting commercial lifestyle photography',
   hero:'a clean premium studio-lifestyle setting, soft gradient backdrop with gentle bokeh, cinematic key light, aspirational premium mood',
   info:'a clean modern minimalist studio, smooth neutral light-gray backdrop, soft even lighting, subtle soft shadows, uncluttered premium commercial look',
   macro:'a soft neutral seamless backdrop, gentle diffused lighting, delicate soft highlights, refined texture, elegant premium product close-up',
   mood:'an atmospheric cinematic scene, soft moody light, gentle haze, rich color grading, emotional premium ambiance'
  },
  _typeScene:{scene_show:'lifestyle',mood:'mood',atmosphere:'mood',scene_atmosphere:'mood',selling_point:'hero',hero:'hero',core_selling:'info',search_promo:'info',icon_selling:'info',ingredients:'info',material:'macro',product_detail:'macro'},
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
     var r=await self._vlPost({image:fg,ask:ask,system:'你是严谨的视觉分析助手，只输出JSON。',maxTokens:400},60000);
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
  /* G3 品类→真实使用场地映射（r-background 只画固定环境，道具极简，产品像素最后贴回） */
  buildVenue:function(domain,scenes,name){
   if(Array.isArray(this._inferredVenues)&&this._inferredVenues.length&&this._inferredVenues[0].en)return this._inferredVenues[0].en;
   return this._staticVenue(domain,scenes,name);
  },
  _staticVenue:function(domain,scenes,name){
   var txt=String(domain||'').toLowerCase()+' '+(Array.isArray(scenes)?scenes.join(' '):(scenes||''))+' '+String(name||'').toLowerCase();
   if(/行李|拉杆|箱包|旅行箱|背包|suitcase|luggage|trolley|travel|backpack|箱/.test(txt))return'a real bright airport terminal interior with a polished hard floor and distant blurred floor-to-ceiling windows and check-in architecture, or a tidy modern hotel lobby with a real floor and window daylight';
   if(/美妆|护肤|化妆|洁面|面膜|口红|香水|cosmetic|skincare|makeup|beauty|serum|cream|lotion|perfume|cleanser/.test(txt))return'a real bright bathroom vanity scene: a real marble or wood washstand countertop with a softly blurred mirror, vertical blinds, a folded towel and faint water reflections on the counter, natural window light';
   if(/吹风|个护|剃须|牙刷|美发|直发|hair ?dryer|shaver|toothbrush|personal care|styler/.test(txt))return'a real tidy bedroom dresser or bathroom counter in a bright home, with a real counter surface, a blurred wardrobe and window daylight, a soft reflection on the counter';
   if(/3c|数码|电子|耳机|音箱|充电器|手机|电脑|键盘|摄像|平板|earphone|speaker|charger|phone|laptop|keyboard|camera|digital|electronic/.test(txt))return'a real modern home desk or living-room scene: a real wooden desk surface with a blurred bookshelf or sofa and large window daylight in the background, strong room depth';
   if(/家电|家居|厨房|锅|煲|水壶|吸尘|净化|kitchen|appliance|cooker|kettle|vacuum|purifier|home/.test(txt))return'a real bright modern kitchen counter or living-room scene with real cabinetry, a countertop surface and blurred window daylight, strong interior depth';
   if(/食品|零食|饮料|茶|咖啡|水果|food|snack|beverage|coffee|tea|drink/.test(txt))return'a real bright kitchen dining scene with a real wood table surface, blurred kitchen cabinetry and window daylight';
   if(/轴承|工业|零件|五金|机械|螺丝|齿轮|管件|bearing|industrial|hardware|machinery|gear|metal part|workshop/.test(txt))return'a real clean modern factory workshop or equipment-bench scene: a real metal machine workbench surface with softly blurred industrial equipment and structured wall panels, realistic workshop lighting';
   return'a real bright modern interior room with strong depth: a real floor, a mid-ground and a distant softly blurred room with windows and fixed architecture, natural daylight';
  },
  /* G4 品类卖点氛围素材：只允许出现在背景/台面远边缘的点缀元素（中央产品放置区必须留空），真实产品最后贴回，素材天然不侵入主体 mask */
  buildAmbience:function(domain,scenes,name){
   var txt=String(domain||'').toLowerCase()+' '+(Array.isArray(scenes)?scenes.join(' '):(scenes||''))+' '+String(name||'').toLowerCase();
   if(/美妆|护肤|化妆|洁面|面膜|口红|香水|cosmetic|skincare|makeup|beauty|serum|cream|lotion|perfume|cleanser/.test(txt))
    return'a few soft cleansing foam bubbles, gentle water ripples and tiny fresh water droplets gathered only at the FAR EDGES of the counter, one or two fresh green leaves softly out of focus in the background, a dewy fresh spa atmosphere';
   if(/食品|零食|饮料|茶|咖啡|水果|food|snack|beverage|coffee|tea|drink/.test(txt))
    return'gentle appetizing steam and a few fresh ingredient accents such as leaves, beans or fruit kept only at the far edges and heavily blurred, a warm inviting gourmet glow';
   if(/3c|数码|电子|耳机|音箱|充电器|手机|电脑|键盘|摄像|平板|earphone|speaker|charger|phone|laptop|keyboard|camera|digital|electronic/.test(txt))
    return'subtle blue-cyan rim light, a few faint glowing thin tech light lines in the softly blurred background and delicate bokeh light particles, a sleek high-tech mood';
   if(/吹风|个护|剃须|牙刷|美发|直发|hair ?dryer|shaver|toothbrush|personal care|styler|家电|家居|吸尘|净化|appliance|purifier/.test(txt))
    return'soft wisps of fresh steam and fine water droplets kept near the blurred background edges, airy clean freshness with gentle highlights';
   if(/行李|拉杆|箱包|旅行箱|背包|suitcase|luggage|trolley|travel|backpack/.test(txt))
    return'soft travel bokeh of distant window lights, gentle sunbeams through the window with a few floating dust motes, an airy journey mood';
   if(/轴承|工业|零件|五金|机械|螺丝|齿轮|管件|bearing|industrial|hardware|machinery|gear|metal part|workshop/.test(txt))
    return'cool subtle blue-cyan rim light grazing the metal, faint machined sheen highlights in the blurred equipment background, a crisp industrial mood, absolutely no sparks and no smoke';
   return'tasteful soft atmospheric bokeh and gentle light haze with a few subtle decorative accents kept only at the far edges';
  },
  buildRbgPrompt:function(type,o,pose){
   o=o||{};pose=pose||'stand';var group=this._typeScene[type]||'info';var domain=String(o.domain||'product').toLowerCase();
   var venue=this.buildVenue(domain,o.scenes,o.name);
   var keep='Photorealistic commercial product photo. The product (already cut out and placed on this transparent canvas) must keep its EXACT real shape, proportions, colors, materials and every printed label, logo and text on its packaging. Do NOT redraw, repaint, warp, distort, erase or alter the product. The generated BACKGROUND must contain absolutely NO words, letters, numbers, captions, logos, price tags, posters, stickers or watermarks.';
   var sceneTypes={scene_show:1,mood:1,scene_atmosphere:1,atmosphere:1};
   var place;
   if(pose==='hang'||pose==='hand'){
    place='The product is ALREADY hanging on the simple support already drawn on the canvas. Render only a real photographic bright room wall behind it (tidy bathroom / entry / bedroom), soft natural daylight, gentle background blur, clear empty wall below. Do NOT add any hook, rail, rod, bracket, shelf, table, counter, pedestal, box, package or furniture — the support and product already exist.';
   }else if(sceneTypes[type]){
    place='Place the product standing upright in a REAL PHOTOGRAPHED LOCATION, not a studio backdrop: '+venue+'. The shot MUST show strong real-room depth with a visible foreground surface, a mid-ground and a distant softly blurred background, plus real fixed architecture (walls, window frames, a door, counter or cabinet edges) and a clear horizon/floor line. The product physically stands directly on the real floor or counter with a correct thin contact shadow and a grounded reflection; it must look photographed in that place, not cut out and pasted or floating. The location is tidy and may contain only the fixed architecture and at most one or two context-appropriate fixed elements. Absolutely NO loose props, extra products, bags, bottles, plants or decorations near the product. The background must be a genuine location: NOT a seamless paper cyclorama, NOT an infinite white cove, NOT a flat solid-color wall, NOT a green screen, NOT a 3D or CGI render.';
   }else{
    place='The product stands upright in front of a clean bright light-gray wall that is a completely smooth, flat, even, seamless solid surface with absolutely NO surface texture, soft even studio lighting, a subtle smooth vertical gradient and a faint horizontal surface line near the bottom; minimal, premium and uncluttered. Render a thin soft contact shadow where it meets the surface.';
   }
   var cord='If the product has a short power cord at its base, the cord rests naturally on the surface right beside the base with a slight curve; it must NOT extend away, hang into the distance, or plug into any block, box, tank, socket or object.';
   var ban='CRITICAL: NO fire, flame, smoke, explosion, heat waves or glowing embers, NO liquid, fluid or energy swirls, NO melting, twisted or distorted shapes or glass shards, NO plastic bag, bottle or can, NO fabric, cloth, woven or textile weave texture filling the frame, NO noisy speckled or knitted texture, NO pedestal, cube, acrylic block, glass water tank, rubble, stones, rocks, floating platform, box, package, paper, table or shelf inserted under or around the product, and NO text anywhere in the background.';
   return keep+' '+place+' '+cord+' '+ban+' High detail, sharp focus on the product, professional e-commerce advertising photo, natural color.'+(o.variant?(' '+o.variant):'');
  },
  layoutCutout:function(fg,type,sizeStr,pose){
   var self=this;return new Promise(function(res,rej){
    var sz=String(sizeStr||'1920x1920').split('x'),W=+sz[0]||1920,H=+sz[1]||1920;
    var im=new Image();
    im.onload=function(){
     var cfg=self._layCfg[type]||self._layCfg.default;
     var cv=document.createElement('canvas');cv.width=W;cv.height=H;var ctx=cv.getContext('2d');
     var dw,dh,px,py,sc;var abInfo=self._alphaInfo(im),ab=abInfo.bbox||{x:0,y:0,w:1,h:1};
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
      // core_selling 占满型（圆形/方形大件，可见左缘侵入左侧卖点胶囊列）：微缩并向右靠，给左胶囊列腾位、右侧仍留放大窗；窄长产品不触发
      if(type==='core_selling'){
       var _fxl=(px+ab.x*dw)/W;
       if(_fxl<0.332){
        dh=H*0.56;sc=dh/im.naturalHeight;dw=im.naturalWidth*sc;py=H*cfg.bottom-dh;
        px=(0.34-ab.x*dw/W)*W;
        if(px+dw>W*0.985)px=W*0.985-dw;
       }
      }
      ctx.drawImage(im,px,py,dw,dh);
     }
     self._lastFgBox={x:(px+ab.x*dw)/W,y:(py+ab.y*dh)/H,w:ab.w*dw/W,h:ab.h*dh/H};
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
    if(sub)push('sub',sub,.06,.23,.84,.09,{baseline:'sub'});
   }else if(recipe==='selling_point'||recipe==='hero'){
    push('headline',hl,.06,.07,.88,.15,{baseline:'h1',bold:true,max_lines:2});
    if(sub)push('sub',sub,.06,.23,.84,.09,{baseline:'sub'});
   }else if(recipe==='scene_show'){
    push('headline',hl,.05,.06,.9,.15,{baseline:'h1',bold:true,max_lines:2});
    if(sub)push('sub',sub,.05,.22,.86,.09,{baseline:'sub'});
   }else if(recipe==='mood'||recipe==='scene_atmosphere'||recipe==='atmosphere'){
    push('headline',hl,.07,.08,.72,.12,{baseline:'h2',bold:true,color:'#FFFFFF',max_lines:1});
   }else if(recipe==='material'){
    push('headline',hl,.06,.07,.88,.13,{baseline:'h2',bold:true,max_lines:2});
    if(sub)push('sub',sub,.06,.21,.84,.08,{baseline:'sub'});
   }else if(recipe==='product_detail'){
    push('headline',hl,.06,.07,.88,.14,{baseline:'h2',bold:true,max_lines:2});
    if(sub)push('sub',sub,.06,.22,.84,.08,{baseline:'sub'});
   }else if(recipe==='icon_selling'||recipe==='ingredients'){
    // 图标卡（白板+图标+标注）统一由 drawComponents/drawIconCard 绘制，这里只放标题，避免文字层与卡片重复画标签造成重影
    push('headline',hl,.08,.05,.84,.12,{baseline:'h1',bold:true,align:'center',max_lines:2});
   }else if(recipe==='search_promo'){
    // G7 营销搜索图：顶部居中品牌大标题 + 副标；图标胶囊/光带由 drawComponents 绘制
    push('headline',hl,.08,.055,.84,.12,{baseline:'h1',bold:true,align:'center',max_lines:2});
    if(sub)push('sub',sub,.1,.185,.8,.07,{baseline:'sub',align:'center',max_lines:1});
   }else if(recipe==='model_show'){
    // G5 模特图：仅左下角一行品名小白字（人物背景复杂，白字自动带投影），不堆卖点、不压人和产品
    push('mname',hl,.05,.87,.62,.09,{baseline:'h2',bold:true,color:'#FFFFFF',max_lines:1});
   }else if(recipe==='multi_scene'){
    // G7 多场景拼图：每格场景标签由 genMultiScene 在格内顶部安全区确定性绘制，外层不再叠任何文字（杜绝压主体）
    return L;
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
    var brand=await self.extractBrand(fg);
    var _ost=self.ostForType(req.type);
    var _pr=(self.planResp&&self.planResp.product)||{};
    var bullets=((_pr.core_points&&_pr.core_points.slice)?_pr.core_points:[]).map(function(s){return String(s||'').replace(/^\s*\d{1,2}\s*[.、)]\s*/,'').replace(/^\s*[•·\-▪◦▫]\s*/,'').trim();}).filter(Boolean).slice(0,3);
    var macroHint=bullets.join('；')+' '+((_pr.materials||[]).concat(_pr.key_parts||[])).join('，');
    var spec={type:req.type,fgBox:null,loupeImg:null,part:null,bullets:bullets,icons:(_ost.icons||[]),partLabel:'',brand:brand.brand};
    var canvasPng,base=null,bgWhole=null,macroMode=false,macro=null,venuePlate=false;
    // G5 真人模特 / G7 多场景拼图：独立管线（人物底板或多格底板 + 真实产品确定性贴回），不进微距/单图流程
    if(req.type==='model_show'){return await self.genModelShow({req:req,fg:fg,brand:brand,ost:_ost,poseName:poseName});}
    if(req.type==='multi_scene'){return await self.genMultiScene({req:req,fg:fg,brand:brand,poseName:poseName});}
    var getMacro=function(){if(self._macroShared&&self._macroShared.src===fg)return Promise.resolve(self._macroShared.v);return self.extractMacro(fg,macroHint).then(function(r){self._macroShared={src:fg,v:r};return r;}).catch(function(){return{ok:false,fallback:true};});};
    if(self.MACRO_TYPES[req.type]){
      try{macro=await getMacro();}catch(e){macro={ok:false};}
      if(macro&&macro.ok){try{var ml=await self.macroLayoutCutout(macro.png,req.size);canvasPng=ml.png;spec.fgBox=ml.fgBox;spec.partLabel=macro.label||'';macroMode=true;}catch(eM){macroMode=false;}}
      if(!macroMode&&macro&&macro.fallback!==true&&macro.ok===false){self.addNote(typeLabel(req.type)+'：原图该部位有效像素约 '+(macro.srcPx||0)+'px，不足以支撑部件微距，已按整产品呈现；补传一张部件近照即可出微距特写。');}
    }
    if(req.type==='core_selling'){try{macro=await getMacro();}catch(e){macro=null;}}
    if(!canvasPng){
     try{canvasPng=await self.layoutCutout(fg,req.type,req.size,poseName);spec.fgBox=self._lastFgBox||spec.fgBox;}
     catch(e){return {ok:false,error:{code:'layout_fail',message:'构图失败'}};}
    }
    if(req.type==='core_selling'&&macro&&macro.ok&&spec.fgBox&&macro.box){
     try{spec.loupeImg=macro.png;var bc=macro.box,fb=spec.fgBox;spec.part={x:fb.x+(bc.x+bc.w/2)*fb.w,y:fb.y+(bc.y+bc.h/2)*fb.h};if(macro.label)spec.partLabel=macro.label;}catch(e){}
    }
    var prompt=self.buildRbgPrompt(req.type,{domain:req.domain,scenes:req.scenes,name:_pr.name||''},poseName);
    var neg='fire, flame, smoke, explosion, heat waves, glowing embers, liquid swirl, fluid energy swirl, melting, twisted, distorted, glass shards, plastic bag, full-frame fabric, full-frame knitted or woven textile covering the view, noisy speckled texture covering the frame, text, words, letters, numbers, watermark, logo, price tag, poster, sticker, pedestal, display stand, bracket, platform, cube, acrylic block, box, package, paper pile, rubble, stones, floating platform, extra products, duplicated product, people, person, face, hands, clutter, seamless studio backdrop, cyclorama wall, infinite white cove, green screen, chroma key, 3d render, cgi, digitally rendered illustration, flat solid color background, plain smooth gradient wall with no room, cutout pasted look, floating object with no shadow, no horizon, posterized, cartoon';
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
    var LIFESTYLE={scene_show:1,mood:1,scene_atmosphere:1,atmosphere:1};
    var bgWhole=null;
    if(LIFESTYLE[req.type]){
    // G3：让 Seedream 只生成「不含产品的真实空场地底板」，再把客户真实产品确定性贴回，
    // 避开 r-background 抱着大尺寸产品只肯补无影墙的倾向；空场景无产品可复制，保真由贴回像素保证。
    var venue=self.buildVenue(req.domain,req.scenes,_pr.name||'');
    var bgPrompt='Photorealistic EMPTY background plate of a real location, used to composite a small home appliance onto later. Location: '+venue+'. Eye-level view with strong real-room depth. In the FOREGROUND is exactly ONE single flat horizontal surface (a clean countertop, tabletop or dresser top) whose straight front edge crosses the whole frame at about 78% of the image height; the surface top is clean, flat and empty in the lower-center where the appliance will stand, and extends a short way back. Behind and above this single surface is the softly blurred real room with fixed architecture (a window, a door, cabinets or shelves, walls), natural daylight, realistic perspective. STRICTLY: only ONE level surface; NO steps, NO raised platform or ledge, NO sunken lower floor in front of it, NO second surface; the area below the front edge is a simple plain cabinet face or out-of-focus floor, not another standing level. No people, no product, no loose objects on the surface, no text, letters, logo or watermark. Photorealistic photograph, not a 3D render.';
    var isMoodPlate=(req.type==='mood'||req.type==='scene_atmosphere'||req.type==='atmosphere');
    if(isMoodPlate){
     // G4 氛围层：仅在背景/远边缘点缀品类氛围素材，中央产品放置区保持干净；产品最后确定性贴回，素材不侵入主体
     bgPrompt+=' ADD TASTEFUL ATMOSPHERE IN THE BACKGROUND AND AT THE FAR EDGES ONLY: '+self.buildAmbience(req.domain,req.scenes,_pr.name||'')+'. Keep these decorative elements small, sparse and softly out of focus; they MUST stay clear of the lower-center standing area, MUST NOT cover the center of the countertop and MUST NOT fill or texture the whole frame. Use stronger cinematic shallow depth of field and slightly richer premium color grading, but keep the lower-center product area clean, flat and neutral.';
    }
    var sizeForBg=(String(req.size).indexOf('x')>0)?req.size:'2304x2304';
    var genPlate=async function(){
      var r=await self._withBgGate(function(){return postRobust('/scene-background',{bgPrompt:bgPrompt,size:sizeForBg},95000,2);});
      if(r&&r.ok&&r.b64)return 'data:image/png;base64,'+r.b64;
      var r2=await self._withBgGate(function(){return postRobust('/scene-background',{bgPrompt:bgPrompt,size:'2304x2304'},95000,1);});
      return(r2&&r2.ok&&r2.b64)?('data:image/png;base64,'+r2.b64):null;
    };
    var plateQcAsk='This is an AI-generated EMPTY background plate with NO product in it yet; a product will be composited onto the lower-center later. Return JSON exactly: {"sceneText":true ONLY if there is PROMINENT readable or gibberish text in the scene such as signage, posters, banners, big words on packaging, or large lettering on walls; FALSE otherwise (IGNORE a small semi-transparent "AI generated" watermark in a bottom corner, and IGNORE tiny wall switches, sockets or outlets),"realVenue":true ONLY if it is a recognizable REAL photographed room or location with clear spatial depth AND fixed architecture such as window frames, a door, counter or cabinet edges, walls, a real floor or counter with a horizon; FALSE for a seamless paper cyclorama, an infinite white or gray cove, a flat solid-color or smooth gradient wall with no room, a green screen, or a 3D/CGI render,"seamlessBackdrop":true if it is a seamless/infinite cove or a flat solid/smooth-gradient studio background with no room depth,"greenScreen":true if green or chroma-key screen,"render3d":true if it looks like a 3D render or CGI instead of a photograph,"clearSurface":true if the lower-center floor or counter area is clean, empty and evenly lit so a product can be placed there,"singleLevel":true if there is exactly ONE foreground standing surface (a countertop or tabletop) with one straight front edge around 70-85% of the height and NO steps, raised platform, ledge or a second lower standing level,"surfaceY": a decimal from 0.65 to 0.92 indicating the y coordinate (0=top, 1=bottom) of that single surface TOP at the lower-center, where the base of a standing product should rest,"score": an integer 1 to 10 for photographic realism and suitability as a product scene}.';
    var reviewPlate=async function(im){var v=await self._vlPost({image:im,ask:plateQcAsk,system:'You are a strict QA reviewer. Reply with JSON only.',maxTokens:280},60000);var tex=await self.bgTextureRatio(im);var col=await self.bgColorRatio(im);return {image:im,qc:(v&&v.ok)?v.data:{},tex:tex,col:col};};
    var plateOk=function(q){var Q=q.qc||{},sc=parseInt(Q.score,10);var base=Q.sceneText!==true&&Q.realVenue===true&&Q.seamlessBackdrop===false&&Q.greenScreen===false&&Q.render3d===false&&Q.clearSurface!==false&&Q.singleLevel!==false&&isFinite(sc)&&sc>=7;var lim=isMoodPlate?{tex:.50,sat:.14,warm:.24}:{tex:.34,sat:.08,warm:.16};var tx=(typeof q.tex!=='number')||q.tex<=lim.tex;var cl=q.col&&q.col.highSat<=lim.sat&&q.col.warm<=lim.warm;return base&&tx&&cl;};
    var pickPlates=async function(n){var imgs=(await Promise.all(Array.from({length:n},genPlate))).filter(Boolean);if(!imgs.length)return [];return await Promise.all(imgs.map(reviewPlate));};
    var reviewed=await pickPlates(isMoodPlate?2:3);
    var clean=reviewed.filter(plateOk);
    if(!clean.length){reviewed=reviewed.concat(await pickPlates(isMoodPlate?1:2));clean=reviewed.filter(plateOk);}
    try{self._sceneDebug=reviewed.map(function(r){return{qc:r.qc,tex:Math.round(r.tex*100)/100,col:r.col};});if(!clean.length&&reviewed[0]&&reviewed[0].image)self._sceneDebugImg=await self._coverTo(reviewed[0].image,req.size);}catch(e){}
    if(clean.length){
      clean.sort(function(a,b){return(parseInt(b.qc.score,10)||5)-(parseInt(a.qc.score,10)||5);});
      var pick=clean[0];
      venuePlate=true;
      bgWhole=await self._coverTo(pick.image,req.size);
      // 按视觉模型返回的承托面 y 坐标，把真实产品垂直重定位到台面上，避免产品穿过台面/悬浮
      var sY=parseFloat(pick.qc&&pick.qc.surfaceY);
      if(isFinite(sY)){sY=Math.max(0.70,Math.min(0.90,sY));canvasPng=await self._reanchorFg(canvasPng,req.size,sY);}
    }
    }
    if(macroMode){
      if(!base){var mbg=await self.macroBgOnly(req.size,brand.brand);base=await self.mergeSimple(mbg,canvasPng,req.size);}
    }else{
      if(!bgWhole){bgWhole=await self.studioBgOnly(req.size);if(LIFESTYLE[req.type])self.addNote(typeLabel(req.type)+'：真实场景未通过实景质检，已先出棚拍版兜底（可点该图单张重做真实场景）。');}
      base=await self.mergeBgFg(bgWhole,canvasPng,req.size);
      if(venuePlate)base=await self._zoomCropCorner(base,req.size,0.10);
    }
    var layers=self.buildTextLayersFE(req.type,_ost);
    var NEED_TEXT={core_selling:1,selling_point:1,scene_show:1,hero:1,material:1,product_detail:1,multi_scene:1,icon_selling:1,ingredients:1};
    if((!layers||!layers.length)&&NEED_TEXT[req.type]){
      layers=self.buildTextLayersFE(req.type,{headline:_pr.name||'',subheadline:(_pr.core_points&&_pr.core_points[0])||'',icons:[],panels:[]});
    }
    var finalUrl=await self.composeFrontend({size:req.size,base_image:base,text_layers:layers,spec:spec});
    return {ok:true,image:finalUrl,type:req.type,size:req.size};
    }catch(genErr){
     try{
      var fbAny=canvasPng||fg||null;
      if(fbAny){
       var bE=await self.fallbackSceneBase(fbAny);
       var lE=self.buildTextLayersFE(req.type,_ost);
       var fE=await self.composeFrontend({size:req.size,base_image:bE,text_layers:lE,spec:{type:req.type,fgBox:spec.fgBox,icons:spec.icons,bullets:spec.bullets,partLabel:'',brand:(spec.brand||'#fb7a22')}});
       return {ok:true,image:fE,type:req.type,size:req.size,degraded:true};
      }
     }catch(e2){}
     return {ok:false,error:{code:'gen_exception',message:'生成失败，可点该图单张重做'}};
    }
   })();
  },
  /* ============ G4/G5/G7 共用：AI 只画底板，客户真实产品最后确定性贴回 ============ */
  /* 全局背景出图信号量：多个图种（氛围/模特/拼图多格）在并发池里会同时各发数个 /scene-background，
     瞬时高并发会触发上游限流导致整批底板失败（串行单测均成功）。用全局限流把在途背景请求压到 2、其余排队。 */
  _bgGateRun:function(limit){
   var self=this;
   if(!self._bgQ)self._bgQ=[];if(typeof self._bgN!=='number')self._bgN=0;
   return new Promise(function(res){
    var job=function(){if(self._bgN>=limit)return false;self._bgN++;res(function(){self._bgN--;var nx=self._bgQ.shift();if(nx)setTimeout(nx,0);});return true;};
    if(!job())self._bgQ.push(job);
   });
  },
  _withBgGate:function(fn,limit){var self=this;return(async function(){var rel=await self._bgGateRun(limit||2);try{return await fn();}finally{rel();}})();},
  /* VL 质检独立信号量：每张底板都触发一次 vision-json，高并发同样会挤占上游、把出图请求拖到超时，统一限流到 2 */
  _vlGateRun:function(limit){
   var self=this;
   if(!self._vlQ)self._vlQ=[];if(typeof self._vlN!=='number')self._vlN=0;
   return new Promise(function(res){
    var job=function(){if(self._vlN>=limit)return false;self._vlN++;res(function(){self._vlN--;var nx=self._vlQ.shift();if(nx)setTimeout(nx,0);});return true;};
    if(!job())self._vlQ.push(job);
   });
  },
  _withVlGate:function(fn,limit){var self=this;return(async function(){var rel=await self._vlGateRun(limit||2);try{return await fn();}finally{rel();}})();},
  _vlPost:function(body,to){var self=this;return self._withVlGate(function(){return authPost('/vision-json',body,to||60000);});},
  /* 通用「空底板」生成 + VL 质检选优（G7 拼图格 / G5 模特与降级实景共用）。returnAll 返回全部合格候选（已按分排序） */
  genScenePlate:function(opt){
   var self=this;opt=opt||{};
   return (async function(){
    var sizeStr=opt.size||'2304x2304',n=opt.n||3;
    var one=async function(){
     for(var a=0;a<3;a++){
      try{
       var r=await self._withBgGate(function(){return authPost('/scene-background',{bgPrompt:opt.bgPrompt,size:sizeStr},65000);});
       if(r&&r.ok&&r.b64)return'data:image/png;base64,'+r.b64;
      }catch(e){}
      await new Promise(function(r){setTimeout(r,2000*(a+1));});
     }
     return null;
    };
    var review=async function(im){
     var v=null;try{v=await self._vlPost({image:im,ask:opt.qcAsk,system:'You are a strict QA reviewer. Reply with JSON only.',maxTokens:340},60000);}catch(e){}
     return{image:im,qc:(v&&v.ok)?v.data:{}};
    };
    var batch=async function(k){var imgs=(await Promise.all(Array.from({length:k},one))).filter(Boolean);return await Promise.all(imgs.map(review));};
    var rv=await batch(n);var good=rv.filter(opt.okFn);
    if(!good.length&&opt.extra){rv=rv.concat(await batch(opt.extra));good=rv.filter(opt.okFn);}
    good.sort(function(a,b){return(parseInt((b.qc&&b.qc.score),10)||5)-(parseInt((a.qc&&a.qc.score),10)||5);});
    if(opt.returnAll)return{good:good,all:rv};
    if(good.length)return{url:good[0].image,qc:good[0].qc};
    if(rv.length)return{url:rv[0].image,qc:rv[0].qc,fallback:true};
    return null;
   })();
  },
  /* 标准「真实空场地、单一台面」底板 prompt 外壳（enLocation 为具体地点） */
  _plateShell:function(en){
   return'Photorealistic EMPTY background plate of a real location, used to composite a product onto later. Location: '+en+'. Eye-level view with strong real-room depth. In the FOREGROUND is exactly ONE single flat horizontal surface whose material and type MATCH the location described above (for example a metal workbench, solid wood table, marble counter, concrete floor or shelf board), with a straight front edge crossing the whole frame at roughly 70-82% of the image height; the surface top is clean, flat and empty in the lower-center where the product will stand, and extends a short way back. Behind and above it is the softly blurred real location with its OWN characteristic fixed architecture (window, door, cabinets, shelves, equipment or racking appropriate to that place) and realistic natural lighting appropriate to that place, realistic perspective. Each location must look visually distinct in its surface material, background architecture and light. STRICTLY only ONE level surface; NO steps, raised platform, ledge or second surface. No people, no product, no loose objects on the surface, no text, letters, logo or watermark. Photorealistic photograph, not a 3D render.';
  },
  _PLATE_QC:'This is an AI-generated EMPTY background plate with NO product in it yet; a product will be composited onto the lower-center later. Return JSON exactly: {"sceneText":true ONLY if there is PROMINENT readable or gibberish text such as signage, posters, banners or big words on walls; false otherwise (IGNORE a small semi-transparent "AI generated" watermark in a corner and tiny switches/sockets),"realVenue":true ONLY if it is a recognizable REAL photographed room/location with clear spatial depth and fixed architecture (window/door/counter/cabinet edges, a real floor with a horizon); FALSE for a seamless cyclorama, infinite cove, flat solid wall, green screen or 3D/CGI render,"render3d":true if it looks like CGI/3D instead of a photograph,"singleLevel":true if there is exactly ONE foreground standing surface (counter/table) with one straight front edge around 70-85% height and NO steps or second level,"surfaceY":a decimal 0.65-0.92 for the y of that single surface TOP at lower-center where a product base rests,"score":integer 1-10 for photographic realism and suitability}.',
  _plateOkSmall:function(q){var Q=(q&&q.qc)||{},sc=parseInt(Q.score,10);return Q.sceneText!==true&&Q.realVenue===true&&Q.render3d!==true&&Q.singleLevel!==false&&isFinite(sc)&&sc>=6;},
  /* G7/G3 场景来源：视觉模型看着真实商品动态推导"用途差异化"场地（一次调用，单场景取[0]、四宫格取前4）；写死品类库仅作 VL 不可用时的离线兜底。
     根治"品类库没覆盖就掉进通用家居四格"与"靠人工逐品类维护场景"两个问题 */
  inferVenues:function(count){
   var self=this;count=count||4;
   var pr=(self.planResp&&self.planResp.product)||{};
   var key=self.resolvedLang()+'|'+String(pr.name||'')+'|'+String(pr.domain||'');
   if(self._inferredVenues&&self._inferVenueKey===key&&self._inferredVenues.length>=4)return Promise.resolve(self._inferredVenues);
   if(self._inferVenuePromise&&self._inferVenueKey===key)return self._inferVenuePromise;
   self._inferVenueKey=key;
   self._inferVenuePromise=(async function(){
    var fb=self._staticVenueList(pr.domain,pr.scenes,pr.name||'');
    try{
     var img=self._mktRef||self._cleanImage||(GS().images&&GS().images[0]?GS().images[0].dataUrl:null);
     var sc=Array.isArray(pr.scenes)?pr.scenes.join('、'):String(pr.scenes||'');
     var ask='你正在为电商"商品多场景展示图"选景。图中是客户的真实商品（稍后会把真实商品像素贴回，你只需决定背景场地，画面里不要画产品）。请像资深电商美术指导，为它挑选 6 个现实中最有说服力、彼此用途明显不同的真实场地（第1个是最具代表性的主使用场景，前4个用于四宫格）。\n'
      +'硬性要求：\n'
      +'1. 必须是该商品现实中真正被使用、操作、陈列或售卖的具体场所，按用途/使用情境区分；6 个场地要分布在功能明显不同的空间（专业作业现场、门店或经营场所、居家不同功能区、出行或户外等，按商品属性合理组合）。严禁同一房间换机位，严禁仅光线或角度不同。\n'
      +'2. 专业工具、设备、五金、仪器、汽配类，必须给其真实作业现场（如汽修工位、装修工地、生产车间、维修工作台、库房或随车场景），不得放进居家客厅、餐桌、书桌等无关生活场景。\n'
      +'3. 每个 en 用英文一句话描述空背景底板，以 a real 开头：写清该场所特有的背景固定结构（门窗/柜体/设备/货架等，柔和虚化）、一个水平承托面及其真实材质（金属工作台、木桌、大理石台面、水泥地面、货架层板等）、真实光线；画面中下部留出干净空位放产品；不得有人、产品本身、散放杂物、任何文字字母数字标牌水印。若是门店、专柜、展厅、库房等经营场所，招牌、灯箱、货架海报必须是空白或完全虚化，不得出现任何可读品牌名或字母，也不要出现带人脸的海报。\n'
      +'4. zh 是 2-4 个中文字的具体场景标签（如 汽修换胎、装修施工、梳妆台、机场出行），禁止 场景一、客厅场景 这类泛词。\n'
      +'商品参考：名称「'+String(pr.name||'这款商品')+'」，类目「'+String(pr.domain||'')+'」，已知使用场景「'+sc+'」。\n'
      +'只输出JSON，不要解释：{"venues":[{"zh":"汽修换胎","en":"a real auto repair garage service bay with a vehicle wheel, blurred tool cabinets and a concrete floor"}]}';
     var v=img?await self._vlPost({image:img,ask:ask,system:'你是资深电商美术指导，只输出JSON。',maxTokens:1000},60000):null;
     var got=self._parseVenues(v&&v.ok?v.data:null);
     var out=[],seenZ={},seenE={};
     for(var i=0;i<got.length&&out.length<6;i++){
      var z=String(got[i].zh||'').trim().slice(0,6),e=String(got[i].en||'').trim().replace(/\s+/g,' ');
      if(!z||!e||e.length<18)continue;if(seenZ[z]||seenE[e.toLowerCase()])continue;
      seenZ[z]=1;seenE[e.toLowerCase()]=1;out.push({zh:z,en:e});
     }
     for(var k=0;k<fb.length&&out.length<count;k++){if(!seenZ[fb[k].zh]){seenZ[fb[k].zh]=1;out.push({zh:fb[k].zh,en:fb[k].en});}}
     var guard=0;while(out.length<count&&guard++<20){var f=fb[out.length%fb.length];if(!seenZ[f.zh]){seenZ[f.zh]=1;out.push({zh:f.zh,en:f.en});}else if(out.length>=fb.length)break;}
     self._inferredVenues=out;
    }catch(e){self._inferredVenues=fb;}
    return self._inferredVenues;
   })();
   return self._inferVenuePromise;
  },
  _parseVenues:function(d){
   if(!d)return[];
   if(typeof d==='string'){
    var s=d.trim().replace(/^```(json)?/i,'').replace(/```$/,'').trim();
    try{d=JSON.parse(s);}catch(e){var a=s.indexOf('['),b=s.lastIndexOf(']');if(a>=0&&b>a){try{d=JSON.parse(s.slice(a,b+1));}catch(e2){return[];}}else return[];}
   }
   var arr=(d&&d.venues)||(Array.isArray(d)?d:null);
   return Array.isArray(arr)?arr:[];
  },
  /* 多场景场地：优先用视觉模型按真实商品动态推导的场地；未就绪/失败时回落写死品类库 */
  buildVenueList:function(domain,scenes,name){
   if(Array.isArray(this._inferredVenues)&&this._inferredVenues.length>=4)return this._inferredVenues.slice(0,4).map(function(p){return{en:p.en,zh:p.zh};});
   return this._staticVenueList(domain,scenes,name);
  },
  /* G7 每品类 4 个不同真实场地（en=底板地点，zh=格内标签）——写死库，仅作 VL 不可用时的离线兜底 */
  _staticVenueList:function(domain,scenes,name){
   var txt=String(domain||'').toLowerCase()+' '+(Array.isArray(scenes)?scenes.join(' '):(scenes||''))+' '+String(name||'').toLowerCase();
   var L;
   if(/行李|拉杆|箱包|旅行箱|行李箱|登机箱|托运箱|背包|suitcase|luggage|trolley|travel|backpack/.test(txt))L=[
    ['a real bright airport terminal interior with a polished hard floor and distant blurred floor-to-ceiling windows and check-in architecture','机场出行'],
    ['a tidy modern hotel lobby with a real polished floor, a reception area and window daylight','酒店大堂'],
    ['a real modern railway-station waiting hall with pillars, seating and blurred departure boards with no readable text, a real floor','高铁车站'],
    ['a bright tidy bedroom corner with a wooden dresser top, a blurred bed and window daylight','居家收纳']];
   else if(/美妆|护肤|化妆|洁面|面膜|口红|香水|cosmetic|skincare|makeup|beauty|serum|cream|lotion|perfume|cleanser/.test(txt))L=[
    ['a real bright bathroom vanity with a marble or wood washstand, a softly blurred mirror, vertical blinds and faint water reflections','清新浴室'],
    ['a real bright bedroom dressing table with a large soft-focus mirror, warm daylight and a tidy wood top','梳妆台'],
    ['a real bedside table in a bright bedroom with a blurred headboard and lamp, soft morning light','床头护理'],
    ['a clean modern hotel bathroom counter with a blurred mirror, towels and bright window light','差旅护理']];
   else if(/吹风|个护|剃须|牙刷|美发|直发|hair ?dryer|shaver|toothbrush|personal care|styler/.test(txt))L=[
    ['a real tidy bedroom dresser in a bright home with a blurred wardrobe and window daylight','卧室梳妆'],
    ['a real bright bathroom counter with a blurred mirror, towels and soft window light','浴室打理'],
    ['a real walk-in closet vanity area with softly blurred shelving and a dressing mirror, daylight','衣帽间'],
    ['a clean modern hotel room vanity desk with a blurred curtain and window light','差旅便携']];
   else if(/3c|数码|电子|耳机|音箱|充电器|手机|电脑|键盘|摄像|平板|earphone|speaker|charger|phone|laptop|keyboard|camera|digital|electronic/.test(txt))L=[
    ['a real modern home wooden desk with a blurred bookshelf and large window daylight','居家办公'],
    ['a real living-room coffee table scene with a blurred sofa and a window, warm light','客厅休闲'],
    ['a real bedside table in a modern bedroom with a blurred lamp and headboard, soft light','床头使用'],
    ['a real cafe wooden table near a window with softly blurred seating and daylight','咖啡办公']];
   else if(/家电|家居|厨房|锅|煲|水壶|吸尘|净化|kitchen|appliance|cooker|kettle|vacuum|purifier|home/.test(txt))L=[
    ['a real bright modern kitchen counter with blurred cabinetry and window daylight','现代厨房'],
    ['a real wooden dining table scene in a bright home with a blurred kitchen behind and daylight','餐厅场景'],
    ['a real living-room sideboard scene with a blurred sofa and a window','客厅家居'],
    ['a real bright home bar counter with softly blurred greenery and daylight','居家水吧']];
   else if(/食品|零食|饮料|茶|咖啡|水果|food|snack|beverage|coffee|tea|drink/.test(txt))L=[
    ['a real bright kitchen counter with blurred cabinetry and window light','厨房料理'],
    ['a real wooden dining table scene with blurred chairs and warm daylight','餐桌分享'],
    ['a real cafe wooden table by a window with a softly blurred interior and daylight','下午茶'],
    ['a real outdoor picnic table in a park with softly blurred greenery and natural light','户外野餐']];
   else if(/电动工具|五金工具|电动扳手|冲击扳手|电扳手|风炮|手电钻|电钻|角磨机|磨光机|切割机|电锤|电锯|电动起子|电动螺丝刀|螺丝刀|扳手|工具箱|工具套装|汽修|汽保|维修工具|电动|装修|施工|工地|车库|power ?tool|impact wrench|cordless|drill|wrench|grinder|toolbox|tool kit|garage|auto repair|automotive|construction|renovation|\bdiy\b/i.test(txt))L=[
    ['a real auto repair garage service bay with a vehicle wheel on a lift, blurred tool cabinets and a concrete floor, workshop light, no readable text or signage','汽修换胎'],
    ['a real home renovation and interior construction site with unfinished walls, a sturdy workbench and blurred building materials, daylight, no readable text or signage','装修施工'],
    ['a real construction site workshop with a metal workbench, blurred steel framing and scaffolding, work light, no readable text or signage','工地车间'],
    ['a real tidy home garage DIY repair workbench with a pegboard of hand tools, blurred storage shelves and daylight, no readable text or signage','家居维修']];
   else if(/轴承|工业|零件|五金|机械|螺丝|齿轮|管件|bearing|industrial|hardware|machinery|gear|metal part|workshop/.test(txt))L=[
    ['a real clean modern factory workshop metal machine workbench with softly blurred industrial equipment','生产车间'],
    ['a real industrial equipment bench with structured wall panels and softly blurred machine elements, workshop light','设备台面'],
    ['a real factory quality-inspection workbench with a metal surface and blurred gauges and shelving','质检工位'],
    ['a real warehouse packing table with blurred shelving and a concrete floor, industrial light','仓储发货']];
   else L=[
    ['a real modern living room with a wooden coffee table top in the foreground, a blurred fabric sofa and a floor-to-ceiling window with warm daylight','客厅茶几'],
    ['a real home study with a dark wooden desk top, blurred floor-to-ceiling bookshelves and a window with cool daylight','书房办公'],
    ['a real dining area with a solid wood dining table top, blurred wooden chairs and a sideboard, warm overhead light','餐厅用餐'],
    ['a real home entryway with a narrow console table top, a blurred entrance door and shoe cabinet, soft daylight from a side window','玄关收纳']];
   return L.map(function(p){return{en:p[0],zh:p[1]};});
  },
  _rr:function(x,bx,by,w,h,r){x.beginPath();x.moveTo(bx+r,by);x.arcTo(bx+w,by,bx+w,by+h,r);x.arcTo(bx+w,by+h,bx,by+h,r);x.arcTo(bx,by+h,bx,by,r);x.arcTo(bx,by,bx+w,by,r);x.closePath();},
  /* G7 在拼图格内顶部安全区画场景标签（半透明胶囊白字，产品在中下部，绝不压主体） */
  _drawCellTag:function(dataUrl,sizeStr,text){
   var self=this;return new Promise(function(res){
    var im=new Image();
    im.onload=function(){
     try{
      var sz=String(sizeStr).split('x'),W=+sz[0]||1280,H=+sz[1]||720;
      var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');x.drawImage(im,0,0,W,H);
      var FONT="'Hiragino Sans','Yu Gothic','Meiryo','Malgun Gothic','Microsoft YaHei UI','Microsoft YaHei','Noto Sans CJK SC',sans-serif";
      var fs=Math.round(H*.052);x.font='700 '+fs+'px '+FONT;
      var tw=x.measureText(String(text)).width,padX=fs*.72,padY=fs*.42,bh=fs+padY*2,bw=tw+padX*2,bx=W*.045,by=H*.045;
      x.fillStyle='rgba(16,22,32,.55)';self._rr(x,bx,by,bw,bh,bh*.30);x.fill();
      x.fillStyle='#ffffff';x.textAlign='left';x.textBaseline='middle';x.fillText(String(text),bx+padX,by+bh/2+fs*.04);
      res(c.toDataURL('image/jpeg',.92));
     }catch(e){res(dataUrl);}
    };
    im.onerror=function(){res(dataUrl);};im.src=dataUrl;
   });
  },
  /* G7 真·多场景拼图：4 个不同真实场地底板各贴同一真实产品，2×2 白缝，格内顶部标签不压产品 */
  genMultiScene:function(arg){
   var self=this,req=arg.req,fg=arg.fg,poseName=arg.poseName;
   return (async function(){
    try{
     var pr=(self.planResp&&self.planResp.product)||{};
     var venues=self.buildVenueList(req.domain,req.scenes,pr.name||'');
     var W=2560,H=1440,gap=14,cellW=Math.round((W-3*gap)/2),cellH=Math.round((H-3*gap)/2),cs=cellW+'x'+cellH;
     var oneCell=async function(v){
      var bg=null,sY=null;
      try{
       var pl=await self.genScenePlate({bgPrompt:self._plateShell(v.en),size:'2560x1440',qcAsk:self._PLATE_QC,okFn:self._plateOkSmall,n:1,extra:1});
       if(pl&&pl.url){bg=await self._coverTo(pl.url,cs);var y=parseFloat(pl.qc&&pl.qc.surfaceY);if(isFinite(y))sY=self._clamp(y,.68,.9);}
      }catch(e){}
      if(!bg)bg=await self.studioBgOnly(cs);
      var lay=await self.layoutCutout(fg,'scene_show',cs,poseName);
      if(sY)lay=await self._reanchorFg(lay,cs,sY);
      var merged=await self.mergeBgFg(bg,lay,cs);
      if(bg)merged=await self._zoomCropCorner(merged,cs,.08);
      return await self._drawCellTag(merged,cs,v.zh);
     };
     var half1=await Promise.all([oneCell(venues[0]),oneCell(venues[1])]);
     var half2=await Promise.all([oneCell(venues[2]),oneCell(venues[3])]);
     var cells=half1.concat(half2);
     var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
     x.fillStyle='#ffffff';x.fillRect(0,0,W,H);
     var pos=[[gap,gap],[2*gap+cellW,gap],[gap,2*gap+cellH],[2*gap+cellW,2*gap+cellH]];
     for(var i=0;i<4;i++){var im=await self._loadImg(cells[i]);x.drawImage(im,pos[i][0],pos[i][1],cellW,cellH);}
     return{ok:true,image:c.toDataURL('image/jpeg',.92),type:'multi_scene',size:req.size};
    }catch(e){
     try{var bg=await self.studioBgOnly(req.size);var lay=await self.layoutCutout(fg,'scene_show',req.size,poseName);var m=await self.mergeBgFg(bg,lay,req.size);
      return{ok:true,image:m,type:'multi_scene',size:req.size,degraded:true};}catch(e2){return{ok:false,error:{code:'multi_fail',message:'多场景拼图生成失败，可点单张重做'}};}
    }
   })();
  },
  /* G5 品类门控：工业件/五金/裸零件不做真人手持，改真实场景（服装/美妆/箱包/个护/3C/食品/家电优先） */
  modelSuitable:function(txt){
   return!/轴承|工业|零件|五金|机械|螺丝|齿轮|管件|法兰|轴承钢|bearing|industrial|hardware|machinery|gear|flange|shaft|metal part|workshop|bolt|nut\b/i.test(String(txt));
  },
  buildModelPlate:function(o){
   var txt=String(o.domain||'').toLowerCase()+' '+(Array.isArray(o.scenes)?o.scenes.join(' '):(o.scenes||''))+' '+String(o.name||'').toLowerCase();
   var who,loc,act;
   if(/美妆|护肤|化妆|洁面|面膜|口红|香水|cosmetic|skincare|makeup|beauty|serum|cream|lotion|perfume|cleanser/.test(txt)){
    who='one adult woman';loc='a bright modern bathroom vanity and dressing area with a real countertop, a softly blurred mirror and natural window light';
    act='She stands slightly LEFT of center, turned three-quarter toward the right with a calm natural expression. Both hands stay on her LEFT side: one hand rests gently near her collarbone, the other arm relaxed at her side; her hands must NOT reach toward, point at or hover over the empty countertop on the right. The RIGHT side of the countertop in the lower-right of the frame is flat, frontal, evenly lit and in SHARP FOCUS, clean, bare and empty, reserved for a skincare product that will be added later.';
   }else if(/吹风|个护|剃须|牙刷|美发|直发|hair ?dryer|shaver|toothbrush|personal care|styler/.test(txt)){
    who='one adult woman';loc='a bright modern bedroom dresser or bathroom with a real countertop, a blurred wardrobe or mirror and window daylight';
    act='She stands slightly LEFT of center as if styling her hair, one hand raised beside her head in a relaxed holding pose with the hand completely EMPTY, the other arm relaxed. The RIGHT side of the dresser top in the lower-right is clean, bare and empty, reserved for a hair-styling appliance that will be added later.';
   }else if(/行李|拉杆|箱包|旅行箱|背包|suitcase|luggage|trolley|travel|backpack/.test(txt)){
    who='one adult traveler';loc='a real bright airport terminal or modern hotel lobby with a polished real floor, blurred architecture and natural light';
    act='The traveler stands slightly LEFT of center facing slightly right, one arm hanging naturally by the right thigh with the hand loosely closed as if holding an invisible telescopic handle while holding NOTHING, the other arm relaxed. The open floor area to the traveler\u2019s RIGHT in the lower-right of the frame is clean and empty, reserved for one upright rolling suitcase that will be added later.';
   }else if(/3c|数码|电子|耳机|音箱|充电器|手机|电脑|键盘|摄像|平板|earphone|speaker|charger|phone|laptop|keyboard|camera|digital|electronic/.test(txt)){
    who='one adult person';loc='a real modern home desk or living room with a real desk surface, a blurred bookshelf or sofa and window daylight';
    act='The person stands slightly LEFT of center, one hand making a natural relaxed presenting gesture over the desk with the hand EMPTY, the other arm relaxed. The RIGHT side of the desk surface in the lower-right is clean, bare and empty, reserved for one electronic device that will be added later.';
   }else if(/食品|零食|饮料|茶|咖啡|水果|food|snack|beverage|coffee|tea|drink/.test(txt)){
    who='one adult person';loc='a real bright kitchen counter or dining scene with a real wood surface, blurred cabinetry and window daylight';
    act='The person stands slightly LEFT of center with one hand making a warm relaxed presenting gesture over the counter while holding NOTHING, the other arm relaxed. The RIGHT side of the counter in the lower-right is clean, bare and empty, reserved for one food product that will be added later.';
   }else{
    who='one adult person';loc='a real bright modern room with a real table or countertop, a blurred window and natural daylight';
    act='The person stands slightly LEFT of center, turned slightly toward the right, one hand making a natural relaxed presenting gesture with the hand EMPTY, the other arm relaxed. The RIGHT side of the table or floor in the lower-right is clean, bare and empty, reserved for one product that will be added later.';
   }
   return'Photorealistic vertical 3:4 lifestyle photograph with ONE single '+who+' in a real location: '+loc+'. '+act+' The person occupies roughly the LEFT half to two thirds of the frame, framed from head to mid-thigh, with a natural relaxed expression, looking slightly toward the empty reserved area. CRITICAL: the hands are completely EMPTY and hold NOTHING; both hands remain on their own side and must NOT reach over, point at or hover above the reserved empty surface area; there is NO product, bottle, tube, device, phone, bag, suitcase or any loose object anywhere in the frame yet, and the reserved surface or floor area is bare. Exactly TWO natural arms and TWO hands with five fingers each; NO extra arms, hands, fingers, fused or deformed limbs. Eye-level camera, the reserved countertop/floor surface and its surroundings are in SHARP, even focus with soft balanced lighting (only the far background is gently blurred), natural daylight, realistic skin and fabric, a real location with spatial depth. No text, letters, logo or watermark. Photorealistic photograph, not a 3D render.';
  },
  _MODEL_QC:'This is an AI-generated VERTICAL lifestyle photo that must contain ONE person and NO product yet; a product will later be composited into an empty reserved spot beside the person. Return JSON exactly: {"personCount":integer number of people (must be 1),"hands":integer number of visible hands (0 to 2),"extraLimbs":true if there are extra, fused or deformed arms/hands/fingers, otherwise false,"productInFrame":true if ANY product, bottle, tube, device, phone, bag, suitcase or loose object is already held or visible anywhere (must be false; ignore fixed furniture and architecture),"slot":{"x":,"y":,"w":,"h":} normalized rect of the CLEAN, bare, flat and evenly lit empty table or floor area beside the person where one product should be placed (located in the middle/lower part of the frame, not over the face),"slotSurface":"table" or "floor","surfaceY":decimal 0.62-0.95 for the y of the slot supporting surface TOP where the product base rests,"sceneText":true only for prominent readable or gibberish signage or big wall words (ignore a small corner AI watermark),"render3d":true if CGI/3D instead of a photograph,"score":integer 1-10 for realism and a clean, well-placed empty slot}.',
  _modelPlateOk:function(q){
   var Q=(q&&q.qc)||{},sc=parseInt(Q.score,10),s=Q.slot||{};
   var sw=parseFloat(s.w),sh=parseFloat(s.h),sx=parseFloat(s.x),sy=parseFloat(s.y);
   var slotOk=isFinite(sw)&&isFinite(sh)&&isFinite(sx)&&isFinite(sy)&&sw>=.10&&sw<=.55&&sh>=.10&&sh<=.75&&sx>=.08&&sx<=.88&&(sx+sw)<=.99&&sy>=.34;
   return parseInt(Q.personCount,10)===1&&parseInt(Q.hands,10)<=2&&Q.extraLimbs!==true&&Q.productInFrame!==true&&slotOk&&Q.sceneText!==true&&Q.render3d!==true&&isFinite(sc)&&sc>=7;
  },
  /* G5 把真实产品按 VL 锚点矩形等比 contain 贴到人物身侧/手边的台面或地面（只平移缩放、不做透视变形，保真实像素），再由 mergeBgFg 补接地阴影 */
  _mergeModelFg:function(bgDataUrl,fg,qc,sizeStr){
   var self=this;
   return new Promise(function(res){
    (async function(){
     try{
      var sz=String(sizeStr).split('x'),W=+sz[0]||1680,H=+sz[1]||2240;
      /* 复用 G3 场景图成熟落地布局（占比/底边/接地参数已验证），不再用 VL slot 矩形独立 contain（透视台面上会错位、偏大） */
      var lay=await self.layoutCutout(fg,'scene_show',sizeStr,'stand');
      var im=await self._loadImg(lay);
      var tmp=document.createElement('canvas');tmp.width=W;tmp.height=H;
      var tx=tmp.getContext('2d',{willReadFrequently:true});tx.drawImage(im,0,0,W,H);
      var td=tx.getImageData(0,0,W,H).data,x0=W,x1=-1,y1=-1;
      for(var yy=0;yy<H;yy+=2)for(var xx=0;xx<W;xx+=2){if(td[(yy*W+xx)*4+3]>16){if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy>y1)y1=yy;}}
      if(x1<x0||y1<0){res(await self.mergeBgFg(bgDataUrl,lay,sizeStr));return;}
      var pcx=(x0+x1)/2,baseY=y1;
      var s=(qc&&qc.slot)||{},rawCx=parseFloat(s.x)+(parseFloat(s.w)||0)/2;
      var targetCx=self._clamp(isFinite(rawCx)?rawCx:0.6,0.5,0.66)*W;
      var MODEL_SCALE=0.56; /* 有人物作尺度参照，产品≈人头高0.6；绕底边缩放、底边不动 */
      var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
      /* 景深/边缘融合：真人底板为浅景深柔焦，给贴入产品做轻微高斯柔化（顺带羽化硬剪边、降低棚拍贴片感），不重绘像素 */
      x.save();x.filter='blur(1.4px)';x.translate(targetCx,baseY);x.scale(MODEL_SCALE,MODEL_SCALE);x.translate(-pcx,-baseY);x.drawImage(im,0,0);x.restore();
      var placed=c.toDataURL('image/png');
      var sy=parseFloat(qc&&qc.surfaceY);
      if(isFinite(sy))placed=await self._reanchorFg(placed,sizeStr,self._clamp(sy,0.66,0.9));
      res(await self.mergeBgFg(bgDataUrl,placed,sizeStr,{model:true}));
     }catch(e){
      try{var lay2=await self.layoutCutout(fg,'scene_show',sizeStr,'stand');res(await self.mergeBgFg(bgDataUrl,lay2,sizeStr));}catch(e2){res(bgDataUrl);}
     }
    })();
   });
  },
  _modelFinalQc:function(dataUrl){
   var self=this;return new Promise(function(res){
    (async function(){
     var ask='This is a finished composite e-commerce image showing one real photographed person in a real scene, with ONE product placed beside them (the product was composited from a real photo and must look naturally placed, as if really there). Return JSON exactly: {"personCount":integer (should be 1),"productCount":integer number of the SAME product clearly shown (should be 1; do NOT count furniture or fixed room elements),"extraHands":true if there are more than two hands or extra/fused fingers or arms,"productFloating":true if the product has no contact with the table/floor and wrongly floats,"pasted":true if the product looks like a flat cutout badly pasted (wrong scale, hard outline, no shadow, impossible overlap) instead of sitting naturally in the scene,"scaleOk":false if the product is absurdly too big or too small relative to the person and room,"score":integer 1-10}.';
     try{
      var v=await self._vlPost({image:dataUrl,ask:ask,system:'You are a strict QA reviewer. Reply with JSON only.',maxTokens:300},60000),Q=(v&&v.ok&&v.data)||{};
      var ok=parseInt(Q.personCount,10)===1&&parseInt(Q.productCount,10)===1&&Q.extraHands!==true&&Q.productFloating!==true&&Q.pasted!==true&&Q.scaleOk!==false&&(parseInt(Q.score,10)||0)>=6;
      res({ok:ok,qc:Q});
     }catch(e){res({ok:false,qc:{}});}
    })();
   });
  },
  /* G5 真人模特 + 真实产品贴回；门控不适合或融合质检不过 → 诚实降级真实使用场景，绝不硬出恐怖图、绝不零输出 */
  genModelShow:function(arg){
   var self=this,req=arg.req,fg=arg.fg,ost=arg.ost,poseName=arg.poseName;
   return (async function(){
    var pr=(self.planResp&&self.planResp.product)||{},sizeStr=req.size;
    var compose=async function(base){var layers=self.buildTextLayersFE('model_show',ost);return await self.composeFrontend({size:sizeStr,base_image:base,text_layers:layers,spec:null});};
    var degrade=async function(note){
     if(note)self.addNote(typeLabel('model_show')+'：'+note);
     var bg=null,sY=null;
     try{
      var pl=await self.genScenePlate({bgPrompt:self._plateShell(self.buildVenue(req.domain,req.scenes,pr.name||'')),size:'1680x2240',qcAsk:self._PLATE_QC,okFn:self._plateOkSmall,n:2,extra:1});
      if(pl&&pl.url){bg=await self._coverTo(pl.url,sizeStr);var y=parseFloat(pl.qc&&pl.qc.surfaceY);if(isFinite(y))sY=self._clamp(y,.68,.92);}
     }catch(e){}
     if(!bg)bg=await self.studioBgOnly(sizeStr);
     var lay=await self.layoutCutout(fg,'scene_show',sizeStr,poseName);
     if(sY)lay=await self._reanchorFg(lay,sizeStr,sY);
     var m=await self.mergeBgFg(bg,lay,sizeStr);if(bg)m=await self._zoomCropCorner(m,sizeStr,.10);
     return{ok:true,image:await compose(m),type:'model_show',size:sizeStr,degraded:true};
    };
    var txt=String(req.domain||'')+' '+(Array.isArray(req.scenes)?req.scenes.join(' '):(req.scenes||''))+' '+(pr.name||'');
    if(!self.modelSuitable(txt))return await degrade('该品类更适合真实使用场景，已为你换成场景展示图。');
    var good=[],allPlates=[];
    try{
     var pres=await self.genScenePlate({bgPrompt:self.buildModelPlate({domain:req.domain,scenes:req.scenes,name:pr.name||''}),size:'1680x2240',qcAsk:self._MODEL_QC,okFn:self._modelPlateOk,n:2,extra:1,returnAll:true});
     good=(pres&&pres.good)||[];allPlates=(pres&&pres.all)||[];
    }catch(e){good=[];allPlates=[];}
    self._modelDebug={plateTotal:allPlates.length,plateGood:good.length,plateAllQc:allPlates.map(function(r){return r.qc;}),plateImgs:allPlates.slice(0,3).map(function(r){return r.image;}),finals:[],finalImgs:[]};
    for(var i=0;i<Math.min(3,good.length);i++){
     try{
      var bg=await self._coverTo(good[i].image,sizeStr);
      var merged=await self._mergeModelFg(bg,fg,good[i].qc,sizeStr);
      merged=await self._zoomCropCorner(merged,sizeStr,.07);
      self._modelDebug.finalImgs.push(merged);
      var vf=await self._modelFinalQc(merged);
      self._modelDebug.finals.push(vf.qc);
      if(vf.ok)return{ok:true,image:await compose(merged),type:'model_show',size:sizeStr};
     }catch(e){}
    }
    return await degrade('真人模特场景未通过融合质检，已为你换成真实使用场景图（可点该图单张重做）。');
   })();
  },
  /* 确定性兜底背景：r-background 失败/超时时，用干净浅灰白微水泥渐变 + 真实主体，保证不零输出 */
  fallbackSceneBase:function(canvasPng){
   return new Promise(function(res){
    var im=new Image();
    im.onload=function(){
     try{
      var W=im.width,H=im.height,c=document.createElement('canvas');c.width=W;c.height=H;
      var pre=document.createElement('canvas');pre.width=W;pre.height=H;
      var pctx=pre.getContext('2d',{willReadFrequently:true});pctx.drawImage(im,0,0);
      var pd=pctx.getImageData(0,0,W,H).data,x0=W,y0=H,x1=-1,y1=-1;
      for(var yy=0;yy<H;yy+=2)for(var xx=0;xx<W;xx+=2){
       if(pd[(yy*W+xx)*4+3]>16){if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;}
      }
      var x=c.getContext('2d');
      var horizon=H*0.78;
      var wg=x.createLinearGradient(0,0,0,horizon);
      wg.addColorStop(0,'#f6f8fb');wg.addColorStop(1,'#eceff3');
      x.fillStyle=wg;x.fillRect(0,0,W,horizon);
      var gg=x.createLinearGradient(0,horizon,0,H);
      gg.addColorStop(0,'#e6e9ef');gg.addColorStop(1,'#d7dce3');
      x.fillStyle=gg;x.fillRect(0,horizon,W,H-horizon);
      x.strokeStyle='rgba(110,120,135,0.10)';x.lineWidth=1;
      x.beginPath();x.moveTo(0,horizon);x.lineTo(W,horizon);x.stroke();
      if(x1>=x0&&y1>=0){
       var cxP=(x0+x1)/2,cyP=y1+H*0.004,cwP=(x1-x0)*0.62,chP=Math.max(6,H*0.016);
       x.save();x.translate(cxP,cyP);x.scale(1,chP/cwP);
       var rg=x.createRadialGradient(0,0,2,0,0,cwP);
       rg.addColorStop(0,'rgba(38,46,58,0.20)');rg.addColorStop(1,'rgba(38,46,58,0)');
       x.fillStyle=rg;x.beginPath();x.arc(0,0,cwP,0,Math.PI*2);x.fill();x.restore();
      }
      x.drawImage(im,0,0);
      res(c.toDataURL('image/jpeg',0.95));
     }catch(e){res(canvasPng);}
    };
    im.onerror=function(){res(canvasPng);};
    im.src=canvasPng;
   });
  },
  /* 纯棚拍背景（不含产品）：墙-地柔和空间，物理零瑕疵。信息/卖点/材质类图种的确定性背景。 */
  studioBgOnly:function(sizeStr){
   return new Promise(function(res){
    try{
     var sz=String(sizeStr||'1920x1920').split('x'),W=+sz[0]||1920,H=+sz[1]||1920;
     var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
     var horizon=H*0.78;
     var wg=x.createLinearGradient(0,0,0,horizon);
     wg.addColorStop(0,'#f6f8fb');wg.addColorStop(1,'#eceff3');
     x.fillStyle=wg;x.fillRect(0,0,W,horizon);
     var gg=x.createLinearGradient(0,horizon,0,H);
     gg.addColorStop(0,'#e6e9ef');gg.addColorStop(1,'#d7dce3');
     x.fillStyle=gg;x.fillRect(0,horizon,W,H-horizon);
     x.strokeStyle='rgba(110,120,135,0.10)';x.lineWidth=1;
     x.beginPath();x.moveTo(0,horizon);x.lineTo(W,horizon);x.stroke();
     res(c.toDataURL('image/jpeg',0.95));
    }catch(e){res(null);}
   });
  },
  /* 真实主体确定性贴回：背景在下，真实 fg（layoutCutout 输出，透明底）在上，
     并在产品脚下补自然椭圆接触阴影。产品像素 100% 来自客户实拍，模型只负责背景。 */
  mergeBgFg:function(bgDataUrl,layoutPng,sizeStr,opts){
   return new Promise(function(res){
    var im=new Image(),bg=new Image(),n=0;
    var drawOval=function(g,cx,cy,cw,ch,alpha){
     g.save();g.translate(cx,cy);g.scale(1,ch/cw);
     var rg=g.createRadialGradient(0,0,2,0,0,cw);
     rg.addColorStop(0,'rgba(38,46,58,'+alpha+')');rg.addColorStop(1,'rgba(38,46,58,0)');
     g.fillStyle=rg;g.beginPath();g.arc(0,0,cw,0,Math.PI*2);g.fill();g.restore();
    };
    var done=function(){
     try{
      var sz=String(sizeStr||'1920x1920').split('x'),W=+sz[0]||1920,H=+sz[1]||1920;
      var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
      if(bgDataUrl){x.drawImage(bg,0,0,W,H);}else{x.fillStyle='#eef1f5';x.fillRect(0,0,W,H);}
      var pre=document.createElement('canvas');pre.width=W;pre.height=H;
      var px=pre.getContext('2d',{willReadFrequently:true});px.drawImage(im,0,0,W,H);
      var pd=px.getImageData(0,0,W,H).data,x0=W,x1=-1,y1=-1;
      for(var yy=0;yy<H;yy+=2)for(var xx=0;xx<W;xx+=2){if(pd[(yy*W+xx)*4+3]>16){if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy>y1)y1=yy;}}
      if(x1>=x0&&y1>=0){
       var cxP=(x0+x1)/2,pw=(x1-x0);
       if(opts&&opts.model){
        /* 真人台面：双层接地阴影（外围环境遮蔽 + 深色紧接触核），治悬浮/贴片 */
        drawOval(x,cxP,y1+H*0.008,pw*0.98,Math.max(8,H*0.030),0.14);
        drawOval(x,cxP,y1+H*0.002,pw*0.52,Math.max(5,H*0.013),0.34);
       }else{
        drawOval(x,cxP,y1+H*0.004,pw*0.62,Math.max(6,H*0.016),0.20);
       }
      }
      x.drawImage(im,0,0,W,H);
      res(c.toDataURL('image/png'));
     }catch(e){res(layoutPng);}
    };
    im.onload=function(){n++;if(n>=2)done();};
    bg.onload=function(){n++;if(n>=2)done();};
    im.onerror=function(){res(layoutPng);};
    bg.onerror=function(){if(bgDataUrl){n++;if(n>=2)done();}else done();};
    im.src=layoutPng;
    if(bgDataUrl)bg.src=bgDataUrl;else{n++;if(n>=2)done();}
   });
  },
  /* 把任意比例底图按 cover 裁到成品比例（空房间方形底板 → 16:9/4:3 等），略偏下取以保留地面/台面 */
  _coverTo:function(dataUrl,sizeStr){
   return new Promise(function(res){
    var im=new Image();
    im.onload=function(){
     try{
      var sz=String(sizeStr||'1920x1920').split('x'),W=+sz[0]||1920,H=+sz[1]||1920;
      var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
      var ir=im.naturalWidth/im.naturalHeight,tr=W/H,sx,sy,sw,sh;
      if(ir>tr){sh=im.naturalHeight;sw=sh*tr;sx=(im.naturalWidth-sw)*0.5;sy=0;}
      else{sw=im.naturalWidth;sh=sw/tr;sx=0;sy=(im.naturalHeight-sh)*0.52;}
      x.drawImage(im,sx,sy,sw,sh,0,0,W,H);
      res(c.toDataURL('image/jpeg',0.95));
     }catch(e){res(dataUrl);}
    };
    im.onerror=function(){res(dataUrl);};
    im.src=dataUrl;
   });
  },
  /* 把透明产品画布整体垂直平移，使产品 alpha 底边对齐到承托面 bottomY(0-1)，限幅防视觉模型离谱值 */
  _reanchorFg:function(fgDataUrl,sizeStr,bottomY){
   return new Promise(function(res){
    var im=new Image();
    im.onload=function(){
     try{
      var sz=String(sizeStr||'1920x1920').split('x'),W=+sz[0]||1920,H=+sz[1]||1920;
      var c0=document.createElement('canvas');c0.width=W;c0.height=H;var x0=c0.getContext('2d',{willReadFrequently:true});x0.drawImage(im,0,0,W,H);
      var d=x0.getImageData(0,0,W,H).data,y1=-1;
      for(var yy=0;yy<H;yy+=2)for(var xx=0;xx<W;xx+=2){if(d[(yy*W+xx)*4+3]>16&&yy>y1)y1=yy;}
      if(y1<0){res(fgDataUrl);return;}
      var dy=Math.round(bottomY*H)-y1;
      dy=Math.max(-Math.round(H*0.10),Math.min(Math.round(H*0.12),dy));
      if(Math.abs(dy)<4){res(fgDataUrl);return;}
      var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
      x.drawImage(c0,0,dy);res(c.toDataURL('image/png'));
     }catch(e){res(fgDataUrl);}
    };
    im.onerror=function(){res(fgDataUrl);};
    im.src=fgDataUrl;
   });
  },
  /* 成品等比放大裁切：把模型在右下角加盖的合规水印随右/下边缘整体裁掉，产品与背景一起变换、接地关系不变，无局部修补痕 */
  _zoomCropCorner:function(dataUrl,sizeStr,k){
   k=k||0.06;
   return new Promise(function(res){
    var im=new Image();
    im.onload=function(){
     try{
      var sz=String(sizeStr||'1920x1920').split('x'),W=+sz[0]||1920,H=+sz[1]||1920;
      var sw=im.naturalWidth*(1-k),sh=im.naturalHeight*(1-k);
      var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
      x.drawImage(im,0,0,sw,sh,0,0,W,H);res(c.toDataURL('image/jpeg',0.95));
     }catch(e){res(dataUrl);}
    };
    im.onerror=function(){res(dataUrl);};
    im.src=dataUrl;
   });
  },
  /* ================= 图种语法引擎（G1 景别微距 / G2 确定性组件 / G6 主色字色） ================= */
  /* ---- G6 品牌主色提取 + WCAG 对比度派生（纯前端、确定性、同商品可复现） ---- */
  _clamp:function(v,a,b){return Math.max(a,Math.min(b,v));},
  _hex2:function(n){n=this._clamp(Math.round(n),0,255);return ('0'+n.toString(16)).slice(-2);},
  _hex:function(r,g,b){return '#'+this._hex2(r)+this._hex2(g)+this._hex2(b);},
  _rgbArr:function(hex){var m=/^#?([0-9a-f]{6})$/i.exec(String(hex||''));if(!m)return[251,122,34];var n=parseInt(m[1],16);return[(n>>16)&255,(n>>8)&255,n&255];},
  _hsv:function(r,g,b){r/=255;g/=255;b/=255;var mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,h=0;if(d){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360;}return{h:h,s:mx?d/mx:0,v:mx};},
  _hsvToRgb:function(h,s,v){h=(h%360)/360;var i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s),r,g,b;i=i%6;if(i===0){r=v;g=t;b=p;}else if(i===1){r=q;g=v;b=p;}else if(i===2){r=p;g=v;b=t;}else if(i===3){r=p;g=q;b=v;}else if(i===4){r=t;g=p;b=v;}else{r=v;g=p;b=q;}return[r*255,g*255,b*255];},
  _relLum:function(r,g,b){function f(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);},
  _contrast:function(a,b){var L1=this._relLum(a[0],a[1],a[2]),L2=this._relLum(b[0],b[1],b[2]);return(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);},
  /* 从透明主体 alpha 内像素量化取主色；主体近乎无彩色（黑白家电/金属/工业件）→ 回退品牌橙作强调 */
  extractBrand:function(fg){
   var self=this;
   if(self._brand&&self._brand.src===fg)return Promise.resolve(self._brand);
   return new Promise(function(res){
    var im=new Image();
    im.onload=function(){
     try{
      var N=144,cv=document.createElement('canvas');cv.width=N;cv.height=N;var x=cv.getContext('2d',{willReadFrequently:true});
      x.drawImage(im,0,0,N,N);var d=x.getImageData(0,0,N,N).data,HUE=24,bk=[];for(var k=0;k<HUE;k++)bk[k]={n:0,r:0,g:0,b:0};
      var ct=0,nt=0,sR=0,sG=0,sB=0;
      for(var p=0;p<d.length;p+=4){var r=d[p],g=d[p+1],b=d[p+2],a=d[p+3];if(a<48)continue;nt++;sR+=r;sG+=g;sB+=b;
       var hv=self._hsv(r,g,b);
       if(hv.s>0.24&&hv.v>0.25&&!(r>243&&g>243&&b>243)){var bi=Math.min(HUE-1,Math.floor(hv.h/360*HUE));var w=hv.s*(0.4+0.6*hv.v);bk[bi].n+=w;bk[bi].r+=r*w;bk[bi].g+=g*w;bk[bi].b+=b*w;ct+=w;}}
      var best=-1,bn=0;for(var q2=0;q2<HUE;q2++){var n2=bk[q2].n+bk[(q2+1)%HUE].n*0.6+bk[(q2+HUE-1)%HUE].n*0.6;if(n2>bn){bn=n2;best=q2;}}
      var neutral=!(ct>nt*0.12&&bn>ct*0.16),brand='#fb7a22';
      if(!neutral&&best>=0){var B=bk[best],rr=B.r/B.n,gg=B.g/B.n,bb=B.b/B.n,hsv=self._hsv(rr,gg,bb);
       hsv.s=self._clamp(Math.max(hsv.s,0.58),0,0.9);hsv.v=self._clamp(hsv.v,0.42,0.8);
       var rgb=self._hsvToRgb(hsv.h,hsv.s,hsv.v);brand=self._hex(rgb[0],rgb[1],rgb[2]);}
      var out={src:fg,brand:brand,neutral:neutral,avg:[Math.round(sR/nt),Math.round(sG/nt),Math.round(sB/nt)]};self._brand=out;res(out);
     }catch(e){var fb={src:fg,brand:'#fb7a22',neutral:true,avg:[238,240,244]};self._brand=fb;res(fb);}
    };
    im.onerror=function(){res({src:fg,brand:'#fb7a22',neutral:true,avg:[238,240,244]});};
    im.src=fg;
   });
  },
  _loadImg:function(src){return new Promise(function(res,rej){var im=new Image();im.onload=function(){res(im);};im.onerror=rej;im.src=src;});},
  /* 采样已加载底图某归一化矩形的平均相对亮度(0..1) */
  _regionLum:function(im,box){
   try{var n=24,cv=document.createElement('canvas');cv.width=n;cv.height=n;var x=cv.getContext('2d',{willReadFrequently:true});
    var W=im.naturalWidth,H=im.naturalHeight,sx=Math.round(box.x*W),sy=Math.round(box.y*H),sw=Math.max(2,Math.round(box.w*W)),sh=Math.max(2,Math.round(box.h*H));
    x.drawImage(im,sx,sy,sw,sh,0,0,n,n);var d=x.getImageData(0,0,n,n).data,sum=0,c=0;
    for(var i=0;i<d.length;i+=4){sum+=this._relLum(d[i],d[i+1],d[i+2]);c++;}
    return sum/Math.max(1,c);
   }catch(e){return 0.9;}
  },
  /* 依据文字落点背景明度 + 品牌主色派生整套设计 token；确定性可复现 */
  deriveTypeColors:function(im,brandHex,forceLight){
   var top=this._regionLum(im,{x:.03,y:0,w:.94,h:.30});
   var topDark=forceLight?false:(top>0.60);                 // 背景亮→深字；背景暗→白字
   var ink=topDark?'#1c2430':'#ffffff';
   var inkSoft=topDark?'#5d6775':'#e6eaf0';
   var br=this._rgbArr(brandHex),hsv=this._hsv(br[0],br[1],br[2]);
   var bgRGB=topDark?[255,255,255]:[22,27,38];
   // 强调色迭代到与背景对比≥3.0（图形/大字）；亮背景压深、暗背景提亮
   var rgb=br.slice(),guard=0;
   while(this._contrast(rgb,bgRGB)<3.0&&guard<24){hsv.v+=topDark?-0.045:0.045;hsv.v=this._clamp(hsv.v,0.12,0.92);var t=this._hsvToRgb(hsv.h,hsv.s,hsv.v);rgb=[t[0],t[1],t[2]];guard++;}
   var accent=this._hex(rgb[0],rgb[1],rgb[2]);
   var accentInk=this._contrast([255,255,255],rgb)>=2.1?'#ffffff':'#241505';
   return {ink:ink,inkSoft:inkSoft,accent:accent,accentInk:accentInk,topDark:topDark,brandStrong:!(this._brand&&this._brand.neutral)};
  },
  /* ---- G1 部件微距：对客户真实像素局部高分辨率裁切 + 超分，AI 不脑补部件 ---- */
  MACRO_TYPES:{material:1,product_detail:1},
  _bboxAlphaImg:function(im){
   try{var W=im.naturalWidth,H=im.naturalHeight,cv=document.createElement('canvas');cv.width=W;cv.height=H;var x=cv.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);
    var d=x.getImageData(0,0,W,H).data,x0=W,y0=H,x1=-1,y1=-1;
    for(var yy=0;yy<H;yy+=2)for(var xx=0;xx<W;xx+=2){if(d[(yy*W+xx)*4+3]>24){if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;}}
    if(x1<x0)return null;return{x:x0/W,y:y0/H,w:(x1-x0)/W,h:(y1-y0)/H};
   }catch(e){return null;}
  },
  locatePart:function(fg,hint){
   var self=this;
   if(self._partByFg&&self._partByFg.src===fg)return Promise.resolve(self._partByFg);
   return (async function(){
    var ask='这是一张已抠图（透明底）的商品图。请在商品上选出【一个】最值得特写、最能体现做工/材质/核心卖点的局部部件（如：按键、网罩、出风口、接缝、封口、拉链、拉杆、锁扣、轮子、轴承钢珠与刻印、接口、面料纹理、logo刻印）。只输出JSON：{"x":0到1,"y":0到1,"w":0到1,"h":0到1,"label":"部件名(4字内)"}。坐标相对整图左上角原点；框紧贴该部件、只框局部，宽和高都必须在0.20到0.42之间，严禁框住整个商品；优先选纹理/结构清晰、对焦实的部位。'+(hint?('卖点参考：'+String(hint).slice(0,120)):'');
    var box=null,label='';
    try{var r=await self._vlPost({image:fg,ask:ask,system:'你只输出JSON，坐标为相对宽高的比例。',maxTokens:200},60000);
     if(r&&r.ok&&r.data){var b=r.data;['x','y','w','h'].forEach(function(k){b[k]=parseFloat(b[k]);});
      if(isFinite(b.x)&&isFinite(b.y)&&isFinite(b.w)&&isFinite(b.h)&&b.w>0&&b.h>0){
       b.w=self._clamp(b.w,0.20,0.42);b.h=self._clamp(b.h,0.20,0.42);b.x=self._clamp(b.x,0,1-b.w);b.y=self._clamp(b.y,0,1-b.h);
       box={x:b.x,y:b.y,w:b.w,h:b.h};label=String(b.label||'').slice(0,8);}}
    }catch(e){}
    var out={src:fg,box:box,label:label};self._partByFg=out;return out;
   })();
  },
  /* 返回 {ok(分辨率是否足够),png(透明局部高清),box,label,srcPx,zoom,fallback} */
  extractMacro:function(fg,hint){
   var self=this;
   return (async function(){
    var im;try{im=await self._loadImg(fg);}catch(e){return{ok:false,fallback:true};}
    var W=im.naturalWidth,H=im.naturalHeight,info=self._alphaInfo(im),ab=info.bbox;
    if(info.transRatio<0.02)return{ok:false,fallback:true,srcPx:0};   // 非透明图（白底原图/照片）不硬做透明微距
    var loc=await self.locatePart(fg,hint),box=loc.box;
    if(!box){
     if(ab){box={x:ab.x+ab.w*0.16,y:ab.y+ab.h*0.08,w:ab.w*0.66,h:ab.w*0.66};if(box.y+box.h>ab.y+ab.h*0.98)box.y=ab.y+ab.h*0.98-box.h;}
     else box={x:.26,y:.26,w:.48,h:.48};
    }
    if(ab){var ix=Math.max(box.x,ab.x),iy=Math.max(box.y,ab.y),ix2=Math.min(box.x+box.w,ab.x+ab.w),iy2=Math.min(box.y+box.h,ab.y+ab.h);
     if(ix2>ix&&iy2>iy&&(ix2-ix)>=0.10&&(iy2-iy)>=0.10){box={x:ix,y:iy,w:ix2-ix,h:iy2-iy};}
     else{box={x:ab.x+ab.w*0.20,y:ab.y+ab.h*0.12,w:ab.w*0.60,h:ab.w*0.60};if(box.y+box.h>ab.y+ab.h)box.y=ab.y+ab.h-box.h;}}
    var sx=Math.round(box.x*W),sy=Math.round(box.y*H),sw=Math.max(8,Math.round(box.w*W)),sh=Math.max(8,Math.round(box.h*H));
    var mx=Math.round(sw*0.12),my=Math.round(sh*0.12);sx=Math.max(0,sx-mx);sy=Math.max(0,sy-my);sw=Math.min(W-sx,sw+2*mx);sh=Math.min(H-sy,sh+2*my);
    var srcShort=Math.min(sw,sh);
    var cc=document.createElement('canvas');cc.width=sw;cc.height=sh;var cx=cc.getContext('2d');cx.imageSmoothingEnabled=true;cx.imageSmoothingQuality='high';cx.drawImage(im,sx,sy,sw,sh,0,0,sw,sh);
    // 超分补救：超分底座多不保留透明通道 → 局部先贴浅灰不透明底送超分(最多2次=4x)，再用放大后的原 alpha 扣回，兼顾细节与透明
    var upSR=async function(url){try{var up=await authPost('/superres',{image:url,scale:2},100000);if(up&&up.ok&&up.image)return await self._loadImg(up.image);return null;}catch(e){return null;}};
    var flat=document.createElement('canvas');flat.width=sw;flat.height=sh;var fcx=flat.getContext('2d');fcx.fillStyle='#f2f3f5';fcx.fillRect(0,0,sw,sh);fcx.drawImage(cc,0,0);
    var rgbCv=flat,finW=sw,finH=sh,zoom=1;
    var i1=await upSR(flat.toDataURL('image/jpeg',0.95));
    if(i1){var c1=document.createElement('canvas');c1.width=i1.naturalWidth;c1.height=i1.naturalHeight;c1.getContext('2d').drawImage(i1,0,0);rgbCv=c1;finW=c1.width;finH=c1.height;zoom=2;
     if(Math.min(c1.width,c1.height)<480){var i2=await upSR(c1.toDataURL('image/jpeg',0.95));if(i2){var c2=document.createElement('canvas');c2.width=i2.naturalWidth;c2.height=i2.naturalHeight;c2.getContext('2d').drawImage(i2,0,0);rgbCv=c2;finW=c2.width;finH=c2.height;zoom=4;}}}
    var mask=document.createElement('canvas');mask.width=finW;mask.height=finH;var mcx=mask.getContext('2d');mcx.imageSmoothingEnabled=true;mcx.imageSmoothingQuality='high';mcx.drawImage(cc,0,0,finW,finH);
    var out=document.createElement('canvas');out.width=finW;out.height=finH;var ocx=out.getContext('2d');ocx.drawImage(rgbCv,0,0);
    try{var od=ocx.getImageData(0,0,finW,finH),md=mcx.getImageData(0,0,finW,finH);for(var pi=3;pi<od.data.length;pi+=4)od.data[pi]=md.data[pi];ocx.putImageData(od,0,0);}catch(e){}
    var crop=out.toDataURL('image/png'),curShort=Math.min(finW,finH);
    var MIN_OUT=420,enough=curShort>=MIN_OUT;   // 超分后短边≥420 才支撑微距铺满（起点，需分品类实测校准）
    return {ok:enough,enough:enough,png:crop,box:box,label:loc.label,srcPx:Math.round(srcShort),outPx:Math.round(curShort),zoom:zoom,fallback:false};
   })();
  },
  _alphaInfo:function(im){
   try{var W=im.naturalWidth,H=im.naturalHeight,cv=document.createElement('canvas');cv.width=W;cv.height=H;var x=cv.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0);
    var d=x.getImageData(0,0,W,H).data,x0=W,y0=H,x1=-1,y1=-1,opaque=0,tot=0;
    for(var yy=0;yy<H;yy+=2)for(var xx=0;xx<W;xx+=2){var a=d[(yy*W+xx)*4+3];tot++;if(a>24){opaque++;if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;}}
    var bbox=(x1<x0)?null:{x:x0/W,y:y0/H,w:(x1-x0)/W,h:(y1-y0)/H};
    return{bbox:bbox,transRatio:1-opaque/Math.max(1,tot)};
   }catch(e){return{bbox:null,transRatio:0.5};}
  },
  /* 微距主体布局：1:1 偏下铺满（顶部留标题）；横图偏右（左侧留卖点/放大窗）。返回 {png,fgBox} */
  macroLayoutCutout:function(macroPng,sizeStr){
   var self=this;return new Promise(function(res,rej){
    var sz=String(sizeStr||'1920x1920').split('x'),W=+sz[0]||1920,H=+sz[1]||1920,land=W>H;
    var im=new Image();
    im.onload=function(){
     var cv=document.createElement('canvas');cv.width=W;cv.height=H;var ctx=cv.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
     var dw,dh,px,py;
     if(land){dh=H*0.84;var sc=dh/im.naturalHeight;dw=im.naturalWidth*sc;dh=im.naturalHeight*sc;py=H*0.13;px=self._clamp(W*0.66-dw/2,W*0.34,W*0.97-dw);}
     else{dh=H*0.80;var sc2=dh/im.naturalHeight;dw=im.naturalWidth*sc2;dh=im.naturalHeight*sc2;px=(W-dw)/2;py=H*0.985-dh;}
     ctx.drawImage(im,px,py,dw,dh);
     res({png:cv.toDataURL('image/png'),fgBox:{x:px/W,y:py/H,w:dw/W,h:dh/H}});
    };
    im.onerror=function(){rej(new Error('macro_layout_fail'));};im.src=macroPng;
   });
  },
  /* 微距专用无缝背景：柔和中性渐变 + 极淡品牌色晕，无地平线（特写不需要地面） */
  macroBgOnly:function(sizeStr,brandHex){
   var self=this;
   return new Promise(function(res){
    try{
     var sz=String(sizeStr||'1920x1920').split('x'),W=+sz[0]||1920,H=+sz[1]||1920;
     var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
     var g=x.createLinearGradient(0,0,W*0.25,H);g.addColorStop(0,'#f7f9fb');g.addColorStop(0.55,'#eef1f5');g.addColorStop(1,'#e3e7ed');
     x.fillStyle=g;x.fillRect(0,0,W,H);
     var br=self._rgbArr(brandHex||'#fb7a22');
     var rg=x.createRadialGradient(W*0.72,H*0.78,10,W*0.72,H*0.78,W*0.75);
     rg.addColorStop(0,'rgba('+br[0]+','+br[1]+','+br[2]+',0.10)');rg.addColorStop(1,'rgba('+br[0]+','+br[1]+','+br[2]+',0)');
     x.fillStyle=rg;x.fillRect(0,0,W,H);
     res(c.toDataURL('image/jpeg',0.95));
    }catch(e){res(null);}
   });
  },
  /* 两层简单叠合（微距用，不画地面接触阴影） */
  mergeSimple:function(bgDataUrl,layoutPng,sizeStr){
   return new Promise(function(res){
    var im=new Image(),bg=new Image(),n=0;
    var done=function(){try{
     var sz=String(sizeStr||'1920x1920').split('x'),W=+sz[0]||1920,H=+sz[1]||1920;
     var c=document.createElement('canvas');c.width=W;c.height=H;var x=c.getContext('2d');
     if(bgDataUrl)x.drawImage(bg,0,0,W,H);else{x.fillStyle='#eef1f5';x.fillRect(0,0,W,H);}
     x.drawImage(im,0,0,W,H);res(c.toDataURL('image/png'));
    }catch(e){res(layoutPng);}};
    im.onload=function(){n++;if(n>=2)done();};bg.onload=function(){n++;if(n>=2)done();};
    im.onerror=function(){res(layoutPng);};bg.onerror=function(){n++;if(n>=2)done();};
    im.src=layoutPng;if(bgDataUrl)bg.src=bgDataUrl;else{n++;if(n>=2)done();}
   });
  },
  /* ================= G2 确定性卖点图形组件（Canvas，颜色取 G6 主色，避让主体） ================= */
  _FONT:"'Hiragino Sans','Yu Gothic','Meiryo','Malgun Gothic','Apple SD Gothic Neo','Microsoft YaHei UI','Microsoft YaHei','Noto Sans CJK SC',sans-serif",
  _overlap:function(a,b,pad){pad=pad||0;return !(a.x+a.w+pad<b.x||b.x+b.w+pad<a.x||a.y+a.h+pad<b.y||b.y+b.h+pad<a.y);},
  _roundRect:function(ctx,x,y,w,h,r){r=Math.min(r,h/2,w/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();},
  matchIcon:function(txt){
   var s=String(txt||'').toLowerCase();
   if(/风|吹风|出风|wind|airflow/.test(s))return'wind';
   if(/防水|水|湿|浴|雨|water|waterproof|drop/.test(s))return'drop';
   if(/电|快充|充电|电池|power|charge|volt|雷/.test(s))return'bolt';
   if(/锁|安全|防盗|tsa|lock|safe/.test(s))return'lock';
   if(/轮|万向|推行|滚轮|wheel|roller/.test(s))return'wheel';
   if(/拉杆|伸缩|手柄|提拉|handle|telesc|rod/.test(s))return'handle';
   if(/材质|金属|铝合金|钢|面料|皮革|material|metal|alum|steel|fabric|leather/.test(s))return'layers';
   if(/尺寸|容量|大容|升|空间|大号|size|capacity|litre|liter|volume/.test(s))return'box';
   if(/便携|折叠|轻便|轻量|收纳|携带|fold|portable|lightweight|compact/.test(s))return'fold';
   if(/温度|热风|恒温|温控|热|冷|temp|heat|cool/.test(s))return'temp';
   if(/封口|密封|拉链|闭合|seal|zipper|close/.test(s))return'seal';
   if(/静音|噪音|噪|noise|quiet|silent/.test(s))return'mute';
   if(/耐用|坚固|防摔|抗|防护|durable|strong|guard|protect/.test(s))return'shield';
   return'check';
  },
  _ICON_PATHS:{
   check:{p:['M5 12.5L10 17L19 7']},
   wind:{p:['M3 9h10.5a2.8 2.8 0 1 0-2.8-2.8','M3 14h14.5a2.8 2.8 0 1 1-2.8 2.8','M3 19h7']},
   drop:{p:['M12 3C12 3 6 10 6 14a6 6 0 0 0 12 0C18 10 12 3 12 3Z']},
   bolt:{p:['M13 3L5 13.5h5.5L10 21l8-11h-5.5L13 3Z']},
   lock:{p:['M7.5 11V8a4.5 4.5 0 0 1 9 0v3','M5.5 11h13v9.5h-13z']},
   wheel:{p:['M12 3.8v4.4','M12 15.8v4.4','M3.8 12h4.4','M15.8 12h4.4'],a:[[12,12,8.2],[12,12,2.4]]},
   handle:{p:['M12 3.5v17','M8.5 7l3.5-3.5 3.5 3.5','M8.5 17l3.5 3.5 3.5-3.5']},
   layers:{p:['M12 3l9 5-9 5-9-5 9-5Z','M3.2 13l8.8 4.9 8.8-4.9']},
   box:{p:['M4 4h16v16H4z','M14 4h6v6','M20 4L9.5 14.5']},
   fold:{p:['M4.5 19.5L19.5 4.5','M13.5 4.5h6v6']},
   temp:{p:['M10 4.2a2 2 0 0 1 4 0v9.6a4.6 4.6 0 1 1-4 0V4.2Z','M12 9v6.4']},
   seal:{p:['M4 9h16','M4 15h16','M7 6.6v10.8','M17 6.6v10.8']},
   mute:{p:['M4 9.5v5h3.5L13 18.5v-13L7.5 9.5H4z','M16 9l5 6','M21 9l-5 6']},
   shield:{p:['M12 3l8 3v5.5c0 5-3.6 8-8 9.2C7.6 19.5 4 16.5 4 11.5V6l8-3Z','M8.6 12l2.4 2.4 4.4-4.8']}
  },
  _drawIcon:function(ctx,name,x,y,s,color){
   var ic=this._ICON_PATHS[name]||this._ICON_PATHS.check;
   ctx.save();ctx.translate(x,y);ctx.scale(s/24,s/24);
   ctx.strokeStyle=color;ctx.lineWidth=1.9;ctx.lineCap='round';ctx.lineJoin='round';ctx.lineJoin='round';
   (ic.p||[]).forEach(function(d){try{ctx.stroke(new Path2D(d));}catch(e){}});
   (ic.a||[]).forEach(function(c){try{var p=new Path2D();p.arc(c[0],c[1],c[2],0,Math.PI*2);ctx.stroke(p);}catch(e){}});
   ctx.restore();
  },
  _fitOneLine:function(ctx,text,maxW,fs){var f=fs;ctx.font='600 '+f+'px '+this._FONT;while(f>11&&ctx.measureText(text).width>maxW){f-=2;ctx.font='600 '+f+'px '+this._FONT;}if(ctx.measureText(text).width>maxW){while(ctx.measureText(text+'…').width>maxW&&text.length>1){text=text.slice(0,-1);}text+='…';}return{text:text,fs:f};},
  /* 卖点胶囊：半透明圆角板 + accent 圆图标 + 单行文字 */
  drawCapsule:function(ctx,o,W,H){
   try{
    var x=o.x*W,y=o.y*H,w=o.w*W,h=o.h*H,r=h/2,dark=!o.token.topDark;
    ctx.save();ctx.shadowColor='rgba(15,22,33,0.18)';ctx.shadowBlur=h*0.12;ctx.shadowOffsetY=h*0.04;
    ctx.fillStyle=dark?'rgba(16,22,32,0.60)':'rgba(255,255,255,0.94)';this._roundRect(ctx,x,y,w,h,r);ctx.fill();ctx.restore();
    var ccx=x+h*0.52,ccy=y+h/2,cr=h*0.33;
    ctx.fillStyle=o.token.accent;ctx.beginPath();ctx.arc(ccx,ccy,cr,0,Math.PI*2);ctx.fill();
    this._drawIcon(ctx,o.icon||'check',ccx-cr*0.95,ccy-cr*0.95,cr*1.9,o.token.accentInk);
    var fs=h*0.40,fit=this._fitOneLine(ctx,o.text,w-h*1.02,fs);
    ctx.font='600 '+fit.fs+'px '+this._FONT;ctx.fillStyle=dark?'#ffffff':o.token.ink;ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.fillText(fit.text,x+h*0.92,y+h/2+fit.fs*0.04);
   }catch(e){}
  },
  /* 图标卡片（icon_selling/ingredients）：白板 + accent 圆图标 + 居中标注 */
  drawIconCard:function(ctx,o,W,H){
   try{
    var x=o.x*W,y=o.y*H,w=o.w*W,h=o.h*H,r=h*0.16,dark=!o.token.topDark;
    ctx.save();ctx.shadowColor='rgba(15,22,33,0.16)';ctx.shadowBlur=h*0.10;ctx.shadowOffsetY=h*0.03;
    ctx.fillStyle=dark?'rgba(16,22,32,0.60)':'rgba(255,255,255,0.95)';this._roundRect(ctx,x,y,w,h,r);ctx.fill();ctx.restore();
    var ic=Math.min(w,h)*0.30,ccx=x+w/2,ccy=y+h*0.34;
    ctx.fillStyle=o.token.accent;ctx.beginPath();ctx.arc(ccx,ccy,ic*0.62,0,Math.PI*2);ctx.fill();
    this._drawIcon(ctx,o.icon||'check',ccx-ic*0.59,ccy-ic*0.59,ic*1.18,o.token.accentInk);
    var fs=h*0.16,fit=this._fitOneLine(ctx,o.text,w*0.88,fs);
    ctx.font='600 '+fit.fs+'px '+this._FONT;ctx.fillStyle=dark?'#f2f5f9':o.token.ink;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(fit.text,x+w/2,y+h*0.74);
   }catch(e){}
  },
  /* 白色描边圆形放大窗：窗内=G1 真实微距像素；指引线连到主体部件 */
  drawLoupe:function(ctx,o,W,H){
   try{
    var cx=o.cx*W,cy=o.cy*H,r=o.r*W,img=o.img;
    if(o.leader){var lx=o.leader.x*W,ly=o.leader.y*H;
     var dx=cx-lx,dy=cy-ly,L=Math.sqrt(dx*dx+dy*dy)||1,ex=cx-dx/L*r,ey=cy-dy/L*r;
     ctx.save();ctx.strokeStyle='rgba(255,255,255,0.92)';ctx.lineWidth=Math.max(2,W*0.0035);ctx.lineCap='round';
     ctx.shadowColor='rgba(15,22,33,0.25)';ctx.shadowBlur=W*0.004;ctx.beginPath();ctx.moveTo(lx,ly);ctx.lineTo(ex,ey);ctx.stroke();ctx.restore();
     ctx.fillStyle=o.token.accent;ctx.beginPath();ctx.arc(lx,ly,Math.max(3,W*0.006),0,Math.PI*2);ctx.fill();}
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
    if(img){var iw=img.naturalWidth||r*2,ih=img.naturalHeight||r*2,sc=Math.max((2*r)/iw,(2*r)/ih);ctx.drawImage(img,cx-(iw*sc)/2,cy-(ih*sc)/2,iw*sc,ih*sc);}
    else{ctx.fillStyle='#e7ebf0';ctx.fillRect(cx-r,cy-r,2*r,2*r);}
    ctx.restore();
    ctx.save();ctx.shadowColor='rgba(15,22,33,0.30)';ctx.shadowBlur=r*0.18;ctx.shadowOffsetY=r*0.05;
    ctx.strokeStyle='#ffffff';ctx.lineWidth=r*0.10;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();ctx.restore();
    ctx.strokeStyle='rgba(255,255,255,0.85)';ctx.lineWidth=Math.max(1.5,r*0.03);ctx.beginPath();ctx.arc(cx,cy,r*1.02,0,Math.PI*2);ctx.stroke();
   }catch(e){}
  },
  /* 部件卖点示意弧线（活动范围/结构强调），accent 半透明 + 两端箭头 */
  drawArcSweep:function(ctx,o,W,H){
   try{
    var cx=o.cx*W,cy=o.cy*H,r=o.r*W,a0=o.a0,a1=o.a1,col=o.token.accent;
    function pt(a,rr){return [cx+Math.cos(a)*rr,cy+Math.sin(a)*rr];}
    ctx.save();ctx.lineCap='round';
    ctx.strokeStyle=this._rgba(col,0.22);ctx.lineWidth=Math.max(6,W*0.016);ctx.beginPath();ctx.arc(cx,cy,r,a0,a1);ctx.stroke();
    ctx.strokeStyle=this._rgba(col,0.85);ctx.lineWidth=Math.max(2,W*0.005);ctx.beginPath();ctx.arc(cx,cy,r,a0,a1);ctx.stroke();
    [[a0],[a1]].forEach(function(aa){var a=aa[0],p=pt(a,r),pb=pt(a,r*0.80),tang=a+Math.PI/2;
     ctx.fillStyle=col;ctx.beginPath();ctx.arc(p[0],p[1],Math.max(3,W*0.007),0,Math.PI*2);ctx.fill();});
    ctx.restore();
   }catch(e){}
  },
  _rgba:function(hex,al){var c=this._rgbArr(hex);return 'rgba('+c[0]+','+c[1]+','+c[2]+','+al+')';},
  /* 标题下品牌小横杠（确定性品牌点缀） */
  drawAccentBar:function(ctx,o,W,H){try{ctx.fillStyle=o.token.accent;this._roundRect(ctx,o.x*W,o.y*H,o.w*W,o.h*H,(o.h*H)/2);ctx.fill();}catch(e){}},
  /* 组件编排：依据图种、主体占位 fgBox 做避让，任何组件失败都不影响出图 */
  drawComponents:function(ctx,spec,imgs,W,H){
   var tk=spec.token,self=this;
   try{
    var fg=spec.fgBox||{x:.3,y:.3,w:.4,h:.6},pad=0.012;
    var free=function(box){return !self._overlap(box,fg,pad);};
    if(spec.type==='icon_selling'||spec.type==='ingredients'){
     // 图标卡按数量居中：≤3 单行；4 转 2×2；5 为 3+2（第二行居中）；6 为 3×2，避免 3+1 孤卡
     var ilist=(spec.icons||[]).slice(0,6),inN=ilist.length;
     var icw=.285,ich=.135,igx=.025,igy=.025;
     ilist.forEach(function(ic,i){
      var cols,rows,row,colf;
      if(inN<=3){cols=inN;rows=1;row=0;colf=i;}
      else if(inN===4){cols=2;rows=2;row=Math.floor(i/2);colf=i%2;}
      else if(inN===5){cols=3;rows=2;row=Math.floor(i/3);colf=i<3?i:(i-3+0.5);}
      else {cols=3;rows=2;row=Math.floor(i/3);colf=i%3;}
      var totW=cols*icw+(cols-1)*igx,ix0=(1-totW)/2;
      var totH=rows*ich+(rows-1)*igy,iy0=.965-totH;
      var bx=ix0+colf*(icw+igx),by=iy0+row*(ich+igy);
      self.drawIconCard(ctx,{x:bx,y:by,w:icw,h:ich,text:ic.label,icon:self.matchIcon(ic.icon_hint||ic.label),token:tk},W,H);});
      return;
    }
    if(spec.type==='search_promo'){
      // G7 营销搜索主图：产品身后品牌色柔光 + 底部弧形光带 + 三颗居中图标胶囊（确定性绘制，1:1 强缩略冲击）
      var ac=self._rgbArr(tk.accent),mW=Math.min(W,H);
      var gcx=.50*W,gcy=.55*H,gr=.42*mW;
      var rg2=ctx.createRadialGradient(gcx,gcy,gr*.12,gcx,gcy,gr);
      rg2.addColorStop(0,'rgba('+ac.join(',')+',.16)');rg2.addColorStop(.62,'rgba('+ac.join(',')+',.05)');rg2.addColorStop(1,'rgba('+ac.join(',')+',0)');
      ctx.fillStyle=rg2;ctx.beginPath();ctx.arc(gcx,gcy,gr,0,Math.PI*2);ctx.fill();
      ctx.save();ctx.strokeStyle='rgba('+ac.join(',')+',.55)';ctx.lineWidth=Math.max(3,W*0.006);ctx.lineCap='round';
      ctx.beginPath();ctx.arc(.5*W,.83*H,.30*mW,Math.PI*0.94,Math.PI*2.06);ctx.stroke();ctx.restore();
      var sp=((spec.icons&&spec.icons.length)?spec.icons.map(function(i){return i.label;}):(spec.bullets||[])).slice(0,3);
      var pw=.265,ph=.078,gap=.022,tot=sp.length*pw+Math.max(0,sp.length-1)*gap,px0=(1-tot)/2;
      sp.forEach(function(tx2,i){var box={x:px0+i*(pw+gap),y:.885,w:pw,h:ph};if(free(box))self.drawCapsule(ctx,{x:box.x,y:box.y,w:box.w,h:box.h,text:tx2,icon:self.matchIcon(tx2),token:tk},W,H);});
      return;
    }
    // 标题左侧品牌竖条（确定性品牌点缀，不占纵向空间、不压副标）
    if(['core_selling','selling_point','hero','material','product_detail'].indexOf(spec.type)>=0){
      this.drawAccentBar(ctx,{x:.028,y:.072,w:.012,h:.078,token:tk},W,H);
    }
    var bullets=(spec.bullets||[]).slice(0,3);
    if(spec.type==='core_selling'||spec.type==='selling_point'||spec.type==='hero'){
     // 卖点胶囊：逐颗找位，左列竖排优先，放不下的颗转底部横排兜底——能放几颗放几颗，绝不压主体，也不因一颗碰撞就整列弃画
     var cw=.28,ch=.082;
     bullets.forEach(function(bt,i){
      var cands=[{x:.04,y:.34+i*(ch+.018),w:cw,h:ch},{x:.05+i*.325,y:.875,w:.29,h:.072}];
      for(var k=0;k<cands.length;k++){if(free(cands[k])){self.drawCapsule(ctx,{x:cands[k].x,y:cands[k].y,w:cands[k].w,h:cands[k].h,text:bt,icon:self.matchIcon(bt),token:tk},W,H);break;}}
     });
     // 放大窗（仅 core_selling 且有真实微距）：四角候选，半径自适应缩小，尽量在大件/圆形产品上也能落位
     if(spec.type==='core_selling'&&imgs&&imgs.loupe&&spec.part){
      var cand=[{cx:.86,cy:.64},{cx:.14,cy:.64},{cx:.87,cy:.30},{cx:.13,cy:.30}],pick=null,rr=.13;
      for(var rt=0;rt<2&&!pick;rt++){var rtry=rt===0?.13:.10;
       for(var ci=0;ci<cand.length;ci++){var c=cand[ci],box={x:c.cx-rtry,y:c.cy-rtry,w:2*rtry,h:2*rtry};if(free(box)){pick=c;rr=rtry;break;}}}
      if(pick)this.drawLoupe(ctx,{cx:pick.cx,cy:pick.cy,r:rr,img:imgs.loupe,leader:spec.part,token:tk},W,H);
      // 部件弧线：以部件点为中心，朝放大窗反方向小弧
      if(pick){var px=spec.part.x,py=spec.part.y,side=pick.cx>px?Math.PI:0;
       this.drawArcSweep(ctx,{cx:px,cy:py,r:.075,a0:side-0.7,a1:side+0.7,token:tk},W,H);}
     }
    }
    // 材质/细节微距：右下角部件名小标签
    if((spec.type==='material'||spec.type==='product_detail')&&spec.partLabel){
      var w=.16+spec.partLabel.length*0.018,box2={x:.97-w,y:.90,w:w,h:.06};
      if(free(box2))this.drawCapsule(ctx,{x:box2.x,y:box2.y,w:box2.w,h:box2.h,text:spec.partLabel,icon:'layers',token:tk},W,H);
    }
   }catch(e){}
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
  /* 客观高饱和/火焰检测：Sobel 对"大尺度平滑流体/火焰/色块"无效（边缘密度低），
     故另用像素颜色判定——高饱和彩色占比、暖橙(火焰)占比。纯像素，不依赖 VL。 */
  bgColorRatio:function(dataUrl){
   return new Promise(function(res){
    var im=new Image();
    im.onload=function(){
     try{
      var N=256,c=document.createElement('canvas');c.width=N;c.height=Math.max(64,Math.round(N*im.height/im.width));
      var x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0,c.width,c.height);
      var d=x.getImageData(0,0,c.width,c.height).data,w=c.width,h=c.height;
      var hi=0,warm=0,tot=0;
      for(var y=0;y<h;y++)for(var xx=0;xx<w;xx++){
       var i=(y*w+xx)*4,R=d[i],G=d[i+1],B=d[i+2];
       var mx=Math.max(R,G,B),mn=Math.min(R,G,B);tot++;
       if((mx-mn)>60&&mx>80)hi++;            // 高饱和彩色（异常蓝袋/绿流体）
       if((R-G)>45&&(R-B)>45&&R>120)warm++;   // 暖橙红（火焰/热浪）
      }
      res({highSat:hi/tot,warm:warm/tot});
     }catch(e){res({highSat:0,warm:0});}
    };
    im.onerror=function(){res({highSat:0,warm:0});};
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
    var finish=function(baseImg){
      (async function(){
       try{
        ctx.drawImage(baseImg,0,0,W,H);
        var spec=j.spec||null,token=null,loupeImg=null;
        if(spec){
         token=self.deriveTypeColors(baseImg,spec.brand||'#fb7a22');spec.token=token;   // G6 字色/主色
         if(spec.loupeImg){try{loupeImg=await self._loadImg(spec.loupeImg);}catch(e){loupeImg=null;}}
         self.drawComponents(ctx,spec,{loupe:loupeImg},W,H);                            // G2 确定性组件
        }
        (j.text_layers||[]).forEach(function(L){
         if(token&&String(L.slot||'').indexOf('ic')!==0){                               // ic 标注已由图标卡绘制
          var big=(L.baseline==='h1'||L.baseline==='h2'),white=/^#?(fff|ffffff|white)/i.test(String(L.color||''));
          if(big){L.color=white?(token.topDark?token.ink:'#ffffff'):((token.topDark&&token.brandStrong)?token.accent:token.ink);}
          else if(L.baseline==='sub'){L.color=token.inkSoft;}
          else{L.color=token.ink;}
         }
         self._drawLayer(ctx,L,W,H);
        });
        res(cv.toDataURL('image/jpeg',0.92));
       }catch(e){try{res(cv.toDataURL('image/jpeg',0.92));}catch(e2){res(j.base_image);}}
      })();
    };
    var im=new Image();
    im.onload=function(){finish(im);};
    im.onerror=function(){res(j.base_image);};
    im.src=j.base_image;
   });
  },
  _drawLayer:function(ctx,L,W,H){
   var text=String(L.text||'').trim();if(!text)return;
   var bx=(L.x||0)*W,by=(L.y||0)*H,bw=(L.w||1)*W,bh=(L.h||1)*H;
   var FS={h1:0.34,h2:0.26,sub:0.28,label:0.17,body:0.14}[L.baseline]||0.15;
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
   var planWasRunning=false;
   if(this._planRunning){ // 方案仍在请求中：不再硬拒绝零产出——作废旧规划（结果不落地），立即转降级出图，绝不卡住客户
    this._planSeq++; this._planRunning=false; planWasRunning=true;
   }
   var needReplan=!this.planResp||this.planRespLang!==this.resolvedLang();
   this._running=true;this._abort=false;this._paused=false;this.ats=[];this._notes=[];this._lastErr=null;this._failed={};this._cleanImage=null;
   this._durations=[];this._activeTasks={};this._taskStart={};this._reqAborts={};this._posePromise=null;
   this._inferredVenues=null;this._inferVenuePromise=null;this._inferVenueKey='';
   this._totalTasks=types.length;this._doneTasks=0;this._progMsg='';
   this.setCanvas('progress');
   var self=this;
   (async function(){
    var cat=(GS().identity&&GS().identity.cat)||'',pn=(GS().product&&GS().product.name)||'这款商品';
    // 方案缺失/语种不符：后台异步补规划（runPlan 内含重试，不阻塞出图），同时立即用轻量降级方案出图——不卡顿、不零产出
    if(needReplan){
     if(!planWasRunning){try{self.runPlan();}catch(e){}} // 旧规划刚被作废则不重复起（避免竞态），直接降级出图
     self.planResp={ok:true,degraded:true,language:self.resolvedLang(),product:{name:pn,domain:cat,core_points:[],scenes:[],materials:[],specs:[]},plan:[],recommended_types:[]};
     self.planRespLang=self.resolvedLang();self.planByType={};
     self.addNote('图文规划在后台补跑中，先按默认规格出图；需要更精准可点该图单张重做。');
    }
    var needTrackA=(types.indexOf('white_main')>=0||types.indexOf('search_main')>=0);
    var fidOut=null;
    // 轨道A：只取干净白底主体（不再产裸局部/假影棚）——仍先行
    if(needTrackA){
     self.setProgMsg(t('trackA'));
     try{fidOut=await Promise.race([GF().package({call:retryCall,image:GS().images[0].dataUrl,category:cat,product:pn,doDetails:false,doScene:false}),new Promise(function(_,rej){setTimeout(function(){rej(new Error('package_timeout'));},60000);})]);}catch(e){fidOut=null;} // 强制60s超时：保真服务挂起也不阻塞，回落原图兜底
    }
    if(self._abort){self._finish();return;}
    self._cleanImage=(fidOut&&fidOut.ok&&fidOut.white)?fidOut.white:GS().images[0].dataUrl;
    self._fg=(fidOut&&fidOut.ok&&fidOut.fg)?fidOut.fg:null;
    await self.makeMarketingRef();
    try{await self.inferVenues(4);}catch(e){} // 场景类图种开跑前，先让视觉模型按真实商品动态推导用途差异化场地（失败静默回落写死库，绝不阻塞出图）
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
 var _sh=S.$('#stageHome');if(_sh)_sh.addEventListener('click',function(){S.close();});
 S.$('#atsClear').addEventListener('click',function(){if(GS().images&&GS().images.length){if(confirm('清空全部已传原图？')){GS().images=[];S.planResp=null;S.planByType={};S.ostEdits={};S.ats=[];S._notes=[];S._lineId=null;S._restoredLineId=null;try{var B0=window.AtuBridge||{};if(B0.bindLine)B0.bindLine(null);}catch(e){}S.renderOrigin();S._clearSession();S.setCanvas('empty');}}});
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
 // 刷新/重登后：有已存会话则自动恢复最近一件商品现场（显式 resume，不走“门户主动进入=全新”分流）
 window.addEventListener('load',function(){
  try{if(S.hasSavedSession()){S.open({resume:true});}}catch(e){}
 });
})();
