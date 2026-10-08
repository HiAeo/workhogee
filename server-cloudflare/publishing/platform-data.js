/* =====================================================================
 * 阿发（发布）· 平台规格声明式数据（根因级重做 v1.0）
 * ---------------------------------------------------------------------
 * 唯一事实源。纯数据 + 纯函数，ES module，无浏览器/Node 专有 API，
 * 可在 Cloudflare Worker 与浏览器同跑（前端 afa-studio / harness 复用）。
 *
 * 平台分两类：
 *   social（社交种草）：小红书/抖音/朋友圈/公众号/Instagram/TikTok —— 手机端信息流
 *   ecommerce（电商上架）：京东/淘宝/亚马逊 —— 桌面/移动商品详情页
 *
 * 硬规格数值以平台公开规则为基准；存在实测不确定的项一律在 OPEN_QUESTIONS 标注，
 * 不把"推测值"当官方定论。
 * ===================================================================*/

export const PUBLISH_PLATFORMS = [
  'xiaohongshu', 'douyin', 'wechat_moments', 'wechat_official', 'instagram', 'tiktok',
  'jd', 'taobao', 'amazon'
];

// 平台分组（渲染 / 分包 / 操作清单分流用）
export const PLATFORM_GROUPS = {
  social: ['xiaohongshu', 'douyin', 'wechat_moments', 'wechat_official', 'instagram', 'tiktok'],
  ecommerce: ['jd', 'taobao', 'amazon']
};

// 平台元信息：展示名 / 语种 / 是否电商 / OAuth 一键发布可用性
export const PLATFORM_META = {
  xiaohongshu: { id: 'xiaohongshu', name: '小红书', en: 'Xiaohongshu', lang: 'zh-CN', group: 'social', oauth: false, oauthNote: 'OAuth 一键发布即将开放' },
  douyin:      { id: 'douyin', name: '抖音', en: 'Douyin', lang: 'zh-CN', group: 'social', oauth: false, oauthNote: 'OAuth 一键发布即将开放' },
  wechat_moments:{ id: 'wechat_moments', name: '微信朋友圈', en: 'WeChat Moments', lang: 'zh-CN', group: 'social', oauth: false, oauthNote: '朋友圈为个人信息流，无开放发布接口（手动）' },
  wechat_official:{ id: 'wechat_official', name: '微信公众号', en: 'WeChat Official', lang: 'zh-CN', group: 'social', oauth: false, oauthNote: '草稿箱接口即将开放' },
  instagram:   { id: 'instagram', name: 'Instagram', en: 'Instagram', lang: 'en', group: 'social', oauth: false, oauthNote: 'OAuth 一键发布即将开放' },
  tiktok:      { id: 'tiktok', name: 'TikTok', en: 'TikTok', lang: 'en', group: 'social', oauth: false, oauthNote: 'Content Posting API 即将开放' },
  jd:          { id: 'jd', name: '京东', en: 'JD', lang: 'zh-CN', group: 'ecommerce', oauth: false, oauthNote: '京东宙斯开放平台接口即将开放' },
  taobao:      { id: 'taobao', name: '淘宝', en: 'Taobao', lang: 'zh-CN', group: 'ecommerce', oauth: false, oauthNote: '淘宝开放平台接口即将开放' },
  amazon:      { id: 'amazon', name: '亚马逊', en: 'Amazon US', lang: 'en', group: 'ecommerce', oauth: false, oauthNote: 'Selling Partner API 即将开放' }
};

// 手机外框（社交预览用）
export const MOBILE_FRAME = { width: 390, height: 844, device: 'iPhone 14 逻辑分辨率' };
// 电商商品页桌面视口（JD/淘宝/Amazon 预览用）
export const DESKTOP_FRAME = { width: 1280, height: 900 };

