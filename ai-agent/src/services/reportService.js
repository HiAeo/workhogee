/**
 * 报告服务
 * 自动生成获客日报/周报，包含新增线索、意向分布、渠道分析、跟进提醒、转化漏斗、待办事项
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ReportService {
  constructor(leadStorage, conversationStorage, notificationService, llmService, config) {
    this.leadStorage = leadStorage;
    this.conversationStorage = conversationStorage;
    this.notificationService = notificationService;
    this.llmService = llmService;
    this.config = config;
    this.storagePath = path.join(__dirname, '../../data/reports');
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  _getDateRange(type = 'daily') {
    const now = new Date();
    let start, end;

    if (type === 'daily') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else if (type === 'weekly') {
      const day = now.getDay() || 7;
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
      end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    return { start, end, startStr: start.toISOString(), endStr: end.toISOString() };
  }

  /**
   * 生成日报
   */
  async generateDailyReport(date = null) {
    const range = date ? {
      start: new Date(date),
      end: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000),
      startStr: new Date(date).toISOString(),
      endStr: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000).toISOString()
    } : this._getDateRange('daily');

    const report = await this._generateReport('daily', range);
    return report;
  }

  /**
   * 生成周报
   */
  async generateWeeklyReport(weekStart = null) {
    const range = weekStart ? {
      start: new Date(weekStart),
      end: new Date(new Date(weekStart).getTime() + 7 * 24 * 60 * 60 * 1000),
      startStr: new Date(weekStart).toISOString(),
      endStr: new Date(new Date(weekStart).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    } : this._getDateRange('weekly');

    const report = await this._generateReport('weekly', range);
    return report;
  }

  async _generateReport(type, range) {
    // 1. 获取时间段内的线索
    const allLeads = this.leadStorage.list ? this.leadStorage.list({ page: 1, pageSize: 10000 }) : { leads: [] };
    const leads = (allLeads.leads || []).filter(lead => {
      const createdAt = new Date(lead.createdAt);
      return createdAt >= range.start && createdAt < range.end;
    });

    // 2. 统计分析
    const stats = this._analyzeLeads(leads);

    // 3. 获取待跟进线索
    const followUps = this._getFollowUpLeads(allLeads.leads || []);

    // 4. 获取高意向线索
    const highIntent = leads.filter(l => l.intentionLevel === 'A');

    // 5. 渠道分析
    const channelAnalysis = this._analyzeChannels(leads);

    // 6. 转化漏斗
    const funnel = this._buildFunnel(leads, allLeads.leads || []);

    // 7. 生成 AI 摘要和建议
    let aiSummary = '';
    let aiRecommendations = [];

    try {
      const aiResult = await this._generateAISummary(type, stats, leads, followUps);
      aiSummary = aiResult.summary;
      aiRecommendations = aiResult.recommendations;
    } catch (e) {
      aiSummary = this._generateFallbackSummary(type, stats);
      aiRecommendations = this._getDefaultRecommendations(stats, followUps);
    }

    // 8. 组装报告
    const report = {
      id: crypto.randomUUID(),
      type,
      title: type === 'daily' ? '获客日报' : '获客周报',
      dateRange: {
        start: range.startStr,
        end: range.endStr,
        label: type === 'daily'
          ? range.start.toLocaleDateString('zh-CN')
          : `${range.start.toLocaleDateString('zh-CN')} - ${new Date(range.end.getTime() - 86400000).toLocaleDateString('zh-CN')}`
      },
      generatedAt: new Date().toISOString(),
      summary: aiSummary,
      keyMetrics: stats.keyMetrics,
      intentionDistribution: stats.intentionDistribution,
      channelAnalysis,
      funnel,
      highIntentLeads: highIntent.map(l => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        source: l.source,
        needs: l.needs,
        budget: l.budget,
        createdAt: l.createdAt
      })),
      followUps,
      recommendations: aiRecommendations,
      todos: this._generateTodos(followUps, highIntent, stats)
    };

    // 9. 保存报告
    this._saveReport(report);

    return report;
  }

  _analyzeLeads(leads) {
    const intentionDistribution = { A: 0, B: 0, C: 0, unknown: 0 };
    const sourceCount = {};
    let converted = 0;

    leads.forEach(lead => {
      const level = lead.intentionLevel || 'unknown';
      intentionDistribution[level] = (intentionDistribution[level] || 0) + 1;

      if (lead.source) {
        sourceCount[lead.source] = (sourceCount[lead.source] || 0) + 1;
      }

      if (lead.status === 'converted' || lead.converted) {
        converted++;
      }
    });

    return {
      keyMetrics: {
        totalLeads: leads.length,
        newLeads: leads.length,
        highIntent: intentionDistribution.A,
        mediumIntent: intentionDistribution.B,
        lowIntent: intentionDistribution.C,
        converted,
        conversionRate: leads.length > 0 ? ((converted / leads.length) * 100).toFixed(1) + '%' : '0%',
        avgIntentionScore: this._calcAvgIntention(leads)
      },
      intentionDistribution,
      sourceCount
    };
  }

  _calcAvgIntention(leads) {
    if (leads.length === 0) return 0;
    const scores = { A: 3, B: 2, C: 1, unknown: 0 };
    const total = leads.reduce((sum, l) => sum + (scores[l.intentionLevel] || 0), 0);
    return (total / leads.length).toFixed(2);
  }

  _getFollowUpLeads(allLeads) {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    return allLeads
      .filter(lead => {
        if (lead.status === 'converted') return false;
        const lastFollowUp = lead.lastFollowUpAt ? new Date(lead.lastFollowUpAt) : new Date(lead.createdAt);
        return lastFollowUp < threeDaysAgo;
      })
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(0, 10)
      .map(l => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        intentionLevel: l.intentionLevel,
        source: l.source,
        needs: l.needs,
        lastFollowUpAt: l.lastFollowUpAt || l.createdAt,
        daysSinceFollowUp: Math.floor((now - new Date(l.lastFollowUpAt || l.createdAt)) / (1000 * 60 * 60 * 24))
      }));
  }

  _analyzeChannels(leads) {
    const channels = {};
    leads.forEach(lead => {
      const source = lead.source || '未知';
      if (!channels[source]) {
        channels[source] = { total: 0, highIntent: 0, converted: 0 };
      }
      channels[source].total++;
      if (lead.intentionLevel === 'A') channels[source].highIntent++;
      if (lead.status === 'converted') channels[source].converted++;
    });

    return Object.entries(channels)
      .map(([name, data]) => ({
        name,
        ...data,
        highIntentRate: data.total > 0 ? ((data.highIntent / data.total) * 100).toFixed(1) + '%' : '0%'
      }))
      .sort((a, b) => b.total - a.total);
  }

  _buildFunnel(periodLeads, allLeads) {
    return {
      visitors: allLeads.length * 5, // 估算访客数
      conversations: allLeads.length * 2, // 估算对话数
      leads: allLeads.length,
      qualifiedLeads: allLeads.filter(l => l.intentionLevel === 'A' || l.intentionLevel === 'B').length,
      highIntent: allLeads.filter(l => l.intentionLevel === 'A').length,
      converted: allLeads.filter(l => l.status === 'converted').length
    };
  }

  async _generateAISummary(type, stats, leads, followUps) {
    const prompt = `请根据以下获客数据生成一份${type === 'daily' ? '日报' : '周报'}摘要和行动建议。

【核心数据】
- 新增线索: ${stats.keyMetrics.totalLeads}
- 高意向(A级): ${stats.keyMetrics.highIntent}
- 中意向(B级): ${stats.keyMetrics.mediumIntent}
- 低意向(C级): ${stats.keyMetrics.lowIntent}
- 已转化: ${stats.keyMetrics.converted}
- 转化率: ${stats.keyMetrics.conversionRate}
- 待跟进线索: ${followUps.length}

【意向分布】
A级: ${stats.intentionDistribution.A}, B级: ${stats.intentionDistribution.B}, C级: ${stats.intentionDistribution.C}

请返回JSON格式：
{
  "summary": "100字以内的摘要，突出亮点和问题",
  "recommendations": ["建议1", "建议2", "建议3"]
}`;

    try {
      const result = await this.llmService.chat([
        { role: 'system', content: '你是专业的营销数据分析专家，擅长从数据中发现问题并给出可执行建议。' },
        { role: 'user', content: prompt }
      ]);

      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || '',
          recommendations: parsed.recommendations || []
        };
      }
    } catch (e) {
      // 降级处理
    }

    return {
      summary: this._generateFallbackSummary(type, stats),
      recommendations: this._getDefaultRecommendations(stats, followUps)
    };
  }

  _generateFallbackSummary(type, stats) {
    const period = type === 'daily' ? '今日' : '本周';
    let summary = `${period}新增线索 ${stats.keyMetrics.totalLeads} 条，`;
    summary += `其中高意向 ${stats.keyMetrics.highIntent} 条，转化率 ${stats.keyMetrics.conversionRate}。`;
    if (stats.keyMetrics.highIntent > 0) {
      summary += `高意向线索表现良好，建议重点跟进。`;
    } else {
      summary += `高意向线索较少，建议优化承接话术和资格筛选。`;
    }
    return summary;
  }

  _getDefaultRecommendations(stats, followUps) {
    const recs = [];
    if (followUps.length > 0) {
      recs.push(`有 ${followUps.length} 条线索超过3天未跟进，请优先处理`);
    }
    if (stats.keyMetrics.lowIntent > stats.keyMetrics.highIntent * 2) {
      recs.push('低意向线索占比过高，建议优化落地页和投放定向');
    }
    if (stats.keyMetrics.conversionRate < '5%') {
      recs.push('转化率偏低，建议加强跟进SOP和逼单话术');
    }
    recs.push('持续维护知识库，提升AI回复准确率');
    return recs;
  }

  _generateTodos(followUps, highIntent, stats) {
    const todos = [];

    if (followUps.length > 0) {
      todos.push({
        priority: 'high',
        title: `跟进 ${followUps.length} 条超期未跟进线索`,
        description: '这些线索已超过3天未联系，可能流失',
        action: '打开线索管理，筛选待跟进线索'
      });
    }

    if (highIntent.length > 0) {
      todos.push({
        priority: 'high',
        title: `重点跟进 ${highIntent.length} 条A级高意向线索`,
        description: '高意向线索转化概率最高，建议24小时内联系',
        action: '查看高意向线索列表'
      });
    }

    todos.push({
      priority: 'medium',
      title: '检查AI承接效果',
      description: '查看今日对话记录，优化话术和FAQ',
      action: '打开对话记录页面'
    });

    return todos;
  }

  _saveReport(report) {
    const filename = `${report.type}-${report.dateRange.start.split('T')[0]}.json`;
    const file = path.join(this.storagePath, filename);
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
  }

  /**
   * 获取报告列表
   */
  listReports(type = null, limit = 20) {
    try {
      const files = fs.readdirSync(this.storagePath)
        .filter(f => f.endsWith('.json'))
        .filter(f => !type || f.startsWith(type))
        .sort()
        .reverse()
        .slice(0, limit);

      return files.map(f => {
        const content = JSON.parse(fs.readFileSync(path.join(this.storagePath, f), 'utf-8'));
        return {
          id: content.id,
          type: content.type,
          title: content.title,
          dateRange: content.dateRange,
          generatedAt: content.generatedAt,
          keyMetrics: content.keyMetrics
        };
      });
    } catch (e) {
      return [];
    }
  }

  /**
   * 获取报告详情
   */
  getReport(id) {
    try {
      const files = fs.readdirSync(this.storagePath).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const content = JSON.parse(fs.readFileSync(path.join(this.storagePath, file), 'utf-8'));
        if (content.id === id) return content;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 发送报告通知
   */
  async sendReportNotification(report) {
    if (!this.notificationService || !this.notificationService._sendSystemNotification) return false;

    const message = `📊 ${report.title}已生成\n` +
      `📅 ${report.dateRange.label}\n` +
      `📈 新增线索: ${report.keyMetrics.totalLeads}\n` +
      `🎯 高意向: ${report.keyMetrics.highIntent}\n` +
      `✅ 转化率: ${report.keyMetrics.conversionRate}\n` +
      `⏰ 待跟进: ${report.followUps.length} 条`;

    this.notificationService._sendSystemNotification('report', {
      title: report.title,
      message,
      reportId: report.id,
      priority: 'medium'
    });

    return true;
  }
}

module.exports = ReportService;
