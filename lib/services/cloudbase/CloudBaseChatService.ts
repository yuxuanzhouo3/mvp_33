/**
 * CloudBase Chat Service
 * 国内版聊天服务实现
 */

import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { Conversation, ConversationWithDetails, Message, User } from '@/lib/types'
import { IChatService } from '@/lib/interfaces/IChatService'
import { ChatPermissionCheckResult, WorkspaceMemberInfo } from '@/lib/interfaces/types'
import { CloudBaseUserService } from './CloudBaseUserService'

export class CloudBaseChatService implements IChatService {
  private userService: CloudBaseUserService

  constructor() {
    this.userService = new CloudBaseUserService()
  }

  // ========== 会话权限检查 ==========

  async checkChatPermission(
    senderId: string,
    targetUserId: string,
    workspaceId: string
  ): Promise<ChatPermissionCheckResult> {
    // 1. 检查拉黑关系（双向）
    const isBlocked = await this.userService.checkBlockRelation(senderId, targetUserId)
    if (isBlocked) {
      return {
        allowed: false,
        reason: 'blocked',
        message: 'User has blocked you or you have blocked this user',
      }
    }

    // 2. 获取目标用户的隐私设置
    const privacySettings = await this.userService.getPrivacySettings(targetUserId)

    // 3. 如果允许非好友发消息，直接放行
    if (privacySettings.allow_non_friend_messages) {
      return { allowed: true }
    }

    // 4. 检查是否为好友
    const isFriend = await this.userService.checkFriendRelation(senderId, targetUserId)
    if (isFriend) {
      return { allowed: true }
    }

    // 5. 不允许非好友发消息
    return {
      allowed: false,
      reason: 'privacy_restricted',
      message: 'User only accepts messages from friends',
    }
  }

  // ========== 会话操作 ==========

  async getOrCreateDirectConversation(
    userId1: string,
    userId2: string,
    workspaceId: string
  ): Promise<Conversation> {
    try {
      const db = getCloudBaseDb()
      if (!db) throw new Error('CloudBase not configured')

      const _ = db.command

      // 查找现有的双人会话
      // 1. 找到两个用户都是成员的会话
      const membershipsResult = await db
        .collection('conversation_members')
        .where({ user_id: _.in([userId1, userId2]) })
        .get()

      if (membershipsResult.data && membershipsResult.data.length >= 2) {
        // 统计每个会话的成员数
        const conversationMemberCounts: Map<string, string[]> = new Map()
        membershipsResult.data.forEach((m: any) => {
          const convId = m.conversation_id
          if (!conversationMemberCounts.has(convId)) {
            conversationMemberCounts.set(convId, [])
          }
          conversationMemberCounts.get(convId)!.push(m.user_id)
        })

        // 找到只有这两个成员的会话
        for (const [convId, members] of conversationMemberCounts) {
          if (members.length === 2 && members.includes(userId1) && members.includes(userId2)) {
            // 获取会话详情，确认是 direct 类型
            const convResult = await db
              .collection('conversations')
              .doc(convId)
              .get()

            if (convResult.data && convResult.data.type === 'direct') {
              return this.normalizeConversation(convResult.data)
            }
          }
        }
      }

      // 创建新会话
      const now = new Date().toISOString()
      const convResult = await db.collection('conversations').add({
        workspace_id: workspaceId,
        type: 'direct',
        is_private: true,
        created_by: userId1,
        created_at: now,
        updated_at: now,
        last_message_at: null,
      })

      const conversationId = convResult.id || convResult._id

      // 添加成员
      await db.collection('conversation_members').add([
        {
          conversation_id: conversationId,
          user_id: userId1,
          role: 'member',
          joined_at: now,
        },
        {
          conversation_id: conversationId,
          user_id: userId2,
          role: 'member',
          joined_at: now,
        },
      ])

      return {
        id: conversationId!,
        workspace_id: workspaceId,
        type: 'direct',
        is_private: true,
        created_by: userId1,
        created_at: now,
        updated_at: now,
      }
    } catch (error: any) {
      console.error('CloudBase getOrCreateDirectConversation error:', error)
      throw new Error(`Failed to create conversation: ${error.message}`)
    }
  }

