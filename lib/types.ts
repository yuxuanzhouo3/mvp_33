// Database types for enterprise chat application

export interface User {
  id: string
  email: string
  username: string
  full_name: string
  avatar_url?: string
  auth_email?: string | null
  provider?: string | null
  provider_id?: string | null
  wechat_openid?: string | null
  wechat_unionid?: string | null
  phone?: string
  department?: string
  title?: string
  status: 'online' | 'offline' | 'away' | 'busy'
  status_message?: string
  region?: 'cn' | 'global' // Registered region (cn = China, global = international)
  country?: string | null // Country code (e.g., 'CN', 'US')
  subscription_type?: 'free' | 'monthly' | 'yearly' | null
  subscription_expires_at?: string | null
  created_at: string
  updated_at: string
}

export interface Workspace {
  id: string
  name: string
  logo_url?: string
  domain: string
  owner_id: string
  settings: WorkspaceSettings
  created_at: string
  updated_at: string
}

export interface WorkspaceSettings {
  allow_guest_users: boolean
  max_file_size_mb: number
  retention_days?: number
  locale: 'en' | 'zh-CN' | 'zh-TW'
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member' | 'guest'
  joined_at: string
}

export interface Conversation {
  id: string
  workspace_id: string
  type: 'direct' | 'group' | 'channel'
  name?: string
  description?: string
  avatar_url?: string
  created_by: string
  is_private: boolean
  created_at: string
  updated_at: string
  last_message_at?: string
}

export interface ConversationMember {
  id: string
  conversation_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  last_read_at?: string
  notification_setting: 'all' | 'mentions' | 'none'
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  type: 'text' | 'image' | 'file' | 'video' | 'audio' | 'system' | 'code'
  metadata?: MessageMetadata
  reply_to?: string
  reactions: MessageReaction[]
  is_edited: boolean
  is_deleted: boolean
  is_recalled?: boolean
  is_pinned?: boolean
  created_at: string
  updated_at: string
}

export interface MessageMetadata {
  file_name?: string
  file_size?: number
  file_url?: string
  file_id?: string // CloudBase file ID (cloud://...), permanent identifier
  _real_file_url?: string // Permanent URL stored for debugging/download fallback
  _real_thumbnail_url?: string
  mime_type?: string
  file_type?: string
  thumbnail_url?: string
  mentions?: string[]
  code_language?: string
  code_content?: string
}

export interface MessageReaction {
  emoji: string
  user_ids: string[]
  count: number
}

export interface Contact {
  id: string
  user_id: string
  contact_user_id: string
  nickname?: string
  tags: string[]
  is_favorite: boolean
  is_blocked: boolean
  added_at: string
}

export interface Department {
  id: string
  workspace_id: string
  name: string
  parent_id?: string
  manager_id?: string
  description?: string
  created_at: string
}

// Extended types for future features
export interface UserProfile {
  user_id: string
  bio?: string
  location?: string
  timezone?: string
  language: string
  preferences: UserPreferences
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto'
  notification_sound: boolean
  message_preview: boolean
  compact_mode: boolean
}

// View models
export interface ConversationWithDetails extends Conversation {
  members: User[]
  unread_count: number
  last_message?: Message
  is_pinned?: boolean
  pinned_at?: string | null // Timestamp when conversation was pinned (for sorting)
  is_hidden?: boolean
}

export interface MessageWithSender extends Message {
  sender: User
  replied_message?: Message
  // 前端乐观更新用：表示这条消息正在发送/上传中，可以在 UI 里显示一个“加载中”的状态
  is_sending?: boolean
}