// 各平台「已发布界面」版式区（zones 顺序即渲染顺序）
export const LAYOUT = {
  xiaohongshu: {
    kind: 'social', skin: 'white',
    description: '已发布笔记详情页（竖屏单列，自上而下）',
    zones: ['nav_bar', 'media_carousel', 'title', 'body', 'author_bar', 'interaction_bar', 'comment_preview']
  },
  douyin: {
    kind: 'social', skin: 'dark',
    description: '全屏沉浸式短视频；图集为竖滑卡片',
    zones: ['top_bar', 'video_stage', 'right_rail', 'bottom_block', 'comment_panel']
  },
  wechat_moments: {
    kind: 'social', skin: 'grey',
    description: '好友信息流卡片',
    zones: ['feed_header', 'post_card', 'media_grid', 'engagement_bubble', 'timestamp']
  },
  wechat_official: {
    kind: 'social', skin: 'white',
    description: '图文消息文章页',
    zones: ['cover', 'title_block', 'body', 'account_card', 'comments']
  },
  instagram: {
    kind: 'social', skin: 'white',
    description: 'Feed 白底卡片；Reels 全屏',
    zones: ['post_header', 'media_carousel', 'action_bar', 'likes_line', 'caption', 'timestamp']
  },
  tiktok: {
    kind: 'social', skin: 'dark',
    description: '全屏 9:16 沉浸式短视频流',
    zones: ['top_bar', 'video_stage', 'right_rail', 'bottom_block', 'comment_panel']
  },
  jd: {
    kind: 'ecommerce', skin: 'jd_red',
    description: '京东商品详情页（PC）：主图组/价格/标题/五点卖点/购买栏',
    zones: ['jd_topnav', 'breadcrumb', 'gallery', 'purchase_box', 'title_block', 'bullets', 'service_bar']
  },
  taobao: {
    kind: 'ecommerce', skin: 'taobao_orange',
    description: '淘宝商品详情页（PC）：主图组/价格/标题/SKU/购买栏',
    zones: ['tb_topnav', 'gallery', 'purchase_box', 'title_block', 'sku_bar', 'service_bar']
  },
  amazon: {
    kind: 'ecommerce', skin: 'amazon_white',
    description: 'Amazon US product detail page (desktop): gallery / buy box / title / bullets / description',
    zones: ['amz_topnav', 'breadcrumb', 'gallery', 'buy_box', 'title_block', 'bullets', 'description', 'service_bar']
  }
};

