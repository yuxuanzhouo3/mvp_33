import { createAvatar } from '@dicebear/core'
import * as collection from '@dicebear/collection'

/**
 * 基于消息ID生成 DiceBear 头像
 * 使用消息ID作为种子，保证同一消息刷新后头像一致
 * 不同消息的头像不同，实现真正的匿名
 */
export function generateBlindZoneAvatar(messageId: string): string {
  // 使用 lorelei 风格 - 抽象人物头像
  const avatar = createAvatar(collection.lorelei, {
    seed: messageId,
    size: 64,
    backgroundColor: ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'],
  })

  return avatar.toDataUri()
}

/**
 * 获取匿名显示名称
 */
export function getAnonymousName(language: 'en' | 'zh'): string {
  return language === 'zh' ? '无名氏' : 'Anonymous'
}

/**
 * 格式化盲区消息时间
 */
export function formatBlindZoneTime(dateString: string, language: 'en' | 'zh' = 'en'): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (language === 'zh') {
    if (diffMins < 1) return '刚刚'
    if (diffMins < 60) return `${diffMins}分钟前`
    if (diffHours < 24) return `${diffHours}小时前`
    if (diffDays < 7) return `${diffDays}天前`
    return date.toLocaleDateString('zh-CN')
  }

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString()
}
