/**
 * WorkHogee API 服务封装
 * 与后端 REST API 交互
 */

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_BASE_URL = Constants?.expoConfig?.extra?.apiBaseUrl || 'http://localhost:3000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器：添加认证 token
apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.error('获取token失败:', e);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 响应拦截器：统一错误处理
apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    if (error.response?.status === 401) {
      try {
        await AsyncStorage.removeItem('auth_token');
        await AsyncStorage.removeItem('user_info');
      } catch (e) {
        console.error('清除token失败:', e);
      }
    }
    return Promise.reject(error);
  }
);

// ========== 认证相关 ==========
export const authApi = {
  login: (username, password) =>
    apiClient.post('/auth/login', { username, password }),

  register: (data) =>
    apiClient.post('/auth/register', data),

  getProfile: () =>
    apiClient.get('/auth/profile'),

  updateProfile: (data) =>
    apiClient.put('/auth/profile', data),
};

// ========== 线索管理 ==========
export const leadApi = {
  list: (params = {}) =>
    apiClient.get('/leads', { params }),

  get: (id) =>
    apiClient.get(`/leads/${id}`),

  create: (data) =>
    apiClient.post('/leads', data),

  update: (id, data) =>
    apiClient.put(`/leads/${id}`, data),

  delete: (id) =>
    apiClient.delete(`/leads/${id}`),

  updateStatus: (id, status) =>
    apiClient.put(`/leads/${id}/status`, { status }),

  addFollowUp: (id, data) =>
    apiClient.post(`/leads/${id}/follow-ups`, data),

  stats: () =>
    apiClient.get('/leads/stats'),

  export: (format = 'json') =>
    apiClient.get(`/leads/export?format=${format}`),
};

// ========== 对话管理 ==========
export const conversationApi = {
  list: (params = {}) =>
    apiClient.get('/conversations', { params }),

  get: (id) =>
    apiClient.get(`/conversations/${id}`),

  create: (data) =>
    apiClient.post('/conversations', data),

  sendMessage: (id, message) =>
    apiClient.post(`/conversations/${id}/messages`, { message }),

  getMessages: (id, params = {}) =>
    apiClient.get(`/conversations/${id}/messages`, { params }),

  endConversation: (id) =>
    apiClient.post(`/conversations/${id}/end`),

  analyze: (id) =>
    apiClient.get(`/conversations/${id}/analyze`),
};

// ========== 通知 ==========
export const notificationApi = {
  list: (params = {}) =>
    apiClient.get('/notifications', { params }),

  markAsRead: (id) =>
    apiClient.put(`/notifications/${id}/read`),

  markAllAsRead: () =>
    apiClient.put('/notifications/read-all'),

  getUnreadCount: () =>
    apiClient.get('/notifications/unread-count'),
};

// ========== 日报/周报 ==========
export const reportApi = {
  list: (params = {}) =>
    apiClient.get('/reports', { params }),

  get: (id) =>
    apiClient.get(`/reports/${id}`),

  generate: (type = 'daily', date = null) =>
    apiClient.post('/reports/generate', { type, date }),

  getLatest: (type = 'daily') =>
    apiClient.get(`/reports/latest?type=${type}`),
};

// ========== 知识库 ==========
export const knowledgeApi = {
  list: (params = {}) =>
    apiClient.get('/knowledge/items', { params }),

  get: (id) =>
    apiClient.get(`/knowledge/items/${id}`),

  create: (data) =>
    apiClient.post('/knowledge/items', data),

  update: (id, data) =>
    apiClient.put(`/knowledge/items/${id}`, data),

  delete: (id) =>
    apiClient.delete(`/knowledge/items/${id}`),

  search: (query) =>
    apiClient.get('/knowledge/search', { params: { q: query } }),

  stats: () =>
    apiClient.get('/knowledge/stats'),

  categories: () =>
    apiClient.get('/knowledge/categories'),
};

