/**
 * 邮件详情页
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { Card, Loading, Button, Tag, Divider } from '../components';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { formatDate } from '../utils';
import { emailApi } from '../services/api';

export default function EmailDetailScreen({ route }) {
  const { id } = route.params;
  const [email, setEmail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingReply, setGeneratingReply] = useState(false);

  useEffect(() => {
    loadEmail();
  }, [id]);

  const loadEmail = async () => {
    try {
      const response = await emailApi.getEmail(id);
      setEmail(response.data);
    } catch (e) {
      console.error('加载邮件详情失败:', e);
    }
    setLoading(false);
  };

  const handleGenerateReply = async () => {
    setGeneratingReply(true);
    try {
      const response = await emailApi.generateReply(id);
      Alert.alert('智能回复已生成', response.data?.body?.substring(0, 200) + '...');
    } catch (e) {
      Alert.alert('生成失败', e.message || '生成回复失败');
    }
    setGeneratingReply(false);
  };

  const handleAutoReply = async () => {
    Alert.alert(
      '自动回复',
      '确定使用 AI 自动回复此邮件吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            try {
              await emailApi.autoReply(id);
              Alert.alert('成功', '自动回复已发送');
            } catch (e) {
              Alert.alert('失败', e.message || '发送失败');
            }
          },
        },
      ]
    );
  };

  if (loading || !email) {
    return <Loading text="加载邮件详情..." />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 邮件信息 */}
      <Card style={styles.infoCard}>
        <Text style={styles.subject}>{email.subject || '无主题'}</Text>
        <Divider />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>发件人</Text>
          <Text style={styles.infoValue}>{email.fromName || email.from}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>邮箱</Text>
          <Text style={styles.infoValue}>{email.from}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>时间</Text>
          <Text style={styles.infoValue}>
            {formatDate(email.receivedAt || email.date, 'YYYY-MM-DD HH:mm')}
          </Text>
        </View>
      </Card>

      {/* 询盘分析 */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>🤖 AI 询盘分析</Text>
        <View style={styles.analysisRow}>
          <Text style={styles.analysisLabel}>是否询盘</Text>
          <Tag
            text={email.isInquiry ? '是询盘' : '非询盘'}
            color={email.isInquiry ? colors.primary : colors.inkMuted}
          />
        </View>
        {email.isInquiry && (
          <>
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>询盘评分</Text>
              <Text style={styles.analysisValue}>{email.inquiryScore || 0}/100</Text>
            </View>
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>询盘类型</Text>
              <Text style={styles.analysisValue}>{email.inquiryType || '未知'}</Text>
            </View>
            <View style={styles.analysisRow}>
              <Text style={styles.analysisLabel}>已建线索</Text>
              <Tag
                text={email.leadCreated ? '已创建' : '未创建'}
                color={email.leadCreated ? colors.success : colors.warning}
              />
            </View>
          </>
        )}
      </Card>

      {/* 邮件正文 */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>邮件正文</Text>
        <Text style={styles.bodyText}>{email.body || '暂无正文内容'}</Text>
      </Card>

      {/* 操作按钮 */}
      <View style={styles.actions}>
        <Button
          title={generatingReply ? '生成中...' : '生成智能回复'}
          onPress={handleGenerateReply}
          disabled={generatingReply}
          loading={generatingReply}
          style={{ marginBottom: spacing.md }}
        />
        <Button
          title="自动回复"
          variant="secondary"
          onPress={handleAutoReply}
        />
      </View>

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
  infoCard: {
    marginBottom: spacing.md,
  },
  subject: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    width: 60,
  },
  infoValue: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.ink,
    textAlign: 'right',
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
  analysisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
  },
  analysisLabel: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
  },
  analysisValue: {
    fontSize: fontSize.sm,
    color: colors.ink,
    fontWeight: '600',
  },
  bodyText: {
    fontSize: fontSize.md,
    color: colors.ink,
    lineHeight: 24,
  },
  actions: {
    marginTop: spacing.lg,
  },
});
