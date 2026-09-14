/**
 * WorkHogee AI 获客伙计 - 可嵌入网站对话组件
 * 
 * 使用方法：
 * 1. 在网站中引入此脚本：<script src="https://your-domain.com/widget.js"></script>
 * 2. 配置 API 地址：WorkHogeeWidget.init({ apiUrl: 'http://localhost:3000' })
 * 3. 页面右下角会出现对话浮窗，访客可直接与 AI 获客伙计对话
 */

(function() {
  'use strict';

  // 配置
  const CONFIG = {
    apiUrl: '',
    position: 'bottom-right',
    primaryColor: '#ea580c',
    secondaryColor: '#1c1917',
    welcomeMessage: '您好！我是 WorkHogee AI 获客伙计，很高兴为您服务。请问有什么可以帮到您的？',
    buttonText: 'AI 获客顾问',
    source: 'website'
  };

  // 状态
  let state = {
    conversationId: null,
    isOpen: false,
    isLoading: false,
    messages: []
  };

  // DOM 元素
  let widgetButton = null;
  let widgetPanel = null;
  let messagesContainer = null;
  let inputField = null;
  let sendButton = null;

  /**
   * 初始化组件
   */
  function init(options = {}) {
    // 合并配置
    Object.assign(CONFIG, options);

    if (!CONFIG.apiUrl) {
      console.error('WorkHogeeWidget: apiUrl is required');
      return;
    }

    createWidget();
    loadConversation();
  }

  /**
   * 创建组件 DOM
   */
  function createWidget() {
    // 注入样式
    const style = document.createElement('style');
    style.textContent = `
      .workhogee-widget-button {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: ${CONFIG.primaryColor};
        color: white;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 12px rgba(234, 88, 12, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        z-index: 9999;
        transition: all 0.3s ease;
      }
      .workhogee-widget-button:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 20px rgba(234, 88, 12, 0.5);
      }
      .workhogee-widget-button .badge {
        position: absolute;
        top: -4px;
        right: -4px;
        width: 20px;
        height: 20px;
        background: #ef4444;
        border-radius: 50%;
        font-size: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
      }
      .workhogee-widget-panel {
        position: fixed;
        bottom: 96px;
        right: 24px;
        width: 380px;
        height: 520px;
        background: white;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
        display: none;
        flex-direction: column;
        z-index: 9999;
        overflow: hidden;
        animation: slideUp 0.3s ease;
      }
      .workhogee-widget-panel.open {
        display: flex;
      }
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .workhogee-widget-header {
        background: linear-gradient(135deg, ${CONFIG.primaryColor}, ${CONFIG.secondaryColor});
        color: white;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .workhogee-widget-header .title {
        font-weight: 600;
        font-size: 16px;
      }
      .workhogee-widget-header .subtitle {
        font-size: 12px;
        opacity: 0.8;
        margin-top: 2px;
      }
      .workhogee-widget-header .close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        opacity: 0.8;
        padding: 4px;
      }
      .workhogee-widget-header .close-btn:hover {
        opacity: 1;
      }
      .workhogee-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        background: #fafaf9;
      }
      .workhogee-message {
        margin-bottom: 12px;
        display: flex;
        animation: fadeIn 0.3s ease;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .workhogee-message.user {
        justify-content: flex-end;
      }
      .workhogee-message .bubble {
        max-width: 80%;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 14px;
        line-height: 1.5;
        word-wrap: break-word;
      }
      .workhogee-message.assistant .bubble {
        background: white;
        color: #1c1917;
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }
      .workhogee-message.user .bubble {
        background: ${CONFIG.primaryColor};
        color: white;
        border-bottom-right-radius: 4px;
      }
      .workhogee-typing {
        display: flex;
        gap: 4px;
        padding: 10px 14px;
      }
      .workhogee-typing span {
        width: 8px;
        height: 8px;
        background: #a8a29e;
        border-radius: 50%;
        animation: typing 1.4s infinite;
      }
      .workhogee-typing span:nth-child(2) { animation-delay: 0.2s; }
      .workhogee-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typing {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-8px); }
      }
      .workhogee-input-area {
        padding: 12px 16px;
        background: white;
        border-top: 1px solid #e7e5e4;
        display: flex;
        gap: 8px;
      }
      .workhogee-input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid #d6d3d1;
        border-radius: 8px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }
      .workhogee-input:focus {
        border-color: ${CONFIG.primaryColor};
      }
      .workhogee-send-btn {
        padding: 10px 16px;
        background: ${CONFIG.primaryColor};
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background 0.2s;
      }
      .workhogee-send-btn:hover {
        background: #c2410c;
      }
      .workhogee-send-btn:disabled {
        background: #d6d3d1;
        cursor: not-allowed;
      }
      @media (max-width: 480px) {
        .workhogee-widget-panel {
          width: calc(100vw - 32px);
          right: 16px;
          height: 70vh;
        }
      }
    `;
    document.head.appendChild(style);

    // 创建浮动按钮
    widgetButton = document.createElement('button');
    widgetButton.className = 'workhogee-widget-button';
    widgetButton.innerHTML = '💬';
    widgetButton.title = CONFIG.buttonText;
    widgetButton.onclick = toggleWidget;
    document.body.appendChild(widgetButton);

    // 创建对话面板
    widgetPanel = document.createElement('div');
    widgetPanel.className = 'workhogee-widget-panel';
    widgetPanel.innerHTML = `
      <div class="workhogee-widget-header">
        <div>
          <div class="title">WorkHogee AI 获客伙计</div>
          <div class="subtitle">24小时在线 · 智能接待</div>
        </div>
        <button class="close-btn" onclick="WorkHogeeWidget.close()">×</button>
      </div>
      <div class="workhogee-messages" id="workhogee-messages"></div>
      <div class="workhogee-input-area">
        <input type="text" class="workhogee-input" id="workhogee-input" placeholder="输入您的问题..." />
        <button class="workhogee-send-btn" id="workhogee-send">发送</button>
      </div>
    `;
    document.body.appendChild(widgetPanel);

    // 获取 DOM 引用
    messagesContainer = document.getElementById('workhogee-messages');
    inputField = document.getElementById('workhogee-input');
    sendButton = document.getElementById('workhogee-send');

    // 绑定事件
    sendButton.onclick = sendMessage;
    inputField.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') sendMessage();
    });
  }

  /**
   * 加载或创建对话
   */
  async function loadConversation() {
    // 从 localStorage 恢复对话
    const savedId = localStorage.getItem('workhogee_conversation_id');
    if (savedId) {
      state.conversationId = savedId;
      // 加载历史消息
      try {
        const res = await fetch(CONFIG.apiUrl + '/api/conversations/' + savedId);
        const data = await res.json();
        if (data.success) {
          state.messages = data.data.messages || [];
          renderMessages();
          return;
        }
      } catch (e) {
        console.error('Failed to load conversation:', e);
      }
    }

    // 创建新对话
    try {
      const res = await fetch(CONFIG.apiUrl + '/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: CONFIG.source })
      });
      const data = await res.json();
      if (data.success) {
        state.conversationId = data.data.conversationId;
        localStorage.setItem('workhogee_conversation_id', state.conversationId);
        // 添加欢迎消息
        addMessage('assistant', CONFIG.welcomeMessage);
      }
    } catch (e) {
      console.error('Failed to create conversation:', e);
      addMessage('assistant', '抱歉，服务暂时不可用，请稍后再试。');
    }
  }

  /**
   * 切换面板显示
   */
  function toggleWidget() {
    state.isOpen = !state.isOpen;
    if (state.isOpen) {
      widgetPanel.classList.add('open');
      widgetButton.style.display = 'none';
      inputField.focus();
    } else {
      widgetPanel.classList.remove('open');
      widgetButton.style.display = 'flex';
    }
  }

  /**
   * 关闭面板
   */
  function closeWidget() {
    state.isOpen = false;
    widgetPanel.classList.remove('open');
    widgetButton.style.display = 'flex';
  }

  /**
   * 发送消息
   */
  async function sendMessage() {
    const message = inputField.value.trim();
    if (!message || state.isLoading) return;

    // 清空输入框
    inputField.value = '';

    // 添加用户消息
    addMessage('user', message);

    // 显示加载状态
    state.isLoading = true;
    sendButton.disabled = true;
    showTypingIndicator();

    try {
      const res = await fetch(CONFIG.apiUrl + '/api/conversations/' + state.conversationId + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await res.json();

      removeTypingIndicator();

      if (data.success) {
        addMessage('assistant', data.data.reply);
      } else {
        addMessage('assistant', '抱歉，我遇到了一些问题，请稍后再试。');
      }
    } catch (e) {
      removeTypingIndicator();
      addMessage('assistant', '网络连接失败，请检查网络后重试。');
    }

    state.isLoading = false;
    sendButton.disabled = false;
  }

  /**
   * 添加消息到界面
   */
  function addMessage(role, content) {
    state.messages.push({ role, content, timestamp: new Date().toISOString() });
    renderMessages();
  }

  /**
   * 渲染所有消息
   */
  function renderMessages() {
    messagesContainer.innerHTML = '';
    state.messages.forEach(function(msg) {
      const msgEl = document.createElement('div');
      msgEl.className = 'workhogee-message ' + msg.role;
      msgEl.innerHTML = '<div class="bubble">' + escapeHtml(msg.content) + '</div>';
      messagesContainer.appendChild(msgEl);
    });
    // 滚动到底部
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * 显示输入指示器
   */
  function showTypingIndicator() {
    const typingEl = document.createElement('div');
    typingEl.className = 'workhogee-message assistant';
    typingEl.id = 'workhogee-typing';
    typingEl.innerHTML = '<div class="bubble"><div class="workhogee-typing"><span></span><span></span><span></span></div></div>';
    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * 移除输入指示器
   */
  function removeTypingIndicator() {
    const typingEl = document.getElementById('workhogee-typing');
    if (typingEl) typingEl.remove();
  }

  /**
   * HTML 转义
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 暴露全局 API
  window.WorkHogeeWidget = {
    init: init,
    open: function() { if (!state.isOpen) toggleWidget(); },
    close: closeWidget,
    toggle: toggleWidget
  };

  // 自动初始化（如果页面中有配置）
  if (window.WORKHOGEE_CONFIG) {
    init(window.WORKHOGEE_CONFIG);
  }
})();
