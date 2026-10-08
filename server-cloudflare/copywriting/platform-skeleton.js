/* =====================================================================
 * platform-skeleton.js —— 九大平台真实爆款骨架（2025-2026 实操调研沉淀）
 * ---------------------------------------------------------------------
 * 每个平台不是"套同一个小作文"，而是一套可被质检门判定的真实打法：
 *   标题公式 / 开头钩子 / 正文结构 / emoji 预算 / 标签数 / 字数 / CTA / 语气。
 * 调研依据（节选，engine 不依赖此处注释，只依赖下面字段）：
 *   · 小红书：标题≤20字、前10字必须勾人；痛点+方案+效果 / 数字清单 /
 *     before→after 反差 / 悬念提问 / 避坑；正文300-500字、分点🔹▪️✅、
 *     结尾提问求收藏；emoji 5-8 种、话题 5-10 个。
 *   · 抖音：黄金3秒钩子（痛点直击/价格反差/经验避坑/智商税反转/
 *     "有没有跟我一样"/"不会还有人在…"）；描述50-200字；口语家人们；
 *     明确 CTA（点小黄车/评论区）；话题 3-5 个。
 *   · 朋友圈：无标题、第一人称"我"、生活感>卖货感、≤150字、无话题、
 *     弱 CTA（想要私我）、克制不刷屏。
 *   · 公众号：标题13-22字（数字/利益/疑问/对比/痛点型）、正文800-1500字、
 *     小编专业视角、小标题分段、零 emoji、零话题、结尾引导在看/转发。
 *   · 淘宝：商品标题≈30汉字（品牌+核心词+属性+卖点+营销词）；详情结构=
 *     首屏主标题+副标题→痛点→解决方案→核心卖点（特征+痛点+好处）→
 *     使用场景→对比优势→信任背书→规格参数→售后；主图单点穿透≤10字。
 *   · 京东：比淘宝更理性参数党，标题=品牌+品名+型号+规格；详情强调
 *     参数表、正品保障、京东物流/售后，语气克制可信。
 *   · Instagram：首屏125字符前必须 hook（提问/痛点/反直觉/数字，
 *     禁止以产品名开场）；正文 125-300 词；BAB/PAS 结构；3-5 个标签；
 *     CTA: Save / Tag a friend / link in bio。
 *   · TikTok：caption ≤150 字符；contrarian hook（"Stop buying X"）/
 *     before-after / FOMO；3-5 标签（broad+niche+branded）；
 *     CTA: link in bio / follow / comment a word。
 *   · Amazon listing：Title ≤200 字符（建议<80 移动端），Brand+核心词+
 *     属性+场景，Title Case（短介词/连词/冠词不大写），数字用阿拉伯，
 *     禁止 Best Seller/Free Shipping 等促销词；5 条 bullet，
 *     "利益点：特征解释"句式片段、无结尾标点、分号连接、10-255字符；
 *     Description 3-5 段品牌故事+使用场景+细节。
 *
 * 注意：本文件只放"打法骨架"，具体商品事实一律来自 mctx.factsBrief，
 *      严禁在此写死任何品牌/型号/价格。
 * ===================================================================*/

