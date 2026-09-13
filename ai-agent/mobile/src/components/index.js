/**
 * WorkHogee 通用 UI 组件
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { colors, spacing, fontSize, borderRadius, shadow } from '../theme';

// ========== 按钮组件 ==========
export const Button = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  style = {},
  textStyle = {},
  icon = null,
}) => {
  const variants = {
    primary: {
      bg: colors.primary,
      text: colors.white,
      borderColor: colors.primary,
    },
    secondary: {
      bg: colors.white,
      text: colors.primary,
      borderColor: colors.primary,
    },
    outline: {
      bg: 'transparent',
      text: colors.ink,
      borderColor: colors.inkFaint,
    },
    danger: {
      bg: colors.error,
      text: colors.white,
      borderColor: colors.error,
    },
    ghost: {
      bg: 'transparent',
      text: colors.primary,
      borderColor: 'transparent',
    },
  };

  const sizes = {
    sm: { padding: spacing.sm, fontSize: fontSize.sm, borderRadius: borderRadius.md },
    md: { padding: spacing.md, fontSize: fontSize.md, borderRadius: borderRadius.lg },
    lg: { padding: spacing.lg, fontSize: fontSize.lg, borderRadius: borderRadius.xl },
  };

  const v = variants[variant];
  const s = sizes[size];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={[
        styles.button,
        {
          backgroundColor: disabled ? colors.inkFaint : v.bg,
          borderColor: v.borderColor,
          padding: s.padding,
          borderRadius: s.borderRadius,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} size="small" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          {icon && <View style={{ marginRight: spacing.sm }}>{icon}</View>}
          <Text style={{ color: v.text, fontSize: s.fontSize, fontWeight: '600' }}>
            {title}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ========== 卡片组件 ==========
export const Card = ({ children, style = {}, onPress = null }) => {
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.card, style]}
    >
      {children}
    </Container>
  );
};

// ========== 标签组件 ==========
export const Tag = ({ text, color = colors.primary, bgColor = null, size = 'sm' }) => {
  const sizes = {
    xs: { paddingHorizontal: spacing.xs, paddingVertical: 2, fontSize: fontSize.xs },
    sm: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontSize: fontSize.sm },
    md: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSize.md },
  };
  const s = sizes[size];

  return (
    <View
      style={{
        backgroundColor: bgColor || color + '15',
        paddingHorizontal: s.paddingHorizontal,
        paddingVertical: s.paddingVertical,
        borderRadius: borderRadius.full,
        alignSelf: 'flex-start',
      }}
    >
      <Text style={{ color, fontSize: s.fontSize, fontWeight: '500' }}>{text}</Text>
    </View>
  );
};

// ========== 空状态组件 ==========
export const EmptyState = ({ icon = '📭', title = '暂无数据', description = '', action = null }) => {
  return (
    <View style={styles.emptyState}>
      <Text style={{ fontSize: 48, marginBottom: spacing.lg }}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? <Text style={styles.emptyDesc}>{description}</Text> : null}
      {action}
    </View>
  );
};

// ========== 加载组件 ==========
export const Loading = ({ size = 'large', color = colors.primary, text = null }) => {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size={size} color={color} />
      {text && <Text style={styles.loadingText}>{text}</Text>}
    </View>
  );
};

// ========== 分割线组件 ==========
export const Divider = ({ style = {}, color = colors.sand }) => {
  return <View style={[{ height: 1, backgroundColor: color, marginVertical: spacing.md }, style]} />;
};

// ========== 头像组件 ==========
export const Avatar = ({ name = '', size = 40, color = colors.primary, uri = null }) => {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.white, fontSize: size * 0.35, fontWeight: '600' }}>
        {initials || '?'}
      </Text>
    </View>
  );
};

// ========== 统计卡片组件 ==========
export const StatCard = ({ label, value, icon = null, color = colors.primary, trend = null }) => {
  return (
    <Card style={{ flex: 1, marginHorizontal: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: fontSize.sm, color: colors.inkMuted }}>{label}</Text>
        {icon}
      </View>
      <Text style={{ fontSize: fontSize.xxxl, fontWeight: '700', color: colors.ink, marginTop: spacing.sm }}>
        {value}
      </Text>
      {trend && (
        <Text style={{ fontSize: fontSize.xs, color: trend > 0 ? colors.success : colors.error, marginTop: spacing.xs }}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </Text>
      )}
    </Card>
  );
};

// ========== 样式 ==========
const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadow.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  emptyDesc: {
    fontSize: fontSize.md,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.md,
    color: colors.inkMuted,
  },
});

export default {
  Button,
  Card,
  Tag,
  EmptyState,
  Loading,
  Divider,
  Avatar,
  StatCard,
};
