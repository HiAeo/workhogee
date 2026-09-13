/**
 * 内容智造技能 (Content Creator Skill)
 * 核心能力：小红书图文笔记、公众号文章、营销文案生成
 *
 * 这是 AI 获客伙计的扩展技能，帮助企业自动生成营销内容，
 * 降低内容创作门槛，提升获客效率。
 */

class ContentCreatorSkill {
  constructor(llmService, businessConfig) {
    this.llm = llmService;
    this.businessConfig = businessConfig;
  }

  /**
   * 生成小红书图文笔记
   * @param {Object} options - 选项
   * @param {string} options.topic - 主题
   * @param {string} options.product - 产品名称
   * @param {string} options.targetAudience - 目标受众
   * @param {string} options.style - 风格（种草/干货/测评/故事）
   * @param {number} options.imageCount - 配图数量建议
   * @returns {Promise<Object>} - 笔记内容
   */
  async generateXiaohongshuNote(options = {}) {
    const {
      topic = '',
      product = this.businessConfig.product || '产品',
      targetAudience = this.businessConfig.targetCustomer || '目标用户',
      style = '种草',
      imageCount = 6
    } = options;

    const systemPrompt = `你是一位资深小红书内容创作者，擅长写爆款笔记。
你的写作特点：
1. 标题吸睛，善用数字、emoji、痛点词
2. 正文口语化，有亲切感，像朋友分享
3. 结构清晰：开头吸引注意 → 中间干货/体验 → 结尾互动引导
4. 善用 emoji 点缀，但不过度
5. 标签精准，包含热门标签和垂直标签

请根据以下信息生成一篇小红书笔记：
- 主题：${topic}
- 产品：${product}
- 目标受众：${targetAudience}
- 风格：${style}
- 配图建议：${imageCount}张`;

    const userPrompt = `请生成一篇小红书笔记，包含以下部分：
1. 标题（3个备选，每个不超过20字）
2. 正文（300-500字，分段清晰）
3. 配图建议（${imageCount}张，每张图的内容说明）
4. 标签（10-15个，包含热门标签和垂直标签）

请以 JSON 格式返回：
{
  "titles": ["标题1", "标题2", "标题3"],
  "content": "正文内容",
  "imageSuggestions": ["图1说明", "图2说明", ...],
  "tags": ["标签1", "标签2", ...]
}`;

    try {
      const result = await this.llm.chatJSON([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      return {
        type: 'xiaohongshu',
        style,
        ...result,
        createdAt: new Date().toISOString()
      };
    } catch (e) {
      throw new Error('生成小红书笔记失败: ' + e.message);
    }
  }

  /**
   * 生成公众号文章
   * @param {Object} options - 选项
   * @param {string} options.topic - 主题
   * @param {string} options.angle - 切入角度
   * @param {number} options.wordCount - 字数
   * @returns {Promise<Object>} - 文章内容
   */
  async generateWechatArticle(options = {}) {
    const {
      topic = '',
      angle = '行业洞察',
      wordCount = 1500,
      product = this.businessConfig.product || '产品'
    } = options;

    const systemPrompt = `你是一位资深公众号内容主编，擅长写深度好文。
你的写作特点：
1. 标题有深度，引发思考，不做标题党
2. 结构严谨：引子 → 问题提出 → 分析论证 → 解决方案 → 总结升华
3. 论据充分，善用数据、案例、引用
4. 语言专业但不晦涩，有自己的观点和态度
5. 结尾有金句，引发转发和讨论

请根据以下信息生成一篇公众号文章：
- 主题：${topic}
- 切入角度：${angle}
- 产品：${product}
- 目标字数：${wordCount}字`;

    const userPrompt = `请生成一篇公众号文章，包含以下部分：
1. 标题（3个备选）
2. 摘要（100字以内，用于公众号摘要）
3. 正文（${wordCount}字左右，分段清晰，有小标题）
4. 结尾金句（1-2句，适合转发）
5. 互动话题（1个，引导读者留言）

请以 JSON 格式返回：
{
  "titles": ["标题1", "标题2", "标题3"],
  "summary": "摘要",
  "content": "正文内容（包含小标题）",
  "goldenQuote": "结尾金句",
  "interactionTopic": "互动话题"
}`;

    try {
      const result = await this.llm.chatJSON([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      return {
        type: 'wechat-article',
        angle,
        wordCount,
        ...result,
        createdAt: new Date().toISOString()
      };
    } catch (e) {
      throw new Error('生成公众号文章失败: ' + e.message);
    }
  }

  /**
   * 生成营销文案
   * @param {Object} options - 选项
   * @param {string} options.scene - 场景（朋友圈/广告/短信/邮件）
   * @param {string} options.hook - 核心卖点
   * @param {string} options.cta - 行动号召
   * @returns {Promise<Object>} - 文案内容
   */
  async generateMarketingCopy(options = {}) {
    const {
      scene = '朋友圈',
      hook = '',
      cta = '立即咨询',
      product = this.businessConfig.product || '产品',
      targetAudience = this.businessConfig.targetCustomer || '目标用户'
    } = options;

    const sceneGuidelines = {
      '朋友圈': '简短有力，3-5行，善用emoji，有互动感，适合私域传播',
      '广告': '标题吸睛，痛点明确，解决方案清晰，行动号召强，适合投放',
      '短信': '不超过70字，开门见山，紧迫感强，包含链接或电话',
      '邮件': '主题行吸引人，正文结构清晰，个性化称呼，明确的CTA按钮'
    };

    const systemPrompt = `你是一位资深营销文案专家，擅长写高转化文案。
当前场景：${scene}
场景要求：${sceneGuidelines[scene] || sceneGuidelines['朋友圈']}

产品信息：
- 产品：${product}
- 目标受众：${targetAudience}
- 核心卖点：${hook}
- 行动号召：${cta}`;

    const userPrompt = `请生成3套${scene}文案，每套包含：
1. 标题/开头（吸引注意）
2. 正文（痛点+解决方案+利益点）
3. 行动号召（明确的下一步）

请以 JSON 格式返回：
{
  "copies": [
    {
      "title": "标题",
      "body": "正文",
      "cta": "行动号召"
    }
  ]
}`;

    try {
      const result = await this.llm.chatJSON([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      return {
        type: 'marketing-copy',
        scene,
        copies: result.copies || [],
        createdAt: new Date().toISOString()
      };
    } catch (e) {
      throw new Error('生成营销文案失败: ' + e.message);
    }
  }

  /**
   * 生成内容日历（一周内容规划）
   * @param {Object} options - 选项
   * @returns {Promise<Object>} - 内容日历
   */
  async generateContentCalendar(options = {}) {
    const {
      product = this.businessConfig.product || '产品',
      targetAudience = this.businessConfig.targetCustomer || '目标用户'
    } = options;

    const systemPrompt = `你是一位资深内容运营专家，擅长制定内容策略。
请为以下产品制定一周的内容日历：
- 产品：${product}
- 目标受众：${targetAudience}

内容策略原则：
1. 周一：干货/知识类（建立专业形象）
2. 周二：产品/案例类（展示产品价值）
3. 周三：互动/话题类（提升 engagement）
4. 周四：痛点/解决方案类（引发共鸣）
5. 周五：品牌/故事类（建立情感连接）
6. 周六：生活/趣味类（轻松周末）
7. 周日：总结/预告类（承上启下）`;

    const userPrompt = `请生成一周的内容日历，每天包含：
1. 内容主题
2. 内容形式（图文/视频/直播/互动）
3. 发布平台（小红书/公众号/朋友圈/视频号）
4. 核心要点（3-5个）
5. 预期目标

请以 JSON 格式返回：
{
  "calendar": [
    {
      "day": "周一",
      "topic": "主题",
      "format": "形式",
      "platform": "平台",
      "keyPoints": ["要点1", "要点2"],
      "goal": "目标"
    }
  ]
}`;

    try {
      const result = await this.llm.chatJSON([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      return {
        type: 'content-calendar',
        calendar: result.calendar || [],
        createdAt: new Date().toISOString()
      };
    } catch (e) {
      throw new Error('生成内容日历失败: ' + e.message);
    }
  }
}

module.exports = ContentCreatorSkill;
