import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateUser as updateCloudBaseUser } from '@/lib/cloudbase/database'

export async function POST(request: NextRequest) {
  try {
    const { IS_DOMESTIC_VERSION } = await import('@/config')
    let currentUserId: string | null = null

    if (IS_DOMESTIC_VERSION) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (!cloudBaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUserId = cloudBaseUser.id
    } else {
      const supabase = await createClient()
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUserId = user.id
    }

    const body = await request.json().catch(() => ({}))
    const userId = body?.userId

    if (userId && userId !== currentUserId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (IS_DOMESTIC_VERSION) {
      await updateCloudBaseUser(currentUserId, { last_seen_at: new Date().toISOString() })
    } else {
      const supabase = await createClient()
      const { error: updateError } = await supabase
        .from('users')
        .update({
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentUserId)

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to update heartbeat', details: updateError.message },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Heartbeat error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
