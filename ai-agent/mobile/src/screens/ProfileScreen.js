/**
 * 我的页面
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useAuthStore } from '../store';
import { Card, Divider } from '../components';
import { colors, spacing, fontSize, borderRadius } from '../theme';

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert(
      '退出登录',
      '确定要退出登录吗？',
      [
        { text: '取消', style: 'cancel' },
        { text: '确定', onPress: () => logout() },
      ]
    );
  };

  const menuItems = [
    {
      section: '业务功能',
      items: [
        { icon: '👥', label: '线索管理', action: () => navigation.navigate('Leads') },
        { icon: '💬', label: '智能对话', action: () => navigation.navigate('Conversation') },
        { icon: '📧', label: '邮箱渠道', action: () => navigation.navigate('Email') },
        { icon: '📊', label: '日报周报', action: () => navigation.navigate('Reports') },
        { icon: '📚', label: '知识库', action: () => navigation.navigate('Knowledge') },
      ],
    },
    {
      section: '系统设置',
      items: [
        { icon: '⚙️', label: '设置', action: () => navigation.navigate('Settings') },
        { icon: '🔔', label: '通知设置', action: () => navigation.navigate('Notifications') },
        { icon: '❓', label: '帮助中心', action: () => Alert.alert('帮助中心', '功能开发中...') },
        { icon: 'ℹ️', label: '关于我们', action: () => Alert.alert('关于 WorkHogee', 'WorkHogee AI 获客伙计 v1.0.0\n\n让每一个中小企业都拥有专属的 AI 获客团队') },
      ],
    },
  ];

  return (
    <ScrollView style={styles.container}>
      {/* 用户信息卡片 */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name || 'U').substring(0, 1).toUpperCase()}
          </Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{user?.name || '用户'}</Text>
          <Text style={styles.userRole}>{user?.role || '管理员'}</Text>
          <Text style={styles.userCompany}>{user?.company || 'WorkHogee'}</Text>
        </View>
      </View>

      {/* 数据概览 */}
      <Card style={styles.statsCard}>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>总线索</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>已转化</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>0</Text>
            <Text style={styles.statLabel}>转化率</Text>
          </View>
        </View>
      </Card>

      {/* 菜单列表 */}
      {menuItems.map((section, sectionIndex) => (
        <View key={sectionIndex} style={styles.menuSection}>
          <Text style={styles.sectionTitle}>{section.section}</Text>
          <Card style={styles.menuCard}>
            {section.items.map((item, itemIndex) => (
              <TouchableOpacity
                key={itemIndex}
                style={styles.menuItem}
                onPress={item.action}
              >
                <View style={styles.menuItemLeft}>
                  <Text style={styles.menuIcon}>{item.icon}</Text>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                </View>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
            ))}
            {sectionIndex < menuItems.length - 1 && <Divider style={{ marginVertical: 0 }} />}
          </Card>
        </View>
      ))}

      {/* 退出登录 */}
      <View style={styles.logoutSection}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>退出登录</Text>
        </TouchableOpacity>
      </View>

      {/* 版本信息 */}
      <Text style={styles.versionText}>WorkHogee v1.0.0</Text>

      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xl,
    backgroundColor: colors.primary,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.primary,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.white,
  },
  userRole: {
    fontSize: fontSize.sm,
    color: colors.white + 'CC',
    marginTop: spacing.xs,
  },
  userCompany: {
    fontSize: fontSize.sm,
    color: colors.white + '99',
    marginTop: 2,
  },
  statsCard: {
    margin: spacing.lg,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.ink,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.sand,
  },
  menuSection: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    marginLeft: spacing.lg,
    marginBottom: spacing.sm,
    fontWeight: '500',
  },
  menuCard: {
    marginHorizontal: spacing.lg,
    padding: 0,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIcon: {
    fontSize: 20,
    marginRight: spacing.md,
    width: 24,
  },
  menuLabel: {
    fontSize: fontSize.md,
    color: colors.ink,
  },
  menuArrow: {
    fontSize: 20,
    color: colors.inkFaint,
  },
  logoutSection: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  logoutBtn: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    ...colors.shadow?.sm,
  },
  logoutText: {
    fontSize: fontSize.md,
    color: colors.error,
    fontWeight: '600',
  },
  versionText: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.inkFaint,
    marginTop: spacing.xl,
  },
});
