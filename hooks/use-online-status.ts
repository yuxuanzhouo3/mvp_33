'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { IS_DOMESTIC_VERSION } from '@/config'

export function useOnlineStatus(userId?: string) {
  const [isOnline, setIsOnline] = useState(false)

  useEffect(() => {
    if (!userId) {
      setIsOnline(false)
      return
    }

    const isGlobal = !IS_DOMESTIC_VERSION

    if (isGlobal) {
      let supabase: any
      try {
        supabase = createClient()
      } catch (error) {
        console.error('Failed to create Supabase client:', error)
        return
      }

      const channel = supabase
        .channel('online-users')
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState()
          const userPresent = Object.values(state).some((presences: any) =>
            presences.some((presence: any) => presence.user_id === userId)
          )
          setIsOnline(userPresent)
        })
        .subscribe()

      return () => {
        if (supabase) {
          supabase.removeChannel(channel)
        }
      }
    } else {
      const checkOnlineStatus = async () => {
        try {
          const res = await fetch(`/api/users/${userId}`)
          if (res.ok) {
            const { user } = await res.json()
            if (user?.last_seen_at) {
              const lastSeen = new Date(user.last_seen_at).getTime()
              const now = Date.now()
              setIsOnline(now - lastSeen < 60000)
            } else {
              setIsOnline(false)
            }
          }
        } catch (error) {
          console.error('Failed to check online status:', error)
        }
      }

      checkOnlineStatus()
      const interval = setInterval(checkOnlineStatus, 15000)

      return () => clearInterval(interval)
    }
  }, [userId])

  return isOnline
}
