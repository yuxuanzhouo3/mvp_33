/**
 * CloudBase User Service
 * 国内版用户服务实现
 */

import { getCloudBaseDb } from '@/lib/cloudbase/client'
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

export class CloudBaseUserService implements IUserService {
  // ========== 用户基础操作 ==========

  async getUserById(userId: string): Promise<User | null> {
    try {
      const db = getCloudBaseDb()
      if (!db) return null

      const result = await db
        .collection('users')
        .where({ id: userId })
        .get()

      if (result.data && result.data.length > 0) {
        return this.normalizeUser(result.data[0])
      }
      return null
    } catch (error) {
      console.error('CloudBase getUserById error:', error)
      return null
    }
  }

  async getUsersByIds(userIds: string[]): Promise<User[]> {
    if (userIds.length === 0) return []
    try {
      const db = getCloudBaseDb()
      if (!db) return []

      const result = await db
        .collection('users')
        .where({ id: db.command.in(userIds) })
        .get()

      return result.data?.map(this.normalizeUser) || []
    } catch (error) {
      console.error('CloudBase getUsersByIds error:', error)
      return []
    }
  }

  private normalizeUser(userData: any): User {
    return {
      id: userData.id || userData._id,
      email: userData.email,
      username: userData.username || userData.email?.split('@')[0] || '',
      full_name: userData.full_name || userData.name || '',
      avatar_url: userData.avatar_url || null,
      auth_email: userData.auth_email || null,
      provider: userData.provider || null,
      provider_id: userData.provider_id || null,
      wechat_openid: userData.wechat_openid || null,
      wechat_unionid: userData.wechat_unionid || null,
      phone: userData.phone || undefined,
      department: userData.department || undefined,
      title: userData.title || undefined,
      status: userData.status || 'offline',
      status_message: userData.status_message || undefined,
      region: userData.region || 'cn',
      country: userData.country || null,
      subscription_type: userData.subscription_type || null,
      subscription_expires_at: userData.subscription_expires_at || null,
      created_at: userData.created_at || new Date().toISOString(),
      updated_at: userData.updated_at || new Date().toISOString(),
    }
  }

  // ========== 隐私设置操作 ==========

  async getPrivacySettings(userId: string): Promise<UserPrivacySettings> {
    try {
      const db = getCloudBaseDb()
      if (!db) return { allow_non_friend_messages: true }

      const result = await db
        .collection('users')
        .where({ id: userId })
        .field({ allow_non_friend_messages: true })
        .get()

      if (result.data && result.data.length > 0) {
        return {
          allow_non_friend_messages: result.data[0].allow_non_friend_messages ?? true,
        }
      }

      return { allow_non_friend_messages: true }
    } catch (error) {
      console.error('CloudBase getPrivacySettings error:', error)
      return { allow_non_friend_messages: true }
    }
  }

