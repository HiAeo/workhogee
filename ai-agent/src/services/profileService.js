/**
 * 客户画像服务
 * 基于对话内容和行为数据自动生成客户画像，包括需求标签、兴趣点、购买意向、性格特征
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ProfileService {
  constructor(leadStorage, conversationStorage, llmService, config) {
    this.leadStorage = leadStorage;
    this.conversationStorage = conversationStorage;
    this.llmService = llmService;
    this.config = config;
    this.storagePath = path.join(__dirname, '../../data/profiles');
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  _getProfileFile(leadId) {
    return path.join(this.storagePath, `${leadId}.json`);
  }

  /**
   * 生成或更新客户画像
   * @param {string} leadId - 线索 ID
   * @returns {Object} - 客户画像
   */
  async generateProfile(leadId) {
    const lead = this.leadStorage.get(leadId);
    if (!lead) {
      throw new Error('线索不存在');
    }

    // 获取对话历史
    const conversations = this.conversationStorage.listByLeadId
      ? this.conversationStorage.listByLeadId(leadId)
      : [];

    // 构建提示词
    const conversationText = conversations.map(c =>
      `用户: ${c.userMessage}\nAI: ${c.aiResponse}`
    ).join('\n\n');

    const prompt = `请根据以下客户信息和对话历史，生成详细的客户画像。

客户基本信息：
- 姓名: ${lead.name || '未知'}
- 电话: ${lead.phone || '未知'}
- 来源: ${lead.source || '未知'}
- 意向等级: ${lead.intentionLevel || '未知'}
- 需求: ${lead.needs || '未知'}
- 预算: ${lead.budget || '未知'}
- 备注: ${lead.notes || '无'}

对话历史：
${conversationText || '暂无对话记录'}

请以 JSON 格式返回客户画像，包含以下字段：
{
  "personality": "性格特征描述（外向/内向/理性/感性等）",
  "communicationStyle": "沟通风格偏好",
  "painPoints": ["痛点1", "痛点2"],
  "needs": ["核心需求1", "核心需求2"],
  "interests": ["兴趣点1", "兴趣点2"],
  "buyingStage": "购买阶段（认知/考虑/决策/成交）",
  "decisionMaker": "是否是决策者（是/否/不确定）",
  "budgetRange": "预算范围评估",
  "urgency": "紧急程度（高/中/低）",
  "preferredChannel": "偏好沟通渠道",
  "tags": ["标签1", "标签2", "标签3"],
  "recommendations": "跟进建议"
}

只返回 JSON，不要返回其他内容。`;

    try {
      // 调用 LLM 生成画像
      const response = await this.llmService.chat([
        { role: 'system', content: '你是一个专业的客户画像分析专家，擅长从对话中提取客户特征和需求。' },
        { role: 'user', content: prompt }
      ]);

      // 解析 JSON 响应
      let profileData;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        profileData = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch (e) {
        profileData = null;
      }

      if (!profileData) {
        profileData = this._generateFallbackProfile(lead);
      }

      // 保存画像
      const profile = {
        id: crypto.randomUUID(),
        leadId,
        ...profileData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      };

      fs.writeFileSync(this._getProfileFile(leadId), JSON.stringify(profile, null, 2));

      return profile;
    } catch (e) {
      // LLM 调用失败时使用降级方案
      const profile = this._generateFallbackProfile(lead);
      fs.writeFileSync(this._getProfileFile(leadId), JSON.stringify(profile, null, 2));
      return profile;
    }
  }

  /**
   * 降级方案：基于基本信息生成简单画像
   */
  _generateFallbackProfile(lead) {
    const tags = [];
    if (lead.intentionLevel === 'A') tags.push('高意向');
    if (lead.intentionLevel === 'B') tags.push('中意向');
    if (lead.intentionLevel === 'C') tags.push('低意向');
    if (lead.budget) tags.push('有明确预算');
    if (lead.source) tags.push(lead.source + '来源');

    return {
      id: crypto.randomUUID(),
      leadId: lead.id,
      personality: '待分析',
      communicationStyle: '待分析',
      painPoints: lead.needs ? [lead.needs] : [],
      needs: lead.needs ? [lead.needs] : [],
      interests: [],
      buyingStage: lead.intentionLevel === 'A' ? '决策' : lead.intentionLevel === 'B' ? '考虑' : '认知',
      decisionMaker: '不确定',
      budgetRange: lead.budget || '未知',
      urgency: lead.intentionLevel === 'A' ? '高' : '中',
      preferredChannel: '电话/微信',
      tags,
      recommendations: '建议进一步沟通了解客户详细需求和痛点',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    };
  }

  /**
   * 获取客户画像
   * @param {string} leadId - 线索 ID
   * @returns {Object|null}
   */
  getProfile(leadId) {
    try {
      const file = this._getProfileFile(leadId);
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 更新客户画像
   * @param {string} leadId - 线索 ID
   * @param {Object} updates - 更新内容
   * @returns {Object|null}
   */
  updateProfile(leadId, updates) {
    const profile = this.getProfile(leadId);
    if (!profile) return null;

    Object.assign(profile, updates, {
      updatedAt: new Date().toISOString(),
      version: (profile.version || 1) + 1
    });

    fs.writeFileSync(this._getProfileFile(leadId), JSON.stringify(profile, null, 2));
    return profile;
  }

  /**
   * 添加标签
   * @param {string} leadId - 线索 ID
   * @param {string} tag - 标签
   */
  addTag(leadId, tag) {
    const profile = this.getProfile(leadId);
    if (!profile) return null;

    if (!profile.tags) profile.tags = [];
    if (!profile.tags.includes(tag)) {
      profile.tags.push(tag);
      profile.updatedAt = new Date().toISOString();
      fs.writeFileSync(this._getProfileFile(leadId), JSON.stringify(profile, null, 2));
    }

    return profile;
  }

  /**
   * 移除标签
   * @param {string} leadId - 线索 ID
   * @param {string} tag - 标签
   */
  removeTag(leadId, tag) {
    const profile = this.getProfile(leadId);
    if (!profile || !profile.tags) return null;

    profile.tags = profile.tags.filter(t => t !== tag);
    profile.updatedAt = new Date().toISOString();
    fs.writeFileSync(this._getProfileFile(leadId), JSON.stringify(profile, null, 2));

    return profile;
  }

  /**
   * 获取所有标签统计
   * @returns {Object}
   */
  getAllTags() {
    const tagStats = {};

    try {
      const files = fs.readdirSync(this.storagePath).filter(f => f.endsWith('.json'));
      files.forEach(file => {
        try {
          const profile = JSON.parse(fs.readFileSync(path.join(this.storagePath, file), 'utf-8'));
          if (profile.tags) {
            profile.tags.forEach(tag => {
              tagStats[tag] = (tagStats[tag] || 0) + 1;
            });
          }
        } catch (e) {
          // 忽略解析错误
        }
      });
    } catch (e) {
      // 忽略
    }

    // 按数量排序
    const sorted = Object.entries(tagStats)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));

    return { tags: sorted, total: sorted.length };
  }

  /**
   * 按标签筛选线索
   * @param {string} tag - 标签
   * @returns {Array}
   */
  findLeadsByTag(tag) {
    const leads = [];

    try {
      const files = fs.readdirSync(this.storagePath).filter(f => f.endsWith('.json'));
      files.forEach(file => {
        try {
          const profile = JSON.parse(fs.readFileSync(path.join(this.storagePath, file), 'utf-8'));
          if (profile.tags && profile.tags.includes(tag)) {
            leads.push({
              leadId: profile.leadId,
              profile
            });
          }
        } catch (e) {
          // 忽略
        }
      });
    } catch (e) {
      // 忽略
    }

    return leads;
  }

  /**
   * 删除客户画像
   * @param {string} leadId - 线索 ID
   */
  deleteProfile(leadId) {
    try {
      const file = this._getProfileFile(leadId);
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}

module.exports = ProfileService;
