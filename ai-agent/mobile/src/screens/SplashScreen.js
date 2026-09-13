/**
 * 启动页
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, spacing, fontSize } from '../theme';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.logoContainer}>
        <Text style={styles.logoText}>WorkHogee</Text>
        <Text style={styles.subtitle}>AI 获客伙计</Text>
      </View>
      <ActivityIndicator size="large" color={colors.primary} style={styles.loading} />
      <Text style={styles.version}>v1.0.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  logoText: {
    fontSize: 42,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: fontSize.lg,
    color: colors.primary,
    marginTop: spacing.sm,
    fontWeight: '500',
  },
  loading: {
    marginTop: spacing.xxl,
  },
  version: {
    position: 'absolute',
    bottom: spacing.xxl,
    fontSize: fontSize.sm,
    color: colors.inkFaint,
  },
});
