import { getCloudBaseDb } from './client'
import { User, ConversationWithDetails, Message, MessageWithSender } from '@/lib/types'

// Basic CloudBase conversation + message support for CN region users

export type CloudBaseConversationType = 'direct' | 'channel' | 'group'

interface CreateConversationInput {
  type: CloudBaseConversationType
  memberIds: string[]
  name?: string | null
  description?: string | null
  isPrivate?: boolean
  createdBy: string
}

export async function createConversationCN(input: CreateConversationInput): Promise<ConversationWithDetails> {
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

export async function getUserConversationsCN(userId: string): Promise<ConversationWithDetails[]> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  // 1) find memberships
  const membersRes = await db.collection('conversation_members')
    .where({ user_id: userId, region: 'cn' })
    .get()

  const memberships = membersRes.data || []
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

  // 3) fetch members for these conversations
  const allMembersRes = await db.collection('conversation_members')
    .where({
      conversation_id: db.command.in(convIds),
      region: 'cn',
    })
    .get()

  const memberDocs = allMembersRes.data || []

  // 4) fetch last messages for each conversation（用于左侧列表显示“最后一条消息”）
  const messagesRes = await db.collection('messages')
    .where({
      conversation_id: db.command.in(convIds),
      region: 'cn',
    })
    .orderBy('created_at', 'desc')
    .get()

  const messageDocs = messagesRes.data || []

  // 对每个会话取“最新的一条消息”
  const lastMessageByConv = new Map<string, any>()
  for (const m of messageDocs) {
    const cid = m.conversation_id
    if (!cid) continue
    if (!lastMessageByConv.has(cid)) {
      lastMessageByConv.set(cid, m)
    }
  }

  // 5) build map convId -> members
  const membersByConv = new Map<string, any[]>()
  memberDocs.forEach((m: any) => {
    const cid = m.conversation_id
    if (!cid) return
    if (!membersByConv.has(cid)) membersByConv.set(cid, [])
    membersByConv.get(cid)!.push(m)
  })

  // NOTE: we don't expand full user objects here以保持简单，
  // 左侧会话列表只需要 last_message 的基本内容即可。
  const result: ConversationWithDetails[] = convs.map((c: any) => ({
    id: c._id,
    workspace_id: null,
    type: c.type,
    name: c.name || null,
    description: c.description || null,
    is_private: c.is_private ?? (c.type === 'direct'),
    created_by: c.created_by,
    created_at: c.created_at,
    last_message_at: (lastMessageByConv.get(c._id)?.created_at as string) || c.last_message_at || c.created_at,
    members: (membersByConv.get(c._id) || []).map((m: any) => ({
      id: m.user_id,
    })) as any,
    unread_count: 0,
    last_message: (() => {
      const m = lastMessageByConv.get(c._id)
      if (!m) return undefined
      return {
        id: m._id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        content: m.content || '',
        type: m.type || 'text',
        reactions: Array.isArray(m.reactions) ? m.reactions : [],
        is_edited: !!m.is_edited,
        is_deleted: !!m.is_deleted,
        is_recalled: !!m.is_recalled,
        created_at: m.created_at,
        updated_at: m.updated_at || m.created_at,
        metadata: m.metadata || null,
      }
    })(),
  }))

  return result
}

export async function getMessagesCN(conversationId: string): Promise<MessageWithSender[]> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  const res = await db.collection('messages')
    .where({
      conversation_id: conversationId,
      region: 'cn',
    })
    .orderBy('created_at', 'asc')
    .get()

  const docs = res.data || []

  return docs.map((m: any) => ({
    id: m._id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id,
    sender: { id: m.sender_id } as any,
    content: m.content || '',
    type: m.type || 'text',
    reactions: Array.isArray(m.reactions) ? m.reactions : [],
    is_edited: !!m.is_edited,
    is_deleted: !!m.is_deleted,
    is_recalled: !!m.is_recalled,
    created_at: m.created_at,
    updated_at: m.updated_at || m.created_at,
    metadata: m.metadata || null,
  }))
}

export async function createMessageCN(
  conversationId: string,
  senderId: string,
  content: string,
  type: string = 'text',
  metadata?: any
): Promise<MessageWithSender> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  const now = new Date().toISOString()

  const msgDoc: any = {
    conversation_id: conversationId,
    sender_id: String(senderId || ''), // Ensure sender_id is always stored as string
    content,
    type,
    metadata: metadata || null,
    reactions: [],
    is_edited: false,
    is_deleted: false,
    is_recalled: false,
    created_at: now,
    updated_at: now,
    region: 'cn',
  }

  const res = await db.collection('messages').add(msgDoc)
  const msgId = res.id || res._id

  // update conversation last_message_at
  try {
    await db.collection('conversations')
      .doc(conversationId)
      .update({ last_message_at: now })
  } catch {}

  return {
    id: msgId,
    conversation_id: conversationId,
    sender_id: senderId,
    sender: { id: senderId } as any,
    content,
    type: type as any,
    reactions: [],
    is_edited: false,
    is_deleted: false,
    is_recalled: false,
    created_at: now,
    updated_at: now,
    metadata: metadata || null,
  }
}

