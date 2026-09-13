/**
 * WorkHogee DSH 插件 - 智能承接插件
 * 
 * 基于 DeepSeek Harness 插件规范封装
 * 提供智能对话承接、意向判定、资格筛选、线索记录能力
 */

const SmartIntakeSkill = require('../../skills/smart-intake');

module.exports = {
  name: 'workhogee-smart-intake',
  version: '0.1.0',
  description: 'WorkHogee AI 获客伙计 - 智能承接插件',
  author: 'WorkHogee',
  license: 'MIT',

  /**
   * 插件初始化
   * @param {Object} ctx - DSH 上下文
   * @param {Object} config - 插件配置
   */
  async setup(ctx, config) {
    ctx.logger.info('[workhogee-smart-intake] 插件初始化中...');

    // 从 DSH 上下文中获取服务
    const llmService = ctx.services.llm;
    const leadStorage = ctx.services.leadStorage;
    const conversationStorage = ctx.services.conversationStorage;
    const businessConfig = ctx.config.business || {};

    if (!llmService) {
      throw new Error('LLM 服务未初始化，请先配置 LLM 服务');
    }

    // 创建技能实例
    const skill = new SmartIntakeSkill(
      llmService,
      leadStorage,
      conversationStorage,
      businessConfig
    );

    // 注册到 DSH 上下文
    ctx.skills = ctx.skills || {};
    ctx.skills.smartIntake = skill;

    // 注册工具（供 Agent 调用）
    ctx.tools = ctx.tools || {};
    ctx.tools.startConversation = {
      name: 'start_conversation',
      description: '开始新的客户对话，返回对话ID和欢迎消息',
      parameters: {
        type: 'object',
        properties: {
          source: { type: 'string', description: '来源（web/wechat/etc）' }
        }
      },
      execute: async (params) => {
        const conversation = skill.startConversation(params.source || 'web');
        return {
          conversationId: conversation.id,
          welcomeMessage: conversation.messages.find(m => m.role === 'assistant')?.content
        };
      }
    };

    ctx.tools.processMessage = {
      name: 'process_message',
      description: '处理客户消息，返回AI回复、意向等级、是否创建线索',
      parameters: {
        type: 'object',
        properties: {
          conversationId: { type: 'string', description: '对话ID' },
          message: { type: 'string', description: '客户消息内容' }
        },
        required: ['conversationId', 'message']
      },
      execute: async (params) => {
        return await skill.processMessage(params.conversationId, params.message);
      }
    };

    ctx.logger.info('[workhogee-smart-intake] 插件初始化完成');
  },

  /**
   * 插件销毁
   */
  async destroy(ctx) {
    ctx.logger.info('[workhogee-smart-intake] 插件已卸载');
  }
};
