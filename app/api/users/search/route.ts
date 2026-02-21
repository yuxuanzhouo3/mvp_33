import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'

/**
 * Search users by username or email
 * GET /api/users/search?q=search_query
 *
 * SLACK MODE: 只返回同 Workspace 的成员
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')?.trim()

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Search query must be at least 2 characters' },
        { status: 400 }
      )
    }

    // Use database router to检测当前用户区域
    const dbClient = await getDatabaseClientForUser(request)
    const currentRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    // ✅ CloudBase（国内）用户：完全走 CloudBase.users，和 Supabase 好友系统隔离
    if (dbClient.type === 'cloudbase' && dbClient.cloudbase && currentRegion === 'cn') {
      const db = dbClient.cloudbase

      try {
        // SLACK MODE: 获取当前用户的 Workspace 成员关系
        // 使用默认 workspace（techcorp）
        const DEFAULT_WORKSPACE_ID = 'techcorp'

        // 获取当前用户 ID（从认证信息中获取）
        const authHeader = request.headers.get('x-user-id')
        const currentUserId = authHeader

        if (currentUserId) {
          // 检查当前用户是否在默认 workspace 中
          const currentMemberResult = await db
            .collection('workspace_members')
            .where({ user_id: currentUserId, workspace_id: DEFAULT_WORKSPACE_ID })
            .limit(1)
            .get()

          if (!currentMemberResult.data || currentMemberResult.data.length === 0) {
            console.log('[CN Search] Current user not in default workspace, returning empty results')
            return NextResponse.json({
              success: true,
              users: [],
            })
          }

          // 获取同一 workspace 的所有成员 ID
          const workspaceMembersResult = await db
            .collection('workspace_members')
            .where({ workspace_id: DEFAULT_WORKSPACE_ID })
            .get()

          const workspaceMemberIds = new Set(
            workspaceMembersResult.data?.map((m: any) => m.user_id) || []
          )

          console.log('[CN Search] Workspace members count:', workspaceMemberIds.size)

          // CloudBase 正确的模糊匹配语法：使用 db.RegExp，而不是 command.regex
          const cmd = db.command
          const reg = db.RegExp({
            regexp: query,
            options: 'i',
          })

          const result = await db
            .collection('users')
            .where(
              cmd.and([
                // 只查国内用户
                { region: 'cn' },
                cmd.or([
                  { email: reg },
                  { username: reg },
                  { full_name: reg },
                  { name: reg },
                ]),
              ])
            )
            .limit(50) // 获取更多结果，然后过滤
            .get()

          const rawUsers = result?.data || []

          // 过滤：只返回同一 workspace 的成员
          const users = rawUsers
            .filter((user: any) => {
              const userId = user.id || user._id
              return workspaceMemberIds.has(userId) && userId !== currentUserId
            })
            .slice(0, 20) // 限制返回数量
            .map((user: any) => ({
              // 这里优先返回 CloudBase 里保存的 Supabase Auth ID（id 字段），保证和 CloudBase 好友系统兼容
              id: user.id || user._id,
              email: user.email,
              username: user.username || user.email?.split('@')[0] || '',
              full_name: user.full_name || user.name || '',
              avatar_url: user.avatar_url || null,
              department: user.department || undefined,
              title: user.title || undefined,
              status: user.status || 'offline',
              region: user.region || 'cn',
            }))

          console.log('[CN Search] Filtered users count:', users.length)

          return NextResponse.json({
            success: true,
            users,
          })
        }

        // 如果没有当前用户信息，执行原有逻辑（向后兼容）
        const cmd = db.command
        const reg = db.RegExp({
          regexp: query,
          options: 'i',
        })

        const result = await db
          .collection('users')
          .where(
            cmd.and([
              // 只查国内用户
              { region: 'cn' },
              cmd.or([
                { email: reg },
                { username: reg },
                { full_name: reg },
                { name: reg },
              ]),
            ])
          )
          .limit(20)
          .get()

        const rawUsers = result?.data || []

        const users = rawUsers.map((user: any) => ({
          id: user.id || user._id,
          email: user.email,
          username: user.username || user.email?.split('@')[0] || '',
          full_name: user.full_name || user.name || '',
          avatar_url: user.avatar_url || null,
          department: user.department || undefined,
          title: user.title || undefined,
          status: user.status || 'offline',
          region: user.region || 'cn',
        }))

        return NextResponse.json({
          success: true,
          users,
        })
      } catch (error: any) {
        console.error('Search users error (cloudbase):', error)
        return NextResponse.json(
          { error: 'Failed to search users', details: error.message || 'CloudBase query error' },
          { status: 500 }
        )
      }
    }

    // 🌍 Supabase（全球）用户：只搜索 global region 的用户，确保和 CloudBase 隔离
    const supabase = await createClient()

    // Get current user for self-exclusion
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    if (authError) {
      console.error('Auth error in search API (supabase):', authError)
    }
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized', details: authError?.message || 'No user found' },
        { status: 401 }
      )
    }

    // SLACK MODE: 获取当前用户的 Workspace 列表
    const { data: userWorkspaces } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', currentUser.id)

    if (!userWorkspaces || userWorkspaces.length === 0) {
      console.log('[INTL Search] User has no workspace, returning empty results')
      return NextResponse.json({
        success: true,
        users: [],
      })
    }

    const workspaceIds = userWorkspaces.map((w) => w.workspace_id)
    console.log('[INTL Search] User workspaces:', workspaceIds)

    // 获取同一 workspace 的所有成员 ID
    const { data: workspaceMembers } = await supabase
      .from('workspace_members')
      .select('user_id')
      .in('workspace_id', workspaceIds)

    const workspaceMemberIds = new Set(
      (workspaceMembers || []).map((m) => m.user_id).filter((id) => id !== currentUser.id)
    )

    console.log('[INTL Search] Workspace members count:', workspaceMemberIds.size)

    // CRITICAL: Supabase users should only search for global region users
    // Force region to 'global' to ensure isolation from CloudBase users
    const searchRegion = 'global'
    console.log('🔍 Supabase user search - forcing region to global for isolation')

    const searchPattern = `%${query}%`
    let users: any[] = []
    let error: any = null

    const { data: orUsers, error: orError } = await supabase
      .from('users')
      .select('id, email, username, full_name, avatar_url, department, title, status, region')
      .or(`username.ilike.${searchPattern},email.ilike.${searchPattern},full_name.ilike.${searchPattern}`)
      .neq('id', currentUser.id)
      .eq('region', searchRegion) // Force to 'global' only
      .limit(50) // 获取更多结果，然后过滤

    if (orError) {
      console.error('Search users .or() error (supabase):', orError)
      const [usernameResult, emailResult, fullNameResult] = await Promise.all([
        supabase
          .from('users')
          .select('id, email, username, full_name, avatar_url, department, title, status, region')
          .ilike('username', searchPattern)
          .neq('id', currentUser.id)
          .eq('region', searchRegion) // Force to 'global' only
          .limit(50),
        supabase
          .from('users')
          .select('id, email, username, full_name, avatar_url, department, title, status, region')
          .ilike('email', searchPattern)
          .neq('id', currentUser.id)
          .eq('region', searchRegion) // Force to 'global' only
          .limit(50),
        supabase
          .from('users')
          .select('id, email, username, full_name, avatar_url, department, title, status, region')
          .ilike('full_name', searchPattern)
          .neq('id', currentUser.id)
          .eq('region', searchRegion) // Force to 'global' only
          .limit(50),
      ])

      const allResults = [
        ...(usernameResult.data || []),
        ...(emailResult.data || []),
        ...(fullNameResult.data || []),
      ]

      const uniqueUsers = Array.from(
        new Map(allResults.map(user => [user.id, user])).values()
      )

      users = uniqueUsers
      error = usernameResult.error || emailResult.error || fullNameResult.error
    } else {
      users = orUsers || []
      error = orError
    }

    if (error) {
      console.error('Search users error (supabase unified):', error)
      return NextResponse.json(
        { error: 'Failed to search users', details: error.message },
        { status: 500 }
      )
    }

    // Double-check: filter to ensure only global region users (extra safety)
    // AND filter to ensure only same workspace members
    const regionAndWorkspaceFilteredUsers = (users || []).filter(user => {
      const region = (user as any)?.region || 'global'
      const isCorrectRegion = region === searchRegion
      const isSameWorkspace = workspaceMemberIds.has(user.id)
      return isCorrectRegion && isSameWorkspace
    }).slice(0, 20) // 限制返回数量

    console.log('🔍 Supabase search results:', {
      totalFound: users.length,
      afterRegionFilter: (users || []).filter(u => (u as any)?.region === searchRegion).length,
      afterWorkspaceFilter: regionAndWorkspaceFilteredUsers.length,
      searchRegion: searchRegion
    })

    return NextResponse.json({
      success: true,
      users: regionAndWorkspaceFilteredUsers,
    })

    // 下面的 CloudBase 专用搜索逻辑暂时不再使用，避免返回 CloudBase 自己的 _id 导致联系人系统 ID 不一致。
    // 如果未来需要完全独立的一套 CloudBase 好友系统，可以再单独拆分 API 路由。

    /* // Supabase (global) user search - existing behavior, but scoped by region
    if (dbClient.type === 'supabase' && dbClient.supabase) {
      const supabase = dbClient.supabase

      // Get current user for self-exclusion
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
      if (authError) {
        console.error('Auth error in search API (supabase):', authError)
      }
      if (!currentUser) {
        return NextResponse.json(
          { error: 'Unauthorized', details: authError?.message || 'No user found' },
          { status: 401 }
        )
      }

      const searchPattern = `%${query}%`
      let users: any[] = []
      let error: any = null

      const { data: orUsers, error: orError } = await supabase
        .from('users')
        .select('id, email, username, full_name, avatar_url, department, title, status, region')
        .or(`username.ilike.${searchPattern},email.ilike.${searchPattern},full_name.ilike.${searchPattern}`)
        .neq('id', currentUser.id)
        .eq('region', currentRegion)
        .limit(20)

      if (orError) {
        console.error('Search users .or() error (supabase):', orError)
        const [usernameResult, emailResult, fullNameResult] = await Promise.all([
          supabase
            .from('users')
            .select('id, email, username, full_name, avatar_url, department, title, status, region')
            .ilike('username', searchPattern)
            .neq('id', currentUser.id)
            .eq('region', currentRegion)
            .limit(20),
          supabase
            .from('users')
            .select('id, email, username, full_name, avatar_url, department, title, status, region')
            .ilike('email', searchPattern)
            .neq('id', currentUser.id)
            .eq('region', currentRegion)
            .limit(20),
          supabase
            .from('users')
            .select('id, email, username, full_name, avatar_url, department, title, status, region')
            .ilike('full_name', searchPattern)
            .neq('id', currentUser.id)
            .eq('region', currentRegion)
            .limit(20),
        ])

        const allResults = [
          ...(usernameResult.data || []),
          ...(emailResult.data || []),
          ...(fullNameResult.data || []),
        ]

        const uniqueUsers = Array.from(
          new Map(allResults.map(user => [user.id, user])).values()
        )

        users = uniqueUsers.slice(0, 20)
        error = usernameResult.error || emailResult.error || fullNameResult.error
      } else {
        users = orUsers || []
        error = orError
      }

      if (error) {
        console.error('Search users error (supabase):', error)
        return NextResponse.json(
          { error: 'Failed to search users', details: error.message },
          { status: 500 }
        )
      }

      const regionFilteredUsers = (users || []).filter(user => {
        const region = (user as any)?.region || 'global'
        return region === currentRegion
      })

      return NextResponse.json({
        success: true,
        users: regionFilteredUsers,
      })
    }

    // CloudBase (China) user search - only China users, never Supabase
    if (dbClient.type === 'cloudbase' && dbClient.cloudbase) {
      const db = dbClient.cloudbase

      try {
        // CloudBase 正确的模糊匹配语法：使用 db.RegExp，而不是 command.regex
        const cmd = db.command
        const reg = db.RegExp({
          regexp: query,
          options: 'i',
        })

        const result = await db
          .collection('users')
          .where(
            cmd.and([
              { region: 'cn' },
              cmd.or([
                { email: reg },
                { username: reg },
                { full_name: reg },
                { name: reg },
              ]),
            ])
          )
          .limit(20)
          .get()

        const rawUsers = result?.data || []

        const users = rawUsers.map((user: any) => ({
          id: user.id || user._id,
          email: user.email,
          username: user.username || user.email?.split('@')[0] || '',
          full_name: user.full_name || user.name || '',
          avatar_url: user.avatar_url || null,
          department: user.department || undefined,
          title: user.title || undefined,
          status: user.status || 'offline',
          region: user.region || 'cn',
        }))

        return NextResponse.json({
          success: true,
          users,
        })
      } catch (error: any) {
        console.error('Search users error (cloudbase):', error)
        return NextResponse.json(
          { error: 'Failed to search users', details: error.message || 'CloudBase query error' },
          { status: 500 }
        )
      }
    }
    */
  } catch (error: any) {
    console.error('Search users error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to search users' },
      { status: 500 }
    )
  }
}