// =====================================================================
// 硬规格（hardSpecs）
// =====================================================================
export const HARD_SPECS = {
  /* ---------- 社交 ---------- */
  xiaohongshu: {
    titleMax: 20, bodyMax: 1000, bodyRecommended: '100-400',
    imageMinCount: 1, imageMaxCount: 18, imageRecommendedCount: '6-9', imageRatio: '3:4', imageRecommendedSize: '1080×1440',
    videoRatio: '9:16', videoSize: '1080×1920', videoMaxSec: 900, videoMaxMB: 500,
    hashtagMax: null, hashtagRecommended: '3-8', foldAfterChars: null, imageMaxMB: 30, formats: ['jpg', 'png', 'webp']
  },
  douyin: {
    titleMax: 500, bodyMax: 500, bodyRecommended: '50-200',
    imageMinCount: 2, imageMaxCount: 9, imageMinResolution: '≥1080×1200',
    videoRatio: '9:16', videoSize: '1080×1920', videoMinResolution: '720p', videoMaxSec: 3600, videoMaxGB: 4,
    hashtagMax: 5, hashtagRecommended: '3-5', foldAfterChars: 30
  },
  wechat_moments: {
    titleMax: null, bodyMax: 1500, bodyRecommended: '≤200',
    imageMaxCount: 20, imageRecommendedSize: '1080×1080', gridThreshold: '≤9九宫格；10-20自动合成视频',
    videoMaxSec: 300, videoMaxMB: 100,
    hashtagMax: 0, hashtagRecommended: '不使用#话题', foldAfterChars: null
  },
  wechat_official: {
    titleMax: 64, authorMax: 8, digestMax: 120, bodyMax: 50000, bodyRecommended: '800-1500',
    coverLarge: '900×383 (2.35:1)', coverSmall: '500×500 (1:1)',
    imageMaxCount: 500, materialImageMaxMB: 10,
    hashtagMax: 0, hashtagRecommended: '无公开话题系统', foldAfterChars: null
  },
  instagram: {
    titleMax: null, bodyMax: 2200, bodyRecommended: '125-300 words',
    feedPortrait: '1080×1350 (4:5)', feedSquare: '1080×1080 (1:1)', feedLandscape: '1080×566 (1.91:1)',
    reelStory: '1080×1920 (9:16)', imageMaxMB: 30, carouselMaxSlides: 20,
    hashtagMax: 30, hashtagRecommended: '10-15', foldAfterChars: 125
  },
  tiktok: {
    titleMax: null, bodyMax: 4000, bodyRecommended: '100-300',
    videoRatio: '9:16', videoSize: '1080×1920', videoMinSize: '540×960', videoMaxSec: 600, videoMaxGB: 4,
    photoModeMaxImages: 35, photoModeTitleMax: 90, photoModeDescMax: 4000, photoModeMaxMB: 20,
    hashtagMax: null, hashtagRecommended: '3-5', foldAfterChars: 100
  },

  /* ---------- 电商：京东 ---------- */
  jd: {
    kind: 'ecommerce', lang: 'zh-CN',
    titleMax: 60, titleRecommended: '20-30 汉字',
    priceRequired: true, priceNote: '京东价（元）必填',
    mainImageMin: 1, mainImageMax: 10, mainImageRatio: '1:1', mainImageRecommendedSize: '800×800（建议1000×1000以支持放大）',
    mainImageWhiteBg: '部分类目首图要求纯白底（RGB 255,255,255），服饰/家电强制',
    videoRatio: '1:1 或 16:9', videoSize: '建议 1080×1080 / 1920×1080', videoMaxSec: 60, videoRecommendedSec: '9-30s', videoMaxMB: 200,
    bulletCount: null, bulletNote: '京东无强制五点，用「规格参数 + 商品详情」承载卖点',
    descriptionMax: 50000,
    formats: ['jpg', 'png'],
    forbiddenNote: '广告法极限词 + 京东禁用词（如"全网最低""国家级"）'
  },

  /* ---------- 电商：淘宝 ---------- */
  taobao: {
    kind: 'ecommerce', lang: 'zh-CN',
    titleMax: 30, titleRecommended: '≤30 汉字（含品牌+品类+核心属性）',
    priceRequired: true, priceNote: '一口价/sku 价必填',
    mainImageMin: 1, mainImageMax: 5, mainImageRatio: '1:1', mainImageRecommendedSize: '800×800',
    mainImageVideoSlot: '第 5 图可放主图视频',
    videoRatio: '3:4 或 1:1', videoSize: '建议 800×800', videoMaxSec: 60, videoRecommendedSec: '9-30s', videoMaxMB: 100,
    bulletCount: null, bulletNote: '淘宝用「宝贝卖点 + 详情页」承载',
    descriptionMax: 50000,
    formats: ['jpg', 'png'],
    forbiddenNote: '广告法极限词 + 淘宝禁用词（"最""第一""神价格"等）'
  },

  /* ---------- 电商：亚马逊（US，英文） ---------- */
  amazon: {
    kind: 'ecommerce', lang: 'en',
    titleMax: 200, titleRecommended: '≤200 characters（brand + product + key features）',
    priceRequired: true, priceNote: 'US Dollar price required',
    mainImageMin: 1, mainImageMax: 9, mainImageRatio: '1:1', mainImageRecommendedSize: '2000×2000（min 1000px for zoom）',
    mainImageWhiteBg: 'MANDATORY: pure white background RGB(255,255,255), product fills ~85% of frame, no text/watermark/logo',
    videoRatio: '16:9 或 1:1', videoSize: '建议 1920×1080', videoMaxSec: 120, videoRecommendedSec: '15-60s', videoMaxMB: 500,
    bulletCount: 5, bulletMin: 5, bulletRecommended: 5, bulletMaxChars: 500, bulletRecommendedChars: '≤200 each',
    descriptionMax: 5000, descriptionRecommended: '200-500 words (A+ recommended)',
    formats: ['jpeg', 'jpg', 'png'],
    forbiddenNote: 'No promotional/price claims ("best seller", "free shipping", "guaranteed"); no trademarked terms; no competitor brand names'
  }
};

