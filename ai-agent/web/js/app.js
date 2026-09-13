// WorkHogee AI 获客伙计 - 管理后台前端逻辑 v0.2.0

const API_BASE = '/api';
let currentPage = 1;
let currentFilters = {};

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initContentTabs();
  initNurtureTabs();
  loadDashboard();
  checkServerStatus();
  loadDSHStatus();
  loadApiKeys();
});

// 导航初始化
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      switchPage(page);
    });
  });
}

// 切换页面
function switchPage(page) {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => {
    n.classList.remove('active');
    if (n.dataset.page === page) n.classList.add('active');
  });

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');

  const titles = {
    dashboard: '仪表盘',
    leads: '线索管理',
    conversations: '对话记录',
    content: '内容智造',
    nurture: '线索培育',
    settings: '系统设置'
  };
  document.getElementById('page-title').textContent = titles[page] || '仪表盘';

  if (page === 'leads') loadLeads();
  if (page === 'settings') loadSettings();
  if (page === 'notifications') { loadNotifications(); loadNotificationRules(); }
  if (page === 'analytics') loadAnalytics();
  if (page === 'abtest') loadABTests();
}

// 内容智造标签页
function initContentTabs() {
  const tabs = document.querySelectorAll('#page-content .content-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('#page-content .content-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + tabName).classList.add('active');
    });
  });
}

// 线索培育标签页
function initNurtureTabs() {
  const tabs = document.querySelectorAll('#page-nurture .content-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('#page-nurture .content-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('panel-' + tabName).classList.add('active');
      if (tabName === 'to-followup') loadToFollowUp();
    });
  });
}

// 检查服务器状态
async function checkServerStatus() {
  try {
    const res = await fetch(API_BASE + '/health');
    const data = await res.json();
    if (data.success) {
      document.querySelector('#server-status span:last-child').textContent = '服务运行中 v' + data.data.version;
    }
  } catch (e) {
    document.querySelector('#server-status span:last-child').textContent = '连接失败';
  }
}

// 加载仪表盘
async function loadDashboard() {
  try {
    const res = await fetch(API_BASE + '/stats');
    const data = await res.json();
    if (data.success) {
      const stats = data.data;
      document.getElementById('stat-total').textContent = stats.total;
      document.getElementById('stat-today').textContent = stats.todayNew;
      document.getElementById('stat-a-level').textContent = stats.byIntentionLevel.A;
      document.getElementById('stat-converted').textContent = stats.byStatus.converted;

      const total = stats.total || 1;
      document.getElementById('bar-a').style.width = (stats.byIntentionLevel.A / total * 100) + '%';
      document.getElementById('bar-b').style.width = (stats.byIntentionLevel.B / total * 100) + '%';
      document.getElementById('bar-c').style.width = (stats.byIntentionLevel.C / total * 100) + '%';
      document.getElementById('count-a').textContent = stats.byIntentionLevel.A;
      document.getElementById('count-b').textContent = stats.byIntentionLevel.B;
      document.getElementById('count-c').textContent = stats.byIntentionLevel.C;
    }
  } catch (e) {
    console.error('Failed to load dashboard:', e);
  }

  try {
    const res = await fetch(API_BASE + '/leads?pageSize=5');
    const data = await res.json();
    if (data.success && data.data.leads.length > 0) {
      const container = document.getElementById('recent-leads');
      container.innerHTML = data.data.leads.map(lead => `
        <div class="recent-lead-item" onclick="viewLead('${lead.id}')">
          <div class="recent-lead-info">
            <div class="recent-lead-name">${lead.name || '未命名客户'}</div>
            <div class="recent-lead-meta">${lead.phone || lead.wechat || '无联系方式'} · ${formatDate(lead.createdAt)}</div>
          </div>
          <span class="badge badge-${lead.intentionLevel.toLowerCase()}">${lead.intentionLevel}级</span>
        </div>
      `).join('');
    } else {
      document.getElementById('recent-leads').innerHTML = '<div class="empty-state">暂无线索数据</div>';
    }
  } catch (e) {
    console.error('Failed to load recent leads:', e);
  }
}

// 加载线索列表
async function loadLeads() {
  const intention = document.getElementById('filter-intention').value;
  const status = document.getElementById('filter-status').value;
  let url = API_BASE + '/leads?page=' + currentPage + '&pageSize=20';
  if (intention) url += '&intentionLevel=' + intention;
  if (status) url += '&status=' + status;

  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      const { leads, total, page, pageSize } = data.data;
      const tbody = document.getElementById('leads-table-body');
      if (leads.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state">暂无数据</td></tr>';
      } else {
        tbody.innerHTML = leads.map(lead => `
          <tr>
            <td><strong>${lead.name || '未命名'}</strong></td>
            <td>${lead.phone || lead.wechat || lead.email || '-'}</td>
            <td>${lead.source}</td>
            <td><span class="badge badge-${lead.intentionLevel.toLowerCase()}">${lead.intentionLevel}级</span></td>
            <td><span class="badge badge-${lead.status}">${getStatusText(lead.status)}</span></td>
            <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${lead.needs || '-'}</td>
            <td>${formatDate(lead.createdAt)}</td>
            <td>
              <button class="btn btn-sm btn-primary" onclick="viewLead('${lead.id}')">详情</button>
            </td>
          </tr>
        `).join('');
      }
      renderPagination(total, page, pageSize);
    }
  } catch (e) {
    document.getElementById('leads-table-body').innerHTML = '<tr><td colspan="8" class="empty-state">加载失败</td></tr>';
  }
}

