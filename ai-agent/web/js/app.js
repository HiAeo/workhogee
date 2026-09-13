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
