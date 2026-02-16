'use client'

import { cn } from '@/lib/utils'
import { MessageSquare, Megaphone, FileText, Pin, FolderOpen } from 'lucide-react'

interface ChatTabsProps {
  activeTab: string
  onTabChange: (tab: string) => void
  className?: string
}

export function ChatTabs({ activeTab, onTabChange, className }: ChatTabsProps) {
  const tabs = [
    { id: 'messages', label: '消息', icon: MessageSquare },
    { id: 'announcements', label: '群公告', icon: Megaphone },
    { id: 'files', label: '文件', icon: FolderOpen },
  ]

  return (
    <div className={cn('border-b bg-background', className)}>
      <div className="flex items-center px-4">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors relative',
                'hover:text-foreground',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
