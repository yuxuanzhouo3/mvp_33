import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { getUserById as getCloudBaseUserById } from '@/lib/database/cloudbase/users'

/**
 * Get contact requests
 * GET /api/contact-requests?type=sent|received
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'received' // 'sent' or 'received'
    const status = searchParams.get('status') || 'pending' // 'pending', 'accepted', 'rejected', or 'all'

    const { IS_DOMESTIC_VERSION } = await import('@/config')

    let currentUser: any = null

    if (IS_DOMESTIC_VERSION) {
      // CN版本：只使用CloudBase认证
      console.log('[GET /api/contact-requests] 使用CloudBase认证（CN版本）')
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)

      if (!cloudBaseUser) {
        console.error('[GET /api/contact-requests] CloudBase用户未认证')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      console.log('[GET /api/contact-requests] CloudBase用户已认证:', cloudBaseUser.id)
      currentUser = cloudBaseUser
    } else {
      // INTL版本：只使用Supabase认证
      console.log('[GET /api/contact-requests] 使用Supabase认证（INTL版本）')
      const supabase = await createClient()
      const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser()

      if (authError) {
        console.error('Auth error in contact-requests API (GET):', authError)
      }

      if (!supabaseUser) {
        console.error('No current user in contact-requests API (GET). Auth error:', authError)
        return NextResponse.json(
          { error: 'Unauthorized', details: authError?.message || 'No user found' },
          { status: 401 }
        )
      }

      console.log('[GET /api/contact-requests] Supabase用户已认证:', supabaseUser.id)
      currentUser = supabaseUser
    }

    console.log(`[Contact Requests API] Current user ID: ${currentUser.id}, Type: ${type}, Status: ${status}`)

    // Decide which database this user actually uses
    const dbClient = await getDatabaseClientForUser(request)
    const currentRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    // CN users → CloudBase contact_requests
    if (dbClient.type === 'cloudbase' && currentRegion === 'cn' && dbClient.cloudbase) {
      const db = dbClient.cloudbase
      const cmd = db.command

      const where: any = {
        region: 'cn',
      }

      // Add status filter
      if (status !== 'all') {
        where.status = status
      }

      if (type === 'sent') {
        where.requester_id = currentUser.id
      } else {
        where.recipient_id = currentUser.id
      }

      const res = await db
        .collection('contact_requests')
        .where(where)
        .orderBy('created_at', 'desc')
        .get()

      const rawRequests = res?.data || []

      // Load involved users from CloudBase users collection
      const userIds = Array.from(
        new Set(
          rawRequests.flatMap((r: any) => [r.requester_id, r.recipient_id]).filter(Boolean)
        )
      )

      let usersById = new Map<string, any>()
      if (userIds.length > 0) {
        const usersRes = await db
          .collection('users')
          .where({
            id: cmd.in(userIds),
          })
          .get()
        const userDocs = usersRes?.data || []
        for (const u of userDocs) {
          const uid = u.id || u._id
          if (uid) {
            usersById.set(uid, u)
          }
        }
      }

      const normalizeUser = (u: any) => {
        if (!u) return undefined
        return {
          id: u.id || u._id,
          email: u.email,
          username: u.username || u.email?.split('@')[0] || '',
          full_name: u.full_name || u.name || '',
          avatar_url: u.avatar_url || null,
          department: u.department || undefined,
          title: u.title || undefined,
          status: u.status || 'offline',
          region: u.region || 'cn',
        }
      }

      const requests = rawRequests.map((r: any) => {
        const requesterUser = usersById.get(r.requester_id)
        const recipientUser = usersById.get(r.recipient_id)
        return {
          id: r.id || r._id,
          requester_id: r.requester_id,
          recipient_id: r.recipient_id,
          message: r.message || null,
          status: r.status || 'pending',
          created_at: r.created_at,
          updated_at: r.updated_at || r.created_at,
          requester: normalizeUser(requesterUser),
          recipient: normalizeUser(recipientUser),
        }
      })

      return NextResponse.json({
        success: true,
        requests,
      })
    }

    // INTL users → Supabase contact_requests
    const supabase = await createClient()
    let query = supabase
      .from('contact_requests')
      .select(`
        id,
        requester_id,
        recipient_id,
        message,
        status,
        created_at,
        updated_at,
        requester:users!contact_requests_requester_id_fkey (
          id,
          email,
          username,
          full_name,
          avatar_url,
          department,
          title,
          status,
          region
        ),
        recipient:users!contact_requests_recipient_id_fkey (
          id,
          email,
          username,
          full_name,
          avatar_url,
          department,
          title,
          status,
          region
        )
      `)

    if (type === 'sent') {
      query = query.eq('requester_id', currentUser.id)
    } else {
      query = query.eq('recipient_id', currentUser.id)
    }

    // Add status filter
    if (status !== 'all') {
      query = query.eq('status', status)
    }

    query = query.order('created_at', { ascending: false })

    const { data: requests, error } = await query

    if (error) {
      console.error('Get contact requests error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      // If table doesn't exist, return empty array instead of error
      if (error.message?.includes('does not exist') || error.message?.includes('schema cache')) {
        return NextResponse.json({
          success: true,
          requests: [],
        })
      }
      return NextResponse.json(
        { error: 'Failed to get contact requests', details: error.message },
        { status: 500 }
      )
    }

    console.log(`[Contact Requests API] Found ${requests?.length || 0} requests for user ${currentUser.id}`)
    if (requests && requests.length > 0) {
      console.log(`[Contact Requests API] Request IDs: ${requests.map(r => r.id).join(', ')}`)
    }

    const filteredRequests = (requests || []).filter((request: any) => {
      if (type === 'sent') {
        const recipient = Array.isArray(request.recipient) ? request.recipient[0] : request.recipient
        const region = recipient?.region || 'global'
        return region === currentRegion
      }
      const requester = Array.isArray(request.requester) ? request.requester[0] : request.requester
      const region = requester?.region || 'global'
      return region === currentRegion
    })

    return NextResponse.json({
      success: true,
      requests: filteredRequests,
    })
  } catch (error: any) {
    console.error('Get contact requests error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get contact requests' },
      { status: 500 }
    )
  }
}

/**
 * Create a contact request
 * POST /api/contact-requests
 */
