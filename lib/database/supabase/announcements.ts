/**
 * Supabase group announcements database operations
 * Handles group announcement operations in Supabase (for International region)
 */

import { createClient } from '@/lib/supabase/server'

export async function getAnnouncements(conversationId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('group_announcements')
    .select(`
      *,
      creator:created_by(id, full_name, avatar_url)
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function createAnnouncement(
  conversationId: string,
  creatorId: string,
  content: string
) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('group_announcements')
    .insert({
      conversation_id: conversationId,
      content,
      created_by: creatorId
    })
    .select(`
      *,
      creator:created_by(id, full_name, avatar_url)
    `)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function updateAnnouncement(
  announcementId: string,
  content: string
) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('group_announcements')
    .update({
      content,
      updated_at: new Date().toISOString()
    })
    .eq('id', announcementId)
    .select(`
      *,
      creator:created_by(id, full_name, avatar_url)
    `)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function deleteAnnouncement(announcementId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from('group_announcements')
    .delete()
    .eq('id', announcementId)

  if (error) {
    throw new Error(error.message)
  }

  return true
}

export async function getAnnouncementById(announcementId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('group_announcements')
    .select(`
      *,
      creator:created_by(id, full_name, avatar_url)
    `)
    .eq('id', announcementId)
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}
