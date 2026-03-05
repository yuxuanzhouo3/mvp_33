import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCloudBaseDB } from '@/lib/cloudbase/db'
import { revokeCloudBaseSessionToken } from '@/lib/cloudbase/auth'
import { ClientType, DeviceCategory, DeviceType } from '@/lib/utils/device-parser'
import { IS_DOMESTIC_VERSION } from '@/config'

export interface DeviceData {
  user_id: string
  device_name: string
  device_type: DeviceType
  device_category?: DeviceCategory
  client_type?: ClientType
  device_model?: string | null
  device_brand?: string | null
  device_fingerprint?: string
  browser?: string
  os?: string
  ip_address?: string
  location?: string
  session_token: string
}

export interface Device extends DeviceData {
  id: string
  last_active_at: string
  created_at: string
  is_current?: boolean
}

const FALLBACK_DEVICE_NAME = 'Unknown Device'
const FALLBACK_DEVICE_TYPE: DeviceType = 'web'
const FALLBACK_DEVICE_CATEGORY: DeviceCategory = 'desktop'
const FALLBACK_CLIENT_TYPE: ClientType = 'web'

function normalizeDeviceFingerprint(value?: string | null): string {
  return (value || '').trim()
}

function toTimestamp(value?: string | null): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isNewerDevice(next: Device, prev: Device): boolean {
  const nextActive = toTimestamp(next.last_active_at)
  const prevActive = toTimestamp(prev.last_active_at)
  if (nextActive !== prevActive) return nextActive > prevActive
  const nextCreated = toTimestamp(next.created_at)
  const prevCreated = toTimestamp(prev.created_at)
  if (nextCreated !== prevCreated) return nextCreated > prevCreated
  return String(next.id).localeCompare(String(prev.id)) > 0
}

function buildFallbackFingerprint(input: Partial<DeviceData>): string {
  const source = [
    input.user_id || '',
    input.client_type || '',
    input.device_category || '',
    input.device_type || '',
    input.device_brand || '',
    input.device_model || '',
    input.browser || '',
    input.os || '',
    input.device_name || '',
  ].join('|')
  const digest = crypto.createHash('sha256').update(source || 'unknown-device').digest('hex')
  return `fp_${digest}`
}

function ensureFingerprint(input: DeviceData): string {
  const normalized = normalizeDeviceFingerprint(input.device_fingerprint)
  if (normalized) return normalized
  return buildFallbackFingerprint(input)
}

function normalizeDevice(raw: any): Device {
  const device: Device = {
    id: String(raw.id || raw._id || ''),
    user_id: String(raw.user_id || ''),
    device_name: raw.device_name || FALLBACK_DEVICE_NAME,
    device_type: (raw.device_type || FALLBACK_DEVICE_TYPE) as DeviceType,
    device_category: (raw.device_category || FALLBACK_DEVICE_CATEGORY) as DeviceCategory,
    client_type: (raw.client_type || FALLBACK_CLIENT_TYPE) as ClientType,
    device_model: raw.device_model || null,
    device_brand: raw.device_brand || null,
    device_fingerprint: normalizeDeviceFingerprint(raw.device_fingerprint),
    browser: raw.browser || undefined,
    os: raw.os || undefined,
    ip_address: raw.ip_address || undefined,
    location: raw.location || undefined,
    session_token: raw.session_token || '',
    last_active_at: raw.last_active_at || raw.updated_at || raw.created_at || new Date(0).toISOString(),
    created_at: raw.created_at || raw.last_active_at || new Date(0).toISOString(),
  }

  if (!device.device_fingerprint) {
    device.device_fingerprint = buildFallbackFingerprint(device)
  }
  return device
}

function deduplicateDevices(devices: Device[]): Device[] {
  const byFingerprint = new Map<string, Device>()

  devices.forEach((device) => {
    const key = normalizeDeviceFingerprint(device.device_fingerprint) || buildFallbackFingerprint(device)
    const current = byFingerprint.get(key)
    if (!current || isNewerDevice(device, current)) {
      byFingerprint.set(key, device)
    }
  })

  return Array.from(byFingerprint.values()).sort(
    (a, b) => toTimestamp(b.last_active_at) - toTimestamp(a.last_active_at)
  )
}

