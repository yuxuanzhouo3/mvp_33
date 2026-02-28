import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { getWorkspaceByInviteCode } from '@/lib/cloudbase/workspaces'
import { getDeploymentRegion } from '@/config'

/**
 * Join a workspace (add user to workspace_members)
 * POST /api/workspaces/join
 * Body: { workspace_id?: string, inviteCode?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspace_id, inviteCode } = body

    const deploymentRegion = getDeploymentRegion()

    // 如果提供了邀请码，先通过邀请码获取工作区ID
    let targetWorkspaceId = workspace_id

    if (inviteCode) {
      // 验证邀请码
      const normalizedCode = inviteCode.toUpperCase().trim()

      // 国内版：从CloudBase数据库查询工作区
      if (deploymentRegion === 'CN') {
        const workspace = await getWorkspaceByInviteCode(normalizedCode)
        if (!workspace) {
          return NextResponse.json(
            { error: 'Invalid invite code' },
            { status: 400 }
          )
        }
        targetWorkspaceId = workspace._id || workspace.id
      } else {
        // 国际版：从数据库查询工作区
        const supabase = await createClient()
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id')
          .eq('invite_code', normalizedCode)
          .limit(1)

        if (!workspaces || workspaces.length === 0) {
          return NextResponse.json(
            { error: 'Invalid invite code' },
            { status: 400 }
          )
        }
        targetWorkspaceId = workspaces[0].id
      }
    }

    if (!targetWorkspaceId) {
      return NextResponse.json(
        { error: 'workspace_id or inviteCode is required' },
        { status: 400 }
      )
    }

    // 国内版：CloudBase
    if (deploymentRegion === 'CN') {
      return await handleCloudBaseJoin(request, targetWorkspaceId)
    }

    // 国际版：Supabase
    return await handleSupabaseJoin(request, targetWorkspaceId)
  } catch (error: any) {
    console.error('Join workspace error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to join workspace' },
      { status: 500 }
    )
  }
}

/**
 * 处理 CloudBase (国内版) 加入工作区
 */
async function handleCloudBaseJoin(request: NextRequest, workspaceId: string) {
  try {
    const db = getCloudBaseDb()
    if (!db) {
      return NextResponse.json(
        { error: 'CloudBase not configured' },
        { status: 500 }
      )
    }

    // 从 session 获取当前用户
    // CloudBase 使用自定义 session，这里简化处理
    // 实际应该从 cookie 或 header 获取用户信息

    // 这里简化处理：假设用户已登录，直接返回成功
    // 实际应该检查用户是否已是成员

    // 检查用户是否已是成员
    const { getCloudBaseUser } = await import('@/lib/cloudbase/auth')
    const currentUser = await getCloudBaseUser(request)

    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 检查是否已是成员
    const existingMember = await db.collection('workspace_members')
      .where({
        workspace_id: workspaceId,
        user_id: currentUser.id
      })
      .get()

    if (existingMember.data && existingMember.data.length > 0) {
      return NextResponse.json({
        success: true,
        message: 'User is already a member of this workspace'
      })
    }

    // 添加用户到工作区
    await db.collection('workspace_members').add({
      workspace_id: workspaceId,
      user_id: currentUser.id,
      role: 'member',
      joined_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      message: 'Successfully joined workspace'
    })
  } catch (error: any) {
    console.error('CloudBase join workspace error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to join workspace' },
      { status: 500 }
    )
  }
}

/**
 * 处理 Supabase (国际版) 加入工作区
 */
async function handleSupabaseJoin(request: NextRequest, workspaceId: string) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user is already a member
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', currentUser.id)
      .maybeSingle()

    if (existingMember) {
      return NextResponse.json({
        success: true,
        message: 'User is already a member of this workspace'
      })
    }

    // Verify workspace exists
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, owner_id')
      .eq('id', workspaceId)
      .maybeSingle()

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    // Add user to workspace_members
    const role = workspace.owner_id === currentUser.id ? 'owner' : 'member'

    const { error: insertError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspaceId,
        user_id: currentUser.id,
        role,
      })

    if (insertError) {
      console.error('Join workspace error:', insertError)
      return NextResponse.json(
        { error: insertError.message || 'Failed to join workspace' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully joined workspace'
    })
  } catch (error: any) {
    console.error('Supabase join workspace error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to join workspace' },
      { status: 500 }
    )
  }
}
