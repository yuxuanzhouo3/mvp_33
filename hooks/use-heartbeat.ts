'use client'

import { useEffect } from 'react'

export function useHeartbeat(userId?: string) {
  useEffect(() => {
    if (!userId) return

    const isGlobal = process.env.NEXT_PUBLIC_FORCE_GLOBAL_DATABASE !== 'false'
    if (isGlobal) return

    const sendHeartbeat = async () => {
      try {
        await fetch('/api/users/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        })
      } catch (error) {
        console.error('Heartbeat failed:', error)
      }
    }

    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, 60000)

    return () => clearInterval(interval)
  }, [userId])
}