function renderPagination(total, currentPage, pageSize) {
  const totalPages = Math.ceil(total / pageSize);
  const container = document.getElementById('pagination');
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }
  container.innerHTML = html;
}

function goToPage(page) {
  currentPage = page;
  loadLeads();
}

// 查看线索详情
async function viewLead(id) {
  try {
    const res = await fetch(API_BASE + '/leads/' + id);
    const data = await res.json();
    if (data.success) {
      const lead = data.data;
      const body = document.getElementById('lead-modal-body');
      body.innerHTML = `
        <div class="detail-row"><div class="detail-label">姓名</div><div class="detail-value">${lead.name || '未命名'}</div></div>
        <div class="detail-row"><div class="detail-label">电话</div><div class="detail-value">${lead.phone || '-'}</div></div>
        <div class="detail-row"><div class="detail-label">微信</div><div class="detail-value">${lead.wechat || '-'}</div></div>
        <div class="detail-row"><div class="detail-label">邮箱</div><div class="detail-value">${lead.email || '-'}</div></div>
        <div class="detail-row"><div class="detail-label">来源</div><div class="detail-value">${lead.source}</div></div>
        <div class="detail-row"><div class="detail-label">意向等级</div><div class="detail-value"><span class="badge badge-${lead.intentionLevel.toLowerCase()}">${lead.intentionLevel}级</span></div></div>
        <div class="detail-row"><div class="detail-label">状态</div><div class="detail-value"><span class="badge badge-${lead.status}">${getStatusText(lead.status)}</span></div></div>
        <div class="detail-row"><div class="detail-label">预算</div><div class="detail-value">${lead.budget || '-'}</div></div>
        <div class="detail-row"><div class="detail-label">需求</div><div class="detail-value">${lead.needs || '-'}</div></div>
        <div class="detail-row"><div class="detail-label">备注</div><div class="detail-value">${lead.notes || '-'}</div></div>
        <div class="detail-row"><div class="detail-label">创建时间</div><div class="detail-value">${formatDateTime(lead.createdAt)}</div></div>
        <div style="margin-top:16px; padding-top:16px; border-top:2px solid #e7e5e4;">
          <button class="btn btn-primary" onclick="generateScriptForLead('${lead.id}')">生成跟进话术</button>
          <button class="btn" style="margin-left:8px; background:#f5f5f4; color:#1c1917;" onclick="switchPage('nurture')">去培育页面</button>
        </div>
      `;
      document.getElementById('lead-modal').classList.add('active');
    }
  } catch (e) {
    console.error('Failed to load lead detail:', e);
  }
}

function closeLeadModal() {
  document.getElementById('lead-modal').classList.remove('active');
}

// 为线索生成跟进话术
function generateScriptForLead(leadId) {
  closeLeadModal();
  switchPage('nurture');
  document.querySelector('#page-nurture .content-tab[data-tab="followup-script"]').click();
  document.getElementById('script-lead-id').value = leadId;
}

// ===== 内容智造功能 =====

// 显示加载
function showLoading(text = 'AI 正在生成中...') {
  document.getElementById('loading-text').textContent = text;
  document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
  document.getElementById('loading-overlay').style.display = 'none';
}

