import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params
    const body = await request.json()
    const nickname = typeof body?.nickname === 'string' ? body.nickname : ''
    const dbClient = await getDatabaseClientForUser(request)
    const isCloudbase = dbClient.type === 'cloudbase' && dbClient.region === 'cn'

    if (isCloudbase) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const user = await verifyCloudBaseSession(request)
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const db = dbClient.cloudbase
      if (!db) {
        return NextResponse.json({ error: 'CloudBase not configured' }, { status: 500 })
      }

      const memberRes = await db.collection('conversation_members')
        .where({
          conversation_id: conversationId,
          user_id: user.id,
        })
        .limit(1)
        .get()

      const membership = memberRes?.data?.[0]
      if (!membership?._id) {
        return NextResponse.json({ error: 'Conversation not found or user is not a member' }, { status: 404 })
      }

      await db.collection('conversation_members').doc(membership._id).update({
        group_nickname: nickname || null,
        updated_at: new Date().toISOString(),
      })

      return NextResponse.json({ success: true })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
    const { conversationId } = await params
    const dbClient = await getDatabaseClientForUser(request)
    const isCloudbase = dbClient.type === 'cloudbase' && dbClient.region === 'cn'

    if (isCloudbase) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const user = await verifyCloudBaseSession(request)
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const db = dbClient.cloudbase
      if (!db) {
        return NextResponse.json({ error: 'CloudBase not configured' }, { status: 500 })
      }

      const memberRes = await db.collection('conversation_members')
        .where({
          conversation_id: conversationId,
          user_id: user.id,
        })
        .limit(1)
        .get()

      const membership = memberRes?.data?.[0]
      if (!membership) {
        return NextResponse.json({ error: 'Conversation not found or user is not a member' }, { status: 404 })
      }

      return NextResponse.json({ nickname: membership.group_nickname || '' })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
