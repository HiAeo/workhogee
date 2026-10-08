/* =====================================================================
 * 平台/站点/语种/比例/套餐 映射服务（声明式，逐字对齐 zuotang-full-spec.facts.json）
 * 纯数据 + 纯函数，无浏览器/网络依赖，可在 worker 与前端复用。
 * 核心：平台→国家→语种→比例→scene套餐 在字典里锁死，LLM 不自由发挥。
 * ===================================================================*/

// 19 平台 → 默认国家/语种/主比例/默认 scene 套餐
export const PLATFORM_MAP = {
  amazon:      { country: 'US',     lang: 'en', ratio: '3:4', scenes: 'tf_overseas' },
  shein:       { country: 'US',     lang: 'en', ratio: '3:4', scenes: 'tf_overseas' },
  mercado:     { country: 'BR',     lang: 'pt', ratio: '3:4', scenes: 'tf_overseas' },
  walmart:     { country: 'US',     lang: 'en', ratio: '3:4', scenes: 'tf_overseas' },
  wayfair:     { country: 'US',     lang: 'en', ratio: '3:4', scenes: 'tf_overseas' },
  coupang:     { country: 'KR',     lang: 'ko', ratio: '3:4', scenes: 'tf_overseas' },
  shopee:      { country: 'WX_DNY', lang: 'en', ratio: '3:4', scenes: 'tf_overseas' },
  temu:        { country: 'US',     lang: 'en', ratio: '3:4', scenes: 'tf_overseas' },
  ali:         { country: 'US',     lang: 'en', ratio: '3:4', scenes: 'tf_overseas' }, // AliExpress 美国
  aliexpress:  { country: 'RU',     lang: 'ru', ratio: '3:4', scenes: 'tf_overseas' }, // AliExpress 俄
  lazada:      { country: 'WX_DNY', lang: 'en', ratio: '3:4', scenes: 'tf_overseas' },
  tiktok:      { country: 'US',     lang: 'en', ratio: '3:4', scenes: 'tf_overseas' },
  ozon:        { country: 'RU',     lang: 'ru', ratio: '3:4', scenes: 'tf_overseas' },
  kuaishou:    { country: 'CN',     lang: 'zh', ratio: '3:4', scenes: 'af_domestic' },
  xiaohongshu: { country: 'CN',     lang: 'zh', ratio: '3:4', scenes: 'af_domestic' },
  taobao:      { country: 'CN',     lang: 'zh', ratio: '3:4', scenes: 'af_domestic', special: 'taobao_fallback_ali' },
  pdd:         { country: 'CN',     lang: 'zh', ratio: '3:4', scenes: 'af_domestic' },
  jd:          { country: 'CN',     lang: 'zh', ratio: '3:4', scenes: 'af_domestic' },
  douyin:      { country: 'CN',     lang: 'zh', ratio: '3:4', scenes: 'af_domestic' }
};

// 默认套餐（逐字）
export const SCENE_PACKS = {
  tf_overseas: ['white', 'model', 'model', 'atmosphere', 'atmosphere', 'atmosphere', 'atmosphere', 'detail'],
  af_domestic: ['model', 'model', 'model', 'atmosphere', 'atmosphere', 'atmosphere', 'atmosphere', 'detail'],
  clothing:    ['model', 'atmosphere', 'detail', 'white', 'feature', 'highlights', 'materials', 'angles', 'poster', 'scenes', 'collection', 'dimensions']
};

// scene 文字规则
export const SCENE_TEXT_RULES = {
  noTextScenes: ['model', 'atmosphere', 'white'],
  alwaysTextScenes: ['dimensions']
};

// 每类 scene 张数上限
export const MAX_IMAGES_PER_SCENE = 4;

// 比例池
export const RATIO_POOL_DEFAULT = ['1:1', '3:4', '4:3', '9:16', '16:9', '21:9', '2:3', '3:2', '4:5', '5:4'];
export const RATIO_POOL_AMAZON = ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9', '2:3', '3:2', '4:5', '5:4'];

// 语种→国家 反查
export const LANG_TO_COUNTRY = {
  en: 'US', zh: 'CN', de: 'DE', fr: 'FR', es: 'ES', pt: 'PT', jp: 'JP', tw: 'TW',
  it: 'IT', vn: 'VN', id: 'ID', th: 'TH', ru: 'RU', ar: 'AE', kr: 'KR', dk: 'DK',
  se: 'SE', nl: 'NL', fi: 'FI', no: 'NO', tr: 'TR', pl: 'PL', hu: 'HU', cz: 'CZ', gr: 'GR'
};

// 我们内部使用的语种 code 归一（zh/zh-CN 等价；da=无文字）
export function normLang(lang) {
  const l = String(lang || '').toLowerCase();
  if (l === 'auto' || l === '') return 'auto';
  if (l === 'zh' || l === 'zh-cn' || l === 'cn') return 'zh';
  if (l === 'da' || l === 'none' || l === 'notext') return 'da';
  return l;
}

/**
 * 解析会话上下文。
 * @param {object} sel {platform, country, lang}
 *   - lang='auto' 时按平台默认/国家联动；用户手动改 lang 后传入则覆盖。
 * @returns {{platform, country, lang, ratio, scenes, packName, noText}}
 */
export function resolvePlatformContext(sel = {}) {
  let platform = sel.platform || 'amazon';
  let base = PLATFORM_MAP[platform] || PLATFORM_MAP.amazon;
  let country = sel.country || base.country;
  let lang = normLang(sel.lang);

  // taobao 特例：taobao 但非中文语境 → 回退 ali(US/en)
  if (platform === 'taobao' && lang !== 'auto' && lang !== 'zh') {
    base = PLATFORM_MAP.ali; country = base.country;
  }
  if (platform === 'taobao' && lang === 'auto') lang = base.lang;

  // lang=auto → 用平台默认；再按国家反查兜底
  if (lang === 'auto') lang = base.lang || LANG_TO_COUNTRY[country] || 'en';
  // 国家未给但有 lang → 反查
  if (!country || country === 'WX_DNY') {
    if (country !== 'WX_DNY') country = LANG_TO_COUNTRY[lang] || base.country;
  }

  const noText = (lang === 'da');
  return {
    platform, country, lang,
    ratio: sel.ratio || base.ratio,
    scenes: base.scenes,
    packName: base.scenes,
    noText
  };
}

// 该平台是否解锁高级 A+ 比例（高端模型档 + amazon/walmart）
export function aplusRatios(platform, highEndModel) {
  if (!highEndModel) return [];
  if (platform === 'amazon') return ['1464:600', '600:450'];
  if (platform === 'walmart') return ['970:600'];
  return [];
}
