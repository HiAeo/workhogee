/**
 * GEO 自动周报服务
 * 汇总 GEO 监测数据（提及量、排名变化、趋势）与获客转化漏斗，
 * 自动生成 HTML 格式周报（内联 CSS + HTML 表格），存储到 data/geo/reports/ 目录，
 * 并提供模拟邮件/企微推送能力。
 * 说明：本服务直接读取 data/geo/ 下的数据文件，不 require 其他 GEO 服务，保持解耦。
 */
const fs = require('fs');
const path = require('path');

class GeoReportService {
  constructor(config) {
    this.config = config;
    this.options = (config && config.geo) || {};
    this.storagePath = this.options.storagePath || './data/geo';
    this.reportsDir = path.join(this.storagePath, 'reports');
    this.pushLogFile = path.join(this.storagePath, 'report-pushes.json');
    this._ensureDir();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true });
      }
      if (!fs.existsSync(this.reportsDir)) {
        fs.mkdirSync(this.reportsDir, { recursive: true });
      }
      if (!fs.existsSync(this.pushLogFile)) {
        fs.writeFileSync(this.pushLogFile, JSON.stringify([], null, 2));
      }
    } catch (e) {
      console.error('[GeoReport] 初始化目录失败:', e.message);
    }
  }

  _readJson(file, fallback) {
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
      console.error('[GeoReport] 读取失败:', file, e.message);
      return fallback;
    }
  }

  _writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  /**
   * 获取某一天所在周的周一 ~ 周日时间范围
   */
  _weekRange(date) {
    const d = date ? new Date(date) : new Date();
    const day = d.getDay() === 0 ? 7 : d.getDay(); // 周日=7
    const monday = new Date(d);
    monday.setDate(d.getDate() - day + 1);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  }

  /**
   * 汇总指定时间范围内的报告原始数据
   * @param {Date} weekStart
   * @param {Date} weekEnd
   */
  getReportData(weekStart, weekEnd) {
    try {
      const s = weekStart.getTime();
      const e = weekEnd.getTime();
      const inRange = (iso) => {
        const t = new Date(iso).getTime();
        return t >= s && t <= e;
      };

      const keywords = this._readJson(path.join(this.storagePath, 'keywords.json'), []);
      const mentions = this._readJson(path.join(this.storagePath, 'mentions.json'), []).filter((m) => inRange(m.monitoredAt));
      const rankings = this._readJson(path.join(this.storagePath, 'rankings.json'), []).filter((r) => inRange(r.monitoredAt));
      const visits = this._readJson(path.join(this.storagePath, 'landing-visits.json'), []).filter((v) => inRange(v.visitedAt));

      // 按引擎汇总
      const byEngine = {};
      mentions.forEach((m) => {
        byEngine[m.engineName] = byEngine[m.engineName] || { mentions: 0, positive: 0, neutral: 0, negative: 0, rankSum: 0, rankCount: 0 };
        const b = byEngine[m.engineName];
        b.mentions++;
        b[m.sentiment] = (b[m.sentiment] || 0) + 1;
        if (m.rank) { b.rankSum += m.rank; b.rankCount++; }
      });
      Object.keys(byEngine).forEach((k) => {
        const b = byEngine[k];
        b.avgRank = b.rankCount ? +(b.rankSum / b.rankCount).toFixed(2) : null;
      });

      // 排名变化：对比本周与上周首次/末次
      const trendByDay = {};
      rankings.filter((r) => r.mentioned && r.rank).forEach((r) => {
        const day = (r.monitoredAt || '').slice(0, 10);
        trendByDay[day] = trendByDay[day] || { sum: 0, count: 0 };
        trendByDay[day].sum += r.rank;
        trendByDay[day].count++;
      });
      const avgTrend = Object.keys(trendByDay).sort().map((day) => ({
        date: day,
        avgRank: +(trendByDay[day].sum / trendByDay[day].count).toFixed(2)
      }));

      // 情感汇总
      const sentiment = { positive: 0, neutral: 0, negative: 0 };
      mentions.forEach((m) => { if (sentiment[m.sentiment] !== undefined) sentiment[m.sentiment]++; });

      return {
        period: { start: weekStart.toISOString(), end: weekEnd.toISOString() },
        keywords: {
          total: keywords.length,
          brand: keywords.filter((k) => k.group === 'brand').length,
          industry: keywords.filter((k) => k.group === 'industry').length,
          competitor: keywords.filter((k) => k.group === 'competitor').length
        },
        mentions: { total: mentions.length, sentiment },
        byEngine,
        avgTrend,
        funnel: this.getConversionFunnel(visits)
      };
    } catch (e) {
      console.error('[GeoReport] getReportData 失败:', e.message);
      return {};
    }
  }

  /**
   * 转化漏斗：GEO 访问 → 转化留资（→ 成交）
   * @param {Array} [visits] - 可选传入已过滤的访问记录，否则读取全量
   */
  getConversionFunnel(visits) {
    try {
      const allVisits = visits || this._readJson(path.join(this.storagePath, 'landing-visits.json'), []);
      const totalVisits = allVisits.length;
      const converted = allVisits.filter((v) => v.converted).length;
      // 成交数在当前模型中与转化留资一致（无真实成交数据，预留位）
      const deals = converted;
      const rate = (n) => totalVisits ? +(n / totalVisits * 100).toFixed(2) : 0;
      return {
        visits: totalVisits,
        leads: converted,
        deals,
        visitToLeadRate: rate(converted),
        leadToDealRate: converted ? +(deals / converted * 100).toFixed(2) : 0
      };
    } catch (e) {
      console.error('[GeoReport] getConversionFunnel 失败:', e.message);
      return { visits: 0, leads: 0, deals: 0, visitToLeadRate: 0, leadToDealRate: 0 };
    }
  }

  /**
   * 渲染 HTML 周报（内联 CSS + HTML 表格）
   */
  _renderHtml(data) {
    const fmtDate = (iso) => (iso || '').slice(0, 10);
    const engineRows = Object.keys(data.byEngine || {}).map((name) => {
      const b = data.byEngine[name];
      return `<tr><td>${name}</td><td>${b.mentions}</td><td>${b.positive}</td><td>${b.neutral}</td><td>${b.negative}</td><td>${b.avgRank || '-'}</td></tr>`;
    }).join('');
    const trendRows = (data.avgTrend || []).map((t) => `<tr><td>${t.date}</td><td>${t.avgRank}</td></tr>`).join('');
    const f = data.funnel || {};
    return `<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>GEO 周报 ${fmtDate(data.period.start)}</title></head>
<body style="font-family:Arial,'Microsoft YaHei',sans-serif;color:#222;max-width:760px;margin:0 auto;padding:24px;">
  <h1 style="font-size:22px;">GEO 效果周报</h1>
  <p style="color:#666;">统计周期：${fmtDate(data.period.start)} ~ ${fmtDate(data.period.end)}</p>

  <h2 style="font-size:16px;margin-top:24px;">一、核心指标</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px;">
    <tr><td style="border:1px solid #ddd;padding:8px;">监测关键词</td><td style="border:1px solid #ddd;padding:8px;">${data.keywords.total}（品牌 ${data.keywords.brand} / 行业 ${data.keywords.industry} / 竞品 ${data.keywords.competitor}）</td></tr>
    <tr><td style="border:1px solid #ddd;padding:8px;">本周提及量</td><td style="border:1px solid #ddd;padding:8px;">${data.mentions.total}</td></tr>
    <tr><td style="border:1px solid #ddd;padding:8px;">情感分布</td><td style="border:1px solid #ddd;padding:8px;">正面 ${data.mentions.sentiment.positive} / 中性 ${data.mentions.sentiment.neutral} / 负面 ${data.mentions.sentiment.negative}</td></tr>
  </table>

  <h2 style="font-size:16px;margin-top:24px;">二、分引擎表现</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px;">
    <tr style="background:#f5f5f5;"><th style="border:1px solid #ddd;padding:8px;">引擎</th><th style="border:1px solid #ddd;padding:8px;">提及</th><th style="border:1px solid #ddd;padding:8px;">正面</th><th style="border:1px solid #ddd;padding:8px;">中性</th><th style="border:1px solid #ddd;padding:8px;">负面</th><th style="border:1px solid #ddd;padding:8px;">平均排名</th></tr>
    ${engineRows || '<tr><td colspan="6" style="border:1px solid #ddd;padding:8px;text-align:center;">本周暂无数据</td></tr>'}
  </table>

  <h2 style="font-size:16px;margin-top:24px;">三、平均排名趋势（按天）</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px;">
    <tr style="background:#f5f5f5;"><th style="border:1px solid #ddd;padding:8px;">日期</th><th style="border:1px solid #ddd;padding:8px;">平均排名</th></tr>
    ${trendRows || '<tr><td colspan="2" style="border:1px solid #ddd;padding:8px;text-align:center;">本周暂无排名数据</td></tr>'}
  </table>

  <h2 style="font-size:16px;margin-top:24px;">四、获客转化漏斗</h2>
  <table style="border-collapse:collapse;width:100%;font-size:14px;">
    <tr style="background:#f5f5f5;"><th style="border:1px solid #ddd;padding:8px;">环节</th><th style="border:1px solid #ddd;padding:8px;">数量</th><th style="border:1px solid #ddd;padding:8px;">转化率</th></tr>
    <tr><td style="border:1px solid #ddd;padding:8px;">GEO 访问</td><td style="border:1px solid #ddd;padding:8px;">${f.visits}</td><td style="border:1px solid #ddd;padding:8px;">100%</td></tr>
    <tr><td style="border:1px solid #ddd;padding:8px;">留资线索</td><td style="border:1px solid #ddd;padding:8px;">${f.leads}</td><td style="border:1px solid #ddd;padding:8px;">${f.visitToLeadRate}%</td></tr>
    <tr><td style="border:1px solid #ddd;padding:8px;">成交</td><td style="border:1px solid #ddd;padding:8px;">${f.deals}</td><td style="border:1px solid #ddd;padding:8px;">${f.leadToDealRate}%</td></tr>
  </table>

  <p style="color:#999;font-size:12px;margin-top:24px;">本报告由 WorkHogee GEO 周报服务自动生成</p>
</body></html>`;
  }

  /**
   * 生成周报
   * @param {Object} options - { date?: 基准日期, weekStart?, weekEnd? }
   * @returns {Object} { id, filename, period, html }
   */
  generateWeeklyReport(options = {}) {
    try {
      const { start, end } = (options.weekStart && options.weekEnd)
        ? { start: new Date(options.weekStart), end: new Date(options.weekEnd) }
        : this._weekRange(options.date);
      const data = this.getReportData(start, end);
      const html = this._renderHtml(data);

      // 文件名：按周标识，如 2026-W37.html
      const tmp = new Date(start);
      const onejan = new Date(tmp.getFullYear(), 0, 1);
      const weekNum = Math.ceil((((tmp - onejan) / 86400000) + onejan.getDay() + 1) / 7);
      const stamp = `${tmp.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      const filename = `${stamp}.html`;
      const filepath = path.join(this.reportsDir, filename);
      fs.writeFileSync(filepath, html, 'utf-8');

      const record = {
        id: stamp,
        filename,
        period: data.period,
        mentionsTotal: data.mentions.total,
        generatedAt: new Date().toISOString()
      };
      console.log('[GeoReport] 周报已生成:', filename);
      return { ...record, html };
    } catch (e) {
      console.error('[GeoReport] generateWeeklyReport 失败:', e.message);
      throw e;
    }
  }

  /**
   * 周报历史列表
   */
  listReports() {
    try {
      return fs.readdirSync(this.reportsDir)
        .filter((f) => f.endsWith('.html'))
        .map((f) => {
          const stat = fs.statSync(path.join(this.reportsDir, f));
          return { filename: f, generatedAt: stat.mtime.toISOString() };
        })
        .sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
    } catch (e) {
      console.error('[GeoReport] listReports 失败:', e.message);
      return [];
    }
  }

  /**
   * 读取单份周报 HTML
   */
  getReport(filename) {
    try {
      if (!filename || !filename.endsWith('.html')) return null;
      // 防止路径穿越
      const safe = path.basename(filename);
      const filepath = path.join(this.reportsDir, safe);
      if (!fs.existsSync(filepath)) return null;
      return fs.readFileSync(filepath, 'utf-8');
    } catch (e) {
      console.error('[GeoReport] getReport 失败:', e.message);
      return null;
    }
  }

  /**
   * 模拟推送周报（邮件 / 企业微信）
   * @param {string} reportFilename
   * @param {Object} options - { channel?: 'email'|'wechat', to?: string }
   * @returns {Object} 推送记录
   */
  sendReport(reportFilename, options = {}) {
    try {
      const html = this.getReport(reportFilename);
      if (!html) throw new Error('周报不存在: ' + reportFilename);
      const channel = options.channel || 'email';
      const record = {
        id: Date.now().toString(36),
        reportFilename,
        channel,
        to: options.to || 'marketing@example.com',
        status: 'simulated', // 模拟推送，未真实发送
        sentAt: new Date().toISOString()
      };
      const list = this._readJson(this.pushLogFile, []);
      list.push(record);
      this._writeJson(this.pushLogFile, list);
      console.log('[GeoReport] 模拟推送周报:', reportFilename, '->', channel, record.to);
      return record;
    } catch (e) {
      console.error('[GeoReport] sendReport 失败:', e.message);
      throw e;
    }
  }
}

module.exports = GeoReportService;
