/**
 * User Service Interface
 * 用户服务接口 - 定义用户相关操作的通用方法签名
 *
 * 实现类：
 * - SupabaseUserService (国际版)
 * - CloudBaseUserService (国内版)
 */

import { User } from '@/lib/types'
import {
  UserPrivacySettings,
  UpdatePrivacySettingsRequest,
  BlockedUser,
  CreateBlockedUserRequest,
  Report,
  CreateReportRequest,
  UpdateReportRequest,
  ContactRelation,
} from './types'

export interface IUserService {
  // ========== 用户基础操作 ==========

  /**
   * 根据 ID 获取用户
   */
  getUserById(userId: string): Promise<User | null>

  /**
   * 批量获取用户
   */
  getUsersByIds(userIds: string[]): Promise<User[]>

  // ========== 隐私设置操作 ==========

  /**
   * 获取用户隐私设置
   */
  getPrivacySettings(userId: string): Promise<UserPrivacySettings>

  /**
   * 更新用户隐私设置
   */
  updatePrivacySettings(
    userId: string,
    settings: UpdatePrivacySettingsRequest
  ): Promise<UserPrivacySettings>

  // ========== 拉黑操作 ==========

  /**
   * 拉黑用户
   * @param blockerId 发起拉黑的用户
   * @param request 拉黑请求
   */
  blockUser(blockerId: string, request: CreateBlockedUserRequest): Promise<BlockedUser>

  /**
   * 取消拉黑
   * @param blockerId 发起拉黑的用户
   * @param blockedUserId 被拉黑的用户
   */
  unblockUser(blockerId: string, blockedUserId: string): Promise<void>

  /**
   * 获取用户的拉黑列表
   */
  getBlockedUsers(userId: string): Promise<BlockedUser[]>

  /**
   * 检查两个用户之间是否存在拉黑关系（双向）
   * A 拉黑了 B，或 B 拉黑了 A，都返回 true
   */
  checkBlockRelation(userId1: string, userId2: string): Promise<boolean>

  // ========== 举报操作 ==========

  /**
   * 举报用户
   */
  reportUser(reporterId: string, request: CreateReportRequest): Promise<Report>

  /**
   * 获取用户提交的举报列表
   */
  getReportsByReporter(reporterId: string): Promise<Report[]>

  /**
   * 获取举报详情
   */
  getReportById(reportId: string): Promise<Report | null>

  // ========== 管理员举报操作 ==========

  /**
   * 获取所有举报列表（管理员）
   */
  getAllReports(status?: string): Promise<Report[]>

  /**
   * 更新举报状态（管理员）
   */
  updateReport(
    reportId: string,
    adminId: string,
    request: UpdateReportRequest
  ): Promise<Report>

  // ========== 联系人关系 ==========

  /**
   * 检查两个用户是否为好友（已接受的联系关系）
   */
  checkFriendRelation(userId1: string, userId2: string): Promise<boolean>

  /**
   * 获取用户的好友列表
   */
  getContacts(userId: string): Promise<ContactRelation[]>
}