function markCurrentDevice(devices: Device[], currentSessionToken?: string | null): Device[] {
  const token = (currentSessionToken || '').trim()
  if (!token) return devices.map((device) => ({ ...device, is_current: false }))
  return devices.map((device) => ({
    ...device,
    is_current: device.session_token === token,
  }))
}

async function getSupabaseDevices(userId: string): Promise<Device[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_devices')
    .select('*')
    .eq('user_id', userId)
    .order('last_active_at', { ascending: false })

  if (error) throw error
  return (data || []).map(normalizeDevice)
}

async function recordSupabaseDevice(input: DeviceData): Promise<Device> {
  const supabase = await createAdminClient()
  const now = new Date().toISOString()
  const fingerprint = ensureFingerprint(input)

  const payload = {
    user_id: input.user_id,
    device_name: input.device_name,
    device_type: input.device_type,
    device_category: input.device_category || FALLBACK_DEVICE_CATEGORY,
    client_type: input.client_type || FALLBACK_CLIENT_TYPE,
    device_model: input.device_model || null,
    device_brand: input.device_brand || null,
    device_fingerprint: fingerprint,
    browser: input.browser || null,
    os: input.os || null,
    ip_address: input.ip_address || null,
    location: input.location || null,
    session_token: input.session_token,
    last_active_at: now,
  }

  const { data: existingByFingerprint, error: existingError } = await supabase
    .from('user_devices')
    .select('*')
    .eq('user_id', input.user_id)
    .eq('device_fingerprint', fingerprint)
    .order('last_active_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) throw existingError

  if (existingByFingerprint) {
    const oldToken = String(existingByFingerprint.session_token || '')
    const newToken = String(input.session_token || '')
    if (oldToken && newToken && oldToken !== newToken) {
      try {
        await supabase.auth.admin.signOut(oldToken)
      } catch (revokeError) {
        console.warn('[recordSupabaseDevice] Failed to revoke replaced token:', revokeError)
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('user_devices')
      .update(payload)
      .eq('id', existingByFingerprint.id)
      .select()
      .single()

    if (updateError) throw updateError
    return normalizeDevice(updated)
  }

  const { data: inserted, error: insertError } = await supabase
    .from('user_devices')
    .insert(payload)
    .select()
    .single()

  if (insertError) throw insertError
  return normalizeDevice(inserted)
}

async function deleteSupabaseDevice(deviceId: string, userId: string): Promise<void> {
  const supabase = await createAdminClient()

  const { data: targetDevice, error: fetchError } = await supabase
    .from('user_devices')
    .select('id, session_token, device_fingerprint')
    .eq('id', deviceId)
    .eq('user_id', userId)
    .single()

  if (fetchError) throw fetchError
  if (!targetDevice) throw new Error('Device not found')

  let rowsToRevoke: any[] = []
  if (targetDevice.device_fingerprint) {
    const { data: sameDeviceRows, error: sameError } = await supabase
      .from('user_devices')
      .select('id, session_token')
      .eq('user_id', userId)
      .eq('device_fingerprint', targetDevice.device_fingerprint)
    if (sameError) throw sameError
    rowsToRevoke = sameDeviceRows || []
  } else {
    rowsToRevoke = [targetDevice]
  }

  const tokenSet = new Set(
    rowsToRevoke
      .map((row: any) => String(row.session_token || '').trim())
      .filter(Boolean)
  )
  for (const token of tokenSet) {
    try {
      await supabase.auth.admin.signOut(token)
    } catch (revokeError) {
      console.warn('[deleteSupabaseDevice] Failed to revoke token:', revokeError)
    }
  }

  let deleteQuery = supabase
    .from('user_devices')
    .delete()
    .eq('user_id', userId)
  if (targetDevice.device_fingerprint) {
    deleteQuery = deleteQuery.eq('device_fingerprint', targetDevice.device_fingerprint)
  } else {
    deleteQuery = deleteQuery.eq('id', deviceId)
  }

  const { error: deleteError } = await deleteQuery
  if (deleteError) throw deleteError
}

async function getCloudBaseDevices(userId: string): Promise<Device[]> {
  const db = getCloudBaseDB()
  const res = await db
    .collection('user_devices')
    .where({ user_id: userId })
    .orderBy('last_active_at', 'desc')
    .get()

  return (res.data || []).map(normalizeDevice)
}

async function recordCloudBaseDevice(input: DeviceData): Promise<Device> {
  const db = getCloudBaseDB()
  const now = new Date().toISOString()
  const fingerprint = ensureFingerprint(input)

  const payload = {
    user_id: input.user_id,
    device_name: input.device_name,
    device_type: input.device_type,
    device_category: input.device_category || FALLBACK_DEVICE_CATEGORY,
    client_type: input.client_type || FALLBACK_CLIENT_TYPE,
    device_model: input.device_model || null,
    device_brand: input.device_brand || null,
    device_fingerprint: fingerprint,
    browser: input.browser || null,
    os: input.os || null,
    ip_address: input.ip_address || null,
    location: input.location || null,
    session_token: input.session_token,
    last_active_at: now,
  }

  const existing = await db
    .collection('user_devices')
    .where({ user_id: input.user_id, device_fingerprint: fingerprint })
    .orderBy('last_active_at', 'desc')
    .limit(1)
    .get()

  if (existing.data && existing.data.length > 0) {
    const doc = existing.data[0]
    const oldToken = String(doc.session_token || '')
    const newToken = String(input.session_token || '')
    if (oldToken && newToken && oldToken !== newToken) {
      await revokeCloudBaseSessionToken(oldToken, input.user_id, 'replaced_session')
    }

    await db.collection('user_devices').doc(doc._id).update(payload)

    return normalizeDevice({
      ...doc,
      ...payload,
      _id: doc._id,
      created_at: doc.created_at || now,
    })
  }

  const createdAt = now
  const insertRes = await db.collection('user_devices').add({
    ...payload,
    created_at: createdAt,
  })

  return normalizeDevice({
    ...payload,
    _id: insertRes.id || insertRes._id,
    created_at: createdAt,
  })
}

async function deleteCloudBaseDevice(deviceId: string, userId: string): Promise<void> {
  const db = getCloudBaseDB()
  const targetRes = await db
    .collection('user_devices')
    .where({ _id: deviceId, user_id: userId })
    .limit(1)
    .get()

  if (!targetRes.data || targetRes.data.length === 0) {
    throw new Error('Device not found')
  }

  const target = targetRes.data[0]
  const fingerprint = normalizeDeviceFingerprint(target.device_fingerprint)
  let rowsToDelete: any[] = [target]

  if (fingerprint) {
    const sameDeviceRes = await db
      .collection('user_devices')
      .where({ user_id: userId, device_fingerprint: fingerprint })
      .get()
    rowsToDelete = sameDeviceRes.data || rowsToDelete
  }

  const tokenSet = new Set(
    rowsToDelete
      .map((row: any) => String(row.session_token || '').trim())
      .filter(Boolean)
  )
  for (const token of tokenSet) {
    await revokeCloudBaseSessionToken(token, userId, 'device_kick')
  }

  if (rowsToDelete.length === 1) {
    await db.collection('user_devices').doc(rowsToDelete[0]._id).remove()
    return
  }

  const ids = rowsToDelete.map((row: any) => row._id).filter(Boolean)
  if (ids.length === 0) return
  const cmd = db.command
  await db.collection('user_devices').where({ _id: cmd.in(ids), user_id: userId }).remove()
}

export async function getDevices(userId: string, currentSessionToken?: string | null): Promise<Device[]> {
  const raw = IS_DOMESTIC_VERSION
    ? await getCloudBaseDevices(userId)
    : await getSupabaseDevices(userId)
  const deduplicated = deduplicateDevices(raw)
  return markCurrentDevice(deduplicated, currentSessionToken)
}

export async function recordDevice(data: DeviceData): Promise<Device> {
  if (IS_DOMESTIC_VERSION) {
    return recordCloudBaseDevice(data)
  }
  return recordSupabaseDevice(data)
}

export async function deleteDevice(deviceId: string, userId: string): Promise<void> {
  if (IS_DOMESTIC_VERSION) {
    return deleteCloudBaseDevice(deviceId, userId)
  }
  return deleteSupabaseDevice(deviceId, userId)
}
