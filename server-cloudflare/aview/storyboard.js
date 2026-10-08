/* =====================================================================
 * WorkHogee · 阿视分镜生成器 aview/storyboard.js（根因级）
 * ---------------------------------------------------------------------
 * 输入：已构建好的统一上下文 mctx + 阿文文案 copy。
 * 输出：图文成片镜头数组 shots，驱动 video-composer 的「静帧+Ken Burns+TTS+烧字幕」。
 *
 * 爆款短视频结构（抖音 / TikTok 同一骨架，按语种切换文案与 CTA）：
 *   shot[0]  role=hook    前3秒钩子（=阿文 title，痛点/反转/福利，不铺垫）
 *   shot[1..] role=selling 卖点节奏（=阿文 body 按句拆成 2~4 个卖点镜头）
 *   shot[最后] role=cta   收尾动作引导（=body 尾句动作指令；缺失则补平台标准 CTA）
 *
 * 成本红线：本文件为纯规则编排，0 LLM 调用、0 计费；只把阿文已写好的口播
 * 文案按句拆镜、动态分配商品静帧与 Ken Burns 运镜。事实（品牌/型号/价格/卖点）
 * 一律取自 mctx.factsBrief，不退回万能模板、不编造。
 *
 * 导出：
 *   buildStoryboard(mctx, copy, opts)
 *     @param {object} mctx  buildMerchantContext 产物（factsBrief/language/category/...）
 *     @param {object|string} copy 阿文文案：{douyin:{title,body},tiktok:{title,body}} 或纯字符串
 *     @param {object} opts  {platform:'douyin'|'tiktok', images:[url|dataURL], maxShots, wordsPerShot}
 *   pickPlatformCopy(mctx, copy, platform) — 取平台对应口播文案
 *   splitNarration(text) — 按句拆分口播
 * ===================================================================*/

// Ken Burns 运镜轮换（避免模板化空镜的关键：每镜运动方向不同）
const KEN_BURNS_CYCLE = ['zoomIn', 'zoomOut', 'panRight', 'panLeft', 'zoomInSlow', 'zoomOutSlow'];

// 平台标准 CTA（当阿文 body 尾句不是明确动作指令时补一句；属结构性引导，不涉及商品事实编造）
const FALLBACK_CTA = {
  'zh-CN': '想要的，点左下角小黄车，现在下单更划算。',
  en: 'Tap the link in my bio to grab yours before it sells out.',
};

// 判断一句是否已含动作指令
const CTA_RE = {
  'zh-CN': /(小黄车|左下角|点击|下单|抢购|扣1|评论区|关注|橱窗|链接|入手)/,
  en: /(link in bio|tap|click|follow|comment|shop|buy|grab|order|check out|cart)/i,
};

/** 取平台对应口播文案 {title, body}。兼容 copy 为字符串 / {douyin,tiktok} / {cps:{...}}。 */
export function pickPlatformCopy(mctx, copy, platform) {
  const isEn = platform === 'tiktok' || (mctx && mctx.language && mctx.language.code === 'en');
  const plat = isEn ? 'tiktok' : 'douyin';
  let c = copy;
  if (typeof c === 'string') return { title: '', body: c, platform: plat };
  // copy.cps = {douyin, tiktok, xhs,...} 形式
  if (c && c.cps) c = c.cps;
  if (c && typeof c === 'object') {
    const chosen = c[plat] || c.douyin || c.tiktok || c.general || '';
    if (chosen && typeof chosen === 'object') {
      return { title: chosen.title || '', body: chosen.body || chosen.text || '', platform: plat, hashtags: chosen.hashtags || '' };
    }
    if (typeof chosen === 'string') return { title: '', body: chosen, platform: plat };
  }
  return { title: '', body: '', platform: plat };
}

