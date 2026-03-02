import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'

const DEFAULT_LOOKBACK_SECONDS = 120
const MAX_LOOKBACK_SECONDS = 300
const DEFAULT_INVITE_TTL_MS = 45_000

type PendingCallInvite = {
  messageId: string
  conversationId: string
  callType: 'voice' | 'video'
  callerId?: string
  callerName?: string
  channelName?: string
  createdAt: string
  inviteExpiresAt?: string
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) return {}
  if (typeof value === 'object') return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  return {}
}

function toIsoOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return undefined
  return new Date(parsed).toISOString()
}

function isInviteExpired(metadata: Record<string, unknown>, createdAt: string, nowMs: number): boolean {
  const inviteExpiresAt = toIsoOrUndefined(metadata.invite_expires_at)
  if (inviteExpiresAt) {
    return Date.parse(inviteExpiresAt) <= nowMs
  }

  const createdMs = Date.parse(createdAt)
  if (!Number.isFinite(createdMs)) return false
  return nowMs - createdMs > DEFAULT_INVITE_TTL_MS
}

function pickLatestPendingInvite(rows: any[]): PendingCallInvite | null {
  if (!Array.isArray(rows) || rows.length === 0) return null

  const nowMs = Date.now()
  const ordered = [...rows].sort((a, b) => {
    const bMs = Date.parse(String(b?.created_at || ''))
    const aMs = Date.parse(String(a?.created_at || ''))
    return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0)
  })

  for (const row of ordered) {
    const messageId = String(row?.id || row?._id || '')
    const conversationId = String(row?.conversation_id || '')
    if (!messageId || !conversationId) continue

    const metadata = parseMetadata(row?.metadata)
    const callStatus = String(metadata.call_status || '')
    const rawCallType = String(metadata.call_type || '')
    const callType = rawCallType === 'voice' ? 'voice' : rawCallType === 'video' ? 'video' : null
    if (!callType || callStatus !== 'calling') continue

    const createdAt = toIsoOrUndefined(row?.created_at) || new Date().toISOString()
    if (isInviteExpired(metadata, createdAt, nowMs)) continue

    const callerId = typeof metadata.caller_id === 'string' ? metadata.caller_id : undefined
    const callerName = typeof metadata.caller_name === 'string' ? metadata.caller_name : undefined
    const channelName = typeof metadata.channel_name === 'string' ? metadata.channel_name : undefined
    const inviteExpiresAt = toIsoOrUndefined(metadata.invite_expires_at)

    return {
      messageId,
      conversationId,
      callType,
      callerId,
      callerName,
      channelName,
      createdAt,
      inviteExpiresAt,
    }
  }

  return null
}

export async function GET(request: NextRequest) {
  try {
    const maxAgeRaw = Number.parseInt(request.nextUrl.searchParams.get('maxAgeSeconds') || '', 10)
    const maxAgeSeconds = Number.isFinite(maxAgeRaw)
      ? Math.min(Math.max(maxAgeRaw, 15), MAX_LOOKBACK_SECONDS)
      : DEFAULT_LOOKBACK_SECONDS
    const sinceIso = new Date(Date.now() - maxAgeSeconds * 1000).toISOString()

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    if (dbClient.type === 'cloudbase' && userRegion === 'cn' && dbClient.cloudbase) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (!cloudBaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const userId = String(cloudBaseUser.id || '').trim()
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const db = dbClient.cloudbase
      const cmd = db.command

      const membershipsRes = await db.collection('conversation_members')
        .where({
          user_id: userId,
        })
        .limit(500)
        .get()
      const memberships = Array.isArray(membershipsRes?.data) ? membershipsRes.data : []
      const conversationIds = Array.from(new Set(memberships
        .filter((row: any) => !row?.deleted_at)
        .map((row: any) => String(row?.conversation_id || ''))
        .filter(Boolean)))

      if (conversationIds.length === 0) {
        return NextResponse.json({ success: true, invite: null })
      }

      const messagesRes = await db.collection('messages')
        .where({
          conversation_id: cmd.in(conversationIds.slice(0, 200)),
          sender_id: cmd.neq(userId),
          type: 'system',
          created_at: cmd.gte(sinceIso),
        })
        .orderBy('created_at', 'desc')
        .limit(80)
        .get()

      const rows = Array.isArray(messagesRes?.data) ? messagesRes.data : []
      const invite = pickLatestPendingInvite(rows)
      return NextResponse.json({ success: true, invite })
    }

    const supabase = dbClient.supabase || await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .limit(500)

    if (membershipsError) {
      console.error('[GET /api/calls/pending] Failed to load memberships:', membershipsError)
      return NextResponse.json({ error: 'Failed to load memberships' }, { status: 500 })
    }

    const conversationIds = Array.isArray(memberships)
      ? Array.from(new Set(memberships.map((m: any) => String(m?.conversation_id || '')).filter(Boolean)))
      : []
    if (conversationIds.length === 0) {
      return NextResponse.json({ success: true, invite: null })
    }

    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('id, conversation_id, created_at, metadata')
      .in('conversation_id', conversationIds)
      .eq('type', 'system')
      .neq('sender_id', user.id)
      .gte('created_at', sinceIso)
      .contains('metadata', { call_status: 'calling' })
      .order('created_at', { ascending: false })
      .limit(80)

    if (messagesError) {
      console.error('[GET /api/calls/pending] Failed to load messages:', messagesError)
      return NextResponse.json({ error: 'Failed to load pending call invites' }, { status: 500 })
    }

    const invite = pickLatestPendingInvite(messages || [])
    return NextResponse.json({ success: true, invite })
  } catch (error) {
    console.error('[GET /api/calls/pending] Unexpected error:', error)
    return NextResponse.json({ error: 'Failed to get pending call invites' }, { status: 500 })
  }
}
