/**
 * 邮箱渠道页
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
import { Card, EmptyState, Loading, Button, Tag } from '../components';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { formatRelativeTime } from '../utils';
import { emailApi } from '../services/api';

export default function EmailScreen({ navigation }) {
  const [accounts, setAccounts] = useState([]);
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('inbox');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accountsRes, emailsRes] = await Promise.all([
        emailApi.listAccounts(),
        emailApi.listEmails({ page: 1, pageSize: 20 }),
      ]);
      setAccounts(accountsRes.data.accounts || []);
      setEmails(emailsRes.data.emails || []);
    } catch (e) {
      console.error('加载邮箱数据失败:', e);
    }
    setLoading(false);
  };

  const handleCheckEmail = async () => {
    try {
      await emailApi.checkAll();
      await loadData();
      Alert.alert('成功', '邮件检查完成');
    } catch (e) {
      Alert.alert('失败', e.message || '检查失败');
    }
  };

  const handleAddAccount = () => {
    Alert.alert('添加邮箱账户', '功能开发中...');
  };

  const filteredEmails = activeTab === 'inquiry'
    ? emails.filter((e) => e.isInquiry)
    : emails;

  const renderEmailItem = (email, index) => (
    <TouchableOpacity
      key={email.id || index}
      style={styles.emailItem}
      onPress={() => navigation.navigate('EmailDetail', { id: email.id })}
    >
      <View style={styles.emailHeader}>
        <Text style={styles.emailFrom} numberOfLines={1}>
          {email.fromName || email.from}
        </Text>
        <Text style={styles.emailTime}>{formatRelativeTime(email.receivedAt)}</Text>
      </View>
      <Text style={styles.emailSubject} numberOfLines={1}>{email.subject}</Text>
      <View style={styles.emailFooter}>
        {email.isInquiry && (
          <Tag text={`询盘 ${email.inquiryScore || 0}分`} color={colors.primary} size="xs" />
        )}
        {email.leadCreated && (
          <Tag text="已建线索" color={colors.success} size="xs" />
        )}
        {email.inquiryType && (
          <Text style={styles.emailType}>{email.inquiryType}</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* 邮箱账户状态 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsScroll}>
        <View style={styles.accountsContent}>
          {accounts.length === 0 ? (
            <TouchableOpacity style={styles.addAccountCard} onPress={handleAddAccount}>
              <Text style={styles.addAccountIcon}>➕</Text>
              <Text style={styles.addAccountText}>添加邮箱</Text>
            </TouchableOpacity>
          ) : (
            accounts.map((account) => (
              <View key={account.id} style={styles.accountCard}>
                <Text style={styles.accountEmail} numberOfLines={1}>{account.email}</Text>
                <View style={styles.accountStatus}>
                  <View style={[styles.statusDot, { backgroundColor: account.status === 'active' ? colors.success : colors.error }]} />
                  <Text style={styles.statusText}>
                    {account.status === 'active' ? '已连接' : '未连接'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* 操作栏 */}
      <View style={styles.actionBar}>
        <Button title="检查邮件" onPress={handleCheckEmail} size="sm" style={{ flex: 1, marginRight: spacing.sm }} />
        <Button title="添加账户" variant="secondary" onPress={handleAddAccount} size="sm" style={{ flex: 1, marginLeft: spacing.sm }} />
      </View>

      {/* 标签切换 */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'inbox' && styles.tabActive]}
          onPress={() => setActiveTab('inbox')}
        >
          <Text style={[styles.tabText, activeTab === 'inbox' && styles.tabTextActive]}>全部邮件</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'inquiry' && styles.tabActive]}
          onPress={() => setActiveTab('inquiry')}
        >
          <Text style={[styles.tabText, activeTab === 'inquiry' && styles.tabTextActive]}>询盘邮件</Text>
        </TouchableOpacity>
      </View>

      {/* 邮件列表 */}
      {loading ? (
        <Loading text="加载邮件..." />
      ) : filteredEmails.length === 0 ? (
        <EmptyState
          icon="📧"
          title="暂无邮件"
          description="点击上方按钮检查新邮件"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {filteredEmails.map(renderEmailItem)}
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
  accountsScroll: {
    maxHeight: 80,
  },
  accountsContent: {
    flexDirection: 'row',
    padding: spacing.lg,
    paddingVertical: spacing.md,
  },
  accountCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginRight: spacing.sm,
    minWidth: 150,
    ...colors.shadow?.sm,
  },
  accountEmail: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  accountStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  statusText: {
    fontSize: fontSize.xs,
    color: colors.inkMuted,
  },
  addAccountCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 120,
  },
  addAccountIcon: {
    fontSize: 20,
    marginBottom: spacing.xs,
  },
  addAccountText: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '500',
  },
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  tab: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
  },
  tabTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  emailItem: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...colors.shadow?.sm,
  },
  emailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  emailFrom: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.ink,
    marginRight: spacing.sm,
  },
  emailTime: {
    fontSize: fontSize.xs,
    color: colors.inkFaint,
  },
  emailSubject: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    marginBottom: spacing.sm,
  },
  emailFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emailType: {
    fontSize: fontSize.xs,
    color: colors.inkMuted,
    marginLeft: spacing.sm,
  },
});
