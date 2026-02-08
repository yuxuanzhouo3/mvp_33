/**
 * CloudBase conversation database operations
 * Handles conversation operations in CloudBase (for China region)
 */

import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { ConversationWithDetails, User } from '@/lib/types'

export type CloudBaseConversationType = 'direct' | 'channel' | 'group'

interface CreateConversationInput {
  type: CloudBaseConversationType
  memberIds: string[]
  name?: string | null
  description?: string | null
  isPrivate?: boolean
  createdBy: string
}

export async function createConversation(input: CreateConversationInput): Promise<ConversationWithDetails> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  const now = new Date().toISOString()

  const convDoc: any = {
    type: input.type,
    name: input.name || null,
    description: input.description || null,
    is_private: input.isPrivate ?? (input.type === 'direct'),
    created_by: input.createdBy,
    created_at: now,
    last_message_at: now,
    region: 'cn',
  }

  const convRes = await db.collection('conversations').add(convDoc)
  const convId = convRes.id || convRes._id
  if (!convId) throw new Error('Failed to create conversation in CloudBase')

  const memberDocs = input.memberIds.map(userId => ({
    conversation_id: convId,
    user_id: userId,
    role: userId === input.createdBy ? 'owner' : 'member',
    created_at: now,
    region: 'cn',
  }))

  if (memberDocs.length > 0) {
    await db.collection('conversation_members').add(memberDocs)
  }

  return {
    id: convId,
    workspace_id: null,
    type: input.type,
    name: convDoc.name,
    description: convDoc.description,
    is_private: convDoc.is_private,
    created_by: input.createdBy,
    created_at: now,
    last_message_at: now,
    members: [], // filled by API when needed
    unread_count: 0,
    last_message: undefined,
  } as ConversationWithDetails
}

export async function getUserConversations(userId: string): Promise<ConversationWithDetails[]> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  // 1) find memberships (exclude deleted ones)
  // 不强制 region 过滤，兼容老数据缺少 region 字段的记录
  const membersRes = await db.collection('conversation_members')
    .where({ 
      user_id: userId,
    })
    .get()

  // Filter out deleted and hidden memberships in memory (since deleted_at/is_hidden fields may not exist in old records)
  const memberships = (membersRes.data || []).filter((m: any) => !m.deleted_at && !m.is_hidden)
  if (!memberships.length) return []

  const convIds = Array.from(new Set(memberships.map((m: any) => m.conversation_id).filter(Boolean)))
  if (!convIds.length) return []

  // 2) fetch conversations
  const convRes = await db.collection('conversations')
    .where({
      _id: db.command.in(convIds),
      region: 'cn',
    })
    .get()

  const convs = convRes.data || []

  // 3) fetch members for these conversations（同样不强制 region，兼容老数据）
  const allMembersRes = await db.collection('conversation_members')
    .where({
      conversation_id: db.command.in(convIds),
    })
    .get()

  const memberDocs = allMembersRes.data || []

  // 3b) fetch user's contacts to filter out direct conversations with non-contacts
  let contactUserIds = new Set<string>()
  try {
    const contactsRes = await db.collection('contacts')
      .where({
        user_id: userId,
      })
      .get()
    const contactsData = contactsRes?.data || []
    contactUserIds = new Set(
      contactsData
        .map((c: any) => c.contact_user_id)
        .filter(Boolean)
    )
  } catch (err) {
    console.error('Failed to load contacts for conversation filtering:', err)
    contactUserIds = new Set()
  }
  // Always include self (允许自聊)
  contactUserIds.add(userId)

  // 4) fetch last messages for each conversation（用于左侧列表显示"最后一条消息"）
  const messagesRes = await db.collection('messages')
    .where({
      conversation_id: db.command.in(convIds),
      region: 'cn',
    })
    .orderBy('created_at', 'desc')
    .get()

  const messageDocs = messagesRes.data || []

  // 对每个会话取"最新的一条消息"
  const lastMessageByConv = new Map<string, any>()
  for (const m of messageDocs) {
    const cid = m.conversation_id
    if (!cid) continue
    if (!lastMessageByConv.has(cid)) {
      lastMessageByConv.set(cid, m)
    }
  }

  // 5) build map convId -> members, and also track current user's membership info (for is_pinned)
  const membersByConv = new Map<string, any[]>()
  const currentUserMembershipByConv = new Map<string, any>() // Track current user's membership for is_pinned
  memberDocs.forEach((m: any) => {
    const cid = m.conversation_id
    if (!cid) return
    if (!membersByConv.has(cid)) membersByConv.set(cid, [])
    membersByConv.get(cid)!.push(m)
    
    // Track current user's membership info (for is_pinned, pinned_at, etc.)
    if (m.user_id === userId) {
      currentUserMembershipByConv.set(cid, m)
    }
  })

  // 6) Expand member user details so前端可以正确显示名字和头像（避免 "User"/"Unknown User"）
  const allUserIds = Array.from(
    new Set(
      memberDocs
        .map((m: any) => m.user_id)
        .filter(Boolean)
    )
  )

  let usersById = new Map<string, User>()
  if (allUserIds.length > 0) {
    const cmd = db.command
    // OPTIMIZED: Don't filter by region for users query - users may not have region field
    // This ensures we can find users even if they don't have region set
    const usersRes = await db
      .collection('users')
      .where({
        id: cmd.in(allUserIds),
      })
      .get()

    const userDocs = usersRes.data || []
    userDocs.forEach((u: any) => {
      const uid = u.id || u._id
      if (!uid) return
      const normalized: User = {
        id: uid,
        email: u.email || '',
        username: u.username || u.email?.split('@')[0] || '',
        full_name: u.full_name || u.name || '',
        avatar_url: u.avatar_url || null,
        department: u.department || undefined,
        title: u.title || undefined,
        status: u.status || 'offline',
        region: u.region || 'cn',
      }
      usersById.set(uid, normalized)
    })
  }

  const result: ConversationWithDetails[] = convs.map((c: any) => {
    const memberEntries = membersByConv.get(c._id) || []
    const members: User[] = memberEntries.map((m: any) => {
      const uid = m.user_id
      const user = uid ? usersById.get(uid) : undefined
      // 即使没查到完整用户对象，也至少保留 id，方便前端后续补充
      return (
        user || {
          id: uid,
          email: '',
          username: '',
          full_name: '',
          avatar_url: null,
          department: undefined,
          title: undefined,
          status: 'offline',
          region: 'cn',
        }
      ) as User
    })

    const lastMessageDoc = lastMessageByConv.get(c._id)

    // If this is a direct conversation and the other user is not in contacts, skip it
    if (c.type === 'direct') {
      const other = memberEntries.find((m: any) => m.user_id !== userId)
      const otherUserId = other?.user_id
      if (otherUserId && !contactUserIds.has(otherUserId)) {
        console.log(`🧹 CloudBase API: filtering direct conversation ${c._id} because user ${otherUserId} not in contacts of ${userId}`)
        return null
      }
    }

    // Get current user's membership info for this conversation (for is_pinned and pinned_at)
    const currentUserMembership = currentUserMembershipByConv.get(c._id)
    const isPinned = currentUserMembership ? Boolean(currentUserMembership.is_pinned) : false
    const pinnedAt = currentUserMembership?.pinned_at || null

    return {
      id: c._id,
      workspace_id: null,
      type: c.type,
      name: c.name || null,
      description: c.description || null,
      is_private: c.is_private ?? (c.type === 'direct'),
      created_by: c.created_by,
      created_at: c.created_at,
      last_message_at:
        (lastMessageDoc?.created_at as string) || c.last_message_at || c.created_at,
      members,
      unread_count: 0,
      is_pinned: isPinned, // Include pin status from conversation_members
      pinned_at: pinnedAt, // Include pinned_at timestamp for sorting
      last_message: lastMessageDoc
        ? {
            id: lastMessageDoc._id,
            conversation_id: lastMessageDoc.conversation_id,
            sender_id: lastMessageDoc.sender_id,
            content: lastMessageDoc.content || '',
            type: lastMessageDoc.type || 'text',
            reactions: Array.isArray(lastMessageDoc.reactions)
              ? lastMessageDoc.reactions
              : [],
            is_edited: !!lastMessageDoc.is_edited,
            is_deleted: !!lastMessageDoc.is_deleted,
            is_recalled: !!lastMessageDoc.is_recalled,
            created_at: lastMessageDoc.created_at,
            updated_at: lastMessageDoc.updated_at || lastMessageDoc.created_at,
            metadata: lastMessageDoc.metadata || null,
          }
        : undefined,
    } as ConversationWithDetails
  }).filter(Boolean) as ConversationWithDetails[]

  return result
}

