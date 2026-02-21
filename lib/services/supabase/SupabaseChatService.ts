/**
 * Supabase Chat Service
 * 国际版聊天服务实现
 */

import { createClient } from '@/lib/supabase/server'
import { Conversation, ConversationWithDetails, Message, User } from '@/lib/types'
import { IChatService } from '@/lib/interfaces/IChatService'
import { ChatPermissionCheckResult, WorkspaceMemberInfo } from '@/lib/interfaces/types'
import { SupabaseUserService } from './SupabaseUserService'

export class SupabaseChatService implements IChatService {
  private userService: SupabaseUserService

  constructor() {
    this.userService = new SupabaseUserService()
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
    const supabase = await createClient()

    // 查找现有会话
    const { data: existingMembers } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .in('user_id', [userId1, userId2])

    if (existingMembers && existingMembers.length >= 2) {
      // 找到两个用户共同参与的会话
      const conversationIds = existingMembers.map((m) => m.conversation_id)
      const { data: conversations } = await supabase
        .from('conversations')
        .select('*')
        .in('id', conversationIds)
        .eq('type', 'direct')
        .eq('workspace_id', workspaceId)

      if (conversations && conversations.length > 0) {
        // 验证会话确实只包含这两个用户
        for (const conv of conversations) {
          const { data: members } = await supabase
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', conv.id)

          const memberIds = members?.map((m) => m.user_id).sort()
          const expectedIds = [userId1, userId2].sort()

          if (
            memberIds?.length === 2 &&
            memberIds[0] === expectedIds[0] &&
            memberIds[1] === expectedIds[1]
          ) {
            return conv as Conversation
          }
        }
      }
    }

    // 创建新会话
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        workspace_id: workspaceId,
        type: 'direct',
        is_private: true,
        created_by: userId1,
      })
      .select()
      .single()

    if (convError || !conversation) {
      throw new Error(`Failed to create conversation: ${convError?.message}`)
    }

    // 添加成员
    const { error: membersError } = await supabase.from('conversation_members').insert([
      {
        conversation_id: conversation.id,
        user_id: userId1,
        role: 'member',
      },
      {
        conversation_id: conversation.id,
        user_id: userId2,
        role: 'member',
      },
    ])

    if (membersError) {
      throw new Error(`Failed to add conversation members: ${membersError.message}`)
    }

    return conversation as Conversation
  }

  async getConversations(userId: string): Promise<ConversationWithDetails[]> {
    const supabase = await createClient()

    // 获取用户参与的会话
    const { data: memberships } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', userId)

    if (!memberships || memberships.length === 0) return []

    const conversationIds = memberships.map((m) => m.conversation_id)

    const { data: conversations } = await supabase
      .from('conversations')
      .select('*')
      .in('id', conversationIds)
      .order('last_message_at', { ascending: false })

    if (!conversations) return []

    // 获取每个会话的详情
    const result: ConversationWithDetails[] = []
    for (const conv of conversations) {
      // 获取成员
      const { data: members } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conv.id)

      const memberIds = members?.map((m) => m.user_id) || []
      const users = await this.userService.getUsersByIds(memberIds)

      // 获取最后一条消息
      const { data: lastMessage } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      result.push({
        ...conv,
        members: users,
        unread_count: 0, // TODO: 实现未读计数
        last_message: lastMessage || undefined,
      } as ConversationWithDetails)
    }

    return result
  }

  async getConversationById(conversationId: string): Promise<ConversationWithDetails | null> {
    const supabase = await createClient()

    const { data: conversation, error } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single()

    if (error || !conversation) return null

    // 获取成员
    const { data: members } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conversationId)

    const memberIds = members?.map((m) => m.user_id) || []
    const users = await this.userService.getUsersByIds(memberIds)

    return {
      ...conversation,
      members: users,
      unread_count: 0,
    } as ConversationWithDetails
  }

  // ========== Workspace 操作 ==========

  async getUserWorkspaces(userId: string): Promise<string[]> {
    const supabase = await createClient()

    const { data } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)

    return data?.map((m) => m.workspace_id) || []
  }

  async getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberInfo[]> {
    const supabase = await createClient()

    const { data } = await supabase
      .from('workspace_members')
      .select('user_id, workspace_id, role')
      .eq('workspace_id', workspaceId)

    return (data as WorkspaceMemberInfo[]) || []
  }

  async checkWorkspaceMembership(userId: string, workspaceId: string): Promise<boolean> {
    const supabase = await createClient()

    const { data } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .limit(1)

    return (data?.length ?? 0) > 0
  }

  // ========== 消息操作 ==========

  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: Message['type'] = 'text',
    metadata?: Message['metadata']
  ): Promise<Message> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        type,
        metadata,
        reactions: [],
        is_edited: false,
        is_deleted: false,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to send message: ${error.message}`)
    }

    // 更新会话的 last_message_at
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId)

    return data as Message
  }

  async getMessages(
    conversationId: string,
    limit: number = 50,
    beforeId?: string
  ): Promise<Message[]> {
    const supabase = await createClient()

    let query = supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (beforeId) {
      const { data: beforeMsg } = await supabase
        .from('messages')
        .select('created_at')
        .eq('id', beforeId)
        .single()

      if (beforeMsg) {
        query = query.lt('created_at', beforeMsg.created_at)
      }
    }

    const { data, error } = await query

    if (error || !data) return []
    return (data as Message[]).reverse()
  }
}
