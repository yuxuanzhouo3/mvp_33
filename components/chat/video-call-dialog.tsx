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
import { Mic, MicOff, Phone, Video, VideoOff, Monitor } from 'lucide-react'
import { User } from '@/lib/types'
import { cn } from '@/lib/utils'
import { TrtcClient } from '@/lib/trtc/client'

// Generate a short channel name that fits call room requirements.
function generateChannelName(userId1: string, userId2: string, conversationId?: string): string {
  const maxLen = 30 // keep margin from room ID conversion and URL-safe transport
  // Use conversationId if available (shorter and more stable)
  if (conversationId) {
    // Take first 32 chars of conversationId and add a short suffix
    const shortId = conversationId.replace(/-/g, '').substring(0, 24)
    return `call_${shortId}`.substring(0, maxLen)
  }
  
  // Otherwise, use a hash of user IDs
  // Sort IDs to ensure same channel name for both users
  const sortedIds = [userId1, userId2].sort()
  // Take first 16 chars of each ID (without dashes) and combine
  const id1 = sortedIds[0].replace(/-/g, '').substring(0, 16)
  const id2 = sortedIds[1].replace(/-/g, '').substring(0, 16)
  return `call_${id1}_${id2}`.substring(0, maxLen)
}

interface VideoCallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipient: User
  currentUser: User
  conversationId: string
  callMessageId?: string // 如果是接听通话，传入通话消息ID
  isIncoming?: boolean // 是否是来电
   // 从消息列表点“Answer”时，直接自动接听，跳过第二个接听界面
  autoAnswer?: boolean
  isGroup?: boolean
  groupName?: string
  groupMembers?: User[]
  onCallEnd?: (duration: number, status: 'answered' | 'missed' | 'cancelled') => void // 通话结束回调
}

