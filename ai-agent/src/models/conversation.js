/**
 * 对话记录数据模型
 * 用于存储和管理客户与 AI 的对话记录
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class Conversation {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.leadId = data.leadId || '';
    this.source = data.source || 'web'; // web, wechat, etc.
    this.messages = data.messages || [];
    this.intentionLevel = data.intentionLevel || 'C';
    this.qualification = data.qualification || {}; // budget, timeline, decisionMaker, etc.
    this.summary = data.summary || '';
    this.status = data.status || 'active'; // active, ended, converted
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.endedAt = data.endedAt || null;
  }

  addMessage(role, content, metadata = {}) {
    const message = {
      id: uuidv4(),
      role, // user, assistant, system
      content,
      metadata,
      timestamp: new Date().toISOString()
    };
    this.messages.push(message);
    this.updatedAt = new Date().toISOString();
    return message;
  }

  getRecentMessages(count = 20) {
    return this.messages.slice(-count);
  }

  toJSON() {
    return {
      id: this.id,
      leadId: this.leadId,
      source: this.source,
      messages: this.messages,
      intentionLevel: this.intentionLevel,
      qualification: this.qualification,
      summary: this.summary,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      endedAt: this.endedAt
    };
  }

  static fromJSON(json) {
    return new Conversation(json);
  }

  end() {
    this.status = 'ended';
    this.endedAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    return this;
  }
}

module.exports = Conversation;
