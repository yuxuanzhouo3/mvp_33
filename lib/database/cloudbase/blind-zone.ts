/**
 * CloudBase 盲区消息数据库操作
 * 国内版 (CN) 使用
 */

import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { BlindZoneMessage, BlindZoneMessageDisplay } from '@/lib/types'

export async function getBlindZoneMessages(workspaceId: string): Promise<BlindZoneMessageDisplay[]> {
  console.log('[盲区DB] getBlindZoneMessages: 开始获取消息, workspaceId =', workspaceId)

  const db = getCloudBaseDb()
  if (!db) {
    console.warn('[盲区DB] getBlindZoneMessages: DB not configured')
    return []
  }

  try {
    const query = {
      workspace_id: workspaceId,
    }
    console.log('[盲区DB] getBlindZoneMessages: 查询条件 =', JSON.stringify(query, null, 2))

    const res = await db.collection('blind_zone_messages')
      .where(query)
      .orderBy('created_at', 'desc')
      .limit(200)
      .get()

    console.log('[盲区DB] getBlindZoneMessages: 查询结果长度 =', res.data?.length || 0)
    console.log('[盲区DB] getBlindZoneMessages: 原始数据 =', JSON.stringify(res.data, null, 2))

    const docs = res.data || []

    // 返回时不包含 sender_id，实现匿名
    const messages = docs.map((m: any) => ({
      id: m._id,
      workspace_id: m.workspace_id,
      content: m.content,
      type: m.type || 'text',
      metadata: m.metadata,
      is_deleted: !!m.is_deleted,
      created_at: m.created_at,
      updated_at: m.updated_at || m.created_at,
    }))

    console.log('[盲区DB] getBlindZoneMessages: 处理后消息数量 =', messages.length)
    return messages
  } catch (error) {
    console.error('[盲区DB] getBlindZoneMessages: 查询异常 =', error)
    return []
  }
}

export async function createBlindZoneMessage(
  workspaceId: string,
  senderId: string,
  content: string,
  type: string = 'text',
  metadata?: any
): Promise<BlindZoneMessage | null> {
  console.log('[盲区DB] createBlindZoneMessage: 开始创建消息')
  console.log('[盲区DB] createBlindZoneMessage: 参数 =', { workspaceId, senderId, content, type, metadata })

  const db = getCloudBaseDb()
  if (!db) {
    console.error('[盲区DB] createBlindZoneMessage: CloudBase DB 未配置')
    throw new Error('CloudBase not configured')
  }

  const now = new Date().toISOString()

  const msgDoc: any = {
    workspace_id: workspaceId,
    sender_id: senderId,
    content,
    type,
    metadata: metadata || null,
    is_deleted: false,
    created_at: now,
    updated_at: now,
    region: 'cn',
  }

  console.log('[盲区DB] createBlindZoneMessage: 准备写入文档 =', JSON.stringify(msgDoc, null, 2))

  try {
    const res = await db.collection('blind_zone_messages').add(msgDoc)
    console.log('[盲区DB] createBlindZoneMessage: 写入结果 =', JSON.stringify(res, null, 2))

    const msgId = res.id || res._id
    console.log('[盲区DB] createBlindZoneMessage: 消息 ID =', msgId)

    if (!msgId) {
      console.error('[盲区DB] createBlindZoneMessage: 未获取到消息 ID')
      return null
    }

    const result = {
      id: msgId,
      workspace_id: workspaceId,
      sender_id: senderId,
      content,
      type: type as any,
      metadata,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    }
    console.log('[盲区DB] createBlindZoneMessage: 返回结果 =', JSON.stringify(result, null, 2))
    return result
  } catch (error) {
    console.error('[盲区DB] createBlindZoneMessage: 写入异常 =', error)
    return null
  }
}

export async function deleteBlindZoneMessage(
  messageId: string,
  adminId: string
): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  try {
    await db.collection('blind_zone_messages')
      .doc(messageId)
      .update({
        is_deleted: true,
        deleted_by: adminId,
        content: 'This message has been deleted by admin',
        updated_at: new Date().toISOString(),
      })

    return true
  } catch (error) {
    console.error('[CloudBase] deleteBlindZoneMessage error:', error)
    return false
  }
}

/**
 * 检查用户是否是工作区管理员
 */
export async function isWorkspaceAdmin(workspaceId: string, userId: string): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    const res = await db.collection('workspace_members')
      .where({
        workspace_id: workspaceId,
        user_id: userId,
      })
      .limit(1)
      .get()

    const member = res.data?.[0]
    return member?.role === 'owner' || member?.role === 'admin'
  } catch (error) {
    console.error('[CloudBase] isWorkspaceAdmin error:', error)
    return false
  }
}

/**
 * 检查用户是否是工作区成员
 */
export async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  console.log('[盲区DB] isWorkspaceMember: 开始验证成员身份')
  console.log('[盲区DB] isWorkspaceMember: 参数 =', { workspaceId, userId })

  const db = getCloudBaseDb()
  if (!db) {
    console.log('[盲区DB] isWorkspaceMember: DB 未配置，返回 false')
    return false
  }

  try {
    const query = {
      workspace_id: workspaceId,
      user_id: userId,
    }
    console.log('[盲区DB] isWorkspaceMember: 查询条件 =', JSON.stringify(query, null, 2))

    const res = await db.collection('workspace_members')
      .where(query)
      .limit(1)
      .get()

    console.log('[盲区DB] isWorkspaceMember: 查询结果 =', JSON.stringify(res, null, 2))
    console.log('[盲区DB] isWorkspaceMember: 返回数据长度 =', res.data?.length || 0)

    const isMember = (res.data?.length || 0) > 0
    console.log('[盲区DB] isWorkspaceMember: 是否为成员 =', isMember)

    return isMember
  } catch (error) {
    console.error('[盲区DB] isWorkspaceMember: 查询异常 =', error)
    return false
  }
}
