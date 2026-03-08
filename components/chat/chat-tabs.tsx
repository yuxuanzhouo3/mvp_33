'use client'

import { cn } from '@/lib/utils'
import { MessageSquare, Megaphone, FileText, Pin, FolderOpen } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'

interface ChatTabsProps {
  activeTab: string
  onTabChange: (tab: string) => void
  className?: string
}

export function ChatTabs({ activeTab, onTabChange, className }: ChatTabsProps) {
  const { language } = useSettings()
  const tabs = [
    { id: 'messages', label: language === 'zh' ? '消息' : 'Messages', icon: MessageSquare },
    { id: 'announcements', label: language === 'zh' ? '群公告' : 'Announcements', icon: Megaphone },
    { id: 'files', label: language === 'zh' ? '文件' : 'Files', icon: FolderOpen },
  ]

  return (
    <div className={cn('border-b bg-background', className)}>
      <div className="flex items-center px-2.5 md:px-4">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'flex items-center gap-1 px-2.5 py-2 text-[13px] font-medium transition-colors relative md:gap-1.5 md:px-3 md:py-2.5 md:text-sm',
                'hover:text-foreground',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              )}
            >
              <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
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
