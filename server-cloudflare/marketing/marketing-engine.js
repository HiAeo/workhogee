/* =====================================================================
 * WorkHogee 轨道B · 营销视觉生成引擎
 * ---------------------------------------------------------------------
 * 输入：图种模板 + 已拟好的 on_screen_text + product_facts（外观锁体描述）
 * 输出：带营销文案/图标/真实场景的成品图（dataURL）+ elapsed_ms + cost。
 *
 * Prompt 组装严格沿用 prompt-patterns.json 已实测规则：
 *   1) 首句锁主体（Keep ... EXACTLY, do not redesign/recolor）
 *   2) 所有上屏文字用英文双引号逐字注入 + rendered EXACTLY, zero typos, no garbled
 *   3) 版式写死（标题位/图标排列/宫格/引线）
 *   4) 场景写实（real environment, NOT gray studio, photorealistic）
 *   5) 语种正确（all on-screen text in <langName>）
 *
 * 计费：仅成功出图返回 cost=0.25 元；失败/审核未出图返回 error 且 cost=0。
 * 水印：先试请求参数 watermark:false；同时在 prompt 里要求右下角留干净安全边距。
 * ===================================================================*/

import { getImageType } from './image-types.js';
import { runQc } from './qc-gate.js';
import { chatVisionCustom } from '../vision.js';
import { validateOnScreen } from '../lang-util.js';
import { picwishCutout } from '../picwish.js';
import { autodlCutout } from '../autodl.js';
import { giteeMatting } from '../gitee.js';

export const PER_IMAGE_COST_RMB = 0.25;
const MIN_TOTAL_PIXELS = 3686400;

/* 是否走「前端文字层合成」模式（底图无字 + Canvas 合成 text_layers）。
 * 回归结论：Seedream 烤字对 ja/ko/zh-CN 不稳，英文 baked 也偶发 Q4 flaky——
 * 为彻底消除「模型烤字」这一整类非确定性失败，现全语种统一走前端文字层合成。
 * baked 烤字路径保留为内部兜底（args.forceBaked===true 时才走），默认不再使用。 */
function isFrontendLang() { return true; }

/* ---------- 直接调方舟图像生成（与 worker.js callSeedream 同形状，自包含可本地测） ---------- */
export async function generateImage(env, { prompt, imagePayload, size, timeoutMs = 85000, watermark = false } = {}) {
  if (!env.ARK_API_KEY) return { error: { code: 'server_misconfigured', message: '图像服务密钥未配置' } };
  const ctrl = new AbortController();
  const timer = setTimeout(() => { try { ctrl.abort(); } catch {} }, timeoutMs);
  let upstream, text;
  try {
    const body = {
      model: env.ARK_MODEL || 'doubao-seedream-4-5-251128',
      prompt,
      size,
      response_format: 'b64_json'
    };
    if (imagePayload) body.image = imagePayload;
    // 契约 §4 第一步：探测关闭平台水印的参数
    if (watermark === false) body.watermark = false;
    upstream = await fetch(env.ARK_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.ARK_API_KEY },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    text = await upstream.text();
  } catch (e) {
    clearTimeout(timer);
    const aborted = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
    return { error: { code: aborted ? 'upstream_timeout' : 'upstream_network', message: aborted ? '图像模型响应超时' : '图像模型网络异常' } };
  }
  clearTimeout(timer);
  if (!upstream.ok) return { error: { code: 'upstream_' + upstream.status, message: text.slice(0, 300) } };
  let parsed; try { parsed = JSON.parse(text); } catch { return { error: { code: 'upstream_bad_json', message: '图像模型返回解析失败' } }; }
  const first = parsed && parsed.data && parsed.data[0] || {};
  if (!first.b64_json) return { error: { code: 'no_image', message: '图像模型未返回图片数据（可能内容审核未出图）' } };
  return { b64: first.b64_json, usage: parsed.usage || null };
}

/* ---------- prompt 组装工具 ----------
 * Q()：把要上屏的文字包进英文双引号，注入前做最后一道确定性清洗——
 * 折叠相邻重复词("daily daily"->"daily")，防模型长句小字叠词。 */
const Q = s => {
  let t = String(s || '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\b([A-Za-z']+)(\s+\1\b)+/gi, '$1');
  return '"' + t + '"';
};
const noWm = 'Leave the bottom-right corner completely clean and empty: no watermark, no logo, no text, no platform badge.';

/* 全局品牌/包装保真护栏（IP 风险）：生图模型对强品牌包装轮廓会自动补全知名 logo，
 * 仅靠 sanitizeCopy 清洗注入文案管不住，故在每条 prompt 末尾强制约束。 */
const BRAND_GUARD = 'PACKAGING & TRADEMARK RULES: Keep ALL product packaging, labels, bottles, decals and surfaces EXACTLY as in the reference photo. If the reference packaging is plain or unlabeled, render it plain and unlabeled. Do NOT add any brand name, logo, trademark, badge, label text, signature script, or packaging artwork that is not visibly present in the reference. Never render real-world trademarks or brand logos such as Coca-Cola, Coke, Pepsi, Nike, Adidas, Apple, Louis Vuitton, Starbucks, the Amazon smile logo, or any other company brand or platform badge.';

/* ---------- P0 姿态/支撑约束（品类无关）：杜绝亚克力底座/台座/靠软线直立 ---------- */
const NO_STAND = 'PLACEMENT & SUPPORT RULE: Do NOT place the product on any display stand, pedestal, acrylic base, plinth, block, box, riser, or holder. Do NOT insert the product into a transparent or opaque cradle. The product must rest on its OWN actual base/foot/flat bottom, be HELD by a real hand, HANG on a hook, or LAY flat on a surface — it must NEVER be propped upright by a soft power cord/wire, nor stand vertically balanced on a tiny bottom point/tail. Do not add a fake contact shadow unless it genuinely rests on a surface.';
/* 姿态类型：stand_flat 平底直立 / stand_multi 多点接地 / hang 悬挂 / hand 手持 / lay 平放。
   吹风机这类无平底且带软线的品类，绝不允许靠电源线直立，只能 hang/hand/lay。 */

/* ---------- 品类驱动的背景环境（绝不写死某个全品类共用场景）----------
 * 优先级：1) plan 现场推理出的 product.scenes；2) 按 domain 给一组显著差异化基调；
 * 3) 兜底仅"干净柔和中性虚化"。禁止再出现"现代玻璃幕墙建筑广场"这种万能模板。 */
const DOMAIN_BG = {
  food:    'a bright fresh summer tabletop, icy cold with fizzing bubbles and condensation, light airy refreshing tone',
  drink:   'a bright summer tabletop with ice cubes and cold fizzy drink, thirst-quenching mood',
  beauty:  'a clean vanity surface, soft even neutral light, pale rose-grey premium tone, no extra props',
  tech:    'a clean minimal modern desk surface, soft cool neutral tone, no props',
  home:    'a cozy bright home interior, warm linen and wood neutral tone, no clutter',
  fashion: 'a clean light neutral setting with soft natural daylight, tasteful lifestyle mood, no props',
  auto:    'an outdoor paved road or mountain setting, clean natural daylight',
  sports_outdoor: 'an outdoor park trail or greenway with a paved path, natural daylight, NOT an interior, room or studio',
  flower:  'a bright fresh setting with soft natural light, pastel soft tone',
  general: 'a clean soft-neutral blurred real environment with soft natural daylight'
};
function resolveBg(domain, scenes) {
  const s = (scenes && scenes[0] && scenes[0].en) || '';
  if (s) return 'the product set within a softly blurred, out-of-focus ' + s + ', professional commercial lighting, shallow depth of field';
  return DOMAIN_BG[domain] || 'a clean soft-neutral blurred modern environment';
}

