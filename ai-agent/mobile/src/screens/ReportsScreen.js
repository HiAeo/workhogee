/**
 * 日报周报页
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Card, Tag, EmptyState, Loading, Button } from '../components';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { formatDate, formatRelativeTime } from '../utils';
import { reportApi } from '../services/api';

export default function ReportsScreen({ navigation }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('daily');

  useEffect(() => {
    loadReports();
  }, [activeTab]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const response = await reportApi.list({ type: activeTab, page: 1, pageSize: 20 });
      setReports(response.data.reports || []);
    } catch (e) {
      console.error('加载报告失败:', e);
    }
    setLoading(false);
  };

  const handleGenerate = async () => {
    try {
      await reportApi.generate(activeTab);
      await loadReports();
    } catch (e) {
      console.error('生成报告失败:', e);
    }
  };

  const renderReportItem = (report, index) => (
    <TouchableOpacity
      key={report.id || index}
      style={styles.reportItem}
      onPress={() => navigation.navigate('ReportDetail', { id: report.id })}
    >
      <View style={styles.reportHeader}>
        <Text style={styles.reportTitle}>
          {report.type === 'daily' ? '日报' : '周报'} - {formatDate(report.date || report.createdAt, 'MM-DD')}
        </Text>
        <Tag
          text={report.type === 'daily' ? '日报' : '周报'}
          color={report.type === 'daily' ? colors.primary : colors.info}
          size="xs"
        />
      </View>
      <Text style={styles.reportSummary} numberOfLines={2}>
        {report.summary || '点击查看详细报告内容...'}
      </Text>
      <View style={styles.reportMeta}>
        <Text style={styles.metaText}>📊 {report.stats?.totalLeads || 0} 条线索</Text>
        <Text style={styles.metaText}>✅ {report.stats?.converted || 0} 已转化</Text>
        <Text style={styles.metaTime}>{formatRelativeTime(report.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* 标签切换 */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'daily' && styles.tabActive]}
          onPress={() => setActiveTab('daily')}
        >
          <Text style={[styles.tabText, activeTab === 'daily' && styles.tabTextActive]}>
            日报
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'weekly' && styles.tabActive]}
          onPress={() => setActiveTab('weekly')}
        >
          <Text style={[styles.tabText, activeTab === 'weekly' && styles.tabTextActive]}>
            周报
          </Text>
        </TouchableOpacity>
      </View>

      {/* 生成按钮 */}
      <View style={styles.actionBar}>
        <Button
          title={`生成${activeTab === 'daily' ? '今日' : '本周'}报告`}
          onPress={handleGenerate}
          size="sm"
          style={{ flex: 1 }}
        />
      </View>

      {/* 报告列表 */}
      {loading ? (
        <Loading text="加载报告列表..." />
      ) : reports.length === 0 ? (
        <EmptyState
          icon="📊"
          title="暂无报告"
          description="点击上方按钮生成第一份报告"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {reports.map(renderReportItem)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.full,
    marginHorizontal: spacing.xs,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: fontSize.md,
    color: colors.inkMuted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  actionBar: {
    flexDirection: 'row',
    padding: spacing.lg,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  reportItem: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...colors.shadow?.sm,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  reportTitle: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.ink,
  },
  reportSummary: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  reportMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: fontSize.xs,
    color: colors.inkMuted,
    marginRight: spacing.md,
  },
  metaTime: {
    fontSize: fontSize.xs,
    color: colors.inkFaint,
    marginLeft: 'auto',
  },
});
