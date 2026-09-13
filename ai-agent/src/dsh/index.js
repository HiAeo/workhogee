/**
 * WorkHogee DSH 插件集合
 * 
 * 基于 DeepSeek Harness 理念的插件系统
 * 所有 AI 获客伙计能力均以插件形式提供
 */

const smartIntakePlugin = require('./plugins/smart-intake-plugin');
const contentCreatorPlugin = require('./plugins/content-creator-plugin');
const leadNurturePlugin = require('./plugins/lead-nurture-plugin');

/**
 * WorkHogee DSH 插件管理器
 * 负责插件的加载、初始化、销毁
 */
class WorkHogeePluginManager {
  constructor() {
    this.plugins = [
      smartIntakePlugin,
      contentCreatorPlugin,
      leadNurturePlugin
    ];
    this.ctx = {
      logger: console,
      config: {},
      services: {},
      skills: {},
      tools: {}
    };
    this.initialized = false;
  }

  /**
   * 初始化所有插件
   * @param {Object} config - 全局配置
   * @param {Object} services - 服务集合
   */
  async init(config, services) {
    this.ctx.config = config;
    this.ctx.services = services;

    for (const plugin of this.plugins) {
      try {
        await plugin.setup(this.ctx, config[plugin.name] || {});
        console.log(`[DSH] 插件加载成功: ${plugin.name} v${plugin.version}`);
      } catch (e) {
        console.error(`[DSH] 插件加载失败: ${plugin.name}`, e.message);
      }
    }

    this.initialized = true;
    console.log(`[DSH] 所有插件初始化完成，共 ${this.plugins.length} 个插件`);
    console.log(`[DSH] 已注册技能: ${Object.keys(this.ctx.skills).join(', ')}`);
    console.log(`[DSH] 已注册工具: ${Object.keys(this.ctx.tools).join(', ')}`);
  }

  /**
   * 获取技能
   */
  getSkill(name) {
    return this.ctx.skills[name];
  }

  /**
   * 获取工具
   */
  getTool(name) {
    return this.ctx.tools[name];
  }

  /**
   * 执行工具
   */
  async executeTool(name, params) {
    const tool = this.ctx.tools[name];
    if (!tool) {
      throw new Error(`工具不存在: ${name}`);
    }
    return await tool.execute(params);
  }

  /**
   * 获取所有可用工具列表（供 Agent 使用）
   */
  getToolsList() {
    return Object.values(this.ctx.tools).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }

  /**
   * 销毁所有插件
   */
  async destroy() {
    for (const plugin of this.plugins) {
      try {
        await plugin.destroy(this.ctx);
      } catch (e) {
        console.error(`[DSH] 插件卸载失败: ${plugin.name}`, e.message);
      }
    }
    this.initialized = false;
  }
}

module.exports = {
  WorkHogeePluginManager,
  plugins: {
    smartIntake: smartIntakePlugin,
    contentCreator: contentCreatorPlugin,
    leadNurture: leadNurturePlugin
  }
};
