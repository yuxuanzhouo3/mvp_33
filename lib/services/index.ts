/**
 * Services Index
 * 导出所有服务和工厂函数
 */

// 导出工厂函数（推荐使用）
export {
  getUserService,
  getChatService,
  resetServiceInstances,
  getDatabaseProvider,
} from './ServiceFactory'

// 导出具体实现（仅用于特殊场景）
export { SupabaseUserService, SupabaseChatService } from './supabase'
export { CloudBaseUserService, CloudBaseChatService } from './cloudbase'

// 导出类型
export type { IUserService } from '@/lib/interfaces/IUserService'
export type { IChatService } from '@/lib/interfaces/IChatService'
