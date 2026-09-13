/**
 * 邮件接收服务
 * IMAP 邮件接收、新邮件轮询、AI 询盘识别、客户信息提取、自动创建线索
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class EmailReceiverService {
  constructor(emailConfigService, leadService, llmService, knowledgeBase, notificationService, config) {
    this.emailConfigService = emailConfigService;
    this.leadService = leadService;
    this.llmService = llmService;
    this.knowledgeBase = knowledgeBase;
    this.notificationService = notificationService;
    this.config = config;

    this.storagePath = path.join(__dirname, '../../data/email');
    this.emailsFile = path.join(this.storagePath, 'emails.json');
    this._ensureDir();

    this.isPolling = false;
    this.pollingTimer = null;
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  _readEmails() {
    try {
      if (fs.existsSync(this.emailsFile)) {
        return JSON.parse(fs.readFileSync(this.emailsFile, 'utf-8'));
      }
    } catch (e) {
      console.error('读取邮件数据失败:', e.message);
    }
    return { emails: [] };
  }

  _saveEmails(data) {
    fs.writeFileSync(this.emailsFile, JSON.stringify(data, null, 2));
  }

  /**
   * 接收新邮件（模拟 IMAP 拉取，实际使用时替换为真实 IMAP 连接）
   */
  async fetchNewEmails(accountId) {
    const account = this.emailConfigService.getAccountFull(accountId);
    if (!account) {
      throw new Error('邮箱账户不存在');
    }

    // 这里应该使用 imapflow 库连接 IMAP 服务器拉取新邮件
    // 为了演示，我们返回空数组，实际部署时替换为真实 IMAP 拉取逻辑
    const newEmails = await this._fetchFromIMAP(account);

    // 处理每封新邮件
    const results = [];
    for (const email of newEmails) {
      const result = await this._processEmail(email, account);
      results.push(result);
    }

    // 更新账户最后检查时间
    this.emailConfigService.updateStatus(accountId, 'active');

    return {
      fetched: newEmails.length,
      processed: results.filter(r => r.success).length,
      inquiries: results.filter(r => r.isInquiry).length,
      leadsCreated: results.filter(r => r.leadCreated).length,
      results
    };
  }

  /**
   * 从 IMAP 拉取新邮件（实际实现需要 imapflow 库）
   */
  async _fetchFromIMAP(account) {
    // 实际实现示例（需要安装 imapflow）：
    /*
    const { ImapFlow } = require('imapflow');
    const client = new ImapFlow({
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapSecure,
      auth: {
        user: account.username,
        pass: account.password
      }
    });

    await client.connect();
    const mailbox = await client.getMailboxLock('INBOX');
    const messages = [];

    for await (const msg of client.fetch('1:*', { envelope: true, bodyStructure: true, source: true })) {
      // 解析邮件内容
      messages.push({
        id: msg.uid,
        from: msg.envelope.from?.[0]?.address,
        fromName: msg.envelope.from?.[0]?.name,
        to: msg.envelope.to?.map(t => t.address),
        subject: msg.envelope.subject,
        date: msg.envelope.date,
        body: this._extractBody(msg)
      });
    }

    await client.logout();
    return messages;
    */

    // 演示版本：返回空数组
    return [];
  }

  /**
   * 处理单封邮件
   */
  async _processEmail(email, account) {
    const result = {
      id: crypto.randomUUID(),
      emailId: email.id,
      accountId: account.id,
      from: email.from,
      fromName: email.fromName,
      subject: email.subject,
      date: email.date,
      success: false,
      isInquiry: false,
      leadCreated: false,
      leadId: null,
      inquiryScore: 0,
      error: null
    };

    try {
      // 1. AI 识别是否为询盘邮件
      const inquiryResult = await this._identifyInquiry(email);
      result.isInquiry = inquiryResult.isInquiry;
      result.inquiryScore = inquiryResult.score;
      result.inquiryType = inquiryResult.type;

      // 2. 如果是询盘邮件，提取客户信息并创建线索
      if (result.isInquiry && account.autoCreateLead) {
        const leadResult = await this._createLeadFromEmail(email, account, inquiryResult);
        result.leadCreated = leadResult.success;
        result.leadId = leadResult.leadId;
      }

      // 3. 保存邮件记录
      this._saveEmailRecord(result, email);

      // 4. 发送通知
      if (result.isInquiry && this.notificationService) {
        this.notificationService._sendSystemNotification('email_inquiry', {
          title: '新询盘邮件',
          message: `来自 ${email.fromName || email.from} 的询盘邮件：${email.subject}`,
          emailId: result.id,
          priority: 'high'
        });
      }

      result.success = true;
    } catch (e) {
      result.error = e.message;
      console.error('处理邮件失败:', e.message);
    }

    return result;
  }

  /**
   * AI 识别询盘邮件
   */
  async _identifyInquiry(email) {
    const prompt = `请判断以下邮件是否为业务询盘邮件，并分析询盘类型。

【邮件信息】
发件人: ${email.fromName || ''} <${email.from || ''}>
主题: ${email.subject || ''}
正文: ${(email.body || '').substring(0, 2000)}

【判断标准】
询盘邮件特征：
1. 询问产品价格、规格、功能
2. 请求报价、样品、演示
3. 表达购买意向
4. 询问合作方式、代理政策
5. 咨询服务内容、交付周期

非询盘邮件：
1. 垃圾邮件、广告推广
2. 新闻订阅、通知
3. 个人问候、闲聊
4. 退订、投诉
5. 系统自动邮件

请返回JSON格式：
{
  "isInquiry": true/false,
  "score": 0-100的询盘可能性分数,
  "type": "产品咨询/价格询问/报价请求/合作意向/服务咨询/其他",
  "confidence": "high/medium/low",
  "reason": "简短判断理由"
}`;

    try {
      const response = await this.llmService.chat([
        { role: 'system', content: '你是专业的邮件分类专家，擅长识别业务询盘邮件。' },
        { role: 'user', content: prompt }
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          isInquiry: result.isInquiry === true,
          score: result.score || 0,
          type: result.type || '其他',
          confidence: result.confidence || 'medium',
          reason: result.reason || ''
        };
      }
    } catch (e) {
      console.error('询盘识别失败:', e.message);
    }

    // 降级方案：基于关键词匹配
    return this._keywordInquiryCheck(email);
  }

  /**
   * 基于关键词的询盘识别（降级方案）
   */
  _keywordInquiryCheck(email) {
    const inquiryKeywords = [
      '价格', '报价', '多少钱', '费用', '收费',
      '产品', '功能', '规格', '参数', '型号',
      '样品', '试用', '演示', '体验',
      '合作', '代理', '加盟', '分销',
      '服务', '方案', '定制', '开发',
      '购买', '采购', '下单', '订单',
      'price', 'quote', 'quotation', 'cost',
      'product', 'feature', 'spec', 'sample',
      'cooperate', 'partner', 'agency',
      'service', 'solution', 'custom',
      'buy', 'purchase', 'order'
    ];

    const text = (email.subject + ' ' + (email.body || '')).toLowerCase();
    let score = 0;
    const matchedKeywords = [];

    inquiryKeywords.forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) {
        score += 10;
        matchedKeywords.push(keyword);
      }
    });

    // 主题中包含关键词加分
    if (email.subject) {
      inquiryKeywords.forEach(keyword => {
        if (email.subject.toLowerCase().includes(keyword.toLowerCase())) {
          score += 5;
        }
      });
    }

    return {
      isInquiry: score >= 20,
      score: Math.min(score, 100),
      type: matchedKeywords.length > 0 ? '关键词匹配' : '其他',
      confidence: score >= 50 ? 'high' : score >= 20 ? 'medium' : 'low',
      reason: `匹配关键词: ${matchedKeywords.join(', ') || '无'}`
    };
  }

  /**
   * 从邮件中提取客户信息并创建线索
   */
  async _createLeadFromEmail(email, account, inquiryResult) {
    try {
      // 从邮件中提取客户信息
      const customerInfo = await this._extractCustomerInfo(email);

      // 创建线索
      const lead = this.leadService.create({
        name: customerInfo.name || email.fromName || '未知客户',
        phone: customerInfo.phone || '',
        email: email.from,
        company: customerInfo.company || '',
        source: '邮件询盘',
        sourceDetail: account.email,
        intentionLevel: this._scoreToIntentionLevel(inquiryResult.score),
        needs: inquiryResult.type,
        budget: customerInfo.budget || '',
        notes: `来自邮件询盘：${email.subject}\n询盘类型：${inquiryResult.type}\n询盘评分：${inquiryResult.score}/100`,
        tags: ['邮件询盘', inquiryResult.type],
        status: 'new'
      });

      return { success: true, leadId: lead.id };
    } catch (e) {
      console.error('创建线索失败:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * AI 提取客户信息
   */
  async _extractCustomerInfo(email) {
    const prompt = `请从以下邮件中提取客户信息。

【邮件信息】
发件人: ${email.fromName || ''} <${email.from || ''}>
主题: ${email.subject || ''}
正文: ${(email.body || '').substring(0, 2000)}

请提取以下信息（没有则留空）：
{
  "name": "客户姓名",
  "company": "公司名称",
  "phone": "联系电话",
  "position": "职位",
  "budget": "预算范围（如有提及）",
  "location": "地区",
  "industry": "行业"
}

只返回JSON。`;

    try {
      const response = await this.llmService.chat([
        { role: 'system', content: '你是信息提取专家，擅长从邮件中提取客户联系信息。' },
        { role: 'user', content: prompt }
      ]);

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('客户信息提取失败:', e.message);
    }

    return { name: '', company: '', phone: '', position: '', budget: '', location: '', industry: '' };
  }

  _scoreToIntentionLevel(score) {
    if (score >= 70) return 'A';
    if (score >= 40) return 'B';
    return 'C';
  }

  /**
   * 保存邮件记录
   */
  _saveEmailRecord(result, email) {
    const data = this._readEmails();
    data.emails.unshift({
      ...result,
      body: (email.body || '').substring(0, 5000),
      receivedAt: new Date().toISOString()
    });

    // 最多保留 1000 封邮件
    if (data.emails.length > 1000) {
      data.emails = data.emails.slice(0, 1000);
    }

    this._saveEmails(data);
  }

  /**
   * 获取邮件列表
   */
  listEmails(filters = {}) {
    const data = this._readEmails();
    let emails = data.emails;

    if (filters.accountId) {
      emails = emails.filter(e => e.accountId === filters.accountId);
    }
    if (filters.isInquiry !== undefined) {
      emails = emails.filter(e => e.isInquiry === filters.isInquiry);
    }
    if (filters.leadCreated !== undefined) {
      emails = emails.filter(e => e.leadCreated === filters.leadCreated);
    }

    // 分页
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 20;
    const start = (page - 1) * pageSize;
    const paginated = emails.slice(start, start + pageSize);

    return {
      emails: paginated,
      total: emails.length,
      page,
      pageSize
    };
  }

  /**
   * 获取邮件详情
   */
  getEmail(id) {
    const data = this._readEmails();
    return data.emails.find(e => e.id === id) || null;
  }

  /**
   * 手动触发邮件检查
   */
  async checkAllAccounts() {
    const accounts = this.emailConfigService.listAccounts();
    const activeAccounts = accounts.filter(a => a.status === 'active');

    const results = [];
    for (const account of activeAccounts) {
      try {
        const result = await this.fetchNewEmails(account.id);
        results.push({ accountId: account.id, email: account.email, ...result });
      } catch (e) {
        results.push({ accountId: account.id, email: account.email, error: e.message });
      }
    }

    return {
      checked: activeAccounts.length,
      totalFetched: results.reduce((sum, r) => sum + (r.fetched || 0), 0),
      totalInquiries: results.reduce((sum, r) => sum + (r.inquiries || 0), 0),
      totalLeads: results.reduce((sum, r) => sum + (r.leadsCreated || 0), 0),
      results
    };
  }

  /**
   * 启动自动轮询
   */
  startPolling(interval = 60000) {
    if (this.isPolling) {
      return { success: false, message: '轮询已在运行中' };
    }

    this.isPolling = true;
    this.pollingTimer = setInterval(async () => {
      try {
        await this.checkAllAccounts();
      } catch (e) {
        console.error('邮件轮询失败:', e.message);
      }
    }, interval);

    return { success: true, message: `邮件轮询已启动，间隔 ${interval / 1000} 秒` };
  }

  /**
   * 停止自动轮询
   */
  stopPolling() {
    if (!this.isPolling) {
      return { success: false, message: '轮询未在运行中' };
    }

    clearInterval(this.pollingTimer);
    this.isPolling = false;
    this.pollingTimer = null;

    return { success: true, message: '邮件轮询已停止' };
  }

  /**
   * 获取邮件统计
   */
  getStats() {
    const data = this._readEmails();
    const emails = data.emails;

    return {
      total: emails.length,
      inquiries: emails.filter(e => e.isInquiry).length,
      nonInquiries: emails.filter(e => !e.isInquiry).length,
      leadsCreated: emails.filter(e => e.leadCreated).length,
      todayCount: emails.filter(e => {
        const today = new Date().toISOString().split('T')[0];
        return e.receivedAt && e.receivedAt.startsWith(today);
      }).length,
      avgInquiryScore: emails.length > 0
        ? (emails.reduce((sum, e) => sum + (e.inquiryScore || 0), 0) / emails.length).toFixed(1)
        : 0
    };
  }
}

module.exports = EmailReceiverService;
