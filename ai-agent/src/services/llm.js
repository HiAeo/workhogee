/**
 * LLM 服务
 * 封装大模型 API 调用，支持 DeepSeek 等多种模型
 */
const https = require('https');
const http = require('http');

class LLMService {
  constructor(config) {
    this.config = config;
    this.apiKey = config.llm.apiKey;
    this.baseUrl = config.llm.baseUrl;
    this.model = config.llm.model;
    this.maxTokens = config.llm.maxTokens;
    this.temperature = config.llm.temperature;
  }

  /**
   * 发送聊天请求
   * @param {Array} messages - 消息列表 [{role, content}]
   * @param {Object} options - 可选参数
   * @returns {Promise<string>} - 模型回复内容
   */
  async chat(messages, options = {}) {
    const body = JSON.stringify({
      model: options.model || this.model,
      messages: messages,
      max_tokens: options.maxTokens || this.maxTokens,
      temperature: options.temperature !== undefined ? options.temperature : this.temperature,
      stream: false
    });

    return new Promise((resolve, reject) => {
      const url = new URL(this.baseUrl + '/chat/completions');
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.apiKey
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (result.choices && result.choices[0] && result.choices[0].message) {
              resolve(result.choices[0].message.content);
            } else {
              reject(new Error('Invalid API response: ' + data));
            }
          } catch (e) {
            reject(new Error('Parse error: ' + e.message + ', data: ' + data));
          }
        });
      });

      req.on('error', (e) => {
        reject(new Error('Request error: ' + e.message));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * 结构化输出 - 要求模型返回 JSON
   * @param {Array} messages - 消息列表
   * @param {Object} options - 可选参数
   * @returns {Promise<Object>} - 解析后的 JSON 对象
   */
  async chatJSON(messages, options = {}) {
    const systemPrompt = {
      role: 'system',
      content: '你是一个专业的助手。请严格按照 JSON 格式回复，不要包含任何其他文字、解释或 Markdown 代码块标记。只返回纯 JSON 对象。'
    };

    const allMessages = [systemPrompt, ...messages];
    const content = await this.chat(allMessages, options);

    try {
      // 尝试提取 JSON（处理可能的前后空白或代码块）
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(json)?\s*/, '').replace(/\s*```$/, '');
      }
      return JSON.parse(jsonStr);
    } catch (e) {
      throw new Error('Failed to parse JSON from LLM response: ' + content.substring(0, 200));
    }
  }

  /**
   * 生成系统提示词
   * @param {Object} businessConfig - 业务配置
   * @returns {string} - 系统提示词
   */
  generateSystemPrompt(businessConfig) {
    return `你是 WorkHogee AI 获客伙计，一个专业的获客助手。

你的任务是：
1. 友好地接待每一位来访客户
2. 通过对话了解客户的需求、预算、决策周期
3. 判断客户的意向等级（A=高意向，B=中意向，C=低意向）
4. 引导客户留下联系方式（电话/微信/邮箱）
5. 对于高意向客户，引导预约到店或演示

业务信息：
- 行业：${businessConfig.industry || '通用'}
- 产品：${businessConfig.product || '请配置'}
- 目标客户：${businessConfig.targetCustomer || '请配置'}

沟通原则：
- 友好、专业、不卑不亢
- 不要过度推销，先了解需求
- 对于不确定的问题，诚实告知
- 始终以帮助客户解决问题为导向`;
  }
}

module.exports = LLMService;
