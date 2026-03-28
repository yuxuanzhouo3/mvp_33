import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { Conversation } from '@/lib/types'

export async function createGroup(
  creatorId: string,
  userIds: string[],
  workspaceId: string,
  groupName?: string
): Promise<{ groupId: string } | null> {
  const db = getCloudBaseDb()
  if (!db) return null

  try {
    // 确定群名称
    let finalGroupName = groupName?.trim() || ''

    if (!finalGroupName) {
      // 如果没有提供群名，尝试从成员名称生成
      if (userIds.length > 0) {
        const userIdsToQuery = userIds.slice(0, 3)
        const usersRes = await db.collection('users')
          .where({
            id: db.command.in(userIdsToQuery)
          })
          .get()

        const users = usersRes.data || []
        finalGroupName = users.map((u: any) => u.full_name || u.name).join('、') || '新建群聊'
      } else {
        // 无成员时使用默认名称
        finalGroupName = '新建群聊'
      }
    }

    // 创建群聊
    const now = new Date().toISOString()
    const convRes = await db.collection('conversations').add({
      workspace_id: workspaceId,
      type: 'group',
      name: finalGroupName,
      created_by: creatorId,
      is_private: false,
      created_at: now,
      last_message_at: now,
      region: 'cn'
    })

    const conversationId = convRes.id || convRes._id
    if (!conversationId) return null

    // 批量插入成员
    const members = [
      {
        conversation_id: conversationId,
        user_id: creatorId,
        role: 'owner',
        join_status: 'joined',
        created_at: now,
        region: 'cn'
      },
      ...userIds.map(uid => ({
        conversation_id: conversationId,
        user_id: uid,
        role: 'member',
        join_status: 'joined',
        created_at: now,
        region: 'cn'
      }))
    ]

    for (const member of members) {
      await db.collection('conversation_members').add(member)
    }

    return { groupId: conversationId }
  } catch (error) {
    console.error('[CloudBase createGroup] 错误:', error)
    return null
  }
}

export async function getGroupInfo(groupId: string): Promise<Conversation | null> {
  const db = getCloudBaseDb()
  if (!db) return null

  try {
    const res = await db.collection('conversations')
      .where({
        _id: groupId,
        type: 'group'
      })
      .get()

    if (!res.data || res.data.length === 0) return null

    const data = res.data[0]
    return {
      id: data._id,
      workspace_id: data.workspace_id,
      type: data.type,
      name: data.name,
      description: data.description,
      avatar_url: data.avatar_url,
      is_private: data.is_private,
      created_by: data.created_by,
      created_at: data.created_at,
      last_message_at: data.last_message_at
    } as Conversation
  } catch (error) {
    console.error('[CloudBase getGroupInfo] 错误:', error)
    return null
  }
}

export async function updateGroupSettings(
  groupId: string,
  updates: { name?: string; description?: string; avatar_url?: string }
): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    // 先查找文档
    const res = await db.collection('conversations')
      .where({ _id: groupId })
      .get()

    if (!res.data || res.data.length === 0) return false

    const doc = res.data[0]
    await db.collection('conversations')
      .doc(doc._id)
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })

    return true
  } catch (error) {
    console.error('[CloudBase updateGroupSettings] 错误:', error)
    return false
  }
}

export async function deleteGroup(groupId: string): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) return false

  try {
    // 先查找文档
    const res = await db.collection('conversations')
      .where({ _id: groupId })
      .get()

    if (!res.data || res.data.length === 0) return false

    const doc = res.data[0]
    await db.collection('conversations')
      .doc(doc._id)
      .remove()

    return true
  } catch (error) {
    console.error('[CloudBase deleteGroup] 错误:', error)
    return false
  }
}
