/**
 * 用户认证服务
 * 支持用户注册/登录/JWT Token/密码重置，同时保留 API Key 认证
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/user');

class AuthService {
  constructor(config) {
    this.config = config;
    this.jwtSecret = config.jwt?.secret || process.env.JWT_SECRET || 'workhogee-jwt-secret-2026-change-in-production';
    this.jwtExpiresIn = config.jwt?.expiresIn || '7d';
    this.jwtRefreshExpiresIn = config.jwt?.refreshExpiresIn || '30d';

    // 用户模型
    this.userModel = new UserModel(config);

    // API Key 存储（保留原有功能）
    this.storagePath = path.join(__dirname, '../../data/auth');
    this.apiKeysFile = path.join(this.storagePath, 'api-keys.json');
    this.logsFile = path.join(this.storagePath, 'api-logs.json');
    this.refreshTokensFile = path.join(this.storagePath, 'refresh-tokens.json');
    this._ensureDir();
    this._loadApiKeys();
    this._loadLogs();
    this._loadRefreshTokens();

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
        this.apiKeys = JSON.parse(fs.readFileSync(this.apiKeysFile, 'utf-8'));
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
        this.logs = JSON.parse(fs.readFileSync(this.logsFile, 'utf-8'));
      } else {
        this.logs = [];
      }
    } catch (e) {
      this.logs = [];
    }
  }

  _saveLogs() {
    if (this.logs.length > 10000) {
      this.logs = this.logs.slice(-10000);
    }
    fs.writeFileSync(this.logsFile, JSON.stringify(this.logs, null, 2));
  }

  _loadRefreshTokens() {
    try {
      if (fs.existsSync(this.refreshTokensFile)) {
        this.refreshTokens = JSON.parse(fs.readFileSync(this.refreshTokensFile, 'utf-8'));
      } else {
        this.refreshTokens = {};
      }
    } catch (e) {
      this.refreshTokens = {};
    }
  }

  _saveRefreshTokens() {
    // 清理过期的 token
    const now = Date.now();
    for (const [token, data] of Object.entries(this.refreshTokens)) {
      if (data.expiresAt < now) {
        delete this.refreshTokens[token];
      }
    }
    fs.writeFileSync(this.refreshTokensFile, JSON.stringify(this.refreshTokens, null, 2));
  }

  // ==================== 用户认证 ====================

  /**
   * 用户注册
   */
  async register(userData) {
    // 验证邮箱格式
    if (!userData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
      throw new Error('邮箱格式不正确');
    }

    // 验证密码长度
    if (!userData.password || userData.password.length < 6) {
      throw new Error('密码长度至少6位');
    }

    // 检查邮箱是否已存在
    const existingUser = await this.userModel.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('该邮箱已注册');
    }

    // 创建用户
    const user = await this.userModel.create(userData);

    // 生成 Token
    const tokens = this._generateTokens(user);

    return {
      user,
      ...tokens
    };
  }

  /**
   * 用户登录
   */
  async login(email, password) {
    if (!email || !password) {
      throw new Error('邮箱和密码不能为空');
    }

    const user = await this.userModel.findByEmail(email);
    if (!user) {
      throw new Error('邮箱或密码错误');
    }

    const isValid = await this.userModel.verifyPassword(user, password);
    if (!isValid) {
      throw new Error('邮箱或密码错误');
    }

    // 更新最后登录时间
    await this.userModel.updateLastLogin(user.id);

    // 生成 Token
    const sanitizedUser = this.userModel._sanitize(user);
    const tokens = this._generateTokens(sanitizedUser);

    return {
      user: sanitizedUser,
      ...tokens
    };
  }

  /**
   * 刷新 Token
   */
  async refreshToken(refreshToken) {
    if (!refreshToken) {
      throw new Error('缺少刷新令牌');
    }

    const tokenData = this.refreshTokens[refreshToken];
    if (!tokenData || tokenData.expiresAt < Date.now()) {
      throw new Error('刷新令牌已过期，请重新登录');
    }

    const user = await this.userModel.findById(tokenData.userId);
    if (!user) {
      throw new Error('用户不存在');
    }

    // 生成新 Token
    const tokens = this._generateTokens(user);

    // 使旧的刷新令牌失效
    delete this.refreshTokens[refreshToken];
    this._saveRefreshTokens();

    return tokens;
  }

  /**
   * 用户登出
   */
  async logout(refreshToken) {
    if (refreshToken && this.refreshTokens[refreshToken]) {
      delete this.refreshTokens[refreshToken];
      this._saveRefreshTokens();
    }
    return true;
  }

  /**
   * 修改密码
   */
  async changePassword(userId, oldPassword, newPassword) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new Error('用户不存在');
    }

    // 需要从数据库获取完整用户（含 passwordHash）
    const fullUser = await this.userModel.findByEmail(user.email);
    const isValid = await this.userModel.verifyPassword(fullUser, oldPassword);
    if (!isValid) {
      throw new Error('原密码错误');
    }

    if (newPassword.length < 6) {
      throw new Error('新密码长度至少6位');
    }

    await this.userModel.update(userId, { password: newPassword });
    return true;
  }

  /**
   * 生成访问令牌和刷新令牌
   */
  _generateTokens(user) {
    const accessToken = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
      },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn }
    );

    const refreshToken = crypto.randomBytes(32).toString('hex');
    const refreshExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30天

    this.refreshTokens[refreshToken] = {
      userId: user.id,
      expiresAt: refreshExpiresAt,
      createdAt: Date.now()
    };
    this._saveRefreshTokens();

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this._parseExpiresIn(this.jwtExpiresIn)
    };
  }

  _parseExpiresIn(expiresIn) {
    if (typeof expiresIn === 'number') return expiresIn;
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 604800;
    const [, num, unit] = match;
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    return parseInt(num) * multipliers[unit];
  }

  /**
   * 验证 JWT Token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (e) {
      return null;
    }
  }

  // ==================== API Key 认证（保留原有功能） ====================

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

  validateKey(key, permission = 'read') {
    if (!key) return null;
    const apiKey = this.apiKeys.find(k => k.key === key && k.status === 'active');
    if (!apiKey) return null;
    if (permission && !apiKey.permissions[permission] && !apiKey.permissions.admin) {
      return null;
    }
    apiKey.lastUsedAt = new Date().toISOString();
    apiKey.usageCount++;
    this._saveApiKeys();
    return apiKey;
  }

  revokeKey(id) {
    const index = this.apiKeys.findIndex(k => k.id === id);
    if (index === -1) return false;
    this.apiKeys[index].status = 'revoked';
    this.apiKeys[index].revokedAt = new Date().toISOString();
    this._saveApiKeys();
    return true;
  }

  listKeys() {
    return this.apiKeys.map(k => ({
      ...k,
      key: k.key.substring(0, 8) + '...' + k.key.substring(k.key.length - 4)
    }));
  }

  logRequest(log) {
    this.logs.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...log
    });
    this._saveLogs();
  }

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

  // ==================== 认证中间件 ====================

  /**
   * Express 中间件：JWT 用户认证
   */
  userAuthMiddleware(required = true) {
    return (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        if (required) {
          return res.status(401).json({
            success: false,
            error: '未提供认证令牌，请在 Header 中添加 Authorization: Bearer <token>'
          });
        }
        req.user = null;
        return next();
      }

      const token = authHeader.substring(7);
      const decoded = this.verifyToken(token);
      if (!decoded) {
        if (required) {
          return res.status(401).json({
            success: false,
            error: '认证令牌无效或已过期'
          });
        }
        req.user = null;
        return next();
      }

      req.user = decoded;
      req.userId = decoded.userId;
      req.tenantId = decoded.tenantId;
      next();
    };
  }

  /**
   * Express 中间件：API Key 认证（保留原有功能）
   */
  apiKeyAuthMiddleware(permission = 'read') {
    return (req, res, next) => {
      if (req.path === '/health' || req.path.startsWith('/static') || req.path === '/') {
        return next();
      }

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

      req.apiKey = validated;
      const self = this;
      const originalSend = res.send;
      res.send = function(body) {
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

  /**
   * 混合认证中间件：优先 JWT，回退到 API Key
   */
  mixedAuthMiddleware(permission = 'read') {
    return (req, res, next) => {
      // 跳过健康检查和静态文件
      if (req.path === '/health' || req.path.startsWith('/static') || req.path === '/') {
        return next();
      }

      // 尝试 JWT 认证
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = this.verifyToken(token);
        if (decoded) {
          req.user = decoded;
          req.userId = decoded.userId;
          req.tenantId = decoded.tenantId;
          req.authType = 'jwt';
          return next();
        }
      }

      // 回退到 API Key 认证
      const apiKey = req.headers['x-api-key'] || req.query.api_key;
      if (apiKey) {
        const validated = this.validateKey(apiKey, permission);
        if (validated) {
          req.apiKey = validated;
          req.authType = 'apiKey';
          return next();
        }
      }

      return res.status(401).json({
        success: false,
        error: '未通过认证，请提供有效的 JWT Token 或 API Key'
      });
    };
  }
}

module.exports = AuthService;
