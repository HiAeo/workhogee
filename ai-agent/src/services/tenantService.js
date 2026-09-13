/**
 * 多租户服务
 * 支持多客户/多租户的数据隔离和配置管理
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class TenantService {
  constructor(config) {
    this.config = config;
    this.storagePath = path.join(__dirname, '../../data/tenants');
    this.tenantsFile = path.join(this.storagePath, 'tenants.json');
    this._ensureDir();
    this._loadTenants();

    // 如果没有任何租户，创建一个默认租户
    if (this.tenants.length === 0) {
      this.createTenant({
        name: '默认租户',
        description: '系统默认租户',
        business: config.business || {}
      });
    }
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  _loadTenants() {
    try {
      if (fs.existsSync(this.tenantsFile)) {
        this.tenants = JSON.parse(fs.readFileSync(this.tenantsFile, 'utf-8'));
      } else {
        this.tenants = [];
      }
    } catch (e) {
      this.tenants = [];
    }
  }

  _saveTenants() {
    fs.writeFileSync(this.tenantsFile, JSON.stringify(this.tenants, null, 2));
  }

  /**
   * 创建新租户
   * @param {Object} tenantConfig - 租户配置
   * @returns {Object} - 创建的租户
   */
  createTenant(tenantConfig) {
    const tenant = {
      id: crypto.randomUUID(),
      name: tenantConfig.name,
      description: tenantConfig.description || '',
      status: 'active', // active, suspended, deleted
      business: tenantConfig.business || {},
      settings: tenantConfig.settings || {
        maxLeads: 10000,
        maxConversations: 50000,
        features: {
          contentCreator: true,
          leadNurture: true,
          analytics: true,
          abTesting: true,
          notifications: true
        }
      },
      apiKeys: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      usage: {
        leads: 0,
        conversations: 0,
        apiCalls: 0,
        llmTokens: 0
      }
    };

    this.tenants.push(tenant);
    this._saveTenants();

    // 创建租户专属数据目录
    const tenantDataPath = path.join(this.storagePath, tenant.id);
    if (!fs.existsSync(tenantDataPath)) {
      fs.mkdirSync(tenantDataPath, { recursive: true });
    }

    return tenant;
  }

  /**
   * 获取租户列表
   * @param {Object} options - 选项
   * @returns {Array}
   */
  listTenants(options = {}) {
    let tenants = this.tenants;

    if (options.status) {
      tenants = tenants.filter(t => t.status === options.status);
    }

    return tenants.map(t => ({
      ...t,
      apiKeys: t.apiKeys.map(k => ({ ...k, key: k.key.substring(0, 8) + '...' }))
    }));
  }

  /**
   * 获取租户详情
   * @param {string} tenantId - 租户 ID
   * @returns {Object|null}
   */
  getTenant(tenantId) {
    return this.tenants.find(t => t.id === tenantId) || null;
  }

  /**
   * 更新租户
   * @param {string} tenantId - 租户 ID
   * @param {Object} updates - 更新内容
   * @returns {Object|null}
   */
  updateTenant(tenantId, updates) {
    const tenant = this.tenants.find(t => t.id === tenantId);
    if (!tenant) return null;

    Object.assign(tenant, updates, { updatedAt: new Date().toISOString() });
    this._saveTenants();
    return tenant;
  }

  /**
   * 暂停租户
   * @param {string} tenantId - 租户 ID
   */
  suspendTenant(tenantId) {
    return this.updateTenant(tenantId, { status: 'suspended' });
  }

  /**
   * 恢复租户
   * @param {string} tenantId - 租户 ID
   */
  activateTenant(tenantId) {
    return this.updateTenant(tenantId, { status: 'active' });
  }

  /**
   * 删除租户（软删除）
   * @param {string} tenantId - 租户 ID
   */
  deleteTenant(tenantId) {
    return this.updateTenant(tenantId, { status: 'deleted' });
  }

  /**
   * 为租户生成 API Key
   * @param {string} tenantId - 租户 ID
   * @param {string} name - Key 名称
   * @returns {Object|null}
   */
  generateApiKey(tenantId, name) {
    const tenant = this.tenants.find(t => t.id === tenantId);
    if (!tenant) return null;

    const apiKey = {
      id: crypto.randomUUID(),
      key: 'wh_' + crypto.randomBytes(24).toString('hex'),
      name,
      status: 'active',
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      usageCount: 0
    };

    tenant.apiKeys.push(apiKey);
    this._saveTenants();

    return apiKey;
  }

  /**
   * 验证租户 API Key
   * @param {string} apiKey - API Key
   * @returns {Object|null}
   */
  validateApiKey(apiKey) {
    for (const tenant of this.tenants) {
      const key = tenant.apiKeys.find(k => k.key === apiKey && k.status === 'active');
      if (key && tenant.status === 'active') {
        key.lastUsedAt = new Date().toISOString();
        key.usageCount++;
        tenant.usage.apiCalls++;
        this._saveTenants();
        return { tenant, apiKey: key };
      }
    }
    return null;
  }

  /**
   * 更新租户使用量
   * @param {string} tenantId - 租户 ID
   * @param {Object} usage - 使用量增量
   */
  updateUsage(tenantId, usage) {
    const tenant = this.tenants.find(t => t.id === tenantId);
    if (!tenant) return false;

    Object.keys(usage).forEach(key => {
      if (tenant.usage[key] !== undefined) {
        tenant.usage[key] += usage[key];
      }
    });

    this._saveTenants();
    return true;
  }

  /**
   * 获取租户统计
   * @returns {Object}
   */
  getStats() {
    const activeTenants = this.tenants.filter(t => t.status === 'active');
    const suspendedTenants = this.tenants.filter(t => t.status === 'suspended');

    return {
      total: this.tenants.length,
      active: activeTenants.length,
      suspended: suspendedTenants.length,
      totalLeads: this.tenants.reduce((sum, t) => sum + t.usage.leads, 0),
      totalConversations: this.tenants.reduce((sum, t) => sum + t.usage.conversations, 0),
      totalApiCalls: this.tenants.reduce((sum, t) => sum + t.usage.apiCalls, 0)
    };
  }
}

module.exports = TenantService;
