import { NextRequest, NextResponse } from 'next/server'
import { getDevices } from '@/lib/database/devices'
import { createClient } from '@/lib/supabase/server'
import { verifyCloudBaseSession } from '@/lib/cloudbase/auth'
import { IS_DOMESTIC_VERSION } from '@/config'

export async function GET(request: NextRequest) {
  try {
    let userId: string | null = null

    if (IS_DOMESTIC_VERSION) {
      const user = await verifyCloudBaseSession(request)
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    } else {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const devices = await getDevices(userId)
    return NextResponse.json({ devices })
  } catch (error: any) {
    console.error('Get devices error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get devices' },
      { status: 500 }
    )
  }
}
