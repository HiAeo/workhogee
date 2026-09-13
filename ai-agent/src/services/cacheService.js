/**
 * 缓存服务
 * 提供 LLM 响应缓存、数据查询缓存，提升系统性能
 */

const crypto = require('crypto');

class CacheService {
  constructor(config = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      defaultTTL: config.defaultTTL || 3600000, // 默认1小时
      ...config
    };

    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 生成缓存键
   * @param {string} prefix - 键前缀
   * @param {Object} data - 用于生成键的数据
   * @returns {string}
   */
  generateKey(prefix, data) {
    const hash = crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
    return `${prefix}:${hash}`;
  }

  /**
   * 获取缓存
   * @param {string} key - 缓存键
   * @returns {*|null}
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.expireAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value;
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   * @param {number} ttl - 过期时间（毫秒）
   */
  set(key, value, ttl = this.config.defaultTTL) {
    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.config.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expireAt: Date.now() + ttl,
      createdAt: Date.now()
    });
  }

  /**
   * 删除缓存
   * @param {string} key - 缓存键
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 获取或设置缓存（如果不存在则调用函数生成）
   * @param {string} key - 缓存键
   * @param {Function} fn - 生成值的函数
   * @param {number} ttl - 过期时间
   * @returns {*}
   */
  async getOrSet(key, fn, ttl = this.config.defaultTTL) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fn();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * 获取缓存统计
   * @returns {Object}
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.config.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? ((this.hits / total) * 100).toFixed(2) + '%' : '0%',
      memoryUsage: this._estimateMemoryUsage()
    };
  }

  /**
   * 估算内存使用量
   */
  _estimateMemoryUsage() {
    let totalBytes = 0;
    for (const [key, entry] of this.cache) {
      totalBytes += key.length * 2; // UTF-16
      totalBytes += JSON.stringify(entry.value).length * 2;
    }
    return (totalBytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  /**
   * 清理过期缓存
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.cache) {
      if (now > entry.expireAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }
}

module.exports = CacheService;
