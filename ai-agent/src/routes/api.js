/**
 * API 路由
 * 提供对话、线索、统计等 REST API
 */
const express = require('express');
const router = express.Router();

module.exports = function(services) {
  const { smartIntake, leadStorage, conversationStorage, contentCreator, leadNurture } = services;

  // ===== 对话相关 API =====

  /**
   * 开始新对话
   * POST /api/conversations
   */
  router.post('/conversations', (req, res) => {
    try {
      const { source = 'web' } = req.body;
      const conversation = smartIntake.startConversation(source);

      // 返回对话信息和欢迎消息（不包含系统提示词）
      const welcomeMessage = conversation.messages.find(m => m.role === 'assistant');
      res.json({
        success: true,
        data: {
          conversationId: conversation.id,
          welcomeMessage: welcomeMessage ? welcomeMessage.content : '',
          createdAt: conversation.createdAt
        }
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 发送消息并获取回复
   * POST /api/conversations/:id/messages
   */
  router.post('/conversations/:id/messages', async (req, res) => {
    try {
      const { id } = req.params;
      const { message } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ success: false, error: 'Message is required' });
      }

      const result = await smartIntake.processMessage(id, message);
      res.json({
        success: true,
        data: result
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取对话历史
   * GET /api/conversations/:id
   */
  router.get('/conversations/:id', (req, res) => {
    try {
      const { id } = req.params;
      const conversation = conversationStorage.getById(id);

      if (!conversation) {
        return res.status(404).json({ success: false, error: 'Conversation not found' });
      }

      // 过滤掉系统消息，只返回用户和助手的消息
      const visibleMessages = conversation.messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp
        }));

      res.json({
        success: true,
        data: {
          id: conversation.id,
          leadId: conversation.leadId,
          intentionLevel: conversation.intentionLevel,
          qualification: conversation.qualification,
          summary: conversation.summary,
          status: conversation.status,
          messages: visibleMessages,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt
        }
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 结束对话
   * POST /api/conversations/:id/end
   */
  router.post('/conversations/:id/end', (req, res) => {
    try {
      const { id } = req.params;
      const conversation = smartIntake.endConversation(id);

      if (!conversation) {
        return res.status(404).json({ success: false, error: 'Conversation not found' });
      }

      res.json({ success: true, data: { id: conversation.id, status: conversation.status } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== 线索相关 API =====

  /**
   * 获取线索列表
   * GET /api/leads?page=1&pageSize=20&intentionLevel=A&status=new
   */
  router.get('/leads', (req, res) => {
    try {
      const filters = {
        page: parseInt(req.query.page) || 1,
        pageSize: parseInt(req.query.pageSize) || 20,
        intentionLevel: req.query.intentionLevel,
        status: req.query.status,
        source: req.query.source
      };
      const result = leadStorage.list(filters);
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取单个线索详情
   * GET /api/leads/:id
   */
  router.get('/leads/:id', (req, res) => {
    try {
      const { id } = req.params;
      const lead = leadStorage.getById(id);

      if (!lead) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }

      // 获取关联的对话
      const conversations = conversationStorage.getByLeadId(id);

      res.json({
        success: true,
        data: {
          ...lead.toJSON(),
          conversations: conversations.map(c => ({
            id: c.id,
            source: c.source,
            intentionLevel: c.intentionLevel,
            messageCount: c.messages.filter(m => m.role !== 'system').length,
            createdAt: c.createdAt
          }))
        }
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 更新线索
   * PUT /api/leads/:id
   */
  router.put('/leads/:id', (req, res) => {
    try {
      const { id } = req.params;
      const lead = leadStorage.update(id, req.body);

      if (!lead) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }

      res.json({ success: true, data: lead.toJSON() });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 标记线索为已转化
   * POST /api/leads/:id/convert
   */
  router.post('/leads/:id/convert', (req, res) => {
    try {
      const { id } = req.params;
      const lead = leadStorage.getById(id);

      if (!lead) {
        return res.status(404).json({ success: false, error: 'Lead not found' });
      }

      lead.markConverted();
      leadStorage.update(id, lead.toJSON());

      res.json({ success: true, data: lead.toJSON() });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== 统计 API =====

  /**
   * 获取统计数据
   * GET /api/stats
   */
  router.get('/stats', (req, res) => {
    try {
      const stats = leadStorage.getStats();
      res.json({ success: true, data: stats });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== 内容智造 API =====

  /**
   * 生成小红书笔记
   * POST /api/content/xiaohongshu
   */
  router.post('/content/xiaohongshu', async (req, res) => {
    try {
      const result = await contentCreator.generateXiaohongshuNote(req.body);
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 生成公众号文章
   * POST /api/content/wechat
   */
  router.post('/content/wechat', async (req, res) => {
    try {
      const result = await contentCreator.generateWechatArticle(req.body);
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 生成营销文案
   * POST /api/content/copy
   */
  router.post('/content/copy', async (req, res) => {
    try {
      const result = await contentCreator.generateMarketingCopy(req.body);
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 生成内容日历
   * POST /api/content/calendar
   */
  router.post('/content/calendar', async (req, res) => {
    try {
      const result = await contentCreator.generateContentCalendar(req.body);
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== 线索培育 API =====

  /**
   * 生成跟进话术
   * POST /api/nurture/followup-script
   */
  router.post('/nurture/followup-script', async (req, res) => {
    try {
      const { leadId, scene } = req.body;
      const result = await leadNurture.generateFollowUpScript(leadId, scene);
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 生成培育内容
   * POST /api/nurture/content
   */
  router.post('/nurture/content', async (req, res) => {
    try {
      const { leadId, contentType } = req.body;
      const result = await leadNurture.generateNurtureContent(leadId, contentType);
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 生成跟进计划
   * POST /api/nurture/plan
   */
  router.post('/nurture/plan', async (req, res) => {
    try {
      const { leadId } = req.body;
      const result = await leadNurture.generateFollowUpPlan(leadId);
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取需要跟进的线索
   * GET /api/nurture/to-followup
   */
  router.get('/nurture/to-followup', (req, res) => {
    try {
      const result = leadNurture.getLeadsToFollowUp(req.query);
      res.json({ success: true, data: { leads: result, count: result.length } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 记录跟进结果
   * POST /api/nurture/record
   */
  router.post('/nurture/record', (req, res) => {
    try {
      const { leadId, outcome, notes } = req.body;
      const result = leadNurture.recordFollowUpResult(leadId, { outcome, notes });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== 健康检查 =====

  /**
   * 健康检查
   * GET /api/health
   */
  router.get('/health', (req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        service: 'WorkHogee AI 获客伙计',
        version: '0.2.0',
        capabilities: ['smart-intake', 'content-creator', 'lead-nurture'],
        timestamp: new Date().toISOString()
      }
    });
  });

  return router;
};
