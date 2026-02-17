import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    console.log('[API /nickname PUT] 开始处理请求')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    console.log('[API /nickname PUT] 用户认证', { userId: user?.id, hasUser: !!user })

    if (!user) {
      console.log('[API /nickname PUT] 未授权')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { nickname } = await request.json()
    const { conversationId } = await params

    console.log('[API /nickname PUT] 请求参数', {
      conversationId,
      userId: user.id,
      nickname,
      nicknameLength: nickname?.length
    })

    const { data, error } = await supabase
      .from('conversation_members')
      .update({ group_nickname: nickname || null })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .select()

    console.log('[API /nickname PUT] 数据库更新结果', {
      hasError: !!error,
      error: error?.message,
      errorDetails: error?.details,
      errorHint: error?.hint,
      data,
      dataCount: data?.length
    })

    if (error) throw error

    console.log('[API /nickname PUT] 更新成功')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API /nickname PUT] 更新群昵称失败:', error)
    console.error('[API /nickname PUT] 错误详情:', {
      message: error instanceof Error ? error.message : '未知错误',
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { conversationId } = await params

    const { data, error } = await supabase
      .from('conversation_members')
      .select('group_nickname')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single()

    if (error) throw error

    return NextResponse.json({ nickname: data?.group_nickname || '' })
  } catch (error) {
    console.error('获取群昵称失败:', error)
    return NextResponse.json({ error: '获取失败' }, { status: 500 })
  }
}
