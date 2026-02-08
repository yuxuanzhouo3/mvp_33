'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface SubscriptionInfo {
  type: 'free' | 'monthly' | 'yearly' | null
  expiresAt: string | null
  isActive: boolean
  daysRemaining: number | null
}

export interface UsageLimits {
  messagesUsed: number
  messagesLimit: number
  storageUsed: number // in MB
  storageLimit: number // in MB
  workspacesUsed: number
  workspacesLimit: number
  membersUsed: number
  membersLimit: number
}

export interface SubscriptionLimits {
  canSendMessage: boolean
  canCreateWorkspace: boolean
  canAddMember: boolean
  canUploadFile: (fileSize: number) => boolean
  canUseVideoCall: boolean
  canAccessHistory: boolean
  usage: UsageLimits
}

const FREE_LIMITS = {
  messages: 1000,
  storage: 1024, // 1GB in MB
  workspaces: 1,
  members: 10,
  fileSize: 10, // 10MB
  historyDays: 30,
}

const PRO_LIMITS = {
  messages: Infinity,
  storage: 102400, // 100GB in MB (monthly) / 1024000 (1TB for yearly)
  workspaces: Infinity,
  members: Infinity,
  fileSize: 500, // 500MB
  historyDays: Infinity,
}

const SUBSCRIPTION_CACHE_KEY = 'subscription_cache_v1'
const SUBSCRIPTION_CACHE_TTL = 1000 * 60 * 60 * 6 // 6 hours

const getDefaultSubscription = (): SubscriptionInfo => ({
  type: 'free',
  expiresAt: null,
  isActive: true,
  daysRemaining: null,
})

interface SubscriptionCachePayload {
  userId: string
  subscription: SubscriptionInfo
  timestamp: number
}

const readSubscriptionCache = (): SubscriptionCachePayload | null => {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(SUBSCRIPTION_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SubscriptionCachePayload
    if (!parsed?.userId || !parsed?.subscription) return null
    if (parsed.timestamp && Date.now() - parsed.timestamp > SUBSCRIPTION_CACHE_TTL) {
      return null
    }
    return parsed
  } catch (error) {
    console.warn('Failed to parse subscription cache:', error)
    return null
  }
}

const writeSubscriptionCache = (payload: SubscriptionCachePayload) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SUBSCRIPTION_CACHE_KEY, JSON.stringify(payload))
  } catch (error) {
    console.warn('Failed to write subscription cache:', error)
  }
}

const clearSubscriptionCache = () => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(SUBSCRIPTION_CACHE_KEY)
  } catch (error) {
    console.warn('Failed to clear subscription cache:', error)
  }
}

