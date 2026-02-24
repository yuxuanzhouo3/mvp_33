/**
 * Supabase 盲区消息数据库操作
 * 国际版 (Global) 使用
 */

import { createClient } from '@/lib/supabase/server'
import { BlindZoneMessage, BlindZoneMessageDisplay } from '@/lib/types'

export async function getBlindZoneMessages(workspaceId: string): Promise<BlindZoneMessageDisplay[]> {
  const supabase = await createClient()

  try {
    const { data: messages, error } = await supabase
      .from('blind_zone_messages')
      .select('id, workspace_id, content, type, metadata, is_deleted, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('[Supabase] getBlindZoneMessages error:', error)
      return []
    }

    return (messages || []).map(m => ({
      id: m.id,
      workspace_id: m.workspace_id,
      content: m.content,
      type: m.type || 'text',
      metadata: m.metadata,
      is_deleted: m.is_deleted,
      created_at: m.created_at,
      updated_at: m.updated_at,
    }))
  } catch (error) {
    console.error('[Supabase] getBlindZoneMessages error:', error)
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
  console.log('[Supabase] createBlindZoneMessage: 开始创建消息')
  console.log('[Supabase] createBlindZoneMessage: 参数 =', { workspaceId, senderId, content, type, metadata })

  const supabase = await createClient()

  const insertData = {
    workspace_id: workspaceId,
    sender_id: senderId,
    content,
    type,
    metadata: metadata || null,
    is_deleted: false,
  }
  console.log('[Supabase] createBlindZoneMessage: 准备插入数据 =', JSON.stringify(insertData, null, 2))

  try {
    const { data: message, error } = await supabase
      .from('blind_zone_messages')
      .insert(insertData)
      .select()
      .single()

    console.log('[Supabase] createBlindZoneMessage: 插入结果 =', { message, error })

    if (error) {
      console.error('[Supabase] createBlindZoneMessage 详细错误:', JSON.stringify({
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      }, null, 2))
      return null
    }

    console.log('[Supabase] createBlindZoneMessage: 成功, 消息 ID =', message?.id)
    return message
  } catch (error) {
    console.error('[Supabase] createBlindZoneMessage 异常:', error)
    return null
  }
}

export async function deleteBlindZoneMessage(
  messageId: string,
  adminId: string
): Promise<boolean> {
  const supabase = await createClient()

  try {
    const { error } = await supabase
      .from('blind_zone_messages')
      .update({
        is_deleted: true,
        deleted_by: adminId,
        content: 'This message has been deleted by admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId)

    return !error
  } catch (error) {
    console.error('[Supabase] deleteBlindZoneMessage error:', error)
    return false
  }
}

/**
 * 检查用户是否是工作区管理员
 */
export async function isWorkspaceAdmin(workspaceId: string, userId: string): Promise<boolean> {
  const supabase = await createClient()

  try {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle()

    return member?.role === 'owner' || member?.role === 'admin'
  } catch (error) {
    console.error('[Supabase] isWorkspaceAdmin error:', error)
    return false
  }
}

/**
 * 检查用户是否是工作区成员
 */
export async function isWorkspaceMember(workspaceId: string, userId: string): Promise<boolean> {
  const supabase = await createClient()

  try {
    const { data: member } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle()

    return !!member
  } catch (error) {
    console.error('[Supabase] isWorkspaceMember error:', error)
    return false
  }
}
