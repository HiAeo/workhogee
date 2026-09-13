/**
 * WorkHogee AI 获客伙计 - 测试脚本
 * 用于验证核心功能是否正常工作
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

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('');
  console.log('========================================');
  console.log('  WorkHogee AI 获客伙计 - 功能测试');
  console.log('========================================');
  console.log('');

  let passed = 0;
  let failed = 0;

  // 测试 1: 健康检查
  console.log('[1/6] 健康检查...');
  try {
    const res = await request('/api/health');
    if (res.status === 200 && res.data.success) {
      console.log('  ✓ 服务运行正常');
      console.log('    服务: ' + res.data.data.service);
      console.log('    版本: ' + res.data.data.version);
      passed++;
    } else {
      console.log('  ✗ 健康检查失败');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ 无法连接服务: ' + e.message);
    console.log('  请先运行 npm start 启动服务');
    failed++;
    return;
  }

  // 测试 2: 开始新对话
  console.log('');
  console.log('[2/6] 开始新对话...');
  let conversationId = null;
  try {
    const res = await request('/api/conversations', 'POST', { source: 'test' });
    if (res.status === 200 && res.data.success) {
      conversationId = res.data.data.conversationId;
      console.log('  ✓ 对话创建成功');
      console.log('    对话ID: ' + conversationId);
      console.log('    欢迎消息: ' + res.data.data.welcomeMessage.substring(0, 50) + '...');
      passed++;
    } else {
      console.log('  ✗ 创建对话失败');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ 创建对话异常: ' + e.message);
    failed++;
  }

  // 测试 3: 发送消息
  console.log('');
  console.log('[3/6] 发送消息（测试对话承接）...');
  if (conversationId) {
    try {
      const res = await request('/api/conversations/' + conversationId + '/messages', 'POST', {
        message: '你好，我想了解一下你们的产品'
      });
      if (res.status === 200 && res.data.success) {
        console.log('  ✓ 消息发送成功');
        console.log('    AI回复: ' + res.data.data.reply.substring(0, 80) + '...');
        console.log('    意向等级: ' + res.data.data.intentionLevel);
        passed++;
      } else {
        console.log('  ✗ 消息发送失败: ' + JSON.stringify(res.data));
        failed++;
      }
    } catch (e) {
      console.log('  ✗ 消息发送异常: ' + e.message);
      failed++;
    }
  } else {
    console.log('  - 跳过（无对话ID）');
  }

  // 测试 4: 获取线索列表
  console.log('');
  console.log('[4/6] 获取线索列表...');
  try {
    const res = await request('/api/leads?pageSize=10');
    if (res.status === 200 && res.data.success) {
      console.log('  ✓ 线索列表获取成功');
      console.log('    总线索数: ' + res.data.data.total);
      console.log('    当前页: ' + res.data.data.page + '/' + Math.ceil(res.data.data.total / res.data.data.pageSize));
      passed++;
    } else {
      console.log('  ✗ 获取线索列表失败');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ 获取线索列表异常: ' + e.message);
    failed++;
  }

  // 测试 5: 获取统计数据
  console.log('');
  console.log('[5/6] 获取统计数据...');
  try {
    const res = await request('/api/stats');
    if (res.status === 200 && res.data.success) {
      const stats = res.data.data;
      console.log('  ✓ 统计数据获取成功');
      console.log('    总线索数: ' + stats.total);
      console.log('    今日新增: ' + stats.todayNew);
      console.log('    A级意向: ' + stats.byIntentionLevel.A);
      console.log('    B级意向: ' + stats.byIntentionLevel.B);
      console.log('    C级意向: ' + stats.byIntentionLevel.C);
      console.log('    已转化: ' + stats.byStatus.converted);
      console.log('    转化率: ' + stats.conversionRate + '%');
      passed++;
    } else {
      console.log('  ✗ 获取统计数据失败');
      failed++;
    }
  } catch (e) {
    console.log('  ✗ 获取统计数据异常: ' + e.message);
    failed++;
  }

  // 测试 6: 获取对话历史
  console.log('');
  console.log('[6/6] 获取对话历史...');
  if (conversationId) {
    try {
      const res = await request('/api/conversations/' + conversationId);
      if (res.status === 200 && res.data.success) {
        console.log('  ✓ 对话历史获取成功');
        console.log('    消息数: ' + res.data.data.messages.length);
        console.log('    意向等级: ' + res.data.data.intentionLevel);
        passed++;
      } else {
        console.log('  ✗ 获取对话历史失败');
        failed++;
      }
    } catch (e) {
      console.log('  ✗ 获取对话历史异常: ' + e.message);
      failed++;
    }
  } else {
    console.log('  - 跳过（无对话ID）');
  }

  // 测试结果汇总
  console.log('');
  console.log('========================================');
  console.log('  测试结果汇总');
  console.log('========================================');
  console.log('  通过: ' + passed + ' 项');
  console.log('  失败: ' + failed + ' 项');
  console.log('');

  if (failed === 0) {
    console.log('  🎉 所有测试通过！系统运行正常。');
  } else {
    console.log('  ⚠️  部分测试失败，请检查配置和服务状态。');
  }
  console.log('');
}

runTests().catch(console.error);