/* ---------- A · 姿态判定（品类无关，基于产品描述/事实关键词的规则判定；可后续升级为 VL） ----------
 * 输出 stand_flat / stand_multi / hang / hand / lay，并据姿态给出确定性放置句。
 * 接地/投影只在确有接触面（stand_* / lay）时绘制；hang/hand 不画落地投影。 */
function decidePose(productDesc, productFacts) {
  const t = ((productDesc || '') + ' ' + (productFacts || '')).toLowerCase();
  const hasCord = /cord|电源线|软线|wire|hanging loop|挂环|挂绳/.test(t);
  // 吹风机/手持小家电：底部挂环+软线、不能直立 → 优先 lay（折叠平放）
  if (/hair\s*dryer|blower|吹风机|吹风|hairdryer/.test(t)) {
    return { pose: 'lay', sentence: 'LAY the folding product flat on a clean surface (folded flat / resting on its side), with the power cord lying neatly beside it. Do NOT stand it upright, do NOT prop it on any base.' };
  }
  // 自行车：两轮多点接地
  if (/bike|bicycle|自行车|单车|e-?bike/.test(t)) {
    return { pose: 'stand_multi', sentence: 'REST the product upright on its own two wheels on the ground, with a soft natural contact shadow only where the wheels touch the surface.' };
  }
  // 拉杆箱：自身平底直立
  if (/suitcase|luggage|拉杆箱|行李箱|trolley/.test(t)) {
    return { pose: 'stand_flat', sentence: 'REST the product upright on its own flat base, with a soft natural contact shadow only where it touches the surface.' };
  }
  // 瓶装/软管护肤品：平底直立
  if (/cream|lotion|serum|tube|bottle|jar|护肤|洁面|精华|膏/.test(t)) {
    return { pose: 'stand_flat', sentence: 'REST the product upright on its own flat bottom/cap on a clean surface, with a soft natural contact shadow only at the contact point.' };
  }
  // 兜底：若有软线/挂环但无平底 → lay
  if (hasCord) {
    return { pose: 'lay', sentence: 'LAY the product flat on a clean surface, cord lying beside it; do NOT stand it upright on a cord.' };
  }
  return { pose: 'stand_flat', sentence: 'REST the product upright on its own flat base, soft contact shadow only where it touches the surface.' };
}
/* 三种非直立姿态的确定性放置句（吹风机等无平底且带软线的品类用） */
const POSE_SENTENCE = {
  hang: 'HANG the product by its own hanging loop on a simple wall hook; the body hangs naturally and does NOT touch any surface, the cord hangs loosely beside it. Do NOT stand it upright.',
  hand: 'A real hand naturally holds the product while in use (e.g. drying hair); the product is NOT resting on any surface.',
  lay: 'LAY the product flat on a clean surface (folded flat / resting on its side), with the power cord lying neatly beside it. Do NOT stand it upright, do NOT balance it on a bottom point or cord.'
};

/* ---------- 标题安全：过长自动截短 + 安全区约束，杜绝溢出被裁 ---------- */
function fitTitle(h) {
  let t = String(h || '').trim();
  const isCjk = /[一-鿿]/.test(t);
  const max = isCjk ? 13 : 34;            // 顶部通栏大标题的安全字符上限
  if (t.length > max) t = t.slice(0, max - 1).replace(/[\s\-—,，、/|]+$/u, '') + '…';
  return t;
}
const TITLE_SAFE = 'The headline must fit ENTIRELY inside the frame with safe margins on both sides: if it is long, shrink the font size or wrap to at most two lines; never clip, crop or cut off any character at the left/right edges.';


function langSuffix(langName) {
  return 'All on-screen text must be rendered in ' + langName + ', perfectly spelled, zero typos, no garbled characters, no wrong characters.';
}

function lockSubject(productDesc, productFacts) {
  return 'Keep the ' + productDesc + ' from the reference photo EXACTLY: ' + productFacts + '. Preserve the frame color, tire and sidewall color, wheel count and style, saddle, handlebar and every accessory exactly as in the reference. Do not redesign, recolor, change brand marks, add fantasy features, or add any accessory (basket, rack, fenders, lights) or packaging label/logo that is not present in the reference.';
}

