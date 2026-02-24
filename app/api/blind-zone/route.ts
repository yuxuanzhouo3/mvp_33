import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { IS_DOMESTIC_VERSION } from '@/config'

// GET /api/blind-zone?workspaceId=xxx
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
        { status: 400 }
      )
    }

    // 验证用户身份
    let userId: string | null = null

    if (IS_DOMESTIC_VERSION) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const user = await verifyCloudBaseSession(request)
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    } else {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    // 验证工作区是否存在
    let workspaceExists = false
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      const { getCloudBaseDb } = await import('@/lib/cloudbase/client')
      const db = getCloudBaseDb()
      if (db) {
        const res = await db.collection('workspaces')
          .where({ _id: workspaceId })
          .limit(1)
          .get()
        workspaceExists = (res.data?.length || 0) > 0
      }
    } else {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('id', workspaceId)
        .maybeSingle()
      workspaceExists = !!workspace
    }

    if (!workspaceExists) {
      return NextResponse.json(
        { error: 'Workspace not found. Please select a valid workspace.' },
        { status: 404 }
      )
    }

    // 验证用户是工作区成员
    let isMember = false
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      const { isWorkspaceMember } = await import('@/lib/database/cloudbase/blind-zone')
      isMember = await isWorkspaceMember(workspaceId, userId)
    } else {
      const { isWorkspaceMember } = await import('@/lib/database/supabase/blind-zone')
      isMember = await isWorkspaceMember(workspaceId, userId)
    }

    if (!isMember) {
      return NextResponse.json(
        { error: 'Not a member of this workspace' },
        { status: 403 }
      )
    }

    // 获取消息
    let messages
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      const { getBlindZoneMessages } = await import('@/lib/database/cloudbase/blind-zone')
      messages = await getBlindZoneMessages(workspaceId)
    } else {
      const { getBlindZoneMessages } = await import('@/lib/database/supabase/blind-zone')
      messages = await getBlindZoneMessages(workspaceId)
    }

    return NextResponse.json({
      success: true,
      messages: messages.reverse(), // 按时间正序返回
    })
  } catch (error) {
    console.error('Get blind zone messages error:', error)
    return NextResponse.json(
      { error: 'Failed to get messages' },
      { status: 500 }
    )
  }
}

// POST /api/blind-zone
export async function POST(request: NextRequest) {
  console.log('[盲区API] POST: 开始处理请求')

  try {
    const body = await request.json()
    const { workspaceId, content, type = 'text', metadata } = body

    console.log('[盲区API] POST: 请求参数 =', { workspaceId, content, type, metadata })

    if (!workspaceId || !content) {
      console.log('[盲区API] POST: 参数验证失败, workspaceId =', workspaceId, 'content =', content)
      return NextResponse.json(
        { error: 'workspaceId and content are required' },
        { status: 400 }
      )
    }

    // 验证用户身份
    let userId: string | null = null

    if (IS_DOMESTIC_VERSION) {
      console.log('[盲区API] POST: 国内版，验证 CloudBase session')
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const user = await verifyCloudBaseSession(request)
      console.log('[盲区API] POST: CloudBase 验证结果 =', user ? { id: user.id } : null)
      if (!user) {
        console.log('[盲区API] POST: 用户未授权 (401)')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    } else {
      console.log('[盲区API] POST: 国际版，验证 Supabase session')
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      console.log('[盲区API] POST: Supabase 验证结果 =', user ? { id: user.id } : null)
      if (!user) {
        console.log('[盲区API] POST: 用户未授权 (401)')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'
    console.log('[盲区API] POST: 数据库客户端 =', { type: dbClient.type, region: userRegion })

    // 验证工作区是否存在
    let workspaceExists = false
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      // CloudBase: 查询工作区是否存在
      const { getCloudBaseDb } = await import('@/lib/cloudbase/client')
      const db = getCloudBaseDb()
      if (db) {
        const res = await db.collection('workspaces')
          .where({ _id: workspaceId, region: 'cn' })
          .limit(1)
          .get()
        workspaceExists = (res.data?.length || 0) > 0
      }
    } else {
      // Supabase: 查询工作区是否存在
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('id', workspaceId)
        .maybeSingle()
      workspaceExists = !!workspace
    }

    if (!workspaceExists) {
      console.log('[盲区API] POST: 工作区不存在 (404), workspaceId =', workspaceId)
      return NextResponse.json(
        { error: 'Workspace not found. Please select a valid workspace.' },
        { status: 404 }
      )
    }

    // 验证用户是工作区成员
    let isMember = false
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      const { isWorkspaceMember } = await import('@/lib/database/cloudbase/blind-zone')
      isMember = await isWorkspaceMember(workspaceId, userId)
      console.log('[盲区API] POST: CloudBase 成员验证结果 =', isMember)
    } else {
      const { isWorkspaceMember } = await import('@/lib/database/supabase/blind-zone')
      isMember = await isWorkspaceMember(workspaceId, userId)
      console.log('[盲区API] POST: Supabase 成员验证结果 =', isMember)
    }

    if (!isMember) {
      console.log('[盲区API] POST: 用户不是工作区成员 (403)')
      return NextResponse.json(
        { error: 'Not a member of this workspace' },
        { status: 403 }
      )
    }

    // 创建消息
    let message
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      console.log('[盲区API] POST: 使用 CloudBase 创建消息')
      const { createBlindZoneMessage } = await import('@/lib/database/cloudbase/blind-zone')
      message = await createBlindZoneMessage(workspaceId, userId, content, type, metadata)
    } else {
      console.log('[盲区API] POST: 使用 Supabase 创建消息')
      const { createBlindZoneMessage } = await import('@/lib/database/supabase/blind-zone')
      message = await createBlindZoneMessage(workspaceId, userId, content, type, metadata)
    }

    console.log('[盲区API] POST: 消息创建结果 =', message ? { id: message.id } : null)

    if (!message) {
      console.log('[盲区API] POST: 消息创建失败 (500)')
      return NextResponse.json(
        { error: 'Failed to create message' },
        { status: 500 }
      )
    }

    // 返回时不包含 sender_id
    const responseMessage = {
      id: message.id,
      workspace_id: message.workspace_id,
      content: message.content,
      type: message.type,
      metadata: message.metadata,
      is_deleted: message.is_deleted,
      created_at: message.created_at,
      updated_at: message.updated_at,
    }
    console.log('[盲区API] POST: 成功返回消息 =', responseMessage)

    return NextResponse.json({
      success: true,
      message: responseMessage,
    })
  } catch (error) {
    console.error('[盲区API] POST: 异常错误 =', error)
    return NextResponse.json(
      { error: 'Failed to create message' },
      { status: 500 }
    )
  }
}
