import { NextRequest, NextResponse } from 'next/server'
import { getDeploymentRegion } from '@/config'
import { getCloudBaseDb } from '@/lib/cloudbase/client'

export const runtime = 'nodejs'

async function getAuthenticatedUser(request: NextRequest) {
  const region = getDeploymentRegion()
  if (region === 'CN') {
    const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
    return await verifyCloudBaseSession(request)
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
  }
}

interface ImportedMessagePayload {
  senderName: string
  content: string
  timestamp: string
  rawTimestamp?: string
  sourceFormat: string
}

/**
 * POST /api/messages/import — batch import chat messages
 * Body: { conversationId, messages, source, mySenderName }
 *
 * mySenderName: the parsed sender name that belongs to the importing user.
 * Messages whose senderName === mySenderName get sender_id = currentUser.id.
 * For direct chats, other senders get the conversation partner's user_id.
 * For group chats, other senders all get currentUser.id (but with metadata).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { conversationId, messages, source, mySenderName } = body

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 })
    }
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages array is required and must not be empty' }, { status: 400 })
    }
    if (messages.length > 500) {
      return NextResponse.json({ error: 'Maximum 500 messages per import' }, { status: 400 })
    }

    const region = getDeploymentRegion()

    if (region === 'CN') {
      return await importToCloudBase(user, conversationId, messages, source, mySenderName)
    } else {
      return await importToSupabase(user, conversationId, messages, source, mySenderName)
    }
  } catch (error: any) {
    console.error('[API /api/messages/import] Error:', error)
    return NextResponse.json({ error: error.message || 'Import failed' }, { status: 500 })
  }
}

// ──────── CloudBase Import ────────
async function importToCloudBase(
  user: any,
  conversationId: string,
  messages: ImportedMessagePayload[],
  source: string,
  mySenderName?: string
) {
  const db = getCloudBaseDb()
  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  const now = new Date().toISOString()

  // Look up conversation members to find the "other" person in direct chats
  let otherMemberId: string | null = null
  try {
    const membersRes = await db.collection('conversation_members')
      .where({ conversation_id: conversationId, region: 'cn' })
      .get()
    const members = membersRes.data || []
    const otherMember = members.find((m: any) => m.user_id !== user.id)
    if (otherMember) {
      otherMemberId = otherMember.user_id
    }
  } catch (e) {
    console.warn('[Import] Could not look up conversation members:', e)
  }

  // Build message documents
  const docs = messages.map((msg, index) => {
    // Determine sender_id:
    // If mySenderName is set and matches → current user
    // Otherwise → other member (or fall back to current user)
    let senderId = user.id
    if (mySenderName) {
      if (msg.senderName !== mySenderName && otherMemberId) {
        senderId = otherMemberId
      } else if (msg.senderName === mySenderName) {
        senderId = user.id
      }
    }

    return {
      conversation_id: conversationId,
      sender_id: senderId,
      content: msg.content,
      type: 'text',
      is_deleted: false,
      is_edited: false,
      is_pinned: false,
      is_recalled: false,
      reactions: [],
      read_by: [],
      created_at: msg.timestamp || now,
      updated_at: now,
      region: 'cn',
      metadata: {
        imported: true,
        import_source: source || msg.sourceFormat || 'unknown',
        import_sender_name: msg.senderName,
        import_raw_timestamp: msg.rawTimestamp || '',
        import_order: index,
        imported_at: now,
        imported_by: user.id,
      },
    }
  })

  // Batch insert
  let insertedCount = 0
  const BATCH_SIZE = 20

  try {
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE)
      for (const doc of batch) {
        try {
          await db.collection('messages').add(doc)
          insertedCount++
        } catch (err: any) {
          if (err?.code === 'DATABASE_COLLECTION_NOT_EXIST' ||
              String(err?.message || '').includes('not exist')) {
            try { await db.createCollection('messages') } catch { }
            await db.collection('messages').add(doc)
            insertedCount++
          } else {
            console.error('[Import] Failed to insert message:', err)
          }
        }
      }
    }

    // Update conversation's last_message_at
    try {
      await db.collection('conversations').doc(conversationId).update({
        last_message_at: now,
        updated_at: now,
      })
    } catch { }

    return NextResponse.json({
      success: true,
      imported: insertedCount,
      total: messages.length,
    })
  } catch (error: any) {
    console.error('[Import CloudBase] Error:', error)
    return NextResponse.json({ error: error.message || 'Import failed' }, { status: 500 })
  }
}

// ──────── Supabase Import ────────
async function importToSupabase(
  user: any,
  conversationId: string,
  messages: ImportedMessagePayload[],
  source: string,
  mySenderName?: string
) {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()

  const now = new Date().toISOString()

  // Look up conversation members for sender mapping
  let otherMemberId: string | null = null
  try {
    const { data: members } = await supabase
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .is('deleted_at', null)
    const otherMember = members?.find((m: any) => m.user_id !== user.id)
    if (otherMember) {
      otherMemberId = otherMember.user_id
    }
  } catch (e) {
    console.warn('[Import] Could not look up conversation members:', e)
  }

  const rows = messages.map((msg, index) => {
    let senderId = user.id
    if (mySenderName) {
      if (msg.senderName !== mySenderName && otherMemberId) {
        senderId = otherMemberId
      } else if (msg.senderName === mySenderName) {
        senderId = user.id
      }
    }

    return {
      conversation_id: conversationId,
      sender_id: senderId,
      content: msg.content,
      type: 'text',
      is_deleted: false,
      is_edited: false,
      is_pinned: false,
      is_recalled: false,
      reactions: [],
      read_by: [],
      created_at: msg.timestamp || now,
      updated_at: now,
      metadata: {
        imported: true,
        import_source: source || msg.sourceFormat || 'unknown',
        import_sender_name: msg.senderName,
        import_raw_timestamp: msg.rawTimestamp || '',
        import_order: index,
        imported_at: now,
        imported_by: user.id,
      },
    }
  })

  const { data, error } = await supabase
    .from('messages')
    .insert(rows)
    .select('id')

  if (error) {
    console.error('[Import Supabase] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update conversation
  await supabase
    .from('conversations')
    .update({ last_message_at: now, updated_at: now })
    .eq('id', conversationId)

  return NextResponse.json({
    success: true,
    imported: data?.length || rows.length,
    total: messages.length,
  })
}
