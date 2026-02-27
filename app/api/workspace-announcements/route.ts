import { NextRequest, NextResponse } from 'next/server'
import { IS_DOMESTIC_VERSION } from '@/config'
import { getDatabaseClient } from '@/lib/database-router'
import {
  getWorkspaceAnnouncements as getWorkspaceAnnouncementsSupabase,
  createWorkspaceAnnouncement as createWorkspaceAnnouncementSupabase,
  getWorkspaceAnnouncementById as getWorkspaceAnnouncementByIdSupabase,
  updateWorkspaceAnnouncement as updateWorkspaceAnnouncementSupabase,
  deleteWorkspaceAnnouncement as deleteWorkspaceAnnouncementSupabase,
  getWorkspaceMemberRole as getWorkspaceMemberRoleSupabase,
} from '@/lib/database/supabase/workspace-announcements'
import {
  getWorkspaceAnnouncements as getWorkspaceAnnouncementsCloudbase,
  createWorkspaceAnnouncement as createWorkspaceAnnouncementCloudbase,
  getWorkspaceAnnouncementById as getWorkspaceAnnouncementByIdCloudbase,
  updateWorkspaceAnnouncement as updateWorkspaceAnnouncementCloudbase,
  deleteWorkspaceAnnouncement as deleteWorkspaceAnnouncementCloudbase,
  getWorkspaceMemberRole as getWorkspaceMemberRoleCloudbase,
} from '@/lib/database/cloudbase/workspace-announcements'

const MANAGER_ROLES = new Set(['owner', 'admin'])

async function getCurrentUserId(request: NextRequest): Promise<string | null> {
  if (IS_DOMESTIC_VERSION) {
    const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
    const user = await verifyCloudBaseSession(request)
    return user?.id || null
  }

  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id || null
}

function validateAnnouncementPayload(title?: string, content?: string): string | null {
  if (!title) return 'title is required'
  if (!content) return 'content is required'
  if (title.length > 120) return 'title is too long (max 120 chars)'
  if (content.length > 5000) return 'content is too long (max 5000 chars)'
  return null
}

// GET /api/workspace-announcements?workspaceId=xxx
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId')
    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    const userId = await getCurrentUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbClient = await getDatabaseClient()
    const isCloudbase = dbClient.type === 'cloudbase' && dbClient.region === 'cn'

    if (isCloudbase) {
      const role = await getWorkspaceMemberRoleCloudbase(workspaceId, userId)
      if (!role) {
        return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 })
      }

      const announcements = await getWorkspaceAnnouncementsCloudbase(workspaceId)
      return NextResponse.json({
        success: true,
        announcements,
        currentUserRole: role,
        canManage: MANAGER_ROLES.has(role),
      })
    }

    const role = await getWorkspaceMemberRoleSupabase(workspaceId, userId)
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 })
    }

    const announcements = await getWorkspaceAnnouncementsSupabase(workspaceId)
    return NextResponse.json({
      success: true,
      announcements,
      currentUserRole: role,
      canManage: MANAGER_ROLES.has(role),
    })
  } catch (error: any) {
    console.error('[WorkspaceAnnouncements GET] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get workspace announcements' },
      { status: 500 }
    )
  }
}

// POST /api/workspace-announcements
// Body: { workspaceId, title, content }
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const workspaceId = body?.workspaceId
    const title = body?.title?.trim()
    const content = body?.content?.trim()

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    const payloadError = validateAnnouncementPayload(title, content)
    if (payloadError) {
      return NextResponse.json({ error: payloadError }, { status: 400 })
    }

    const userId = await getCurrentUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbClient = await getDatabaseClient()
    const isCloudbase = dbClient.type === 'cloudbase' && dbClient.region === 'cn'

    if (isCloudbase) {
      const role = await getWorkspaceMemberRoleCloudbase(workspaceId, userId)
      if (!role) {
        return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 })
      }
      if (!MANAGER_ROLES.has(role)) {
        return NextResponse.json({ error: 'Only owner/admin can publish announcements' }, { status: 403 })
      }

      const announcement = await createWorkspaceAnnouncementCloudbase(
        workspaceId,
        userId,
        title,
        content
      )

      return NextResponse.json({
        success: true,
        announcement,
      })
    }

    const role = await getWorkspaceMemberRoleSupabase(workspaceId, userId)
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 })
    }
    if (!MANAGER_ROLES.has(role)) {
      return NextResponse.json({ error: 'Only owner/admin can publish announcements' }, { status: 403 })
    }

    const announcement = await createWorkspaceAnnouncementSupabase(workspaceId, userId, title, content)
    return NextResponse.json({
      success: true,
      announcement,
    })
  } catch (error: any) {
    console.error('[WorkspaceAnnouncements POST] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to publish workspace announcement' },
      { status: 500 }
    )
  }
}

