'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { IS_DOMESTIC_VERSION } from '@/config'

export function useDeviceListener(currentSessionToken: string) {
  const router = useRouter()

  useEffect(() => {
    if (!currentSessionToken || IS_DOMESTIC_VERSION) return

    const supabase = createClient()

    const channel = supabase
      .channel(`device:${currentSessionToken}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'user_devices',
          filter: `session_token=eq.${currentSessionToken}`
        },
        () => {
          handleForceLogout()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [currentSessionToken])

  const handleForceLogout = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')

    toast.error('Your device has been signed out', {
      description: 'You have been signed out from another device'
    })

    router.push('/login')
  }
}
