/**
 * 报告详情页
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Card, Loading, Tag, Divider } from '../components';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { formatDate } from '../utils';
import { reportApi } from '../services/api';

export default function ReportDetailScreen({ route }) {
  const { id } = route.params;
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [id]);

  const loadReport = async () => {
    try {
      const response = await reportApi.get(id);
      setReport(response.data);
    } catch (e) {
      console.error('加载报告详情失败:', e);
    }
    setLoading(false);
  };

  if (loading || !report) {
    return <Loading text="加载报告详情..." />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 报告标题 */}
      <Card style={styles.headerCard}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {report.type === 'daily' ? '日报' : '周报'}
          </Text>
          <Tag
            text={report.type === 'daily' ? '日报' : '周报'}
            color={report.type === 'daily' ? colors.primary : colors.info}
          />
        </View>
        <Text style={styles.date}>
          {formatDate(report.date || report.createdAt, 'YYYY年MM月DD日')}
        </Text>
        <Text style={styles.summary}>{report.summary || '暂无摘要'}</Text>
      </Card>

      {/* 关键指标 */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>关键指标</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{report.stats?.totalLeads || 0}</Text>
            <Text style={styles.statLabel}>总线索</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{report.stats?.newLeads || 0}</Text>
            <Text style={styles.statLabel}>新增线索</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{report.stats?.converted || 0}</Text>
            <Text style={styles.statLabel}>已转化</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>
              {report.stats?.conversionRate ? (report.stats.conversionRate * 100).toFixed(1) + '%' : '0%'}
            </Text>
            <Text style={styles.statLabel}>转化率</Text>
          </View>
        </View>
      </Card>

      {/* 意向分布 */}
      {report.intentionDistribution && (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>意向等级分布</Text>
          {Object.entries(report.intentionDistribution).map(([level, count]) => (
            <View key={level} style={styles.distributionRow}>
              <Text style={styles.distributionLabel}>
                {level === 'A' ? '高意向' : level === 'B' ? '中意向' : '低意向'}
              </Text>
              <View style={styles.distributionBar}>
                <View
                  style={[
                    styles.distributionFill,
                    {
                      width: `${report.stats?.totalLeads ? (count / report.stats.totalLeads) * 100 : 0}%`,
                      backgroundColor: level === 'A' ? '#dc2626' : level === 'B' ? '#d97706' : '#6b7280',
                    },
                  ]}
                />
              </View>
              <Text style={styles.distributionCount}>{count}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* 渠道分析 */}
      {report.channelAnalysis && (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>渠道分析</Text>
          {Object.entries(report.channelAnalysis).map(([channel, count]) => (
            <View key={channel} style={styles.channelRow}>
              <Text style={styles.channelName}>{channel}</Text>
              <Text style={styles.channelCount}>{count} 条</Text>
            </View>
          ))}
        </Card>
      )}

      {/* 待跟进线索 */}
      {report.pendingLeads && report.pendingLeads.length > 0 && (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>待跟进线索</Text>
          {report.pendingLeads.map((lead, index) => (
            <View key={index} style={styles.leadRow}>
              <Text style={styles.leadName}>{lead.name || '未知客户'}</Text>
              <Text style={styles.leadPhone}>{lead.phone || '暂无电话'}</Text>
            </View>
          ))}
        </Card>
      )}

      {/* AI 建议 */}
      {report.aiSuggestions && (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>🤖 AI 建议</Text>
          <Text style={styles.suggestionText}>{report.aiSuggestions}</Text>
        </Card>
      )}

      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    padding: spacing.lg,
  },
  headerCard: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.ink,
  },
  date: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    marginBottom: spacing.md,
  },
  summary: {
    fontSize: fontSize.md,
    color: colors.ink,
    lineHeight: 22,
  },
  sectionCard: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statItem: {
    width: '50%',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  statNumber: {
    fontSize: fontSize.xxl,
    fontWeight: '700',
    color: colors.primary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  distributionLabel: {
    width: 60,
    fontSize: fontSize.sm,
    color: colors.ink,
  },
  distributionBar: {
    flex: 1,
    height: 16,
    backgroundColor: colors.sand,
    borderRadius: 8,
    marginHorizontal: spacing.sm,
    overflow: 'hidden',
  },
  distributionFill: {
    height: '100%',
    borderRadius: 8,
  },
  distributionCount: {
    width: 30,
    fontSize: fontSize.sm,
    color: colors.ink,
    textAlign: 'right',
  },
  channelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
  },
  channelName: {
    fontSize: fontSize.sm,
    color: colors.ink,
  },
  channelCount: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
  },
  leadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
  },
  leadName: {
    fontSize: fontSize.sm,
    color: colors.ink,
    fontWeight: '500',
  },
  leadPhone: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
  },
  suggestionText: {
    fontSize: fontSize.sm,
    color: colors.ink,
    lineHeight: 20,
  },
});
