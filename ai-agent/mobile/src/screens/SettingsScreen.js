/**
 * 设置页
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { Card, Divider } from '../components';
import { useAppStore } from '../store';
import { colors, spacing, fontSize, borderRadius } from '../theme';

export default function SettingsScreen() {
  const { isDarkMode, setDarkMode, apiBaseUrl, setApiBaseUrl } = useAppStore();

  const handleClearCache = () => {
    Alert.alert(
      '清除缓存',
      '确定要清除应用缓存吗？这不会删除你的数据。',
      [
        { text: '取消', style: 'cancel' },
        { text: '确定', onPress: () => Alert.alert('成功', '缓存已清除') },
      ]
    );
  };

  const handleAbout = () => {
    Alert.alert(
      '关于 WorkHogee',
      'WorkHogee AI 获客伙计 v1.0.0\n\n让每一个中小企业都拥有专属的 AI 获客团队\n\n© 2026 WorkHogee. All rights reserved.'
    );
  };

  const settingsGroups = [
    {
      title: '通用设置',
      items: [
        {
          icon: '🌙',
          label: '深色模式',
          type: 'switch',
          value: isDarkMode,
          onValueChange: setDarkMode,
        },
        {
          icon: '🔔',
          label: '消息通知',
          type: 'navigate',
          action: () => Alert.alert('通知设置', '功能开发中...'),
        },
        {
          icon: '🌐',
          label: '语言',
          type: 'navigate',
          action: () => Alert.alert('语言设置', '当前：简体中文'),
        },
      ],
    },
    {
      title: '账号与安全',
      items: [
        {
          icon: '👤',
          label: '账号信息',
          type: 'navigate',
          action: () => Alert.alert('账号信息', '功能开发中...'),
        },
        {
          icon: '🔐',
          label: '修改密码',
          type: 'navigate',
          action: () => Alert.alert('修改密码', '功能开发中...'),
        },
        {
          icon: '📱',
          label: '设备管理',
          type: 'navigate',
          action: () => Alert.alert('设备管理', '功能开发中...'),
        },
      ],
    },
    {
      title: 'API 配置',
      items: [
        {
          icon: '🔗',
          label: 'API 地址',
          type: 'text',
          value: apiBaseUrl,
          action: () => Alert.alert('API 地址', apiBaseUrl),
        },
        {
          icon: '🔑',
          label: 'API Key',
          type: 'navigate',
          action: () => Alert.alert('API Key', '功能开发中...'),
        },
      ],
    },
    {
      title: '其他',
      items: [
        {
          icon: '🗑️',
          label: '清除缓存',
          type: 'navigate',
          action: handleClearCache,
        },
        {
          icon: '❓',
          label: '帮助与反馈',
          type: 'navigate',
          action: () => Alert.alert('帮助与反馈', '功能开发中...'),
        },
        {
          icon: 'ℹ️',
          label: '关于我们',
          type: 'navigate',
          action: handleAbout,
        },
      ],
    },
  ];

  const renderItem = (item, index) => (
    <TouchableOpacity
      key={index}
      style={styles.settingItem}
      onPress={item.type === 'switch' ? null : item.action}
      disabled={item.type === 'switch'}
    >
      <View style={styles.itemLeft}>
        <Text style={styles.itemIcon}>{item.icon}</Text>
        <Text style={styles.itemLabel}>{item.label}</Text>
      </View>
      <View style={styles.itemRight}>
        {item.type === 'switch' && (
          <Switch
            value={item.value}
            onValueChange={item.onValueChange}
            trackColor={{ false: colors.sand, true: colors.primary }}
            thumbColor={colors.white}
          />
        )}
        {item.type === 'text' && (
          <Text style={styles.itemValue} numberOfLines={1}>{item.value}</Text>
        )}
        {item.type === 'navigate' && (
          <Text style={styles.itemArrow}>›</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      {settingsGroups.map((group, groupIndex) => (
        <View key={groupIndex} style={styles.group}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          <Card style={styles.groupCard}>
            {group.items.map((item, itemIndex) => (
              <View key={itemIndex}>
                {renderItem(item, itemIndex)}
                {itemIndex < group.items.length - 1 && <Divider style={{ marginVertical: 0 }} />}
              </View>
            ))}
          </Card>
        </View>
      ))}

      <Text style={styles.versionText}>WorkHogee v1.0.0</Text>
      <View style={{ height: spacing.xxxl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupTitle: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    marginLeft: spacing.lg,
    marginBottom: spacing.sm,
    fontWeight: '500',
  },
  groupCard: {
    marginHorizontal: spacing.lg,
    padding: 0,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemIcon: {
    fontSize: 18,
    marginRight: spacing.md,
    width: 24,
  },
  itemLabel: {
    fontSize: fontSize.md,
    color: colors.ink,
  },
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '50%',
  },
  itemValue: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
  },
  itemArrow: {
    fontSize: 20,
    color: colors.inkFaint,
  },
  versionText: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.inkFaint,
    marginTop: spacing.xl,
  },
});
