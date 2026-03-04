'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Mic, MicOff, Phone, Volume2, VolumeX } from 'lucide-react'
import { User } from '@/lib/types'
import { cn } from '@/lib/utils'
import { TrtcClient } from '@/lib/trtc/client'
import {
  acquireCallUiLock,
  createCallLockToken,
  releaseCallUiLock,
  updateCallUiLock,
} from '@/lib/call/call-ui-lock'
import {
  pauseIncomingRingtone,
  resumeIncomingRingtone,
  startIncomingRingtone,
  stopIncomingRingtone,
} from '@/lib/call/incoming-ringtone'

// Generate a short channel name that fits call room requirements.
function generateChannelName(userId1: string, userId2: string, conversationId?: string): string {
  const maxLen = 30 // keep margin from room ID conversion and URL-safe transport
  // Use conversationId if available (shorter and more stable)
  if (conversationId) {
    // Take first 32 chars of conversationId and add a short suffix
    const shortId = conversationId.replace(/-/g, '').substring(0, 24)
    return `voice_${shortId}`.substring(0, maxLen)
  }
  
  // Otherwise, use a hash of user IDs
  // Sort IDs to ensure same channel name for both users
  const sortedIds = [userId1, userId2].sort()
  // Take first 16 chars of each ID (without dashes) and combine
  const id1 = sortedIds[0].replace(/-/g, '').substring(0, 16)
  const id2 = sortedIds[1].replace(/-/g, '').substring(0, 16)
  return `voice_${id1}_${id2}`.substring(0, maxLen)
}

function normalizeCallSessionId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function fallbackCallSessionId(messageId?: string): string {
  if (!messageId) return ''
  return `msg_${messageId}`
}

interface VoiceCallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipient: User
  currentUser: User
  conversationId: string
  callMessageId?: string // 如果是接听通话，传入通话消息ID
  callSessionId?: string
  isIncoming?: boolean // 是否是来电
  autoAnswer?: boolean // 从消息列表点击接听时自动接听
  isGroup?: boolean
  groupName?: string
  groupMembers?: User[]
  onCallEnd?: (duration: number, status: 'answered' | 'missed' | 'cancelled') => void // 通话结束回调
}

