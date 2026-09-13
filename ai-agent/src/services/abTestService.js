/**
 * A/B 测试服务
 * 支持对话话术、欢迎语、营销内容的 A/B 测试，自动统计转化率并推荐最优版本
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class ABTestService {
  constructor(config) {
    this.config = config;
    this.storagePath = path.join(__dirname, '../../data/ab-test');
    this.testsFile = path.join(this.storagePath, 'tests.json');
    this.resultsFile = path.join(this.storagePath, 'results.json');
    this._ensureDir();
    this._loadTests();
    this._loadResults();
  }

  _ensureDir() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  _loadTests() {
    try {
      if (fs.existsSync(this.testsFile)) {
        this.tests = JSON.parse(fs.readFileSync(this.testsFile, 'utf-8'));
      } else {
        this.tests = [];
      }
    } catch (e) {
      this.tests = [];
    }
  }

  _saveTests() {
    fs.writeFileSync(this.testsFile, JSON.stringify(this.tests, null, 2));
  }

  _loadResults() {
    try {
      if (fs.existsSync(this.resultsFile)) {
        this.results = JSON.parse(fs.readFileSync(this.resultsFile, 'utf-8'));
      } else {
        this.results = {};
      }
    } catch (e) {
      this.results = {};
    }
  }

  _saveResults() {
    fs.writeFileSync(this.resultsFile, JSON.stringify(this.results, null, 2));
  }

  /**
   * 创建新的 A/B 测试
   * @param {Object} testConfig - 测试配置
   * @returns {Object} - 创建的测试
   */
  createTest(testConfig) {
    const test = {
      id: crypto.randomUUID(),
      name: testConfig.name,
      description: testConfig.description || '',
      type: testConfig.type || 'welcome_message', // welcome_message, script, content
      variants: testConfig.variants.map((v, i) => ({
        id: 'variant_' + i,
        name: v.name || '版本' + String.fromCharCode(65 + i),
        content: v.content,
        exposures: 0,
        conversions: 0
      })),
      status: 'active', // active, paused, completed
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: null,
      winner: null,
      minSampleSize: testConfig.minSampleSize || 100,
      confidenceThreshold: testConfig.confidenceThreshold || 0.95
    };

    this.tests.push(test);
    this.results[test.id] = { exposures: [], conversions: [] };
    this._saveTests();
    this._saveResults();

    return test;
  }

  /**
   * 获取测试变体（根据流量分配）
   * @param {string} testId - 测试 ID
   * @param {string} userId - 用户 ID（用于一致性分配）
   * @returns {Object|null} - 变体
   */
  getVariant(testId, userId) {
    const test = this.tests.find(t => t.id === testId && t.status === 'active');
    if (!test) return null;

    // 基于用户 ID 哈希进行一致性分配
    const hash = crypto.createHash('md5').update(userId + testId).digest('hex');
    const index = parseInt(hash.substring(0, 8), 16) % test.variants.length;
    const variant = test.variants[index];

    // 记录曝光
    variant.exposures++;
    if (!this.results[testId]) this.results[testId] = { exposures: [], conversions: [] };
    this.results[testId].exposures.push({
      userId,
      variantId: variant.id,
      timestamp: new Date().toISOString()
    });

    this._saveTests();
    this._saveResults();

    return variant;
  }

  /**
   * 记录转化
   * @param {string} testId - 测试 ID
   * @param {string} userId - 用户 ID
   */
  recordConversion(testId, userId) {
    const test = this.tests.find(t => t.id === testId);
    if (!test) return false;

    // 查找用户被分配的变体
    const exposure = this.results[testId]?.exposures.find(e => e.userId === userId);
    if (!exposure) return false;

    const variant = test.variants.find(v => v.id === exposure.variantId);
    if (variant) {
      variant.conversions++;
    }

    this.results[testId].conversions.push({
      userId,
      variantId: exposure.variantId,
      timestamp: new Date().toISOString()
    });

    this._saveTests();
    this._saveResults();

    // 检查是否可以确定赢家
    this._checkWinner(test);

    return true;
  }

  /**
   * 检查是否可以确定赢家
   */
  _checkWinner(test) {
    if (test.status !== 'active') return;

    const totalExposures = test.variants.reduce((sum, v) => sum + v.exposures, 0);
    if (totalExposures < test.minSampleSize) return;

    // 计算各变体转化率
    const rates = test.variants.map(v => ({
      variant: v,
      rate: v.exposures > 0 ? v.conversions / v.exposures : 0
    }));

    // 找出转化率最高的变体
    rates.sort((a, b) => b.rate - a.rate);
    const best = rates[0];
    const second = rates[1];

    // 简单的统计显著性检查（使用 Z 检验简化版）
    if (best.rate > 0 && second) {
      const p1 = best.rate;
      const p2 = second.rate;
      const n1 = best.variant.exposures;
      const n2 = second.variant.exposures;

      if (n1 > 0 && n2 > 0) {
        const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2);
        const se = Math.sqrt(pooledP * (1 - pooledP) * (1/n1 + 1/n2));
        const z = se > 0 ? (p1 - p2) / se : 0;

        // Z > 1.96 表示 95% 置信度
        if (z > 1.96) {
          test.winner = best.variant.id;
          test.status = 'completed';
          test.completedAt = new Date().toISOString();
          this._saveTests();
        }
      }
    }
  }

  /**
   * 获取测试列表
   * @returns {Array}
   */
  listTests() {
    return this.tests.map(t => ({
      ...t,
      totalExposures: t.variants.reduce((sum, v) => sum + v.exposures, 0),
      totalConversions: t.variants.reduce((sum, v) => sum + v.conversions, 0),
      bestVariant: this._getBestVariant(t)
    }));
  }

  /**
   * 获取测试详情
   * @param {string} testId - 测试 ID
   * @returns {Object|null}
   */
  getTest(testId) {
    const test = this.tests.find(t => t.id === testId);
    if (!test) return null;

    return {
      ...test,
      totalExposures: test.variants.reduce((sum, v) => sum + v.exposures, 0),
      totalConversions: test.variants.reduce((sum, v) => sum + v.conversions, 0),
      bestVariant: this._getBestVariant(test),
      variantStats: test.variants.map(v => ({
        ...v,
        conversionRate: v.exposures > 0 ? ((v.conversions / v.exposures) * 100).toFixed(2) + '%' : '0%'
      }))
    };
  }

  _getBestVariant(test) {
    let best = null;
    let bestRate = -1;
    test.variants.forEach(v => {
      const rate = v.exposures > 0 ? v.conversions / v.exposures : 0;
      if (rate > bestRate) {
        bestRate = rate;
        best = v;
      }
    });
    return best ? { ...best, conversionRate: best.exposures > 0 ? ((best.conversions / best.exposures) * 100).toFixed(2) + '%' : '0%' } : null;
  }

  /**
   * 暂停测试
   * @param {string} testId - 测试 ID
   */
  pauseTest(testId) {
    const test = this.tests.find(t => t.id === testId);
    if (test && test.status === 'active') {
      test.status = 'paused';
      this._saveTests();
      return true;
    }
    return false;
  }

  /**
   * 恢复测试
   * @param {string} testId - 测试 ID
   */
  resumeTest(testId) {
    const test = this.tests.find(t => t.id === testId);
    if (test && test.status === 'paused') {
      test.status = 'active';
      this._saveTests();
      return true;
    }
    return false;
  }

  /**
   * 删除测试
   * @param {string} testId - 测试 ID
   */
  deleteTest(testId) {
    const index = this.tests.findIndex(t => t.id === testId);
    if (index !== -1) {
      this.tests.splice(index, 1);
      delete this.results[testId];
      this._saveTests();
      this._saveResults();
      return true;
    }
    return false;
  }
}

module.exports = ABTestService;