export function useSubscription() {
  // Initialize with default free subscription to show UI immediately
  const [subscription, setSubscription] = useState<SubscriptionInfo>(() => {
    const cached = readSubscriptionCache()
    if (cached?.subscription) {
      return cached.subscription
    }
    return getDefaultSubscription()
  })
  const [loading, setLoading] = useState(false) // Start with false to show UI immediately
  const [usage, setUsage] = useState<UsageLimits>({
    messagesUsed: 0,
    messagesLimit: FREE_LIMITS.messages,
    storageUsed: 0,
    storageLimit: FREE_LIMITS.storage,
    workspacesUsed: 0,
    workspacesLimit: FREE_LIMITS.workspaces,
    membersUsed: 0,
    membersLimit: FREE_LIMITS.members,
  })

  useEffect(() => {
    // Load subscription in background, don't block UI
    loadSubscription()
    loadUsage()
  }, [])

  const loadSubscription = async () => {
    // Set loading to true only when actually fetching
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setSubscription(getDefaultSubscription())
        clearSubscriptionCache()
        setLoading(false)
        return
      }

      const cached = readSubscriptionCache()
      if (cached?.userId && cached.userId !== user.id) {
        setSubscription(getDefaultSubscription())
      } else if (cached?.userId === user.id && cached.subscription) {
        setSubscription(cached.subscription)
      }

      // Region-aware subscription: read from /api/subscription (handles Supabase & CloudBase)
      const res = await fetch('/api/subscription', { cache: 'no-store' })
      if (!res.ok) {
        throw new Error(`Subscription API returned ${res.status}`)
      }
      const payload = await res.json()
      const data = payload?.data || {}

      const rawType = data.subscription_type as string | null | undefined
      const rawExpires = data.subscription_expires_at as string | null | undefined

      const subscriptionType: 'free' | 'monthly' | 'yearly' =
        rawType === 'monthly' || rawType === 'yearly' ? rawType : 'free'

      const expiresAt: string | null = rawExpires || null

      const isActive = !expiresAt || new Date(expiresAt) > new Date()
      const daysRemaining = expiresAt
        ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null

      const nextSubscription: SubscriptionInfo = {
        type: subscriptionType,
        expiresAt,
        isActive,
        daysRemaining: daysRemaining && daysRemaining > 0 ? daysRemaining : null,
      }

      setSubscription(nextSubscription)

      writeSubscriptionCache({
        userId: user.id,
        subscription: nextSubscription,
        timestamp: Date.now(),
      })

      // Update limits based on subscription
      if (isActive && (subscriptionType === 'monthly' || subscriptionType === 'yearly')) {
        const isYearly = subscriptionType === 'yearly'
        setUsage(prev => ({
          ...prev,
          messagesLimit: PRO_LIMITS.messages,
          storageLimit: isYearly ? 1024000 : PRO_LIMITS.storage,
          workspacesLimit: PRO_LIMITS.workspaces,
          membersLimit: PRO_LIMITS.members,
        }))
      }
    } catch (error) {
      console.error('Failed to load subscription:', error)
      setSubscription(getDefaultSubscription())
    } finally {
      setLoading(false)
    }
  }

  const loadUsage = async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) return

      // Call API to calculate actual usage statistics
      const response = await fetch('/api/usage')
      const data = await response.json()

      if (data.success && data.data) {
        setUsage(prev => ({
          ...prev,
          messagesUsed: data.data.messagesUsed || 0,
          storageUsed: data.data.storageUsed || 0, // Already in MB
          workspacesUsed: data.data.workspacesUsed || 0,
          membersUsed: data.data.membersUsed || 0,
        }))
      } else {
        // Fallback: try to calculate from Supabase directly
        const { count: messagesCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('sender_id', user.id)
          .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

        // Calculate storage from messages metadata
        const { data: messagesWithFiles } = await supabase
          .from('messages')
          .select('metadata')
          .eq('sender_id', user.id)
          .not('metadata', 'is', null)

        let totalStorageBytes = 0
        if (messagesWithFiles) {
          messagesWithFiles.forEach((msg: any) => {
            if (msg.metadata && typeof msg.metadata === 'object' && msg.metadata.file_size) {
              totalStorageBytes += msg.metadata.file_size || 0
            }
          })
        }
        const storageUsedMB = totalStorageBytes / (1024 * 1024)

        setUsage(prev => ({
          ...prev,
          messagesUsed: messagesCount || 0,
          storageUsed: Math.round(storageUsedMB * 100) / 100,
        }))
      }
    } catch (error) {
      console.error('Failed to load usage:', error)
    }
  }

  const getLimits = (): SubscriptionLimits => {
    const isPro = subscription.isActive && (subscription.type === 'monthly' || subscription.type === 'yearly')
    const limits = isPro ? PRO_LIMITS : FREE_LIMITS

    return {
      canSendMessage: isPro || usage.messagesUsed < usage.messagesLimit,
      canCreateWorkspace: isPro || usage.workspacesUsed < usage.workspacesLimit,
      canAddMember: isPro || usage.membersUsed < usage.membersLimit,
      canUploadFile: (fileSize: number) => {
        const fileSizeMB = fileSize / (1024 * 1024)
        return isPro || fileSizeMB <= limits.fileSize
      },
      canUseVideoCall: isPro,
      canAccessHistory: isPro || true, // Free users can access 30 days
      usage: {
        ...usage,
        messagesLimit: limits.messages,
        storageLimit: limits.storage,
        workspacesLimit: limits.workspaces,
        membersLimit: limits.members,
      },
    }
  }

  const refresh = async () => {
    setLoading(true)
    await Promise.all([loadSubscription(), loadUsage()])
    setLoading(false)
  }

  return {
    subscription,
    usage,
    limits: getLimits(),
    loading,
    refresh,
  }
}





