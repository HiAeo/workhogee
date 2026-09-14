/**
 * WorkHogee 数据库初始化脚本
 * 创建所有核心表和索引
 */

const db = require('./index');

const TABLES = [
  // 租户表
  `CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'free',
    status VARCHAR(20) DEFAULT 'active',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 用户表
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user',
    avatar_url VARCHAR(500),
    status VARCHAR(20) DEFAULT 'active',
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 线索表
  `CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    company VARCHAR(255),
    source VARCHAR(100),
    intention_level VARCHAR(10) DEFAULT 'C',
    status VARCHAR(20) DEFAULT 'new',
    tags JSONB DEFAULT '[]',
    profile JSONB DEFAULT '{}',
    assigned_to UUID REFERENCES users(id),
    converted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 对话表
  `CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    source VARCHAR(100) DEFAULT 'web',
    visitor_name VARCHAR(255),
    visitor_email VARCHAR(255),
    visitor_phone VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    intention_level VARCHAR(10),
    message_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 消息表
  `CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    tokens INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 知识库文档
  `CREATE TABLE IF NOT EXISTS knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT,
    category VARCHAR(100),
    tags JSONB DEFAULT '[]',
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 知识库FAQ
  `CREATE TABLE IF NOT EXISTS knowledge_faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    category VARCHAR(100),
    tags JSONB DEFAULT '[]',
    embedding vector(1536),
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 知识库话术
  `CREATE TABLE IF NOT EXISTS knowledge_scripts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    scenario VARCHAR(100),
    stage VARCHAR(50),
    tags JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 客户画像
  `CREATE TABLE IF NOT EXISTS customer_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    name VARCHAR(255),
    company VARCHAR(255),
    industry VARCHAR(100),
    budget VARCHAR(100),
    decision_role VARCHAR(100),
    pain_points JSONB DEFAULT '[]',
    preferences JSONB DEFAULT '{}',
    interaction_history JSONB DEFAULT '[]',
    score INTEGER DEFAULT 0,
    tags JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 邮箱账号
  `CREATE TABLE IF NOT EXISTS email_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255),
    email VARCHAR(255) NOT NULL,
    imap_host VARCHAR(255),
    imap_port INTEGER DEFAULT 993,
    imap_secure BOOLEAN DEFAULT true,
    smtp_host VARCHAR(255),
    smtp_port INTEGER DEFAULT 465,
    smtp_secure BOOLEAN DEFAULT true,
    username VARCHAR(255),
    password_encrypted TEXT,
    status VARCHAR(20) DEFAULT 'active',
    last_sync_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 邮件
  `CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
    message_id VARCHAR(500) UNIQUE,
    from_email VARCHAR(255),
    from_name VARCHAR(255),
    to_emails JSONB DEFAULT '[]',
    cc_emails JSONB DEFAULT '[]',
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    is_read BOOLEAN DEFAULT false,
    is_inquiry BOOLEAN DEFAULT false,
    inquiry_score INTEGER,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    ai_reply_draft TEXT,
    ai_reply_status VARCHAR(20),
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 邮件草稿
  `CREATE TABLE IF NOT EXISTS email_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID REFERENCES email_accounts(id) ON DELETE CASCADE,
    email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
    to_email VARCHAR(255),
    subject TEXT,
    body TEXT,
    ai_generated BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'draft',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 邮件模板
  `CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    category VARCHAR(100),
    variables JSONB DEFAULT '[]',
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 通知
  `CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 通知规则
  `CREATE TABLE IF NOT EXISTS notification_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    rule_name VARCHAR(100) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    channels JSONB DEFAULT '["system"]',
    webhook_url VARCHAR(500),
    email VARCHAR(255),
    min_intention_level VARCHAR(10),
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 报告
  `CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    title VARCHAR(255),
    summary TEXT,
    data JSONB DEFAULT '{}',
    generated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // A/B测试
  `CREATE TABLE IF NOT EXISTS ab_tests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50),
    variant_a JSONB NOT NULL,
    variant_b JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'draft',
    results JSONB DEFAULT '{}',
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // API密钥
  `CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    key_prefix VARCHAR(50),
    permissions JSONB DEFAULT '["read"]',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,

  // 审计日志
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
];

const INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id)',
  'CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)',
  'CREATE INDEX IF NOT EXISTS idx_leads_intention ON leads(intention_level)',
  'CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email)',
  'CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone)',
  'CREATE INDEX IF NOT EXISTS idx_conversations_tenant ON conversations(tenant_id)',
  'CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations(lead_id)',
  'CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status)',
  'CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)',
  'CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_knowledge_docs_tenant ON knowledge_documents(tenant_id)',
  'CREATE INDEX IF NOT EXISTS idx_knowledge_faqs_tenant ON knowledge_faqs(tenant_id)',
  'CREATE INDEX IF NOT EXISTS idx_emails_tenant ON emails(tenant_id)',
  'CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id)',
  'CREATE INDEX IF NOT EXISTS idx_emails_lead ON emails(lead_id)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read)',
  'CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id)',
  'CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at)',
];

async function initDatabase() {
  console.log('[DB] 开始初始化数据库...');

  try {
    // 创建 pgvector 扩展（如果需要向量搜索）
    try {
      await db.query('CREATE EXTENSION IF NOT EXISTS vector');
      console.log('[DB] pgvector 扩展已启用');
    } catch (e) {
      console.log('[DB] pgvector 扩展不可用，向量搜索功能将受限:', e.message);
    }

    // 创建表
    for (const sql of TABLES) {
      try {
        await db.query(sql);
        const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
        if (tableName) {
          console.log(`[DB] 表已创建/已存在: ${tableName[1]}`);
        }
      } catch (e) {
        console.error('[DB] 创建表失败:', e.message);
      }
    }

    // 创建索引
    for (const sql of INDEXES) {
      try {
        await db.query(sql);
      } catch (e) {
        console.error('[DB] 创建索引失败:', e.message);
      }
    }

    console.log('[DB] 数据库初始化完成');
    return true;
  } catch (e) {
    console.error('[DB] 数据库初始化失败:', e.message);
    return false;
  }
}

// 如果直接运行此脚本，则执行初始化
if (require.main === module) {
  const config = {
    enabled: process.env.DATABASE_ENABLED === 'true',
    connectionString: process.env.DATABASE_URL,
  };

  db.init(config);

  setTimeout(async () => {
    if (db.isEnabled()) {
      await initDatabase();
      await db.close();
      process.exit(0);
    } else {
      console.log('[DB] 数据库未启用，跳过初始化');
      process.exit(0);
    }
  }, 2000);
}

module.exports = { initDatabase, TABLES, INDEXES };
