import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCloudBaseSessionToken } from '@/lib/cloudbase/auth'
import { IS_DOMESTIC_VERSION } from '@/config'

export async function GET(request: NextRequest) {
  try {
    let sessionToken: string | null = null

    if (IS_DOMESTIC_VERSION) {
      sessionToken = getCloudBaseSessionToken(request)
    } else {
      const supabase = await createClient()
      const { data: { session } } = await supabase.auth.getSession()
      sessionToken = session?.access_token || null
    }

    if (!sessionToken) {
      return NextResponse.json({ error: 'No session found' }, { status: 401 })
    }

    return NextResponse.json({ sessionToken })
  } catch (error: any) {
    console.error('Get current device error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get current device' },
      { status: 500 }
    )
  }
}
