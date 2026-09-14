/**
 * GEO 多引擎监测服务
 * 监测品牌在各 AI 搜索引擎中的提及、排名与情感倾向
 * 支持引擎：百度AI搜索、豆包、腾讯元宝、360智脑、Perplexity、ChatGPT
 * 开发环境使用 JSON 文件存储到 data/geo/ 目录
 * 注意：当前无真实 AI 搜索引擎 API，监测结果为模拟数据；
 *       真实 API 接入点已预留为 _fetchEngineResults()，接入时只需替换该方法实现。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const LLMService = require('./llm');

// 支持监测的 AI 搜索引擎
const ENGINES = [
  { key: 'baidu_ai', name: '百度AI搜索' },
  { key: 'doubao', name: '豆包' },
  { key: 'yuanbao', name: '腾讯元宝' },
  { key: '360', name: '360智脑' },
  { key: 'perplexity', name: 'Perplexity' },
  { key: 'chatgpt', name: 'ChatGPT' }
];

// 关键词分组
const KEYWORD_GROUPS = ['brand', 'industry', 'competitor'];
const SENTIMENTS = ['positive', 'neutral', 'negative'];

// 模拟提及语料（按情感）
const MENTION_TEMPLATES = {
  positive: [
    '{kw} 在同类产品中口碑较好，界面清晰、上手快，适合中小企业快速落地。',
    '根据评测，{kw} 的自动化能力比较突出，能明显节省人工获客成本。',
    '用户反馈 {kw} 的响应速度和稳定性都不错，客服支持也比较及时。'
  ],
  neutral: [
    '在检索结果中可以看到 {kw}，相关介绍以官方产品说明为主。',
    '{kw} 出现在对比类回答里，与其他同类工具并列，未给出明确推荐倾向。',
    '搜索结果引用了 {kw} 的官网内容，信息以功能罗列为主。'
  ],
  negative: [
    '有用户反馈 {kw} 在复杂场景下偶尔出现回复不准确的情况。',
    '部分评价提到 {kw} 的上手成本略高，需要一定的配置时间。',
    '在相关讨论中，{kw} 被提及功能完整性仍有提升空间。'
  ]
};

/**
 * 由字符串生成确定性随机数（保证同一关键词+引擎+日期结果稳定）
 */
