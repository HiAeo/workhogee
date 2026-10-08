/* =====================================================================
 * WorkHogee · M3 通用电商出图引擎 · 实例级脚本生成（最深护城河）
 * ---------------------------------------------------------------------
 * 输入：一件商品的实拍图（公网 URL）+ 套版类型 kitType。
 * 输出：结构化"出图脚本"——商品名 / 子品类 / 3-5 卖点 / 适用人群 /
 *       2-3 使用场景 / 2-4 关键部件 / 推荐出图清单。
 * 前端拿到脚本后展示给商家确认/编辑，再驱动整套图的生成。
 *
 * 与 M2.3 的区别：场景 prompt 不再硬编码品类库，而是由脚本的 useScenes 生成；
 * 细节裁剪提示来自脚本的 keyParts；文案来自脚本的 sellingPoints。
 * ===================================================================*/

import { chatVisionCustom } from './vision.js';
import { findSimilarCases } from './casebook.js';

const KIT_TYPES = new Set(['ecommerce', 'fashion']);

// 视觉风格域（只 6 个，用于选背景色调/道具/光线；不是 360 行业，由视觉模型现场判定）
const DOMAINS = ['beauty', 'fashion', 'food', 'tech', 'home', 'auto', 'general'];
// 各域保真等级兜底（模型没给 tier 时）：tech 细结构多→A，服饰→B，鲜花食品→C
const DOMAIN_TIER_FALLBACK = { beauty: 'B', fashion: 'B', food: 'C', tech: 'A', home: 'B', auto: 'A', general: 'B' };

// 仅在视觉模型没给 domain 时，按品类文本做轻量兜底（主路径不依赖它）
function inferDomain(text = '') {
  const t = String(text);
  if (/美妆|护肤|口红|唇釉|唇泥|唇彩|彩妆|面膜|香水|粉底|眼影|腮红|眉笔|睫毛|美甲|beauty|makeup|skincare|lip|cosmetic/i.test(t)) return 'beauty';
  if (/服装|衣|裤|裙|鞋|靴|包|帽|袜|围巾|穿|fashion|apparel|garment|shoe|bag/i.test(t)) return 'fashion';
  if (/食品|饮|食|咖啡|茶|零食|坚果|水果|蛋糕|面包|生鲜|food|drink|coffee|snack|beverage|bakery/i.test(t)) return 'food';
  if (/耳机|话务|3c|电子|手机|电脑|数码|充电|电器|仪器|相机|headphone|headset|electronic|tech|digital|appliance|camera/i.test(t)) return 'tech';
  if (/家居|家具|家装|厨具|收纳|家纺|home|furniture|kitchenware/i.test(t)) return 'home';
  if (/汽车|轿车|suv|越野车|卡车|客车|自行车|摩托|电动车|新能源车|工程车|车|car|vehicle|motor|bike|automobile/i.test(t)) return 'auto';
  return 'general';
}

// useScenes 统一为 {zh,en}；兼容旧的纯中文字符串数组 / 用户编辑
function normScenes(v, n = 3) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, n).map(x => {
    if (x && typeof x === 'object') {
      const zh = String(x.zh ?? x.cn ?? '').trim();
      const en = String(x.en ?? '').trim();
      if (!zh && !en) return null;
      return { zh: zh || en, en: en || zh };
    }
    const s = String(x ?? '').trim();
    return s ? { zh: s, en: s } : null;
  }).filter(Boolean);
}

