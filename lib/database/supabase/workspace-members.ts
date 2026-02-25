import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

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
  console.log('[updateWorkspaceMemberRole] 开始更新工作区成员角色', { workspaceId, userId, role })

  // 使用Service Role Key绕过RLS
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await supabase
    .from('workspace_members')
    .update({ role })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .select()

  if (error) {
    console.error('[updateWorkspaceMemberRole] 更新失败', {
      error,
      errorMessage: error.message,
      errorDetails: error.details,
      errorHint: error.hint,
      errorCode: error.code
    })
    return false
  }

  console.log('[updateWorkspaceMemberRole] 更新成功', { data })
  return true
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
  console.log('[getWorkspaceMemberRole] 获取用户角色', { workspaceId, userId })

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .single()

  if (error) {
    console.error('[getWorkspaceMemberRole] 查询失败', {
      error,
      errorMessage: error.message
    })
    return null
  }

  console.log('[getWorkspaceMemberRole] 查询成功', { role: data?.role })
  return data?.role || null
}
