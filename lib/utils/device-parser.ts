import crypto from 'crypto'
import { UAParser } from 'ua-parser-js'

export type DeviceType = 'ios' | 'android' | 'web' | 'desktop'
export type DeviceCategory = 'desktop' | 'mobile' | 'tablet'
export type ClientType = 'web' | 'android_app' | 'ios_app' | 'desktop_app'

export interface ParsedDeviceInfo {
  deviceName: string
  deviceType: DeviceType
  deviceCategory: DeviceCategory
  clientType: ClientType
  browser: string
  os: string
  deviceModel: string | null
  deviceBrand: string | null
}

const normalizeText = (value?: string | null): string => {
  return (value || '').trim()
}

const normalizeCategory = (value?: string | null): DeviceCategory | null => {
  const raw = normalizeText(value).toLowerCase()
  if (!raw) return null
  if (raw === 'mobile' || raw === 'tablet' || raw === 'desktop') return raw
  return null
}

const normalizeClientType = (value?: string | null): ClientType | null => {
  const raw = normalizeText(value).toLowerCase()
  if (!raw) return null
  if (raw === 'web' || raw === 'android_app' || raw === 'ios_app' || raw === 'desktop_app') {
    return raw
  }
  return null
}

function inferDeviceCategoryFromUA(
  parserDeviceType: string | undefined,
  userAgent: string
): DeviceCategory {
  if (parserDeviceType === 'tablet') return 'tablet'
  if (parserDeviceType === 'mobile') return 'mobile'
  const ua = userAgent.toLowerCase()
  if (/ipad|tablet|nexus 7|nexus 9|sm-t|lenovo tab|huawei mediapad/.test(ua)) return 'tablet'
  if (/mobi|iphone|android/.test(ua)) return 'mobile'
  return 'desktop'
}

function inferClientType(
  userAgent: string,
  parsedOs: string,
  providedClientType?: string | null,
  hasNativeDeviceInfo?: boolean
): ClientType {
  const normalizedProvided = normalizeClientType(providedClientType)
  if (normalizedProvided) return normalizedProvided

  const ua = userAgent.toLowerCase()
  if (hasNativeDeviceInfo || /orbitchatapp|orbitapp|wv\)/.test(ua)) {
    if (parsedOs.toLowerCase().includes('ios')) return 'ios_app'
    return 'android_app'
  }

  if (/electron|tauri/.test(ua)) return 'desktop_app'
  return 'web'
}

function inferDeviceType(parsedOs: string, category: DeviceCategory): DeviceType {
  const os = parsedOs.toLowerCase()
  if (os.includes('ios') || os.includes('ipad')) return 'ios'
  if (os.includes('android')) return 'android'
  if (category === 'desktop') return 'desktop'
  return 'web'
}

export function parseDeviceInfo(
  userAgent: string,
  deviceModel?: string | null,
  deviceBrand?: string | null,
  clientTypeHint?: string | null,
  deviceCategoryHint?: string | null
): ParsedDeviceInfo {
  const parser = new UAParser(userAgent)
  const device = parser.getDevice()
  const browser = parser.getBrowser()
  const os = parser.getOS()

  const parsedModel = normalizeText(deviceModel) || normalizeText(device.model)
  const parsedBrand =
    normalizeText(deviceBrand) ||
    normalizeText((device as any).vendor) ||
    normalizeText((device as any).manufacturer)
  const parsedOs = normalizeText(os.name) || 'Unknown'
  const parsedBrowser = normalizeText(browser.name) || 'Unknown'
  const hasNativeDeviceInfo = Boolean(parsedModel || parsedBrand)

  const deviceCategory =
    normalizeCategory(deviceCategoryHint) ||
    inferDeviceCategoryFromUA(device.type, userAgent)
  const clientType = inferClientType(userAgent, parsedOs, clientTypeHint, hasNativeDeviceInfo)
  const deviceType = inferDeviceType(parsedOs, deviceCategory)

  let deviceName = ''
  if (parsedModel && parsedBrand) {
    deviceName = `${parsedBrand} ${parsedModel}`.trim()
  } else if (parsedModel) {
    deviceName = parsedModel
  } else if (parsedBrowser !== 'Unknown' && parsedOs !== 'Unknown') {
    deviceName = `${parsedBrowser} on ${parsedOs}`
  } else if (parsedOs !== 'Unknown') {
    deviceName = `${parsedOs} Device`
  } else {
    deviceName = 'Unknown Device'
  }

  return {
    deviceName,
    deviceType,
    deviceCategory,
    clientType,
    browser: parsedBrowser,
    os: parsedOs,
    deviceModel: parsedModel || null,
    deviceBrand: parsedBrand || null,
  }
}

export function buildDeviceFingerprint(params: {
  explicitFingerprint?: string | null
  userAgent: string
  clientType?: string | null
  deviceCategory?: string | null
  deviceModel?: string | null
  deviceBrand?: string | null
  os?: string | null
  browser?: string | null
}): string {
  const explicit = normalizeText(params.explicitFingerprint)
  if (explicit) return explicit

  const source = [
    normalizeText(params.clientType),
    normalizeText(params.deviceCategory),
    normalizeText(params.deviceModel),
    normalizeText(params.deviceBrand),
    normalizeText(params.os),
    normalizeText(params.browser),
    normalizeText(params.userAgent),
  ].join('|')

  const digest = crypto.createHash('sha256').update(source || 'unknown-device').digest('hex')
  return `fp_${digest}`
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
