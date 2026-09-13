/**
 * 对话列表页
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Card, EmptyState, Loading, Tag } from '../components';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { formatRelativeTime } from '../utils';
import { conversationApi } from '../services/api';

export default function ConversationScreen({ navigation }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const response = await conversationApi.list({ page: 1, pageSize: 50 });
      setConversations(response.data.conversations || []);
    } catch (e) {
      console.error('加载对话列表失败:', e);
    }
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadConversations();
    setRefreshing(false);
  };

  const renderConversationItem = ({ item }) => (
    <TouchableOpacity
      style={styles.conversationItem}
      onPress={() => navigation.navigate('Chat', { conversationId: item.id })}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>🤖</Text>
      </View>
      <View style={styles.conversationInfo}>
        <View style={styles.conversationHeader}>
          <Text style={styles.conversationTitle}>
            {item.leadName || '智能对话'}
          </Text>
          <Text style={styles.conversationTime}>
            {formatRelativeTime(item.updatedAt || item.createdAt)}
          </Text>
        </View>
        <Text style={styles.conversationPreview} numberOfLines={1}>
          {item.lastMessage || '点击开始对话...'}
        </Text>
        <View style={styles.conversationMeta}>
          {item.status === 'active' && (
            <Tag text="进行中" color={colors.primary} size="xs" />
          )}
          {item.status === 'ended' && (
            <Tag text="已结束" color={colors.inkMuted} size="xs" />
          )}
          {item.leadId && (
            <Text style={styles.leadTag}>关联线索</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <EmptyState
        icon="💬"
        title="暂无对话"
        description="点击下方按钮开始与 AI 获客伙计对话"
        action={
          <TouchableOpacity
            style={styles.newChatBtn}
            onPress={() => navigation.navigate('Chat', {})}
          >
            <Text style={styles.newChatText}>+ 新建对话</Text>
          </TouchableOpacity>
        }
      />
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        renderItem={renderConversationItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={renderEmpty}
        onRefresh={onRefresh}
        refreshing={refreshing}
        contentContainerStyle={styles.listContent}
      />

      {/* 新建对话按钮 */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Chat', {})}
      >
        <Text style={styles.fabIcon}>💬</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  listContent: {
    paddingBottom: spacing.xxxl * 3,
  },
  conversationItem: {
    flexDirection: 'row',
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: 24,
  },
  conversationInfo: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  conversationTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.ink,
  },
  conversationTime: {
    fontSize: fontSize.xs,
    color: colors.inkFaint,
  },
  conversationPreview: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    marginBottom: spacing.xs,
  },
  conversationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leadTag: {
    fontSize: fontSize.xs,
    color: colors.info,
    marginLeft: spacing.sm,
  },
  newChatBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.full,
  },
  newChatText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...colors.shadow?.lg,
  },
  fabIcon: {
    fontSize: 24,
  },
});
