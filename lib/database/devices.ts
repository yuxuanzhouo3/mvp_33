import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
  const supabase = await createClient()
  const { error } = await supabase
    .from('user_devices')
    .delete()
    .eq('id', deviceId)
    .eq('user_id', userId)

  if (error) throw error
}
