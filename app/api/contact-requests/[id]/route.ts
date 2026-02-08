import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'

/**
 * Accept or reject a contact request
 * PATCH /api/contact-requests/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Handle Next.js 15+ async params
    const resolvedParams = await Promise.resolve(params)
    const requestId = resolvedParams.id

    if (!requestId) {
      return NextResponse.json(
        { error: 'Request ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { action, requester_id: requesterIdFromBody } = body // 'accept' or 'reject'

    if (!action || !['accept', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "accept" or "reject"' },
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

    // Decide which database this user actually uses
    const dbClient = await getDatabaseClientForUser(request)
    const currentRegion = dbClient.region === 'cn' ? 'cn' : 'global'
    console.log('[ContactRequests PATCH] Current user:', currentUser.id, 'Region:', currentRegion, 'DB type:', dbClient.type)

    // CN users → CloudBase contact_requests & contacts
    if (dbClient.type === 'cloudbase' && currentRegion === 'cn' && dbClient.cloudbase) {
      const db = dbClient.cloudbase
      console.log('[ContactRequests PATCH] Using CloudBase branch for request:', requestId)

      // Fetch request from CloudBase
      const res = await db
        .collection('contact_requests')
        .doc(requestId)
        .get()

      const requestData = (res?.data as any) || res

      console.log('[ContactRequests PATCH] CloudBase raw doc:', JSON.stringify(res, null, 2))
      console.log('[ContactRequests PATCH] Parsed requestData:', JSON.stringify(requestData, null, 2))

      if (!requestData) {
        return NextResponse.json(
          {
            error: 'Request not found',
            errorType: 'not_found',
            details: 'Request does not exist or you do not have access',
          },
          { status: 404 }
        )
      }

      // Normalize IDs（兼容旧数据 & CloudBase / Supabase 不同类型）
      const currentUserId = String(currentUser.id ?? '').trim()
      const recipientIdFromRequest = String(
        requestData.recipient_id ?? requestData.recipientId ?? ''
      ).trim()
      const requesterIdFromDoc = String(
        requestData.requester_id ?? requestData.requesterId ?? ''
      ).trim()
      const requesterId =
        String(requesterIdFromBody ?? '').trim() || requesterIdFromDoc

      console.log('[ContactRequests PATCH] Permission check (CloudBase) normalized:', {
        requestId,
        recipientIdFromRequest,
        requesterIdFromDoc,
        requesterIdFromBody,
        resolvedRequesterId: requesterId,
        currentUserId,
      })

      // 如果连 requesterId 都拿不到，无法安全处理
      if (!requesterId) {
        return NextResponse.json(
          {
            error: 'Malformed contact request: missing requester_id',
            errorType: 'invalid_request',
          },
          { status: 400 }
        )
      }

      // 如果数据里有 recipient_id，就按正常逻辑校验；否则视为旧数据：
      // - 只要当前用户不是 requester，本人就当作 recipient 处理
      if (recipientIdFromRequest) {
        if (recipientIdFromRequest !== currentUserId) {
          return NextResponse.json(
            {
              error: 'You do not have permission to process this request',
              errorType: 'unauthorized',
              details: `recipient_id in request: ${recipientIdFromRequest}, current user: ${currentUserId}`,
            },
            { status: 403 }
          )
        }
      } else {
        // 旧数据没有 recipient_id：如果当前用户 == requester，就不允许自己接受自己的请求
        if (requesterId === currentUserId) {
          return NextResponse.json(
            {
              error: 'You cannot process your own contact request as recipient',
              errorType: 'unauthorized',
            },
            { status: 403 }
          )
        }
        console.log(
          '[ContactRequests PATCH] Treating current user as recipient for legacy CloudBase request:',
          { requestId, requesterId, currentUserId }
        )
      }

      if (requestData.status && requestData.status !== 'pending') {
        return NextResponse.json(
          {
            error: 'Request already processed',
            status: requestData.status,
            errorType: 'already_processed',
          },
          { status: 400 }
        )
      }

      const now = new Date().toISOString()

      if (action === 'accept') {
        // Create bidirectional contacts FIRST
        const normalizedRecipientId = recipientIdFromRequest || currentUserId
        const contacts = [
          {
            user_id: requesterId,
            contact_user_id: normalizedRecipientId,
            is_favorite: false,
            is_blocked: false,
            added_at: now,
            region: 'cn',
          },
          {
            user_id: normalizedRecipientId,
            contact_user_id: requesterId,
            is_favorite: false,
            is_blocked: false,
            added_at: now,
            region: 'cn',
          },
        ]

        try {
          await db.collection('contacts').add(contacts)
        } catch (insertError) {
          console.error('CloudBase create contacts error:', insertError)
          return NextResponse.json(
            {
              error: 'Failed to create contacts',
              details: (insertError as any)?.message || 'CloudBase insert error',
            },
            { status: 500 }
          )
        }

        // Update request status
        try {
          await db
            .collection('contact_requests')
            .doc(requestId)
            .update({
              status: 'accepted',
              updated_at: now,
            })
        } catch (updateError) {
          console.error('CloudBase update request error:', updateError)
          return NextResponse.json(
            {
              error: 'Contacts created but failed to update request status',
              details: (updateError as any)?.message || 'CloudBase update error',
            },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          message: 'Contact request accepted',
        })
      } else {
        // Reject
        try {
          await db
            .collection('contact_requests')
            .doc(requestId)
            .update({
              status: 'rejected',
              updated_at: now,
            })
        } catch (updateError) {
          console.error('CloudBase update request error (reject):', updateError)
          return NextResponse.json(
            { error: 'Failed to reject request' },
            { status: 500 }
          )
        }

        return NextResponse.json({
          success: true,
          message: 'Contact request rejected',
        })
      }
    }

    // Global / Supabase users → keep existing Supabase logic
      const { data: recipientProfile, error: recipientProfileError } = await supabase
      .from('users')
      .select('region')
      .eq('id', currentUser.id)
      .maybeSingle()

    if (recipientProfileError) {
      console.error('Failed to load recipient region in contact-requests PATCH:', recipientProfileError)
    }

    const currentRegionSupabase = recipientProfile?.region === 'cn' ? 'cn' : 'global'

    // Get the request
      const { data: requestData, error: fetchError } = await supabase
      .from('contact_requests')
      .select('*')
      .eq('id', requestId)
      .eq('recipient_id', currentUser.id) // Only recipient can accept/reject
      .eq('status', 'pending')
      .single()

    if (fetchError || !requestData) {
      console.error('Failed to fetch contact request:', {
        requestId: requestId,
        userId: currentUser.id,
        error: fetchError,
        hasData: !!requestData
      })
      
      // Check if request exists but with different status
      const { data: existingRequest } = await supabase
        .from('contact_requests')
        .select('id, status, recipient_id')
        .eq('id', requestId)
        .single()
      
      if (existingRequest) {
        if (existingRequest.status !== 'pending') {
          return NextResponse.json(
            { 
              error: 'Request already processed', 
              status: existingRequest.status,
              errorType: 'already_processed'
            },
            { status: 400 }
          )
        }
        const existingRecipientId = String(existingRequest.recipient_id ?? '').trim()
        const currentUserId = String(currentUser.id ?? '').trim()
        console.log('[ContactRequests PATCH] Permission check (Supabase fallback):', {
          requestId,
          existingRecipientId,
          currentUserId,
        })
        if (!existingRecipientId || existingRecipientId !== currentUserId) {
          return NextResponse.json(
            { 
              error: 'You do not have permission to process this request',
              errorType: 'unauthorized',
              details: `recipient_id in request: ${existingRecipientId}, current user: ${currentUserId}`,
            },
            { status: 403 }
          )
        }
      }
      
      return NextResponse.json(
        { 
          error: 'Request not found', 
          errorType: 'not_found',
          details: fetchError?.message || 'Request does not exist or you do not have access'
        },
        { status: 404 }
      )
    }

    const { data: requesterProfile, error: requesterProfileError } = await supabase
      .from('users')
      .select('region')
      .eq('id', requestData.requester_id)
      .maybeSingle()

    if (requesterProfileError) {
      console.error('Failed to load requester region in contact-requests PATCH:', requesterProfileError)
    }

    if (!requesterProfile || (requesterProfile.region || 'global') !== currentRegionSupabase) {
      return NextResponse.json(
        {
          error: 'This contact request belongs to another region',
          errorType: 'cross_region',
        },
        { status: 400 }
      )
    }

    if (action === 'accept') {
      // Create bidirectional contacts FIRST (before updating request status)
      // This ensures data consistency: if contact creation fails, request stays pending
      const contacts = [
        {
          user_id: requestData.requester_id,
          contact_user_id: requestData.recipient_id,
          is_favorite: false,
          is_blocked: false,
        },
        {
          user_id: requestData.recipient_id,
          contact_user_id: requestData.requester_id,
          is_favorite: false,
          is_blocked: false,
        },
      ]

      const { error: insertError } = await supabase
        .from('contacts')
        .upsert(contacts, { onConflict: 'user_id,contact_user_id' })

      if (insertError) {
        console.error('Create contacts error:', insertError)
        // Check if error is due to existing contacts (not a real error)
        if (insertError.code === '23505') { // Unique constraint violation
          // Contacts already exist, that's okay - continue to update request status
          console.log('Contacts already exist, continuing...')
        } else {
          // Real error creating contacts - don't update request status
          return NextResponse.json(
            { 
              error: 'Failed to create contacts', 
              details: insertError.message 
            },
            { status: 500 }
          )
        }
      }

      // Only update request status AFTER contacts are successfully created
      const { error: updateError } = await supabase
        .from('contact_requests')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', requestId)

      if (updateError) {
        console.error('Update request error:', updateError)
        // Contacts were created but request status update failed
        // This is less critical, but we should still report it
        return NextResponse.json(
          { 
            error: 'Contacts created but failed to update request status', 
            details: updateError.message 
          },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Contact request accepted',
      })
    } else {
      // Reject request
      const { error: updateError } = await supabase
        .from('contact_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', requestId)

      if (updateError) {
        console.error('Update request error:', updateError)
        return NextResponse.json(
          { error: 'Failed to reject request' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        message: 'Contact request rejected',
      })
    }
  } catch (error: any) {
    console.error('Process contact request error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process contact request' },
      { status: 500 }
    )
  }
}

