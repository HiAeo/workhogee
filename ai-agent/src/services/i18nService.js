/**
 * 多语言引擎服务（出海专版）
 * 支持语言检测、DeepSeek 大模型翻译、多语言回复生成、话术模板多语言存储、管理后台 UI 字典
 * 开发环境使用 JSON 文件存储到 data/i18n/ 目录
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const LLMService = require('./llm');

// 支持的语言列表
const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', rtl: false, flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', rtl: false, flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', rtl: false, flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', rtl: false, flag: '🇩🇪' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', rtl: false, flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', rtl: false, flag: '🇰🇷' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', rtl: false, flag: '🇧🇷' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true, flag: '🇸🇦' }
];

// 国家代码 -> 默认语言（用于 IP 地理定位降级）
const COUNTRY_TO_LANG = {
  US: 'en', GB: 'en', CA: 'en', AU: 'en', NZ: 'en', IE: 'en',
  DE: 'de', AT: 'de',
  FR: 'fr', BE: 'fr', MC: 'fr', LU: 'fr', CH: 'fr',
  ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es',
  EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es',
  SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es',
  PT: 'pt', BR: 'pt',
  JP: 'ja',
  KR: 'ko',
  SA: 'ar', AE: 'ar', EG: 'ar', KW: 'ar', QA: 'ar', DZ: 'ar', MA: 'ar', BH: 'ar', JO: 'ar'
};

// 管理后台 UI 文案字典（内置中英文映射）
const UI_DICTIONARIES = {
  zh: {
    appName: 'WorkHogee 智能获客',
    dashboard: '仪表盘',
    leads: '线索管理',
    conversations: '对话记录',
    scripts: '话术模板',
    settings: '系统设置',
    logout: '退出登录',
    welcome: '欢迎使用 WorkHogee',
    startChat: '开始对话',
    send: '发送',
    inputPlaceholder: '请输入您的问题...',
    chatOffline: '客服离线，请留言',
    cookieNotice: '我们使用 Cookie 优化您的体验',
    accept: '接受',
    decline: '拒绝',
    privacyPolicy: '隐私政策',
    language: '语言',
    save: '保存',
    cancel: '取消',
    delete: '删除',
    edit: '编辑',
    create: '新建',
    search: '搜索',
    totalLeads: '总线索数',
    todayLeads: '今日新增',
    conversionRate: '转化率',
    hotIntention: '高意向客户'
  },
  en: {
    appName: 'WorkHogee AI LeadGen',
    dashboard: 'Dashboard',
    leads: 'Leads',
    conversations: 'Conversations',
    scripts: 'Scripts',
    settings: 'Settings',
    logout: 'Log out',
    welcome: 'Welcome to WorkHogee',
    startChat: 'Start chat',
    send: 'Send',
    inputPlaceholder: 'Type your message...',
    chatOffline: 'Agent offline, please leave a message',
    cookieNotice: 'We use cookies to improve your experience',
    accept: 'Accept',
    decline: 'Decline',
    privacyPolicy: 'Privacy Policy',
    language: 'Language',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    search: 'Search',
    totalLeads: 'Total Leads',
    todayLeads: 'New Today',
    conversionRate: 'Conversion Rate',
    hotIntention: 'High-intent Leads'
  }
};

class I18nService {
  constructor(config) {
    this.config = config;
    this.options = config.i18n || {};
    this.defaultLanguage = this.options.defaultLanguage || 'en';
    // 文件存储目录
    this.storagePath = this.options.storagePath || './data/i18n';
    this.templatesFile = path.join(this.storagePath, 'templates.json');
    this._ensureDir();
    // 内部复用 LLM 服务做翻译与多语言回复
    this.llm = new LLMService(config);
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
    if (!fs.existsSync(this.templatesFile)) {
      fs.writeFileSync(this.templatesFile, JSON.stringify([], null, 2));
    }
  }

  _readTemplates() {
    try {
      const data = fs.readFileSync(this.templatesFile, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  _writeTemplates(list) {
    fs.writeFileSync(this.templatesFile, JSON.stringify(list, null, 2));
  }

  /**
   * 返回支持的语言列表
   */
  getLanguages() {
    return SUPPORTED_LANGUAGES;
  }

  /**
   * 判断是否为支持的语言
   */
  _isSupported(code) {
    if (!code) return false;
    return SUPPORTED_LANGUAGES.some(l => l.code === code.toLowerCase());
  }

  /**
   * 从浏览器 Accept-Language 头解析主语言
   */
  _parseBrowserLang(browserLang) {
    if (!browserLang) return null;
    // 取第一个语言标签，如 "en-US,en;q=0.9" -> "en-US"
    const first = String(browserLang).split(',')[0].trim();
    const primary = first.split('-')[0].toLowerCase();
    return this._isSupported(primary) ? primary : null;
  }

  /**
   * 通过 IP 调用免费地理定位 API（ipapi.co）获取国家，带超时与降级
   */
  async _countryByIp(ip) {
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('10.') || ip.startsWith('192.168.')) {
      return null;
    }
    return new Promise((resolve) => {
      let settled = false;
      const done = (val) => { if (!settled) { settled = true; resolve(val); } };
      const req = https.get({
        hostname: 'ipapi.co',
        path: '/' + encodeURIComponent(ip) + '/json/',
        method: 'GET',
        headers: { 'User-Agent': 'WorkHogee-i18n/1.0' },
        timeout: 3000
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            done(COUNTRY_TO_LANG[json.country_code] || null);
          } catch (e) {
            done(null);
          }
        });
      });
      req.on('error', () => done(null));
      req.on('timeout', () => { req.destroy(); done(null); });
    });
  }

  /**
   * 结合浏览器语言和 IP 地理定位检测语言
   * @param {string} browserLang - Accept-Language 头
   * @param {string} ip - 访客 IP
   * @returns {string} 语言 code
   */
  async detectLanguage(browserLang, ip) {
    // 1. 优先使用浏览器语言
    const fromBrowser = this._parseBrowserLang(browserLang);
    if (fromBrowser) return fromBrowser;
    // 2. 降级：IP 地理定位
    const fromIp = await this._countryByIp(ip);
    if (fromIp) return fromIp;
    // 3. 默认语言
    return this.defaultLanguage;
  }

  /**
   * 调用 DeepSeek 翻译文本，只返回翻译后的纯文本
   * @param {string} text - 待翻译文本
   * @param {string} fromLang - 源语言（auto 表示自动检测）
   * @param {string} toLang - 目标语言
   * @returns {Promise<string>} 翻译结果
   */
  async translate(text, fromLang = 'auto', toLang = 'en') {
    if (!text) return '';
    const sourceHint = fromLang && fromLang !== 'auto' ? `（源语言：${fromLang}）` : '';
    const messages = [
      {
        role: 'system',
        content: `You are a professional translation engine. Translate the user's text into ${toLang}. ` +
          'Rules: return ONLY the translated plain text, no explanations, no quotes, no notes. ' +
          'Keep placeholders like {name} unchanged. Preserve tone and formatting.'
      },
      { role: 'user', content: text + sourceHint }
    ];
    const result = await this.llm.chat(messages, { temperature: 0.3 });
    return (result || '').trim();
  }

  /**
   * 让 DeepSeek 直接使用目标语言生成回复
   * @param {string} conversationContext - 对话上下文摘要或历史
   * @param {string} targetLang - 目标语言 code
   * @returns {Promise<string>} 目标语言回复
   */
  async generateMultilingualReply(conversationContext, targetLang = 'en') {
    const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === targetLang) || SUPPORTED_LANGUAGES[0];
    const messages = [
      {
        role: 'system',
        content: `You are WorkHogee's AI sales agent. The customer speaks ${langInfo.name} (${langInfo.code}). ` +
          `You MUST reply ONLY in ${langInfo.name}. Be friendly, professional and concise. ` +
          'Acknowledge the customer\'s needs and guide them to share contact info or book a demo.'
      },
      { role: 'user', content: String(conversationContext || '') }
    ];
    const result = await this.llm.chat(messages, { temperature: 0.7 });
    return (result || '').trim();
  }

  // ===== 话术模板多语言 CRUD =====

  /**
   * 模板列表（支持按 language / scenario 筛选与分页）
   */
  listTemplates(filters = {}) {
    let list = this._readTemplates();
    if (filters.language) {
      list = list.filter(t => t.language === filters.language);
    }
    if (filters.scenario) {
      list = list.filter(t => t.scenario === filters.scenario);
    }
    list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const page = parseInt(filters.page) || 1;
    const pageSize = parseInt(filters.pageSize) || 20;
    const start = (page - 1) * pageSize;
    return {
      templates: list.slice(start, start + pageSize),
      total: list.length,
      page,
      pageSize
    };
  }

  /**
   * 创建模板
   */
  createTemplate(data) {
    const list = this._readTemplates();
    const now = new Date().toISOString();
    const template = {
      id: crypto.randomUUID(),
      name: data.name || '',
      scenario: data.scenario || 'general',
      language: data.language || this.defaultLanguage,
      content: data.content || '',
      variables: data.variables || [],
      createdAt: now,
      updatedAt: now
    };
    list.push(template);
    this._writeTemplates(list);
    return template;
  }

  /**
   * 更新模板
   */
  updateTemplate(id, data) {
    const list = this._readTemplates();
    const idx = list.findIndex(t => t.id === id);
    if (idx === -1) return null;
    const allowed = ['name', 'scenario', 'language', 'content', 'variables'];
    allowed.forEach(k => {
      if (data[k] !== undefined) list[idx][k] = data[k];
    });
    list[idx].updatedAt = new Date().toISOString();
    this._writeTemplates(list);
    return list[idx];
  }

  /**
   * 删除模板
   */
  deleteTemplate(id) {
    const list = this._readTemplates();
    const next = list.filter(t => t.id !== id);
    this._writeTemplates(next);
    return next.length !== list.length;
  }

  /**
   * 返回管理后台 UI 文案字典（默认英文兜底）
   */
  getUIDict(lang = 'en') {
    const code = (lang || 'en').toLowerCase();
    return UI_DICTIONARIES[code] || UI_DICTIONARIES.en;
  }
}

module.exports = I18nService;
