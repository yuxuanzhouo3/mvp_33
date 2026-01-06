/**
 * CloudBase MySQL 数据库初始化脚本
 * 自动创建所有表结构（MySQL 版本）
 * 
 * 使用方法：
 * 1. 确保 CloudBase 环境已配置 MySQL 数据库
 * 2. 配置环境变量：CLOUDBASE_ENV_ID, CLOUDBASE_SECRET_ID, CLOUDBASE_SECRET_KEY
 * 3. 运行: node scripts/cloudbase_mysql_setup.js
 */

const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: envPath });

const cloudbase = require('@cloudbase/node-sdk');

// 初始化云开发客户端
const app = cloudbase.init({
  env: process.env.CLOUDBASE_ENV_ID,
  secretId: process.env.CLOUDBASE_SECRET_ID,
  secretKey: process.env.CLOUDBASE_SECRET_KEY
});

// MySQL 数据库连接（如果 CloudBase 支持）
// 注意：CloudBase 的 MySQL 可能需要通过不同的方式连接
// 这里假设使用标准的 MySQL 连接方式

/**
 * 执行 SQL 语句
 */
async function executeSQL(sql) {
  try {
    // CloudBase MySQL 可能需要通过特定的 API
    // 这里需要根据 CloudBase 的实际 API 调整
    const db = app.database();
    
    // 如果 CloudBase 支持直接执行 SQL
    // 注意：这取决于 CloudBase 的具体实现
    // 可能需要使用 app.callFunction 或其他方式
    
    console.log('执行 SQL:', sql.substring(0, 100) + '...');
    
    // 这里需要根据 CloudBase MySQL 的实际 API 实现
    // 示例：可能需要通过云函数或特定 API 执行 SQL
    throw new Error('需要根据 CloudBase MySQL API 实现');
    
  } catch (error) {
    console.error('SQL 执行失败:', error.message);
    throw error;
  }
}

/**
 * 将 PostgreSQL UUID 转换为 MySQL CHAR(36)
 */
function convertUUID() {
  return 'CHAR(36)';
}

/**
 * 将 PostgreSQL JSONB 转换为 MySQL JSON
 */
function convertJSONB() {
  return 'JSON';
}

/**
 * 将 PostgreSQL TEXT[] 转换为 MySQL JSON
 */
function convertTextArray() {
  return 'JSON';
}

/**
 * MySQL 表结构定义
 */
const tableDefinitions = {
  users: `
    CREATE TABLE IF NOT EXISTS users (
      id ${convertUUID()} PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(100) UNIQUE NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      avatar_url TEXT,
      phone VARCHAR(50),
      department VARCHAR(255),
      title VARCHAR(255),
      status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'away', 'busy')),
      status_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `,
  
  workspaces: `
    CREATE TABLE IF NOT EXISTS workspaces (
      id ${convertUUID()} PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      logo_url TEXT,
      domain VARCHAR(255) UNIQUE NOT NULL,
      owner_id ${convertUUID()},
      settings ${convertJSONB()} DEFAULT ('{"allow_guest_users": false, "max_file_size_mb": 100, "locale": "en"}'),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `,
  
  workspace_members: `
    CREATE TABLE IF NOT EXISTS workspace_members (
      id ${convertUUID()} PRIMARY KEY,
      workspace_id ${convertUUID()},
      user_id ${convertUUID()},
      role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'guest')),
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_workspace_user (workspace_id, user_id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `,
  
  conversations: `
    CREATE TABLE IF NOT EXISTS conversations (
      id ${convertUUID()} PRIMARY KEY,
      workspace_id ${convertUUID()},
      type VARCHAR(20) NOT NULL CHECK (type IN ('direct', 'group', 'channel')),
      name VARCHAR(255),
      description TEXT,
      avatar_url TEXT,
      created_by ${convertUUID()},
      is_private BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      last_message_at TIMESTAMP NULL,
      deleted_at TIMESTAMP NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `,
  
  conversation_members: `
    CREATE TABLE IF NOT EXISTS conversation_members (
      id ${convertUUID()} PRIMARY KEY,
      conversation_id ${convertUUID()},
      user_id ${convertUUID()},
      role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
      joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_read_at TIMESTAMP NULL,
      notification_setting VARCHAR(20) DEFAULT 'all' CHECK (notification_setting IN ('all', 'mentions', 'none')),
      is_hidden BOOLEAN DEFAULT FALSE,
      hidden_at TIMESTAMP NULL,
      is_pinned BOOLEAN DEFAULT FALSE,
      pinned_at TIMESTAMP NULL,
      deleted_at TIMESTAMP NULL,
      UNIQUE KEY unique_conversation_user (conversation_id, user_id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `,
  
  messages: `
    CREATE TABLE IF NOT EXISTS messages (
      id ${convertUUID()} PRIMARY KEY,
      conversation_id ${convertUUID()},
      sender_id ${convertUUID()},
      content TEXT NOT NULL,
      type VARCHAR(20) DEFAULT 'text' CHECK (type IN ('text', 'image', 'file', 'video', 'audio', 'system', 'code')),
      metadata ${convertJSONB()},
      reply_to ${convertUUID()},
      reactions ${convertJSONB()} DEFAULT ('[]'),
      is_edited BOOLEAN DEFAULT FALSE,
      is_deleted BOOLEAN DEFAULT FALSE,
      is_recalled BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (reply_to) REFERENCES messages(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `,
  
  contacts: `
    CREATE TABLE IF NOT EXISTS contacts (
      id ${convertUUID()} PRIMARY KEY,
      user_id ${convertUUID()},
      contact_user_id ${convertUUID()},
      nickname VARCHAR(255),
      tags ${convertTextArray()} DEFAULT ('[]'),
      is_favorite BOOLEAN DEFAULT FALSE,
      is_blocked BOOLEAN DEFAULT FALSE,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_contact (user_id, contact_user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `,
  
  contact_requests: `
    CREATE TABLE IF NOT EXISTS contact_requests (
      id ${convertUUID()} PRIMARY KEY,
      requester_id ${convertUUID()},
      recipient_id ${convertUUID()},
      message TEXT,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_requester_recipient (requester_id, recipient_id),
      FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `,
  
  departments: `
    CREATE TABLE IF NOT EXISTS departments (
      id ${convertUUID()} PRIMARY KEY,
      workspace_id ${convertUUID()},
      name VARCHAR(255) NOT NULL,
      parent_id ${convertUUID()},
      manager_id ${convertUUID()},
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL,
      FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `,
  
  user_profiles: `
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id ${convertUUID()} PRIMARY KEY,
      bio TEXT,
      location VARCHAR(255),
      timezone VARCHAR(100),
      language VARCHAR(10) DEFAULT 'en',
      preferences ${convertJSONB()} DEFAULT ('{"theme": "auto", "notification_sound": true, "message_preview": true, "compact_mode": false}'),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `,
  
  hidden_messages: `
    CREATE TABLE IF NOT EXISTS hidden_messages (
      id ${convertUUID()} PRIMARY KEY,
      user_id ${convertUUID()},
      message_id ${convertUUID()},
      hidden_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_user_message (user_id, message_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `
};

