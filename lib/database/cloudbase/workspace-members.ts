import { getCloudBaseDb } from '@/lib/cloudbase/client'

/**
 * 更新工作区成员角色
 * @param workspaceId 工作区ID
 * @param userId 用户ID
 * @param role 新角色 ('admin' | 'member')
 * @returns 是否成功
 */
export async function updateWorkspaceMemberRole(
  workspaceId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<boolean> {
  console.log('[CloudBase updateWorkspaceMemberRole] 开始更新工作区成员角色', { workspaceId, userId, role })

  const db = getCloudBaseDb()
  if (!db) {
    console.error('[CloudBase updateWorkspaceMemberRole] 数据库未初始化')
    return false
  }

  try {
    // 查找成员记录
    const res = await db.collection('workspace_members')
      .where({
        workspace_id: workspaceId,
        user_id: userId
      })
      .get()

    if (!res.data || res.data.length === 0) {
      console.error('[CloudBase updateWorkspaceMemberRole] 未找到成员记录')
      return false
    }

    const doc = res.data[0]

    // 更新角色
    await db.collection('workspace_members')
      .doc(doc._id)
      .update({
        role,
        updated_at: new Date().toISOString()
      })

    console.log('[CloudBase updateWorkspaceMemberRole] 更新成功')
    return true
  } catch (error) {
    console.error('[CloudBase updateWorkspaceMemberRole] 更新失败', error)
    return false
  }
}

/**
 * 获取用户在工作区的角色
 * @param workspaceId 工作区ID
 * @param userId 用户ID
 * @returns 角色字符串或null
 */
export async function getWorkspaceMemberRole(
  workspaceId: string,
  userId: string
): Promise<string | null> {
  console.log('[CloudBase getWorkspaceMemberRole] 获取用户角色', { workspaceId, userId })

  const db = getCloudBaseDb()
  if (!db) {
    console.error('[CloudBase getWorkspaceMemberRole] 数据库未初始化')
    return null
  }

  try {
    const res = await db.collection('workspace_members')
      .where({
        workspace_id: workspaceId,
        user_id: userId
      })
      .field({ role: true })
      .get()

    if (!res.data || res.data.length === 0) {
      console.log('[CloudBase getWorkspaceMemberRole] 未找到成员记录')
      return null
    }

    const role = res.data[0].role
    console.log('[CloudBase getWorkspaceMemberRole] 查询成功', { role })
    return role || null
  } catch (error) {
    console.error('[CloudBase getWorkspaceMemberRole] 查询失败', error)
    return null
  }
}
