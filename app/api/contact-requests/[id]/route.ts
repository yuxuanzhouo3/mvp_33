import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import {
  createConversation as createConversationCN,
  findDirectConversation as findDirectConversationCN,
} from '@/lib/database/cloudbase/conversations'

const WELCOME_MESSAGE_CN = '我们已经是好友了，开始聊天吧'
const WELCOME_MESSAGE_INTL = 'We are now friends, start chatting!'

function normalizeId(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    const raw = value as Record<string, unknown>
    if (typeof raw.id === 'string') return raw.id.trim()
    if (typeof raw._id === 'string') return raw._id.trim()
  }
  return ''
}

function parseMetadata(value: unknown): Record<string, any> | null {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  if (typeof value === 'object') {
    return value as Record<string, any>
  }
  return null
}

function extractCloudBaseDoc(raw: any): any | null {
  if (!raw) return null
  const payload = raw?.data !== undefined ? raw.data : raw
  if (Array.isArray(payload)) {
    return payload[0] || null
  }
  if (payload && typeof payload === 'object') {
    return payload
  }
  return null
}

async function ensureCloudBaseContactLink(
  db: any,
  userId: string,
  contactUserId: string,
  now: string,
): Promise<void> {
  const existing = await db
    .collection('contacts')
    .where({
      user_id: userId,
      contact_user_id: contactUserId,
      region: 'cn',
    })
    .limit(1)
    .get()

  if (Array.isArray(existing?.data) && existing.data.length > 0) {
    return
  }

  await db.collection('contacts').add({
    user_id: userId,
    contact_user_id: contactUserId,
    is_favorite: false,
    is_blocked: false,
    added_at: now,
    region: 'cn',
  })
}

async function ensureCloudBaseDirectConversation(
  requesterId: string,
  recipientId: string,
): Promise<{ id: string } | null> {
  const existing = await findDirectConversationCN(requesterId, recipientId)
  if (existing?.id) {
    return { id: existing.id }
  }

  const memberIds = Array.from(new Set([requesterId, recipientId]))
  const created = await createConversationCN({
    type: 'direct',
    memberIds,
    isPrivate: true,
    createdBy: requesterId,
  })
  if (!created?.id) return null
  return { id: created.id }
}

async function ensureCloudBaseWelcomeMessage(
  db: any,
  conversationId: string,
  requestId: string,
): Promise<void> {
  const existingRes = await db
    .collection('messages')
    .where({
      conversation_id: conversationId,
      type: 'system',
      region: 'cn',
    })
    .get()

  const existingDocs = Array.isArray(existingRes?.data) ? existingRes.data : []
  const alreadyExists = existingDocs.some((doc: any) => {
    const metadata = parseMetadata(doc?.metadata)
    return (
      metadata?.is_welcome_message === true &&
      String(metadata?.contact_request_id || metadata?.request_id || '') === requestId
    )
  })
  if (alreadyExists) {
    return
  }

  const now = new Date().toISOString()
  await db.collection('messages').add({
    conversation_id: conversationId,
    sender_id: '',
    content: WELCOME_MESSAGE_CN,
    type: 'system',
    metadata: {
      is_welcome_message: true,
      contact_request_id: requestId,
      request_id: requestId,
    },
    reactions: [],
    is_edited: false,
    is_deleted: false,
    is_recalled: false,
    created_at: now,
    updated_at: now,
    region: 'cn',
  })

  try {
    await db.collection('conversations').doc(conversationId).update({
      last_message_at: now,
    })
  } catch (error) {
    console.warn('[CloudBase] Failed to update conversation last_message_at:', error)
  }
}

async function resolveWorkspaceIdForSupabaseDirect(
  supabase: any,
  requesterId: string,
  recipientId: string,
): Promise<string | null> {
  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .in('user_id', [requesterId, recipientId])
    .limit(1)

  const workspaceId = memberships?.[0]?.workspace_id
  if (workspaceId) return workspaceId

  return null
}

