/**
 * Supabase User Service
 * 国际版用户服务实现
 */

import { createClient } from '@/lib/supabase/server'
import { User } from '@/lib/types'
import { IUserService } from '@/lib/interfaces/IUserService'
import {
  UserPrivacySettings,
  UpdatePrivacySettingsRequest,
  BlockedUser,
  CreateBlockedUserRequest,
  Report,
  CreateReportRequest,
  UpdateReportRequest,
  ContactRelation,
} from '@/lib/interfaces/types'

export class SupabaseUserService implements IUserService {
  // ========== 用户基础操作 ==========

  async getUserById(userId: string): Promise<User | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (error || !data) return null
    return data as User
  }

  async getUsersByIds(userIds: string[]): Promise<User[]> {
    if (userIds.length === 0) return []
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .in('id', userIds)

    if (error || !data) return []
    return data as User[]
  }

  // ========== 隐私设置操作 ==========

  async getPrivacySettings(userId: string): Promise<UserPrivacySettings> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('users')
      .select('allow_non_friend_messages')
      .eq('id', userId)
      .single()

    // 默认允许非好友发消息
    if (error || !data) {
      return { allow_non_friend_messages: true }
    }

    return {
      allow_non_friend_messages: data.allow_non_friend_messages ?? true,
    }
  }

  async updatePrivacySettings(
    userId: string,
    settings: UpdatePrivacySettingsRequest
  ): Promise<UserPrivacySettings> {
    const supabase = await createClient()
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    }

    if (settings.allow_non_friend_messages !== undefined) {
      updateData.allow_non_friend_messages = settings.allow_non_friend_messages
    }

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)

    if (error) {
      throw new Error(`Failed to update privacy settings: ${error.message}`)
    }

    return this.getPrivacySettings(userId)
  }

  // ========== 拉黑操作 ==========

  async blockUser(blockerId: string, request: CreateBlockedUserRequest): Promise<BlockedUser> {
    const supabase = await createClient()

    // 检查是否已经拉黑
    const { data: existing } = await supabase
      .from('blocked_users')
      .select('*')
      .eq('blocker_id', blockerId)
      .eq('blocked_id', request.blocked_user_id)
      .single()

    if (existing) {
      return existing as BlockedUser
    }

    const { data, error } = await supabase
      .from('blocked_users')
      .insert({
        blocker_id: blockerId,
        blocked_id: request.blocked_user_id,
        reason: request.reason,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to block user: ${error.message}`)
    }

    return data as BlockedUser
  }

  async unblockUser(blockerId: string, blockedUserId: string): Promise<void> {
    const supabase = await createClient()
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', blockerId)
      .eq('blocked_id', blockedUserId)

    if (error) {
      throw new Error(`Failed to unblock user: ${error.message}`)
    }
  }

  async getBlockedUsers(userId: string): Promise<BlockedUser[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('blocked_users')
      .select('*')
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false })

    if (error || !data) return []
    return data as BlockedUser[]
  }

  async checkBlockRelation(userId1: string, userId2: string): Promise<boolean> {
    const supabase = await createClient()

    // 双向检查：A 拉黑了 B，或 B 拉黑了 A
    const { data, error } = await supabase
      .from('blocked_users')
      .select('id, blocker_id, blocked_id')
      .or(`and(blocker_id.eq.${userId1},blocked_id.eq.${userId2}),and(blocker_id.eq.${userId2},blocked_id.eq.${userId1})`)

    if (error) {
      console.error('[Supabase] checkBlockRelation error:', error)
      return false
    }

    if (data && data.length > 0) {
      console.log('[Supabase] Block relations found:', data.map(r => ({
        blocker: r.blocker_id,
        blocked: r.blocked_id,
      })))
      return true
    }

    return false
  }

  // ========== 举报操作 ==========

  async reportUser(reporterId: string, request: CreateReportRequest): Promise<Report> {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('reports')
      .insert({
        reporter_id: reporterId,
        reported_user_id: request.reported_user_id,
        type: request.type,
        description: request.description,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to report user: ${error.message}`)
    }

    return data as Report
  }

  async getReportsByReporter(reporterId: string): Promise<Report[]> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('reporter_id', reporterId)
      .order('created_at', { ascending: false })

    if (error || !data) return []
    return data as Report[]
  }

  async getReportById(reportId: string): Promise<Report | null> {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .eq('id', reportId)
      .single()

    if (error || !data) return null
    return data as Report
  }

  // ========== 管理员举报操作 ==========

  async getAllReports(status?: string): Promise<Report[]> {
    const supabase = await createClient()
    let query = supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error || !data) return []
    return data as Report[]
  }

  async updateReport(
    reportId: string,
    adminId: string,
    request: UpdateReportRequest
  ): Promise<Report> {
    const supabase = await createClient()

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
      handled_by: adminId,
      handled_at: new Date().toISOString(),
    }

    if (request.status) {
      updateData.status = request.status
    }
    if (request.admin_notes !== undefined) {
      updateData.admin_notes = request.admin_notes
    }

    const { data, error } = await supabase
      .from('reports')
      .update(updateData)
      .eq('id', reportId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to update report: ${error.message}`)
    }

    return data as Report
  }

  // ========== 联系人关系 ==========

  async checkFriendRelation(userId1: string, userId2: string): Promise<boolean> {
    const supabase = await createClient()

    // 检查双向联系人关系（已接受）
    const { data } = await supabase
      .from('contacts')
      .select('id')
      .or(`and(user_id.eq.${userId1},contact_user_id.eq.${userId2}),and(user_id.eq.${userId2},contact_user_id.eq.${userId1})`)
      .eq('is_blocked', false)
      .limit(1)

    // 同时检查 contact_requests 表中的已接受请求
    const { data: requests } = await supabase
      .from('contact_requests')
      .select('id')
      .or(`and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`)
      .eq('status', 'accepted')
      .limit(1)

    return (data?.length ?? 0) > 0 || (requests?.length ?? 0) > 0
  }

  async getContacts(userId: string): Promise<ContactRelation[]> {
    const supabase = await createClient()

    // 从 contacts 表获取
    const { data: contacts } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_blocked', false)

    // 从 contact_requests 获取已接受的
    const { data: acceptedRequests } = await supabase
      .from('contact_requests')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .eq('status', 'accepted')

    const result: ContactRelation[] = []

    // 合并结果
    if (contacts) {
      contacts.forEach((c) => {
        result.push({
          id: c.id,
          user_id: c.user_id,
          contact_user_id: c.contact_user_id,
          status: 'accepted',
        })
      })
    }

    if (acceptedRequests) {
      acceptedRequests.forEach((r) => {
        const contactUserId = r.sender_id === userId ? r.receiver_id : r.sender_id
        // 避免重复
        if (!result.find((c) => c.contact_user_id === contactUserId)) {
          result.push({
            id: r.id,
            user_id: userId,
            contact_user_id: contactUserId,
            status: 'accepted',
          })
        }
      })
    }

    return result
  }
}
