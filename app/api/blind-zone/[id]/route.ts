import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { IS_DOMESTIC_VERSION } from '@/config'

// DELETE /api/blind-zone/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: messageId } = await params
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

    // 验证用户是工作区管理员
    let isAdmin = false
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      const { isWorkspaceAdmin } = await import('@/lib/database/cloudbase/blind-zone')
      isAdmin = await isWorkspaceAdmin(workspaceId, userId)
    } else {
      const { isWorkspaceAdmin } = await import('@/lib/database/supabase/blind-zone')
      isAdmin = await isWorkspaceAdmin(workspaceId, userId)
    }

    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only workspace admins can delete messages' },
        { status: 403 }
      )
    }

    // 删除消息
    let success = false
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      const { deleteBlindZoneMessage } = await import('@/lib/database/cloudbase/blind-zone')
      success = await deleteBlindZoneMessage(messageId, userId)
    } else {
      const { deleteBlindZoneMessage } = await import('@/lib/database/supabase/blind-zone')
      success = await deleteBlindZoneMessage(messageId, userId)
    }

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete message' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    console.error('Delete blind zone message error:', error)
    return NextResponse.json(
      { error: 'Failed to delete message' },
      { status: 500 }
    )
  }
}
