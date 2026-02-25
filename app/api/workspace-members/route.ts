import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseClient } from '@/lib/database-router'
import { updateWorkspaceMemberRole as updateWorkspaceMemberRoleSupabase, getWorkspaceMemberRole as getWorkspaceMemberRoleSupabase } from '@/lib/database/supabase/workspace-members'
import { updateWorkspaceMemberRole as updateWorkspaceMemberRoleCloudbase, getWorkspaceMemberRole as getWorkspaceMemberRoleCloudbase } from '@/lib/database/cloudbase/workspace-members'

/**
 * Get workspace members for current user
 * GET /api/workspace-members?workspaceId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const workspaceId = searchParams.get('workspaceId')

    const dbClient = await getDatabaseClient()
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    console.log('[API /api/workspace-members] Database:', {
      type: dbClient.type,
      region: userRegion,
      workspaceId
    })

    // CN version: use CloudBase
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      // Get current user from headers (CloudBase auth)
      const userId = request.headers.get('x-user-id')
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Import CloudBase services
      const { getUserService, getChatService } = await import('@/lib/services')
      const chatService = getChatService()

      // Get user's workspaces
      const workspaces = await chatService.getUserWorkspaces(userId)

      // If no workspaceId provided, use first workspace
      const targetWorkspaceId = workspaceId || (workspaces.length > 0 ? workspaces[0] : null)

      if (!targetWorkspaceId) {
        return NextResponse.json({
          success: true,
          members: []
        })
      }

      // Get workspace members
      const members = await chatService.getWorkspaceMembers(targetWorkspaceId)

      // Filter out current user
      const otherMembers = members.filter((m: any) => m.user_id !== userId)

      // 获取当前用户角色
      const currentUserRole = await getWorkspaceMemberRoleCloudbase(targetWorkspaceId, userId)
      console.log('[API /api/workspace-members] 当前用户角色 (CloudBase):', { userId, currentUserRole })

      return NextResponse.json({
        success: true,
        members: otherMembers,
        workspaceId: targetWorkspaceId,
        currentUserRole
      })
    }

    // INTL version: use Supabase
    // RLS policies have been fixed - no more infinite recursion
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspace members from Supabase
    let query = supabase
      .from('workspace_members')
      .select(`
        user_id,
        role,
        workspaces!workspace_members_workspace_id_fkey (
          id,
          name,
          domain
        ),
        users!workspace_members_user_id_fkey (
          id,
          email,
          full_name,
          username,
          avatar_url,
          title,
          status,
          status_message
        )
      `)
      .neq('user_id', user.id) // Exclude current user

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId)
    }

    const { data: members, error } = await query

    if (error) {
      console.error('Error fetching workspace members:', error)
      return NextResponse.json(
        { error: 'Failed to fetch workspace members' },
        { status: 500 }
      )
    }

    // Transform data
    const transformedMembers = (members || []).map((m: any) => ({
      ...m.users,
      role: m.role,
      workspace: m.workspaces
    })).filter(Boolean)

    // 获取当前用户角色
    const { data: currentUserMembership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId || members?.[0]?.workspace_id)
      .eq('user_id', user.id)
      .single()

    const currentUserRole = currentUserMembership?.role || null
    console.log('[API /api/workspace-members] 当前用户角色 (Supabase):', { userId: user.id, currentUserRole })

    return NextResponse.json({
      success: true,
      members: transformedMembers,
      workspaceId: workspaceId || (members?.[0]?.workspaces?.[0]?.id),
      currentUserRole
    })
  } catch (error: any) {
    console.error('Get workspace members error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get workspace members' },
      { status: 500 }
    )
  }
}

/**
 * Remove member from workspace
 * DELETE /api/workspace-members?memberId=xxx&workspaceId=xxx
 * 需要 owner/admin 权限，不能移除 owner
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const memberId = searchParams.get('memberId')
    const workspaceId = searchParams.get('workspaceId')

    if (!memberId || !workspaceId) {
      return NextResponse.json({ error: 'memberId and workspaceId are required' }, { status: 400 })
    }

    const dbClient = await getDatabaseClient()

    // CN version: use CloudBase
    if (dbClient.type === 'cloudbase') {
      const userId = request.headers.get('x-user-id')
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { getCloudBaseDb } = await import('@/lib/cloudbase/client')
      const db = getCloudBaseDb()
      if (!db) {
        return NextResponse.json({ error: 'Database not available' }, { status: 500 })
      }

      // 检查操作者是否为管理员
      const adminCheck = await db
        .collection('workspace_members')
        .where({
          workspace_id: workspaceId,
          user_id: userId,
          role: db.command.in(['owner', 'admin'])
        })
        .get()

      if (!adminCheck.data || adminCheck.data.length === 0) {
        return NextResponse.json({ error: 'Permission denied. Admin role required.' }, { status: 403 })
      }

      // 获取被移除成员的信息
      const memberResult = await db
        .collection('workspace_members')
        .where({
          workspace_id: workspaceId,
          user_id: memberId
        })
        .get()

      if (!memberResult.data || memberResult.data.length === 0) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 })
      }

      const targetMember = memberResult.data[0]

      // 不能移除 owner
      if (targetMember.role === 'owner') {
        return NextResponse.json({ error: 'Cannot remove workspace owner' }, { status: 403 })
      }

      // 删除成员
      await db
        .collection('workspace_members')
        .doc(targetMember._id)
        .delete()

      return NextResponse.json({ success: true, message: 'Member removed' })
    }

    // INTL version: use Supabase
    const supabase = dbClient.supabase!
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 检查操作者是否为管理员
    const { data: adminCheck } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()

    if (!adminCheck || !['owner', 'admin'].includes(adminCheck.role)) {
      return NextResponse.json({ error: 'Permission denied. Admin role required.' }, { status: 403 })
    }

    // 获取被移除成员的信息
    const { data: targetMember, error: fetchError } = await supabase
      .from('workspace_members')
      .select('id, role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId)
      .single()

    if (fetchError || !targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // 不能移除 owner
    if (targetMember.role === 'owner') {
      return NextResponse.json({ error: 'Cannot remove workspace owner' }, { status: 403 })
    }

    // 删除成员
    const { error: deleteError } = await supabase
      .from('workspace_members')
      .delete()
      .eq('id', targetMember.id)

    if (deleteError) {
      console.error('Error removing member:', deleteError)
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Member removed' })
  } catch (error: any) {
    console.error('Remove member error:', error)
    return NextResponse.json({ error: error.message || 'Failed to remove member' }, { status: 500 })
  }
}

/**
 * Update workspace member role (set/remove admin)
 * PUT /api/workspace-members
 * Body: { workspaceId, memberId, role: 'admin' | 'member' }
 * 只有 owner 能设置/取消管理员
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspaceId, memberId, role } = body

    console.log('[API /api/workspace-members PUT] 收到请求:', { workspaceId, memberId, role })

    if (!workspaceId || !memberId || !role) {
      return NextResponse.json({ error: 'workspaceId, memberId and role are required' }, { status: 400 })
    }

    if (!['admin', 'member'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be "admin" or "member"' }, { status: 400 })
    }

    const dbClient = await getDatabaseClient()

    // CN version: use CloudBase
    if (dbClient.type === 'cloudbase') {
      const userId = request.headers.get('x-user-id')
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { getCloudBaseDb } = await import('@/lib/cloudbase/client')
      const db = getCloudBaseDb()
      if (!db) {
        return NextResponse.json({ error: 'Database not available' }, { status: 500 })
      }

      // 检查操作者是否为 owner（只有 owner 能设置/取消管理员）
      const operatorCheck = await db
        .collection('workspace_members')
        .where({
          workspace_id: workspaceId,
          user_id: userId
        })
        .field({ role: true })
        .get()

      console.log('[API /api/workspace-members PUT] 操作者检查 (CloudBase):', {
        userId,
        operatorRole: operatorCheck.data?.[0]?.role
      })

      if (!operatorCheck.data || operatorCheck.data.length === 0) {
        return NextResponse.json({ error: 'You are not a member of this workspace' }, { status: 403 })
      }

      const operatorRole = operatorCheck.data[0].role
      if (operatorRole !== 'owner') {
        return NextResponse.json({ error: 'Permission denied. Only workspace owner can manage admin roles.' }, { status: 403 })
      }

      // 获取目标成员信息
      const targetMemberResult = await db
        .collection('workspace_members')
        .where({
          workspace_id: workspaceId,
          user_id: memberId
        })
        .get()

      if (!targetMemberResult.data || targetMemberResult.data.length === 0) {
        return NextResponse.json({ error: 'Member not found' }, { status: 404 })
      }

      const targetMember = targetMemberResult.data[0]

      // 不能修改 owner 的角色
      if (targetMember.role === 'owner') {
        return NextResponse.json({ error: 'Cannot modify workspace owner role' }, { status: 403 })
      }

      // 更新角色
      const success = await updateWorkspaceMemberRoleCloudbase(workspaceId, memberId, role)

      if (!success) {
        return NextResponse.json({ error: 'Failed to update member role' }, { status: 500 })
      }

      console.log('[API /api/workspace-members PUT] 更新成功 (CloudBase)')
      return NextResponse.json({ success: true, message: 'Member role updated' })
    }

    // INTL version: use Supabase
    const supabase = dbClient.supabase!
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 检查操作者是否为 owner（只有 owner 能设置/取消管理员）
    const { data: operatorCheck } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()

    console.log('[API /api/workspace-members PUT] 操作者检查 (Supabase):', {
      userId: user.id,
      operatorRole: operatorCheck?.role
    })

    if (!operatorCheck || operatorCheck.role !== 'owner') {
      return NextResponse.json({ error: 'Permission denied. Only workspace owner can manage admin roles.' }, { status: 403 })
    }

    // 获取目标成员信息
    const { data: targetMember, error: fetchError } = await supabase
      .from('workspace_members')
      .select('id, role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', memberId)
      .single()

    if (fetchError || !targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    }

    // 不能修改 owner 的角色
    if (targetMember.role === 'owner') {
      return NextResponse.json({ error: 'Cannot modify workspace owner role' }, { status: 403 })
    }

    // 更新角色
    const success = await updateWorkspaceMemberRoleSupabase(workspaceId, memberId, role)

    if (!success) {
      return NextResponse.json({ error: 'Failed to update member role' }, { status: 500 })
    }

    console.log('[API /api/workspace-members PUT] 更新成功 (Supabase)')
    return NextResponse.json({ success: true, message: 'Member role updated' })
  } catch (error: any) {
    console.error('Update member role error:', error)
    return NextResponse.json({ error: error.message || 'Failed to update member role' }, { status: 500 })
  }
}