// 最佳发布时间（bestTimes）
export const BEST_TIMES = {
  xiaohongshu: [
    { window: '07:30-08:30', note: '通勤起床刷屏' },
    { window: '12:00-13:30', note: '午休种草高峰' },
    { window: '19:00-21:30', note: '晚间决策高峰，互动率最高' }
  ],
  douyin: [
    { window: '12:00-13:00', note: '午间小高峰' },
    { window: '20:00-22:00', note: '晚高峰主战场，流量峰值' }
  ],
  wechat_moments: [
    { window: '07:30-09:00', note: '通勤刷圈' },
    { window: '12:00-13:30', note: '午休' },
    { window: '20:30-22:30', note: '睡前高峰，转化最好' }
  ],
  wechat_official: [
    { window: '07:30-08:30', note: '通勤早高峰' },
    { window: '12:00-13:00', note: '午休' },
    { window: '20:00-21:30', note: '晚间深度阅读高峰' }
  ],
  instagram: [
    { window: '09:00-11:00', note: '工作日上午' },
    { window: '18:00-21:00', note: '晚间高峰，Reels表现最佳', bestDays: '周二至周四' }
  ],
  tiktok: [
    { window: '06:00-09:00', note: '晨间通勤' },
    { window: '18:00-21:00', note: '晚间娱乐高峰', bestDays: '周二至周四' }
  ],
  jd: [
    { window: '10:00-11:00', note: '上架后进入活动池需时间，建议错峰审核' },
    { window: '20:00-22:00', note: '京东晚高峰，流量峰值' }
  ],
  taobao: [
    { window: '10:00-11:00', note: '错峰审核，避开大促报名截止' },
    { window: '21:00-23:00', note: '淘宝晚高峰' }
  ],
  amazon: [
    { window: 'US Eastern 08:00-10:00', note: '覆盖美东工作日早间，Prime 会员活跃' },
    { window: 'US Eastern 20:00-22:00', note: '晚间购物高峰' }
  ]
};

