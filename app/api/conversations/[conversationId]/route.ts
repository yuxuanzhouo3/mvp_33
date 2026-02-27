import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { pinConversation as pinConversationCN, unpinConversation as unpinConversationCN } from '@/lib/database/cloudbase/conversations'

  /**
   * Conversation actions
   * PATCH /api/conversations/[conversationId]
   * Body: { action: 'delete' | 'restore' | 'read' | 'pin' | 'unpin' }
   *
   * - delete: per-user soft delete (marks this user's membership deleted_at)
   * - restore: clear deleted_at for this user's membership
   * - read: mark conversation as read for this user (updates last_read_at via RPC)
   * - pin: mark the conversation as pinned for the current user
   * - unpin: remove the pinned state for the current user
   */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> | { conversationId: string } }
) {
  try {
    // Handle both sync and async params (Next.js 16 compatibility)
    const resolvedParams = params instanceof Promise ? await params : params
    const conversationId = resolvedParams.conversationId
    
    console.log('▶ Conversation action request:', { conversationId })
    
    const dbClient = await getDatabaseClientForUser(request)
    const isCloudbase = dbClient.type === 'cloudbase' && dbClient.region === 'cn'
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    let supabase: Awaited<ReturnType<typeof createClient>> | null = null
    let user: { id: string } | null = null

    if (isCloudbase) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (cloudBaseUser) {
        user = { id: cloudBaseUser.id }
      }
    } else {
      supabase = dbClient.supabase || await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (supabaseUser) {
        user = { id: supabaseUser.id }
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('🔍 Checking membership:', { conversationId, userId: user.id })
    
    // Verify user is a member of the conversation (use appropriate database)
    let isMember = false
    
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      // CloudBase: Check membership in CloudBase
      const db = dbClient.cloudbase
      if (db) {
        try {
          const membersRes = await db.collection('conversation_members')
            .where({
              conversation_id: conversationId,
              user_id: user.id,
              region: 'cn',
            })
            .get()
          
          // Also check without region filter for backward compatibility
          if (!membersRes.data || membersRes.data.length === 0) {
            const membersResNoRegion = await db.collection('conversation_members')
              .where({
                conversation_id: conversationId,
                user_id: user.id,
              })
              .get()
            
            isMember = (membersResNoRegion.data && membersResNoRegion.data.length > 0) || false
          } else {
            isMember = true
          }
          
          console.log('✅ CloudBase membership check:', { conversationId, userId: user.id, isMember })
        } catch (cloudbaseError) {
          console.error('❌ Error checking CloudBase membership:', cloudbaseError)
          return NextResponse.json(
            { error: 'Failed to verify membership', details: (cloudbaseError as any)?.message },
            { status: 500 }
          )
        }
      }
    } else {
      // Supabase: Check membership in Supabase
      const { data: membership, error: membershipError } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (membershipError) {
        console.error('❌ Error checking Supabase membership:', {
          conversationId,
          userId: user.id,
          error: membershipError,
          code: membershipError.code,
          message: membershipError.message
        })
        return NextResponse.json(
          { error: 'Failed to verify membership', details: membershipError.message },
          { status: 500 }
        )
      }

      isMember = !!membership
      console.log('✅ Supabase membership check:', { conversationId, userId: user.id, isMember })
    }

    if (!isMember) {
      console.error('❌ User is not a member of conversation:', {
        conversationId,
        userId: user.id,
        dbType: dbClient.type,
        region: userRegion
      })
      
      return NextResponse.json(
        { error: 'Conversation not found or user is not a member' },
        { status: 404 }
      )
    }

    console.log('✅ Membership verified:', { conversationId, userId: user.id, dbType: dbClient.type })

    const body = await request.json()
    const action = body.action || 'delete' // 'delete' | 'restore' | 'read' | 'pin' | 'unpin'

    // Handle CloudBase pin/unpin/hide/unhide
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      if (action === 'delete' || action === 'restore') {
        const db = dbClient.cloudbase
        if (!db) {
          return NextResponse.json(
            { error: 'CloudBase not configured' },
            { status: 500 }
          )
        }

        let membersRes = await db.collection('conversation_members')
          .where({
            conversation_id: conversationId,
            user_id: user.id,
            region: 'cn',
          })
          .get()

        if (!membersRes.data || membersRes.data.length === 0) {
          membersRes = await db.collection('conversation_members')
            .where({
              conversation_id: conversationId,
              user_id: user.id,
            })
            .get()
        }

        if (!membersRes.data || membersRes.data.length === 0) {
          return NextResponse.json(
            { error: 'Failed to update conversation: membership not found' },
            { status: 404 }
          )
        }

        const membership = membersRes.data[0]
        await db.collection('conversation_members')
          .doc(membership._id)
          .update({
            deleted_at: action === 'delete' ? new Date().toISOString() : null,
          })

        return NextResponse.json({
          success: true,
          message: action === 'delete'
            ? 'Conversation deleted for this user'
            : 'Conversation restored for this user',
        })
      } else if (action === 'pin') {
        console.log('📌 Pinning conversation for user (CloudBase):', conversationId, user.id)
        const success = await pinConversationCN(conversationId, user.id)
        if (!success) {
          return NextResponse.json(
            { error: 'Failed to pin conversation' },
            { status: 500 }
          )
        }

        const pinnedAt = new Date().toISOString()
        return NextResponse.json({
          success: true,
          message: 'Conversation pinned',
          state: { is_pinned: true, pinned_at: pinnedAt },
        })
      } else if (action === 'unpin') {
        console.log('📌 Removing pin for conversation (CloudBase):', conversationId, user.id)
        const success = await unpinConversationCN(conversationId, user.id)
        if (!success) {
          return NextResponse.json(
            { error: 'Failed to unpin conversation' },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          message: 'Conversation unpinned',
          state: { is_pinned: false },
        })
      } else if (action === 'hide') {
        console.log('📦 Hiding conversation (CloudBase):', conversationId, user.id)
        const db = dbClient.cloudbase
        if (!db) {
          return NextResponse.json(
            { error: 'CloudBase not configured' },
            { status: 500 }
          )
        }

        // Find the membership (try with region filter first, then without for backward compatibility)
        let membersRes = await db.collection('conversation_members')
          .where({
            conversation_id: conversationId,
            user_id: user.id,
            region: 'cn',
          })
          .get()

        // If not found with region filter, try without region (for old records)
        if (!membersRes.data || membersRes.data.length === 0) {
          membersRes = await db.collection('conversation_members')
            .where({
              conversation_id: conversationId,
              user_id: user.id,
            })
            .get()
        }

        if (!membersRes.data || membersRes.data.length === 0) {
          console.error('❌ No membership found for hide:', { conversationId, userId: user.id })
          return NextResponse.json(
            { error: 'Failed to hide conversation: membership not found' },
            { status: 404 }
          )
        }

        const membership = membersRes.data[0]
        await db.collection('conversation_members')
          .doc(membership._id)
          .update({
            is_hidden: true,
            hidden_at: new Date().toISOString(),
          })

        return NextResponse.json({
          success: true,
          message: 'Conversation hidden',
          state: { is_hidden: true },
        })
      } else if (action === 'unhide') {
        console.log('📦 Unhiding conversation (CloudBase):', conversationId, user.id)
        const db = dbClient.cloudbase
        if (!db) {
          return NextResponse.json(
            { error: 'CloudBase not configured' },
            { status: 500 }
          )
        }

        // Find the membership (try with region filter first, then without for backward compatibility)
        let membersRes = await db.collection('conversation_members')
          .where({
            conversation_id: conversationId,
            user_id: user.id,
            region: 'cn',
          })
          .get()

        // If not found with region filter, try without region (for old records)
        if (!membersRes.data || membersRes.data.length === 0) {
          membersRes = await db.collection('conversation_members')
            .where({
              conversation_id: conversationId,
              user_id: user.id,
            })
            .get()
        }

        if (!membersRes.data || membersRes.data.length === 0) {
          console.error('❌ No membership found for unhide:', { conversationId, userId: user.id })
          return NextResponse.json(
            { error: 'Failed to unhide conversation: membership not found' },
            { status: 404 }
          )
        }

        const membership = membersRes.data[0]
        await db.collection('conversation_members')
          .doc(membership._id)
          .update({
            is_hidden: false,
            hidden_at: null,
          })

        return NextResponse.json({
          success: true,
          message: 'Conversation unhidden',
          state: { is_hidden: false },
        })
      } else if (action === 'read') {
        console.log('📖 Marking conversation as read for user (CloudBase):', conversationId, user.id)
        const db = dbClient.cloudbase
        if (!db) {
          return NextResponse.json(
            { error: 'CloudBase not configured' },
            { status: 500 }
          )
        }

        // Find the membership (try with region filter first, then without for backward compatibility)
        let membersRes = await db.collection('conversation_members')
          .where({
            conversation_id: conversationId,
            user_id: user.id,
            region: 'cn',
          })
          .get()

        if (!membersRes.data || membersRes.data.length === 0) {
          membersRes = await db.collection('conversation_members')
            .where({
              conversation_id: conversationId,
              user_id: user.id,
            })
            .get()
        }

        if (!membersRes.data || membersRes.data.length === 0) {
          console.error('❌ No membership found for read:', { conversationId, userId: user.id })
          return NextResponse.json(
            { error: 'Failed to mark as read: membership not found' },
            { status: 404 }
          )
        }

        const membership = membersRes.data[0]
        const now = new Date().toISOString()

        await db.collection('conversation_members')
          .doc(membership._id)
          .update({
            last_read_at: now,
          })

        return NextResponse.json({
          success: true,
          message: 'Conversation marked as read',
          state: { last_read_at: now },
        })
      }
      // For other actions, fall through to Supabase logic (if applicable)
    }

    if (isCloudbase) {
      return NextResponse.json(
        { error: 'Invalid action. Use "delete", "restore", "read", "hide", "unhide", "pin" or "unpin"' },
        { status: 400 }
      )
    }

    if (!supabase) {
      return NextResponse.json(
        { error: 'Database client unavailable' },
        { status: 500 }
      )
    }

    if (action === 'delete') {
      // Per-user soft delete: only hide this conversation for the current user.
      console.log('🗑️ Soft deleting conversation for current user:', { conversationId, userId: user.id })
      const { error: fallbackError } = await supabase
        .from('conversation_members')
        .update({ deleted_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)

      if (fallbackError) {
        console.error('❌ Error deleting conversation for user:', fallbackError)
        return NextResponse.json(
          { error: 'Failed to delete conversation' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Conversation deleted for this user',
      })
    } else if (action === 'restore') {
      // Restore: clear deleted_at for this user
      console.log('🔄 Restoring conversation for user:', conversationId, user.id)
      const { data, error } = await supabase
        .from('conversation_members')
        .update({ deleted_at: null })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .select()
        .single()

      if (error) {
        console.error('Error restoring conversation for user:', error)
        return NextResponse.json(
          { error: 'Failed to restore conversation' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Conversation restored for this user',
      })
    } else if (action === 'read') {
      // Mark conversation as read: update last_read_at for this user (use DB server time)
      console.log('📖 Marking conversation as read for user via RPC:', conversationId, user.id)
      const { data: rpcResult, error: rpcError } = await supabase.rpc('mark_conversation_read', {
        p_conversation_id: conversationId,
        p_user_id: user.id,
      })

      if (rpcError) {
        console.error('Error calling mark_conversation_read RPC:', rpcError)
        return NextResponse.json(
          { error: 'Failed to mark conversation as read' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Conversation marked as read',
        result: rpcResult,
      })
    } else if (action === 'pin') {
      console.log('📌 Pinning conversation for user:', conversationId, user.id)
      const { data: updatedData, error: pinError } = await supabase
        .from('conversation_members')
        .update({
          is_pinned: true,
          pinned_at: new Date().toISOString(),
        })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .select()

      if (pinError) {
        console.error('❌ Error pinning conversation:', {
          error: pinError,
          code: pinError.code,
          message: pinError.message,
          details: pinError.details,
          hint: pinError.hint,
          conversationId,
          userId: user.id
        })
        return NextResponse.json(
          { error: 'Failed to pin conversation', details: pinError.message },
          { status: 500 }
        )
      }

      // Check if any row was actually updated
      if (!updatedData || updatedData.length === 0) {
        console.error('❌ No rows updated when pinning conversation:', {
          conversationId,
          userId: user.id,
          message: 'Membership may not exist or RLS policy may be blocking update'
        })
        return NextResponse.json(
          { error: 'Failed to pin conversation: membership not found or update blocked' },
          { status: 404 }
        )
      }

      const pinnedAt = updatedData[0].pinned_at || new Date().toISOString()
      console.log('✅ Successfully pinned conversation:', {
        conversationId,
        userId: user.id,
        pinnedAt
      })
      return NextResponse.json({
        success: true,
        message: 'Conversation pinned',
        state: { is_pinned: true, pinned_at: pinnedAt },
      })
    } else if (action === 'unpin') {
      console.log('📌 Removing pin for conversation:', conversationId, user.id)
      const { data: updatedData, error: unpinError } = await supabase
        .from('conversation_members')
        .update({
          is_pinned: false,
          pinned_at: null,
        })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .select()

      if (unpinError) {
        console.error('❌ Error unpinning conversation:', {
          error: unpinError,
          code: unpinError.code,
          message: unpinError.message,
          details: unpinError.details,
          hint: unpinError.hint,
          conversationId,
          userId: user.id
        })
        return NextResponse.json(
          { error: 'Failed to unpin conversation', details: unpinError.message },
          { status: 500 }
        )
      }

      // Check if any row was actually updated
      if (!updatedData || updatedData.length === 0) {
        console.error('❌ No rows updated when unpinning conversation:', {
          conversationId,
          userId: user.id,
          message: 'Membership may not exist or RLS policy may be blocking update'
        })
        return NextResponse.json(
          { error: 'Failed to unpin conversation: membership not found or update blocked' },
          { status: 404 }
        )
      }

      console.log('✅ Successfully unpinned conversation:', {
        conversationId,
        userId: user.id
      })
      return NextResponse.json({
        success: true,
        message: 'Conversation unpinned',
        state: { is_pinned: false },
      })
    } else if (action === 'hide') {
      console.log('📦 Hiding conversation:', conversationId, user.id)
      const { error: hideError } = await supabase
        .from('conversation_members')
        .update({
          is_hidden: true,
          hidden_at: new Date().toISOString(),
        })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)

      if (hideError) {
        console.error('Error hiding conversation:', hideError)
        return NextResponse.json(
          { error: 'Failed to hide conversation' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Conversation hidden',
        state: { is_hidden: true },
      })
    } else if (action === 'unhide') {
      console.log('📦 Unhiding conversation:', conversationId, user.id)
      const { error: unhideError } = await supabase
        .from('conversation_members')
        .update({
          is_hidden: false,
          hidden_at: null,
        })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)

      if (unhideError) {
        console.error('Error unhiding conversation:', unhideError)
        return NextResponse.json(
          { error: 'Failed to unhide conversation' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Conversation unhidden',
        state: { is_hidden: false },
      })
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "delete", "restore", "read", "hide", "unhide", "pin" or "unpin"' },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error('Conversation action error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    )
  }
}
