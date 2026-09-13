/**
 * 实时通知服务
 * 新线索到达时通过 Webhook/邮件/系统通知提醒用户
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class NotificationService {
  constructor(config) {
    this.config = config;
    this.storagePath = path.join(__dirname, '../../data/notifications');
    this.rulesFile = path.join(this.storagePath, 'rules.json');
    this.logsFile = path.join(this.storagePath, 'logs.json');
    this._ensureDir();
    this._loadRules();
    this._loadLogs();
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  _loadRules() {
    try {
      if (fs.existsSync(this.rulesFile)) {
        this.rules = JSON.parse(fs.readFileSync(this.rulesFile, 'utf-8'));
      } else {
        this.rules = {
          newLead: {
            enabled: true,
            channels: ['system'],
            webhookUrl: '',
            email: '',
            minIntentionLevel: 'C'
          }
        };
        this._saveRules();
      }
    } catch (e) {
      this.rules = { newLead: { enabled: true, channels: ['system'], webhookUrl: '', email: '', minIntentionLevel: 'C' } };
    }
  }

  _saveRules() {
    fs.writeFileSync(this.rulesFile, JSON.stringify(this.rules, null, 2));
  }

  _loadLogs() {
    try {
      if (fs.existsSync(this.logsFile)) {
        this.logs = JSON.parse(fs.readFileSync(this.logsFile, 'utf-8'));
      } else {
        this.logs = [];
      }
    } catch (e) {
      this.logs = [];
    }
  }

  _saveLogs() {
    if (this.logs.length > 5000) {
      this.logs = this.logs.slice(-5000);
    }
    fs.writeFileSync(this.logsFile, JSON.stringify(this.logs, null, 2));
  }

  /**
   * 发送新线索通知
   * @param {Object} lead - 线索数据
   */
  async notifyNewLead(lead) {
    const rule = this.rules.newLead;
    if (!rule.enabled) return { success: false, message: '通知已禁用' };

    // 检查意向等级阈值
    const levels = ['A', 'B', 'C'];
    const leadLevelIndex = levels.indexOf(lead.intentionLevel);
    const minLevelIndex = levels.indexOf(rule.minIntentionLevel);
    if (leadLevelIndex > minLevelIndex) {
      return { success: false, message: '意向等级低于阈值，不发送通知' };
    }

    const results = [];

    // 系统通知（记录到日志）
    if (rule.channels.includes('system')) {
      results.push(this._sendSystemNotification('new_lead', lead));
    }

    // Webhook 通知
    if (rule.channels.includes('webhook') && rule.webhookUrl) {
      results.push(await this._sendWebhook(rule.webhookUrl, 'new_lead', lead));
    }

    // 邮件通知（简化版，实际需要 SMTP 配置）
    if (rule.channels.includes('email') && rule.email) {
      results.push(this._sendEmailNotification(rule.email, lead));
    }

    return { success: true, channels: results };
  }

  /**
   * 系统通知（记录到日志）
   */
  _sendSystemNotification(type, data) {
    const notification = {
      id: Date.now().toString(),
      type,
      title: type === 'new_lead' ? '新线索到达' : '通知',
      message: type === 'new_lead'
        ? `新线索：${data.name || '未命名客户'}（${data.intentionLevel}级意向），来源：${data.source}`
        : '新通知',
      data,
      read: false,
      createdAt: new Date().toISOString()
    };

    this.logs.unshift(notification);
    this._saveLogs();

    return { channel: 'system', success: true };
  }

  /**
   * 发送 Webhook 通知
   */
  async _sendWebhook(url, type, data) {
    return new Promise((resolve) => {
      try {
        const payload = JSON.stringify({
          event: type,
          timestamp: new Date().toISOString(),
          data
        });

        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'User-Agent': 'WorkHogee-Notification/1.0'
          }
        };

        const req = (urlObj.protocol === 'https:' ? https : http).request(options, (res) => {
          resolve({ channel: 'webhook', success: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode });
        });

        req.on('error', (e) => {
          resolve({ channel: 'webhook', success: false, error: e.message });
        });

        req.write(payload);
        req.end();
      } catch (e) {
        resolve({ channel: 'webhook', success: false, error: e.message });
      }
    });
  }

  /**
   * 邮件通知（简化版）
   */
  _sendEmailNotification(email, lead) {
    // 简化版：只记录日志，实际需要 SMTP 配置
    const notification = {
      id: Date.now().toString() + '_email',
      type: 'email',
      to: email,
      subject: `【WorkHogee】新线索：${lead.name || '未命名客户'}`,
      body: `新线索到达：\n姓名：${lead.name || '未命名'}\n电话：${lead.phone || '-'}\n意向等级：${lead.intentionLevel}\n来源：${lead.source}\n需求：${lead.needs || '-'}\n\n请及时跟进。`,
      sentAt: new Date().toISOString()
    };

    this.logs.unshift(notification);
    this._saveLogs();

    return { channel: 'email', success: true, note: '邮件已记录（需配置SMTP才能实际发送）' };
  }

  /**
   * 获取通知列表
   * @param {Object} options - 选项
   * @returns {Object}
   */
  getNotifications(options = {}) {
    const { page = 1, pageSize = 20, unreadOnly = false } = options;
    let filtered = this.logs;

    if (unreadOnly) {
      filtered = filtered.filter(n => n.read === false);
    }

    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const items = filtered.slice(start, end);

    return {
      items,
      total: filtered.length,
      page,
      pageSize,
      unreadCount: this.logs.filter(n => n.read === false).length
    };
  }

  /**
   * 标记通知为已读
   * @param {string} id - 通知 ID
   */
  markAsRead(id) {
    const notification = this.logs.find(n => n.id === id);
    if (notification) {
      notification.read = true;
      notification.readAt = new Date().toISOString();
      this._saveLogs();
      return true;
    }
    return false;
  }

  /**
   * 标记所有通知为已读
   */
  markAllAsRead() {
    this.logs.forEach(n => { n.read = true; n.readAt = new Date().toISOString(); });
    this._saveLogs();
    return true;
  }

  /**
   * 更新通知规则
   * @param {string} ruleName - 规则名称
   * @param {Object} updates - 更新内容
   */
  updateRule(ruleName, updates) {
    if (this.rules[ruleName]) {
      this.rules[ruleName] = { ...this.rules[ruleName], ...updates };
      this._saveRules();
      return this.rules[ruleName];
    }
    return null;
  }

  /**
   * 获取通知规则
   */
  getRules() {
    return this.rules;
  }
}

module.exports = NotificationService;
