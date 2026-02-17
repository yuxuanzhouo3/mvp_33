'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Megaphone, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Announcement {
  id: string
  content: string
  created_at: string
  creator: {
    id: string
    full_name: string
    avatar_url: string | null
  }
}

interface AnnouncementBannerProps {
  conversationId: string
  isAdmin: boolean
  onOpenDrawer: () => void
}

export function AnnouncementBanner({
  conversationId,
  isAdmin,
  onOpenDrawer
}: AnnouncementBannerProps) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadLatestAnnouncement()
  }, [conversationId])

  const loadLatestAnnouncement = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/groups/${conversationId}/announcements`)
      if (response.ok) {
        const data = await response.json()
        if (data.announcements && data.announcements.length > 0) {
          setAnnouncement(data.announcements[0])
        }
      }
    } catch (error) {
      console.error('加载公告失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading || !announcement) return null

  const truncatedContent = announcement.content.slice(0, 50)
  const needsTruncation = announcement.content.length > 50

  return (
    <div className="border-b bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-500 px-4 py-3 transition-all duration-300">
      <div className="flex items-start gap-3">
        <Megaphone className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm text-foreground",
            !isExpanded && "line-clamp-1"
          )}>
            {isExpanded ? announcement.content : truncatedContent}
            {!isExpanded && needsTruncation && '...'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={onOpenDrawer}
            className="h-7 text-xs"
          >
            查看详情
          </Button>
          {needsTruncation && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-7 w-7"
            >
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
