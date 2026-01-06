/**
 * Supabase conversation database operations
 * Handles conversation operations in Supabase (for Global region)
 */

import { createClient } from '@/lib/supabase/server'
import { User, Conversation, Message, ConversationWithDetails } from '@/lib/types'

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
  // Also get history_cleared_at to adjust last_message_at display time
  const { data: memberships, error: membersError } = await supabase
    .from('conversation_members')
    .select('conversation_id, last_read_at, is_pinned, pinned_at, is_hidden, history_cleared_at')
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
















