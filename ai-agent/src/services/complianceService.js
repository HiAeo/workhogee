/**
 * 合规基础服务（出海专版）
 * Cookie 同意管理、数据删除请求、数据保留策略、PII 脱敏、AES-256 对话数据加密、Do Not Track 检测
 * 开发环境使用 JSON 文件存储到 data/compliance/ 目录
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SETTINGS = {
  dataRetentionDays: 90,
  cookieBannerEnabled: true,
  encryptionKey: 'workhogee-default-key-change-in-production',
  privacyPolicyUrl: ''
};

class ComplianceService {
  constructor(config) {
    this.config = config;
    this.storagePath = './data/compliance';
    this.consentsFile = path.join(this.storagePath, 'consents.json');
    this.deletionFile = path.join(this.storagePath, 'deletion-requests.json');
    this.settingsFile = path.join(this.storagePath, 'settings.json');
    // 对话数据目录（用于过期清理）
    this.conversationPath = (config.conversation && config.conversation.storagePath) || './data/conversations';
    this._ensureDir();
    // 合并配置中的默认设置与文件中的覆盖设置
    this._settings = this._loadSettings(config.compliance || {});
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
    [this.consentsFile, this.deletionFile].forEach((f) => {
      if (!fs.existsSync(f)) {
        fs.writeFileSync(f, JSON.stringify([], null, 2));
      }
    });
  }

  // ===== 设置 =====

  _loadSettings(configOverride) {
    // 优先级：文件覆盖 > config/compliance > 内置默认
    let fileOverride = {};
    try {
      fileOverride = JSON.parse(fs.readFileSync(this.settingsFile, 'utf-8'));
    } catch (e) { /* 文件不存在时忽略 */ }
    return Object.assign({}, DEFAULT_SETTINGS, configOverride, fileOverride);
  }

  /**
   * 获取合规设置（密钥不返回给前端）
   */
  getSettings() {
    return {
      dataRetentionDays: this._settings.dataRetentionDays,
      cookieBannerEnabled: this._settings.cookieBannerEnabled,
      privacyPolicyUrl: this._settings.privacyPolicyUrl,
      encryptionKeyConfigured: !!this._settings.encryptionKey
    };
  }

  /**
   * 更新合规设置（白名单字段）
   */
  updateSettings(patch) {
    const allowed = ['dataRetentionDays', 'cookieBannerEnabled', 'privacyPolicyUrl'];
    allowed.forEach((k) => {
      if (patch[k] !== undefined) this._settings[k] = patch[k];
    });
    fs.writeFileSync(this.settingsFile, JSON.stringify({
      dataRetentionDays: this._settings.dataRetentionDays,
      cookieBannerEnabled: this._settings.cookieBannerEnabled,
      privacyPolicyUrl: this._settings.privacyPolicyUrl
    }, null, 2));
    return this.getSettings();
  }

  // ===== Cookie 同意管理 =====

  _readJson(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
      return [];
    }
  }

  _writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  /**
   * 记录访客同意/拒绝状态
   */
  recordConsent({ visitorId, action, source, ip, userAgent }) {
    const list = this._readJson(this.consentsFile);
    const record = {
      id: crypto.randomUUID(),
      visitorId: visitorId || 'anonymous',
      action: action === 'granted' ? 'granted' : 'denied',
      source: source || 'cookie_banner',
      ip: ip || '',
      userAgent: userAgent || '',
      createdAt: new Date().toISOString()
    };
    list.push(record);
    this._writeJson(this.consentsFile, list);
    return record;
  }

  /**
   * 查询某访客最新的同意状态
   */
  getConsent(visitorId) {
    const list = this._readJson(this.consentsFile);
    const records = list.filter(r => r.visitorId === visitorId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (records.length === 0) return null;
    return records[0];
  }

  // ===== 数据删除请求 =====

  /**
   * 创建数据删除请求（GDPR/CCPA 等合规要求）
   */
  createDeletionRequest({ visitorId, email, reason }) {
    const list = this._readJson(this.deletionFile);
    const request = {
      id: crypto.randomUUID(),
      visitorId: visitorId || 'anonymous',
      email: email || '',
      reason: reason || '',
      status: 'pending', // pending / processing / completed
      requestedAt: new Date().toISOString(),
      completedAt: null
    };
    list.push(request);
    this._writeJson(this.deletionFile, list);
    return request;
  }

  /**
   * 查询删除请求状态
   */
  getDeletionRequest(id) {
    const list = this._readJson(this.deletionFile);
    return list.find(r => r.id === id) || null;
  }

  // ===== 数据保留策略 =====

  /**
   * 清理超过保留天数的过期对话数据
   * @returns {Object} 清理统计
   */
  cleanupExpired() {
    const retentionDays = parseInt(this._settings.dataRetentionDays) || 90;
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let deletedFiles = 0;

    if (!fs.existsSync(this.conversationPath)) {
      return { deletedFiles: 0, retentionDays: retentionDays, scanned: 0 };
    }

    const files = fs.readdirSync(this.conversationPath)
      .filter(f => f.endsWith('.json') && f !== 'index.json');
    let deletedIds = [];

    files.forEach((file) => {
      const filePath = path.join(this.conversationPath, file);
      try {
        const stat = fs.statSync(filePath);
        const createdTime = Math.min(stat.birthtimeMs || stat.mtimeMs, stat.mtimeMs);
        if (createdTime < cutoff) {
          // 校验是对话文件再删除
          const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (data.id) {
            fs.unlinkSync(filePath);
            deletedFiles++;
            deletedIds.push(data.id);
          }
        }
      } catch (e) { /* 单个文件失败不影响整体清理 */ }
    });

    // 同步清理 index.json 中的记录
    if (deletedIds.length > 0) {
      const indexFile = path.join(this.conversationPath, 'index.json');
      try {
        const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
        if (Array.isArray(index.conversations)) {
          index.conversations = index.conversations.filter(c => !deletedIds.includes(c.id));
          fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
        }
      } catch (e) { /* 索引更新失败不影响文件删除结果 */ }
    }

    return { deletedFiles: deletedFiles, retentionDays: retentionDays, scanned: files.length };
  }

  // ===== PII 脱敏 =====

  /**
   * 对文本中的邮箱和电话号码做脱敏显示
   * 例如 j***@example.com, 138****1234
   */
  maskPII(text) {
    if (!text) return text;
    let result = String(text);
    // 邮箱脱敏：保留首字符 + *** + @域名
    result = result.replace(/([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
      (m, first, mid, domain) => first + '***' + domain);
    // 电话脱敏：保留前3后4，中间打码（连续7~15位数字串，且不是邮箱一部分）
    result = result.replace(/(?<![@.\w])(\+?\d[\d\s-]{6,14}\d)(?![\w@])/g, (m) => {
      const digits = m.replace(/\D/g, '');
      if (digits.length < 7) return m;
      return digits.slice(0, 3) + '****' + digits.slice(-4);
    });
    return result;
  }

  // ===== AES-256 加解密 =====

  _getCipherKey() {
    // 从配置密钥派生 32 字节密钥（固定盐，开发环境用；生产应改为独立密钥）
    const rawKey = this._settings.encryptionKey || DEFAULT_SETTINGS.encryptionKey;
    return crypto.scryptSync(rawKey, 'workhogee-salt', 32);
  }

  /**
   * AES-256-CBC 加密，输出 base64(iv):ciphertext
   */
  encrypt(text) {
    if (text === undefined || text === null) return null;
    const key = this._getCipherKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(String(text), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return iv.toString('base64') + ':' + encrypted;
  }

  /**
   * AES-256-CBC 解密 encrypt 的输出
   */
  decrypt(encrypted) {
    if (!encrypted) return null;
    const key = this._getCipherKey();
    const parts = String(encrypted).split(':');
    if (parts.length !== 2) throw new Error('密文格式不正确');
    const iv = Buffer.from(parts[0], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(parts[1], 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // ===== Do Not Track 检测 =====

  /**
   * 检查请求头中的 DNT（Do Not Track）标识
   */
  isDoNotTrack(req) {
    const dnt = req && req.headers ? req.headers['dnt'] : null;
    return dnt === '1';
  }
}

module.exports = ComplianceService;
