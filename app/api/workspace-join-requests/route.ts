import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseClient } from '@/lib/database-router'

/**
 * 工作区加入申请 API
 * GET: 获取待审批列表 (需要 owner/admin 权限)
 * POST: 创建申请 (邀请码流程)
 */

// 获取待审批申请列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    const dbClient = await getDatabaseClient()

    // CN version: use CloudBase
    if (dbClient.type === 'cloudbase') {
      const userId = request.headers.get('x-user-id')
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // 检查是否为工作区管理员
      const { getCloudBaseDb } = await import('@/lib/cloudbase/client')
      const db = getCloudBaseDb()
      if (!db) {
        return NextResponse.json({ error: 'Database not available' }, { status: 500 })
      }

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

      // 获取待审批申请
      try {
        const requestsResult = await db
          .collection('workspace_join_requests')
          .where({
            workspace_id: workspaceId,
            status: 'pending'
          })
          .orderBy('created_at', 'desc')
          .get()

        // 获取申请人信息
        const requests = requestsResult.data || []
        if (requests.length === 0) {
          return NextResponse.json({ success: true, requests: [] })
        }

        const userIds = requests.map((r: any) => r.user_id)
        const usersResult = await db
          .collection('users')
          .where({ _id: db.command.in(userIds) })
          .get()

        const usersMap = new Map(
          (usersResult.data || []).map((u: any) => [u._id, u])
        )

        const formattedRequests = requests.map((r: any) => {
          const user = usersMap.get(r.user_id) || {}
          return {
            id: r._id,
            user_id: r.user_id,
            name: user.full_name || user.username || 'Unknown',
            email: user.email || '',
            reason: r.reason || '',
            time: formatTimeAgo(r.created_at),
            avatarColor: getAvatarColor(user.full_name || user.username || 'U')
          }
        })

        return NextResponse.json({ success: true, requests: formattedRequests })
      } catch (error: any) {
        // 集合不存在时返回空列表
        if (error.code === 'DATABASE_COLLECTION_NOT_EXIST') {
          return NextResponse.json({ success: true, requests: [] })
        }
        throw error
      }
    }

    // INTL version: use Supabase
    const supabase = dbClient.supabase!
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 检查是否为工作区管理员
    const { data: memberCheck } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()

    if (!memberCheck || !['owner', 'admin'].includes(memberCheck.role)) {
      return NextResponse.json({ error: 'Permission denied. Admin role required.' }, { status: 403 })
    }

    // 获取待审批申请
    const { data: requests, error } = await supabase
      .from('workspace_join_requests')
      .select(`
        id,
        reason,
        created_at,
        user_id,
        users!workspace_join_requests_user_id_fkey (
          id,
          email,
          full_name,
          username
        )
      `)
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching join requests:', error)
      return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 })
    }

    const formattedRequests = (requests || []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      name: r.users?.full_name || r.users?.username || 'Unknown',
      email: r.users?.email || '',
      reason: r.reason || '',
      time: formatTimeAgo(r.created_at),
      avatarColor: getAvatarColor(r.users?.full_name || r.users?.username || 'U')
    }))

    return NextResponse.json({ success: true, requests: formattedRequests })
  } catch (error: any) {
    console.error('Get join requests error:', error)
    return NextResponse.json({ error: error.message || 'Failed to get requests' }, { status: 500 })
  }
}

// 创建申请 (邀请码流程)
// 需要用户已登录，使用登录用户的 ID 作为申请人
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspaceId, reason } = body

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    const dbClient = await getDatabaseClient()

    // CN version: use CloudBase
    if (dbClient.type === 'cloudbase') {
      // 认证检查
      const userId = request.headers.get('x-user-id')
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { getCloudBaseDb } = await import('@/lib/cloudbase/client')
      const db = getCloudBaseDb()
      if (!db) {
        return NextResponse.json({ error: 'Database not available' }, { status: 500 })
      }

      // 检查是否已经是成员
      const existingMember = await db
        .collection('workspace_members')
        .where({ workspace_id: workspaceId, user_id: userId })
        .get()

      if (existingMember.data && existingMember.data.length > 0) {
        return NextResponse.json({ error: 'Already a member of this workspace' }, { status: 400 })
      }

      // 检查是否已有待审批申请
      try {
        const existingRequest = await db
          .collection('workspace_join_requests')
          .where({
            workspace_id: workspaceId,
            user_id: userId,
            status: 'pending'
          })
          .get()

        if (existingRequest.data && existingRequest.data.length > 0) {
          return NextResponse.json({ error: 'You already have a pending request' }, { status: 400 })
        }
      } catch (error: any) {
        // 集合不存在，继续创建申请
        if (error.code !== 'DATABASE_COLLECTION_NOT_EXIST') {
          throw error
        }
      }

      // 创建申请
      const now = new Date().toISOString()
      await db.collection('workspace_join_requests').add({
        workspace_id: workspaceId,
        user_id: userId,
        reason: reason || null,
        status: 'pending',
        created_at: now
      })

      return NextResponse.json({ success: true, message: 'Join request submitted' })
    }

    // INTL version: use Supabase
    const supabase = dbClient.supabase!

    // 认证检查
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 使用已登录用户的 ID
    const userId = user.id

    // 检查是否已经是成员
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single()

    if (existingMember) {
      return NextResponse.json({ error: 'Already a member of this workspace' }, { status: 400 })
    }

    // 检查是否已有待审批申请
    const { data: existingRequest } = await supabase
      .from('workspace_join_requests')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single()

    if (existingRequest) {
      return NextResponse.json({ error: 'You already have a pending request' }, { status: 400 })
    }

    // 创建申请
    const { error } = await supabase
      .from('workspace_join_requests')
      .insert({
        workspace_id: workspaceId,
        user_id: userId,
        reason: reason || null,
        status: 'pending'
      })

    if (error) {
      console.error('Error creating join request:', error)
      return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Join request submitted' })
  } catch (error: any) {
    console.error('Create join request error:', error)
    return NextResponse.json({ error: error.message || 'Failed to create request' }, { status: 500 })
  }
}

// 辅助函数：格式化时间为"多久前"
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return '刚刚'
  if (diffMins < 60) return `${diffMins}分钟前`
  if (diffHours < 24) return `${diffHours}小时前`
  if (diffDays < 30) return `${diffDays}天前`
  return date.toLocaleDateString('zh-CN')
}

// 辅助函数：获取头像颜色
function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
    'bg-pink-500', 'bg-cyan-500', 'bg-red-500', 'bg-indigo-500'
  ]
  const index = name.charCodeAt(0) % colors.length
  return colors[index]
}