/** 把模型输出 / 用户编辑结果归一化为标准脚本；缺字段补默认。 */
export function normalizeScript(input = {}, kitType = 'ecommerce') {
  const kt = KIT_TYPES.has(kitType) ? kitType : 'ecommerce';
  const arr = (v, n = 99) => Array.isArray(v) ? v.map(String).filter(s => s && s.trim()).slice(0, n) : [];
  const category = String(input.category || '').trim().slice(0, 30);
  let domain = String(input.domain || '').toLowerCase().trim();
  if (!DOMAINS.includes(domain)) domain = inferDomain(category || input.productName || '');
  let fidelityTier = String(input.fidelityTier ?? input.tier ?? '').toUpperCase().trim();
  if (!['A', 'B', 'C'].includes(fidelityTier)) fidelityTier = DOMAIN_TIER_FALLBACK[domain] || 'B';
  const useScenes = normScenes(input.useScenes, 3);
  const script = {
    productName: String(input.productName || input.name || '').trim().slice(0, 60),
    category,
    domain,
    fidelityTier,
    sellingPoints: arr(input.sellingPoints, 5),
    targetAudience: String(input.targetAudience || '').trim().slice(0, 40),
    useScenes,
    keyParts: arr(input.keyParts, 4)
  };
  // 兜底：至少各给一条占位，保证出图链路不崩
  if (!script.productName) script.productName = script.category || '精选商品';
  if (!script.category) script.category = '通用商品';
  if (script.sellingPoints.length === 0) script.sellingPoints = ['实拍原图，所见即所得'];
  if (script.useScenes.length === 0) script.useScenes = [{ zh: '明亮简约的生活化场景，自然光，浅色调', en: 'a bright minimal lifestyle scene with natural daylight and light tones' }];
  if (script.keyParts.length === 0) script.keyParts = ['商品整体外观'];
  script.recommendedShots = buildSkeleton(kt, script);
  script.kitType = kt;
  return script;
}

/**
 * 两套图骨架（佐糖拆解结论）：
 *  - ecommerce 电商套图（静物全行业通用）：白底主图×2、场景生活图×3、细节卖点图×2、营销海报×1
 *  - fashion  服装套图（需模特）：白底图×1、模特图×2（M3 占位）、种草图×2、细节图×1、营销图×1
 * 骨架上按脚本 useScenes / keyParts 增删 scenePrompt / partName。
 */
export function buildSkeleton(kitType, script) {
  const scenes = script.useScenes || [];
  const parts = script.keyParts || [];
  const sEn = i => (scenes[i] && scenes[i].en) || '';
  const sZh = i => (scenes[i] && scenes[i].zh) || '';
  const shots = [];
  if (kitType === 'fashion') {
    shots.push({ type: 'white_main', count: 1, priority: 1 });
    // 模特图 M3 先占位：用场景合成图替代 + 前端文字标注"AI模特即将上线"
    shots.push({ type: 'model', count: 2, priority: 2, placeholder: true, note: 'AI模特即将上线，本期用场景图占位' });
    shots.push({ type: 'seeding', count: 2, priority: 3, scenePrompt: sEn(0), scenePrompt2: sEn(1), sceneLabel: sZh(0), sceneLabel2: sZh(1) });
    shots.push({ type: 'detail', count: 1, priority: 4, partName: parts[0] || '商品细节' });
    shots.push({ type: 'marketing', count: 1, priority: 5 });
  } else {
    shots.push({ type: 'white_main', count: 2, priority: 1 });
    shots.push({ type: 'scene', count: 3, priority: 2,
      scenePrompt: sEn(0), scenePrompt2: sEn(1), scenePrompt3: sEn(2),
      sceneLabel: sZh(0), sceneLabel2: sZh(1), sceneLabel3: sZh(2) });
    shots.push({ type: 'detail', count: 2, priority: 3,
      partName: parts[0] || '关键细节', partName2: parts[1] || parts[0] || '关键细节' });
    shots.push({ type: 'marketing', count: 1, priority: 4 });
  }
  return shots;
}

