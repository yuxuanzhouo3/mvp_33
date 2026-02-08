import { createClient } from '@/lib/supabase/server'
import { Conversation } from '@/lib/types'

export async function createGroup(
  creatorId: string,
  userIds: string[],
  workspaceId: string
): Promise<{ groupId: string } | null> {
  const supabase = await createClient()

  // 生成群名称（取前3个成员名称）
  const { data: users } = await supabase
    .from('users')
    .select('full_name')
    .in('id', userIds.slice(0, 3))

  const groupName = users?.map(u => u.full_name).join('、') || 'New Group'

  // 创建群聊
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

  if (error || !conversation) return null

  // 批量插入成员
  const members = [
    { conversation_id: conversation.id, user_id: creatorId, role: 'owner', join_status: 'joined' },
    ...userIds.map(uid => ({
      conversation_id: conversation.id,
      user_id: uid,
      role: 'member',
      join_status: 'joined'
    }))
  ]

  await supabase.from('conversation_members').insert(members)

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
