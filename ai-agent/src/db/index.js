/**
 * WorkHogee 数据库连接模块
 * 支持 PostgreSQL 生产环境和 JSON 文件开发环境
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

let pool = null;
let useDatabase = false;

/**
 * 初始化数据库连接
 * @param {Object} config - 数据库配置
 */
function init(config) {
  if (!config || !config.enabled) {
    console.log('[DB] 数据库未启用，使用 JSON 文件存储');
    useDatabase = false;
    return;
  }

  try {
    pool = new Pool({
      connectionString: config.connectionString,
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 5000,
    });

    // 测试连接
    pool.query('SELECT NOW()', (err, res) => {
      if (err) {
        console.error('[DB] 数据库连接失败:', err.message);
        console.log('[DB] 回退到 JSON 文件存储');
        useDatabase = false;
        pool = null;
      } else {
        console.log('[DB] 数据库连接成功:', res.rows[0].now);
        useDatabase = true;
      }
    });
  } catch (e) {
    console.error('[DB] 数据库初始化失败:', e.message);
    useDatabase = false;
  }
}

/**
 * 执行 SQL 查询
 * @param {string} text - SQL 语句
 * @param {Array} params - 参数
 * @returns {Promise<Object>} 查询结果
 */
async function query(text, params) {
  if (!useDatabase || !pool) {
    throw new Error('数据库未启用');
  }
  return pool.query(text, params);
}

/**
 * 执行事务
 * @param {Function} callback - 事务回调，接收 client 参数
 * @returns {Promise<any>} 事务结果
 */
async function transaction(callback) {
  if (!useDatabase || !pool) {
    throw new Error('数据库未启用');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * 检查是否使用数据库
 * @returns {boolean}
 */
function isEnabled() {
  return useDatabase;
}

/**
 * 关闭数据库连接
 */
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
    useDatabase = false;
  }
}

module.exports = {
  init,
  query,
  transaction,
  isEnabled,
  close,
  get pool() { return pool; }
};
