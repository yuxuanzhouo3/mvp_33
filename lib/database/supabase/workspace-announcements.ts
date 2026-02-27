import { createAdminClient } from '@/lib/supabase/admin'

export interface WorkspaceAnnouncementWithCreator {
  id: string
  workspace_id: string
  title: string
  content: string
  is_pinned: boolean
  created_by: string
  created_at: string
  updated_at: string
  creator: {
    id: string
    full_name: string
    avatar_url: string | null
  } | null
}

function normalizeCreator(
  creator: WorkspaceAnnouncementWithCreator['creator'] | WorkspaceAnnouncementWithCreator['creator'][]
): WorkspaceAnnouncementWithCreator['creator'] {
  if (Array.isArray(creator)) {
    return creator[0] || null
  }
  return creator || null
}

function normalizeAnnouncement(item: any): WorkspaceAnnouncementWithCreator {
  return {
    id: item.id,
    workspace_id: item.workspace_id,
    title: item.title,
    content: item.content,
    is_pinned: !!item.is_pinned,
    created_by: item.created_by,
    created_at: item.created_at,
    updated_at: item.updated_at,
    creator: normalizeCreator(item.creator),
  }
}

export async function getWorkspaceAnnouncements(
  workspaceId: string
): Promise<WorkspaceAnnouncementWithCreator[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('workspace_announcements')
    .select(`
      id,
      workspace_id,
      title,
      content,
      is_pinned,
      created_by,
      created_at,
      updated_at,
      creator:created_by(id, full_name, avatar_url)
    `)
    .eq('workspace_id', workspaceId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data || []).map(normalizeAnnouncement)
}

export async function createWorkspaceAnnouncement(
  workspaceId: string,
  creatorId: string,
  title: string,
  content: string
): Promise<WorkspaceAnnouncementWithCreator> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('workspace_announcements')
    .insert({
      workspace_id: workspaceId,
      title,
      content,
      created_by: creatorId,
    })
    .select(`
      id,
      workspace_id,
      title,
      content,
      is_pinned,
      created_by,
      created_at,
      updated_at,
      creator:created_by(id, full_name, avatar_url)
    `)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return normalizeAnnouncement(data)
}

export async function getWorkspaceAnnouncementById(
  announcementId: string
): Promise<WorkspaceAnnouncementWithCreator | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('workspace_announcements')
    .select(`
      id,
      workspace_id,
      title,
      content,
      is_pinned,
      created_by,
      created_at,
      updated_at,
      creator:created_by(id, full_name, avatar_url)
    `)
    .eq('id', announcementId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ? normalizeAnnouncement(data) : null
}

export async function updateWorkspaceAnnouncement(
  announcementId: string,
  title: string,
  content: string
): Promise<WorkspaceAnnouncementWithCreator | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('workspace_announcements')
    .update({
      title,
      content,
      updated_at: new Date().toISOString(),
    })
    .eq('id', announcementId)
    .select(`
      id,
      workspace_id,
      title,
      content,
      is_pinned,
      created_by,
      created_at,
      updated_at,
      creator:created_by(id, full_name, avatar_url)
    `)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data ? normalizeAnnouncement(data) : null
}

export async function deleteWorkspaceAnnouncement(
  announcementId: string
): Promise<boolean> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('workspace_announcements')
    .delete()
    .eq('id', announcementId)

  if (error) {
    throw new Error(error.message)
  }

  return true
}

export async function getWorkspaceMemberRole(
  workspaceId: string,
  userId: string
): Promise<string | null> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data?.role || null
}
