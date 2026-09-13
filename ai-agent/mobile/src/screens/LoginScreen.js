/**
 * 登录页
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuthStore } from '../store';
import { Button } from '../components';
import { colors, spacing, fontSize, borderRadius } from '../theme';

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const login = useAuthStore((state) => state.login);

  const handleLogin = async () => {
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    setError('');

    const result = await login(username, password);
    setLoading(false);

    if (!result.success) {
      setError(result.error || '登录失败');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.logo}>WorkHogee</Text>
          <Text style={styles.tagline}>AI 获客伙计</Text>
          <Text style={styles.description}>让每一个中小企业都拥有专属的 AI 获客团队</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>用户名</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入用户名"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={[styles.label, { marginTop: spacing.lg }]}>密码</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入密码"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            title={loading ? '登录中...' : '登录'}
            onPress={handleLogin}
            disabled={loading}
            loading={loading}
            size="lg"
            style={{ marginTop: spacing.xl }}
          />

          <View style={styles.footer}>
            <Text style={styles.footerText}>还没有账号？</Text>
            <Text style={styles.footerLink}>联系管理员开通</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xl,
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.xxxl * 2,
    marginBottom: spacing.xxxl,
  },
  logo: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: fontSize.xl,
    color: colors.primary,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  description: {
    fontSize: fontSize.md,
    color: colors.inkMuted,
    marginTop: spacing.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.sand,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    fontSize: fontSize.md,
    color: colors.ink,
  },
  error: {
    color: colors.error,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  footerText: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
  },
  footerLink: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
});
