import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Create a conversation (direct message or group)
 * POST /api/conversations
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, member_ids, name, description } = body

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

    // Get current user
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get current workspace (for now, use first workspace or create default)
    const { data: workspaces } = await supabase
      .from('workspace_members')
      .select('workspace_id, workspaces (*)')
      .eq('user_id', currentUser.id)
      .limit(1)

    let workspaceId: string
    if (workspaces && workspaces.length > 0) {
      workspaceId = workspaces[0].workspace_id
    } else {
      // Create default workspace if none exists
      const { data: newWorkspace, error: workspaceError } = await supabase
        .from('workspaces')
        .insert({
          name: 'My Workspace',
          domain: `workspace-${currentUser.id.substring(0, 8)}`,
          owner_id: currentUser.id,
        })
        .select()
        .single()

      if (workspaceError || !newWorkspace) {
        console.error('Create workspace error:', workspaceError)
        // Try to get existing workspace by domain
        const domain = `workspace-${currentUser.id.substring(0, 8)}`
        const { data: existingWorkspace } = await supabase
          .from('workspaces')
          .select('id')
          .eq('domain', domain)
          .single()

        if (existingWorkspace) {
          workspaceId = existingWorkspace.id
          // Ensure user is a member
          await supabase.from('workspace_members').upsert({
            workspace_id: workspaceId,
            user_id: currentUser.id,
            role: 'owner',
          }, { onConflict: 'workspace_id,user_id' })
        } else {
          return NextResponse.json(
            { 
              error: workspaceError?.message || 'Failed to create workspace',
              details: 'Please ensure workspaces table exists and RLS policies allow insertion'
            },
            { status: 500 }
          )
        }
      } else {
        workspaceId = newWorkspace.id
        // Add user as owner (use upsert to avoid conflicts)
        await supabase.from('workspace_members').upsert({
          workspace_id: workspaceId,
          user_id: currentUser.id,
          role: 'owner',
        }, { onConflict: 'workspace_id,user_id' })
      }
    }

    // For direct messages, check if conversation already exists
    if (type === 'direct' && member_ids.length === 1) {
      const otherUserId = member_ids[0]
      
      // Check for existing direct conversation
      const { data: existingConversations } = await supabase
        .from('conversations')
        .select(`
          id,
          conversation_members!inner (user_id)
        `)
        .eq('workspace_id', workspaceId)
        .eq('type', 'direct')
        .eq('conversation_members.user_id', currentUser.id)

      if (existingConversations) {
        for (const conv of existingConversations) {
          const { data: members } = await supabase
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', conv.id)

          if (members && members.length === 2) {
            const memberIds = members.map(m => m.user_id)
            if (memberIds.includes(currentUser.id) && memberIds.includes(otherUserId)) {
              // Conversation exists, return it
              const { data: conversation } = await supabase
                .from('conversations')
                .select('*')
                .eq('id', conv.id)
                .single()

              return NextResponse.json({
                success: true,
                conversation,
              })
            }
          }
        }
      }
    }

    // Create new conversation
    const { data: newConversation, error: convError } = await supabase
      .from('conversations')
      .insert({
        workspace_id: workspaceId,
        type,
        name: name || null,
        description: description || null,
        created_by: currentUser.id,
        is_private: type === 'direct',
      })
      .select()
      .single()

    if (convError || !newConversation) {
      console.error('Create conversation error:', convError)
      return NextResponse.json(
        { error: convError?.message || 'Failed to create conversation' },
        { status: 500 }
      )
    }

    // Add members to conversation
    const allMemberIds = type === 'direct' 
      ? [currentUser.id, ...member_ids]
      : [currentUser.id, ...member_ids]

    const conversationMembers = allMemberIds.map((userId, index) => ({
      conversation_id: newConversation.id,
      user_id: userId,
      role: index === 0 ? 'owner' : 'member',
    }))

    const { error: membersError } = await supabase
      .from('conversation_members')
      .insert(conversationMembers)

    if (membersError) {
      console.error('Add members error:', membersError)
      // Don't fail, just log
    }

    return NextResponse.json({
      success: true,
      conversation: newConversation,
    })
  } catch (error: any) {
    console.error('Create conversation error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create conversation' },
      { status: 500 }
    )
  }
}