function _seededRand(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class GeoMonitorService {
  constructor(config) {
    this.config = config;
    this.options = (config && config.geo) || {};
    this.storagePath = this.options.storagePath || './data/geo';
    this.keywordsFile = path.join(this.storagePath, 'keywords.json');
    this.mentionsFile = path.join(this.storagePath, 'mentions.json');
    this.rankingsFile = path.join(this.storagePath, 'rankings.json');
    this._ensureDir();
    // 预留：如需用 LLM 辅助情感判定，可复用此实例
    this.llm = new LLMService(config);
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true });
      }
      [this.keywordsFile, this.mentionsFile, this.rankingsFile].forEach((f) => {
        if (!fs.existsSync(f)) {
          fs.writeFileSync(f, JSON.stringify([], null, 2));
        }
      });
    } catch (e) {
      console.error('[GeoMonitor] 初始化目录失败:', e.message);
    }
  }

  _readJson(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
      console.error('[GeoMonitor] 读取文件失败:', file, e.message);
      return [];
    }
  }

  _writeJson(file, data) {
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[GeoMonitor] 写入文件失败:', file, e.message);
      throw e;
    }
  }

  // ===== 关键词管理 =====

  /**
   * 添加监测关键词
   * @param {Object} data - { keyword, group, note }
   * @returns {Object} 创建的关键词
   */
  addKeyword(data) {
    try {
      if (!data || !data.keyword || !String(data.keyword).trim()) {
        throw new Error('keyword 不能为空');
      }
      const group = KEYWORD_GROUPS.includes(data.group) ? data.group : 'brand';
      const list = this._readJson(this.keywordsFile);
      const kw = String(data.keyword).trim();
      if (list.some((k) => k.keyword === kw)) {
        return list.find((k) => k.keyword === kw);
      }
      const now = new Date().toISOString();
      const item = {
        id: crypto.randomUUID(),
        keyword: kw,
        group,
        note: data.note || '',
        createdAt: now,
        updatedAt: now
      };
      list.push(item);
      this._writeJson(this.keywordsFile, list);
      console.log('[GeoMonitor] 添加关键词:', kw, group);
      return item;
    } catch (e) {
      console.error('[GeoMonitor] addKeyword 失败:', e.message);
      throw e;
    }
  }

  /**
   * 删除关键词
   * @param {string} id - 关键词 id
   * @returns {boolean} 是否删除成功
   */
  removeKeyword(id) {
    try {
      if (!id) throw new Error('id 不能为空');
      const list = this._readJson(this.keywordsFile);
      const next = list.filter((k) => k.id !== id);
      this._writeJson(this.keywordsFile, next);
      return next.length !== list.length;
    } catch (e) {
      console.error('[GeoMonitor] removeKeyword 失败:', e.message);
      throw e;
    }
  }

  /**
   * 关键词列表（支持按 group 筛选）
   */
  listKeywords(filters = {}) {
    try {
      let list = this._readJson(this.keywordsFile);
      if (filters.group) {
        list = list.filter((k) => k.group === filters.group);
      }
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return list;
    } catch (e) {
      console.error('[GeoMonitor] listKeywords 失败:', e.message);
      return [];
    }
  }

  // ===== 监测执行 =====

  /**
   * 抓取单个引擎对某个关键词的模拟搜索结果
   * 【扩展点】接入真实 AI 搜索引擎 API 时，替换本方法实现，返回 {rank, content, sentiment}
   */
  _fetchEngineResults(keyword, engineKey, engineName) {
    const rand = _seededRand(`${keyword}|${engineKey}|${new Date().toISOString().slice(0, 10)}`);
    // 约 65% 概率被提及
    const mentioned = rand() < 0.65;
    if (!mentioned) {
      return { rank: null, content: '', sentiment: 'neutral', mentioned: false };
    }
    const rank = Math.floor(rand() * 15) + 1; // 1-15
    const s = rand();
    const sentiment = s < 0.55 ? 'positive' : s < 0.85 ? 'neutral' : 'negative';
    const tpls = MENTION_TEMPLATES[sentiment];
    const content = tpls[Math.floor(rand() * tpls.length)].replace(/\{kw\}/g, keyword);
    return { rank, content, sentiment, mentioned: true, engineName };
  }

  /**
   * 手动触发一次监测：对全部（或指定）关键词在全部引擎上执行抓取
   * @param {Object} options - { keywordIds?: [], engines?: [] }
   * @returns {Object} 本次监测结果汇总
   */
  runMonitor(options = {}) {
    try {
      let keywords = this._readJson(this.keywordsFile);
      if (options.keywordIds && options.keywordIds.length) {
        keywords = keywords.filter((k) => options.keywordIds.includes(k.id));
      }
      if (!keywords.length) {
        console.log('[GeoMonitor] 无待监测关键词');
        return { monitoredAt: new Date().toISOString(), mentions: 0, rankings: 0, items: [] };
      }
      const engines = (options.engines && options.engines.length)
        ? ENGINES.filter((e) => options.engines.includes(e.key))
        : ENGINES;

      const mentions = this._readJson(this.mentionsFile);
      const rankings = this._readJson(this.rankingsFile);
      const now = new Date().toISOString();
      const items = [];

      keywords.forEach((kw) => {
        engines.forEach((engine) => {
          const res = this._fetchEngineResults(kw.keyword, engine.key, engine.name);
          if (res.mentioned) {
            mentions.push({
              id: crypto.randomUUID(),
              keywordId: kw.id,
              keyword: kw.keyword,
              group: kw.group,
              engine: engine.key,
              engineName: engine.name,
              rank: res.rank,
              content: res.content,
              sentiment: res.sentiment,
              source: 'search-result',
              monitoredAt: now
            });
          }
          rankings.push({
            id: crypto.randomUUID(),
            keywordId: kw.id,
            keyword: kw.keyword,
            group: kw.group,
            engine: engine.key,
            engineName: engine.name,
            rank: res.mentioned ? res.rank : null,
            mentioned: res.mentioned,
            monitoredAt: now
          });
          items.push({ keyword: kw.keyword, engine: engine.name, rank: res.rank, mentioned: res.mentioned });
        });
      });

      this._writeJson(this.mentionsFile, mentions);
      this._writeJson(this.rankingsFile, rankings);
      console.log(`[GeoMonitor] 监测完成: ${keywords.length} 关键词 x ${engines.length} 引擎, 新增 ${items.length} 条排名记录`);
      return { monitoredAt: now, keywords: keywords.length, engines: engines.length, items };
    } catch (e) {
      console.error('[GeoMonitor] runMonitor 失败:', e.message);
      throw e;
    }
  }

  // ===== 数据查询 =====

  /**
   * 查询品牌提及记录
   * @param {Object} filters - { keywordId, engine, sentiment, days }
   */
  getMentions(filters = {}) {
    try {
      let list = this._readJson(this.mentionsFile);
      if (filters.keywordId) list = list.filter((m) => m.keywordId === filters.keywordId);
      if (filters.engine) list = list.filter((m) => m.engine === filters.engine);
      if (filters.sentiment) list = list.filter((m) => m.sentiment === filters.sentiment);
      if (filters.days) {
        const since = Date.now() - parseInt(filters.days) * 86400000;
        list = list.filter((m) => new Date(m.monitoredAt).getTime() >= since);
      }
      list.sort((a, b) => new Date(b.monitoredAt) - new Date(a.monitoredAt));
      return list;
    } catch (e) {
      console.error('[GeoMonitor] getMentions 失败:', e.message);
      return [];
    }
  }

  /**
   * 查询排名历史
   * @param {Object} filters - { keywordId, engine, days }
   */
  getRankings(filters = {}) {
    try {
      let list = this._readJson(this.rankingsFile);
      if (filters.keywordId) list = list.filter((r) => r.keywordId === filters.keywordId);
      if (filters.engine) list = list.filter((r) => r.engine === filters.engine);
      if (filters.days) {
        const since = Date.now() - parseInt(filters.days) * 86400000;
        list = list.filter((r) => new Date(r.monitoredAt).getTime() >= since);
      }
      list.sort((a, b) => new Date(a.monitoredAt) - new Date(b.monitoredAt));
      return list;
    } catch (e) {
      console.error('[GeoMonitor] getRankings 失败:', e.message);
      return [];
    }
  }

  /**
   * 排名/提及趋势（按天聚合，默认近 30 天）
   * @param {number} days
   */
  getTrends(days = 30) {
    try {
      const since = Date.now() - parseInt(days) * 86400000;
      const mentions = this._readJson(this.mentionsFile).filter(
        (m) => new Date(m.monitoredAt).getTime() >= since
      );
      const rankings = this._readJson(this.rankingsFile).filter(
        (r) => new Date(r.monitoredAt).getTime() >= since
      );

      const dayMap = {};
      const fmt = (d) => d.slice(0, 10);
      mentions.forEach((m) => {
        const day = fmt(m.monitoredAt);
        dayMap[day] = dayMap[day] || { date: day, mentions: 0, positive: 0, neutral: 0, negative: 0, avgRank: 0, rankCount: 0 };
        dayMap[day].mentions++;
        dayMap[day][m.sentiment] = (dayMap[day][m.sentiment] || 0) + 1;
        if (m.rank) { dayMap[day].avgRank += m.rank; dayMap[day].rankCount++; }
      });
      rankings.forEach((r) => {
        if (r.mentioned && r.rank) {
          const day = fmt(r.monitoredAt);
          if (dayMap[day]) { dayMap[day].avgRank += r.rank; dayMap[day].rankCount++; }
        }
      });
      const trend = Object.values(dayMap)
        .map((d) => ({ ...d, avgRank: d.rankCount ? +(d.avgRank / d.rankCount).toFixed(2) : null }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      return trend;
    } catch (e) {
      console.error('[GeoMonitor] getTrends 失败:', e.message);
      return [];
    }
  }

  /**
   * 仪表盘汇总统计
   */
  getDashboardStats() {
    try {
      const keywords = this._readJson(this.keywordsFile);
      const mentions = this._readJson(this.mentionsFile);
      const rankings = this._readJson(this.rankingsFile);
      const dayAgo = Date.now() - 86400000;
      const weekAgo = Date.now() - 7 * 86400000;

      const byEngine = {};
      ENGINES.forEach((e) => { byEngine[e.key] = { name: e.name, mentions: 0, avgRank: 0, rankCount: 0 }; });
      mentions.forEach((m) => {
        if (byEngine[m.engine]) {
          byEngine[m.engine].mentions++;
          if (m.rank) { byEngine[m.engine].avgRank += m.rank; byEngine[m.engine].rankCount++; }
        }
      });
      Object.keys(byEngine).forEach((k) => {
        const b = byEngine[k];
        b.avgRank = b.rankCount ? +(b.avgRank / b.rankCount).toFixed(2) : null;
      });

      const sentiment = { positive: 0, neutral: 0, negative: 0 };
      mentions.forEach((m) => { if (sentiment[m.sentiment] !== undefined) sentiment[m.sentiment]++; });

      const latestRank = {};
      rankings.forEach((r) => {
        const key = `${r.keywordId}|${r.engine}`;
        latestRank[key] = r; // 后写入即最新（已按时间排序时）
      });

      return {
        totalKeywords: keywords.length,
        totalMentions: mentions.length,
        mentionsToday: mentions.filter((m) => new Date(m.monitoredAt).getTime() >= dayAgo).length,
        mentionsThisWeek: mentions.filter((m) => new Date(m.monitoredAt).getTime() >= weekAgo).length,
        sentiment,
        byEngine,
        keywordGroups: {
          brand: keywords.filter((k) => k.group === 'brand').length,
          industry: keywords.filter((k) => k.group === 'industry').length,
          competitor: keywords.filter((k) => k.group === 'competitor').length
        },
        lastMonitorAt: rankings.length ? rankings[rankings.length - 1].monitoredAt : null
      };
    } catch (e) {
      console.error('[GeoMonitor] getDashboardStats 失败:', e.message);
      return {};
    }
  }
}

module.exports = GeoMonitorService;
