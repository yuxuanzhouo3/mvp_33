/**
 * CloudBase message database operations
 * Handles message operations in CloudBase (for China region)
 */

import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { MessageWithSender } from '@/lib/types'

function isCollectionMissingError(error: any): boolean {
  const message = String(error?.message || '')
  const code = error?.code || error?.errCode
  return (
    code === 'DATABASE_COLLECTION_NOT_EXIST' ||
    code === 'COLLECTION_NOT_EXIST' ||
    message.includes('DATABASE_COLLECTION_NOT_EXIST') ||
    message.includes('COLLECTION_NOT_EXIST') ||
    message.includes('Db or Table not exist') ||
    message.includes('not exist')
  )
}

function extractCloudBaseDoc(raw: any): any | null {
  if (!raw) return null

  const payload = raw?.data !== undefined ? raw.data : raw
  if (Array.isArray(payload)) {
    return payload[0] || null
  }
  if (payload && typeof payload === 'object') {
    return payload
  }
  return null
}

function parseMetadata(value: any): any {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return value
}

function mapMessageDocToDto(doc: any, fallbackNow?: string): MessageWithSender | null {
  if (!doc || typeof doc !== 'object') return null
  const id = String(doc._id || doc.id || '')
  if (!id) return null

  const createdAt = String(doc.created_at || fallbackNow || new Date().toISOString())
  const updatedAt = String(doc.updated_at || createdAt)
  const senderId = String(doc.sender_id || '')

  return {
    id,
    conversation_id: String(doc.conversation_id || ''),
    sender_id: senderId,
    sender: { id: senderId } as any,
    content: doc.content || '',
    type: doc.type || doc.message_type || 'text',
    reactions: Array.isArray(doc.reactions) ? doc.reactions : [],
    is_edited: !!doc.is_edited,
    is_deleted: !!doc.is_deleted,
    is_recalled: !!doc.is_recalled,
    created_at: createdAt,
    updated_at: updatedAt,
    metadata: parseMetadata(doc.metadata),
  }
}

export async function getMessages(conversationId: string): Promise<MessageWithSender[]> {
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

  const docs = Array.isArray(res?.data) ? res.data : []
  const messages = docs
    .map((doc: any) => mapMessageDocToDto(doc))
    .filter((msg: MessageWithSender | null): msg is MessageWithSender => !!msg)

  const senderIds = Array.from(
    new Set(
      messages
        .map((message: MessageWithSender) => String(message.sender_id || '').trim())
        .filter(Boolean),
    ),
  )

  if (senderIds.length === 0) {
    return messages
  }

  const usersRes = await db
    .collection('users')
    .where({
      id: db.command.in(senderIds),
    })
    .get()

  const usersById = new Map<string, any>()
  ;(usersRes?.data || []).forEach((userDoc: any) => {
    const userId = String(userDoc.id || userDoc._id || '').trim()
    if (!userId) return
    usersById.set(userId, {
      id: userId,
      email: userDoc.email || '',
      username: userDoc.username || userDoc.email?.split('@')[0] || '',
      full_name: userDoc.full_name || userDoc.name || '',
      avatar_url: userDoc.avatar_url || null,
      title: userDoc.title || undefined,
      status: userDoc.status || 'offline',
      region: userDoc.region || 'cn',
    })
  })

  return messages.map((message: MessageWithSender) => {
    const senderId = String(message.sender_id || '').trim()
    if (!senderId) return message
    const senderProfile = usersById.get(senderId)
    if (!senderProfile) return message
    return {
      ...message,
      sender: senderProfile,
    }
  })
}

export async function createMessage(
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

export async function updateMessage(
  messageId: string, 
  content?: string,
  metadata?: any
): Promise<MessageWithSender | null> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  const now = new Date().toISOString()
  const updateData: any = {
    updated_at: now,
  }
  
  if (content !== undefined) {
    updateData.content = content
    updateData.is_edited = true
  }
  
  if (metadata !== undefined) {
    updateData.metadata = metadata
  }
  
  await db.collection('messages')
    .doc(messageId)
    .update(updateData)

  const res = await db.collection('messages')
    .doc(messageId)
    .get()

  const messageDoc = extractCloudBaseDoc(res)
  return mapMessageDocToDto(messageDoc, now)
}