// 生成小红书笔记
async function generateXiaohongshu() {
  const topic = document.getElementById('xhs-topic').value;
  if (!topic) { alert('请输入笔记主题'); return; }

  showLoading('正在生成小红书笔记...');
  try {
    const res = await fetch(API_BASE + '/content/xiaohongshu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        style: document.getElementById('xhs-style').value,
        imageCount: parseInt(document.getElementById('xhs-images').value)
      })
    });
    const data = await res.json();
    if (data.success) {
      const r = data.data;
      document.getElementById('xhs-result').style.display = 'block';
      document.getElementById('xhs-result').innerHTML = `
        <div class="result-card">
          <h4>📌 备选标题（3个）</h4>
          <ul class="result-list">
            ${r.titles.map((t, i) => `<li><strong>${i+1}.</strong> ${t}</li>`).join('')}
          </ul>
        </div>
        <div class="result-card">
          <h4>📝 正文内容</h4>
          <div class="result-content">${r.content}</div>
        </div>
        <div class="result-card">
          <h4>🖼️ 配图建议（${r.imageSuggestions.length}张）</h4>
          <ul class="result-list">
            ${r.imageSuggestions.map((s, i) => `<li><strong>图${i+1}:</strong> ${s}</li>`).join('')}
          </ul>
        </div>
        <div class="result-card">
          <h4>🏷️ 推荐标签</h4>
          <div class="result-tags">
            ${r.tags.map(t => `<span class="result-tag">#${t}</span>`).join('')}
          </div>
        </div>
      `;
    }
  } catch (e) {
    alert('生成失败: ' + e.message);
  } finally {
    hideLoading();
  }
}

// 生成公众号文章
async function generateWechat() {
  const topic = document.getElementById('wc-topic').value;
  if (!topic) { alert('请输入文章主题'); return; }

  showLoading('正在生成公众号文章...');
  try {
    const res = await fetch(API_BASE + '/content/wechat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        angle: document.getElementById('wc-angle').value,
        wordCount: parseInt(document.getElementById('wc-wordcount').value)
      })
    });
    const data = await res.json();
    if (data.success) {
      const r = data.data;
      document.getElementById('wc-result').style.display = 'block';
      document.getElementById('wc-result').innerHTML = `
        <div class="result-card">
          <h4>📌 备选标题</h4>
          <ul class="result-list">
            ${r.titles.map((t, i) => `<li><strong>${i+1}.</strong> ${t}</li>`).join('')}
          </ul>
        </div>
        <div class="result-card">
          <h4>📋 文章摘要</h4>
          <div class="result-content">${r.summary}</div>
        </div>
        <div class="result-card">
          <h4>📖 正文内容</h4>
          <div class="result-content">${r.content}</div>
        </div>
        <div class="result-card">
          <h4>💎 结尾金句</h4>
          <div class="result-content" style="font-style:italic; color:#ea580c;">${r.goldenQuote}</div>
        </div>
        <div class="result-card">
          <h4>💬 互动话题</h4>
          <div class="result-content">${r.interactionTopic}</div>
        </div>
      `;
    }
  } catch (e) {
    alert('生成失败: ' + e.message);
  } finally {
    hideLoading();
  }
}

// 生成营销文案
async function generateCopy() {
  const hook = document.getElementById('copy-hook').value;
  if (!hook) { alert('请输入核心卖点'); return; }

  showLoading('正在生成营销文案...');
  try {
    const res = await fetch(API_BASE + '/content/copy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scene: document.getElementById('copy-scene').value,
        hook,
        cta: document.getElementById('copy-cta').value
      })
    });
    const data = await res.json();
    if (data.success) {
      const r = data.data;
      document.getElementById('copy-result').style.display = 'block';
      document.getElementById('copy-result').innerHTML = r.copies.map((copy, i) => `
        <div class="result-card">
          <h4>方案 ${i+1}</h4>
          <p style="margin-bottom:8px;"><strong>标题:</strong> ${copy.title}</p>
          <p style="margin-bottom:8px;"><strong>正文:</strong></p>
          <div class="result-content" style="background:#fafaf9; padding:12px; border-radius:8px;">${copy.body}</div>
          <p style="margin-top:12px;"><strong>行动号召:</strong> ${copy.cta}</p>
        </div>
      `).join('');
    }
  } catch (e) {
    alert('生成失败: ' + e.message);
  } finally {
    hideLoading();
  }
}

// 生成内容日历
async function generateCalendar() {
  showLoading('正在生成内容日历...');
  try {
    const res = await fetch(API_BASE + '/content/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (data.success) {
      const r = data.data;
      document.getElementById('calendar-result').style.display = 'block';
      document.getElementById('calendar-result').innerHTML = `
        <div class="result-card" style="padding:0; overflow:hidden;">
          <table class="calendar-table">
            <thead>
              <tr>
                <th style="width:60px;">日期</th>
                <th>主题</th>
                <th style="width:100px;">形式</th>
                <th style="width:100px;">平台</th>
                <th>核心要点</th>
                <th style="width:120px;">目标</th>
              </tr>
            </thead>
            <tbody>
              ${r.calendar.map(day => `
                <tr>
                  <td><strong>${day.day}</strong></td>
                  <td>${day.topic}</td>
                  <td>${day.format}</td>
                  <td>${day.platform}</td>
                  <td>${day.keyPoints ? day.keyPoints.join('；') : ''}</td>
                  <td>${day.goal}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  } catch (e) {
    alert('生成失败: ' + e.message);
  } finally {
    hideLoading();
  }
}

// ===== 线索培育功能 =====

// 加载待跟进线索
async function loadToFollowUp() {
  const days = document.getElementById('nurture-days').value;
  try {
    const res = await fetch(API_BASE + '/nurture/to-followup?daysThreshold=' + days);
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('to-followup-list');
      if (data.data.count === 0) {
        container.innerHTML = '<div class="empty-state">暂无待跟进线索</div>';
      } else {
        container.innerHTML = data.data.leads.map(lead => `
          <div class="followup-item">
            <div class="followup-info">
              <div class="followup-name">${lead.name || '未命名客户'} <span class="badge badge-${lead.intentionLevel.toLowerCase()}" style="margin-left:8px;">${lead.intentionLevel}级</span></div>
              <div class="followup-meta">${lead.phone || lead.wechat || '无联系方式'} · 最后跟进: ${formatDate(lead.updatedAt || lead.createdAt)}</div>
            </div>
            <div class="followup-actions">
              <button class="btn btn-sm btn-primary" onclick="useLeadForScript('${lead.id}')">生成话术</button>
              <button class="btn btn-sm" style="background:#f5f5f4;color:#1c1917;" onclick="viewLead('${lead.id}')">详情</button>
            </div>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    document.getElementById('to-followup-list').innerHTML = '<div class="empty-state">加载失败</div>';
  }
}

// 使用线索生成话术
function useLeadForScript(leadId) {
  document.querySelector('#page-nurture .content-tab[data-tab="followup-script"]').click();
  document.getElementById('script-lead-id').value = leadId;
}

// 生成跟进话术
async function generateFollowUpScript() {
  const leadId = document.getElementById('script-lead-id').value;
  if (!leadId) { alert('请输入线索ID'); return; }

  showLoading('正在生成跟进话术...');
  try {
    const res = await fetch(API_BASE + '/nurture/followup-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId,
        scene: document.getElementById('script-scene').value
      })
    });
    const data = await res.json();
    if (data.success) {
      const r = data.data;
      document.getElementById('script-result').style.display = 'block';
      document.getElementById('script-result').innerHTML = `
        <div class="result-card">
          <h4>👋 开场白</h4>
          <div class="result-content">${r.opening}</div>
        </div>
        <div class="result-card">
          <h4>💎 价值提供</h4>
          <div class="result-content">${r.valueProposition}</div>
        </div>
        <div class="result-card">
          <h4>❓ 需求挖掘问题</h4>
          <ul class="result-list">
            ${r.questions.map((q, i) => `<li><strong>Q${i+1}:</strong> ${q}</li>`).join('')}
          </ul>
        </div>
        <div class="result-card">
          <h4>📋 方案介绍</h4>
          <div class="result-content">${r.solution}</div>
        </div>
        <div class="result-card">
          <h4>🎯 行动号召</h4>
          <div class="result-content">${r.cta}</div>
        </div>
        <div class="result-card">
          <h4>🛡️ 常见异议处理</h4>
          ${r.objections.map(obj => `
            <div style="margin-bottom:12px; padding:12px; background:#fafaf9; border-radius:8px;">
              <p style="margin-bottom:4px;"><strong>客户说:</strong> ${obj.objection}</p>
              <p style="margin:0;"><strong>应对:</strong> ${obj.response}</p>
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (e) {
    alert('生成失败: ' + e.message);
  } finally {
    hideLoading();
  }
}

