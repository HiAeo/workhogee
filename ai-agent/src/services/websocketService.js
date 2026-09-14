/**
 * WorkHogee WebSocket 实时推送服务
 * 支持新线索、新对话、通知等实时消息推送
 */

const WebSocket = require('ws');
const crypto = require('crypto');

class WebSocketService {
  constructor(server, config = {}) {
    this.config = config;
    this.wss = null;
    this.clients = new Map(); // clientId -> { ws, userId, tenantId, subscriptions }
    this.heartbeatInterval = null;

    if (server) {
      this.init(server);
    }
  }

  /**
   * 初始化 WebSocket 服务器
   */
  init(server) {
    this.wss = new WebSocket.Server({
      server,
      path: '/ws',
      verifyClient: this._verifyClient.bind(this)
    });

    this.wss.on('connection', this._onConnection.bind(this));
    this.wss.on('error', this._onError.bind(this));

    // 心跳检测
    this._startHeartbeat();

    console.log('[WebSocket] 服务已启动，路径: /ws');
  }

  /**
   * 验证客户端连接
   */
  _verifyClient(info, callback) {
    // 可以在这里验证 Token
    // const token = info.req.headers['sec-websocket-protocol'];
    // 暂时允许所有连接，后续可添加认证
    callback(true);
  }

  /**
   * 处理新连接
   */
  _onConnection(ws, req) {
    const clientId = crypto.randomUUID();
    const client = {
      id: clientId,
      ws,
      userId: null,
      tenantId: null,
      subscriptions: new Set(['global']),
      isAlive: true,
      connectedAt: new Date().toISOString()
    };

    this.clients.set(clientId, client);

    console.log(`[WebSocket] 客户端已连接: ${clientId}，当前连接数: ${this.clients.size}`);

    // 发送欢迎消息
    this._sendToClient(client, {
      type: 'connected',
      data: {
        clientId,
        message: 'WebSocket 连接已建立',
        serverTime: new Date().toISOString()
      }
    });

    // 处理消息
    ws.on('message', (data) => this._onMessage(client, data));

    // 处理关闭
    ws.on('close', () => this._onClose(client));

    // 处理错误
    ws.on('error', (error) => this._onClientError(client, error));

    // 心跳响应
    ws.on('pong', () => {
      client.isAlive = true;
    });
  }

  /**
   * 处理客户端消息
   */
  _onMessage(client, data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'auth':
          this._handleAuth(client, message.data);
          break;
        case 'subscribe':
          this._handleSubscribe(client, message.data);
          break;
        case 'unsubscribe':
          this._handleUnsubscribe(client, message.data);
          break;
        case 'ping':
          this._sendToClient(client, { type: 'pong', data: { timestamp: new Date().toISOString() } });
          break;
        default:
          console.log(`[WebSocket] 未知消息类型: ${message.type}`);
      }
    } catch (e) {
      console.error('[WebSocket] 消息解析失败:', e.message);
    }
  }

  /**
   * 处理认证
   */
  _handleAuth(client, data) {
    // 简单认证，后续可集成 JWT 验证
    if (data && data.userId) {
      client.userId = data.userId;
      client.tenantId = data.tenantId || null;
      console.log(`[WebSocket] 客户端认证成功: ${client.id} -> userId: ${client.userId}`);

      this._sendToClient(client, {
        type: 'auth_success',
        data: {
          userId: client.userId,
          tenantId: client.tenantId
        }
      });
    }
  }

  /**
   * 处理订阅
   */
  _handleSubscribe(client, data) {
    if (data && data.channel) {
      client.subscriptions.add(data.channel);
      console.log(`[WebSocket] 客户端订阅: ${client.id} -> ${data.channel}`);

      this._sendToClient(client, {
        type: 'subscribed',
        data: { channel: data.channel }
      });
    }
  }

  /**
   * 处理取消订阅
   */
  _handleUnsubscribe(client, data) {
    if (data && data.channel) {
      client.subscriptions.delete(data.channel);
      console.log(`[WebSocket] 客户端取消订阅: ${client.id} -> ${data.channel}`);
    }
  }

  /**
   * 处理连接关闭
   */
  _onClose(client) {
    this.clients.delete(client.id);
    console.log(`[WebSocket] 客户端已断开: ${client.id}，当前连接数: ${this.clients.size}`);
  }

  /**
   * 处理客户端错误
   */
  _onClientError(client, error) {
    console.error(`[WebSocket] 客户端错误 ${client.id}:`, error.message);
  }

  /**
   * 处理服务器错误
   */
  _onError(error) {
    console.error('[WebSocket] 服务器错误:', error.message);
  }

  /**
   * 发送消息给指定客户端
   */
  _sendToClient(client, message) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * 启动心跳检测
   */
  _startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((client) => {
        if (!client.isAlive) {
          console.log(`[WebSocket] 客户端心跳超时，强制断开: ${client.id}`);
          client.ws.terminate();
          this.clients.delete(client.id);
          return;
        }
        client.isAlive = false;
        client.ws.ping();
      });
    }, 30000); // 每 30 秒检测一次
  }

  /**
   * 广播消息到所有客户端
   */
  broadcast(message) {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    });
  }

  /**
   * 发送消息到指定频道
   */
  sendToChannel(channel, message) {
    const data = JSON.stringify({ ...message, channel });
    let count = 0;
    this.clients.forEach((client) => {
      if (client.subscriptions.has(channel) || client.subscriptions.has('global')) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(data);
          count++;
        }
      }
    });
    return count;
  }

  /**
   * 发送消息给指定用户
   */
  sendToUser(userId, message) {
    const data = JSON.stringify({ ...message, targetUserId: userId });
    let count = 0;
    this.clients.forEach((client) => {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
        count++;
      }
    });
    return count;
  }

  /**
   * 发送新线索通知
   */
  notifyNewLead(lead) {
    return this.sendToChannel('leads', {
      type: 'new_lead',
      data: lead,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 发送新对话消息通知
   */
  notifyNewMessage(conversationId, message) {
    return this.sendToChannel('conversations', {
      type: 'new_message',
      data: { conversationId, message },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 发送新通知
   */
  notifyNewNotification(notification) {
    return this.sendToChannel('notifications', {
      type: 'new_notification',
      data: notification,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 获取连接统计
   */
  getStats() {
    let authenticatedCount = 0;
    this.clients.forEach((client) => {
      if (client.userId) authenticatedCount++;
    });

    return {
      totalConnections: this.clients.size,
      authenticatedConnections: authenticatedCount,
      anonymousConnections: this.clients.size - authenticatedCount
    };
  }

  /**
   * 关闭 WebSocket 服务
   */
  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.wss) {
      this.wss.close();
    }
    this.clients.clear();
    console.log('[WebSocket] 服务已关闭');
  }
}

module.exports = WebSocketService;
