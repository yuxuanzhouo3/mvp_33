'use client'

import { useEffect } from 'react'
import { IS_DOMESTIC_VERSION } from '@/config'

export function useHeartbeat(
  userId?: string,
  regionHint?: 'cn' | 'global'
) {
  useEffect(() => {
    if (!userId) return

    const resolvedRegion = regionHint || (IS_DOMESTIC_VERSION ? 'cn' : 'global')
    if (resolvedRegion !== 'cn') return

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
    const interval = setInterval(sendHeartbeat, 30000)

    return () => clearInterval(interval)
  }, [userId, regionHint])
}
