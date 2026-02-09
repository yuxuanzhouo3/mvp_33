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
  const insertData = {
    workspace_id: workspaceId,
    type: 'group',
    name: groupName,
    created_by: creatorId,
    is_private: false
  }
  console.error('[createGroup] 即将插入 conversations 表', { insertData: JSON.stringify(insertData) })

  const { data: conversation, error } = await supabase
    .from('conversations')
    .insert(insertData)
    .select('id')
    .single()

  console.error('[createGroup] conversations 插入响应', {
    hasData: !!conversation,
    data: JSON.stringify(conversation),
    hasError: !!error,
    error: error ? JSON.stringify(error) : null
  })

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

  console.error('[createGroup] 群聊创建成功', {
    conversationId: conversation.id,
    conversationIdType: typeof conversation.id,
    conversationKeys: Object.keys(conversation)
  })

  // 批量插入成员 - 使用 SECURITY DEFINER 函数绕过 RLS
  const members = [
    { user_id: creatorId, role: 'owner' },
    ...userIds.map(uid => ({ user_id: uid, role: 'member' }))
  ]

  console.error('[createGroup] 调用 insert_conversation_members 函数', {
    membersCount: members.length,
    members: JSON.stringify(members),
    conversationId: conversation.id
  })

  const rpcParams = {
    p_conversation_id: conversation.id,
    p_members: members
  }
  console.error('[createGroup] RPC 参数', { rpcParams: JSON.stringify(rpcParams) })

  const { data: rpcData, error: membersError } = await supabase.rpc('insert_conversation_members', rpcParams)

  console.error('[createGroup] RPC 响应', {
    hasData: !!rpcData,
    data: JSON.stringify(rpcData),
    hasError: !!membersError,
    error: membersError ? JSON.stringify(membersError) : null
  })

  if (membersError) {
    console.error('[createGroup] 插入成员失败', {
      error: membersError,
      errorMessage: membersError.message,
      errorDetails: membersError.details,
      errorHint: membersError.hint,
      errorCode: membersError.code
    })
    return null
  }

  console.error('[createGroup] 成员插入成功')
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
