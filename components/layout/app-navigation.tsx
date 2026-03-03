'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, Users, Hash, Settings, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}

const navItems: NavItem[] = [
  {
    href: '/chat',
    icon: MessageSquare,
    label: '消息',
  },
  {
    href: '/contacts',
    icon: Users,
    label: '联系人',
  },
  {
    href: '/workspace-members',
    icon: Building2,
    label: '工作区',
  },
  {
    href: '/channels',
    icon: Hash,
    label: '频道',
  },
  {
    href: '/settings',
    icon: Settings,
    label: '设置',
  },
]

interface AppNavigationProps {
  totalUnreadCount?: number
  mobile?: boolean
}

export function AppNavigation({ totalUnreadCount, mobile = false }: AppNavigationProps) {
  const pathname = usePathname()
  const router = useRouter()
  const refreshInFlightRef = useRef(false)
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0)
  const [contactPendingCount, setContactPendingCount] = useState(0)
  const [chatUnreadCount, setChatUnreadCount] = useState(0)

  useEffect(() => {
    navItems.forEach((item) => {
      router.prefetch(item.href)
    })
  }, [router])

  // 获取待审批申请数量
  const fetchPendingRequestsCount = useCallback(async (forceRefresh = false) => {
    try {
      // 从 localStorage 获取当前工作区
      const workspaceStr = localStorage.getItem('chat_app_current_workspace')
      if (!workspaceStr) {
        setPendingRequestsCount(0)
        return
      }

      const workspace = JSON.parse(workspaceStr)
      if (!workspace?.id) {
        setPendingRequestsCount(0)
        return
      }

      const cacheKey = `pending_requests_count_${workspace.id}`
      const cacheTsKey = `pending_requests_count_ts_${workspace.id}`
      const cachedCount = localStorage.getItem(cacheKey)
      const cachedTs = localStorage.getItem(cacheTsKey)
      const cacheTtl = 10 * 1000

      if (!forceRefresh && cachedCount && cachedTs) {
        const age = Date.now() - parseInt(cachedTs, 10)
        if (age < cacheTtl) {
          setPendingRequestsCount(parseInt(cachedCount, 10) || 0)
          return
        }
      }

      const response = await fetch(`/api/workspace-join-requests?workspaceId=${workspace.id}`)
      const data = await response.json()

      if (data.success && data.requests) {
        const count = data.requests.length
        setPendingRequestsCount(count)
        localStorage.setItem(cacheKey, count.toString())
        localStorage.setItem(cacheTsKey, Date.now().toString())
      } else {
        setPendingRequestsCount(0)
      }
    } catch (error) {
      console.error('[AppNavigation] Failed to fetch pending requests:', error)
      setPendingRequestsCount(0)
    }
  }, [])

  // 获取联系人待处理请求数量（侧边栏联系人红点）
  const fetchContactPendingCount = useCallback(async (forceRefresh = false) => {
    try {
      const userStr = localStorage.getItem('chat_app_current_user')
      const user = userStr ? JSON.parse(userStr) : null
      if (!user?.id) {
        setContactPendingCount(0)
        return
      }

      const cacheKey = `contact_pending_count_${user.id}`
      const cacheTsKey = `contact_pending_count_ts_${user.id}`
      const cachedCount = localStorage.getItem(cacheKey)
      const cachedTs = localStorage.getItem(cacheTsKey)
      const cacheTtl = 1000

      if (!forceRefresh && cachedCount && cachedTs) {
        const age = Date.now() - parseInt(cachedTs, 10)
        if (age < cacheTtl) {
          setContactPendingCount(parseInt(cachedCount, 10) || 0)
          return
        }
      }

      const response = await fetch('/api/contact-requests?type=received&status=pending')
      const data = await response.json()

      if (response.ok && data?.requests) {
        const count = Array.isArray(data.requests) ? data.requests.length : 0
        setContactPendingCount(count)
        localStorage.setItem(cacheKey, count.toString())
        localStorage.setItem(cacheTsKey, Date.now().toString())
      } else {
        setContactPendingCount(0)
      }
    } catch (error) {
      console.error('[AppNavigation] Failed to fetch contact pending count:', error)
      setContactPendingCount(0)
    }
  }, [])

  // 获取聊天未读总数（不在聊天页时也能显示消息红点）
  const fetchChatUnreadCount = useCallback(async (forceRefresh = false) => {
    try {
      const userStr = localStorage.getItem('chat_app_current_user')
      const workspaceStr = localStorage.getItem('chat_app_current_workspace')
      const user = userStr ? JSON.parse(userStr) : null
      const workspace = workspaceStr ? JSON.parse(workspaceStr) : null

      if (!user?.id || !workspace?.id) {
        setChatUnreadCount(0)
        return
      }

      const cacheKey = `nav_chat_unread_${user.id}_${workspace.id}`
      const cacheTsKey = `nav_chat_unread_ts_${user.id}_${workspace.id}`
      const cachedCount = localStorage.getItem(cacheKey)
      const cachedTs = localStorage.getItem(cacheTsKey)
      const cacheTtl = 8 * 1000

      if (!forceRefresh && cachedCount && cachedTs) {
        const age = Date.now() - parseInt(cachedTs, 10)
        if (age < cacheTtl) {
          setChatUnreadCount(parseInt(cachedCount, 10) || 0)
          return
        }
      }

      // 先用本地 conversations 缓存做快速更新
      const convCacheKey = `conversations_${user.id}_${workspace.id}`
      const convCacheRaw = localStorage.getItem(convCacheKey)
      if (convCacheRaw) {
        try {
          const convs = JSON.parse(convCacheRaw)
          if (Array.isArray(convs)) {
            const count = convs.reduce((sum: number, conv: any) => sum + (conv.unread_count || 0), 0)
            setChatUnreadCount(count)
          }
        } catch (error) {
          console.warn('[AppNavigation] Failed to parse conversations cache:', error)
        }
      }

      const response = await fetch(`/api/conversations?workspaceId=${workspace.id}`, {
        cache: 'no-store',
      })
      const data = await response.json()
      if (response.ok && data?.success && Array.isArray(data.conversations)) {
        const count = data.conversations.reduce(
          (sum: number, conv: any) => sum + (conv.unread_count || 0),
          0
        )
        setChatUnreadCount(count)

        localStorage.setItem(cacheKey, count.toString())
        localStorage.setItem(cacheTsKey, Date.now().toString())

        // 同步更新 conversations 缓存，便于其他页面复用
        localStorage.setItem(convCacheKey, JSON.stringify(data.conversations))
        localStorage.setItem(`conversations_timestamp_${user.id}_${workspace.id}`, Date.now().toString())
      }
    } catch (error) {
      console.error('[AppNavigation] Failed to fetch chat unread count:', error)
    }
  }, [])

  // 初始化和定时刷新
  useEffect(() => {
    const runRefresh = async (forceRefresh = false) => {
      if (refreshInFlightRef.current) return
      refreshInFlightRef.current = true
      try {
        const tasks: Promise<unknown>[] = [
          fetchPendingRequestsCount(forceRefresh),
          fetchContactPendingCount(forceRefresh),
        ]
        if (totalUnreadCount === undefined) {
          tasks.push(fetchChatUnreadCount(forceRefresh))
        }
        await Promise.all(tasks)
      } finally {
        refreshInFlightRef.current = false
      }
    }

    void runRefresh()

    let interval: ReturnType<typeof setInterval>
    const setupInterval = () => {
      if (interval) {
        clearInterval(interval)
      }

      const refreshInterval = document.visibilityState === 'visible'
        ? (mobile ? 6000 : 3000)
        : (mobile ? 20000 : 12000)
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          void runRefresh()
        }
      }, refreshInterval)
    }

    setupInterval()

    // 监听自定义事件，当有新申请或审批操作时刷新
    const handleRefresh = () => {
      // 添加小延迟确保数据库已更新
      setTimeout(() => {
        void runRefresh(true)
      }, 100)
    }

    const handleVisibilityChange = () => {
      setupInterval()
      if (document.visibilityState === 'visible') {
        void runRefresh(true)
      }
    }

    const handleFocus = () => {
      void runRefresh(true)
    }

    window.addEventListener('pendingRequestsUpdated', handleRefresh)
    window.addEventListener('workspaceJoinRequestsUpdated', handleRefresh)
    window.addEventListener('friend-requests-updated', handleRefresh)
    window.addEventListener('conversationsUpdated', handleRefresh)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('pendingRequestsUpdated', handleRefresh)
      window.removeEventListener('workspaceJoinRequestsUpdated', handleRefresh)
      window.removeEventListener('friend-requests-updated', handleRefresh)
      window.removeEventListener('conversationsUpdated', handleRefresh)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchPendingRequestsCount, fetchContactPendingCount, fetchChatUnreadCount, totalUnreadCount, mobile])

  const isActive = (href: string) => {
    return pathname === href || pathname?.startsWith(href + '/')
  }

  const effectiveChatUnreadCount =
    typeof totalUnreadCount === 'number' ? totalUnreadCount : chatUnreadCount

  if (mobile) {
    return (
      <nav className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="grid grid-cols-5 gap-0.5 px-1 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            const showChatBadge = item.href === '/chat' && effectiveChatUnreadCount > 0
            const showContactBadge = item.href === '/contacts' && contactPendingCount > 0
            const showPendingBadge = item.href === '/workspace-members' && pendingRequestsCount > 0

            return (
              <Button
                key={item.href}
                asChild
                variant="ghost"
                className={cn(
                  'relative h-14 w-full flex-col gap-1 rounded-lg px-1',
                  active && 'bg-primary/10 text-primary hover:bg-primary/15'
                )}
              >
                <Link href={item.href}>
                  <span className="relative">
                    <Icon className="h-4 w-4 shrink-0" />
                    {showChatBadge && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-2 -right-3 h-4 min-w-4 px-1 text-[10px] leading-none"
                      >
                        {effectiveChatUnreadCount > 99 ? '99+' : effectiveChatUnreadCount}
                      </Badge>
                    )}
                    {showContactBadge && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-2 -right-3 h-4 min-w-4 px-1 text-[10px] leading-none"
                      >
                        {contactPendingCount > 99 ? '99+' : contactPendingCount}
                      </Badge>
                    )}
                    {showPendingBadge && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-2 -right-3 h-4 min-w-4 px-1 text-[10px] leading-none"
                      >
                        {pendingRequestsCount > 99 ? '99+' : pendingRequestsCount}
                      </Badge>
                    )}
                  </span>
                  <span className="text-[10px] font-medium leading-none">{item.label}</span>
                </Link>
              </Button>
            )
          })}
        </div>
      </nav>
    )
  }

  return (
    <div className="w-32 border-r bg-background flex flex-col py-4 gap-1">
      {navItems.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href)
        const showChatBadge = item.href === '/chat' && effectiveChatUnreadCount > 0
        const showContactBadge = item.href === '/contacts' && contactPendingCount > 0
        const showPendingBadge = item.href === '/workspace-members' && pendingRequestsCount > 0

        return (
          <Button
            key={item.href}
            asChild
            variant="ghost"
            className={cn(
              'w-full h-12 flex items-center justify-start gap-3 px-4 rounded-lg transition-colors relative',
              active && 'bg-primary/10 text-primary hover:bg-primary/15'
            )}
          >
            <Link href={item.href}>
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
              {showChatBadge && (
                <Badge
                  variant="destructive"
                  className="absolute right-2 h-5 px-2 flex items-center justify-center text-xs font-medium"
                >
                  {effectiveChatUnreadCount > 99 ? '99+' : effectiveChatUnreadCount}
                </Badge>
              )}
              {showContactBadge && (
                <Badge
                  variant="destructive"
                  className="absolute right-2 h-5 min-w-5 px-1.5 flex items-center justify-center text-xs font-medium"
                >
                  {contactPendingCount > 99 ? '99+' : contactPendingCount}
                </Badge>
              )}
              {showPendingBadge && (
                <Badge
                  variant="destructive"
                  className="absolute right-2 h-5 w-5 flex items-center justify-center p-0 text-xs font-medium"
                >
                  {pendingRequestsCount > 99 ? '99+' : pendingRequestsCount}
                </Badge>
              )}
            </Link>
          </Button>
        )
      })}
    </div>
  )
}
