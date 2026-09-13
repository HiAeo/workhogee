/**
 * 通知中心页
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Card, EmptyState, Loading, Tag } from '../components';
import { useNotificationStore } from '../store';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { formatRelativeTime } from '../utils';

export default function NotificationsScreen({ navigation }) {
  const { notifications, unreadCount, fetchNotifications, markAsRead, markAllAsRead, isLoading } = useNotificationStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchNotifications(true);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications(true);
    setRefreshing(false);
  };

  const handleMarkAllRead = () => {
    Alert.alert(
      '全部已读',
      '确定将所有通知标记为已读吗？',
      [
        { text: '取消', style: 'cancel' },
        { text: '确定', onPress: () => markAllAsRead() },
      ]
    );
  };

  const getNotificationIcon = (type) => {
    const icons = {
      new_lead: '👤',
      new_conversation: '💬',
      new_email: '📧',
      follow_up_reminder: '⏰',
      report_ready: '📊',
      system: '🔔',
      default: '📌',
    };
    return icons[type] || icons.default;
  };

  const getNotificationTypeText = (type) => {
    const texts = {
      new_lead: '新线索',
      new_conversation: '新对话',
      new_email: '新邮件',
      follow_up_reminder: '跟进提醒',
      report_ready: '报告已生成',
      system: '系统通知',
      default: '通知',
    };
    return texts[type] || texts.default;
  };

  const renderNotificationItem = ({ item }) => (
    <TouchableOpacity
      style={[styles.notificationItem, !item.read && styles.unreadItem]}
      onPress={() => {
        if (!item.read) markAsRead(item.id);
        // 根据通知类型跳转到对应页面
        if (item.type === 'new_lead' && item.leadId) {
          navigation.navigate('LeadDetail', { id: item.leadId });
        } else if (item.type === 'new_conversation' && item.conversationId) {
          navigation.navigate('Chat', { conversationId: item.conversationId });
        } else if (item.type === 'new_email') {
          navigation.navigate('Email');
        }
      }}
    >
      <View style={styles.notificationIcon}>
        <Text style={styles.iconText}>{getNotificationIcon(item.type)}</Text>
      </View>
      <View style={styles.notificationContent}>
        <View style={styles.notificationHeader}>
          <Text style={styles.notificationTitle}>{item.title}</Text>
          {!item.read && <View style={styles.unreadDot} />}
        </View>
        <Text style={styles.notificationMessage} numberOfLines={2}>
          {item.message}
        </Text>
        <View style={styles.notificationFooter}>
          <Tag text={getNotificationTypeText(item.type)} color={colors.primary} size="xs" />
          <Text style={styles.notificationTime}>
            {formatRelativeTime(item.createdAt)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon="🔔"
        title="暂无通知"
        description="有新的线索、对话或邮件时会在这里提醒你"
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* 顶部操作栏 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>通知中心</Text>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text style={styles.markAllText}>全部已读</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={notifications}
        renderItem={renderNotificationItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={renderEmpty}
        onRefresh={onRefresh}
        refreshing={refreshing}
        contentContainerStyle={styles.listContent}
      />
    </View>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.ink,
  },
  markAllText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: spacing.xxxl,
  },
  notificationItem: {
    flexDirection: 'row',
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
  },
  unreadItem: {
    backgroundColor: colors.primary + '05',
  },
  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  iconText: {
    fontSize: 20,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  notificationTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.ink,
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: spacing.sm,
  },
  notificationMessage: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  notificationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  notificationTime: {
    fontSize: fontSize.xs,
    color: colors.inkFaint,
  },
});
