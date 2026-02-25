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
  invite_code?: string
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
  invite_code: workspaceData.invite_code || null,
  created_at: workspaceData.created_at || new Date().toISOString(),
  updated_at: workspaceData.updated_at || new Date().toISOString(),
})

/**
 * Get workspaces where user is a member from CloudBase
 * @param userId - The user ID to filter workspaces by membership
 */
export async function getWorkspaces(userId?: string): Promise<Workspace[]> {
  try {
    const db = getCloudBaseDb()
    if (!db) {
      console.error('[CloudBase] Database not configured')
      return []
    }

    // If userId is provided, only return workspaces where user is a member
    if (userId) {
      // First get workspace_ids from workspace_members
      const memberResult = await db.collection('workspace_members')
        .where({ user_id: userId })
        .get()

      if (!memberResult.data || memberResult.data.length === 0) {
        return []
      }

      const workspaceIds = memberResult.data.map((m: any) => m.workspace_id).filter(Boolean)

      if (workspaceIds.length === 0) {
        return []
      }

      // Then get the workspaces by IDs
      const result = await db.collection('workspaces')
        .where({ _id: db.command.in(workspaceIds) })
        .orderBy('created_at', 'desc')
        .get()

      if (result.data && result.data.length > 0) {
        return result.data.map(normalizeCloudBaseWorkspace)
      }

      return []
    }

    // Fallback: return all workspaces (for backward compatibility, but should not be used)
    console.warn('[CloudBase] getWorkspaces called without userId, returning all workspaces')
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
    owner_id?: string
    invite_code?: string
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
      owner_id: workspaceData.owner_id || null,
      invite_code: workspaceData.invite_code || null,
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

/**
 * Get workspace by invite code from CloudBase
 */
export async function getWorkspaceByInviteCode(inviteCode: string): Promise<Workspace | null> {
  try {
    console.log('[CloudBase] getWorkspaceByInviteCode 开始')
    console.log('[CloudBase] 输入邀请码:', JSON.stringify(inviteCode))
    console.log('[CloudBase] 邀请码长度:', inviteCode.length)

    const db = getCloudBaseDb()
    if (!db) {
      console.log('[CloudBase] 数据库未配置')
      return null
    }

    const upperCode = inviteCode.toUpperCase()
    console.log('[CloudBase] 查询条件 - invite_code:', JSON.stringify(upperCode))

    const result = await db.collection('workspaces')
      .where({
        invite_code: upperCode
      })
      .limit(1)
      .get()

    console.log('[CloudBase] 查询结果数量:', result.data?.length || 0)
    console.log('[CloudBase] 查询结果:', JSON.stringify(result.data))

    if (result.data && result.data.length > 0) {
      const workspace = normalizeCloudBaseWorkspace(result.data[0])
      console.log('[CloudBase] 标准化后的工作区:', JSON.stringify(workspace))
      return workspace
    }

    console.log('[CloudBase] 未找到匹配的工作区')
    return null
  } catch (error) {
    console.error('[CloudBase] getWorkspaceByInviteCode 错误:', error)
    return null
  }
}
