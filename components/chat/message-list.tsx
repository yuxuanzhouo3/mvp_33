'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { ScrollArea } from '@/components/ui/scroll-area'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

import { MessageWithSender, User } from '@/lib/types'

import { cn } from '@/lib/utils'

import { File, ImageIcon, Video, Smile, ChevronDown, ChevronUp, Edit2, Trash2, Pin, PinOff, EyeOff, Reply, RotateCcw, Copy, Download, Eye, X, Phone, Clock, CheckCircle, XCircle, Bell } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { useSettings } from '@/lib/settings-context'

import { getTranslation } from '@/lib/i18n'
import { useIsMobile } from '@/hooks/use-mobile'

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

import { CodeBlock } from './code-block'
import { useToast } from '@/components/ui/use-toast'
import { MessageSkeleton } from './message-skeleton'


interface MessageListProps {

  messages: MessageWithSender[]

  currentUser: User

  isLoading?: boolean
  participantsById?: Record<string, User>

  onEditMessage?: (messageId: string, content: string) => void

  onDeleteMessage?: (messageId: string) => void

  onRecallMessage?: (messageId: string) => void

  onHideMessage?: (messageId: string) => void

  onAddReaction?: (messageId: string, emoji: string) => void

  onRemoveReaction?: (messageId: string, emoji: string) => void

  onPinMessage?: (messageId: string) => void

  onUnpinMessage?: (messageId: string) => void

  onReplyMessage?: (messageId: string) => void

}



