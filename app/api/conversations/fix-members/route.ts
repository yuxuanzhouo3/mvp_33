import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Fix missing conversation_members records
 * POST /api/conversations/fix-members
 * This endpoint will:
 * 1. Find all conversations that have messages but missing members
 * 2. Add missing members based on message senders
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('🔧 Starting to fix missing conversation_members records...')

    // Step 1: Find all conversations that have messages
    const { data: conversationsWithMessages, error: convError } = await supabase
      .from('messages')
      .select('conversation_id, sender_id, conversations!inner(id, type, created_by)')
      .not('conversation_id', 'is', null)

    if (convError) {
      console.error('❌ Error fetching conversations with messages:', convError)
      return NextResponse.json(
        { error: 'Failed to fetch conversations', details: convError.message },
        { status: 500 }
      )
    }

    if (!conversationsWithMessages || conversationsWithMessages.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No conversations with messages found',
        fixed: 0
      })
    }

    // Step 2: Group by conversation_id and collect all unique sender_ids
    const conversationMembersMap = new Map<string, Set<string>>()
    
    conversationsWithMessages.forEach((msg: any) => {
      const convId = msg.conversation_id
      const senderId = msg.sender_id
      const conversation = msg.conversations
      
      if (!conversationMembersMap.has(convId)) {
        conversationMembersMap.set(convId, new Set())
      }
      
      const membersSet = conversationMembersMap.get(convId)!
      if (senderId) {
        membersSet.add(senderId)
      }
      
      // Also add the conversation creator if available
      if (conversation?.created_by) {
        membersSet.add(conversation.created_by)
      }
    })

    console.log(`📋 Found ${conversationMembersMap.size} conversations with messages`)

    // Step 3: For each conversation, check existing members and add missing ones
    let totalFixed = 0
    const fixedDetails: Array<{ conversationId: string; addedMembers: string[] }> = []

    for (const [conversationId, expectedMemberIds] of conversationMembersMap.entries()) {
      // Get existing members
      const { data: existingMembers, error: membersError } = await supabase
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', conversationId)

      if (membersError) {
        console.error(`❌ Error fetching members for conversation ${conversationId}:`, membersError)
        continue
      }

      const existingMemberIds = new Set(existingMembers?.map((m: any) => m.user_id) || [])
      const missingMemberIds = Array.from(expectedMemberIds).filter(id => !existingMemberIds.has(id))

      if (missingMemberIds.length === 0) {
        continue // All members already exist
      }

      console.log(`🔧 Conversation ${conversationId}: Missing ${missingMemberIds.length} members`, missingMemberIds)

      // Add missing members
      const membersToAdd = missingMemberIds.map((userId, index) => ({
        conversation_id: conversationId,
        user_id: userId,
        role: index === 0 ? 'member' : 'member', // All as members for now
      }))

      // Try using the RPC function first
      const membersJson = membersToAdd.map(m => ({
        user_id: m.user_id,
        role: m.role
      }))

      const { error: insertError } = await supabase.rpc('insert_conversation_members', {
        p_conversation_id: conversationId,
        p_members: membersJson
      })

      if (insertError) {
        console.error(`❌ Error inserting members via RPC for ${conversationId}:`, insertError)
        
        // Fallback: try direct insert
        const { error: directInsertError } = await supabase
          .from('conversation_members')
          .insert(membersToAdd)

        if (directInsertError) {
          console.error(`❌ Direct insert also failed for ${conversationId}:`, directInsertError)
          continue
        }
      }

      totalFixed += missingMemberIds.length
      fixedDetails.push({
        conversationId,
        addedMembers: missingMemberIds
      })

      console.log(`✅ Added ${missingMemberIds.length} members to conversation ${conversationId}`)
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${totalFixed} missing member records`,
      fixed: totalFixed,
      details: fixedDetails
    })

  } catch (error: any) {
    console.error('❌ Error fixing conversation members:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fix conversation members' },
      { status: 500 }
    )
  }
}













































































































