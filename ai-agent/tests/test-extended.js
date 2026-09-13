/**
 * WorkHogee AI 获客伙计 v0.2.0 - 扩展功能测试
 * 测试内容智造、线索培育、DSH 插件系统
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('');
  console.log('========================================');
  console.log('  WorkHogee v0.2.0 - 扩展功能测试');
  console.log('========================================');
  console.log('');

  let passed = 0;
  let failed = 0;

  // 测试 1: DSH 插件系统状态
  console.log('[1/5] DSH 插件系统状态...');
  try {
    const res = await request('/api/dsh/plugins');
    if (res.status === 200 && res.data.success) {
      console.log('  ✓ DSH 插件系统正常');
      console.log('    插件数量: ' + res.data.data.plugins.length);
      console.log('    已注册技能: ' + res.data.data.skills.join(', '));
      console.log('    已注册工具: ' + res.data.data.tools.length + ' 个');
      passed++;
    } else {
      console.log('  ✗ DSH 插件系统异常');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ DSH 插件系统测试失败: ' + e.message);
    failed++;
  }

  // 测试 2: 内容智造 - 营销文案
  console.log('');
  console.log('[2/5] 内容智造 - 营销文案生成...');
  try {
    const res = await request('/api/content/copy', 'POST', {
      scene: '朋友圈',
      hook: 'AI 获客伙计，24小时在线接待客户',
      cta: '立即预约体验'
    });
    if (res.status === 200 && res.data.success && res.data.data.copies) {
      console.log('  ✓ 营销文案生成成功');
      console.log('    生成文案数量: ' + res.data.data.copies.length);
      if (res.data.data.copies[0]) {
        console.log('    第一条标题: ' + res.data.data.copies[0].title.substring(0, 40) + '...');
      }
      passed++;
    } else {
      console.log('  ✗ 营销文案生成失败');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ 营销文案测试异常: ' + e.message);
    failed++;
  }

  // 测试 3: 内容智造 - 小红书笔记
  console.log('');
  console.log('[3/5] 内容智造 - 小红书笔记生成...');
  try {
    const res = await request('/api/content/xiaohongshu', 'POST', {
      topic: '中小企业如何用AI提升获客效率',
      style: '干货',
      imageCount: 6
    });
    if (res.status === 200 && res.data.success && res.data.data.titles) {
      console.log('  ✓ 小红书笔记生成成功');
      console.log('    备选标题数量: ' + res.data.data.titles.length);
      console.log('    配图建议数量: ' + (res.data.data.imageSuggestions ? res.data.data.imageSuggestions.length : 0));
      console.log('    标签数量: ' + (res.data.data.tags ? res.data.data.tags.length : 0));
      passed++;
    } else {
      console.log('  ✗ 小红书笔记生成失败');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ 小红书笔记测试异常: ' + e.message);
    failed++;
  }

  // 测试 4: 线索培育 - 获取待跟进线索
  console.log('');
  console.log('[4/5] 线索培育 - 获取待跟进线索...');
  try {
    const res = await request('/api/nurture/to-followup?daysThreshold=0');
    if (res.status === 200 && res.data.success) {
      console.log('  ✓ 待跟进线索获取成功');
      console.log('    待跟进线索数量: ' + res.data.data.count);
      passed++;
    } else {
      console.log('  ✗ 待跟进线索获取失败');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ 线索培育测试异常: ' + e.message);
    failed++;
  }

  // 测试 5: 线索培育 - 生成跟进话术
  console.log('');
  console.log('[5/5] 线索培育 - 生成跟进话术...');
  try {
    // 先获取一个线索ID
    const leadsRes = await request('/api/leads?pageSize=1');
    if (leadsRes.data.success && leadsRes.data.data.leads.length > 0) {
      const leadId = leadsRes.data.data.leads[0].id;
      const res = await request('/api/nurture/followup-script', 'POST', {
        leadId,
        scene: '首次跟进'
      });
      if (res.status === 200 && res.data.success && res.data.data.opening) {
        console.log('  ✓ 跟进话术生成成功');
        console.log('    场景: 首次跟进');
        console.log('    开场白: ' + res.data.data.opening.substring(0, 50) + '...');
        console.log('    异议处理数量: ' + (res.data.data.objections ? res.data.data.objections.length : 0));
        passed++;
      } else {
        console.log('  ✗ 跟进话术生成失败');
        failed++;
      }
    } else {
      console.log('  - 跳过（无线索数据）');
    }
  } catch (e) {
    console.log('  ✗ 跟进话术测试异常: ' + e.message);
    failed++;
  }

  // 测试结果汇总
  console.log('');
  console.log('========================================');
  console.log('  扩展功能测试结果汇总');
  console.log('========================================');
  console.log('  通过: ' + passed + ' 项');
  console.log('  失败: ' + failed + ' 项');
  console.log('');

  if (failed === 0) {
    console.log('  🎉 所有扩展功能测试通过！');
  } else {
    console.log('  ⚠️  部分测试失败，请检查日志。');
  }
  console.log('');
}

runTests().catch(console.error);
