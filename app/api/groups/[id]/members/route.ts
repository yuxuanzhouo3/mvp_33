import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGroupMembers as getGroupMembersSupabase, addGroupMembers as addGroupMembersSupabase } from '@/lib/database/supabase/group-members'
import { getGroupMembers as getGroupMembersCloudbase, addGroupMembers as addGroupMembersCloudbase } from '@/lib/database/cloudbase/group-members'
import { IS_DOMESTIC_VERSION } from '@/config'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    console.log('[API /api/groups/[id]/members GET] 开始处理请求')
    let user: { id: string } | null = null
    if (IS_DOMESTIC_VERSION) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (cloudBaseUser) user = { id: cloudBaseUser.id }
    } else {
      const supabase = await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (supabaseUser) user = { id: supabaseUser.id }
    }

    if (!user) {
      console.log('[API /api/groups/[id]/members GET] 未授权')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    console.log('[API /api/groups/[id]/members GET] 调用 getGroupMembers', { groupId: id, userId: user.id })
    const members = IS_DOMESTIC_VERSION
      ? await getGroupMembersCloudbase(id)
      : await getGroupMembersSupabase(id)
    console.log('[API /api/groups/[id]/members GET] getGroupMembers 返回', { count: members.length })

    return NextResponse.json({ success: true, members })
  } catch (error) {
    console.error('[API /api/groups/[id]/members GET] 错误', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let user: { id: string } | null = null
    if (IS_DOMESTIC_VERSION) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (cloudBaseUser) user = { id: cloudBaseUser.id }
    } else {
      const supabase = await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (supabaseUser) user = { id: supabaseUser.id }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { userIds } = await request.json()

    const success = IS_DOMESTIC_VERSION
      ? await addGroupMembersCloudbase(id, userIds, user.id)
      : await addGroupMembersSupabase(id, userIds, user.id)

    if (!success) {
      return NextResponse.json({ error: 'Failed to add members' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
