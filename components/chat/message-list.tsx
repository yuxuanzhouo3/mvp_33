'use client'

import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageWithSender, User } from '@/lib/types'
import { cn } from '@/lib/utils'
import { File, ImageIcon, Video, Smile, ChevronDown, ChevronUp, MoreVertical, Edit2, Trash2, Pin, PinOff, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface MessageListProps {
  messages: MessageWithSender[]
  currentUser: User
  onEditMessage?: (messageId: string, content: string) => void
  onDeleteMessage?: (messageId: string) => void
  onAddReaction?: (messageId: string, emoji: string) => void
  onRemoveReaction?: (messageId: string, emoji: string) => void
  onPinMessage?: (messageId: string) => void
  onUnpinMessage?: (messageId: string) => void
}

export function MessageList({ 
  messages, 
  currentUser,
  onEditMessage,
  onDeleteMessage,
  onAddReaction,
  onRemoveReaction,
  onPinMessage,
  onUnpinMessage
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [showScrollDownButton, setShowScrollDownButton] = useState(false)
  const [showScrollUpButton, setShowScrollUpButton] = useState(false)
  const [lastMessageCount, setLastMessageCount] = useState(messages.length)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  // Get the scroll container
  const getScrollContainer = (): HTMLDivElement | null => {
    if (viewportRef.current) return viewportRef.current
    
    if (scrollAreaRef.current) {
      // Try different selectors in order of likelihood
      const viewport = scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement ||
                       scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement ||
                       scrollAreaRef.current.querySelector('div[style*="overflow"]') as HTMLDivElement
      
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
    const scrollContainer = getScrollContainer()
    if (scrollContainer) {
      if (messages.length > lastMessageCount) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
        setShowScrollDownButton(false)
      }
      setLastMessageCount(messages.length)
    }
  }, [messages, lastMessageCount])

  useEffect(() => {
    let scrollContainer: HTMLDivElement | null = null
    let resizeObserver: ResizeObserver | null = null
    let retryTimer: NodeJS.Timeout | null = null
    let checkTimer: NodeJS.Timeout | null = null
    let handleScroll: (() => void) | null = null

    // Wait for DOM to be ready and find the scroll container
    const findAndSetupScroll = () => {
      scrollContainer = getScrollContainer()
      
      if (!scrollContainer) {
        // Retry if not found
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
      // Initial check after a short delay to ensure layout is complete
      checkTimer = setTimeout(handleScroll, 200)
      
      // Also check on resize
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
  }, [messages])

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

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const formatDate = (date: string) => {
    const msgDate = new Date(date)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (msgDate.toDateString() === today.toDateString()) {
      return t('today')
    } else if (msgDate.toDateString() === yesterday.toDateString()) {
      return t('yesterday')
    } else {
      return msgDate.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { 
        month: 'long', 
        day: 'numeric',
        year: msgDate.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      })
    }
  }

  const shouldShowDateSeparator = (index: number) => {
    if (index === 0) return true
    const currentMsg = messages[index]
    const prevMsg = messages[index - 1]
    const currentDate = new Date(currentMsg.created_at).toDateString()
    const prevDate = new Date(prevMsg.created_at).toDateString()
    return currentDate !== prevDate
  }

  const shouldGroupWithPrevious = (index: number) => {
    if (index === 0) return false
    const currentMsg = messages[index]
    const prevMsg = messages[index - 1]
    
    // Same sender
    if (currentMsg.sender_id !== prevMsg.sender_id) return false
    
    // Within 5 minutes
    const timeDiff = new Date(currentMsg.created_at).getTime() - new Date(prevMsg.created_at).getTime()
    return timeDiff < 5 * 60 * 1000
  }

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="h-4 w-4" />
      case 'video': return <Video className="h-4 w-4" />
      default: return <File className="h-4 w-4" />
    }
  }

  const handleEdit = (message: MessageWithSender) => {
    setEditingMessageId(message.id)
    setEditContent(message.content)
  }

  const handleSaveEdit = () => {
    if (editingMessageId && editContent.trim() && onEditMessage) {
      onEditMessage(editingMessageId, editContent.trim())
      setEditingMessageId(null)
      setEditContent('')
    }
  }

  const handleDelete = (messageId: string) => {
    if (onDeleteMessage && confirm('Are you sure you want to delete this message?')) {
      onDeleteMessage(messageId)
    }
  }

  const handleReactionClick = (message: MessageWithSender, emoji: string) => {
    if (!onAddReaction || !onRemoveReaction) return
    
    const reaction = message.reactions.find(r => r.emoji === emoji)
    const hasReacted = reaction?.user_ids.includes(currentUser.id) || false
    
    if (hasReacted) {
      onRemoveReaction(message.id, emoji)
    } else {
      onAddReaction(message.id, emoji)
    }
  }

  const commonEmojis = ['👍', '❤️', '😂', '🎉', '🔥', '✅', '👋', '😍']

  const renderMessageReactions = (message: MessageWithSender) => {
    return (
      <div className="flex gap-1 mt-1 flex-wrap">
        {message.reactions && message.reactions.length > 0 && message.reactions.map((reaction, idx) => {
          const hasReacted = reaction.user_ids.includes(currentUser.id)
          return (
            <button
              key={idx}
              onClick={() => handleReactionClick(message, reaction.emoji)}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors",
                hasReacted 
                  ? "bg-primary/20 border border-primary/30" 
                  : "bg-accent hover:bg-accent/80"
              )}
            >
              <span>{reaction.emoji}</span>
              <span className="text-muted-foreground">{reaction.count}</span>
            </button>
          )
        })}
        {onAddReaction && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 rounded-full"
              >
                <Smile className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="grid grid-cols-4 gap-1 p-2">
                {commonEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => {
                      handleReactionClick(message, emoji)
                    }}
                    className="text-xl hover:bg-accent rounded p-1 transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    )
  }

  // Use a callback ref to capture the viewport
  const scrollAreaCallbackRef = (node: HTMLDivElement | null) => {
    if (node) {
      scrollAreaRef.current = node
      // Find viewport after a short delay to ensure it's rendered
      setTimeout(() => {
        const viewport = node.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement
        if (viewport) {
          viewportRef.current = viewport
        }
      }, 50)
    }
  }

  return (
    <div className="flex-1 relative overflow-hidden min-h-0">
      <ScrollArea 
        className="h-full w-full" 
        ref={scrollAreaCallbackRef}
      >
        <div className="p-6">
          <div className="space-y-4 max-w-4xl mx-auto" ref={scrollRef}>
          {messages.map((message, index) => {
            const isOwn = message.sender_id === currentUser.id
            const grouped = shouldGroupWithPrevious(index)
            const showDate = shouldShowDateSeparator(index)

            return (
              <div key={message.id}>
                {showDate && (
                  <div className="flex items-center gap-4 my-6">
                    <div className="flex-1 border-t" />
                    <span className="text-xs text-muted-foreground font-medium">
                      {formatDate(message.created_at)}
                    </span>
                    <div className="flex-1 border-t" />
                  </div>
                )}

                <div className={cn('flex gap-3', isOwn && 'flex-row-reverse', grouped && 'mt-1')}>
                  {!grouped && !isOwn && (
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={message.sender.avatar_url || "/placeholder.svg"} />
                      <AvatarFallback>
                        {message.sender.full_name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  {grouped && !isOwn && <div className="w-8 shrink-0" />}

                  <div 
                    className={cn('flex flex-col', isOwn && 'items-end')}
                    onMouseEnter={() => setHoveredMessageId(message.id)}
                    onMouseLeave={() => setHoveredMessageId(null)}
                  >
                    {!grouped && !isOwn && (
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-semibold text-sm">
                          {message.sender.full_name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(message.created_at)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-end gap-2">
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <div
                            className={cn(
                              'rounded-2xl px-4 py-2 max-w-xl break-words relative group',
                              isOwn
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted',
                              message.type !== 'text' && 'p-2'
                            )}
                          >
                      {message.type === 'text' && (
                        <p className={cn(
                          "text-sm leading-relaxed",
                          message.is_deleted && "italic opacity-60"
                        )}>
                          {message.content}
                        </p>
                      )}

                      {message.type === 'image' && message.metadata?.file_url && (
                        <div className="space-y-2">
                          <img
                            src={message.metadata.thumbnail_url || message.metadata.file_url || "/placeholder.svg"}
                            alt={message.metadata.file_name || 'Image'}
                            className="rounded-lg max-w-sm"
                          />
                          {message.content && (
                            <p className="text-sm px-2">{message.content}</p>
                          )}
                        </div>
                      )}

                      {(message.type === 'file' || message.type === 'video') && (
                        <div className="flex items-center gap-3 p-2">
                          <div className="h-10 w-10 rounded bg-background/50 flex items-center justify-center">
                            {getFileIcon(message.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {message.metadata?.file_name || 'File'}
                            </p>
                            {message.metadata?.file_size && (
                              <p className="text-xs opacity-70">
                                {(message.metadata.file_size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            )}
                          </div>
                        </div>
                      )}

                        {message.is_edited && !message.is_deleted && (
                          <span className="text-xs opacity-70 ml-2">{t('edited')}</span>
                        )}
                        {message.is_pinned && (
                          <span className="text-xs opacity-70 ml-2 flex items-center gap-1">
                            <Pin className="h-3 w-3" />
                            Pinned
                          </span>
                        )}
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent>
                          {message.is_pinned ? (
                            onUnpinMessage && (
                              <ContextMenuItem onClick={() => onUnpinMessage(message.id)}>
                                <PinOff className="h-4 w-4 mr-2" />
                                Unpin Message
                              </ContextMenuItem>
                            )
                          ) : (
                            onPinMessage && (
                              <ContextMenuItem onClick={() => onPinMessage(message.id)}>
                                <Pin className="h-4 w-4 mr-2" />
                                Pin Message
                              </ContextMenuItem>
                            )
                          )}
                          {isOwn && message.type === 'text' && onEditMessage && (
                            <ContextMenuItem onClick={() => handleEdit(message)}>
                              <Edit2 className="h-4 w-4 mr-2" />
                              Edit
                            </ContextMenuItem>
                          )}
                          {isOwn && onDeleteMessage && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem 
                                onClick={() => handleDelete(message.id)}
                                variant="destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                      
                      {hoveredMessageId === message.id && !message.is_deleted && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align={isOwn ? 'end' : 'start'}>
                            {isOwn && message.type === 'text' && onEditMessage && (
                              <DropdownMenuItem onClick={() => handleEdit(message)}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {isOwn && onDeleteMessage && (
                              <DropdownMenuItem 
                                onClick={() => handleDelete(message.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            )}
                            {onAddReaction && (
                              <DropdownMenuItem onClick={() => handleReactionClick(message, '👍')}>
                                <Smile className="h-4 w-4 mr-2" />
                                Add Reaction
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    {renderMessageReactions(message)}
                  </div>
                </div>
              </div>
            )
          })}
          </div>
        </div>
      </ScrollArea>

      {showScrollUpButton && (
        <Button
          onClick={scrollToTop}
          size="icon"
          variant="default"
          className="absolute top-6 right-6 h-10 w-10 rounded-full shadow-lg z-20 bg-background border hover:bg-accent"
          aria-label="Scroll to top"
        >
          <ChevronUp className="h-5 w-5" />
        </Button>
      )}
      {showScrollDownButton && (
        <Button
          onClick={scrollToBottom}
          size="icon"
          variant="default"
          className="absolute bottom-6 right-6 h-10 w-10 rounded-full shadow-lg z-20 bg-background border hover:bg-accent"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="h-5 w-5" />
        </Button>
      )}

      {/* Edit Message Dialog */}
      <Dialog open={editingMessageId !== null} onOpenChange={(open) => !open && setEditingMessageId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Message</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[100px]"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditingMessageId(null)
                  setEditContent('')
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveEdit} disabled={!editContent.trim()}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
