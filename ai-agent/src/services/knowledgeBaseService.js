/**
 * 知识库服务
 * 客户知识库构建：产品资料、FAQ、话术库、客户画像学习
 * 支持基于知识库的智能回复（RAG思路）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 简单的 TF-IDF 向量化器（用于语义检索，无需外部 API）
 */
class SimpleVectorizer {
  constructor() {
    this.vocabulary = new Map(); // 词 -> 索引
    this.idf = new Map(); // 词 -> IDF 值
    this.docCount = 0;
    this.docVectors = []; // 文档向量
  }

  /**
   * 分词（简单的中英文分词）
   */
  tokenize(text) {
    if (!text) return [];
    // 英文按空格和标点分词，中文按字符分词
    const tokens = [];
    const englishWords = text.toLowerCase().match(/[a-z0-9]+/g) || [];
    tokens.push(...englishWords);
    // 中文按 2-gram 分词
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || [];
    for (let i = 0; i < chineseChars.length - 1; i++) {
      tokens.push(chineseChars[i] + chineseChars[i + 1]);
    }
    return tokens.filter(t => t.length > 1);
  }

  /**
   * 计算词频（TF）
   */
  computeTF(tokens) {
    const tf = new Map();
    tokens.forEach(token => {
      tf.set(token, (tf.get(token) || 0) + 1);
    });
    return tf;
  }

  /**
   * 添加文档到语料库
   */
  addDocument(text) {
    const tokens = this.tokenize(text);
    const tf = this.computeTF(tokens);

    // 更新词汇表
    tf.forEach((count, token) => {
      if (!this.vocabulary.has(token)) {
        this.vocabulary.set(token, this.vocabulary.size);
      }
    });

    this.docCount++;
    this.docVectors.push({ text, tokens, tf });
    return this.docVectors.length - 1;
  }

  /**
   * 计算 IDF（逆文档频率）
   */
  computeIDF() {
    this.idf.clear();
    this.vocabulary.forEach((index, token) => {
      let docFreq = 0;
      this.docVectors.forEach(doc => {
        if (doc.tf.has(token)) docFreq++;
      });
      this.idf.set(token, Math.log((this.docCount + 1) / (docFreq + 1)) + 1);
    });
  }

  /**
   * 将文本转换为 TF-IDF 向量
   */
  vectorize(text) {
    const tokens = this.tokenize(text);
    const tf = this.computeTF(tokens);
    const vector = new Map();

    tf.forEach((count, token) => {
      if (this.vocabulary.has(token)) {
        const idf = this.idf.get(token) || 1;
        vector.set(this.vocabulary.get(token), count * idf);
      }
    });

    return vector;
  }

  /**
   * 计算余弦相似度
   */
  cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    vec1.forEach((value, index) => {
      norm1 += value * value;
      if (vec2.has(index)) {
        dotProduct += value * vec2.get(index);
      }
    });

    vec2.forEach(value => {
      norm2 += value * value;
    });

    if (norm1 === 0 || norm2 === 0) return 0;
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 搜索最相似的文档
   */
  search(query, topK = 5) {
    if (this.docVectors.length === 0) return [];

    // 确保 IDF 已计算
    if (this.idf.size === 0) {
      this.computeIDF();
    }

    const queryVector = this.vectorize(query);
    const scored = this.docVectors.map((doc, index) => {
      const docVector = this.vectorize(doc.text);
      const similarity = this.cosineSimilarity(queryVector, docVector);
      return { index, text: doc.text, similarity };
    });

    return scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .filter(s => s.similarity > 0.05); // 过滤低相似度结果
  }
}

class KnowledgeBaseService {
  constructor(llmService, config) {
    this.llmService = llmService;
    this.config = config;
    this.storagePath = path.join(__dirname, '../../data/knowledge');
    this._ensureDirs();

    // 内存缓存
    this.documents = [];
    this.faqs = [];
    this.scripts = [];
    this._loadAll();

    // RAG 向量化器
    this.vectorizer = new SimpleVectorizer();
    this._buildVectorIndex();
  }

  _ensureDirs() {
    const dirs = ['documents', 'faqs', 'scripts', 'profiles', 'embeddings'];
    dirs.forEach(dir => {
      const p = path.join(this.storagePath, dir);
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
    });
  }