// =====================================================================
// 逐平台「点哪里、填什么」操作清单（具体可执行，不堆砌说明书）
// 每条：{ click: 在哪个后台/点哪个按钮， fill: 把阿发哪份复制块粘进去， field: 对应复制块key }
// =====================================================================
export const PLATFORM_STEPS = {
  xiaohongshu: [
    { click: '打开「小红书」App → 底部中间「+」号', fill: '从相册按顺序勾选要发的图（≤9张）', field: 'media' },
    { click: '下一步 → 顶部标题输入框', fill: '粘贴阿发复制块「标题」', field: 'title' },
    { click: '正文输入框', fill: '粘贴阿发复制块「正文+话题」', field: 'body' },
    { click: '添加话题/位置', fill: '核对 #话题 数量（建议3-8个）', field: 'tags' },
    { click: '发布设置 → 可见范围', fill: '选「公开」，可加@提醒', field: '' },
    { click: '点「发布」→ 等审核通过', fill: '截图已发布页 → 回阿发点「标记已发布」并贴追踪链接', field: 'tracking' }
  ],
  douyin: [
    { click: '打开「抖音」→ 底部「+」→ 上传视频/图文', fill: '选阿发打好包的 video.mp4 或图集', field: 'media' },
    { click: '文案输入框', fill: '粘贴阿发复制块「正文+话题」（话题≤5个）', field: 'body' },
    { click: '选封面 → 选首帧/上传封面图', fill: '确认无关键人脸被裁切', field: 'media' },
    { click: '添加话题/@朋友/位置', fill: '核对话题≤5个', field: 'tags' },
    { click: '「发布」→ 等审核', fill: '截图已发布页 → 回阿发标记已发布', field: 'tracking' }
  ],
  wechat_moments: [
    { click: '微信 → 发现 → 朋友圈 → 长按右上角相机图标', fill: '选「从相册选择」勾选图（≤9张）', field: 'media' },
    { click: '文字输入框', fill: '粘贴阿发复制块「正文」（朋友圈不用#话题）', field: 'body' },
    { click: '「谁可以看」', fill: '选「公开/部分可见」', field: '' },
    { click: '「发表」', fill: '截图已发朋友圈 → 回阿发标记已发布', field: 'tracking' }
  ],
  wechat_official: [
    { click: '登录「公众平台」mp.weixin.qq.com → 草稿箱 → 新创作', fill: '粘贴阿发复制块「标题」', field: 'title' },
    { click: '正文编辑器', fill: '粘贴阿发复制块「正文」（保留段落）', field: 'body' },
    { click: '封面设置 → 上传大封面 900×383 / 小封面 500×500', fill: '用阿发打包的 cover 文件', field: 'media' },
    { click: '摘要输入框', fill: '粘贴阿发 digest（≤120字）', field: 'digest' },
    { click: '保存为草稿 → 「群发」/ 定时群发', fill: '扫码确认 → 截图 → 回阿发标记已发布', field: 'tracking' }
  ],
  instagram: [
    { click: '打开 Instagram App → 底部「+」→ Post/Reel', fill: '按顺序选图（≤20张轮播）或 Reel 视频', field: 'media' },
    { click: 'Write a caption…', fill: '粘贴阿发复制块「正文+话题」（话题≤30）', field: 'body' },
    { click: 'Tag people / Add location', fill: '按需标记', field: '' },
    { click: 'Share', fill: '截图已发布页 → 回阿发标记已发布', field: 'tracking' }
  ],
  tiktok: [
    { click: '打开 TikTok → 底部「+」→ 上传 video.mp4', fill: '选阿发打包视频（9:16）', field: 'media' },
    { click: 'Add a caption…', fill: '粘贴阿发复制块「正文+话题」', field: 'body' },
    { click: 'Cover / Sound / Settings', fill: '选封面帧，确认可见范围 Public', field: '' },
    { click: 'Post', fill: '截图已发布页 → 回阿发标记已发布', field: 'tracking' }
  ],
  jd: [
    { click: '登录「京东商家中心」shop.jd.com → 商品管理 → 添加新商品 → 选类目', fill: '按实际品类选叶子类目', field: '' },
    { click: '「商品标题」输入框', fill: '粘贴阿发复制块「商品标题」（≤60字符）', field: 'title' },
    { click: '「主图/主图视频」上传区', fill: '按顺序上传 1:1 主图组（白底优先）+ 主图视频', field: 'media' },
    { click: '「价格/库存/SKU」', fill: '填京东价、库存、规格属性', field: 'price' },
    { click: '「商品详情/规格参数」', fill: '粘贴阿发复制块「卖点/详情」', field: 'bullets' },
    { click: '提交审核', fill: '审核通过后复制商品链接 → 回阿发粘贴追踪短链 /r/xxx → 标记已发布', field: 'tracking' }
  ],
  taobao: [
    { click: '登录「千牛卖家中心」→ 宝贝管理 → 发布宝贝 → 选类目', fill: '按实际品类选叶子类目', field: '' },
    { click: '「宝贝标题」输入框', fill: '粘贴阿发复制块「宝贝标题」（≤30汉字）', field: 'title' },
    { click: '「主图」上传区（≤5张，第5张可放视频）', fill: '按顺序上传 1:1 主图 + 主图视频', field: 'media' },
    { click: '「一口价/销售规格 SKU」', fill: '填价格、库存、颜色/尺码', field: 'price' },
    { click: '「宝贝卖点 + 详情页」', fill: '粘贴阿发复制块「卖点/详情」', field: 'bullets' },
    { click: '提交', fill: '发布后复制宝贝链接 → 回阿发贴追踪短链 → 标记已发布', field: 'tracking' }
  ],
  amazon: [
    { click: 'Login Seller Central → Inventory → Add a Product → Create a new product listing → pick category', fill: 'choose the correct leaf category', field: '' },
    { click: 'Offer → Product name field', fill: 'paste copy block「Product Title」(≤200 chars)', field: 'title' },
    { click: 'Images section → upload main images', fill: 'upload 1:1 pure-white images (min 1000px) + video', field: 'media' },
    { click: 'Key Product Features (Bullet Points)', fill: 'paste copy block「5 Bullet Points」(5 bullets, ≤500 chars each)', field: 'bullets' },
    { click: 'Description / A+ Content', fill: 'paste copy block「Description」(200-500 words)', field: 'body' },
    { click: 'Offer → Price', fill: 'set USD price → Save and finish', field: 'price' },
    { click: 'wait for listing to go live', fill: 'copy product URL → paste tracking short link /r/xxx in Afa → mark published', field: 'tracking' }
  ]
};

