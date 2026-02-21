/**
 * Shared types for Slack/Boss mode interfaces
 * 聊天核心逻辑从"强好友关系"转变为"基于 Workspace 的开放社交"
 */

// ========== 拉黑相关类型 ==========

/**
 * 拉黑记录
 * 双向屏蔽：A 拉黑 B 后，双方都不能互发消息
 */
export interface BlockedUser {
  id: string
  blocker_id: string      // 发起拉黑的用户
  blocked_id: string      // 被拉黑的用户
  reason?: string         // 拉黑原因（可选）
  created_at: string
}

/**
 * 创建拉黑请求
 */
export interface CreateBlockedUserRequest {
  blocked_user_id: string
  reason?: string
}

// ========== 举报相关类型 ==========

/**
 * 举报类型
 */
export type ReportType = 'spam' | 'harassment' | 'inappropriate' | 'other'

/**
 * 举报状态
 */
export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'dismissed'

/**
 * 举报记录
 */
export interface Report {
  id: string
  reporter_id: string     // 举报人
  reported_user_id: string // 被举报人
  type: ReportType
  description?: string    // 举报描述
  status: ReportStatus
  admin_notes?: string    // 管理员处理备注
  handled_by?: string     // 处理管理员 ID
  handled_at?: string     // 处理时间
  created_at: string
  updated_at: string
}

/**
 * 创建举报请求
 */
export interface CreateReportRequest {
  reported_user_id: string
  type: ReportType
  description?: string
}

/**
 * 更新举报请求（管理员使用）
 */
export interface UpdateReportRequest {
  status?: ReportStatus
  admin_notes?: string
}

// ========== 用户隐私设置类型 ==========

/**
 * 用户隐私设置
 */
export interface UserPrivacySettings {
  allow_non_friend_messages: boolean  // 是否允许非好友直接发消息，默认 true
}

/**
 * 更新隐私设置请求
 */
export interface UpdatePrivacySettingsRequest {
  allow_non_friend_messages?: boolean
}

// ========== 会话检查相关类型 ==========

/**
 * 发起聊天检查结果
 */
export interface ChatPermissionCheckResult {
  allowed: boolean
  reason?: 'blocked' | 'privacy_restricted' | 'not_in_workspace'
  message?: string
}

// ========== Workspace 相关类型 ==========

/**
 * Workspace 成员信息（简化版）
 */
export interface WorkspaceMemberInfo {
  user_id: string
  workspace_id: string
  role: 'owner' | 'admin' | 'member' | 'guest'
}

// ========== 联系人关系类型 ==========

/**
 * 联系人关系（用于检查是否为好友）
 */
export interface ContactRelation {
  id: string
  user_id: string
  contact_user_id: string
  status: 'pending' | 'accepted' | 'rejected'
}