  _loadAll() {
    this._loadDocuments();
    this._loadFAQs();
    this._loadScripts();
  }

  /**
   * 构建向量索引（RAG）
   */
  _buildVectorIndex() {
    this.vectorizer = new SimpleVectorizer();

    // 将所有文档、FAQ、话术添加到向量化器
    this.documents.forEach(doc => {
      this.vectorizer.addDocument(`${doc.title} ${doc.content}`);
    });

    this.faqs.forEach(faq => {
      this.vectorizer.addDocument(`${faq.question} ${faq.answer}`);
    });

    this.scripts.forEach(script => {
      this.vectorizer.addDocument(`${script.title} ${script.content}`);
    });

    // 计算 IDF
    this.vectorizer.computeIDF();

    console.log(`[KnowledgeBase] 向量索引构建完成，共 ${this.vectorizer.docCount} 个文档，${this.vectorizer.vocabulary.size} 个词汇`);
  }

  /**
   * 重新构建向量索引（在添加/删除文档后调用）
   */
  _rebuildVectorIndex() {
    this._buildVectorIndex();
  }

  /**
   * 语义搜索（RAG）
   * @param {string} query - 查询文本
   * @param {number} topK - 返回结果数量
   * @returns {Array} 搜索结果，包含类型、内容、相似度
   */
  semanticSearch(query, topK = 5) {
    if (!query || this.vectorizer.docCount === 0) return [];

    const results = this.vectorizer.search(query, topK * 2); // 多取一些，后面去重和分类

    // 将搜索结果映射回原始文档
    const enrichedResults = [];
    const allContent = [
      ...this.documents.map(d => ({ type: 'document', ...d })),
      ...this.faqs.map(f => ({ type: 'faq', ...f })),
      ...this.scripts.map(s => ({ type: 'script', ...s }))
    ];

    results.forEach(result => {
      // 找到匹配的原始文档
      const matched = allContent.find(item => {
        const itemText = `${item.title || item.question || ''} ${item.content || item.answer || ''}`;
        return itemText === result.text || itemText.includes(result.text.substring(0, 50));
      });

      if (matched) {
        enrichedResults.push({
          type: matched.type,
          id: matched.id,
          title: matched.title || matched.question,
          content: matched.content || matched.answer,
          similarity: result.similarity,
          category: matched.category,
          tags: matched.tags
        });
      }
    });

    return enrichedResults.slice(0, topK);
  }

  _loadDocuments() {
    try {
      const file = path.join(this.storagePath, 'documents', 'index.json');
      if (fs.existsSync(file)) {
        this.documents = JSON.parse(fs.readFileSync(file, 'utf-8'));
      }
    } catch (e) {
      this.documents = [];
    }
  }

  _saveDocuments() {
    const file = path.join(this.storagePath, 'documents', 'index.json');
    fs.writeFileSync(file, JSON.stringify(this.documents, null, 2));
  }

  _loadFAQs() {
    try {
      const file = path.join(this.storagePath, 'faqs', 'index.json');
      if (fs.existsSync(file)) {
        this.faqs = JSON.parse(fs.readFileSync(file, 'utf-8'));
      }
    } catch (e) {
      this.faqs = [];
    }
  }

  _saveFAQs() {
    const file = path.join(this.storagePath, 'faqs', 'index.json');
    fs.writeFileSync(file, JSON.stringify(this.faqs, null, 2));
  }

  _loadScripts() {
    try {
      const file = path.join(this.storagePath, 'scripts', 'index.json');
      if (fs.existsSync(file)) {
        this.scripts = JSON.parse(fs.readFileSync(file, 'utf-8'));
      }
    } catch (e) {
      this.scripts = [];
    }
  }

  _saveScripts() {
    const file = path.join(this.storagePath, 'scripts', 'index.json');
    fs.writeFileSync(file, JSON.stringify(this.scripts, null, 2));
  }

  // ===== 产品资料管理 =====

  /**
   * 添加产品资料文档
   */
  addDocument(title, content, category = 'product', tags = []) {
    const doc = {
      id: crypto.randomUUID(),
      title,
      content,
      category,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      views: 0,
      usefulCount: 0
    };
    this.documents.push(doc);
    this._saveDocuments();
    return doc;
  }

