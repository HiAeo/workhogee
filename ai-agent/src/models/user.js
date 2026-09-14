/**
 * 用户模型
 * 支持 JSON 文件存储和 PostgreSQL 数据库双模式
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../db');

class UserModel {
  constructor(config) {
    this.config = config;
    this.storagePath = path.join(__dirname, '../../data/users');
    this.usersFile = path.join(this.storagePath, 'users.json');
    this._ensureDir();
    this._loadUsers();
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  _loadUsers() {
    try {
      if (fs.existsSync(this.usersFile)) {
        this.users = JSON.parse(fs.readFileSync(this.usersFile, 'utf-8'));
      } else {
        this.users = [];
      }
    } catch (e) {
      this.users = [];
    }
  }

  _saveUsers() {
    fs.writeFileSync(this.usersFile, JSON.stringify(this.users, null, 2));
  }

  /**
   * 创建用户
   */
  async create(userData) {
    const passwordHash = await bcrypt.hash(userData.password, 10);
    const user = {
      id: crypto.randomUUID(),
      email: userData.email.toLowerCase(),
      passwordHash,
      name: userData.name || userData.email.split('@')[0],
      role: userData.role || 'user',
      avatarUrl: userData.avatarUrl || null,
      status: 'active',
      tenantId: userData.tenantId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastLoginAt: null
    };

    if (db.isEnabled()) {
      // 数据库模式
      const result = await db.query(
        `INSERT INTO users (id, email, password_hash, name, role, avatar_url, status, tenant_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING id, email, name, role, avatar_url, status, tenant_id, created_at, updated_at`,
        [user.id, user.email, user.passwordHash, user.name, user.role, user.avatarUrl, user.status, user.tenantId]
      );
      return this._sanitize(result.rows[0]);
    } else {
      // JSON 文件模式
      this.users.push(user);
      this._saveUsers();
      return this._sanitize(user);
    }
  }

  /**
   * 根据邮箱查找用户
   */
  async findByEmail(email) {
    email = email.toLowerCase();
    if (db.isEnabled()) {
      const result = await db.query(
        `SELECT * FROM users WHERE email = $1 AND status = 'active'`,
        [email]
      );
      return result.rows[0] || null;
    } else {
      return this.users.find(u => u.email === email && u.status === 'active') || null;
    }
  }

  /**
   * 根据 ID 查找用户
   */
  async findById(id) {
    if (db.isEnabled()) {
      const result = await db.query(
        `SELECT * FROM users WHERE id = $1`,
        [id]
      );
      return result.rows[0] ? this._sanitize(result.rows[0]) : null;
    } else {
      const user = this.users.find(u => u.id === id);
      return user ? this._sanitize(user) : null;
    }
  }

  /**
   * 验证密码
   */
  async verifyPassword(user, password) {
    return bcrypt.compare(password, user.passwordHash || user.password_hash);
  }

  /**
   * 更新用户最后登录时间
   */
  async updateLastLogin(id) {
    if (db.isEnabled()) {
      await db.query(
        `UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [id]
      );
    } else {
      const user = this.users.find(u => u.id === id);
      if (user) {
        user.lastLoginAt = new Date().toISOString();
        this._saveUsers();
      }
    }
  }

  /**
   * 更新用户信息
   */
  async update(id, updates) {
    if (db.isEnabled()) {
      const fields = [];
      const values = [];
      let idx = 1;
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'password') {
          fields.push(`password_hash = $${idx++}`);
          values.push(await bcrypt.hash(value, 10));
        } else {
          const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
          fields.push(`${dbField} = $${idx++}`);
          values.push(value);
        }
      }
      fields.push(`updated_at = NOW()`);
      values.push(id);
      const result = await db.query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, email, name, role, avatar_url, status, tenant_id, created_at, updated_at`,
        values
      );
      return result.rows[0] ? this._sanitize(result.rows[0]) : null;
    } else {
      const user = this.users.find(u => u.id === id);
      if (!user) return null;
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'password') {
          user.passwordHash = await bcrypt.hash(value, 10);
        } else {
          user[key] = value;
        }
      }
      user.updatedAt = new Date().toISOString();
      this._saveUsers();
      return this._sanitize(user);
    }
  }

  /**
   * 获取用户列表
   */
  async list(filters = {}) {
    if (db.isEnabled()) {
      let query = `SELECT id, email, name, role, avatar_url, status, tenant_id, created_at, updated_at, last_login_at FROM users WHERE 1=1`;
      const values = [];
      let idx = 1;
      if (filters.tenantId) {
        query += ` AND tenant_id = $${idx++}`;
        values.push(filters.tenantId);
      }
      if (filters.role) {
        query += ` AND role = $${idx++}`;
        values.push(filters.role);
      }
      query += ` ORDER BY created_at DESC`;
      const result = await db.query(query, values);
      return result.rows.map(u => this._sanitize(u));
    } else {
      let users = [...this.users];
      if (filters.tenantId) {
        users = users.filter(u => u.tenantId === filters.tenantId);
      }
      if (filters.role) {
        users = users.filter(u => u.role === filters.role);
      }
      return users.map(u => this._sanitize(u)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
  }

  /**
   * 清理敏感字段
   */
  _sanitize(user) {
    if (!user) return null;
    const { passwordHash, password_hash, ...sanitized } = user;
    return sanitized;
  }
}

module.exports = UserModel;