export function VoiceCallDialog({ 
  open, 
  onOpenChange, 
  recipient,
  currentUser,
  conversationId,
  callMessageId,
  callSessionId,
  isIncoming = false,
  autoAnswer = false,
  isGroup = false,
  groupName,
  groupMembers = [],
  onCallEnd
}: VoiceCallDialogProps) {
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true)
  const [callDuration, setCallDuration] = useState(0)
  const [callStatus, setCallStatus] = useState<'calling' | 'ringing' | 'connected' | 'ended'>(isIncoming ? 'ringing' : 'calling')
  const [remoteUserJoined, setRemoteUserJoined] = useState(false) // 跟踪远程用户是否已加入
  const callStartTimeRef = useRef<number | null>(null)
  
  const agoraClientRef = useRef<TrtcClient | null>(null)
  const callMessageIdRef = useRef<string | undefined>(callMessageId)
  const uniqueUidRef = useRef<string | null>(null) // Store unique UID for this call session
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const endingCallRef = useRef(false)
  const callStatusRef = useRef(callStatus)
  const lockTokenRef = useRef<string>(createCallLockToken('voice'))
  const ringtoneOwnerRef = useRef<string>(createCallLockToken('ringtone_voice'))
  const outgoingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const incomingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const outgoingAnsweredTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const outgoingInviteStartedRef = useRef(false)
  const initializeContextRef = useRef<'answer' | 'outgoing' | 'signal' | null>(null)
  const callSessionIdRef = useRef<string>(normalizeCallSessionId(callSessionId) || fallbackCallSessionId(callMessageId))

  const resolveIncomingSessionId = (candidate: unknown, messageId?: string): string => {
    return normalizeCallSessionId(candidate) || fallbackCallSessionId(messageId)
  }

  const ensureCallSessionId = (candidate?: unknown, messageId?: string): string => {
    const incomingSessionId = resolveIncomingSessionId(
      candidate,
      messageId || callMessageIdRef.current || callMessageId,
    )
    if (incomingSessionId) {
      callSessionIdRef.current = incomingSessionId
      return incomingSessionId
    }
    if (callSessionIdRef.current) {
      return callSessionIdRef.current
    }
    const generated = createCallLockToken('call_session')
    callSessionIdRef.current = generated
    return generated
  }

  const isMatchingCallSession = (candidate?: unknown, messageId?: string): boolean => {
    const incomingSessionId = resolveIncomingSessionId(
      candidate,
      messageId || callMessageIdRef.current || callMessageId,
    )
    if (!incomingSessionId) return true
    const activeSessionId = ensureCallSessionId(undefined, messageId)
    return !activeSessionId || activeSessionId === incomingSessionId
  }

  const getAgoraNumericUid = (userId: string) => {
    const randomHigh = Math.floor(Math.random() * 0x7ffffff)
    const timestamp = Date.now() % 0xffffff
    const perfCounter = Math.floor((performance.now() * 1000) % 0xffff)
    const userIdHash = (() => {
      let hash = 2166136261
      for (let i = 0; i < userId.length; i += 1) {
        hash ^= userId.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
      }
      return (hash >>> 0) % 0xff
    })()

    const combined = randomHigh ^ timestamp ^ perfCounter
    const finalUid = (combined % 0xffffff00) + userIdHash
    return Math.max(1, Math.min(finalUid, 0xffffffff))
  }

  const fetchTrtcCredentials = async (uid: number | string, preferredAppId?: string) => {
    const response = await fetch(`/api/trtc/user-sig?userId=${encodeURIComponent(String(uid))}`)
    const data = await response.json().catch(() => ({}))

    if (!response.ok || !data?.userSig) {
      throw new Error(data?.error || 'Failed to get TRTC userSig')
    }

    const resolvedAppId = preferredAppId || (data?.sdkAppId ? String(data.sdkAppId) : '')
    if (!resolvedAppId) {
      throw new Error('TRTC SDKAppID not configured')
    }

    return {
      appId: resolvedAppId,
      userSig: String(data.userSig),
    }
  }

  const clearOutgoingAnsweredTimeout = () => {
    if (outgoingAnsweredTimeoutRef.current) {
      clearTimeout(outgoingAnsweredTimeoutRef.current)
      outgoingAnsweredTimeoutRef.current = null
    }
  }

  const writeCallConnectionFailure = async (
    reason: 'connect_failed' | 'connect_timeout',
    messageIdInput?: string,
  ) => {
    const messageId = messageIdInput || callMessageIdRef.current || callMessageId
    if (!messageId) return

    try {
      const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}`)
      const msgData = await msgResponse.json()
      if (!msgData?.success) return

      const callMessage = msgData.messages.find((m: any) => m.id === messageId)
      if (!callMessage) return

      const currentStatus = String(callMessage.metadata?.call_status || '')
      if (currentStatus === 'ended' || currentStatus === 'cancelled' || currentStatus === 'missed') {
        return
      }

      const sessionId = ensureCallSessionId(callMessage.metadata?.call_session_id, messageId)
      const nowIso = new Date().toISOString()
      const updatedMetadata = {
        ...(callMessage.metadata || {}),
        call_status: 'cancelled',
        ended_at: nowIso,
        reject_reason: reason,
        connect_failed_by: currentUser.id,
        connect_failed_at: nowIso,
        call_session_id: sessionId,
      }

      const updateResponse = await fetch(`/api/messages/${messageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata: updatedMetadata,
        }),
      })

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text()
        console.error('[VoiceCallDialog] Failed to sync connection failure status:', {
          messageId,
          reason,
          status: updateResponse.status,
          errorText,
        })
      }
    } catch (error) {
      console.error('[VoiceCallDialog] Failed to write connection failure status:', {
        messageId,
        reason,
        error,
      })
    }
  }

  useEffect(() => {
    callStatusRef.current = callStatus
  }, [callStatus])

  const shouldPlayRingtone =
    open &&
    (
      (isIncoming && callStatus === 'ringing') ||
      (!isIncoming && callStatus === 'calling')
    )

  useEffect(() => {
    const owner = ringtoneOwnerRef.current
    if (shouldPlayRingtone) {
      startIncomingRingtone(owner)
    } else {
      stopIncomingRingtone(owner)
    }
    return () => {
      stopIncomingRingtone(owner)
    }
  }, [shouldPlayRingtone])

  useEffect(() => {
    if (!shouldPlayRingtone || typeof document === 'undefined') return
    const owner = ringtoneOwnerRef.current
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resumeIncomingRingtone(owner)
      } else {
        pauseIncomingRingtone(owner)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [shouldPlayRingtone])

  // Prevent stale "ended" dialog from blocking the next incoming invite.
  useEffect(() => {
    if (!open || callStatus !== 'ended') return
    updateCallUiLock(lockTokenRef.current, { phase: 'ending' })
    const timer = setTimeout(() => {
      if (callStatusRef.current === 'ended') {
        onOpenChange(false)
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [open, callStatus, onOpenChange])

  useEffect(() => {
    callMessageIdRef.current = callMessageId
    if (callMessageId) {
      ensureCallSessionId(callSessionId, callMessageId)
    }
  }, [callMessageId])

  useEffect(() => {
    if (callSessionId) {
      ensureCallSessionId(callSessionId, callMessageIdRef.current || callMessageId)
    }
  }, [callSessionId])

  // 轮询检查对方是否接听（发起方使用）
  const startPollingForAnswer = (channelName: string) => {
    console.log('[Polling] Starting polling for answer, channelName:', channelName, 'messageId:', callMessageIdRef.current)
    // 清除之前的轮询
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }
    
    // 立即检查一次，然后每2秒检查一次
    const checkAnswer = async () => {
      const messageId = callMessageIdRef.current
      if (!messageId) return
      
      try {
        // 添加时间戳避免缓存
        const timestamp = Date.now()
        const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}&_t=${timestamp}`)
        const msgData = await msgResponse.json()
        if (msgData.success) {
          const callMessage = msgData.messages.find((m: any) => m.id === messageId)
          if (!callMessage) {
            console.warn('[Polling] Call message not found:', messageId)
            return
          }
          
          const metadata = callMessage?.metadata || {}
          if (!isMatchingCallSession(metadata.call_session_id, messageId)) {
            return
          }
          const callStatus = metadata.call_status
          const fullMetadata = callMessage?.metadata || {}
          
          // 详细的前端日志（只在状态变化或每5次轮询时输出，减少日志量）
          const shouldLog = callStatus !== 'calling' || (Date.now() % 10000 < 2000) // 每10秒至少输出一次
          if (shouldLog) {
            console.log('[Polling] Status check:', {
              messageId,
              callStatus,
              metadata: fullMetadata,
              timestamp: new Date().toISOString(),
            })
          }
          
          if (callStatus === 'answered') {
            // 对方已接听，停止轮询并加入频道
            console.log('[Polling] ✅ Call answered! Stopping polling and joining channel...')
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }
            if (!callStartTimeRef.current) {
              callStartTimeRef.current = Date.now()
            }
            setCallStatus('connected')
            try {
              // 从消息中获取频道名称，确保使用最新的值
              const channelNameToUse = callMessage?.metadata?.channel_name || channelName
              console.log('[Polling] Joining channel:', channelNameToUse)
              await initializeCall(channelNameToUse, 'outgoing')
            } catch (error) {
              console.error('[Polling] ❌ Failed to initialize call after answer:', error)
              await writeCallConnectionFailure('connect_failed', messageId)
              // Keep dialog open so user can still hang up manually after answer failure.
              setCallStatus('ended')
            }
          } else if ((callStatus === 'missed' || callStatus === 'cancelled') && callStatusRef.current !== 'connected') {
            // 对方拒绝或取消，停止轮询
            console.log('[Polling] ❌ Call rejected/cancelled:', callStatus)
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }
            setCallStatus('ended')
            onOpenChange(false)
          }
        }
      } catch (error) {
        console.error('[Polling] ❌ Error polling for answer:', error)
      }
    }
    
    // 立即检查一次
    checkAnswer()
    
    // 然后每2秒检查一次
    pollingIntervalRef.current = setInterval(checkAnswer, 2000)
  }

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!open) return

    endingCallRef.current = false
    outgoingInviteStartedRef.current = false
    const initialMessageId = callMessageIdRef.current || callMessageId
    if (isIncoming) {
      ensureCallSessionId(callSessionId, initialMessageId)
    } else if (!normalizeCallSessionId(callSessionId)) {
      callSessionIdRef.current = ''
      ensureCallSessionId(undefined, initialMessageId)
    }
    const acquired = acquireCallUiLock({
      token: lockTokenRef.current,
      callType: 'voice',
      direction: isIncoming ? 'incoming' : 'outgoing',
      conversationId,
      messageId: initialMessageId,
      phase: isIncoming ? 'incoming' : 'outgoing',
    })
    if (!acquired) {
      // Busy: incoming invite gets rejected; outgoing attempt just closes.
      if (isIncoming && initialMessageId) {
        void fetch(`/api/messages/${initialMessageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metadata: {
              call_status: 'missed',
              rejected_at: new Date().toISOString(),
              reject_reason: 'busy',
            },
          }),
        }).catch((error) => {
          console.error('[VoiceCallDialog] Failed to reject busy invite:', error)
        })
      }
      onOpenChange(false)
      return
    }

    // UID is generated in initializeCall to avoid stale/duplicate values across retries.
    if (isIncoming) {
      // 来电场景：默认显示响铃界面。
      // 如果来自消息列表点击“接听”，会在 autoAnswer effect 中自动执行接听流程。
      if (callMessageId) {
        callMessageIdRef.current = callMessageId
        updateCallUiLock(lockTokenRef.current, { messageId: callMessageId })
      }
      setCallStatus('ringing')
    } else {
      // 发起通话：发送邀请
      sendCallInvitation()
    }
    
    return () => {
      // Cleanup: leave channel and clear client
      if (agoraClientRef.current) {
        agoraClientRef.current.leave().catch(console.error)
        agoraClientRef.current = null
      }
      outgoingInviteStartedRef.current = false
      callSessionIdRef.current = ''
      uniqueUidRef.current = null
      clearOutgoingAnsweredTimeout()
      if (outgoingTimeoutRef.current) {
        clearTimeout(outgoingTimeoutRef.current)
        outgoingTimeoutRef.current = null
      }
      if (incomingTimeoutRef.current) {
        clearTimeout(incomingTimeoutRef.current)
        incomingTimeoutRef.current = null
      }
      releaseCallUiLock(lockTokenRef.current)
    }
  }, [open, isIncoming, callMessageId])

  // 从消息列表点击“Answer”时，自动接听（语音）
  useEffect(() => {
    if (!open) return
    if (!isIncoming) return
    if (!autoAnswer) return
    if (!callMessageIdRef.current && !callMessageId) return
    handleAnswerCall()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isIncoming, autoAnswer, callMessageId])

  // Real-time call signal listener (faster than polling; polling stays as fallback).
  useEffect(() => {
    if (!open) return

    const handleCallSignal = (event: Event) => {
      const custom = event as CustomEvent<{
        messageId?: string
        conversationId?: string
        callStatus?: string
        channelName?: string
        callSessionId?: string
      }>
      const detail = custom.detail || {}
      const currentMessageId = callMessageIdRef.current || callMessageId
      if (!currentMessageId) return
      if (String(detail.messageId || '') !== String(currentMessageId)) return
      if (String(detail.conversationId || '') !== String(conversationId)) return
      if (!isMatchingCallSession(detail.callSessionId, currentMessageId)) return

      const status = String(detail.callStatus || '')
      if (!status) return

      if (status === 'answered' && !isIncoming && callStatusRef.current === 'calling') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
        ensureCallSessionId(detail.callSessionId, currentMessageId)
        if (!callStartTimeRef.current) {
          callStartTimeRef.current = Date.now()
        }
        setCallStatus('connected')
        updateCallUiLock(lockTokenRef.current, { phase: 'active' })
        if (!agoraClientRef.current) {
          void initializeCall(detail.channelName, 'signal').catch(async (error) => {
            console.error('[VoiceCallDialog] Failed to initialize call from signal:', error)
            await writeCallConnectionFailure('connect_failed', currentMessageId)
            // Keep dialog open so user can still hang up manually after answer failure.
            setCallStatus('ended')
          })
        }
        return
      }

      if (status === 'ended') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
        setCallStatus('ended')
        onOpenChange(false)
        return
      }

      if ((status === 'missed' || status === 'cancelled') && callStatusRef.current !== 'connected') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
        setCallStatus('ended')
        onOpenChange(false)
      }
    }

    window.addEventListener('callSignal', handleCallSignal as EventListener)
    return () => {
      window.removeEventListener('callSignal', handleCallSignal as EventListener)
    }
  }, [open, isIncoming, callMessageId, conversationId, onOpenChange])

  // Fallback status sync to close stale dialogs when realtime events are delayed/lost.
  useEffect(() => {
    if (!open) return
    const messageId = callMessageIdRef.current || callMessageId
    if (!messageId) return

    let disposed = false
    const syncStatus = async () => {
      if (disposed) return
      try {
        const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}&_t=${Date.now()}`)
        const msgData = await msgResponse.json()
        if (!msgData?.success || !Array.isArray(msgData?.messages)) return
        const callMessage = msgData.messages.find((m: any) => String(m?.id || '') === String(messageId))
        const metadata = callMessage?.metadata || {}
        if (!isMatchingCallSession(metadata.call_session_id, messageId)) {
          return
        }
        const status = String(callMessage?.metadata?.call_status || '')
        if (!status) return
        if (status === 'ended' || ((status === 'cancelled' || status === 'missed') && callStatusRef.current !== 'connected')) {
          setCallStatus('ended')
          onOpenChange(false)
        }
      } catch {
        // Ignore sync errors and retry on next interval.
      }
    }

    const intervalId = setInterval(syncStatus, 2000)
    void syncStatus()
    return () => {
      disposed = true
      clearInterval(intervalId)
    }
  }, [open, callMessageId, conversationId, onOpenChange])

  // Outgoing unanswered timeout.
  useEffect(() => {
    if (!open || isIncoming || callStatus !== 'calling') return
    if (outgoingTimeoutRef.current) clearTimeout(outgoingTimeoutRef.current)
    outgoingTimeoutRef.current = setTimeout(() => {
      if (callStatusRef.current === 'calling') {
        void handleEndCall()
      }
    }, 35000)
    return () => {
      if (outgoingTimeoutRef.current) {
        clearTimeout(outgoingTimeoutRef.current)
        outgoingTimeoutRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isIncoming, callStatus])

  // Incoming ringing timeout.
  useEffect(() => {
    if (!open || !isIncoming || callStatus !== 'ringing') return
    if (incomingTimeoutRef.current) clearTimeout(incomingTimeoutRef.current)
    incomingTimeoutRef.current = setTimeout(() => {
      if (callStatusRef.current === 'ringing') {
        void handleRejectCall('timeout')
      }
    }, 35000)
    return () => {
      if (incomingTimeoutRef.current) {
        clearTimeout(incomingTimeoutRef.current)
        incomingTimeoutRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isIncoming, callStatus])

  // Outgoing: once answered, fail-fast if peer never joins media channel.
  useEffect(() => {
    if (!open || isIncoming || callStatus !== 'connected' || remoteUserJoined) {
      clearOutgoingAnsweredTimeout()
      return
    }

    clearOutgoingAnsweredTimeout()
    outgoingAnsweredTimeoutRef.current = setTimeout(() => {
      if (callStatusRef.current !== 'connected' || remoteUserJoined) return
      console.warn('[VoiceCallDialog] Outgoing connect timeout after answered', {
        conversationId,
        messageId: callMessageIdRef.current || callMessageId,
        callSessionId: callSessionIdRef.current,
      })
      void writeCallConnectionFailure('connect_timeout')
      setCallStatus('ended')
      onOpenChange(false)
    }, 15_000)

    return () => {
      clearOutgoingAnsweredTimeout()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isIncoming, callStatus, remoteUserJoined, conversationId])

  // 发送通话邀请消息
  const sendCallInvitation = async () => {
    // Guard against duplicate invites when parent re-renders while dialog is open.
    if (!isIncoming && outgoingInviteStartedRef.current) {
      return
    }
    outgoingInviteStartedRef.current = true
    try {
      setCallStatus('calling')
      
      // 生成频道名称（使用短格式以符合 Agora 64字节限制）
      const channelName = isGroup 
        ? `group_voice_${(groupName || 'group').substring(0, 15).replace(/[^a-zA-Z0-9]/g, '')}_${Date.now().toString().slice(-10)}`
        : generateChannelName(currentUser.id, recipient.id, conversationId)
      const sessionId = ensureCallSessionId(undefined, callMessageIdRef.current || callMessageId)
      
      // 发送通话邀请消息
      const inviteExpiresAt = new Date(Date.now() + 35_000).toISOString()
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          content: isGroup ? `Voice call` : `Voice call`,
          type: 'system',
          metadata: {
            call_type: 'voice',
            call_status: 'calling',
            channel_name: channelName,
            caller_id: currentUser.id,
            caller_name: currentUser.full_name || currentUser.username || currentUser.email,
            invite_expires_at: inviteExpiresAt,
            call_session_id: sessionId,
          },
        }),
      })

      const data = await response.json()
      if (data.success && data.message?.id) {
        // 保存通话消息ID和频道名称
        callMessageIdRef.current = data.message.id
        updateCallUiLock(lockTokenRef.current, {
          messageId: data.message.id,
          phase: 'outgoing',
        })
        // 发起方只发送邀请，保持 calling 状态，等待对方接听
        // 不立即加入频道，等对方接听后通过监听消息状态变化来加入
        startPollingForAnswer(channelName)
      } else {
        outgoingInviteStartedRef.current = false
        setCallStatus('ended')
        onOpenChange(false)
      }
    } catch (error) {
      outgoingInviteStartedRef.current = false
      console.error('Failed to send call invitation:', error)
      setCallStatus('ended')
      onOpenChange(false)
    }
  }

  // 接听通话
  const handleAnswerCall = async () => {
    const messageId = callMessageIdRef.current || callMessageId
    if (!messageId) return
    
    try {
      // 先获取消息以获取 channelName 和现有 metadata
      const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}`)
      const msgData = await msgResponse.json()
      if (msgData.success) {
        const callMessage = msgData.messages.find((m: any) => m.id === messageId)
        if (!callMessage) {
          console.error('Call message not found when answering:', messageId)
          setCallStatus('ended')
          return
        }

        const sessionId = ensureCallSessionId(callMessage.metadata?.call_session_id, messageId)
        const updatedMetadata = {
          ...(callMessage.metadata || {}),
          call_status: 'answered',
          answered_at: new Date().toISOString(),
          answered_by: currentUser.id,
          call_session_id: sessionId,
        }

        const updateResponse = await fetch(`/api/messages/${messageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metadata: updatedMetadata,
          }),
        })

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text()
          console.error('Failed to update call status:', updateResponse.status, errorText)
          console.warn('Continuing call despite status update failure')
        }

        if (incomingTimeoutRef.current) {
          clearTimeout(incomingTimeoutRef.current)
          incomingTimeoutRef.current = null
        }
        clearOutgoingAnsweredTimeout()
        if (!callStartTimeRef.current) {
          callStartTimeRef.current = Date.now()
        }
        setCallStatus('connected')
        updateCallUiLock(lockTokenRef.current, {
          messageId,
          phase: 'active',
        })

        try {
          await initializeCall(callMessage.metadata?.channel_name, 'answer')
        } catch (initError) {
          console.error('[VoiceCallDialog] Failed to initialize answered call:', initError)
          await writeCallConnectionFailure('connect_failed', messageId)
          setCallStatus('ended')
        }
      }
    } catch (error) {
      console.error('Failed to answer call:', error)
      // Keep dialog open so user can still hang up manually after answer failure.
      setCallStatus('ended')
    }
  }

  // 拒绝通话
  const handleRejectCall = async (
    reason: 'declined' | 'busy' | 'timeout' | 'connect_failed' | 'connect_timeout' = 'declined'
  ) => {
    const messageId = callMessageIdRef.current || callMessageId
    if (messageId) {
      try {
        // 先获取消息以合并 metadata
        const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}`)
        const msgData = await msgResponse.json()
        if (msgData.success) {
          const callMessage = msgData.messages.find((m: any) => m.id === messageId)
          if (callMessage) {
            const sessionId = ensureCallSessionId(callMessage.metadata?.call_session_id, messageId)
            const updatedMetadata = {
              ...(callMessage.metadata || {}),
              call_status: 'missed',
              rejected_at: new Date().toISOString(),
              reject_reason: reason,
              call_session_id: sessionId,
            }
            
            const updateResponse = await fetch(`/api/messages/${messageId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                metadata: updatedMetadata,
              }),
            })
            
            if (!updateResponse.ok) {
              const errorText = await updateResponse.text()
              console.error('Failed to update call status:', updateResponse.status, errorText)
            }
          }
        }
      } catch (error) {
        console.error('Failed to update call status:', error)
      }
    }
    setCallStatus('ended')
    clearOutgoingAnsweredTimeout()
    onOpenChange(false)
    if (onCallEnd) {
      onCallEnd(0, 'missed')
    }
  }

  const initializeCall = async (
    channelName?: string,
    source: 'answer' | 'outgoing' | 'signal' = 'outgoing',
  ) => {
    initializeContextRef.current = source

    try {
      const isSecure = window.location.protocol === 'https:' ||
                       window.location.hostname === 'localhost' ||
                       window.location.hostname === '127.0.0.1'
      if (!isSecure) {
        throw new Error('WEB_SECURITY_RESTRICT: Voice calls require HTTPS or localhost')
      }

      const messageId = callMessageIdRef.current || callMessageId
      if (!channelName && messageId) {
        const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}`)
        const msgData = await msgResponse.json()
        if (msgData.success) {
          const callMessage = msgData.messages.find((m: any) => m.id === messageId)
          if (callMessage?.metadata?.channel_name) {
            channelName = callMessage.metadata.channel_name
          }
        }
      }

      if (!channelName) {
        channelName = isGroup
          ? `group_voice_${(groupName || 'group').substring(0, 15).replace(/[^a-zA-Z0-9]/g, '')}_${Date.now().toString().slice(-10)}`
          : generateChannelName(currentUser.id, recipient.id, conversationId)
      }

      if (channelName.length > 64) {
        console.warn('[VoiceCallDialog] Channel name too long, truncating', {
          originalLength: channelName.length,
          channelName,
        })
        channelName = channelName.substring(0, 64)
      }

      if (agoraClientRef.current) {
        const oldClient = agoraClientRef.current
        agoraClientRef.current = null
        oldClient.leave().catch(() => {})
        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      let appId = process.env.NEXT_PUBLIC_TRTC_SDK_APP_ID || ''
      const numericUid = getAgoraNumericUid(currentUser.id)
      uniqueUidRef.current = `${currentUser.id}_${numericUid}`
      const credentials = await fetchTrtcCredentials(numericUid, appId)
      appId = credentials.appId

      console.log('[VoiceCallDialog] initializeCall start', {
        source,
        callSessionId: callSessionIdRef.current,
        uid: numericUid,
        channel: channelName,
        messageId,
      })

      const client = new TrtcClient({
        appId,
        token: credentials.userSig,
        channel: channelName,
        uid: numericUid,
      })

      client.setOnRemoteUserPublished((user) => {
        console.log('Remote user published:', user.uid, 'Audio track:', !!user.audioTrack)
        if (user.audioTrack) {
          user.audioTrack.play()
        }
        clearOutgoingAnsweredTimeout()
        setRemoteUserJoined(true)
        setCallStatus((prev) => {
          if (prev !== 'connected') {
            if (!callStartTimeRef.current) {
              callStartTimeRef.current = Date.now()
            }
            return 'connected'
          }
          return prev
        })
      })

      client.setOnRemoteUserUnpublished((uid) => {
        console.log('Remote user unpublished:', uid)
      })

      agoraClientRef.current = client
      await client.join({ audioOnly: true })
      clearOutgoingAnsweredTimeout()
      console.log('[VoiceCallDialog] Joined voice channel successfully', {
        source,
        callSessionId: callSessionIdRef.current,
        uid: numericUid,
        channel: channelName,
      })

      setCallStatus('connected')
      updateCallUiLock(lockTokenRef.current, { phase: 'active' })
    } catch (error: any) {
      const errorMessage = String(error?.message || 'Failed to connect to call')
      const errorCode = String(error?.code || '')
      const isSecurityError =
        errorMessage.includes('WEB_SECURITY_RESTRICT') ||
        errorMessage.includes('NOT_SUPPORTED') ||
        errorMessage.includes('getUserMedia')
      const isAbortLikeError =
        errorMessage.includes('WS_ABORT') ||
        errorMessage.includes('OPERATION_ABORTED') ||
        errorMessage.includes('LEAVE') ||
        errorCode === 'WS_ABORT' ||
        errorCode === 'OPERATION_ABORTED'
      const isUserInitiatedAbort =
        endingCallRef.current || callStatusRef.current === 'ended' || !open

      const structuredLog = {
        source: initializeContextRef.current,
        callSessionId: callSessionIdRef.current,
        uid: uniqueUidRef.current,
        channel: channelName,
        errorCode,
        errorMessage,
        isIncoming,
        currentStatus: callStatusRef.current,
        isUserInitiatedAbort,
      }

      if (isSecurityError) {
        console.error('[VoiceCallDialog] initializeCall blocked by browser security', structuredLog)
        alert('Voice calls require HTTPS or localhost. Please use HTTPS or access from localhost (http://localhost:3001).')
        agoraClientRef.current = null
        throw error
      }

      if (isAbortLikeError && isUserInitiatedAbort) {
        console.warn('[VoiceCallDialog] initializeCall aborted by local teardown', structuredLog)
        agoraClientRef.current = null
        return
      }

      console.error('[VoiceCallDialog] initializeCall failed', structuredLog)
      agoraClientRef.current = null
      throw error
    } finally {
      initializeContextRef.current = null
    }
  }

  useEffect(() => {
    if (callStatus === 'connected' && callStartTimeRef.current && remoteUserJoined) {
      // Update duration immediately when remote user joins
      const updateDuration = () => {
        if (callStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000)
          setCallDuration(elapsed)
        }
      }
      
      // Update immediately
      updateDuration()
      
      // Then update every second
      const interval = setInterval(updateDuration, 1000)
      return () => clearInterval(interval)
    } else if (callStatus !== 'connected' || !remoteUserJoined) {
      // Reset duration when not connected or remote user hasn't joined
      setCallDuration(0)
    }
  }, [callStatus, remoteUserJoined])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleEndCall = async () => {
    if (endingCallRef.current) return
    endingCallRef.current = true
    clearOutgoingAnsweredTimeout()

    // 保存当前状态，因为后面会设置为 ended
    const currentStatus = callStatus
    const currentRemoteJoined = remoteUserJoined
    
    // 先设置状态为 ended，防止 Dialog 被意外关闭
    setCallStatus('ended')
    updateCallUiLock(lockTokenRef.current, { phase: 'ending' })
    
    const duration = callStartTimeRef.current 
      ? Math.floor((Date.now() - callStartTimeRef.current) / 1000)
      : callDuration

    if (agoraClientRef.current) {
      try {
        await agoraClientRef.current.leave()
      } catch (error) {
        console.error('Failed to leave call:', error)
      }
      agoraClientRef.current = null
    }

    // 更新通话记录 - 确保双方都能看到通话时长
    const messageId = callMessageIdRef.current || callMessageId
    let finalCallStatus: 'ended' | 'missed' | 'cancelled' =
      (currentStatus === 'connected' && currentRemoteJoined) ? 'ended' :
      (currentStatus === 'ringing' ? 'missed' : 'cancelled')
    let finalDuration = (currentStatus === 'connected' && currentRemoteJoined) ? duration : 0
    
    if (messageId) {
      try {
        // 先获取消息以合并 metadata
        const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}`)
        const msgData = await msgResponse.json()
        if (msgData.success) {
          const callMessage = msgData.messages.find((m: any) => m.id === messageId)
          if (callMessage) {
            const metadata = callMessage.metadata || {}
            const backendStatus = String(metadata.call_status || '')
            const answeredAtMs = Date.parse(String(metadata.answered_at || ''))
            const backendWasAnswered = backendStatus === 'answered' || Number.isFinite(answeredAtMs)
            const locallyConnected = currentStatus === 'connected' || currentRemoteJoined

            if (backendWasAnswered || locallyConnected) {
              finalCallStatus = 'ended'
              finalDuration = Math.max(finalDuration, duration)
              if (finalDuration <= 0 && Number.isFinite(answeredAtMs)) {
                finalDuration = Math.max(0, Math.floor((Date.now() - answeredAtMs) / 1000))
              }
            }

            const updatedMetadata = {
              ...callMessage.metadata,
              call_status: finalCallStatus,
              call_duration: finalDuration,
              ended_at: new Date().toISOString(),
              call_session_id: ensureCallSessionId(callMessage.metadata?.call_session_id, messageId),
            }
            
            // 更新消息，确保双方都能看到
            await fetch(`/api/messages/${messageId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                metadata: updatedMetadata,
              }),
            })

            // 本地立即触发一次消息刷新事件（当前会话）
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('callEnded', {
                detail: {
                  conversationId,
                  messageId,
                },
              }))
            }
          }
        }
      } catch (error) {
        console.error('Failed to update call record:', error)
      }
    }

    const finalStatus = finalCallStatus === 'ended' ? 'answered' :
      (finalCallStatus === 'missed' ? 'missed' : 'cancelled')
    if (onCallEnd) {
      onCallEnd(finalDuration, finalStatus)
    }
    setCallDuration(0)
    setIsMuted(false)
    setIsSpeakerOn(true)
    setRemoteUserJoined(false)
    callStartTimeRef.current = null
    setTimeout(() => {
      onOpenChange(false)
      endingCallRef.current = false
    }, 500)
  }

  const handleToggleMute = async () => {
    if (agoraClientRef.current) {
      const newMuted = !isMuted
      await agoraClientRef.current.setMuted(newMuted)
      setIsMuted(newMuted)
    }
  }

  const displayName = isGroup
    ? groupName || 'Group call'
    : recipient.full_name || recipient.username || recipient.email || 'User'
  const displayMembers = isGroup ? groupMembers : [recipient]

  const getStatusText = () => {
    if (callStatus === 'ringing') return 'Incoming voice call'
    if (callStatus === 'calling') return 'Calling...'
    if (callStatus === 'connected') return remoteUserJoined ? formatDuration(callDuration) : 'Connecting...'
    return 'Call ended'
  }

  const statusBadgeClass = cn(
    'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-md',
    callStatus === 'connected' && 'border-emerald-300/40 bg-emerald-400/20 text-emerald-100',
    callStatus === 'calling' && 'border-sky-300/35 bg-sky-400/20 text-sky-100',
    callStatus === 'ringing' && 'border-amber-300/40 bg-amber-400/25 text-amber-50',
    callStatus === 'ended' && 'border-slate-300/30 bg-slate-500/25 text-slate-100',
  )

  // 外部关闭动作统一视为“挂断/取消”
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && callStatusRef.current !== 'ended') {
      void handleEndCall()
      return
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md border-0 bg-transparent p-0 shadow-none"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {isGroup ? `Group voice call with ${groupName || 'group'}` : `Voice call with ${displayName}`}
          </DialogTitle>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#050b16] text-white shadow-[0_28px_70px_rgba(2,8,23,0.75)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_100%_0%,rgba(56,189,248,0.23),transparent_62%),radial-gradient(90%_80%_at_0%_100%,rgba(16,185,129,0.18),transparent_64%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-30 [background:linear-gradient(120deg,rgba(255,255,255,0.08)_0%,transparent_26%,transparent_74%,rgba(255,255,255,0.06)_100%)]" />

          <div className="relative flex min-h-[560px] flex-col px-6 pb-6 pt-5">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white/85">
                Voice
              </div>
              <div className={statusBadgeClass}>
                {callStatus === 'connected'
                  ? (remoteUserJoined ? 'In Call' : 'Connecting')
                  : callStatus === 'ringing'
                    ? 'Incoming'
                    : callStatus === 'calling'
                      ? 'Outgoing'
                      : 'Ended'}
              </div>
            </div>

            <div className="mt-9 flex flex-col items-center">
              {isGroup ? (
                <div className="relative flex justify-center -space-x-5">
                  {displayMembers.slice(0, 3).map((member, index) => (
                    <Avatar
                      key={member.id}
                      className={cn(
                        'h-24 w-24 border-4 border-white/20 shadow-xl shadow-black/40',
                        index === 1 && 'translate-y-1',
                      )}
                    >
                      <AvatarImage src={member.avatar_url || undefined} />
                      <AvatarFallback
                        className="bg-slate-700 text-lg"
                        name={member.full_name || member.email || 'User'}
                      >
                        {(member.full_name || member.email || 'User')
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              ) : (
                <div className="relative">
                  {callStatus !== 'ended' && (
                    <div className="absolute -inset-3 rounded-full border border-emerald-300/35 opacity-70 animate-ping" />
                  )}
                  <Avatar className="relative h-32 w-32 border-4 border-white/20 shadow-2xl shadow-black/40">
                    <AvatarImage src={recipient.avatar_url || undefined} />
                    <AvatarFallback
                      className="bg-slate-700 text-3xl"
                      name={recipient.full_name || recipient.email || 'User'}
                    >
                      {(recipient.full_name || recipient.email || 'User')
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}

              <div className="mt-7 text-center">
                <h3 className="text-[30px] font-semibold leading-none tracking-tight">{displayName}</h3>
                {isGroup && (
                  <p className="mt-2 text-sm text-white/70">{displayMembers.length} participants</p>
                )}
                {!isGroup && recipient.title && (
                  <p className="mt-2 text-sm text-white/70">{recipient.title}</p>
                )}
                <p className="mt-4 text-sm font-medium tracking-wide text-white/80">{getStatusText()}</p>
              </div>
            </div>

            <div className="mt-auto rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-5 backdrop-blur-xl">
              {callStatus === 'ringing' && isIncoming ? (
                <div className="flex items-center justify-center gap-8">
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-16 w-16 rounded-full shadow-[0_14px_26px_rgba(239,68,68,0.45)]"
                      onClick={() => {
                        void handleRejectCall()
                      }}
                    >
                      <Phone className="h-6 w-6 rotate-90" />
                    </Button>
                    <span className="text-xs text-white/70">Decline</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <Button
                      size="icon"
                      variant="default"
                      className="h-16 w-16 rounded-full border border-emerald-200/40 bg-emerald-500 hover:bg-emerald-600 shadow-[0_14px_26px_rgba(16,185,129,0.45)]"
                      onClick={handleAnswerCall}
                    >
                      <Phone className="h-6 w-6" />
                    </Button>
                    <span className="text-xs text-white/80">Answer</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-4">
                  <Button
                    size="icon"
                    variant="secondary"
                    className={cn(
                      'h-12 w-12 rounded-full border border-white/25 bg-white/12 text-white hover:bg-white/20',
                      !isSpeakerOn && 'bg-white/5 text-white/70',
                    )}
                    onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                    disabled={callStatus !== 'connected'}
                  >
                    {isSpeakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                  </Button>

                  <Button
                    size="icon"
                    variant={isMuted ? 'destructive' : 'secondary'}
                    className={cn(
                      'h-12 w-12 rounded-full border border-white/25 bg-white/12 text-white hover:bg-white/20',
                      isMuted && 'shadow-[0_10px_20px_rgba(239,68,68,0.35)]',
                    )}
                    onClick={handleToggleMute}
                    disabled={callStatus !== 'connected'}
                  >
                    {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </Button>

                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-16 w-16 rounded-full shadow-[0_14px_26px_rgba(239,68,68,0.45)]"
                    onClick={handleEndCall}
                  >
                    <Phone className="h-6 w-6 rotate-[135deg]" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
