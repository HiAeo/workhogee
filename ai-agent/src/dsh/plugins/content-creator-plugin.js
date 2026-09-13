/**
 * WorkHogee DSH 插件 - 内容智造插件
 * 
 * 基于 DeepSeek Harness 插件规范封装
 * 提供小红书笔记、公众号文章、营销文案、内容日历生成能力
 */

const ContentCreatorSkill = require('../../skills/content-creator');

module.exports = {
  name: 'workhogee-content-creator',
  version: '0.1.0',
  description: 'WorkHogee AI 获客伙计 - 内容智造插件',
  author: 'WorkHogee',
  license: 'MIT',

  async setup(ctx, config) {
    ctx.logger.info('[workhogee-content-creator] 插件初始化中...');

    const llmService = ctx.services.llm;
    const businessConfig = ctx.config.business || {};

    if (!llmService) {
      throw new Error('LLM 服务未初始化');
    }

    const skill = new ContentCreatorSkill(llmService, businessConfig);
    ctx.skills = ctx.skills || {};
    ctx.skills.contentCreator = skill;

    // 注册工具
    ctx.tools = ctx.tools || {};

    ctx.tools.generateXiaohongshuNote = {
      name: 'generate_xiaohongshu_note',
      description: '生成小红书图文笔记，包含标题、正文、配图建议、标签',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: '笔记主题' },
          style: { type: 'string', description: '风格（种草/干货/测评/故事）' },
          imageCount: { type: 'number', description: '配图数量' }
        },
        required: ['topic']
      },
      execute: async (params) => {
        return await skill.generateXiaohongshuNote(params);
      }
    };

    ctx.tools.generateWechatArticle = {
      name: 'generate_wechat_article',
      description: '生成公众号文章，包含标题、摘要、正文、金句、互动话题',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: '文章主题' },
          angle: { type: 'string', description: '切入角度' },
          wordCount: { type: 'number', description: '目标字数' }
        },
        required: ['topic']
      },
      execute: async (params) => {
        return await skill.generateWechatArticle(params);
      }
    };

    ctx.tools.generateMarketingCopy = {
      name: 'generate_marketing_copy',
      description: '生成营销文案，支持朋友圈/广告/短信/邮件场景',
      parameters: {
        type: 'object',
        properties: {
          scene: { type: 'string', description: '场景（朋友圈/广告/短信/邮件）' },
          hook: { type: 'string', description: '核心卖点' },
          cta: { type: 'string', description: '行动号召' }
        },
        required: ['scene']
      },
      execute: async (params) => {
        return await skill.generateMarketingCopy(params);
      }
    };

    ctx.tools.generateContentCalendar = {
      name: 'generate_content_calendar',
      description: '生成一周内容日历，包含每天的主题、形式、平台、要点',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        return await skill.generateContentCalendar();
      }
    };

    ctx.logger.info('[workhogee-content-creator] 插件初始化完成');
  },

  async destroy(ctx) {
    ctx.logger.info('[workhogee-content-creator] 插件已卸载');
  }
};
