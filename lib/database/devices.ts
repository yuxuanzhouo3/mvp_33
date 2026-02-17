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
