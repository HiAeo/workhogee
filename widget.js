/**
 * WorkHogee AI 获客伙计 - 可嵌入网站对话组件（主动介入版）
 *
 * 功能特性：
 * 1. 机器人头图标（SVG动画：眨眼、说话、跟随鼠标）
 * 2. 30秒后启动鼠标跟随（平滑跟随）
 * 3. 主动弹出引导对话框（定时触发）
 * 4. 完整的对话功能（与后端API对接）
 *
 * 使用方法：
 * 1. 在网站中引入此脚本：<script src="https://www.workhogee.com/widget.js"></script>
 * 2. 配置 API 地址（可选，默认自动检测）：
 *    <script>
 *      window.WORKHOGEE_CONFIG = {
 *        apiUrl: 'https://api.workhogee.com',
 *        primaryColor: '#ea580c'
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
    showConnectionStatus: true,
    // 主动交互配置
    mouseFollowDelay: 30000,      // 30秒后启动鼠标跟随
    mouseFollowEnabled: true,       // 是否启用鼠标跟随
    proactiveMessages: [             // 主动弹窗消息列表
      '您好！有什么我可以帮您的吗？',
      '想了解 AI 如何帮您自动获客吗？问我吧！',
      '停留这么久，一定有问题想了解吧？随时问我~',
      '我是您的 AI 获客顾问，24小时在线，有问题随时问！',
      '需要了解产品功能、价格或使用方法吗？我可以为您解答~'
    ],
    proactiveInterval: 45000,       // 主动弹窗间隔（45秒）
    proactiveMaxCount: 3             // 最多主动弹窗次数
  };

  // ===== 状态 =====
  let state = {
    conversationId: null,
    isOpen: false,
    isLoading: false,
    isConnected: false,
    messages: [],
    retryCount: 0,
    maxRetries: 3,
    // 主动交互状态
    mouseFollowActive: false,
    mouseX: 0,
    mouseY: 0,
    buttonX: 0,
    buttonY: 0,
    proactiveCount: 0,
    proactiveTimer: null,
    followTimer: null,
    isDragging: false,
    // 动画状态
    blinkTimer: null,
    talkTimer: null
  };

  // ===== DOM 元素 =====
  let widgetButton = null;
  let widgetPanel = null;
  let messagesContainer = null;
  let inputField = null;
  let sendButton = null;
  let statusIndicator = null;
  let robotSvg = null;
  let proactiveBubble = null;

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

  /**
   * 生成机器人头 SVG
   */
  function createRobotSVG() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('width', '36');
    svg.setAttribute('height', '36');
    svg.setAttribute('class', 'workhogee-robot-svg');
    svg.innerHTML = `
      <!-- 天线 -->
      <line x1="32" y1="8" x2="32" y2="16" stroke="${CONFIG.primaryColor}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="32" cy="6" r="4" fill="${CONFIG.secondaryColor}" class="robot-antenna-dot"/>
      <!-- 头部 -->
      <rect x="12" y="16" width="40" height="36" rx="12" fill="${CONFIG.primaryColor}" class="robot-head"/>
      <!-- 耳朵 -->
      <rect x="8" y="28" width="4" height="12" rx="2" fill="${CONFIG.primaryDark}"/>
      <rect x="52" y="28" width="4" height="12" rx="2" fill="${CONFIG.primaryDark}"/>
      <!-- 眼睛白底 -->
      <circle cx="24" cy="32" r="5.5" fill="white"/>
      <circle cx="40" cy="32" r="5.5" fill="white"/>
      <!-- 瞳孔 -->
      <circle cx="24" cy="32" r="2.8" fill="${CONFIG.secondaryColor}" class="robot-pupil robot-pupil-left"/>
      <circle cx="40" cy="32" r="2.8" fill="${CONFIG.secondaryColor}" class="robot-pupil robot-pupil-right"/>
      <!-- 嘴巴 -->
      <rect x="25" y="43" width="14" height="4" rx="2" fill="white" class="robot-mouth"/>
      <!-- 脸颊高光 -->
      <circle cx="18" cy="40" r="2" fill="${CONFIG.primaryDark}" opacity="0.4"/>
      <circle cx="46" cy="40" r="2" fill="${CONFIG.primaryDark}" opacity="0.4"/>
    `;
    return svg;
  }

  // ===== 初始化 =====

  function init(options = {}) {
    Object.assign(CONFIG, options);
    if (!CONFIG.apiUrl) {
      CONFIG.apiUrl = detectApiUrl();
    }
    console.log('[WorkHogee] 初始化，API 地址:', CONFIG.apiUrl);

    createWidget();
    checkConnection();
    loadConversation();
    startProactiveInteraction();
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
        width: 60px;
        height: 60px;
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
        will-change: transform, left, top, bottom, right;
      }
      .workhogee-widget-button:hover {
        transform: scale(1.12);
        box-shadow: 0 6px 24px rgba(234, 88, 12, 0.55);
      }
      .workhogee-widget-button.following {
        transition: left 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                    top 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                    transform 0.2s ease,
                    box-shadow 0.2s ease;
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
      .workhogee-robot-svg {
        animation: workhogee-robot-breathe 3s ease-in-out infinite;
      }
      @keyframes workhogee-robot-breathe {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      .robot-pupil {
        transition: cx 0.15s ease, cy 0.15s ease;
      }
      .robot-mouth {
        transition: height 0.1s ease, y 0.1s ease;
      }
      .robot-mouth.talking {
        animation: workhogee-talk 0.3s ease-in-out infinite;
      }
      @keyframes workhogee-talk {
        0%, 100% { height: 4px; y: 43px; }
        50% { height: 7px; y: 41.5px; }
      }
      .robot-antenna-dot {
        animation: workhogee-antenna-pulse 2s ease-in-out infinite;
      }
      @keyframes workhogee-antenna-pulse {
        0%, 100% { opacity: 1; r: 4; }
        50% { opacity: 0.6; r: 5; }
      }

      /* 主动弹窗气泡 */
      .workhogee-proactive-bubble {
        position: fixed;
        bottom: 96px;
        right: 24px;
        max-width: 260px;
        background: white;
        border-radius: 16px;
        border-bottom-right-radius: 4px;
        padding: 14px 18px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
        z-index: 9998;
        display: none;
        animation: workhogee-bubble-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        cursor: pointer;
      }
      .workhogee-proactive-bubble.show {
        display: block;
      }
      .workhogee-proactive-bubble .bubble-text {
        font-size: 14px;
        color: ${CONFIG.secondaryColor};
        line-height: 1.5;
        margin: 0;
      }
      .workhogee-proactive-bubble .bubble-close {
        position: absolute;
        top: 6px;
        right: 10px;
        background: none;
        border: none;
        color: #94a3b8;
        font-size: 16px;
        cursor: pointer;
        padding: 2px 6px;
        line-height: 1;
        opacity: 0;
        transition: opacity 0.2s;
      }
      .workhogee-proactive-bubble:hover .bubble-close {
        opacity: 1;
      }
      .workhogee-proactive-bubble::after {
        content: '';
        position: absolute;
        bottom: -8px;
        right: 20px;
        width: 0;
        height: 0;
        border-left: 8px solid transparent;
        border-right: 8px solid transparent;
        border-top: 8px solid white;
      }
      @keyframes workhogee-bubble-in {
        from { opacity: 0; transform: translateY(10px) scale(0.9); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes workhogee-bubble-out {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to { opacity: 0; transform: translateY(10px) scale(0.9); }
      }

      /* 对话面板 */
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
      .workhogee-widget-header .header-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .workhogee-widget-header .header-robot {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(255,255,255,0.15);
        display: flex;
        align-items: center;
        justify-content: center;
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
      }
      .workhogee-message.assistant .avatar {
        background: ${CONFIG.primaryColor};
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
        .workhogee-proactive-bubble {
          max-width: 220px;
          right: 16px;
        }
      }
    `;
    document.head.appendChild(style);

    // 创建浮动按钮（机器人头）
    widgetButton = document.createElement('button');
    widgetButton.className = 'workhogee-widget-button';
    widgetButton.title = CONFIG.buttonText;
    widgetButton.setAttribute('aria-label', CONFIG.buttonText);

    // 创建机器人 SVG
    robotSvg = createRobotSVG();
    widgetButton.appendChild(robotSvg);

    // 连接状态点
    const dot = document.createElement('span');
    dot.className = 'connection-dot';
    widgetButton.appendChild(dot);
    statusIndicator = dot;

    widgetButton.onclick = handleButtonClick;
    document.body.appendChild(widgetButton);

    // 创建主动弹窗气泡
    proactiveBubble = document.createElement('div');
    proactiveBubble.className = 'workhogee-proactive-bubble';
    proactiveBubble.innerHTML = `
      <button class="bubble-close" aria-label="关闭">×</button>
      <p class="bubble-text"></p>
    `;
    proactiveBubble.onclick = function(e) {
      if (e.target.classList.contains('bubble-close')) {
        hideProactiveBubble();
      } else {
        openWidget();
        hideProactiveBubble();
      }
    };
    document.body.appendChild(proactiveBubble);

    // 创建对话面板
    widgetPanel = document.createElement('div');
    widgetPanel.className = 'workhogee-widget-panel';
    widgetPanel.innerHTML = `
      <div class="workhogee-widget-header">
        <div class="header-left">
          <div class="header-robot">
            <svg viewBox="0 0 64 64" width="24" height="24">
              <rect x="12" y="16" width="40" height="36" rx="12" fill="white"/>
              <circle cx="24" cy="32" r="4" fill="${CONFIG.primaryColor}"/>
              <circle cx="40" cy="32" r="4" fill="${CONFIG.primaryColor}"/>
              <rect x="25" y="43" width="14" height="3" rx="1.5" fill="${CONFIG.primaryColor}"/>
            </svg>
          </div>
          <div>
            <div class="title">WorkHogee AI 获客伙计</div>
            <div class="subtitle"><span class="status-dot"></span><span id="workhogee-status-text">24小时在线 · 智能接待</span></div>
          </div>
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

    // 启动机器人动画
    startRobotAnimations();

    // 跟踪鼠标位置（用于瞳孔跟随）
    document.addEventListener('mousemove', handleMouseMove);
  }

  // ===== 机器人动画 =====

  function startRobotAnimations() {
    // 眨眼动画（随机间隔 3-6 秒）
    function blink() {
      const pupils = robotSvg.querySelectorAll('.robot-pupil');
      pupils.forEach(p => {
        p.setAttribute('ry', '0.3');
      });
      setTimeout(() => {
        pupils.forEach(p => {
          p.setAttribute('ry', '1');
        });
        setTimeout(blink, 3000 + Math.random() * 3000);
      }, 150);
    }
    setTimeout(blink, 2000);
  }

  function startTalkingAnimation() {
    const mouth = robotSvg.querySelector('.robot-mouth');
    if (mouth) {
      mouth.classList.add('talking');
    }
  }

  function stopTalkingAnimation() {
    const mouth = robotSvg.querySelector('.robot-mouth');
    if (mouth) {
      mouth.classList.remove('talking');
    }
  }

  // ===== 鼠标交互 =====

  function handleMouseMove(e) {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;

    // 瞳孔跟随鼠标（轻微移动）
    if (robotSvg) {
      const buttonRect = widgetButton.getBoundingClientRect();
      const centerX = buttonRect.left + buttonRect.width / 2;
      const centerY = buttonRect.top + buttonRect.height / 2;
      const dx = (state.mouseX - centerX) / window.innerWidth;
      const dy = (state.mouseY - centerY) / window.innerHeight;
      const moveX = Math.max(-1.5, Math.min(1.5, dx * 4));
      const moveY = Math.max(-1.5, Math.min(1.5, dy * 4));

      const leftPupil = robotSvg.querySelector('.robot-pupil-left');
      const rightPupil = robotSvg.querySelector('.robot-pupil-right');
      if (leftPupil) leftPupil.setAttribute('cx', 24 + moveX);
      if (rightPupil) rightPupil.setAttribute('cx', 40 + moveX);
      if (leftPupil) leftPupil.setAttribute('cy', 32 + moveY);
      if (rightPupil) rightPupil.setAttribute('cy', 32 + moveY);
    }
  }

  function handleButtonClick(e) {
    // 如果正在跟随鼠标，点击后停止跟随
    if (state.mouseFollowActive) {
      stopMouseFollow();
    }
    toggleWidget();
  }

  // ===== 主动交互 =====

  function startProactiveInteraction() {
    // 30秒后启动鼠标跟随
    state.followTimer = setTimeout(() => {
      if (CONFIG.mouseFollowEnabled && !state.isOpen) {
        startMouseFollow();
      }
    }, CONFIG.mouseFollowDelay);

    // 定时主动弹窗
    scheduleProactiveMessage();
  }

  function scheduleProactiveMessage() {
    if (state.proactiveCount >= CONFIG.proactiveMaxCount) return;

    state.proactiveTimer = setTimeout(() => {
      if (!state.isOpen && state.proactiveCount < CONFIG.proactiveMaxCount) {
        showProactiveMessage();
        scheduleProactiveMessage();
      }
    }, CONFIG.proactiveInterval);
  }

  function showProactiveMessage() {
    if (!proactiveBubble) return;

    const messages = CONFIG.proactiveMessages;
    const msg = messages[state.proactiveCount % messages.length];
    state.proactiveCount++;

    const textEl = proactiveBubble.querySelector('.bubble-text');
    if (textEl) textEl.textContent = msg;

    proactiveBubble.classList.add('show');

    // 机器人说话动画
    startTalkingAnimation();
    setTimeout(stopTalkingAnimation, 2000);

    // 8秒后自动隐藏
    setTimeout(() => {
      hideProactiveBubble();
    }, 8000);
  }

  function hideProactiveBubble() {
    if (!proactiveBubble) return;
    proactiveBubble.style.animation = 'workhogee-bubble-out 0.3s ease forwards';
    setTimeout(() => {
      proactiveBubble.classList.remove('show');
      proactiveBubble.style.animation = '';
    }, 300);
    stopTalkingAnimation();
  }

  // ===== 鼠标跟随 =====

  function startMouseFollow() {
    if (state.mouseFollowActive) return;
    state.mouseFollowActive = true;
    widgetButton.classList.add('following');

    // 初始位置
    const rect = widgetButton.getBoundingClientRect();
    state.buttonX = rect.left;
    state.buttonY = rect.top;

    // 平滑跟随动画
    function followLoop() {
      if (!state.mouseFollowActive || state.isOpen) return;

      // 目标位置（鼠标右下方偏移，避免完全遮挡鼠标）
      const targetX = state.mouseX + 20;
      const targetY = state.mouseY + 20;

      // 限制在视口内
      const maxX = window.innerWidth - 80;
      const maxY = window.innerHeight - 80;
      const clampedX = Math.max(10, Math.min(maxX, targetX));
      const clampedY = Math.max(10, Math.min(maxY, targetY));

      widgetButton.style.left = clampedX + 'px';
      widgetButton.style.top = clampedY + 'px';
      widgetButton.style.bottom = 'auto';
      widgetButton.style.right = 'auto';

      // 同步气泡位置
      if (proactiveBubble && proactiveBubble.classList.contains('show')) {
        proactiveBubble.style.left = (clampedX - 200) + 'px';
        proactiveBubble.style.top = (clampedY - 70) + 'px';
        proactiveBubble.style.bottom = 'auto';
        proactiveBubble.style.right = 'auto';
      }

      requestAnimationFrame(followLoop);
    }

    requestAnimationFrame(followLoop);
    console.log('[WorkHogee] 鼠标跟随已启动');
  }

  function stopMouseFollow() {
    state.mouseFollowActive = false;
    widgetButton.classList.remove('following');

    // 回到原位
    widgetButton.style.left = '';
    widgetButton.style.top = '';
    widgetButton.style.bottom = '24px';
    widgetButton.style.right = '24px';

    // 气泡回到原位
    if (proactiveBubble) {
      proactiveBubble.style.left = '';
      proactiveBubble.style.top = '';
      proactiveBubble.style.bottom = '96px';
      proactiveBubble.style.right = '24px';
    }

    console.log('[WorkHogee] 鼠标跟随已停止');
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
    hideProactiveBubble();
    stopMouseFollow();
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
      if (msg.role === 'assistant') {
        avatar.innerHTML = '<svg viewBox="0 0 64 64" width="18" height="18"><rect x="12" y="16" width="40" height="36" rx="12" fill="white"/><circle cx="24" cy="32" r="4" fill="' + CONFIG.primaryColor + '"/><circle cx="40" cy="32" r="4" fill="' + CONFIG.primaryColor + '"/></svg>';
      }

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
      <div class="avatar">
        <svg viewBox="0 0 64 64" width="18" height="18"><rect x="12" y="16" width="40" height="36" rx="12" fill="white"/><circle cx="24" cy="32" r="4" fill="${CONFIG.primaryColor}"/><circle cx="40" cy="32" r="4" fill="${CONFIG.primaryColor}"/></svg>
      </div>
      <div class="bubble"><div class="workhogee-typing"><span></span><span></span><span></span></div></div>
    `;
    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // 机器人说话动画
    startTalkingAnimation();
  }

  function hideTypingIndicator() {
    const indicator = document.getElementById('workhogee-typing-indicator');
    if (indicator) indicator.remove();
    stopTalkingAnimation();
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
      if (state.followTimer) clearTimeout(state.followTimer);
      if (state.proactiveTimer) clearTimeout(state.proactiveTimer);
      if (widgetButton) widgetButton.remove();
      if (widgetPanel) widgetPanel.remove();
      if (proactiveBubble) proactiveBubble.remove();
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
