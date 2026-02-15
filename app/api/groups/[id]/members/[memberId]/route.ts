import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateMemberRole as updateMemberRoleSupabase, removeGroupMember as removeGroupMemberSupabase } from '@/lib/database/supabase/group-members'
import { updateMemberRole as updateMemberRoleCloudbase, removeGroupMember as removeGroupMemberCloudbase } from '@/lib/database/cloudbase/group-members'

const isCloudBase = process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE === 'zh' && !process.env.FORCE_GLOBAL_DATABASE

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, memberId } = await params
    const { role } = await request.json()

    if (!role || !['admin', 'member'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const success = isCloudBase
      ? await updateMemberRoleCloudbase(id, memberId, role)
      : await updateMemberRoleSupabase(id, memberId, role)

    if (!success) {
      return NextResponse.json({ error: 'Failed to update member role' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, memberId } = await params
    const success = isCloudBase
      ? await removeGroupMemberCloudbase(id, memberId)
      : await removeGroupMemberSupabase(id, memberId)

    if (!success) {
      return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