// 生成培育内容
async function generateNurtureContent() {
  const leadId = document.getElementById('nurture-lead-id').value;
  if (!leadId) { alert('请输入线索ID'); return; }

  showLoading('正在生成培育内容...');
  try {
    const res = await fetch(API_BASE + '/nurture/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId,
        contentType: document.getElementById('nurture-content-type').value
      })
    });
    const data = await res.json();
    if (data.success) {
      const r = data.data;
      document.getElementById('nurture-content-result').style.display = 'block';
      document.getElementById('nurture-content-result').innerHTML = `
        <div class="result-card">
          <h4>📌 标题</h4>
          <div class="result-content" style="font-size:16px; font-weight:600;">${r.title}</div>
        </div>
        <div class="result-card">
          <h4>📋 内容摘要</h4>
          <div class="result-content">${r.summary}</div>
        </div>
        <div class="result-card">
          <h4>📖 正文内容</h4>
          <div class="result-content">${r.content}</div>
        </div>
        <div class="result-card">
          <h4>🎯 行动号召</h4>
          <div class="result-content">${r.cta}</div>
        </div>
      `;
    }
  } catch (e) {
    alert('生成失败: ' + e.message);
  } finally {
    hideLoading();
  }
}

// 生成跟进计划
async function generateFollowUpPlan() {
  const leadId = document.getElementById('plan-lead-id').value;
  if (!leadId) { alert('请输入线索ID'); return; }

  showLoading('正在生成跟进计划...');
  try {
    const res = await fetch(API_BASE + '/nurture/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadId })
    });
    const data = await res.json();
    if (data.success) {
      const r = data.data;
      document.getElementById('plan-result').style.display = 'block';
      document.getElementById('plan-result').innerHTML = `
        <div class="result-card">
          <h4>🎯 整体策略</h4>
          <div class="result-content">${r.overallStrategy}</div>
        </div>
        <div class="result-card" style="padding:0; overflow:hidden;">
          <table class="calendar-table">
            <thead>
              <tr>
                <th style="width:60px;">第几天</th>
                <th style="width:80px;">渠道</th>
                <th>目的</th>
                <th>话术要点</th>
                <th style="width:120px;">成功标准</th>
              </tr>
            </thead>
            <tbody>
              ${r.plan.map(step => `
                <tr>
                  <td><strong>第${step.day}天</strong></td>
                  <td>${step.channel}</td>
                  <td>${step.purpose}</td>
                  <td>${step.keyPoints ? step.keyPoints.join('；') : ''}</td>
                  <td>${step.successCriteria}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  } catch (e) {
    alert('生成失败: ' + e.message);
  } finally {
    hideLoading();
  }
}

// ===== 系统设置 =====