export const PLATFORMS = {
  /* ---------------- 小红书 ---------------- */
  xiaohongshu: {
    key: 'xiaohongshu',
    label: '小红书',
    lang: 'zh-CN',
    fields: ['title', 'body', 'hashtags'],
    titleMax: 20,
    titleMin: 8,
    bodyLen: [280, 560],          // 字
    emojiBudget: 8,               // 不同 emoji 种数
    hashtagCount: [5, 10],
    noHashtag: false,
    titleFormulas: [
      '痛点直击 + 解决方案 + 效果（例：毛孔粗大？这瓶精华让我素颜也能出门）',
      '数字清单型（例：通勤包别乱买，这3个细节才是关键）',
      'before→after 反差（例：从月薪3k到…｜我的真实变化）',
      '悬念提问（例：为什么懂行的人都在偷偷用它？）',
      '避坑警告（例：买XX前没人告诉你的3件事）'
    ],
    hook: '开头第1-2句必须是"我"的真实使用场景/痛点共鸣，禁止一上来报参数',
    structure: [
      '第1段：场景/痛点共鸣（我…最近真的被…戳到）',
      '第2段：分点讲 2-4 个真实体验点，每点配一个 emoji（🔹▪️✅❌ 轮流）',
      '第3段：一句不完美的大实话增信（不吹不黑，它…）',
      '结尾：向"姐妹们"提问 + 引导收藏关注'
    ],
    tone: '闺蜜/同龄人第二人称，真诚种草，可带"亲测/踩雷/回购/交作业"',
    cta: '结尾开放式提问 + "先收藏"，不硬甩购买链接',
    banned: ['震惊！', '必看！', '转发抽奖'],
    aspect: '3:4 竖图',
    fingerprint: '分点emoji + 口语姐妹体 + 结尾求收藏',
  },

  /* ---------------- 抖音 ---------------- */
  douyin: {
    key: 'douyin',
    label: '抖音',
    lang: 'zh-CN',
    fields: ['title', 'body', 'hashtags'],
    titleMax: 30,                 // 视频标题/口播钩子
    titleMin: 6,
    bodyLen: [60, 200],           // 视频描述
    emojiBudget: 3,
    hashtagCount: [3, 5],
    noHashtag: false,
    titleFormulas: [
      '黄金3秒痛点钩子（例：家里XX怎么擦都擦不干净的，先别划走）',
      '价格反差（例：我老公说我败家，他是不知道现在活动有多狠）',
      '经验避坑（例：用了5年，这个坑你一定听我劝）',
      '智商税反转（例：我以为又买了个智商税，没想到真行）',
      '扎心共情（例：有没有跟我一样一到冬天就…的？）'
    ],
    hook: '口播第一句必须在3秒内抛出痛点/反转/福利，不要铺垫',
    structure: [
      '标题=3秒钩子本身（一句话）',
      '正文=钩子之后的口播文案简写：痛点→产品怎么解决→效果对比→到手价理由',
      '最后一句必须是明确动作指令'
    ],
    tone: '口语、快节奏、情绪足，可"家人们/兄弟们"，禁止书面腔',
    cta: '明确动作：点左下角小黄车 / 评论区扣1 / 关注看下集',
    aspect: '9:16 竖屏视频',
    fingerprint: '强口语钩子 + 价格/福利理由 + 动作指令',
  },

  /* ---------------- 朋友圈 ---------------- */
  wechat_moments: {
    key: 'wechat_moments',
    label: '微信朋友圈',
    lang: 'zh-CN',
    fields: ['body'],
    titleMax: 0,
    bodyLen: [40, 150],
    emojiBudget: 2,
    hashtagCount: [0, 0],
    noHashtag: true,
    titleFormulas: [],
    hook: '第一人称"我"，像随手发的生活碎片，不是广告',
    structure: [
      '第1句：今天/刚刚发生的一个生活小场景',
      '中间：自然带出产品用着的真实感受（1-2个细节即可）',
      '结尾：克制的弱邀约，不刷屏不逼单'
    ],
    tone: '熟人语境、克制有温度，生活感>卖货感',
    cta: '弱 CTA："喜欢的私我"/"评论区问"，不出现"点击购买/限时抢购"',
    aspect: '1:1 或 3:4 实拍图',
    fingerprint: '第一人称生活碎片、无标题、无话题、弱CTA',
  },

  /* ---------------- 公众号 ---------------- */
  wechat_official: {
    key: 'wechat_official',
    label: '微信公众号',
    lang: 'zh-CN',
    fields: ['title', 'body'],
    titleMax: 22,
    titleMin: 12,
    bodyLen: [800, 1500],
    emojiBudget: 0,
    hashtagCount: [0, 0],
    noHashtag: true,
    titleFormulas: [
      '数字型（例：关于XX，我们整理了这5个细节）',
      '疑问型（例：为什么有人用XX总是踩坑？）',
      '对比型（例：同样买XX，懂行的人先看这几点）',
      '痛点型（例：XX总出问题？大概率是你忽略了这件事）'
    ],
    hook: '标题一眼懂、不标题党；正文开头用一个读者真实疑问/现象切入',
    structure: [
      '开头：提出读者普遍遇到的一个问题',
      '正文：3-5个小节，每节一个小标题（黑体短句），先讲原理/选购逻辑再落到产品',
      '结尾：总结选购建议 + 引导留言/在看/关注'
    ],
    tone: '专业、可信、小编/主理人视角，不撒娇不网络热梗',
    cta: '引导留言交流 / 点在看 / 关注，不出现价格轰炸',
    aspect: '头图 2.35:1，正文配图 16:9',
    fingerprint: '长文分段小标题、零emoji零话题、专业教育感',
  },

  /* ---------------- 淘宝/天猫 ---------------- */
  taobao: {
    key: 'taobao',
    label: '淘宝/天猫',
    lang: 'zh-CN',
    fields: ['title', 'subtitle', 'selling_points', 'detail', 'hashtags'],
    titleMax: 30,                 // 商品标题≈30汉字（60字符内）
    titleMin: 12,
    bodyLen: [300, 700],
    emojiBudget: 2,
    hashtagCount: [0, 0],
    noHashtag: true,
    titleFormulas: [
      '品牌 + 品类核心词 + 关键属性/型号 + 1个差异化卖点词（例：XX牌 便携保温杯 316不锈钢 长效保温 车载户外）'
    ],
    hook: '主图/首屏只打一个最强卖点，数字比形容词有力（例："12小时锁温"）',
    structure: [
      'title：搜索商品标题（30字内，埋核心搜索词）',
      'subtitle：首屏副标题一句话（≤12字，最强卖点）',
      'selling_points：3-5条短卖点，每条=特征+痛点+好处，不堆砌',
      'detail：详情页正文，按 痛点→解决方案→核心卖点→使用场景→信任背书→规格→售后 顺序'
    ],
    tone: '专业有转化力、卖点清晰，低价品可直接，高端品克制',
    cta: '规格/售后/购买引导自然收尾，不极限词',
    aspect: '1:1 主图 + 详情长图',
    fingerprint: '30字搜索标题 + 卖点分条 + 详情页结构',
  },

  /* ---------------- 京东 ---------------- */
  jd: {
    key: 'jd',
    label: '京东',
    lang: 'zh-CN',
    fields: ['title', 'selling_points', 'detail'],
    titleMax: 30,
    titleMin: 12,
    bodyLen: [300, 600],
    emojiBudget: 0,
    hashtagCount: [0, 0],
    noHashtag: true,
    titleFormulas: [
      '品牌 + 品名 + 型号/规格（例：XX 便携保温杯 500ml 316不锈钢 曜石黑）'
    ],
    hook: '理性参数党：把最硬的参数/认证放在最前面',
    structure: [
      'title：品牌+品名+型号+规格，搜索导向',
      'selling_points：3-5条，每条先参数后好处（例：316不锈钢内胆——装热水无异味）',
      'detail：参数表 + 使用场景 + 正品/售后保障，语气克制可信'
    ],
    tone: '理性、克制、可信，重参数与售后保障，不情绪营销',
    cta: '规格齐全、售后无忧式收尾',
    aspect: '1:1 白底主图 + 参数图',
    fingerprint: '参数前置、零emoji、理性可信',
  },

  /* ---------------- Instagram ---------------- */
  instagram: {
    key: 'instagram',
    label: 'Instagram',
    lang: 'en',
    fields: ['title', 'body', 'hashtags'],
    titleMax: 125,                // caption 第一行（折叠前）
    titleMin: 20,
    bodyLen: [120, 300],          // words
    emojiBudget: 5,
    hashtagCount: [3, 5],
    noHashtag: false,
    titleFormulas: [
      'Hook first line: question / pain point / bold benefit / number — never open with the product name',
      'Before-After-Bridge: "Tired of [pain]? Imagine [result]. Here\'s how."',
      'PAS: problem → agitation → this product is the fix'
    ],
    hook: 'First 125 characters must earn the "more" tap; no product name in the hook',
    structure: [
      'title = hook line (question/pain/bold benefit)',
      'body: 2-4 short paragraphs — the story/specific benefit/social proof',
      'end: one clear CTA'
    ],
    tone: "Second person 'you', polished but human; native English, no translationese",
    cta: 'One clear action: Save this post / Tag a friend who needs it / Link in bio',
    aspect: '4:5 feed or 9:16 Reel',
    fingerprint: 'Hook-first caption, BAB/PAS, 3-5 tags, polished native English',
  },

  /* ---------------- TikTok ---------------- */
  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    lang: 'en',
    fields: ['title', 'body', 'hashtags'],
    titleMax: 150,                // whole caption ~150 chars
    titleMin: 15,
    bodyLen: [40, 150],           // chars (caption short)
    emojiBudget: 3,
    hashtagCount: [3, 5],
    noHashtag: false,
    titleFormulas: [
      'Contrarian: "Stop buying [category] until you see this"',
      'Transformation: "Before [pain], after [result]"',
      'FOMO: "Everyone\'s talking about this [product]"',
      'Curiosity: "Wait till you see what this [thing] actually does"'
    ],
    hook: 'Caption\'s first phrase + on-screen text in first 1-2s must be one unit; punchy',
    structure: [
      'One-line hook',
      '1-2 lines what it does / the difference',
      'CTA + 3-5 hashtags'
    ],
    tone: 'Energetic, fast, Gen-Z native English; no "introducing our product"',
    cta: 'Link in bio / Follow for part 2 / Comment a word',
    aspect: '9:16',
    fingerprint: 'Ultra-short punchy caption, contrarian/FOMO hook, 3-5 tags',
  },

  /* ---------------- Amazon ---------------- */
  amazon: {
    key: 'amazon',
    label: 'Amazon Listing',
    lang: 'en',
    fields: ['title', 'bullets', 'description'],
    titleMax: 200,                // chars; aim <80 for mobile
    titleMin: 30,
    bodyLen: [300, 900],          // description words
    emojiBudget: 0,
    hashtagCount: [0, 0],
    noHashtag: true,
    titleFormulas: [
      'Brand + core product + key attributes + use scene/audience; Title Case; numerals; no promo words'
    ],
    hook: 'First 60-80 chars are what mobile shoppers see — brand + core keyword + key differentiator first',
    structure: [
      'title: Brand + product type + key specs/attributes + scene; Title Case (lowercase the, and, or, for, of, in, on); numerals; NO "Best Seller"/"Free Shipping"',
      'bullets: exactly 5, each "Benefit-focused header: feature explanation", sentence fragments, NO ending period, semicolons inside, 10-255 chars, lead with benefit',
      'description: 3-5 short paragraphs — brand story + use cases + practical details + lifestyle'
    ],
    tone: 'Factual, confident, compliant; native American English; no hype',
    cta: 'No promotional CTA; trust via specs and use cases',
    aspect: '1:1 white-background main image + lifestyle',
    fingerprint: 'Title-Case keyword title + exactly 5 header:benefit bullets + no emoji/tags',
  },
};

