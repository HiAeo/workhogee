/**
 * 对话存储服务
 * 基于文件系统的对话记录持久化存储
 */
const fs = require('fs');
const path = require('path');
const Conversation = require('../models/conversation');

class ConversationStorageService {
  constructor(config) {
    this.storagePath = config.conversation.storagePath;
    this.indexFile = path.join(this.storagePath, 'index.json');
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
    if (!fs.existsSync(this.indexFile)) {
      fs.writeFileSync(this.indexFile, JSON.stringify({ conversations: [] }, null, 2));
    }
  }

  _readIndex() {
    try {
      const data = fs.readFileSync(this.indexFile, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return { conversations: [] };
    }
  }

  _writeIndex(index) {
    fs.writeFileSync(this.indexFile, JSON.stringify(index, null, 2));
  }

  /**
   * 创建新对话
   */
  create(conversationData) {
    const conversation = new Conversation(conversationData);
    const filePath = path.join(this.storagePath, conversation.id + '.json');
    fs.writeFileSync(filePath, JSON.stringify(conversation.toJSON(), null, 2));

    const index = this._readIndex();
    index.conversations.push({
      id: conversation.id,
      leadId: conversation.leadId,
      source: conversation.source,
      intentionLevel: conversation.intentionLevel,
      status: conversation.status,
      messageCount: conversation.messages.length,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    });
    this._writeIndex(index);

    return conversation;
  }

  /**
   * 根据 ID 获取对话
   */
  getById(id) {
    const filePath = path.join(this.storagePath, id + '.json');
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Conversation.fromJSON(data);
  }

  /**
   * 保存对话（更新）
   */
  save(conversation) {
    const filePath = path.join(this.storagePath, conversation.id + '.json');
    fs.writeFileSync(filePath, JSON.stringify(conversation.toJSON(), null, 2));

    // 更新索引
    const index = this._readIndex();
    const idx = index.conversations.findIndex(c => c.id === conversation.id);
    if (idx !== -1) {
      index.conversations[idx] = {
        id: conversation.id,
        leadId: conversation.leadId,
        source: conversation.source,
        intentionLevel: conversation.intentionLevel,
        status: conversation.status,
        messageCount: conversation.messages.length,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
      };
      this._writeIndex(index);
    }

    return conversation;
  }

  /**
   * 获取所有对话列表
   */
  list(filters = {}) {
    const index = this._readIndex();
    let conversations = index.conversations;

    // 按状态筛选
    if (filters.status) {
      conversations = conversations.filter(c => c.status === filters.status);
    }

    // 按意向等级筛选
    if (filters.intentionLevel) {
      conversations = conversations.filter(c => c.intentionLevel === filters.intentionLevel);
    }

    // 按更新时间排序（最新在前）
    conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    return conversations;
  }

  /**
   * 根据线索 ID 获取对话
   */
  getByLeadId(leadId) {
    const index = this._readIndex();
    const convs = index.conversations.filter(c => c.leadId === leadId);
    return convs.map(c => this.getById(c.id)).filter(Boolean);
  }
}

module.exports = ConversationStorageService;
