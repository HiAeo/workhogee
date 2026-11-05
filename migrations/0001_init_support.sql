-- WorkHogee 在线客服 D1 初始化迁移（一期：官网 widget）
-- 会话模型同时预留二期 App 内 Conversations 统一收件箱复用。
-- 所有时间列为毫秒级 Unix 时间戳（INTEGER）。

-- 会话：一个浏览器访客对应一个 sid（前端 localStorage whg_support_v1 持久化）。
CREATE TABLE IF NOT EXISTS support_sessions (
  sid         TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  last_at     INTEGER NOT NULL,
  email       TEXT NOT NULL DEFAULT '',
  path        TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  ua          TEXT NOT NULL DEFAULT ''
);

-- 消息：cid 为前端生成的客户端幂等 ID，重试 / beacon 重发靠主键 INSERT OR IGNORE 去重。
-- role 一期只有 'me'（访客）；二期客服/自动回复写 'bot'，CHECK 已预留。
CREATE TABLE IF NOT EXISTS support_messages (
  cid         TEXT PRIMARY KEY,
  sid         TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'me' CHECK (role IN ('me', 'bot')),
  text        TEXT NOT NULL,
  email       TEXT NOT NULL DEFAULT '',
  path        TEXT NOT NULL DEFAULT '',
  beacon      INTEGER NOT NULL DEFAULT 0,
  ts          INTEGER NOT NULL,
  ip          TEXT NOT NULL DEFAULT '',
  ua          TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);

-- 历史拉取：按会话 + 客户端时间有序遍历。
CREATE INDEX IF NOT EXISTS idx_messages_sid_ts
  ON support_messages (sid, ts);

-- 限流：按 IP + 服务端落库时间做滑窗计数。
CREATE INDEX IF NOT EXISTS idx_messages_ip_time
  ON support_messages (ip, created_at);

-- 站长后台/控制台按最近活跃排会话。
CREATE INDEX IF NOT EXISTS idx_sessions_last
  ON support_sessions (last_at);
