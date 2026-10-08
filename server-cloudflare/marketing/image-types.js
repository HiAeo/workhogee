/* =====================================================================
 * WorkHogee 轨道B · 通用图种模板库（一次编写，全行业通用）
 * ---------------------------------------------------------------------
 * 严格对齐冻结 API 契约 §0 / §1：覆盖 ecom 12 + 详情/A+ 10 + fashion 12。
 * 每个图种只描述「版式骨架 + flags + 默认比例/size + prompt 组装配方(recipe)」，
 * 不按行业手写 skill；具体文案由 marketing-plan.js 实例级现场推理产出。
 *
 * 字段说明：
 *   id            契约图种 id
 *   name_zh/name_en  中英文名
 *   purpose       营销目的（一句话）
 *   kit           ecom | detail | fashion
 *   track         a=走轨道A PicWish抠图(白底/搜索主图)，b=本引擎生成
 *   flags         real_scene 真实环境 / real_model 真人模特 / multi_panel 多宫格拼接
 *                 / info_icon 信息图标 / size_anno 尺寸标注
 *   ratio         展示比例（仅描述，不暴露给前端输入像素）
 *   size          契约 §1 实测可用的显式宽x高（总像素 >= 3,686,400）
 *   recipe        marketing-engine.js 的 prompt 组装配方 key
 *   layout        版式骨架：标题位/字号层级/卖点位/图标位/构图/产品占比/背景类型
 *   textSlots     该图种会用到 on_screen_text 的哪些子槽（其余填空）
 * ===================================================================*/

// 契约 §1 实测尺寸（总像素均 >= 3,686,400）
export const SIZES = {
  SQ: '1920x1920',        // 1:1 方图/主图/细节/图标
  F43: '2240x1680',       // 4:3  A+高级APP 600:450 / 核心卖点 / 对比
  W169: '2560x1440',      // 16:9 场景 / 拼图
  BANNER_PC: '3000x1230', // 2.44:1 A+高级PC 1464:600
  APLUS_NORM: '2441x1510',// ~1.62:1 A+普通 970:600
  PORTRAIT: '1920x2560'   // 3:4 服装模特/种草竖版（4,915,200 像素）
};

// 服装套图命中正则（kit_type 为空时由视觉/文本兜底判定）
const FASHION_RE = /(服装|衣|裤|裙|鞋|靴|包|帽|袜|围巾|外套|卫衣|t恤|上衣|牛仔|夹克|风衣|针织|衬衫|fashion|apparel|garment|clothing|dress|jacket|hoodie|sneaker|shoe|handbag|backpack|scarf)/i;
export function inferKitType(text = '', visionCategory = '') {
  return FASHION_RE.test(String(text) + ' ' + String(visionCategory)) ? 'fashion' : 'ecom';
}

