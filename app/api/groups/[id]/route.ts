import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGroupInfo as getGroupInfoSupabase, updateGroupSettings as updateGroupSettingsSupabase, deleteGroup as deleteGroupSupabase } from '@/lib/database/supabase/groups'
import { getGroupInfo as getGroupInfoCloudbase, updateGroupSettings as updateGroupSettingsCloudbase, deleteGroup as deleteGroupCloudbase } from '@/lib/database/cloudbase/groups'
import { IS_DOMESTIC_VERSION } from '@/config'

export async function GET(
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
    const group = IS_DOMESTIC_VERSION
      ? await getGroupInfoCloudbase(id)
      : await getGroupInfoSupabase(id)

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, group })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(
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
    const updates = await request.json()
    console.log('[PUT /api/groups/[id]] 更新群设置', { groupId: id, updates, userId: user.id })

    const success = IS_DOMESTIC_VERSION
      ? await updateGroupSettingsCloudbase(id, updates)
      : await updateGroupSettingsSupabase(id, updates)

    if (!success) {
      console.error('[PUT /api/groups/[id]] 更新失败')
      return NextResponse.json({ error: 'Failed to update group settings' }, { status: 500 })
    }

    console.log('[PUT /api/groups/[id]] 更新成功')
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PUT /api/groups/[id]] 错误:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

export async function DELETE(
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
    const success = IS_DOMESTIC_VERSION
      ? await deleteGroupCloudbase(id)
      : await deleteGroupSupabase(id)

    if (!success) {
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