export async function updateMessageCN(messageId: string, content: string): Promise<MessageWithSender | null> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  const now = new Date().toISOString()
  await db.collection('messages')
    .doc(messageId)
    .update({
      content,
      is_edited: true,
      updated_at: now,
    })

  const res = await db.collection('messages')
    .doc(messageId)
    .get()

  const m = res?.data || res
  if (!m) return null

  return {
    id: m._id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id,
    sender: { id: m.sender_id } as any,
    content: m.content || '',
    type: m.type || 'text',
    reactions: Array.isArray(m.reactions) ? m.reactions : [],
    is_edited: !!m.is_edited,
    is_deleted: !!m.is_deleted,
    is_recalled: !!m.is_recalled,
    created_at: m.created_at,
    updated_at: m.updated_at || now,
    metadata: m.metadata || null,
  }
}

export async function deleteMessageCN(messageId: string): Promise<MessageWithSender | null> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  const now = new Date().toISOString()
  await db.collection('messages')
    .doc(messageId)
    .update({
      is_deleted: true,
      updated_at: now,
    })

  return updateMessageCN(messageId, '')
}

export async function recallMessageCN(messageId: string): Promise<MessageWithSender | null> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  const now = new Date().toISOString()
  await db.collection('messages')
    .doc(messageId)
    .update({
      is_recalled: true,
      content: 'This message has been recalled',
      reactions: [], // Clear reactions when recalling
      updated_at: now,
    })

  const res = await db.collection('messages')
    .doc(messageId)
    .get()

  const m = res?.data || res
  if (!m) return null

  // Ensure dates are valid ISO strings
  const created_at = m.created_at && typeof m.created_at === 'string' ? m.created_at : now
  const updated_at = m.updated_at && typeof m.updated_at === 'string' ? m.updated_at : now

  return {
    id: m._id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id,
    sender: { id: m.sender_id } as any,
    content: m.content || 'This message has been recalled',
    type: m.type || 'text',
    reactions: [], // Always return empty reactions for recalled messages
    is_edited: !!m.is_edited,
    is_deleted: !!m.is_deleted,
    is_recalled: !!m.is_recalled,
    created_at: created_at,
    updated_at: updated_at,
    metadata: m.metadata || null,
  }
}

export async function addReactionCN(messageId: string, emoji: string, userId: string): Promise<MessageWithSender | null> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  const res = await db.collection('messages')
    .doc(messageId)
    .get()

  const m = res?.data || res
  if (!m) return null

  const reactions = Array.isArray(m.reactions) ? m.reactions : []
  const existing = reactions.find((r: any) => r.emoji === emoji)
  if (existing) {
    if (!existing.user_ids.includes(userId)) {
      existing.user_ids.push(userId)
    }
  } else {
    reactions.push({ emoji, user_ids: [userId] })
  }

  await db.collection('messages')
    .doc(messageId)
    .update({
      reactions,
      updated_at: new Date().toISOString(),
    })

  return await getMessageByIdCN(messageId)
}

export async function removeReactionCN(messageId: string, emoji: string, userId: string): Promise<MessageWithSender | null> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  const res = await db.collection('messages')
    .doc(messageId)
    .get()

  const m = res?.data || res
  if (!m) return null

  let reactions = Array.isArray(m.reactions) ? m.reactions : []
  reactions = reactions
    .map((r: any) => {
      if (r.emoji !== emoji) return r
      const remaining = (r.user_ids || []).filter((id: string) => id !== userId)
      return { ...r, user_ids: remaining }
    })
    .filter((r: any) => Array.isArray(r.user_ids) && r.user_ids.length > 0)

  await db.collection('messages')
    .doc(messageId)
    .update({
      reactions,
      updated_at: new Date().toISOString(),
    })

  return await getMessageByIdCN(messageId)
}

async function getMessageByIdCN(messageId: string): Promise<MessageWithSender | null> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')
  const res = await db.collection('messages').doc(messageId).get()
  const m = res?.data || res
  if (!m) return null
  return {
    id: m._id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id,
    sender: { id: m.sender_id } as any,
    content: m.content || '',
    type: m.type || 'text',
    reactions: Array.isArray(m.reactions) ? m.reactions : [],
    is_edited: !!m.is_edited,
    is_deleted: !!m.is_deleted,
    is_recalled: !!m.is_recalled,
    created_at: m.created_at,
    updated_at: m.updated_at || m.created_at,
    metadata: m.metadata || null,
  }
}



