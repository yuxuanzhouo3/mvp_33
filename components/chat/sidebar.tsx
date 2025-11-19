'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ConversationWithDetails, User } from '@/lib/types'
import { Hash, Lock, Users, Search, Plus, MessageSquare, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, Pin, PinOff, EyeOff, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'

interface ConversationItemProps {
  conversation: ConversationWithDetails
  display: { name: string; avatar?: string; subtitle: string }
  isActive: boolean
  onSelect: () => void
  getConversationIcon: (type: string, isPrivate: boolean) => React.ReactNode
  formatTimestamp: (date: string) => string
  expanded?: boolean
  onPinConversation?: (id: string) => void
  onUnpinConversation?: (id: string) => void
  onHideConversation?: (id: string) => void
  onDeleteConversation?: (id: string) => void
}

function ConversationItem({
  conversation,
  display,
  isActive,
  onSelect,
  getConversationIcon,
  formatTimestamp,
  expanded = false,
  onPinConversation,
  onUnpinConversation,
  onHideConversation,
  onDeleteConversation
}: ConversationItemProps) {
  const containerRef = useRef<HTMLButtonElement>(null)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={containerRef}
          onClick={onSelect}
          className={cn(
            'w-full flex items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent',
            isActive && 'bg-accent',
            conversation.is_hidden && 'opacity-50'
          )}
        >
      <div className="relative shrink-0">
        {conversation.type === 'direct' ? (
          <Avatar className="h-10 w-10">
            <AvatarImage src={display.avatar || "/placeholder.svg"} />
            <AvatarFallback>
              {display.name.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            {getConversationIcon(conversation.type, conversation.is_private)}
          </div>
        )}
        {conversation.unread_count > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
          >
            {conversation.unread_count}
          </Badge>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {conversation.is_pinned && (
              <Pin className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <span
              className="font-medium truncate min-w-0"
              title={display.name} // 显示完整名称的提示
            >
              {display.name}
            </span>
          </div>
          {conversation.last_message_at && (
            <span className="text-xs text-muted-foreground shrink-0">
              {formatTimestamp(conversation.last_message_at)}
            </span>
          )}
        </div>
        <p 
          className={cn(
            "text-sm text-muted-foreground",
            expanded 
              ? "line-clamp-2" // 展开时最多显示2行，超出部分用省略号
              : "truncate" // 收起时单行截断
          )}
        >
          {conversation.last_message?.content || display.subtitle}
        </p>
      </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {conversation.is_pinned ? (
          onUnpinConversation && (
            <ContextMenuItem onClick={() => onUnpinConversation(conversation.id)}>
              <PinOff className="h-4 w-4 mr-2" />
              Unpin
            </ContextMenuItem>
          )
        ) : (
          onPinConversation && (
            <ContextMenuItem onClick={() => onPinConversation(conversation.id)}>
              <Pin className="h-4 w-4 mr-2" />
              Pin
            </ContextMenuItem>
          )
        )}
        {conversation.is_hidden ? (
          onHideConversation && (
            <ContextMenuItem onClick={() => onHideConversation(conversation.id)}>
              <EyeOff className="h-4 w-4 mr-2" />
              Show
            </ContextMenuItem>
          )
        ) : (
          onHideConversation && (
            <ContextMenuItem onClick={() => onHideConversation(conversation.id)}>
              <EyeOff className="h-4 w-4 mr-2" />
              Hide
            </ContextMenuItem>
          )
        )}
        {onDeleteConversation && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem 
              onClick={() => {
                if (confirm('Are you sure you want to delete this conversation?')) {
                  onDeleteConversation(conversation.id)
                }
              }}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}

interface SidebarProps {
  conversations: ConversationWithDetails[]
  currentConversationId?: string
  currentUser: User
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  expanded?: boolean
  onToggleExpand?: () => void
  onPinConversation?: (id: string) => void
  onUnpinConversation?: (id: string) => void
  onHideConversation?: (id: string) => void
  onDeleteConversation?: (id: string) => void
}

export function Sidebar({ 
  conversations, 
  currentConversationId, 
  currentUser,
  onSelectConversation,
  onNewConversation,
  expanded = false,
  onToggleExpand,
  onPinConversation,
  onUnpinConversation,
  onHideConversation,
  onDeleteConversation
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const router = useRouter()
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)
  
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [showScrollDownButton, setShowScrollDownButton] = useState(false)
  const [showScrollUpButton, setShowScrollUpButton] = useState(false)

  // Get the scroll container
  const getScrollContainer = (): HTMLDivElement | null => {
    if (viewportRef.current) return viewportRef.current
    
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement ||
                       scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement
      
      if (viewport) {
        viewportRef.current = viewport
        return viewport
      }
      
      // Fallback: find any scrollable div child
      const children = scrollAreaRef.current.querySelectorAll('div')
      for (const child of children) {
        const style = window.getComputedStyle(child)
        if (style.overflowY === 'auto' || style.overflowY === 'scroll' || 
            style.overflow === 'auto' || style.overflow === 'scroll') {
          viewportRef.current = child as HTMLDivElement
          return child as HTMLDivElement
        }
      }
    }
    return null
  }

  useEffect(() => {
    let scrollContainer: HTMLDivElement | null = null
    let resizeObserver: ResizeObserver | null = null
    let retryTimer: NodeJS.Timeout | null = null
    let checkTimer: NodeJS.Timeout | null = null
    let handleScroll: (() => void) | null = null

    const findAndSetupScroll = () => {
      scrollContainer = getScrollContainer()
      
      if (!scrollContainer) {
        retryTimer = setTimeout(findAndSetupScroll, 100)
        return
      }

      handleScroll = () => {
        if (!scrollContainer) return
        
        const scrollTop = scrollContainer.scrollTop
        const scrollHeight = scrollContainer.scrollHeight
        const clientHeight = scrollContainer.clientHeight
        
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
        const isNearTop = scrollTop < 100
        const isScrollable = scrollHeight > clientHeight
        
        setShowScrollDownButton(!isNearBottom && isScrollable)
        setShowScrollUpButton(!isNearTop && isScrollable)
      }

      scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
      checkTimer = setTimeout(handleScroll, 200)
      
      resizeObserver = new ResizeObserver(() => {
        if (handleScroll) {
          setTimeout(handleScroll, 100)
        }
      })
      resizeObserver.observe(scrollContainer)
    }

    const timer = setTimeout(findAndSetupScroll, 100)
    
    return () => {
      clearTimeout(timer)
      if (retryTimer) clearTimeout(retryTimer)
      if (checkTimer) clearTimeout(checkTimer)
      if (scrollContainer && handleScroll) {
        scrollContainer.removeEventListener('scroll', handleScroll)
      }
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
    }
  }, [conversations, searchQuery])

  const scrollToBottom = () => {
    const scrollContainer = getScrollContainer()
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth'
      })
      setShowScrollDownButton(false)
      setShowScrollUpButton(true)
    }
  }

  const scrollToTop = () => {
    const scrollContainer = getScrollContainer()
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: 0,
        behavior: 'smooth'
      })
      setShowScrollUpButton(false)
      setShowScrollDownButton(true)
    }
  }

  const scrollAreaCallbackRef = (node: HTMLDivElement | null) => {
    if (node) {
      scrollAreaRef.current = node
      setTimeout(() => {
        const viewport = node.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement
        if (viewport) {
          viewportRef.current = viewport
        }
      }, 50)
    }
  }

  const filteredConversations = conversations
    .filter(conv => !conv.is_hidden) // Filter out hidden conversations
    .sort((a, b) => {
      // Sort: pinned first, then by last_message_at
      if (a.is_pinned && !b.is_pinned) return -1
      if (!a.is_pinned && b.is_pinned) return 1
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0
      return bTime - aTime
    })
    .filter(conv => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return (
        conv.name?.toLowerCase().includes(query) ||
        conv.members.some(m => m.full_name.toLowerCase().includes(query))
      )
    })

  const getConversationDisplay = (conversation: ConversationWithDetails) => {
    if (conversation.type === 'direct') {
      const otherUser = conversation.members.find(m => m.id !== currentUser.id)
      return {
        name: otherUser?.full_name || 'Unknown User',
        avatar: otherUser?.avatar_url,
        subtitle: otherUser?.title || '',
      }
    }
    return {
      name: conversation.name || 'Unnamed',
      avatar: conversation.avatar_url,
      subtitle: `${conversation.members.length} members`,
    }
  }

  const getConversationIcon = (type: string, isPrivate: boolean) => {
    if (type === 'direct') return null
    if (type === 'group') return <Users className="h-4 w-4" />
    return isPrivate ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />
  }

  const formatTimestamp = (date: string) => {
    const now = new Date()
    const msgDate = new Date(date)
    const diffMs = now.getTime() - msgDate.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    return msgDate.toLocaleDateString()
  }

  return (
    <div className="flex h-full flex-col border-r bg-background relative">
      {/* Expand/Collapse button */}
      {onToggleExpand && (
        <Button
          size="icon"
          variant="outline"
          className="absolute -right-4 top-1/2 -translate-y-1/2 z-30 h-8 w-8 rounded-full bg-background border-2 shadow-lg hover:bg-accent hover:scale-110 transition-transform"
          onClick={onToggleExpand}
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          title={expanded ? '收起侧边栏' : '展开侧边栏'}
        >
          {expanded ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      )}
      
      {/* Search header */}
      <div className="border-b p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t('messages')}</h2>
          <Button 
            size="icon" 
            variant="ghost"
            onClick={onNewConversation}
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('searchConversations')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button 
          variant="outline" 
          className="w-full justify-start"
          onClick={() => router.push('/contacts')}
        >
          <Users className="h-4 w-4 mr-2" />
          {t('viewContacts')}
        </Button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        <ScrollArea 
          className="h-full" 
          ref={scrollAreaCallbackRef}
        >
          <div className="p-2">
            {filteredConversations.map((conversation) => {
              const display = getConversationDisplay(conversation)
              const isActive = conversation.id === currentConversationId

              return (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  display={display}
                  isActive={isActive}
                  onSelect={() => onSelectConversation(conversation.id)}
                  getConversationIcon={getConversationIcon}
                  formatTimestamp={formatTimestamp}
                  expanded={expanded}
                  onPinConversation={onPinConversation}
                  onUnpinConversation={onUnpinConversation}
                  onHideConversation={onHideConversation}
                  onDeleteConversation={onDeleteConversation}
                />
              )
            })}
          </div>
        </ScrollArea>

        {showScrollUpButton && (
          <Button
            onClick={scrollToTop}
            size="icon"
            variant="default"
            className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg z-20 bg-background border hover:bg-accent"
            aria-label="Scroll to top"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        )}
        {showScrollDownButton && (
          <Button
            onClick={scrollToBottom}
            size="icon"
            variant="default"
            className="absolute bottom-2 right-2 h-8 w-8 rounded-full shadow-lg z-20 bg-background border hover:bg-accent"
            aria-label="Scroll to bottom"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
