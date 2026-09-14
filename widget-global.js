/**
 * WorkHogee Global Widget - 出海专版海外官网对话组件
 *
 * 嵌入方式：
 * <script src="https://www.workhogee.com/widget-global.js"
 *         data-api-url="https://api.workhogee.com"
 *         data-language="auto"
 *         data-primary-color="#ea580c"
 *         data-widget-title="Customer Support"></script>
 *
 * 特性：
 *  - 8 语言自动切换（en/es/fr/de/ja/ko/pt/ar）
 *  - 阿拉伯语自动 RTL 布局
 *  - Cookie 同意横幅合规
 *  - 离线消息队列与自动重发
 *  - 访客信息结构化收集
 *  - 意向等级标签展示
 *  - 纯原生 JS，无外部依赖，所有 CSS/SVG 内联
 */

(function () {
  'use strict';

  // ========================================================================
  // 1. 多语言 UI 文案字典（8 种语言）
  // ========================================================================
  var I18N = {
    en: {
      send: 'Send',
      placeholder: 'Type your message...',
      headerTitle: 'Customer Support',
      headerSubtitle: 'We reply typically in minutes',
      close: 'Close chat',
      online: 'Online now',
      offline: 'Offline',
      typing: 'Typing...',
      welcomeFallback: "Hi! I'm the WorkHogee assistant. How can I help you today?",
      errorSend: 'Sorry, failed to send. Please try again.',
      offlineMode: 'Offline mode — messages will be sent when connection is restored',
      reconnected: 'Reconnected',
      reconnecting: 'Reconnecting...',
      retryNow: 'Retry now',
      cookieTitle: 'We value your privacy',
      cookieDesc: 'We use cookies to enhance your browsing experience and analyze our traffic.',
      cookieAccept: 'Accept All',
      cookieReject: 'Reject All',
      cookiePrivacy: 'Privacy Policy',
      infoTitle: 'Before we continue',
      infoDesc: 'Please share your details so our team can assist you better.',
      infoName: 'Full name',
      infoEmail: 'Email address',
      infoCompany: 'Company',
      infoCountry: 'Country',
      infoSubmit: 'Submit',
      infoCancel: 'Skip',
      infoCollapse: 'Lead info',
      infoDone: 'Thanks! Your details are saved.',
      highIntent: 'High Intent Lead',
      statusNew: 'New',
      statusInProgress: 'In Progress',
      statusQualified: 'Qualified',
      statusConverted: 'Converted',
      loadingHistory: 'Loading conversation...',
      privacyNote: 'Conversations are encrypted and private.'
    },
    es: {
      send: 'Enviar',
      placeholder: 'Escribe tu mensaje...',
      headerTitle: 'Soporte al cliente',
      headerSubtitle: 'Respondemos en minutos',
      close: 'Cerrar chat',
      online: 'En línea',
      offline: 'Desconectado',
      typing: 'Escribiendo...',
      welcomeFallback: "¡Hola! Soy el asistente de WorkHogee. ¿En qué puedo ayudarte?",
      errorSend: 'Error al enviar. Inténtalo de nuevo.',
      offlineMode: 'Modo sin conexión — los mensajes se enviarán al restablecer la conexión',
      reconnected: 'Reconectado',
      reconnecting: 'Reconectando...',
      retryNow: 'Reintentar ahora',
      cookieTitle: 'Valoramos tu privacidad',
      cookieDesc: 'Usamos cookies para mejorar tu experiencia y analizar nuestro tráfico.',
      cookieAccept: 'Aceptar todo',
      cookieReject: 'Rechazar todo',
      cookiePrivacy: 'Política de privacidad',
      infoTitle: 'Antes de continuar',
      infoDesc: 'Comparte tus datos para que nuestro equipo pueda ayudarte mejor.',
      infoName: 'Nombre completo',
      infoEmail: 'Correo electrónico',
      infoCompany: 'Empresa',
      infoCountry: 'País',
      infoSubmit: 'Enviar',
      infoCancel: 'Omitir',
      infoCollapse: 'Datos de contacto',
      infoDone: '¡Gracias! Tus datos han sido guardados.',
      highIntent: 'Cliente de alto interés',
      statusNew: 'Nuevo',
      statusInProgress: 'En progreso',
      statusQualified: 'Calificado',
      statusConverted: 'Convertido',
      loadingHistory: 'Cargando conversación...',
      privacyNote: 'Las conversaciones están cifradas y son privadas.'
    },
    fr: {
      send: 'Envoyer',
      placeholder: 'Écrivez votre message...',
      headerTitle: 'Support client',
      headerSubtitle: 'Nous répondons en quelques minutes',
      close: 'Fermer le chat',
      online: 'En ligne',
      offline: 'Hors ligne',
      typing: 'Écriture...',
      welcomeFallback: "Bonjour ! Je suis l'assistant WorkHogee. Comment puis-je vous aider ?",
      errorSend: "Échec de l'envoi. Veuillez réessayer.",
      offlineMode: 'Mode hors ligne — les messages seront envoyés une fois la connexion rétablie',
      reconnected: 'Reconnecté',
      reconnecting: 'Reconnexion...',
      retryNow: 'Réessayer',
      cookieTitle: 'Nous respectons votre vie privée',
      cookieDesc: 'Nous utilisons des cookies pour améliorer votre expérience et analyser notre trafic.',
      cookieAccept: 'Tout accepter',
      cookieReject: 'Tout refuser',
      cookiePrivacy: 'Politique de confidentialité',
      infoTitle: 'Avant de continuer',
      infoDesc: 'Partagez vos coordonnées pour que notre équipe puisse mieux vous aider.',
      infoName: 'Nom complet',
      infoEmail: 'Adresse e-mail',
      infoCompany: 'Entreprise',
      infoCountry: 'Pays',
      infoSubmit: 'Envoyer',
      infoCancel: 'Ignorer',
      infoCollapse: 'Coordonnées',
      infoDone: 'Merci ! Vos informations ont été enregistrées.',
      highIntent: 'Lead à fort potentiel',
      statusNew: 'Nouveau',
      statusInProgress: 'En cours',
      statusQualified: 'Qualifié',
      statusConverted: 'Converti',
      loadingHistory: 'Chargement de la conversation...',
      privacyNote: 'Les conversations sont chiffrées et privées.'
    },
    de: {
      send: 'Senden',
      placeholder: 'Nachricht eingeben...',
      headerTitle: 'Kundensupport',
      headerSubtitle: 'Wir antworten in der Regel in Minuten',
      close: 'Chat schließen',
      online: 'Jetzt online',
      offline: 'Offline',
      typing: 'Tippt...',
      welcomeFallback: 'Hallo! Ich bin der WorkHogee-Assistent. Wie kann ich Ihnen helfen?',
      errorSend: 'Senden fehlgeschlagen. Bitte erneut versuchen.',
      offlineMode: 'Offline-Modus — Nachrichten werden gesendet, sobald die Verbindung wiederhergestellt ist',
      reconnected: 'Neu verbunden',
      reconnecting: 'Verbinde erneut...',
      retryNow: 'Jetzt erneut versuchen',
      cookieTitle: 'Wir schätzen Ihre Privatsphäre',
      cookieDesc: 'Wir verwenden Cookies, um Ihr Erlebnis zu verbessern und unseren Datenverkehr zu analysieren.',
      cookieAccept: 'Alle akzeptieren',
      cookieReject: 'Alle ablehnen',
      cookiePrivacy: 'Datenschutzrichtlinie',
      infoTitle: 'Bevor wir fortfahren',
      infoDesc: 'Bitte teilen Sie uns Ihre Details mit, damit unser Team Ihnen besser helfen kann.',
      infoName: 'Vollständiger Name',
      infoEmail: 'E-Mail-Adresse',
      infoCompany: 'Unternehmen',
      infoCountry: 'Land',
      infoSubmit: 'Absenden',
      infoCancel: 'Überspringen',
      infoCollapse: 'Kontaktdaten',
      infoDone: 'Danke! Ihre Daten wurden gespeichert.',
      highIntent: 'Lead mit hohem Interesse',
      statusNew: 'Neu',
      statusInProgress: 'In Bearbeitung',
      statusQualified: 'Qualifiziert',
      statusConverted: 'Konvertiert',
      loadingHistory: 'Konversation wird geladen...',
      privacyNote: 'Konversationen sind verschlüsselt und privat.'
    },
    ja: {
      send: '送信',
      placeholder: 'メッセージを入力...',
      headerTitle: 'カスタマーサポート',
      headerSubtitle: '通常数分で返信します',
      close: 'チャットを閉じる',
      online: 'オンライン',
      offline: 'オフライン',
      typing: '入力中...',
      welcomeFallback: 'こんにちは！WorkHogeeアシスタントです。ご用件をお聞かせください。',
      errorSend: '送信に失敗しました。もう一度お試しください。',
      offlineMode: 'オフラインモード — 接続が復旧したらメッセージを送信します',
      reconnected: '再接続しました',
      reconnecting: '再接続中...',
      retryNow: '今すぐ再試行',
      cookieTitle: 'プライバシーを重視しています',
      cookieDesc: '当サイトでは、利便性向上とトラフィック分析のためにCookieを使用します。',
      cookieAccept: 'すべて許可',
      cookieReject: 'すべて拒否',
      cookiePrivacy: 'プライバシーポリシー',
      infoTitle: '続行する前に',
      infoDesc: 'チームがより良いサポートを提供できるよう、詳細をお知らせください。',
      infoName: '氏名',
      infoEmail: 'メールアドレス',
      infoCompany: '会社名',
      infoCountry: '国/地域',
      infoSubmit: '送信',
      infoCancel: 'スキップ',
      infoCollapse: 'リード情報',
      infoDone: 'ありがとうございます！情報が保存されました。',
      highIntent: '高関心リード',
      statusNew: '新規',
      statusInProgress: '進行中',
      statusQualified: '適格',
      statusConverted: 'コンバート',
      loadingHistory: '会話を読み込み中...',
      privacyNote: '会話は暗号化され、非公開です。'
    },
    ko: {
      send: '전송',
      placeholder: '메시지를 입력하세요...',
      headerTitle: '고객 지원',
      headerSubtitle: '일반적으로 몇 분 내에 답변합니다',
      close: '채팅 닫기',
      online: '온라인',
      offline: '오프라인',
      typing: '입력 중...',
      welcomeFallback: '안녕하세요! WorkHogee 어시스턴트입니다. 어떻게 도와드릴까요?',
      errorSend: '전송 실패. 다시 시도해 주세요.',
      offlineMode: '오프라인 모드 — 연결이 복원되면 메시지가 전송됩니다',
      reconnected: '다시 연결됨',
      reconnecting: '다시 연결 중...',
      retryNow: '지금 다시 시도',
      cookieTitle: '귀하의 개인정보를 존중합니다',
      cookieDesc: '당사는 경험 개선과 트래픽 분석을 위해 쿠키를 사용합니다.',
      cookieAccept: '모두 허용',
      cookieReject: '모두 거부',
      cookiePrivacy: '개인정보 처리방침',
      infoTitle: '계속하기 전에',
      infoDesc: '더 나은 지원을 위해 연락처 정보를 공유해 주세요.',
      infoName: '성명',
      infoEmail: '이메일 주소',
      infoCompany: '회사',
      infoCountry: '국가',
      infoSubmit: '제출',
      infoCancel: '건너뛰기',
      infoCollapse: '리드 정보',
      infoDone: '감사합니다! 정보가 저장되었습니다.',
      highIntent: '고관심 리드',
      statusNew: '신규',
      statusInProgress: '진행 중',
      statusQualified: '적격',
      statusConverted: '전환됨',
      loadingHistory: '대화를 불러오는 중...',
      privacyNote: '대화는 암호화되어 비공개로 유지됩니다.'
    },
    pt: {
      send: 'Enviar',
      placeholder: 'Digite sua mensagem...',
      headerTitle: 'Suporte ao cliente',
      headerSubtitle: 'Respondemos em minutos',
      close: 'Fechar chat',
      online: 'Online agora',
      offline: 'Offline',
      typing: 'Digitando...',
      welcomeFallback: 'Olá! Sou o assistente do WorkHogee. Como posso ajudar você?',
      errorSend: 'Falha ao enviar. Tente novamente.',
      offlineMode: 'Modo offline — as mensagens serão enviadas quando a conexão for restaurada',
      reconnected: 'Reconectado',
      reconnecting: 'Reconectando...',
      retryNow: 'Tentar novamente',
      cookieTitle: 'Valorizamos sua privacidade',
      cookieDesc: 'Usamos cookies para melhorar sua experiência e analisar nosso tráfego.',
      cookieAccept: 'Aceitar todos',
      cookieReject: 'Rejeitar todos',
      cookiePrivacy: 'Política de privacidade',
      infoTitle: 'Antes de continuar',
      infoDesc: 'Compartilhe seus dados para que nossa equipe possa ajudá-lo melhor.',
      infoName: 'Nome completo',
      infoEmail: 'E-mail',
      infoCompany: 'Empresa',
      infoCountry: 'País',
      infoSubmit: 'Enviar',
      infoCancel: 'Pular',
      infoCollapse: 'Dados do lead',
      infoDone: 'Obrigado! Seus dados foram salvos.',
      highIntent: 'Lead de alto interesse',
      statusNew: 'Novo',
      statusInProgress: 'Em andamento',
      statusQualified: 'Qualificado',
      statusConverted: 'Convertido',
      loadingHistory: 'Carregando conversa...',
      privacyNote: 'As conversas são criptografadas e privadas.'
    },
    ar: {
      send: 'إرسال',
      placeholder: 'اكتب رسالتك...',
      headerTitle: 'دعم العملاء',
      headerSubtitle: 'نرد عادةً خلال دقائق',
      close: 'إغلاق المحادثة',
      online: 'متصل الآن',
      offline: 'غير متصل',
      typing: 'يكتب...',
      welcomeFallback: 'مرحباً! أنا مساعد WorkHogee. كيف يمكنني مساعدتك اليوم؟',
      errorSend: 'عذراً، فشل الإرسال. يرجى المحاولة مرة أخرى.',
      offlineMode: 'وضع عدم الاتصال — سيتم إرسال الرسائل عند استعادة الاتصال',
      reconnected: 'تم إعادة الاتصال',
      reconnecting: 'إعادة الاتصال...',
      retryNow: 'إعادة المحاولة الآن',
      cookieTitle: 'نحن نقدر خصوصيتك',
      cookieDesc: 'نستخدم ملفات تعريف الارتباط لتحسين تجربتك وتحليل حركة المرور.',
      cookieAccept: 'قبول الكل',
      cookieReject: 'رفض الكل',
      cookiePrivacy: 'سياسة الخصوصية',
      infoTitle: 'قبل المتابعة',
      infoDesc: 'يرجى مشاركة بياناتك حتى يتمكن فريقنا من مساعدتك بشكل أفضل.',
      infoName: 'الاسم الكامل',
      infoEmail: 'البريد الإلكتروني',
      infoCompany: 'الشركة',
      infoCountry: 'الدولة',
      infoSubmit: 'إرسال',
      infoCancel: 'تخطي',
      infoCollapse: 'معلومات العميل المحتمل',
      infoDone: 'شكراً! تم حفظ بياناتك.',
      highIntent: 'عميل محتمل ذو اهتمام عالٍ',
      statusNew: 'جديد',
      statusInProgress: 'قيد التنفيذ',
      statusQualified: 'مؤهل',
      statusConverted: 'تم التحويل',
      loadingHistory: 'جارٍ تحميل المحادثة...',
      privacyNote: 'المحادثات مشفرة وخاصة.'
    }
  };

  // 支持的语言列表
  var SUPPORTED_LANGS = ['en', 'es', 'fr', 'de', 'ja', 'ko', 'pt', 'ar'];
  var DEFAULT_LANG = 'en';

  // ========================================================================
  // 2. SVG 图标（全部内联，不使用 emoji）
  // ========================================================================
  var SVG_ICONS = {
    // 聊天按钮图标（对话气泡）
    chatBubble:
      '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' +
      '</svg>',
    // 关闭图标
    close:
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
      '</svg>',
    // 助手头像（圆形背景 + W 字母 logo）
    assistantAvatar:
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">' +
      '<text x="12" y="17" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="white">W</text>' +
      '</svg>',
    // 用户头像（人物轮廓）
    userAvatar:
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>' +
      '<circle cx="12" cy="7" r="4"/>' +
      '</svg>',
    // 火焰图标（高意向线索）
    fire:
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">' +
      '<path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .3-2 .8-2.8C7 8 6 10 6 12a6 6 0 0 0 12 0c0-5-6-10-6-10z" opacity="0.9"/>' +
      '</svg>',
    // 发送箭头
    sendArrow:
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
      '</svg>',
    // 折叠箭头
    chevron:
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
      '<polyline points="6 9 12 15 18 9"/>' +
      '</svg>'
  };

  // ========================================================================
  // 3. 配置读取
  // ========================================================================
  var CONFIG = {
    apiUrl: '',
    language: 'auto',
    primaryColor: '#ea580c',
    primaryDark: '#c2410c',
    secondaryColor: '#1c1917',
    widgetTitle: 'Customer Support',
    source: 'website-global',
    autoInit: true,
    showCookieBanner: true,
    cookiePrivacyUrl: 'https://www.workhogee.com/privacy',
    enableOfflineQueue: true,
    offlinePollInterval: 30000
  };

  // 从当前 <script> 标签读取 data-* 属性
  function readScriptAttributes() {
    var scripts = document.querySelectorAll('script[src*="widget-global.js"]');
    var script = scripts.length ? scripts[scripts.length - 1] : null;
    if (!script && document.currentScript && document.currentScript.src &&
        document.currentScript.src.indexOf('widget-global.js') !== -1) {
      script = document.currentScript;
    }
    if (!script) return;

    var dataMap = {
      'data-api-url': 'apiUrl',
      'data-language': 'language',
      'data-primary-color': 'primaryColor',
      'data-widget-title': 'widgetTitle'
    };
    for (var attr in dataMap) {
      var val = script.getAttribute(attr);
      if (val) CONFIG[dataMap[attr]] = val;
    }
  }

  // 从 window.WORKHOGEE_CONFIG 读取配置（优先级高于 data 属性）
  function readWindowConfig() {
    var w = window.WORKHOGEE_CONFIG || {};
    if (w.apiUrl) CONFIG.apiUrl = w.apiUrl;
    if (w.language) CONFIG.language = w.language;
    if (w.primaryColor) CONFIG.primaryColor = w.primaryColor;
    if (w.widgetTitle) CONFIG.widgetTitle = w.widgetTitle;
    if (w.showCookieBanner === false) CONFIG.showCookieBanner = false;
    if (w.cookiePrivacyUrl) CONFIG.cookiePrivacyUrl = w.cookiePrivacyUrl;
  }

  // ========================================================================
  // 4. 全局状态
  // ========================================================================
  var state = {
    currentLang: DEFAULT_LANG,
    isRtl: false,
    conversationId: null,
    isOpen: false,
    isLoading: false,
    isConnected: false,
    messages: [],
    intentionLevel: '',   // '', 'A', 'B', 'C'
    leadStatus: '',      // New / In Progress / Qualified / Converted
    visitor: { name: '', email: '', company: '', country: '' },
    infoFormCollapsed: false,
    reconnectTimer: null
  };

  // DOM 元素引用
  var els = {
    button: null,
    panel: null,
    messages: null,
    input: null,
    sendBtn: null,
    statusDot: null,
    statusText: null,
    intentBadge: null,
    highIntentBanner: null,
    leadStatusBadge: null,
    offlineBar: null,
    cookieBanner: null,
    infoCard: null,
    infoCardBody: null,
    infoCardToggle: null
  };

  // ========================================================================
  // 5. 工具函数
  // ========================================================================

  // 取当前语言文案
  function t(key) {
    var dict = I18N[state.currentLang] || I18N[DEFAULT_LANG];
    return dict[key] !== undefined ? dict[key] : (I18N[DEFAULT_LANG][key] || key);
  }

  // 简单 HTML 转义
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 基础 Markdown 渲染（链接 / 加粗 / 斜体 / 无序列表）
  function renderMarkdown(text) {
    var html = escapeHtml(text);
    // 无序列表（按行处理）
    var lines = html.split(/\n/);
    var inList = false;
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = line.match(/^\s*[-*]\s+(.*)$/);
      if (m) {
        if (!inList) { out.push('<ul style="margin:4px 0;padding-left:20px;">'); inList = true; }
        out.push('<li>' + inlineMd(m[1]) + '</li>');
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(inlineMd(line));
      }
    }
    if (inList) out.push('</ul>');
    return out.join('\n');
  }

  // 行内 Markdown：加粗、斜体、链接
  function inlineMd(s) {
    // 链接 [text](url)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">$1</a>');
    // 裸链接
    s = s.replace(/(^|[\s(])((https?:\/\/)[^\s<>"']+)/g,
      '$1<a href="$2" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;">$2</a>');
    // 加粗 **text**
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 斜体 *text*
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return s;
  }

  // 格式化时间戳 HH:MM
  function formatTime(iso) {
    try {
      var d = iso ? new Date(iso) : new Date();
      var h = d.getHours();
      var m = d.getMinutes();
      return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
    } catch (e) {
      return '';
    }
  }

  // 安全 localStorage 读取
  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* ignore */ }
  }
  function lsRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  // ========================================================================
  // 6. 语言自动检测
  // ========================================================================
  function detectLanguage(callback) {
    // 1) data-language 显式指定（非 auto）
    var explicit = CONFIG.language;
    if (explicit && explicit !== 'auto' && SUPPORTED_LANGS.indexOf(explicit) !== -1) {
      applyLanguage(explicit);
      callback();
      return;
    }

    // 2) 浏览器语言
    var browserLang = (navigator.language || 'en').toLowerCase();
    var shortLang = browserLang.split('-')[0];
    if (SUPPORTED_LANGS.indexOf(shortLang) !== -1) {
      applyLanguage(shortLang);
      callback();
      return;
    }

    // 3) 调用后端 /api/i18n/detect
    fetch(CONFIG.apiUrl + '/api/i18n/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browserLang: navigator.language || 'en', ip: '' })
    }).then(function (res) { return res.json(); })
      .then(function (data) {
        var lang = data && (data.language || data.lang || data.data && (data.data.language || data.data.lang));
        if (lang && SUPPORTED_LANGS.indexOf(lang) !== -1) {
          applyLanguage(lang);
        } else {
          applyLanguage(DEFAULT_LANG);
        }
      })
      .catch(function () {
        applyLanguage(DEFAULT_LANG);
      })
      .finally(callback);
  }

  // 应用语言（含 RTL 切换）
  function applyLanguage(lang) {
    state.currentLang = SUPPORTED_LANGS.indexOf(lang) !== -1 ? lang : DEFAULT_LANG;
    state.isRtl = (state.currentLang === 'ar');
    if (els.panel) {
      els.panel.setAttribute('dir', state.isRtl ? 'rtl' : 'ltr');
      els.panel.classList.toggle('wh-rtl', state.isRtl);
    }
    if (els.button) {
      els.button.classList.toggle('wh-rtl', state.isRtl);
    }
    // 同步面板内文案
    updateTexts();
  }

  // 同步面板内所有文案到当前语言
  function updateTexts() {
    if (!els.panel) return;
    var titleEl = els.panel.querySelector('.wh-title');
    if (titleEl) titleEl.textContent = CONFIG.widgetTitle || t('headerTitle');
    var subEl = els.panel.querySelector('.wh-subtitle-text');
    if (subEl) subEl.textContent = state.isConnected ? t('online') : t('offline');
    if (els.input) els.input.placeholder = t('placeholder');
    if (els.sendBtn) els.sendBtn.innerHTML = SVG_ICONS.sendArrow;
    var closeBtn = els.panel.querySelector('.wh-close-btn');
    if (closeBtn) closeBtn.setAttribute('aria-label', t('close'));
    // cookie 横幅
    if (els.cookieBanner) updateCookieBannerTexts();
    // 信息卡片
    updateInfoCardTexts();
    // 离线条
    if (els.offlineBar) {
      var msg = els.offlineBar.querySelector('.wh-offline-msg');
      if (msg) msg.textContent = state.isConnected ? t('reconnected') : t('offlineMode');
    }
  }

  // ========================================================================
  // 7. CSS 注入
  // ========================================================================
  function injectStyles() {
    var p = CONFIG.primaryColor;
    var pd = CONFIG.primaryDark;
    var s = CONFIG.secondaryColor;

    var css = '' +
    /* 浮动按钮 */
    '.wh-btn{' +
      'position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;' +
      'background:' + p + ';color:#fff;border:none;cursor:pointer;' +
      'box-shadow:0 6px 20px rgba(0,0,0,0.18);display:flex;align-items:center;justify-content:center;' +
      'z-index:9999;transition:transform .2s,box-shadow .2s;' +
    '}' +
    '.wh-btn:hover{transform:scale(1.08);box-shadow:0 8px 28px rgba(0,0,0,0.25);}' +
    '.wh-btn .wh-dot{' +
      'position:absolute;top:4px;right:4px;width:12px;height:12px;border-radius:50%;' +
      'background:#22c55e;border:2px solid #fff;z-index:2;transition:background .3s;' +
    '}' +
    /* RTL：按钮镜像到左下角 */
    '.wh-btn.wh-rtl{right:auto;left:24px;}' +
    '.wh-btn.wh-rtl .wh-dot{right:auto;left:4px;}' +

    /* 对话面板 */
    '.wh-panel{' +
      'position:fixed;bottom:96px;right:24px;width:380px;height:560px;max-height:calc(100vh - 120px);' +
      'background:#fff;border-radius:16px;box-shadow:0 12px 48px rgba(0,0,0,0.22);' +
      'display:none;flex-direction:column;z-index:9999;overflow:hidden;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
      'animation:wh-slideUp .28s ease;' +
    '}' +
    '.wh-panel.open{display:flex;}' +
    '.wh-panel.wh-rtl{right:auto;left:24px;}' +
    '@keyframes wh-slideUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}' +

    /* Header */
    '.wh-header{' +
      'background:linear-gradient(135deg,' + p + ',' + s + ');color:#fff;padding:16px 18px;' +
      'display:flex;align-items:center;justify-content:space-between;gap:8px;' +
    '}' +
    '.wh-header .wh-header-left{display:flex;align-items:center;gap:10px;min-width:0;}' +
    '.wh-header .wh-avatar-badge{' +
      'width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.18);' +
      'display:flex;align-items:center;justify-content:center;flex-shrink:0;' +
    '}' +
    '.wh-header .wh-title{font-weight:600;font-size:15px;line-height:1.2;}' +
    '.wh-header .wh-subtitle{font-size:12px;opacity:.9;margin-top:3px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;}' +
    '.wh-header .wh-status-dot{width:8px;height:8px;background:#22c55e;border-radius:50%;display:inline-block;animation:wh-pulse 2s infinite;}' +
    '@keyframes wh-pulse{0%,100%{opacity:1;}50%{opacity:.4;}}' +
    '.wh-close-btn{background:none;border:none;color:#fff;cursor:pointer;padding:6px;border-radius:6px;opacity:.85;display:flex;align-items:center;}' +
    '.wh-close-btn:hover{opacity:1;background:rgba(255,255,255,0.12);}' +

    /* 意向等级标签 */
    '.wh-intent-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;color:#fff;}' +
    '.wh-intent-A{background:#dc2626;}' +
    '.wh-intent-B{background:#ea580c;}' +
    '.wh-intent-C{background:#6b7280;}' +
    /* 对话状态徽章 */
    '.wh-status-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;background:rgba(255,255,255,0.2);color:#fff;}' +
    /* 高意向横幅 */
    '.wh-high-intent{' +
      'display:none;align-items:center;gap:6px;padding:8px 14px;background:#fef2f2;color:#991b1b;' +
      'font-size:12px;font-weight:600;border-bottom:1px solid #fecaca;' +
    '}' +
    '.wh-high-intent.show{display:flex;}' +
    '.wh-high-intent svg{color:#dc2626;flex-shrink:0;}' +

    /* 离线提示条 */
    '.wh-offline-bar{display:none;align-items:center;justify-content:center;gap:8px;padding:8px 14px;background:#fef3c7;color:#92400e;font-size:12px;border-bottom:1px solid #fde68a;}' +
    '.wh-offline-bar.show{display:flex;}' +
    '.wh-offline-bar button{background:none;border:none;color:#92400e;text-decoration:underline;cursor:pointer;font-size:12px;padding:0;}' +

    /* 消息区 */
    '.wh-messages{flex:1;overflow-y:auto;padding:14px;background:#fafaf9;display:flex;flex-direction:column;}' +
    '.wh-msg{margin-bottom:12px;display:flex;animation:wh-fadeIn .25s ease;}' +
    '@keyframes wh-fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}' +
    '.wh-msg.user{justify-content:flex-end;}' +
    '.wh-msg .wh-avatar{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin:0 8px;}' +
    '.wh-msg.assistant .wh-avatar{background:' + p + ';color:#fff;}' +
    '.wh-msg.user .wh-avatar{background:#e7e5e4;color:#57534e;}' +
    '.wh-msg .wh-bubble{max-width:75%;padding:9px 13px;border-radius:14px;font-size:14px;line-height:1.5;word-wrap:break-word;overflow-wrap:break-word;}' +
    '.wh-msg.assistant .wh-bubble{background:#fff;color:' + s + ';border-bottom-left-radius:4px;box-shadow:0 1px 2px rgba(0,0,0,0.05);}' +
    '.wh-msg.user .wh-bubble{background:' + p + ';color:#fff;border-bottom-right-radius:4px;}' +
    '.wh-msg.error .wh-bubble{background:#fef2f2;color:#991b1b;border:1px solid #fecaca;}' +
    '.wh-msg .wh-time{font-size:10px;color:#a8a29e;margin-top:3px;}' +
    '.wh-msg.user .wh-time{text-align:right;}' +

    /* 打字指示器 */
    '.wh-typing{display:flex;align-items:center;gap:4px;padding:4px 0;}' +
    '.wh-typing span{width:7px;height:7px;background:#a8a29e;border-radius:50%;animation:wh-bounce 1.3s infinite;}' +
    '.wh-typing span:nth-child(2){animation-delay:.18s;}' +
    '.wh-typing span:nth-child(3){animation-delay:.36s;}' +
    '@keyframes wh-bounce{0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-5px);}}' +

    /* 输入区 */
    '.wh-input-area{display:flex;padding:10px 12px;background:#fff;border-top:1px solid #e7e5e4;gap:8px;align-items:flex-end;}' +
    '.wh-input{flex:1;padding:10px 12px;border:1px solid #d6d3d1;border-radius:10px;font-size:14px;outline:none;transition:border-color .2s,box-shadow .2s;resize:none;max-height:100px;font-family:inherit;}' +
    '.wh-input:focus{border-color:' + p + ';box-shadow:0 0 0 3px rgba(234,88,12,0.12);}' +
    '.wh-send-btn{padding:9px 12px;background:' + p + ';color:#fff;border:none;border-radius:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s,transform .1s;}' +
    '.wh-send-btn:hover{background:' + pd + ';}' +
    '.wh-send-btn:active{transform:scale(0.96);}' +
    '.wh-send-btn:disabled{background:#d6d3d1;cursor:not-allowed;}' +

    /* 访客信息卡片 */
    '.wh-info-card{background:#fff;border:1px solid #e7e5e4;border-radius:12px;margin:0 14px 12px;overflow:hidden;}' +
    '.wh-info-card-header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;background:#fafaf9;user-select:none;}' +
    '.wh-info-card-header .wh-info-title{font-size:13px;font-weight:600;color:' + s + ';display:flex;align-items:center;gap:6px;}' +
    '.wh-info-card-header .wh-chevron{transition:transform .25s;color:#78716c;}' +
    '.wh-info-card.collapsed .wh-chevron{transform:rotate(-90deg);}' +
    '.wh-info-card-body{padding:12px 14px;}' +
    '.wh-info-card.collapsed .wh-info-card-body{display:none;}' +
    '.wh-info-desc{font-size:12px;color:#78716c;margin-bottom:10px;line-height:1.4;}' +
    '.wh-info-field{margin-bottom:8px;}' +
    '.wh-info-field label{display:block;font-size:11px;color:#78716c;margin-bottom:3px;font-weight:500;}' +
    '.wh-info-field input{width:100%;padding:7px 10px;border:1px solid #d6d3d1;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;font-family:inherit;}' +
    '.wh-info-field input:focus{border-color:' + p + ';}' +
    '.wh-info-actions{display:flex;gap:8px;margin-top:10px;}' +
    '.wh-info-submit{flex:1;padding:8px;background:' + p + ';color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;}' +
    '.wh-info-submit:hover{background:' + pd + ';}' +
    '.wh-info-skip{padding:8px 12px;background:#fff;color:#57534e;border:1px solid #d6d3d1;border-radius:8px;font-size:13px;cursor:pointer;}' +
    '.wh-info-done{font-size:12px;color:#16a34a;padding:8px 0;}' +

    /* Cookie 横幅 */
    '.wh-cookie{' +
      'position:fixed;bottom:0;left:0;right:0;background:#fff;box-shadow:0 -4px 20px rgba(0,0,0,0.1);' +
      'padding:14px 20px;z-index:9998;display:flex;align-items:center;justify-content:space-between;gap:16px;' +
      'flex-wrap:wrap;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;animation:wh-slideUp .3s ease;' +
    '}' +
    '.wh-cookie .wh-cookie-text{flex:1;min-width:240px;font-size:13px;color:' + s + ';line-height:1.4;}' +
    '.wh-cookie .wh-cookie-text .wh-cookie-title{font-weight:600;margin-bottom:2px;}' +
    '.wh-cookie .wh-cookie-actions{display:flex;gap:8px;flex-wrap:wrap;}' +
    '.wh-cookie-btn{padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:none;}' +
    '.wh-cookie-accept{background:' + p + ';color:#fff;}' +
    '.wh-cookie-accept:hover{background:' + pd + ';}' +
    '.wh-cookie-reject{background:#fff;color:#57534e;border:1px solid #d6d3d1;}' +
    '.wh-cookie-reject:hover{background:#f5f5f4;}' +
    '.wh-cookie-privacy{background:none;border:none;color:' + p + ';text-decoration:underline;cursor:pointer;font-size:12px;padding:4px;}' +

    /* 移动端：面板接近全屏 */
    '@media (max-width:480px){' +
      '.wh-panel{width:100vw;right:0;bottom:0;height:100vh;max-height:100vh;border-radius:0;}' +
      '.wh-panel.wh-rtl{left:0;right:0;}' +
      '.wh-btn{bottom:16px;right:16px;}' +
      '.wh-btn.wh-rtl{left:16px;right:auto;}' +
      '.wh-cookie{padding:12px 14px;}' +
    '}'
    ;

    var style = document.createElement('style');
    style.setAttribute('data-wh-global', '1');
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ========================================================================
  // 8. 创建组件 DOM
  // ========================================================================
  function createWidget() {
    // ---- 浮动按钮 ----
    els.button = document.createElement('button');
    els.button.className = 'wh-btn';
    els.button.setAttribute('aria-label', t('headerTitle'));
    els.button.innerHTML = SVG_ICONS.chatBubble + '<span class="wh-dot"></span>';
    els.button.onclick = toggleWidget;
    document.body.appendChild(els.button);
    els.statusDot = els.button.querySelector('.wh-dot');

    // ---- 对话面板 ----
    els.panel = document.createElement('div');
    els.panel.className = 'wh-panel';
    els.panel.setAttribute('role', 'dialog');
    els.panel.setAttribute('aria-label', t('headerTitle'));
    els.panel.innerHTML =
      '<div class="wh-header">' +
        '<div class="wh-header-left">' +
          '<div class="wh-avatar-badge">' + SVG_ICONS.assistantAvatar + '</div>' +
          '<div style="min-width:0;">' +
            '<div class="wh-title">' + escapeHtml(CONFIG.widgetTitle) + '</div>' +
            '<div class="wh-subtitle">' +
              '<span class="wh-status-dot"></span>' +
              '<span class="wh-subtitle-text">' + t('online') + '</span>' +
              '<span class="wh-intent-badge" style="display:none;"></span>' +
              '<span class="wh-status-badge" style="display:none;"></span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button class="wh-close-btn" aria-label="' + t('close') + '">' + SVG_ICONS.close + '</button>' +
      '</div>' +
      '<div class="wh-high-intent">' + SVG_ICONS.fire + '<span></span></div>' +
      '<div class="wh-offline-bar"><span class="wh-offline-msg"></span><button class="wh-retry-btn"></button></div>' +
      '<div class="wh-messages" role="log" aria-live="polite"></div>' +
      '<div class="wh-input-area">' +
        '<input type="text" class="wh-input" placeholder="' + t('placeholder') + '" autocomplete="off" aria-label="' + t('placeholder') + '" />' +
        '<button class="wh-send-btn" aria-label="' + t('send') + '">' + SVG_ICONS.sendArrow + '</button>' +
      '</div>';
    document.body.appendChild(els.panel);

    // 引用 DOM
    els.messages = els.panel.querySelector('.wh-messages');
    els.input = els.panel.querySelector('.wh-input');
    els.sendBtn = els.panel.querySelector('.wh-send-btn');
    els.intentBadge = els.panel.querySelector('.wh-intent-badge');
    els.leadStatusBadge = els.panel.querySelector('.wh-status-badge');
    els.highIntentBanner = els.panel.querySelector('.wh-high-intent');
    els.offlineBar = els.panel.querySelector('.wh-offline-bar');

    // 事件绑定
    els.sendBtn.onclick = sendMessage;
    els.panel.querySelector('.wh-close-btn').onclick = closeWidget;
    els.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    els.offlineBar.querySelector('.wh-retry-btn').onclick = function () {
      flushOfflineQueue();
    };

    // 创建访客信息卡片（插入到消息区上方，消息区里动态插入）
    createInfoCard();

    // 应用 RTL
    els.panel.setAttribute('dir', state.isRtl ? 'rtl' : 'ltr');
    els.panel.classList.toggle('wh-rtl', state.isRtl);
    els.button.classList.toggle('wh-rtl', state.isRtl);
  }

  // ========================================================================
  // 9. 访客信息收集卡片
  // ========================================================================
  function createInfoCard() {
    els.infoCard = document.createElement('div');
    els.infoCard.className = 'wh-info-card collapsed';
    els.infoCard.innerHTML =
      '<div class="wh-info-card-header">' +
        '<span class="wh-info-title">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' +
          '<span class="wh-info-title-text"></span>' +
        '</span>' +
        '<span class="wh-chevron">' + SVG_ICONS.chevron + '</span>' +
      '</div>' +
      '<div class="wh-info-card-body">' +
        '<div class="wh-info-desc"></div>' +
        '<div class="wh-info-field"><label></label><input type="text" class="wh-f-name" /></div>' +
        '<div class="wh-info-field"><label></label><input type="email" class="wh-f-email" /></div>' +
        '<div class="wh-info-field"><label></label><input type="text" class="wh-f-company" /></div>' +
        '<div class="wh-info-field"><label></label><input type="text" class="wh-f-country" /></div>' +
        '<div class="wh-info-done" style="display:none;"></div>' +
        '<div class="wh-info-actions">' +
          '<button class="wh-info-submit"></button>' +
          '<button class="wh-info-skip"></button>' +
        '</div>' +
      '</div>';

    // 折叠切换
    els.infoCard.querySelector('.wh-info-card-header').onclick = function () {
      els.infoCard.classList.toggle('collapsed');
    };

    // 提交
    els.infoCard.querySelector('.wh-info-submit').onclick = submitVisitorInfo;
    els.infoCard.querySelector('.wh-info-skip').onclick = function () {
      els.infoCard.classList.add('collapsed');
    };

    updateInfoCardTexts();

    // 插入到消息区顶部之前（作为面板内独立卡片，放在消息区上方）
    // 实际插入到 .wh-messages 之前，作为面板内元素
    var inputArea = els.panel.querySelector('.wh-input-area');
    els.panel.insertBefore(els.infoCard, inputArea);

    // 从 localStorage 恢复已有访客信息
    var saved = lsGet('workhogee_visitor');
    if (saved) {
      try {
        var v = JSON.parse(saved);
        state.visitor = v;
        els.infoCard.querySelector('.wh-f-name').value = v.name || '';
        els.infoCard.querySelector('.wh-f-email').value = v.email || '';
        els.infoCard.querySelector('.wh-f-company').value = v.company || '';
        els.infoCard.querySelector('.wh-f-country').value = v.country || '';
      } catch (e) {}
    }
  }

  function updateInfoCardTexts() {
    if (!els.infoCard) return;
    els.infoCard.querySelector('.wh-info-title-text').textContent = t('infoCollapse');
    els.infoCard.querySelector('.wh-info-desc').textContent = t('infoDesc');
    var labels = els.infoCard.querySelectorAll('.wh-info-field label');
    if (labels[0]) labels[0].textContent = t('infoName');
    if (labels[1]) labels[1].textContent = t('infoEmail');
    if (labels[2]) labels[2].textContent = t('infoCompany');
    if (labels[3]) labels[3].textContent = t('infoCountry');
    els.infoCard.querySelector('.wh-info-submit').textContent = t('infoSubmit');
    els.infoCard.querySelector('.wh-info-skip').textContent = t('infoCancel');
    // 如果已有访客信息，显示完成态
    if (state.visitor && state.visitor.name) {
      var done = els.infoCard.querySelector('.wh-info-done');
      done.textContent = t('infoDone');
      done.style.display = 'block';
    }
  }

  function submitVisitorInfo() {
    state.visitor.name = els.infoCard.querySelector('.wh-f-name').value.trim();
    state.visitor.email = els.infoCard.querySelector('.wh-f-email').value.trim();
    state.visitor.company = els.infoCard.querySelector('.wh-f-company').value.trim();
    state.visitor.country = els.infoCard.querySelector('.wh-f-country').value.trim();

    lsSet('workhogee_visitor', JSON.stringify(state.visitor));

    var done = els.infoCard.querySelector('.wh-info-done');
    done.textContent = t('infoDone');
    done.style.display = 'block';
    els.infoCard.classList.add('collapsed');

    // 尝试调用后端更新线索（失败不阻塞）
    if (state.conversationId) {
      fetch(CONFIG.apiUrl + '/api/conversations/' + state.conversationId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitor: state.visitor })
      }).catch(function () {});
    }
  }

  // ========================================================================
  // 10. Cookie 同意横幅
  // ========================================================================
  function initCookieBanner() {
    if (!CONFIG.showCookieBanner) return;
    var consent = lsGet('workhogee_cookie_consent');
    if (consent === 'granted' || consent === 'denied') {
      // 已有决定，不再显示
      return;
    }
    showCookieBanner();
  }

  function showCookieBanner() {
    if (els.cookieBanner) {
      els.cookieBanner.style.display = 'flex';
      return;
    }
    var banner = document.createElement('div');
    banner.className = 'wh-cookie';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML =
      '<div class="wh-cookie-text">' +
        '<div class="wh-cookie-title"></div>' +
        '<div></div>' +
      '</div>' +
      '<div class="wh-cookie-actions">' +
        '<button class="wh-cookie-privacy"></button>' +
        '<button class="wh-cookie-reject"></button>' +
        '<button class="wh-cookie-accept"></button>' +
      '</div>';
    document.body.appendChild(banner);
    els.cookieBanner = banner;

    banner.querySelector('.wh-cookie-accept').onclick = function () {
      setConsent('granted');
    };
    banner.querySelector('.wh-cookie-reject').onclick = function () {
      setConsent('denied');
    };
    banner.querySelector('.wh-cookie-privacy').onclick = function () {
      window.open(CONFIG.cookiePrivacyUrl, '_blank', 'noopener');
    };

    updateCookieBannerTexts();
  }

  function updateCookieBannerTexts() {
    if (!els.cookieBanner) return;
    els.cookieBanner.querySelector('.wh-cookie-title').textContent = t('cookieTitle');
    els.cookieBanner.querySelectorAll('.wh-cookie-text div')[1].textContent = t('cookieDesc');
    els.cookieBanner.querySelector('.wh-cookie-accept').textContent = t('cookieAccept');
    els.cookieBanner.querySelector('.wh-cookie-reject').textContent = t('cookieReject');
    els.cookieBanner.querySelector('.wh-cookie-privacy').textContent = t('cookiePrivacy');
  }

  function setConsent(decision) {
    lsSet('workhogee_cookie_consent', decision);
    if (els.cookieBanner) {
      els.cookieBanner.style.display = 'none';
    }
    // 上报后端（拒绝也上报，用于记录）
    fetch(CONFIG.apiUrl + '/api/compliance/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: decision,
        language: state.currentLang,
        timestamp: new Date().toISOString()
      })
    }).catch(function () {});
  }

  // 是否允许收集访客信息
  function canCollectVisitor() {
    return lsGet('workhogee_cookie_consent') === 'granted';
  }

  // ========================================================================
  // 11. 离线队列
  // ========================================================================
  function getOfflineQueue() {
    try {
      var raw = lsGet('workhogee_offline_queue');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveOfflineQueue(queue) {
    lsSet('workhogee_offline_queue', JSON.stringify(queue));
  }

  function enqueueOfflineMessage(msg) {
    var queue = getOfflineQueue();
    queue.push(msg);
    saveOfflineQueue(queue);
    showOfflineBar(true);
  }

  // 恢复连接后自动重发队列
  function flushOfflineQueue() {
    var queue = getOfflineQueue();
    if (!queue.length) {
      showOfflineBar(state.isConnected ? false : false);
      return;
    }
    // 逐个重发
    var next = queue.shift();
    saveOfflineQueue(queue);
    doSendMessage(next.content, next.language, function (ok) {
      if (ok) {
        if (queue.length > 0) {
          // 继续下一条
          setTimeout(flushOfflineQueue, 300);
        } else {
          showOfflineBar(false);
          showSystemNotice(t('reconnected'));
        }
      } else {
        // 失败，放回队列头部
        queue.unshift(next);
        saveOfflineQueue(queue);
      }
    });
  }

  function showOfflineBar(offline) {
    if (!els.offlineBar) return;
    if (offline) {
      els.offlineBar.classList.add('show');
      els.offlineBar.querySelector('.wh-offline-msg').textContent = t('offlineMode');
      els.offlineBar.querySelector('.wh-retry-btn').textContent = t('retryNow');
    } else {
      els.offlineBar.classList.remove('show');
    }
  }

  // ========================================================================
  // 12. 连接状态检测
  // ========================================================================
  function checkConnection() {
    return fetch(CONFIG.apiUrl + '/api/health', {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      state.isConnected = true;
      updateConnectionUI(true);
      // 如果离线队列有消息，尝试重发
      var q = getOfflineQueue();
      if (q.length > 0) {
        flushOfflineQueue();
      }
    }).catch(function () {
      state.isConnected = false;
      updateConnectionUI(false);
    });
  }

  function updateConnectionUI(connected) {
    if (els.statusDot) els.statusDot.style.background = connected ? '#22c55e' : '#ef4444';
    var sub = els.panel && els.panel.querySelector('.wh-subtitle-text');
    if (sub) sub.textContent = connected ? t('online') : t('offline');
    if (connected) {
      showOfflineBar(false);
    } else {
      // 仅在发送失败时才显示离线条
    }
  }

  // 定期轮询连接状态
  function startConnectionPolling() {
    if (state.reconnectTimer) clearInterval(state.reconnectTimer);
    state.reconnectTimer = setInterval(function () {
      checkConnection();
    }, CONFIG.offlinePollInterval);
  }

  // ========================================================================
  // 13. 对话 API
  // ========================================================================
  function loadConversation() {
    var savedId = lsGet('workhogee_global_conversation_id');
    if (savedId) {
      state.conversationId = savedId;
      fetch(CONFIG.apiUrl + '/api/conversations/' + savedId, {
        signal: AbortSignal.timeout(8000)
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        if (data.success && data.data) {
          var d = data.data;
          if (d.messages && d.messages.length) {
            state.messages = d.messages.map(function (m) {
              return {
                role: m.role || 'assistant',
                content: m.content || m.message || '',
                timestamp: m.createdAt || new Date().toISOString()
              };
            });
          }
          applyLeadMeta(d);
          renderMessages();
          return;
        }
        throw new Error('bad data');
      }).catch(function () {
        createNewConversation();
      });
    } else {
      createNewConversation();
    }
  }

  function createNewConversation() {
    fetch(CONFIG.apiUrl + '/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: CONFIG.source, language: state.currentLang })
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (data.success && data.data) {
        state.conversationId = data.data.conversationId;
        lsSet('workhogee_global_conversation_id', state.conversationId);
        var welcome = data.data.welcomeMessage || t('welcomeFallback');
        addMessage('assistant', welcome);
        applyLeadMeta(data.data);
        // 对话开始后自动展开访客信息卡片
        els.infoCard.classList.remove('collapsed');
      } else {
        throw new Error(data.error || 'create failed');
      }
    }).catch(function (e) {
      console.warn('[WorkHogee Global] create conversation failed:', e.message);
      addMessage('assistant', t('welcomeFallback'));
      showOfflineBar(true);
    });
  }

  // 从后端响应中提取意向等级 / 对话状态 / 访客信息
  function applyLeadMeta(data) {
    if (!data) return;
    var level = data.intentionLevel || data.intention_level || (data.lead && data.lead.intentionLevel);
    if (level) {
      state.intentionLevel = String(level).toUpperCase();
      updateIntentBadge();
    }
    var status = data.status || data.leadStatus || (data.lead && data.lead.status);
    if (status) {
      state.leadStatus = status;
      updateLeadStatusBadge();
    }
    // 访客信息回填
    var v = data.visitor || data.lead;
    if (v) {
      if (v.name) { state.visitor.name = v.name; els.infoCard.querySelector('.wh-f-name').value = v.name; }
      if (v.email) { state.visitor.email = v.email; els.infoCard.querySelector('.wh-f-email').value = v.email; }
      if (v.company) { state.visitor.company = v.company; els.infoCard.querySelector('.wh-f-company').value = v.company; }
      if (v.country) { state.visitor.country = v.country; els.infoCard.querySelector('.wh-f-country').value = v.country; }
      if (v.name) {
        var done = els.infoCard.querySelector('.wh-info-done');
        done.textContent = t('infoDone');
        done.style.display = 'block';
      }
    }
  }

  function updateIntentBadge() {
    if (!els.intentBadge) return;
    var lv = state.intentionLevel;
    if (!lv) {
      els.intentBadge.style.display = 'none';
      els.highIntentBanner.classList.remove('show');
      return;
    }
    els.intentBadge.style.display = 'inline-block';
    els.intentBadge.className = 'wh-intent-badge wh-intent-' + lv;
    els.intentBadge.textContent = 'Lead ' + lv;
    // 高意向 A 级显示火焰横幅
    if (lv === 'A') {
      els.highIntentBanner.classList.add('show');
      els.highIntentBanner.querySelector('span').textContent = t('highIntent');
    } else {
      els.highIntentBanner.classList.remove('show');
    }
  }

  function updateLeadStatusBadge() {
    if (!els.leadStatusBadge) return;
    var s = state.leadStatus;
    if (!s) { els.leadStatusBadge.style.display = 'none'; return; }
    els.leadStatusBadge.style.display = 'inline-block';
    // 映射状态到 i18n key
    var map = {
      'New': 'statusNew',
      'In Progress': 'statusInProgress',
      'Qualified': 'statusQualified',
      'Converted': 'statusConverted'
    };
    els.leadStatusBadge.textContent = t(map[s] || 'statusNew');
  }

  // ========================================================================
  // 14. 消息发送与渲染
  // ========================================================================
  function addMessage(role, content, timestamp) {
    state.messages.push({
      role: role,
      content: content,
      timestamp: timestamp || new Date().toISOString()
    });
    // 同时持久化到 localStorage
    lsSet('workhogee_global_messages', JSON.stringify(state.messages.slice(-200)));
    renderMessages();
  }

  function renderMessages() {
    if (!els.messages) return;
    els.messages.innerHTML = '';

    state.messages.forEach(function (msg) {
      var row = document.createElement('div');
      row.className = 'wh-msg ' + msg.role;

      var avatar = document.createElement('div');
      avatar.className = 'wh-avatar';
      avatar.innerHTML = msg.role === 'assistant' ? SVG_ICONS.assistantAvatar : SVG_ICONS.userAvatar;

      var bubbleWrap = document.createElement('div');
      bubbleWrap.style.display = 'flex';
      bubbleWrap.style.flexDirection = 'column';
      bubbleWrap.style.maxWidth = '75%';

      var bubble = document.createElement('div');
      bubble.className = 'wh-bubble';
      bubble.innerHTML = renderMarkdown(msg.content);

      var time = document.createElement('div');
      time.className = 'wh-time';
      time.textContent = formatTime(msg.timestamp);

      bubbleWrap.appendChild(bubble);
      bubbleWrap.appendChild(time);

      if (msg.role === 'user') {
        row.appendChild(bubbleWrap);
        row.appendChild(avatar);
      } else {
        row.appendChild(avatar);
        row.appendChild(bubbleWrap);
      }
      els.messages.appendChild(row);
    });

    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function showTyping() {
    if (!els.messages) return;
    var el = document.createElement('div');
    el.className = 'wh-msg assistant';
    el.id = 'wh-typing';
    el.innerHTML =
      '<div class="wh-avatar">' + SVG_ICONS.assistantAvatar + '</div>' +
      '<div class="wh-bubble"><div class="wh-typing"><span></span><span></span><span></span></div></div>';
    els.messages.appendChild(el);
    els.messages.scrollTop = els.messages.scrollHeight;
  }
  function hideTyping() {
    var el = document.getElementById('wh-typing');
    if (el) el.remove();
  }

  function showSystemNotice(text) {
    if (!els.messages) return;
    var el = document.createElement('div');
    el.style.cssText = 'text-align:center;font-size:11px;color:#16a34a;margin:6px 0;';
    el.textContent = text;
    els.messages.appendChild(el);
    els.messages.scrollTop = els.messages.scrollHeight;
    setTimeout(function () { el.remove(); }, 4000);
  }

  function sendMessage() {
    var text = els.input.value.trim();
    if (!text || state.isLoading) return;
    if (!state.conversationId) {
      // 尚未创建对话，走离线队列
      els.input.value = '';
      enqueueOfflineMessage({ id: Date.now(), content: text, timestamp: new Date().toISOString(), language: state.currentLang });
      addMessage('user', text);
      return;
    }

    els.input.value = '';
    state.isLoading = true;
    els.sendBtn.disabled = true;
    addMessage('user', text);
    showTyping();

    doSendMessage(text, state.currentLang, function (ok, replyData) {
      hideTyping();
      if (ok && replyData) {
        var reply = replyData.reply || replyData.content || replyData.message || t('welcomeFallback');
        addMessage('assistant', reply);
        applyLeadMeta(replyData);
      } else if (!ok) {
        // 发送失败：入离线队列
        enqueueOfflineMessage({
          id: Date.now(),
          content: text,
          timestamp: new Date().toISOString(),
          language: state.currentLang
        });
      }
      state.isLoading = false;
      els.sendBtn.disabled = false;
      if (els.input) els.input.focus();
    });
  }

  // 实际发送消息到后端（兼容现有后端：body 字段为 message）
  function doSendMessage(text, lang, cb) {
    fetch(CONFIG.apiUrl + '/api/conversations/' + state.conversationId + '/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, content: text, language: lang }),
      signal: AbortSignal.timeout(15000)
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (data.success && data.data) {
        state.isConnected = true;
        updateConnectionUI(true);
        cb(true, data.data);
      } else {
        cb(false, null);
      }
    }).catch(function (e) {
      console.warn('[WorkHogee Global] send failed:', e.message);
      state.isConnected = false;
      updateConnectionUI(false);
      cb(false, null);
    });
  }

  // ========================================================================
  // 15. 打开 / 关闭
  // ========================================================================
  function openWidget() {
    if (!els.panel) return;
    state.isOpen = true;
    els.panel.classList.add('open');
    setTimeout(function () { if (els.input) els.input.focus(); }, 250);
  }
  function closeWidget() {
    if (!els.panel) return;
    state.isOpen = false;
    els.panel.classList.remove('open');
  }
  function toggleWidget() {
    if (state.isOpen) closeWidget(); else openWidget();
  }

  // ========================================================================
  // 16. 国家自动检测（从时区推断）
  // ========================================================================
  function detectCountryFromTimezone() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      var map = {
        'America/New_York': 'United States', 'America/Chicago': 'United States',
        'America/Los_Angeles': 'United States', 'America/Denver': 'United States',
        'America/Phoenix': 'United States', 'America/Anchorage': 'United States',
        'Pacific/Honolulu': 'United States',
        'Europe/London': 'United Kingdom', 'Europe/Paris': 'France',
        'Europe/Berlin': 'Germany', 'Europe/Madrid': 'Spain',
        'Europe/Rome': 'Italy', 'Europe/Moscow': 'Russia',
        'Asia/Tokyo': 'Japan', 'Asia/Seoul': 'South Korea',
        'Asia/Shanghai': 'China', 'Asia/Hong_Kong': 'Hong Kong',
        'Asia/Singapore': 'Singapore', 'Asia/Dubai': 'United Arab Emirates',
        'Australia/Sydney': 'Australia', 'America/Sao_Paulo': 'Brazil',
        'America/Mexico_City': 'Mexico', 'America/Toronto': 'Canada'
      };
      return map[tz] || '';
    } catch (e) {
      return '';
    }
  }

  // ========================================================================
  // 17. 销毁
  // ========================================================================
  function destroy() {
    if (state.reconnectTimer) clearInterval(state.reconnectTimer);
    if (els.button) els.button.remove();
    if (els.panel) els.panel.remove();
    if (els.cookieBanner) els.cookieBanner.remove();
    var styleEl = document.querySelector('style[data-wh-global]');
    if (styleEl) styleEl.remove();
    window.__workhogee_global_initialized = false;
  }

  // ========================================================================
  // 18. 初始化
  // ========================================================================
  function init(options) {
    if (window.__workhogee_global_initialized) {
      console.log('[WorkHogee Global] already initialized');
      return;
    }
    window.__workhogee_global_initialized = true;

    readScriptAttributes();
    readWindowConfig();
    if (options) {
      if (options.apiUrl) CONFIG.apiUrl = options.apiUrl;
      if (options.language) CONFIG.language = options.language;
      if (options.primaryColor) CONFIG.primaryColor = options.primaryColor;
      if (options.widgetTitle) CONFIG.widgetTitle = options.widgetTitle;
    }
    if (!CONFIG.apiUrl) {
      // 从当前脚本 URL 推断 API 域名
      try {
        if (document.currentScript && document.currentScript.src) {
          var u = new URL(document.currentScript.src);
          CONFIG.apiUrl = u.protocol + '//' + u.hostname;
        } else {
          CONFIG.apiUrl = 'https://api.workhogee.com';
        }
      } catch (e) {
        CONFIG.apiUrl = 'https://api.workhogee.com';
      }
    }

    // 默认国家从时区推断
    var guessed = detectCountryFromTimezone();
    if (guessed && !state.visitor.country) state.visitor.country = guessed;

    console.log('[WorkHogee Global] init, apiUrl=', CONFIG.apiUrl);

    injectStyles();

    // 先检测语言，再创建 UI（保证文案正确）
    detectLanguage(function () {
      createWidget();
      initCookieBanner();
      checkConnection();
      loadConversation();
      startConnectionPolling();

      // 恢复历史消息（从 localStorage）
      var saved = lsGet('workhogee_global_messages');
      if (saved && !state.messages.length) {
        try {
          state.messages = JSON.parse(saved);
          renderMessages();
        } catch (e) {}
      }
    });
  }

  // ========================================================================
  // 19. 暴露全局 API
  // ========================================================================
  window.WorkHogeeGlobalWidget = {
    init: function (options) { init(options || {}); },
    open: openWidget,
    close: closeWidget,
    setLanguage: function (lang) {
      if (SUPPORTED_LANGS.indexOf(lang) !== -1) {
        applyLanguage(lang);
      }
    },
    showCookieBanner: showCookieBanner,
    destroy: destroy
  };

  // 自动初始化
  if (CONFIG.autoInit) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        init(window.WORKHOGEE_CONFIG || {});
      });
    } else {
      init(window.WORKHOGEE_CONFIG || {});
    }
  }

})();
