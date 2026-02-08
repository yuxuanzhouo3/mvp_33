import { createClient } from '@/lib/supabase/server'
import { User } from '@/lib/types'

export async function getGroupMembers(groupId: string): Promise<User[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('conversation_members')
    .select(`
      user_id,
      role,
      is_muted,
      can_send_messages,
      join_status,
      users (*)
    `)
    .eq('conversation_id', groupId)
    .eq('join_status', 'joined')

  if (error || !data) return []

  return data.map(m => ({
    ...m.users,
    role: m.role,
    is_muted: m.is_muted,
    can_send_messages: m.can_send_messages
  })) as User[]
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
  const supabase = await createClient()

  const { error } = await supabase
    .from('conversation_members')
    .update({ role })
    .eq('conversation_id', groupId)
    .eq('user_id', userId)

  return !error
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
  const supabase = await createClient()

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
  const supabase = await createClient()

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