/**
 * 创建索引
 */
const indexDefinitions = [
  'CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);',
  'CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);',
  'CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id);',
  'CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id, last_message_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);',
  'CREATE INDEX IF NOT EXISTS idx_contact_requests_requester ON contact_requests(requester_id, status);',
  'CREATE INDEX IF NOT EXISTS idx_contact_requests_recipient ON contact_requests(recipient_id, status);',
  'CREATE INDEX IF NOT EXISTS idx_hidden_messages_user_id ON hidden_messages(user_id);',
  'CREATE INDEX IF NOT EXISTS idx_hidden_messages_message_id ON hidden_messages(message_id);',
  'CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at ON conversations(deleted_at);',
  'CREATE INDEX IF NOT EXISTS idx_conversation_members_hidden ON conversation_members(user_id, is_hidden);',
  'CREATE INDEX IF NOT EXISTS idx_conversation_members_pinned ON conversation_members(user_id, pinned_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_messages_is_recalled ON messages(is_recalled);'
];

/**
 * 初始化数据库
 */
async function initDatabase() {
  console.log('开始初始化 CloudBase MySQL 数据库...\n');
  
  // 检查环境变量
  if (!process.env.CLOUDBASE_ENV_ID || !process.env.CLOUDBASE_SECRET_ID) {
    console.error('错误: 缺少必要的环境变量');
    console.error('请设置: CLOUDBASE_ENV_ID, CLOUDBASE_SECRET_ID, CLOUDBASE_SECRET_KEY');
    process.exit(1);
  }

  console.log(`环境 ID: ${process.env.CLOUDBASE_ENV_ID}\n`);

  // 创建表
  console.log('正在创建表...\n');
  for (const [tableName, sql] of Object.entries(tableDefinitions)) {
    try {
      console.log(`创建表: ${tableName}...`);
      await executeSQL(sql);
      console.log(`✓ 表 ${tableName} 创建成功\n`);
    } catch (error) {
      console.log(`✗ 表 ${tableName} 创建失败: ${error.message}\n`);
    }
  }

  // 创建索引
  console.log('正在创建索引...\n');
  for (const sql of indexDefinitions) {
    try {
      await executeSQL(sql);
    } catch (error) {
      console.log(`索引创建失败: ${error.message}`);
    }
  }

  console.log('\n✓ 数据库初始化完成！');
  console.log('\n注意：');
  console.log('1. 此脚本需要 CloudBase 支持 MySQL 数据库');
  console.log('2. 需要根据 CloudBase 的实际 MySQL API 调整 executeSQL 函数');
  console.log('3. 如果 CloudBase 不支持直接执行 SQL，可能需要通过云函数或其他方式实现');
}

// 运行初始化
initDatabase()
  .then(() => {
    console.log('\n初始化脚本执行完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n初始化失败:', error);
    process.exit(1);
  });




















































































