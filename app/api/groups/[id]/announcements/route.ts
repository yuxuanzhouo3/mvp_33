import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnnouncements, createAnnouncement } from '@/lib/database/supabase/announcements'
import { getAnnouncements as getAnnouncementsCN, createAnnouncement as createAnnouncementCN } from '@/lib/database/cloudbase/announcements'
import { getDatabaseClientForUser } from '@/lib/database-router'

// GET /api/groups/[id]/announcements
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await params

    // Verify user is authenticated
    const { IS_DOMESTIC_VERSION } = await import('@/config')
    let user: any = null

    if (IS_DOMESTIC_VERSION) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (!cloudBaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = cloudBaseUser
    } else {
      const supabase = await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (!supabaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = supabaseUser
    }

    const dbClient = await getDatabaseClientForUser(request)

    // CN users: read from CloudBase
    if (dbClient.type === 'cloudbase' && dbClient.region === 'cn' && dbClient.cloudbase) {
      const announcements = await getAnnouncementsCN(groupId)
      return NextResponse.json({ success: true, announcements })
    }

    // Global users: read from Supabase
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('group_announcements')
      .select(`
        *,
        creator:created_by(id, full_name, avatar_url)
      `)
      .eq('conversation_id', groupId)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, announcements: data })
  } catch (error: any) {
    console.error('[Announcements GET] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/groups/[id]/announcements
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await params
    const { content } = await request.json()

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    }

    // Verify user is authenticated
    const { IS_DOMESTIC_VERSION } = await import('@/config')
    let user: any = null

    if (IS_DOMESTIC_VERSION) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (!cloudBaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = cloudBaseUser
    } else {
      const supabase = await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (!supabaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = supabaseUser
    }

    const dbClient = await getDatabaseClientForUser(request)

    // CN users: create in CloudBase
    if (dbClient.type === 'cloudbase' && dbClient.region === 'cn' && dbClient.cloudbase) {
      const announcement = await createAnnouncementCN(groupId, user.id, content.trim())
      return NextResponse.json({ success: true, announcement })
    }

    // Global users: create in Supabase
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('group_announcements')
      .insert({
        conversation_id: groupId,
        content: content.trim(),
        created_by: user.id
      })
      .select(`
        *,
        creator:created_by(id, full_name, avatar_url)
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, announcement: data })
  } catch (error: any) {
    console.error('[Announcements POST] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
