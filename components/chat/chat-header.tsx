'use client'

import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ConversationWithDetails, User } from '@/lib/types'
import { Hash, Lock, Users, Phone, Video, Info, ChevronLeft } from 'lucide-react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { VoiceCallDialog } from './voice-call-dialog'
import { VideoCallDialog } from './video-call-dialog'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { useIsMobile } from '@/hooks/use-mobile'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { cn } from '@/lib/utils'
import { useRouter, useSearchParams } from 'next/navigation'
import { getCallUiLock } from '@/lib/call/call-ui-lock'
import { unlockRingtoneAudio } from '@/lib/call/incoming-ringtone'

interface ChatHeaderProps {
  conversation: ConversationWithDetails
  currentUser: User
  onToggleSidebar?: () => void
  onToggleGroupInfo?: () => void
  mobileBackLabel?: string
}

export function ChatHeader({
  conversation,
  currentUser,
  onToggleSidebar,
  onToggleGroupInfo,
  mobileBackLabel,
}: ChatHeaderProps) {
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
    const openIncomingCallDialog = (messageId: string, callType: 'voice' | 'video') => {
      setIncomingCallMessageId(messageId)
      setIncomingCallType(callType)
      if (callType === 'video') {
        setAutoAnswerVideo(true) // 从消息列表接听：自动接听视频
        setShowVideoCall(true)
      } else {
        setAutoAnswerVoice(true) // 从消息列表接听：自动接听语音
        setShowVoiceCall(true)
      }
    }

    const handleAnswerCall = async (event: CustomEvent) => {
      const { messageId, conversationId, callType } = event.detail
      
      // 验证 conversationId 是否匹配
      if (conversationId !== conversation.id) {
        return
      }

      const normalizedCallType =
        callType === 'voice' ? 'voice' : callType === 'video' ? 'video' : null
      if (normalizedCallType) {
        openIncomingCallDialog(messageId, normalizedCallType)
        return
      }
      
      // 获取消息详情以确定通话类型
      try {
        const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}&_t=${Date.now()}`)
        const msgData = await msgResponse.json()
        if (msgData.success) {
          const callMessage = msgData.messages.find((m: any) => m.id === messageId)
          const backendType = callMessage?.metadata?.call_type
          const normalizedBackendType =
            backendType === 'voice' ? 'voice' : backendType === 'video' ? 'video' : null
          if (normalizedBackendType) {
            openIncomingCallDialog(messageId, normalizedBackendType)
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
      // Removed console.log to reduce noise in console
      // Uncomment for debugging if needed:
      // console.log('👤 Chat header display:', {
      //   name: otherUser?.full_name,
      //   title: otherUser?.title,
      //   status: otherUser?.status,
      //   subtitle: otherUser?.title || otherUser?.status || 'offline'
      // })
      return {
        name: otherUser?.full_name || otherUser?.username || otherUser?.email || 'User',
        subtitle: otherUser?.title || t((otherUser?.status || 'offline') as 'online' | 'offline' | 'away' | 'busy'),
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
  const canShowDirectOnlineStatus = Boolean(
    conversation.type === 'direct' &&
    display.user?.id &&
    display.user.id !== 'placeholder-user' &&
    !display.user.id.startsWith('00000000-0000-0000-0000-')
  )
  const isDirectUserOnline = useOnlineStatus(
    canShowDirectOnlineStatus ? display.user?.id : undefined,
    canShowDirectOnlineStatus ? display.user?.region : undefined
  )
  const displaySubtitle = conversation.type === 'direct'
    ? (display.user?.title || t(isDirectUserOnline ? 'online' : 'offline'))
    : display.subtitle
  const resolvedMobileBackLabel = mobileBackLabel || (language === 'zh' ? '返回列表' : 'Back')

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
    unlockRingtoneAudio()
    setShowVoiceCall(true)
  }, [])

  const startVideoCallFromHeader = useCallback(() => {
    const activeCall = getCallUiLock()
    if (activeCall) {
      alert('A call is already in progress. Please end the current call first.')
      return
    }
    unlockRingtoneAudio()
    setShowVideoCall(true)
  }, [])

  return (
    <>
      <div className={cn("border-b bg-background", isMobile ? "px-2 py-1.5" : "px-4 py-2.5")}>
        <div className="flex items-center justify-between">
          <div className={cn("flex min-w-0 items-center gap-2", isMobile && "gap-1.5")}>
            {isMobile && onToggleSidebar && (
              <Button
                size="icon"
                variant="ghost"
                onClick={onToggleSidebar}
                className="touch-compact h-8 w-8 shrink-0 rounded-md"
                aria-label={resolvedMobileBackLabel}
                title={resolvedMobileBackLabel}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            )}
            {conversation.type === 'direct' ? (
              <div className="relative">
                <button
                  onClick={handleAvatarClick}
                  className="touch-compact cursor-pointer hover:opacity-80 transition-opacity"
                  title="View contact details"
                >
                  <Avatar
                    className={cn("h-10 w-10", isMobile && "h-8 w-8")}
                    userId={canShowDirectOnlineStatus ? display.user?.id : undefined}
                    userRegion={display.user?.region}
                    showOnlineStatus={canShowDirectOnlineStatus}
                  >
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
              <div className={cn("h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center", isMobile && "h-8 w-8")}>
                {getConversationIcon()}
              </div>
            )}
            <div className="min-w-0">
              <h2 className={cn("font-semibold text-base", isMobile && "text-[14px] truncate max-w-[150px]")}>{display.name}</h2>
              {!isMobile && <p className="text-sm text-muted-foreground">{displaySubtitle}</p>}
            </div>
          </div>

          <div className={cn("flex items-center gap-1", isMobile && "gap-0.5")}>
            <Button
              size="icon"
              variant="ghost"
              onClick={startVoiceCallFromHeader}
              className={cn("touch-compact h-8 w-8", isMobile && "h-7 w-7")}
              aria-label={language === 'zh' ? '发起语音通话' : 'Start voice call'}
            >
              <Phone className={cn("h-4 w-4", isMobile && "h-3.5 w-3.5")} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={startVideoCallFromHeader}
              className={cn("touch-compact h-8 w-8", isMobile && "h-7 w-7")}
              aria-label={language === 'zh' ? '发起视频通话' : 'Start video call'}
            >
              <Video className={cn("h-4 w-4", isMobile && "h-3.5 w-3.5")} />
            </Button>
            {conversation.type === 'group' && (
              <Button
                size="icon"
                variant="ghost"
                onClick={onToggleGroupInfo}
                aria-label={language === 'zh' ? '查看群聊信息' : 'View group info'}
                className={cn("touch-compact h-8 w-8", isMobile && "h-7 w-7")}
              >
                <Info className={cn("h-4 w-4", isMobile && "h-3.5 w-3.5")} />
              </Button>
            )}
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