export async function pinConversation(conversationId: string, userId: string): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  try {
    // Find the membership (try with region filter first, then without for backward compatibility)
    let membersRes = await db.collection('conversation_members')
      .where({
        conversation_id: conversationId,
        user_id: userId,
        region: 'cn',
      })
      .get()

    // If not found with region filter, try without region (for old records)
    if (!membersRes.data || membersRes.data.length === 0) {
      membersRes = await db.collection('conversation_members')
        .where({
          conversation_id: conversationId,
          user_id: userId,
        })
        .get()
    }

    if (!membersRes.data || membersRes.data.length === 0) {
      console.error('❌ No membership found for pin:', { conversationId, userId })
      return false
    }

    const membership = membersRes.data[0]
    await db.collection('conversation_members')
      .doc(membership._id)
      .update({
        is_pinned: true,
        pinned_at: new Date().toISOString(),
      })

    return true
  } catch (error) {
    console.error('pinConversation error:', error)
    return false
  }
}

export async function unpinConversation(conversationId: string, userId: string): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  try {
    // Find the membership (try with region filter first, then without for backward compatibility)
    let membersRes = await db.collection('conversation_members')
      .where({
        conversation_id: conversationId,
        user_id: userId,
        region: 'cn',
      })
      .get()

    // If not found with region filter, try without region (for old records)
    if (!membersRes.data || membersRes.data.length === 0) {
      membersRes = await db.collection('conversation_members')
        .where({
          conversation_id: conversationId,
          user_id: userId,
        })
        .get()
    }

    if (!membersRes.data || membersRes.data.length === 0) {
      console.error('❌ No membership found for unpin:', { conversationId, userId })
      return false
    }

    const membership = membersRes.data[0]
    await db.collection('conversation_members')
      .doc(membership._id)
      .update({
        is_pinned: false,
        pinned_at: null,
      })

    return true
  } catch (error) {
    console.error('unpinConversation error:', error)
    return false
  }
}




