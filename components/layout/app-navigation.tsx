'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { MessageSquare, Users, Hash, Settings } from 'lucide-react'
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

export function AppNavigation() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    return pathname === href || pathname?.startsWith(href + '/')
  }

  return (
    <div className="w-32 border-r bg-background flex flex-col py-4 gap-1">
      {navItems.map((item) => {
        const Icon = item.icon
        const active = isActive(item.href)

        return (
          <Link key={item.href} href={item.href} className="w-full">
            <Button
              variant="ghost"
              className={cn(
                'w-full h-12 flex items-center justify-start gap-3 px-4 rounded-lg transition-colors',
                active && 'bg-primary/10 text-primary hover:bg-primary/15'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">{item.label}</span>
            </Button>
          </Link>
        )
      })}
    </div>
  )
}
