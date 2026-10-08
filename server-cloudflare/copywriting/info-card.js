/* =====================================================================
 * info-card.js —— 补录信息卡：从 mctx 自动智能预填（不写"留白"提示）
 * ---------------------------------------------------------------------
 * 历史问题：补录卡无预填、输入框太小、提示客户"可留白"。
 * 根因修法：
 *   · 字段不再写死六品类，而是由 mctx（OCR+联网真实事实）自动生成；
 *   · 每个字段都有"能预填就预填"——OCR 到的品牌/型号/价格/颜色/材质
 *     直接带入，联网到的消费者痛点自动整理成"核心卖点"草稿；
 *   · 所有多行字段一律大输入框（rows≥4），不出现"可留白/选填"字样；
 *   · 背景第三方品牌只读展示，提醒商家不要写进文案。
 *
 * 导出：
 *   buildPrefill(mctx) -> { fields:[...], values:{...} }
 *   getInfoCard(category) -> 旧静态表（兼容老调用，不推荐）
 * ===================================================================*/

function firstLine(arr, n = 3) {
  return (arr || []).slice(0, n).join('\n');
}

/**
 * 由 mctx 生成补录表单 schema + 预填值。
 * @param {object} mctx 统一商品上下文
 * @returns {{fields: object[], values: object}}
 */
export function buildPrefill(mctx = {}) {
  const f = mctx.facts || mctx;
  const brand = f.brand || '';
  const model = f.model || '';
  const price = f.price || '';
  const color = f.color || '';
  const materials = (f.materials || []).join('、');
  const ownText = (f.own_text || []).join(' | ');
  const keyParts = (f.key_parts || []).join('、');
  const bg = (f.bg_brands || []);
  const catZh = f.category_zh || (mctx.category && mctx.category.zh) || '';

  const research = f.research || mctx.research || {};
  const painPoints = (research.consumer_needs || []).slice(0, 4).map(x => '- ' + x.split('：')[0]).join('\n');
  const brandFacts = (research.brand_facts || []).slice(0, 3).map(x => '- ' + x.split('：')[0]).join('\n');

  const fields = [
    { key: 'productNameZh', zh: '商品名（中文）', type: 'singleline', rows: 1,
      prefill: [brand, catZh].filter(Boolean).join(' ') },
    { key: 'productNameEn', zh: '商品名（英文）', type: 'singleline', rows: 1,
      prefill: [brand, (f.category_en || (mctx.category && mctx.category.en) || '')].filter(Boolean).join(' ') },
    { key: 'brand', zh: '品牌（照录，勿改）', type: 'singleline', rows: 1, prefill: brand },
    { key: 'model', zh: '型号/款号', type: 'singleline', rows: 1, prefill: model },
    { key: 'price', zh: '售价（带货币符号）', type: 'singleline', rows: 1, prefill: price },
    { key: 'color', zh: '颜色', type: 'singleline', rows: 1, prefill: color },
    { key: 'materials', zh: '可见材质/工艺', type: 'multiline', rows: 3, prefill: materials },
    { key: 'keyParts', zh: '值得放大的细节部件', type: 'multiline', rows: 3, prefill: keyParts },
    { key: 'sellingPoints', zh: '核心卖点草稿（已按消费者痛点预填，可改）', type: 'multiline', rows: 6,
      prefill: [
        painPoints ? '【该品类买家最在意】\n' + painPoints : '',
        brandFacts ? '【品牌/产品已知信息】\n' + brandFacts : '',
        ownText ? '【本体照录文字】' + ownText : ''
      ].filter(Boolean).join('\n\n') },
    { key: 'scenes', zh: '主要使用场景', type: 'multiline', rows: 4,
      prefill: suggestScenes(catZh) },
    { key: 'targetUser', zh: '目标人群', type: 'singleline', rows: 1, prefill: suggestUser(catZh) },
    { key: 'afterSales', zh: '售后/保障（如实填写）', type: 'multiline', rows: 4, prefill: '' },
    { key: 'extraNotes', zh: '其他想让文案体现的话', type: 'multiline', rows: 5, prefill: '' },
  ];
  if (bg.length) {
    fields.push({ key: '_bgBrands', zh: '⚠ 图中背景第三方品牌（禁止写进任何文案）', type: 'readonly', rows: 2, prefill: bg.join('、') });
  }

  const values = {};
  fields.forEach(fd => { if (fd.key[0] !== '_') values[fd.key] = fd.prefill || ''; });
  return { fields, values };
}

function suggestScenes(catZh) {
  const map = [
    [/护肤|精华|面霜|面膜|化妆/, '早晚护肤\n换季敏感期\n约会/上镜前急救'],
    [/耳机|音箱|数码|手机/, '通勤地铁\n办公网课\n运动健身\n游戏开黑'],
    [/衣|裤|裙|T/, '日常通勤\n周末约会\n旅行度假'],
    [/花|玫瑰|鲜花/, '表白/纪念日\n居家插花\n节日送礼'],
    [/箱|包|杯|壶/, '上班通勤\n差旅出行\n户外露营'],
  ];
  for (const [re, v] of map) if (re.test(catZh || '')) return v;
  return '日常自用\n送礼场景\n拍照出片';
}
function suggestUser(catZh) {
  if (/护肤|美妆/.test(catZh)) return '注重成分、肤质明确的年轻女生';
  if (/耳机|数码/.test(catZh)) return '通勤族/学生党/数码爱好者';
  if (/衣/.test(catZh)) return '追求性价比与版型的日常通勤人群';
  return '追求真实好用、反感硬广的普通消费者';
}

/* 旧静态表（向后兼容 worker 老路由；新流程请用 buildPrefill(mctx)） */
const LEGACY = {
  flower: ['variety', 'origin', 'vaseLife', 'price'],
  bike: ['bikeType', 'frameMaterial', 'price', 'scenarios'],
  tech3c: ['productModel', 'keySpecs', 'price', 'painPoint'],
  beauty: ['skinType', 'keyIngredients', 'price', 'efficacy'],
  clothing: ['fitType', 'bodyType', 'price', 'scenes'],
  food: ['taste', 'ingredients', 'price', 'eatScenes'],
};
export function getInfoCard(category) {
  if (!LEGACY[category]) return { ok: false, error: 'unknown_category', categories: Object.keys(LEGACY) };
  return {
    ok: true, category,
    fields: [
      { key: 'title', zh: '商品名', type: 'singleline' },
      { key: 'price', zh: '售价', type: 'singleline' },
      { key: 'sellingPoints', zh: '核心卖点', type: 'multiline', rows: 5 },
      { key: 'scenes', zh: '使用场景', type: 'multiline', rows: 4 },
      { key: 'extraNotes', zh: '补充说明', type: 'multiline', rows: 5 },
    ]
  };
}

export default { buildPrefill, getInfoCard };
