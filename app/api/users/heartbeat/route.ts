import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateUser } from '@/lib/cloudbase/database'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userId } = await request.json()

    if (userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await updateUser(userId, { last_seen_at: new Date().toISOString() })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Heartbeat error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
