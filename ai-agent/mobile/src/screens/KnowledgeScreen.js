/**
 * 知识库页
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Card, EmptyState, Loading, Button, Tag } from '../components';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { formatRelativeTime } from '../utils';
import { knowledgeApi } from '../services/api';

export default function KnowledgeScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [itemsRes, categoriesRes] = await Promise.all([
        knowledgeApi.list({ page: 1, pageSize: 50 }),
        knowledgeApi.categories(),
      ]);
      setItems(itemsRes.data.items || []);
      setCategories(categoriesRes.data || []);
    } catch (e) {
      console.error('加载知识库失败:', e);
    }
    setLoading(false);
  };

  const handleSearch = async (text) => {
    setSearchText(text);
    if (text.trim()) {
      try {
        const response = await knowledgeApi.search(text);
        setItems(response.data.results || []);
      } catch (e) {
        console.error('搜索失败:', e);
      }
    } else {
      loadData();
    }
  };

  const handleAddItem = () => {
    Alert.alert('添加知识', '功能开发中...');
  };

  const filteredItems = activeCategory === 'all'
    ? items
    : items.filter((item) => item.category === activeCategory);

  const renderItem = (item, index) => (
    <TouchableOpacity
      key={item.id || index}
      style={styles.itemCard}
      onPress={() => Alert.alert(item.title, item.content || '暂无内容')}
    >
      <View style={styles.itemHeader}>
        <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
        {item.category && (
          <Tag text={item.category} color={colors.primary} size="xs" />
        )}
      </View>
      <Text style={styles.itemContent} numberOfLines={2}>
        {item.content || '暂无内容'}
      </Text>
      <View style={styles.itemFooter}>
        <Text style={styles.itemMeta}>
          {item.type === 'faq' ? '❓ FAQ' : item.type === 'product' ? '📦 产品' : '📄 文档'}
        </Text>
        <Text style={styles.itemTime}>{formatRelativeTime(item.updatedAt || item.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* 搜索框 */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="搜索知识库..."
            value={searchText}
            onChangeText={handleSearch}
          />
        </View>
      </View>

      {/* 分类标签 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContent}
      >
        <TouchableOpacity
          style={[styles.categoryTag, activeCategory === 'all' && styles.categoryTagActive]}
          onPress={() => setActiveCategory('all')}
        >
          <Text style={[styles.categoryText, activeCategory === 'all' && styles.categoryTextActive]}>
            全部
          </Text>
        </TouchableOpacity>
        {categories.map((cat, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.categoryTag, activeCategory === cat && styles.categoryTagActive]}
            onPress={() => setActiveCategory(cat)}
          >
            <Text style={[styles.categoryText, activeCategory === cat && styles.categoryTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 知识列表 */}
      {loading ? (
        <Loading text="加载知识库..." />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon="📚"
          title="暂无知识"
          description="点击下方按钮添加第一条知识"
          action={
            <Button title="添加知识" onPress={handleAddItem} style={{ marginTop: spacing.lg }} />
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {filteredItems.map(renderItem)}
        </ScrollView>
      )}

      {/* 添加按钮 */}
      <TouchableOpacity style={styles.fab} onPress={handleAddItem}>
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
  searchContainer: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
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
  categoryScroll: {
    maxHeight: 44,
  },
  categoryContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  categoryTag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.sand,
  },
  categoryTagActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
  },
  categoryTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 3,
  },
  itemCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...colors.shadow?.sm,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  itemTitle: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.ink,
    marginRight: spacing.sm,
  },
  itemContent: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemMeta: {
    fontSize: fontSize.xs,
    color: colors.inkMuted,
  },
  itemTime: {
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
});
