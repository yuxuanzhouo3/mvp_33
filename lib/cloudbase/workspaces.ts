/**
 * CloudBase workspace operations
 * Handles workspace operations in CloudBase (for China region)
 */

import { getCloudBaseDb } from './client'

export interface Workspace {
  id?: string
  _id?: string
  name: string
  domain: string
  description?: string
  logo_url?: string
  created_at?: string
  updated_at?: string
}

const normalizeCloudBaseWorkspace = (workspaceData: any): Workspace => ({
  id: workspaceData._id || workspaceData.id,
  _id: workspaceData._id,
  name: workspaceData.name,
  domain: workspaceData.domain,
  description: workspaceData.description || '',
  logo_url: workspaceData.logo_url || null,
  created_at: workspaceData.created_at || new Date().toISOString(),
  updated_at: workspaceData.updated_at || new Date().toISOString(),
})

/**
 * Get all workspaces from CloudBase
 */
export async function getWorkspaces(): Promise<Workspace[]> {
  try {
    const db = getCloudBaseDb()
    if (!db) {
      console.error('[CloudBase] Database not configured')
      return []
    }

    const result = await db.collection('workspaces')
      .orderBy('created_at', 'desc')
      .get()

    if (result.data && result.data.length > 0) {
      return result.data.map(normalizeCloudBaseWorkspace)
    }

    return []
  } catch (error) {
    console.error('CloudBase getWorkspaces error:', error)
    return []
  }
}

/**
 * Get workspace by ID from CloudBase
 */
export async function getWorkspaceById(workspaceId: string): Promise<Workspace | null> {
  try {
    const db = getCloudBaseDb()
    if (!db) {
      return null
    }

    const result = await db.collection('workspaces')
      .doc(workspaceId)
      .get()

    if (result.data && result.data.length > 0) {
      return normalizeCloudBaseWorkspace(result.data[0])
    }

    return null
  } catch (error) {
    console.error('CloudBase getWorkspaceById error:', error)
    return null
  }
}

/**
 * Create workspace in CloudBase
 */
export async function createWorkspace(
  workspaceData: {
    name: string
    domain: string
    description?: string
    logo_url?: string
  }
): Promise<Workspace> {
  try {
    const db = getCloudBaseDb()
    if (!db) {
      throw new Error('CloudBase not configured')
    }

    const now = new Date().toISOString()
    const workspaceRecord = {
      name: workspaceData.name,
      domain: workspaceData.domain,
      description: workspaceData.description || '',
      logo_url: workspaceData.logo_url || null,
      created_at: now,
      updated_at: now,
    }

    const result = await db.collection('workspaces').add(workspaceRecord)
    const docId = result.id || result._id

    if (!docId) {
      throw new Error('Failed to create workspace in CloudBase')
    }

    return normalizeCloudBaseWorkspace({
      ...workspaceRecord,
      _id: docId,
    })
  } catch (error: any) {
    console.error('CloudBase createWorkspace error:', error)
    throw error
  }
}
