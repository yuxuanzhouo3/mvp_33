export type AndroidDeviceRecord = {
  user_id?: string
  push_token?: string | null
  client_type?: string | null
  device_type?: string | null
  device_brand?: string | null
  device_model?: string | null
  push_token_updated_at?: string | null
  last_active_at?: string | null
  created_at?: string | null
}

function toTimestamp(value?: string | null): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getDeviceRecency(device: AndroidDeviceRecord): number {
  return Math.max(
    toTimestamp(device.push_token_updated_at),
    toTimestamp(device.last_active_at),
    toTimestamp(device.created_at),
  )
}

export function mapAndroidDevices(rows: AndroidDeviceRecord[]): Map<string, AndroidDeviceRecord> {
  const map = new Map<string, AndroidDeviceRecord>()
  rows.forEach((device) => {
    const userId = String(device?.user_id || "").trim()
    const token = String(device?.push_token || "").trim()
    if (!userId || !token) return

    const client = String(device?.client_type || "").toLowerCase()
    const type = String(device?.device_type || "").toLowerCase()
    if (client !== "android_app" && type !== "android") return
    const current = map.get(userId)
    if (!current || getDeviceRecency(device) > getDeviceRecency(current)) {
      map.set(userId, device)
    }
  })
  return map
}

export function derivePlatform(device: AndroidDeviceRecord | undefined | null): string | null {
  if (!device) return null
  return (
    device.device_brand ||
    device.device_model ||
    device.device_type ||
    device.client_type ||
    null
  )
}
