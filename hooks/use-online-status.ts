'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function useOnlineStatus(userId?: string) {
  const [isOnline, setIsOnline] = useState(false)

  useEffect(() => {
    if (!userId) {
      setIsOnline(false)
      return
    }

    const isGlobal = process.env.NEXT_PUBLIC_FORCE_GLOBAL_DATABASE !== 'false'

    if (!isGlobal) {
      return
    }

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
  }, [userId])

  return isOnline
}
