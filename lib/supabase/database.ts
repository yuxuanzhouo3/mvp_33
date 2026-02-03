/**
 * Supabase database service
 * Handles all database operations for the chat application
 */

import { createClient } from './server'
import { User, Workspace, Conversation, Message, ConversationWithDetails, MessageWithSender } from '../types'

// User operations
export async function getUserById(userId: string): Promise<User | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  return data as User
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single()

  if (error || !data) return null
  return data as User
}

export async function createUser(
  userData: {
    email: string
    username: string
    full_name: string
    avatar_url?: string
    department?: string
    title?: string
    provider?: string
    provider_id?: string
  },
  userId?: string // Optional: if provided, use this ID instead of getting from session
): Promise<User> {
  const supabase = await createClient()
  
  let authUserId = userId
  
  // If userId not provided, try to get from auth session
  if (!authUserId) {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser) {
      authUserId = authUser.id
    } else {
      throw new Error('User not authenticated and userId not provided')
    }
  }

  const { data, error } = await supabase
    .from('users')
    .insert({
      id: authUserId, // Use provided or auth user ID
      email: userData.email,
      username: userData.username,
      full_name: userData.full_name,
      avatar_url: userData.avatar_url || null,
      department: userData.department || null,
      title: userData.title || null,
      status: 'online',
    })
    .select()
    .single()

  if (error) {
    // If user already exists (created by trigger), fetch it
    if (error.code === '23505') { // Unique violation
      const existingUser = await getUserByEmail(userData.email)
      if (existingUser) return existingUser
    }
    throw error
  }
  return data as User
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<User> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()

  if (error) throw error
  return data as User
}

// Workspace operations
export async function getWorkspaceById(workspaceId: string): Promise<Workspace | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single()

  if (error || !data) return null
  return data as Workspace
}

export async function getUserWorkspaces(userId: string): Promise<Workspace[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('workspace_members')
    .select(`
      workspace_id,
      workspaces (*)
    `)
    .eq('user_id', userId)

  if (error || !data) return []
  return data.map((item: any) => item.workspaces).filter(Boolean) as Workspace[]
}

