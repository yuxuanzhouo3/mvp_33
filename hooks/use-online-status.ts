'use client'

import { useEffect, useState } from 'react'
import { IS_DOMESTIC_VERSION } from '@/config'

const ONLINE_WINDOW_MS = 60 * 1000
const ONLINE_POLL_INTERVAL_MS = 15 * 1000
const ONLINE_STATUS_CACHE_TTL_MS = 2 * 60 * 1000

const onlineStatusCache = new Map<string, { isOnline: boolean; updatedAt: number }>()

function getCachedOnlineStatus(userId?: string): boolean | undefined {
  if (!userId) return undefined
  const cached = onlineStatusCache.get(userId)
  if (!cached) return undefined

  if (Date.now() - cached.updatedAt > ONLINE_STATUS_CACHE_TTL_MS) {
    onlineStatusCache.delete(userId)
    return undefined
  }

  return cached.isOnline
}

function setCachedOnlineStatus(userId: string, isOnline: boolean) {
  onlineStatusCache.set(userId, {
    isOnline,
    updatedAt: Date.now(),
  })
}

export function useOnlineStatus(
  userId?: string,
  regionHint?: 'cn' | 'global'
) {
  const [isOnline, setIsOnline] = useState<boolean>(() => getCachedOnlineStatus(userId) ?? false)

  useEffect(() => {
    if (!userId) {
      setIsOnline(false)
      return
    }

    // Keep region resolution for compatibility with existing callers.
    const resolvedRegion = regionHint || (IS_DOMESTIC_VERSION ? 'cn' : 'global')
    if (!resolvedRegion) return

    const cached = getCachedOnlineStatus(userId)
    if (typeof cached === 'boolean') {
      setIsOnline(cached)
    }

    let disposed = false

    const checkOnlineStatus = async () => {
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
          cache: 'no-store',
        })

        if (!res.ok) return

        const { user } = await res.json()
        const hasLastSeen = Boolean(user?.last_seen_at)
        const nextIsOnline = hasLastSeen
          ? Date.now() - new Date(user.last_seen_at).getTime() < ONLINE_WINDOW_MS
          : false

        if (!disposed) {
          setIsOnline((prev) => (prev === nextIsOnline ? prev : nextIsOnline))
          setCachedOnlineStatus(userId, nextIsOnline)
        }
      }
      catch (error) {
        console.error('Failed to check online status:', error)
      }
    }

    void checkOnlineStatus()
    const interval = setInterval(() => {
      void checkOnlineStatus()
    }, ONLINE_POLL_INTERVAL_MS)

    return () => {
      disposed = true
      clearInterval(interval)
    }
  }, [userId, regionHint])

  return isOnline
}
