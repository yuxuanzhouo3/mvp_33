import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IS_DOMESTIC_VERSION } from '@/config'

/**
 * GET /api/groups/join?code=xxx
 * Public endpoint – returns group preview info for the invite landing page.
 * No authentication required.
 */
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code')
    if (!code) {
      return NextResponse.json({ error: 'Missing invite code' }, { status: 400 })
    }

    if (IS_DOMESTIC_VERSION) {
      // ---- CloudBase (CN) ----
      const { getCloudBaseDb } = await import('@/lib/cloudbase/client')
      const db = getCloudBaseDb()
      if (!db) return NextResponse.json({ error: 'Database not available' }, { status: 500 })

      const convRes = await db.collection('conversations')
        .where({ invite_code: code, type: 'group' })
        .get()
      const conv = convRes.data?.[0]

      if (!conv) {
        return NextResponse.json({ error: 'Group not found', is_expired: false }, { status: 404 })
      }

      const now = new Date()
      if (!conv.invite_expires_at || new Date(conv.invite_expires_at) <= now) {
        return NextResponse.json({ error: 'Invite link has expired', is_expired: true }, { status: 410 })
      }

      // Member count
      const membersRes = await db.collection('conversation_members')
        .where({ conversation_id: conv._id || conv.id })
        .count()
      const memberCount = membersRes.total ?? 0

      return NextResponse.json({
        success: true,
        group: {
          id: conv._id || conv.id,
          name: conv.name || '群聊',
          avatar_url: conv.avatar_url || null,
          member_count: memberCount,
          description: conv.description || null,
        },
        expires_at: conv.invite_expires_at,
      })
    }

    // ---- Supabase (INTL) ----
    const supabase = await createClient()

    const { data: conv, error } = await supabase
      .from('conversations')
      .select('id, name, avatar_url, description, invite_expires_at')
      .eq('invite_code', code)
      .eq('type', 'group')
      .maybeSingle()

    if (error || !conv) {
      return NextResponse.json({ error: 'Group not found', is_expired: false }, { status: 404 })
    }

    const now = new Date()
    if (!conv.invite_expires_at || new Date(conv.invite_expires_at) <= now) {
      return NextResponse.json({ error: 'Invite link has expired', is_expired: true }, { status: 410 })
    }

    // Member count
    const { count: memberCount } = await supabase
      .from('conversation_members')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)

    return NextResponse.json({
      success: true,
      group: {
        id: conv.id,
        name: conv.name || 'Group Chat',
        avatar_url: conv.avatar_url || null,
        member_count: memberCount ?? 0,
        description: conv.description || null,
      },
      expires_at: conv.invite_expires_at,
    })
  } catch (error) {
    console.error('GET /api/groups/join error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/groups/join
 * Join a group via invite code. Requires authentication.
 * Body: { code: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { code } = body
    if (!code) {
      return NextResponse.json({ error: 'Missing invite code' }, { status: 400 })
    }

    if (IS_DOMESTIC_VERSION) {
      // ---- CloudBase (CN) ----
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const user = await verifyCloudBaseSession(request)
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const { getCloudBaseDb } = await import('@/lib/cloudbase/client')
      const db = getCloudBaseDb()
      if (!db) return NextResponse.json({ error: 'Database not available' }, { status: 500 })

      // Find group by invite code
      const convRes = await db.collection('conversations')
        .where({ invite_code: code, type: 'group' })
        .get()
      const conv = convRes.data?.[0]
      if (!conv) {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 })
      }

      const conversationId = conv._id || conv.id
      const now = new Date()
      if (!conv.invite_expires_at || new Date(conv.invite_expires_at) <= now) {
        return NextResponse.json({ error: 'Invite link has expired', is_expired: true }, { status: 410 })
      }

      // Check if already a member (idempotent)
      const existingRes = await db.collection('conversation_members')
        .where({ conversation_id: conversationId, user_id: user.id })
        .get()
      if (existingRes.data && existingRes.data.length > 0) {
        return NextResponse.json({ success: true, conversation_id: conversationId, already_member: true })
      }

      // Add member
      await db.collection('conversation_members').add({
        conversation_id: conversationId,
        user_id: user.id,
        role: 'member',
        join_status: 'accepted',
        joined_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })

      return NextResponse.json({ success: true, conversation_id: conversationId })
    }

    // ---- Supabase (INTL) ----
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Find group by invite code
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('id, invite_expires_at')
      .eq('invite_code', code)
      .eq('type', 'group')
      .maybeSingle()

    if (convError || !conv) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    const now = new Date()
    if (!conv.invite_expires_at || new Date(conv.invite_expires_at) <= now) {
      return NextResponse.json({ error: 'Invite link has expired', is_expired: true }, { status: 410 })
    }

    // Check if already a member (idempotent)
    const { data: existing } = await supabase
      .from('conversation_members')
      .select('id')
      .eq('conversation_id', conv.id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ success: true, conversation_id: conv.id, already_member: true })
    }

    // Add member
    const { error: insertError } = await supabase
      .from('conversation_members')
      .insert({
        conversation_id: conv.id,
        user_id: user.id,
        role: 'member',
        join_status: 'accepted',
        joined_at: new Date().toISOString(),
      })

    if (insertError) {
      console.error('Failed to add group member:', insertError)
      return NextResponse.json({ error: 'Failed to join group' }, { status: 500 })
    }

    return NextResponse.json({ success: true, conversation_id: conv.id })
  } catch (error) {
    console.error('POST /api/groups/join error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