// Conversation operations
export async function getUserConversations(
  userId: string,
  workspaceId: string
): Promise<ConversationWithDetails[]> {
  const supabase = await createClient()
  
  // CRITICAL: Verify the authenticated user matches the requested userId
  // This ensures RLS policies work correctly
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) {
    console.error('❌ No authenticated user found')
    return []
  }
  
  if (authUser.id !== userId) {
    console.error('❌ User ID mismatch:', { requested: userId, authenticated: authUser.id })
    return []
  }
  
  console.log('✅ Authenticated user matches requested userId:', userId)
  
  // STEP 1: Get conversation_ids and last_read_at from conversation_members (this should work with RLS)
  // CRITICAL: Only get memberships that are NOT deleted and NOT hidden by this user
  const { data: memberships, error: membersError } = await supabase
    .from('conversation_members')
    .select('conversation_id, last_read_at, is_pinned, pinned_at, is_hidden')
    .eq('user_id', userId)
    .is('deleted_at', null) // Only get memberships not deleted by this user
    .or('is_hidden.is.null,is_hidden.eq.false') // Only get memberships not hidden by this user

  if (membersError) {
    console.error('❌ Error fetching conversation memberships:', membersError)
    console.error('Error details:', { code: membersError.code, message: membersError.message, details: membersError.details })
    return []
  }

  if (!memberships || memberships.length === 0) {
    console.log('No conversation memberships found for user:', userId)
    return []
  }

  const conversationIds = memberships.map((m: any) => m.conversation_id).filter(Boolean)
  console.log(`📋 Found ${conversationIds.length} conversation memberships for user ${userId}`)
  console.log('📋 Conversation IDs:', conversationIds)

  const membershipByConversation = new Map<string, any>()
  memberships.forEach((membership: any) => {
    if (membership?.conversation_id) {
      membershipByConversation.set(membership.conversation_id, membership)
    }
  })

  if (conversationIds.length === 0) {
    console.log('No valid conversation IDs found')
    return []
  }

  // STEP 2: Directly query conversations table using the conversation_ids
  // This avoids RLS issues with nested queries
  // NOTE: We don't filter by conversations.deleted_at here because deletion is now per-user
  // Each user's deletion is tracked in conversation_members.deleted_at
  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('id, workspace_id, type, created_at, last_message_at, name, description, is_private, created_by, deleted_at')
    .in('id', conversationIds)
    // Removed .is('deleted_at', null) - deletion is now per-user in conversation_members

  if (convError) {
    console.error('❌ Error fetching conversations:', convError)
    console.error('Error details:', { code: convError.code, message: convError.message, details: convError.details })
    return []
  }

  if (!conversations || conversations.length === 0) {
    console.log('❌ No conversations found after querying conversations table')
    console.log('⚠️ This might indicate RLS policy issues on conversations table')
    console.log('⚠️ Or all conversations are marked as deleted (deleted_at IS NOT NULL)')
    console.log('📋 Conversation IDs that were queried:', conversationIds)
    
    // DEBUG: Try querying without deleted_at filter to see if that's the issue
    const { data: allConversations, error: allError } = await supabase
      .from('conversations')
      .select('id, deleted_at')
      .in('id', conversationIds)
    
    if (!allError && allConversations && allConversations.length > 0) {
      console.log('🔍 DEBUG: Found conversations without deleted_at filter:', allConversations)
      const deletedCount = allConversations.filter((c: any) => c.deleted_at !== null).length
      console.log(`⚠️ ${deletedCount} out of ${allConversations.length} conversations are marked as deleted`)
    } else if (allError) {
      console.error('❌ DEBUG: Error querying conversations without filter:', allError)
      console.error('This confirms RLS policy is blocking the query')
    } else {
      console.error('❌ DEBUG: No conversations found even without deleted_at filter')
      console.error('This confirms RLS policy is blocking the query')
    }
    
    return []
  }

  console.log(`✅ Found ${conversations.length} conversations for user ${userId} (out of ${conversationIds.length} memberships)`)
  console.log('📋 Conversation IDs found:', conversations.map(c => c.id))

  // STEP 3: Get unread counts for each conversation via RPC
  const { data: unreadData, error: unreadError } = await supabase.rpc('get_unread_counts', {
    p_user_id: userId,
  })

  const unreadMap = new Map<string, number>()
  if (unreadError) {
    console.error('❌ Error fetching unread counts:', unreadError)
  } else if (unreadData && Array.isArray(unreadData)) {
    for (const row of unreadData as any[]) {
      if (row.conversation_id) {
        unreadMap.set(row.conversation_id, Number(row.unread_count) || 0)
      }
    }
  }

  // OPTIMIZED: Get members and last messages in parallel, and only fetch necessary user fields
  // Use a more efficient approach to get only the last message per conversation
  const [membersResult, messagesResult] = await Promise.all([
    supabase
      .from('conversation_members')
      .select(`
        conversation_id,
        user_id,
        users (
          id,
          email,
          full_name,
          username,
          avatar_url,
          title,
          status
        )
      `)
      .in('conversation_id', conversationIds),
    // OPTIMIZED: Fetch only the most recent message per conversation
    // Since we can't use window functions, we fetch a limited set and filter in memory
    // This is much faster than fetching all messages
    // Limit to conversation count * 2 to ensure we get at least one message per conversation
    // (some conversations might not have messages, so we fetch extra)
    supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, type, created_at, reactions, metadata, is_edited, is_deleted, is_recalled')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false })
      // 为了确保每个会话都能拿到至少一条"最后一条消息"，这里放宽限制
      // 对你现在这种 1～2 个会话的小场景，这个开销可以忽略不计
      .limit(1000)
  ])

  const { data: membersData } = membersResult
  const { data: messagesData } = messagesResult

  // OPTIMIZED: Group messages by conversation to get last message for each
  // Since messages are already sorted by created_at DESC, the first message we see for each
  // conversation_id is the last message
  const lastMessagesMap = new Map<string, any>()
  if (messagesData) {
    // Use a Set to track which conversations we've already found the last message for
    const processedConversations = new Set<string>()
    messagesData.forEach((msg: any) => {
      if (!processedConversations.has(msg.conversation_id)) {
        lastMessagesMap.set(msg.conversation_id, msg)
        processedConversations.add(msg.conversation_id)
      }
    })
  }

  // Build conversation with details
  const conversationsMap = new Map<string, ConversationWithDetails>()
  
  // Track direct conversations by member pair to detect duplicates
  const directConversationsByPair = new Map<string, ConversationWithDetails[]>()
  
  // CRITICAL FIX: conversations is now a direct array of conversation objects, not conversation_members
  // Each element is already a conversation object, not a wrapper with .conversations property
  conversations.forEach((conv: any) => {
    // IMPORTANT: Include ALL conversations the user is a member of, regardless of workspace
    // This ensures users can see all their conversations, even if they're in different workspaces
    if (!conv || !conv.id) {
      console.warn('Found invalid conversation object:', conv)
      return
    }
    
    const members = membersData
      ?.filter((m: any) => m.conversation_id === conv.id)
      .map((m: any) => m.users)
      .filter(Boolean) || []
    
    // Ensure we have at least the current user as a member
    if (members.length === 0) {
      console.warn(`Conversation ${conv.id} has no members, skipping`)
      return
    }
    
    const lastMessage = lastMessagesMap.get(conv.id)
    
    const membershipInfo = membershipByConversation.get(conv.id)
    const conversationDetails: ConversationWithDetails = {
      ...conv,
      members: members as User[],
      unread_count: unreadMap.get(conv.id) ?? 0,
      // 确保 last_message_at 一定有值，用于侧边栏按"最近一条消息"排序
      last_message_at: lastMessage?.created_at || conv.last_message_at || conv.created_at,
      is_pinned: Boolean(membershipInfo?.is_pinned),
      pinned_at: membershipInfo?.pinned_at || null, // Include pinned_at timestamp for sorting
      last_message: lastMessage ? {
        ...lastMessage,
        reactions: Array.isArray(lastMessage.reactions) ? lastMessage.reactions : [],
      } as Message : undefined,
    }
    
    // For direct conversations, track by member pair to detect duplicates
    if (conv.type === 'direct' && members.length === 2) {
      const memberIds = members.map((m: User) => m.id).sort()
      const pairKey = `${memberIds[0]}-${memberIds[1]}`
      
      if (!directConversationsByPair.has(pairKey)) {
        directConversationsByPair.set(pairKey, [])
      }
      directConversationsByPair.get(pairKey)!.push(conversationDetails)
    }
    
    conversationsMap.set(conv.id, conversationDetails)
  })

  // Merge duplicate direct conversations
  // IMPORTANT: Use deterministic sorting to ensure we always keep the same conversation
  // This prevents the UI from flickering between conversations
  directConversationsByPair.forEach((duplicates, pairKey) => {
    if (duplicates.length > 1) {
      console.warn(`⚠️ Found ${duplicates.length} duplicate direct conversations for pair ${pairKey}`)
      
      // Sort by: 1) last_message_at (most recent first), 2) created_at (oldest first), 3) id (deterministic)
      // This ensures we always select the same conversation, preventing UI flickering
      duplicates.sort((a, b) => {
        const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
        const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
        if (aTime !== bTime) return bTime - aTime // Most recent first
        const aCreated = new Date(a.created_at).getTime()
        const bCreated = new Date(b.created_at).getTime()
        if (aCreated !== bCreated) return aCreated - bCreated // Oldest first
        // Finally, use ID for deterministic sorting
        return a.id.localeCompare(b.id)
      })
      
      // Keep the first one (deterministic choice)
      const keepConversation = duplicates[0]
      const removeConversations = duplicates.slice(1)
      
      console.log(`✅ Keeping conversation ${keepConversation.id} (deterministic), removing ${removeConversations.length} duplicates`)
      
      // Remove duplicates from the map
      removeConversations.forEach(dup => {
        conversationsMap.delete(dup.id)
        console.log(`Removed duplicate conversation ${dup.id}`)
      })
    }
  })

  const result = Array.from(conversationsMap.values())
  console.log(`✅ Returning ${result.length} conversations with details for user ${userId} (after deduplication)`)
  console.log('📋 Conversation IDs being returned:', result.map(c => ({
    id: c.id,
    type: c.type,
    hasLastMessage: !!c.last_message,
    memberCount: c.members?.length || 0
  })))
  return result
}

// Message operations
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
  content: string
): Promise<MessageWithSender | null> {
  const supabase = await createClient()
  
  const { data: message, error } = await supabase
    .from('messages')
    .update({
      content,
      is_edited: true,
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