  private normalizeConversation(data: any): Conversation {
    return {
      id: data._id || data.id,
      workspace_id: data.workspace_id,
      type: data.type,
      name: data.name,
      description: data.description,
      avatar_url: data.avatar_url,
      created_by: data.created_by,
      is_private: data.is_private,
      created_at: data.created_at,
      updated_at: data.updated_at,
      last_message_at: data.last_message_at,
    }
  }

  async getConversations(userId: string): Promise<ConversationWithDetails[]> {
    try {
      const db = getCloudBaseDb()
      if (!db) return []

      // 获取用户参与的会话
      const membershipsResult = await db
        .collection('conversation_members')
        .where({ user_id: userId })
        .get()

      if (!membershipsResult.data || membershipsResult.data.length === 0) {
        return []
      }

      const conversationIds = membershipsResult.data.map((m: any) => m.conversation_id)

      // 获取会话详情
      const conversationsResult = await db
        .collection('conversations')
        .where({ _id: db.command.in(conversationIds) })
        .get()

      if (!conversationsResult.data) return []

      // 获取每个会话的详情
      const result: ConversationWithDetails[] = []
      for (const conv of conversationsResult.data) {
        // 获取成员
        const membersResult = await db
          .collection('conversation_members')
          .where({ conversation_id: conv._id })
          .get()

        const memberIds = membersResult.data?.map((m: any) => m.user_id) || []
        const users = await this.userService.getUsersByIds(memberIds)

        // 获取最后一条消息
        const lastMsgResult = await db
          .collection('messages')
          .where({
            conversation_id: conv._id,
            is_deleted: false,
          })
          .orderBy('created_at', 'desc')
          .limit(1)
          .get()

        result.push({
          ...this.normalizeConversation(conv),
          members: users,
          unread_count: 0,
          last_message: lastMsgResult.data?.[0]
            ? this.normalizeMessage(lastMsgResult.data[0])
            : undefined,
        })
      }

      // 按最后消息时间排序
      result.sort((a, b) => {
        const aTime = a.last_message_at || a.created_at
        const bTime = b.last_message_at || b.created_at
        return new Date(bTime).getTime() - new Date(aTime).getTime()
      })

      return result
    } catch (error) {
      console.error('CloudBase getConversations error:', error)
      return []
    }
  }

  async getConversationById(conversationId: string): Promise<ConversationWithDetails | null> {
    try {
      const db = getCloudBaseDb()
      if (!db) return null

      const convResult = await db.collection('conversations').doc(conversationId).get()

      if (!convResult.data) return null

      // 获取成员
      const membersResult = await db
        .collection('conversation_members')
        .where({ conversation_id: conversationId })
        .get()

      const memberIds = membersResult.data?.map((m: any) => m.user_id) || []
      const users = await this.userService.getUsersByIds(memberIds)

      return {
        ...this.normalizeConversation(convResult.data),
        members: users,
        unread_count: 0,
      }
    } catch (error) {
      console.error('CloudBase getConversationById error:', error)
      return null
    }
  }

  // ========== Workspace 操作 ==========

  async getUserWorkspaces(userId: string): Promise<string[]> {
    try {
      const db = getCloudBaseDb()
      if (!db) return ['techcorp'] // 默认返回 techcorp workspace

      const result = await db
        .collection('workspace_members')
        .where({ user_id: userId })
        .get()

      // 如果没有记录或集合不存在，返回默认 workspace
      if (!result.data || result.data.length === 0) {
        return ['techcorp']
      }

      return result.data.map((m: any) => m.workspace_id)
    } catch (error: any) {
      // 如果集合不存在，返回默认 workspace
      if (error.code === 'DATABASE_COLLECTION_NOT_EXIST') {
        console.log('[CloudBase] workspace_members collection not exist, using default workspace')
        return ['techcorp']
      }
      console.error('CloudBase getUserWorkspaces error:', error)
      return ['techcorp'] // 出错时返回默认 workspace
    }
  }

