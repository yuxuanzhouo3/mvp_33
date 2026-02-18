'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { IS_DOMESTIC_VERSION } from '@/config'

export function SessionValidator() {
  const router = useRouter()
  const checkIntervalRef = useRef<NodeJS.Timeout>()

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
