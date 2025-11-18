'use client'

import { useEffect, useRef, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MessageWithSender, User } from '@/lib/types'
import { cn } from '@/lib/utils'
import { File, ImageIcon, Video, Smile, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MessageListProps {
  messages: MessageWithSender[]
  currentUser: User
}

export function MessageList({ messages, currentUser }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [lastMessageCount, setLastMessageCount] = useState(messages.length)

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollContainer) {
        if (messages.length > lastMessageCount) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight
          setShowScrollButton(false)
        }
        setLastMessageCount(messages.length)
      }
    }
  }, [messages, lastMessageCount])

  useEffect(() => {
    const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    
    const handleScroll = () => {
      if (scrollContainer) {
        const isNearBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 100
        setShowScrollButton(!isNearBottom)
      }
    }

    scrollContainer?.addEventListener('scroll', handleScroll)
    return () => scrollContainer?.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToBottom = () => {
    const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]')
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight
      setShowScrollButton(false)
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
      return 'Today'
    } else if (msgDate.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    } else {
      return msgDate.toLocaleDateString('en-US', { 
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

  const renderMessageReactions = (message: MessageWithSender) => {
    if (!message.reactions || message.reactions.length === 0) return null

    return (
      <div className="flex gap-1 mt-1">
        {message.reactions.map((reaction, idx) => (
          <button
            key={idx}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent hover:bg-accent/80 text-xs"
          >
            <span>{reaction.emoji}</span>
            <span className="text-muted-foreground">{reaction.count}</span>
          </button>
        ))}
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 rounded-full"
        >
          <Smile className="h-3 w-3" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex-1 relative">
      <ScrollArea className="h-full p-6" ref={scrollAreaRef}>
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

                  <div className={cn('flex flex-col', isOwn && 'items-end')}>
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

                    <div
                      className={cn(
                        'rounded-2xl px-4 py-2 max-w-xl break-words',
                        isOwn
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted',
                        message.type !== 'text' && 'p-2'
                      )}
                    >
                      {message.type === 'text' && (
                        <p className="text-sm leading-relaxed">{message.content}</p>
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

                      {message.is_edited && (
                        <span className="text-xs opacity-70 ml-2">(edited)</span>
                      )}
                    </div>

                    {renderMessageReactions(message)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      {showScrollButton && (
        <Button
          onClick={scrollToBottom}
          size="icon"
          className="absolute bottom-6 right-6 h-10 w-10 rounded-full shadow-lg z-10"
        >
          <ChevronDown className="h-5 w-5" />
        </Button>
      )}
    </div>
  )
}
