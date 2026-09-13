/**
 * 邮箱配置服务
 * 管理邮箱账户配置，支持 IMAP/SMTP、多账户、连接测试、密码加密存储
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class EmailConfigService {
  constructor(config) {
    this.config = config;
    this.storagePath = path.join(__dirname, '../../data/email');
    this.configFile = path.join(this.storagePath, 'accounts.json');
    this._ensureDir();

    // 加密密钥（从配置中获取，或使用默认密钥）
    this.encryptionKey = (config.email && config.email.encryptionKey) || 'workhogee-email-encryption-key-2024';
    this.algorithm = 'aes-256-cbc';
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  _readConfigs() {
    try {
      if (fs.existsSync(this.configFile)) {
        return JSON.parse(fs.readFileSync(this.configFile, 'utf-8'));
      }
    } catch (e) {
      console.error('读取邮箱配置失败:', e.message);
    }
    return { accounts: [] };
  }

  _saveConfigs(data) {
    fs.writeFileSync(this.configFile, JSON.stringify(data, null, 2));
  }

  // 加密
  _encrypt(text) {
    if (!text) return '';
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  // 解密
  _decrypt(encrypted) {
    if (!encrypted) return '';
    try {
      const parts = encrypted.split(':');
      if (parts.length !== 2) return encrypted;
      const iv = Buffer.from(parts[0], 'hex');
      const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      let decrypted = decipher.update(parts[1], 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (e) {
      return encrypted;
    }
  }

  /**
   * 添加邮箱账户
   */
  addAccount(account) {
    const data = this._readConfigs();

    // 验证必填字段
    if (!account.name || !account.email || !account.imapHost || !account.smtpHost) {
      throw new Error('账户名称、邮箱地址、IMAP服务器、SMTP服务器为必填项');
    }

    // 检查是否已存在
    if (data.accounts.some(a => a.email === account.email)) {
      throw new Error('该邮箱地址已存在');
    }

    const newAccount = {
      id: crypto.randomUUID(),
      name: account.name,
      email: account.email,
      imapHost: account.imapHost,
      imapPort: account.imapPort || 993,
      imapSecure: account.imapSecure !== false,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort || 465,
      smtpSecure: account.smtpSecure !== false,
      username: account.username || account.email,
      password: this._encrypt(account.password || ''),
      autoReply: account.autoReply !== false,
      autoCreateLead: account.autoCreateLead !== false,
      replyTemplate: account.replyTemplate || '',
      signature: account.signature || '',
      folders: account.folders || ['INBOX'],
      checkInterval: account.checkInterval || 60000, // 默认1分钟
      lastCheckTime: null,
      status: 'inactive', // inactive, active, error
      errorMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    data.accounts.push(newAccount);
    this._saveConfigs(data);

    return this._sanitizeAccount(newAccount);
  }

  /**
   * 更新邮箱账户
   */
  updateAccount(id, updates) {
    const data = this._readConfigs();
    const account = data.accounts.find(a => a.id === id);

    if (!account) {
      throw new Error('账户不存在');
    }

    // 如果更新了密码，重新加密
    if (updates.password) {
      updates.password = this._encrypt(updates.password);
    }

    Object.assign(account, updates, {
      updatedAt: new Date().toISOString()
    });

    this._saveConfigs(data);
    return this._sanitizeAccount(account);
  }

  /**
   * 删除邮箱账户
   */
  deleteAccount(id) {
    const data = this._readConfigs();
    const index = data.accounts.findIndex(a => a.id === id);

    if (index === -1) {
      throw new Error('账户不存在');
    }

    data.accounts.splice(index, 1);
    this._saveConfigs(data);
    return true;
  }

  /**
   * 获取账户列表
   */
  listAccounts() {
    const data = this._readConfigs();
    return data.accounts.map(a => this._sanitizeAccount(a));
  }

  /**
   * 获取账户详情（含解密密码，内部使用）
   */
  getAccountFull(id) {
    const data = this._readConfigs();
    const account = data.accounts.find(a => a.id === id);
    if (!account) return null;

    // 解密密码
    account.password = this._decrypt(account.password);
    return account;
  }

  /**
   * 获取账户详情（不含密码，对外返回）
   */
  getAccount(id) {
    const data = this._readConfigs();
    const account = data.accounts.find(a => a.id === id);
    if (!account) return null;
    return this._sanitizeAccount(account);
  }

  /**
   * 获取所有活跃账户（用于邮件轮询）
   */
  getActiveAccounts() {
    const data = this._readConfigs();
    return data.accounts
      .filter(a => a.status === 'active')
      .map(a => {
        a.password = this._decrypt(a.password);
        return a;
      });
  }

  /**
   * 更新账户状态
   */
  updateStatus(id, status, errorMessage = null) {
    const data = this._readConfigs();
    const account = data.accounts.find(a => a.id === id);

    if (!account) return null;

    account.status = status;
    account.errorMessage = errorMessage;
    account.updatedAt = new Date().toISOString();

    if (status === 'active') {
      account.lastCheckTime = new Date().toISOString();
    }

    this._saveConfigs(data);
    return this._sanitizeAccount(account);
  }

  /**
   * 测试邮箱连接（IMAP + SMTP）
   */
  async testConnection(id) {
    const account = this.getAccountFull(id);
    if (!account) {
      return { success: false, imap: false, smtp: false, message: '账户不存在' };
    }

    const results = { imap: false, smtp: false, imapError: null, smtpError: null };

    // 测试 IMAP 连接
    try {
      const imapResult = await this._testIMAP(account);
      results.imap = imapResult.success;
      results.imapError = imapResult.error;
    } catch (e) {
      results.imapError = e.message;
    }

    // 测试 SMTP 连接
    try {
      const smtpResult = await this._testSMTP(account);
      results.smtp = smtpResult.success;
      results.smtpError = smtpResult.error;
    } catch (e) {
      results.smtpError = e.message;
    }

    const success = results.imap && results.smtp;
    return {
      success,
      imap: results.imap,
      smtp: results.smtp,
      message: success ? '连接测试成功' : '连接测试失败',
      errors: {
        imap: results.imapError,
        smtp: results.smtpError
      }
    };
  }

  async _testIMAP(account) {
    // 简化版 IMAP 连接测试（实际使用时需要 imapflow 库）
    try {
      // 这里使用基础的 TCP 连接测试
      const net = require('net');
      return new Promise((resolve) => {
        const socket = net.connect(account.imapPort, account.imapHost, () => {
          socket.destroy();
          resolve({ success: true });
        });
        socket.setTimeout(5000);
        socket.on('error', (err) => {
          resolve({ success: false, error: err.message });
        });
        socket.on('timeout', () => {
          socket.destroy();
          resolve({ success: false, error: '连接超时' });
        });
      });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async _testSMTP(account) {
    // 简化版 SMTP 连接测试
    try {
      const net = require('net');
      return new Promise((resolve) => {
        const socket = net.connect(account.smtpPort, account.smtpHost, () => {
          socket.destroy();
          resolve({ success: true });
        });
        socket.setTimeout(5000);
        socket.on('error', (err) => {
          resolve({ success: false, error: err.message });
        });
        socket.on('timeout', () => {
          socket.destroy();
          resolve({ success: false, error: '连接超时' });
        });
      });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 获取邮箱配置统计
   */
  getStats() {
    const data = this._readConfigs();
    const accounts = data.accounts;

    return {
      total: accounts.length,
      active: accounts.filter(a => a.status === 'active').length,
      inactive: accounts.filter(a => a.status === 'inactive').length,
      error: accounts.filter(a => a.status === 'error').length,
      autoReplyEnabled: accounts.filter(a => a.autoReply).length,
      autoCreateLeadEnabled: accounts.filter(a => a.autoCreateLead).length
    };
  }

  // 清除密码字段，用于对外返回
  _sanitizeAccount(account) {
    const { password, ...sanitized } = account;
    return sanitized;
  }
}

module.exports = EmailConfigService;
