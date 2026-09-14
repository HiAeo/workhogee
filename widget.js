/**
 * WorkHogee AI 获客伙计 - 可嵌入网站对话组件（简洁版）
 *
 * 使用方法：
 * 1. 在网站中引入此脚本：<script src="https://www.workhogee.com/widget.js"></script>
 * 2. 配置 API 地址（可选，默认自动检测）：
 *    <script>
 *      window.WORKHOGEE_CONFIG = {
 *        apiUrl: 'https://api.workhogee.com'
 *      };
 *    </script>
 */

(function() {
  'use strict';

  // ===== 配置 =====
  const CONFIG = {
    apiUrl: '',
    position: 'bottom-right',
    primaryColor: '#ea580c',
    primaryDark: '#c2410c',
    secondaryColor: '#1c1917',
    welcomeMessage: '您好！我是 WorkHogee AI 获客伙计，很高兴为您服务。请问有什么可以帮到您的？',
    buttonText: 'WorkHogee AI 获客顾问',
    source: 'website',
    autoInit: true,
    showConnectionStatus: true
  };

  // ===== 状态 =====
  let state = {
    conversationId: null,
    isOpen: false,
    isLoading: false,
    isConnected: false,
    messages: [],
    retryCount: 0,
    maxRetries: 3
  };

  // ===== DOM 元素 =====
  let widgetButton = null;
  let widgetPanel = null;
  let messagesContainer = null;
  let inputField = null;
  let sendButton = null;
  let statusIndicator = null;

  // ===== 工具函数 =====

  /**
   * 自动检测 API 地址
   */
  function detectApiUrl() {
    const scripts = document.querySelectorAll('script[src*="widget.js"]');
    for (let i = 0; i < scripts.length; i++) {
      const dataUrl = scripts[i].getAttribute('data-api-url');
      if (dataUrl) return dataUrl;
    }
    if (document.currentScript && document.currentScript.src) {
      try {
        const url = new URL(document.currentScript.src);
        return url.origin;
      } catch (e) {}
    }
    return 'https://api.workhogee.com';
  }

  // ===== 初始化 =====

  function init(options = {}) {
    // 单例检查
    if (window.__workhogee_widget_initialized) {
      console.log('[WorkHogee] 已初始化，跳过重复创建');
      return;
    }
    window.__workhogee_widget_initialized = true;

    Object.assign(CONFIG, options);
    if (!CONFIG.apiUrl) {
      CONFIG.apiUrl = detectApiUrl();
    }
    console.log('[WorkHogee] 初始化，API 地址:', CONFIG.apiUrl);

    createWidget();
    checkConnection();
    loadConversation();
  }

  // ===== 连接状态 =====

  async function checkConnection() {
    try {
      const res = await fetch(CONFIG.apiUrl + '/api/health', {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        state.isConnected = true;
        updateConnectionStatus(true);
      } else {
        throw new Error('HTTP ' + res.status);
      }
    } catch (e) {
      state.isConnected = false;
      updateConnectionStatus(false);
      console.warn('[WorkHogee] API 连接失败:', e.message);
    }
  }

  function updateConnectionStatus(connected) {
    if (!statusIndicator) return;
    if (connected) {
      statusIndicator.style.background = '#22c55e';
      statusIndicator.title = '在线';
    } else {
      statusIndicator.style.background = '#ef4444';
      statusIndicator.title = '离线 - 消息可能无法发送';
    }
  }

  // ===== 创建组件 DOM =====

  function createWidget() {
    // 注入样式
    const style = document.createElement('style');
    style.textContent = `
      .workhogee-widget-button {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: ${CONFIG.primaryColor};
        color: white;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(234, 88, 12, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        font-size: 24px;
      }
      .workhogee-widget-button:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 24px rgba(234, 88, 12, 0.55);
      }
      .workhogee-widget-button .connection-dot {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 12px;
        height: 12px;
        background: #22c55e;
        border-radius: 50%;
        border: 2px solid white;
        z-index: 2;
      }

      /* 对话面板 */
      .workhogee-widget-panel {
        position: fixed;
        bottom: 92px;
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
        animation: workhogee-slideUp 0.3s ease;
      }
      .workhogee-widget-panel.open {
        display: flex;
      }
      @keyframes workhogee-slideUp {
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
        opacity: 0.85;
        margin-top: 2px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .workhogee-widget-header .status-dot {
        width: 8px;
        height: 8px;
        background: #22c55e;
        border-radius: 50%;
        display: inline-block;
        animation: workhogee-status-pulse 2s infinite;
      }
      @keyframes workhogee-status-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      .workhogee-widget-header .close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 22px;
        cursor: pointer;
        opacity: 0.8;
        padding: 4px 8px;
        line-height: 1;
        border-radius: 6px;
      }
      .workhogee-widget-header .close-btn:hover {
        opacity: 1;
        background: rgba(255,255,255,0.1);
      }
      .workhogee-reconnect {
        display: none;
        background: #fef3c7;
        color: #92400e;
        padding: 8px 16px;
        font-size: 13px;
        text-align: center;
      }
      .workhogee-reconnect.show {
        display: block;
      }
      .workhogee-reconnect button {
        background: none;
        border: none;
        color: ${CONFIG.primaryColor};
        text-decoration: underline;
        cursor: pointer;
        font-size: 13px;
        padding: 0;
      }
      .workhogee-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        background: #fafaf9;
      }
      .workhogee-message {
        margin-bottom: 14px;
        display: flex;
        animation: workhogee-fadeIn 0.3s ease;
      }
      @keyframes workhogee-fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .workhogee-message.user {
        justify-content: flex-end;
      }
      .workhogee-message .avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin: 0 8px;
        font-size: 14px;
      }
      .workhogee-message.assistant .avatar {
        background: ${CONFIG.primaryColor};
        color: white;
        order: 0;
      }
      .workhogee-message.user .avatar {
        background: #e7e5e4;
        order: 1;
      }
      .workhogee-message .bubble {
        max-width: 75%;
        padding: 10px 14px;
        border-radius: 14px;
        font-size: 14px;
        line-height: 1.5;
        word-wrap: break-word;
      }
      .workhogee-message.assistant .bubble {
        background: white;
        color: ${CONFIG.secondaryColor};
        border-bottom-left-radius: 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .workhogee-message.user .bubble {
        background: ${CONFIG.primaryColor};
        color: white;
        border-bottom-right-radius: 4px;
      }
      .workhogee-message.error .bubble {
        background: #fef2f2;
        color: #991b1b;
        border: 1px solid #fecaca;
      }
      .workhogee-typing {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 0;
      }
      .workhogee-typing span {
        width: 8px;
        height: 8px;
        background: #a8a29e;
        border-radius: 50%;
        animation: workhogee-typing-bounce 1.4s infinite;
      }
      .workhogee-typing span:nth-child(2) { animation-delay: 0.2s; }
      .workhogee-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes workhogee-typing-bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-6px); }
      }
      .workhogee-input-area {
        display: flex;
        padding: 12px 16px;
        background: white;
        border-top: 1px solid #e7e5e4;
        gap: 8px;
      }
      .workhogee-input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid #d6d3d1;
        border-radius: 10px;
        font-size: 14px;
        outline: none;
        transition: border-color 0.2s;
      }
      .workhogee-input:focus {
        border-color: ${CONFIG.primaryColor};
        box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.1);
      }
      .workhogee-send-btn {
        padding: 10px 18px;
        background: ${CONFIG.primaryColor};
        color: white;
        border: none;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s, transform 0.1s;
      }
      .workhogee-send-btn:hover {
        background: ${CONFIG.primaryDark};
      }
      .workhogee-send-btn:active {
        transform: scale(0.97);
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
    widgetButton.innerHTML = '💬<span class="connection-dot"></span>';
    widgetButton.title = CONFIG.buttonText;
    widgetButton.setAttribute('aria-label', CONFIG.buttonText);
    widgetButton.onclick = toggleWidget;
    document.body.appendChild(widgetButton);
    statusIndicator = widgetButton.querySelector('.connection-dot');

    // 创建对话面板
    widgetPanel = document.createElement('div');
    widgetPanel.className = 'workhogee-widget-panel';
    widgetPanel.innerHTML = `
      <div class="workhogee-widget-header">
        <div>
          <div class="title">WorkHogee AI 获客伙计</div>
          <div class="subtitle"><span class="status-dot"></span><span id="workhogee-status-text">24小时在线 · 智能接待</span></div>
        </div>
        <button class="close-btn" aria-label="关闭">×</button>
      </div>
      <div class="workhogee-reconnect" id="workhogee-reconnect">
        连接已断开，<button onclick="WorkHogeeWidget.reconnect()">点击重连</button>
      </div>
      <div class="workhogee-messages" id="workhogee-messages"></div>
      <div class="workhogee-input-area">
        <input type="text" class="workhogee-input" id="workhogee-input" placeholder="输入您的问题，按回车发送..." autocomplete="off" />
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
    widgetPanel.querySelector('.close-btn').onclick = closeWidget;
    inputField.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') sendMessage();
    });
  }

  // ===== 对话功能 =====

  async function loadConversation() {
    const savedId = localStorage.getItem('workhogee_conversation_id');
    if (savedId) {
      state.conversationId = savedId;
      try {
        const res = await fetch(CONFIG.apiUrl + '/api/conversations/' + savedId);
        const data = await res.json();
        if (data.success && data.data && data.data.messages) {
          state.messages = data.data.messages.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: m.createdAt || new Date().toISOString()
          }));
          renderMessages();
          return;
        }
      } catch (e) {
        console.warn('[WorkHogee] 加载历史对话失败，创建新对话:', e.message);
      }
    }
    await createNewConversation();
  }

  async function createNewConversation() {
    try {
      const res = await fetch(CONFIG.apiUrl + '/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: CONFIG.source })
      });
      const data = await res.json();
      if (data.success && data.data) {
        state.conversationId = data.data.conversationId;
        localStorage.setItem('workhogee_conversation_id', state.conversationId);
        const welcomeMsg = data.data.welcomeMessage || CONFIG.welcomeMessage;
        addMessage('assistant', welcomeMsg);
      } else {
        throw new Error(data.error || '创建对话失败');
      }
    } catch (e) {
      console.error('[WorkHogee] 创建对话失败:', e.message);
      addMessage('error', '抱歉，服务暂时不可用，请稍后再试。\n错误信息: ' + e.message);
      showReconnectBanner();
    }
  }

  function showReconnectBanner() {
    const banner = document.getElementById('workhogee-reconnect');
    if (banner) banner.classList.add('show');
  }

  function hideReconnectBanner() {
    const banner = document.getElementById('workhogee-reconnect');
    if (banner) banner.classList.remove('show');
  }

  async function reconnect() {
    hideReconnectBanner();
    state.retryCount = 0;
    await checkConnection();
    if (state.isConnected) {
      await createNewConversation();
    } else {
      showReconnectBanner();
    }
  }

  function toggleWidget() {
    if (state.isOpen) {
      closeWidget();
    } else {
      openWidget();
    }
  }

  function openWidget() {
    if (!widgetPanel) return;
    state.isOpen = true;
    widgetPanel.classList.add('open');
    setTimeout(() => {
      if (inputField) inputField.focus();
    }, 300);
  }

  function closeWidget() {
    if (!widgetPanel) return;
    state.isOpen = false;
    widgetPanel.classList.remove('open');
  }

  function addMessage(role, content) {
    state.messages.push({ role, content, timestamp: new Date().toISOString() });
    renderMessages();
  }

  function renderMessages() {
    if (!messagesContainer) return;
    messagesContainer.innerHTML = '';

    state.messages.forEach(msg => {
      const msgEl = document.createElement('div');
      msgEl.className = 'workhogee-message ' + msg.role;

      const avatar = document.createElement('div');
      avatar.className = 'avatar';
      avatar.textContent = msg.role === 'assistant' ? '🤖' : '👤';

      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = msg.content;

      if (msg.role === 'user') {
        msgEl.appendChild(bubble);
        msgEl.appendChild(avatar);
      } else {
        msgEl.appendChild(avatar);
        msgEl.appendChild(bubble);
      }

      messagesContainer.appendChild(msgEl);
    });

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function showTypingIndicator() {
    if (!messagesContainer) return;
    const typingEl = document.createElement('div');
    typingEl.className = 'workhogee-message assistant';
    typingEl.id = 'workhogee-typing-indicator';
    typingEl.innerHTML = `
      <div class="avatar">🤖</div>
      <div class="bubble"><div class="workhogee-typing"><span></span><span></span><span></span></div></div>
    `;
    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function hideTypingIndicator() {
    const indicator = document.getElementById('workhogee-typing-indicator');
    if (indicator) indicator.remove();
  }

  async function sendMessage() {
    const text = inputField.value.trim();
    if (!text || state.isLoading) return;

    inputField.value = '';
    state.isLoading = true;
    sendButton.disabled = true;

    addMessage('user', text);
    showTypingIndicator();

    try {
      const res = await fetch(CONFIG.apiUrl + '/api/conversations/' + state.conversationId + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text })
      });
      const data = await res.json();

      hideTypingIndicator();

      if (data.success && data.data) {
        addMessage('assistant', data.data.reply || data.data.content || '抱歉，我没有理解您的问题。');
      } else {
        throw new Error(data.error || '发送失败');
      }
    } catch (e) {
      hideTypingIndicator();
      console.error('[WorkHogee] 发送消息失败:', e.message);
      addMessage('error', '发送失败: ' + e.message + '\n请检查网络连接或稍后重试。');
    } finally {
      state.isLoading = false;
      sendButton.disabled = false;
      if (inputField) inputField.focus();
    }
  }

  // ===== 暴露全局 API =====
  window.WorkHogeeWidget = {
    init: init,
    open: openWidget,
    close: closeWidget,
    reconnect: reconnect,
    destroy: function() {
      if (widgetButton) widgetButton.remove();
      if (widgetPanel) widgetPanel.remove();
      window.__workhogee_widget_initialized = false;
    }
  };

  // ===== 自动初始化 =====
  if (CONFIG.autoInit) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        init(window.WORKHOGEE_CONFIG || {});
      });
    } else {
      init(window.WORKHOGEE_CONFIG || {});
    }
  }

})();
