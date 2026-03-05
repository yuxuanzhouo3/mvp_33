'use client'

export type ClientDeviceType = 'web' | 'android_app' | 'ios_app' | 'desktop_app'
export type ClientDeviceCategory = 'desktop' | 'mobile' | 'tablet'

export interface ClientDeviceInfoPayload {
  deviceModel?: string
  deviceBrand?: string
  deviceFingerprint?: string
  clientType?: ClientDeviceType
  deviceCategory?: ClientDeviceCategory
}

const WEB_FINGERPRINT_KEY = 'chat_app_device_fingerprint_v1'

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function detectDeviceCategory(userAgent: string): ClientDeviceCategory {
  const ua = userAgent.toLowerCase()
  if (/ipad|tablet|nexus 7|nexus 9|sm-t|lenovo tab|huawei mediapad/.test(ua)) return 'tablet'
  if (/mobi|iphone|android/.test(ua)) return 'mobile'
  return 'desktop'
}

function detectClientType(userAgent: string): ClientDeviceType {
  const ua = userAgent.toLowerCase()
  if (/electron|tauri/.test(ua)) return 'desktop_app'
  return 'web'
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function getWebFingerprint(): string {
  if (typeof window === 'undefined') return `web_${randomId()}`
  try {
    const existing = normalizeText(window.localStorage.getItem(WEB_FINGERPRINT_KEY))
    if (existing) return existing
    const created = `web_${randomId()}`
    window.localStorage.setItem(WEB_FINGERPRINT_KEY, created)
    return created
  } catch {
    return `web_${randomId()}`
  }
}

export async function collectClientDeviceInfo(): Promise<ClientDeviceInfoPayload> {
  if (typeof window === 'undefined') return {}

  const userAgent = window.navigator.userAgent || ''
  let clientType: ClientDeviceType = detectClientType(userAgent)
  const deviceCategory: ClientDeviceCategory = detectDeviceCategory(userAgent)

  let deviceModel: string | undefined
  let deviceBrand: string | undefined
  let deviceFingerprint: string | undefined

  const androidBridge = (window as any).Android
  if (androidBridge) {
    clientType = 'android_app'
    try {
      if (typeof androidBridge.getDeviceModel === 'function') {
        deviceModel = normalizeText(androidBridge.getDeviceModel())
      }
      if (typeof androidBridge.getDeviceBrand === 'function') {
        deviceBrand = normalizeText(androidBridge.getDeviceBrand())
      }
      if (typeof androidBridge.getInstallationId === 'function') {
        const installationId = normalizeText(androidBridge.getInstallationId())
        if (installationId) {
          deviceFingerprint = `android_${installationId}`
        }
      }
    } catch {
      // Ignore bridge errors and fallback below
    }
  } else if ((window as any).webkit?.messageHandlers?.deviceInfo) {
    clientType = 'ios_app'
    try {
      const maybeInfo = await (window as any).webkit.messageHandlers.deviceInfo.postMessage({
        action: 'getDeviceInfo',
      })
      deviceModel = normalizeText(maybeInfo?.model) || deviceModel
      deviceBrand = normalizeText(maybeInfo?.brand) || deviceBrand
      const installationId = normalizeText(maybeInfo?.installationId)
      if (installationId) {
        deviceFingerprint = `ios_${installationId}`
      }
    } catch {
      // Ignore iOS bridge errors and fallback below
    }
  }

  if (!deviceFingerprint) {
    deviceFingerprint = getWebFingerprint()
  }

  return {
    deviceModel,
    deviceBrand,
    deviceFingerprint,
    clientType,
    deviceCategory,
  }
}
