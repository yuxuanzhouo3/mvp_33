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
    if (!resolvedRegion) return

    let stopped = false
    let failureCount = 0

    const sendHeartbeat = async () => {
      if (stopped) return
      try {
        const response = await fetch('/api/users/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        })

        if (!response.ok) {
          failureCount += 1
          if (failureCount >= 3) {
            stopped = true
          }
          return
        }

        failureCount = 0
      } catch (error) {
        failureCount += 1
        if (failureCount >= 3) {
          stopped = true
        }
      }
    }

    sendHeartbeat()
    const interval = setInterval(sendHeartbeat, 30000)

    return () => {
      stopped = true
      clearInterval(interval)
    }
  }, [userId, regionHint])
}