/** 按句拆分口播（中英文句读）。保留原文，不做改写。 */
export function splitNarration(text) {
  if (!text) return [];
  // 去掉 hashtag / 多余空白
  let t = String(text).replace(/#\S+/g, ' ').replace(/\s+/g, ' ').trim();
  // 中英文句读切分（含英文句点 .）
  const parts = t.split(/(?<=[。！？!?；;.])\s*/).map(s => s.trim())
    // 过滤空句 / 纯标点句（避免 title 尾部句号重复拼接产生的孤立标点）
    .filter(s => s && !/^[。！？!?；;\s.]+$/.test(s));
  return parts;
}

/** 估算一句口播的念读时长（秒）：中文 ~4.2 字/秒，英文 ~2.6 词/秒。用于节奏校验。 */
export function estimateSpeakSec(sentence, isEn) {
  if (isEn) {
    const words = sentence.split(/\s+/).filter(Boolean).length;
    return words / 2.6;
  }
  return sentence.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').length / 4.2;
}

/**
 * 主入口。
 * @returns {{ok:boolean, platform:string, language:string, shots:Array, meta:object}}
 *   shots[i] = {idx, role:'hook'|'selling'|'cta', narration, image, imageIndex,
 *               kenBurns, onScreenText, estSec}
 */
export function buildStoryboard(mctx = {}, copy, opts = {}) {
  const platform = opts.platform || (mctx.language && mctx.language.code === 'en' ? 'tiktok' : 'douyin');
  const isEn = platform === 'tiktok' || (mctx.language && mctx.language.code === 'en');
  const langCode = isEn ? 'en' : 'zh-CN';
  const images = (opts.images || []).slice();
  if (!images.length) {
    return { ok: false, error: { code: 'bad_images', message: 'buildStoryboard: 至少需要1张商品图(images)' }, platform, language: langCode, shots: [] };
  }
  const maxShots = opts.maxShots || 6;

  const pc = pickPlatformCopy(mctx, copy, platform);
  // title 与 body 分别按句拆，避免尾部句号重复拼接产生孤立标点
  const titleSentences = splitNarration(pc.title);
  const bodySentences = splitNarration(pc.body);

  // ---- 结构装配：第1镜=钩子；中间=卖点；末镜=CTA ----
  // 1) 钩子镜：优先用阿文 title（它本身就是为3秒钩子设计的）；title 为空则用 body 第一句
  let hookText = titleSentences[0] || bodySentences[0] || '';
  const restSentences = titleSentences[0]
    ? bodySentences                       // 有 title：钩子已占 title，卖点只取 body
    : bodySentences.slice(1);             // 无 title：body 第一句升为钩子，卖点取 body 余下

  const rawShots = [];
  rawShots.push({ role: 'hook', text: hookText });

  // 2) 卖点镜：把剩余句子按目标时长聚合（每镜约 5~7 秒念读），控制总镜数
  let bucket = '';
  const bucketSecMax = 6.5; // 每镜念读秒数上限（秒，非字数）
  const flush = () => { if (bucket.trim()) { rawShots.push({ role: 'selling', text: bucket.trim() }); bucket = ''; } };
  for (const s of restSentences) {
    const cand = bucket ? bucket + (isEn ? ' ' : '') + s : s;
    if (bucket && estimateSpeakSec(cand, isEn) > bucketSecMax) {
      flush();       // 把旧 bucket 落成一镜
      bucket = s;    // 新桶从当前句起
    } else {
      bucket = cand; // 继续累积
    }
  }
  flush();

  // 3) CTA 镜：若最后一个 selling 镜已含动作指令，则把它升级为 cta；否则补一条标准 CTA
  const last = rawShots[rawShots.length - 1];
  if (last && last.role === 'selling' && CTA_RE[langCode].test(last.text)) {
    last.role = 'cta';
  } else if (!(last && last.role === 'cta')) {
    rawShots.push({ role: 'cta', text: FALLBACK_CTA[langCode] });
  }

  // 控制总镜数（超了就把中段 selling 合并）
  let shots = rawShots.slice(0, maxShots);

  // ---- 动态分配商品静帧 + Ken Burns 运镜 ----
  // hook/cta 用主图 images[0] 建立品牌锚点；selling 镜依次轮询 images，key_parts 特写优先
  const out = shots.map((s, i) => {
    let imageIndex;
    if (s.role === 'hook' || s.role === 'cta') imageIndex = 0;
    else imageIndex = 1 + ((i - 1) % Math.max(1, images.length - 1));
    imageIndex = Math.min(imageIndex, images.length - 1);
    const kb = KEN_BURNS_CYCLE[i % KEN_BURNS_CYCLE.length];
    // hook 镜加屏显大字（强调钩子，增强前3秒停留）
    const onScreenText = (s.role === 'hook') ? hookText : '';
    return {
      idx: i,
      role: s.role,
      narration: s.text,
      image: images[imageIndex],
      imageIndex,
      kenBurns: kb,
      onScreenText,
      estSec: +estimateSpeakSec(s.text, isEn).toFixed(2),
    };
  });

  return {
    ok: true,
    platform,
    language: langCode,
    brand: mctx.brand || '',
    category: mctx.category || { zh: '', en: '' },
    shots: out,
    meta: {
      totalShots: out.length,
      hook: out[0]?.narration || '',
      cta: out[out.length - 1]?.narration || '',
      hasHook: out[0]?.role === 'hook',
      hasCta: out[out.length - 1]?.role === 'cta',
      estTotalSec: +out.reduce((a, s) => a + s.estSec, 0).toFixed(1),
    },
  };
}

export default { buildStoryboard, pickPlatformCopy, splitNarration, estimateSpeakSec };
