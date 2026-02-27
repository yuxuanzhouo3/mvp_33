import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseClient } from '@/lib/database-router'

/**
 * 工作区加入申请 API
 * GET: 获取加入申请列表 (默认仅待审批，可选携带历史)
 * POST: 创建申请 (邀请码流程)
 */

// 获取待审批申请列表
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const workspaceId = searchParams.get('workspaceId')
    const includeHistory = searchParams.get('includeHistory') === 'true'

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

      // 获取申请（默认仅 pending，可选包含历史）
      try {
        const whereQuery: any = {
          workspace_id: workspaceId,
        }
        if (!includeHistory) {
          whereQuery.status = 'pending'
        }

        const requestsResult = await db
          .collection('workspace_join_requests')
          .where(whereQuery)
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
          const user: any = usersMap.get(r.user_id) || {}
          const status = (r.status || 'pending') as 'pending' | 'approved' | 'rejected'
          const displayTimeSource = status === 'pending' ? r.created_at : (r.reviewed_at || r.created_at)
          return {
            id: r._id,
            user_id: r.user_id,
            name: user.full_name || user.username || 'Unknown',
            email: user.email || '',
            reason: r.reason || '',
            status,
            created_at: r.created_at,
            reviewed_at: r.reviewed_at || null,
            time: formatTimeAgo(displayTimeSource),
            avatarColor: getAvatarColor(user.full_name || user.username || 'U'),
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

    // 获取申请（默认仅 pending，可选包含历史）
    let query = supabase
      .from('workspace_join_requests')
      .select(`
        id,
        status,
        reason,
        created_at,
        reviewed_at,
        user_id,
        users!workspace_join_requests_user_id_fkey (
          id,
          email,
          full_name,
          username
        )
      `)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })

    if (!includeHistory) {
      query = query.eq('status', 'pending')
    }

    const { data: requests, error } = await query

    if (error) {
      console.error('Error fetching join requests:', error)
      return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 })
    }

    const formattedRequests = (requests || []).map((r: any) => {
      const status = (r.status || 'pending') as 'pending' | 'approved' | 'rejected'
      const displayTimeSource = status === 'pending' ? r.created_at : (r.reviewed_at || r.created_at)
      return {
        id: r.id,
        user_id: r.user_id,
        name: r.users?.full_name || r.users?.username || 'Unknown',
        email: r.users?.email || '',
        reason: r.reason || '',
        status,
        created_at: r.created_at,
        reviewed_at: r.reviewed_at || null,
        time: formatTimeAgo(displayTimeSource),
        avatarColor: getAvatarColor(r.users?.full_name || r.users?.username || 'U')
      }
    })

    return NextResponse.json({ success: true, requests: formattedRequests })
  } catch (error: any) {
    console.error('Get join requests error:', error)
    return NextResponse.json({ error: error.message || 'Failed to get requests' }, { status: 500 })
  }
}

