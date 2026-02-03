import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserConversations } from '@/lib/database/supabase/conversations'
import { ConversationWithDetails } from '@/lib/types'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { getUserConversations as getUserConversationsCN, createConversation as createConversationCN } from '@/lib/database/cloudbase/conversations'

/**
 * Get user conversations
 * GET /api/conversations?workspaceId=xxx&conversationId=xxx (optional - to get single conversation)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const workspaceId = searchParams.get('workspaceId')
    const conversationId = searchParams.get('conversationId')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    // If conversationId is provided, get single conversation
    // OPTIMIZED: Query directly instead of fetching all conversations first
      if (conversationId && workspaceId && dbClient.type === 'supabase' && userRegion === 'global') {
      // First, verify user is a member of the conversation
      const { data: userMembership, error: membershipError } = await supabase
        .from('conversation_members')
        .select('conversation_id, deleted_at')
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .is('deleted_at', null) // only consider memberships not soft-deleted by this user
      
      if (membershipError || !userMembership) {
        return NextResponse.json(
          { error: 'Conversation not found or user is not a member' },
          { status: 404 }
        )
      }
      
      // Get the conversation details
      // CRITICAL: Don't filter by workspace_id - conversations can be in different workspaces
      // The user membership check is sufficient to ensure access
      // IMPORTANT: If conversation is deleted, restore it (set deleted_at = NULL)
      // This allows users to reopen deleted conversations
      const { data: conversation, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single()
      
      if (conversation && conversation.deleted_at) {
        console.warn('🚫 Attempt to access deleted conversation:', {
          conversationId,
          workspaceId,
        })
        return NextResponse.json(
          { error: 'Conversation has been deleted' },
          { status: 404 }
        )
      }
      
      if (convError || !conversation) {
        console.error('❌ Conversation not found:', {
          conversationId,
          workspaceId,
          error: convError?.message
        })
        return NextResponse.json(
          { error: 'Conversation not found', details: convError?.message },
          { status: 404 }
        )
      }
      
      console.log('✅ Found conversation:', {
        id: conversation.id,
        type: conversation.type,
        workspace_id: conversation.workspace_id,
        requested_workspace_id: workspaceId
      })
      
      // Get all members of the conversation
      const { data: convWithMembers, error: membersError } = await supabase
        .from('conversation_members')
        .select(`
          user_id,
          role,
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
        .eq('conversation_id', conversationId)
      
      if (membersError) {
        console.error('Error fetching conversation members:', membersError)
        return NextResponse.json(
          { error: 'Failed to fetch conversation members' },
          { status: 500 }
        )
      }
      
      // Map members data
      const members = convWithMembers?.map((m: any) => m.users).filter(Boolean) || []
      
      // OPTIMIZED: Skip last message to speed up response
      // Frontend can load it if needed
      const fullConversation: ConversationWithDetails = {
        ...conversation,
        members: members as any,
        unread_count: 0,
        last_message: undefined, // Skip to speed up response
      }
      
      return NextResponse.json({
        success: true,
        conversation: fullConversation,
      })
    }

    // Otherwise, get all conversations
    if (!workspaceId && dbClient.type === 'supabase' && userRegion === 'global') {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      )
    }

    // CN users: list conversations from CloudBase, no workspace concept
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      console.log('🔍 [API CN] Fetching conversations for CN user (CloudBase):', user.id)
      const conversationsCN = await getUserConversationsCN(user.id)
      return NextResponse.json({
        success: true,
        conversations: conversationsCN,
      })
    }

    console.log('🔍 [API] Fetching conversations for user:', user.id, 'workspace:', workspaceId)
    let conversations = await getUserConversations(user.id, workspaceId!)
    console.log('🔍 [API] getUserConversations returned:', conversations.length, 'conversations')
    
    if (conversations.length === 0) {
      console.warn('⚠️ [API] No conversations returned! This might indicate:')
      console.warn('  1. User has no conversation_members records')
      console.warn('  2. RLS policies are blocking the query')
      console.warn('  3. All conversations are marked as deleted')
      console.warn('  4. User ID mismatch between auth and query')
    }

    // CRITICAL: Filter out direct conversations where the other user is not in contacts
    // This ensures deleted contacts' conversations don't reappear after refresh
    // IMPORTANT: Do this BEFORE deduplication to avoid processing conversations that will be filtered out
    try {
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('contact_user_id')
        .eq('user_id', user.id)
      
      if (contactsError) {
        console.error('❌ [API] Failed to fetch contacts for filtering:', contactsError)
      } else {
        const contactUserIds = new Set((contacts || []).map((c: any) => c.contact_user_id).filter(Boolean))
        console.log('👥 [API] Contacts for filtering:', contactUserIds.size, 'contacts')
        
        const beforeFilterCount = conversations.length
        conversations = conversations.filter(conv => {
          // Only filter direct conversations
          if (conv.type !== 'direct') {
            return true
          }
          
          // CRITICAL: Allow self-conversations (where members might be 1 or 2, but other user is same as current user)
          // Check if this is a self-conversation first
          const isSelfConversation = conv.members && conv.members.length >= 1 && 
            conv.members.every((m: any) => (m.id || m) === user.id)
          
          if (isSelfConversation) {
            console.log('✅ [API] Keeping self-conversation:', conv.id)
            return true // Keep self-conversations
          }
          
          // If conversation has no members or invalid members, filter it out
          if (!conv.members || conv.members.length !== 2) {
            console.log('🗑️ [API] Filtering out direct conversation with invalid members:', conv.id)
            return false
          }
          
          // Find the other user (not current user)
          const otherUser = conv.members.find((m: any) => m.id !== user.id)
          if (!otherUser || !otherUser.id) {
            console.log('🗑️ [API] Filtering out direct conversation without other user:', conv.id)
            return false
          }
          
          // CRITICAL: Allow self-conversations (where otherUser is the same as current user)
          if (otherUser.id === user.id) {
            console.log('✅ [API] Keeping self-conversation:', conv.id)
            return true // Keep self-conversations
          }
          
          // If the other user is not in contacts, filter out this conversation
          if (!contactUserIds.has(otherUser.id)) {
            console.log('🗑️ [API] Filtering out direct conversation - user not in contacts:', {
              conversationId: conv.id,
              otherUserId: otherUser.id,
            })
            return false
          }
          
          return true
        })
        
        const filteredCount = beforeFilterCount - conversations.length
        if (filteredCount > 0) {
          console.log(`✅ [API] Filtered out ${filteredCount} direct conversation(s) where other user is not in contacts`)
        }
      }
    } catch (filterError) {
      console.error('❌ [API] Error filtering conversations by contacts:', filterError)
      // Don't fail the request, just log the error
    }

    // Additional deduplication at API level to ensure no duplicates
    // Group direct conversations by member pair
    const directConversationsByPair = new Map<string, typeof conversations>()
    const otherConversations: typeof conversations = []
    
    conversations.forEach(conv => {
      if (conv.type === 'direct') {
        // CRITICAL: Handle self-conversations (where members might be 1 or 2, but all members are the same user)
        const isSelfConversation = conv.members && conv.members.length >= 1 && 
          conv.members.every((m: any) => (m.id || m) === user.id)
        
        if (isSelfConversation) {
          // For self-conversations, use a special key
          const selfKey = `self-${user.id}`
          if (!directConversationsByPair.has(selfKey)) {
            directConversationsByPair.set(selfKey, [])
          }
          directConversationsByPair.get(selfKey)!.push(conv)
        } else if (conv.members && conv.members.length === 2) {
          const memberIds = conv.members.map(m => m.id).sort()
          const pairKey = `${memberIds[0]}-${memberIds[1]}`
          
          if (!directConversationsByPair.has(pairKey)) {
            directConversationsByPair.set(pairKey, [])
          }
          directConversationsByPair.get(pairKey)!.push(conv)
        } else {
          // Invalid direct conversation, skip it
          console.warn('⚠️ [API] Skipping invalid direct conversation:', conv.id)
        }
      } else {
        otherConversations.push(conv)
      }
    })
    
    // For each pair, keep only one conversation (deterministic choice)
    // IMPORTANT: Use same sorting logic as database layer to ensure consistency
    const deduplicatedDirect: typeof conversations = []
    directConversationsByPair.forEach((duplicates, pairKey) => {
      if (duplicates.length > 1) {
        console.warn(`⚠️ API: Found ${duplicates.length} duplicate direct conversations for pair ${pairKey}`)
        // Sort by: 1) last_message_at (most recent first), 2) created_at (oldest first), 3) id (deterministic)
        duplicates.sort((a, b) => {
          const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
          const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
          if (aTime !== bTime) return bTime - aTime
          const aCreated = new Date(a.created_at).getTime()
          const bCreated = new Date(b.created_at).getTime()
          if (aCreated !== bCreated) return aCreated - bCreated
          return a.id.localeCompare(b.id) // Deterministic by ID
        })
        // Keep only the first one (deterministic)
        deduplicatedDirect.push(duplicates[0])
        console.log(`✅ API: Keeping conversation ${duplicates[0].id} (deterministic), removing ${duplicates.length - 1} duplicates`)
      } else {
        deduplicatedDirect.push(duplicates[0])
      }
    })
    
    // Combine deduplicated direct conversations with other conversations
    conversations = [...deduplicatedDirect, ...otherConversations]
    console.log('After API deduplication:', conversations.length, 'conversations')

    return NextResponse.json({
      success: true,
      conversations: conversations || [],
    })
  } catch (error: any) {
    console.error('Get conversations error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get conversations' },
      { status: 500 }
    )
  }
}

/**
 * Create a conversation (direct message or group)
 * POST /api/conversations
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, member_ids, name, description, skip_contact_check } = body

    if (!type || !['direct', 'group', 'channel'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid conversation type' },
        { status: 400 }
      )
    }

    if (!member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
      return NextResponse.json(
        { error: 'member_ids is required and must be a non-empty array' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get current user (Supabase Auth is still the single auth system)
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Determine which data store this user actually belongs to
    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    // IMPORTANT:
    // - Global users (Supabase) → keep existing Supabase conversations/workspaces logic.
    // - China users (CloudBase) → create conversations in CloudBase collections (no Supabase workspaces).
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      const allMemberIds = Array.from(new Set([currentUser.id, ...member_ids]))
      const conv = await createConversationCN({
        type,
        memberIds: allMemberIds,
        name: name || null,
        description: description || null,
        isPrivate: body.is_private,
        createdBy: currentUser.id,
      })

      return NextResponse.json({
        success: true,
        conversation: conv,
      })
    }

    // OPTIMIZED: Get workspace (skip contact check if requested, e.g., from contacts page)
    let workspaces: any[] | null = null

    if (type === 'direct' && member_ids.length === 1 && !skip_contact_check) {
      // Only check contacts if not skipped (e.g., when called from other places)
      const otherUserId = member_ids[0]
      
      // OPTIMIZED: Check contacts and workspace in parallel
      const [contactResults, workspaceResult] = await Promise.all([
        Promise.all([
          supabase
            .from('contacts')
            .select('id')
            .eq('user_id', currentUser.id)
            .eq('contact_user_id', otherUserId)
            .eq('is_blocked', false)
            .maybeSingle(),
          supabase
            .from('contacts')
            .select('id')
            .eq('user_id', otherUserId)
            .eq('contact_user_id', currentUser.id)
            .eq('is_blocked', false)
            .maybeSingle()
        ]),
        supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', currentUser.id)
          .limit(1)
      ])

      const [{ data: contact }, { data: reverseContact }] = contactResults
      workspaces = workspaceResult.data

      if (!contact && !reverseContact) {
        return NextResponse.json(
          { error: 'You can only message users who are in your contacts. Please add them as a contact first.' },
          { status: 403 }
        )
      }
    } else {
      // Skip contact check (from contacts page) or not a direct message
      const workspaceStartTime = Date.now()
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', currentUser.id)
        .limit(1)
      const workspaceEndTime = Date.now()
      console.log(`Workspace query took ${workspaceEndTime - workspaceStartTime}ms`, {
        hasData: !!workspaceData,
        dataLength: workspaceData?.length || 0,
        error: workspaceError?.message
      })
      workspaces = workspaceData
    }

    let workspaceId: string
    if (workspaces && workspaces.length > 0) {
      workspaceId = workspaces[0].workspace_id
      console.log('Using existing workspace:', workspaceId)
    } else {
      console.log('No workspace member found, checking for existing workspace...')
      // OPTIMIZED: If workspace_members query returned empty, check if workspace exists first
      // This avoids the expensive create attempt that will fail
      const domain = `workspace-${currentUser.id.substring(0, 8)}`
      const getExistingStartTime = Date.now()
      const { data: existingWorkspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('domain', domain)
        .single()
      const getExistingEndTime = Date.now()
      console.log(`Get existing workspace took ${getExistingEndTime - getExistingStartTime}ms`)

      if (existingWorkspace) {
        workspaceId = existingWorkspace.id
        // OPTIMIZED: Only upsert if user is not already a member
        // Check first to avoid unnecessary upsert operation
        const checkMemberStartTime = Date.now()
        const { data: existingMember } = await supabase
          .from('workspace_members')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('user_id', currentUser.id)
          .maybeSingle()
        const checkMemberEndTime = Date.now()
        console.log(`Check workspace member took ${checkMemberEndTime - checkMemberStartTime}ms`)
        
        if (!existingMember) {
          // Only upsert if user is not a member
          const upsertStartTime = Date.now()
          await supabase.from('workspace_members').upsert({
            workspace_id: workspaceId,
            user_id: currentUser.id,
            role: 'owner',
          }, { onConflict: 'workspace_id,user_id' })
          const upsertEndTime = Date.now()
          console.log(`Upsert workspace member took ${upsertEndTime - upsertStartTime}ms`)
        } else {
          console.log('User is already a workspace member, skipping upsert')
        }
      } else {
        // Only create if workspace doesn't exist
        const createStartTime = Date.now()
        const { data: newWorkspace, error: workspaceError } = await supabase
          .from('workspaces')
          .insert({
            name: 'My Workspace',
            domain: domain,
            owner_id: currentUser.id,
          })
          .select()
          .single()
        const createEndTime = Date.now()
        console.log(`Create workspace attempt took ${createEndTime - createStartTime}ms`)

        if (workspaceError || !newWorkspace) {
          console.error('Create workspace error:', workspaceError)
          return NextResponse.json(
            { 
              error: workspaceError?.message || 'Failed to create workspace',
              details: 'Please ensure workspaces table exists and RLS policies allow insertion'
            },
            { status: 500 }
          )
        }

        workspaceId = newWorkspace.id
        // Add user as owner (use upsert to avoid conflicts)
        const upsertStartTime = Date.now()
        await supabase.from('workspace_members').upsert({
          workspace_id: workspaceId,
          user_id: currentUser.id,
          role: 'owner',
        }, { onConflict: 'workspace_id,user_id' })
        const upsertEndTime = Date.now()
        console.log(`Upsert workspace member took ${upsertEndTime - upsertStartTime}ms`)
      }
    }

    // For direct messages, check if conversation already exists
    // ULTRA-OPTIMIZED: Use database function to find conversation in a single query
    // This reduces from 4 queries to 1 query, significantly improving performance
    if (type === 'direct' && member_ids.length === 1) {
      const otherUserId = member_ids[0]
      
      console.log('Checking for existing direct conversation between:', currentUser.id, 'and', otherUserId)
      const rpcStartTime = Date.now()
      
      // Use database function to find conversation - all logic happens in database
      // This is much faster than multiple queries with network round trips
      const { data: existingConv, error: findError } = await supabase
        .rpc('find_direct_conversation', {
          p_user1_id: currentUser.id,
          p_user2_id: otherUserId
        })

      const rpcEndTime = Date.now()
      console.log(`RPC call took ${rpcEndTime - rpcStartTime}ms`)

      if (findError) {
        console.error('Error finding conversation with RPC:', findError)
        // Fallback to old method if RPC fails (for backwards compatibility)
        console.log('Falling back to query-based method...')
      } else if (existingConv && existingConv.length > 0) {
        const conv = existingConv[0]
        if (conv.deleted_at) {
          console.log('🔒 Existing conversation is deleted, ignoring restore and creating new one')
        } else {
          // CRITICAL: Check if EITHER user has deleted this conversation
          // If ANY user deleted it (due to unfriend), create a new conversation instead of restoring the old one
          // This ensures deleted conversations and messages cannot be recovered by re-adding friend
          const { data: memberships } = await supabase
            .from('conversation_members')
            .select('user_id, deleted_at')
            .eq('conversation_id', conv.id)
            .in('user_id', [currentUser.id, otherUserId])
          
          const currentUserMembership = memberships?.find((m: any) => m.user_id === currentUser.id)
          const otherUserMembership = memberships?.find((m: any) => m.user_id === otherUserId)
          
          // If EITHER user has deleted this conversation, don't restore it
          if ((currentUserMembership && currentUserMembership.deleted_at) || 
              (otherUserMembership && otherUserMembership.deleted_at)) {
            console.log('🔒 Conversation was deleted by at least one user (due to unfriend), creating new one instead of restoring:', conv.id, {
              currentUserDeleted: !!currentUserMembership?.deleted_at,
              otherUserDeleted: !!otherUserMembership?.deleted_at
            })
            // Don't return existing conversation, continue to create new one below
          } else {
            console.log('✅ Found existing direct conversation:', conv.id, `(RPC took ${rpcEndTime - rpcStartTime}ms)`)
            
            // Auto-unhide the conversation for current user if it was hidden
            await supabase
              .from('conversation_members')
              .update({ is_hidden: false, hidden_at: null })
              .eq('conversation_id', conv.id)
              .eq('user_id', currentUser.id)
              .eq('is_hidden', true)
          
            // Get full conversation details with members
            const { data: convWithMembers, error: membersError } = await supabase
              .from('conversation_members')
              .select(`
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
              .eq('conversation_id', conv.id)
            
            if (membersError) {
              console.error('Error fetching conversation members:', membersError)
            }
            
            // Get last message if exists
            const { data: lastMessage } = await supabase
              .from('messages')
              .select('id, content, type, sender_id, created_at, metadata')
              .eq('conversation_id', conv.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            
            const members = convWithMembers?.map((m: any) => m.users).filter(Boolean) || []
            
            // Get sender info for last message
            let lastMessageWithSender = undefined
            if (lastMessage) {
              const sender = members.find((m: any) => m.id === lastMessage.sender_id)
              lastMessageWithSender = {
                ...lastMessage,
                sender: sender || { id: lastMessage.sender_id }
              }
            }
            
            const fullConversation: ConversationWithDetails = {
              id: conv.id,
              workspace_id: conv.workspace_id,
              type: conv.type,
              name: conv.name,
              description: conv.description,
              is_private: conv.is_private,
              created_by: conv.created_by,
              created_at: conv.created_at,
              last_message_at: conv.last_message_at || conv.created_at,
              members: members as any,
              unread_count: 0,
              last_message: lastMessageWithSender,
            }
            
            return NextResponse.json({
              success: true,
              conversation: fullConversation,
            })
          }
        }
      }
      
      console.log('❌ No existing direct conversation found, will create new one')
    }

    // Create new conversation
    console.log('📝 Creating new conversation in database:', {
      workspace_id: workspaceId,
      type,
      name: name || null,
      created_by: currentUser.id,
      member_ids: member_ids
    })
    
    const { data: newConversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        workspace_id: workspaceId,
        type,
        name: name || null,
        description: description || null,
        created_by: currentUser.id,
        is_private: body.is_private !== undefined ? body.is_private : (type === 'direct'),
        deleted_at: null, // Ensure new conversations are not deleted
      })
      .select()
      .single()

    if (convError || !newConversation) {
      console.error('❌ Create conversation error:', convError)
      return NextResponse.json(
        { error: convError?.message || 'Failed to create conversation' },
        { status: 500 }
      )
    }
    
    console.log('✅ Conversation created in database:', {
      id: newConversation.id,
      type: newConversation.type,
      workspace_id: newConversation.workspace_id,
      created_at: newConversation.created_at
    })

    // Add members to conversation
    // For direct messages, ensure both users are added
    const allMemberIds = type === 'direct' 
      ? [currentUser.id, ...member_ids]
      : [currentUser.id, ...member_ids]

    // Remove duplicates
    const uniqueMemberIds = Array.from(new Set(allMemberIds))

    const conversationMembers = uniqueMemberIds.map((userId, index) => ({
      conversation_id: newConversation.id,
      user_id: userId,
      role: index === 0 ? 'owner' : 'member',
    }))

    console.log('Adding conversation members:', { 
      conversationId: newConversation.id, 
      members: uniqueMemberIds,
      memberCount: conversationMembers.length 
    })

    // Use database function to insert members (bypasses RLS)
    // This is more reliable than direct inserts when RLS policies are complex
    const membersJson = conversationMembers.map(m => ({
      user_id: m.user_id,
      role: m.role
    }))

    console.log('Calling insert_conversation_members function with:', {
      conversationId: newConversation.id,
      membersCount: membersJson.length
    })

    const { data: insertedMembersData, error: insertFunctionError } = await supabase
      .rpc('insert_conversation_members', {
        p_conversation_id: newConversation.id,
        p_members: membersJson
      })

    if (insertFunctionError) {
      console.error('❌ Error calling insert_conversation_members function:', insertFunctionError)
      
      // Fallback: try direct insert if function doesn't exist
      console.log('⚠️ Falling back to direct insert...')
      
      // Try direct insert
      const { error: directInsertError } = await supabase
        .from('conversation_members')
        .insert(conversationMembers)
      
      if (directInsertError) {
        console.error('❌ Direct insert also failed:', directInsertError)
        return NextResponse.json(
          { 
            error: `Failed to add members to conversation: ${directInsertError.message || insertFunctionError.message || 'Unknown error'}`,
            details: { functionError: insertFunctionError, directInsertError }
          },
          { status: 500 }
        )
      }
      
      console.log('✅ Direct insert succeeded, verifying members...')
      
      // Verify members were inserted
      const { data: verifyMembers, error: verifyError } = await supabase
        .from('conversation_members')
        .select(`
          user_id,
          users (
            id,
            email,
            full_name,
            username,
            avatar_url
          )
        `)
        .eq('conversation_id', newConversation.id)
      
      if (verifyError || !verifyMembers || verifyMembers.length < uniqueMemberIds.length) {
        console.error('❌ CRITICAL: Members not found after insert!', {
          verifyError,
          expectedCount: uniqueMemberIds.length,
          actualCount: verifyMembers?.length || 0
        })
        return NextResponse.json(
          { 
            error: `Failed to verify members after insertion: ${verifyError?.message || 'Members not found'}`,
            details: { verifyError, expectedCount: uniqueMemberIds.length, actualCount: verifyMembers?.length || 0 }
          },
          { status: 500 }
        )
      }
      
      console.log('✅ Verified members after direct insert:', {
        conversationId: newConversation.id,
        memberCount: verifyMembers.length
      })
      
      const members = verifyMembers.map((m: any) => m.users).filter(Boolean) || []
      const fullConversation: ConversationWithDetails = {
        ...newConversation,
        members: members as any,
        unread_count: 0,
        last_message: undefined,
      }
      
      // Verify conversation exists
      const { data: verifyConv, error: verifyConvError } = await supabase
        .from('conversations')
        .select('id, type, created_at')
        .eq('id', newConversation.id)
        .single()
      
      if (verifyConvError || !verifyConv) {
        console.error('❌ CRITICAL: Conversation not found after creation!', verifyConvError)
        return NextResponse.json(
          { error: 'Conversation was not saved to database' },
          { status: 500 }
        )
      }
      
      console.log('✅ Verified conversation exists in database (fallback path)')

      return NextResponse.json({
        success: true,
        conversation: fullConversation,
      })
    }

    console.log('✅ Successfully inserted members via function:', insertedMembersData)

    // Fetch the full member details with user information
    const { data: membersWithDetails, error: fetchError } = await supabase
      .from('conversation_members')
      .select(`
        user_id,
        users (
          id,
          email,
          full_name,
          username,
          avatar_url
        )
      `)
      .eq('conversation_id', newConversation.id)

    if (fetchError) {
      console.error('❌ Error fetching member details:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch member details after insertion' },
        { status: 500 }
      )
    }

    const members = membersWithDetails?.map((m: any) => m.users).filter(Boolean) || []
    
    console.log('✅ Conversation members fetched:', {
      conversationId: newConversation.id,
      memberCount: members.length,
      memberIds: members.map((m: any) => m.id)
    })
    
    // CRITICAL: Verify conversation exists in database before returning
    const { data: verifyConv, error: verifyError } = await supabase
      .from('conversations')
      .select('id, type, created_at, workspace_id')
      .eq('id', newConversation.id)
      .single()
    
    if (verifyError || !verifyConv) {
      console.error('❌ CRITICAL: Conversation not found in database after creation!', verifyError)
      return NextResponse.json(
        { error: 'Conversation was not saved to database' },
        { status: 500 }
      )
    }
    
    console.log('✅ Verified conversation exists in database:', {
      id: verifyConv.id,
      type: verifyConv.type,
      workspace_id: verifyConv.workspace_id
    })

    // Return conversation with full details (no last_message for new conversations)
    const fullConversation: ConversationWithDetails = {
      ...newConversation,
      members: members as any,
      unread_count: 0,
      // New conversations don't have messages yet, so no last_message
      last_message: undefined,
    }
    
    console.log('✅ Returning conversation to client:', {
      id: fullConversation.id,
      type: fullConversation.type,
      memberCount: fullConversation.members.length,
      hasLastMessage: !!fullConversation.last_message
    })

    return NextResponse.json({
      success: true,
      conversation: fullConversation,
    })
  } catch (error: any) {
    console.error('Create conversation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create conversation' },
      { status: 500 }
    )
  }
}

