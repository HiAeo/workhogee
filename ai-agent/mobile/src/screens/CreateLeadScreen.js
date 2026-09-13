/**
 * 新建线索页
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLeadStore } from '../store';
import { Button, Tag } from '../components';
import { colors, spacing, fontSize, borderRadius } from '../theme';

export default function CreateLeadScreen({ navigation }) {
  const { createLead } = useLeadStore();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    source: '手动录入',
    intentionLevel: 'B',
    budget: '',
    needs: '',
    notes: '',
  });

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.name && !form.phone) {
      Alert.alert('提示', '请至少填写客户姓名或电话');
      return;
    }

    setLoading(true);
    const result = await createLead(form);
    setLoading(false);

    if (result.success) {
      Alert.alert('成功', '线索创建成功', [
        { text: '查看详情', onPress: () => navigation.replace('LeadDetail', { id: result.lead.id }) },
        { text: '继续创建', onPress: () => setForm({ name: '', phone: '', email: '', company: '', source: '手动录入', intentionLevel: 'B', budget: '', needs: '', notes: '' }) },
      ]);
    } else {
      Alert.alert('失败', result.error || '创建失败，请重试');
    }
  };

  const intentionOptions = [
    { value: 'A', label: '高意向', color: '#dc2626' },
    { value: 'B', label: '中意向', color: '#d97706' },
    { value: 'C', label: '低意向', color: '#6b7280' },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 基本信息 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>基本信息</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>客户姓名 *</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入客户姓名"
            value={form.name}
            onChangeText={(v) => updateField('name', v)}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>联系电话</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入联系电话"
            value={form.phone}
            onChangeText={(v) => updateField('phone', v)}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>电子邮箱</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入电子邮箱"
            value={form.email}
            onChangeText={(v) => updateField('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>公司名称</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入公司名称"
            value={form.company}
            onChangeText={(v) => updateField('company', v)}
          />
        </View>
      </View>

      {/* 意向信息 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>意向信息</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>意向等级</Text>
          <View style={styles.optionRow}>
            {intentionOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.optionBtn,
                  form.intentionLevel === opt.value && {
                    backgroundColor: opt.color,
                    borderColor: opt.color,
                  },
                ]}
                onPress={() => updateField('intentionLevel', opt.value)}
              >
                <Text
                  style={[
                    styles.optionText,
                    form.intentionLevel === opt.value && { color: colors.white },
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>预算范围</Text>
          <TextInput
            style={styles.input}
            placeholder="例如：5000-10000元/月"
            value={form.budget}
            onChangeText={(v) => updateField('budget', v)}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>需求描述</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="请描述客户的具体需求..."
            value={form.needs}
            onChangeText={(v) => updateField('needs', v)}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>
      </View>

      {/* 来源信息 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>来源信息</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>线索来源</Text>
          <TextInput
            style={styles.input}
            placeholder="例如：广告投放、朋友推荐、官网咨询..."
            value={form.source}
            onChangeText={(v) => updateField('source', v)}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>备注</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="其他需要记录的信息..."
            value={form.notes}
            onChangeText={(v) => updateField('notes', v)}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>
      </View>

      {/* 提交按钮 */}
      <View style={styles.submitSection}>
        <Button
          title={loading ? '创建中...' : '创建线索'}
          onPress={handleSubmit}
          disabled={loading}
          loading={loading}
          size="lg"
        />
        <Button
          title="取消"
          variant="ghost"
          onPress={() => navigation.goBack()}
          style={{ marginTop: spacing.sm }}
        />
      </View>
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
    paddingBottom: spacing.xxxl * 2,
  },
  section: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...colors.shadow?.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.sand,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.md,
    color: colors.ink,
  },
  textArea: {
    height: 100,
  },
  optionRow: {
    flexDirection: 'row',
  },
  optionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.sand,
    backgroundColor: colors.paper,
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  optionText: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    fontWeight: '500',
  },
  submitSection: {
    marginTop: spacing.lg,
  },
});
