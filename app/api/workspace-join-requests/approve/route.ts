import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseClient } from '@/lib/database-router'

function isCollectionMissingError(error: any): boolean {
  const message = String(error?.message || '')
  const code = error?.code || error?.errCode
  return (
    code === 'DATABASE_COLLECTION_NOT_EXIST' ||
    code === 'COLLECTION_NOT_EXIST' ||
    message.includes('DATABASE_COLLECTION_NOT_EXIST') ||
    message.includes('COLLECTION_NOT_EXIST') ||
    message.includes('Db or Table not exist') ||
    message.includes('not exist')
  )
}

/**
 * 批准加入申请 API
 * POST /api/workspace-join-requests/approve
 * 需要 owner/admin 权限
 */
export async function POST(request: NextRequest) {
  console.log('[Approve API] ===== 开始处理批准请求 =====')

  try {
    const body = await request.json()
    const { requestId, workspaceId } = body

    console.log('[Approve API] 请求参数:', { requestId, workspaceId })

    if (!requestId || !workspaceId) {
      console.log('[Approve API] 错误: 缺少必要参数')
      return NextResponse.json({ success: false, error: 'requestId and workspaceId are required' }, { status: 400 })
    }

    const dbClient = await getDatabaseClient()
    const now = new Date().toISOString()

    console.log('[Approve API] 数据库类型:', dbClient.type, '区域:', dbClient.region)

    // CN version: use CloudBase
    if (dbClient.type === 'cloudbase') {
      console.log('[Approve API] 使用 CloudBase 认证')

      // 使用 verifyCloudBaseSession 从 session 获取用户身份
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const currentUser = await verifyCloudBaseSession(request)

      console.log('[Approve API] CloudBase 用户认证结果:', currentUser ? `用户ID: ${currentUser.id}` : '未认证')

      if (!currentUser) {
        console.log('[Approve API] 错误: 用户未授权 - CloudBase session 验证失败')
        return NextResponse.json({ success: false, error: 'Unauthorized - Please login again' }, { status: 401 })
      }

      const userId = currentUser.id

      const { getCloudBaseDb } = await import('@/lib/cloudbase/client')
      const db = getCloudBaseDb()
      if (!db) {
        console.log('[Approve API] 错误: 数据库不可用')
        return NextResponse.json({ success: false, error: 'Database not available' }, { status: 500 })
      }

      // 检查是否为工作区管理员
      console.log('[Approve API] 检查管理员权限, userId:', userId, 'workspaceId:', workspaceId)
      const adminCheck = await db
        .collection('workspace_members')
        .where({
          workspace_id: workspaceId,
          user_id: userId,
          role: db.command.in(['owner', 'admin'])
        })
        .get()

      console.log('[Approve API] 管理员检查结果:', adminCheck.data)

      if (!adminCheck.data || adminCheck.data.length === 0) {
        console.log('[Approve API] 错误: 权限不足，需要管理员权限')
        return NextResponse.json({ success: false, error: 'Permission denied. Admin role required.' }, { status: 403 })
      }

      // 获取申请信息
      console.log('[Approve API] 获取申请信息, requestId:', requestId)
      let requestResult: any
      try {
        requestResult = await db
          .collection('workspace_join_requests')
          .doc(requestId)
          .get()
      } catch (error: any) {
        if (isCollectionMissingError(error)) {
          return NextResponse.json(
            {
              success: false,
              error: 'workspace_join_requests collection is not initialized',
              details: 'Please run scripts/cloudbase_setup.js to create CloudBase collections.',
            },
            { status: 503 }
          )
        }
        throw error
      }

      console.log('[Approve API] 申请信息:', requestResult.data)

      if (!requestResult.data) {
        console.log('[Approve API] 错误: 申请不存在')
        return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 })
      }

      const joinRequest = requestResult.data

      if (joinRequest.status !== 'pending') {
        console.log('[Approve API] 错误: 申请已处理, 当前状态:', joinRequest.status)
        return NextResponse.json({ success: false, error: 'Request already processed' }, { status: 400 })
      }

      if (joinRequest.workspace_id !== workspaceId) {
        console.log('[Approve API] 错误: 工作区不匹配')
        return NextResponse.json({ success: false, error: 'Workspace mismatch' }, { status: 400 })
      }

      // 先确保成员写入成功，避免出现"状态已 approved 但成员未加入"的半成功状态
      console.log('[Approve API] 检查成员是否已在工作区, user_id:', joinRequest.user_id)
      const existingMember = await db
        .collection('workspace_members')
        .where({
          workspace_id: workspaceId,
          user_id: joinRequest.user_id
        })
        .field({ _id: true })
        .get()

      if (!existingMember.data || existingMember.data.length === 0) {
        console.log('[Approve API] 添加成员到工作区, user_id:', joinRequest.user_id)
        await db
          .collection('workspace_members')
          .add({
            workspace_id: workspaceId,
            user_id: joinRequest.user_id,
            role: 'member',
            joined_at: now
          })
      } else {
        console.log('[Approve API] 用户已是工作区成员，跳过添加成员')
      }

      // 成员处理成功后再更新申请状态
      console.log('[Approve API] 更新申请状态为 approved')
      try {
        await db
          .collection('workspace_join_requests')
          .doc(requestId)
          .update({
            status: 'approved',
            reviewed_by: userId,
            reviewed_at: now
          })
      } catch (error: any) {
        if (isCollectionMissingError(error)) {
          return NextResponse.json(
            {
              success: false,
              error: 'workspace_join_requests collection is not initialized',
              details: 'Please run scripts/cloudbase_setup.js to create CloudBase collections.',
            },
            { status: 503 }
          )
        }
        throw error
      }

      console.log('[Approve API] 批准操作成功完成')

      // 获取工作区信息用于通知
      const workspaceRes = await db.collection('workspaces').doc(workspaceId).get()
      const workspace = workspaceRes.data || workspaceRes
      const workspaceName = workspace?.name || 'Unknown Workspace'

      // 发送系统助手消息 - 通知用户申请已通过
      try {
        const { sendSystemAssistantMessage } = await import('@/lib/system-assistant')
        await sendSystemAssistantMessage(
          joinRequest.user_id,
          `恭喜！您申请加入工作区「${workspaceName}」的请求已通过审核，您现在可以访问该工作区了。`,
          {
            type: 'join_approved',
            workspace_id: workspaceId,
            workspace_name: workspaceName,
            request_id: requestId,
          },
          true // isCN
        )
      } catch (msgError) {
        console.error('Failed to send system assistant message:', msgError)
        // 不阻断主流程
      }

      return NextResponse.json({ success: true, message: 'Request approved' })
    }

    // INTL version: use Supabase
    console.log('[Approve API] 使用 Supabase 认证')
    const supabase = dbClient.supabase
    if (!supabase) {
      console.error('[Approve API] 错误: Supabase 客户端不可用')
      return NextResponse.json({ success: false, error: 'Database client not available' }, { status: 500 })
    }

    console.log('[Approve API] 获取当前用户...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('[Approve API] 用户认证结果:', user ? `用户ID: ${user.id}` : '未认证', '错误:', authError)

    if (authError) {
      console.error('[Approve API] 认证错误:', authError)
      return NextResponse.json({ success: false, error: 'Auth error: ' + authError.message }, { status: 401 })
    }

    if (!user) {
      console.log('[Approve API] 错误: 用户未授权')
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // 检查是否为工作区管理员
    console.log('[Approve API] 检查管理员权限, userId:', user.id, 'workspaceId:', workspaceId)
    const { data: memberCheck, error: memberError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .single()

    console.log('[Approve API] 管理员检查结果:', memberCheck, '错误:', memberError)

    if (memberError) {
      console.error('[Approve API] 查询成员角色错误:', memberError)
    }

    if (!memberCheck || !['owner', 'admin'].includes(memberCheck.role)) {
      console.log('[Approve API] 错误: 权限不足，需要管理员权限')
      return NextResponse.json({ success: false, error: 'Permission denied. Admin role required.' }, { status: 403 })
    }

    // 获取申请信息
    console.log('[Approve API] 获取申请信息, requestId:', requestId)
    const { data: joinRequest, error: fetchError } = await supabase
      .from('workspace_join_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    console.log('[Approve API] 申请信息:', joinRequest, '错误:', fetchError)

    if (fetchError || !joinRequest) {
      console.log('[Approve API] 错误: 申请不存在')
      return NextResponse.json({ success: false, error: 'Request not found' }, { status: 404 })
    }

    if (joinRequest.status !== 'pending') {
      console.log('[Approve API] 错误: 申请已处理, 当前状态:', joinRequest.status)
      return NextResponse.json({ success: false, error: 'Request already processed' }, { status: 400 })
    }

    if (joinRequest.workspace_id !== workspaceId) {
      console.log('[Approve API] 错误: 工作区不匹配')
      return NextResponse.json({ success: false, error: 'Workspace mismatch' }, { status: 400 })
    }

    // 先确保成员写入成功，避免出现"状态已 approved 但成员未加入"的半成功状态
    console.log('[Approve API] 添加成员到工作区, user_id:', joinRequest.user_id)
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const adminClient = createAdminClient()
    const { error: insertError } = await adminClient
      .from('workspace_members')
      .insert({
        workspace_id: workspaceId,
        user_id: joinRequest.user_id,
        role: 'member',
        joined_at: now
      })

    if (insertError && insertError.code !== '23505') {
      console.error('[Approve API] 添加成员错误:', insertError)
      const hint = insertError.code === '42501'
        ? ' (RLS blocked insert, please verify SUPABASE_SERVICE_ROLE_KEY is correct)'
        : ''
      return NextResponse.json({ success: false, error: 'Failed to add member: ' + insertError.message + hint }, { status: 500 })
    }

    if (insertError?.code === '23505') {
      console.log('[Approve API] 用户已是工作区成员，跳过重复插入')
    }

    // 成员处理成功后再更新申请状态
    console.log('[Approve API] 更新申请状态为 approved')
    const { data: updatedRequest, error: updateError } = await supabase
      .from('workspace_join_requests')
      .update({
        status: 'approved',
        reviewed_by: user.id,
        reviewed_at: now
      })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (updateError) {
      console.error('[Approve API] 更新申请状态错误:', updateError)
      return NextResponse.json({ success: false, error: 'Failed to update request: ' + updateError.message }, { status: 500 })
    }

    if (!updatedRequest) {
      console.log('[Approve API] 错误: 申请状态已被其他操作改变')
      return NextResponse.json({ success: false, error: 'Request already processed' }, { status: 409 })
    }

    console.log('[Approve API] 批准操作成功完成')

    // 获取工作区信息用于通知
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .single()

    const workspaceName = workspace?.name || 'Unknown Workspace'

    // 发送系统助手消息 - 通知用户申请已通过
    try {
      const { sendSystemAssistantMessage } = await import('@/lib/system-assistant')
      await sendSystemAssistantMessage(
        joinRequest.user_id,
        `恭喜！您申请加入工作区「${workspaceName}」的请求已通过审核，您现在可以访问该工作区了。`,
        {
          type: 'join_approved',
          workspace_id: workspaceId,
          workspace_name: workspaceName,
          request_id: requestId,
        },
        false // isCN
      )
    } catch (msgError) {
      console.error('Failed to send system assistant message:', msgError)
      // 不阻断主流程
    }

    return NextResponse.json({ success: true, message: 'Request approved' })
  } catch (error: any) {
    console.error('Approve request error:', error)
    return NextResponse.json({ error: error.message || 'Failed to approve request' }, { status: 500 })
  }
}
