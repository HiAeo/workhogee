/**
 * 智能对话页
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../theme';
import { conversationApi } from '../services/api';

export default function ChatScreen({ route, navigation }) {
  const { conversationId, leadId } = route.params || {};
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState(conversationId || null);
  const scrollViewRef = useRef(null);

  useEffect(() => {
    if (currentConversationId) {
      loadMessages();
    } else {
      // 新对话，显示欢迎消息
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: '你好！我是 WorkHogee AI 获客伙计 🤖\n\n我可以帮你：\n• 智能接待客户咨询\n• 自动筛选意向客户\n• 生成跟进话术\n• 分析客户需求\n\n有什么可以帮你的吗？',
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  }, [currentConversationId]);

  const loadMessages = async () => {
    try {
      const response = await conversationApi.getMessages(currentConversationId);
      setMessages(response.data.messages || []);
    } catch (e) {
      console.error('加载消息失败:', e);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || loading) return;

    const userMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: inputText.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      let convId = currentConversationId;

      // 如果没有对话ID，先创建对话
      if (!convId) {
        const createResponse = await conversationApi.create({
          leadId: leadId || null,
          source: 'mobile',
        });
        convId = createResponse.data.id;
        setCurrentConversationId(convId);
      }

      // 发送消息
      const response = await conversationApi.sendMessage(convId, userMessage.content);

      // 添加 AI 回复
      if (response.data?.message) {
        setMessages((prev) => [...prev, response.data.message]);
      } else if (response.data?.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString() + '_ai',
            role: 'assistant',
            content: response.data.reply,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (e) {
      console.error('发送消息失败:', e);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString() + '_error',
          role: 'assistant',
          content: '抱歉，发送失败，请稍后重试。',
          createdAt: new Date().toISOString(),
        },
      ]);
    }

    setLoading(false);
  };

  const quickReplies = [
    '帮我生成跟进话术',
    '分析这个客户的意向',
    '今天有哪些待跟进线索',
    '生成小红书文案',
  ];

  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    return (
      <View
        key={message.id || index}
        style={[styles.messageRow, isUser ? styles.userRow : styles.aiRow]}
      >
        {!isUser && (
          <View style={styles.aiAvatar}>
            <Text style={styles.avatarIcon}>🤖</Text>
          </View>
        )}
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.aiBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.aiText]}>
            {message.content}
          </Text>
        </View>
        {isUser && (
          <View style={styles.userAvatar}>
            <Text style={styles.avatarIcon}>👤</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* 消息列表 */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map(renderMessage)}

        {loading && (
          <View style={[styles.messageRow, styles.aiRow]}>
            <View style={styles.aiAvatar}>
              <Text style={styles.avatarIcon}>🤖</Text>
            </View>
            <View style={[styles.messageBubble, styles.aiBubble]}>
              <Text style={styles.typingText}>正在思考...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* 快捷回复 */}
      {messages.length <= 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRepliesContainer}
          contentContainerStyle={styles.quickRepliesContent}
        >
          {quickReplies.map((reply, index) => (
            <TouchableOpacity
              key={index}
              style={styles.quickReplyBtn}
              onPress={() => {
                setInputText(reply);
              }}
            >
              <Text style={styles.quickReplyText}>{reply}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* 输入框 */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="输入消息..."
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!inputText.trim() || loading) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim() || loading}
        >
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
    alignItems: 'flex-end',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  aiRow: {
    justifyContent: 'flex-start',
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.ink + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  avatarIcon: {
    fontSize: 16,
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: borderRadius.sm,
  },
  aiBubble: {
    backgroundColor: colors.white,
    borderBottomLeftRadius: borderRadius.sm,
    ...colors.shadow?.sm,
  },
  messageText: {
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  userText: {
    color: colors.white,
  },
  aiText: {
    color: colors.ink,
  },
  typingText: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    fontStyle: 'italic',
  },
  quickRepliesContainer: {
    maxHeight: 44,
    borderTopWidth: 1,
    borderTopColor: colors.sand,
    backgroundColor: colors.white,
  },
  quickRepliesContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  quickReplyBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary + '10',
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  quickReplyText: {
    fontSize: fontSize.sm,
    color: colors.primary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.sand,
  },
  input: {
    flex: 1,
    backgroundColor: colors.paper,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.md,
    color: colors.ink,
    maxHeight: 100,
    marginRight: spacing.sm,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.inkFaint,
  },
  sendIcon: {
    fontSize: 18,
    color: colors.white,
  },
});
