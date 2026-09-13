/**
 * 线索存储服务
 * 基于文件系统的线索持久化存储
 */
const fs = require('fs');
const path = require('path');
const Lead = require('../models/lead');

class LeadStorageService {
  constructor(config) {
    this.storagePath = config.lead.storagePath;
    this.indexFile = path.join(this.storagePath, 'index.json');
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
    if (!fs.existsSync(this.indexFile)) {
      fs.writeFileSync(this.indexFile, JSON.stringify({ leads: [] }, null, 2));
    }
  }

  _readIndex() {
    try {
      const data = fs.readFileSync(this.indexFile, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return { leads: [] };
    }
  }

  _writeIndex(index) {
    fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2));
  }

  /**
   * 创建新线索
   */
  create(leadData) {
    const lead = new Lead(leadData);
    const filePath = path.join(this.storagePath, lead.id + '.json');
    fs.writeFileSync(filePath, JSON.stringify(lead.toJSON(), null, 2));

    const index = this._readIndex();
    index.leads.push({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      intentionLevel: lead.intentionLevel,
      status: lead.status,
      source: lead.source,
      createdAt: lead.createdAt
    });
    this._writeIndex(index);

    return lead;
  }

  /**
   * 根据 ID 获取线索
   */
  getById(id) {
    const filePath = path.join(this.storagePath, id + '.json');
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Lead.fromJSON(data);
  }

  /**
   * 更新线索
   */
  update(id, updateData) {
    const lead = this.getById(id);
    if (!lead) {
      return null;
    }
    lead.update(updateData);
    const filePath = path.join(this.storagePath, id + '.json');
    fs.writeFileSync(filePath, JSON.stringify(lead.toJSON(), null, 2));

    // 更新索引
    const index = this._readIndex();
    const idx = index.leads.findIndex(l => l.id === id);
    if (idx !== -1) {
      index.leads[idx] = {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        intentionLevel: lead.intentionLevel,
        status: lead.status,
        source: lead.source,
        createdAt: lead.createdAt
      };
      this._writeIndex(index);
    }

    return lead;
  }

  /**
   * 获取所有线索（列表）
   */
  list(filters = {}) {
    const index = this._readIndex();
    let leads = index.leads;

    // 按意向等级筛选
    if (filters.intentionLevel) {
      leads = leads.filter(l => l.intentionLevel === filters.intentionLevel);
    }

    // 按状态筛选
    if (filters.status) {
      leads = leads.filter(l => l.status === filters.status);
    }

    // 按来源筛选
    if (filters.source) {
      leads = leads.filter(l => l.source === filters.source);
    }

    // 按创建时间排序（最新在前）
    leads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 分页
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const start = (page - 1) * pageSize;
    const paginated = leads.slice(start, start + pageSize);

    return {
      leads: paginated,
      total: leads.length,
      page,
      pageSize
    };
  }

  /**
   * 获取统计数据
   */
  getStats() {
    const index = this._readIndex();
    const leads = index.leads;

    const stats = {
      total: leads.length,
      byIntentionLevel: { A: 0, B: 0, C: 0 },
      byStatus: { new: 0, following: 0, interested: 0, converted: 0, lost: 0 },
      bySource: {},
      todayNew: 0,
      thisWeekNew: 0,
      conversionRate: 0
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    leads.forEach(lead => {
      // 意向等级统计
      if (stats.byIntentionLevel[lead.intentionLevel] !== undefined) {
        stats.byIntentionLevel[lead.intentionLevel]++;
      }

      // 状态统计
      if (stats.byStatus[lead.status] !== undefined) {
        stats.byStatus[lead.status]++;
      }

      // 来源统计
      if (!stats.bySource[lead.source]) {
        stats.bySource[lead.source] = 0;
      }
      stats.bySource[lead.source]++;

      // 时间统计
      const createdAt = new Date(lead.createdAt);
      if (createdAt >= todayStart) {
        stats.todayNew++;
      }
      if (createdAt >= weekStart) {
        stats.thisWeekNew++;
      }
    });

    // 转化率
    if (stats.total > 0) {
      stats.conversionRate = ((stats.byStatus.converted / stats.total) * 100).toFixed(1);
    }

    return stats;
  }

  /**
   * 删除线索
   */
  delete(id) {
    const filePath = path.join(this.storagePath, id + '.json');
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const index = this._readIndex();
    index.leads = index.leads.filter(l => l.id !== id);
    this._writeIndex(index);

    return true;
  }
}

module.exports = LeadStorageService;
