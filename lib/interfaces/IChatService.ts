/**
 * Chat Service Interface
 * 聊天服务接口 - 定义会话和消息相关操作的通用方法签名
 *
 * 实现类：
 * - SupabaseChatService (国际版)
 * - CloudBaseChatService (国内版)
 */

import { Conversation, ConversationWithDetails, Message, User } from '@/lib/types'
import { ChatPermissionCheckResult, WorkspaceMemberInfo } from './types'

export interface IChatService {
  // ========== 会话权限检查 ==========

  /**
   * 检查是否可以发起聊天
   * 检查流程：
   * 1. 检查是否存在拉黑关系（双向）
   * 2. 检查目标用户的隐私设置
   * 3. 检查是否为好友（如果隐私设置要求）
   */
  checkChatPermission(
    senderId: string,
    targetUserId: string,
    workspaceId: string
  ): Promise<ChatPermissionCheckResult>

  // ========== 会话操作 ==========

  /**
   * 获取或创建双人会话
   * 如果会话已存在，返回现有会话
   * 如果会话不存在，创建新会话
   */
  getOrCreateDirectConversation(
    userId1: string,
    userId2: string,
    workspaceId: string
  ): Promise<Conversation>

  /**
   * 获取用户的所有会话
   */
  getConversations(userId: string): Promise<ConversationWithDetails[]>

  /**
   * 获取会话详情
   */
  getConversationById(conversationId: string): Promise<ConversationWithDetails | null>

  // ========== Workspace 操作 ==========

  /**
   * 获取用户所属的所有 Workspace
   */
  getUserWorkspaces(userId: string): Promise<string[]>

  /**
   * 获取 Workspace 的所有成员
   */
  getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberInfo[]>

  /**
   * 检查用户是否属于某个 Workspace
   */
  checkWorkspaceMembership(userId: string, workspaceId: string): Promise<boolean>

  // ========== 消息操作 ==========

  /**
   * 发送消息
   */
  sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type?: Message['type'],
    metadata?: Message['metadata']
  ): Promise<Message>

  /**
   * 获取会话的消息列表
   */
  getMessages(
    conversationId: string,
    limit?: number,
    beforeId?: string
  ): Promise<Message[]>
}
