/**
 * 线索列表页
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useLeadStore } from '../store';
import { Card, Tag, EmptyState, Loading, Button } from '../components';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { formatRelativeTime, getIntentionColor, getIntentionText, getLeadStatusColor, getLeadStatusText } from '../utils';

export default function LeadsScreen({ navigation }) {
  const { leads, isLoading, hasMore, fetchLeads, setFilters, filters, resetFilters } = useLeadStore();
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    fetchLeads(true);
  }, []);

  const handleSearch = (text) => {
    setSearchText(text);
    setFilters({ keyword: text });
    fetchLeads(true);
  };

  const handleFilter = (filter) => {
    setActiveFilter(filter);
    if (filter === 'all') {
      resetFilters();
    } else {
      setFilters({ status: filter === 'all' ? null : filter });
    }
    fetchLeads(true);
  };

  const renderLeadItem = ({ item }) => (
    <TouchableOpacity
      style={styles.leadCard}
      onPress={() => navigation.navigate('LeadDetail', { id: item.id })}
    >
      <View style={styles.leadHeader}>
        <Text style={styles.leadName}>{item.name || '未知客户'}</Text>
        <Tag
          text={getIntentionText(item.intentionLevel)}
          color={getIntentionColor(item.intentionLevel)}
          size="xs"
        />
      </View>

      <View style={styles.leadMeta}>
        <Text style={styles.metaText}>📞 {item.phone || '暂无电话'}</Text>
        <Text style={styles.metaText}>📧 {item.email || '暂无邮箱'}</Text>
      </View>

      <View style={styles.leadFooter}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Tag
            text={getLeadStatusText(item.status)}
            color={getLeadStatusColor(item.status)}
            size="xs"
          />
          <Text style={styles.sourceText}>{item.source || '未知来源'}</Text>
        </View>
        <Text style={styles.timeText}>{formatRelativeTime(item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      {/* 搜索框 */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索客户姓名、电话、公司..."
          value={searchText}
          onChangeText={handleSearch}
          autoCapitalize="none"
        />
      </View>

      {/* 筛选标签 */}
      <View style={styles.filterRow}>
        {[
          { key: 'all', label: '全部' },
          { key: 'new', label: '新线索' },
          { key: 'following', label: '跟进中' },
          { key: 'converted', label: '已转化' },
        ].map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterTag,
              activeFilter === filter.key && styles.filterTagActive,
            ]}
            onPress={() => handleFilter(filter.key)}
          >
            <Text
              style={[
                styles.filterText,
                activeFilter === filter.key && styles.filterTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderFooter = () => {
    if (isLoading && leads.length > 0) {
      return <Loading size="small" text="加载更多..." />;
    }
    if (!hasMore && leads.length > 0) {
      return <Text style={styles.noMore}>没有更多了</Text>;
    }
    return null;
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <EmptyState
        icon="👥"
        title="暂无线索"
        description="点击下方按钮创建第一条线索"
        action={
          <Button
            title="新建线索"
            onPress={() => navigation.navigate('CreateLead')}
            style={{ marginTop: spacing.lg }}
          />
        }
      />
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={leads}
        renderItem={renderLeadItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
        onEndReached={() => hasMore && fetchLeads()}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.listContent}
        refreshing={isLoading}
        onRefresh={() => fetchLeads(true)}
      />

      {/* 新建按钮 */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateLead')}
      >
        <Text style={styles.fabIcon}>➕</Text>
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
  header: {
    padding: spacing.lg,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.sand,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.ink,
  },
  filterRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  filterTag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.sand,
  },
  filterTagActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
  },
  filterTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  leadCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    ...colors.shadow?.sm,
  },
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  leadName: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.ink,
  },
  leadMeta: {
    marginBottom: spacing.sm,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    marginBottom: 2,
  },
  leadFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.sand,
  },
  sourceText: {
    fontSize: fontSize.xs,
    color: colors.inkMuted,
    marginLeft: spacing.sm,
  },
  timeText: {
    fontSize: fontSize.xs,
    color: colors.inkFaint,
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
  noMore: {
    textAlign: 'center',
    color: colors.inkFaint,
    fontSize: fontSize.sm,
    paddingVertical: spacing.lg,
  },
});