export async function deleteMessage(messageId: string): Promise<MessageWithSender | null> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  const now = new Date().toISOString()
  await db.collection('messages')
    .doc(messageId)
    .update({
      is_deleted: true,
      content: 'This message has been deleted',
      updated_at: now,
    })

  return await getMessageById(messageId)
}

export async function recallMessage(messageId: string): Promise<MessageWithSender | null> {
  if (!messageId) {
    console.error('recallMessage: messageId is required')
    return null
  }

  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  // First, get the message to check if it can be recalled (within 2 minutes)
  const res = await db.collection('messages')
    .doc(messageId)
    .get()

  const m = extractCloudBaseDoc(res)
  if (!m) {
    console.error('recallMessage: Message not found:', messageId)
    return null
  }

  // Check if message is already recalled or deleted
  if (m.is_recalled || m.is_deleted) {
    return null
  }

  // Check if message was sent within the last 2 minutes (120 seconds)
  const messageTime = new Date(m.created_at).getTime()
  const now = Date.now()
  const timeDiff = (now - messageTime) / 1000 // seconds

  if (timeDiff > 120) {
    // Message is too old to recall
    return null
  }

  // Update message to recalled status
  const updateTime = new Date().toISOString()
  await db.collection('messages')
    .doc(messageId)
    .update({
      is_recalled: true,
      content: 'This message has been recalled',
      updated_at: updateTime,
    })

  const updatedRes = await db.collection('messages')
    .doc(messageId)
    .get()

  const updatedM = extractCloudBaseDoc(updatedRes)
  if (!updatedM) {
    console.error('recallMessage: Updated message not found')
    return null
  }

  return mapMessageDocToDto(updatedM, updateTime)
}

export async function addReaction(messageId: string, emoji: string, userId: string): Promise<MessageWithSender | null> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  const res = await db.collection('messages')
    .doc(messageId)
    .get()

  const m = extractCloudBaseDoc(res)
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

  return await getMessageById(messageId)
}

export async function removeReaction(messageId: string, emoji: string, userId: string): Promise<MessageWithSender | null> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  const res = await db.collection('messages')
    .doc(messageId)
    .get()

  const m = extractCloudBaseDoc(res)
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

  return await getMessageById(messageId)
}

async function getMessageById(messageId: string): Promise<MessageWithSender | null> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')
  const res = await db.collection('messages').doc(messageId).get()
  const m = extractCloudBaseDoc(res)
  return mapMessageDocToDto(m)
}

export async function hideMessage(messageId: string, userId: string): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  try {
    // Check if already hidden
    const existingRes = await db.collection('hidden_messages')
      .where({
        user_id: userId,
        message_id: messageId,
        region: 'cn',
      })
      .get()

    if (existingRes.data && existingRes.data.length > 0) {
      // Already hidden
      return true
    }

    // Add to hidden_messages
    await db.collection('hidden_messages').add({
      user_id: userId,
      message_id: messageId,
      region: 'cn',
      created_at: new Date().toISOString(),
    })

    return true
  } catch (error) {
    if (isCollectionMissingError(error)) {
      // Graceful fallback: hiding is optional; if collection is missing, treat as no-op.
      console.warn('hideMessage: hidden_messages collection not found, skip hide operation')
      return true
    }
    console.error('hideMessage error:', error)
    return false
  }
}

export async function unhideMessage(messageId: string, userId: string): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) throw new Error('CloudBase not configured')

  try {
    // Find and delete the hidden_messages entry
    const existingRes = await db.collection('hidden_messages')
      .where({
        user_id: userId,
        message_id: messageId,
        region: 'cn',
      })
      .get()

    if (existingRes.data && existingRes.data.length > 0) {
      for (const doc of existingRes.data) {
        await db.collection('hidden_messages').doc(doc._id).remove()
      }
    }

    return true
  } catch (error) {
    if (isCollectionMissingError(error)) {
      // Graceful fallback: unhide should not fail if collection is absent.
      console.warn('unhideMessage: hidden_messages collection not found, skip unhide operation')
      return true
    }
    console.error('unhideMessage error:', error)
    return false
  }
}



