import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { User } from '@/lib/types'

export async function getGroupMembers(groupId: string): Promise<User[]> {
  const db = getCloudBaseDb()
  if (!db) return []

  try {
    const membersRes = await db.collection('conversation_members')
      .where({
        conversation_id: groupId,
        join_status: 'joined'
      })
      .get()

    const members = membersRes.data || []
    if (members.length === 0) return []

    // 获取用户详情
    const userIds = members.map((m: any) => m.user_id).filter(Boolean)
    if (userIds.length === 0) return []

    const usersRes = await db.collection('users')
      .where({
        id: db.command.in(userIds)
      })
      .get()

    const users = usersRes.data || []

    // 合并成员信息和用户信息
    return members.map((m: any) => {
      const user = users.find((u: any) => u.id === m.user_id)
      return {
        id: m.user_id,
        email: user?.email || '',
        username: user?.username || '',
        full_name: user?.full_name || user?.name || '',
        avatar_url: user?.avatar_url || null,
        role: m.role,
        is_muted: m.is_muted || false,
        can_send_messages: m.can_send_messages !== false,
        status: user?.status || 'offline',
        region: 'cn'
      } as User
    })
  } catch (error) {
    console.error('[CloudBase getGroupMembers] 错误:', error)
    return []
  }
}

export async function addGroupMembers(
  groupId: string,
  userIds: string[],
  invitedBy: string
): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    const now = new Date().toISOString()

    for (const userId of userIds) {
      await db.collection('conversation_members').add({
        conversation_id: groupId,
        user_id: userId,
        role: 'member',
        join_status: 'joined',
        invited_by: invitedBy,
        created_at: now,
        region: 'cn'
      })
    }

    return true
  } catch (error) {
    console.error('[CloudBase addGroupMembers] 错误:', error)
    return false
  }
}

export async function updateMemberRole(
  groupId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    const res = await db.collection('conversation_members')
      .where({
        conversation_id: groupId,
        user_id: userId
      })
      .get()

    if (!res.data || res.data.length === 0) return false

    const doc = res.data[0]
    await db.collection('conversation_members')
      .doc(doc._id)
      .update({
        role,
        updated_at: new Date().toISOString()
      })

    return true
  } catch (error) {
    console.error('[CloudBase updateMemberRole] 错误:', error)
    return false
  }
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
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    const res = await db.collection('conversation_members')
      .where({
        conversation_id: groupId,
        user_id: userId
      })
      .get()

    if (!res.data || res.data.length === 0) return false

    const doc = res.data[0]
    await db.collection('conversation_members')
      .doc(doc._id)
      .update({
        ...permissions,
        updated_at: new Date().toISOString()
      })

    return true
  } catch (error) {
    console.error('[CloudBase updateMemberPermissions] 错误:', error)
    return false
  }
}

export async function removeGroupMember(
  groupId: string,
  userId: string
): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    const res = await db.collection('conversation_members')
      .where({
        conversation_id: groupId,
        user_id: userId
      })
      .get()

    if (!res.data || res.data.length === 0) return false

    const doc = res.data[0]
    await db.collection('conversation_members')
      .doc(doc._id)
      .remove()

    return true
  } catch (error) {
    console.error('[CloudBase removeGroupMember] 错误:', error)
    return false
  }
}

export async function transferOwnership(
  groupId: string,
  oldOwnerId: string,
  newOwnerId: string
): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    // 更新原群主为管理员
    const oldOwnerRes = await db.collection('conversation_members')
      .where({
        conversation_id: groupId,
        user_id: oldOwnerId
      })
      .get()

    if (oldOwnerRes.data && oldOwnerRes.data.length > 0) {
      await db.collection('conversation_members')
        .doc(oldOwnerRes.data[0]._id)
        .update({ role: 'admin' })
    }

    // 更新新群主
    const newOwnerRes = await db.collection('conversation_members')
      .where({
        conversation_id: groupId,
        user_id: newOwnerId
      })
      .get()

    if (!newOwnerRes.data || newOwnerRes.data.length === 0) return false

    await db.collection('conversation_members')
      .doc(newOwnerRes.data[0]._id)
      .update({ role: 'owner' })

    return true
  } catch (error) {
    console.error('[CloudBase transferOwnership] 错误:', error)
    return false
  }
}
