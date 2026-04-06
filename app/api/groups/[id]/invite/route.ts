import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { IS_DOMESTIC_VERSION } from '@/config'

/** Generate a random 12-char alphanumeric invite code */
function generateInviteCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  const array = new Uint8Array(12)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array)
    for (const byte of array) {
      code += chars[byte % chars.length]
    }
  } else {
    for (let i = 0; i < 12; i++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
  }
  return code
}

function getInviteUrl(request: NextRequest, code: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (siteUrl) {
    return `${siteUrl}/join/group/${code}`
  }
  const { protocol, host } = request.nextUrl
  return `${protocol}//${host}/join/group/${code}`
}

/**
 * GET /api/groups/[id]/invite
 * Get (or generate) an invite link for this group.
 * Any group member can call this.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id: conversationId } = await Promise.resolve(params)

    if (IS_DOMESTIC_VERSION) {
      // ---- CloudBase (CN) ----
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const user = await verifyCloudBaseSession(request)
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const { getCloudBaseDb } = await import('@/lib/cloudbase/client')
      const db = getCloudBaseDb()
      if (!db) return NextResponse.json({ error: 'Database not available' }, { status: 500 })

      // Check membership
      const memberRes = await db.collection('conversation_members')
        .where({ conversation_id: conversationId, user_id: user.id })
        .get()
      if (!memberRes.data || memberRes.data.length === 0) {
        return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 })
      }

      // Get conversation
      const convRes = await db.collection('conversations')
        .doc(conversationId)
        .get()
      const conv = convRes.data?.[0]
      if (!conv || conv.type !== 'group') {
        return NextResponse.json({ error: 'Group not found' }, { status: 404 })
      }

      // Check if existing code is still valid
      const now = new Date()
      if (conv.invite_code && conv.invite_expires_at && new Date(conv.invite_expires_at) > now) {
        return NextResponse.json({
          success: true,
          invite_code: conv.invite_code,
          invite_url: getInviteUrl(request, conv.invite_code),
          expires_at: conv.invite_expires_at,
        })
      }

      // Generate new code
      const newCode = generateInviteCode()
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await db.collection('conversations').doc(conversationId).update({
        invite_code: newCode,
        invite_expires_at: expiresAt,
      })

      return NextResponse.json({
        success: true,
        invite_code: newCode,
        invite_url: getInviteUrl(request, newCode),
        expires_at: expiresAt,
      })
    }

    // ---- Supabase (INTL) ----
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check membership
    const { data: member } = await supabase
      .from('conversation_members')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 })
    }

    // Get conversation
    const { data: conv, error: convError } = await supabase
      .from('conversations')
      .select('id, type, name, invite_code, invite_expires_at')
      .eq('id', conversationId)
      .single()
    if (convError || !conv || conv.type !== 'group') {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    // Return existing valid code
    const now = new Date()
    if (conv.invite_code && conv.invite_expires_at && new Date(conv.invite_expires_at) > now) {
      return NextResponse.json({
        success: true,
        invite_code: conv.invite_code,
        invite_url: getInviteUrl(request, conv.invite_code),
        expires_at: conv.invite_expires_at,
      })
    }

    // Generate new code
    const newCode = generateInviteCode()
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ invite_code: newCode, invite_expires_at: expiresAt })
      .eq('id', conversationId)
    if (updateError) {
      console.error('Failed to save invite code:', updateError)
      return NextResponse.json({ error: 'Failed to generate invite link' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      invite_code: newCode,
      invite_url: getInviteUrl(request, newCode),
      expires_at: expiresAt,
    })
  } catch (error) {
    console.error('GET /api/groups/[id]/invite error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/groups/[id]/invite
 * Reset the invite code (admin only). Old code immediately invalidated.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id: conversationId } = await Promise.resolve(params)

    if (IS_DOMESTIC_VERSION) {
      // ---- CloudBase (CN) ----
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const user = await verifyCloudBaseSession(request)
      if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const { getCloudBaseDb } = await import('@/lib/cloudbase/client')
      const db = getCloudBaseDb()
      if (!db) return NextResponse.json({ error: 'Database not available' }, { status: 500 })

      // Check admin role
      const memberRes = await db.collection('conversation_members')
        .where({ conversation_id: conversationId, user_id: user.id })
        .get()
      const member = memberRes.data?.[0]
      if (!member || !['owner', 'admin'].includes(member.role)) {
        return NextResponse.json({ error: 'Admin permission required' }, { status: 403 })
      }

      const newCode = generateInviteCode()
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await db.collection('conversations').doc(conversationId).update({
        invite_code: newCode,
        invite_expires_at: expiresAt,
      })

      return NextResponse.json({
        success: true,
        invite_code: newCode,
        invite_url: getInviteUrl(request, newCode),
        expires_at: expiresAt,
      })
    }

    // ---- Supabase (INTL) ----
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check admin role
    const { data: member } = await supabase
      .from('conversation_members')
      .select('role')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Admin permission required' }, { status: 403 })
    }

    const newCode = generateInviteCode()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ invite_code: newCode, invite_expires_at: expiresAt })
      .eq('id', conversationId)
    if (updateError) {
      return NextResponse.json({ error: 'Failed to reset invite link' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      invite_code: newCode,
      invite_url: getInviteUrl(request, newCode),
      expires_at: expiresAt,
    })
  } catch (error) {
    console.error('POST /api/groups/[id]/invite error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