  async getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberInfo[]> {
    try {
      const db = getCloudBaseDb()
      if (!db) return []

      const result = await db
        .collection('workspace_members')
        .where({ workspace_id: workspaceId })
        .get()

      return (
        result.data?.map((m: any) => ({
          user_id: m.user_id,
          workspace_id: m.workspace_id,
          role: m.role,
        })) || []
      )
    } catch (error) {
      console.error('CloudBase getWorkspaceMembers error:', error)
      return []
    }
  }

  async checkWorkspaceMembership(userId: string, workspaceId: string): Promise<boolean> {
    try {
      const db = getCloudBaseDb()
      if (!db) return true // 如果数据库不可用，默认放行

      const result = await db
        .collection('workspace_members')
        .where({ user_id: userId, workspace_id: workspaceId })
        .limit(1)
        .get()

      return (result.data?.length ?? 0) > 0
    } catch (error: any) {
      // 如果集合不存在（国内版可能没有 workspace_members 集合），默认放行
      if (error.code === 'DATABASE_COLLECTION_NOT_EXIST') {
        console.log('[CloudBase] workspace_members collection not exist, skipping workspace check')
        return true
      }
      console.error('CloudBase checkWorkspaceMembership error:', error)
      return true // 出错时默认放行，避免阻止正常聊天
    }
  }

  // ========== 消息操作 ==========

  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: Message['type'] = 'text',
    metadata?: Message['metadata']
  ): Promise<Message> {
    try {
      const db = getCloudBaseDb()
      if (!db) throw new Error('CloudBase not configured')

      const now = new Date().toISOString()
      const result = await db.collection('messages').add({
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        type,
        metadata: metadata || null,
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: now,
        updated_at: now,
      })

      // 更新会话的 last_message_at
      await db
        .collection('conversations')
        .doc(conversationId)
        .update({ last_message_at: now })

      return {
        id: result.id || result._id!,
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        type,
        metadata,
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: now,
        updated_at: now,
      }
    } catch (error: any) {
      console.error('CloudBase sendMessage error:', error)
      throw new Error(`Failed to send message: ${error.message}`)
    }
  }

  async getMessages(
    conversationId: string,
    limit: number = 50,
    beforeId?: string
  ): Promise<Message[]> {
    try {
      const db = getCloudBaseDb()
      if (!db) return []

      let query = db
        .collection('messages')
        .where({
          conversation_id: conversationId,
          is_deleted: false,
        })
        .orderBy('created_at', 'desc')
        .limit(limit)

      // Note: CloudBase doesn't support cursor pagination like Supabase
      // For simplicity, we'll just use limit and order
      if (beforeId) {
        const beforeMsg = await db.collection('messages').doc(beforeId).get()
        if (beforeMsg.data) {
          query = db
            .collection('messages')
            .where({
              conversation_id: conversationId,
              is_deleted: false,
              created_at: db.command.lt(beforeMsg.data.created_at),
            })
            .orderBy('created_at', 'desc')
            .limit(limit)
        }
      }

      const result = await query.get()
      return (result.data?.map(this.normalizeMessage) || []).reverse()
    } catch (error) {
      console.error('CloudBase getMessages error:', error)
      return []
    }
  }

  private normalizeMessage(data: any): Message {
    return {
      id: data._id || data.id,
      conversation_id: data.conversation_id,
      sender_id: data.sender_id,
      content: data.content,
      type: data.type,
      metadata: data.metadata,
      reply_to: data.reply_to,
      reactions: data.reactions || [],
      is_edited: data.is_edited || false,
      is_deleted: data.is_deleted || false,
      is_recalled: data.is_recalled,
      is_pinned: data.is_pinned,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
  }
}
