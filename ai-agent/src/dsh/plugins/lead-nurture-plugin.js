/**
 * WorkHogee DSH 插件 - 线索培育插件
 * 
 * 基于 DeepSeek Harness 插件规范封装
 * 提供跟进话术、培育内容、跟进计划、跟进提醒能力
 */

const LeadNurtureSkill = require('../../skills/lead-nurture');

module.exports = {
  name: 'workhogee-lead-nurture',
  version: '0.1.0',
  description: 'WorkHogee AI 获客伙计 - 线索培育插件',
  author: 'WorkHogee',
  license: 'MIT',

  async setup(ctx, config) {
    ctx.logger.info('[workhogee-lead-nurture] 插件初始化中...');

    const llmService = ctx.services.llm;
    const leadStorage = ctx.services.leadStorage;
    const businessConfig = ctx.config.business || {};

    if (!llmService || !leadStorage) {
      throw new Error('LLM 服务或线索存储服务未初始化');
    }

    const skill = new LeadNurtureSkill(llmService, leadStorage, businessConfig);
    ctx.skills = ctx.skills || {};
    ctx.skills.leadNurture = skill;

    // 注册工具
    ctx.tools = ctx.tools || {};

    ctx.tools.generateFollowUpScript = {
      name: 'generate_follow_up_script',
      description: '生成个性化跟进话术，支持首次跟进/二次跟进/逼单/唤醒等场景',
      parameters: {
        type: 'object',
        properties: {
          leadId: { type: 'string', description: '线索ID' },
          scene: { type: 'string', description: '场景（首次跟进/二次跟进/逼单/唤醒/节日问候）' }
        },
        required: ['leadId', 'scene']
      },
      execute: async (params) => {
        return await skill.generateFollowUpScript(params.leadId, params.scene);
      }
    };

    ctx.tools.generateNurtureContent = {
      name: 'generate_nurture_content',
      description: '生成培育内容，支持产品资料/案例/行业报告/优惠信息',
      parameters: {
        type: 'object',
        properties: {
          leadId: { type: 'string', description: '线索ID' },
          contentType: { type: 'string', description: '内容类型（产品资料/案例/行业报告/优惠信息）' }
        },
        required: ['leadId', 'contentType']
      },
      execute: async (params) => {
        return await skill.generateNurtureContent(params.leadId, params.contentType);
      }
    };

    ctx.tools.generateFollowUpPlan = {
      name: 'generate_follow_up_plan',
      description: '生成个性化跟进计划（SOP），根据意向等级制定跟进频率和触达节点',
      parameters: {
        type: 'object',
        properties: {
          leadId: { type: 'string', description: '线索ID' }
        },
        required: ['leadId']
      },
      execute: async (params) => {
        return await skill.generateFollowUpPlan(params.leadId);
      }
    };

    ctx.tools.getLeadsToFollowUp = {
      name: 'get_leads_to_follow_up',
      description: '获取需要跟进的线索列表（超过指定天数未跟进的线索）',
      parameters: {
        type: 'object',
        properties: {
          daysThreshold: { type: 'number', description: '超过多少天未跟进' },
          intentionLevel: { type: 'string', description: '意向等级筛选（A/B/C）' }
        }
      },
      execute: async (params) => {
        return skill.getLeadsToFollowUp(params);
      }
    };

    ctx.tools.recordFollowUpResult = {
      name: 'record_follow_up_result',
      description: '记录跟进结果，自动更新线索状态和意向等级',
      parameters: {
        type: 'object',
        properties: {
          leadId: { type: 'string', description: '线索ID' },
          outcome: { type: 'string', description: '结果（positive/neutral/negative）' },
          notes: { type: 'string', description: '跟进备注' }
        },
        required: ['leadId', 'outcome']
      },
      execute: async (params) => {
        return skill.recordFollowUpResult(params.leadId, params);
      }
    };

    ctx.logger.info('[workhogee-lead-nurture] 插件初始化完成');
  },

  async destroy(ctx) {
    ctx.logger.info('[workhogee-lead-nurture] 插件已卸载');
  }
};
