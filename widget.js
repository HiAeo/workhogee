/**
 * WorkHogee AI 获客伙计 - 可嵌入网站对话组件
 *
 * 使用方法：
 * 1. 在网站中引入此脚本：<script src="https://www.workhogee.com/widget.js"></script>
 * 2. 配置 API 地址（可选，默认自动检测）：
 *    <script>
 *      window.WORKHOGEE_CONFIG = {
 *        apiUrl: 'https://api.workhogee.com',
 *        primaryColor: '#ea580c',
 *        welcomeMessage: '您好！我是 WorkHogee AI 获客伙计...'
 *      };
 *    </script>
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
    source: 'website',
    autoInit: true,
    showConnectionStatus: true
  };

  // 状态
  let state = {
    conversationId: null,
    isOpen: false,
    isLoading: false,
    isConnected: false,
    messages: [],
    retryCount: 0,
    maxRetries: 3
  };

  // DOM 元素
  let widgetButton = null;
  let widgetPanel = null;
  let messagesContainer = null;
  let inputField = null;
  let sendButton = null;
  let statusIndicator = null;

  /**
   * 自动检测 API 地址
   */
  function detectApiUrl() {
    // 1. 从 script 标签的 data-api-url 属性获取
    const scripts = document.querySelectorAll('script[src*="widget.js"]');
    for (let i = 0; i < scripts.length; i++) {
      const dataUrl = scripts[i].getAttribute('data-api-url');
      if (dataUrl) return dataUrl;
    }

    // 2. 从当前脚本的 src 推断（如果 widget.js 托管在 API 服务器上）
    if (document.currentScript && document.currentScript.src) {
      try {
        const url = new URL(document.currentScript.src);
        return url.origin;
      } catch (e) {}
    }

    // 3. 默认使用生产环境地址
    return 'https://api.workhogee.com';
  }

  /**
   * 初始化组件
   */
  function init(options = {}) {
    // 合并配置
    Object.assign(CONFIG, options);

    // 自动检测 API 地址
    if (!CONFIG.apiUrl) {
      CONFIG.apiUrl = detectApiUrl();
    }

    console.log('[WorkHogee] 初始化，API 地址:', CONFIG.apiUrl);

    createWidget();
    checkConnection();
    loadConversation();
  }

  /**
   * 检查 API 连接状态
   */
  async function checkConnection() {
    try {
      const res = await fetch(CONFIG.apiUrl + '/api/health', {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        state.isConnected = true;
        updateConnectionStatus(true);
        console.log('[WorkHogee] API 连接正常');
      } else {
        throw new Error('HTTP ' + res.status);
      }
    } catch (e) {
      state.isConnected = false;
      updateConnectionStatus(false);
      console.warn('[WorkHogee] API 连接失败:', e.message);
    }
  }

  /**
   * 更新连接状态显示
   */
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
      .workhogee-widget-button .connection-dot {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 12px;
        height: 12px;
        background: #22c55e;
        border-radius: 50%;
        border: 2px solid white;
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
        opacity: 0.8;
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
      }
      .workhogee-widget-header .close-btn {
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        opacity: 0.8;
        padding: 4px;
        line-height: 1;
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
        animation: workhogee-fadeIn 0.3s ease;
      }
      @keyframes workhogee-fadeIn {
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
        white-space: pre-wrap;
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
      .workhogee-message.error .bubble {
        background: #fef2f2;
        color: #dc2626;
        border: 1px solid #fecaca;
      }
      .workhogee-typing {
        display: flex;
        gap: 4px;
        padding: 4px 0;
      }
      .workhogee-typing span {
        width: 8px;
        height: 8px;
        background: #a8a29e;
        border-radius: 50%;
        animation: workhogee-typing 1.4s infinite;
      }
      .workhogee-typing span:nth-child(2) { animation-delay: 0.2s; }
      .workhogee-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes workhogee-typing {
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
      .workhogee-input:disabled {
        background: #f5f5f4;
        cursor: not-allowed;
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
      .workhogee-send-btn:hover:not(:disabled) {
        background: #c2410c;
      }
      .workhogee-send-btn:disabled {
        background: #d6d3d1;
        cursor: not-allowed;
      }
      .workhogee-reconnect {
        text-align: center;
        padding: 8px;
        background: #fef3c7;
        color: #92400e;
        font-size: 12px;
        display: none;
      }
      .workhogee-reconnect.show {
        display: block;
      }
      .workhogee-reconnect button {
        background: none;
        border: none;
        color: #92400e;
        text-decoration: underline;
        cursor: pointer;
        font-size: 12px;
        padding: 0;
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
        <input type="text" class="workhogee-input" id="workhogee-input" placeholder="输入您的问题..." autocomplete="off" />
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

    // 创建新对话
    await createNewConversation();
  }

  /**
   * 创建新对话
   */
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
        // 添加欢迎消息
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

  /**
   * 显示重连提示
   */
  function showReconnectBanner() {
    const banner = document.getElementById('workhogee-reconnect');
    if (banner) banner.classList.add('show');
  }

  /**
   * 隐藏重连提示
   */
  function hideReconnectBanner() {
    const banner = document.getElementById('workhogee-reconnect');
    if (banner) banner.classList.remove('show');
  }

  /**
   * 重新连接
   */
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

    // 检查连接状态
    if (!state.isConnected) {
      addMessage('error', '网络连接已断开，请检查网络后重试。');
      showReconnectBanner();
      return;
    }

    // 清空输入框
    inputField.value = '';

    // 添加用户消息
    addMessage('user', message);

    // 显示加载状态
    state.isLoading = true;
    sendButton.disabled = true;
    inputField.disabled = true;
    showTypingIndicator();

    try {
      const res = await fetch(CONFIG.apiUrl + '/api/conversations/' + state.conversationId + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await res.json();

      removeTypingIndicator();

      if (data.success && data.data) {
        const reply = data.data.reply || data.data.response || data.data.message;
        if (reply) {
          addMessage('assistant', reply);
        } else {
          addMessage('assistant', JSON.stringify(data.data));
        }
        state.retryCount = 0;
      } else {
        throw new Error(data.error || '发送失败');
      }
    } catch (e) {
      removeTypingIndicator();
      console.error('[WorkHogee] 发送消息失败:', e.message);

      // 重试机制
      if (state.retryCount < state.maxRetries) {
        state.retryCount++;
        addMessage('assistant', '消息发送失败，正在重试（第 ' + state.retryCount + '/' + state.maxRetries + '次）...');
        setTimeout(() => {
          state.isLoading = false;
          sendButton.disabled = false;
          inputField.disabled = false;
          // 自动重发
          inputField.value = message;
          sendMessage();
        }, 2000);
        return;
      }

      addMessage('error', '网络连接失败，请检查网络后重试。\n错误信息: ' + e.message);
      state.isConnected = false;
      updateConnectionStatus(false);
      showReconnectBanner();
    }

    state.isLoading = false;
    sendButton.disabled = false;
    inputField.disabled = false;
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
    if (!messagesContainer) return;
    messagesContainer.innerHTML = '';
    state.messages.forEach(function(msg) {
      const msgEl = document.createElement('div');
      msgEl.className = 'workhogee-message ' + msg.role;
      const bubble = document.createElement('div');
      bubble.className = 'bubble';
      bubble.textContent = msg.content;
      msgEl.appendChild(bubble);
      messagesContainer.appendChild(msgEl);
    });
    // 滚动到底部
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * 显示输入指示器
   */
  function showTypingIndicator() {
    if (!messagesContainer) return;
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

  // 暴露全局 API
  window.WorkHogeeWidget = {
    init: init,
    open: function() { if (!state.isOpen) toggleWidget(); },
    close: closeWidget,
    toggle: toggleWidget,
    reconnect: reconnect,
    getState: function() { return { ...state }; },
    getConversationId: function() { return state.conversationId; }
  };

  // 自动初始化（如果页面中有配置或设置了 autoInit）
  if (CONFIG.autoInit) {
    if (window.WORKHOGEE_CONFIG) {
      init(window.WORKHOGEE_CONFIG);
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        if (window.WORKHOGEE_CONFIG) {
          init(window.WORKHOGEE_CONFIG);
        } else {
          init();
        }
      });
    } else {
      init();
    }
  }
})();
