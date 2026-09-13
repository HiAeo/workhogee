/**
 * 数据导出服务
 * 支持线索数据导出为 CSV 格式
 */

const fs = require('fs');
const path = require('path');

class ExportService {
  constructor(leadStorage) {
    this.leadStorage = leadStorage;
  }

  /**
   * 导出线索数据为 CSV
   * @param {Object} filters - 筛选条件
   * @returns {string} - CSV 内容
   */
  exportLeadsToCSV(filters = {}) {
    // 获取所有线索（不分页）
    const result = this.leadStorage.list({
      ...filters,
      page: 1,
      pageSize: 10000
    });

    const leads = result.leads;

    // CSV 表头
    const headers = [
      'ID', '姓名', '电话', '微信', '邮箱',
      '来源', '意向等级', '状态', '预算', '决策周期',
      '需求', '痛点', '备注', '创建时间', '更新时间'
    ];

    // CSV 行数据
    const rows = leads.map(lead => [
      this._escapeCSV(lead.id),
      this._escapeCSV(lead.name || ''),
      this._escapeCSV(lead.phone || ''),
      this._escapeCSV(lead.wechat || ''),
      this._escapeCSV(lead.email || ''),
      this._escapeCSV(lead.source || ''),
      this._escapeCSV(lead.intentionLevel || ''),
      this._escapeCSV(this._getStatusText(lead.status)),
      this._escapeCSV(lead.budget || ''),
      this._escapeCSV(lead.decisionCycle || ''),
      this._escapeCSV(lead.needs || ''),
      this._escapeCSV(lead.painPoints || ''),
      this._escapeCSV(lead.notes || ''),
      this._escapeCSV(lead.createdAt || ''),
      this._escapeCSV(lead.updatedAt || '')
    ]);

    // 组合 CSV 内容（添加 BOM 以支持 Excel 中文）
    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return {
      content: csvContent,
      filename: `leads_export_${new Date().toISOString().slice(0, 10)}.csv`,
      count: leads.length,
      mimeType: 'text/csv; charset=utf-8'
    };
  }

  /**
   * 导出统计数据为 CSV
   * @returns {string} - CSV 内容
   */
  exportStatsToCSV() {
    const stats = this.leadStorage.getStats();

    const rows = [
      ['指标', '数值'],
      ['总线索数', stats.total],
      ['今日新增', stats.todayNew],
      ['本周新增', stats.thisWeekNew],
      ['A级意向', stats.byIntentionLevel.A],
      ['B级意向', stats.byIntentionLevel.B],
      ['C级意向', stats.byIntentionLevel.C],
      ['新线索', stats.byStatus.new],
      ['跟进中', stats.byStatus.following],
      ['有意向', stats.byStatus.interested],
      ['已转化', stats.byStatus.converted],
      ['已流失', stats.byStatus.lost],
      ['转化率(%)', stats.conversionRate]
    ];

    // 添加来源分布
    Object.entries(stats.bySource).forEach(([source, count]) => {
      rows.push([`来源: ${source}`, count]);
    });

    const csvContent = '\uFEFF' + rows.map(row =>
      row.map(cell => this._escapeCSV(String(cell))).join(',')
    ).join('\n');

    return {
      content: csvContent,
      filename: `stats_export_${new Date().toISOString().slice(0, 10)}.csv`,
      count: rows.length - 1,
      mimeType: 'text/csv; charset=utf-8'
    };
  }

  /**
   * 导出对话记录为 CSV
   * @param {string} conversationId - 对话ID（可选，不填则导出所有）
   * @returns {Object} - 导出结果
   */
  exportConversationToCSV(conversationId = null) {
    // 这个功能需要 conversationStorage，暂时返回提示
    return {
      content: '',
      filename: '',
      count: 0,
      mimeType: 'text/csv; charset=utf-8',
      message: '对话记录导出功能开发中'
    };
  }

  /**
   * 转义 CSV 特殊字符
   */
  _escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * 获取状态文本
   */
  _getStatusText(status) {
    const map = {
      new: '新线索',
      following: '跟进中',
      interested: '有意向',
      converted: '已转化',
      lost: '已流失'
    };
    return map[status] || status;
  }
}

module.exports = ExportService;
