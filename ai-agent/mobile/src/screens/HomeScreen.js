/**
 * 首页仪表盘
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useAuthStore, useLeadStore, useNotificationStore } from '../store';
import { Card, Tag, StatCard, Button, EmptyState, Loading } from '../components';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { formatRelativeTime, getIntentionColor, getIntentionText } from '../utils';
import { analyticsApi, leadApi } from '../services/api';

export default function HomeScreen({ navigation }) {
  const user = useAuthStore((state) => state.user);
  const { leads, fetchLeads } = useLeadStore();
  const { unreadCount, fetchUnreadCount } = useNotificationStore();
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsRes, leadsRes] = await Promise.all([
        analyticsApi.getDashboard(),
        leadApi.list({ page: 1, pageSize: 5 }),
      ]);
      setStats(statsRes.data);
    } catch (e) {
      console.error('加载首页数据失败:', e);
    }
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    fetchUnreadCount();
    setRefreshing(false);
  };

  const quickActions = [
    { icon: '➕', label: '新建线索', action: () => navigation.navigate('CreateLead') },
    { icon: '💬', label: '智能对话', action: () => navigation.navigate('Conversation') },
    { icon: '📊', label: '日报周报', action: () => navigation.navigate('Reports') },
    { icon: '📚', label: '知识库', action: () => navigation.navigate('Knowledge') },
  ];

  if (loading) {
    return <Loading text="加载中..." />;
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* 顶部欢迎区 */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>你好，{user?.name || '老板'} 👋</Text>
          <Text style={styles.subGreeting}>今天也是获客的好日子</Text>
        </View>
        <TouchableOpacity
          style={styles.notificationBtn}
          onPress={() => navigation.navigate('Notifications')}
        >
          <Text style={{ fontSize: 22 }}>🔔</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* 数据统计卡片 */}
      <View style={styles.statsRow}>
        <StatCard
          label="今日新增"
          value={stats?.todayNew || 0}
          color={colors.primary}
        />
        <StatCard
          label="待跟进"
          value={stats?.pending || 0}
          color={colors.warning}
        />
        <StatCard
          label="已转化"
          value={stats?.converted || 0}
          color={colors.success}
        />
      </View>

      {/* 快捷操作 */}
      <Card style={styles.quickActions}>
        <Text style={styles.sectionTitle}>快捷操作</Text>
        <View style={styles.actionGrid}>
          {quickActions.map((action, index) => (
            <TouchableOpacity
              key={index}
              style={styles.actionItem}
              onPress={action.action}
            >
              <Text style={styles.actionIcon}>{action.icon}</Text>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* 最新线索 */}
      <Card style={styles.latestLeads}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>最新线索</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Leads')}>
            <Text style={styles.seeAll}>查看全部</Text>
          </TouchableOpacity>
        </View>

        {leads.length === 0 ? (
          <EmptyState
            icon="📭"
            title="暂无线索"
            description="点击上方新建线索开始获客"
          />
        ) : (
          leads.slice(0, 5).map((lead) => (
            <TouchableOpacity
              key={lead.id}
              style={styles.leadItem}
              onPress={() => navigation.navigate('LeadDetail', { id: lead.id })}
            >
              <View style={styles.leadInfo}>
                <Text style={styles.leadName}>{lead.name || '未知客户'}</Text>
                <Text style={styles.leadMeta}>
                  {lead.source || '未知来源'} · {formatRelativeTime(lead.createdAt)}
                </Text>
              </View>
              <Tag
                text={getIntentionText(lead.intentionLevel)}
                color={getIntentionColor(lead.intentionLevel)}
                size="xs"
              />
            </TouchableOpacity>
          ))
        )}
      </Card>

      {/* 邮箱渠道入口 */}
      <TouchableOpacity
        style={styles.emailEntry}
        onPress={() => navigation.navigate('Email')}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 24, marginRight: spacing.md }}>📧</Text>
          <View>
            <Text style={styles.emailTitle}>邮箱渠道</Text>
            <Text style={styles.emailDesc}>自动识别询盘邮件，智能回复客户</Text>
          </View>
        </View>
        <Text style={{ fontSize: 20, color: colors.inkFaint }}>›</Text>
      </TouchableOpacity>

      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    paddingTop: spacing.xl,
  },
  greeting: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.ink,
  },
  subGreeting: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow?.sm,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.error,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  quickActions: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  seeAll: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionItem: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  actionIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  actionLabel: {
    fontSize: fontSize.xs,
    color: colors.ink,
    textAlign: 'center',
  },
  latestLeads: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  leadItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
  },
  leadInfo: {
    flex: 1,
  },
  leadName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.ink,
  },
  leadMeta: {
    fontSize: fontSize.xs,
    color: colors.inkMuted,
    marginTop: 2,
  },
  emailEntry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    ...colors.shadow?.md,
  },
  emailTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.ink,
  },
  emailDesc: {
    fontSize: fontSize.xs,
    color: colors.inkMuted,
    marginTop: 2,
  },
});