const SCRIPT_SYSTEM_PROMPT = [
  '你是 WorkHogee 的首席电商视觉总监兼资深商品策划。商家只给你看一件商品的实拍图，',
  '你要像头部卖家的摄影总监一样，当场为"这一件商品"写出一套出图脚本。',
  '全部判断必须基于图片里真实可见的内容，看不清就留空或给最保守的判断，禁止编造品牌型号、参数、价格、功效。',
  '你要输出：',
  '- productName：买家一看就懂的商品名（含颜色/规格/材质，20字内）',
  '- category：子品类，要具体，不要大词。正确示例：山地车、头戴式降噪耳机、丝绒哑光唇釉、纯棉短袖T恤、每日坚果礼盒、316保温杯、缓震跑步鞋、通勤双肩包、女士真皮短靴、陶瓷马克杯',
  '- domain：视觉风格域，只能从这 6 个里选一个：beauty（美妆个护）、fashion（服饰穿戴含鞋包）、food（餐饮食品生鲜）、tech（数码电器3C）、home（家居家装）、auto（汽车/自行车/交通工具，户外道路与城市场景）、general（其他）',
  '- fidelityTier：保真等级，A/B/C 三选一。A=主体只能抠不能重画、有大量细结构或品牌文字（自行车、乐器、3C数码、机械、带型号标识的商品）；B=抠图后允许轻微边缘补全（服装、鞋、包、普通瓶罐）；C=允许生成模型适度重绘（鲜花、生鲜食品）',
  '- sellingPoints：3-5 个从图里看得出来的卖点（材质手感、做工细节、包装状态、配色设计、可见配件），每条 8-20 字，具体不空话',
  '- targetAudience：这件商品主要卖给谁（如：通勤上班族、大学生、户外骑行爱好者、送礼人群），20字内',
  '- useScenes：2-3 个真实使用场景，每个是 {"zh":"中文场景","en":"英文场景短语"}；zh 6-15 字（如：梳妆台日常化妆、地铁通勤降噪、周末郊野骑行），en 是可直接用于英文商业摄影出图的短语（如：daily makeup at a dressing table、noise-free commute on the subway、weekend trail riding）',
  '- keyParts：2-4 个最值得放大拍细节的部件/部位（如：避震前叉、磁吸管身、领口双车线、电脑仓夹层），每条 4-12 字',
  '只输出一个 JSON 对象，不要 markdown、不要代码块、不要任何解释。schema：',
  '{"productName":"","category":"","domain":"beauty","fidelityTier":"B","sellingPoints":["",""],"targetAudience":"","useScenes":[{"zh":"","en":""}],"keyParts":["",""]}'
].join('\n');

/** 把相似案例拼成 few-shot 参考文本（不直接教模型照抄，只给"写法感觉"）。 */
function casesHint(cases) {
  if (!Array.isArray(cases) || cases.length === 0) return '';
  const lines = cases.map((c, i) =>
    '参考案例' + (i + 1) + '：' + c.productName + '（' + c.category + '）｜卖点：' + (c.sellingPoints || []).join('、')
    + '｜场景：' + (c.useScenes || []).join('、') + '｜细节：' + (c.keyParts || []).join('、')
  );
  return '\n以下是同品类优质案例的写法参考（商品不同，禁止照抄，只学颗粒度和具体程度）：\n' + lines.join('\n');
}

/**
 * 对"这一件商品"现场生成出图脚本。
 * @param {object} env Worker env
 * @param {object} args
 * @param {string} args.imageUrl   商品图公网 URL（TOS 预签名 GET）
 * @param {string} [args.kitType] ecommerce | fashion
 * @returns {Promise<{ok:true,script:object}|{ok:false,error:string}>}
 */
export async function generateProductScript(env, { imageUrl, kitType = 'ecommerce' } = {}) {
  if (!imageUrl) return { ok: false, error: 'no_image' };
  // 先粗检索相似案例（category 未知时靠关键词兜底），作为 few-shot
  let cases = [];
  try { cases = await findSimilarCases(env, {}); } catch { cases = []; }

  const user = [
    '这是我要上架卖的一件商品实拍图。请按系统给的 schema，为它写出完整出图脚本。',
    'kitType=' + kitType + '（' + (kitType === 'fashion' ? '服装/穿戴类套图' : '静物电商通用套图') + '）：',
    casesHint(cases)
  ].filter(Boolean).join('\n');

  const r = await chatVisionCustom(env, {
    system: SCRIPT_SYSTEM_PROMPT,
    user,
    images: [imageUrl],
    maxTokens: 900,
    temperature: 0.2,
    timeoutMs: 45000
  });
  if (!r.ok) return { ok: false, error: String(r.error || 'vision_failed') };
  const script = normalizeScript(r.data || {}, kitType);
  return { ok: true, script };
}
