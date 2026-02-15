import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transferOwnership as transferOwnershipSupabase } from '@/lib/database/supabase/group-members'
import { transferOwnership as transferOwnershipCloudbase } from '@/lib/database/cloudbase/group-members'

const isCloudBase = process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE === 'zh' && !process.env.FORCE_GLOBAL_DATABASE

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { newOwnerId } = await request.json()

    if (!newOwnerId) {
      return NextResponse.json({ error: 'newOwnerId is required' }, { status: 400 })
    }

    const success = isCloudBase
      ? await transferOwnershipCloudbase(id, user.id, newOwnerId)
      : await transferOwnershipSupabase(id, user.id, newOwnerId)

    if (!success) {
      return NextResponse.json({ error: 'Failed to transfer ownership' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
