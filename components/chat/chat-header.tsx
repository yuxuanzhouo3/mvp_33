'use client'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ConversationWithDetails, User } from '@/lib/types'
import { Hash, Lock, Users, Phone, Video, Info, MoreVertical, PanelLeftOpen } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useState, useCallback, useEffect, useRef } from 'react'
import { VoiceCallDialog } from './voice-call-dialog'
import { VideoCallDialog } from './video-call-dialog'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCallUiLock } from '@/lib/call/call-ui-lock'

interface ChatHeaderProps {
  conversation: ConversationWithDetails
  currentUser: User
  onToggleSidebar?: () => void
  onToggleGroupInfo?: () => void
}

export function ChatHeader({ conversation, currentUser, onToggleSidebar, onToggleGroupInfo }: ChatHeaderProps) {
  const [showVoiceCall, setShowVoiceCall] = useState(false)
  const [showVideoCall, setShowVideoCall] = useState(false)
  const [incomingCallMessageId, setIncomingCallMessageId] = useState<string | undefined>()
  const [incomingCallType, setIncomingCallType] = useState<'voice' | 'video' | undefined>()
  // 当从消息列表点“Answer”时，自动接听，不再弹出第二个接听界面
  const [autoAnswerVoice, setAutoAnswerVoice] = useState(false)
  const [autoAnswerVideo, setAutoAnswerVideo] = useState(false)
  const { language } = useSettings()
  const router = useRouter()
  const searchParams = useSearchParams()
  const autoCallHandledRef = useRef<string | null>(null)
  const isMobile = useIsMobile()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  // Auto start call when entering chat from contacts/workspace-members with call params.
  useEffect(() => {
    const callType = searchParams.get('callType')
    const autoCall = searchParams.get('autoCall')
    const conversationId = searchParams.get('conversation')

    if (autoCall !== '1') {
      autoCallHandledRef.current = null
      return
    }
    if (conversationId !== conversation.id) return
    if (callType !== 'voice' && callType !== 'video') return

    const requestKey = `${conversation.id}:${callType}`
    if (autoCallHandledRef.current === requestKey) return
    autoCallHandledRef.current = requestKey

    if (callType === 'video') {
      setShowVideoCall(true)
    } else {
      setShowVoiceCall(true)
    }

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete('autoCall')
    nextParams.delete('callType')
    nextParams.delete('userId')
    const nextQuery = nextParams.toString()
    router.replace(nextQuery ? `/chat?${nextQuery}` : '/chat')
  }, [conversation.id, router, searchParams])
  
  // 监听来自消息列表的接听/拒绝通话事件
  useEffect(() => {
    const handleAnswerCall = async (event: CustomEvent) => {
      const { messageId, conversationId } = event.detail
      
      // 验证 conversationId 是否匹配
      if (conversationId !== conversation.id) {
        return
      }
      
      // 获取消息详情以确定通话类型
      try {
        const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}`)
        const msgData = await msgResponse.json()
        if (msgData.success) {
          const callMessage = msgData.messages.find((m: any) => m.id === messageId)
          if (callMessage?.metadata?.call_type) {
            const callType = callMessage.metadata.call_type
            setIncomingCallMessageId(messageId)
            
            if (callType === 'video') {
              setIncomingCallType('video')
              setAutoAnswerVideo(true) // 从消息列表接听：自动接听视频
              setShowVideoCall(true)
            } else {
              setIncomingCallType('voice')
              setAutoAnswerVoice(true) // 从消息列表接听：自动接听语音
              setShowVoiceCall(true)
            }
          }
        }
      } catch (error) {
        console.error('Failed to get call message:', error)
      }
    }
    
    const handleRejectCall = async (event: CustomEvent) => {
      const { messageId } = event.detail
      
      // 更新消息状态为拒绝
      try {
        const msgResponse = await fetch(`/api/messages?conversationId=${conversation.id}`)
        const msgData = await msgResponse.json()
        if (msgData.success) {
          const callMessage = msgData.messages.find((m: any) => m.id === messageId)
          if (callMessage) {
            const updatedMetadata = {
              ...callMessage.metadata,
              call_status: 'missed',
              rejected_at: new Date().toISOString(),
            }
            
            await fetch(`/api/messages/${messageId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                metadata: updatedMetadata,
              }),
            })
          }
        }
      } catch (error) {
        console.error('Failed to reject call:', error)
      }
    }
    
    window.addEventListener('answerCall', handleAnswerCall as unknown as EventListener)
    window.addEventListener('rejectCall', handleRejectCall as unknown as EventListener)
    
    return () => {
      window.removeEventListener('answerCall', handleAnswerCall as unknown as EventListener)
      window.removeEventListener('rejectCall', handleRejectCall as unknown as EventListener)
    }
  }, [conversation.id])

  const getConversationDisplay = () => {
    if (conversation.type === 'direct') {
      // 如果是和自己聊天（两个成员都是自己），就把“对方”也当成 currentUser
      let otherUser = conversation.members.find(m => m.id !== currentUser.id)
      if (!otherUser) {
        otherUser = currentUser
      }
      // Prioritize title (job position) over status
      const subtitle = otherUser?.title 
        ? otherUser.title 
        : (otherUser?.status ? t(otherUser.status as 'online' | 'offline' | 'away' | 'busy') : '')
      // Removed console.log to reduce noise in console
      // Uncomment for debugging if needed:
      // console.log('👤 Chat header display:', {
      //   name: otherUser?.full_name,
      //   title: otherUser?.title,
      //   status: otherUser?.status,
      //   subtitle: subtitle
      // })
      return {
        name: otherUser?.full_name || otherUser?.username || otherUser?.email || 'User',
        subtitle: subtitle,
        avatar: otherUser?.avatar_url,
        status: otherUser?.status,
        user: otherUser,
      }
    }
    return {
      name: conversation.name || 'Unnamed',
      subtitle: `${conversation.members.length} ${t('members')}`,
      avatar: conversation.avatar_url,
    }
  }

  const getConversationIcon = () => {
    if (conversation.type === 'direct') return null
    if (conversation.type === 'group') return <Users className="h-5 w-5" />
    return conversation.is_private ? <Lock className="h-5 w-5" /> : <Hash className="h-5 w-5" />
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'away': return 'bg-yellow-500'
      case 'busy': return 'bg-red-500'
      default: return 'bg-gray-400'
    }
  }

  const display = getConversationDisplay()

  const isGroupCall = conversation.type === 'group' || conversation.type === 'channel'
  // 确保 callRecipient 始终是对话中的另一个用户（不是当前用户）
  // 对于直接对话，必须是另一个成员；对于群组，使用 display.user 或第一个其他成员
  let callRecipient: User
  if (conversation.type === 'direct') {
    const otherUser = conversation.members.find(m => m.id !== currentUser.id)
    if (otherUser) {
      callRecipient = otherUser
    } else {
      // 如果找不到另一个用户，使用 display.user（可能是 currentUser，但不应该发生）
      console.warn('[ChatHeader] No other user found in direct conversation, using display.user')
      callRecipient = display.user || currentUser
    }
  } else {
    // 对于群组，使用第一个不是当前用户的成员
    // 如果找不到，创建一个占位符用户（避免使用 currentUser）
    const otherMember = conversation.members.find(m => m.id !== currentUser.id)
    if (otherMember) {
      callRecipient = otherMember
    } else {
      // 创建占位符用户，避免 recipient === currentUser 的错误
      callRecipient = {
        id: 'placeholder-user',
        email: 'placeholder@example.com',
        full_name: 'Group Member',
        username: 'group_member',
        avatar_url: undefined,
        status: 'offline',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      console.warn('[ChatHeader] No other members found in group, using placeholder recipient')
    }
  }

  const handleAvatarClick = useCallback(() => {
    if (conversation.type !== 'direct' || !display.user?.id) return
    // 无论是对方还是自己，统一跳到 contacts 页面，并高亮这个人
    router.push(`/contacts?userId=${display.user.id}`)
  }, [conversation.type, display.user?.id, router])

  const startVoiceCallFromHeader = useCallback(() => {
    const activeCall = getCallUiLock()
    if (activeCall) {
      alert('A call is already in progress. Please end the current call first.')
      return
    }
    setShowVoiceCall(true)
  }, [])

  const startVideoCallFromHeader = useCallback(() => {
    const activeCall = getCallUiLock()
    if (activeCall) {
      alert('A call is already in progress. Please end the current call first.')
      return
    }
    setShowVideoCall(true)
  }, [])

  return (
    <>
      <div className={cn("border-b bg-background", isMobile ? "px-2.5 py-2" : "px-4 py-2.5")}>
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            {isMobile && onToggleSidebar && (
              <Button
                size="icon"
                variant="ghost"
                onClick={onToggleSidebar}
                className="h-8 w-8 shrink-0"
                aria-label="Open conversation list"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            )}
            {conversation.type === 'direct' ? (
              <div className="relative">
                <button
                  onClick={handleAvatarClick}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  title="View contact details"
                >
                  <Avatar className={cn("h-10 w-10", isMobile && "h-9 w-9")} userId={display.user?.id} showOnlineStatus={true}>
                    <AvatarImage src={display.avatar || undefined} />
                    <AvatarFallback name={display.name}>
                      {display.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </div>
            ) : (
              <div className={cn("h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center", isMobile && "h-9 w-9")}>
                {getConversationIcon()}
              </div>
            )}
            <div className="min-w-0">
              <h2 className={cn("font-semibold text-base", isMobile && "text-[15px] truncate max-w-[160px]")}>{display.name}</h2>
              {!isMobile && <p className="text-sm text-muted-foreground">{display.subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              onClick={startVoiceCallFromHeader}
              className={cn("h-8 w-8", isMobile && "h-7 w-7")}
            >
              <Phone className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={startVideoCallFromHeader}
              className={cn("h-8 w-8", isMobile && "h-7 w-7")}
            >
              <Video className="h-4 w-4" />
            </Button>
            {!isMobile && conversation.type === 'group' && (
              <Button
                size="icon"
                variant="ghost"
                onClick={onToggleGroupInfo}
                className="h-8 w-8"
              >
                <Info className="h-4 w-4" />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className={cn("h-8 w-8", isMobile && "h-7 w-7")}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>{t('muteNotifications')}</DropdownMenuItem>
                <DropdownMenuItem>{t('pinConversation')}</DropdownMenuItem>
                <DropdownMenuItem>{t('viewDetails')}</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive">
                  {t('leaveConversation')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <VoiceCallDialog
        open={showVoiceCall}
        onOpenChange={(open) => {
          setShowVoiceCall(open)
          if (!open) {
            setIncomingCallMessageId(undefined)
            setIncomingCallType(undefined)
            setAutoAnswerVoice(false)
          }
        }}
        recipient={callRecipient}
        currentUser={currentUser}
        conversationId={conversation.id}
        callMessageId={incomingCallType === 'voice' ? incomingCallMessageId : undefined}
        isIncoming={!!incomingCallMessageId && incomingCallType === 'voice'}
        autoAnswer={autoAnswerVoice}
        isGroup={isGroupCall}
        groupName={conversation.name}
        groupMembers={conversation.members}
      />

      <VideoCallDialog
        open={showVideoCall}
        onOpenChange={(open) => {
          setShowVideoCall(open)
          if (!open) {
            setIncomingCallMessageId(undefined)
            setIncomingCallType(undefined)
            setAutoAnswerVideo(false)
          }
        }}
        recipient={callRecipient}
        currentUser={currentUser}
        conversationId={conversation.id}
        callMessageId={incomingCallType === 'video' ? incomingCallMessageId : undefined}
        isIncoming={!!incomingCallMessageId && incomingCallType === 'video'}
        autoAnswer={autoAnswerVideo}
        isGroup={isGroupCall}
        groupName={conversation.name}
        groupMembers={conversation.members}
      />
    </>
  )
}