// 创建申请 (邀请码流程)
// 需要用户已登录，使用登录用户的 ID 作为申请人
export async function POST(request: NextRequest) {
  console.log('[JoinRequest] ========== 收到加入申请请求 ==========')
  console.log('[JoinRequest] 请求方法:', request.method)
  console.log('[JoinRequest] 请求URL:', request.url)
  console.log('[JoinRequest] 请求头:', JSON.stringify(Object.fromEntries(request.headers.entries()), null, 2))

  try {
    const body = await request.json()
    const { workspaceId, reason } = body

    console.log('[JoinRequest] 请求体:', JSON.stringify({ workspaceId, reason }))
    console.log('[JoinRequest] workspaceId 类型:', typeof workspaceId)
    console.log('[JoinRequest] workspaceId 值:', JSON.stringify(workspaceId))

    if (!workspaceId) {
      console.log('[JoinRequest] 错误: workspaceId 为空')
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    const dbClient = await getDatabaseClient()
    console.log('[JoinRequest] 数据库客户端类型:', dbClient.type)

    const now = new Date().toISOString()

    // CN version: use CloudBase
    if (dbClient.type === 'cloudbase') {
      console.log('[JoinRequest] 使用 CloudBase 数据库')
      // 认证检查
      const userId = request.headers.get('x-user-id')
      console.log('[JoinRequest] x-user-id header:', userId)

      if (!userId) {
        console.log('[JoinRequest] 错误: 未授权 - 缺少 x-user-id')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { getCloudBaseDb } = await import('@/lib/cloudbase/client')
      const db = getCloudBaseDb()
      if (!db) {
        console.log('[JoinRequest] 错误: 数据库不可用')
        return NextResponse.json({ error: 'Database not available' }, { status: 500 })
      }

      console.log('[JoinRequest] 检查是否已是成员...')
      // 检查是否已经是成员
      const existingMember = await db
        .collection('workspace_members')
        .where({ workspace_id: workspaceId, user_id: userId })
        .get()

      console.log('[JoinRequest] 成员检查结果:', JSON.stringify(existingMember))

      if (existingMember.data && existingMember.data.length > 0) {
        console.log('[JoinRequest] 用户已是成员')
        return NextResponse.json({ error: 'Already a member of this workspace' }, { status: 400 })
      }

      // 检查是否已有待审批申请
      console.log('[JoinRequest] 检查是否已有待审批申请...')
      try {
        const existingRequest = await db
          .collection('workspace_join_requests')
          .where({
            workspace_id: workspaceId,
            user_id: userId,
            status: 'pending'
          })
          .get()

        console.log('[JoinRequest] 待审批申请检查结果:', JSON.stringify(existingRequest))

        if (existingRequest.data && existingRequest.data.length > 0) {
          console.log('[JoinRequest] 已有待审批申请')
          return NextResponse.json({ error: 'You already have a pending request' }, { status: 400 })
        }
      } catch (error: any) {
        console.log('[JoinRequest] 检查待审批申请出错:', error.code, error.message)
        // 集合不存在，继续创建申请
        if (error.code !== 'DATABASE_COLLECTION_NOT_EXIST') {
          throw error
        }
        console.log('[JoinRequest] 集合不存在，继续创建申请')
      }

      // 获取工作区信息用于通知
      console.log('[JoinRequest] 获取工作区信息...')
      const workspaceRes = await db.collection('workspaces').doc(workspaceId).get()
      const workspace = workspaceRes.data || workspaceRes
      const workspaceName = workspace?.name || 'Unknown Workspace'
      console.log('[JoinRequest] 工作区信息:', JSON.stringify(workspace))

      // 创建申请
      console.log('[JoinRequest] 创建申请记录...')
      const requestRecord = {
        workspace_id: workspaceId,
        user_id: userId,
        reason: reason || null,
        status: 'pending',
        created_at: now
      }
      console.log('[JoinRequest] 申请记录内容:', JSON.stringify(requestRecord))

      const requestResult = await db.collection('workspace_join_requests').add(requestRecord)
      const requestId = requestResult.id || requestResult._id
      console.log('[JoinRequest] 申请创建成功, ID:', requestId)

      // 发送系统助手消息 - 通知用户申请已提交
      try {
        console.log('[JoinRequest] 发送系统助手消息...')
        const { sendSystemAssistantMessage } = await import('@/lib/system-assistant')
        await sendSystemAssistantMessage(
          userId,
          `您申请加入工作区「${workspaceName}」的请求已发送，请等待管理员审核。`,
          {
            type: 'join_request',
            workspace_id: workspaceId,
            workspace_name: workspaceName,
            request_id: requestId,
          },
          true // isCN
        )
        console.log('[JoinRequest] 系统助手消息发送成功')
      } catch (msgError: any) {
        console.error('[JoinRequest] 发送系统助手消息失败:', msgError)
        // 不阻断主流程
      }

      console.log('[JoinRequest] ========== 申请流程完成 ==========')
      return NextResponse.json({ success: true, message: 'Join request submitted' })
    }

    // INTL version: use Supabase
    console.log('[JoinRequest] 使用 Supabase 数据库')
    const supabase = dbClient.supabase!

    // 认证检查
    console.log('[JoinRequest] 获取当前用户...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('[JoinRequest] 用户信息:', user ? { id: user.id, email: user.email } : null)
    console.log('[JoinRequest] 认证错误:', authError)

    if (!user) {
      console.log('[JoinRequest] 错误: 未授权 - 无用户')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 使用已登录用户的 ID
    const userId = user.id
    console.log('[JoinRequest] 当前用户ID:', userId)

    // 检查是否已经是成员
    console.log('[JoinRequest] 检查是否已是成员...')
    const { data: existingMember, error: memberError } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .single()

    console.log('[JoinRequest] 成员检查结果:', JSON.stringify(existingMember))
    console.log('[JoinRequest] 成员检查错误:', JSON.stringify(memberError))

    if (existingMember) {
      console.log('[JoinRequest] 用户已是成员')
      return NextResponse.json({ error: 'Already a member of this workspace' }, { status: 400 })
    }

    // 检查是否已有待审批申请
    console.log('[JoinRequest] 检查是否已有待审批申请...')
    const { data: existingRequest, error: requestCheckError } = await supabase
      .from('workspace_join_requests')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single()

    console.log('[JoinRequest] 待审批申请检查结果:', JSON.stringify(existingRequest))
    console.log('[JoinRequest] 待审批申请检查错误:', JSON.stringify(requestCheckError))

    if (existingRequest) {
      console.log('[JoinRequest] 已有待审批申请')
      return NextResponse.json({ error: 'You already have a pending request' }, { status: 400 })
    }

    // 创建申请
    console.log('[JoinRequest] 创建申请记录...')
    const insertData = {
      workspace_id: workspaceId,
      user_id: userId,
      reason: reason || null,
      status: 'pending'
    }
    console.log('[JoinRequest] 插入数据:', JSON.stringify(insertData))

    const { data: requestData, error: insertError } = await supabase
      .from('workspace_join_requests')
      .insert(insertData)
      .select('id')
      .single()

    console.log('[JoinRequest] 插入结果:', JSON.stringify(requestData))
    console.log('[JoinRequest] 插入错误:', JSON.stringify(insertError))

    if (insertError || !requestData) {
      console.error('[JoinRequest] 创建申请失败:', insertError)
      return NextResponse.json({
        error: 'Failed to create request',
        details: insertError?.message,
        code: insertError?.code
      }, { status: 500 })
    }

    // 获取工作区信息用于通知
    console.log('[JoinRequest] 获取工作区信息...')
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single()

    console.log('[JoinRequest] 工作区信息:', JSON.stringify(workspace))
    console.log('[JoinRequest] 工作区查询错误:', JSON.stringify(workspaceError))

    const workspaceName = workspace?.name || 'Unknown Workspace'

    // 发送系统助手消息 - 通知用户申请已提交
    try {
      console.log('[JoinRequest] 发送系统助手消息...')
      const { sendSystemAssistantMessage } = await import('@/lib/system-assistant')
      await sendSystemAssistantMessage(
        userId,
        `您申请加入工作区「${workspaceName}」的请求已发送，请等待管理员审核。`,
        {
          type: 'join_request',
          workspace_id: workspaceId,
          workspace_name: workspaceName,
          request_id: requestData.id,
        },
        false // isCN
      )
      console.log('[JoinRequest] 系统助手消息发送成功')
    } catch (msgError: any) {
      console.error('[JoinRequest] 发送系统助手消息失败:', msgError)
      // 不阻断主流程
    }

    console.log('[JoinRequest] ========== 申请流程完成 ==========')
    return NextResponse.json({ success: true, message: 'Join request submitted' })
  } catch (error: any) {
    console.error('[JoinRequest] ========== 申请流程异常 ==========')
    console.error('[JoinRequest] 错误类型:', error.constructor.name)
    console.error('[JoinRequest] 错误消息:', error.message)
    console.error('[JoinRequest] 错误堆栈:', error.stack)
    return NextResponse.json({
      error: error.message || 'Failed to create request',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
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
