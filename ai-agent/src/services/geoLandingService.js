/**
 * GEO 归因落地页服务
 * 管理 GEO 流量专用高转化落地页模板、A/B 测试、流量来源识别与转化归因
 * 通过 URL 参数（utm_source、geo_engine、geo_keyword）识别 GEO 流量来源，
 * 并在流量进入后生成"伙计承接"所需的线索来源信息（_buildLeadPayload）。
 * 开发环境使用 JSON 文件存储到 data/geo/ 目录
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// GEO 落地页默认结构：首屏价值主张、社会证明、CTA、FAQ
const DEFAULT_SECTIONS = {
  hero: { headline: 'AI 搜索来了，让客户在 AI 里找到你', subheadline: '基于大模型的智能获客方案，7×24 小时自动接待每一位 AI 渠道来访客户' },
  socialProof: ['服务超过 1000+ 企业客户', '平均线索转化率提升 40%', '7×24 小时不间断自动接待'],
  cta: { label: '立即预约演示', target: '#contact' },
  faqs: [
    { q: '什么是 GEO 流量？', a: '来自 AI 搜索引擎（如豆包、元宝、Perplexity 等）推荐/引用带来的访问流量。' },
    { q: '如何识别客户来自哪个 AI 引擎？', a: '通过 URL 参数 geo_engine、geo_keyword、utm_source 自动识别并归因。' },
    { q: '客户来访后如何承接？', a: '记录访问来源后自动转交 AI 获客伙计进行对话接待与线索登记。' }
  ]
};

class GeoLandingService {
  constructor(config) {
    this.config = config;
    this.options = (config && config.geo) || {};
    this.storagePath = this.options.storagePath || './data/geo';
    this.landingsFile = path.join(this.storagePath, 'landings.json');
    this.abtestsFile = path.join(this.storagePath, 'abtests.json');
    this.visitsFile = path.join(this.storagePath, 'landing-visits.json');
    this._ensureDir();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true });
      }
      [this.landingsFile, this.abtestsFile, this.visitsFile].forEach((f) => {
        if (!fs.existsSync(f)) {
          fs.writeFileSync(f, JSON.stringify([], null, 2));
        }
      });
    } catch (e) {
      console.error('[GeoLanding] 初始化目录失败:', e.message);
    }
  }

  _read(file) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
      console.error('[GeoLanding] 读取失败:', file, e.message);
      return [];
    }
  }

  _write(file, data) {
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[GeoLanding] 写入失败:', file, e.message);
      throw e;
    }
  }

  // ===== 落地页模板 CRUD =====

  /**
   * 创建落地页模板
   * @param {Object} data - { name, slug, hero?, socialProof?, cta?, faqs? }
   */
  createLanding(data = {}) {
    try {
      if (!data.name || !String(data.name).trim()) throw new Error('name 不能为空');
      const now = new Date().toISOString();
      const item = {
        id: crypto.randomUUID(),
        name: String(data.name).trim(),
        slug: data.slug || `landing-${Date.now()}`,
        type: 'geo',
        hero: data.hero || DEFAULT_SECTIONS.hero,
        socialProof: data.socialProof || DEFAULT_SECTIONS.socialProof,
        cta: data.cta || DEFAULT_SECTIONS.cta,
        faqs: data.faqs || DEFAULT_SECTIONS.faqs,
        createdAt: now,
        updatedAt: now
      };
      const list = this._read(this.landingsFile);
      list.push(item);
      this._write(this.landingsFile, list);
      console.log('[GeoLanding] 创建落地页:', item.name);
      return item;
    } catch (e) {
      console.error('[GeoLanding] createLanding 失败:', e.message);
      throw e;
    }
  }

  /**
   * 更新落地页模板
   */
  updateLanding(id, data = {}) {
    try {
      if (!id) throw new Error('id 不能为空');
      const list = this._read(this.landingsFile);
      const idx = list.findIndex((l) => l.id === id);
      if (idx === -1) return null;
      ['name', 'slug', 'hero', 'socialProof', 'cta', 'faqs'].forEach((k) => {
        if (data[k] !== undefined) list[idx][k] = data[k];
      });
      list[idx].updatedAt = new Date().toISOString();
      this._write(this.landingsFile, list);
      return list[idx];
    } catch (e) {
      console.error('[GeoLanding] updateLanding 失败:', e.message);
      throw e;
    }
  }

  /**
   * 删除落地页模板
   */
  deleteLanding(id) {
    try {
      if (!id) throw new Error('id 不能为空');
      const list = this._read(this.landingsFile);
      const next = list.filter((l) => l.id !== id);
      this._write(this.landingsFile, next);
      return next.length !== list.length;
    } catch (e) {
      console.error('[GeoLanding] deleteLanding 失败:', e.message);
      throw e;
    }
  }

  /**
   * 落地页列表
   */
  listLandings() {
    try {
      const list = this._read(this.landingsFile);
      list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      return list;
    } catch (e) {
      console.error('[GeoLanding] listLandings 失败:', e.message);
      return [];
    }
  }

  /**
   * 获取单页
   */
  getLanding(id) {
    try {
      if (!id) return null;
      return this._read(this.landingsFile).find((l) => l.id === id) || null;
    } catch (e) {
      console.error('[GeoLanding] getLanding 失败:', e.message);
      return null;
    }
  }

  // ===== A/B 测试 =====

  /**
   * 创建 A/B 测试
   * @param {Object} data - { landingId, name, variants: [{id, name, headline}] }
   */
  createABTest(data = {}) {
    try {
      if (!data.landingId) throw new Error('landingId 不能为空');
      const landing = this.getLanding(data.landingId);
      if (!landing) throw new Error('落地页不存在: ' + data.landingId);
      const variants = Array.isArray(data.variants) && data.variants.length >= 2
        ? data.variants.map((v, i) => ({
            id: v.id || String.fromCharCode(65 + i),
            name: v.name || ('版本' + String.fromCharCode(65 + i)),
            headline: v.headline || '',
            exposures: 0,
            conversions: 0
          }))
        : [
            { id: 'A', name: '版本A', headline: landing.hero.headline, exposures: 0, conversions: 0 },
            { id: 'B', name: '版本B', headline: landing.hero.headline + '（强化版）', exposures: 0, conversions: 0 }
          ];
      const item = {
        id: crypto.randomUUID(),
        landingId: data.landingId,
        name: data.name || '未命名A/B测试',
        variants,
        status: 'running',
        winner: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const list = this._read(this.abtestsFile);
      list.push(item);
      this._write(this.abtestsFile, list);
      console.log('[GeoLanding] 创建A/B测试:', item.name);
      return item;
    } catch (e) {
      console.error('[GeoLanding] createABTest 失败:', e.message);
      throw e;
    }
  }

  /**
   * 根据曝光量为新访问分配 A/B 变体（轮转）
   */
  _assignVariant(abTest) {
    if (!abTest || abTest.status !== 'running') return null;
    // 选择当前曝光最少的变体，保证均匀分流
    let chosen = abTest.variants[0];
    abTest.variants.forEach((v) => { if (v.exposures < chosen.exposures) chosen = v; });
    return chosen;
  }

  // ===== 访问与转化 =====

  /**
   * 解析 URL 参数识别 GEO 流量来源
   */
  _parseSource(params = {}) {
    return {
      utm_source: params.utm_source || '',
      geo_engine: params.geo_engine || '',
      geo_keyword: params.geo_keyword || '',
      utm_medium: params.utm_medium || '',
      utm_campaign: params.utm_campaign || ''
    };
  }

  /**
   * 构造"AI 获客伙计承接"所需的线索来源载荷
   * 说明：服务间不互相 require；此处返回标准载荷，由上层路由/伙计服务读取后写入线索。
   */
  _buildLeadPayload(visit) {
    return {
      source: 'geo',
      sourceDetail: {
        engine: visit.source.geo_engine,
        keyword: visit.source.geo_keyword,
        utmSource: visit.source.utm_source,
        landingId: visit.landingId,
        variantId: visit.variantId
      },
      capturedAt: new Date().toISOString()
    };
  }

  /**
   * 记录一次落地页访问
   * @param {Object} data - { landingId, params?: {}, abTestId?, userAgent? }
   * @returns {Object} 访问记录（含 leadPayload 供伙计承接）
   */
  recordVisit(data = {}) {
    try {
      if (!data.landingId) throw new Error('landingId 不能为空');
      const landing = this.getLanding(data.landingId);
      if (!landing) throw new Error('落地页不存在: ' + data.landingId);

      const source = this._parseSource(data.params || {});

      // 若关联 A/B 测试，分配变体并累加曝光
      let abTest = null;
      let variantId = null;
      if (data.abTestId) {
        const tests = this._read(this.abtestsFile);
        abTest = tests.find((t) => t.id === data.abTestId);
        if (abTest && abTest.status === 'running') {
          const variant = this._assignVariant(abTest);
          if (variant) {
            variantId = variant.id;
            variant.exposures++;
            abTest.updatedAt = new Date().toISOString();
            this._write(this.abtestsFile, tests);
          }
        }
      }

      const visit = {
        id: crypto.randomUUID(),
        landingId: data.landingId,
        abTestId: data.abTestId || null,
        variantId,
        source,
        converted: false,
        convertedAt: null,
        userAgent: data.userAgent || '',
        visitedAt: new Date().toISOString()
      };
      const visits = this._read(this.visitsFile);
      visits.push(visit);
      this._write(this.visitsFile, visits);

      // 生成伙计承接来源载荷（供上层写入线索）
      visit.leadPayload = this._buildLeadPayload(visit);
      console.log('[GeoLanding] 记录访问:', data.landingId, '来源:', source.geo_engine || source.utm_source || 'direct');
      return visit;
    } catch (e) {
      console.error('[GeoLanding] recordVisit 失败:', e.message);
      throw e;
    }
  }

  /**
   * 记录一次转化（留资/预约等）
   * @param {string} visitId
   * @param {Object} extra - { leadId?, remark? }
   */
  recordConversion(visitId, extra = {}) {
    try {
      if (!visitId) throw new Error('visitId 不能为空');
      const visits = this._read(this.visitsFile);
      const visit = visits.find((v) => v.id === visitId);
      if (!visit) return null;
      visit.converted = true;
      visit.convertedAt = new Date().toISOString();
      visit.leadId = extra.leadId || null;
      visit.remark = extra.remark || '';

      // 同步 A/B 测试转化数
      if (visit.abTestId && visit.variantId) {
        const tests = this._read(this.abtestsFile);
        const t = tests.find((x) => x.id === visit.abTestId);
        if (t) {
          const variant = t.variants.find((v) => v.id === visit.variantId);
          if (variant) {
            variant.conversions++;
            t.updatedAt = new Date().toISOString();
            this._write(this.abtestsFile, tests);
          }
        }
      }
      this._write(this.visitsFile, visits);
      console.log('[GeoLanding] 记录转化:', visitId);
      return visit;
    } catch (e) {
      console.error('[GeoLanding] recordConversion 失败:', e.message);
      throw e;
    }
  }

  /**
   * 获取 A/B 测试结果（含转化率与胜出版本）
   */
  getABTestResults(abTestId) {
    try {
      if (!abTestId) return null;
      const tests = this._read(this.abtestsFile);
      const t = tests.find((x) => x.id === abTestId);
      if (!t) return null;
      let winner = null;
      let bestRate = -1;
      const variants = t.variants.map((v) => {
        const rate = v.exposures ? +(v.conversions / v.exposures * 100).toFixed(2) : 0;
        if (rate > bestRate && v.exposures > 0) { bestRate = rate; winner = v.id; }
        return { ...v, conversionRate: rate };
      });
      if (winner && t.status === 'running') {
        t.winner = winner;
        this._write(this.abtestsFile, tests);
      }
      return { ...t, variants, winner: winner || t.winner };
    } catch (e) {
      console.error('[GeoLanding] getABTestResults 失败:', e.message);
      return null;
    }
  }

  /**
   * 落地页统计：访问量、转化量、转化率、按引擎/关键词归因
   */
  getLandingStats(landingId) {
    try {
      let visits = this._read(this.visitsFile);
      if (landingId) visits = visits.filter((v) => v.landingId === landingId);
      const total = visits.length;
      const converted = visits.filter((v) => v.converted).length;
      const byEngine = {};
      const byKeyword = {};
      visits.forEach((v) => {
        const eng = v.source.geo_engine || v.source.utm_source || 'direct';
        byEngine[eng] = byEngine[eng] || { visits: 0, conversions: 0 };
        byEngine[eng].visits++;
        if (v.converted) byEngine[eng].conversions++;
        const kw = v.source.geo_keyword || '(无)';
        byKeyword[kw] = byKeyword[kw] || { visits: 0, conversions: 0 };
        byKeyword[kw].visits++;
        if (v.converted) byKeyword[kw].conversions++;
      });
      return {
        totalVisits: total,
        totalConversions: converted,
        conversionRate: total ? +(converted / total * 100).toFixed(2) : 0,
        byEngine,
        byKeyword
      };
    } catch (e) {
      console.error('[GeoLanding] getLandingStats 失败:', e.message);
      return { totalVisits: 0, totalConversions: 0, conversionRate: 0, byEngine: {}, byKeyword: {} };
    }
  }
}

module.exports = GeoLandingService;
