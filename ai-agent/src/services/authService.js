/**
 * API Key 认证服务
 * 管理 API Key 的生成、验证、撤销，记录 API 调用日志
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AuthService {
  constructor(config) {
    this.config = config;
    this.storagePath = path.join(__dirname, '../../data/auth');
    this.apiKeysFile = path.join(this.storagePath, 'api-keys.json');
    this.logsFile = path.join(this.storagePath, 'api-logs.json');
    this._ensureDir();
    this._loadApiKeys();
    this._loadLogs();

    // 如果没有任何 API Key，生成一个默认的
    if (this.apiKeys.length === 0) {
      this.generateKey('默认 API Key', 'admin');
    }
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  _loadApiKeys() {
    try {
      if (fs.existsSync(this.apiKeysFile)) {
        const data = fs.readFileSync(this.apiKeysFile, 'utf-8');
        this.apiKeys = JSON.parse(data);
      } else {
        this.apiKeys = [];
      }
    } catch (e) {
      this.apiKeys = [];
    }
  }

  _saveApiKeys() {
    fs.writeFileSync(this.apiKeysFile, JSON.stringify(this.apiKeys, null, 2));
  }

  _loadLogs() {
    try {
      if (fs.existsSync(this.logsFile)) {
        const data = fs.readFileSync(this.logsFile, 'utf-8');
        this.logs = JSON.parse(data);
      } else {
        this.logs = [];
      }
    } catch (e) {
      this.logs = [];
    }
  }

  _saveLogs() {
    // 只保留最近 10000 条日志
    if (this.logs.length > 10000) {
      this.logs = this.logs.slice(-10000);
    }
    fs.writeFileSync(this.logsFile, JSON.stringify(this.logs, null, 2));
  }

  /**
   * 生成新的 API Key
   * @param {string} name - Key 名称
   * @param {string} createdBy - 创建者
   * @param {Object} permissions - 权限配置
   * @returns {Object} - 新生成的 API Key
   */
  generateKey(name, createdBy = 'system', permissions = {}) {
    const key = 'wh_' + crypto.randomBytes(24).toString('hex');
    const apiKey = {
      id: crypto.randomUUID(),
      key,
      name,
      createdBy,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      status: 'active',
      permissions: {
        read: permissions.read !== false,
        write: permissions.write !== false,
        export: permissions.export !== false,
        admin: permissions.admin || false
      },
      usageCount: 0
    };

    this.apiKeys.push(apiKey);
    this._saveApiKeys();

    return apiKey;
  }

  /**
   * 验证 API Key
   * @param {string} key - API Key
   * @param {string} permission - 需要的权限
   * @returns {Object|null} - 验证通过返回 Key 信息，失败返回 null
   */
  validateKey(key, permission = 'read') {
    if (!key) return null;

    const apiKey = this.apiKeys.find(k => k.key === key && k.status === 'active');
    if (!apiKey) return null;

    // 检查权限
    if (permission && !apiKey.permissions[permission] && !apiKey.permissions.admin) {
      return null;
    }

    // 更新使用信息
    apiKey.lastUsedAt = new Date().toISOString();
    apiKey.usageCount++;
    this._saveApiKeys();

    return apiKey;
  }

  /**
   * 撤销 API Key
   * @param {string} id - Key ID
   * @returns {boolean}
   */
  revokeKey(id) {
    const index = this.apiKeys.findIndex(k => k.id === id);
    if (index === -1) return false;

    this.apiKeys[index].status = 'revoked';
    this.apiKeys[index].revokedAt = new Date().toISOString();
    this._saveApiKeys();
    return true;
  }

  /**
   * 获取所有 API Key（不显示完整 Key）
   * @returns {Array}
   */
  listKeys() {
    return this.apiKeys.map(k => ({
      ...k,
      key: k.key.substring(0, 8) + '...' + k.key.substring(k.key.length - 4),
      fullKey: undefined
    }));
  }

  /**
   * 记录 API 调用日志
   * @param {Object} log - 日志信息
   */
  logRequest(log) {
    this.logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...log
    });
    this._saveLogs();
  }

  /**
   * 获取 API 调用统计
   * @returns {Object}
   */
  getStats() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayLogs = this.logs.filter(l => new Date(l.timestamp) >= todayStart);
    const errorLogs = this.logs.filter(l => l.statusCode >= 400);

    return {
      totalRequests: this.logs.length,
      todayRequests: todayLogs.length,
      errorRequests: errorLogs.length,
      errorRate: this.logs.length > 0 ? ((errorLogs.length / this.logs.length) * 100).toFixed(2) : 0,
      activeKeys: this.apiKeys.filter(k => k.status === 'active').length,
      totalKeys: this.apiKeys.length
    };
  }

  /**
   * Express 中间件：API Key 认证
   * @param {string} permission - 需要的权限
   * @returns {Function}
   */
  authMiddleware(permission = 'read') {
    return (req, res, next) => {
      // 跳过健康检查和静态文件
      if (req.path === '/health' || req.path.startsWith('/static') || req.path === '/') {
        return next();
      }

      // 从 Header 或 Query 获取 API Key
      const apiKey = req.headers['x-api-key'] || req.query.api_key;

      if (!apiKey) {
        return res.status(401).json({
          success: false,
          error: '未提供 API Key，请在 Header 中添加 x-api-key'
        });
      }

      const validated = this.validateKey(apiKey, permission);
      if (!validated) {
        this.logRequest({
          method: req.method,
          path: req.path,
          statusCode: 403,
          apiKey: apiKey.substring(0, 8) + '...',
          error: 'Invalid or insufficient permissions'
        });
        return res.status(403).json({
          success: false,
          error: 'API Key 无效或权限不足'
        });
      }

      // 记录请求
      req.apiKey = validated;
      const self = this;
      const originalSend = res.send;
      res.send = function(body) {
        // 记录日志（异步，不阻塞响应）
        setImmediate(() => {
          self.logRequest({
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            apiKeyId: validated.id,
            apiKeyName: validated.name,
            ip: req.ip,
            userAgent: req.headers['user-agent']
          });
        });
        originalSend.call(this, body);
      }.bind(this);

      next();
    };
  }
}

module.exports = AuthService;