// PUT /api/workspace-announcements
// Body: { announcementId, title, content }
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const announcementId = body?.announcementId
    const title = body?.title?.trim()
    const content = body?.content?.trim()

    if (!announcementId) {
      return NextResponse.json({ error: 'announcementId is required' }, { status: 400 })
    }

    const payloadError = validateAnnouncementPayload(title, content)
    if (payloadError) {
      return NextResponse.json({ error: payloadError }, { status: 400 })
    }

    const userId = await getCurrentUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbClient = await getDatabaseClient()
    const isCloudbase = dbClient.type === 'cloudbase' && dbClient.region === 'cn'

    if (isCloudbase) {
      const existing = await getWorkspaceAnnouncementByIdCloudbase(announcementId)
      if (!existing) {
        return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
      }

      const role = await getWorkspaceMemberRoleCloudbase(existing.workspace_id, userId)
      if (!role) {
        return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 })
      }
      if (!MANAGER_ROLES.has(role)) {
        return NextResponse.json({ error: 'Only owner/admin can edit announcements' }, { status: 403 })
      }

      const announcement = await updateWorkspaceAnnouncementCloudbase(
        announcementId,
        title,
        content
      )
      if (!announcement) {
        return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
      }

      return NextResponse.json({ success: true, announcement })
    }

    const existing = await getWorkspaceAnnouncementByIdSupabase(announcementId)
    if (!existing) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
    }

    const role = await getWorkspaceMemberRoleSupabase(existing.workspace_id, userId)
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 })
    }
    if (!MANAGER_ROLES.has(role)) {
      return NextResponse.json({ error: 'Only owner/admin can edit announcements' }, { status: 403 })
    }

    const announcement = await updateWorkspaceAnnouncementSupabase(
      announcementId,
      title,
      content
    )
    if (!announcement) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, announcement })
  } catch (error: any) {
    console.error('[WorkspaceAnnouncements PUT] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update workspace announcement' },
      { status: 500 }
    )
  }
}

// DELETE /api/workspace-announcements
// Body: { announcementId }
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const announcementId = body?.announcementId

    if (!announcementId) {
      return NextResponse.json({ error: 'announcementId is required' }, { status: 400 })
    }

    const userId = await getCurrentUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dbClient = await getDatabaseClient()
    const isCloudbase = dbClient.type === 'cloudbase' && dbClient.region === 'cn'

    if (isCloudbase) {
      const existing = await getWorkspaceAnnouncementByIdCloudbase(announcementId)
      if (!existing) {
        return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
      }

      const role = await getWorkspaceMemberRoleCloudbase(existing.workspace_id, userId)
      if (!role) {
        return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 })
      }
      if (!MANAGER_ROLES.has(role)) {
        return NextResponse.json({ error: 'Only owner/admin can delete announcements' }, { status: 403 })
      }

      await deleteWorkspaceAnnouncementCloudbase(announcementId)
      return NextResponse.json({ success: true })
    }

    const existing = await getWorkspaceAnnouncementByIdSupabase(announcementId)
    if (!existing) {
      return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })
    }

    const role = await getWorkspaceMemberRoleSupabase(existing.workspace_id, userId)
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 })
    }
    if (!MANAGER_ROLES.has(role)) {
      return NextResponse.json({ error: 'Only owner/admin can delete announcements' }, { status: 403 })
    }

    await deleteWorkspaceAnnouncementSupabase(announcementId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[WorkspaceAnnouncements DELETE] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete workspace announcement' },
      { status: 500 }
    )
  }
}
