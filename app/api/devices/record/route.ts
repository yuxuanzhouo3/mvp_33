import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyCloudBaseSession } from '@/lib/cloudbase/auth'
import { recordDevice } from '@/lib/database/devices'
import { buildDeviceFingerprint, parseDeviceInfo, getClientIP, getLocationFromIP } from '@/lib/utils/device-parser'
import { IS_DOMESTIC_VERSION } from '@/config'

export async function POST(request: NextRequest) {
  try {
    console.log('[DEVICE RECORD] ========== Device Recording API Called ==========')

    // Authenticate user
    let userId: string | null = null
    let sessionToken: string | null = null
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    if (IS_DOMESTIC_VERSION) {
      const user = await verifyCloudBaseSession(request)
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
      // Get CloudBase session token from cookie, custom header, or Bearer auth.
      const cookieToken = request.cookies.get('cb_session')?.value
      const headerToken = request.headers.get('x-cloudbase-session')
      const authHeader = request.headers.get('authorization') || ''
      const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : ''
      sessionToken = cookieToken || headerToken || bearerToken || ''
    } else {
      const supabase = await createClient()
      let { data: { user } } = await supabase.auth.getUser()
      let { data: { session } } = await supabase.auth.getSession()
      sessionToken = session?.access_token || ''

      if (!user || !sessionToken) {
        const authHeader = request.headers.get('authorization') || ''
        const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
          ? authHeader.slice(7).trim()
          : ''
        if (bearerToken) {
          const { data: bearerUserData } = await supabase.auth.getUser(bearerToken)
          if (bearerUserData?.user) {
            user = bearerUserData.user
            sessionToken = bearerToken
          }
        }
      }

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    console.log('[DEVICE RECORD] User ID:', userId)
    console.log('[DEVICE RECORD] Session token:', sessionToken ? 'present' : 'missing')
    if (!sessionToken) {
      return NextResponse.json({ error: 'No session token' }, { status: 401 })
    }

    // Get device info
    const userAgent = request.headers.get('user-agent') || ''
    console.log('[DEVICE RECORD] User-Agent:', userAgent)

    const deviceModel = typeof body?.deviceModel === 'string' ? body.deviceModel : undefined
    const deviceBrand = typeof body?.deviceBrand === 'string' ? body.deviceBrand : undefined
    const clientType = typeof body?.clientType === 'string' ? body.clientType : undefined
    const deviceCategory = typeof body?.deviceCategory === 'string' ? body.deviceCategory : undefined
    const explicitFingerprint = typeof body?.deviceFingerprint === 'string' ? body.deviceFingerprint : undefined
    const pushProvider = typeof body?.pushProvider === 'string' ? body.pushProvider : undefined
    const pushToken = typeof body?.pushToken === 'string' ? body.pushToken : undefined
    const appPackage = typeof body?.appPackage === 'string' ? body.appPackage : undefined
    const appFlavor = typeof body?.appFlavor === 'string' ? body.appFlavor : undefined

    console.log('[DEVICE RECORD] Device model from app:', deviceModel, deviceBrand)
    const deviceInfo = parseDeviceInfo(
      userAgent,
      deviceModel,
      deviceBrand,
      clientType,
      deviceCategory
    )
    const isNativeClient = deviceInfo.clientType === 'android_app' || deviceInfo.clientType === 'ios_app'
    const looksWebFingerprint = typeof explicitFingerprint === 'string' && explicitFingerprint.startsWith('web_')
    const safeExplicitFingerprint = isNativeClient && looksWebFingerprint ? undefined : explicitFingerprint
    console.log('[DEVICE RECORD] Device info:', JSON.stringify(deviceInfo, null, 2))

    const ip = getClientIP(request)
    console.log('[DEVICE RECORD] IP address:', ip)

    const location = await getLocationFromIP(ip)
    console.log('[DEVICE RECORD] Location:', location)
    const deviceFingerprint = buildDeviceFingerprint({
      explicitFingerprint: safeExplicitFingerprint,
      userAgent,
      clientType: deviceInfo.clientType,
      deviceCategory: deviceInfo.deviceCategory,
      deviceModel: deviceInfo.deviceModel,
      deviceBrand: deviceInfo.deviceBrand,
      os: deviceInfo.os,
      browser: deviceInfo.browser,
    })

    // Record device
    const deviceData = {
      user_id: userId,
      device_name: deviceInfo.deviceName,
      device_type: deviceInfo.deviceType,
      device_category: deviceInfo.deviceCategory,
      client_type: deviceInfo.clientType,
      device_model: deviceInfo.deviceModel,
      device_brand: deviceInfo.deviceBrand,
      device_fingerprint: deviceFingerprint,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      ip_address: ip,
      location: location,
      session_token: sessionToken,
      push_provider: pushProvider,
      push_token: pushToken,
      app_package: appPackage,
      app_flavor: appFlavor,
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