async function ensureSupabaseDirectConversation(
  supabase: any,
  requesterId: string,
  recipientId: string,
): Promise<{ id: string } | null> {
  const { data: existingConversations, error: findError } = await supabase.rpc(
    'find_direct_conversation',
    {
      p_user1_id: requesterId,
      p_user2_id: recipientId,
    },
  )

  if (findError) {
    console.error('[Supabase] find_direct_conversation error:', findError)
  }

  if (!findError && Array.isArray(existingConversations) && existingConversations.length > 0) {
    const candidate = existingConversations[0]
    if (candidate?.id) {
      await supabase
        .from('conversation_members')
        .update({ deleted_at: null, is_hidden: false, hidden_at: null })
        .eq('conversation_id', candidate.id)
        .in('user_id', [requesterId, recipientId])

      return { id: candidate.id }
    }
  }

  const workspaceId = await resolveWorkspaceIdForSupabaseDirect(supabase, requesterId, recipientId)
  const now = new Date().toISOString()

  const { data: newConversation, error: conversationError } = await supabase
    .from('conversations')
    .insert({
      workspace_id: workspaceId,
      type: 'direct',
      name: null,
      description: null,
      created_by: requesterId,
      is_private: true,
      deleted_at: null,
      created_at: now,
      updated_at: now,
      last_message_at: now,
    })
    .select('id')
    .single()

  if (conversationError || !newConversation?.id) {
    throw new Error(conversationError?.message || 'Failed to create direct conversation')
  }

  const memberPayload = [
    { user_id: requesterId, role: 'owner' },
    { user_id: recipientId, role: 'member' },
  ]

  const { error: insertMembersError } = await supabase.rpc('insert_conversation_members', {
    p_conversation_id: newConversation.id,
    p_members: memberPayload,
  })

  if (insertMembersError) {
    const { error: fallbackError } = await supabase
      .from('conversation_members')
      .upsert(
        [
          {
            conversation_id: newConversation.id,
            user_id: requesterId,
            role: 'owner',
            joined_at: now,
            deleted_at: null,
          },
          {
            conversation_id: newConversation.id,
            user_id: recipientId,
            role: 'member',
            joined_at: now,
            deleted_at: null,
          },
        ],
        { onConflict: 'conversation_id,user_id' },
      )

    if (fallbackError) {
      throw new Error(fallbackError.message || insertMembersError.message || 'Failed to add members')
    }
  }

  return { id: newConversation.id }
}

async function ensureSupabaseWelcomeMessage(
  supabase: any,
  conversationId: string,
  requestId: string,
): Promise<void> {
  const { data: existingMessages, error: existingError } = await supabase
    .from('messages')
    .select('id, metadata')
    .eq('conversation_id', conversationId)
    .eq('type', 'system')
    .limit(200)

  if (existingError) {
    console.error('[Supabase] Failed to query welcome message idempotency:', existingError)
  }

  const alreadyExists = (existingMessages || []).some((msg: any) => {
    const metadata = parseMetadata(msg?.metadata)
    return (
      metadata?.is_welcome_message === true &&
      String(metadata?.contact_request_id || metadata?.request_id || '') === requestId
    )
  })

  if (alreadyExists) {
    return
  }

  const now = new Date().toISOString()
  const { error: insertMessageError } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: null,
    content: WELCOME_MESSAGE_INTL,
    type: 'system',
    metadata: {
      is_welcome_message: true,
      contact_request_id: requestId,
      request_id: requestId,
    },
    created_at: now,
    updated_at: now,
  })

  if (insertMessageError) {
    throw new Error(insertMessageError.message || 'Failed to create welcome message')
  }

  await supabase
    .from('conversations')
    .update({ last_message_at: now, updated_at: now })
    .eq('id', conversationId)
}

