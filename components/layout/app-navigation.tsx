'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  MessageSquare,
  Users,
  Hash,
  Settings,
  Building2,
  Video,
  CalendarDays,
  FileText,
  ChevronLeft,
  ChevronRight,
  Search,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings-context'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface NavItem {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: {
    zh: string
    en: string
  }
  dividerAfter?: boolean
}

const navItems: NavItem[] = [
  {
    href: '/chat',
    icon: MessageSquare,
    label: { zh: '消息', en: 'Messages' },
  },
  {
    href: '/contacts',
    icon: Users,
    label: { zh: '联系人', en: 'Contacts' },
  },
  {
    href: '/workspace-members',
    icon: Building2,
    label: { zh: '工作区', en: 'Workspace' },
  },
  {
    href: '/channels',
    icon: Hash,
    label: { zh: '频道', en: 'Channels' },
    dividerAfter: true,
  },
  {
    href: '/meetings',
    icon: Video,
    label: { zh: '会议', en: 'Meetings' },
  },
  {
    href: '/calendar',
    icon: CalendarDays,
    label: { zh: '日历', en: 'Calendar' },
  },
  {
    href: '/docs',
    icon: FileText,
    label: { zh: '云文档', en: 'Docs' },
  },
]

// Mobile bottom tabs - primary 4 items + "More" popup
const mobileNavItems: NavItem[] = [
  {
    href: '/chat',
    icon: MessageSquare,
    label: { zh: '消息', en: 'Messages' },
  },
  {
    href: '/contacts',
    icon: Users,
    label: { zh: '联系人', en: 'Contacts' },
  },
  {
    href: '/workspace-members',
    icon: Building2,
    label: { zh: '工作区', en: 'Workspace' },
  },
  {
    href: '/channels',
    icon: Hash,
    label: { zh: '频道', en: 'Channels' },
  },
]

// Items shown in "More" popup on mobile
const mobileMoreItems: NavItem[] = [
  {
    href: '/meetings',
    icon: Video,
    label: { zh: '会议', en: 'Meetings' },
  },
  {
    href: '/calendar',
    icon: CalendarDays,
    label: { zh: '日历', en: 'Calendar' },
  },
  {
    href: '/docs',
    icon: FileText,
    label: { zh: '云文档', en: 'Docs' },
  },
  {
    href: '/settings',
    icon: Settings,
    label: { zh: '设置', en: 'Settings' },
  },
]

interface AppNavigationProps {
  totalUnreadCount?: number
  mobile?: boolean
}

