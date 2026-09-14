/**
 * 广告转化回传服务（出海专版）
 * 广告平台配置管理、Meta Conversions API 回传（已实现）、
 * Google Ads Enhanced Conversions / TikTok Events API（预留骨架）、回传日志、线索成交自动回传
 * 开发环境使用 JSON 文件存储到 data/ad-conversion/ 目录
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

// 敏感字段列表（列表/详情接口返回时掩码）
const SENSITIVE_FIELDS = ['accessToken', 'oauthToken', 'token', 'secret'];

class AdConversionService {
  constructor(config, leadStorage) {
    this.config = config;
    this.leadStorage = leadStorage; // 注入线索存储，用于标记线索成交
    this.storagePath = './data/ad-conversion';
    this.platformsFile = path.join(this.storagePath, 'platforms.json');
    this.logsFile = path.join(this.storagePath, 'logs.json');
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
    [this.platformsFile, this.logsFile].forEach((f) => {
      if (!fs.existsSync(f)) {
        fs.writeFileSync(f, JSON.stringify([], null, 2));
      }
    });
  }

  _read(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
      return [];
    }
  }

  _write(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  /**
   * 对敏感值做掩码显示，如 ****1a2b
   */
  _maskValue(val) {
    if (!val) return '';
    const s = String(val);
    if (s.length <= 4) return '****';
    return '****' + s.slice(-4);
  }

  /**
   * 对平台配置中的敏感字段做掩码（不修改原始存储）
   */
  _maskPlatform(platform) {
    const masked = Object.assign({}, platform);
    if (masked.config) {
      const cfg = Object.assign({}, masked.config);
      SENSITIVE_FIELDS.forEach((k) => {
        if (cfg[k]) cfg[k] = this._maskValue(cfg[k]);
      });
      masked.config = cfg;
    }
    return masked;
  }

  // ===== 广告平台配置 CRUD =====

  /**
   * 列出已配置的广告平台（敏感字段掩码）
   */
  listPlatforms() {
    return this._read(this.platformsFile).map(p => this._maskPlatform(p));
  }

  /**
   * 添加平台配置
   */
  createPlatform({ platformType, config }) {
    if (!['meta', 'google', 'tiktok'].includes(platformType)) {
      throw new Error('不支持的平台类型，仅支持 meta/google/tiktok');
    }
    const list = this._read(this.platformsFile);
    const now = new Date().toISOString();
    const platform = {
      id: crypto.randomUUID(),
      platformType: platformType,
      config: config || {},
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    list.push(platform);
    this._write(this.platformsFile, list);
    return this._maskPlatform(platform);
  }

  /**
   * 获取单个平台配置（敏感字段掩码）
   */
  getPlatform(id) {
    const list = this._read(this.platformsFile);
    const platform = list.find(p => p.id === id);
    return platform ? this._maskPlatform(platform) : null;
  }

  /**
   * 更新平台配置
   */
  updatePlatform(id, patch) {
    const list = this._read(this.platformsFile);
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;
    if (patch.platformType) list[idx].platformType = patch.platformType;
    if (patch.config) {
      // 合并配置：掩码字段（****xxxx）原样保留旧值，避免覆盖真实 token
      const old = list[idx].config || {};
      const incoming = patch.config || {};
      const merged = Object.assign({}, old);
      Object.keys(incoming).forEach((k) => {
        const v = incoming[k];
        if (SENSITIVE_FIELDS.includes(k) && typeof v === 'string' && v.startsWith('****')) {
          return; // 前端回传的掩码值，保留旧配置
        }
        merged[k] = v;
      });
      list[idx].config = merged;
    }
    if (patch.status) list[idx].status = patch.status;
    list[idx].updatedAt = new Date().toISOString();
    this._write(this.platformsFile, list);
    return this._maskPlatform(list[idx]);
  }

  /**
   * 删除平台配置
   */
  deletePlatform(id) {
    const list = this._read(this.platformsFile);
    const next = list.filter(p => p.id !== id);
    this._write(this.platformsFile, next);
    return next.length !== list.length;
  }

  // ===== HTTP 调用工具（Node 内置 https） =====

  _postJson(urlStr, bodyObj, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const url = new URL(urlStr);
      const body = JSON.stringify(bodyObj);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: timeoutMs
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode, body: data });
        });
      });
      req.on('error', (e) => resolve({ statusCode: 0, body: JSON.stringify({ error: e.message }) }));
      req.on('timeout', () => { req.destroy(); resolve({ statusCode: 0, body: JSON.stringify({ error: 'timeout' }) }); });
      req.write(body);
      req.end();
    });
  }

  // ===== 转化事件哈希 =====

  _hash(plain) {
    if (!plain) return null;
    return crypto.createHash('sha256').update(String(plain).toLowerCase().trim()).digest('hex');
  }

  // ===== Meta Conversions API =====

  /**
   * 发送 Meta 转化事件
   * @param {Object} platformConfig - 平台原始配置（pixelId, accessToken）
   * @param {Object} eventData - {eventName, value, currency, orderId, email, phone, eventTime}
   */
  async sendMetaConversion(platformConfig, eventData) {
    const pixelId = platformConfig.pixelId || platformConfig.pixel_id;
    const accessToken = platformConfig.accessToken || platformConfig.access_token;
    if (!pixelId || !accessToken) {
      return { success: false, status: 'missing_config', error: '缺少 Meta pixelId 或 accessToken' };
    }
    const eventTime = eventData.eventTime || Math.floor(Date.now() / 1000);
    const userData = {};
    if (eventData.email) userData.em = [this._hash(eventData.email)].filter(Boolean);
    if (eventData.phone) userData.ph = [this._hash(eventData.phone)].filter(Boolean);

    const payload = {
      data: [{
        event_name: eventData.eventName || 'Lead',
        event_time: eventTime,
        action_source: 'website',
        user_data: userData,
        custom_data: {
          value: eventData.value,
          currency: eventData.currency || 'USD',
          order_id: eventData.orderId || undefined
        }
      }]
    };

    const url = `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
    const resp = await this._postJson(url, payload);
    let parsed;
    try { parsed = JSON.parse(resp.body); } catch (e) { parsed = { raw: resp.body }; }
    return {
      success: resp.statusCode >= 200 && resp.statusCode < 300,
      statusCode: resp.statusCode,
      response: parsed
    };
  }

  // ===== Google Ads（预留骨架） =====

  async sendGoogleConversion(platformConfig, eventData) {
    console.log('[AdConversion] Google Ads Enhanced Conversions 未实现，跳过发送', { eventName: eventData.eventName });
    return { success: false, status: 'not_implemented', error: 'Google Ads 回传接口预留，暂未实现' };
  }

  // ===== TikTok Events API（预留骨架） =====

  async sendTikTokConversion(platformConfig, eventData) {
    console.log('[AdConversion] TikTok Events API 未实现，跳过发送', { eventName: eventData.eventName });
    return { success: false, status: 'not_implemented', error: 'TikTok 回传接口预留，暂未实现' };
  }

  // ===== 回传日志 =====

  _log(entry) {
    const list = this._read(this.logsFile);
    list.push(Object.assign({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    }, entry));
    // 限制日志文件大小（最多保留 5000 条）
    while (list.length > 5000) list.shift();
    this._write(this.logsFile, list);
  }

  /**
   * 回传日志列表（支持 platform/status 筛选与分页）
   */
  listLogs(filters = {}) {
    let list = this._read(this.logsFile);
    if (filters.platform) list = list.filter(l => l.platformType === filters.platform);
    if (filters.status) list = list.filter(l => l.status === filters.status);
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const page = parseInt(filters.page) || 1;
    const pageSize = parseInt(filters.pageSize) || 20;
    const start = (page - 1) * pageSize;
    return { logs: list.slice(start, start + pageSize), total: list.length, page, pageSize };
  }

  // ===== 实际发送编排 =====

  /**
   * 向指定平台原始配置发送转化事件
   */
  async _sendToPlatform(platform, eventData) {
    let result;
    if (platform.platformType === 'meta') {
      result = await this.sendMetaConversion(platform.config, eventData);
    } else if (platform.platformType === 'google') {
      result = await this.sendGoogleConversion(platform.config, eventData);
    } else if (platform.platformType === 'tiktok') {
      result = await this.sendTikTokConversion(platform.config, eventData);
    } else {
      result = { success: false, status: 'unknown_platform' };
    }
    // 写日志
    this._log({
      platformId: platform.id,
      platformType: platform.platformType,
      leadId: eventData.leadId || null,
      eventName: eventData.eventName,
      eventTime: eventData.eventTime || Math.floor(Date.now() / 1000),
      status: result.success ? 'success' : (result.status || 'failed'),
      response: result.response || { error: result.error || '' }
    });
    return result;
  }

  /**
   * 手动向所有已启用平台发送转化事件
   * @param {Object} eventData - {leadId, eventName, value, currency, orderId, email, phone}
   */
  async sendConversion(eventData) {
    const platforms = this._read(this.platformsFile).filter(p => p.status === 'active');
    if (platforms.length === 0) {
      throw new Error('尚未配置任何广告平台');
    }
    const results = [];
    for (const p of platforms) {
      const r = await this._sendToPlatform(p, eventData);
      results.push({ platform: p.platformType, platformId: p.id, ...r });
    }
    return { sent: results.length, results: results };
  }

  /**
   * 测试单个平台连接（发送测试事件）
   */
  async testPlatform(id) {
    const list = this._read(this.platformsFile);
    const platform = list.find(p => p.id === id);
    if (!platform) throw new Error('平台配置不存在');
    const result = await this._sendToPlatform(platform, {
      eventName: 'TestEvent',
      value: 0,
      currency: 'USD',
      eventTime: Math.floor(Date.now() / 1000)
    });
    return result;
  }

  /**
   * 标记线索成交并自动触发广告回传
   * @param {string} leadId - 线索 ID
   * @param {Object} conversionData - {value, currency, orderId}
   */
  async convertLeadAndSend(leadId, conversionData = {}) {
    const lead = this.leadStorage.getById(leadId);
    if (!lead) throw new Error('线索不存在');

    // 1. 更新线索状态为 converted
    const updated = this.leadStorage.update(leadId, { status: 'converted' });

    // 2. 遍历已配置平台发送转化事件
    const platforms = this._read(this.platformsFile).filter(p => p.status === 'active');
    const results = [];
    for (const p of platforms) {
      const r = await this._sendToPlatform(p, {
        leadId: leadId,
        eventName: conversionData.eventName || 'Purchase',
        value: conversionData.value,
        currency: conversionData.currency || 'USD',
        orderId: conversionData.orderId,
        email: lead.email,
        phone: lead.phone,
        eventTime: Math.floor(Date.now() / 1000)
      });
      results.push({ platform: p.platformType, platformId: p.id, ...r });
    }

    return { lead: updated ? { id: updated.id, status: updated.status } : null, conversionResults: results };
  }
}

module.exports = AdConversionService;
