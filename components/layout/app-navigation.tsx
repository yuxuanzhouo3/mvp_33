'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
}

export function AppNavigation({ totalUnreadCount = 0 }: AppNavigationProps) {
  const pathname = usePathname()
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0)

  // 获取待审批申请数量
  const fetchPendingRequestsCount = useCallback(async () => {
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

      const response = await fetch(`/api/workspace-join-requests?workspaceId=${workspace.id}`)
      const data = await response.json()

      if (data.success && data.requests) {
        setPendingRequestsCount(data.requests.length)
      } else {
        setPendingRequestsCount(0)
      }
    } catch (error) {
      console.error('[AppNavigation] Failed to fetch pending requests:', error)
      setPendingRequestsCount(0)
    }
  }, [])

  // 初始化和定时刷新
  useEffect(() => {
    fetchPendingRequestsCount()

    let interval: ReturnType<typeof setInterval>
    const setupInterval = () => {
      if (interval) {
        clearInterval(interval)
      }

      const refreshInterval = document.visibilityState === 'visible' ? 5000 : 15000
      interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          fetchPendingRequestsCount()
        }
      }, refreshInterval)
    }

    setupInterval()

    // 监听自定义事件，当有新申请或审批操作时刷新
    const handleRefresh = () => {
      // 添加小延迟确保数据库已更新
      setTimeout(fetchPendingRequestsCount, 100)
    }

    const handleVisibilityChange = () => {
      setupInterval()
      if (document.visibilityState === 'visible') {
        fetchPendingRequestsCount()
      }
    }

    const handleFocus = () => {
      fetchPendingRequestsCount()
    }

    window.addEventListener('pendingRequestsUpdated', handleRefresh)
    window.addEventListener('workspaceJoinRequestsUpdated', handleRefresh)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('pendingRequestsUpdated', handleRefresh)
      window.removeEventListener('workspaceJoinRequestsUpdated', handleRefresh)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchPendingRequestsCount])

  const isActive = (href: string) => {
    return pathname === href || pathname?.startsWith(href + '/')
  }

  return (
    <div className="w-32 border-r bg-background flex flex-col py-4 gap-1">
      {navItems.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href)
        const showChatBadge = item.href === '/chat' && totalUnreadCount > 0
        const showPendingBadge = item.href === '/workspace-members' && pendingRequestsCount > 0

        return (
          <Link key={item.href} href={item.href} className="w-full">
            <Button
              variant="ghost"
              className={cn(
                'w-full h-12 flex items-center justify-start gap-3 px-4 rounded-lg transition-colors relative',
                active && 'bg-primary/10 text-primary hover:bg-primary/15'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
              {showChatBadge && (
                <Badge
                  variant="destructive"
                  className="absolute right-2 h-5 px-2 flex items-center justify-center text-xs font-medium"
                >
                  {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
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
            </Button>
          </Link>
        )
      })}
    </div>
  )
}
