/**
 * WorkHogee 移动端导航系统
 * 包含底部标签导航和堆栈导航
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuthStore } from '../store';
import { colors } from '../theme';

// 页面组件（后续任务开发）
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import LeadsScreen from '../screens/LeadsScreen';
import LeadDetailScreen from '../screens/LeadDetailScreen';
import CreateLeadScreen from '../screens/CreateLeadScreen';
import ConversationScreen from '../screens/ConversationScreen';
import ChatScreen from '../screens/ChatScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ReportsScreen from '../screens/ReportsScreen';
import ReportDetailScreen from '../screens/ReportDetailScreen';
import KnowledgeScreen from '../screens/KnowledgeScreen';
import EmailScreen from '../screens/EmailScreen';
import EmailDetailScreen from '../screens/EmailDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// 底部标签导航
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.sand,
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
        headerStyle: {
          backgroundColor: colors.white,
        },
        headerTitleStyle: {
          fontSize: 16,
          fontWeight: '600',
          color: colors.ink,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: '首页',
          tabBarIcon: ({ color, size }) => (
            // 使用 SVG 图标或 emoji 占位
            <Text style={{ fontSize: size, color }}>🏠</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Leads"
        component={LeadsScreen}
        options={{
          title: '线索',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color }}>👥</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Conversation"
        component={ConversationScreen}
        options={{
          title: '对话',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color }}>💬</Text>
          ),
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: '通知',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color }}>🔔</Text>
          ),
          tabBarBadge: useNotificationStore.getState().unreadCount > 0
            ? useNotificationStore.getState().unreadCount
            : undefined,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: '我的',
          tabBarIcon: ({ color, size }) => (
            <Text style={{ fontSize: size, color }}>👤</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// 根导航
export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return <SplashScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.white,
          },
          headerTitleStyle: {
            fontSize: 16,
            fontWeight: '600',
            color: colors.ink,
          },
          headerTintColor: colors.primary,
        }}
      >
        {!isAuthenticated ? (
          // 未登录：显示登录页
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : (
          // 已登录：显示主导航
          <>
            <Stack.Screen
              name="Main"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="LeadDetail"
              component={LeadDetailScreen}
              options={{ title: '线索详情' }}
            />
            <Stack.Screen
              name="CreateLead"
              component={CreateLeadScreen}
              options={{ title: '新建线索' }}
            />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={{ title: '智能对话' }}
            />
            <Stack.Screen
              name="Reports"
              component={ReportsScreen}
              options={{ title: '日报周报' }}
            />
            <Stack.Screen
              name="ReportDetail"
              component={ReportDetailScreen}
              options={{ title: '报告详情' }}
            />
            <Stack.Screen
              name="Knowledge"
              component={KnowledgeScreen}
              options={{ title: '知识库' }}
            />
            <Stack.Screen
              name="Email"
              component={EmailScreen}
              options={{ title: '邮箱渠道' }}
            />
            <Stack.Screen
              name="EmailDetail"
              component={EmailDetailScreen}
              options={{ title: '邮件详情' }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ title: '设置' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
