'use client'

import { useEffect, useState } from 'react'
import { IS_DOMESTIC_VERSION } from '@/config'

const ONLINE_WINDOW_MS = 60 * 1000
const ONLINE_POLL_INTERVAL_MS = 15 * 1000
const ONLINE_STATUS_CACHE_TTL_MS = 30 * 1000
const OFFLINE_STATUS_CACHE_TTL_MS = 5 * 1000
const ONLINE_STATUS_ERROR_TTL_MS = 10 * 1000
const PLACEHOLDER_USER_ID_PREFIX = '00000000-0000-0000-0000-'

const onlineStatusCache = new Map<string, { isOnline: boolean; updatedAt: number }>()
const onlineStatusErrorCache = new Map<string, number>()
const inFlightOnlineStatusRequests = new Map<string, Promise<boolean | undefined>>()

function isFetchableUserId(userId?: string): userId is string {
  if (!userId) return false
  const normalized = userId.trim()
  if (!normalized) return false
  if (normalized === 'placeholder-user') return false
  if (normalized.startsWith(PLACEHOLDER_USER_ID_PREFIX)) return false
  return true
}

function getCachedOnlineStatus(userId?: string): boolean | undefined {
  if (!isFetchableUserId(userId)) return undefined
  const cached = onlineStatusCache.get(userId)
  if (!cached) return undefined

  const ttl = cached.isOnline ? ONLINE_STATUS_CACHE_TTL_MS : OFFLINE_STATUS_CACHE_TTL_MS
  if (Date.now() - cached.updatedAt > ttl) {
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

function hasRecentOnlineStatusError(userId: string): boolean {
  const failedAt = onlineStatusErrorCache.get(userId)
  if (!failedAt) return false
  if (Date.now() - failedAt > ONLINE_STATUS_ERROR_TTL_MS) {
    onlineStatusErrorCache.delete(userId)
    return false
  }
  return true
}

function markOnlineStatusError(userId: string) {
  onlineStatusErrorCache.set(userId, Date.now())
}

async function fetchOnlineStatus(userId: string): Promise<boolean | undefined> {
  const cached = getCachedOnlineStatus(userId)
  if (typeof cached === 'boolean') return cached

  if (hasRecentOnlineStatusError(userId)) {
    return undefined
  }

  const inFlight = inFlightOnlineStatusRequests.get(userId)
  if (inFlight) {
    return inFlight
  }

  const request = (async () => {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        cache: 'no-store',
      })

      if (!res.ok) {
        markOnlineStatusError(userId)
        return undefined
      }

      const { user } = await res.json()
      const normalizedStatus = String(user?.status || '').toLowerCase()
      const statusSaysOnline =
        normalizedStatus === 'online' ||
        normalizedStatus === 'away' ||
        normalizedStatus === 'busy'

      const hasLastSeen = Boolean(user?.last_seen_at)
      const onlineByLastSeen = hasLastSeen
        ? Date.now() - new Date(user.last_seen_at).getTime() < ONLINE_WINDOW_MS
        : false
      const nextIsOnline = statusSaysOnline || onlineByLastSeen

      setCachedOnlineStatus(userId, nextIsOnline)
      onlineStatusErrorCache.delete(userId)
      return nextIsOnline
    }
    catch {
      markOnlineStatusError(userId)
      return undefined
    }
    finally {
      inFlightOnlineStatusRequests.delete(userId)
    }
  })()

  inFlightOnlineStatusRequests.set(userId, request)
  return request
}

export function useOnlineStatus(
  userId?: string,
  regionHint?: 'cn' | 'global'
) {
  const [isOnline, setIsOnline] = useState<boolean>(() => getCachedOnlineStatus(userId) ?? false)

  useEffect(() => {
    if (!isFetchableUserId(userId)) {
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
      const nextIsOnline = await fetchOnlineStatus(userId)
      if (!disposed && typeof nextIsOnline === 'boolean') {
        setIsOnline((prev) => (prev === nextIsOnline ? prev : nextIsOnline))
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