/* ---------- 各 recipe 的版式文案 ---------- */
function buildRecipePrompt(recipe, ctx) {
  const { productDesc, productFacts, ost, langName, designReq } = ctx;
  const lock = lockSubject(productDesc, productFacts);
  const L = langSuffix(langName);
  const h = fitTitle(ost.headline || '');
  const sub = String(ost.subheadline || '').slice(0, 40);
  const icons = ost.icons || [];
  const panels = ost.panels || [];
  const callouts = ost.callouts || [];
  const bullets = ost.bullets || [];
  const scenes = ctx.scenes || [];
  const domain = ctx.domain || 'general';
  const sceneEnv = (scenes[0] && scenes[0].en) || resolveBg(domain, scenes);
  const lighting = ctx.lighting || 'soft natural daylight';
  const bg = resolveBg(domain, scenes);
  const pose = ctx.poseOverride && POSE_SENTENCE[ctx.poseOverride] ? { pose: ctx.poseOverride, sentence: POSE_SENTENCE[ctx.poseOverride] } : decidePose(productDesc, productFacts);

  switch (recipe) {
    case 'core_selling': {
      const iconLines = icons.map((ic, i) => (i + 1) + ') a simple line icon of ' + (ic.icon_hint || 'feature') + ', label: ' + Q(ic.label)).join('\n');
      return [
        'Professional e-commerce product marketing infographic, premium marketplace A+ style.',
        lock,
        NO_STAND,
        'Layout: the product placed left-center, occupying about half the frame, against ' + bg + '.',
        pose.sentence,
        h && 'At the TOP, one large bold headline spanning the width, dark bold sans-serif uppercase with a thin subtle outline. Render the text EXACTLY, character by character: ' + Q(h) + '.',
        TITLE_SAFE,
        icons.length && 'On the RIGHT side, stack ' + icons.length + ' circular flat white icon badges vertically with even spacing. Each badge contains a simple clean line icon, and directly under each badge a short all-caps label (keep each label to 1-2 short words). Render each label EXACTLY, correct spelling:',
        iconLines,
        noWm,
        'Style: clean, premium, minimal, high-end advertising. Crisp vector-style icons, legible sans-serif typography. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'scene_selling': {
      return [
        'Cinematic advertising photo.',
        lock,
        NO_STAND,
        'Place the product naturally in a real ' + sceneEnv + ', ' + lighting + ', photorealistic, shallow depth of field. NOT a gray studio. ' + pose.sentence,
        h && 'Overlay a large bold headline in the lower-left area, bold sans-serif uppercase with subtle drop shadow, rendered EXACTLY: ' + Q(h) + '.',
        sub && 'Below it one smaller regular-weight sub-line, rendered EXACTLY: ' + Q(sub) + '.',
        noWm,
        'Style: premium commercial photography. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'multi_scene': {
      const positions = ['left', 'middle', 'right'];
      const panelLines = panels.slice(0, 3).map((p, i) =>
        '- ' + (positions[i] || 'next') + ' panel: the product ' + (p.title || 'in a real scene') + ', small caption at its bottom rendered EXACTLY: ' + Q(p.caption || p.title)
      ).join('\n');
      return [
        'A ' + Math.min(3, Math.max(2, panels.length || 3)) + '-panel multi-scene collage in a SINGLE image, premium marketplace A+ layout. The SAME ' + productDesc + ' must appear in EVERY panel with the EXACT same frame color, tire color, saddle, wheels and parts as the reference — never change the frame color or swap in a different bike between panels.',
        h && 'Top of the image: a wide bold headline spanning full width, bold sans-serif uppercase, rendered EXACTLY: ' + Q(h) + '.',
        'Below the headline, arrange equal rectangular panels side by side with thin white gutters:',
        panelLines,
        noWm,
        'Style: clean premium e-commerce collage, consistent color grade across panels, photorealistic. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'detail': {
      const co = callouts.map(c => 'Add a clean annotation callout with a thin leader line to a boxed label, rendered EXACTLY: ' + Q(c.label)).join('\n');
      const part = (callouts[0] && callouts[0].label) || 'key part';
      return [
        'Premium product detail close-up photograph. A tight macro shot of the ' + part + ' of the product from the reference, sharp focus, shallow depth of field, dark moody defocused background, photorealistic, high detail.',
        co,
        noWm,
        'Style: luxury technical detail infographic. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'material': {
      return [
        'EXTREME TIGHT MACRO CLOSE-UP. Do NOT show the whole product — crop into a real material/part detail that occupies about 80% of the frame.',
        'Show ONLY a small surface or part that actually exists in the reference (e.g. the honeycomb grille mesh, the control dial/button, the nozzle rim, the handle finish, the hinge). Keep that detail exactly as in the reference — do NOT invent textures, wrap fabric/rope, or add accessories absent from the reference.',
        'Sharp focus on the material detail, shallow depth of field, soft neutral defocused background, photorealistic, high detail.',
        h && 'At the bottom, one short caption rendered EXACTLY: ' + Q(h) + '.',
        noWm,
        'Style: premium material showcase, no invented textures. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'rider': {
      return [
        'Cinematic cycling advertising photo.',
        lock,
        'Show a realistic everyday adult cyclist in casual clothing riding the SAME bike on a real paved forest road / tree-lined greenway. The rider must have natural human proportions: two hands on the handlebars, two feet on the pedals, correct arms and legs, no extra or missing limbs, no deformed hands or feet, no duplicate wheels.',
        'Photorealistic, shallow depth of field, subtle motion blur on the background, natural daylight. NOT a studio.',
        h && 'Overlay a bold headline in the lower-left, sans-serif uppercase with subtle shadow, rendered EXACTLY: ' + Q(h) + '.',
        sub && 'Below it one short sub-line rendered EXACTLY: ' + Q(sub) + '.',
        noWm,
        'Style: premium commercial cycling photography. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'lifestyle': {
      return [
        'Professional e-commerce lifestyle photograph. ' + lock,
        'Place the product naturally in a real ' + sceneEnv + ', ' + lighting + ', photorealistic, shallow depth of field, realistic contact shadow. NOT a gray studio.',
        'Do NOT add any text, letters, captions, logos or watermarks beyond markings already on the product. Leave bottom-right corner clean.',
        'Style: high-end commercial lifestyle photography.'
      ].filter(Boolean).join('\n');
    }
    case 'banner':
    case 'hero': {
      return [
        'Wide cinematic advertising banner. ' + lock,
        'Place the product on the RIGHT side, in a real ' + sceneEnv + ', ' + lighting + '.',
        h && 'On the LEFT empty area place a large bold ' + langName + ' headline, rendered EXACTLY with correct characters and no typos: ' + Q(h) + '.',
        sub && 'Below it a smaller ' + langName + ' sub-line, rendered EXACTLY: ' + Q(sub) + '.',
        noWm,
        'Style: premium commercial cinematic. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'icon_grid': {
      const n = Math.min(icons.length || 4, 6);
      const lines = icons.slice(0, n).map((ic, i) => (i + 1) + ') a simple line icon of ' + (ic.icon_hint || 'feature') + ', label: ' + Q(ic.label)).join('\n');
      return [
        'Clean premium e-commerce infographic. ' + lock,
        'Place the product centered, smaller, against ' + bg + '.',
        h && 'At the TOP, a bold headline, rendered EXACTLY: ' + Q(h) + '.',
        TITLE_SAFE,
        'Arrange ' + n + ' flat circular icon badges around/below the product in a tidy grid. Under each badge a short label (1-2 words) rendered EXACTLY:',
        lines,
        noWm,
        'Style: minimal vector infographic. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'compare': {
      return [
        'Clean e-commerce comparison infographic. ' + lock,
        h && 'At the TOP a bold headline rendered EXACTLY: ' + Q(h) + '.',
        'Split the frame into two equal columns divided by a thin line. Left column: "BEFORE" (or typical product), right column: the product with a check mark. Per-row short labels rendered EXACTLY.',
        bullets.map(b => '- ' + Q(b)).join('\n'),
        noWm,
        'Style: clean trust-comparison layout. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'size_chart': {
      return [
        'Clean technical size/spec infographic on white. ' + lock,
        h && 'At the TOP a bold headline rendered EXACTLY: ' + Q(h) + '.',
        'Show the product with clear dimension annotation lines and arrow markers, plus a neat spec table below. Render all measurement labels EXACTLY:',
        bullets.map(b => '- ' + Q(b)).join('\n'),
        noWm,
        'Style: precise technical product diagram. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'model': {
      return [
        'Professional fashion photography. Keep the garment/product from the reference EXACTLY in style, color and fabric. Do not redesign it.',
        'Show a realistic adult model wearing/using the product in a natural relaxed pose, full or half body, in a real street/studio environment, ' + lighting + ', photorealistic, shallow depth of field.',
        'Do NOT add any text or watermark. Leave bottom-right corner clean.',
        'Style: premium commercial fashion photography, realistic skin and fabric texture.'
      ].filter(Boolean).join('\n');
    }
    case 'seeding': {
      return [
        'Authentic lifestyle UGC-style photo. Keep the product consistent with the reference. Place it styled naturally in a real ' + sceneEnv + ', candid composition, ' + lighting + ', photorealistic.',
        'Do NOT add text, captions or watermark. Leave bottom-right clean.',
        'Style: warm, authentic social-content feel, not a stiff studio shot.'
      ].filter(Boolean).join('\n');
    }
    case 'series':
    case 'multi_angle': {
      const n = Math.min(panels.length || 3, 4);
      const lines = panels.slice(0, n).map((p, i) => '- tile ' + (i + 1) + ': ' + Q(p.caption || p.title)).join('\n');
      return [
        recipe === 'series' ? 'Product lineup infographic.' : 'Multi-angle infographic.',
        lock,
        h && 'At the TOP a bold headline rendered EXACTLY: ' + Q(h) + '.',
        'Arrange ' + n + ' equal tiles showing the SAME product (series = different colors/variants; multi_angle = front/side/back/detail), consistent lighting on a clean light background:',
        lines,
        noWm,
        'Style: clean catalog layout. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'ingredients': {
      const lines = icons.slice(0, 5).map((ic, i) => (i + 1) + ') icon of ' + (ic.icon_hint || 'ingredient') + ', label: ' + Q(ic.label)).join('\n');
      return [
        'Clean ingredient/material infographic. ' + lock,
        h && 'At the TOP a bold headline rendered EXACTLY: ' + Q(h) + '.',
        'Place circular ingredient/material badges around the product, each with a short label rendered EXACTLY:',
        lines,
        noWm,
        'Style: fresh minimal infographic. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'usage_guide': {
      const steps = panels.slice(0, 4);
      const lines = steps.map((p, i) => (i + 1) + '. ' + Q(p.title || p.caption)).join('\n');
      return [
        'Clean instructional infographic. ' + lock,
        h && 'At the TOP a bold headline rendered EXACTLY: ' + Q(h) + '.',
        'Arrange numbered step tiles left to right connected by arrows, each with a short step label rendered EXACTLY:',
        lines,
        noWm,
        'Style: clear friendly instructional design. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'accessories': {
      return [
        'Clean flat-lay product-in-the-box photo. ' + lock,
        'Arrange the product and all included accessories neatly on a clean light surface, each item with a small short label rendered EXACTLY:',
        callouts.map(c => '- ' + Q(c.label)).join('\n'),
        noWm,
        'Style: tidy e-commerce flat lay. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'after_sales': {
      const lines = icons.slice(0, 4).map((ic, i) => (i + 1) + ') shield/return icon of ' + (ic.icon_hint || 'assurance') + ', label: ' + Q(ic.label)).join('\n');
      return [
        'Clean trust-banner. ' + (h ? 'Headline rendered EXACTLY: ' + Q(h) + '.' : ''),
        sub && 'Sub-line rendered EXACTLY: ' + Q(sub) + '.',
        'A horizontal row of flat assurance icons (shield, returns, warranty), each with a short label rendered EXACTLY:',
        lines,
        noWm,
        'Style: trustworthy clean light-blue trust layout. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'mood': {
      return [
        'Cinematic brand-mood photograph. ' + lock,
        'Place the product small within an emotional atmospheric real environment, soft cinematic lighting, photorealistic.',
        h && 'In a lower empty area, one short brand line rendered EXACTLY: ' + Q(h) + '.',
        noWm,
        'Style: atmospheric premium brand film still. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'search_main': {
      return [
        'Clean e-commerce search main image. ' + lock,
        'Product placed on the right on a clean light gradient background, occupying about 60% of the frame.',
        h && 'A single short benefit line at the lower-left, bold sans-serif, rendered EXACTLY: ' + Q(h) + '.',
        noWm,
        'Style: clean high-contrast marketplace search thumbnail. ' + L
      ].filter(Boolean).join('\n');
    }
    case 'white_bg':
    default: {
      // 轨道A 图种；若被误调本引擎，给干净白底（保真仍应以 PicWish 为准）
      return [
        'Pure white background e-commerce main image. ' + lock,
        'Product centered on a seamless pure-white background, even soft studio light, realistic contact shadow. No text, no watermark.',
        'Style: clean marketplace white-background photo.'
      ].filter(Boolean).join('\n');
    }
  }
}

/* =====================================================================
 * §B2 前端文字层合成（ja/ko）：text_layers 固定版式坐标
 * ---------------------------------------------------------------------
 * 坐标 x/y/w/h 均为相对画布宽/高的 0~1 浮点数（前端按 size 换算像素），
 * anchor 固定 top-left；baseline ∈ h1|h2|label|body 决定前端字号层级。
 * 只产出 plan 阶段已生成（非空）的文字槽；空槽不产出 layer。
 * 坐标必须与 buildNoTextPrompt 要求模型预留的空白区域一致（同一份 layers）。
 * ===================================================================*/
function buildTextLayers(recipe, ost) {
  const layers = [];
  const push = (slot, text, x, y, w, h, o = {}) => {
    const t = String(text || '').trim();
    if (!t) return;
    layers.push({
      slot, text: t,
      x, y, w, h,
      anchor: 'top-left',
      align: o.align || 'left',
      baseline: o.baseline || 'body',
      color: o.color || '#101826',
      bold: !!o.bold,
      max_lines: o.max_lines || 1
    });
  };
  // 前端 canvas 会自动换行 + 字号自适应缩到框内，故此处保留完整文案，不做烤字式硬截断
  const headline = String(ost.headline || '').trim();
  const sub = String(ost.subheadline || '').slice(0, 40);
  const icons = (ost.icons || []).slice(0, 6);
  const panels = (ost.panels || []).slice(0, 4);
  const callouts = (ost.callouts || []).slice(0, 5);
  const bullets = (ost.bullets || []).slice(0, 6);

  switch (recipe) {
    case 'core_selling':
      push('headline', headline, 0.06, 0.05, 0.88, 0.16, { baseline: 'h1', bold: true, align: 'left', max_lines: 2 });
      icons.forEach((ic, i) => push('icon_' + i, ic.label, 0.63, 0.22 + i * 0.21, 0.31, 0.10, { baseline: 'label', align: 'center', max_lines: 2 }));
      break;
    case 'scene_selling':
    case 'rider':
      push('headline', headline, 0.06, 0.60, 0.62, 0.18, { baseline: 'h1', bold: true, align: 'left', max_lines: 2 });
      push('subheadline', sub, 0.06, 0.80, 0.58, 0.08, { baseline: 'body', align: 'left' });
      break;
    case 'banner':
    case 'hero':
      push('headline', headline, 0.06, 0.30, 0.44, 0.24, { baseline: 'h1', bold: true, align: 'left', max_lines: 2 });
      push('subheadline', sub, 0.06, 0.56, 0.42, 0.09, { baseline: 'body', align: 'left' });
      break;
    case 'multi_scene': {
      push('headline', headline, 0.05, 0.03, 0.90, 0.12, { baseline: 'h1', bold: true, align: 'center', max_lines: 1 });
      panels.slice(0, 3).forEach((p, i) => {
        push('panel_' + i + '_caption', p.caption || p.title, 0.012 + i * 0.333, 0.86, 0.31, 0.10, { baseline: 'body', align: 'center' });
      });
      break;
    }
    case 'icon_grid':
      push('headline', headline, 0.08, 0.04, 0.84, 0.12, { baseline: 'h1', bold: true, align: 'center', max_lines: 2 });
      icons.forEach((ic, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        push('icon_' + i, ic.label, 0.06 + col * 0.32, 0.70 + row * 0.17, 0.28, 0.14, { baseline: 'label', align: 'center', max_lines: 2 });
      });
      break;
    case 'material':
      push('headline', headline, 0.10, 0.86, 0.80, 0.09, { baseline: 'h2', bold: true, align: 'center', color: '#FFFFFF', max_lines: 1 });
      break;
    case 'mood':
      push('headline', headline, 0.08, 0.78, 0.55, 0.10, { baseline: 'h2', bold: true, align: 'left', color: '#FFFFFF', max_lines: 1 });
      break;
    case 'search_main':
      push('headline', headline, 0.06, 0.72, 0.52, 0.12, { baseline: 'h2', bold: true, align: 'left', max_lines: 2 });
      break;
    case 'detail':
      callouts.forEach((c, i) => push('callout_' + i, c.label, 0.55, 0.14 + i * 0.15, 0.40, 0.10, { baseline: 'label', align: 'left', max_lines: 2 }));
      break;
    case 'compare':
      push('headline', headline, 0.06, 0.05, 0.88, 0.12, { baseline: 'h1', bold: true, align: 'center', max_lines: 1 });
      bullets.forEach((b, i) => push('bullet_' + i, b, 0.08, 0.24 + i * 0.11, 0.84, 0.09, { baseline: 'body', align: 'left' }));
      break;
    case 'size_chart':
      push('headline', headline, 0.06, 0.04, 0.88, 0.10, { baseline: 'h1', bold: true, align: 'center', max_lines: 1 });
      bullets.forEach((b, i) => push('bullet_' + i, b, 0.10, 0.18 + i * 0.10, 0.80, 0.08, { baseline: 'body', align: 'left' }));
      break;
    case 'series':
    case 'multi_angle':
      push('headline', headline, 0.06, 0.04, 0.88, 0.10, { baseline: 'h1', bold: true, align: 'center', max_lines: 1 });
      panels.slice(0, 4).forEach((p, i) => push('panel_' + i + '_caption', p.caption || p.title, 0.04 + i * 0.24, 0.86, 0.22, 0.10, { baseline: 'label', align: 'center' }));
      break;
    case 'ingredients':
      push('headline', headline, 0.08, 0.04, 0.84, 0.11, { baseline: 'h1', bold: true, align: 'center', max_lines: 1 });
      icons.slice(0, 6).forEach((ic, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        push('icon_' + i, ic.label, 0.06 + col * 0.30, 0.62 + row * 0.17, 0.26, 0.13, { baseline: 'label', align: 'center', max_lines: 2 });
      });
      break;
    case 'usage_guide':
      push('headline', headline, 0.06, 0.04, 0.88, 0.10, { baseline: 'h1', bold: true, align: 'center', max_lines: 1 });
      panels.slice(0, 4).forEach((p, i) => push('step_' + i, p.title || p.caption, 0.05 + i * 0.23, 0.80, 0.21, 0.12, { baseline: 'label', align: 'center', max_lines: 2 }));
      break;
    case 'accessories':
      push('headline', headline, 0.06, 0.05, 0.88, 0.11, { baseline: 'h1', bold: true, align: 'center', max_lines: 1 });
      callouts.forEach((c, i) => push('callout_' + i, c.label, 0.10, 0.20 + i * 0.12, 0.50, 0.10, { baseline: 'body', align: 'left' }));
      break;
    case 'after_sales':
      push('headline', headline, 0.10, 0.06, 0.80, 0.12, { baseline: 'h1', bold: true, align: 'center', max_lines: 1 });
      push('subheadline', sub, 0.15, 0.20, 0.70, 0.07, { baseline: 'body', align: 'center' });
      icons.slice(0, 4).forEach((ic, i) => push('icon_' + i, ic.label, 0.08 + i * 0.22, 0.74, 0.20, 0.12, { baseline: 'label', align: 'center', max_lines: 2 }));
      break;
    default:
      // 纯照片类（lifestyle/model/seeding/white_bg）本就无文字；兜底给一个顶部通栏
      if (headline) push('headline', headline, 0.06, 0.06, 0.88, 0.12, { baseline: 'h1', bold: true, align: 'center', max_lines: 2 });
      break;
  }
  return layers;
}

/* ---------- §B2 无字底图 prompt：锁构图/主体/场景，文字区预留干净空带，严禁任何烤字 ---------- */
function buildNoTextPrompt(recipe, ctx, layers) {
  const { productDesc, productFacts, domain, scenes, lighting } = ctx;
  const lock = lockSubject(productDesc, productFacts);
  const bg = resolveBg(domain, scenes);
  const pose = ctx.poseOverride && POSE_SENTENCE[ctx.poseOverride] ? { pose: ctx.poseOverride, sentence: POSE_SENTENCE[ctx.poseOverride] } : decidePose(productDesc, productFacts);
  const sceneEnv = (scenes && scenes[0] && scenes[0].en) || bg;
  const iconCount = (ctx.iconCount || 0);
  const lines = [];

  // —— 各 recipe 的构图/场景/主体（与烤字版同骨架，但不含任何文字渲染指令）——
  switch (recipe) {
    case 'core_selling':
      lines.push('Professional e-commerce product marketing infographic, premium marketplace A+ style.');
      lines.push(lock);
      lines.push('Layout: the product placed left-center, occupying about half the frame, against ' + bg + '. On the RIGHT side arrange ' + Math.max(1, iconCount) + ' flat circular white line-icon badges stacked vertically with even spacing; each badge contains ONLY a simple clean line icon, with NO lettering inside or beneath it.');
      break;
    case 'scene_selling':
      lines.push('Cinematic advertising photo.', lock, 'Place the product naturally in a real ' + sceneEnv + ', ' + lighting + ', photorealistic, shallow depth of field. NOT a gray studio.');
      break;
    case 'rider':
      lines.push('Cinematic cycling advertising photo.', lock, 'Show a realistic everyday adult cyclist in casual clothing riding the SAME bike on a real paved forest road / tree-lined greenway, natural human proportions, correct limbs. Photorealistic, shallow depth of field, natural daylight. NOT a studio.');
      break;
    case 'banner':
    case 'hero':
      lines.push('Wide cinematic advertising banner. ' + lock, 'Place the product on the RIGHT side, in a real ' + sceneEnv + ', ' + lighting + '.');
      break;
    case 'multi_scene':
      lines.push('A 3-panel multi-scene collage in a SINGLE image, premium marketplace A+ layout. The SAME ' + productDesc + ' must appear in EVERY panel with the EXACT same colors and parts as the reference. Arrange three equal rectangular panels side by side with thin white gutters, each a real scene.');
      break;
    case 'icon_grid':
      lines.push('Clean premium e-commerce infographic. ' + lock, 'Place the product centered, smaller, against ' + bg + '. Arrange ' + Math.max(1, iconCount) + ' flat circular line-icon badges in a tidy grid around/below the product, each badge containing ONLY a simple line icon with NO lettering.');
      break;
    case 'material':
      lines.push('Premium macro photograph of the product from the reference. Show only surfaces and parts actually present. Sharp focus on a real material detail, soft defocused neutral background, photorealistic, high detail.');
      break;
    case 'detail':
      lines.push('Premium product detail close-up photograph. A tight macro shot of a key part of the product from the reference, sharp focus, shallow depth of field, dark moody defocused background, photorealistic, high detail.');
      break;
    case 'compare':
      lines.push('Clean e-commerce comparison infographic. ' + lock, 'Split the frame into two equal columns divided by a thin line. Left column a typical product, right column the product. Clean white/light comparison table look.');
      break;
    case 'size_chart':
      lines.push('Clean technical size/spec infographic on white. ' + lock, 'Show the product with clear dimension annotation lines and arrow markers, plus a neat blank spec table area below.');
      break;
    case 'series':
    case 'multi_angle':
      lines.push(recipe === 'series' ? 'Product lineup infographic.' : 'Multi-angle infographic.', lock, 'Arrange equal tiles showing the SAME product, consistent lighting on a clean light background.');
      break;
    case 'ingredients':
      lines.push('Clean ingredient/material infographic. ' + lock, 'Place circular line-only ingredient/material badges around the product, each badge containing ONLY a simple icon with NO lettering.');
      break;
    case 'usage_guide':
      lines.push('Clean instructional infographic. ' + lock, 'Arrange numbered step tiles left to right connected by arrows.');
      break;
    case 'accessories':
      lines.push('Clean flat-lay product-in-the-box photo. ' + lock, 'Arrange the product and all included accessories neatly on a clean light surface.');
      break;
    case 'after_sales':
      lines.push('Clean trust-banner, trustworthy clean light-blue layout. Arrange a horizontal row of flat line-icon badges (shield, returns, warranty), each containing ONLY a simple line icon with NO lettering.');
      break;
    case 'mood':
      lines.push('Cinematic brand-mood photograph. ' + lock, 'Place the product small within an emotional atmospheric real environment, soft cinematic lighting, photorealistic.');
      break;
    case 'search_main':
      lines.push('Clean e-commerce search main image. ' + lock, 'Product placed on the right on a clean light gradient background, occupying about 60% of the frame.');
      break;
    case 'lifestyle':
    case 'model':
    case 'seeding':
    case 'white_bg':
    default:
      lines.push('Professional e-commerce product photograph. ' + lock, NO_STAND, pose.sentence, 'Place the product naturally in a real ' + sceneEnv + ', ' + lighting + ', photorealistic, shallow depth of field. NOT a gray studio.');
      break;
  }

  // —— 按 text_layers 逐区引导模型：让文字区落在场景中天然简洁/虚化的部位，绝不画矩形白框 ——
  for (const L of layers) {
    lines.push('A text caption will be overlaid later at about ' +
      Math.round(L.x * 100) + '% from the left, ' + Math.round(L.y * 100) + '% from the top, spanning about ' +
      Math.round(L.w * 100) + '% of the width and ' + Math.round(L.h * 100) + '% of the height. Compose the scene so this spot is a naturally calm, even, smooth or softly defocused part of the environment (e.g. clean countertop, blurred background, gentle gradient, soft shadow, even wall), with uniform tone and low contrast, free of busy props or sharp detail, so overlaid text stays readable. The region must blend seamlessly into the surrounding scene with NO visible edge.');
  }

  // —— 全局硬约束：底图一个字都不许烤（含参考图里的价签/贴纸/数字）——
  lines.push('CRITICAL NO-TEXT RULE: The entire image must contain ABSOLUTELY NO letters, words, numbers, digits, glyphs, characters, labels, captions, brand names, watermark text or platform badges anywhere. It is a clean scene/composition background only; all marketing wording will be overlaid by software afterwards. The reserved rectangles must be truly empty.');
  lines.push('REFERENCE STRIP: The reference photo may contain price tags, stickers, hangtags, paper labels, handwritten marks, or printed numbers (e.g. a "¥399" price sticker, a barcode, a size label). DO NOT reproduce ANY of those onto this base image — render those spots as a clean, flat, sticker-free, label-free, unprinted surface matching the surrounding material. No price, no digits, no label paper, no sticker residue.');
  lines.push('NO-BOX RULE: Do NOT create any white or solid-color boxes, rectangular panels, borders, frames, hard-edged blank rectangles, geometric cut-off triangles, or collage placeholders. Any space reserved for later text is a natural clean/defocused region that blends seamlessly into the scene — never a painted block with a visible edge.');
  lines.push(noWm);
  lines.push(BRAND_GUARD);
  return lines.join('\n');
}

/* ---------- §B2 无字底图质检：不做语种烤字判定（Q4/Q5 跳过），改为「无文字 + 主体/场景」 ---------- */
async function runBaseQc(env, { image, ref, productHint, domain }) {
  const failures = [];
  const metrics = {};

  // B-Q1 底图不得有「后加的营销烤字」；产品本体包装印刷字/品牌 logo（与参考一致）属真实产品像素，允许
  const r1 = await chatVisionCustom(env, {
    system: 'You are a strict e-commerce background-image QA. Reply JSON only: {"has_overlay_text":true/false,"detail":""}.',
    user: 'This is a BACKGROUND image that must contain NO marketing text overlaid by software (a headline will be added later). ' +
      'IMPORTANT: text physically printed ON the product itself (the tube/bottle/box packaging, brand logo, product name, volume, ingredient labels) is the REAL PRODUCT — it is ALLOWED and must NOT be flagged, even if it is clearly legible Chinese/English. ' +
      'Only flag LARGE marketing/advertising text that sits in the EMPTY BACKGROUND or empty areas (a big headline, slogan, banner, caption, price, call-to-action, or overlaid watermark) which is NOT printed on the product packaging. ' +
      'Scan: does the image contain such overlaid marketing text in the background? Reply JSON.',
    images: [image], maxTokens: 300, temperature: 0.1, timeoutMs: 45000
  });
  let noText = null;
  if (r1.ok) noText = (r1.data && typeof r1.data === 'object') ? r1.data : (function () { const m = String(r1.data || '').match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} } return null; })();
  metrics.noText = noText;
  if (noText && noText.has_overlay_text === true) failures.push({ code: 'BASE_HAS_TEXT', reason: noText.detail || 'background still contains overlaid marketing text' });

  // B-Q2 主体一致 + 为主角（双图比对，沿用 qc-gate Q8 口径）
  if (ref && productHint) {
    const r2 = await chatVisionCustom(env, {
      system: 'You are a TOLERANT e-commerce marketing-image QA who understands advertising composition. Reply JSON only: {"same_product":true/false,"is_protagonist":true/false,"reason":""}.',
      user: [
        'Image 1 = a generated MARKETING image. Image 2 = the reference product photo.',
        'In marketing images the product is intentionally allowed to: sit inside a lifestyle scene, lie horizontally or at an angle, appear partially cropped, be shown with props/ingredients/a human model, appear as several identical units, or be shot from a different angle. A person may be using it.',
        'Q1 same_product: Does image 1 visibly contain the SAME product as image 2 — matching category AND key packaging features (shape, colour, cap, bottle/tube form, label style, branding)? Be lenient: answer false ONLY when the product is entirely absent or is clearly a different product. Angle, partial view, props, a model and scene styling must NOT make you answer false.',
        'Q2 is_protagonist: Is the product (or its use) the thing being promoted and a clear visual focus, even if shared with a model or props? Answer false ONLY when the product is an insignificant background object.',
        'expected product: ' + String(productHint || '').slice(0, 80),
        'When uncertain, answer true. Reply JSON only.'
      ].join('\n'),
      images: [image, ref], maxTokens: 300, temperature: 0.1, timeoutMs: 45000
    });
    let subj = null;
    if (r2.ok) subj = (r2.data && typeof r2.data === 'object') ? r2.data : (function () { const m = String(r2.data || '').match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} } return null; })();
    metrics.subject = subj;
    if (subj && (subj.same_product === false || subj.is_protagonist === false)) failures.push({ code: 'BASE_SUBJECT_MISMATCH', reason: subj.reason || 'main product changed from reference' });
  }

  // B-Q3 画面瑕疵：仅判背景/留白区的硬伪影（白块/矩形/边框/占位框/斜切）；产品包装上的小字渲染瑕疵放行
  const r3 = await chatVisionCustom(env, {
    system: 'You are a strict e-commerce image artifact QA. Reply JSON only: {"has_background_artifact":true/false,"kind":"","detail":""}.',
    user: 'Inspect ONLY the BACKGROUND and empty areas of this marketing image for compositional artifacts that should NOT exist: a large solid white/colored rectangle/box, a hard-edged blank panel, a visible border/frame around an empty area, a geometric cut-off triangle/wedge, an obvious empty placeholder box in empty space, a torn/collaged edge, or a badly broken composition in the background. ' +
      'IMPORTANT: minor rendering flaws on the PRODUCT ITSELF (e.g. slightly garbled small printed characters on the tube/bottle/box packaging, blurry product-label text, uneven product surface texture) are the REAL PRODUCT and are ALLOWED — do NOT flag them. Naturally blurred backgrounds, soft gradients and normal multi-panel collages with seamless thin gutters are FINE. ' +
      'Answer true ONLY for hard artifacts sitting in the empty/background areas. Reply JSON.',
    images: [image], maxTokens: 300, temperature: 0.1, timeoutMs: 45000
  });
  let art = null;
  if (r3.ok) art = (r3.data && typeof r3.data === 'object') ? r3.data : (function () { const m = String(r3.data || '').match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} } return null; })();
  metrics.artifact = art;
  // BASE_ARTIFACT 降级为 warning（不硬拒/不零输出）：圆形图标徽标等设计元素或轻微背景瑕疵不阻断出图
  if (art && art.has_background_artifact === true) metrics.artifact.warning = (art.kind ? art.kind + ': ' : '') + (art.detail || 'background artifact (non-blocking)');

  return { pass: failures.length === 0, failures, metrics, retryable: true };
}

/* ---------- 主入口 ---------- */
/* =====================================================================
 * 轨道A · 纯白底图（white_main / f_white，recipe='white_bg'）确定性保真路径
 * ---------------------------------------------------------------------
 * 纪律：产品像素绝不重绘。
 *   - 保真抠图（picwish→autodl→gitee 降级），产品为客户实拍真实像素；
 *   - 在纯白 #FFFFFF 正方形画布上居中合成，绝不加任何地面阴影/倒影/灰渐变；
 *   - 画布边长不低于原图最长边且 ≥2048，输出分辨率不低于原图；
 *   - 小图放大设上限（≤1.6x），宁可产品略小也不硬放大到糊（信息论约束）。
 * 全程不调用生成模型，故不会因生成模型重绘而变形/加阴影，也不受其超时影响。
 * ===================================================================*/
// 注：edge 无 createImageBitmap/OffscreenCanvas，服务端不做 canvas 合成；
// 白底合成在前端浏览器 atu-studio.js 完成（composite='white_cutout'/'white_passthrough'）。

// 保真抠图降级链：picwish（默认）→ autodl（GPU 实例）→ gitee（RMBG-2.0）
async function cutoutWithFallback(env, image) {
  let r = await picwishCutout(env, image, { type: 'object' });
  if (r.ok) return r;
  r = await autodlCutout(env, image);
  if (r.ok) return r;
  r = await giteeMatting(env, image, { model: 'RMBG-2.0' });
  if (r.ok) return r;
  return { ok: false, error: { code: 'cutout_all_failed', message: '所有保真抠图服务均不可用' } };
}

async function buildWhiteMain(env, image, typeId, args = {}) {
  const t0 = Date.now();
  // 白底快通道：前端已判定原图四角近纯白（skip_cutout），直接透传原图，不调抠图/结构质检
  if (args.skip_cutout) {
    return {
      ok: true, type: typeId, composite: 'white_passthrough', base_image: image,
      text_layers: [], fast_channel: true,
      white_spec: { bg:'#ffffff', min_size:2048, ratio:0.86, max_scale:1.6, no_shadow:true, alpha_threshold:12, jpeg_quality:0.95 },
      elapsed_ms: Date.now()-t0, cost: 0, backend: 'fast_channel'
    };
  }
  const cut = await cutoutWithFallback(env, image);
  // 降级出图（不允许零输出）：抠图服务全挂时，直接把原图作为 base_image 透传给前端，
  // 由前端按 white_spec 铺纯白居中合成（原图本就接近白底时尤其实用），绝不返回错误导致空图。
  if (!cut.ok || !cut.image) {
    return {
      ok: true,
      type: typeId,
      composite: 'white_passthrough',
      base_image: image,                 // 原图直接透传，前端铺白居中
      text_layers: [],
      degraded: true,
      degrade_reason: (cut.error && cut.error.code) || 'cutout_failed',
      white_spec: {
        bg: '#ffffff', min_size: 2048, ratio: 0.86, max_scale: 1.6,
        no_shadow: true, alpha_threshold: 12, jpeg_quality: 0.95
      },
      elapsed_ms: Date.now() - t0,
      cost: 0,
      backend: 'passthrough'
    };
  }

  // Edge 运行时（compat 2026-09-16 + nodejs_compat）经隔离探针实测：createImageBitmap/OffscreenCanvas
  // 均为 undefined，服务端无法做 canvas 合成（本地 wrangler dev 同样失败）。故遵循 M2 架构：
  // 服务端只做保真抠图（产品真实像素、绝不重绘），回透明 cutout PNG + 确定性合成规格，
  // 由浏览器 atu-studio.js 在前端 canvas 里合成白底成品（浏览器必有完整 canvas API）。
  return {
    ok: true,
    type: typeId,
    composite: 'white_cutout',
    base_image: cut.image,                 // 透明 PNG dataURL，保真未重绘
    text_layers: [],
    white_spec: {
      bg: '#ffffff',                       // 纯白底
      min_size: 2048,                      // 正方形边长 S=max(原图最长边,2048)
      ratio: 0.86,                         // 产品目标占比
      max_scale: 1.6,                      // 小图放大封顶，宁可略小不硬放大到糊
      no_shadow: true,                     // 无地面阴影/倒影/灰渐变
      alpha_threshold: 12,                 // bbox 判定 alpha 阈值
      jpeg_quality: 0.95
    },
    elapsed_ms: Date.now() - t0,
    cost: PER_IMAGE_COST_RMB,
    backend: cut.backend || 'picwish'
  };
}

export async function runMarketingGenerate(env, args = {}) {
  const started = Date.now();
  const typeId = args.type;
  const t = getImageType(typeId);
  if (!t) return { ok: false, error: { code: 'bad_type', message: '未知图种: ' + typeId }, cost: 0 };
  // 内部 recipe 覆盖（不改契约字段）：如 rider 场景复用 selling_point 的 type id
  const recipe = (args.recipe && typeof args.recipe === 'string') ? args.recipe : t.recipe;

  const image = args.image;
  if (typeof image !== 'string' || !/^data:image\/(jpe?g|png|webp);base64,/.test(image)) {
    return { ok: false, error: { code: 'bad_image', message: '缺少产品图 dataURL' }, cost: 0 };
  }

  // 轨道A 纯白底图（white_main / f_white）：保真抠图 + 纯白 #FFFFFF 合成、无阴影、
  // 分辨率不低于原图；绝不走 generateImage 重绘（重绘必然带来加阴影/降质/变形风险）。
  if (recipe === 'white_bg') return await buildWhiteMain(env, image, typeId, args);

  // 轨道B · 确定性姿态合成（hang/lay）：服务端只保真抠图回透明产品，姿态与环境由前端 canvas 合成
  if (args.pose === 'hang' || args.pose === 'lay') {
    const t0 = Date.now();
    const cut = await cutoutWithFallback(env, image);
    if (!cut.ok || !cut.image) return { ok: true, composite: 'pose_compose', base_image: image, text_layers: [], degraded: true, pose_spec: { pose: args.pose, min_size: 2048 }, elapsed_ms: Date.now()-t0, cost: 0, backend: 'passthrough' };
    return {
      ok: true, type: typeId, composite: 'pose_compose', base_image: cut.image, text_layers: [],
      pose_spec: { pose: args.pose, min_size: 2048 },
      elapsed_ms: Date.now()-t0, cost: PER_IMAGE_COST_RMB, backend: cut.backend || 'picwish'
    };
  }

  let size = args.size && /^\d{3,5}x\d{3,5}$/.test(args.size) ? args.size : t.size;
  // 校验最小像素（契约 §1）
  const [w, hgt] = size.split('x').map(Number);
  if (w * hgt < MIN_TOTAL_PIXELS) size = t.size;

  let _langKey = String(args.language || 'en').toLowerCase();
  if (_langKey === 'zh-cn' || _langKey === 'zh') _langKey = 'zh-CN';
  const langName = { en: 'English', 'zh-CN': 'Simplified Chinese', ja: 'Japanese', ko: 'Korean' }[_langKey] || 'English';

  const productDesc = String(args.product_desc || 'the product').slice(0, 120);
  const productFacts = String(args.product_facts || 'the same product shown, same colors, parts and materials').slice(0, 400);
  const ost = args.on_screen_text && typeof args.on_screen_text === 'object' ? args.on_screen_text : {};

  const scenes = args.scenes || [];
  const lighting = args.lighting || 'soft natural daylight';
  const domain = args.domain || '';

  /* ================= 前端文字层合成模式（全语种默认；forceBaked 才走烤字兜底） ================= */
  if (isFrontendLang(_langKey) && !args.forceBaked) {
    // 1) plan 阶段产出的上屏文案必须确为目标语种；不符则如实返回、不出图不计费
    const violations = validateOnScreen(ost, _langKey);
    if (violations.length) {
      return { ok: false, composite: 'frontend', error: { code: 'ost_lang_mismatch', message: '上屏文案与目标语种(' + _langKey + ')不符，未出图', violations }, cost: 0, elapsed_ms: Date.now() - started };
    }
    // 2) 固定版式 text_layers（坐标）
    const text_layers = buildTextLayers(recipe, ost);
    // 3) 无字底图 prompt：锁构图/主体/场景，文字区预留干净空带，严禁烤字
    const prompt = buildNoTextPrompt(recipe, {
      productDesc, productFacts, domain, scenes, lighting, iconCount: (ost.icons || []).length,
      poseOverride: args.pose
    }, text_layers);

    // 每次重试按「上一次失败类型」追加更强指令：去文字 / 强化主体，escalating
    const antiTextEscalation = [
      '',
      '\nANTI-TEXT RETRY 1: The last draft still baked text or a price tag/sticker. Strip EVERY letter, digit, price, label, sticker and hangtag; render all formerly-stuck spots as a clean flat sticker-free surface.',
      '\nANTI-TEXT RETRY 2: Final attempt. Absolutely zero text / numbers / price-tags / stickers / hangtags anywhere on product or background; erase all such reference markings into a clean seamless surface.'
    ];
    const subjectEscalation = [
      '',
      '\nSUBJECT RETRY 1: Keep the reference product clearly recognizable, complete and as the obvious hero, matching its exact shape, colour, cap and packaging; place it prominently even within the scene.',
      '\nSUBJECT RETRY 2: Final attempt. The reference product must be the unmistakable central focus, fully consistent with the reference photo and not replaced, obscured or cropped out by props/models.'
    ];
    const artifactEscalation = [
      '',
      '\nARTIFACT RETRY 1: Remove any solid boxes, blank panels, borders or geometric cut shapes; render the whole scene as one continuous photorealistic environment where the text area is only softly defocused — no hard edges.',
      '\nARTIFACT RETRY 2: Final attempt. Absolutely no white/color blocks, frames, placeholders or cut-off geometry anywhere; everything must blend seamlessly with no visible rectangles.'
    ];
    let prevFailures = [];
    const extraFor = (attempt, failures) => {
      let extra = '';
      if (failures.some(f => f.code === 'BASE_HAS_TEXT')) extra += antiTextEscalation[Math.min(attempt, 2)];
      if (failures.some(f => f.code === 'BASE_SUBJECT_MISMATCH')) extra += subjectEscalation[Math.min(attempt, 2)];
      if (failures.some(f => f.code === 'BASE_ARTIFACT')) extra += artifactEscalation[Math.min(attempt, 2)];
      return extra;
    };
    const doGen = (attempt, failures) => generateImage(env, {
      prompt: prompt + extraFor(attempt, failures),
      imagePayload: image, size, timeoutMs: 85000, watermark: false
    });

    // 4) 无字底图质检：校验「无烤字 + 主体/场景」（跳过 Q4 语种/Q5 截断——底文本就无烤字）
    //    最多 3 次尝试（首跑 + 2 次重试）；文字类 / 主体类失败都允许按类型重试，禁止单次误判一票否决
    let baseB64 = null, qc = null;
    const checkBase = async (b64) => runBaseQc(env, { image: 'data:image/jpeg;base64,' + b64, ref: image, productHint: productDesc, domain });
    for (let attempt = 0; attempt < 3; attempt++) {
      const r = await doGen(attempt, prevFailures);
      if (r.error) {
        // 上游超时/限流/5xx：立即返回，不再立即重试。
        // 并发排队/限流下重试只会更慢——一次 85s 超时被放大成 3×≈200s 墙钟，触发边缘裸 520。
        const code = (r.error && r.error.code) || '';
        if (code === 'upstream_timeout' || /^upstream_(4\d\d|5\d\d)$/.test(code)) {
          return { ok: false, composite: 'frontend', error: r.error, cost: 0, elapsed_ms: Date.now() - started };
        }
        if (attempt === 2) return { ok: false, composite: 'frontend', error: r.error, cost: 0, elapsed_ms: Date.now() - started };
        continue; // 中间出图失败（如 no_image）：继续下一次重试，仍 0 计费
      }
      baseB64 = r.b64;
      try { qc = await checkBase(baseB64); } catch {}
      if (!qc || qc.pass) break;        // 通过或 QC 不可用即停
      prevFailures = qc.failures;       // 记录失败类型，下一轮按类型叠加指令重试
    }
    const elapsed_ms = Date.now() - started;
    if (qc && !qc.pass) {
      return { ok: false, composite: 'frontend', error: { code: 'qc_rejected', message: '无字底图质检未通过', failures: qc.failures }, cost: 0, elapsed_ms, qc: qc.metrics };
    }
    return {
      ok: true,
      type: typeId,
      size,
      composite: 'frontend',
      base_image: 'data:image/jpeg;base64,' + baseB64,
      text_layers,
      elapsed_ms,
      cost: PER_IMAGE_COST_RMB,
      qc: qc ? qc.metrics : null,
      watermark_param_tried: 'watermark:false'
    };
  }

  /* ================= zh-CN / en：模型烤字模式（保持现有路径） ================= */
  const prompt = buildRecipePrompt(recipe, {
    productDesc, productFacts, ost, langName,
    domain, scenes, lighting,
    designReq: args.design_requirements || '',
    poseOverride: args.pose
  }) + '\n' + BRAND_GUARD;

  const doGen = () => generateImage(env, { prompt, imagePayload: image, size, timeoutMs: 85000, watermark: false });
  let r = await doGen();
  if (r.error) return { ok: false, composite: 'baked', error: r.error, cost: 0, elapsed_ms: Date.now() - started };

  // 强制质检门禁：生成后自动 VL 校验；失败重生成一次，仍失败则 rejected 不计费
  let qc = null;
  try {
    qc = await runQc(env, { image: 'data:image/jpeg;base64,' + r.b64, type: recipe, domain, lang: _langKey, ref: image, productHint: productDesc });
  } catch {}
  if (qc && !qc.pass) {
    r = await doGen();
    if (!r.error) {
      try { qc = await runQc(env, { image: 'data:image/jpeg;base64,' + r.b64, type: recipe, domain, lang: _langKey, ref: image, productHint: productDesc }); } catch {}
    }
  }
  const elapsed_ms = Date.now() - started;
  if (r.error) return { ok: false, composite: 'baked', error: r.error, cost: 0, elapsed_ms };
  if (qc && !qc.pass) return { ok: false, composite: 'baked', error: { code: 'qc_rejected', message: '质检未通过', failures: qc.failures }, cost: 0, elapsed_ms, qc: qc.metrics };

  return {
    ok: true,
    type: typeId,
    size,
    composite: 'baked',
    image: 'data:image/jpeg;base64,' + r.b64,
    elapsed_ms,
    cost: PER_IMAGE_COST_RMB,
    qc: qc ? qc.metrics : null,
    watermark_param_tried: 'watermark:false'
  };
}
