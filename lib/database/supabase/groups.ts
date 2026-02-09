import { createClient } from '@/lib/supabase/server'
import { Conversation } from '@/lib/types'

export async function createGroup(
  creatorId: string,
  userIds: string[],
  workspaceId: string
): Promise<{ groupId: string } | null> {
  console.log('[createGroup] 开始创建群聊', {
    creatorId,
    userIds,
    userIdsCount: userIds.length,
    workspaceId
  })

  const supabase = await createClient()

  // 生成群名称（取前3个成员名称）
  console.log('[createGroup] 查询用户名称')
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('full_name')
    .in('id', userIds.slice(0, 3))

  if (usersError) {
    console.error('[createGroup] 查询用户名称失败', usersError)
  }

  const groupName = users?.map(u => u.full_name).join('、') || 'New Group'
  console.log('[createGroup] 群名称', { groupName, usersCount: users?.length })

  // 创建群聊
  console.log('[createGroup] 插入 conversations 表')
  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert({
      workspace_id: workspaceId,
      type: 'group',
      name: groupName,
      created_by: creatorId,
      is_private: false
    })
    .select('id')
    .single()

  if (error) {
    console.error('[createGroup] 创建群聊失败 - conversations 插入错误', {
      error,
      errorMessage: error.message,
      errorDetails: error.details,
      errorHint: error.hint
    })
    return null
  }

  if (!conversation) {
    console.error('[createGroup] 创建群聊失败 - conversation 为空')
    return null
  }

  console.log('[createGroup] 群聊创建成功', { conversationId: conversation.id })

  // 批量插入成员 - 使用 SECURITY DEFINER 函数绕过 RLS
  const members = [
    { user_id: creatorId, role: 'owner' },
    ...userIds.map(uid => ({ user_id: uid, role: 'member' }))
  ]

  console.log('[createGroup] 调用 insert_conversation_members 函数', { membersCount: members.length })
  const { error: membersError } = await supabase.rpc('insert_conversation_members', {
    p_conversation_id: conversation.id,
    p_members: members
  })

  if (membersError) {
    console.error('[createGroup] 插入成员失败', {
      error: membersError,
      errorMessage: membersError.message,
      errorDetails: membersError.details,
      errorHint: membersError.hint
    })
    return null
  }

  console.log('[createGroup] 成员插入成功')
  return { groupId: conversation.id }
}

export async function getGroupInfo(groupId: string): Promise<Conversation | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', groupId)
    .eq('type', 'group')
    .single()

  if (error || !data) return null
  return data as Conversation
}

export async function updateGroupSettings(
  groupId: string,
  updates: { name?: string; settings?: any }
): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', groupId)

  return !error
}

export async function deleteGroup(groupId: string): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', groupId)

  return !error
}
