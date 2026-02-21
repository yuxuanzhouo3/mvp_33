/**
 * Service Factory
 * 根据环境变量返回正确的服务实例
 *
 * 国内版 (IS_DOMESTIC_VERSION = true) → CloudBase
 * 国际版 (IS_DOMESTIC_VERSION = false) → Supabase
 */

import { IS_DOMESTIC_VERSION } from '@/config'
import { IUserService } from '@/lib/interfaces/IUserService'
import { IChatService } from '@/lib/interfaces/IChatService'
import { SupabaseUserService, SupabaseChatService } from './supabase'
import { CloudBaseUserService, CloudBaseChatService } from './cloudbase'

// 缓存服务实例（单例模式）
let userServiceInstance: IUserService | null = null
let chatServiceInstance: IChatService | null = null

/**
 * 获取用户服务实例
 * 根据 IS_DOMESTIC_VERSION 环境变量返回对应实现
 */
export function getUserService(): IUserService {
  if (userServiceInstance) {
    return userServiceInstance
  }

  if (IS_DOMESTIC_VERSION) {
    console.log('[ServiceFactory] Using CloudBase UserService (Domestic)')
    userServiceInstance = new CloudBaseUserService()
  } else {
    console.log('[ServiceFactory] Using Supabase UserService (International)')
    userServiceInstance = new SupabaseUserService()
  }

  return userServiceInstance
}

/**
 * 获取聊天服务实例
 * 根据 IS_DOMESTIC_VERSION 环境变量返回对应实现
 */
export function getChatService(): IChatService {
  if (chatServiceInstance) {
    return chatServiceInstance
  }

  if (IS_DOMESTIC_VERSION) {
    console.log('[ServiceFactory] Using CloudBase ChatService (Domestic)')
    chatServiceInstance = new CloudBaseChatService()
  } else {
    console.log('[ServiceFactory] Using Supabase ChatService (International)')
    chatServiceInstance = new SupabaseChatService()
  }

  return chatServiceInstance
}

/**
 * 重置服务实例（仅用于测试）
 */
export function resetServiceInstances(): void {
  userServiceInstance = null
  chatServiceInstance = null
}

/**
 * 获取当前使用的数据库类型
 */
export function getDatabaseProvider(): 'cloudbase' | 'supabase' {
  return IS_DOMESTIC_VERSION ? 'cloudbase' : 'supabase'
}
