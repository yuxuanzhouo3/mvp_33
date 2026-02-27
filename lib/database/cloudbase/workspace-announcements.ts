import { getCloudBaseDb } from '@/lib/cloudbase/client'

function isCollectionMissingError(error: any): boolean {
  const message = String(error?.message || '')
  const code = error?.code || error?.errCode
  return (
    code === 'DATABASE_COLLECTION_NOT_EXIST' ||
    code === 'COLLECTION_NOT_EXIST' ||
    message.includes('DATABASE_COLLECTION_NOT_EXIST') ||
    message.includes('COLLECTION_NOT_EXIST') ||
    message.includes('Db or Table not exist') ||
    message.includes('not exist')
  )
}

export interface CloudBaseWorkspaceAnnouncement {
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

function mapCloudbaseAnnouncement(
  doc: any,
  creatorMap: Map<string, any>
): CloudBaseWorkspaceAnnouncement {
  const creator = creatorMap.get(doc.created_by)
  return {
    id: doc._id,
    workspace_id: doc.workspace_id,
    title: doc.title,
    content: doc.content,
    is_pinned: !!doc.is_pinned,
    created_by: doc.created_by,
    created_at: doc.created_at,
    updated_at: doc.updated_at,
    creator: creator
      ? {
          id: creator.id,
          full_name: creator.full_name || 'Unknown',
          avatar_url: creator.avatar_url || null,
        }
      : null,
  }
}

export async function getWorkspaceAnnouncements(
  workspaceId: string
): Promise<CloudBaseWorkspaceAnnouncement[]> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  let result: any
  try {
    result = await db
      .collection('workspace_announcements')
      .where({
        workspace_id: workspaceId,
        region: 'cn',
      })
      .orderBy('is_pinned', 'desc')
      .orderBy('created_at', 'desc')
      .get()
  } catch (error: any) {
    if (isCollectionMissingError(error)) {
      return []
    }
    throw error
  }

  const docs = result.data || []

  const creatorIds = [...new Set(docs.map((item: any) => item.created_by).filter(Boolean))]

  let creators: any[] = []
  if (creatorIds.length > 0) {
    const usersResult = await db
      .collection('users')
      .where({ id: db.command.in(creatorIds) })
      .get()

    creators = usersResult.data || []
  }

  const creatorMap = new Map(creators.map((user: any) => [user.id, user]))

  return docs.map((item: any) => mapCloudbaseAnnouncement(item, creatorMap))
}

export async function createWorkspaceAnnouncement(
  workspaceId: string,
  creatorId: string,
  title: string,
  content: string
): Promise<CloudBaseWorkspaceAnnouncement> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  const now = new Date().toISOString()

  const doc = {
    workspace_id: workspaceId,
    title,
    content,
    is_pinned: false,
    created_by: creatorId,
    created_at: now,
    updated_at: now,
    region: 'cn',
  }

  let result: any
  try {
    result = await db.collection('workspace_announcements').add(doc)
  } catch (error: any) {
    if (isCollectionMissingError(error)) {
      throw new Error('workspace_announcements collection is not initialized')
    }
    throw error
  }
  const announcementId = result.id || result._id

  const usersResult = await db.collection('users').where({ id: creatorId }).get()
  const creator = usersResult.data?.[0] || null

  return {
    id: announcementId,
    workspace_id: workspaceId,
    title,
    content,
    is_pinned: false,
    created_by: creatorId,
    created_at: now,
    updated_at: now,
    creator: creator
      ? {
          id: creator.id,
          full_name: creator.full_name || 'Unknown',
          avatar_url: creator.avatar_url || null,
        }
      : null,
  }
}

export async function getWorkspaceAnnouncementById(
  announcementId: string
): Promise<CloudBaseWorkspaceAnnouncement | null> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  let result: any
  try {
    result = await db.collection('workspace_announcements').doc(announcementId).get()
  } catch (error: any) {
    if (isCollectionMissingError(error)) {
      return null
    }
    throw error
  }
  const doc = result?.data || result
  if (!doc || !doc._id) {
    return null
  }

  const usersResult = await db.collection('users').where({ id: doc.created_by }).get()
  const creator = usersResult.data?.[0]
  const creatorMap = new Map(creator ? [[creator.id, creator]] : [])

  return mapCloudbaseAnnouncement(doc, creatorMap)
}

export async function updateWorkspaceAnnouncement(
  announcementId: string,
  title: string,
  content: string
): Promise<CloudBaseWorkspaceAnnouncement | null> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  try {
    await db.collection('workspace_announcements').doc(announcementId).update({
      title,
      content,
      updated_at: new Date().toISOString(),
    })
  } catch (error: any) {
    if (isCollectionMissingError(error)) {
      throw new Error('workspace_announcements collection is not initialized')
    }
    throw error
  }

  return getWorkspaceAnnouncementById(announcementId)
}

export async function deleteWorkspaceAnnouncement(
  announcementId: string
): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  try {
    await db.collection('workspace_announcements').doc(announcementId).remove()
  } catch (error: any) {
    if (isCollectionMissingError(error)) {
      return false
    }
    throw error
  }
  return true
}

export async function getWorkspaceMemberRole(
  workspaceId: string,
  userId: string
): Promise<string | null> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  const result = await db
    .collection('workspace_members')
    .where({
      workspace_id: workspaceId,
      user_id: userId,
    })
    .field({
      role: true,
    })
    .limit(1)
    .get()

  const member = result.data?.[0]
  return member?.role || null
}
