-- MySQL 数据库结构（用于 CloudBase MySQL）
-- 基于 Supabase PostgreSQL 结构转换

-- 注意：UUID 在 MySQL 中使用 CHAR(36) 存储
-- JSONB 转换为 JSON
-- TEXT[] 转换为 JSON

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
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

-- Workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    logo_url TEXT,
    domain VARCHAR(255) UNIQUE NOT NULL,
    owner_id CHAR(36),
    settings JSON DEFAULT ('{"allow_guest_users": false, "max_file_size_mb": 100, "locale": "en"}'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Workspace members
CREATE TABLE IF NOT EXISTS workspace_members (
    id CHAR(36) PRIMARY KEY,
    workspace_id CHAR(36),
    user_id CHAR(36),
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'guest')),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_workspace_user (workspace_id, user_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Conversations (direct messages, groups, channels)
CREATE TABLE IF NOT EXISTS conversations (
    id CHAR(36) PRIMARY KEY,
    workspace_id CHAR(36),
    type VARCHAR(20) NOT NULL CHECK (type IN ('direct', 'group', 'channel')),
    name VARCHAR(255),
    description TEXT,
    avatar_url TEXT,
    created_by CHAR(36),
    is_private BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP NULL,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Conversation members
CREATE TABLE IF NOT EXISTS conversation_members (
    id CHAR(36) PRIMARY KEY,
    conversation_id CHAR(36),
    user_id CHAR(36),
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

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id CHAR(36) PRIMARY KEY,
    conversation_id CHAR(36),
    sender_id CHAR(36),
    content TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'text' CHECK (type IN ('text', 'image', 'file', 'video', 'audio', 'system', 'code')),
    metadata JSON,
    reply_to CHAR(36),
    reactions JSON DEFAULT ('[]'),
    is_edited BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    is_recalled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (reply_to) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Contacts
CREATE TABLE IF NOT EXISTS contacts (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36),
    contact_user_id CHAR(36),
    nickname VARCHAR(255),
    tags JSON DEFAULT ('[]'),
    is_favorite BOOLEAN DEFAULT FALSE,
    is_blocked BOOLEAN DEFAULT FALSE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_contact (user_id, contact_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Contact requests
CREATE TABLE IF NOT EXISTS contact_requests (
    id CHAR(36) PRIMARY KEY,
    requester_id CHAR(36),
    recipient_id CHAR(36),
    message TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_requester_recipient (requester_id, recipient_id),
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Departments
CREATE TABLE IF NOT EXISTS departments (
    id CHAR(36) PRIMARY KEY,
    workspace_id CHAR(36),
    name VARCHAR(255) NOT NULL,
    parent_id CHAR(36),
    manager_id CHAR(36),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL,
    FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- User profiles (extended info)
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id CHAR(36) PRIMARY KEY,
    bio TEXT,
    location VARCHAR(255),
    timezone VARCHAR(100),
    language VARCHAR(10) DEFAULT 'en',
    preferences JSON DEFAULT ('{"theme": "auto", "notification_sound": true, "message_preview": true, "compact_mode": false}'),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Hidden messages
CREATE TABLE IF NOT EXISTS hidden_messages (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36),
    message_id CHAR(36),
    hidden_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_message (user_id, message_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(workspace_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_requests_requester ON contact_requests(requester_id, status);
CREATE INDEX IF NOT EXISTS idx_contact_requests_recipient ON contact_requests(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_hidden_messages_user_id ON hidden_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_hidden_messages_message_id ON hidden_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at ON conversations(deleted_at);
CREATE INDEX IF NOT EXISTS idx_conversation_members_hidden ON conversation_members(user_id, is_hidden);
CREATE INDEX IF NOT EXISTS idx_conversation_members_pinned ON conversation_members(user_id, pinned_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_is_recalled ON messages(is_recalled);




















































































