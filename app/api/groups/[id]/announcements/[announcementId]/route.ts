import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateAnnouncement, deleteAnnouncement, getAnnouncementById } from '@/lib/database/supabase/announcements'
import { updateAnnouncement as updateAnnouncementCN, deleteAnnouncement as deleteAnnouncementCN, getAnnouncementById as getAnnouncementByIdCN } from '@/lib/database/cloudbase/announcements'
import { getDatabaseClientForUser } from '@/lib/database-router'

// PUT /api/groups/[id]/announcements/[announcementId]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; announcementId: string }> }
) {
  try {
    const { announcementId } = await params
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

    // CN users: update in CloudBase
    if (dbClient.type === 'cloudbase' && dbClient.region === 'cn' && dbClient.cloudbase) {
      const announcement = await updateAnnouncementCN(announcementId, content.trim())
      if (!announcement) {
        return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
      }
      return NextResponse.json({ success: true, announcement })
    }

    // Global users: update in Supabase
    const announcement = await updateAnnouncement(announcementId, content.trim())
    return NextResponse.json({ success: true, announcement })
  } catch (error: any) {
    console.error('[Announcements PUT] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/groups/[id]/announcements/[announcementId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; announcementId: string }> }
) {
  try {
    const { announcementId } = await params

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

    // CN users: delete in CloudBase
    if (dbClient.type === 'cloudbase' && dbClient.region === 'cn' && dbClient.cloudbase) {
      await deleteAnnouncementCN(announcementId)
      return NextResponse.json({ success: true })
    }

    // Global users: delete in Supabase
    await deleteAnnouncement(announcementId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Announcements DELETE] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
