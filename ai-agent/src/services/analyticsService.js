/**
 * 对话质量分析服务
 * 分析对话转化率、平均对话时长、意向等级分布、高频问题，生成对话效果报告
 */

const fs = require('fs');
const path = require('path');

class AnalyticsService {
  constructor(leadStorage, conversationStorage) {
    this.leadStorage = leadStorage;
    this.conversationStorage = conversationStorage;
  }

  /**
   * 获取综合分析报告
   * @param {Object} options - 选项（时间范围等）
   * @returns {Object} - 分析报告
   */
  getReport(options = {}) {
    const stats = this.leadStorage.getStats();
    const leads = this.leadStorage.list({ page: 1, pageSize: 10000 }).leads;

    return {
      overview: this._getOverview(stats, leads),
      conversion: this._getConversionAnalysis(stats, leads),
      intention: this._getIntentionAnalysis(stats, leads),
      source: this._getSourceAnalysis(stats, leads),
      trends: this._getTrendAnalysis(leads),
      recommendations: this._getRecommendations(stats, leads)
    };
  }

  /**
   * 获取概览数据
   */
  _getOverview(stats, leads) {
    const convertedLeads = leads.filter(l => l.status === 'converted');
    const avgTimeToConvert = this._calculateAvgTimeToConvert(convertedLeads);

    return {
      totalLeads: stats.total,
      todayNew: stats.todayNew,
      convertedCount: convertedLeads.length,
      conversionRate: stats.conversionRate,
      avgTimeToConvert: avgTimeToConvert,
      aLevelCount: stats.byIntentionLevel.A,
      aLevelRate: stats.total > 0 ? ((stats.byIntentionLevel.A / stats.total) * 100).toFixed(1) : 0
    };
  }

  /**
   * 转化分析
   */
  _getConversionAnalysis(stats, leads) {
    const statusFlow = {
      new: stats.byStatus.new || 0,
      following: stats.byStatus.following || 0,
      interested: stats.byStatus.interested || 0,
      converted: stats.byStatus.converted || 0,
      lost: stats.byStatus.lost || 0
    };

    // 计算各阶段转化率
    const total = statusFlow.new + statusFlow.following + statusFlow.interested + statusFlow.converted;
    const rates = {
      newToFollowing: total > 0 ? (((statusFlow.following + statusFlow.interested + statusFlow.converted) / total) * 100).toFixed(1) : 0,
      followingToInterested: (statusFlow.following + statusFlow.interested) > 0 ? ((statusFlow.interested / (statusFlow.following + statusFlow.interested)) * 100).toFixed(1) : 0,
      interestedToConverted: statusFlow.interested > 0 ? ((statusFlow.converted / statusFlow.interested) * 100).toFixed(1) : 0
    };

    return {
      statusFlow,
      rates,
      funnel: [
        { stage: '新线索', count: statusFlow.new },
        { stage: '跟进中', count: statusFlow.following },
        { stage: '有意向', count: statusFlow.interested },
        { stage: '已转化', count: statusFlow.converted }
      ]
    };
  }

  /**
   * 意向等级分析
   */
  _getIntentionAnalysis(stats, leads) {
    const byLevel = {
      A: stats.byIntentionLevel.A || 0,
      B: stats.byIntentionLevel.B || 0,
      C: stats.byIntentionLevel.C || 0
    };

    // 各等级转化率
    const conversionByLevel = {};
    ['A', 'B', 'C'].forEach(level => {
      const levelLeads = leads.filter(l => l.intentionLevel === level);
      const converted = levelLeads.filter(l => l.status === 'converted');
      conversionByLevel[level] = {
        total: levelLeads.length,
        converted: converted.length,
        rate: levelLeads.length > 0 ? ((converted.length / levelLeads.length) * 100).toFixed(1) : 0
      };
    });

    return {
      distribution: byLevel,
      conversionByLevel
    };
  }