export function MessageList({ 

  messages, 

  currentUser,

  isLoading = false,
  participantsById,

  onEditMessage,

  onDeleteMessage,

  onRecallMessage,

  onHideMessage,

  onAddReaction,

  onRemoveReaction,

  onPinMessage,

  onUnpinMessage,

  onReplyMessage

}: MessageListProps) {
  const router = useRouter()

  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const viewportRef = useRef<HTMLDivElement | null>(null)

  const [showScrollDownButton, setShowScrollDownButton] = useState(false)

  const [showScrollUpButton, setShowScrollUpButton] = useState(false)
  
  const [showFilePreview, setShowFilePreview] = useState<{ url: string; fileName: string; fileType: string } | null>(null)

  const [lastMessageCount, setLastMessageCount] = useState(messages.length)
  const hasInitiallyScrolledRef = useRef(false)
  const previousMessagesLengthRef = useRef(messages.length)

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)

  const [editContent, setEditContent] = useState('')

  const { language } = useSettings()
  const isMobile = useIsMobile()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)

  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const { toast } = useToast()

  const copyTextToClipboard = async (text: string) => {
    if (!text) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        throw new Error('Clipboard API unavailable')
      }
      toast({ description: tr('文本已复制', 'Text copied') })
    } catch (error) {
      try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        toast({ description: tr('文本已复制', 'Text copied') })
      } catch (fallbackError) {
        console.error('Failed to copy text:', fallbackError)
        toast({ description: tr('复制失败，请手动尝试', 'Copy failed, please try manually'), variant: 'destructive' })
      }
    }
  }

  // 辅助函数：将 CloudBase 临时 URL 或 file_id 转换为 cn-download URL
  const getFileUrl = (message: MessageWithSender): string => {
    const fileUrl = message.metadata?._real_file_url || message.metadata?.file_url
    const fileId = message.metadata?.file_id
    
    if (!fileUrl) return ''
    
    // 如果已经有 file_id，优先使用 file_id 构造 cn-download URL（永久有效）
    if (fileId && fileId.startsWith('cloud://')) {
      return `/api/files/cn-download?fileId=${encodeURIComponent(fileId)}`
    }
    
    // 如果是 CloudBase 临时 URL（包含 .tcb.qcloud.la），尝试转换为 cn-download URL
    if (fileUrl.includes('.tcb.qcloud.la/')) {
      // 如果有 file_id，使用 file_id
      if (fileId && fileId.startsWith('cloud://')) {
        return `/api/files/cn-download?fileId=${encodeURIComponent(fileId)}`
      }
      // 否则尝试从 URL 提取路径并构造 fileId
      const urlMatch = fileUrl.match(/https?:\/\/[^/]+\.tcb\.qcloud\.la\/(.+?)(?:\?|$)/)
      if (urlMatch && urlMatch[1]) {
        const filePath = urlMatch[1]
        // 使用 URL 参数构造 cn-download URL
        return `/api/files/cn-download?url=${encodeURIComponent(fileUrl)}`
      }
    }
    
    // 如果已经是 cn-download URL，直接返回
    if (fileUrl.startsWith('/api/files/cn-download')) {
      return fileUrl
    }
    
    // 其他情况（Supabase URL 等），直接返回原 URL
    return fileUrl
  }

  const fetchMessageBlob = async (message: MessageWithSender) => {
    const url = getFileUrl(message)
    if (!url) throw new Error(tr('没有可复制的图片链接', 'No image URL available to copy'))
    const response = await fetch(url)
    if (!response.ok) throw new Error(tr('无法获取图片数据', 'Failed to fetch image data'))
    return response.blob()
  }

  const normalizeClipboardImageBlob = async (blob: Blob): Promise<{ blob: Blob; type: string }> => {
    const supportedTypes = ['image/png', 'image/jpeg', 'image/gif']
    const originalType = blob.type || 'image/png'

    if (supportedTypes.includes(originalType)) {
      return { blob, type: originalType }
    }

    // Convert unsupported formats (e.g. webp) to PNG via canvas
    return new Promise((resolve, reject) => {
      const img = new Image()
      const objectUrl = URL.createObjectURL(blob)

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            URL.revokeObjectURL(objectUrl)
            reject(new Error(tr('无法创建画布上下文', 'Failed to create canvas context')))
            return
          }
          ctx.drawImage(img, 0, 0)
          canvas.toBlob((converted) => {
            URL.revokeObjectURL(objectUrl)
            if (!converted) {
              reject(new Error(tr('图片转换失败', 'Failed to convert image')))
              return
            }
            resolve({ blob: converted, type: 'image/png' })
          }, 'image/png')
        } catch (err) {
          URL.revokeObjectURL(objectUrl)
          reject(err)
        }
      }

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl)
        reject(new Error(tr('无法加载图片进行复制', 'Failed to load image for copying')))
      }

      img.src = objectUrl
    })
  }

  const copyImageToClipboard = async (message: MessageWithSender) => {
    try {
      const rawBlob = await fetchMessageBlob(message)
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error(tr('浏览器不支持图片复制', 'Image copy is not supported by this browser'))
      }

      const { blob, type } = await normalizeClipboardImageBlob(rawBlob)
      const clipboardItem = new ClipboardItem({ [type]: blob })
      await navigator.clipboard.write([clipboardItem])
      toast({ description: tr('图片已复制', 'Image copied') })
    } catch (error) {
      console.error('Failed to copy image:', error)
      toast({
        description: error instanceof Error ? error.message : tr('复制图片失败', 'Failed to copy image'),
        variant: 'destructive'
      })
    }
  }


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

      // Reset initial scroll flag if messages were cleared (conversation switched)
      if (messages.length === 0 && previousMessagesLengthRef.current > 0) {
        hasInitiallyScrolledRef.current = false
      }

      // Auto-scroll to bottom when:
      // 1. Messages are first loaded (from empty to having messages, or from loading to loaded)
      // 2. New messages are added
      const isFirstLoad = !hasInitiallyScrolledRef.current && messages.length > 0 && !isLoading
      const hasNewMessages = messages.length > lastMessageCount
      const shouldScroll = isFirstLoad || hasNewMessages

      if (shouldScroll) {

        // Use requestAnimationFrame to ensure DOM is fully rendered
        requestAnimationFrame(() => {
          const container = getScrollContainer()
          if (container) {
            container.scrollTop = container.scrollHeight
            setShowScrollDownButton(false)
          }
        })
        
        if (isFirstLoad) {
          hasInitiallyScrolledRef.current = true
        }

      }

      setLastMessageCount(messages.length)
      previousMessagesLengthRef.current = messages.length

    }

  }, [messages, lastMessageCount, isLoading])



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
    if (!date) return ''
    const dateObj = new Date(date)
    if (isNaN(dateObj.getTime())) return ''
    return dateObj.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const formatDate = (date: string) => {
    if (!date) return ''
    const msgDate = new Date(date)
    if (isNaN(msgDate.getTime())) return ''
    
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

    const currentDate = new Date(currentMsg.created_at || 0).toDateString()

    const prevDate = new Date(prevMsg.created_at || 0).toDateString()

    return currentDate !== prevDate

  }



  const shouldGroupWithPrevious = (index: number) => {

    if (index === 0) return false

    const currentMsg = messages[index]

    const prevMsg = messages[index - 1]

    

    // Same sender

    if (currentMsg.sender_id !== prevMsg.sender_id) return false

    

    // Within 5 minutes

    const timeDiff = new Date(currentMsg.created_at || 0).getTime() - new Date(prevMsg.created_at || 0).getTime()

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

    if (onDeleteMessage && confirm(t('deleteMessageConfirm'))) {

      onDeleteMessage(messageId)

    }

  }

  const handleRecall = (messageId: string) => {

    if (onRecallMessage) {

      onRecallMessage(messageId)

    }

  }

  const canRecallMessage = (message: MessageWithSender): boolean => {

    if (!message || message.is_recalled || message.is_deleted) return false

    return true // 无时间限制

  }



  const handleReactionClick = (message: MessageWithSender, emoji: string) => {

    if (!onAddReaction || !onRemoveReaction) return

    

    const reaction = (message.reactions || []).find(r => r.emoji === emoji)

    const hasReacted = reaction?.user_ids.includes(currentUser.id) || false

    

    if (hasReacted) {

      onRemoveReaction(message.id, emoji)

    } else {

      onAddReaction(message.id, emoji)

    }

  }



  const commonEmojis = ['👍', '❤️', '😂', '🎉', '🔥', '✅', '👋', '😍']



  const renderMessageReactions = (message: MessageWithSender) => {
    // Don't show reactions for recalled or deleted messages
    if (message.is_recalled || message.is_deleted) {
      return null
    }

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

        <div className={cn("p-6", isMobile && "p-2")}>

          {isLoading && messages.length === 0 ? (

            <MessageSkeleton count={5} />

          ) : (

            <div className={cn("space-y-4 px-4", isMobile && "space-y-3 px-1")} ref={scrollRef}>

            {messages.map((message, index) => {

            const normalizedCurrentUserId = String(currentUser?.id || '').trim()

            const normalizedCurrentUserEmail = String(currentUser?.email || '').trim().toLowerCase()

            const normalizedSenderId = String(message.sender_id || (message.sender as any)?.id || '').trim()

            const normalizedSenderEmail = String((message.sender as any)?.email || '').trim().toLowerCase()

            const isOwn =

              (normalizedCurrentUserId !== '' && normalizedSenderId === normalizedCurrentUserId) ||

              (normalizedCurrentUserEmail !== '' && normalizedSenderEmail === normalizedCurrentUserEmail)

            const participantLookupId = normalizedSenderId || String((message.sender as any)?.id || '').trim()

            const participantFallback = participantLookupId

              ? participantsById?.[participantLookupId]

              : undefined

            const hasSenderIdentity = (sender: User | undefined) =>
              Boolean(
                sender?.full_name ||
                sender?.username ||
                sender?.avatar_url ||
                (sender as any)?.group_nickname
              )

            // Fallback sender 信息：
            // 1) message.sender 自身完整信息
            // 2) 当前会话成员映射 participantsById
            // 3) 自己发送的消息补成 currentUser
            const displaySender = (() => {
              if (isOwn && currentUser) {
                return {
                  ...(participantFallback || {}),
                  ...(message.sender || {}),
                  ...currentUser,
                  id: currentUser.id,
                } as User
              }
              if (hasSenderIdentity(message.sender)) {
                return {
                  ...(participantFallback || {}),
                  ...(message.sender || {}),
                } as User
              }
              if (participantFallback) {
                return participantFallback
              }
              if (normalizedSenderId) {
                return {
                  id: normalizedSenderId,
                  email: '',
                  username: '',
                  full_name: '',
                  avatar_url: null,
                } as User
              }
              return {
                id: '',
                email: '',
                username: language === 'zh' ? '\u7528\u6237' : 'User',
                full_name: language === 'zh' ? '\u7528\u6237' : 'User',
                avatar_url: null,
              } as User
            })()

            const isSystemWithoutSender = message.type === 'system' && !normalizedSenderId

            const resolvedAvatarUrl =
              isOwn
                ? currentUser?.avatar_url || displaySender?.avatar_url
                : displaySender?.avatar_url

            // 获取显示名称：优先显示群昵称，其次显示真实姓名
            const getDisplayName = (sender: User | undefined) => {
              if (!sender) return ''
              return (
                (sender as any).group_nickname ||
                sender.full_name ||
                sender.username ||
                sender.email ||
                (message.type === 'system'
                  ? (language === 'zh' ? '系统消息' : 'System')
                  : (language === 'zh' ? '用户' : 'User'))
              )
            }

            const grouped = shouldGroupWithPrevious(index)

            const showDate = shouldShowDateSeparator(index)

            const copyableText = (message.metadata?.code_content ?? message.content ?? '')

            const canCopyText = !!(copyableText && copyableText.trim() && !message.is_deleted)

            const canCopyImage = message.type === 'image' && !!message.metadata?.file_url && !message.is_deleted
            const isImageMessage = message.type === 'image' && !!message.metadata?.file_url
            const isMediaLikeMessage = isImageMessage || message.type === 'file' || message.type === 'video'


            // Use a stable key that doesn't change when message ID changes from temp to real

            // This prevents React from unmounting/remounting the component

            // For code messages, use code_content in key

            const stableKey = message.id && typeof message.id === 'string' && message.id.startsWith('temp-') 

              ? `temp-${message.sender_id}-${message.created_at}-${message.metadata?.file_url || message.metadata?.code_content || message.content}`

              : message.id || `msg-${index}-${message.created_at}`

            

            // Debug: Log code messages

            if (message.type === 'code') {

              console.log('🔍 Rendering code message:', {

                id: message.id,

                type: message.type,

                hasMetadata: !!message.metadata,

                code_content: message.metadata?.code_content,

                code_language: message.metadata?.code_language,

                content: message.content

              })

            }



            return (

              <div key={`${stableKey}-${index}`}>

                {showDate && (

                  <div className={cn("flex items-center gap-4 my-6", isMobile && "gap-2 my-4")}>

                    <div className="flex-1 border-t" />

                    <span className="text-xs text-muted-foreground font-medium">

                      {formatDate(message.created_at || '')}

                    </span>

                    <div className="flex-1 border-t" />

                  </div>

                )}

                {/* 撤回消息显示为系统提示 */}
                {message.is_recalled ? (
                  <div className="flex justify-center my-2">
                    <span className="text-xs text-muted-foreground">
                      {isOwn
                        ? tr('你撤回了一条消息', 'You recalled a message')
                        : `${getDisplayName(displaySender) || tr('对方', 'Other party')} ${tr('撤回了一条消息', 'recalled a message')}`}
                    </span>
                  </div>
                ) : isSystemWithoutSender ? (
                  <div className="flex justify-center my-2">
                    <div className="max-w-[90%] rounded-md border bg-muted/60 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                      {message.content}
                    </div>
                  </div>
                ) : (

                <div
                  data-testid="chat-message-row"
                  data-message-side={isOwn ? 'own' : 'peer'}
                  className={cn(
                    'flex items-start gap-2', // message row aligns avatar and bubble from the top
                    isMobile && 'gap-1.5',
                    isMobile && 'px-0',
                    grouped && !isMobile && 'mt-1',
                    isOwn && 'flex-row-reverse'
                  )}
                >

                  {/* 头像：系统消息（无 sender）不渲染头像占位 */}
                  {displaySender && (
                    <button
                      type="button"
                      data-testid="chat-message-avatar"
                      data-message-side={isOwn ? 'own' : 'peer'}
                      className="touch-compact shrink-0 mt-0.5 rounded-full hover:opacity-80 transition-opacity"
                      onClick={() => {
                        if (displaySender?.id) {
                          router.push(`/contacts?userId=${displaySender.id}`)
                        }
                      }}
                      title={getDisplayName(displaySender)}
                    >
                      <Avatar
                        className={cn("h-8 w-8")}
                        userId={displaySender?.id}
                        showOnlineStatus={false}
                      >
                        <AvatarImage src={resolvedAvatarUrl || undefined} />
                        <AvatarFallback name={getDisplayName(displaySender)}>
                          {(getDisplayName(displaySender) || '?')
                            .split(' ')
                            .map((n: string) => n[0])
                            .join('')}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  )}



                  <div 

                    className={cn(
                      'flex flex-col',
                      isOwn && 'items-end',
                      isMobile && isOwn && (
                        isMediaLikeMessage
                          ? 'max-w-[calc(100%-2.75rem)]'
                          : 'w-fit max-w-[calc(100%-2.75rem)]'
                      )
                    )}

                  >

                    {/* 名字 + 时间：自己和对方都会显示；自己的在右侧，对方在左侧 */}
                    {!grouped && !isMobile && (

                      <div className="flex items-baseline gap-2 mb-1.5">

                        <span className="font-medium text-sm text-gray-700">

                          {getDisplayName(displaySender)}

                        </span>

                        <span className="text-xs text-gray-400">

                          {formatTime(message.created_at || '')}

                        </span>

                      </div>

                    )}



                    <div
                      className={cn(
                        "flex items-end",
                        isMobile ? "relative" : "gap-2",
                        isMobile && isOwn && !isMediaLikeMessage && "w-fit"
                      )}
                    >

                      <ContextMenu>

                        <ContextMenuTrigger asChild>

                          <div

                            data-testid="chat-message-bubble"
                            data-message-side={isOwn ? 'own' : 'peer'}
                            className={cn(

                              'relative group break-words',
                              isMobile
                                ? (message.type === 'text' || message.type === 'system'
                                  ? 'w-fit max-w-[16rem] px-3 py-2 rounded-[14px]'
                                  : (isImageMessage
                                    ? 'max-w-[min(70vw,17rem)] min-w-[7.5rem] rounded-[14px] p-1.5'
                                    : 'max-w-[16rem] rounded-[14px] p-2'))
                                : (isImageMessage ? 'max-w-[22rem] rounded-xl p-1.5' : 'px-4 py-2.5 max-w-xl'),
                              isOwn

                                ? (isMobile
                                  ? (isImageMessage
                                    ? 'bg-transparent text-foreground shadow-none border-0'
                                    : 'mobile-chat-bubble-own text-white shadow-[0_1px_1px_rgba(0,0,0,0.08)]')
                                  : 'bg-[#E8F3FF] text-gray-900 rounded-lg')

                                : (isMobile
                                  ? (isImageMessage
                                    ? 'bg-transparent text-foreground shadow-none border-0'
                                    : 'mobile-chat-bubble-peer text-[#111827] border border-[#E6ECF2] shadow-[0_1px_1px_rgba(0,0,0,0.05)]')
                                  : 'bg-white text-gray-900 rounded-lg shadow-sm border border-gray-200'),

                              message.type !== 'text' && !isImageMessage && 'p-2'

                            )}

                          >

                      {message.reply_to && (() => {

                        const repliedMessage = messages.find(m => m.id === message.reply_to)

                        if (!repliedMessage) return null
                        const repliedSenderName =
                          repliedMessage.sender?.full_name ||
                          repliedMessage.sender?.username ||
                          repliedMessage.sender?.email ||
                          (language === 'zh' ? '未知用户' : 'Unknown user')

                        return (

                          <div className="mb-2 p-2 border-l-2 border-primary/30 bg-muted/50 rounded text-xs">

                            <div className="flex items-center gap-1 mb-1">

                              <Reply className="h-3 w-3" />

                              <span className="font-medium">{repliedSenderName}</span>

                            </div>

                            <p className="text-muted-foreground truncate">

                              {repliedMessage.content || tr('已删除的消息', 'Deleted message')}

                            </p>

                          </div>

                        )

                      })()}



                      {message.type === 'image' && message.metadata?.file_url && (() => {
                        // 转换 CloudBase 临时 URL 为使用 cn-download API（与 getFileUrl 逻辑一致）
                        const convertCloudBaseUrl = (url: string, fileId?: string): string => {
                          if (!url) return url
                          
                          // CRITICAL: 如果是 blob URL，不要转换，直接返回（避免图片消失）
                          // blob URL 会在预加载完成后由 page.tsx 切换为真实 URL
                          if (url.startsWith('blob:')) {
                            return url
                          }
                          
                          // 优先使用 file_id（永久有效）
                          if (fileId && fileId.startsWith('cloud://')) {
                            return `/api/files/cn-download?fileId=${encodeURIComponent(fileId)}`
                          }
                          
                          // 如果已经是 cn-download API URL，直接返回
                          if (url.startsWith('/api/files/cn-download')) return url
                          
                          // 如果是 CloudBase 临时 URL（tcb.qcloud.la），转换为 cn-download API
                          if (url.includes('.tcb.qcloud.la/')) {
                            return `/api/files/cn-download?url=${encodeURIComponent(url)}`
                          }
                          
                          // 如果是 cloud:// 格式，转换为 cn-download API
                          if (url.startsWith('cloud://')) {
                            return `/api/files/cn-download?fileId=${encodeURIComponent(url)}`
                          }
                          
                          // 其他情况（Supabase URL 等）直接返回
                          return url
                        }

                        const fileId = message.metadata?.file_id
                        const displayUrl = convertCloudBaseUrl(message.metadata.thumbnail_url || message.metadata.file_url, fileId)
                        const downloadUrl = convertCloudBaseUrl(message.metadata._real_file_url || message.metadata.file_url, fileId)

                        return (
                          <div className="space-y-2">

                            <a

                              href={downloadUrl}

                              download={message.metadata.file_name || 'image'}

                              target="_blank"

                              rel="noopener noreferrer"

                              className={cn(
                                "block cursor-pointer hover:opacity-90 transition-opacity",
                                isMobile ? "w-[min(70vw,17rem)]" : "w-[min(22rem,40vw)]"
                              )}

                            >

                              <img

                                src={displayUrl || "/placeholder.svg"}

                                alt={message.metadata.file_name || 'Image'}

                                className={cn(
                                  "block w-full h-auto rounded-[12px] object-cover bg-muted/30",
                                  isMobile ? "min-h-[7.5rem] max-h-[20rem]" : "min-h-[8.5rem] max-h-[22rem]"
                                )}

                                loading="eager"
                                decoding="async"

                                onError={(e) => {
                                  // If blob URL fails, try real URL
                                  const img = e.target as HTMLImageElement
                                  if (message.metadata && message.metadata._real_file_url && img.src.startsWith('blob:')) {
                                    img.src = message.metadata._real_file_url
                                    return
                                  }
                                  // Keep image bubble visible even when source cannot be loaded
                                  img.onerror = null
                                  img.src = '/placeholder.jpg'
                                  img.classList.remove('object-cover')
                                  img.classList.add('object-contain')
                                }}

                              />

                          </a>

                          {message.content && message.content.trim() && message.content !== message.metadata?.file_name && (

                            <p className="text-sm px-1 text-foreground/90">{message.content}</p>

                          )}

                        </div>
                        )
                      })()}



                      {(message.type === 'file' || message.type === 'video') && message.metadata?.file_url && (
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 p-2 bg-background/50 rounded transition-colors">
                            <div className="h-10 w-10 rounded bg-background flex items-center justify-center shrink-0">
                              {getFileIcon(message.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {message.metadata.file_name || 'File'}
                              </p>
                              {message.metadata.file_size && (
                                <p className="text-xs opacity-70">
                                  {(message.metadata.file_size / 1024 / 1024).toFixed(2)} MB
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Preview button */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  const fileUrl = getFileUrl(message)
                                  const fileType = message.metadata?.mime_type || message.metadata?.file_type || ''
                                  setShowFilePreview({
                                    url: fileUrl,
                                    fileName: message.metadata?.file_name || 'file',
                                    fileType: fileType,
                                  })
                                }}
                                title="Preview"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              {/* Download button */}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={async () => {
                                  const fileUrl = getFileUrl(message)
                                  const fileName = message.metadata?.file_name || 'file'
                                  
                                  // Check if it's a Supabase URL (not CloudBase cn-download API)
                                  const isSupabaseUrl = fileUrl && !fileUrl.startsWith('/api/files/cn-download') && !fileUrl.includes('.tcb.qcloud.la')
                                  
                                  if (isSupabaseUrl) {
                                    // For Supabase files, fetch the file and download it
                                    try {
                                      const response = await fetch(fileUrl)
                                      if (!response.ok) throw new Error('Failed to fetch file')
                                      const blob = await response.blob()
                                      const blobUrl = URL.createObjectURL(blob)
                                      const link = document.createElement('a')
                                      link.href = blobUrl
                                      link.download = fileName
                                      document.body.appendChild(link)
                                      link.click()
                                      document.body.removeChild(link)
                                      URL.revokeObjectURL(blobUrl)
                                    } catch (error) {
                                      console.error('Error downloading file:', error)
                                      // Fallback: open in new tab
                                      window.open(fileUrl, '_blank')
                                    }
                                  } else {
                                    // For CloudBase files (cn-download API), use direct download
                                    const link = document.createElement('a')
                                    link.href = fileUrl
                                    link.download = fileName
                                    link.target = '_blank'
                                    link.rel = 'noopener noreferrer'
                                    document.body.appendChild(link)
                                    link.click()
                                    document.body.removeChild(link)
                                  }
                                }}
                                title="Download"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {message.content && message.content.trim() && message.content !== message.metadata?.file_name && (
                            <p className="text-sm px-2">{message.content}</p>
                          )}
                        </div>
                      )}



                      {message.type === 'code' && (

                        <CodeBlock

                          code={message.metadata?.code_content || message.content || ''}

                          language={message.metadata?.code_language || 'text'}

                        />

                      )}

                      {/* Call record display */}
                      {message.type === 'system' && (message.metadata as any)?.call_type && (() => {
                        // Use a loose type here because call-related metadata fields are dynamic
                        const callMetadata = (message.metadata || {}) as any
                        const callStatus = callMetadata.call_status || 'calling'
                        const callDuration = callMetadata.call_duration || 0
                        const isIncoming = callMetadata.caller_id !== currentUser.id
                        const isCalling = callStatus === 'calling' && !isOwn

                        const formatCallDuration = (seconds: number) => {
                          const mins = Math.floor(seconds / 60)
                          const secs = seconds % 60
                          return `${mins}:${secs.toString().padStart(2, '0')}`
                        }

                        return (
                          <div className="flex flex-col gap-2 p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-2">
                              {callMetadata.call_type === 'video' ? (
                                <Video className="h-4 w-4" />
                              ) : (
                                <Phone className="h-4 w-4" />
                              )}
                              <span className="text-sm font-medium">
                                {callMetadata.call_type === 'video' ? t('videoCall') : t('voiceCall')}
                              </span>
                            </div>

                            {callStatus === 'calling' && isCalling && (
                              <div className="flex items-center gap-2 mt-2">
                                <Button
                                  size="sm"
                                  variant="default"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => {
                                    // 触发接听通话
                                    window.dispatchEvent(new CustomEvent('answerCall', {
                                      detail: {
                                        messageId: message.id,
                                        conversationId: message.conversation_id,
                                        callType: callMetadata.call_type,
                                      }
                                    }))
                                  }}
                                >
                                  <Phone className="h-3 w-3 mr-1" />
                                  Answer
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    // 触发拒绝通话
                                    window.dispatchEvent(new CustomEvent('rejectCall', {
                                      detail: { messageId: message.id }
                                    }))
                                  }}
                                >
                                  <Phone className="h-3 w-3 mr-1 rotate-90" />
                                  Decline
                                </Button>
                              </div>
                            )}

                            {/* 显示通话状态和时长 */}
                            {callStatus === 'ended' ? (
                              <div className="text-xs text-muted-foreground">
                                {callDuration > 0
                                  ? `Call duration: ${formatCallDuration(callDuration)}`
                                  : 'Call ended'}
                              </div>
                            ) : callStatus === 'answered' ? (
                              <div className="text-xs text-muted-foreground">
                                {callDuration > 0
                                  ? `Call duration: ${formatCallDuration(callDuration)}`
                                  : 'Answered'}
                              </div>
                            ) : callStatus === 'missed' ? (
                              <div className="text-xs text-muted-foreground">Missed call</div>
                            ) : callStatus === 'cancelled' ? (
                              <div className="text-xs text-muted-foreground">
                                {callDuration > 0
                                  ? `Call duration: ${formatCallDuration(callDuration)}`
                                  : 'Cancelled'}
                              </div>
                            ) : callStatus === 'calling' ? (
                              <div className="text-xs text-muted-foreground">Calling...</div>
                            ) : null}
                          </div>
                        )
                      })()}

                      {/* System assistant messages - join request notifications */}
                      {message.type === 'system' && (message.metadata as any)?.type && ['join_request', 'join_approved', 'join_rejected'].includes((message.metadata as any)?.type) && (() => {
                        const metadata = (message.metadata || {}) as any
                        const notificationType = metadata.type
                        const workspaceName = metadata.workspace_name || 'Unknown Workspace'

                        const getNotificationStyle = () => {
                          switch (notificationType) {
                            case 'join_request':
                              return {
                                icon: Clock,
                                bgColor: 'bg-blue-50 dark:bg-blue-950/30',
                                iconColor: 'text-blue-500',
                                borderColor: 'border-blue-200 dark:border-blue-800'
                              }
                            case 'join_approved':
                              return {
                                icon: CheckCircle,
                                bgColor: 'bg-green-50 dark:bg-green-950/30',
                                iconColor: 'text-green-500',
                                borderColor: 'border-green-200 dark:border-green-800'
                              }
                            case 'join_rejected':
                              return {
                                icon: XCircle,
                                bgColor: 'bg-red-50 dark:bg-red-950/30',
                                iconColor: 'text-red-500',
                                borderColor: 'border-red-200 dark:border-red-800'
                              }
                            default:
                              return {
                                icon: Bell,
                                bgColor: 'bg-muted/50',
                                iconColor: 'text-muted-foreground',
                                borderColor: 'border-muted'
                              }
                          }
                        }

                        const style = getNotificationStyle()
                        const IconComponent = style.icon

                        return (
                          <div className={cn(
                            'flex items-start gap-3 p-3 rounded-lg border',
                            style.bgColor,
                            style.borderColor
                          )}>
                            <div className={cn('mt-0.5', style.iconColor)}>
                              <IconComponent className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground">
                                {message.content}
                              </p>
                              {workspaceName && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {language === 'zh' ? '工作区' : 'Workspace'}: {workspaceName}
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })()}

                      {message.type === 'text' && (
                        <p
                          className={cn(
                            isMobile
                              ? 'text-[14px] leading-[1.45] whitespace-pre-wrap break-words'
                              : 'text-[14px] leading-[1.6] whitespace-pre-wrap break-words',
                            (message.is_deleted || message.is_recalled) && 'italic opacity-60',
                          )}
                        >
                          {message.is_recalled ? t('messageRecalled') : message.content}
                          {message.is_edited && !message.is_deleted && (
                            <span className="text-xs opacity-70 ml-2">{t('edited')}</span>
                          )}
                          {message.is_pinned && (
                            <span className="text-xs opacity-70 ml-2 flex items-center gap-1">
                              <Pin className="h-3 w-3" />
                              {t('pinned')}
                            </span>
                          )}
                        </p>
                      )}

                        </div>

                        </ContextMenuTrigger>

                        <ContextMenuContent>

                          {message.is_pinned ? (

                            onUnpinMessage && (

                              <ContextMenuItem onClick={() => onUnpinMessage(message.id)}>

                                <PinOff className="h-4 w-4 mr-2" />

                                {t('unpinMessage')}

                              </ContextMenuItem>

                            )

                          ) : (

                            onPinMessage && (

                              <ContextMenuItem onClick={() => onPinMessage(message.id)}>

                                <Pin className="h-4 w-4 mr-2" />

                                {t('pinMessage')}

                              </ContextMenuItem>

                            )

                          )}

                          {isOwn && message.type === 'text' && onEditMessage && (

                            <ContextMenuItem onClick={() => handleEdit(message)}>

                              <Edit2 className="h-4 w-4 mr-2" />

                              {t('edit')}

                            </ContextMenuItem>

                          )}

                          {isOwn && onRecallMessage && !message.is_recalled && !message.is_deleted && canRecallMessage(message) && (

                            <ContextMenuItem onClick={() => handleRecall(message.id)}>

                              <RotateCcw className="h-4 w-4 mr-2" />

                              {t('recall')}

                            </ContextMenuItem>

                          )}

                          {!isOwn && onHideMessage && (

                            <>

                              <ContextMenuSeparator />

                              <ContextMenuItem 

                                onClick={() => onHideMessage(message.id)}

                              >

                                <EyeOff className="h-4 w-4 mr-2" />

                                {t('hideMessage')}

                              </ContextMenuItem>

                            </>

                          )}

                          {(canCopyText || canCopyImage) && (

                            <>

                              <ContextMenuSeparator />

                              <ContextMenuItem

                                onClick={() => {

                                  if (canCopyImage) {

                                    copyImageToClipboard(message)

                                  } else if (canCopyText) {

                                    copyTextToClipboard(copyableText)

                                  }

                                }}

                              >

                                <Copy className="h-4 w-4 mr-2" />

                                {t('copy')}

                              </ContextMenuItem>

                            </>

                          )}

                          {isOwn && onDeleteMessage && (

                            <>

                              <ContextMenuSeparator />

                              <ContextMenuItem 

                                onClick={() => handleDelete(message.id)}

                                variant="destructive"

                              >

                                <Trash2 className="h-4 w-4 mr-2" />

                                {t('delete')}

                              </ContextMenuItem>

                            </>

                          )}

                        </ContextMenuContent>

                      </ContextMenu>

                    </div>



                    {renderMessageReactions(message)}

                  </div>

                </div>
                )}

              </div>

            )

          })}

            </div>

          )}

        </div>

      </ScrollArea>



      {showScrollUpButton && (

        <Button

          onClick={scrollToTop}

          size="icon"

          variant="default"

          className={cn(
            "absolute right-6 rounded-full shadow-lg z-20 bg-background border hover:bg-accent",
            isMobile ? "top-4 h-9 w-9" : "top-6 h-10 w-10"
          )}

          aria-label="Scroll to top"

        >

          <ChevronUp className={cn(isMobile ? "h-4 w-4" : "h-5 w-5")} />

        </Button>

      )}

      {showScrollDownButton && (

        <Button

          onClick={scrollToBottom}

          size="icon"

          variant="default"

          className={cn(
            "absolute right-6 rounded-full shadow-lg z-20 bg-background border hover:bg-accent",
            isMobile ? "bottom-4 h-9 w-9" : "bottom-6 h-10 w-10"
          )}

          aria-label="Scroll to bottom"

        >

          <ChevronDown className={cn(isMobile ? "h-4 w-4" : "h-5 w-5")} />

        </Button>

      )}



      {/* Edit Message Dialog */}

      <Dialog open={editingMessageId !== null} onOpenChange={(open) => !open && setEditingMessageId(null)}>

        <DialogContent>

          <DialogHeader>

            <DialogTitle>{t('editMessage')}</DialogTitle>

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

      {/* File Preview Dialog */}
      <Dialog open={showFilePreview !== null} onOpenChange={(open) => !open && setShowFilePreview(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4">
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="truncate flex-1 min-w-0 pr-2 leading-normal">
                {showFilePreview?.fileName || t('filePreview')}
              </DialogTitle>
              <div className="flex items-center gap-2 shrink-0">
                {showFilePreview && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      if (!showFilePreview) return
                      const fileUrl = showFilePreview.url
                      const fileName = showFilePreview.fileName
                      
                      // Check if it's a Supabase URL (not CloudBase cn-download API)
                      const isSupabaseUrl = fileUrl && !fileUrl.startsWith('/api/files/cn-download') && !fileUrl.includes('.tcb.qcloud.la')
                      
                      if (isSupabaseUrl) {
                        // For Supabase files, fetch the file and download it
                        try {
                          const response = await fetch(fileUrl)
                          if (!response.ok) throw new Error('Failed to fetch file')
                          const blob = await response.blob()
                          const blobUrl = URL.createObjectURL(blob)
                          const link = document.createElement('a')
                          link.href = blobUrl
                          link.download = fileName
                          document.body.appendChild(link)
                          link.click()
                          document.body.removeChild(link)
                          URL.revokeObjectURL(blobUrl)
                        } catch (error) {
                          console.error('Error downloading file:', error)
                          // Fallback: open in new tab
                          window.open(fileUrl, '_blank')
                        }
                      } else {
                        // For CloudBase files (cn-download API), use direct download
                        const link = document.createElement('a')
                        link.href = fileUrl
                        link.download = fileName
                        link.target = '_blank'
                        link.rel = 'noopener noreferrer'
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                      }
                    }}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowFilePreview(null)}
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            {showFilePreview && (() => {
              const fileType = showFilePreview.fileType.toLowerCase()
              const fileName = showFilePreview.fileName.toLowerCase()
              
              // Image preview
              if (fileType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileName)) {
                return (
                  <img
                    src={showFilePreview.url}
                    alt={showFilePreview.fileName}
                    className="max-w-full max-h-[70vh] object-contain rounded"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement
                      img.src = '/placeholder.svg'
                    }}
                  />
                )
              }
              
              // Video preview
              if (fileType.startsWith('video/') || /\.(mp4|webm|ogg|mov)$/i.test(fileName)) {
                return (
                  <video
                    src={showFilePreview.url}
                    controls
                    className="max-w-full max-h-[70vh] rounded"
                    onError={(e) => {
                      console.error('Video preview error:', e)
                    }}
                  >
                    Your browser does not support the video tag.
                  </video>
                )
              }
              
              // PDF preview
              if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
                return (
                  <iframe
                    src={showFilePreview.url}
                    className="w-full h-[70vh] rounded border"
                    title={showFilePreview.fileName}
                  />
                )
              }
              
              // Text file preview (using iframe for better compatibility)
              if (fileType.startsWith('text/') || /\.(txt|md|json|xml|html|css|js|ts|jsx|tsx)$/i.test(fileName)) {
                return (
                  <div className="w-full h-[70vh] overflow-auto bg-background border rounded p-4">
                    <iframe
                      src={showFilePreview.url}
                      className="w-full h-full border-0"
                      title={showFilePreview.fileName}
                    />
                  </div>
                )
              }
              
              // Default: show download option
              return (
                <div className="flex flex-col items-center justify-center gap-4 p-8">
                  <File className="h-16 w-16 text-muted-foreground" />
                  <p className="text-muted-foreground">{t('previewNotAvailable')}</p>
                  <Button
                    onClick={async () => {
                      const fileUrl = showFilePreview.url
                      const fileName = showFilePreview.fileName
                      
                      // Check if it's a Supabase URL (not CloudBase cn-download API)
                      const isSupabaseUrl = fileUrl && !fileUrl.startsWith('/api/files/cn-download') && !fileUrl.includes('.tcb.qcloud.la')
                      
                      if (isSupabaseUrl) {
                        // For Supabase files, fetch the file and download it
                        try {
                          const response = await fetch(fileUrl)
                          if (!response.ok) throw new Error('Failed to fetch file')
                          const blob = await response.blob()
                          const blobUrl = URL.createObjectURL(blob)
                          const link = document.createElement('a')
                          link.href = blobUrl
                          link.download = fileName
                          document.body.appendChild(link)
                          link.click()
                          document.body.removeChild(link)
                          URL.revokeObjectURL(blobUrl)
                        } catch (error) {
                          console.error('Error downloading file:', error)
                          // Fallback: open in new tab
                          window.open(fileUrl, '_blank')
                        }
                      } else {
                        // For CloudBase files (cn-download API), use direct download
                        const link = document.createElement('a')
                        link.href = fileUrl
                        link.download = fileName
                        link.target = '_blank'
                        link.rel = 'noopener noreferrer'
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                      }
                    }}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t('downloadFile')}
                  </Button>
                </div>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>

    </div>

  )

}