export const PLATFORM_KEYS = Object.keys(PLATFORMS);
export const CN_PLATFORMS = PLATFORM_KEYS.filter(k => PLATFORMS[k].lang === 'zh-CN');
export const EN_PLATFORMS = PLATFORM_KEYS.filter(k => PLATFORMS[k].lang === 'en');

/* ---------- 品类切入角度（联网调研的消费者痛点先落到这些角度） ---------- */
export const CATEGORY_ANGLES = {
  '3c数码': ['痛点解决（续航/降噪/延迟）', '参数实测不吹水', '场景党（办公/网课/游戏/通勤）', '开箱细节', '平替性价比'],
  '耳机': ['通勤降噪', '运动防汗防水', '通话清晰', '续航实测', '佩戴舒适'],
  '美妆护肤': ['肤质身份前置（干皮/油皮/敏感肌）', '成分+浓度', '质地肤感', '空瓶记/前后对比', '急救场景', '带一个小缺点增信'],
  '服装': ['身材适配（梨形/小个子/微胖）', '版型修饰细节', '穿搭公式', '面料体感', '真实测评'],
  '鲜花': ['仪式感/氛围感', '送礼场景', '产地直发冷链', '花期养护', '性价比反差'],
  '自行车': ['通勤最后一公里', '4+2生活方式', '配置党（车架/变速/碟刹）', '女生友好（轻量/复古色）'],
  '食品': ['口感/开箱', '干净配料表', '食用场景', '产地工艺', '理性提示（过敏原/保质期）'],
  '家居': ['痛点解决', '颜值改造前后对比', '收纳空间翻倍', '材质安全', '懒人友好'],
};

/* 把 mctx 的品类中文映射到角度表（模糊匹配） */
export function pickAngles(categoryZh = '') {
  const keys = Object.keys(CATEGORY_ANGLES);
  const hit = keys.find(k => categoryZh.includes(k.slice(0, 2)) || k.includes(categoryZh.slice(0, 2)));
  return hit ? CATEGORY_ANGLES[hit] : CATEGORY_ANGLES['家居'];
}

/* ---------- 绝对化/极限词（广告法合规，Q10） ---------- */
export const EXTREME_WORDS = [
  '最好', '最佳', '第一', '顶级', '100%', '百分之百', '永久', '绝无仅有',
  '国家级', '世界级', '万能', '无效退款', '全网最低', '销量冠军', '根治',
  '包治', '史无前例', '万能神器', '永久有效',
  'best seller', '#1', 'number one', 'world\'s best', 'guaranteed',
  'free shipping', '100% satisfaction', 'cheap'
];

export default { PLATFORMS, PLATFORM_KEYS, CN_PLATFORMS, EN_PLATFORMS, CATEGORY_ANGLES, pickAngles, EXTREME_WORDS };
