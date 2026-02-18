import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyCloudBaseSession } from '@/lib/cloudbase/auth'
import { recordDevice } from '@/lib/database/devices'
import { parseDeviceInfo, getClientIP, getLocationFromIP } from '@/lib/utils/device-parser'
import { IS_DOMESTIC_VERSION } from '@/config'

export async function POST(request: NextRequest) {
  try {
    console.log('[DEVICE RECORD] ========== Device Recording API Called ==========')

    // Authenticate user
    let userId: string | null = null
    let sessionToken: string | null = null

    if (IS_DOMESTIC_VERSION) {
      const user = await verifyCloudBaseSession(request)
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
      // Get CloudBase session token from cookie or header
      const cookieToken = request.cookies.get('cb_session')?.value
      const headerToken = request.headers.get('x-cloudbase-session')
      sessionToken = cookieToken || headerToken || ''
    } else {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
      // Get Supabase session token
      const { data: { session } } = await supabase.auth.getSession()
      sessionToken = session?.access_token || ''
    }

    console.log('[DEVICE RECORD] User ID:', userId)
    console.log('[DEVICE RECORD] Session token:', sessionToken ? 'present' : 'missing')

    // Get device info
    const userAgent = request.headers.get('user-agent') || ''
    console.log('[DEVICE RECORD] User-Agent:', userAgent)

    const deviceInfo = parseDeviceInfo(userAgent)
    console.log('[DEVICE RECORD] Device info:', JSON.stringify(deviceInfo, null, 2))

    const ip = getClientIP(request)
    console.log('[DEVICE RECORD] IP address:', ip)

    const location = await getLocationFromIP(ip)
    console.log('[DEVICE RECORD] Location:', location)

    // Record device
    const deviceData = {
      user_id: userId,
      device_name: deviceInfo.deviceName,
      device_type: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      ip_address: ip,
      location: location,
      session_token: sessionToken,
    }
    console.log('[DEVICE RECORD] Device data to record:', JSON.stringify(deviceData, null, 2))

    console.log('[DEVICE RECORD] Calling recordDevice...')
    const recordedDevice = await recordDevice(deviceData)
    console.log('[DEVICE RECORD] ✅ Device recorded successfully:', JSON.stringify(recordedDevice, null, 2))

    console.log('[DEVICE RECORD] ========== Device Recording Completed ==========')

    return NextResponse.json({
      success: true,
      device: recordedDevice,
    })
  } catch (error: any) {
    console.error('[DEVICE RECORD] ❌ Failed to record device')
    console.error('[DEVICE RECORD] Error message:', error?.message)
    console.error('[DEVICE RECORD] Error stack:', error?.stack)
    console.error('[DEVICE RECORD] Full error:', JSON.stringify(error, null, 2))

    return NextResponse.json(
      { error: error.message || 'Failed to record device' },
      { status: 500 }
    )
  }
}
