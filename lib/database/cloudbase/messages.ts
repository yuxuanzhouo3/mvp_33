/**
 * CloudBase message database operations
 * Handles message operations in CloudBase (for China region)
 */

import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { MessageWithSender } from '@/lib/types'

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

  const m = res?.data || res
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

  const updatedM = updatedRes?.data || updatedRes
  if (!updatedM) {
    console.error('recallMessage: Updated message not found')
    return null
  }

  return {
    id: updatedM._id,
    conversation_id: updatedM.conversation_id,
    sender_id: updatedM.sender_id,
    sender: { id: updatedM.sender_id } as any,
    content: updatedM.content || '',
    type: updatedM.type || 'text',
    reactions: Array.isArray(updatedM.reactions) ? updatedM.reactions : [],
    is_edited: !!updatedM.is_edited,
    is_deleted: !!updatedM.is_deleted,
    is_recalled: !!updatedM.is_recalled,
    created_at: updatedM.created_at,
    updated_at: updatedM.updated_at || updateTime,
    metadata: updatedM.metadata || null,
  }
}

export async function addReaction(messageId: string, emoji: string, userId: string): Promise<MessageWithSender | null> {
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

  return await getMessageById(messageId)
}

export async function removeReaction(messageId: string, emoji: string, userId: string): Promise<MessageWithSender | null> {
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

  return await getMessageById(messageId)
}

async function getMessageById(messageId: string): Promise<MessageWithSender | null> {
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
    console.error('unhideMessage error:', error)
    return false
  }
}




