/**
 * WorkHogee 全局状态管理
 * 使用 zustand
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi, leadApi, notificationApi } from '../services/api';

// ========== 认证状态 ==========
export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  init: async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const userInfo = await AsyncStorage.getItem('user_info');

      if (token && userInfo) {
        set({
          token,
          user: JSON.parse(userInfo),
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      }
      set({ isLoading: false });
      return false;
    } catch (e) {
      console.error('初始化认证状态失败:', e);
      set({ isLoading: false });
      return false;
    }
  },

  login: async (username, password) => {
    try {
      const response = await authApi.login(username, password);
      const { token, user } = response.data;

      await AsyncStorage.setItem('auth_token', token);
      await AsyncStorage.setItem('user_info', JSON.stringify(user));

      set({ token, user, isAuthenticated: true });
      return { success: true, user };
    } catch (e) {
      return { success: false, error: e.response?.data?.error || e.message };
    }
  },

  logout: async () => {
    try {
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('user_info');
    } catch (e) {
      console.error('登出失败:', e);
    }
    set({ user: null, token: null, isAuthenticated: false });
  },

  updateUser: (userData) => {
    set((state) => ({ user: { ...state.user, ...userData } }));
  },
}));

// ========== 线索状态 ==========
export const useLeadStore = create((set, get) => ({
  leads: [],
  currentLead: null,
  isLoading: false,
  hasMore: true,
  page: 1,
  total: 0,
  filters: {
    status: null,
    intentionLevel: null,
    source: null,
    keyword: '',
  },

  fetchLeads: async (reset = false) => {
    if (get().isLoading) return;

    const page = reset ? 1 : get().page;
    set({ isLoading: true });

    try {
      const response = await leadApi.list({
        page,
        pageSize: 20,
        ...get().filters,
      });

      const { leads, total } = response.data;

      set((state) => ({
        leads: reset ? leads : [...state.leads, ...leads],
        total,
        page: page + 1,
        hasMore: (reset ? leads.length : state.leads.length + leads.length) < total,
        isLoading: false,
      }));
    } catch (e) {
      console.error('获取线索列表失败:', e);
      set({ isLoading: false });
    }
  },

  fetchLeadDetail: async (id) => {
    try {
      const response = await leadApi.get(id);
      set({ currentLead: response.data });
      return response.data;
    } catch (e) {
      console.error('获取线索详情失败:', e);
      return null;
    }
  },

  createLead: async (data) => {
    try {
      const response = await leadApi.create(data);
      set((state) => ({
        leads: [response.data, ...state.leads],
        total: state.total + 1,
      }));
      return { success: true, lead: response.data };
    } catch (e) {
      return { success: false, error: e.response?.data?.error || e.message };
    }
  },

  updateLead: async (id, data) => {
    try {
      const response = await leadApi.update(id, data);
      set((state) => ({
        leads: state.leads.map((l) => (l.id === id ? response.data : l)),
        currentLead: state.currentLead?.id === id ? response.data : state.currentLead,
      }));
      return { success: true, lead: response.data };
    } catch (e) {
      return { success: false, error: e.response?.data?.error || e.message };
    }
  },

  updateLeadStatus: async (id, status) => {
    try {
      const response = await leadApi.updateStatus(id, status);
      set((state) => ({
        leads: state.leads.map((l) => (l.id === id ? { ...l, status } : l)),
        currentLead: state.currentLead?.id === id ? { ...state.currentLead, status } : state.currentLead,
      }));
      return { success: true };
    } catch (e) {
      return { success: false, error: e.response?.data?.error || e.message };
    }
  },

  setFilters: (filters) => {
    set((state) => ({ filters: { ...state.filters, ...filters } }));
  },

  resetFilters: () => {
    set({
      filters: {
        status: null,
        intentionLevel: null,
        source: null,
        keyword: '',
      },
      leads: [],
      page: 1,
      hasMore: true,
    });
  },

  clearCurrentLead: () => {
    set({ currentLead: null });
  },
}));

// ========== 通知状态 ==========
export const useNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchNotifications: async (reset = false) => {
    if (get().isLoading) return;
    set({ isLoading: true });

    try {
      const response = await notificationApi.list({ page: 1, pageSize: 50 });
      const { notifications } = response.data;

      set({
        notifications: reset ? notifications : [...get().notifications, ...notifications],
        isLoading: false,
      });

      // 更新未读数量
      get().fetchUnreadCount();
    } catch (e) {
      console.error('获取通知列表失败:', e);
      set({ isLoading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const response = await notificationApi.getUnreadCount();
      set({ unreadCount: response.data.count || 0 });
    } catch (e) {
      console.error('获取未读数量失败:', e);
    }
  },

  markAsRead: async (id) => {
    try {
      await notificationApi.markAsRead(id);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch (e) {
      console.error('标记已读失败:', e);
    }
  },

  markAllAsRead: async () => {
    try {
      await notificationApi.markAllAsRead();
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch (e) {
      console.error('全部标记已读失败:', e);
    }
  },

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }));
  },
}));

// ========== 应用状态 ==========
export const useAppStore = create((set) => ({
  isOnline: true,
  isDarkMode: false,
  language: 'zh-CN',
  apiBaseUrl: 'http://localhost:3000/api',

  setOnline: (isOnline) => set({ isOnline }),
  setDarkMode: (isDarkMode) => set({ isDarkMode }),
  setLanguage: (language) => set({ language }),
  setApiBaseUrl: (url) => set({ apiBaseUrl: url }),
}));

export default {
  useAuthStore,
  useLeadStore,
  useNotificationStore,
  useAppStore,
};
