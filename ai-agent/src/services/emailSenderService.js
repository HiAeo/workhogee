/**
 * 邮件发送服务
 * 基于知识库的智能回复生成、SMTP邮件发送、回复模板、人工审核机制
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class EmailSenderService {
  constructor(emailConfigService, emailReceiverService, knowledgeBase, llmService, config) {
    this.emailConfigService = emailConfigService;
    this.emailReceiverService = emailReceiverService;
    this.knowledgeBase = knowledgeBase;
    this.llmService = llmService;
    this.config = config;

    this.storagePath = path.join(__dirname, '../../data/email');
    this.sentFile = path.join(this.storagePath, 'sent.json');
    this.templatesFile = path.join(this.storagePath, 'templates.json');
    this.draftsFile = path.join(this.storagePath, 'drafts.json');
    this._ensureDir();
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  _readJSON(file, defaultValue) {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
      }
    } catch (e) {
      console.error(`读取 ${file} 失败:`, e.message);
    }
    return defaultValue;
  }

  _saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  /**
   * 生成智能回复
   */
  async generateReply(emailId, options = {}) {
    const email = this.emailReceiverService.getEmail(emailId);
    if (!email) {
      throw new Error('邮件不存在');
    }

    const account = this.emailConfigService.getAccountFull(email.accountId);
    if (!account) {
      throw new Error('邮箱账户不存在');
    }

    // 1. 基于知识库生成回复
    const knowledgeReply = await this.knowledgeBase.generateKnowledgeReply(
      email.subject + '\n\n' + (email.body || ''),
      { email: true, from: email.from }
    );

    // 2. 用 LLM 优化为邮件格式
    const prompt = `请根据以下信息生成一封专业的商务回复邮件。

【原始邮件】
发件人: ${email.fromName || ''} <${email.from}>
主题: ${email.subject}
正文: ${(email.body || '').substring(0, 2000)}

【知识库参考回复】
${knowledgeReply.reply}

【发件人签名】
${account.signature || 'Best regards'}

要求：
1. 邮件格式专业，包含称呼、正文、结尾、签名
2. 正文简洁明了，不超过300字
3. 适当引导客户进一步沟通或留资
4. 语气友好专业
5. 如果是询盘邮件，主动提供产品信息或报价方案

请返回JSON格式：
{
  "subject": "回复邮件主题",
  "body": "邮件正文（HTML格式）",
  "summary": "回复内容摘要"
}`;

    try {
      const response = await this.llmService.chat([
        { role: 'system', content: '你是专业的商务邮件写作专家，擅长撰写简洁专业的回复邮件。' },
        { role: 'user', content: prompt }
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const reply = JSON.parse(jsonMatch[0]);
        return {
          ...reply,
          to: email.from,
          from: account.email,
          inReplyTo: email.subject,
          knowledgeUsed: knowledgeReply.knowledgeUsed,
          sources: knowledgeReply.sources
        };
      }
    } catch (e) {
      console.error('生成回复失败:', e.message);
    }

    // 降级方案：使用知识库回复
    return {
      subject: 'Re: ' + email.subject,
      body: `<p>您好，</p><p>${knowledgeReply.reply}</p><p>${account.signature || 'Best regards'}</p>`,
      summary: knowledgeReply.reply.substring(0, 100),
      to: email.from,
      from: account.email,
      inReplyTo: email.subject,
      knowledgeUsed: knowledgeReply.knowledgeUsed,
      sources: knowledgeReply.sources
    };
  }

  /**
   * 保存草稿（待人工审核）
   */
  saveDraft(emailId, reply) {
    const data = this._readJSON(this.draftsFile, { drafts: [] });
    const draft = {
      id: crypto.randomUUID(),
      emailId,
      to: reply.to,
      from: reply.from,
      subject: reply.subject,
      body: reply.body,
      summary: reply.summary,
      status: 'pending', // pending, approved, rejected, sent
      knowledgeUsed: reply.knowledgeUsed,
      sources: reply.sources,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    data.drafts.unshift(draft);
    this._saveJSON(this.draftsFile, data);
    return draft;
  }

  /**
   * 获取草稿列表
   */
  listDrafts(status = null) {
    const data = this._readJSON(this.draftsFile, { drafts: [] });
    let drafts = data.drafts;
    if (status) {
      drafts = drafts.filter(d => d.status === status);
    }
    return { drafts, total: drafts.length };
  }

  /**
   * 获取草稿详情
   */
  getDraft(id) {
    const data = this._readJSON(this.draftsFile, { drafts: [] });
    return data.drafts.find(d => d.id === id) || null;
  }

  /**
   * 更新草稿
   */
  updateDraft(id, updates) {
    const data = this._readJSON(this.draftsFile, { drafts: [] });
    const draft = data.drafts.find(d => d.id === id);
    if (!draft) return null;

    Object.assign(draft, updates, { updatedAt: new Date().toISOString() });
    this._saveJSON(this.draftsFile, data);
    return draft;
  }

  /**
   * 审核通过并发送
   */
  async approveAndSend(draftId) {
    const draft = this.getDraft(draftId);
    if (!draft) {
      throw new Error('草稿不存在');
    }

    // 更新状态为已审核
    this.updateDraft(draftId, { status: 'approved' });

    // 发送邮件
    const result = await this.sendEmail({
      accountId: draft.emailId ? this._getAccountIdByEmail(draft.from) : null,
      to: draft.to,
      subject: draft.subject,
      body: draft.body
    });

    if (result.success) {
      this.updateDraft(draftId, { status: 'sent', sentAt: new Date().toISOString() });
      this._recordSent(draft, result);
    }

    return result;
  }

  /**
   * 自动回复（无需人工审核，直接发送）
   */
  async autoReply(emailId) {
    const email = this.emailReceiverService.getEmail(emailId);
    if (!email) {
      throw new Error('邮件不存在');
    }

    const account = this.emailConfigService.getAccount(email.accountId);
    if (!account || !account.autoReply) {
      throw new Error('该账户未开启自动回复');
    }

    // 生成回复
    const reply = await this.generateReply(emailId);

    // 直接发送
    const result = await this.sendEmail({
      accountId: email.accountId,
      to: reply.to,
      subject: reply.subject,
      body: reply.body
    });

    if (result.success) {
      this._recordSent({ ...reply, id: emailId }, result);
    }

    return {
      success: result.success,
      reply,
      sendResult: result
    };
  }

  /**
   * 发送邮件（SMTP）
   */
  async sendEmail(options) {
    const { accountId, to, subject, body, cc = [], bcc = [] } = options;

    const account = this.emailConfigService.getAccountFull(accountId);
    if (!account) {
      return { success: false, error: '邮箱账户不存在' };
    }

    // 实际发送需要 nodemailer 库
    // 这里使用模拟发送，实际部署时替换为真实 SMTP 发送
    try {
      const result = await this._sendViaSMTP(account, { to, subject, body, cc, bcc });
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  /**
   * 通过 SMTP 发送邮件（实际实现需要 nodemailer）
   */
  async _sendViaSMTP(account, emailData) {
    // 实际实现示例（需要安装 nodemailer）：
    /*
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpSecure,
      auth: {
        user: account.username,
        pass: account.password
      }
    });

    const info = await transporter.sendMail({
      from: `"${account.name}" <${account.email}>`,
      to: emailData.to,
      cc: emailData.cc,
      bcc: emailData.bcc,
      subject: emailData.subject,
      html: emailData.body
    });

    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
    */

    // 演示版本：模拟发送成功
    return {
      success: true,
      messageId: crypto.randomUUID(),
      response: '250 OK (模拟发送)',
      simulated: true
    };
  }

  _getAccountIdByEmail(email) {
    const accounts = this.emailConfigService.listAccounts();
    const account = accounts.find(a => a.email === email);
    return account ? account.id : null;
  }

  _recordSent(draft, result) {
    const data = this._readJSON(this.sentFile, { sent: [] });
    const record = {
      id: crypto.randomUUID(),
      draftId: draft.id,
      to: draft.to,
      from: draft.from,
      subject: draft.subject,
      body: draft.body.substring(0, 2000),
      messageId: result.messageId,
      simulated: result.simulated || false,
      sentAt: new Date().toISOString()
    };
    data.sent.unshift(record);
    if (data.sent.length > 500) {
      data.sent = data.sent.slice(0, 500);
    }
    this._saveJSON(this.sentFile, data);
  }

  /**
   * 获取已发送邮件列表
   */
  listSent(page = 1, pageSize = 20) {
    const data = this._readJSON(this.sentFile, { sent: [] });
    const start = (page - 1) * pageSize;
    const paginated = data.sent.slice(start, start + pageSize);
    return { sent: paginated, total: data.sent.length, page, pageSize };
  }

  /**
   * 回复模板管理
   */
  listTemplates(category = null) {
    const data = this._readJSON(this.templatesFile, { templates: [] });
    let templates = data.templates;
    if (category) {
      templates = templates.filter(t => t.category === category);
    }
    return { templates, total: templates.length };
  }

  addTemplate(template) {
    const data = this._readJSON(this.templatesFile, { templates: [] });
    const newTemplate = {
      id: crypto.randomUUID(),
      name: template.name,
      category: template.category || 'general',
      subject: template.subject,
      body: template.body,
      variables: template.variables || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.templates.push(newTemplate);
    this._saveJSON(this.templatesFile, data);
    return newTemplate;
  }

  updateTemplate(id, updates) {
    const data = this._readJSON(this.templatesFile, { templates: [] });
    const template = data.templates.find(t => t.id === id);
    if (!template) return null;
    Object.assign(template, updates, { updatedAt: new Date().toISOString() });
    this._saveJSON(this.templatesFile, data);
    return template;
  }

  deleteTemplate(id) {
    const data = this._readJSON(this.templatesFile, { templates: [] });
    const index = data.templates.findIndex(t => t.id === id);
    if (index === -1) return false;
    data.templates.splice(index, 1);
    this._saveJSON(this.templatesFile, data);
    return true;
  }

  /**
   * 使用模板生成回复
   */
  applyTemplate(templateId, variables = {}) {
    const data = this._readJSON(this.templatesFile, { templates: [] });
    const template = data.templates.find(t => t.id === templateId);
    if (!template) return null;

    let subject = template.subject;
    let body = template.body;

    // 替换变量
    Object.keys(variables).forEach(key => {
      const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      subject = subject.replace(pattern, variables[key]);
      body = body.replace(pattern, variables[key]);
    });

    return { subject, body, templateId };
  }

  /**
   * 获取发送统计
   */
  getStats() {
    const sent = this._readJSON(this.sentFile, { sent: [] }).sent;
    const drafts = this._readJSON(this.draftsFile, { drafts: [] }).drafts;
    const templates = this._readJSON(this.templatesFile, { templates: [] }).templates;

    const today = new Date().toISOString().split('T')[0];

    return {
      totalSent: sent.length,
      todaySent: sent.filter(s => s.sentAt && s.sentAt.startsWith(today)).length,
      simulated: sent.filter(s => s.simulated).length,
      pendingDrafts: drafts.filter(d => d.status === 'pending').length,
      approvedDrafts: drafts.filter(d => d.status === 'approved').length,
      sentDrafts: drafts.filter(d => d.status === 'sent').length,
      totalTemplates: templates.length
    };
  }
}

module.exports = EmailSenderService;
