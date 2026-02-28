import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { transferOwnership as transferOwnershipSupabase } from '@/lib/database/supabase/group-members'
import { transferOwnership as transferOwnershipCloudbase } from '@/lib/database/cloudbase/group-members'
import { IS_DOMESTIC_VERSION } from '@/config'

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
    const { newOwnerId } = await request.json()

    if (!newOwnerId) {
      return NextResponse.json({ error: 'newOwnerId is required' }, { status: 400 })
    }

    const success = IS_DOMESTIC_VERSION
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
