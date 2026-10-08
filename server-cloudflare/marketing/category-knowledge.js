/* =====================================================================
 * 品类知识库 category-knowledge.js（声明式，无网络依赖）
 * - domain 命中：vision 候选 + 关键词二次校准（自行车→sports_outdoor，不得落 auto）
 * - 各 domain 的场景/色调/道具差异化（背景内容的唯一来源）
 * ===================================================================*/

export const DOMAINS = {
  food:           { bg: 'a bright fresh summer tabletop, icy cold with fizzing bubbles and condensation on glass', grade: 'light airy refreshing tone', props: 'ice cubes, glass, coaster, fresh ingredients' },
  drink:          { bg: 'a bright summer tabletop with a glass of cold fizzy drink and ice', grade: 'cold thirst-quenching mood', props: 'ice, glass, condensation' },
  beauty:         { bg: 'a clean vanity surface with soft warm beauty light', grade: 'pale rose-grey premium tone', props: 'mirror, cotton pad, soft glow' },
  tech:           { bg: 'a clean minimal modern desk surface', grade: 'soft cool neutral tone', props: 'laptop edge, subtle office props' },
  home:           { bg: 'a cozy bright home interior', grade: 'warm linen and wood neutral tone', props: 'sofa cushion, plant, warm light' },
  fashion:        { bg: 'a tasteful lifestyle setting with soft natural daylight', grade: 'neutral lifestyle tone', props: 'neutral backdrop, gentle shadow' },
  sports_outdoor: { bg: 'a tree-lined paved trail or greenway in a park', grade: 'natural daylight with greenery', props: 'trees, path, sky' },
  auto:           { bg: 'an outdoor paved road or car setting', grade: 'clean neutral daylight', props: 'road, parking, sky' },
  flower:         { bg: 'a glass vase by a bright window', grade: 'pastel soft tone', props: 'vase, window light, soft shadow' },
  general:        { bg: 'a clean soft-neutral blurred modern environment', grade: 'neutral', props: 'subtle props' }
};

// 关键词 → domain 校准（vision 给的 domain 可能错，用商品名/category 文本纠偏）
const DOMAIN_KEYWORDS = [
  { test: /bike|bicycle|mtb|mountain bike|自行车|山地车|单车|骑行|scooter|e-bike/i, domain: 'sports_outdoor' },
  { test: /cola|coke|soda|drink|beverage|饮料|可乐|汽水|啤酒|水\b|juice|咖啡|coffee|茶\b|tea/i, domain: 'drink' },
  { test: /food|snack|食品|零食|饼干|面包|坚果|水果|fruit|dish|菜|meal/i, domain: 'food' },
  { test: /cosmetic|lipstick|makeup|skincare|beauty|美妆|口红|唇釉|护肤|粉底|香水/i, domain: 'beauty' },
  { test: /earphone|headset|charger|phone|laptop|electronics|3c|耳机|充电|数码|电子|键盘|mouse|鼠标/i, domain: 'tech' },
  { test: /vase|pillow|sofa|home|家居|装饰|摆件|床|窗帘/i, domain: 'home' },
  { test: /dress|shirt|jacket|garment|clothing|fashion|服饰|服装|衣服|包\b|bag|帆布/i, domain: 'fashion' },
  { test: /car|vehicle|auto|汽车|suv|sedan/i, domain: 'auto' },
  { test: /flower|bouquet|玫瑰|鲜花|花\b/i, domain: 'flower' }
];

const VALID = Object.keys(DOMAINS);

/**
 * 校准 vision 给出的 domain。
 * @param {string} visionDomain  vision 自由文本候选
 * @param {string} nameText     商品名+category 文本
 * @returns {string} 归一后的 domain key
 */
export function resolveDomain(visionDomain, nameText = '') {
  // 关键词优先：自行车等强特征直接锁域
  for (const k of DOMAIN_KEYWORDS) {
    if (k.test.test(nameText)) return k.domain;
  }
  // 否则用 vision 给的，白名单归一
  let d = String(visionDomain || '').toLowerCase().trim();
  if (d === 'automotive') d = 'auto';
  if (!VALID.includes(d)) d = 'general';
  return d;
}

/**
 * 背景环境描述：优先用 plan 现场推理的 scenes[0].en，否则知识库 domain 基调。
 */
export function resolveBg(domain, scenes) {
  const s = scenes && scenes[0] && scenes[0].en;
  if (s) return 'the product set within a softly blurred, out-of-focus ' + s + ', professional commercial lighting, shallow depth of field';
  const d = DOMAINS[domain] || DOMAINS.general;
  return d.bg + ' (' + d.grade + '), professional commercial lighting, shallow depth of field';
}