// 发布前校验规则（声明式；checklist.js 执行）
export const PREPUBLISH_RULES = [
  { rule: 'image_count', check: '主图/图片数量是否在平台 min~max 内', fail: '不足补占位，超出截断' },
  { rule: 'image_ratio', check: '主图比例是否符合平台要求', fail: '提示需裁切/换比例，给出目标比例' },
  { rule: 'image_resolution', check: '长边是否≥平台推荐像素（电商需≥1000px支持放大）', fail: '提示重出高清图' },
  { rule: 'image_white_bg', check: '电商首图是否纯白底（JD服饰/家电、Amazon强制）', fail: '提示先用阿图抠图换底' },
  { rule: 'file_size', check: '单文件是否≤平台上限', fail: '提示需压缩' },
  { rule: 'format', check: '文件格式是否被平台接受', fail: '提示转格式（如 Amazon 要 jpeg/png）' },
  { rule: 'title_length', check: '标题字数≤平台上限', fail: '自动截断到上限并标红' },
  { rule: 'bullet_count', check: 'Amazon 五点是否=5 条', fail: '不足提示补写，超出截断到5条' },
  { rule: 'bullet_length', check: '每条五点≤平台字符上限', fail: '自动截断到上限' },
  { rule: 'body_length', check: '正文/详情字数≤平台上限', fail: '自动截断' },
  { rule: 'video_duration', check: '视频时长≤平台上限', fail: '提示剪辑到建议时长' },
  { rule: 'hashtag_count', check: '话题数量≤平台上限', fail: '删除尾部话题' },
  { rule: 'price_required', check: '电商平台价格是否已填', fail: '提示补价格' },
  { rule: 'ad_law_words', check: '标题/正文命中广告法极限词', fail: '自动打码替换并标红，列出命中词' },
  { rule: 'sensitive_words', check: '命中平台敏感/导流词', fail: '拦截并提示替换' }
];

// 广告法违禁词库（中文）——子串命中即拦截。
export const AD_LAW_WORDS = [
  '最佳', '最好', '最优', '最高级', '最低价', '最大', '最小', '最先进', '最棒', '最牛', '最火',
  '第一', '国家级', '独家', '绝对', '100%', '根治', '世界级', '顶级', '万能', '永久',
  '无效退款', '纯天然', '包治', '神器', '史无前例', '永远', '百分百', '绝无仅有',
  '销量冠军', '全国第一', '全网最低', '第一名', '最低价', '王牌', '极致'
];

// Amazon / 英文站禁用词（促销/价格/商标类）
export const AD_LAW_WORDS_EN = [
  'best seller', 'best-seller', 'number one', '#1', '100% guaranteed', 'money back guarantee',
  'free shipping', 'cheapest', 'lowest price', 'guaranteed', 'world\'s best', 'top rated',
  'no risk', 'risk free', 'cure', 'miracle', 'authentic guaranteed'
];

// 平台敏感/导流词库（中文）
export const SENSITIVE_WORDS = [
  '加V', '加v', '私信领', '外链', '微信', 'weixin', 'vx', 'VX', '扣扣', 'QQ群',
  '扫一扫加', '扫码加', '代购', '返利', '公众号回复', '刷单发'
];

// 多平台素材打包结构（按平台自动分包）
export const PACKAGING = {
  rootFolder: 'afa-publish-{date}/',
  zipName: 'afa-publish-{YYYYMMDD-HHmm}.zip',
  namingRule: '{platform}_{type}_{seq}.{ext}；caption.txt 内字段用 === 分隔',
  folders: {
    xiaohongshu: ['cover.jpg', 'img_01.jpg', 'caption.txt', 'hashtags.txt'],
    douyin: ['video.mp4', 'cover.jpg', 'caption.txt', 'hashtags.txt'],
    wechat_moments: ['img_01.jpg', 'caption.txt', 'tracking.txt'],
    wechat_official: ['cover_large_900x383.jpg', 'cover_small_500x500.jpg', 'article.md', 'digest.txt'],
    instagram: ['post_01.jpg', 'caption.txt'],
    tiktok: ['video.mp4', 'caption.txt', 'hashtags.txt'],
    jd: ['main_01.jpg', 'main_02.jpg', 'video.mp4', 'title.txt', 'bullets.txt', 'tracking.txt'],
    taobao: ['main_01.jpg', 'main_02.jpg', 'video.mp4', 'title.txt', 'bullets.txt', 'tracking.txt'],
    amazon: ['main_01.jpg', 'main_02.jpg', 'video.mp4', 'title.txt', 'bullets.txt', 'description.txt', 'tracking.txt']
  }
};