function loadSettings() {
  const settings = JSON.parse(localStorage.getItem('workhogee-settings') || '{}');
  document.getElementById('setting-industry').value = settings.industry || '';
  document.getElementById('setting-product').value = settings.product || '';
  document.getElementById('setting-target').value = settings.target || '';
  document.getElementById('setting-api-key').value = settings.apiKey || '';
  document.getElementById('setting-model').value = settings.model || 'deepseek-chat';
}

function saveSettings() {
  const settings = JSON.parse(localStorage.getItem('workhogee-settings') || '{}');
  settings.industry = document.getElementById('setting-industry').value;
  settings.product = document.getElementById('setting-product').value;
  settings.target = document.getElementById('setting-target').value;
  localStorage.setItem('workhogee-settings', JSON.stringify(settings));
  alert('业务配置已保存');
}

function saveModelSettings() {
  const settings = JSON.parse(localStorage.getItem('workhogee-settings') || '{}');
  settings.apiKey = document.getElementById('setting-api-key').value;
  settings.model = document.getElementById('setting-model').value;
  localStorage.setItem('workhogee-settings', JSON.stringify(settings));
  alert('模型配置已保存（需要重启服务生效）');
}

// 加载 DSH 状态
async function loadDSHStatus() {
  try {
    const res = await fetch(API_BASE + '/dsh/plugins');
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('dsh-status');
      container.innerHTML = `
        <p style="margin-bottom:16px; color:#78716c;">已加载 ${data.data.plugins.length} 个插件、${data.data.skills.length} 个技能、${data.data.tools.length} 个工具</p>
        ${data.data.plugins.map(p => `
          <div class="dsh-plugin-item">
            <div>
              <div class="dsh-plugin-name">${p.name}</div>
              <div class="dsh-plugin-version">v${p.version} · ${p.description}</div>
            </div>
            <span class="dsh-status-badge">已启用</span>
          </div>
        `).join('')}
      `;
    }
  } catch (e) {
    document.getElementById('dsh-status').innerHTML = '<div class="empty-state">DSH 插件系统加载失败</div>';
  }
}

// ===== A/B 测试功能 =====

async function loadABTests() {
  try {
    const res = await fetch(API_BASE + '/ab-tests');
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('abtest-list');
      if (data.data.tests.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无 A/B 测试，点击右上角创建新测试</div>';
      } else {
        container.innerHTML = data.data.tests.map(test => {
          const statusColors = { active: '#16a34a', paused: '#f59e0b', completed: '#2563eb' };
          const statusLabels = { active: '进行中', paused: '已暂停', completed: '已完成' };
          return `
            <div class="panel" style="margin-bottom:16px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div>
                  <h4 style="margin:0 0 4px 0;">${test.name}</h4>
                  <span style="font-size:12px; color:#78716c;">${test.description || ''} · 类型: ${test.type}</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="padding:4px 10px; background:${statusColors[test.status]}; color:white; border-radius:10px; font-size:12px;">${statusLabels[test.status]}</span>
                  ${test.status === 'active' ? `<button class="btn btn-sm" style="background:#f59e0b;color:white;" onclick="pauseABTest('${test.id}')">暂停</button>` : ''}
                  ${test.status === 'paused' ? `<button class="btn btn-sm" style="background:#16a34a;color:white;" onclick="resumeABTest('${test.id}')">恢复</button>` : ''}
                  <button class="btn btn-sm" style="background:#dc2626;color:white;" onclick="deleteABTest('${test.id}')">删除</button>
                </div>
              </div>
              <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:12px;">
                <div><div style="font-size:20px; font-weight:700; color:#ea580c;">${test.totalExposures}</div><div style="font-size:12px; color:#78716c;">总曝光</div></div>
                <div><div style="font-size:20px; font-weight:700; color:#16a34a;">${test.totalConversions}</div><div style="font-size:12px; color:#78716c;">总转化</div></div>
                <div><div style="font-size:20px; font-weight:700; color:#2563eb;">${test.totalExposures > 0 ? ((test.totalConversions/test.totalExposures)*100).toFixed(2) : 0}%</div><div style="font-size:12px; color:#78716c;">总转化率</div></div>
                <div><div style="font-size:14px; font-weight:600; color:#ea580c;">${test.bestVariant ? test.bestVariant.name : '-'}</div><div style="font-size:12px; color:#78716c;">当前最优版本</div></div>
              </div>
              <div style="display:grid; grid-template-columns:repeat(${test.variants.length},1fr); gap:12px;">
                ${test.variants.map(v => {
                  const rate = v.exposures > 0 ? ((v.conversions/v.exposures)*100).toFixed(2) : 0;
                  const isWinner = test.winner === v.id;
                  return `
                    <div style="padding:12px; background:${isWinner ? '#f0fdf4' : '#fafaf9'}; border-radius:8px; border:1px solid ${isWinner ? '#16a34a' : '#e7e5e4'};">
                      <div style="font-weight:600; margin-bottom:4px;">${v.name} ${isWinner ? '🏆' : ''}</div>
                      <div style="font-size:12px; color:#78716c; margin-bottom:8px;">曝光: ${v.exposures} · 转化: ${v.conversions}</div>
                      <div style="font-size:18px; font-weight:700; color:${isWinner ? '#16a34a' : '#44403c'};">${rate}%</div>
                      <div style="font-size:11px; color:#78716c; margin-top:4px; max-height:40px; overflow:hidden;">${v.content.substring(0, 50)}...</div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('');
      }
    }
  } catch (e) {
    document.getElementById('abtest-list').innerHTML = '<div class="empty-state">加载失败</div>';
  }
}

function showCreateABTest() {
  document.getElementById('abtest-modal').style.display = 'flex';
}

function closeABTestModal() {
  document.getElementById('abtest-modal').style.display = 'none';
}

async function createABTest() {
  const name = document.getElementById('abtest-name').value;
  const variantA = document.getElementById('abtest-variant-a').value;
  const variantB = document.getElementById('abtest-variant-b').value;

  if (!name || !variantA || !variantB) {
    alert('请填写测试名称和两个版本的内容');
    return;
  }

  try {
    const res = await fetch(API_BASE + '/ab-tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        type: document.getElementById('abtest-type').value,
        minSampleSize: parseInt(document.getElementById('abtest-min-sample').value) || 100,
        variants: [
          { name: '版本A', content: variantA },
          { name: '版本B', content: variantB }
        ]
      })
    });
    const data = await res.json();
    if (data.success) {
      alert('A/B 测试创建成功！');
      closeABTestModal();
      loadABTests();
    }
  } catch (e) {
    alert('创建失败: ' + e.message);
  }
}

