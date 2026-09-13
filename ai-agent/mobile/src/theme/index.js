/**
 * WorkHogee 移动端主题配置
 * 与官网品牌色保持一致
 */

export const colors = {
  // 品牌主色
  primary: '#ea580c',
  primaryDark: '#c2410c',
  primaryLight: '#fb923c',

  // 中性色
  ink: '#1c1917',
  inkLight: '#44403c',
  inkMuted: '#78716c',
  inkFaint: '#a8a29e',

  // 背景色
  paper: '#faf8f4',
  sand: '#f0e9db',
  white: '#ffffff',

  // 功能色
  success: '#16a34a',
  warning: '#d97706',
  error: '#dc2626',
  info: '#2563eb',

  // 意向等级
  intentionA: '#dc2626',
  intentionB: '#d97706',
  intentionC: '#6b7280',

  // 渐变
  gradient: {
    primary: ['#ea580c', '#f97316'],
    dark: ['#1c1917', '#44403c'],
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const fontSize = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  xxl: 20,
  xxxl: 24,
  xxxxl: 28,
  title: 32,
};

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
};

export const borderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 20,
  full: 9999,
};

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
};

export const layout = {
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  content: {
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadow.md,
  },
};

export default {
  colors,
  spacing,
  fontSize,
  fontWeight,
  borderRadius,
  shadow,
  layout,
};
