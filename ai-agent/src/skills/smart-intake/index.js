/**
 * 智能承接技能 (Smart Intake Skill)
 * 核心业务逻辑：对话承接 → 意向判定 → 资格筛选 → 线索记录 → 预约引导
 *
 * 这是 AI 获客伙计的核心技能，封装了从客户咨询到线索记录的完整工作流。
 */

class SmartIntakeSkill {
  constructor(llmService, leadStorage, conversationStorage, businessConfig) {
    this.llm = llmService;
    this.leadStorage = leadStorage;
    this.conversationStorage = conversationStorage;
    this.businessConfig = businessConfig;
    this.systemPrompt = llmService.generateSystemPrompt(businessConfig);
  }

  /**
   * 开始新对话
   * @param {string} source - 来源（web, wechat, etc.）
   * @returns {Conversation} - 新对话对象
   */
  startConversation(source = 'web') {
    const conversation = this.conversationStorage.create({
      source,
      status: 'active'
    });

    // 添加系统提示词到对话历史（不存储为用户可见消息）
    conversation.addMessage('system', this.systemPrompt);

    // 添加欢迎消息
    const welcomeMessage = this._generateWelcomeMessage();
    conversation.addMessage('assistant', welcomeMessage);
    this.conversationStorage.save(conversation);

    return conversation;
  }

  /**
   * 处理用户消息，返回 AI 回复
   * @param {string} conversationId - 对话 ID
   * @param {string} userMessage - 用户消息内容
   * @returns {Object} - { reply, intentionLevel, qualification, shouldCreateLead }
   */
  async processMessage(conversationId, userMessage) {
    const conversation = this.conversationStorage.getById(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found: ' + conversationId);
    }

    // 添加用户消息
    conversation.addMessage('user', userMessage);

    // 构建发送给 LLM 的消息（只包含 system + 最近的对话历史）
    const recentMessages = conversation.getRecentMessages(20);
    const llmMessages = recentMessages.map(m => ({
      role: m.role,
      content: m.content
    }));

    // 调用 LLM 获取回复
    const reply = await this.llm.chat(llmMessages);

    // 添加 AI 回复
    conversation.addMessage('assistant', reply);

    // 分析意向等级和资格信息
    const analysis = await this._analyzeConversation(conversation);

    // 更新对话的意向等级和资格信息
    conversation.intentionLevel = analysis.intentionLevel;
    conversation.qualification = analysis.qualification;
    conversation.summary = analysis.summary;

    // 判断是否应该创建线索（用户留下了联系方式或表达了明确意向）
    const shouldCreateLead = this._shouldCreateLead(conversation, analysis);

    // 如果应该创建线索且还没有关联线索，则创建
    let lead = null;
    if (shouldCreateLead && !conversation.leadId) {
      lead = this._createLeadFromConversation(conversation, analysis);
      conversation.leadId = lead.id;
    }

    // 保存对话
    this.conversationStorage.save(conversation);

    return {
      reply,
      intentionLevel: analysis.intentionLevel,
      qualification: analysis.qualification,
      shouldCreateLead,
      leadId: conversation.leadId,
      conversationId: conversation.id
    };
  }

  /**
   * 分析对话，提取意向等级和资格信息
   */
  async _analyzeConversation(conversation) {
    const userMessages = conversation.messages
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join('\n');

    const analysisPrompt = [
      {
        role: 'user',
        content: `请分析以下客户对话，提取客户的意向等级和资格信息。

客户消息：
${userMessages}

请返回 JSON 格式：
{
  "intentionLevel": "A" | "B" | "C",
  "qualification": {
    "budget": "客户预算范围，如果未提及则为空",
    "timeline": "决策周期/时间要求，如果未提及则为空",
    "decisionMaker": "是否是决策人，如果未提及则为空",
    "needs": "客户的核心需求",
    "painPoints": "客户的痛点"
  },
  "summary": "对话摘要，不超过100字",
  "contactInfo": {
    "phone": "电话号码，如果未提及则为空",
    "wechat": "微信号，如果未提及则为空",
    "email": "邮箱，如果未提及则为空",
    "name": "客户姓名，如果未提及则为空"
  }
}

意向等级定义：
- A：高意向 - 明确表达购买意向、询问价格/细节、要求预约/演示
- B：中意向 - 有需求但还在了解阶段、询问基本信息
- C：低意向 - 只是随便问问、信息不足、无明确需求`
      }
    ];

    try {
      const result = await this.llm.chatJSON(analysisPrompt);
      return {
        intentionLevel: result.intentionLevel || 'C',
        qualification: result.qualification || {},
        summary: result.summary || '',
        contactInfo: result.contactInfo || {}
      };
    } catch (e) {
      console.error('Analysis failed:', e.message);
      return {
        intentionLevel: 'C',
        qualification: {},
        summary: '',
        contactInfo: {}
      };
    }
  }

  /**
   * 判断是否应该创建线索
   */
  _shouldCreateLead(conversation, analysis) {
    // 如果用户留下了任何联系方式，创建线索
    const contact = analysis.contactInfo || {};
    if (contact.phone || contact.wechat || contact.email) {
      return true;
    }

    // 如果意向等级为 A 或 B，创建线索
    if (analysis.intentionLevel === 'A' || analysis.intentionLevel === 'B') {
      return true;
    }

    // 如果对话超过 5 轮且用户有明确需求，创建线索
    const userMessageCount = conversation.messages.filter(m => m.role === 'user').length;
    if (userMessageCount >= 5 && analysis.qualification.needs) {
      return true;
    }

    return false;
  }

  /**
   * 从对话创建线索
   */
  _createLeadFromConversation(conversation, analysis) {
    const contact = analysis.contactInfo || {};
    const qual = analysis.qualification || {};

    const lead = this.leadStorage.create({
      name: contact.name || '',
      phone: contact.phone || '',
      wechat: contact.wechat || '',
      email: contact.email || '',
      source: conversation.source,
      intentionLevel: analysis.intentionLevel,
      status: analysis.intentionLevel === 'A' ? 'interested' : 'following',
      budget: qual.budget || '',
      decisionCycle: qual.timeline || '',
      needs: qual.needs || '',
      painPoints: qual.painPoints || '',
      conversationId: conversation.id,
      notes: analysis.summary || ''
    });

    return lead;
  }

  /**
   * 生成欢迎消息
   */
  _generateWelcomeMessage() {
    const product = this.businessConfig.product || '我们的产品';
    return `您好！欢迎咨询${product}。我是您的专属 AI 获客顾问，很高兴为您服务。

请问有什么可以帮到您的？您可以告诉我您的需求，我会为您提供专业的建议和方案。`;
  }

  /**
   * 结束对话
   */
  endConversation(conversationId) {
    const conversation = this.conversationStorage.getById(conversationId);
    if (!conversation) {
      return null;
    }
    conversation.end();
    this.conversationStorage.save(conversation);
    return conversation;
  }
}

module.exports = SmartIntakeSkill;