/** 图种模板表。key 即契约 type id。 */
export const IMAGE_TYPES = {
  /* ============ 0.1 电商套图 ecom（12）============ */
  white_main: {
    id: 'white_main', name_zh: '白底主图', name_en: 'White Background Main',
    purpose: '平台主图、纯净展示', kit: 'ecom', track: 'a',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '1:1', size: SIZES.SQ, recipe: 'white_bg',
    layout: { titlePos: 'none', headlineTier: 0, sellingPos: 'none', iconPos: 'none', composition: 'centered single product', productRatio: 0.7, bg: 'pure white seamless' },
    textSlots: []
  },
  search_main: {
    id: 'search_main', name_zh: '搜索主图', name_en: 'Search Main',
    purpose: '搜索结果点击率、简洁背景+核心利益点', kit: 'ecom', track: 'a',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '1:1', size: SIZES.SQ, recipe: 'search_main',
    layout: { titlePos: 'bottom strip', headlineTier: 2, sellingPos: 'bottom single line', iconPos: 'none', composition: 'product right, short benefit line bottom-left', productRatio: 0.62, bg: 'clean light gradient' },
    textSlots: ['headline']
  },
  core_selling: {
    id: 'core_selling', name_zh: '核心卖点图', name_en: 'Core Selling Points',
    purpose: '突出核心优势、产品+大标题+3部件图标', kit: 'ecom', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: true, size_anno: false },
    ratio: '4:3', size: SIZES.F43, recipe: 'core_selling',
    layout: { titlePos: 'top full-width', headlineTier: 1, sellingPos: 'top headline', iconPos: 'right side vertical stack of circular badges', composition: 'product left-center, icon badges stacked right', productRatio: 0.5, bg: 'clean modern architectural plaza / soft neutral' },
    textSlots: ['headline', 'icons']
  },
  selling_point: {
    id: 'selling_point', name_zh: '卖点图', name_en: 'Selling Point Scene',
    purpose: '深入价值、真实场景+卖点大标题', kit: 'ecom', track: 'b',
    flags: { real_scene: true, real_model: false, multi_panel: false, info_icon: true, size_anno: false },
    ratio: '16:9', size: SIZES.W169, recipe: 'scene_selling',
    layout: { titlePos: 'lower-left overlay', headlineTier: 1, sellingPos: 'headline + subline over scene', iconPos: 'none', composition: 'product in real environment, text overlay lower-left', productRatio: 0.45, bg: 'real outdoor / lifestyle environment' },
    textSlots: ['headline', 'subheadline']
  },
  icon_selling: {
    id: 'icon_selling', name_zh: '图标卖点图', name_en: 'Icon Selling Points',
    purpose: '卖点图形化、多信息图标+短文案', kit: 'ecom', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: true, size_anno: false },
    ratio: '1:1', size: SIZES.SQ, recipe: 'icon_grid',
    layout: { titlePos: 'top', headlineTier: 2, sellingPos: 'icon grid below', iconPos: '2x2 / 3x2 grid of flat badges with short labels', composition: 'product center, icon grid around/below', productRatio: 0.4, bg: 'clean light studio gradient' },
    textSlots: ['headline', 'icons']
  },
  material: {
    id: 'material', name_zh: '材质图', name_en: 'Material & Craft',
    purpose: '材质工艺、局部特写+材质说明', kit: 'ecom', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '1:1', size: SIZES.SQ, recipe: 'material',
    layout: { titlePos: 'bottom', headlineTier: 3, sellingPos: 'one short material caption', iconPos: 'none', composition: 'tight macro of material surface', productRatio: 0.8, bg: 'soft defocused neutral' },
    textSlots: ['headline']
  },
  scene_show: {
    id: 'scene_show', name_zh: '场景展示图', name_en: 'Lifestyle Scene',
    purpose: '还原真实使用场景', kit: 'ecom', track: 'b',
    flags: { real_scene: true, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '16:9', size: SIZES.W169, recipe: 'lifestyle',
    layout: { titlePos: 'none', headlineTier: 0, sellingPos: 'none', iconPos: 'none', composition: 'product naturally placed in real use environment', productRatio: 0.45, bg: 'real lifestyle environment, daylight' },
    textSlots: []
  },
  multi_scene: {
    id: 'multi_scene', name_zh: '多场景拼图', name_en: 'Multi-Scene Collage',
    purpose: '一图覆盖多场景、多宫格+总标题', kit: 'ecom', track: 'b',
    flags: { real_scene: true, real_model: false, multi_panel: true, info_icon: false, size_anno: false },
    ratio: '16:9', size: SIZES.W169, recipe: 'multi_scene',
    layout: { titlePos: 'top full-width', headlineTier: 1, sellingPos: 'total headline top, per-panel caption bottom', iconPos: 'none', composition: '3 equal side-by-side panels with thin gutters', productRatio: 0.5, bg: 'each panel a real scene' },
    textSlots: ['headline', 'panels']
  },
  competitor_compare: {
    id: 'competitor_compare', name_zh: '竞品对比图', name_en: 'Competitor Compare',
    purpose: '强化差异、对比表/Before-After', kit: 'ecom', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: true, info_icon: false, size_anno: false },
    ratio: '4:3', size: SIZES.F43, recipe: 'compare',
    layout: { titlePos: 'top', headlineTier: 1, sellingPos: 'two columns: ours vs generic', iconPos: 'check/cross marks per row', composition: 'split two-column comparison with a divider', productRatio: 0.4, bg: 'clean white/light comparison table' },
    textSlots: ['headline', 'panels', 'bullets']
  },
  usage_compare: {
    id: 'usage_compare', name_zh: '使用对比图', name_en: 'Before / After',
    purpose: '使用前后效果、Before/After 双栏', kit: 'ecom', track: 'b',
    flags: { real_scene: true, real_model: false, multi_panel: true, info_icon: false, size_anno: false },
    ratio: '4:3', size: SIZES.F43, recipe: 'compare',
    layout: { titlePos: 'top', headlineTier: 2, sellingPos: 'left BEFORE / right AFTER labels', iconPos: 'none', composition: 'two equal panels before vs after use', productRatio: 0.5, bg: 'real scenes both sides' },
    textSlots: ['headline', 'panels']
  },
  size_chart: {
    id: 'size_chart', name_zh: '尺寸/容量/尺码图', name_en: 'Size / Spec Chart',
    purpose: '标明规格、尺寸标注线/尺码表', kit: 'ecom', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: false, size_anno: true },
    ratio: '1:1', size: SIZES.SQ, recipe: 'size_chart',
    layout: { titlePos: 'top', headlineTier: 2, sellingPos: 'dimension lines + spec table', iconPos: 'none', composition: 'product with dimension annotation lines and measurement table', productRatio: 0.55, bg: 'clean white technical background' },
    textSlots: ['headline', 'callouts', 'bullets']
  },
  product_detail: {
    id: 'product_detail', name_zh: '产品细节图', name_en: 'Product Detail',
    purpose: '工艺细节、关键部件特写+引线标注', kit: 'ecom', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '1:1', size: SIZES.SQ, recipe: 'detail',
    layout: { titlePos: 'none', headlineTier: 0, sellingPos: 'leader-line callouts to parts', iconPos: 'none', composition: 'tight macro close-up of a key part', productRatio: 0.8, bg: 'dark moody / premium defocused' },
    textSlots: ['callouts']
  },

  /* ============ 0.2 详情页 / A+（10；product_detail 复用上方）============ */
  hero: {
    id: 'hero', name_zh: '首屏主视觉', name_en: 'Hero Main Visual',
    purpose: '建立产品第一认知', kit: 'detail', track: 'b',
    flags: { real_scene: true, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '16:9', size: SIZES.W169, recipe: 'banner',
    layout: { titlePos: 'one side empty area', headlineTier: 1, sellingPos: 'large headline + subline', iconPos: 'none', composition: 'product on one side, large headline on other, wide cinematic', productRatio: 0.5, bg: 'real premium environment' },
    textSlots: ['headline', 'subheadline']
  },
  scene_atmosphere: {
    id: 'scene_atmosphere', name_zh: '场景氛围图', name_en: 'Scene Atmosphere',
    purpose: '营造产品使用氛围', kit: 'detail', track: 'b',
    flags: { real_scene: true, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '16:9', size: SIZES.W169, recipe: 'mood',
    layout: { titlePos: 'none', headlineTier: 0, sellingPos: 'very short emotional line optional', iconPos: 'none', composition: 'emotional atmospheric scene with product', productRatio: 0.4, bg: 'soft cinematic ambient lighting' },
    textSlots: ['headline']
  },
  multi_angle: {
    id: 'multi_angle', name_zh: '多角度图', name_en: 'Multi-Angle',
    purpose: '多角度呈现外观细节', kit: 'detail', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: true, info_icon: false, size_anno: false },
    ratio: '4:3', size: SIZES.F43, recipe: 'multi_angle',
    layout: { titlePos: 'top', headlineTier: 3, sellingPos: 'per-angle short caption', iconPos: 'none', composition: '3-4 equal tiles showing front/side/back/detail of SAME product', productRatio: 0.6, bg: 'consistent clean light studio' },
    textSlots: ['headline', 'panels']
  },
  series: {
    id: 'series', name_zh: '系列展示图', name_en: 'Series / SKU Lineup',
    purpose: '多色、多款、多SKU陈列', kit: 'detail', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: true, info_icon: false, size_anno: false },
    ratio: '4:3', size: SIZES.F43, recipe: 'series',
    layout: { titlePos: 'top', headlineTier: 2, sellingPos: 'per-color/sku small label', iconPos: 'none', composition: 'row of same product in different colors/variants', productRatio: 0.55, bg: 'clean light studio' },
    textSlots: ['headline', 'panels']
  },
  ingredients: {
    id: 'ingredients', name_zh: '商品成分图', name_en: 'Ingredients / Materials',
    purpose: '说明产品配方/材质/成分', kit: 'detail', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: true, size_anno: false },
    ratio: '1:1', size: SIZES.SQ, recipe: 'ingredients',
    layout: { titlePos: 'top', headlineTier: 2, sellingPos: 'icons + short ingredient/material labels', iconPos: 'circular ingredient badges', composition: 'product center, ingredient/material badges around', productRatio: 0.4, bg: 'clean minimal light' },
    textSlots: ['headline', 'icons']
  },
  usage_guide: {
    id: 'usage_guide', name_zh: '使用建议图', name_en: 'Usage Guide',
    purpose: '商品用法与注意事项', kit: 'detail', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: true, info_icon: true, size_anno: false },
    ratio: '4:3', size: SIZES.F43, recipe: 'usage_guide',
    layout: { titlePos: 'top', headlineTier: 2, sellingPos: 'numbered step tiles', iconPos: 'numbered step icons', composition: '3-4 horizontal step tiles with arrows', productRatio: 0.45, bg: 'clean light instructional' },
    textSlots: ['headline', 'panels', 'icons']
  },
  accessories: {
    id: 'accessories', name_zh: '配件/赠品图', name_en: 'What is Included',
    purpose: '清晰展示包装清单', kit: 'detail', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '1:1', size: SIZES.SQ, recipe: 'accessories',
    layout: { titlePos: 'top', headlineTier: 2, sellingPos: 'flat-lay of items + short checklist labels', iconPos: 'none', composition: 'flat lay of product and included accessories on clean surface', productRatio: 0.5, bg: 'clean light flat surface' },
    textSlots: ['headline', 'callouts']
  },
  after_sales: {
    id: 'after_sales', name_zh: '售后保障图', name_en: 'After-Sales Assurance',
    purpose: '说明质保退换政策', kit: 'detail', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: true, size_anno: false },
    ratio: '4:3', size: SIZES.F43, recipe: 'after_sales',
    layout: { titlePos: 'top', headlineTier: 2, sellingPos: 'assurance icons + short policy lines', iconPos: 'row of shield/return/warranty badges', composition: 'clean trust-banner with icon row', productRatio: 0.25, bg: 'clean trust blue/light' },
    textSlots: ['headline', 'subheadline', 'icons']
  },
  mood: {
    id: 'mood', name_zh: '氛围渲染图', name_en: 'Brand Mood',
    purpose: '传达品牌价值', kit: 'detail', track: 'b',
    flags: { real_scene: true, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '16:9', size: SIZES.W169, recipe: 'mood',
    layout: { titlePos: 'lower area', headlineTier: 2, sellingPos: 'one short brand line', iconPos: 'none', composition: 'cinematic atmospheric scene, product small within', productRatio: 0.35, bg: 'emotional cinematic environment' },
    textSlots: ['headline']
  },

  /* ============ 0.3 服装套图 fashion（12）============ */
  f_model: {
    id: 'f_model', name_zh: '模特图', name_en: 'Model on-body',
    purpose: '真人穿着/使用代入感', kit: 'fashion', track: 'b',
    flags: { real_scene: true, real_model: true, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '3:4', size: SIZES.PORTRAIT, recipe: 'model',
    layout: { titlePos: 'none', headlineTier: 0, sellingPos: 'none', iconPos: 'none', composition: 'real model wearing the garment, full/half body, natural pose', productRatio: 0.5, bg: 'real lifestyle street/studio' },
    textSlots: []
  },
  f_white: {
    id: 'f_white', name_zh: '白底图', name_en: 'White Base',
    purpose: '纯白底商品展示', kit: 'fashion', track: 'a',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '1:1', size: SIZES.SQ, recipe: 'white_bg',
    layout: { titlePos: 'none', headlineTier: 0, sellingPos: 'none', iconPos: 'none', composition: 'garment flat/hanging centered', productRatio: 0.65, bg: 'pure white' },
    textSlots: []
  },
  f_search: {
    id: 'f_search', name_zh: '搜索主图', name_en: 'Fashion Search Main',
    purpose: '搜索点击率', kit: 'fashion', track: 'a',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '1:1', size: SIZES.SQ, recipe: 'search_main',
    layout: { titlePos: 'bottom strip', headlineTier: 2, sellingPos: 'one short benefit line', iconPos: 'none', composition: 'garment on simple bg, short benefit line', productRatio: 0.6, bg: 'clean light gradient' },
    textSlots: ['headline']
  },
  f_selling: {
    id: 'f_selling', name_zh: '卖点图', name_en: 'Fashion Selling Point',
    purpose: '突出面料/版型卖点', kit: 'fashion', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: true, size_anno: false },
    ratio: '4:3', size: SIZES.F43, recipe: 'core_selling',
    layout: { titlePos: 'top', headlineTier: 1, sellingPos: 'headline + icon badges', iconPos: 'right vertical circular badges', composition: 'garment left, icon badges right', productRatio: 0.5, bg: 'clean minimal' },
    textSlots: ['headline', 'icons']
  },
  f_icon: {
    id: 'f_icon', name_zh: '图标卖点图', name_en: 'Fashion Icon Selling',
    purpose: '卖点图形化', kit: 'fashion', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: true, size_anno: false },
    ratio: '1:1', size: SIZES.SQ, recipe: 'icon_grid',
    layout: { titlePos: 'top', headlineTier: 2, sellingPos: 'icon grid', iconPos: 'grid of badges', composition: 'garment center, icons around', productRatio: 0.4, bg: 'clean light' },
    textSlots: ['headline', 'icons']
  },
  f_detail: {
    id: 'f_detail', name_zh: '细节图', name_en: 'Garment Detail',
    purpose: '缝线/工艺细节特写', kit: 'fashion', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '1:1', size: SIZES.SQ, recipe: 'detail',
    layout: { titlePos: 'none', headlineTier: 0, sellingPos: 'leader callouts', iconPos: 'none', composition: 'macro of stitching/cuff/collar', productRatio: 0.8, bg: 'soft fabric defocus' },
    textSlots: ['callouts']
  },
  f_fabric: {
    id: 'f_fabric', name_zh: '面料质感图', name_en: 'Fabric Texture',
    purpose: '面料质感与垂坠', kit: 'fashion', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '1:1', size: SIZES.SQ, recipe: 'material',
    layout: { titlePos: 'bottom', headlineTier: 3, sellingPos: 'short fabric caption', iconPos: 'none', composition: 'macro of fabric weave/drape', productRatio: 0.8, bg: 'soft neutral' },
    textSlots: ['headline']
  },
  f_angle: {
    id: 'f_angle', name_zh: '多角度视图', name_en: 'Fashion Multi-Angle',
    purpose: '正/背/侧多角度', kit: 'fashion', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: true, info_icon: false, size_anno: false },
    ratio: '4:3', size: SIZES.F43, recipe: 'multi_angle',
    layout: { titlePos: 'top', headlineTier: 3, sellingPos: 'per-angle caption', iconPos: 'none', composition: 'tiles front/side/back of SAME garment', productRatio: 0.6, bg: 'consistent clean' },
    textSlots: ['headline', 'panels']
  },
  f_seeding: {
    id: 'f_seeding', name_zh: '种草图', name_en: 'Lifestyle Seeding',
    purpose: '种草、生活方式代入', kit: 'fashion', track: 'b',
    flags: { real_scene: true, real_model: false, multi_panel: false, info_icon: false, size_anno: false },
    ratio: '3:4', size: SIZES.PORTRAIT, recipe: 'seeding',
    layout: { titlePos: 'none/light', headlineTier: 0, sellingPos: 'none', iconPos: 'none', composition: 'garment styled in a real lifestyle scene, UGC feel', productRatio: 0.5, bg: 'real cafe/street/home daylight' },
    textSlots: []
  },
  f_scene: {
    id: 'f_scene', name_zh: '多场景图', name_en: 'Fashion Multi-Scene',
    purpose: '一图多穿搭场景', kit: 'fashion', track: 'b',
    flags: { real_scene: true, real_model: false, multi_panel: true, info_icon: false, size_anno: false },
    ratio: '3:4', size: SIZES.PORTRAIT, recipe: 'multi_scene',
    layout: { titlePos: 'top', headlineTier: 2, sellingPos: 'total headline + per-panel caption', iconPos: 'none', composition: 'vertical stack of 2-3 scene panels', productRatio: 0.5, bg: 'real scenes' },
    textSlots: ['headline', 'panels']
  },
  f_series: {
    id: 'f_series', name_zh: '系列展示图', name_en: 'Fashion Series',
    purpose: '多色/多款陈列', kit: 'fashion', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: true, info_icon: false, size_anno: false },
    ratio: '4:3', size: SIZES.F43, recipe: 'series',
    layout: { titlePos: 'top', headlineTier: 2, sellingPos: 'per-color label', iconPos: 'none', composition: 'same garment in multiple colors in a row', productRatio: 0.55, bg: 'clean light' },
    textSlots: ['headline', 'panels']
  },
  f_size: {
    id: 'f_size', name_zh: '尺码图', name_en: 'Size Chart',
    purpose: '标明尺码', kit: 'fashion', track: 'b',
    flags: { real_scene: false, real_model: false, multi_panel: false, info_icon: false, size_anno: true },
    ratio: '1:1', size: SIZES.SQ, recipe: 'size_chart',
    layout: { titlePos: 'top', headlineTier: 2, sellingPos: 'size measurement table + garment diagram', iconPos: 'none', composition: 'flat garment with measurement lines + size table', productRatio: 0.45, bg: 'clean white' },
    textSlots: ['headline', 'bullets']
  }
};

/** 推荐默认图种集合（selected_types 为空时使用） */
export const RECOMMENDED = {
  ecom: ['white_main', 'core_selling', 'selling_point', 'material', 'scene_show', 'multi_scene'],
  fashion: ['f_white', 'f_search', 'f_model', 'f_selling', 'f_detail', 'f_seeding']
};

export function getImageType(id) {
  return IMAGE_TYPES[id] || null;
}

/** 校验 type 合法性，并回显模板的 ratio/size（允许请求覆盖 size，但受白名单约束） */
export function resolveTypePlan(id, sizeOverride) {
  const t = getImageType(id);
  if (!t) return null;
  let size = t.size;
  if (sizeOverride && typeof sizeOverride === 'string' && /^\d{3,5}x\d{3,5}$/.test(sizeOverride)) {
    size = sizeOverride; // 详情/A+ 可按规格传入；引擎会在上游校验最小像素
  }
  return { type: t, ratio: t.ratio, size };
}

export function listTypeIds() { return Object.keys(IMAGE_TYPES); }
