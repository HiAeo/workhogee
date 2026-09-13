/**
 * 线索数据模型
 * 用于存储和管理获客线索
 */
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class Lead {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.name = data.name || '';
    this.phone = data.phone || '';
    this.wechat = data.wechat || '';
    this.email = data.email || '';
    this.source = data.source || 'web'; // web, ad, referral, etc.
    this.intentionLevel = data.intentionLevel || 'C'; // A, B, C
    this.status = data.status || 'new'; // new, following, interested, converted, lost
    this.budget = data.budget || '';
    this.decisionCycle = data.decisionCycle || '';
    this.needs = data.needs || '';
    this.painPoints = data.painPoints || '';
    this.conversationId = data.conversationId || '';
    this.assignedTo = data.assignedTo || '';
    this.tags = data.tags || [];
    this.notes = data.notes || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
    this.followUpAt = data.followUpAt || null;
    this.convertedAt = data.convertedAt || null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      phone: this.phone,
      wechat: this.wechat,
      email: this.email,
      source: this.source,
      intentionLevel: this.intentionLevel,
      status: this.status,
      budget: this.budget,
      decisionCycle: this.decisionCycle,
      needs: this.needs,
      painPoints: this.painPoints,
      conversationId: this.conversationId,
      assignedTo: this.assignedTo,
      tags: this.tags,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      followUpAt: this.followUpAt,
      convertedAt: this.convertedAt
    };
  }

  static fromJSON(json) {
    return new Lead(json);
  }

  update(data) {
    Object.assign(this, data);
    this.updatedAt = new Date().toISOString();
    return this;
  }

  markConverted() {
    this.status = 'converted';
    this.convertedAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
    return this;
  }
}

module.exports = Lead;
