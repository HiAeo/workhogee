/**
 * 日志服务
 * 记录系统日志、错误日志、访问日志，提供日志查询和统计功能
 */

const fs = require('fs');
const path = require('path');

class LoggerService {
  constructor(config) {
    this.config = config;
    this.logPath = path.join(__dirname, '../../data/logs');
    this._ensureDir();

    // 日志级别
    this.LEVELS = {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
      FATAL: 4
    };

    this.minLevel = this.LEVELS[config.logLevel || 'INFO'];
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
    this.maxFiles = 5;
  }

  _ensureDir() {
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true });
    }
  }

  _getLogFile(level) {
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${level.toLowerCase()}-${date}.log`;
    return path.join(this.logPath, filename);
  }

  _formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...meta
    };
    return JSON.stringify(logEntry);
  }

  _writeLog(level, message, meta = {}) {
    if (this.LEVELS[level] < this.minLevel) return;

    const logLine = this._formatMessage(level, message, meta);
    const logFile = this._getLogFile(level);

    try {
      fs.appendFileSync(logFile, logLine + '\n', 'utf-8');

      // 同时写入通用日志文件
      const allLogFile = path.join(this.logPath, 'all.log');
      fs.appendFileSync(allLogFile, logLine + '\n', 'utf-8');

      // 检查文件大小，进行轮转
      this._rotateLogFile(logFile);
      this._rotateLogFile(allLogFile);
    } catch (e) {
      console.error('Failed to write log:', e.message);
    }
  }

  _rotateLogFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return;
      const stats = fs.statSync(filePath);
      if (stats.size >= this.maxFileSize) {
        // 重命名当前文件
        const rotatedPath = filePath + '.' + Date.now();
        fs.renameSync(filePath, rotatedPath);

        // 清理旧文件
        this._cleanOldLogs(path.dirname(filePath), path.basename(filePath));
      }
    } catch (e) {
      console.error('Log rotation failed:', e.message);
    }
  }

  _cleanOldLogs(dir, prefix) {
    try {
      const files = fs.readdirSync(dir)
        .filter(f => f.startsWith(prefix) && f !== prefix)
        .sort();

      while (files.length > this.maxFiles) {
        const oldFile = files.shift();
        fs.unlinkSync(path.join(dir, oldFile));
      }
    } catch (e) {
      console.error('Log cleanup failed:', e.message);
    }
  }

  // 公开方法
  debug(message, meta) { this._writeLog('DEBUG', message, meta); }
  info(message, meta) { this._writeLog('INFO', message, meta); }
  warn(message, meta) { this._writeLog('WARN', message, meta); }
  error(message, meta) { this._writeLog('ERROR', message, meta); }
  fatal(message, meta) { this._writeLog('FATAL', message, meta); }

  /**
   * 查询日志
   * @param {Object} options - 查询选项
   * @returns {Array}
   */
  queryLogs(options = {}) {
    const { level = 'all', limit = 100, offset = 0, startDate, endDate, keyword } = options;
    const logs = [];

    try {
      const allLogFile = path.join(this.logPath, 'all.log');
      if (!fs.existsSync(allLogFile)) return { logs: [], total: 0 };

      const lines = fs.readFileSync(allLogFile, 'utf-8').split('\n').filter(Boolean);
      let filtered = lines;

      // 按级别过滤
      if (level !== 'all') {
        filtered = filtered.filter(line => {
          try {
            const log = JSON.parse(line);
            return log.level === level.toUpperCase();
          } catch (e) {
            return false;
          }
        });
      }

      // 按日期过滤
      if (startDate || endDate) {
        filtered = filtered.filter(line => {
          try {
            const log = JSON.parse(line);
            const logDate = new Date(log.timestamp);
            if (startDate && logDate < new Date(startDate)) return false;
            if (endDate && logDate > new Date(endDate)) return false;
            return true;
          } catch (e) {
            return false;
          }
        });
      }

      // 按关键词过滤
      if (keyword) {
        filtered = filtered.filter(line => line.toLowerCase().includes(keyword.toLowerCase()));
      }

      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + limit).map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return { raw: line };
        }
      });

      return { logs: paginated, total };
    } catch (e) {
      return { logs: [], total: 0, error: e.message };
    }
  }

  /**
   * 获取日志统计
   * @returns {Object}
   */
  getStats() {
    try {
      const allLogFile = path.join(this.logPath, 'all.log');
      if (!fs.existsSync(allLogFile)) {
        return { total: 0, byLevel: {}, today: 0, errors: 0 };
      }

      const lines = fs.readFileSync(allLogFile, 'utf-8').split('\n').filter(Boolean);
      const stats = {
        total: lines.length,
        byLevel: { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 },
        today: 0,
        errors: 0
      };

      const today = new Date().toISOString().slice(0, 10);

      lines.forEach(line => {
        try {
          const log = JSON.parse(line);
          if (stats.byLevel[log.level] !== undefined) {
            stats.byLevel[log.level]++;
          }
          if (log.level === 'ERROR' || log.level === 'FATAL') {
            stats.errors++;
          }
          if (log.timestamp && log.timestamp.startsWith(today)) {
            stats.today++;
          }
        } catch (e) {
          // 忽略解析错误
        }
      });

      return stats;
    } catch (e) {
      return { total: 0, byLevel: {}, today: 0, errors: 0, error: e.message };
    }
  }

  /**
   * 清空日志
   */
  clearLogs() {
    try {
      const files = fs.readdirSync(this.logPath);
      files.forEach(file => {
        if (file.endsWith('.log')) {
          fs.unlinkSync(path.join(this.logPath, file));
        }
      });
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = LoggerService;
