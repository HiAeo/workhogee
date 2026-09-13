/**
 * API 路由
 * 提供对话、线索、统计等 REST API
 */
const express = require('express');
const router = express.Router();

module.exports = function(services) {
  const { smartIntake, leadStorage, conversationStorage, contentCreator, leadNurture, exportService, authService, notificationService, analyticsService, abTestService, tenantService, logger, cache, profileService, knowledgeBase, reportService } = services;

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

  // ===== 数据导出 API =====

  /**
   * 导出线索数据为 CSV
   * GET /api/export/leads?intentionLevel=A&status=following
   */
  router.get('/export/leads', (req, res) => {
    try {
      const filters = {
        intentionLevel: req.query.intentionLevel,
        status: req.query.status,
        source: req.query.source
      };
      const result = exportService.exportLeadsToCSV(filters);

      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 导出统计数据为 CSV
   * GET /api/export/stats
   */
  router.get('/export/stats', (req, res) => {
    try {
      const result = exportService.exportStatsToCSV();
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== API Key 管理 =====

  /**
   * 获取所有 API Key 列表
   * GET /api/auth/keys
   */
  router.get('/auth/keys', (req, res) => {
    try {
      const keys = authService.listKeys();
      res.json({ success: true, data: { keys, total: keys.length } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 生成新的 API Key
   * POST /api/auth/keys
   */
  router.post('/auth/keys', (req, res) => {
    try {
      const { name, permissions } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: '请提供 API Key 名称' });
      }
      const apiKey = authService.generateKey(name, 'admin', permissions || {});
      res.json({ success: true, data: apiKey });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 撤销 API Key
   * DELETE /api/auth/keys/:id
   */
  router.delete('/auth/keys/:id', (req, res) => {
    try {
      const { id } = req.params;
      const success = authService.revokeKey(id);
      if (success) {
        res.json({ success: true, message: 'API Key 已撤销' });
      } else {
        res.status(404).json({ success: false, error: 'API Key 不存在' });
      }
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取 API 调用统计
   * GET /api/auth/stats
   */
  router.get('/auth/stats', (req, res) => {
    try {
      const stats = authService.getStats();
      res.json({ success: true, data: stats });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== 通知系统 API =====

  /**
   * 获取通知列表
   * GET /api/notifications?page=1&pageSize=20&unreadOnly=true
   */
  router.get('/notifications', (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 20;
      const unreadOnly = req.query.unreadOnly === 'true';
      const result = notificationService.getNotifications({ page, pageSize, unreadOnly });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 标记通知为已读
   * PUT /api/notifications/:id/read
   */
  router.put('/notifications/:id/read', (req, res) => {
    try {
      const { id } = req.params;
      const success = notificationService.markAsRead(id);
      if (success) {
        res.json({ success: true, message: '已标记为已读' });
      } else {
        res.status(404).json({ success: false, error: '通知不存在' });
      }
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 标记所有通知为已读
   * PUT /api/notifications/read-all
   */
  router.put('/notifications/read-all', (req, res) => {
    try {
      notificationService.markAllAsRead();
      res.json({ success: true, message: '所有通知已标记为已读' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取通知规则
   * GET /api/notifications/rules
   */
  router.get('/notifications/rules', (req, res) => {
    try {
      const rules = notificationService.getRules();
      res.json({ success: true, data: rules });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 更新通知规则
   * PUT /api/notifications/rules/:ruleName
   */
  router.put('/notifications/rules/:ruleName', (req, res) => {
    try {
      const { ruleName } = req.params;
      const updates = req.body;
      const rule = notificationService.updateRule(ruleName, updates);
      if (rule) {
        res.json({ success: true, data: rule });
      } else {
        res.status(404).json({ success: false, error: '规则不存在' });
      }
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== 数据分析 API =====

  /**
   * 获取综合分析报告
   * GET /api/analytics/report
   */
  router.get('/analytics/report', (req, res) => {
    try {
      const report = analyticsService.getReport();
      res.json({ success: true, data: report });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取转化漏斗数据
   * GET /api/analytics/funnel
   */
  router.get('/analytics/funnel', (req, res) => {
    try {
      const report = analyticsService.getReport();
      res.json({ success: true, data: report.conversion.funnel });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取趋势数据
   * GET /api/analytics/trends
   */
  router.get('/analytics/trends', (req, res) => {
    try {
      const report = analyticsService.getReport();
      res.json({ success: true, data: report.trends });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== A/B 测试 API =====

  /**
   * 获取 A/B 测试列表
   * GET /api/ab-tests
   */
  router.get('/ab-tests', (req, res) => {
    try {
      const tests = abTestService.listTests();
      res.json({ success: true, data: { tests, total: tests.length } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 创建 A/B 测试
   * POST /api/ab-tests
   */
  router.post('/ab-tests', (req, res) => {
    try {
      const test = abTestService.createTest(req.body);
      res.json({ success: true, data: test });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取 A/B 测试详情
   * GET /api/ab-tests/:id
   */
  router.get('/ab-tests/:id', (req, res) => {
    try {
      const test = abTestService.getTest(req.params.id);
      if (test) {
        res.json({ success: true, data: test });
      } else {
        res.status(404).json({ success: false, error: '测试不存在' });
      }
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 暂停 A/B 测试
   * PUT /api/ab-tests/:id/pause
   */
  router.put('/ab-tests/:id/pause', (req, res) => {
    try {
      const success = abTestService.pauseTest(req.params.id);
      res.json({ success, message: success ? '测试已暂停' : '操作失败' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 恢复 A/B 测试
   * PUT /api/ab-tests/:id/resume
   */
  router.put('/ab-tests/:id/resume', (req, res) => {
    try {
      const success = abTestService.resumeTest(req.params.id);
      res.json({ success, message: success ? '测试已恢复' : '操作失败' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 删除 A/B 测试
   * DELETE /api/ab-tests/:id
   */
  router.delete('/ab-tests/:id', (req, res) => {
    try {
      const success = abTestService.deleteTest(req.params.id);
      res.json({ success, message: success ? '测试已删除' : '操作失败' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== 多租户 API =====

  /**
   * 获取租户列表
   * GET /api/tenants
   */
  router.get('/tenants', (req, res) => {
    try {
      const tenants = tenantService.listTenants();
      res.json({ success: true, data: { tenants, total: tenants.length } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 创建租户
   * POST /api/tenants
   */
  router.post('/tenants', (req, res) => {
    try {
      const tenant = tenantService.createTenant(req.body);
      res.json({ success: true, data: tenant });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取租户详情
   * GET /api/tenants/:id
   */
  router.get('/tenants/:id', (req, res) => {
    try {
      const tenant = tenantService.getTenant(req.params.id);
      if (tenant) {
        res.json({ success: true, data: tenant });
      } else {
        res.status(404).json({ success: false, error: '租户不存在' });
      }
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 更新租户
   * PUT /api/tenants/:id
   */
  router.put('/tenants/:id', (req, res) => {
    try {
      const tenant = tenantService.updateTenant(req.params.id, req.body);
      if (tenant) {
        res.json({ success: true, data: tenant });
      } else {
        res.status(404).json({ success: false, error: '租户不存在' });
      }
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 暂停租户
   * PUT /api/tenants/:id/suspend
   */
  router.put('/tenants/:id/suspend', (req, res) => {
    try {
      const tenant = tenantService.suspendTenant(req.params.id);
      res.json({ success: !!tenant, message: tenant ? '租户已暂停' : '操作失败' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 恢复租户
   * PUT /api/tenants/:id/activate
   */
  router.put('/tenants/:id/activate', (req, res) => {
    try {
      const tenant = tenantService.activateTenant(req.params.id);
      res.json({ success: !!tenant, message: tenant ? '租户已恢复' : '操作失败' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取多租户统计
   * GET /api/tenants/stats/overview
   */
  router.get('/tenants/stats/overview', (req, res) => {
    try {
      const stats = tenantService.getStats();
      res.json({ success: true, data: stats });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== 日志系统 API =====

  /**
   * 查询日志
   * GET /api/logs?level=ERROR&limit=50&keyword=error
   */
  router.get('/logs', (req, res) => {
    try {
      const result = logger.queryLogs({
        level: req.query.level || 'all',
        limit: parseInt(req.query.limit) || 100,
        offset: parseInt(req.query.offset) || 0,
        keyword: req.query.keyword
      });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取日志统计
   * GET /api/logs/stats
   */
  router.get('/logs/stats', (req, res) => {
    try {
      const stats = logger.getStats();
      res.json({ success: true, data: stats });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 清空日志
   * DELETE /api/logs
   */
  router.delete('/logs', (req, res) => {
    try {
      const success = logger.clearLogs();
      res.json({ success, message: success ? '日志已清空' : '清空失败' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== 缓存系统 API =====

  /**
   * 获取缓存统计
   * GET /api/cache/stats
   */
  router.get('/cache/stats', (req, res) => {
    try {
      const stats = cache.getStats();
      res.json({ success: true, data: stats });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 清空缓存
   * DELETE /api/cache
   */
  router.delete('/cache', (req, res) => {
    try {
      cache.clear();
      res.json({ success: true, message: '缓存已清空' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 清理过期缓存
   * POST /api/cache/cleanup
   */
  router.post('/cache/cleanup', (req, res) => {
    try {
      const cleaned = cache.cleanup();
      res.json({ success: true, data: { cleaned } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== 客户画像 API =====

  /**
   * 生成客户画像
   * POST /api/profiles/:leadId/generate
   */
  router.post('/profiles/:leadId/generate', async (req, res) => {
    try {
      const profile = await profileService.generateProfile(req.params.leadId);
      res.json({ success: true, data: profile });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取客户画像
   * GET /api/profiles/:leadId
   */
  router.get('/profiles/:leadId', (req, res) => {
    try {
      const profile = profileService.getProfile(req.params.leadId);
      if (profile) {
        res.json({ success: true, data: profile });
      } else {
        res.status(404).json({ success: false, error: '客户画像不存在' });
      }
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 更新客户画像
   * PUT /api/profiles/:leadId
   */
  router.put('/profiles/:leadId', (req, res) => {
    try {
      const profile = profileService.updateProfile(req.params.leadId, req.body);
      if (profile) {
        res.json({ success: true, data: profile });
      } else {
        res.status(404).json({ success: false, error: '客户画像不存在' });
      }
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 添加标签
   * POST /api/profiles/:leadId/tags
   */
  router.post('/profiles/:leadId/tags', (req, res) => {
    try {
      const { tag } = req.body;
      if (!tag) {
        return res.status(400).json({ success: false, error: '请提供标签' });
      }
      const profile = profileService.addTag(req.params.leadId, tag);
      res.json({ success: true, data: profile });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 移除标签
   * DELETE /api/profiles/:leadId/tags/:tag
   */
  router.delete('/profiles/:leadId/tags/:tag', (req, res) => {
    try {
      const profile = profileService.removeTag(req.params.leadId, req.params.tag);
      res.json({ success: true, data: profile });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取所有标签统计
   * GET /api/profiles/tags/all
   */
  router.get('/profiles/tags/all', (req, res) => {
    try {
      const tags = profileService.getAllTags();
      res.json({ success: true, data: tags });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 按标签筛选线索
   * GET /api/profiles/tags/:tag/leads
   */
  router.get('/profiles/tags/:tag/leads', (req, res) => {
    try {
      const leads = profileService.findLeadsByTag(req.params.tag);
      res.json({ success: true, data: { leads, total: leads.length } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== 知识库 API =====

  // --- 产品资料 ---
  router.get('/knowledge/documents', (req, res) => {
    try {
      const docs = knowledgeBase.listDocuments(req.query.category, req.query.keyword);
      res.json({ success: true, data: { documents: docs, total: docs.length } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.post('/knowledge/documents', (req, res) => {
    try {
      const { title, content, category, tags } = req.body;
      if (!title || !content) {
        return res.status(400).json({ success: false, error: '标题和内容必填' });
      }
      const doc = knowledgeBase.addDocument(title, content, category || 'product', tags || []);
      res.json({ success: true, data: doc });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.get('/knowledge/documents/:id', (req, res) => {
    try {
      const doc = knowledgeBase.getDocument(req.params.id);
      if (doc) res.json({ success: true, data: doc });
      else res.status(404).json({ success: false, error: '文档不存在' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.put('/knowledge/documents/:id', (req, res) => {
    try {
      const doc = knowledgeBase.updateDocument(req.params.id, req.body);
      if (doc) res.json({ success: true, data: doc });
      else res.status(404).json({ success: false, error: '文档不存在' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.delete('/knowledge/documents/:id', (req, res) => {
    try {
      const success = knowledgeBase.deleteDocument(req.params.id);
      res.json({ success, message: success ? '已删除' : '删除失败' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- FAQ ---
  router.get('/knowledge/faqs', (req, res) => {
    try {
      const faqs = knowledgeBase.listFAQs(req.query.category, req.query.keyword);
      res.json({ success: true, data: { faqs, total: faqs.length } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.post('/knowledge/faqs', (req, res) => {
    try {
      const { question, answer, category, tags } = req.body;
      if (!question || !answer) {
        return res.status(400).json({ success: false, error: '问题和答案必填' });
      }
      const faq = knowledgeBase.addFAQ(question, answer, category || 'general', tags || []);
      res.json({ success: true, data: faq });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.put('/knowledge/faqs/:id', (req, res) => {
    try {
      const faq = knowledgeBase.updateFAQ(req.params.id, req.body);
      if (faq) res.json({ success: true, data: faq });
      else res.status(404).json({ success: false, error: 'FAQ不存在' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.delete('/knowledge/faqs/:id', (req, res) => {
    try {
      const success = knowledgeBase.deleteFAQ(req.params.id);
      res.json({ success, message: success ? '已删除' : '删除失败' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- 话术库 ---
  router.get('/knowledge/scripts', (req, res) => {
    try {
      const scripts = knowledgeBase.listScripts(req.query.scenario, req.query.keyword);
      res.json({ success: true, data: { scripts, total: scripts.length } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.post('/knowledge/scripts', (req, res) => {
    try {
      const { title, content, scenario, tags } = req.body;
      if (!title || !content) {
        return res.status(400).json({ success: false, error: '标题和内容必填' });
      }
      const script = knowledgeBase.addScript(title, content, scenario || 'general', tags || []);
      res.json({ success: true, data: script });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.put('/knowledge/scripts/:id', (req, res) => {
    try {
      const script = knowledgeBase.updateScript(req.params.id, req.body);
      if (script) res.json({ success: true, data: script });
      else res.status(404).json({ success: false, error: '话术不存在' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.delete('/knowledge/scripts/:id', (req, res) => {
    try {
      const success = knowledgeBase.deleteScript(req.params.id);
      res.json({ success, message: success ? '已删除' : '删除失败' });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // --- 智能回复 & 统计 ---
  router.post('/knowledge/reply', async (req, res) => {
    try {
      const { query, context } = req.body;
      if (!query) {
        return res.status(400).json({ success: false, error: '查询内容必填' });
      }
      const result = await knowledgeBase.generateKnowledgeReply(query, context || {});
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.get('/knowledge/stats', (req, res) => {
    try {
      const stats = knowledgeBase.getStats();
      res.json({ success: true, data: stats });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  router.post('/knowledge/import', (req, res) => {
    try {
      const { type, items } = req.body;
      if (!type || !items || !Array.isArray(items)) {
        return res.status(400).json({ success: false, error: '类型和数据列表必填' });
      }
      const result = knowledgeBase.importData(type, items);
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== 报告系统 API =====

  /**
   * 生成日报
   * POST /api/reports/daily/generate
   */
  router.post('/reports/daily/generate', async (req, res) => {
    try {
      const report = await reportService.generateDailyReport(req.body.date);
      await reportService.sendReportNotification(report);
      res.json({ success: true, data: report });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 生成周报
   * POST /api/reports/weekly/generate
   */
  router.post('/reports/weekly/generate', async (req, res) => {
    try {
      const report = await reportService.generateWeeklyReport(req.body.weekStart);
      await reportService.sendReportNotification(report);
      res.json({ success: true, data: report });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取报告列表
   * GET /api/reports?type=daily&limit=20
   */
  router.get('/reports', (req, res) => {
    try {
      const reports = reportService.listReports(req.query.type, parseInt(req.query.limit) || 20);
      res.json({ success: true, data: { reports, total: reports.length } });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  /**
   * 获取报告详情
   * GET /api/reports/:id
   */
  router.get('/reports/:id', (req, res) => {
    try {
      const report = reportService.getReport(req.params.id);
      if (report) {
        res.json({ success: true, data: report });
      } else {
        res.status(404).json({ success: false, error: '报告不存在' });
      }
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
        version: '0.4.0',
        capabilities: ['smart-intake', 'content-creator', 'lead-nurture'],
        timestamp: new Date().toISOString()
      }
    });
  });

  return router;
};