  /**
   * 更新产品资料
   */
  updateDocument(id, updates) {
    const doc = this.documents.find(d => d.id === id);
    if (!doc) return null;
    Object.assign(doc, updates, { updatedAt: new Date().toISOString() });
    this._saveDocuments();
    return doc;
  }

  /**
   * 删除产品资料
   */
  deleteDocument(id) {
    const index = this.documents.findIndex(d => d.id === id);
    if (index === -1) return false;
    this.documents.splice(index, 1);
    this._saveDocuments();
    return true;
  }

  /**
   * 获取文档列表
   */
  listDocuments(category = null, keyword = null) {
    let docs = [...this.documents];
    if (category) docs = docs.filter(d => d.category === category);
    if (keyword) {
      const kw = keyword.toLowerCase();
      docs = docs.filter(d =>
        d.title.toLowerCase().includes(kw) ||
        d.content.toLowerCase().includes(kw) ||
        d.tags.some(t => t.toLowerCase().includes(kw))
      );
    }
    return docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  /**
   * 获取文档详情
   */
  getDocument(id) {
    const doc = this.documents.find(d => d.id === id);
    if (doc) {
      doc.views++;
      this._saveDocuments();
    }
    return doc;
  }

  // ===== FAQ 管理 =====

  /**
   * 添加 FAQ
   */
  addFAQ(question, answer, category = 'general', tags = []) {
    const faq = {
      id: crypto.randomUUID(),
      question,
      answer,
      category,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hits: 0,
      helpful: 0,
      notHelpful: 0
    };
    this.faqs.push(faq);
    this._saveFAQs();
    return faq;
  }

  /**
   * 更新 FAQ
   */
  updateFAQ(id, updates) {
    const faq = this.faqs.find(f => f.id === id);
    if (!faq) return null;
    Object.assign(faq, updates, { updatedAt: new Date().toISOString() });
    this._saveFAQs();
    return faq;
  }

  /**
   * 删除 FAQ
   */
  deleteFAQ(id) {
    const index = this.faqs.findIndex(f => f.id === id);
    if (index === -1) return false;
    this.faqs.splice(index, 1);
    this._saveFAQs();
    return true;
  }

  /**
   * 获取 FAQ 列表
   */
  listFAQs(category = null, keyword = null) {
    let faqs = [...this.faqs];
    if (category) faqs = faqs.filter(f => f.category === category);
    if (keyword) {
      const kw = keyword.toLowerCase();
      faqs = faqs.filter(f =>
        f.question.toLowerCase().includes(kw) ||
        f.answer.toLowerCase().includes(kw)
      );
    }
    return faqs.sort((a, b) => b.hits - a.hits);
  }

  /**
   * 搜索匹配的 FAQ（用于智能回复）
   */
  searchFAQs(query, topK = 3) {
    if (!query || this.faqs.length === 0) return [];

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 1);

    const scored = this.faqs.map(faq => {
      let score = 0;
      const qLower = faq.question.toLowerCase();
      const aLower = faq.answer.toLowerCase();

      // 精确匹配加分
      if (qLower.includes(queryLower)) score += 10;
      if (aLower.includes(queryLower)) score += 5;

      // 关键词匹配
      queryWords.forEach(word => {
        if (qLower.includes(word)) score += 3;
        if (aLower.includes(word)) score += 1;
      });

      // 热门度加权
      score += faq.hits * 0.01;

      return { faq, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(s => {
        s.faq.hits++;
        return s.faq;
      });
  }

  // ===== 话术库管理 =====

  /**
   * 添加话术
   */
  addScript(title, content, scenario = 'general', tags = []) {
    const script = {
      id: crypto.randomUUID(),
      title,
      content,
      scenario,
      tags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      uses: 0,
      successRate: 0
    };
    this.scripts.push(script);
    this._saveScripts();
    return script;
  }

  /**
   * 更新话术
   */
  updateScript(id, updates) {
    const script = this.scripts.find(s => s.id === id);
    if (!script) return null;
    Object.assign(script, updates, { updatedAt: new Date().toISOString() });
    this._saveScripts();
    return script;
  }

  /**
   * 删除话术
   */
  deleteScript(id) {
    const index = this.scripts.findIndex(s => s.id === id);
    if (index === -1) return false;
    this.scripts.splice(index, 1);
    this._saveScripts();
    return true;
  }

  /**
   * 获取话术列表
   */
  listScripts(scenario = null, keyword = null) {
    let scripts = [...this.scripts];
    if (scenario) scripts = scripts.filter(s => s.scenario === scenario);
    if (keyword) {
      const kw = keyword.toLowerCase();
      scripts = scripts.filter(s =>
        s.title.toLowerCase().includes(kw) ||
        s.content.toLowerCase().includes(kw)
      );
    }
    return scripts.sort((a, b) => b.uses - a.uses);
  }

  /**
   * 根据场景推荐话术
   */
  recommendScript(scenario, customerIntent = null) {
    let candidates = this.scripts.filter(s => s.scenario === scenario);
    if (candidates.length === 0) candidates = this.scripts;

    // 按使用次数和成功率排序
    return candidates.sort((a, b) => {
      const scoreA = a.uses * 0.3 + a.successRate * 0.7;
      const scoreB = b.uses * 0.3 + b.successRate * 0.7;
      return scoreB - scoreA;
    })[0] || null;
  }

  // ===== 智能回复（基于知识库） =====

  /**
   * 基于知识库生成智能回复（RAG增强版）
   */
  async generateKnowledgeReply(query, context = {}) {
    // 1. 语义搜索（RAG）- 获取最相关的知识库内容
    const semanticResults = this.semanticSearch(query, 5);

    // 2. 按类型分类
    const matchedFAQs = semanticResults.filter(r => r.type === 'faq').slice(0, 3);
    const relatedDocs = semanticResults.filter(r => r.type === 'document').slice(0, 2);
    const recommendedScript = semanticResults.find(r => r.type === 'script') ||
      this.recommendScript('general', query);

    // 3. 如果语义搜索结果不足，回退到关键词搜索
    if (semanticResults.length === 0) {
      console.log('[KnowledgeBase] 语义搜索无结果，回退到关键词搜索');
      const keywordFAQs = this.searchFAQs(query, 3);
      const keywordDocs = this.listDocuments(null, query).slice(0, 2);
      matchedFAQs.push(...keywordFAQs.map(f => ({ type: 'faq', ...f, similarity: 0.5 })));
      relatedDocs.push(...keywordDocs.map(d => ({ type: 'document', ...d, similarity: 0.5 })));
    }

    // 4. 构建知识库上下文
    let knowledgeContext = '';

    if (matchedFAQs.length > 0) {
      knowledgeContext += '\n\n【常见问题参考】\n';
      matchedFAQs.forEach((faq, i) => {
        const sim = faq.similarity ? ` (相似度: ${(faq.similarity * 100).toFixed(1)}%)` : '';
        knowledgeContext += `${i + 1}. Q: ${faq.question || faq.title}\n   A: ${faq.answer || faq.content}${sim}\n`;
      });
    }

    if (relatedDocs.length > 0) {
      knowledgeContext += '\n\n【产品资料参考】\n';
      relatedDocs.forEach((doc, i) => {
        const sim = doc.similarity ? ` (相似度: ${(doc.similarity * 100).toFixed(1)}%)` : '';
        const content = (doc.content || '').substring(0, 300);
        knowledgeContext += `${i + 1}. ${doc.title}: ${content}${sim}\n`;
      });
    }

    if (recommendedScript) {
      knowledgeContext += `\n\n【推荐话术】\n${recommendedScript.content || recommendedScript.title}`;
    }

    // 5. 调用 LLM 生成回复
    const systemPrompt = `你是 WorkHogee AI 获客助手，基于客户知识库回答用户问题。

要求：
1. 优先使用知识库中的信息回答
2. 如果知识库没有相关信息，礼貌告知并建议联系人工
3. 回答简洁专业，不超过200字
4. 适当引导留资或预约
5. 不要编造知识库中没有的信息
6. 参考内容按相似度排序，优先使用高相似度内容

${knowledgeContext}`;

    try {
      const reply = await this.llmService.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ]);

      return {
        reply,
        sources: {
          faqs: matchedFAQs.map(f => ({ id: f.id, question: f.question || f.title, similarity: f.similarity })),
          documents: relatedDocs.map(d => ({ id: d.id, title: d.title, similarity: d.similarity })),
          script: recommendedScript ? { id: recommendedScript.id, title: recommendedScript.title } : null
        },
        knowledgeUsed: matchedFAQs.length > 0 || relatedDocs.length > 0,
        searchMethod: semanticResults.length > 0 ? 'semantic' : 'keyword'
      };
    } catch (e) {
      // LLM 失败时返回 FAQ 直接匹配
      if (matchedFAQs.length > 0) {
        return {
          reply: matchedFAQs[0].answer || matchedFAQs[0].content,
          sources: { faqs: [{ id: matchedFAQs[0].id, question: matchedFAQs[0].question || matchedFAQs[0].title }], documents: [], script: null },
          knowledgeUsed: true,
          searchMethod: 'fallback'
        };
      }
      return {
        reply: '感谢您的咨询，我正在学习更多关于我们产品的知识。您的问题已记录，我们的顾问会尽快与您联系。请问方便留下您的联系方式吗？',
        sources: { faqs: [], documents: [], script: null },
        knowledgeUsed: false,
        searchMethod: 'none'
      };
    }
  }

  // ===== 主动学习 =====

  /**
   * 从对话中学习（自动提取FAQ和话术）
   */
  async learnFromConversation(conversation) {
    if (!conversation || !conversation.messages) return { learned: 0 };

    // 提取用户问题和AI回复对
    const qaPairs = [];
    for (let i = 0; i < conversation.messages.length - 1; i++) {
      const msg = conversation.messages[i];
      const nextMsg = conversation.messages[i + 1];
      if (msg.role === 'user' && nextMsg.role === 'assistant' && msg.content.length > 5) {
        qaPairs.push({ question: msg.content, answer: nextMsg.content });
      }
    }

    if (qaPairs.length === 0) return { learned: 0 };

    // 用 LLM 判断哪些值得加入 FAQ
    let learned = 0;
    for (const pair of qaPairs) {
      try {
        const prompt = `判断以下问答是否值得加入FAQ知识库。

问题：${pair.question}
回答：${pair.answer}

判断标准：
1. 问题是否是客户常见问题（产品功能、价格、使用方法、售后等）
2. 回答是否准确完整
3. 是否与现有FAQ重复

只返回JSON：{"shouldAdd": true/false, "category": "product/price/usage/aftersales/other", "reason": "简短原因"}`;

        const result = await this.llmService.chat([
          { role: 'system', content: '你是知识库管理专家，负责判断问答是否值得加入FAQ。' },
          { role: 'user', content: prompt }
        ]);

        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const decision = JSON.parse(jsonMatch[0]);
          if (decision.shouldAdd) {
            // 检查是否重复
            const existing = this.searchFAQs(pair.question, 1);
            if (existing.length === 0 || existing[0].score < 5) {
              this.addFAQ(pair.question, pair.answer, decision.category || 'general');
              learned++;
            }
          }
        }
      } catch (e) {
        // 忽略单个学习失败
      }
    }

    return { learned, totalPairs: qaPairs.length };
  }