async function pauseABTest(id) {
  if (!confirm('确定要暂停这个测试吗？')) return;
  try {
    await fetch(API_BASE + '/ab-tests/' + id + '/pause', { method: 'PUT' });
    loadABTests();
  } catch (e) {
    alert('操作失败: ' + e.message);
  }
}

async function resumeABTest(id) {
  try {
    await fetch(API_BASE + '/ab-tests/' + id + '/resume', { method: 'PUT' });
    loadABTests();
  } catch (e) {
    alert('操作失败: ' + e.message);
  }
}

async function deleteABTest(id) {
  if (!confirm('确定要删除这个测试吗？此操作不可恢复。')) return;
  try {
    await fetch(API_BASE + '/ab-tests/' + id, { method: 'DELETE' });
    loadABTests();
  } catch (e) {
    alert('删除失败: ' + e.message);
  }
}

// ===== 数据分析功能 =====

async function loadAnalytics() {
  try {
    const res = await fetch(API_BASE + '/analytics/report');
    const data = await res.json();
    if (data.success) {
      const report = data.data;

      // 概览数据
      document.getElementById('ana-total').textContent = report.overview.totalLeads;
      document.getElementById('ana-converted').textContent = report.overview.convertedCount;
      document.getElementById('ana-rate').textContent = report.overview.conversionRate + '%';
      document.getElementById('ana-a-level').textContent = report.overview.aLevelCount;

      // 转化漏斗
      renderFunnel(report.conversion.funnel);

      // 趋势图
      renderTrend(report.trends.daily);

      // 来源分析
      renderSourceAnalysis(report.source);

      // 优化建议
      renderRecommendations(report.recommendations);
    }
  } catch (e) {
    console.error('加载分析数据失败:', e);
  }
}