// 发布状态机（draft → previewed → packed → scheduled → published；失败 rejected）
export const STATUS_FLOW = ['draft', 'previewed', 'packed', 'scheduled', 'published'];

// 阿果接口契约（仅定义，不实现）
export const AGUO_HOOK = {
  endpoint: 'POST /aguo/publish-confirm',
  billingRule: '仅 status=published 且 contentHash 未重复时计费；preview/packed/scheduled 不计费；QC失败不计费'
};

// 阿发质检维度（qcGate.dimensions）
export const QC_DIMENSIONS = [
  { id: 'AF1_layout_match', name: '预览版式与真实平台一致', failAction: '重新套skin渲染≤1次，仍失败则rejected' },
  { id: 'AF2_copy_integrity', name: '逐字段复制内容完整', failAction: '重绑数据源≤1次，仍失败则rejected' },
  { id: 'AF3_media_text_not_split', name: '图文/视频一体不割裂', failAction: '退回阿文重写≤1次' },
  { id: 'AF4_album_no_garbled', name: '画册/预览无乱码', failAction: 'UTF-8归一化重渲染≤1次' },
  { id: 'AF5_qr_valid', name: '追踪链接/二维码有效', failAction: '重新签发短链≤1次' },
  { id: 'AF6_hard_spec_fit', name: '硬规格不越界（自动修正后达标）', failAction: '自动截断/压缩≤1次，仍越界则rejected' },
  { id: 'AF7_no_banned_words', name: '无违禁词（广告法+敏感）', failAction: '自动打码替换/退回阿文重写，列出命中词' },
  { id: 'AF8_tracking_attached', name: '追踪链接/渠道码已自动带上', failAction: '重新attachTracking≤1次' }
];

// 开放待真机校准点（诚实标注）
export const OPEN_QUESTIONS = [
  '各平台已发布页精确像素坐标需真机截图校准，本期用结构化默认值',
  '小红书话题是否有硬性数量上限未找到官方数字，本期按推荐3-8个处理',
  '京东标题60字符/淘宝30汉字为常见类目限制，具体类目可能不同，需按后台提示校准',
  'Amazon 标题200字符/五点500字符为现行常见上限，亚马逊后续可能调整，以 Seller Central 实测为准',
  '朋友圈1500字为第三方汇总，微信官方未公开数字，需实测'
];

export function getPlatformSpec(platform) {
  return HARD_SPECS[platform] || null;
}

export function getPlatformMeta(platform) {
  return PLATFORM_META[platform] || null;
}

export function isKnownPlatform(platform) {
  return PUBLISH_PLATFORMS.includes(platform);
}

export function isEcommerce(platform) {
  return (PLATFORM_GROUPS.ecommerce || []).includes(platform);
}

export function isSocial(platform) {
  return (PLATFORM_GROUPS.social || []).includes(platform);
}

export default {
  PUBLISH_PLATFORMS, PLATFORM_GROUPS, PLATFORM_META, MOBILE_FRAME, DESKTOP_FRAME,
  LAYOUT, HARD_SPECS, BEST_TIMES, PLATFORM_STEPS, PREPUBLISH_RULES,
  AD_LAW_WORDS, AD_LAW_WORDS_EN, SENSITIVE_WORDS, PACKAGING, STATUS_FLOW,
  AGUO_HOOK, QC_DIMENSIONS, OPEN_QUESTIONS,
  getPlatformSpec, getPlatformMeta, isKnownPlatform, isEcommerce, isSocial
};