export function VideoCallDialog({ 
  open, 
  onOpenChange, 
  recipient,
  currentUser,
  conversationId,
  callMessageId,
  isIncoming = false,
  isGroup = false,
  groupName,
  groupMembers = [],
  autoAnswer = false,
  onCallEnd
}: VideoCallDialogProps) {
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOn, setIsVideoOn] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [callStatus, setCallStatus] = useState<'calling' | 'ringing' | 'connected' | 'ended'>(isIncoming ? 'ringing' : 'calling')
  const [remoteUserJoined, setRemoteUserJoined] = useState(false) // 跟踪远程用户是否已加入
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false) // 跟踪远程视频是否已加载
  const callStartTimeRef = useRef<number | null>(null)
  
  const agoraClientRef = useRef<TrtcClient | null>(null)
  const localVideoRef = useRef<HTMLDivElement>(null)
  const remoteVideoRef = useRef<HTMLDivElement>(null)
  const callMessageIdRef = useRef<string | undefined>(callMessageId)
  const uniqueUidRef = useRef<string | null>(null) // Store unique UID for this call session

  // Generate unique Agora UID per call session to avoid UID_CONFLICT.
  // Uses high-entropy random + timestamp + performance counter to ensure maximum uniqueness.
  const getAgoraNumericUid = (userId: string) => {
    // Use multiple sources of randomness to ensure uniqueness:
    // 1. High-entropy random (most significant bits)
    // 2. Timestamp (milliseconds)
    // 3. Performance counter (microseconds precision)
    // 4. User ID hash (for some determinism)
    const randomHigh = Math.floor(Math.random() * 0x7FFFFFF) // ~27 bits
    const timestamp = Date.now() % 0xFFFFFF // Last 24 bits of timestamp
    const perfCounter = Math.floor((performance.now() * 1000) % 0xFFFF) // High-precision counter
    const userIdHash = (() => {
      let hash = 2166136261
      for (let i = 0; i < userId.length; i++) {
        hash ^= userId.charCodeAt(i)
        hash = Math.imul(hash, 16777619)
      }
      return (hash >>> 0) % 0xFF // Last 8 bits
    })()
    
    // Combine with XOR to maximize entropy: randomHigh XOR timestamp XOR perfCounter + userIdHash
    const combined = randomHigh ^ timestamp ^ perfCounter
    const finalUid = (combined % 0xFFFFFF00) + userIdHash // Ensure 32-bit, avoid 0
    return Math.max(1, Math.min(finalUid, 0xFFFFFFFF)) // Clamp to 32-bit unsigned, avoid 0
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

  useEffect(() => {
    if (open) {
      // 注意：不在 useEffect 中生成 UID，而是在 initializeCall 中统一生成
      // 这样可以避免 UID 生成时机不一致的问题
      // uniqueUidRef.current 会在 initializeCall 中设置
      console.log('[useEffect] Dialog opened, waiting for initializeCall to generate UID')
      
      if (isIncoming) {
        // 来电场景：默认显示"正在响铃"界面
        // 如果是从消息列表点"Answer"，则在下面的 auto-answer effect 里直接接听
        // 注意：只有在状态不是 connected 且没有客户端时才设置为 ringing，避免覆盖已连接的状态
        if (!agoraClientRef.current) {
          setCallStatus((prev) => {
            if (prev !== 'connected') {
              return 'ringing'
            }
            return prev
          })
        }
      } else {
        // 发起通话：发送邀请并立即加入频道
        sendCallInvitation()
      }
    } else {
      // 对话框关闭时，结束通话并清理
      handleEndCall()
    }
    
    return () => {
      // Cleanup: leave channel and clear client
      if (agoraClientRef.current) {
        agoraClientRef.current.leave().catch(console.error)
        agoraClientRef.current = null
      }
      uniqueUidRef.current = null
      // 重置所有状态，确保下次打开时是干净的状态
      setHasRemoteVideo(false)
      setRemoteUserJoined(false)
    }
  }, [open, isIncoming])

  // 从消息列表点击“Answer”时，自动接听：直接进入通话界面并开始连接
  useEffect(() => {
    if (!open) return
    if (!isIncoming) return
    if (!autoAnswer) return

    // 只有在有有效的通话消息 ID 时才自动接听
    if (!callMessageIdRef.current && !callMessageId) return

    // 自动执行接听逻辑（内部会把状态切到 connected，再去 join 频道）
    handleAnswerCall()
  // 这里刻意不把 handleAnswerCall 放到依赖里，避免无限循环
  // 只在 open/isIncoming/autoAnswer 或 callMessageId 变化时触发一次
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isIncoming, autoAnswer, callMessageId])

  // 轮询检查对方是否接听（发起方使用）
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const startPollingForAnswer = (channelName: string) => {
    // 清除之前的轮询
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }
    
    // 立即检查一次，然后每2秒检查一次（减少频率，避免过多请求）
    const checkAnswer = async () => {
      const messageId = callMessageIdRef.current
      if (!messageId) {
        return
      }
      
      try {
        // 添加时间戳避免缓存
        const timestamp = Date.now()
        const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}&_t=${timestamp}`)
        const msgData = await msgResponse.json()
        if (msgData.success) {
          const callMessage = msgData.messages.find((m: any) => m.id === messageId)
          if (!callMessage) {
            return
          }
          
          const callStatus = callMessage?.metadata?.call_status
          const fullMetadata = callMessage?.metadata || {}
          
          if (callStatus === 'answered') {
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current)
              pollingIntervalRef.current = null
            }
            // 如果已经在通话中（摄像头已开启），只需要更新状态
            // 如果还没有加入频道，则需要初始化通话
            if (agoraClientRef.current) {
              setCallStatus('connected')
            } else {
              setCallStatus('connected')
              try {
                const channelNameToUse = callMessage?.metadata?.channel_name || channelName || generateChannelName(currentUser.id, recipient.id, conversationId)
                await initializeCall(channelNameToUse)
              } catch (error) {
                setCallStatus('ended')
                onOpenChange(false)
              }
            }
          } else if (callStatus === 'missed' || callStatus === 'cancelled') {
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
    
    // 然后每2秒检查一次（减少频率）
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

  // 监听接收方接听事件（发起方使用，作为轮询的补充）
  useEffect(() => {
    if (!open || isIncoming) return // 只有发起方才需要监听
    
    const handleCallAnswered = async (event: CustomEvent) => {
      const { messageId: answeredMessageId, conversationId: answeredConversationId } = event.detail
      const currentMessageId = callMessageIdRef.current
      
      // 检查是否是当前通话的消息
      if (answeredMessageId === currentMessageId && answeredConversationId === conversationId) {
        // 停止轮询
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
        
        // 从消息中获取频道名称
        try {
          const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}`)
          const msgData = await msgResponse.json()
          if (msgData.success) {
            const callMessage = msgData.messages.find((m: any) => m.id === answeredMessageId)
            const channelName = callMessage?.metadata?.channel_name || generateChannelName(currentUser.id, recipient.id, conversationId)
            setCallStatus('connected')
            await initializeCall(channelName)
          }
        } catch (error) {
          console.error('Failed to initialize call after answer event:', error)
          setCallStatus('ended')
          onOpenChange(false)
        }
      }
    }
    
    window.addEventListener('callAnswered' as any, handleCallAnswered as unknown as EventListener)
    return () => {
      window.removeEventListener('callAnswered' as any, handleCallAnswered as unknown as EventListener)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isIncoming, conversationId])

  // 发送通话邀请消息
  const sendCallInvitation = async () => {
    try {
      setCallStatus('calling')
      
      // 生成频道名称（使用短格式以符合 Agora 64字节限制）
      const channelName = isGroup 
        ? `group_${(groupName || 'group').substring(0, 20).replace(/[^a-zA-Z0-9]/g, '')}_${Date.now().toString().slice(-10)}`
        : generateChannelName(currentUser.id, recipient.id, conversationId)
      
      // 发送通话邀请消息
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          content: isGroup ? `Video call` : `Video call`,
          type: 'system',
          metadata: {
            call_type: 'video',
            call_status: 'calling',
            channel_name: channelName,
            caller_id: currentUser.id,
            caller_name: currentUser.full_name || currentUser.username || currentUser.email,
          },
        }),
      })

      const data = await response.json()
      if (data.success && data.message?.id) {
        // 保存通话消息ID和频道名称
        callMessageIdRef.current = data.message.id
        // 发起方立即加入频道开启摄像头，但保持 calling 状态直到对方接听
        // 这样发起方能看到自己的摄像头，但看不到对方（对方还没接听）
        try {
          await initializeCall(channelName)
          // 启动轮询检测对方是否接听
          startPollingForAnswer(channelName)
        } catch (error) {
          console.error('Failed to initialize call:', error)
          setCallStatus('ended')
          onOpenChange(false)
        }
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
          // 确保 callMessageIdRef 已设置
          if (!callMessageIdRef.current) {
            callMessageIdRef.current = messageId
          }
          
          // 合并 metadata（确保 metadata 不为 null）
          const updatedMetadata = {
            ...(callMessage.metadata || {}),
            call_status: 'answered',
            answered_at: new Date().toISOString(),
          }
          
          // 更新消息状态为已接听
          console.log('[A端接听] 准备更新数据库状态为 answered:', {
            messageId,
            updatedMetadata,
          })
          
          const updateResponse = await fetch(`/api/messages/${messageId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              metadata: updatedMetadata,
            }),
          })
          
          console.log('[A端接听] 更新请求响应:', {
            ok: updateResponse.ok,
            status: updateResponse.status,
            statusText: updateResponse.statusText,
          })
          
          if (!updateResponse.ok) {
            const errorText = await updateResponse.text()
            const error = new Error(`Failed to update call status: ${updateResponse.status} ${errorText}`)
            console.error('[A端接听] ❌ 更新数据库状态失败:', {
              status: updateResponse.status,
              statusText: updateResponse.statusText,
              error: errorText,
              messageId,
              metadata: updatedMetadata,
            })
            throw error
          }
          
          const updateResult = await updateResponse.json()
          if (!updateResult.success || !updateResult.message) {
            const error = new Error('Database update returned invalid response')
            console.error('[A端接听] ❌ 数据库更新返回无效响应:', updateResult)
            throw error
          }
          
          console.log('[A端接听] ✅ 数据库状态更新成功:', {
            messageId,
            updatedStatus: updateResult.message.metadata?.call_status,
          })
          
          // 触发事件通知发起方（如果发起方在同一浏览器）
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('callAnswered', {
              detail: {
                messageId,
                conversationId,
              },
            }))
          }

          // 接收方：一旦点击接听，立即切换到通话界面（即使对方还在加入）
          // 注意：先不设置 connected，等 initializeCall 成功后再设置
          setCallStatus('ringing') // 临时设置为 ringing，表示正在连接
          console.log('[A端接听] 状态设置为 ringing，准备初始化通话')

          // 开始连接（加入 Agora 频道）
          const channelNameToUse = callMessage.metadata?.channel_name || generateChannelName(currentUser.id, recipient.id, conversationId)
          if (!channelNameToUse) {
            console.error('Channel name not found in call message')
            setCallStatus('ended')
            onOpenChange(false)
            return
          }
          
          try {
            console.log('[A端接听] 开始初始化通话，channelName:', channelNameToUse)
            await initializeCall(channelNameToUse)
            console.log('[A端接听] 通话初始化成功，当前状态应该是 connected')
            // 确保状态已更新为 connected
            setCallStatus((prev) => {
              if (prev !== 'connected') {
                console.log('[A端接听] 状态更新：', prev, '-> connected')
                return 'connected'
              }
              return prev
            })
          } catch (error: any) {
            console.error('[A端接听] 通话初始化失败:', error)
            const errorMsg = error?.message || 'Failed to connect to call'
            // 如果是权限错误，给用户更明确的提示
            if (errorMsg.includes('permission') || errorMsg.includes('Permission') || errorMsg.includes('denied')) {
              alert('无法访问麦克风或摄像头。请检查浏览器权限设置，确保已允许访问麦克风和摄像头。')
            }
            setCallStatus('ended')
            onOpenChange(false)
          }
        } else {
          console.error('Call message not found:', messageId)
          setCallStatus('ended')
          onOpenChange(false)
        }
      } else {
        console.error('Failed to fetch messages:', msgData)
        setCallStatus('ended')
        onOpenChange(false)
      }
    } catch (error) {
      console.error('Failed to answer call:', error)
      handleRejectCall()
    }
  }

  // 拒绝通话
  const handleRejectCall = async () => {
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
        const errorMsg = 'Video calls require HTTPS or localhost. Please use HTTPS or access from localhost.'
        console.error(errorMsg)
        alert(errorMsg + '\n\nFor testing: Use HTTPS or access from localhost (http://localhost:3001)')
        setCallStatus('ended')
        onOpenChange(false)
        throw new Error(errorMsg)
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
          ? `group_${(groupName || 'group').substring(0, 20).replace(/[^a-zA-Z0-9]/g, '')}_${Date.now().toString().slice(-10)}`
          : generateChannelName(currentUser.id, recipient.id, conversationId)
      }
      
      // Validate channel name length before converting to roomId
      if (channelName.length > 64) {
        console.error('Channel name too long:', channelName.length, 'bytes')
        // Truncate to 64 chars
        channelName = channelName.substring(0, 64)
      }

      // 获取 App ID
      let appId = process.env.NEXT_PUBLIC_TRTC_SDK_APP_ID || ''

      // Clean up any existing client first to avoid conflicts
      // Don't wait for leave() to complete - let join() handle cleanup internally
      if (agoraClientRef.current) {
        const oldClient = agoraClientRef.current
        agoraClientRef.current = null
        // 异步清理旧客户端，不阻塞新连接
        oldClient.leave().catch(() => {})
        // 添加短暂延迟，确保旧客户端完全清理后再创建新的
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Use a stable, per-user numeric uid to prevent collisions (collisions can cause "remote" video to be your own).
      const numericUid = getAgoraNumericUid(currentUser.id)
      uniqueUidRef.current = `${currentUser.id}_${numericUid}`
      console.log('[initializeCall] 初始 UID 生成:', numericUid, 'for user:', currentUser.id)

      // 获取 TRTC userSig
      const credentials = await fetchTrtcCredentials(numericUid, appId)
      appId = credentials.appId
      let token: string | undefined = credentials.userSig

      // 创建 TRTC 客户端
      let client = new TrtcClient({
        appId,
        token,
        channel: channelName,
        uid: numericUid,
      })

      // 设置远程用户回调
      client.setOnRemoteUserPublished((user) => {
        // 关键修复：在回调开始时立即读取并保存 UID，避免在回调执行过程中 UID 被更新
        const currentUidString = uniqueUidRef.current
        if (!currentUidString) {
          console.error('[CRITICAL] ❌ uniqueUidRef.current is null! Cannot validate remote user.')
          return
        }
        
        const currentNumericUid = Number(currentUidString.split('_')[1]) || 0
        const currentUserId = currentUidString.split('_')[0] || ''
        const remoteUid = Number(user.uid)
        
        console.log('[Remote User Published]', {
          remoteUid: user.uid,
          currentUid: currentNumericUid,
          currentUserId: currentUserId,
          isSameUid: remoteUid === currentNumericUid,
          hasVideo: !!user.videoTrack,
          hasAudio: !!user.audioTrack,
          videoTrackState: user.videoTrack?.isPlaying ? 'playing' : user.videoTrack ? 'exists' : 'none',
          uniqueUidString: currentUidString
        })
        
        // 严格验证：远程用户的 UID 必须与本地 UID 不同
        // 这是防止自己的视频被误认为是远程视频的关键检查
        if (remoteUid === currentNumericUid || !remoteUid || remoteUid === 0) {
          console.error('[CRITICAL] ❌ BLOCKED: Remote user UID matches local UID or is invalid!', {
            remoteUid,
            currentNumericUid,
            currentUserId,
            reason: remoteUid === currentNumericUid ? 'UID conflict' : 'Invalid UID',
            uniqueUidString: currentUidString
          })
          // 确保 hasRemoteVideo 为 false
          setHasRemoteVideo(false)
          return
        }
        
        // 额外验证：确保这不是本地视频轨道（多重检查）
        const localVideoTrack = client.getLocalVideoTrack()
        if (localVideoTrack && user.videoTrack) {
          // 检查是否是同一个轨道对象（对象引用比较）
          if (localVideoTrack === user.videoTrack) {
            console.error('[CRITICAL] ❌ BLOCKED: Remote video track is the same object as local video track! (object reference match)')
            setHasRemoteVideo(false)
            return
          }
          
          // 检查 track ID（如果可用）
          try {
            const localTrackId = localVideoTrack.getTrackId?.()
            const remoteTrackId = user.videoTrack.getTrackId?.()
            if (localTrackId && remoteTrackId && localTrackId === remoteTrackId) {
              console.error('[CRITICAL] ❌ BLOCKED: Remote video track ID matches local video track ID!', {
                trackId: localTrackId,
                remoteUid,
                currentNumericUid
              })
              setHasRemoteVideo(false)
              return
            }
          } catch (e) {
            // 如果 getTrackId 不存在，继续检查（依赖 UID 验证）
            console.warn('[Remote User Published] Track ID comparison failed, continuing with UID check only:', e)
          }
        }
        
        // 播放远程音频
        if (user.audioTrack) {
          try {
            user.audioTrack.play()
          } catch (error) {
            console.warn('Failed to play remote audio:', error)
          }
        }
        
        // 处理远程视频 - 增加严格的验证逻辑
        if (user.videoTrack && remoteVideoRef.current) {
          // 再次验证 UID（防御性检查）- 使用保存的 UID 字符串，避免读取到更新后的值
          const savedCurrentNumericUid = Number(currentUidString.split('_')[1]) || 0
          if (remoteUid === savedCurrentNumericUid || !remoteUid || remoteUid === 0) {
            console.error('[Remote Video] ❌ BLOCKED: UID validation failed before playing video', {
              remoteUid,
              savedCurrentNumericUid,
              currentUidString
            })
            setHasRemoteVideo(false)
            return
          }
          
          // 额外验证：确保这不是本地视频轨道（通过 track ID 比较）
          const localVideoTrack = client.getLocalVideoTrack()
          if (localVideoTrack && user.videoTrack) {
            try {
              const localTrackId = localVideoTrack.getTrackId?.()
              const remoteTrackId = user.videoTrack.getTrackId?.()
              if (localTrackId && remoteTrackId && localTrackId === remoteTrackId) {
                console.error('[Remote Video] ❌ BLOCKED: Remote video track ID matches local video track ID!', {
                  trackId: localTrackId,
                  remoteUid,
                  savedCurrentNumericUid
                })
                setHasRemoteVideo(false)
                return
              }
              // 对象引用比较（额外防御）
              if (localVideoTrack === user.videoTrack) {
                console.error('[Remote Video] ❌ BLOCKED: Remote video track is the same object as local video track!', {
                  remoteUid,
                  savedCurrentNumericUid
                })
                setHasRemoteVideo(false)
                return
              }
            } catch (e) {
              console.warn('[Remote Video] Track ID comparison failed, continuing with UID check only:', e)
            }
          }
          
          console.log('[Remote Video] Attempting to play remote video track', {
            remoteUid,
            currentUid: savedCurrentNumericUid,
            trackId: user.videoTrack.getTrackId?.() || 'unknown',
            localTrackId: localVideoTrack?.getTrackId?.() || 'none',
            currentUidString
          })
          
          // Use requestAnimationFrame to ensure DOM is ready
          requestAnimationFrame(() => {
            setTimeout(() => {
              try {
                // 最后一次验证：再次读取 uniqueUidRef 确保没有在回调执行过程中被更新
                const finalUidString = uniqueUidRef.current
                if (!finalUidString || finalUidString !== currentUidString) {
                  console.error('[Remote Video] ❌ BLOCKED: UID changed during callback execution!', {
                    originalUid: currentUidString,
                    finalUid: finalUidString,
                    remoteUid
                  })
                  setHasRemoteVideo(false)
                  return
                }
                
                const finalCheckUid = Number(finalUidString.split('_')[1]) || 0
                if (remoteUid === finalCheckUid) {
                  console.error('[Remote Video] ❌ BLOCKED: UID conflict detected right before playing!', {
                    remoteUid,
                    finalCheckUid,
                    finalUidString
                  })
                  setHasRemoteVideo(false)
                  return
                }
                
                // 最后一次 track ID 验证
                const finalLocalVideoTrack = client.getLocalVideoTrack()
                if (finalLocalVideoTrack && user.videoTrack) {
                  try {
                    const finalLocalTrackId = finalLocalVideoTrack.getTrackId?.()
                    const finalRemoteTrackId = user.videoTrack.getTrackId?.()
                    if (finalLocalTrackId && finalRemoteTrackId && finalLocalTrackId === finalRemoteTrackId) {
                      console.error('[Remote Video] ❌ BLOCKED: Track ID conflict detected right before playing!', {
                        trackId: finalLocalTrackId
                      })
                      setHasRemoteVideo(false)
                      return
                    }
                    // 对象引用比较
                    if (finalLocalVideoTrack === user.videoTrack) {
                      console.error('[Remote Video] ❌ BLOCKED: Track object reference match detected right before playing!')
                      setHasRemoteVideo(false)
                      return
                    }
                  } catch (e) {
                    // 如果 getTrackId 不存在，继续播放（依赖 UID 验证）
                  }
                }
                
                // 防御性检查：确保 remoteVideoRef 不是 localVideoRef（虽然不应该发生，但以防万一）
                if (remoteVideoRef.current === localVideoRef.current) {
                  console.error('[Remote Video] ❌ CRITICAL: remoteVideoRef and localVideoRef are the same element!')
                  setHasRemoteVideo(false)
                  return
                }
                
                // Clear any existing content
                if (remoteVideoRef.current) {
                  remoteVideoRef.current.innerHTML = ''
                  // 确保容器有正确的样式
                  remoteVideoRef.current.style.width = '100%'
                  remoteVideoRef.current.style.height = '100%'
                  remoteVideoRef.current.style.objectFit = 'cover'
                }
                user.videoTrack.play(remoteVideoRef.current!)
                console.log('[Remote Video] ✅ Successfully playing remote video track', {
                  remoteUid,
                  currentUid: finalCheckUid,
                  trackId: user.videoTrack.getTrackId?.() || 'unknown',
                  finalUidString
                })
                // 只有在所有验证通过且成功播放后才标记远程视频已加载
                setHasRemoteVideo(true)
              } catch (error) {
                console.error('[Remote Video] ❌ Failed to play remote video:', error)
                setHasRemoteVideo(false)
                // Retry after a short delay with multiple attempts
                let retryCount = 0
                const maxRetries = 3
                const retryPlay = () => {
                  retryCount++
                  if (retryCount > maxRetries) {
                    console.error('[Remote Video] ❌ Max retries reached, giving up')
                    setHasRemoteVideo(false)
                    return
                  }
                  setTimeout(() => {
                    try {
                      // 重试前再次验证
                      const retryCheckUid = Number(uniqueUidRef.current?.split('_')[1]) || 0
                      if (remoteUid === retryCheckUid) {
                        console.error(`[Remote Video] ❌ BLOCKED: UID conflict in retry ${retryCount}`)
                        setHasRemoteVideo(false)
                        return
                      }
                      
                      if (remoteVideoRef.current && user.videoTrack) {
                        // 再次验证 track ID
                        const retryLocalVideoTrack = client.getLocalVideoTrack()
                        if (retryLocalVideoTrack && user.videoTrack) {
                          try {
                            const retryLocalTrackId = retryLocalVideoTrack.getTrackId?.()
                            const retryRemoteTrackId = user.videoTrack.getTrackId?.()
                            if (retryLocalTrackId && retryRemoteTrackId && retryLocalTrackId === retryRemoteTrackId) {
                              console.error(`[Remote Video] ❌ BLOCKED: Track ID conflict in retry ${retryCount}`)
                              setHasRemoteVideo(false)
                              return
                            }
                          } catch (e) {
                            // 继续重试
                          }
                        }
                        
                        if (remoteVideoRef.current.firstChild) {
                          remoteVideoRef.current.innerHTML = ''
                        }
                        user.videoTrack.play(remoteVideoRef.current)
                        console.log(`[Remote Video] ✅ Successfully playing remote video (retry ${retryCount})`)
                        setHasRemoteVideo(true)
                      }
                    } catch (retryError) {
                      console.warn(`[Remote Video] Retry ${retryCount} failed:`, retryError)
                      if (retryCount < maxRetries) {
                        retryPlay()
                      } else {
                        setHasRemoteVideo(false)
                      }
                    }
                  }, 300 * retryCount) // Exponential backoff
                }
                retryPlay()
              }
            }, 100)
          })
        } else {
          // 如果没有视频轨道，标记为没有远程视频
          console.log('[Remote Video] No video track available')
          setHasRemoteVideo(false)
        }
        
        // Update status to connected when remote user joins
        setRemoteUserJoined(true)
        setCallStatus(prev => {
          if (prev !== 'connected') {
            if (!callStartTimeRef.current) {
              callStartTimeRef.current = Date.now()
            }
            console.log('[Remote User] Status updated to connected')
            return 'connected'
          }
          return prev
        })
      })

      client.setOnRemoteUserUnpublished((uid) => {
        // 关键修复：验证 UID 确保这不是本地用户
        const currentUidString = uniqueUidRef.current
        if (currentUidString) {
          const currentNumericUid = Number(currentUidString.split('_')[1]) || 0
          const unpublishedUid = Number(uid)
          if (unpublishedUid === currentNumericUid) {
            console.error('[CRITICAL] ❌ BLOCKED: user-unpublished event for local UID! This should not happen.', {
              unpublishedUid,
              currentNumericUid,
              currentUidString
            })
            return // 忽略本地用户的 unpublish 事件
          }
        }
        
        console.log('Remote user unpublished:', uid)
        // 重置远程视频状态
        setHasRemoteVideo(false)
        setRemoteUserJoined(false)
        // 对方挂断或离开频道时，本端自动结束通话并关闭窗口
        // 避免重复触发：如果已经结束则不再处理
        setTimeout(() => {
          if (callStatus !== 'ended') {
            handleEndCall()
          }
        }, 0)
      })

      agoraClientRef.current = client

      // 加入频道（带 UID_CONFLICT 自动重试）
      console.log('[initializeCall] 开始加入频道，channelName:', channelName, '初始 UID:', numericUid)
      let retryCount = 0
      const maxRetries = 2
      let currentClient = client
      let currentNumericUid = numericUid
      let currentToken = token
      
      while (retryCount <= maxRetries) {
        try {
          // 在调用 join() 之前检查客户端状态
          if (!currentClient) {
            console.error('[initializeCall] ❌ Client is null before join, cannot continue')
            agoraClientRef.current = null
            throw new Error('Client not initialized before join')
          }
          
          // 检查 agoraClientRef 是否仍然指向当前客户端（防止在清理过程中调用）
          if (agoraClientRef.current !== currentClient) {
            console.warn('[initializeCall] Client reference changed during retry, aborting')
            return // 静默返回，不抛出错误
          }
          
          await currentClient.join()
          console.log('[initializeCall] 成功加入频道')
          
          // 验证客户端是否真的加入了
          if (!agoraClientRef.current || agoraClientRef.current !== currentClient) {
            console.error('[initializeCall] ❌ Client not initialized or changed after join')
            agoraClientRef.current = null
            throw new Error('Client not initialized after join')
          }
          
          // Set status to connected after joining
          setCallStatus((prev) => {
            if (prev !== 'connected') {
              console.log('[initializeCall] 状态更新：', prev, '-> connected')
              return 'connected'
            }
            return prev
          })
          console.log('[initializeCall] 状态已设置为 connected')
          break // 成功，退出循环
        } catch (joinError: any) {
          const errorMsg = joinError?.message || ''
          const errorCode = joinError?.code || ''
          const isUidConflict = errorMsg.includes('UID_CONFLICT') || errorCode === 'UID_CONFLICT' || String(errorCode) === '2025'
          const isWsAbort = errorMsg.includes('WS_ABORT') || errorMsg.includes('LEAVE') || errorCode === 'WS_ABORT'
          
          // WS_ABORT 通常是因为客户端在 join 过程中被 leave，静默处理
          if (isWsAbort) {
            console.warn('[initializeCall] WS_ABORT detected, client was likely closed during join')
            agoraClientRef.current = null
            return // 静默返回，不抛出错误
          }
          
          if (isUidConflict && retryCount < maxRetries) {
            retryCount++
            console.warn(`[initializeCall] UID_CONFLICT 检测到，重试 ${retryCount}/${maxRetries}，生成新 UID`)
            
            // 清理旧客户端
            if (agoraClientRef.current) {
              try {
                await agoraClientRef.current.leave()
              } catch (e) {}
              agoraClientRef.current = null
            }
            
            // 等待旧连接完全断开（增加延迟确保完全清理）
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            // 生成新 UID（添加额外延迟确保时间戳不同）
            await new Promise(resolve => setTimeout(resolve, 10))
            currentNumericUid = getAgoraNumericUid(currentUser.id)
            uniqueUidRef.current = `${currentUser.id}_${currentNumericUid}`
            console.log('[initializeCall] 生成新 UID:', currentNumericUid)
            
            // 重新获取 TRTC userSig
            const retryCredentials = await fetchTrtcCredentials(currentNumericUid, appId)
            appId = retryCredentials.appId
            currentToken = retryCredentials.userSig
            
            // 创建新客户端并重新设置回调
            currentClient = new TrtcClient({
              appId,
              token: currentToken,
              channel: channelName,
              uid: currentNumericUid,
            })
            
            currentClient.setOnRemoteUserPublished((user) => {
              // 关键修复：在回调开始时立即读取并保存 UID，避免在回调执行过程中 UID 被更新
              const currentUidString = uniqueUidRef.current
              if (!currentUidString) {
                console.error('[CRITICAL] ❌ uniqueUidRef.current is null in retry callback! Cannot validate remote user.')
                return
              }
              
              const currentNumericUid = Number(currentUidString.split('_')[1]) || 0
              const currentUserId = currentUidString.split('_')[0] || ''
              const remoteUid = Number(user.uid)
              
              console.log('[Remote User Published (retry)]', {
                remoteUid: user.uid,
                currentUid: currentNumericUid,
                currentUserId: currentUserId,
                isSameUid: remoteUid === currentNumericUid,
                hasVideo: !!user.videoTrack,
                hasAudio: !!user.audioTrack,
                uniqueUidString: currentUidString
              })
              
              // 严格验证：远程用户的 UID 必须与本地 UID 不同
              if (remoteUid === currentNumericUid || !remoteUid || remoteUid === 0) {
                console.error('[CRITICAL] ❌ BLOCKED (retry): Remote user UID matches local UID or is invalid!', {
                  remoteUid,
                  currentNumericUid,
                  currentUserId,
                  reason: remoteUid === currentNumericUid ? 'UID conflict' : 'Invalid UID',
                  uniqueUidString: currentUidString
                })
                setHasRemoteVideo(false)
                return
              }
              
              // 额外验证：确保这不是本地视频轨道（多重检查）
              const localVideoTrack = currentClient.getLocalVideoTrack()
              if (localVideoTrack && user.videoTrack) {
                // 对象引用比较
                if (localVideoTrack === user.videoTrack) {
                  console.error('[CRITICAL] ❌ BLOCKED (retry): Remote video track is the same object as local video track! (object reference match)')
                  setHasRemoteVideo(false)
                  return
                }
                // Track ID 比较
                try {
                  const localTrackId = localVideoTrack.getTrackId?.()
                  const remoteTrackId = user.videoTrack.getTrackId?.()
                  if (localTrackId && remoteTrackId && localTrackId === remoteTrackId) {
                    console.error('[CRITICAL] ❌ BLOCKED (retry): Remote video track ID matches local video track ID!', {
                      trackId: localTrackId
                    })
                    setHasRemoteVideo(false)
                    return
                  }
                } catch (e) {
                  console.warn('[Remote User Published (retry)] Track ID comparison failed, continuing with UID check only:', e)
                }
              }
              
              // 播放远程音频
              if (user.audioTrack) {
                try {
                  user.audioTrack.play()
                } catch (error) {
                  console.warn('Failed to play remote audio (retry):', error)
                }
              }
              
              // 处理远程视频 - 增加严格的验证逻辑
              if (user.videoTrack && remoteVideoRef.current) {
                // 再次验证 UID（防御性检查）- 使用保存的 UID 字符串
                const savedCurrentNumericUid = Number(currentUidString.split('_')[1]) || 0
                if (remoteUid === savedCurrentNumericUid || !remoteUid || remoteUid === 0) {
                  console.error('[Remote Video (retry)] ❌ BLOCKED: UID validation failed before playing video', {
                    remoteUid,
                    savedCurrentNumericUid,
                    currentUidString
                  })
                  setHasRemoteVideo(false)
                  return
                }
                
                // 额外验证：确保这不是本地视频轨道（通过 track ID 比较）
                const localVideoTrack = currentClient.getLocalVideoTrack()
                if (localVideoTrack && user.videoTrack) {
                  try {
                    const localTrackId = localVideoTrack.getTrackId?.()
                    const remoteTrackId = user.videoTrack.getTrackId?.()
                    if (localTrackId && remoteTrackId && localTrackId === remoteTrackId) {
                      console.error('[Remote Video (retry)] ❌ BLOCKED: Remote video track ID matches local video track ID!', {
                        trackId: localTrackId,
                        remoteUid,
                        savedCurrentNumericUid
                      })
                      setHasRemoteVideo(false)
                      return
                    }
                    // 对象引用比较（额外防御）
                    if (localVideoTrack === user.videoTrack) {
                      console.error('[Remote Video (retry)] ❌ BLOCKED: Remote video track is the same object as local video track!', {
                        remoteUid,
                        savedCurrentNumericUid
                      })
                      setHasRemoteVideo(false)
                      return
                    }
                  } catch (e) {
                    console.warn('[Remote Video (retry)] Track ID comparison failed, continuing with UID check only:', e)
                  }
                }
                
                console.log('[Remote Video (retry)] Attempting to play remote video track', {
                  remoteUid,
                  currentUid: savedCurrentNumericUid,
                  trackId: user.videoTrack.getTrackId?.() || 'unknown',
                  localTrackId: localVideoTrack?.getTrackId?.() || 'none',
                  currentUidString
                })
                
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    try {
                      // 最后一次验证：再次读取 uniqueUidRef 确保没有在回调执行过程中被更新
                      const finalUidString = uniqueUidRef.current
                      if (!finalUidString || finalUidString !== currentUidString) {
                        console.error('[Remote Video (retry)] ❌ BLOCKED: UID changed during callback execution!', {
                          originalUid: currentUidString,
                          finalUid: finalUidString,
                          remoteUid
                        })
                        setHasRemoteVideo(false)
                        return
                      }
                      
                      const finalCheckUid = Number(finalUidString.split('_')[1]) || 0
                      if (remoteUid === finalCheckUid) {
                        console.error('[Remote Video (retry)] ❌ BLOCKED: UID conflict detected right before playing!', {
                          remoteUid,
                          finalCheckUid,
                          finalUidString
                        })
                        setHasRemoteVideo(false)
                        return
                      }
                      
                      // 最后一次 track ID 验证
                      const finalLocalVideoTrack = currentClient.getLocalVideoTrack()
                      if (finalLocalVideoTrack && user.videoTrack) {
                        try {
                          const finalLocalTrackId = finalLocalVideoTrack.getTrackId?.()
                          const finalRemoteTrackId = user.videoTrack.getTrackId?.()
                          if (finalLocalTrackId && finalRemoteTrackId && finalLocalTrackId === finalRemoteTrackId) {
                            console.error('[Remote Video (retry)] ❌ BLOCKED: Track ID conflict detected right before playing!', {
                              trackId: finalLocalTrackId
                            })
                            setHasRemoteVideo(false)
                            return
                          }
                          // 对象引用比较
                          if (finalLocalVideoTrack === user.videoTrack) {
                            console.error('[Remote Video (retry)] ❌ BLOCKED: Track object reference match detected right before playing!')
                            setHasRemoteVideo(false)
                            return
                          }
                        } catch (e) {
                          // 如果 getTrackId 不存在，继续播放（依赖 UID 验证）
                        }
                      }
                      
                      // 防御性检查：确保 remoteVideoRef 不是 localVideoRef
                      if (remoteVideoRef.current === localVideoRef.current) {
                        console.error('[Remote Video (retry)] ❌ CRITICAL: remoteVideoRef and localVideoRef are the same element!')
                        setHasRemoteVideo(false)
                        return
                      }
                      
                      if (remoteVideoRef.current) {
                        remoteVideoRef.current.innerHTML = ''
                        remoteVideoRef.current.style.width = '100%'
                        remoteVideoRef.current.style.height = '100%'
                        remoteVideoRef.current.style.objectFit = 'cover'
                      }
                      user.videoTrack.play(remoteVideoRef.current!)
                      console.log('[Remote Video (retry)] ✅ Successfully playing remote video track', {
                        remoteUid,
                        currentUid: finalCheckUid,
                        trackId: user.videoTrack.getTrackId?.() || 'unknown',
                        finalUidString
                      })
                      // 只有在所有验证通过且成功播放后才标记远程视频已加载
                      setHasRemoteVideo(true)
                    } catch (error) {
                      console.error('[Remote Video (retry)] ❌ Failed to play remote video:', error)
                      // Retry with multiple attempts - 重试时也要验证
                      setHasRemoteVideo(false)
                      let retryCount = 0
                      const maxRetries = 3
                      const retryPlay = () => {
                        retryCount++
                        if (retryCount > maxRetries) {
                          console.error('[Remote Video (retry)] ❌ Max retries reached')
                          setHasRemoteVideo(false)
                          return
                        }
                        setTimeout(() => {
                          try {
                            // 重试前再次验证
                            const retryCheckUid = Number(uniqueUidRef.current?.split('_')[1]) || 0
                            if (remoteUid === retryCheckUid) {
                              console.error(`[Remote Video (retry)] ❌ BLOCKED: UID conflict in retry ${retryCount}`)
                              setHasRemoteVideo(false)
                              return
                            }
                            
                            if (remoteVideoRef.current && user.videoTrack) {
                              // 再次验证 track ID
                              const retryLocalVideoTrack = currentClient.getLocalVideoTrack()
                              if (retryLocalVideoTrack && user.videoTrack) {
                                try {
                                  const retryLocalTrackId = retryLocalVideoTrack.getTrackId?.()
                                  const retryRemoteTrackId = user.videoTrack.getTrackId?.()
                                  if (retryLocalTrackId && retryRemoteTrackId && retryLocalTrackId === retryRemoteTrackId) {
                                    console.error(`[Remote Video (retry)] ❌ BLOCKED: Track ID conflict in retry ${retryCount}`)
                                    setHasRemoteVideo(false)
                                    return
                                  }
                                } catch (e) {
                                  // 继续重试
                                }
                              }
                              
                              if (remoteVideoRef.current.firstChild) {
                                remoteVideoRef.current.innerHTML = ''
                              }
                              user.videoTrack.play(remoteVideoRef.current)
                              console.log(`[Remote Video (retry)] ✅ Successfully playing (retry ${retryCount})`)
                              setHasRemoteVideo(true)
                            }
                          } catch (retryError) {
                            console.warn(`[Remote Video (retry)] Retry ${retryCount} failed:`, retryError)
                            if (retryCount < maxRetries) {
                              retryPlay()
                            } else {
                              setHasRemoteVideo(false)
                            }
                          }
                        }, 300 * retryCount)
                      }
                      retryPlay()
                    }
                  }, 100)
                })
              } else {
                console.log('[Remote Video (retry)] No video track available')
                setHasRemoteVideo(false)
              }
              
              setRemoteUserJoined(true)
              setCallStatus(prev => {
                if (prev !== 'connected') {
                  if (!callStartTimeRef.current) {
                    callStartTimeRef.current = Date.now()
                  }
                  console.log('[Remote User (retry)] Status updated to connected')
                  return 'connected'
                }
                return prev
              })
            })
            
            currentClient.setOnRemoteUserUnpublished((uid) => {
              // 关键修复：验证 UID 确保这不是本地用户
              const currentUidString = uniqueUidRef.current
              if (currentUidString) {
                const currentNumericUid = Number(currentUidString.split('_')[1]) || 0
                const unpublishedUid = Number(uid)
                if (unpublishedUid === currentNumericUid) {
                  console.error('[CRITICAL] ❌ BLOCKED (retry): user-unpublished event for local UID! This should not happen.', {
                    unpublishedUid,
                    currentNumericUid,
                    currentUidString
                  })
                  return // 忽略本地用户的 unpublish 事件
                }
              }
              
              console.log('Remote user unpublished:', uid)
              setHasRemoteVideo(false)
              setRemoteUserJoined(false)
              setTimeout(() => {
                if (callStatus !== 'ended') {
                  handleEndCall()
                }
              }, 0)
            })
            
            agoraClientRef.current = currentClient
            // 继续循环重试
          } else {
            // 其他错误或达到最大重试次数：抛出错误
            console.error('[initializeCall] 加入频道失败:', joinError)
            agoraClientRef.current = null
            throw joinError
          }
        }
      }
      // 注意：callStartTimeRef 只在远程用户加入时设置，这样双方的时间是同步的
      
      // 检查摄像头是否可用
      const localVideoTrack = client.getLocalVideoTrack()
      if (!localVideoTrack) {
        console.warn('Camera not available - call will continue as audio-only')
        setIsVideoOn(false)
        // 不显示 alert，只在控制台记录
        // 摄像头不可用可能是权限被拒绝、设备问题、或被占用，用户可以从浏览器权限设置中检查
      }
      
      // 显示本地视频 - 立即尝试播放，确保发起方也能看到自己的视频
      const playLocalVideo = () => {
        const track = client.getLocalVideoTrack()
        if (track && localVideoRef.current) {
          try {
            // Clear any existing content
            if (localVideoRef.current.firstChild) {
              localVideoRef.current.innerHTML = ''
            }
            // 确保容器有正确的样式
            localVideoRef.current.style.width = '100%'
            localVideoRef.current.style.height = '100%'
            localVideoRef.current.style.objectFit = 'cover'
            track.play(localVideoRef.current)
            console.log('Local video track playing')
          } catch (error) {
            console.error('Failed to play local video:', error)
            // Retry after a short delay
            setTimeout(() => {
              try {
                if (localVideoRef.current && track) {
                  if (localVideoRef.current.firstChild) {
                    localVideoRef.current.innerHTML = ''
                  }
                  track.play(localVideoRef.current)
                }
              } catch (retryError) {
                console.error('Retry failed to play local video:', retryError)
              }
            }, 500)
          }
        }
      }
      
      // 立即尝试播放
      playLocalVideo()
      
      // 也使用 requestAnimationFrame 确保 DOM 就绪
      requestAnimationFrame(() => {
        setTimeout(() => {
          playLocalVideo()
        }, 100)
      })
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to connect to call'
      const errorCode = error?.code || ''
      
      // 处理 HTTPS/安全限制错误
      if (errorMsg.includes('WEB_SECURITY_RESTRICT') || 
          errorMsg.includes('NOT_SUPPORTED') ||
          errorMsg.includes('getUserMedia')) {
        const httpsErrorMsg = 'Video calls require HTTPS or localhost. Please use HTTPS or access from localhost (http://localhost:3001).'
        console.error(httpsErrorMsg, error)
        alert(httpsErrorMsg)
        agoraClientRef.current = null
        setCallStatus('ended')
        onOpenChange(false)
        throw error // 重新抛出错误，让调用方知道初始化失败
      }
      
      // 处理摄像头被占用错误（NOT_READABLE）
      // 注意：AgoraClient 已经会降级为音频通话，这里只是记录日志
      if (errorMsg.includes('NOT_READABLE') || 
          errorMsg.includes('NotReadableError') ||
          errorMsg.includes('Could not start video source')) {
        console.warn('Camera is busy or in use by another application. Call will continue as audio-only.')
        // 不关闭通话，继续音频通话（AgoraClient 已经处理了降级）
        // 提示会在 initializeCall 成功后通过检查 getLocalVideoTrack() 显示
        // 这种情况下不抛出错误，因为通话可以继续（只是没有视频）
        // 继续通话，不返回
      }
      
      // 某些场景（快速关闭/切换）Agora 会抛 WS_ABORT/OPERATION_ABORTED，视为正常中断，不再上抛
      if (errorMsg.includes('WS_ABORT') || 
          errorMsg.includes('OPERATION_ABORTED') || 
          errorMsg.includes('LEAVE') ||
          errorCode === 'WS_ABORT' ||
          errorCode === 'OPERATION_ABORTED') {
        // 静默处理，不输出错误日志
        agoraClientRef.current = null
        setCallStatus('ended')
        return
      }

      console.error('Failed to initialize call:', error)
      if (errorMsg.includes('Invalid Channel Name') || errorMsg.includes('INVALID_PARAMS')) {
        console.error('Channel name validation failed:', channelName, 'Length:', channelName?.length)
      }
      // 清理客户端引用
      agoraClientRef.current = null
      setCallStatus('ended')
      // Don't close dialog immediately, let user see the error
      throw error // Re-throw to let caller handle it
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

  // Ensure video tracks are played when status changes to connected
  useEffect(() => {
    if (callStatus === 'connected' && agoraClientRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        // Try to play local video if ref is available
        if (localVideoRef.current) {
          const localVideoTrack = agoraClientRef.current?.getLocalVideoTrack()
          if (localVideoTrack) {
            try {
              if (localVideoRef.current.firstChild) {
                localVideoRef.current.innerHTML = ''
              }
              localVideoTrack.play(localVideoRef.current)
            } catch (error) {
              console.warn('Failed to play local video in useEffect:', error)
            }
          }
        }

        // Try to play remote video if available - 增加严格的验证逻辑
        const remoteUsers = agoraClientRef.current?.getRemoteUsers()
        if (remoteVideoRef.current && remoteUsers && remoteUsers.size > 0) {
          // 关键修复：在开始处理前立即读取并保存 UID，避免在处理过程中 UID 被更新
          const currentUidString = uniqueUidRef.current
          if (!currentUidString) {
            console.error('[useEffect] ❌ uniqueUidRef.current is null! Cannot validate remote users.')
            return
          }
          
          const currentNumericUid = Number(currentUidString.split('_')[1]) || 0
          const localVideoTrack = agoraClientRef.current?.getLocalVideoTrack()
          
          // 标记是否找到了有效的远程视频轨道
          let foundValidRemoteVideo = false
          
          remoteUsers.forEach((user) => {
            const remoteUid = Number(user.uid)
            
            // 严格验证：远程用户的 UID 必须与本地 UID 不同
            if (remoteUid === currentNumericUid || !remoteUid || remoteUid === 0) {
              console.error('[useEffect] ❌ BLOCKED: Skipping user with same UID as local or invalid UID:', {
                remoteUid,
                currentNumericUid,
                reason: remoteUid === currentNumericUid ? 'UID conflict' : 'Invalid UID',
                currentUidString
              })
              // 注意：这里不设置 setHasRemoteVideo(false)，因为可能还有其他有效的远程用户
              return // 跳过自己的视频
            }
            
            // 额外验证：确保这不是本地视频轨道（通过 track ID 和对象引用比较）
            if (localVideoTrack && user.videoTrack) {
              try {
                const localTrackId = localVideoTrack.getTrackId?.()
                const remoteTrackId = user.videoTrack.getTrackId?.()
                if (localTrackId && remoteTrackId && localTrackId === remoteTrackId) {
                  console.error('[useEffect] ❌ BLOCKED: Remote video track ID matches local video track ID!', {
                    trackId: localTrackId,
                    remoteUid,
                    currentNumericUid
                  })
                  // 注意：这里不设置 setHasRemoteVideo(false)，因为可能还有其他有效的远程用户
                  return
                }
                // 对象引用比较（额外防御）
                if (localVideoTrack === user.videoTrack) {
                  console.error('[useEffect] ❌ BLOCKED: Remote video track is the same object as local video track!', {
                    remoteUid,
                    currentNumericUid
                  })
                  // 注意：这里不设置 setHasRemoteVideo(false)，因为可能还有其他有效的远程用户
                  return
                }
              } catch (e) {
                // 如果 getTrackId 不存在，继续检查（依赖 UID 验证）
                console.warn('[useEffect] Track ID comparison failed, continuing with UID check only:', e)
              }
            }
            
            if (user.videoTrack && remoteVideoRef.current) {
              try {
                // 最后一次验证（在播放前）- 确保 UID 没有在处理过程中被更新
                const finalUidString = uniqueUidRef.current
                if (!finalUidString || finalUidString !== currentUidString) {
                  console.error('[useEffect] ❌ BLOCKED: UID changed during processing!', {
                    originalUid: currentUidString,
                    finalUid: finalUidString,
                    remoteUid
                  })
                  // 注意：这里不设置 setHasRemoteVideo(false)，因为可能还有其他有效的远程用户
                  return
                }
                
                const finalCheckUid = Number(finalUidString.split('_')[1]) || 0
                if (remoteUid === finalCheckUid) {
                  console.error('[useEffect] ❌ BLOCKED: UID conflict detected right before playing!', {
                    remoteUid,
                    finalCheckUid,
                    finalUidString
                  })
                  // 注意：这里不设置 setHasRemoteVideo(false)，因为可能还有其他有效的远程用户
                  return
                }
                
                // 最后一次 track ID 验证
                const finalLocalVideoTrack = agoraClientRef.current?.getLocalVideoTrack()
                if (finalLocalVideoTrack && user.videoTrack) {
                  try {
                    const finalLocalTrackId = finalLocalVideoTrack.getTrackId?.()
                    const finalRemoteTrackId = user.videoTrack.getTrackId?.()
                    if (finalLocalTrackId && finalRemoteTrackId && finalLocalTrackId === finalRemoteTrackId) {
                      console.error('[useEffect] ❌ BLOCKED: Track ID conflict detected right before playing!', {
                        trackId: finalLocalTrackId
                      })
                      // 注意：这里不设置 setHasRemoteVideo(false)，因为可能还有其他有效的远程用户
                      return
                    }
                    // 对象引用比较
                    if (finalLocalVideoTrack === user.videoTrack) {
                      console.error('[useEffect] ❌ BLOCKED: Track object reference match detected right before playing!')
                      // 注意：这里不设置 setHasRemoteVideo(false)，因为可能还有其他有效的远程用户
                      return
                    }
                  } catch (e) {
                    // 继续播放（依赖 UID 验证）
                  }
                }
                
                // 防御性检查：确保 remoteVideoRef 不是 localVideoRef
                if (remoteVideoRef.current === localVideoRef.current) {
                  console.error('[useEffect] ❌ CRITICAL: remoteVideoRef and localVideoRef are the same element!')
                  // 注意：这里不设置 setHasRemoteVideo(false)，因为可能还有其他有效的远程用户
                  return
                }
                
                if (remoteVideoRef.current.firstChild) {
                  remoteVideoRef.current.innerHTML = ''
                }
                user.videoTrack.play(remoteVideoRef.current)
                console.log('[useEffect] ✅ Playing remote video, UID:', remoteUid, 'Local UID:', currentNumericUid, 'Track ID:', user.videoTrack.getTrackId?.() || 'unknown', 'UID String:', finalUidString)
                // 标记找到了有效的远程视频
                foundValidRemoteVideo = true
                // 只有在所有验证通过且成功播放后才标记远程视频已加载
                setHasRemoteVideo(true)
              } catch (error) {
                console.warn('Failed to play remote video in useEffect:', error)
                // 注意：这里不设置 setHasRemoteVideo(false)，因为可能还有其他有效的远程用户
              }
            }
          })
          
          // 关键修复：只有在遍历完所有远程用户后，如果确实没有找到任何有效的远程视频轨道，才设置 hasRemoteVideo 为 false
          // 但是，如果 B 没有视频（camera off），remoteUsers 中可能仍然有 B 的用户对象，只是没有 videoTrack
          // 在这种情况下，hasRemoteVideo 应该保持为 false（这是正确的，因为 B 没有视频）
          // 只有当 remoteUsers 为空或者所有用户都没有有效的视频轨道时，才设置 hasRemoteVideo(false)
          // 但是，如果 remoteUserJoined 为 true，说明 B 已经加入了，即使没有视频，也应该显示 B 的头像，而不是 "Waiting for other user"
          // 所以，这里只有在确认没有找到任何有效远程视频时才设置 hasRemoteVideo(false)
          // 如果 B 没有视频但已经加入，hasRemoteVideo 应该为 false，UI 会显示 B 的头像
          if (!foundValidRemoteVideo && remoteUserJoined) {
            // B 已经加入但没有视频，这是正常情况（B 关闭了摄像头）
            // hasRemoteVideo 应该为 false，UI 会显示 B 的头像
            console.log('[useEffect] Remote user joined but no video track found, setting hasRemoteVideo to false')
            setHasRemoteVideo(false)
          } else if (!foundValidRemoteVideo && !remoteUserJoined) {
            // B 还没有加入，保持 hasRemoteVideo 的当前值
            console.log('[useEffect] No remote user joined yet, keeping current hasRemoteVideo state')
          }
        } else if (remoteUsers && remoteUsers.size === 0) {
          // 如果没有远程用户，且 remoteUserJoined 为 false，说明 B 还没有加入
          // 在这种情况下，保持 hasRemoteVideo 的当前值（可能是 false，这是正确的）
          // 如果 remoteUserJoined 为 true 但没有远程用户，这可能是异常情况，但我们不应该强制设置 hasRemoteVideo(false)
          console.log('[useEffect] No remote users found, keeping current hasRemoteVideo state')
        }
      }, 200)

      return () => clearTimeout(timer)
    }
  }, [callStatus])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleEndCall = async () => {
    // 保存当前状态，因为后面会设置为 ended
    const currentStatus = callStatus
    const currentRemoteJoined = remoteUserJoined
    
    // 先设置状态为 ended，防止 Dialog 被意外关闭
    setCallStatus('ended')
    
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
    setIsVideoOn(true)
    setIsScreenSharing(false)
    setRemoteUserJoined(false)
    setHasRemoteVideo(false)
    callStartTimeRef.current = null
    setTimeout(() => {
      onOpenChange(false)
    }, 500)
  }

  const handleToggleMute = async () => {
    if (agoraClientRef.current) {
      const newMuted = !isMuted
      await agoraClientRef.current.setMuted(newMuted)
      setIsMuted(newMuted)
    }
  }

  const handleToggleVideo = async () => {
    if (agoraClientRef.current) {
      const newVideoOn = !isVideoOn
      await agoraClientRef.current.setVideoEnabled(newVideoOn)
      setIsVideoOn(newVideoOn)
    }
  }

  // 确保 recipient 始终是对话中的另一个用户（不是当前用户）
  // 如果 recipient 是当前用户，说明传参有问题，记录警告
  const actualRecipient = recipient.id === currentUser.id 
    ? (console.error('[VideoCallDialog] ❌ CRITICAL: recipient is same as currentUser! This will cause wrong display.', { 
        recipientId: recipient.id, 
        recipientName: recipient.full_name,
        currentUserId: currentUser.id,
        currentUserName: currentUser.full_name,
        conversationId,
        isIncoming
      }), recipient)
    : recipient
  
  // 记录 recipient 信息用于调试
  useEffect(() => {
    if (open) {
      console.log('[VideoCallDialog] Recipient info:', {
        recipientId: actualRecipient.id,
        recipientName: actualRecipient.full_name,
        currentUserId: currentUser.id,
        currentUserName: currentUser.full_name,
        isSame: actualRecipient.id === currentUser.id,
        conversationId,
        isIncoming
      })
    }
  }, [open, actualRecipient.id, currentUser.id, conversationId, isIncoming])
  
  const displayName = isGroup
    ? groupName || 'Group call'
    : actualRecipient.full_name || actualRecipient.username || actualRecipient.email || 'User'
  const displayMembers = isGroup ? groupMembers : [actualRecipient]

  // 阻止 Dialog 被外部点击关闭，只能通过"停止通话"按钮关闭
  const handleOpenChange = (newOpen: boolean) => {
    // 只有当调用 handleEndCall 时才会关闭（通过 setCallStatus('ended') 和 onOpenChange(false)）
    // 阻止外部点击或 ESC 键关闭
    if (!newOpen && callStatus !== 'ended') {
      // 如果通话还在进行中，阻止关闭
      return
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="sm:max-w-4xl h-[600px] p-0"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>
            {isGroup ? `Group video call with ${groupName || 'group'}` : `Video call with ${displayName}`}
          </DialogTitle>
        </DialogHeader>
        <div className="relative h-full bg-black rounded-lg overflow-hidden">
          {/* Main video area – unified layout for all states (calling / ringing / connected) */}
          <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
              <div className="w-full h-full relative">
                {/* Remote video feed */}
                <div className="w-full h-full bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center relative">
                  <div 
                    ref={remoteVideoRef} 
                    className="w-full h-full flex items-center justify-center"
                    style={{ minHeight: '100%' }}
                  />
                  {/* 如果没有远程视频，显示B的头像（覆盖在 video 容器上方，但不阻止底部按钮点击） */}
                  {!hasRemoteVideo && (
                    <div className="absolute inset-0 flex items-center justify-center text-center text-white bg-gradient-to-br from-blue-900/90 to-purple-900/90 z-[1] pointer-events-none">
                      <div className="pointer-events-auto">
                        <Avatar className="h-32 w-32 mx-auto mb-4">
                          <AvatarImage src={actualRecipient.avatar_url || undefined} />
                          <AvatarFallback
                            className="text-3xl bg-gradient-to-br from-blue-500 to-purple-500"
                            name={actualRecipient.full_name || actualRecipient.email || 'User'}
                          >
                            {(actualRecipient.full_name || actualRecipient.email || 'User')
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <h3 className="text-xl font-semibold">{displayName}</h3>
                        <p className="text-gray-300 text-sm mt-2">
                          {remoteUserJoined 
                            ? 'Video off' // B已加入但没有开启视频
                            : callStatus === 'connected' 
                              ? 'Waiting for other user...' 
                              : callStatus === 'ringing' 
                                ? 'Ringing...' 
                                : 'Calling...'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Self view (local video) */}
                <div className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg z-10">
                  {callStatus === 'connected' && isVideoOn ? (
                    <div 
                      ref={localVideoRef} 
                      className="w-full h-full flex items-center justify-center"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                      <span className="text-white text-sm">
                        {!isVideoOn ? 'Video Off' : 'You'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Call info overlay */}
                <div className="absolute top-4 left-4 bg-black/50 px-4 py-2 rounded-lg backdrop-blur-sm">
                  <div className="text-white font-semibold">{displayName}</div>
                  <div className="text-gray-300 text-sm">
                    {callStatus === 'connected' ? (
                      remoteUserJoined ? (
                        callDuration > 0 ? formatDuration(callDuration) : 'Call started'
                      ) : (
                        'Waiting for other user...'
                      )
                    ) : callStatus === 'calling' ? (
                      'Calling...'
                    ) : callStatus === 'ringing' ? (
                      'Ringing...'
                    ) : callStatus === 'ended' ? (
                      'Call ended'
                    ) : (
                      'Connecting...'
                    )}
                  </div>
                </div>
              </div>
          </div>

          {/* Controls: only visible when call is connected */}
          {callStatus === 'connected' && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 z-20">
              <div className="flex items-center justify-center gap-4">
                <Button
                  size="icon"
                  variant={isMuted ? 'destructive' : 'secondary'}
                  className="h-14 w-14 rounded-full"
                  onClick={handleToggleMute}
                >
                  {isMuted ? (
                    <MicOff className="h-6 w-6" />
                  ) : (
                    <Mic className="h-6 w-6" />
                  )}
                </Button>

                <Button
                  size="icon"
                  variant={isVideoOn ? 'secondary' : 'destructive'}
                  className="h-14 w-14 rounded-full"
                  onClick={handleToggleVideo}
                >
                  {isVideoOn ? (
                    <Video className="h-6 w-6" />
                  ) : (
                    <VideoOff className="h-6 w-6" />
                  )}
                </Button>

                <Button
                  size="icon"
                  variant={isScreenSharing ? 'default' : 'secondary'}
                  className="h-14 w-14 rounded-full"
                  onClick={() => setIsScreenSharing(!isScreenSharing)}
                >
                  <Monitor className="h-6 w-6" />
                </Button>

                <Button
                  size="icon"
                  variant="destructive"
                  className="h-16 w-16 rounded-full"
                  onClick={handleEndCall}
                >
                  <Phone className="h-6 w-6" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
