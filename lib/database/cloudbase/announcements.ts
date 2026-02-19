/**
 * CloudBase group announcements database operations
 * Handles group announcement operations in CloudBase (for China region)
 */

import { getCloudBaseDb } from '@/lib/cloudbase/client'

export interface CloudBaseAnnouncement {
  id: string
  conversation_id: string
  content: string
  created_by: string
  created_at: string
  updated_at: string
  region: string
}

interface AnnouncementWithCreator extends CloudBaseAnnouncement {
  creator: {
    id: string
    full_name: string
    avatar_url: string | null
  }
}

export async function getAnnouncements(conversationId: string): Promise<AnnouncementWithCreator[]> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  const res = await db.collection('group_announcements')
    .where({
      conversation_id: conversationId,
      region: 'cn',
    })
    .orderBy('created_at', 'desc')
    .get()

  const docs = res.data || []

  // Get unique creator IDs
  const creatorIds = [...new Set(docs.map((d: any) => d.created_by))]

  // Fetch creator info
  let creators: any[] = []
  if (creatorIds.length > 0) {
    const usersRes = await db.collection('users')
      .where({
        id: db.command.in(creatorIds)
      })
      .get()
    creators = usersRes.data || []
  }

  const creatorMap = new Map(creators.map((u: any) => [u.id, u]))

  return docs.map((a: any) => ({
    id: a._id,
    conversation_id: a.conversation_id,
    content: a.content,
    created_by: a.created_by,
    created_at: a.created_at,
    updated_at: a.updated_at,
    region: a.region,
    creator: {
      id: a.created_by,
      full_name: creatorMap.get(a.created_by)?.full_name || 'Unknown',
      avatar_url: creatorMap.get(a.created_by)?.avatar_url || null
    }
  }))
}

export async function createAnnouncement(
  conversationId: string,
  creatorId: string,
  content: string
): Promise<AnnouncementWithCreator> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  const now = new Date().toISOString()

  const doc: any = {
    conversation_id: conversationId,
    content,
    created_by: creatorId,
    created_at: now,
    updated_at: now,
    region: 'cn',
  }

  const res = await db.collection('group_announcements').add(doc)
  const announcementId = res.id || res._id

  // Get creator info
  const usersRes = await db.collection('users')
    .where({ id: creatorId })
    .get()

  const creator = usersRes.data?.[0] || { full_name: 'Unknown', avatar_url: null }

  return {
    id: announcementId,
    conversation_id: conversationId,
    content,
    created_by: creatorId,
    created_at: now,
    updated_at: now,
    region: 'cn',
    creator: {
      id: creatorId,
      full_name: creator.full_name || 'Unknown',
      avatar_url: creator.avatar_url || null
    }
  }
}

export async function updateAnnouncement(
  announcementId: string,
  content: string
): Promise<AnnouncementWithCreator | null> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  const now = new Date().toISOString()

  // Update the announcement
  await db.collection('group_announcements')
    .doc(announcementId)
    .update({
      content,
      updated_at: now,
    })

  // Get updated announcement
  const res = await db.collection('group_announcements')
    .doc(announcementId)
    .get()

  const a = res?.data || res
  if (!a) return null

  // Get creator info
  const usersRes = await db.collection('users')
    .where({ id: a.created_by })
    .get()

  const creator = usersRes.data?.[0] || { full_name: 'Unknown', avatar_url: null }

  return {
    id: a._id,
    conversation_id: a.conversation_id,
    content: a.content,
    created_by: a.created_by,
    created_at: a.created_at,
    updated_at: a.updated_at,
    region: a.region,
    creator: {
      id: a.created_by,
      full_name: creator.full_name || 'Unknown',
      avatar_url: creator.avatar_url || null
    }
  }
}

export async function deleteAnnouncement(announcementId: string): Promise<boolean> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  await db.collection('group_announcements')
    .doc(announcementId)
    .remove()

  return true
}

export async function getAnnouncementById(announcementId: string): Promise<AnnouncementWithCreator | null> {
  const db = getCloudBaseDb()
  if (!db) {
    throw new Error('CloudBase not configured')
  }

  const res = await db.collection('group_announcements')
    .doc(announcementId)
    .get()

  const a = res?.data || res
  if (!a) return null

  // Get creator info
  const usersRes = await db.collection('users')
    .where({ id: a.created_by })
    .get()

  const creator = usersRes.data?.[0] || { full_name: 'Unknown', avatar_url: null }

  return {
    id: a._id,
    conversation_id: a.conversation_id,
    content: a.content,
    created_by: a.created_by,
    created_at: a.created_at,
    updated_at: a.updated_at,
    region: a.region,
    creator: {
      id: a.created_by,
      full_name: creator.full_name || 'Unknown',
      avatar_url: creator.avatar_url || null
    }
  }
}