export function AppNavigation({ totalUnreadCount, mobile = false }: AppNavigationProps) {
  const { language } = useSettings()
  const pathname = usePathname()
  const router = useRouter()
  const refreshInFlightRef = useRef(false)
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0)
  const [contactPendingCount, setContactPendingCount] = useState(0)
  const [chatUnreadCount, setChatUnreadCount] = useState(0)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  useEffect(() => {
    navItems.forEach((item) => {
      router.prefetch(item.href)
    })
  }, [router])

  // 从 localStorage 恢复侧边栏状态
  useEffect(() => {
    if (!mobile) {
      const saved = localStorage.getItem('sidebar_expanded')
      if (saved === 'true') setSidebarExpanded(true)
    }
  }, [mobile])

  const toggleSidebar = useCallback(() => {
    setSidebarExpanded((prev) => {
      const next = !prev
      localStorage.setItem('sidebar_expanded', String(next))
      return next
    })
  }, [])

  // 获取待审批申请数量
  const fetchPendingRequestsCount = useCallback(async (forceRefresh = false) => {
    try {
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

  // 获取联系人待处理请求数量
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

  // 获取聊天未读总数
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

    const handleRefresh = () => {
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

  const getBadgeCount = (href: string) => {
    if (href === '/chat') return effectiveChatUnreadCount
    if (href === '/contacts') return contactPendingCount
    if (href === '/workspace-members') return pendingRequestsCount
    return 0
  }

  // ============================================================
  // Mobile: bottom tab bar (4 primary + "More" popup)
  // ============================================================
  if (mobile) {
    const isMoreActive = mobileMoreItems.some(item => isActive(item.href))

    return (
      <nav className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="grid grid-cols-5 gap-0.5 px-1 pt-1 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
          {mobileNavItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            const badgeCount = getBadgeCount(item.href)

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
                    {badgeCount > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-2 -right-3 h-4 min-w-4 px-1 text-[10px] leading-none"
                      >
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </Badge>
                    )}
                  </span>
                  <span className="text-[10px] font-medium leading-none">{item.label[language]}</span>
                </Link>
              </Button>
            )
          })}

          {/* "More" popup */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  'relative h-14 w-full flex-col gap-1 rounded-lg px-1',
                  isMoreActive && 'bg-primary/10 text-primary hover:bg-primary/15'
                )}
              >
                <MoreHorizontal className="h-4 w-4 shrink-0" />
                <span className="text-[10px] font-medium leading-none">
                  {language === 'zh' ? '更多' : 'More'}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="end"
              sideOffset={8}
              className="w-44 p-1.5 rounded-xl shadow-lg"
            >
              <div className="flex flex-col gap-0.5">
                {mobileMoreItems.map((item) => {
                  const Icon = item.icon
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        active
                          ? 'bg-primary/10 text-primary'
                          : 'text-foreground hover:bg-muted'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label[language]}
                    </Link>
                  )
                })}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </nav>
    )
  }

  // ============================================================
  // Desktop: Feishu-style dark vertical sidebar
  // ============================================================
  const sidebarWidth = sidebarExpanded ? 'w-[180px]' : 'w-[72px]'

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={cn(
          'flex flex-col h-full transition-all duration-200 ease-in-out select-none',
          'bg-gradient-to-b from-[#1e1f2e] to-[#171827]',
          sidebarWidth
        )}
      >
        {/* Logo / Search area */}
        <div className="flex items-center justify-center h-14 px-2 shrink-0">
          {sidebarExpanded ? (
            <button
              onClick={() => router.push('/chat')}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg
                         text-slate-300 hover:bg-white/10 transition-colors text-sm font-medium"
            >
              <Search className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="truncate text-slate-400">
                {language === 'zh' ? '搜索' : 'Search'}
              </span>
            </button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => router.push('/chat')}
                  className="flex items-center justify-center w-10 h-10 rounded-lg
                             text-slate-400 hover:bg-white/10 hover:text-slate-200 transition-colors"
                >
                  <Search className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                {language === 'zh' ? '搜索' : 'Search'}
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Navigation items */}
        <nav className="flex-1 flex flex-col gap-0.5 px-2 py-1 overflow-y-auto scrollbar-hide">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            const badgeCount = getBadgeCount(item.href)

            const navButton = (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group relative flex items-center rounded-lg transition-all duration-150',
                  sidebarExpanded
                    ? 'h-10 px-3 gap-3'
                    : 'h-11 flex-col justify-center gap-1 px-1',
                  active
                    ? 'bg-white/15 text-white shadow-sm'
                    : 'text-slate-400 hover:bg-white/8 hover:text-slate-200'
                )}
              >
                <span className="relative shrink-0">
                  <Icon className={cn('transition-colors', sidebarExpanded ? 'h-[18px] w-[18px]' : 'h-5 w-5')} />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center
                                     h-4 min-w-4 px-1 rounded-full bg-red-500 text-[10px] font-bold text-white
                                     leading-none shadow-sm">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </span>

                {sidebarExpanded ? (
                  <span className="text-[13px] font-medium truncate">{item.label[language]}</span>
                ) : (
                  <span className="text-[10px] font-medium leading-none opacity-80">{item.label[language]}</span>
                )}
              </Link>
            )

            return (
              <div key={item.href}>
                {!sidebarExpanded ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {navButton}
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      {item.label[language]}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  navButton
                )}
                {item.dividerAfter && (
                  <div className="mx-3 my-2 border-t border-white/10" />
                )}
              </div>
            )
          })}
        </nav>

        {/* Bottom section: expand toggle + settings */}
        <div className="shrink-0 px-2 pb-3 pt-1 flex flex-col gap-1 border-t border-white/10">
          {/* Settings */}
          {sidebarExpanded ? (
            <Link
              href="/settings"
              className={cn(
                'flex items-center h-10 px-3 gap-3 rounded-lg transition-colors',
                isActive('/settings')
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:bg-white/8 hover:text-slate-200'
              )}
            >
              <Settings className="h-[18px] w-[18px] shrink-0" />
              <span className="text-[13px] font-medium">{language === 'zh' ? '设置' : 'Settings'}</span>
            </Link>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/settings"
                  className={cn(
                    'flex flex-col items-center justify-center h-11 rounded-lg transition-colors gap-1',
                    isActive('/settings')
                      ? 'bg-white/15 text-white'
                      : 'text-slate-400 hover:bg-white/8 hover:text-slate-200'
                  )}
                >
                  <Settings className="h-5 w-5" />
                  <span className="text-[10px] font-medium leading-none opacity-80">
                    {language === 'zh' ? '设置' : 'Settings'}
                  </span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-medium">
                {language === 'zh' ? '设置' : 'Settings'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Expand/Collapse toggle */}
          <button
            onClick={toggleSidebar}
            className="flex items-center justify-center h-8 rounded-lg
                       text-slate-500 hover:bg-white/8 hover:text-slate-300 transition-colors"
            title={sidebarExpanded
              ? (language === 'zh' ? '收起侧边栏' : 'Collapse sidebar')
              : (language === 'zh' ? '展开侧边栏' : 'Expand sidebar')
            }
          >
            {sidebarExpanded ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  )
}