// ========== 邮箱渠道 ==========
export const emailApi = {
  // 邮箱配置
  listAccounts: () =>
    apiClient.get('/email/accounts'),

  getAccount: (id) =>
    apiClient.get(`/email/accounts/${id}`),

  createAccount: (data) =>
    apiClient.post('/email/accounts', data),

  updateAccount: (id, data) =>
    apiClient.put(`/email/accounts/${id}`, data),

  deleteAccount: (id) =>
    apiClient.delete(`/email/accounts/${id}`),

  testConnection: (id) =>
    apiClient.post(`/email/accounts/${id}/test`),

  // 邮件接收
  listEmails: (params = {}) =>
    apiClient.get('/email/receiver/emails', { params }),

  getEmail: (id) =>
    apiClient.get(`/email/receiver/emails/${id}`),

  checkAll: () =>
    apiClient.post('/email/receiver/check-all'),

  fetchAccount: (id) =>
    apiClient.post(`/email/receiver/accounts/${id}/fetch`),

  // 邮件发送
  generateReply: (emailId) =>
    apiClient.post(`/email/sender/generate-reply/${emailId}`),

  listDrafts: (status = null) =>
    apiClient.get('/email/sender/drafts', { params: { status } }),

  getDraft: (id) =>
    apiClient.get(`/email/sender/drafts/${id}`),

  saveDraft: (emailId, reply) =>
    apiClient.post('/email/sender/drafts', { emailId, reply }),

  updateDraft: (id, data) =>
    apiClient.put(`/email/sender/drafts/${id}`, data),

  approveAndSend: (id) =>
    apiClient.post(`/email/sender/drafts/${id}/approve-send`),

  autoReply: (emailId) =>
    apiClient.post(`/email/sender/auto-reply/${emailId}`),

  sendEmail: (data) =>
    apiClient.post('/email/sender/send', data),

  listSent: (params = {}) =>
    apiClient.get('/email/sender/sent', { params }),

  // 模板
  listTemplates: (category = null) =>
    apiClient.get('/email/sender/templates', { params: { category } }),

  createTemplate: (data) =>
    apiClient.post('/email/sender/templates', data),

  updateTemplate: (id, data) =>
    apiClient.put(`/email/sender/templates/${id}`, data),

  deleteTemplate: (id) =>
    apiClient.delete(`/email/sender/templates/${id}`),
};

// ========== 内容智造 ==========
export const contentApi = {
  generateXiaohongshu: (data) =>
    apiClient.post('/content/xiaohongshu', data),

  generateArticle: (data) =>
    apiClient.post('/content/article', data),

  generateCopy: (data) =>
    apiClient.post('/content/copy', data),

  getContentCalendar: (params = {}) =>
    apiClient.get('/content/calendar', { params }),
};

// ========== 线索培育 ==========
export const nurtureApi = {
  generateFollowUp: (data) =>
    apiClient.post('/nurture/follow-up', data),

  generateNurtureContent: (data) =>
    apiClient.post('/nurture/content', data),

  createPlan: (data) =>
    apiClient.post('/nurture/plan', data),

  getPending: (params = {}) =>
    apiClient.get('/nurture/pending', { params }),

  recordResult: (id, data) =>
    apiClient.post(`/nurture/${id}/result`, data),
};

// ========== 客户画像 ==========
export const profileApi = {
  get: (leadId) =>
    apiClient.get(`/profiles/${leadId}`),

  update: (leadId, data) =>
    apiClient.put(`/profiles/${leadId}`, data),

  getTags: () =>
    apiClient.get('/profiles/tags'),

  addTag: (leadId, tag) =>
    apiClient.post(`/profiles/${leadId}/tags`, { tag }),

  removeTag: (leadId, tag) =>
    apiClient.delete(`/profiles/${leadId}/tags`, { data: { tag } }),
};

// ========== 数据分析 ==========
export const analyticsApi = {
  getDashboard: () =>
    apiClient.get('/analytics/dashboard'),

  getConversionFunnel: () =>
    apiClient.get('/analytics/funnel'),

  getChannelAnalysis: () =>
    apiClient.get('/analytics/channels'),

  getIntentionDistribution: () =>
    apiClient.get('/analytics/intention'),
};

// ========== 系统 ==========
export const systemApi = {
  health: () =>
    apiClient.get('/health'),

  getConfig: () =>
    apiClient.get('/config'),

  getVersion: () =>
    apiClient.get('/version'),
};

export default {
  auth: authApi,
  lead: leadApi,
  conversation: conversationApi,
  notification: notificationApi,
  report: reportApi,
  knowledge: knowledgeApi,
  email: emailApi,
  content: contentApi,
  nurture: nurtureApi,
  profile: profileApi,
  analytics: analyticsApi,
  system: systemApi,
};
