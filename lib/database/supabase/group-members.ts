import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { User } from '@/lib/types'

export async function getGroupMembers(groupId: string): Promise<User[]> {
  console.log('[getGroupMembers] 开始查询成员', { groupId })
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('conversation_members')
    .select(`
      user_id,
      role,
      is_muted,
      can_send_messages,
      join_status,
      users!conversation_members_user_id_fkey (*)
    `)
    .eq('conversation_id', groupId)
    .eq('join_status', 'joined')

  console.log('[getGroupMembers] 查询结果', {
    hasError: !!error,
    error: error?.message,
    dataCount: data?.length || 0,
    data: data
  })

  if (error || !data) return []

  const result = data.map(m => ({
    ...m.users,
    role: m.role,
    is_muted: m.is_muted,
    can_send_messages: m.can_send_messages
  })) as User[]

  console.log('[getGroupMembers] 返回成员数量', { count: result.length })
  return result
}

export async function addGroupMembers(
  groupId: string,
  userIds: string[],
  invitedBy: string
): Promise<boolean> {
  const supabase = await createClient()

  const members = userIds.map(uid => ({
    conversation_id: groupId,
    user_id: uid,
    role: 'member',
    join_status: 'joined',
    invited_by: invitedBy
  }))

  const { error } = await supabase
    .from('conversation_members')
    .insert(members)

  return !error
}

export async function updateMemberRole(
  groupId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<boolean> {
  console.log('[updateMemberRole] 开始更新成员角色', { groupId, userId, role })

  // 使用Service Role Key绕过RLS
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await supabase
    .from('conversation_members')
    .update({ role })
    .eq('conversation_id', groupId)
    .eq('user_id', userId)
    .select()

  if (error) {
    console.error('[updateMemberRole] 更新失败', {
      error,
      errorMessage: error.message,
      errorDetails: error.details,
      errorHint: error.hint,
      errorCode: error.code
    })
    return false
  }

  console.log('[updateMemberRole] 更新成功', { data })
  return true
}

export async function updateMemberPermissions(
  groupId: string,
  userId: string,
  permissions: {
    is_muted?: boolean
    can_send_messages?: boolean
    muted_until?: string
  }
): Promise<boolean> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('conversation_members')
    .update(permissions)
    .eq('conversation_id', groupId)
    .eq('user_id', userId)

  return !error
}

export async function removeGroupMember(
  groupId: string,
  userId: string
): Promise<boolean> {
  // 使用Service Role Key绕过RLS
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { error } = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', groupId)
    .eq('user_id', userId)

  return !error
}

export async function transferOwnership(
  groupId: string,
  oldOwnerId: string,
  newOwnerId: string
): Promise<boolean> {
  // 使用Service Role Key绕过RLS
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // 更新原群主为管理员
  await supabase
    .from('conversation_members')
    .update({ role: 'admin' })
    .eq('conversation_id', groupId)
    .eq('user_id', oldOwnerId)

  // 更新新群主
  const { error } = await supabase
    .from('conversation_members')
    .update({ role: 'owner' })
    .eq('conversation_id', groupId)
    .eq('user_id', newOwnerId)

  return !error
}
