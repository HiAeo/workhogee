/**
 * WorkHogee 通用工具函数
 */

// 格式化日期
export const formatDate = (date, format = 'YYYY-MM-DD') => {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
};

// 相对时间
export const formatRelativeTime = (date) => {
  if (!date) return '';
  const now = new Date();
  const d = new Date(date);
  const diff = now - d;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return formatDate(date, 'MM-DD');
};

// 意向等级颜色
export const getIntentionColor = (level) => {
  const colors = {
    A: '#dc2626',
    B: '#d97706',
    C: '#6b7280',
  };
  return colors[level] || '#6b7280';
};

// 意向等级文字
export const getIntentionText = (level) => {
  const texts = {
    A: '高意向',
    B: '中意向',
    C: '低意向',
  };
  return texts[level] || '未知';
};

// 线索状态文字
export const getLeadStatusText = (status) => {
  const texts = {
    new: '新线索',
    contacted: '已联系',
    following: '跟进中',
    converted: '已转化',
    lost: '已流失',
  };
  return texts[status] || status;
};

// 线索状态颜色
export const getLeadStatusColor = (status) => {
  const colors = {
    new: '#2563eb',
    contacted: '#d97706',
    following: '#ea580c',
    converted: '#16a34a',
    lost: '#6b7280',
  };
  return colors[status] || '#6b7280';
};

// 截断文本
export const truncateText = (text, maxLength = 50) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// 手机号脱敏
export const maskPhone = (phone) => {
  if (!phone || phone.length < 11) return phone;
  return phone.substring(0, 3) + '****' + phone.substring(7);
};

// 邮箱脱敏
export const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email;
  const [name, domain] = email.split('@');
  if (name.length <= 2) return name[0] + '***@' + domain;
  return name.substring(0, 2) + '***@' + domain;
};

// 数字格式化
export const formatNumber = (num) => {
  if (num === null || num === undefined) return '0';
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return String(num);
};

// 百分比格式化
export const formatPercent = (num, decimals = 1) => {
  if (num === null || num === undefined) return '0%';
  return (num * 100).toFixed(decimals) + '%';
};

// 防抖
export const debounce = (func, wait = 300) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// 节流
export const throttle = (func, limit = 300) => {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// 深拷贝
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map((item) => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
};

// 生成唯一ID
export const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// 验证手机号
export const isValidPhone = (phone) => {
  return /^1[3-9]\d{9}$/.test(phone);
};

// 验证邮箱
export const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// 延迟
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  formatDate,
  formatRelativeTime,
  getIntentionColor,
  getIntentionText,
  getLeadStatusText,
  getLeadStatusColor,
  truncateText,
  maskPhone,
  maskEmail,
  formatNumber,
  formatPercent,
  debounce,
  throttle,
  deepClone,
  generateId,
  isValidPhone,
  isValidEmail,
  delay,
};
