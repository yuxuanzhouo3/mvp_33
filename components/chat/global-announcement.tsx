'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Bell, X, Pin, Send, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

interface Announcement {
  id: number
  title: string
  content: string
  author: string
  time: string
  pinned: boolean
}

// 模拟数据
const MOCK_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 1,
    title: '欢迎使用 MornScience 协作平台',
    content: '各位同事，大家好！MornScience 协作平台正式上线，欢迎大家使用。如有问题请联系管理员。',
    author: '管理员',
    time: '2024-01-15 10:00',
    pinned: true
  },
  {
    id: 2,
    title: '关于春节假期安排',
    content: '春节期间放假安排如下：2月9日至2月15日放假调休，共7天。请大家提前安排好工作。',
    author: '管理员',
    time: '2024-01-20 14:30',
    pinned: true
  },
  {
    id: 3,
    title: '系统维护通知',
    content: '本周六凌晨2:00-4:00将进行系统维护，届时部分功能可能不可用，请提前做好准备。',
    author: '技术部',
    time: '2024-01-18 09:15',
    pinned: false
  }
]

interface GlobalAnnouncementProps {
  isOpen: boolean
  onClose: () => void
}

export function GlobalAnnouncement({ isOpen, onClose }: GlobalAnnouncementProps) {
  const [announcements] = useState<Announcement[]>(MOCK_ANNOUNCEMENTS)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  if (!isOpen) return null

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="h-16 border-b flex items-center justify-between px-6 bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <Bell size={20} />
          </div>
          <div>
            <div className="font-bold flex items-center">
              {t('globalAnnouncement')}
            </div>
            <div className="text-xs text-muted-foreground">
              {language === 'zh' ? '官方发布' : 'Official Release'}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-accent rounded-full text-muted-foreground transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Announcements List */}
      <ScrollArea className="flex-1 p-6">
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <div
              key={announcement.id}
              className={cn(
                "rounded-xl border p-4 transition-all hover:shadow-md",
                announcement.pinned ? "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800" : "bg-card"
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {announcement.pinned && (
                    <Pin className="h-4 w-4 text-blue-500" />
                  )}
                  <h3 className="font-semibold text-lg">{announcement.title}</h3>
                </div>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                {announcement.content}
              </p>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                    <Shield className="h-3 w-3 text-blue-600" />
                  </div>
                  <span>{announcement.author}</span>
                </div>
                <span>{announcement.time}</span>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t bg-background">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>
            {language === 'zh'
              ? '公告内容由管理员发布'
              : 'Announcements are posted by administrators'}
          </span>
        </div>
      </div>
    </div>
  )
}
