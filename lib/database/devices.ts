import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCloudBaseDB } from '@/lib/cloudbase/db'
import { IS_DOMESTIC_VERSION } from '@/config'

export interface DeviceData {
  user_id: string
  device_name: string
  device_type: 'ios' | 'android' | 'web' | 'desktop'
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
}

async function getSupabaseDevices(userId: string): Promise<Device[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_devices')
    .select('*')
    .eq('user_id', userId)
    .order('last_active_at', { ascending: false })

  if (error) throw error
  return data || []
}

async function recordSupabaseDevice(data: DeviceData): Promise<Device> {
  const supabase = await createAdminClient()
  const { data: device, error } = await supabase
    .from('user_devices')
    .insert(data)
    .select()
    .single()

  if (error) throw error
  return device
}

async function deleteSupabaseDevice(deviceId: string, userId: string): Promise<void> {
  // Use admin client to bypass RLS policies
  const supabase = await createAdminClient()

  console.log('[DELETE DEVICE] Deleting device:', deviceId, 'for user:', userId)

  // First, get the device's session token
  const { data: device, error: fetchError } = await supabase
    .from('user_devices')
    .select('session_token')
    .eq('id', deviceId)
    .eq('user_id', userId)
    .single()

  if (fetchError) {
    console.error('[DELETE DEVICE] Failed to fetch device:', fetchError)
    throw fetchError
  }

  if (!device) {
    throw new Error('Device not found')
  }

  console.log('[DELETE DEVICE] Found device with session token')

  // Revoke the session using the session token
  // This will invalidate the user's session on that device
  try {
    // Use admin client to revoke the session by JWT
    await supabase.auth.admin.signOut(device.session_token)
    console.log('[DELETE DEVICE] Session revoked successfully')
  } catch (revokeError: any) {
    console.error('[DELETE DEVICE] Failed to revoke session:', revokeError)
    // Continue with device deletion even if session revocation fails
  }

  // Delete the device record
  const { error } = await supabase
    .from('user_devices')
    .delete()
    .eq('id', deviceId)
    .eq('user_id', userId)

  if (error) {
    console.error('[DELETE DEVICE] Delete error:', error)
    throw error
  }

  console.log('[DELETE DEVICE] Device deleted successfully')
}

async function getCloudBaseDevices(userId: string): Promise<Device[]> {
  const db = getCloudBaseDB()
  const res = await db.collection('user_devices')
    .where({ user_id: userId })
    .orderBy('last_active_at', 'desc')
    .get()

  return res.data.map((doc: any) => ({
    id: doc._id,
    user_id: doc.user_id,
    device_name: doc.device_name,
    device_type: doc.device_type,
    browser: doc.browser,
    os: doc.os,
    ip_address: doc.ip_address,
    location: doc.location,
    session_token: doc.session_token,
    last_active_at: doc.last_active_at,
    created_at: doc.created_at,
  }))
}

async function recordCloudBaseDevice(data: DeviceData): Promise<Device> {
  const db = getCloudBaseDB()
  const res = await db.collection('user_devices').add({
    ...data,
    last_active_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  })

  return {
    id: res.id,
    ...data,
    last_active_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}

async function deleteCloudBaseDevice(deviceId: string, userId: string): Promise<void> {
  const db = getCloudBaseDB()
  await db.collection('user_devices')
    .where({ _id: deviceId, user_id: userId })
    .remove()
}

export async function getDevices(userId: string): Promise<Device[]> {
  if (IS_DOMESTIC_VERSION) {
    return getCloudBaseDevices(userId)
  }
  return getSupabaseDevices(userId)
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
