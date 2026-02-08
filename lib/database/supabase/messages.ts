/**
 * Supabase message database operations
 * Handles message operations in Supabase (for Global region)
 */

import { createClient } from '@/lib/supabase/server'
import { MessageWithSender } from '@/lib/types'

export async function getMessages(conversationId: string): Promise<MessageWithSender[]> {
  const supabase = await createClient()
  
  // OPTIMIZED: Only fetch messages, skip conversation check (it's already verified in API route)
  // This reduces one database query
  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select(`
      *,
      users (
        id,
        email,
        full_name,
        username,
        avatar_url
      )
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(1000) // Reasonable limit for chat messages

  if (messagesError) {
    console.error('getMessages: Error fetching messages:', messagesError)
    return []
  }

  if (!messages || messages.length === 0) {
    console.log('getMessages: No messages found')
    return []
  }

  console.log('getMessages: Retrieved', messages.length, 'messages from conversation:', conversationId)

  // OPTIMIZED: Map messages more efficiently
  // Pre-allocate array size for better performance
  const mappedMessages: MessageWithSender[] = []
  for (const msg of messages) {
    if (msg.users) { // Only include messages with valid sender
      mappedMessages.push({
        ...msg,
        sender: msg.users,
        reactions: Array.isArray(msg.reactions) ? msg.reactions : [],
      } as MessageWithSender)
    }
  }
  
  console.log('getMessages: Returning', mappedMessages.length, 'valid messages')
  return mappedMessages
}

export async function createMessage(
  conversationId: string,
  senderId: string,
  content: string,
  type: string = 'text',
  metadata?: any
): Promise<MessageWithSender> {
  const supabase = await createClient()
  
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      type,
      metadata: metadata || null,
      reactions: [],
      is_edited: false,
      is_deleted: false,
      is_recalled: false,
    })
    .select(`
      *,
      users (*)
    `)
    .single()

  if (error) throw error

  // Update conversation last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  return {
    ...message,
    sender: message.users,
    reactions: Array.isArray(message.reactions) ? message.reactions : [],
  } as MessageWithSender
}

export async function updateMessage(
  messageId: string,
  content?: string,
  metadata?: any
): Promise<MessageWithSender | null> {
  const supabase = await createClient()
  
  const updateData: any = {
    updated_at: new Date().toISOString(),
  }
  
  if (content !== undefined) {
    updateData.content = content
    updateData.is_edited = true
  }
  
  if (metadata !== undefined) {
    updateData.metadata = metadata
  }
  
  // 减少日志输出：只在错误时输出，避免过多日志
  // First, perform the update
  const { error: updateError } = await supabase
    .from('messages')
    .update(updateData)
    .eq('id', messageId)

  if (updateError) {
    console.error('[updateMessage] Update error:', {
      code: updateError.code,
      message: updateError.message,
      details: updateError.details,
      hint: updateError.hint,
      messageId,
    })
    return null
  }

  // Then, fetch the updated message separately (using maybeSingle to avoid PGRST116 error)
  const { data: message, error: fetchError } = await supabase
    .from('messages')
    .select(`
      *,
      users (*)
    `)
    .eq('id', messageId)
    .maybeSingle()

  // 即使读取失败（可能是RLS），只要更新成功，就返回一个基本结构
  if (fetchError || !message) {
    // 更新已经成功，即使无法读取（RLS限制），也返回一个基本结构表示更新成功
    // 使用更新后的 metadata（如果提供了）
    const returnMetadata = metadata !== undefined ? metadata : (updateData.metadata || {})
    return {
      id: messageId,
      metadata: returnMetadata,
      updated_at: updateData.updated_at,
      sender: null,
      reactions: [],
    } as any as MessageWithSender
  }

  // 如果读取成功，优先使用更新后的 metadata（确保返回最新的数据）
  // 如果更新时提供了 metadata，使用它；否则使用从数据库读取的
  const finalMetadata = metadata !== undefined ? metadata : message.metadata
  
  const returnMessage = {
    ...message,
    metadata: finalMetadata,
    sender: message.users,
    reactions: Array.isArray(message.reactions) ? message.reactions : [],
  } as MessageWithSender

  return returnMessage
}

export async function deleteMessage(
  messageId: string
): Promise<MessageWithSender | null> {
  const supabase = await createClient()
  
  const { data: message, error } = await supabase
    .from('messages')
    .update({
      is_deleted: true,
      content: 'This message has been deleted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .select(`
      *,
      users (*)
    `)
    .single()

  if (error || !message) return null

  return {
    ...message,
    sender: message.users,
    reactions: Array.isArray(message.reactions) ? message.reactions : [],
  } as MessageWithSender
}

export async function recallMessage(
  messageId: string
): Promise<MessageWithSender | null> {
  if (!messageId) {
    console.error('recallMessage: messageId is required')
    return null
  }

  const supabase = await createClient()
  
  // First, get the message to check if it can be recalled (within 2 minutes)
  const { data: message, error: fetchError } = await supabase
    .from('messages')
    .select('created_at, is_recalled, is_deleted, sender_id')
    .eq('id', messageId)
    .single()

  if (fetchError) {
    console.error('recallMessage: Error fetching message:', fetchError)
    return null
  }

  if (!message) {
    console.error('recallMessage: Message not found:', messageId)
    return null
  }

  // Check if message is already recalled or deleted
  if (message.is_recalled || message.is_deleted) {
    return null
  }

  // Check if message was sent within the last 2 minutes (120 seconds)
  const messageTime = new Date(message.created_at).getTime()
  const now = Date.now()
  const timeDiff = (now - messageTime) / 1000 // seconds

  if (timeDiff > 120) {
    // Message is too old to recall
    return null
  }

  // Update message to recalled status
  const { data: updatedMessage, error: updateError } = await supabase
    .from('messages')
    .update({
      is_recalled: true,
      content: 'This message has been recalled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .select('*')
    .single()

  if (updateError) {
    console.error('recallMessage: Error updating message:', updateError)
    return null
  }

  if (!updatedMessage) {
    console.error('recallMessage: Updated message not found')
    return null
  }

  // Fetch sender information separately
  let sender = null
  if (updatedMessage.sender_id) {
    const { data: senderData } = await supabase
      .from('users')
      .select('id, email, full_name, username, avatar_url')
      .eq('id', updatedMessage.sender_id)
      .single()
    
    sender = senderData
  }

  const fallbackSender = sender || {
    id: updatedMessage.sender_id || '',
    email: '',
    full_name: '',
    username: '',
    avatar_url: null,
  }

  return {
    ...updatedMessage,
    sender: fallbackSender,
    reactions: Array.isArray(updatedMessage.reactions) ? updatedMessage.reactions : [],
  } as MessageWithSender
}

export async function addReaction(
  messageId: string,
  emoji: string,
  userId: string
): Promise<MessageWithSender | null> {
  const supabase = await createClient()
  
  // Get current message
  const { data: message, error: fetchError } = await supabase
    .from('messages')
    .select('reactions')
    .eq('id', messageId)
    .single()

  if (fetchError || !message) return null

  const reactions = Array.isArray(message.reactions) ? message.reactions : []
  const existingReaction = reactions.find((r: any) => r.emoji === emoji)
  
  if (existingReaction) {
    if (!existingReaction.user_ids.includes(userId)) {
      existingReaction.user_ids.push(userId)
      existingReaction.count = existingReaction.user_ids.length
    }
  } else {
    reactions.push({
      emoji,
      user_ids: [userId],
      count: 1,
    })
  }

  // Update message
  const { data: updatedMessage, error } = await supabase
    .from('messages')
    .update({
      reactions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .select(`
      *,
      users (*)
    `)
    .single()

  if (error || !updatedMessage) return null

  return {
    ...updatedMessage,
    sender: updatedMessage.users,
    reactions: Array.isArray(updatedMessage.reactions) ? updatedMessage.reactions : [],
  } as MessageWithSender
}

export async function removeReaction(
  messageId: string,
  emoji: string,
  userId: string
): Promise<MessageWithSender | null> {
  const supabase = await createClient()
  
  // Get current message
  const { data: message, error: fetchError } = await supabase
    .from('messages')
    .select('reactions')
    .eq('id', messageId)
    .single()

  if (fetchError || !message) return null

  const reactions = Array.isArray(message.reactions) ? message.reactions : []
  const reaction = reactions.find((r: any) => r.emoji === emoji)
  
  if (reaction) {
    reaction.user_ids = reaction.user_ids.filter((id: string) => id !== userId)
    reaction.count = reaction.user_ids.length

    if (reaction.count === 0) {
      reactions.splice(reactions.indexOf(reaction), 1)
    }
  }

  // Update message
  const { data: updatedMessage, error } = await supabase
    .from('messages')
    .update({
      reactions,
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)
    .select(`
      *,
      users (*)
    `)
    .single()

  if (error || !updatedMessage) return null

  return {
    ...updatedMessage,
    sender: updatedMessage.users,
    reactions: Array.isArray(updatedMessage.reactions) ? updatedMessage.reactions : [],
  } as MessageWithSender
}








