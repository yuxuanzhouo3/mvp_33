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
  
  // Get conversations where user is a member
  const { data: conversations, error } = await supabase
    .from('conversation_members')
    .select(`
      conversation_id,
      conversations (*)
    `)
    .eq('user_id', userId)

  if (error || !conversations) return []

  // Filter by workspace and get full details
  const conversationIds = conversations
    .map((cm: any) => cm.conversations)
    .filter((c: any) => c && c.workspace_id === workspaceId)
    .map((c: any) => c.id)

  if (conversationIds.length === 0) return []

  // Get members for each conversation
  const { data: membersData } = await supabase
    .from('conversation_members')
    .select(`
      conversation_id,
      user_id,
      users (*)
    `)
    .in('conversation_id', conversationIds)

  // Get last messages for each conversation
  const { data: messagesData } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false })

  // Group messages by conversation to get last message for each
  const lastMessagesMap = new Map<string, any>()
  if (messagesData) {
    messagesData.forEach((msg: any) => {
      if (!lastMessagesMap.has(msg.conversation_id)) {
        lastMessagesMap.set(msg.conversation_id, msg)
      }
    })
  }

  // Build conversation with details
  const conversationsMap = new Map<string, ConversationWithDetails>()
  
  conversations.forEach((cm: any) => {
    const conv = cm.conversations
    if (conv && conv.workspace_id === workspaceId) {
      const members = membersData
        ?.filter((m: any) => m.conversation_id === conv.id)
        .map((m: any) => m.users)
        .filter(Boolean) || []
      
      const lastMessage = lastMessagesMap.get(conv.id)
      
      conversationsMap.set(conv.id, {
        ...conv,
        members: members as User[],
        unread_count: 0, // TODO: Calculate unread count
        last_message: lastMessage ? {
          ...lastMessage,
          reactions: Array.isArray(lastMessage.reactions) ? lastMessage.reactions : [],
        } as Message : undefined,
      })
    }
  })

  return Array.from(conversationsMap.values())
}

// Message operations
export async function getMessages(conversationId: string): Promise<MessageWithSender[]> {
  const supabase = await createClient()
  
  const { data: messages, error } = await supabase
    .from('messages')
    .select(`
      *,
      users (*)
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error || !messages) return []

  return messages.map((msg: any) => ({
    ...msg,
    sender: msg.users,
    reactions: Array.isArray(msg.reactions) ? msg.reactions : [],
  })) as MessageWithSender[]
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