/**
 * Accept or reject a contact request
 * PATCH /api/contact-requests/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const requestId = resolvedParams.id

    if (!requestId) {
      return NextResponse.json({ error: 'Request ID is required' }, { status: 400 })
    }

    const body = await request.json()
    const action = body?.action
    const requesterIdFromBody = body?.requester_id

    if (!action || !['accept', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be "accept" or "reject"' }, { status: 400 })
    }

    const { IS_DOMESTIC_VERSION } = await import('@/config')
    let currentUser: any = null

    if (IS_DOMESTIC_VERSION) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (!cloudBaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUser = cloudBaseUser
    } else {
      const supabase = await createClient()
      const {
        data: { user: supabaseUser },
      } = await supabase.auth.getUser()
      if (!supabaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUser = supabaseUser
    }

    const dbClient = await getDatabaseClientForUser(request)
    const currentRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    if (dbClient.type === 'cloudbase' && currentRegion === 'cn' && dbClient.cloudbase) {
      const db = dbClient.cloudbase
      const rawRequestRes = await db.collection('contact_requests').doc(requestId).get()
      const requestData = extractCloudBaseDoc(rawRequestRes)

      if (!requestData) {
        return NextResponse.json(
          {
            error: 'Request not found',
            errorType: 'not_found',
          },
          { status: 404 },
        )
      }

      const currentUserId = normalizeId(currentUser.id)
      const recipientIdFromRequest = normalizeId(requestData.recipient_id ?? requestData.recipientId)
      const requesterIdFromDoc = normalizeId(requestData.requester_id ?? requestData.requesterId)
      const requesterId = normalizeId(requesterIdFromBody) || requesterIdFromDoc

      if (!requesterId) {
        return NextResponse.json(
          {
            error: 'Malformed contact request: missing requester_id',
            errorType: 'invalid_request',
          },
          { status: 400 },
        )
      }

      if (recipientIdFromRequest) {
        if (recipientIdFromRequest !== currentUserId) {
          return NextResponse.json(
            {
              error: 'You do not have permission to process this request',
              errorType: 'unauthorized',
            },
            { status: 403 },
          )
        }
      } else if (requesterId === currentUserId) {
        return NextResponse.json(
          {
            error: 'You cannot process your own contact request as recipient',
            errorType: 'unauthorized',
          },
          { status: 403 },
        )
      }

      if (requestData.status && requestData.status !== 'pending') {
        return NextResponse.json(
          {
            error: 'Request already processed',
            status: requestData.status,
            errorType: 'already_processed',
          },
          { status: 400 },
        )
      }

      const now = new Date().toISOString()

      if (action === 'reject') {
        await db.collection('contact_requests').doc(requestId).update({
          status: 'rejected',
          updated_at: now,
        })

        return NextResponse.json({
          success: true,
          message: 'Contact request rejected',
        })
      }

      const recipientId = recipientIdFromRequest || currentUserId
      await ensureCloudBaseContactLink(db, requesterId, recipientId, now)
      await ensureCloudBaseContactLink(db, recipientId, requesterId, now)

      let conversation: { id: string } | null = null
      try {
        conversation = await ensureCloudBaseDirectConversation(requesterId, recipientId)
        if (conversation?.id) {
          await ensureCloudBaseWelcomeMessage(db, conversation.id, requestId)
        }
      } catch (conversationError) {
        console.error('[CloudBase] Failed to ensure direct conversation/welcome message:', conversationError)
      }

      await db.collection('contact_requests').doc(requestId).update({
        status: 'accepted',
        updated_at: now,
      })

      return NextResponse.json({
        success: true,
        message: 'Contact request accepted',
        conversation: conversation ? { id: conversation.id } : null,
        accepted_contact_user_id: requesterId,
      })
    }

    const supabase = await createClient()
    const { data: recipientProfile, error: recipientProfileError } = await supabase
      .from('users')
      .select('region')
      .eq('id', currentUser.id)
      .maybeSingle()

    if (recipientProfileError) {
      console.error('Failed to load recipient region in contact-requests PATCH:', recipientProfileError)
    }

    const currentRegionSupabase = recipientProfile?.region === 'cn' ? 'cn' : 'global'

    const { data: requestData, error: fetchError } = await supabase
      .from('contact_requests')
      .select('*')
      .eq('id', requestId)
      .eq('recipient_id', currentUser.id)
      .eq('status', 'pending')
      .single()

    if (fetchError || !requestData) {
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
              errorType: 'already_processed',
            },
            { status: 400 },
          )
        }

        if (normalizeId(existingRequest.recipient_id) !== normalizeId(currentUser.id)) {
          return NextResponse.json(
            {
              error: 'You do not have permission to process this request',
              errorType: 'unauthorized',
            },
            { status: 403 },
          )
        }
      }

      return NextResponse.json(
        {
          error: 'Request not found',
          errorType: 'not_found',
          details: fetchError?.message || 'Request does not exist or you do not have access',
        },
        { status: 404 },
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
        { status: 400 },
      )
    }

    if (action === 'reject') {
      const { error: rejectError } = await supabase
        .from('contact_requests')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', requestId)

      if (rejectError) {
        return NextResponse.json({ error: 'Failed to reject request' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: 'Contact request rejected',
      })
    }

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

    const { error: insertContactsError } = await supabase
      .from('contacts')
      .upsert(contacts, { onConflict: 'user_id,contact_user_id' })

    if (insertContactsError && insertContactsError.code !== '23505') {
      return NextResponse.json(
        {
          error: 'Failed to create contacts',
          details: insertContactsError.message,
        },
        { status: 500 },
      )
    }

    let conversation: { id: string } | null = null
    try {
      conversation = await ensureSupabaseDirectConversation(
        supabase,
        requestData.requester_id,
        requestData.recipient_id,
      )
      if (conversation?.id) {
        await ensureSupabaseWelcomeMessage(supabase, conversation.id, requestId)
      }
    } catch (conversationError) {
      console.error('[Supabase] Failed to ensure direct conversation/welcome message:', conversationError)
    }

    const { error: updateRequestError } = await supabase
      .from('contact_requests')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', requestId)

    if (updateRequestError) {
      return NextResponse.json(
        {
          error: 'Contacts created but failed to update request status',
          details: updateRequestError.message,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Contact request accepted',
      conversation: conversation ? { id: conversation.id } : null,
      accepted_contact_user_id: requestData.requester_id,
    })
  } catch (error: any) {
    console.error('Process contact request error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to process contact request' },
      { status: 500 },
    )
  }
}
