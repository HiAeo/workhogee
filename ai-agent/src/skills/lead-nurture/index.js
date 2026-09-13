/**
 * 线索培育技能 (Lead Nurture Skill)
 * 核心能力：个性化跟进 SOP、意向分级培育、自动提醒跟进、培育内容生成
 *
 * 这是 AI 获客伙计的扩展技能，帮助企业自动化线索培育流程，
 * 提升线索转化率，减少人工跟进成本。
 */

class LeadNurtureSkill {
  constructor(llmService, leadStorage, businessConfig) {
    this.llm = llmService;
    this.leadStorage = leadStorage;
    this.businessConfig = businessConfig;
  }

  /**
   * 生成个性化跟进话术
   * @param {string} leadId - 线索 ID
   * @param {string} scene - 场景（首次跟进/二次跟进/逼单/唤醒）
   * @returns {Promise<Object>} - 跟进话术
   */
  async generateFollowUpScript(leadId, scene = '首次跟进') {
    const lead = this.leadStorage.getById(leadId);
    if (!lead) {
      throw new Error('线索不存在: ' + leadId);
    }

    const sceneGuidelines = {
      '首次跟进': '建立信任，了解需求，提供价值，不要急于推销',
      '二次跟进': '深化需求，提供方案，展示案例，引导下一步',
      '逼单': '制造紧迫感，提供优惠，降低决策门槛，明确行动',
      '唤醒': '重新激活，提供新价值，了解近况，重新建立连接',
      '节日问候': '温馨祝福，轻触达，不推销，保持品牌存在感'
    };

    const systemPrompt = `你是一位资深销售专家，擅长写高转化的跟进话术。
当前场景：${scene}
场景要求：${sceneGuidelines[scene] || sceneGuidelines['首次跟进']}

客户信息：
- 姓名：${lead.name || '客户'}
- 电话：${lead.phone || '未提供'}
- 意向等级：${lead.intentionLevel}级
- 状态：${lead.status}
- 需求：${lead.needs || '待了解'}
- 预算：${lead.budget || '待了解'}
- 决策周期：${lead.decisionCycle || '待了解'}
- 备注：${lead.notes || '无'}

产品信息：
- 产品：${this.businessConfig.product || '产品'}
- 行业：${this.businessConfig.industry || '行业'}
- 目标客户：${this.businessConfig.targetCustomer || '目标客户'}`;

    const userPrompt = `请生成一套${scene}话术，包含：
1. 开场白（亲切自然，不突兀）
2. 价值提供（给客户一个继续聊下去的理由）
3. 需求挖掘（2-3个开放式问题）
4. 方案介绍（针对需求的简要方案）
5. 行动号召（明确的下一步，如预约演示/到店/发资料）
6. 常见异议处理（2-3个客户可能的拒绝及应对）

请以 JSON 格式返回：
{
  "opening": "开场白",
  "valueProposition": "价值提供",
  "questions": ["问题1", "问题2"],
  "solution": "方案介绍",
  "cta": "行动号召",
  "objections": [
    {"objection": "异议", "response": "应对"}
  ]
}`;

    try {
      const result = await this.llm.chatJSON([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      return {
        type: 'follow-up-script',
        scene,
        leadId,
        ...result,
        createdAt: new Date().toISOString()
      };
    } catch (e) {
      throw new Error('生成跟进话术失败: ' + e.message);
    }
  }

  /**
   * 生成培育内容（发给客户的资料/文章/案例）
   * @param {string} leadId - 线索 ID
   * @param {string} contentType - 内容类型（产品资料/案例/行业报告/优惠信息）
   * @returns {Promise<Object>} - 培育内容
   */
  async generateNurtureContent(leadId, contentType = '产品资料') {
    const lead = this.leadStorage.getById(leadId);
    if (!lead) {
      throw new Error('线索不存在: ' + leadId);
    }

    const systemPrompt = `你是一位资深内容营销专家，擅长写高转化的培育内容。
当前内容类型：${contentType}
目标客户：${lead.name || '客户'}（${lead.intentionLevel}级意向）
客户需求：${lead.needs || '待了解'}
客户预算：${lead.budget || '待了解'}

产品信息：
- 产品：${this.businessConfig.product || '产品'}
- 行业：${this.businessConfig.industry || '行业'}`;

    let userPrompt = '';
    switch (contentType) {
      case '产品资料':
        userPrompt = `请生成一份产品资料介绍，包含：
1. 产品核心价值（3点）
2. 产品功能亮点（5-7点）
3. 与竞品的差异化优势（3点）
4. 客户成功案例（1个，包含数据）
5. 常见问题解答（3-5个）`;
        break;
      case '案例':
        userPrompt = `请生成一个客户成功案例，包含：
1. 客户背景（行业/规模/痛点）
2. 解决方案（如何使用我们的产品）
3. 实施过程（关键步骤和时间）
4. 成果数据（量化的效果提升）
5. 客户评价（真实感的引用）`;
        break;
      case '行业报告':
        userPrompt = `请生成一份行业洞察报告摘要，包含：
1. 行业趋势（3-5个关键趋势）
2. 市场数据（关键指标和增长）
3. 挑战与机遇
4. 对目标客户的建议
5. 我们的产品如何帮助应对`;
        break;
      case '优惠信息':
        userPrompt = `请生成一份限时优惠活动文案，包含：
1. 活动主题（吸引注意）
2. 优惠内容（具体的折扣/赠品/服务）
3. 活动时间（制造紧迫感）
4. 参与方式（简单明了）
5. 常见问题（降低决策门槛）`;
        break;
      default:
        userPrompt = `请生成一份培育内容，帮助客户了解产品价值。`;
    }

    userPrompt += `

请以 JSON 格式返回：
{
  "title": "标题",
  "summary": "摘要（100字以内）",
  "content": "正文内容",
  "cta": "行动号召"
}`;

    try {
      const result = await this.llm.chatJSON([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      return {
        type: 'nurture-content',
        contentType,
        leadId,
        ...result,
        createdAt: new Date().toISOString()
      };
    } catch (e) {
      throw new Error('生成培育内容失败: ' + e.message);
    }
  }

  /**
   * 生成跟进计划（SOP）
   * @param {string} leadId - 线索 ID
   * @returns {Promise<Object>} - 跟进计划
   */
  async generateFollowUpPlan(leadId) {
    const lead = this.leadStorage.getById(leadId);
    if (!lead) {
      throw new Error('线索不存在: ' + leadId);
    }

    // 根据意向等级制定不同的跟进频率
    const intensityMap = {
      'A': { frequency: '每天', duration: '7天', touchpoints: 5 },
      'B': { frequency: '每2天', duration: '14天', touchpoints: 4 },
      'C': { frequency: '每周', duration: '30天', touchpoints: 3 }
    };
    const intensity = intensityMap[lead.intentionLevel] || intensityMap['B'];

    const systemPrompt = `你是一位资深销售运营专家，擅长制定线索跟进 SOP。
客户信息：
- 姓名：${lead.name || '客户'}
- 意向等级：${lead.intentionLevel}级
- 状态：${lead.status}
- 需求：${lead.needs || '待了解'}
- 来源：${lead.source}

跟进强度建议：
- 频率：${intensity.frequency}
- 周期：${intensity.duration}
- 触达次数：${intensity.touchpoints}次

产品信息：
- 产品：${this.businessConfig.product || '产品'}`;

    const userPrompt = `请为该客户制定一份个性化跟进计划，包含 ${intensity.touchpoints} 个触达节点：
每个节点包含：
1. 时间（第几天）
2. 渠道（电话/微信/短信/邮件）
3. 目的（这个触达要达成什么）
4. 话术要点（3-5个关键点）
5. 成功标准（如何判断这个触达有效）

请以 JSON 格式返回：
{
  "plan": [
    {
      "day": 1,
      "channel": "微信",
      "purpose": "目的",
      "keyPoints": ["要点1", "要点2"],
      "successCriteria": "成功标准"
    }
  ],
  "overallStrategy": "整体策略说明"
}`;

    try {
      const result = await this.llm.chatJSON([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      return {
        type: 'follow-up-plan',
        leadId,
        intensity: lead.intentionLevel,
        plan: result.plan || [],
        overallStrategy: result.overallStrategy || '',
        createdAt: new Date().toISOString()
      };
    } catch (e) {
      throw new Error('生成跟进计划失败: ' + e.message);
    }
  }

  /**
   * 获取需要跟进的线索列表
   * @param {Object} filters - 筛选条件
   * @returns {Array} - 需要跟进的线索
   */
  getLeadsToFollowUp(filters = {}) {
    const allLeads = this.leadStorage.list({
      pageSize: 100,
      status: filters.status || 'following',
      intentionLevel: filters.intentionLevel
    });

    // 筛选出超过 N 天未跟进的线索
    const daysThreshold = filters.daysThreshold || 3;
    const now = new Date();

    return allLeads.leads.filter(lead => {
      const lastFollowUp = lead.updatedAt ? new Date(lead.updatedAt) : new Date(lead.createdAt);
      const daysSinceLastFollowUp = (now - lastFollowUp) / (1000 * 60 * 60 * 24);
      return daysSinceLastFollowUp >= daysThreshold;
    });
  }

  /**
   * 记录跟进结果
   * @param {string} leadId - 线索 ID
   * @param {Object} result - 跟进结果
   * @returns {Object} - 更新后的线索
   */
  recordFollowUpResult(leadId, result) {
    const lead = this.leadStorage.getById(leadId);
    if (!lead) {
      throw new Error('线索不存在: ' + leadId);
    }

    // 更新线索状态
    const updates = {
      updatedAt: new Date().toISOString(),
      notes: (lead.notes || '') + '\n[' + new Date().toLocaleString() + '] ' + (result.notes || '')
    };

    // 根据跟进结果更新意向等级和状态
    if (result.outcome === 'positive') {
      updates.intentionLevel = 'A';
      updates.status = 'interested';
    } else if (result.outcome === 'neutral') {
      updates.status = 'following';
    } else if (result.outcome === 'negative') {
      updates.status = 'lost';
    }

    return this.leadStorage.update(leadId, updates);
  }
}

module.exports = LeadNurtureSkill;
