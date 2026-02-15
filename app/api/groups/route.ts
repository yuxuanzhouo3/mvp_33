import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createGroup as createGroupSupabase } from '@/lib/database/supabase/groups'
import { createGroup as createGroupCloudbase } from '@/lib/database/cloudbase/groups'

const isCloudBase = process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE === 'zh' && !process.env.FORCE_GLOBAL_DATABASE

export async function POST(request: NextRequest) {
  try {
    console.log('[API /api/groups POST] 开始处理创建群聊请求')

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      console.error('[API /api/groups POST] 未授权 - 用户未登录')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[API /api/groups POST] 当前用户', { userId: user.id, email: user.email })

    const { userIds, workspaceId } = await request.json()
    console.log('[API /api/groups POST] 请求参数', {
      userIds,
      userIdsCount: userIds?.length,
      workspaceId
    })

    // TEMP: Allow creating group with 0 or more members (creator will be added automatically)
    // if (!userIds || userIds.length < 2) {
    //   return NextResponse.json(
    //     { error: 'At least 2 members required' },
    //     { status: 400 }
    //   )
    // }

    console.error('[API /api/groups POST] 调用 createGroup 函数', {
      params: JSON.stringify({ userId: user.id, userIds, workspaceId }),
      database: isCloudBase ? 'CloudBase' : 'Supabase'
    })

    // 根据环境变量选择数据库
    const result = isCloudBase
      ? await createGroupCloudbase(user.id, userIds, workspaceId)
      : await createGroupSupabase(user.id, userIds, workspaceId)

    console.error('[API /api/groups POST] createGroup 返回', {
      hasResult: !!result,
      result: JSON.stringify(result),
      resultType: typeof result
    })

    if (!result) {
      console.error('[API /api/groups POST] createGroup 返回 null - 群聊创建失败')
      return NextResponse.json(
        { error: 'Failed to create group' },
        { status: 500 }
      )
    }

    console.error('[API /api/groups POST] 群聊创建成功', { groupId: result.groupId })
    return NextResponse.json({
      success: true,
      groupId: result.groupId
    })
  } catch (error) {
    console.error('[API /api/groups POST] 异常错误:', {
      error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      errorType: typeof error
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