function renderFunnel(funnelData) {
  const container = document.getElementById('funnel-chart');
  const maxCount = Math.max(...funnelData.map(f => f.count), 1);

  container.innerHTML = funnelData.map((stage, index) => {
    const width = (stage.count / maxCount * 100).toFixed(1);
    const colors = ['#ea580c', '#f97316', '#fb923c', '#fdba74'];
    return `
      <div style="display:flex; align-items:center; margin-bottom:12px;">
        <div style="width:80px; text-align:right; padding-right:16px; font-size:14px; color:#44403c;">${stage.stage}</div>
        <div style="flex:1; background:#f5f5f4; border-radius:8px; height:36px; position:relative; overflow:hidden;">
          <div style="width:${width}%; background:${colors[index]}; height:100%; border-radius:8px; transition:width 0.5s;"></div>
          <div style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:white; font-weight:600; font-size:14px;">${stage.count}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderTrend(dailyData) {
  const container = document.getElementById('trend-chart');
  const maxCount = Math.max(...dailyData.map(d => d.total), 1);

  container.innerHTML = `
    <div style="display:flex; align-items:flex-end; justify-content:space-between; height:200px; padding:0 20px; border-bottom:2px solid #e7e5e4;">
      ${dailyData.map(day => {
        const height = (day.total / maxCount * 100).toFixed(1);
        return `
          <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; padding:0 4px;">
            <div style="font-size:12px; color:#44403c; margin-bottom:4px;">${day.total}</div>
            <div style="width:100%; max-width:40px; background:linear-gradient(180deg, #ea580c, #f97316); border-radius:4px 4px 0 0; height:${height}%; min-height:4px;"></div>
          </div>
        `;
      }).join('')}
    </div>
    <div style="display:flex; justify-content:space-between; padding:8px 20px 0;">
      ${dailyData.map(day => `<div style="flex:1; text-align:center; font-size:11px; color:#78716c;">${day.date.slice(5)}</div>`).join('')}
    </div>
  `;
}

function renderSourceAnalysis(sourceData) {
  const container = document.getElementById('source-analysis');
  const sources = sourceData.topSources || [];

  if (sources.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无来源数据</div>';
    return;
  }

  container.innerHTML = `
    <table style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="background:#fafaf9;">
          <th style="padding:12px; text-align:left; font-size:13px; border-bottom:2px solid #e7e5e4;">来源</th>
          <th style="padding:12px; text-align:left; font-size:13px; border-bottom:2px solid #e7e5e4;">线索数</th>
          <th style="padding:12px; text-align:left; font-size:13px; border-bottom:2px solid #e7e5e4;">转化数</th>
          <th style="padding:12px; text-align:left; font-size:13px; border-bottom:2px solid #e7e5e4;">转化率</th>
        </tr>
      </thead>
      <tbody>
        ${sources.map(s => {
          const conv = sourceData.conversionBySource[s.source] || { total: 0, converted: 0, rate: 0 };
          return `
            <tr style="border-bottom:1px solid #f5f5f4;">
              <td style="padding:12px; font-size:14px;">${s.source}</td>
              <td style="padding:12px; font-size:14px;">${s.count}</td>
              <td style="padding:12px; font-size:14px;">${conv.converted}</td>
              <td style="padding:12px; font-size:14px; color:${conv.rate > 10 ? '#16a34a' : '#ea580c'}; font-weight:600;">${conv.rate}%</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderRecommendations(recommendations) {
  const container = document.getElementById('recommendations');
  const levelColors = { high: '#dc2626', medium: '#ea580c', low: '#2563eb', info: '#16a34a' };
  const levelLabels = { high: '高优先级', medium: '中优先级', low: '低优先级', info: '信息' };

  container.innerHTML = recommendations.map(rec => `
    <div style="padding:16px; background:#fafaf9; border-radius:10px; margin-bottom:12px; border-left:4px solid ${levelColors[rec.level]};">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <h4 style="margin:0; font-size:15px;">${rec.title}</h4>
        <span style="padding:4px 10px; background:${levelColors[rec.level]}; color:white; border-radius:10px; font-size:11px;">${levelLabels[rec.level]}</span>
      </div>
      <p style="margin:0 0 8px 0; font-size:14px; color:#44403c;">${rec.description}</p>
      <p style="margin:0; font-size:13px; color:#78716c;"><strong>建议操作：</strong>${rec.action}</p>
    </div>
  `).join('');
}

// ===== 通知中心功能 =====

async function loadNotifications() {
  const unreadOnly = document.getElementById('filter-unread').checked;
  try {
    const res = await fetch(API_BASE + '/notifications?pageSize=50&unreadOnly=' + unreadOnly);
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('notifications-list');
      document.getElementById('unread-count').textContent = '未读: ' + data.data.unreadCount + ' 条';

      if (data.data.items.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无通知</div>';
      } else {
        container.innerHTML = data.data.items.map(n => `
          <div class="dsh-plugin-item" style="${n.read ? 'opacity:0.6;' : ''} border-left: 3px solid ${n.read ? '#e7e5e4' : '#ea580c'};">
            <div style="flex:1;">
              <div class="dsh-plugin-name">${n.title || '通知'}</div>
              <div class="dsh-plugin-version">${n.message || ''} · ${formatDateTime(n.createdAt)}</div>
            </div>
            ${!n.read ? `<button class="btn btn-sm" style="background:#f5f5f4;color:#1c1917;" onclick="markAsRead('${n.id}')">已读</button>` : ''}
          </div>
        `).join('');
      }
    }
  } catch (e) {
    document.getElementById('notifications-list').innerHTML = '<div class="empty-state">加载失败</div>';
  }
}

async function markAsRead(id) {
  try {
    await fetch(API_BASE + '/notifications/' + id + '/read', { method: 'PUT' });
    loadNotifications();
  } catch (e) {
    alert('操作失败: ' + e.message);
  }
}

async function markAllAsRead() {
  try {
    await fetch(API_BASE + '/notifications/read-all', { method: 'PUT' });
    loadNotifications();
  } catch (e) {
    alert('操作失败: ' + e.message);
  }
}

async function loadNotificationRules() {
  try {
    const res = await fetch(API_BASE + '/notifications/rules');
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('notification-rules');
      const rule = data.data.newLead;
      container.innerHTML = `
        <div style="padding:16px; background:#fafaf9; border-radius:10px;">
          <h4 style="margin:0 0 12px 0;">新线索通知</h4>
          <div style="margin-bottom:12px;">
            <label style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" id="rule-enabled" ${rule.enabled ? 'checked' : ''} onchange="saveNotificationRules()">
              启用新线索通知
            </label>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; margin-bottom:6px; font-weight:500;">通知渠道</label>
            <label style="display:inline-flex; align-items:center; gap:6px; margin-right:16px;">
              <input type="checkbox" class="rule-channel" value="system" ${rule.channels.includes('system') ? 'checked' : ''}>
              系统通知
            </label>
            <label style="display:inline-flex; align-items:center; gap:6px; margin-right:16px;">
              <input type="checkbox" class="rule-channel" value="webhook" ${rule.channels.includes('webhook') ? 'checked' : ''}>
              Webhook
            </label>
            <label style="display:inline-flex; align-items:center; gap:6px;">
              <input type="checkbox" class="rule-channel" value="email" ${rule.channels.includes('email') ? 'checked' : ''}>
              邮件
            </label>
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; margin-bottom:6px; font-weight:500;">Webhook URL</label>
            <input type="text" id="rule-webhook" value="${rule.webhookUrl || ''}" style="width:100%; padding:8px 12px; border:1px solid #e7e5e4; border-radius:8px;">
          </div>
          <div style="margin-bottom:12px;">
            <label style="display:block; margin-bottom:6px; font-weight:500;">最低意向等级</label>
            <select id="rule-min-level" style="padding:8px 12px; border:1px solid #e7e5e4; border-radius:8px;">
              <option value="A" ${rule.minIntentionLevel === 'A' ? 'selected' : ''}>A级（最高）</option>
              <option value="B" ${rule.minIntentionLevel === 'B' ? 'selected' : ''}>B级及以上</option>
              <option value="C" ${rule.minIntentionLevel === 'C' ? 'selected' : ''}>C级及以上（全部）</option>
            </select>
          </div>
          <button class="btn btn-primary" onclick="saveNotificationRules()">保存设置</button>
        </div>
      `;
    }
  } catch (e) {
    document.getElementById('notification-rules').innerHTML = '<div class="empty-state">加载失败</div>';
  }
}

async function saveNotificationRules() {
  const channels = Array.from(document.querySelectorAll('.rule-channel:checked')).map(c => c.value);
  const updates = {
    enabled: document.getElementById('rule-enabled').checked,
    channels,
    webhookUrl: document.getElementById('rule-webhook').value,
    minIntentionLevel: document.getElementById('rule-min-level').value
  };

  try {
    const res = await fetch(API_BASE + '/notifications/rules/newLead', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (data.success) {
      alert('通知规则已保存');
    }
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

// ===== API Key 管理功能 =====

async function loadApiKeys() {
  try {
    const res = await fetch(API_BASE + '/auth/keys');
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('api-keys-list');
      if (data.data.keys.length === 0) {
        container.innerHTML = '<div class="empty-state">暂无 API Key</div>';
      } else {
        container.innerHTML = data.data.keys.map(key => `
          <div class="dsh-plugin-item">
            <div>
              <div class="dsh-plugin-name">${key.name}</div>
              <div class="dsh-plugin-version">Key: ${key.key} · 创建: ${formatDate(key.createdAt)} · 调用次数: ${key.usageCount}</div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <span class="dsh-status-badge" style="${key.status === 'active' ? 'background:#dcfce7;color:#16a34a;' : 'background:#fee2e2;color:#dc2626;'}">${key.status === 'active' ? '启用' : '已撤销'}</span>
              ${key.status === 'active' ? `<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;" onclick="revokeApiKey('${key.id}')">撤销</button>` : ''}
            </div>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    document.getElementById('api-keys-list').innerHTML = '<div class="empty-state">加载失败</div>';
  }
}

async function generateApiKey() {
  const name = document.getElementById('new-key-name').value;
  if (!name) { alert('请输入 API Key 名称'); return; }

  try {
    const res = await fetch(API_BASE + '/auth/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (data.success) {
      alert('API Key 生成成功！\n\n请立即复制保存，关闭后无法再次查看完整 Key：\n\n' + data.data.key);
      document.getElementById('new-key-name').value = '';
      loadApiKeys();
    }
  } catch (e) {
    alert('生成失败: ' + e.message);
  }
}

async function revokeApiKey(id) {
  if (!confirm('确定要撤销这个 API Key 吗？撤销后无法恢复。')) return;

  try {
    const res = await fetch(API_BASE + '/auth/keys/' + id, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      alert('API Key 已撤销');
      loadApiKeys();
    }
  } catch (e) {
    alert('撤销失败: ' + e.message);
  }
}

// ===== 数据导出功能 =====

function exportLeads() {
  const intention = document.getElementById('filter-intention').value;
  const status = document.getElementById('filter-status').value;

  let url = API_BASE + '/export/leads?';
  const params = [];
  if (intention) params.push('intentionLevel=' + intention);
  if (status) params.push('status=' + status);
  url += params.join('&');

  // 触发下载
  window.open(url, '_blank');
}

function exportStats() {
  window.open(API_BASE + '/export/stats', '_blank');
}

// ===== 工具函数 =====

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  return formatDate(dateStr) + ' ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
}

function getStatusText(status) {
  const map = { new: '新线索', following: '跟进中', interested: '有意向', converted: '已转化', lost: '已流失' };
  return map[status] || status;
}

// 点击弹窗外部关闭
document.getElementById('lead-modal').addEventListener('click', (e) => {
  if (e.target.id === 'lead-modal') closeLeadModal();
});
