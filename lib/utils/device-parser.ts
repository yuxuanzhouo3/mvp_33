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
  const candidate = forwarded ? forwarded.split(',')[0].trim() : (realIp || '').trim()
  if (!candidate) return 'unknown'
  return normalizeIp(candidate)
}

const LOCATION_CACHE_TTL_MS = 10 * 60 * 1000
const locationCache = new Map<string, { value: string; expiresAt: number }>()

function normalizeIp(value: string): string {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''

  // IPv6 mapped IPv4, e.g. ::ffff:171.106.100.199
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice(7)
  }

  // [IPv6]:port
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']')
    if (end > 0) return trimmed.slice(1, end)
  }

  // IPv4:port
  const ipv4PortMatch = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  if (ipv4PortMatch) return ipv4PortMatch[1]

  return trimmed
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  )
}

function isLocalOrPrivateIP(ip: string): boolean {
  const normalized = normalizeIp(ip)
  if (!normalized) return true
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') return true
  if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  return isPrivateIPv4(normalized)
}

function countryCodeToName(countryCode?: string): string {
  const code = (countryCode || '').trim().toUpperCase()
  if (!code) return ''
  try {
    const displayNames = new Intl.DisplayNames(['en'], { type: 'region' })
    return displayNames.of(code) || code
  } catch {
    return code
  }
}

function normalizeLocationPart(value?: string): string {
  const text = (value || '').trim()
  if (!text) return ''

  const normalized = text.toLowerCase()
  if (
    normalized === 'unknown' ||
    normalized === 'n/a' ||
    normalized === 'na' ||
    normalized === 'undefined' ||
    normalized === 'null' ||
    normalized === '-' ||
    normalized === '--'
  ) {
    return ''
  }

  return text
}

function formatLocation(input: { city?: string; region?: string; country?: string }): string {
  const city = normalizeLocationPart(input.city)
  const region = normalizeLocationPart(input.region)
  const country = normalizeLocationPart(input.country)

  if (city && country) return `${city}, ${country}`
  if (region && country) return `${region}, ${country}`
  if (country) return country
  if (city) return city
  return 'Unknown'
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number = 4000): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'orbitchat-device-location/1.0',
      },
      cache: 'no-store',
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

export async function getLocationFromIP(ip: string): Promise<string> {
  const normalizedIp = normalizeIp(ip)
  if (!normalizedIp || normalizedIp === 'unknown') {
    return 'Unknown'
  }

  if (isLocalOrPrivateIP(normalizedIp)) {
    return 'Local'
  }

  const now = Date.now()
  const cached = locationCache.get(normalizedIp)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const providers: Array<() => Promise<string>> = [
    async () => {
      const data = await fetchJsonWithTimeout(`https://ipapi.co/${normalizedIp}/json/`)
      return formatLocation({
        city: data?.city,
        region: data?.region,
        country: data?.country_name || countryCodeToName(data?.country_code),
      })
    },
    async () => {
      const data = await fetchJsonWithTimeout(`https://ipinfo.io/${normalizedIp}/json`)
      return formatLocation({
        city: data?.city,
        region: data?.region,
        country: countryCodeToName(data?.country),
      })
    },
    async () => {
      const data = await fetchJsonWithTimeout(`http://ip-api.com/json/${normalizedIp}?fields=status,message,country,regionName,city`)
      if (data?.status === 'fail') {
        throw new Error(data?.message || 'ip-api failed')
      }
      return formatLocation({
        city: data?.city,
        region: data?.regionName,
        country: data?.country,
      })
    },
  ]

  for (const provider of providers) {
    try {
      const location = await provider()
      if (location && location !== 'Unknown') {
        locationCache.set(normalizedIp, { value: location, expiresAt: now + LOCATION_CACHE_TTL_MS })
        return location
      }
    } catch {
      // Try next provider.
    }
  }

  try {
    // Last fallback: store stable Unknown to avoid repeated external calls.
    locationCache.set(normalizedIp, { value: 'Unknown', expiresAt: now + LOCATION_CACHE_TTL_MS })
    return 'Unknown'
  } catch {
    return 'Unknown'
  }
}
