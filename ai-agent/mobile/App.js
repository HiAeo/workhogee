/**
 * WorkHogee AI 获客伙计 - 移动端 APP 入口
 */

import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { useAuthStore, useNotificationStore } from './src/store';
import { colors } from './src/theme';

export default function App() {
  const initAuth = useAuthStore((state) => state.init);
  const fetchUnreadCount = useNotificationStore((state) => state.fetchUnreadCount);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    // 初始化认证状态
    initAuth();
  }, [initAuth]);

  useEffect(() => {
    // 登录后获取未读通知数量
    if (isAuthenticated) {
      fetchUnreadCount();
    }
  }, [isAuthenticated, fetchUnreadCount]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor={colors.paper} />
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