  async updatePrivacySettings(
    userId: string,
    settings: UpdatePrivacySettingsRequest
  ): Promise<UserPrivacySettings> {
    try {
      const db = getCloudBaseDb()
      if (!db) throw new Error('CloudBase not configured')

      // 查找用户文档
      const queryResult = await db
        .collection('users')
        .where({ id: userId })
        .get()

      if (!queryResult.data || queryResult.data.length === 0) {
        throw new Error(`User not found: ${userId}`)
      }

      const docId = queryResult.data[0]._id
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      }

      if (settings.allow_non_friend_messages !== undefined) {
        updateData.allow_non_friend_messages = settings.allow_non_friend_messages
      }

      await db.collection('users').doc(docId).update(updateData)

      return this.getPrivacySettings(userId)
    } catch (error: any) {
      console.error('CloudBase updatePrivacySettings error:', error)
      throw new Error(`Failed to update privacy settings: ${error.message}`)
    }
  }

  // ========== 拉黑操作 ==========

  async blockUser(blockerId: string, request: CreateBlockedUserRequest): Promise<BlockedUser> {
    try {
      const db = getCloudBaseDb()
      if (!db) throw new Error('CloudBase not configured')

      // 检查是否已经拉黑
      const existing = await db
        .collection('blocked_users')
        .where({
          blocker_id: blockerId,
          blocked_id: request.blocked_user_id,
        })
        .get()

      if (existing.data && existing.data.length > 0) {
        return this.normalizeBlockedUser(existing.data[0])
      }

      const now = new Date().toISOString()
      const result = await db.collection('blocked_users').add({
        blocker_id: blockerId,
        blocked_id: request.blocked_user_id,
        reason: request.reason || null,
        created_at: now,
      })

      return {
        id: result.id || result._id,
        blocker_id: blockerId,
        blocked_id: request.blocked_user_id,
        reason: request.reason,
        created_at: now,
      }
    } catch (error: any) {
      console.error('CloudBase blockUser error:', error)
      throw new Error(`Failed to block user: ${error.message}`)
    }
  }

  async unblockUser(blockerId: string, blockedUserId: string): Promise<void> {
    try {
      const db = getCloudBaseDb()
      if (!db) throw new Error('CloudBase not configured')

      // 查找拉黑记录
      const result = await db
        .collection('blocked_users')
        .where({
          blocker_id: blockerId,
          blocked_id: blockedUserId,
        })
        .get()

      if (result.data && result.data.length > 0) {
        const docId = result.data[0]._id
        await db.collection('blocked_users').doc(docId).remove()
      }
    } catch (error: any) {
      console.error('CloudBase unblockUser error:', error)
      throw new Error(`Failed to unblock user: ${error.message}`)
    }
  }

  async getBlockedUsers(userId: string): Promise<BlockedUser[]> {
    try {
      const db = getCloudBaseDb()
      if (!db) return []

      const result = await db
        .collection('blocked_users')
        .where({ blocker_id: userId })
        .orderBy('created_at', 'desc')
        .get()

      return result.data?.map(this.normalizeBlockedUser) || []
    } catch (error) {
      console.error('CloudBase getBlockedUsers error:', error)
      return []
    }
  }

  private normalizeBlockedUser(data: any): BlockedUser {
    return {
      id: data._id || data.id,
      blocker_id: data.blocker_id,
      blocked_id: data.blocked_id,
      reason: data.reason,
      created_at: data.created_at,
    }
  }

  async checkBlockRelation(userId1: string, userId2: string): Promise<boolean> {
    try {
      const db = getCloudBaseDb()
      if (!db) return false

      const _ = db.command

      // 双向检查
      const result = await db
        .collection('blocked_users')
        .where(
          _.or([
            { blocker_id: userId1, blocked_id: userId2 },
            { blocker_id: userId2, blocked_id: userId1 },
          ])
        )
        .limit(10)
        .get()

      if (result.data && result.data.length > 0) {
        console.log('[CloudBase] Block relations found:', result.data.map((r: any) => ({
          blocker: r.blocker_id,
          blocked: r.blocked_id,
        })))
        return true
      }

      return false
    } catch (error) {
      console.error('CloudBase checkBlockRelation error:', error)
      return false
    }
  }

  // ========== 举报操作 ==========

  async reportUser(reporterId: string, request: CreateReportRequest): Promise<Report> {
    try {
      const db = getCloudBaseDb()
      if (!db) throw new Error('CloudBase not configured')

      const now = new Date().toISOString()
      const result = await db.collection('reports').add({
        reporter_id: reporterId,
        reported_user_id: request.reported_user_id,
        type: request.type,
        description: request.description || null,
        status: 'pending',
        admin_notes: null,
        handled_by: null,
        handled_at: null,
        created_at: now,
        updated_at: now,
      })

      return {
        id: result.id || result._id,
        reporter_id: reporterId,
        reported_user_id: request.reported_user_id,
        type: request.type,
        description: request.description,
        status: 'pending',
        created_at: now,
        updated_at: now,
      }
    } catch (error: any) {
      console.error('CloudBase reportUser error:', error)
      throw new Error(`Failed to report user: ${error.message}`)
    }
  }

  async getReportsByReporter(reporterId: string): Promise<Report[]> {
    try {
      const db = getCloudBaseDb()
      if (!db) return []

      const result = await db
        .collection('reports')
        .where({ reporter_id: reporterId })
        .orderBy('created_at', 'desc')
        .get()

      return result.data?.map(this.normalizeReport) || []
    } catch (error) {
      console.error('CloudBase getReportsByReporter error:', error)
      return []
    }
  }

  async getReportById(reportId: string): Promise<Report | null> {
    try {
      const db = getCloudBaseDb()
      if (!db) return null

      const result = await db.collection('reports').doc(reportId).get()

      if (result.data) {
        return this.normalizeReport(result.data)
      }
      return null
    } catch (error) {
      console.error('CloudBase getReportById error:', error)
      return null
    }
  }

  // ========== 管理员举报操作 ==========

  async getAllReports(status?: string): Promise<Report[]> {
    try {
      const db = getCloudBaseDb()
      if (!db) return []

      let query = db.collection('reports')

      if (status) {
        query = query.where({ status })
      }

      const result = await query.orderBy('created_at', 'desc').get()

      return result.data?.map(this.normalizeReport) || []
    } catch (error) {
      console.error('CloudBase getAllReports error:', error)
      return []
    }
  }

  async updateReport(
    reportId: string,
    adminId: string,
    request: UpdateReportRequest
  ): Promise<Report> {
    try {
      const db = getCloudBaseDb()
      if (!db) throw new Error('CloudBase not configured')

      const now = new Date().toISOString()
      const updateData: Record<string, any> = {
        updated_at: now,
        handled_by: adminId,
        handled_at: now,
      }

      if (request.status) {
        updateData.status = request.status
      }
      if (request.admin_notes !== undefined) {
        updateData.admin_notes = request.admin_notes
      }

      await db.collection('reports').doc(reportId).update(updateData)

      const updated = await this.getReportById(reportId)
      if (!updated) throw new Error('Failed to fetch updated report')
      return updated
    } catch (error: any) {
      console.error('CloudBase updateReport error:', error)
      throw new Error(`Failed to update report: ${error.message}`)
    }
  }

  private normalizeReport(data: any): Report {
    return {
      id: data._id || data.id,
      reporter_id: data.reporter_id,
      reported_user_id: data.reported_user_id,
      type: data.type,
      description: data.description,
      status: data.status,
      admin_notes: data.admin_notes,
      handled_by: data.handled_by,
      handled_at: data.handled_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
  }

  // ========== 联系人关系 ==========

  async checkFriendRelation(userId1: string, userId2: string): Promise<boolean> {
    try {
      const db = getCloudBaseDb()
      if (!db) return false

      const _ = db.command

      // 检查 contacts 表
      const contactsResult = await db
        .collection('contacts')
        .where(
          _.or([
            { user_id: userId1, contact_user_id: userId2 },
            { user_id: userId2, contact_user_id: userId1 },
          ])
        )
        .where({ is_blocked: false })
        .limit(1)
        .get()

      if (contactsResult.data && contactsResult.data.length > 0) {
        return true
      }

      // 检查 contact_requests 表
      const requestsResult = await db
        .collection('contact_requests')
        .where(
          _.or([
            { sender_id: userId1, receiver_id: userId2 },
            { sender_id: userId2, receiver_id: userId1 },
          ])
        )
        .where({ status: 'accepted' })
        .limit(1)
        .get()

      return (requestsResult.data?.length ?? 0) > 0
    } catch (error) {
      console.error('CloudBase checkFriendRelation error:', error)
      return false
    }
  }

  async getContacts(userId: string): Promise<ContactRelation[]> {
    try {
      const db = getCloudBaseDb()
      if (!db) return []

      const _ = db.command

      // 从 contacts 表获取
      const contactsResult = await db
        .collection('contacts')
        .where({ user_id: userId, is_blocked: false })
        .get()

      // 从 contact_requests 获取已接受的
      const requestsResult = await db
        .collection('contact_requests')
        .where(
          _.or([
            { sender_id: userId },
            { receiver_id: userId },
          ])
        )
        .where({ status: 'accepted' })
        .get()

      const result: ContactRelation[] = []

      // 合并结果
      if (contactsResult.data) {
        contactsResult.data.forEach((c: any) => {
          result.push({
            id: c._id || c.id,
            user_id: c.user_id,
            contact_user_id: c.contact_user_id,
            status: 'accepted',
          })
        })
      }

      if (requestsResult.data) {
        requestsResult.data.forEach((r: any) => {
          const contactUserId = r.sender_id === userId ? r.receiver_id : r.sender_id
          if (!result.find((c) => c.contact_user_id === contactUserId)) {
            result.push({
              id: r._id || r.id,
              user_id: userId,
              contact_user_id: contactUserId,
              status: 'accepted',
            })
          }
        })
      }

      return result
    } catch (error) {
      console.error('CloudBase getContacts error:', error)
      return []
    }
  }
}
