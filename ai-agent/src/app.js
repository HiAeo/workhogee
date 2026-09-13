/**
 * WorkHogee AI 获客伙计 - 应用入口
 *
 * 基于 DeepSeek Harness 理念构建的智能获客 Agent
 * 已集成 DSH 插件系统，支持插件化扩展
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// 加载配置
const configPath = path.join(__dirname, '../config/default.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// 初始化核心服务
const LLMService = require('./services/llm');
const LeadStorageService = require('./services/leadService');
const ConversationStorageService = require('./services/conversationService');

const llmService = new LLMService(config);
const leadStorage = new LeadStorageService(config);
const conversationStorage = new ConversationStorageService(config);

// 初始化技能
const SmartIntakeSkill = require('./skills/smart-intake');
const ContentCreatorSkill = require('./skills/content-creator');
const LeadNurtureSkill = require('./skills/lead-nurture');
const ExportService = require('./services/exportService');
const AuthService = require('./services/authService');
const NotificationService = require('./services/notificationService');
const AnalyticsService = require('./services/analyticsService');
const ABTestService = require('./services/abTestService');
const TenantService = require('./services/tenantService');
const LoggerService = require('./services/loggerService');
const CacheService = require('./services/cacheService');
const ProfileService = require('./services/profileService');
const KnowledgeBaseService = require('./services/knowledgeBaseService');
const ReportService = require('./services/reportService');

const smartIntake = new SmartIntakeSkill(llmService, leadStorage, conversationStorage, config.business);
const contentCreator = new ContentCreatorSkill(llmService, config.business);
const leadNurture = new LeadNurtureSkill(llmService, leadStorage, config.business);
const exportService = new ExportService(leadStorage);
const authService = new AuthService(config);
const notificationService = new NotificationService(config);
const analyticsService = new AnalyticsService(leadStorage, conversationStorage);
const abTestService = new ABTestService(config);
const tenantService = new TenantService(config);
const logger = new LoggerService(config);
const cache = new CacheService(config.cache || {});
const profileService = new ProfileService(leadStorage, conversationStorage, llmService, config);
const knowledgeBase = new KnowledgeBaseService(llmService, config);
const reportService = new ReportService(leadStorage, conversationStorage, notificationService, llmService, config);

// 服务集合
const services = {
  llm: llmService,
  leadStorage,
  conversationStorage,
  smartIntake,
  contentCreator,
  leadNurture,
  exportService,
  authService,
  notificationService,
  analyticsService,
  abTestService,
  tenantService,
  logger,
  cache,
  profileService,
  knowledgeBase,
  reportService
};

// 初始化 DSH 插件系统
const { WorkHogeePluginManager } = require('./dsh');
const pluginManager = new WorkHogeePluginManager();

// 创建 Express 应用
const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件 - Web 管理后台
app.use(express.static(path.join(__dirname, '../web')));

// API 路由
const apiRouter = require('./routes/api')(services);
app.use('/api', apiRouter);

// DSH 插件 API
app.get('/api/dsh/plugins', (req, res) => {
  res.json({
    success: true,
    data: {
      plugins: pluginManager.plugins.map(p => ({
        name: p.name,
        version: p.version,
        description: p.description
      })),
      skills: Object.keys(pluginManager.ctx.skills),
      tools: pluginManager.getToolsList(),
      initialized: pluginManager.initialized
    }
  });
});

// 根路径重定向到管理后台
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/index.html'));
});

// 启动服务器
const PORT = config.server.port || 3000;
const HOST = config.server.host || 'localhost';

async function startServer() {
  // 初始化 DSH 插件
  try {
    await pluginManager.init(config, services);
  } catch (e) {
    console.error('[DSH] 插件系统初始化失败:', e.message);
  }

  app.listen(PORT, HOST, () => {
    console.log('');
    console.log('========================================');
    console.log('  WorkHogee AI 获客伙计 v0.2.0');
    console.log('========================================');
    console.log('');
    console.log('  管理后台: http://' + HOST + ':' + PORT);
    console.log('  API 文档: http://' + HOST + ':' + PORT + '/api/health');
    console.log('  插件状态: http://' + HOST + ':' + PORT + '/api/dsh/plugins');
    console.log('');
    console.log('  核心能力:');
    console.log('    ✓ 智能对话承接');
    console.log('    ✓ 意向等级判定 (A/B/C)');
    console.log('    ✓ 资格筛选 (预算/周期/决策人)');
    console.log('    ✓ 线索自动记录');
    console.log('    ✓ 预约引导');
    console.log('    ✓ 内容智造 (小红书/公众号/营销文案)');
    console.log('    ✓ 线索培育 (跟进SOP/培育内容)');
    console.log('');
    console.log('  DSH 插件系统:');
    console.log('    ✓ workhogee-smart-intake');
    console.log('    ✓ workhogee-content-creator');
    console.log('    ✓ workhogee-lead-nurture');
    console.log('');
    console.log('  基于 DeepSeek Harness 理念构建');
    console.log('  插件化架构，支持能力扩展');
    console.log('');
  });
}

startServer();

module.exports = app;