  /**
   * 来源分析
   */
  _getSourceAnalysis(stats, leads) {
    const bySource = stats.bySource || {};

    // 各来源转化率
    const conversionBySource = {};
    Object.keys(bySource).forEach(source => {
      const sourceLeads = leads.filter(l => l.source === source);
      const converted = sourceLeads.filter(l => l.status === 'converted');
      conversionBySource[source] = {
        total: sourceLeads.length,
        converted: converted.length,
        rate: sourceLeads.length > 0 ? ((converted.length / sourceLeads.length) * 100).toFixed(1) : 0
      };
    });

    // 按数量排序
    const sortedSources = Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({ source, count }));

    return {
      distribution: bySource,
      conversionBySource,
      topSources: sortedSources.slice(0, 5)
    };
  }

  /**
   * 趋势分析（按天统计）
   */
  _getTrendAnalysis(leads) {
    const dailyStats = {};
    const now = new Date();

    // 初始化最近7天
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      dailyStats[dateStr] = { total: 0, converted: 0, aLevel: 0 };
    }

    // 统计
    leads.forEach(lead => {
      const dateStr = (lead.createdAt || '').slice(0, 10);
      if (dailyStats[dateStr]) {
        dailyStats[dateStr].total++;
        if (lead.status === 'converted') dailyStats[dateStr].converted++;
        if (lead.intentionLevel === 'A') dailyStats[dateStr].aLevel++;
      }
    });

    // 转换为数组
    const trend = Object.entries(dailyStats).map(([date, data]) => ({
      date,
      ...data
    }));

    return { daily: trend };
  }

  /**
   * 生成优化建议
   */
  _getRecommendations(stats, leads) {
    const recommendations = [];

    // 转化率低
    if (stats.conversionRate < 5) {
      recommendations.push({
        level: 'high',
        title: '转化率偏低',
        description: `当前转化率仅 ${stats.conversionRate}%，建议优化跟进话术和响应速度，重点关注 A/B 级意向线索。`,
        action: '检查线索培育流程，优化首次响应时间'
      });
    }

    // A级线索占比低
    const aLevelRate = stats.total > 0 ? (stats.byIntentionLevel.A / stats.total) * 100 : 0;
    if (aLevelRate < 10) {
      recommendations.push({
        level: 'medium',
        title: '高质量线索占比低',
        description: `A级意向线索仅占 ${aLevelRate.toFixed(1)}%，建议优化广告定向和落地页话术，提高线索质量。`,
        action: '分析高转化来源渠道，加大优质渠道投入'
      });
    }

    // 新线索过多但跟进不足
    if (stats.byStatus.new > stats.byStatus.following + stats.byStatus.interested) {
      recommendations.push({
        level: 'high',
        title: '线索积压风险',
        description: `有 ${stats.byStatus.new} 条新线索未跟进，建议及时分配跟进，避免线索流失。`,
        action: '启用实时通知，设置跟进提醒'
      });
    }

    // 来源单一
    const sourceCount = Object.keys(stats.bySource || {}).length;
    if (sourceCount <= 1) {
      recommendations.push({
        level: 'low',
        title: '获客渠道单一',
        description: '当前线索来源渠道较少，建议拓展多渠道获客，降低单一渠道依赖风险。',
        action: '测试新的广告平台和内容营销渠道'
      });
    }

    // 默认建议
    if (recommendations.length === 0) {
      recommendations.push({
        level: 'info',
        title: '运营状态良好',
        description: '当前各项指标表现正常，建议持续优化话术和跟进流程，保持稳定增长。',
        action: '定期查看分析报告，持续优化获客流程'
      });
    }

    return recommendations;
  }

  /**
   * 计算平均转化时长
   */
  _calculateAvgTimeToConvert(convertedLeads) {
    if (convertedLeads.length === 0) return '暂无数据';

    const times = convertedLeads
      .filter(l => l.createdAt && l.updatedAt)
      .map(l => {
        const created = new Date(l.createdAt).getTime();
        const updated = new Date(l.updatedAt).getTime();
        return (updated - created) / (1000 * 60 * 60); // 小时
      });

    if (times.length === 0) return '暂无数据';

    const avgHours = times.reduce((a, b) => a + b, 0) / times.length;
    if (avgHours < 24) return avgHours.toFixed(1) + ' 小时';
    return (avgHours / 24).toFixed(1) + ' 天';
  }
}

module.exports = AnalyticsService;
