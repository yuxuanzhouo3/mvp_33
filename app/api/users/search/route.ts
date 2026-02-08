import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'

/**
 * Search users by username or email
 * GET /api/users/search?q=search_query
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
          .limit(20)
          .get()

        const rawUsers = result?.data || []

        const users = rawUsers.map((user: any) => ({
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
      .limit(20)

    if (orError) {
      console.error('Search users .or() error (supabase):', orError)
      const [usernameResult, emailResult, fullNameResult] = await Promise.all([
        supabase
          .from('users')
          .select('id, email, username, full_name, avatar_url, department, title, status, region')
          .ilike('username', searchPattern)
          .neq('id', currentUser.id)
          .eq('region', searchRegion) // Force to 'global' only
          .limit(20),
        supabase
          .from('users')
          .select('id, email, username, full_name, avatar_url, department, title, status, region')
          .ilike('email', searchPattern)
          .neq('id', currentUser.id)
          .eq('region', searchRegion) // Force to 'global' only
          .limit(20),
        supabase
          .from('users')
          .select('id, email, username, full_name, avatar_url, department, title, status, region')
          .ilike('full_name', searchPattern)
          .neq('id', currentUser.id)
          .eq('region', searchRegion) // Force to 'global' only
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
      console.error('Search users error (supabase unified):', error)
      return NextResponse.json(
        { error: 'Failed to search users', details: error.message },
        { status: 500 }
      )
    }

    // Double-check: filter to ensure only global region users (extra safety)
    const regionFilteredUsers = (users || []).filter(user => {
      const region = (user as any)?.region || 'global'
      return region === searchRegion // Only 'global' region
    })
    
    console.log('🔍 Supabase search results:', {
      totalFound: users.length,
      afterRegionFilter: regionFilteredUsers.length,
      searchRegion: searchRegion
    })

    return NextResponse.json({
      success: true,
      users: regionFilteredUsers,
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