export async function POST(request: NextRequest) {
  console.log('[POST /api/contact-requests] 开始处理请求')

  try {
    const body = await request.json()
    const { recipient_id, message } = body

    console.log('[POST /api/contact-requests] 请求参数:', { recipient_id, message })

    if (!recipient_id) {
      console.error('[POST /api/contact-requests] 缺少 recipient_id')
      return NextResponse.json(
        { error: 'recipient_id is required' },
        { status: 400 }
      )
    }

    const { IS_DOMESTIC_VERSION } = await import('@/config')

    let currentUser: any = null

    if (IS_DOMESTIC_VERSION) {
      // CN版本：只使用CloudBase认证
      console.log('[POST /api/contact-requests] 使用CloudBase认证（CN版本）')
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)

      if (!cloudBaseUser) {
        console.error('[POST /api/contact-requests] CloudBase用户未认证')
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      console.log('[POST /api/contact-requests] CloudBase用户已认证:', cloudBaseUser.id)
      currentUser = cloudBaseUser
    } else {
      // INTL版本：只使用Supabase认证
      console.log('[POST /api/contact-requests] 使用Supabase认证（INTL版本）')
      const supabase = await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()

      if (!supabaseUser) {
        console.error('[POST /api/contact-requests] Supabase用户未认证')
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      console.log('[POST /api/contact-requests] Supabase用户已认证:', supabaseUser.id)
      currentUser = supabaseUser
    }

    console.log('[POST /api/contact-requests] 当前用户:', currentUser.id)

    // Decide which database this user actually uses
    const dbClient = await getDatabaseClientForUser(request)
    const currentRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    console.log('[POST /api/contact-requests] 数据库区域:', currentRegion)

    // Check if trying to send to self
    if (recipient_id === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot send request to yourself' },
        { status: 400 }
      )
    }

    // CN users → CloudBase contact_requests
    if (dbClient.type === 'cloudbase' && currentRegion === 'cn' && dbClient.cloudbase) {
      const db = dbClient.cloudbase
      const cmd = db.command

      // Verify recipient exists in CloudBase users
      const recipientUser = await getCloudBaseUserById(recipient_id)
      if (!recipientUser) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      const normalizedRecipientId = String(recipientUser.id || '').trim()
      if (!normalizedRecipientId) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }

      // Re-check self-add with normalized ID (legacy QR may carry CloudBase _id).
      if (normalizedRecipientId === currentUser.id) {
        return NextResponse.json(
          { error: 'Cannot send request to yourself' },
          { status: 400 }
        )
      }

      if ((recipientUser.region || 'cn') !== currentRegion) {
        return NextResponse.json(
          { error: 'You can only send contact requests to users in the same region' },
          { status: 400 }
        )
      }

      // --- Check if contact already exists (with legacy fallbacks) ---
      const contactQueries = [
        { user_id: currentUser.id, contact_user_id: normalizedRecipientId, region: 'cn' },
        { user_id: currentUser.id, contact_user_id: normalizedRecipientId }, // fallback for legacy docs without region
        { user_id: normalizedRecipientId, contact_user_id: currentUser.id, region: 'cn' }, // reverse
        { user_id: normalizedRecipientId, contact_user_id: currentUser.id }, // reverse fallback
      ]

      let contactExists = false
      for (const q of contactQueries) {
        const res = await db.collection('contacts').where(q).limit(1).get()
        if (res?.data && res.data.length > 0) {
          contactExists = true
          break
        }
      }

      if (contactExists) {
        return NextResponse.json(
          { error: 'Contact already exists' },
          { status: 400 }
        )
      }

      // If no contact, clean up stale accepted requests so user can re-send
      const cleanupRequests = async (requesterId: string, recipientId: string) => {
        // accepted or pending (legacy) without region filter
        await db.collection('contact_requests')
          .where({
            requester_id: requesterId,
            recipient_id: recipientId,
            status: cmd.in(['accepted']),
          })
          .remove()
        // legacy without status region filter
        await db.collection('contact_requests')
          .where({
            requester_id: requesterId,
            recipient_id: recipientId,
            status: cmd.in(['accepted']),
            region: 'cn',
          })
          .remove()
      }

      // Check if request already exists (bidirectional)
      const existingReqAsRequester = await db
        .collection('contact_requests')
        .where({
          requester_id: currentUser.id,
          recipient_id: normalizedRecipientId,
          status: cmd.in(['pending', 'accepted']),
          region: 'cn',
        })
        .limit(1)
        .get()

      if (existingReqAsRequester.data && existingReqAsRequester.data.length > 0) {
        const r = existingReqAsRequester.data[0]
        if (r.status === 'pending') {
          return NextResponse.json(
            { error: 'Request already pending', errorType: 'sent_pending' },
            { status: 400 }
          )
        } else {
          // accepted but no contacts now — clean it and allow re-send
          await cleanupRequests(currentUser.id, normalizedRecipientId)
        }
      }

      const existingReqAsRecipient = await db
        .collection('contact_requests')
        .where({
          requester_id: normalizedRecipientId,
          recipient_id: currentUser.id,
          status: cmd.in(['pending', 'accepted']),
          region: 'cn',
        })
        .limit(1)
        .get()

      if (existingReqAsRecipient.data && existingReqAsRecipient.data.length > 0) {
        const r = existingReqAsRecipient.data[0]
        if (r.status === 'pending') {
          return NextResponse.json(
            {
              error: 'This user has already sent you a contact request. Please check the "Requests" tab to accept it.',
              errorType: 'received_pending',
            },
            { status: 400 }
          )
        } else {
          // accepted but no contacts now — clean it and allow re-send
          await cleanupRequests(normalizedRecipientId, currentUser.id)
        }
      }

      const now = new Date().toISOString()
      const insertRes = await db.collection('contact_requests').add({
        requester_id: currentUser.id,
        recipient_id: normalizedRecipientId,
        message: message || null,
        status: 'pending',
        created_at: now,
        updated_at: now,
        region: 'cn',
      })

      const requestId = insertRes.id || insertRes._id

      console.log('[POST /api/contact-requests] 数据库写入成功:', {
        requestId,
        requester_id: currentUser.id,
        recipient_id: normalizedRecipientId,
        status: 'pending',
        region: 'cn'
      })

      return NextResponse.json({
        success: true,
        request: {
          id: requestId,
          requester_id: currentUser.id,
          recipient_id: normalizedRecipientId,
          message: message || null,
          status: 'pending',
          created_at: now,
          updated_at: now,
        },
      })
    }

    // Global / Supabase users → keep existing Supabase logic
    const supabase = await createClient()
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('region')
      .eq('id', currentUser.id)
      .maybeSingle()

    if (profileError) {
      console.error('Failed to load current user region in contact-requests API (POST):', profileError)
    }

    const currentRegionSupabase = profile?.region === 'cn' ? 'cn' : 'global'

    const { data: recipientProfile, error: recipientProfileError } = await supabase
      .from('users')
      .select('id, region')
      .eq('id', recipient_id)
      .maybeSingle()

    if (recipientProfileError) {
      console.error('Failed to load recipient profile in contact-requests API (POST):', recipientProfileError)
    }

    if (!recipientProfile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if ((recipientProfile.region || 'global') !== currentRegionSupabase) {
      return NextResponse.json(
        { error: 'You can only send contact requests to users in the same region' },
        { status: 400 }
      )
    }

    // Check if contact already exists (bidirectional check)
    const { data: existingContact1 } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', currentUser.id)
      .eq('contact_user_id', recipient_id)
      .maybeSingle()

    const { data: existingContact2 } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', recipient_id)
      .eq('contact_user_id', currentUser.id)
      .maybeSingle()

    if (existingContact1 || existingContact2) {
      return NextResponse.json(
        { error: 'Contact already exists' },
        { status: 400 }
      )
    }

    // Check if request already exists (bidirectional)
    // Check as requester (you sent a request)
    const { data: requestAsRequester } = await supabase
      .from('contact_requests')
      .select('id, status')
      .eq('requester_id', currentUser.id)
      .eq('recipient_id', recipient_id)
      .in('status', ['pending', 'accepted'])
      .maybeSingle()

    // Check as recipient (they sent you a request)
    const { data: requestAsRecipient } = await supabase
      .from('contact_requests')
      .select('id, status')
      .eq('requester_id', recipient_id)
      .eq('recipient_id', currentUser.id)
      .in('status', ['pending', 'accepted'])
      .maybeSingle()

    // Cleanup function for stale accepted requests
    // This function will forcefully delete the request, even if it's accepted
    const cleanupStaleRequest = async (requestId: string): Promise<boolean> => {
      try {
        const { error } = await supabase
          .from('contact_requests')
          .delete()
          .eq('id', requestId)
        
        if (error) {
          console.error('❌ Failed to cleanup stale request:', error)
          return false
        }
        
        console.log('✅ Successfully cleaned up stale request:', requestId)
        return true
      } catch (error: any) {
        console.error('❌ Exception while cleaning up stale request:', error)
        return false
      }
    }
    
    // Force cleanup function - deletes by requester_id and recipient_id combination
    const forceCleanupByPair = async (requesterId: string, recipientId: string): Promise<boolean> => {
      try {
        // First, get all existing requests to verify what we're deleting
        const { data: existingRequests } = await supabase
          .from('contact_requests')
          .select('id, status, requester_id, recipient_id')
          .or(`and(requester_id.eq.${requesterId},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${requesterId})`)
        
        if (existingRequests && existingRequests.length > 0) {
          console.log('🔍 Found existing requests to delete:', existingRequests)
          
          // Delete by IDs to be more precise
          const idsToDelete = existingRequests.map(r => r.id)
          const { error: deleteError } = await supabase
            .from('contact_requests')
            .delete()
            .in('id', idsToDelete)
          
          if (deleteError) {
            console.error('❌ Failed to delete by IDs:', deleteError)
            // Fallback: try deleting by pair again
            const { error: error1 } = await supabase
              .from('contact_requests')
              .delete()
              .eq('requester_id', requesterId)
              .eq('recipient_id', recipientId)
            
            const { error: error2 } = await supabase
              .from('contact_requests')
              .delete()
              .eq('requester_id', recipientId)
              .eq('recipient_id', requesterId)
            
            if (error1 || error2) {
              console.error('❌ Fallback delete also failed:', error1 || error2)
              return false
            }
          }
          
          // Verify deletion
          await new Promise(resolve => setTimeout(resolve, 200)) // Wait for DB to process
          const { data: verifyRequests } = await supabase
            .from('contact_requests')
            .select('id')
            .or(`and(requester_id.eq.${requesterId},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${requesterId})`)
          
          if (verifyRequests && verifyRequests.length > 0) {
            console.error('❌ Verification failed: requests still exist after cleanup:', verifyRequests)
            return false
          }
          
          console.log('✅ Successfully force cleaned up requests for pair:', requesterId, recipientId)
          return true
        } else {
          console.log('✅ No existing requests found for pair:', requesterId, recipientId)
          return true
        }
      } catch (error: any) {
        console.error('❌ Exception while force cleaning up by pair:', error)
        return false
      }
    }

    if (requestAsRequester) {
      if (requestAsRequester.status === 'pending') {
        return NextResponse.json(
          { error: 'Request already pending', errorType: 'sent_pending' },
          { status: 400 }
        )
      } else {
        // accepted but contact doesn't exist (was deleted) - delete old request and create new one
        console.log('🔄 Contact was deleted, deleting old accepted request and creating new one:', requestAsRequester.id)
        // Delete the old request first to avoid unique constraint
        const cleaned = await cleanupStaleRequest(requestAsRequester.id)
        if (!cleaned) {
          // If cleanup failed, try force cleanup
          console.log('⚠️ Cleanup failed, trying force cleanup by pair...')
          await forceCleanupByPair(currentUser.id, recipient_id)
          // Wait a bit for database to process
          await new Promise(resolve => setTimeout(resolve, 200))
        }
        // Continue to create new request below
      }
    }

    if (requestAsRecipient) {
      if (requestAsRecipient.status === 'pending') {
        return NextResponse.json(
          { error: 'This user has already sent you a contact request. Please check the "Requests" tab to accept it.', errorType: 'received_pending' },
          { status: 400 }
        )
      } else {
        // accepted but contact doesn't exist (was deleted) - create a NEW request from current user
        // Don't update the old one because it's from the other direction (they sent to us)
        // We need to create a new request from us to them
        console.log('🔄 Contact was deleted, but there is an old accepted request from them to us. Creating new request from us to them...')
        // Delete the old request first to avoid unique constraint
        const cleaned = await cleanupStaleRequest(requestAsRecipient.id)
        if (!cleaned) {
          // If cleanup failed, try force cleanup
          console.log('⚠️ Cleanup failed, trying force cleanup by pair...')
          await forceCleanupByPair(recipient_id, currentUser.id)
          // Wait a bit for database to process
          await new Promise(resolve => setTimeout(resolve, 200))
        }
        // Continue to create new request below
      }
    }

    // Create contact request (Supabase)
    // CRITICAL: Before inserting, do a final aggressive cleanup to ensure no conflicts
    console.log('🧹 Performing final cleanup before insert...')
    const finalCleanupSuccess = await forceCleanupByPair(currentUser.id, recipient_id)
    if (finalCleanupSuccess) {
      // Wait for database to fully process the deletion
      await new Promise(resolve => setTimeout(resolve, 300))
    } else {
      console.warn('⚠️ Final cleanup had issues, but continuing with insert attempt')
    }

    const { data: newRequest, error: insertError } = await supabase
      .from('contact_requests')
      .insert({
        requester_id: currentUser.id,
        recipient_id,
        message: message || null,
        status: 'pending',
      })
      .select(`
        *,
        requester:users!contact_requests_requester_id_fkey (
          id,
          email,
          username,
          full_name,
          avatar_url
        ),
        recipient:users!contact_requests_recipient_id_fkey (
          id,
          email,
          username,
          full_name,
          avatar_url
        )
      `)
      .single()

    if (insertError) {
      console.error('❌ Create contact request error:', insertError)
      console.error('Insert error details:', {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
        fullError: JSON.stringify(insertError, Object.getOwnPropertyNames(insertError)),
      })
      
      // Check if it's a unique constraint violation (duplicate key)
      // This should rarely happen now since we update existing requests instead of deleting
      if (insertError.code === '23505' || insertError.message?.includes('duplicate key') || insertError.message?.includes('unique constraint')) {
        console.log('🔄 Unique constraint violation detected (unexpected), trying to update existing request...')
        
        // Get the existing request
        const { data: existingRequest } = await supabase
          .from('contact_requests')
          .select('id, status, requester_id, recipient_id')
          .eq('requester_id', currentUser.id)
          .eq('recipient_id', recipient_id)
          .maybeSingle()
        
        if (existingRequest) {
          // Try to update it to pending
          const { data: updatedRequest, error: updateError } = await supabase
            .from('contact_requests')
            .update({ 
              status: 'pending',
              message: message || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingRequest.id)
            .select(`
              *,
              requester:users!contact_requests_requester_id_fkey (
                id,
                email,
                username,
                full_name,
                avatar_url
              ),
              recipient:users!contact_requests_recipient_id_fkey (
                id,
                email,
                username,
                full_name,
                avatar_url
              )
            `)
            .single()
          
          if (updateError) {
            console.error('❌ Failed to update existing request:', updateError)
            // If update fails, try to delete and re-insert
            console.log('🔄 Update failed, trying to delete and re-insert...')
            const deleteSuccess = await cleanupStaleRequest(existingRequest.id)
            if (deleteSuccess) {
              // Wait for database to process
              await new Promise(resolve => setTimeout(resolve, 200))
              // Retry insert
              const { data: retryRequest, error: retryError } = await supabase
                .from('contact_requests')
                .insert({
                  requester_id: currentUser.id,
                  recipient_id,
                  message: message || null,
                  status: 'pending',
                })
                .select(`
                  *,
                  requester:users!contact_requests_requester_id_fkey (
                    id,
                    email,
                    username,
                    full_name,
                    avatar_url
                  ),
                  recipient:users!contact_requests_recipient_id_fkey (
                    id,
                    email,
                    username,
                    full_name,
                    avatar_url
                  )
                `)
                .single()
              
              if (retryError) {
                console.error('❌ Retry insert also failed:', retryError)
                return NextResponse.json(
                  { 
                    error: 'Failed to create contact request',
                    details: 'Could not update or recreate the request',
                    code: retryError.code || insertError.code,
                  },
                  { status: 500 }
                )
              }
              
              console.log('✅ Successfully created request after delete and retry')
              return NextResponse.json({
                success: true,
                request: retryRequest,
              })
            } else {
              return NextResponse.json(
                { 
                  error: 'Failed to create contact request',
                  details: 'A request already exists but could not be updated or deleted',
                  code: insertError.code,
                },
                { status: 500 }
              )
            }
          }
          
          console.log('✅ Successfully updated existing request to pending')
          return NextResponse.json({
            success: true,
            request: updatedRequest,
          })
        }
        
        // If we can't find the existing request, something is wrong
        console.error('❌ Unique constraint violation but cannot find existing request')
        return NextResponse.json(
          { 
            error: 'Failed to create contact request',
            details: insertError.message,
            code: insertError.code,
          },
          { status: 500 }
        )
      }
      
      // If table doesn't exist, fall back to direct contact addition
      if (insertError.message?.includes('does not exist') || insertError.message?.includes('schema cache')) {
        // Fallback: Add contact directly
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            user_id: currentUser.id,
            contact_user_id: recipient_id,
            is_favorite: false,
            is_blocked: false,
          })
          .select(`
            *,
            users!contacts_contact_user_id_fkey (
              id,
              email,
              username,
              full_name,
              avatar_url
            )
          `)
          .single()

        if (contactError) {
          return NextResponse.json(
            { error: 'Please run scripts/005_contact_requests.sql in Supabase to enable contact requests, or contact already exists' },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          contact: {
            ...newContact,
            user: (newContact as any).users,
          },
          message: 'Contact added directly (contact_requests table not found)',
        })
      }
      // Return detailed error information for debugging
      console.error('❌ Final error handling - insert failed with:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
      })
      
      // If it's still a unique constraint, try one more aggressive cleanup
      if (insertError.code === '23505') {
        console.log('🔄 Last attempt: Force cleanup and retry...')
        
        // Get all existing requests first
        const { data: allExisting } = await supabase
          .from('contact_requests')
          .select('id, status, requester_id, recipient_id')
          .or(`and(requester_id.eq.${currentUser.id},recipient_id.eq.${recipient_id}),and(requester_id.eq.${recipient_id},recipient_id.eq.${currentUser.id})`)
        
        console.log('📋 All existing requests before final cleanup:', allExisting)
        
        if (allExisting && allExisting.length > 0) {
          // Try multiple deletion methods
          const idsToDelete = allExisting.map(r => r.id)
          
          // Method 1: Delete by IDs
          const { error: delete1 } = await supabase
            .from('contact_requests')
            .delete()
            .in('id', idsToDelete)
          
          // Method 2: Delete by pairs (both directions)
          const { error: delete2 } = await supabase
            .from('contact_requests')
            .delete()
            .eq('requester_id', currentUser.id)
            .eq('recipient_id', recipient_id)
          
          const { error: delete3 } = await supabase
            .from('contact_requests')
            .delete()
            .eq('requester_id', recipient_id)
            .eq('recipient_id', currentUser.id)
          
          console.log('🗑️ Deletion results:', { delete1: delete1?.message, delete2: delete2?.message, delete3: delete3?.message })
          
          // Wait longer for database to process
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Verify deletion
          const { data: verifyData } = await supabase
            .from('contact_requests')
            .select('id')
            .or(`and(requester_id.eq.${currentUser.id},recipient_id.eq.${recipient_id}),and(requester_id.eq.${recipient_id},recipient_id.eq.${currentUser.id})`)
          
          if (verifyData && verifyData.length > 0) {
            console.error('❌ Requests still exist after all cleanup attempts:', verifyData)
            return NextResponse.json(
              { 
                error: 'Failed to create contact request',
                details: `Cannot delete existing requests. This may be due to database permissions. Please contact support.`,
                code: insertError.code,
                existingRequests: verifyData,
              },
              { status: 500 }
            )
          }
          
          // Final retry after cleanup
          const { data: finalRequest, error: finalError } = await supabase
            .from('contact_requests')
            .insert({
              requester_id: currentUser.id,
              recipient_id,
              message: message || null,
              status: 'pending',
            })
            .select(`
              *,
              requester:users!contact_requests_requester_id_fkey (
                id,
                email,
                username,
                full_name,
                avatar_url
              ),
              recipient:users!contact_requests_recipient_id_fkey (
                id,
                email,
                username,
                full_name,
                avatar_url
              )
            `)
            .single()
          
          if (!finalError && finalRequest) {
            console.log('✅ Successfully created request after final cleanup')
            return NextResponse.json({
              success: true,
              request: finalRequest,
            })
          } else {
            console.error('❌ Final retry also failed:', finalError)
            return NextResponse.json(
              { 
                error: 'Failed to create contact request',
                details: finalError?.message || 'Could not create request after cleanup',
                code: finalError?.code || insertError.code,
              },
              { status: 500 }
            )
          }
        }
      }
      
      return NextResponse.json(
        { 
          error: insertError.message || 'Failed to create contact request',
          details: insertError.details || null,
          code: insertError.code || null,
          hint: insertError.hint || null,
        },
        { status: 500 }
      )
    }

    if (!newRequest) {
      console.error('❌ Insert succeeded but no data returned')
      return NextResponse.json(
        { error: 'Failed to create contact request: No data returned' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      request: newRequest,
    })
  } catch (error: any) {
    console.error('❌ Create contact request exception:', error)
    console.error('Exception details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    })
    return NextResponse.json(
      { 
        error: error.message || 'Failed to create contact request',
        details: error.stack || null,
      },
      { status: 500 }
    )
  }
}

