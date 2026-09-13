/**
 * 线索详情页
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLeadStore } from '../store';
import { Card, Tag, Button, Loading, Divider } from '../components';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { formatDate, formatRelativeTime, getIntentionColor, getIntentionText, getLeadStatusColor, getLeadStatusText } from '../utils';
import { leadApi } from '../services/api';

export default function LeadDetailScreen({ route, navigation }) {
  const { id } = route.params;
  const { currentLead, fetchLeadDetail, updateLeadStatus, clearCurrentLead } = useLeadStore();
  const [loading, setLoading] = useState(true);
  const [followUps, setFollowUps] = useState([]);

  useEffect(() => {
    loadData();
    return () => clearCurrentLead();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    await fetchLeadDetail(id);
    setLoading(false);
  };

  const handleStatusChange = (status) => {
    Alert.alert(
      '更新状态',
      `确定将线索状态更新为"${getLeadStatusText(status)}"吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            await updateLeadStatus(id, status);
          },
        },
      ]
    );
  };

  const handleCall = () => {
    if (currentLead?.phone) {
      Alert.alert('拨打电话', `即将拨打 ${currentLead.phone}`);
    }
  };

  const handleMessage = () => {
    if (currentLead?.phone) {
      Alert.alert('发送短信', `即将向 ${currentLead.phone} 发送短信`);
    }
  };

  const handleAddFollowUp = () => {
    Alert.alert('添加跟进记录', '功能开发中...');
  };

  if (loading || !currentLead) {
    return <Loading text="加载线索详情..." />;
  }

  const statusOptions = ['new', 'contacted', 'following', 'converted', 'lost'];

  return (
    <ScrollView style={styles.container}>
      {/* 客户基本信息 */}
      <Card style={styles.infoCard}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(currentLead.name || '?').substring(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.name}>{currentLead.name || '未知客户'}</Text>
            <View style={styles.tagsRow}>
              <Tag
                text={getIntentionText(currentLead.intentionLevel)}
                color={getIntentionColor(currentLead.intentionLevel)}
                size="xs"
              />
              <Tag
                text={getLeadStatusText(currentLead.status)}
                color={getLeadStatusColor(currentLead.status)}
                size="xs"
              />
            </View>
          </View>
        </View>

        <Divider />

        {/* 联系方式 */}
        <View style={styles.contactRow}>
          <Text style={styles.contactIcon}>📞</Text>
          <Text style={styles.contactText}>{currentLead.phone || '暂无电话'}</Text>
          {currentLead.phone && (
            <View style={styles.contactActions}>
              <TouchableOpacity onPress={handleCall} style={styles.actionBtn}>
                <Text style={styles.actionText}>拨打</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleMessage} style={styles.actionBtn}>
                <Text style={styles.actionText}>短信</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.contactRow}>
          <Text style={styles.contactIcon}>📧</Text>
          <Text style={styles.contactText}>{currentLead.email || '暂无邮箱'}</Text>
        </View>

        <View style={styles.contactRow}>
          <Text style={styles.contactIcon}>🏢</Text>
          <Text style={styles.contactText}>{currentLead.company || '暂无公司'}</Text>
        </View>

        <View style={styles.contactRow}>
          <Text style={styles.contactIcon}>📍</Text>
          <Text style={styles.contactText}>{currentLead.source || '未知来源'}</Text>
        </View>
      </Card>

      {/* 状态更新 */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>线索状态</Text>
        <View style={styles.statusGrid}>
          {statusOptions.map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.statusBtn,
                currentLead.status === status && {
                  backgroundColor: getLeadStatusColor(status),
                  borderColor: getLeadStatusColor(status),
                },
              ]}
              onPress={() => handleStatusChange(status)}
            >
              <Text
                style={[
                  styles.statusText,
                  currentLead.status === status && { color: colors.white },
                ]}
              >
                {getLeadStatusText(status)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* 需求信息 */}
      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>需求信息</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>意向等级</Text>
          <Text style={styles.infoValue}>{getIntentionText(currentLead.intentionLevel)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>预算</Text>
          <Text style={styles.infoValue}>{currentLead.budget || '未填写'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>需求描述</Text>
          <Text style={styles.infoValue}>{currentLead.needs || '未填写'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>创建时间</Text>
          <Text style={styles.infoValue}>{formatDate(currentLead.createdAt, 'YYYY-MM-DD HH:mm')}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>最后更新</Text>
          <Text style={styles.infoValue}>{formatRelativeTime(currentLead.updatedAt)}</Text>
        </View>
      </Card>

      {/* 跟进记录 */}
      <Card style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>跟进记录</Text>
          <TouchableOpacity onPress={handleAddFollowUp}>
            <Text style={styles.addText}>+ 添加</Text>
          </TouchableOpacity>
        </View>
        {followUps.length === 0 ? (
          <Text style={styles.emptyText}>暂无跟进记录</Text>
        ) : (
          followUps.map((item, index) => (
            <View key={index} style={styles.followUpItem}>
              <Text style={styles.followUpTime}>{formatRelativeTime(item.createdAt)}</Text>
              <Text style={styles.followUpContent}>{item.content}</Text>
            </View>
          ))
        )}
      </Card>

      {/* 备注 */}
      {currentLead.notes && (
        <Card style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>备注</Text>
          <Text style={styles.notesText}>{currentLead.notes}</Text>
        </Card>
      )}

      {/* 底部操作 */}
      <View style={styles.bottomActions}>
        <Button
          title="编辑线索"
          variant="secondary"
          style={{ flex: 1, marginRight: spacing.sm }}
          onPress={() => Alert.alert('编辑线索', '功能开发中...')}
        />
        <Button
          title="智能跟进"
          style={{ flex: 1, marginLeft: spacing.sm }}
          onPress={() => navigation.navigate('Chat', { leadId: id })}
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
  infoCard: {
    margin: spacing.lg,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.white,
  },
  headerInfo: {
    flex: 1,
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  tagsRow: {
    flexDirection: 'row',
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  contactIcon: {
    fontSize: 16,
    marginRight: spacing.md,
    width: 24,
  },
  contactText: {
    flex: 1,
    fontSize: fontSize.md,
    color: colors.ink,
  },
  contactActions: {
    flexDirection: 'row',
  },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary + '15',
    borderRadius: borderRadius.full,
    marginLeft: spacing.sm,
  },
  actionText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '600',
  },
  sectionCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.md,
  },
  addText: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statusBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.sand,
    backgroundColor: colors.white,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  statusText: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
  },
  infoLabel: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    width: 80,
  },
  infoValue: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.ink,
    textAlign: 'right',
  },
  followUpItem: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.sand,
  },
  followUpTime: {
    fontSize: fontSize.xs,
    color: colors.inkFaint,
    marginBottom: spacing.xs,
  },
  followUpContent: {
    fontSize: fontSize.sm,
    color: colors.ink,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.inkFaint,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  notesText: {
    fontSize: fontSize.sm,
    color: colors.ink,
    lineHeight: 20,
  },
  bottomActions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
});
