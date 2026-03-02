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

interface VoiceCallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipient: User
  currentUser: User
  conversationId: string
  callMessageId?: string // 如果是接听通话，传入通话消息ID
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
  const outgoingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const incomingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    callStatusRef.current = callStatus
  }, [callStatus])

  useEffect(() => {
    callMessageIdRef.current = callMessageId
  }, [callMessageId])

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
          
          const callStatus = callMessage?.metadata?.call_status
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
            setCallStatus('connected')
            try {
              // 从消息中获取频道名称，确保使用最新的值
              const channelNameToUse = callMessage?.metadata?.channel_name || channelName
              console.log('[Polling] Joining channel:', channelNameToUse)
              await initializeCall(channelNameToUse)
            } catch (error) {
              console.error('[Polling] ❌ Failed to initialize call after answer:', error)
              setCallStatus('ended')
              onOpenChange(false)
            }
          } else if (callStatus === 'missed' || callStatus === 'cancelled') {
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
    const initialMessageId = callMessageIdRef.current || callMessageId
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

    // Generate unique numeric UID for this call session to avoid conflicts
    // This ensures each call attempt uses a different UID
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 100000)
    const uniqueNumericUid = Math.floor(timestamp / 1000) * 100000 + random
    uniqueUidRef.current = `${currentUser.id}_${uniqueNumericUid}`
    
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
      uniqueUidRef.current = null
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
      }>
      const detail = custom.detail || {}
      const currentMessageId = callMessageIdRef.current || callMessageId
      if (!currentMessageId) return
      if (String(detail.messageId || '') !== String(currentMessageId)) return
      if (String(detail.conversationId || '') !== String(conversationId)) return

      const status = String(detail.callStatus || '')
      if (!status) return

      if (status === 'answered' && !isIncoming) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
        setCallStatus('connected')
        updateCallUiLock(lockTokenRef.current, { phase: 'active' })
        if (!agoraClientRef.current) {
          void initializeCall(detail.channelName).catch((error) => {
            console.error('[VoiceCallDialog] Failed to initialize call from signal:', error)
            setCallStatus('ended')
            onOpenChange(false)
          })
        }
        return
      }

      if (status === 'missed' || status === 'cancelled' || status === 'ended') {
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

  // 发送通话邀请消息
  const sendCallInvitation = async () => {
    try {
      setCallStatus('calling')
      
      // 生成频道名称（使用短格式以符合 Agora 64字节限制）
      const channelName = isGroup 
        ? `group_voice_${(groupName || 'group').substring(0, 15).replace(/[^a-zA-Z0-9]/g, '')}_${Date.now().toString().slice(-10)}`
        : generateChannelName(currentUser.id, recipient.id, conversationId)
      
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
        setCallStatus('ended')
        onOpenChange(false)
      }
    } catch (error) {
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
        if (callMessage) {
          // 合并 metadata（确保 metadata 不为 null）
          const updatedMetadata = {
            ...(callMessage.metadata || {}),
            call_status: 'answered',
            answered_at: new Date().toISOString(),
            answered_by: currentUser.id,
          }
          
          // 更新消息状态为已接听
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
            // 即使更新失败，也继续接听流程（可能是网络问题，但通话可以继续）
            console.warn('Continuing call despite status update failure')
          }

          // 开始连接
          if (incomingTimeoutRef.current) {
            clearTimeout(incomingTimeoutRef.current)
            incomingTimeoutRef.current = null
          }
          updateCallUiLock(lockTokenRef.current, {
            messageId,
            phase: 'active',
          })
          await initializeCall(callMessage.metadata?.channel_name)
        }
      }
    } catch (error) {
      console.error('Failed to answer call:', error)
      handleRejectCall()
    }
  }

  // 拒绝通话
  const handleRejectCall = async (reason: 'declined' | 'busy' | 'timeout' = 'declined') => {
    const messageId = callMessageIdRef.current || callMessageId
    if (messageId) {
      try {
        // 先获取消息以合并 metadata
        const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}`)
        const msgData = await msgResponse.json()
        if (msgData.success) {
          const callMessage = msgData.messages.find((m: any) => m.id === messageId)
          if (callMessage) {
            const updatedMetadata = {
              ...(callMessage.metadata || {}),
              call_status: 'missed',
              rejected_at: new Date().toISOString(),
              reject_reason: reason,
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
    onOpenChange(false)
    if (onCallEnd) {
      onCallEnd(0, 'missed')
    }
  }

  const initializeCall = async (channelName?: string) => {
    try {
      // 检测 HTTPS 或 localhost（浏览器安全要求）
      const isSecure = window.location.protocol === 'https:' || 
                       window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1'
      
      if (!isSecure) {
        const errorMsg = 'Voice calls require HTTPS or localhost. Please use HTTPS or access from localhost.'
        console.error(errorMsg)
        alert(errorMsg + '\n\nFor testing: Use HTTPS or access from localhost (http://localhost:3001)')
        setCallStatus('ended')
        onOpenChange(false)
        return
      }

      // 如果没有传入 channelName，说明是发起者，需要从消息中获取
      if (!channelName && callMessageId) {
        // 获取消息以获取 channelName
        const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}`)
        const msgData = await msgResponse.json()
        if (msgData.success) {
          const callMessage = msgData.messages.find((m: any) => m.id === callMessageId)
          if (callMessage?.metadata?.channel_name) {
            channelName = callMessage.metadata.channel_name
          }
        }
      }

      if (!channelName) {
        // 如果没有 channelName，生成一个新的（使用短格式）
        channelName = isGroup 
          ? `group_voice_${(groupName || 'group').substring(0, 15).replace(/[^a-zA-Z0-9]/g, '')}_${Date.now().toString().slice(-10)}`
          : generateChannelName(currentUser.id, recipient.id, conversationId)
      }
      
      // Validate channel name length before converting to roomId
      if (channelName.length > 64) {
        console.error('Channel name too long:', channelName.length, 'bytes')
        // Truncate to 64 chars
        channelName = channelName.substring(0, 64)
      }

      // Clean up any existing client first to avoid conflicts
      if (agoraClientRef.current) {
        const oldClient = agoraClientRef.current
        agoraClientRef.current = null
        oldClient.leave().catch(() => {})
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Generate numeric UID within Agora's allowed range [0, 10000]
      const numericUid = (() => {
        if (uniqueUidRef.current) {
          const parsed = parseInt(uniqueUidRef.current.split('_').pop() || '0', 10)
          if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 10000) return parsed
        }
        // Base on timestamp but clamp to 1-9999
        const base = (Math.floor(Date.now() / 1000) % 9000) + 1000
        return base
      })()
      
      // Store the UID string for reference
      uniqueUidRef.current = `${currentUser.id}_${numericUid}`

      let appId = process.env.NEXT_PUBLIC_TRTC_SDK_APP_ID

      // 获取 TRTC userSig
      let token: string | undefined
      try {
        const tokenResponse = await fetch(`/api/trtc/user-sig?userId=${encodeURIComponent(String(numericUid))}`)
        const tokenData = await tokenResponse.json()
        if (tokenResponse.ok && tokenData?.userSig) {
          token = tokenData.userSig
          if (!appId && tokenData?.sdkAppId) {
            appId = String(tokenData.sdkAppId)
          }
        }
      } catch (error) {
        console.warn('Failed to get TRTC userSig:', error)
      }

      if (!appId) {
        console.error('TRTC SDKAppID not configured')
        setCallStatus('ended')
        return
      }

      if (!token) {
        console.error('TRTC userSig not configured')
        setCallStatus('ended')
        return
      }

      // 创建 TRTC 客户端（纯音频模式）
      const client = new TrtcClient({
        appId,
        token,
        channel: channelName,
        uid: numericUid,
      })

      // 设置远程用户回调
      client.setOnRemoteUserPublished((user) => {
        console.log('Remote user published:', user.uid, 'Audio track:', !!user.audioTrack)
        if (user.audioTrack) {
          // 播放远程音频
          user.audioTrack.play()
        }
        // Update status to connected when remote user joins
        setRemoteUserJoined(true)
        setCallStatus(prev => {
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

      // 加入频道（纯音频模式）
      await client.join({ audioOnly: true })
      console.log('Joined voice channel successfully')
      
      // Set status to connected after joining
      setCallStatus('connected')
      updateCallUiLock(lockTokenRef.current, { phase: 'active' })
      // 注意：callStartTimeRef 只在远程用户加入时设置，这样双方的时间是同步的
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to connect to call'
      const errorCode = error?.code || ''
      
      // 处理 HTTPS/安全限制错误
      if (errorMsg.includes('WEB_SECURITY_RESTRICT') || 
          errorMsg.includes('NOT_SUPPORTED') ||
          errorMsg.includes('getUserMedia')) {
        const httpsErrorMsg = 'Voice calls require HTTPS or localhost. Please use HTTPS or access from localhost (http://localhost:3001).'
        console.error(httpsErrorMsg, error)
        alert(httpsErrorMsg)
        agoraClientRef.current = null
        setCallStatus('ended')
        onOpenChange(false)
        return
      }
      
      // 某些场景（快速关闭/切换）Agora 会抛 WS_ABORT/OPERATION_ABORTED，视为正常中断
      if (errorMsg.includes('WS_ABORT') || 
          errorMsg.includes('OPERATION_ABORTED') || 
          errorMsg.includes('LEAVE') ||
          errorCode === 'WS_ABORT' ||
          errorCode === 'OPERATION_ABORTED') {
        agoraClientRef.current = null
        setCallStatus('ended')
        return
      }

      console.error('Failed to initialize call:', error)
      agoraClientRef.current = null
      setCallStatus('ended')
      throw error
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
    // 确定最终状态：如果已连接过（双方都加入了），就是 ended；如果还在 ringing，就是 missed；否则是 cancelled
    const finalCallStatus = (currentStatus === 'connected' && currentRemoteJoined) ? 'ended' : 
                           (currentStatus === 'ringing' ? 'missed' : 'cancelled')
    
    // 只有在双方都连接后才记录通话时长
    const finalDuration = (currentStatus === 'connected' && currentRemoteJoined) ? duration : 0
    
    if (messageId) {
      try {
        // 先获取消息以合并 metadata
        const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}`)
        const msgData = await msgResponse.json()
        if (msgData.success) {
          const callMessage = msgData.messages.find((m: any) => m.id === messageId)
          if (callMessage) {
            const updatedMetadata = {
              ...callMessage.metadata,
              call_status: finalCallStatus,
              call_duration: finalDuration,
              ended_at: new Date().toISOString(),
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

    const finalStatus = currentStatus === 'connected' ? 'answered' : 
                       (currentStatus === 'ringing' ? 'missed' : 'cancelled')
    if (onCallEnd) {
      onCallEnd(duration, finalStatus)
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

  // 外部关闭动作统一视为“挂断/取消”
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && callStatus !== 'ended') {
      void handleEndCall()
      return
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-sm p-0 border-0 bg-transparent shadow-none"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {isGroup ? `Group voice call with ${groupName || 'group'}` : `Voice call with ${displayName}`}
          </DialogTitle>
        </DialogHeader>

        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white">
          <div className="pointer-events-none absolute -left-10 -top-10 h-36 w-36 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 -right-10 h-40 w-40 rounded-full bg-blue-500/20 blur-3xl" />

          <div className="relative flex min-h-[520px] flex-col items-center px-6 pb-7 pt-8">
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">Voice Call</p>

            {isGroup ? (
              <div className="mt-8 flex justify-center -space-x-4">
                {displayMembers.slice(0, 3).map((member) => (
                  <Avatar key={member.id} className="h-24 w-24 border-4 border-white/20 shadow-lg">
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
              <Avatar className={cn('mt-8 h-32 w-32 border-4 border-white/20 shadow-xl', callStatus !== 'ended' && 'animate-pulse')}>
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
            )}

            <div className="mt-6 text-center">
              <h3 className="text-2xl font-semibold">{displayName}</h3>
              {isGroup && (
                <p className="mt-1 text-sm text-white/70">{displayMembers.length} participants</p>
              )}
              {!isGroup && recipient.title && (
                <p className="mt-1 text-sm text-white/70">{recipient.title}</p>
              )}
              <p className="mt-3 text-base font-medium text-white/80">{getStatusText()}</p>
            </div>

            <div className="mt-auto w-full">
              {callStatus === 'ringing' && isIncoming ? (
                <div className="flex items-center justify-center gap-8">
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-16 w-16 rounded-full shadow-lg shadow-red-500/40"
                    onClick={() => {
                      void handleRejectCall()
                    }}
                  >
                    <Phone className="h-6 w-6 rotate-90" />
                  </Button>
                  <Button
                    size="icon"
                    variant="default"
                    className="h-16 w-16 rounded-full bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/40"
                    onClick={handleAnswerCall}
                  >
                    <Phone className="h-6 w-6" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-4">
                  <Button
                    size="icon"
                    variant={isSpeakerOn ? 'secondary' : 'outline'}
                    className="h-12 w-12 rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20"
                    onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                    disabled={callStatus !== 'connected'}
                  >
                    {isSpeakerOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
                  </Button>

                  <Button
                    size="icon"
                    variant={isMuted ? 'destructive' : 'secondary'}
                    className="h-12 w-12 rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20"
                    onClick={handleToggleMute}
                    disabled={callStatus !== 'connected'}
                  >
                    {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </Button>

                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-16 w-16 rounded-full shadow-lg shadow-red-500/40"
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
