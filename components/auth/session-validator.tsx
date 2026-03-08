'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { collectClientDeviceInfo } from '@/lib/utils/device-client'
import { IS_DOMESTIC_VERSION } from '@/config'

const PUSH_TOKEN_SYNC_STORAGE_KEY = 'chat_app_last_synced_push_token'
const PUSH_TOKEN_SYNC_MAX_ATTEMPTS = 6
const PUSH_TOKEN_SYNC_RETRY_MS = 3000

export function SessionValidator() {
  const router = useRouter()
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const deviceSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Skip for domestic version (CloudBase)
    if (IS_DOMESTIC_VERSION) return

    const supabase = createClient()

    // Listen to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[SESSION VALIDATOR] Auth state changed:', event)

      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED' && !session) {
        console.log('[SESSION VALIDATOR] Session invalidated, logging out...')
        handleLogout()
      }
    })

    // Periodic session validation (backup mechanism)
    checkIntervalRef.current = setInterval(async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error || !session) {
          console.log('[SESSION VALIDATOR] Session check failed, logging out...')
          handleLogout()
        }
      } catch (error) {
        console.error('[SESSION VALIDATOR] Session check error:', error)
      }
    }, 30000) // Check every 30 seconds

    return () => {
      subscription.unsubscribe()
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    let cancelled = false
    let attempts = 0

    const syncAndroidPushToken = async () => {
      if (cancelled) return

      const authToken = window.localStorage.getItem('chat_app_token') || ''
      if (!authToken) return

      attempts += 1

      try {
        const deviceInfo = await collectClientDeviceInfo()
        if (deviceInfo.clientType !== 'android_app') return

        const pushToken = (deviceInfo.pushToken || '').trim()
        if (!pushToken) {
          if (attempts < PUSH_TOKEN_SYNC_MAX_ATTEMPTS) {
            deviceSyncTimeoutRef.current = setTimeout(syncAndroidPushToken, PUSH_TOKEN_SYNC_RETRY_MS)
          }
          return
        }

        const lastSyncedToken = window.sessionStorage.getItem(PUSH_TOKEN_SYNC_STORAGE_KEY) || ''
        if (lastSyncedToken === pushToken) {
          return
        }

        const response = await fetch('/api/devices/record', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(deviceInfo),
        })

        if (!response.ok) {
          const errorText = await response.text().catch(() => '')
          console.warn('[SESSION VALIDATOR] Push token device sync failed:', response.status, errorText)
          if (attempts < PUSH_TOKEN_SYNC_MAX_ATTEMPTS) {
            deviceSyncTimeoutRef.current = setTimeout(syncAndroidPushToken, PUSH_TOKEN_SYNC_RETRY_MS)
          }
          return
        }

        window.sessionStorage.setItem(PUSH_TOKEN_SYNC_STORAGE_KEY, pushToken)
        console.log('[SESSION VALIDATOR] Android push token synced')
      } catch (error) {
        console.warn('[SESSION VALIDATOR] Android push token sync error:', error)
        if (attempts < PUSH_TOKEN_SYNC_MAX_ATTEMPTS) {
          deviceSyncTimeoutRef.current = setTimeout(syncAndroidPushToken, PUSH_TOKEN_SYNC_RETRY_MS)
        }
      }
    }

    void syncAndroidPushToken()

    return () => {
      cancelled = true
      if (deviceSyncTimeoutRef.current) {
        clearTimeout(deviceSyncTimeoutRef.current)
      }
    }
  }, [])

  const handleLogout = () => {
    // Clear local storage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('chat_app_current_user')
      localStorage.removeItem('chat_app_token')
      localStorage.removeItem('chat_app_workspace')
    }

    // Redirect to login
    router.push('/login?session_expired=true')
  }

  return null
}
