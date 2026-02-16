'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ConversationWithDetails, User } from '@/lib/types'
import { Hash, Lock, Users, Search, Plus, MessageSquare, ChevronUp, ChevronDown, ChevronRight, ChevronLeft, Pin, PinOff, EyeOff, Trash2, Loader2 } from 'lucide-react'
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
import { CreateGroupDialog } from './create-group-dialog'

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
  currentUser: User
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
  onDeleteConversation,
  currentUser
}: ConversationItemProps) {
  const containerRef = useRef<HTMLButtonElement>(null)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const getLastMessagePreview = () => {
    const lastMessage = conversation.last_message
    if (!lastMessage) {
      return display.subtitle
    }

    if (lastMessage.is_deleted) {
      return t('messageDeleted')
    }

    if (lastMessage.is_recalled) {
      return t('messageRecalled')
    }

    switch (lastMessage.type) {
      case 'image':
        return t('messageTypeImage')
      case 'video':
        return t('messageTypeVideo')
      case 'audio':
        return t('messageTypeAudio')
      case 'file':
        return `${t('messageTypeFile')} ${lastMessage.metadata?.file_name || ''}`
      case 'code':
        return t('messageTypeCode')
      case 'system':
        return lastMessage.content || t('systemMessage')
      default:
        break
    }

    if (lastMessage.content?.trim()) {
      return lastMessage.content
    }

    if (lastMessage.metadata?.file_name) {
      return `📎 ${lastMessage.metadata.file_name}`
    }

    return display.subtitle
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          ref={containerRef}
          onClick={onSelect}
          className={cn(
            'w-full flex items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/50',
            isActive && 'bg-accent',
            conversation.is_hidden && 'opacity-50'
          )}
        >
      <div className="relative shrink-0">
        {conversation.type === 'direct' ? (
          <Avatar className="h-10 w-10 rounded-lg" userId={conversation.members.find(m => m.id !== currentUser.id)?.id} showOnlineStatus={true}>
            <AvatarImage src={display.avatar || undefined} />
            <AvatarFallback name={display.name}>
              {display.name.split(' ').map(n => n[0]).join('')}
            </AvatarFallback>
          </Avatar>
        ) : (
          <Avatar className="h-10 w-10 rounded-lg">
            <AvatarImage src={conversation.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10">
              {getConversationIcon(conversation.type, conversation.is_private)}
            </AvatarFallback>
          </Avatar>
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
              className="font-semibold text-sm truncate min-w-0"
              title={display.name}
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
              ? "line-clamp-2"
              : "truncate"
          )}
        >
          {getLastMessagePreview()}
        </p>
      </div>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {conversation.is_pinned ? (
          onUnpinConversation && (
            <ContextMenuItem onClick={() => onUnpinConversation(conversation.id)}>
              <PinOff className="h-4 w-4 mr-2" />
              {t('unpinMessage')}
            </ContextMenuItem>
          )
        ) : (
          onPinConversation && (
            <ContextMenuItem onClick={() => onPinConversation(conversation.id)}>
              <Pin className="h-4 w-4 mr-2" />
              {t('pinMessage')}
            </ContextMenuItem>
          )
        )}
        {conversation.is_hidden ? (
          onHideConversation && (
            <ContextMenuItem onClick={() => onHideConversation(conversation.id)}>
              <EyeOff className="h-4 w-4 mr-2" />
              {t('show')}
            </ContextMenuItem>
          )
        ) : (
          onHideConversation && (
            <ContextMenuItem onClick={() => onHideConversation(conversation.id)}>
              <EyeOff className="h-4 w-4 mr-2" />
              {t('hideMessage')}
            </ContextMenuItem>
          )
        )}
        {onDeleteConversation && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem 
              onClick={() => {
                const isDirect = conversation.type === 'direct'
                const confirmMessage = isDirect 
                  ? t('deleteConversationDescriptionDirect')
                  : t('deleteConversationDescriptionGroup')
                if (confirm(confirmMessage)) {
                  onDeleteConversation(conversation.id)
                }
              }}
              variant="destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('delete')}
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
  isLoadingConversations?: boolean
  isRefreshingConversations?: boolean // For small loading indicator at top
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  expanded?: boolean
  onToggleExpand?: () => void
  isMobile?: boolean
  isMobileOpen?: boolean
  onToggleMobile?: () => void
  onPinConversation?: (id: string) => void
  onUnpinConversation?: (id: string) => void
  onHideConversation?: (id: string) => void
  onDeleteConversation?: (id: string) => void
  contacts?: User[]
  workspaceId?: string
}

export function Sidebar({
  conversations,
  currentConversationId,
  currentUser,
  isLoadingConversations = false,
  isRefreshingConversations = false,
  onSelectConversation,
  onNewConversation,
  expanded = false,
  onToggleExpand,
  isMobile = false,
  isMobileOpen = true,
  onToggleMobile,
  onPinConversation,
  onUnpinConversation,
  onHideConversation,
  onDeleteConversation,
  contacts = [],
  workspaceId = ''
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateGroupDialog, setShowCreateGroupDialog] = useState(false)
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
    .filter(conv => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return (
        conv.name?.toLowerCase().includes(query) ||
        conv.members.some(m => m.full_name.toLowerCase().includes(query))
      )
    })
    // 最终兜底排序：保证任何情况下「置顶的一定在没置顶的上面」
    // 注意：如果 conversations 已经通过 applyPinnedOrdering 排序过，这里不应该再改变顺序
    // 但为了安全起见，我们仍然做一次排序，确保置顶的在上面
    .sort((a, b) => {
      // 1. 先按是否置顶：置顶永远在未置顶前面
      if (!!a.is_pinned !== !!b.is_pinned) {
        return a.is_pinned ? -1 : 1
      }

      // 2. 如果都是置顶的，按 pinned_at 时间倒序（最近 pin 的在前）
      if (a.is_pinned && b.is_pinned) {
        if (a.pinned_at && b.pinned_at) {
          const aPinnedTime = new Date(a.pinned_at).getTime()
          const bPinnedTime = new Date(b.pinned_at).getTime()
          return bPinnedTime - aPinnedTime // 倒序：最新的在前
        }
        // 如果只有一个有 pinned_at，有 pinned_at 的在前
        if (a.pinned_at && !b.pinned_at) return -1
        if (!a.pinned_at && b.pinned_at) return 1
        // 如果都没有 pinned_at，保持原有顺序（不改变）
        return 0
      }

      // 3. 如果都不是置顶的，按最后一条消息时间 / 创建时间倒序
      const aTime = a.last_message_at
        ? new Date(a.last_message_at).getTime()
        : a.created_at
          ? new Date(a.created_at).getTime()
          : 0
      const bTime = b.last_message_at
        ? new Date(b.last_message_at).getTime()
        : b.created_at
          ? new Date(b.created_at).getTime()
          : 0
      const diff = bTime - aTime
      if (diff !== 0) return diff

      // 4. 时间相同按 id 稳定排序，避免来回抖动
      return a.id.localeCompare(b.id)
    })

  const getConversationDisplay = (conversation: ConversationWithDetails) => {
    if (conversation.type === 'direct') {
      // 自聊：members 里只有自己一个人，或者找不到“对方”，就用 currentUser 来展示
      let otherUser = conversation.members.find(m => m.id !== currentUser.id)
      if (!otherUser) {
        otherUser = currentUser
      }
      return {
        name: otherUser?.full_name || otherUser?.username || otherUser?.email || 'User',
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

  // 计算总未读消息数量
  const totalUnreadCount = conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0)

  return (
    <div className="flex h-full flex-col border-r bg-background relative z-50">
      {/* Mobile expand button (shown when collapsed) */}
      {isMobile && !isMobileOpen && onToggleMobile && (
        <button
          onClick={onToggleMobile}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-50 h-10 w-10 flex items-center justify-center bg-background border-r border-t border-b rounded-r-lg shadow-lg hover:bg-accent transition-colors"
          aria-label="展开侧边栏"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
      
      {/* Content wrapper - hide content when mobile sidebar is collapsed */}
      <div className={cn("flex h-full flex-col", isMobile && !isMobileOpen && "opacity-0 pointer-events-none")}>
        {/* Expand/Collapse button (desktop only) */}
        {onToggleExpand && !isMobile && (
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
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{t('messages')}</h2>
            {totalUnreadCount > 0 && (
              <Badge
                variant="destructive"
                className="h-5 px-2 flex items-center justify-center text-xs font-medium"
              >
                {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
              </Badge>
            )}
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setShowCreateGroupDialog(true)}
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
      </div>

      {/* Refresh indicator (small loading bar at top) - Hidden for silent refresh */}
      {/* {isRefreshingConversations && !isLoadingConversations && (
        <div className="border-b bg-muted/30">
          <div className="h-1 bg-primary/20 relative overflow-hidden">
            <div className="h-full bg-primary/60 animate-pulse" style={{ width: '30%' }} />
          </div>
          <div className="px-4 py-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{t('refreshing')}</span>
          </div>
        </div>
      )} */}

      {/* Conversations list */}
      <div className="flex-1 relative overflow-hidden min-h-0">
        <ScrollArea 
          className="h-full" 
          ref={scrollAreaCallbackRef}
        >
          <div className="p-2">
            {isLoadingConversations ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 mb-4 animate-spin opacity-50" />
                <p className="text-sm">{t('loadingConversations')}</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <MessageSquare className="h-12 w-12 mb-4 opacity-50" />
                <p className="text-sm">{t('noConversationsYet')}</p>
                <p className="text-xs mt-2 opacity-75">{t('startNewConversation')}</p>
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const display = getConversationDisplay(conversation)
                const isActive = conversation.id === currentConversationId

                return (
                  <ConversationItem
                    key={conversation.id}
                    conversation={conversation}
                    display={display}
                    isActive={isActive}
                    onSelect={() => {
              onSelectConversation(conversation.id)
              // Close mobile sidebar when selecting a conversation
              if (isMobile && onToggleMobile) {
                onToggleMobile()
              }
            }}
                    getConversationIcon={getConversationIcon}
                    formatTimestamp={formatTimestamp}
                    expanded={expanded}
                    onPinConversation={onPinConversation}
                    onUnpinConversation={onUnpinConversation}
                    onHideConversation={onHideConversation}
                    onDeleteConversation={onDeleteConversation}
                    currentUser={currentUser}
                  />
                )
              })
            )}
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

      <CreateGroupDialog
        open={showCreateGroupDialog}
        onOpenChange={setShowCreateGroupDialog}
        contacts={contacts}
        workspaceId={workspaceId}
      />
    </div>
  )
}