  /**
   * 获取知识库统计
   */
  getStats() {
    return {
      documents: {
        total: this.documents.length,
        categories: [...new Set(this.documents.map(d => d.category))],
        totalViews: this.documents.reduce((sum, d) => sum + d.views, 0)
      },
      faqs: {
        total: this.faqs.length,
        categories: [...new Set(this.faqs.map(f => f.category))],
        totalHits: this.faqs.reduce((sum, f) => sum + f.hits, 0)
      },
      scripts: {
        total: this.scripts.length,
        scenarios: [...new Set(this.scripts.map(s => s.scenario))],
        totalUses: this.scripts.reduce((sum, s) => sum + s.uses, 0)
      }
    };
  }

  /**
   * 导入批量数据
   */
  importData(type, items) {
    let imported = 0;
    if (type === 'faq') {
      items.forEach(item => {
        if (item.question && item.answer) {
          this.addFAQ(item.question, item.answer, item.category || 'general', item.tags || []);
          imported++;
        }
      });
    } else if (type === 'document') {
      items.forEach(item => {
        if (item.title && item.content) {
          this.addDocument(item.title, item.content, item.category || 'product', item.tags || []);
          imported++;
        }
      });
    } else if (type === 'script') {
      items.forEach(item => {
        if (item.title && item.content) {
          this.addScript(item.title, item.content, item.scenario || 'general', item.tags || []);
          imported++;
        }
      });
    }
    return { imported, total: items.length };
  }
}

module.exports = KnowledgeBaseService;
