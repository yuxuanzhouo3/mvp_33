import { NextRequest, NextResponse } from 'next/server'
import { sendSystemAssistantMessage } from '@/lib/system-assistant'

/**
 * 测试端点：手动触发系统助手消息
 * 仅用于开发测试
 *
 * POST /api/test-system-message
 * Body: { userId, workspaceId, workspaceName, type }
 */
export async function POST(request: NextRequest) {
  // 仅在开发环境允许
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { userId, workspaceId, workspaceName, type } = body

    if (!userId || !workspaceId) {
      return NextResponse.json({ error: 'userId and workspaceId are required' }, { status: 400 })
    }

    console.log('[TestSystemMessage] Sending system message to:', userId)

    await sendSystemAssistantMessage(
      userId,
      `您申请加入工作区「${workspaceName || 'Test Workspace'}」的请求已发送，请等待管理员审核。`,
      {
        type: type || 'join_request',
        workspace_id: workspaceId,
        workspace_name: workspaceName || 'Test Workspace',
      },
      false // isCN = false (使用 Supabase)
    )

    console.log('[TestSystemMessage] System message sent successfully')

    return NextResponse.json({
      success: true,
      message: 'System message sent',
      target: { userId, workspaceId }
    })
  } catch (error: any) {
    console.error('[TestSystemMessage] Error:', error)
    return NextResponse.json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}
