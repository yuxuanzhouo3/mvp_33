/**
 * System Assistant Service
 * Handles system assistant conversations and notifications
 *
 * 系统助手服务 - 类似飞书的系统助手，用于发送申请状态通知
 */

import { createClient } from '@/lib/supabase/server'
import { getCloudBaseDb } from '@/lib/cloudbase/client'

// System Assistant IDs
export const SYSTEM_ASSISTANT_ID_CN = 'system-assistant'
export const SYSTEM_ASSISTANT_ID_INTL = '00000000-0000-0000-0000-000000000001'

/**
 * Get system assistant ID based on deployment region
 */
export function getSystemAssistantId(isCN: boolean): string {
  return isCN ? SYSTEM_ASSISTANT_ID_CN : SYSTEM_ASSISTANT_ID_INTL
}

/**
 * Get or create a direct conversation between user and system assistant
 * 获取或创建用户与系统助手的会话
 */
export async function getOrCreateSystemAssistantConversation(
  userId: string,
  isCN: boolean
): Promise<string> {
  const systemAssistantId = getSystemAssistantId(isCN)

  if (isCN) {
    return getOrCreateSystemAssistantConversationCN(userId, systemAssistantId)
  } else {
    return getOrCreateSystemAssistantConversationIntl(userId, systemAssistantId)
  }
}

/**
 * CloudBase version - get or create system assistant conversation
 */
async function getOrCreateSystemAssistantConversationCN(
  userId: string,
  systemAssistantId: string
): Promise<string> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  // 1. Check if conversation already exists
  const existingMembers = await db
    .collection('conversation_members')
    .where({
      user_id: db.command.in([userId, systemAssistantId]),
    })
    .get()

  // Group by conversation_id and find one with exactly these two members
  const convMemberCounts = new Map<string, Set<string>>()
  for (const member of existingMembers.data || []) {
    const convId = member.conversation_id
    if (!convMemberCounts.has(convId)) {
      convMemberCounts.set(convId, new Set())
    }
    convMemberCounts.get(convId)!.add(member.user_id)
  }

  // Find conversation with exactly these two members
  for (const [convId, members] of convMemberCounts) {
    if (members.size === 2 && members.has(userId) && members.has(systemAssistantId)) {
      // Verify this is a direct conversation
      const convRes = await db.collection('conversations').doc(convId).get()
      const conv = convRes.data || convRes
      if (conv.type === 'direct') {
        return convId
      }
    }
  }

  // 2. Create new conversation
  const now = new Date().toISOString()
  const convId = crypto.randomUUID()

  await db.collection('conversations').add({
    id: convId,
    type: 'direct',
    name: null,
    description: null,
    is_private: true,
    created_by: systemAssistantId,
    created_at: now,
    last_message_at: now,
    region: 'cn',
  })

  // 3. Add members
  await db.collection('conversation_members').add([
    {
      conversation_id: convId,
      user_id: userId,
      role: 'member',
      created_at: now,
      region: 'cn',
    },
    {
      conversation_id: convId,
      user_id: systemAssistantId,
      role: 'owner',
      created_at: now,
      region: 'cn',
    },
  ])

  return convId
}

/**
 * Supabase version - get or create system assistant conversation
 */
async function getOrCreateSystemAssistantConversationIntl(
  userId: string,
  systemAssistantId: string
): Promise<string> {
  const supabase = await createClient()

  // 1. Find existing direct conversation with system assistant
  // First get user's conversations that include system assistant
  const { data: userMemberships } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId)
    .is('deleted_at', null)

  if (userMemberships && userMemberships.length > 0) {
    const convIds = userMemberships.map(m => m.conversation_id)

    // Check if system assistant is also a member of any of these conversations
    const { data: assistantMemberships } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', systemAssistantId)
      .in('conversation_id', convIds)

    if (assistantMemberships && assistantMemberships.length > 0) {
      // Find direct conversation type
      const possibleConvIds = assistantMemberships.map(m => m.conversation_id)
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id')
        .eq('type', 'direct')
        .in('id', possibleConvIds)
        .limit(1)

      if (conversations && conversations.length > 0) {
        return conversations[0].id
      }
    }
  }

  // 2. Create new conversation
  const now = new Date().toISOString()
  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .insert({
      type: 'direct',
      name: null,
      description: null,
      is_private: true,
      created_by: systemAssistantId,
      created_at: now,
      last_message_at: now,
    })
    .select('id')
    .single()

  if (convError || !conv) {
    console.error('Failed to create system assistant conversation:', convError)
    throw new Error('Failed to create conversation')
  }

  const convId = conv.id

  // 3. Add members
  const { error: membersError } = await supabase
    .from('conversation_members')
    .insert([
      {
        conversation_id: convId,
        user_id: userId,
        role: 'member',
        joined_at: now,
      },
      {
        conversation_id: convId,
        user_id: systemAssistantId,
        role: 'owner',
        joined_at: now,
      },
    ])

  if (membersError) {
    console.error('Failed to add members to system assistant conversation:', membersError)
    throw new Error('Failed to add conversation members')
  }

  return convId
}

/**
 * Send a system assistant message to user
 * 发送系统助手消息给用户
 */
export async function sendSystemAssistantMessage(
  userId: string,
  content: string,
  metadata: {
    type: 'join_request' | 'join_approved' | 'join_rejected'
    workspace_id: string
    workspace_name: string
    request_id?: string
  },
  isCN: boolean
): Promise<void> {
  const systemAssistantId = getSystemAssistantId(isCN)

  // Get or create conversation
  const conversationId = await getOrCreateSystemAssistantConversation(userId, isCN)

  const now = new Date().toISOString()

  if (isCN) {
    await sendSystemAssistantMessageCN(conversationId, systemAssistantId, content, metadata, now)
  } else {
    await sendSystemAssistantMessageIntl(conversationId, systemAssistantId, content, metadata, now)
  }
}

/**
 * CloudBase version - send system assistant message
 */
async function sendSystemAssistantMessageCN(
  conversationId: string,
  senderId: string,
  content: string,
  metadata: any,
  timestamp: string
): Promise<void> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  // Add message
  await db.collection('messages').add({
    conversation_id: conversationId,
    sender_id: senderId,
    content,
    type: 'system', // Use 'system' type for system messages
    metadata,
    created_at: timestamp,
    updated_at: timestamp,
    region: 'cn',
  })

  // Update conversation's last_message_at
  await db
    .collection('conversations')
    .where({ id: conversationId })
    .update({
      last_message_at: timestamp,
    })
}

/**
 * Supabase version - send system assistant message
 */
async function sendSystemAssistantMessageIntl(
  conversationId: string,
  senderId: string,
  content: string,
  metadata: any,
  timestamp: string
): Promise<void> {
  const supabase = await createClient()

  // Add message
  const { error: msgError } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    content,
    type: 'system',
    metadata,
    created_at: timestamp,
    updated_at: timestamp,
  })

  if (msgError) {
    console.error('Failed to send system assistant message:', msgError)
    throw new Error('Failed to send message')
  }

  // Update conversation's last_message_at
  const { error: convError } = await supabase
    .from('conversations')
    .update({ last_message_at: timestamp })
    .eq('id', conversationId)

  if (convError) {
    console.error('Failed to update conversation last_message_at:', convError)
  }
}
