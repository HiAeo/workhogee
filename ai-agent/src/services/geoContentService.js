/**
 * GEO 内容生成服务
 * 基于 LLM 生成 AI 搜索友好的内容（遵循 E-E-A-T 原则、结构化数据、实体关联）
 * 支持内容类型：文章 article、问答 qa、产品描述 product、FAQ faq、品牌简介 brand
 * 开发环境使用 JSON 文件存储到 data/geo/contents.json
 * 说明：所有 AI 内容均通过 LLMService 生成，不直接调用外部 API
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const LLMService = require('./llm');

// 支持的内容类型
const CONTENT_TYPES = ['article', 'qa', 'product', 'faq', 'brand'];

// 各类型内容模板提示词（体现 E-E-A-T：经验/专业/权威/可信）
const CONTENT_TEMPLATES = {
  article: {
    name: '深度文章',
    guide: '围绕主题撰写一篇结构清晰的长文，包含：概述、分小节标题（H2/H3）、关键结论、实操建议、参考性总结；自然嵌入目标关键词与实体，段落口语化但专业。'
  },
  qa: {
    name: '问答(Q&A)',
    guide: '以问答对形式撰写，每个问题简短直接，答案为 2-4 句准确、可被 AI 引用的陈述句；问题贴近真实用户搜索意图。'
  },
  product: {
    name: '产品描述',
    guide: '撰写产品介绍，包含：一句话价值主张、核心功能要点（bullet）、适用人群、差异化优势、可信背书；避免夸张宣传。'
  },
  faq: {
    name: '常见问题 FAQ',
    guide: '围绕主题输出 5-8 组问答，覆盖用户最常问的问题；答案简洁、结论先行，便于 AI 搜索直接抽取。'
  },
  brand: {
    name: '品牌简介',
    guide: '撰写品牌官方简介，包含：品牌定位、成立背景（可虚构占位）、核心业务、服务对象、价值观；语气专业可信。'
  }
};

class GeoContentService {
  constructor(config) {
    this.config = config;
    this.options = (config && config.geo) || {};
    this.storagePath = this.options.storagePath || './data/geo';
    this.contentsFile = path.join(this.storagePath, 'contents.json');
    this._ensureDir();
    this.llm = new LLMService(config);
    // 可选：如存在 i18n 配置，可在此接入翻译能力（当前为可选集成，不强制依赖）
    this.businessInfo = (config && config.business) || {};
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true });
      }
      if (!fs.existsSync(this.contentsFile)) {
        fs.writeFileSync(this.contentsFile, JSON.stringify([], null, 2));
      }
    } catch (e) {
      console.error('[GeoContent] 初始化目录失败:', e.message);
    }
  }

  _readContents() {
    try {
      return JSON.parse(fs.readFileSync(this.contentsFile, 'utf-8'));
    } catch (e) {
      console.error('[GeoContent] 读取 contents 失败:', e.message);
      return [];
    }
  }

  _writeContents(list) {
    try {
      fs.writeFileSync(this.contentsFile, JSON.stringify(list, null, 2));
    } catch (e) {
      console.error('[GeoContent] 写入 contents 失败:', e.message);
      throw e;
    }
  }

  /**
   * 构建 GEO 内容生成系统提示词
   */
  _buildSystemPrompt(type, language) {
    const tpl = CONTENT_TEMPLATES[type] || CONTENT_TEMPLATES.article;
    const langHint = language && language !== 'zh'
      ? `使用语言代码 ${language} 进行写作。`
      : '使用简体中文写作。';
    return [
      '你是一名专业的 GEO（生成式引擎优化）内容专家，擅长撰写容易被 AI 搜索引擎引用与推荐的内容。',
      '创作原则（E-E-A-T）：体现经验(Experience)、专业(Expertise)、权威(Authoritativeness)、可信(Trustworthiness)。',
      '结构要求：使用清晰的标题层级；关键信息前置；使用列表/分点；自然融入实体名称，便于 AI 理解实体关联。',
      '要求：只输出正文内容本身，不要输出解释、不要使用 Markdown 代码块包裹；不要出现定价、价格、套餐金额等信息。',
      langHint,
      `本篇类型【${tpl.name}】：${tpl.guide}`
    ].join('\n');
  }

  /**
   * 生成单篇 GEO 友好内容
   * @param {Object} data - { type, topic, keywords?, language?, extra? }
   * @returns {Promise<Object>} 生成并存储的内容对象
   */
  async generateContent(data = {}) {
    try {
      if (!data.topic || !String(data.topic).trim()) {
        throw new Error('topic 不能为空');
      }
      const type = CONTENT_TYPES.includes(data.type) ? data.type : 'article';
      const topic = String(data.topic).trim();
      const keywords = Array.isArray(data.keywords) ? data.keywords.join('、') : (data.keywords || '');
      const language = data.language || 'zh';

      const systemPrompt = this._buildSystemPrompt(type, language);
      const userPrompt = [
        `主题：${topic}`,
        keywords ? `需自然融入的关键词/实体：${keywords}` : '',
        data.extra ? `补充要求：${data.extra}` : '',
        this.businessInfo.product ? `（参考背景）业务：${this.businessInfo.product}` : ''
      ].filter(Boolean).join('\n');

      const text = await this.llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], { temperature: 0.7 });

      const now = new Date().toISOString();
      const item = {
        id: crypto.randomUUID(),
        type,
        topic,
        keywords: keywords ? String(keywords).split(/[、,，]/).map((s) => s.trim()).filter(Boolean) : [],
        language,
        title: topic,
        content: (text || '').trim(),
        meta: { eeat: true, structured: true, generatedBy: 'llm' },
        createdAt: now,
        updatedAt: now
      };
      const list = this._readContents();
      list.push(item);
      this._writeContents(list);
      console.log('[GeoContent] 生成内容:', type, topic);
      return item;
    } catch (e) {
      console.error('[GeoContent] generateContent 失败:', e.message);
      throw e;
    }
  }

  /**
   * 批量生成内容
   * @param {Object} data - { type, topics: [], language?, keywords? }
   * @returns {Promise<Array>} 生成结果列表
   */
  async generateBatch(data = {}) {
    try {
      const topics = Array.isArray(data.topics) ? data.topics.filter((t) => t && String(t).trim()) : [];
      if (!topics.length) throw new Error('topics 不能为空');
      const results = [];
      for (let i = 0; i < topics.length; i++) {
        try {
          const item = await this.generateContent({
            type: data.type,
            topic: topics[i],
            keywords: data.keywords,
            language: data.language
          });
          results.push({ ok: true, item });
        } catch (err) {
          console.error('[GeoContent] 批量生成单篇失败:', topics[i], err.message);
          results.push({ ok: false, topic: topics[i], error: err.message });
        }
      }
      return results;
    } catch (e) {
      console.error('[GeoContent] generateBatch 失败:', e.message);
      throw e;
    }
  }

  /**
   * 对已有内容给出 GEO 优化建议
   * @param {Object} data - { content, type?, keywords? }
   * @returns {Promise<Object>} 建议 { suggestions, score }
   */
  async optimizeContent(data = {}) {
    try {
      if (!data.content || !String(data.content).trim()) {
        throw new Error('content 不能为空');
      }
      const type = CONTENT_TYPES.includes(data.type) ? data.type : 'article';
      const keywords = data.keywords || '';
      const messages = [
        {
          role: 'system',
          content: '你是 GEO 内容审核专家。请评估给定内容对 AI 搜索引擎的友好程度，输出 JSON：' +
            '{ "score": 0-100 的整数, "suggestions": ["建议1","建议2",...] }。' +
            '评估维度：结构清晰度、关键词/实体覆盖、E-E-A-T 信号、可被 AI 引用程度。只返回 JSON。'
        },
        {
          role: 'user',
          content: `类型：${type}\n关键词：${keywords}\n内容：\n${String(data.content).slice(0, 3000)}`
        }
      ];
      const result = await this.llm.chatJSON(messages, { temperature: 0.3 });
      return {
        score: typeof result.score === 'number' ? result.score : null,
        suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
        analyzedAt: new Date().toISOString()
      };
    } catch (e) {
      console.error('[GeoContent] optimizeContent 失败:', e.message);
      throw e;
    }
  }

  /**
   * 内容列表（支持 type / language 筛选与分页）
   */
  listContents(filters = {}) {
    try {
      let list = this._readContents();
      if (filters.type) list = list.filter((c) => c.type === filters.type);
      if (filters.language) list = list.filter((c) => c.language === filters.language);
      list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      const page = parseInt(filters.page) || 1;
      const pageSize = parseInt(filters.pageSize) || 20;
      const start = (page - 1) * pageSize;
      return {
        contents: list.slice(start, start + pageSize),
        total: list.length,
        page,
        pageSize
      };
    } catch (e) {
      console.error('[GeoContent] listContents 失败:', e.message);
      return { contents: [], total: 0, page: 1, pageSize: 20 };
    }
  }

  /**
   * 获取单篇内容
   */
  getContent(id) {
    try {
      if (!id) return null;
      return this._readContents().find((c) => c.id === id) || null;
    } catch (e) {
      console.error('[GeoContent] getContent 失败:', e.message);
      return null;
    }
  }

  /**
   * 删除内容
   */
  deleteContent(id) {
    try {
      if (!id) throw new Error('id 不能为空');
      const list = this._readContents();
      const next = list.filter((c) => c.id !== id);
      this._writeContents(next);
      return next.length !== list.length;
    } catch (e) {
      console.error('[GeoContent] deleteContent 失败:', e.message);
      throw e;
    }
  }

  /**
   * 返回内置内容模板说明
   */
  getContentTemplates() {
    return CONTENT_TEMPLATES;
  }
}

module.exports = GeoContentService;
