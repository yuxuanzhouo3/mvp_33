import { UAParser } from 'ua-parser-js'

export function parseDeviceInfo(userAgent: string) {
  const parser = new UAParser(userAgent)
  const device = parser.getDevice()
  const browser = parser.getBrowser()
  const os = parser.getOS()

  const deviceName = `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`

  let deviceType: 'ios' | 'android' | 'web' | 'desktop' = 'web'
  if (device.type === 'mobile') {
    if (os.name?.toLowerCase().includes('ios')) {
      deviceType = 'ios'
    } else if (os.name?.toLowerCase().includes('android')) {
      deviceType = 'android'
    }
  } else if (device.type === 'tablet') {
    deviceType = os.name?.toLowerCase().includes('ios') ? 'ios' : 'android'
  } else {
    deviceType = 'desktop'
  }

  return {
    deviceName,
    deviceType,
    browser: browser.name,
    os: os.name,
  }
}

export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')

  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  return realIp || 'unknown'
}

export async function getLocationFromIP(ip: string): Promise<string> {
  if (ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') {
    return 'Local'
  }

  try {
    const response = await fetch(`https://ipapi.co/${ip}/json/`, {
      next: { revalidate: 3600 }
    })
    const data = await response.json()
    return `${data.city || 'Unknown'}, ${data.country_name || 'Unknown'}`
  } catch {
    return 'Unknown'
  }
}
