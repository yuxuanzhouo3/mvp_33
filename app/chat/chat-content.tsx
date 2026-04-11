'use client'

import { useEffect, useLayoutEffect, useState, useCallback, useRef, Suspense } from 'react'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

import { mockAuth } from '@/lib/mock-auth'

import { Sidebar } from '@/components/chat/sidebar'

import { WorkspaceHeader } from '@/components/chat/workspace-header'
import { ChatTopBannerAd } from '@/components/chat/chat-top-banner-ad'

import { ChatHeader } from '@/components/chat/chat-header'
import { ChatImportDialog } from '@/components/chat/chat-import-dialog'
import { ConversationMetaSkeleton } from '@/components/chat/conversation-meta-skeleton'

import { ChatTabs } from '@/components/chat/chat-tabs'

import { AppNavigation } from '@/components/layout/app-navigation'

import { MessageList } from '@/components/chat/message-list'

import { AnnouncementBanner } from '@/components/chat/announcement-banner'

import { AnnouncementDrawer } from '@/components/chat/announcement-drawer'
import { AnnouncementsView } from '@/components/chat/announcements-view'
import { FilesView } from '@/components/chat/files-view'

import { GroupInfoPanel } from '@/components/chat/group-info-panel'

import { BlindZoneChat } from '@/components/chat/blind-zone-chat'

import { GlobalAnnouncement } from '@/components/chat/global-announcement'

import { MessageInput } from '@/components/chat/message-input'

import { NewConversationDialog } from '@/components/contacts/new-conversation-dialog'

import { User, Workspace, ConversationWithDetails, MessageWithSender, Message } from '@/lib/types'

import { MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'

import { VideoCallDialog } from '@/components/chat/video-call-dialog'
import { VoiceCallDialog } from '@/components/chat/voice-call-dialog'

import { useSubscription } from '@/hooks/use-subscription'

import { LimitAlert } from '@/components/subscription/limit-alert'

import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/hooks/use-mobile'
import { useHeartbeat } from '@/hooks/use-heartbeat'
import { useNotifications } from '@/hooks/use-notifications'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { SessionValidator } from '@/components/auth/session-validator'
import { IS_DOMESTIC_VERSION } from '@/config'
import { getCallUiLock, isCallUiBusy } from '@/lib/call/call-ui-lock'
import { dedupeDirectConversations } from '@/lib/conversations/direct-dedupe'

type ConversationsApiResponse = {

  success: true

  conversations: ConversationWithDetails[]

  error?: string

}

type IncomingCallPromptPayload = {
  messageId: string
  conversationId: string
  callType?: unknown
  callerId?: unknown
  callerName?: unknown
  callSessionId?: unknown
}

type PendingCallInviteApiResponse = {
  success: boolean
  invite?: {
    messageId?: string
    conversationId?: string
    callType?: 'voice' | 'video'
    callerId?: string
    callerName?: string
    callSessionId?: string
  } | null
  error?: string
}

const SYSTEM_ASSISTANT_IDS = new Set([
  'system-assistant',
  '00000000-0000-0000-0000-000000000001',
])
const CONVERSATIONS_UPDATED_EVENT_SOURCE = 'chat-content'
// Some mobile/webview gateways reject multipart payloads above ~4.5MB with plain-text 413 responses.
const MOBILE_UPLOAD_GATEWAY_SAFE_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024)
const IMAGE_AUTO_COMPRESS_THRESHOLD_BYTES = Math.floor(4.2 * 1024 * 1024)
const IMAGE_AUTO_COMPRESS_TARGET_BYTES = Math.floor(3.8 * 1024 * 1024)
const IMAGE_AUTO_COMPRESS_MAX_EDGE = 1920
const ZERO_WIDTH_CHARACTERS_REGEX = /[\u200B-\u200D\uFEFF]/g

type ConversationMetaState = 'idle' | 'loading' | 'ready' | 'failed'

const isSystemAssistantUserId = (userId?: string | null): boolean => {
  if (!userId) return false
  return SYSTEM_ASSISTANT_IDS.has(userId)
}

const canvasToJpegBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))

const tryCompressImageForUpload = async (file: File): Promise<File> => {
  if (typeof window === 'undefined') return file
  if (!file.type.startsWith('image/')) return file
  if (file.size <= IMAGE_AUTO_COMPRESS_THRESHOLD_BYTES) return file

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to decode image'))
      img.src = objectUrl
    })

    const sourceWidth = image.naturalWidth || image.width
    const sourceHeight = image.naturalHeight || image.height
    if (!sourceWidth || !sourceHeight) {
      return file
    }

    const scale = Math.min(1, IMAGE_AUTO_COMPRESS_MAX_EDGE / Math.max(sourceWidth, sourceHeight))
    let width = Math.max(1, Math.round(sourceWidth * scale))
    let height = Math.max(1, Math.round(sourceHeight * scale))

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return file

    let bestBlob: Blob | null = null
    const maxAttempts = 5

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      canvas.width = width
      canvas.height = height
      context.clearRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)

      const quality = Math.max(0.5, 0.88 - attempt * 0.1)
      const blob = await canvasToJpegBlob(canvas, quality)
      if (!blob) continue
      bestBlob = blob

      if (blob.size <= IMAGE_AUTO_COMPRESS_TARGET_BYTES) {
        break
      }

      width = Math.max(1, Math.round(width * 0.86))
      height = Math.max(1, Math.round(height * 0.86))
    }

    if (!bestBlob) return file
    if (bestBlob.size >= file.size) return file

    const baseName = file.name.replace(/\.[^.]+$/, '')
    const safeBaseName = baseName || 'image'
    return new File([bestBlob], `${safeBaseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const isPayloadTooLargeText = (text: string): boolean =>
  /request entity too large|payload too large|entity too large|request too large/i.test(text)

const normalizePlainTextMessage = (value: string): string =>
  String(value || '')
    .replace(ZERO_WIDTH_CHARACTERS_REGEX, '')
    .trim()

const parseUploadResponse = async (response: Response, language: 'zh' | 'en'): Promise<any> => {
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)
  const rawText = await response.text()
  let payload: any = null

  if (rawText) {
    try {
      payload = JSON.parse(rawText)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const payloadError =
      payload?.error ||
      payload?.message ||
      payload?.details

    if (response.status === 413 || isPayloadTooLargeText(rawText)) {
      const gatewayLimitMB = (MOBILE_UPLOAD_GATEWAY_SAFE_LIMIT_BYTES / (1024 * 1024)).toFixed(1)
      throw new Error(
        tr(
          `图片文件过大，上传网关限制约 ${gatewayLimitMB}MB。请压缩后重试。`,
          `Image is too large. Upload gateway limit is about ${gatewayLimitMB}MB. Please compress and try again.`
        )
      )
    }

    const snippet = (rawText || '').trim().slice(0, 120)
    throw new Error(
      payloadError ||
      (snippet
        ? tr(`上传失败(${response.status}): ${snippet}`, `Upload failed (${response.status}): ${snippet}`)
        : tr(`上传失败(${response.status})`, `Upload failed (${response.status})`))
    )
  }

  if (!payload || typeof payload !== 'object') {
    const snippet = (rawText || '').trim().slice(0, 120)
    throw new Error(
      snippet
        ? tr(`上传失败: ${snippet}`, `Upload failed: ${snippet}`)
        : tr('上传失败: 服务端返回格式异常', 'Upload failed: unexpected server response format')
    )
  }

  return payload
}

function ChatPageContent() {

  const router = useRouter()

  const searchParams = useSearchParams()

  const pathname = usePathname()

  const [currentUser, setCurrentUser] = useState<User | null>(null)

  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)

  const [conversations, setConversations] = useState<ConversationWithDetails[]>([])

  const [selectedConversationId, setSelectedConversationId] = useState<string>()

  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [messageSearchQuery, setMessageSearchQuery] = useState('')
  const [conversationMetaState, setConversationMetaState] = useState<ConversationMetaState>('idle')

  const [showNewConversation, setShowNewConversation] = useState(false)

  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list')
  const [groupInfoOpen, setGroupInfoOpen] = useState(false) // Group info panel state
  const [showImportDialog, setShowImportDialog] = useState(false) // Chat import dialog state
  const [announcementDrawerOpen, setAnnouncementDrawerOpen] = useState(false) // Announcement drawer state
  const [activeTab, setActiveTab] = useState('messages') // Chat tabs state
  const [activeChannel, setActiveChannel] = useState<'none' | 'announcement' | 'blind'>('none') // Global announcement & blind zone state
  const isMobile = useIsMobile()

  const [showLimitAlert, setShowLimitAlert] = useState<string | null>(null)

  const [replyingToMessageId, setReplyingToMessageId] = useState<string | null>(null)

  const [tempConversation, setTempConversation] = useState<ConversationWithDetails | null>(null)

  const [isLoadingConversations, setIsLoadingConversations] = useState(true)

  const [isRefreshingConversations, setIsRefreshingConversations] = useState(false) // For background refresh indicator

  const [isLoadingMessages, setIsLoadingMessages] = useState(false)

  // When we come from /contacts?userId=xxx and还没有 conversationId 时，
  // 右侧应该显示 “Loading conversation...”，而不是 “No conversation selected”
  const [isCreatingConversationFromUserId, setIsCreatingConversationFromUserId] = useState(false)

  const [availableUsers, setAvailableUsers] = useState<User[]>([])

  const [isLoadingUsers, setIsLoadingUsers] = useState(false)

  // Incoming call dialog state
  const [showIncomingCallDialog, setShowIncomingCallDialog] = useState(false)
  const [incomingCallMessageId, setIncomingCallMessageId] = useState<string | null>(null)
  const [incomingCallConversationId, setIncomingCallConversationId] = useState<string | null>(null)
  const [incomingCallRecipient, setIncomingCallRecipient] = useState<User | null>(null)
  const [incomingCallType, setIncomingCallType] = useState<'voice' | 'video'>('video')
  const [incomingCallSessionId, setIncomingCallSessionId] = useState<string | null>(null)
  const [incomingCallAutoAnswer, setIncomingCallAutoAnswer] = useState(false)
  const incomingCallPromptedIdsRef = useRef<Set<string>>(new Set())
  const pendingCallPollInFlightRef = useRef(false)

  const dispatchIncomingCallPrompt = useCallback((payload: IncomingCallPromptPayload): boolean => {
    if (typeof window === 'undefined') return false

    const messageId = String(payload.messageId || '')
    const conversationId = String(payload.conversationId || '')
    if (!messageId || !conversationId) return false

    if (incomingCallPromptedIdsRef.current.has(messageId)) return false
    incomingCallPromptedIdsRef.current.add(messageId)
    if (incomingCallPromptedIdsRef.current.size > 500) {
      const preserved = Array.from(incomingCallPromptedIdsRef.current).slice(-200)
      incomingCallPromptedIdsRef.current = new Set(preserved)
    }

    window.dispatchEvent(new CustomEvent('showCallDialog', {
      detail: {
        messageId,
        conversationId,
        callType: payload.callType,
        callerId: payload.callerId,
        callerName: payload.callerName,
        callSessionId: payload.callSessionId,
      },
    }))
    return true
  }, [])

  const { limits, subscription } = useSubscription()
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  useHeartbeat(currentUser?.id, currentUser?.region)
  useNotifications(currentUser?.id)

  const loadingConversationsRef = useRef<Set<string>>(new Set())

  const loadingMessagesRef = useRef<Set<string>>(new Set())

  const pendingRequestsRef = useRef<Map<string, Promise<any>>>(new Map())

  const pendingConversationRequestsRef = useRef<Map<string, Promise<any>>>(new Map())

  const pendingConversationsListRef = useRef<Promise<any> | null>(null) // Global deduplication for conversations list

  const isLoadingConversationsListRef = useRef<boolean>(false) // Track if conversations list is currently loading

  const conversationsLoadedRef = useRef<boolean>(false) // Track if conversations have been loaded at least once

  const selectedConversationIdRef = useRef<string | undefined>(undefined)
  // CRITICAL: Track the conversation that user has explicitly selected (clicked)
  // This is used to "weld" (焊死) the unread_count to 0 - no matter what happens,
  // if a conversation is in this set, its unread_count MUST be 0

  const conversationsRef = useRef<ConversationWithDetails[]>([])
  const messagesByConversationRef = useRef<Map<string, MessageWithSender[]>>(new Map())
  const messagesConversationIdRef = useRef<string | undefined>(undefined)
  const conversationMetaTokenRef = useRef(0)
  const conversationMetaLoadRequestedRef = useRef<string | null>(null)

  // CRITICAL: This ref must be declared before loadConversations which references it
  const creatingConversationForUserRef = useRef<string | null>(null)

  const pendingConversationMapRef = useRef<Map<string, ConversationWithDetails>>(new Map())

  const conversationDetailsRef = useRef<Map<string, ConversationWithDetails>>(new Map())

  const currentUserRef = useRef<User | null>(null)

  const currentWorkspaceRef = useRef<Workspace | null>(null)

  const hasForcedInitialReloadRef = useRef<boolean>(false)

  const lastLoadSignatureRef = useRef<string>('')
  const lastConversationsUpdateEventAtRef = useRef<number>(0)
  const lastMessageSendTimeRef = useRef<number>(0)

  const getValidatedCachedMessages = useCallback((conversationId: string): MessageWithSender[] | undefined => {
    const cached = messagesByConversationRef.current.get(conversationId)
    if (!cached || cached.length === 0) {
      return undefined
    }

    const isValid = cached.every((msg) => {
      if (!msg) return false
      return String(msg.conversation_id || '') === conversationId
    })

    if (!isValid) {
      console.warn('⚠️ Dropping invalid cached messages for conversation:', conversationId, {
        total: cached.length,
        sampleConversationIds: cached.slice(0, 3).map((m) => m?.conversation_id),
      })
      messagesByConversationRef.current.delete(conversationId)
      return undefined
    }

    return cached
  }, [])

  const getPendingConversationsKey = useCallback((userId: string, workspaceId: string) => {

    return `pending_conversations_${userId}_${workspaceId}`

  }, [])

  const getForcedReloadKey = useCallback((userId: string, workspaceId: string) => {

    return `conversations_forced_reload_${userId}_${workspaceId}`

  }, [])

  const getConversationsLoadedKey = useCallback((userId: string, workspaceId: string) => {

    return `conversations_loaded_${userId}_${workspaceId}`

  }, [])

  const parseConversationsResponse = useCallback(async (response: Response): Promise<ConversationsApiResponse> => {

    let payload: any = null

    try {

      payload = await response.json()

    } catch (error) {

      console.error('❌ Failed to parse conversations API response JSON:', error)

      throw new Error('Failed to parse conversations API response')

    }

    if (!response.ok) {

      const errorMessage = payload?.error || `Conversations API returned ${response.status}`

      const error = new Error(errorMessage)

      ;(error as any).details = {

        status: response.status,

        statusText: response.statusText,

        body: payload,

      }

      // Mark 401 errors for special handling
      if (response.status === 401) {
        ;(error as any).isUnauthorized = true
        // Don't log 401 errors to console as they're expected when user is not logged in
        // The error will be handled by the caller to redirect to login
      } else {
        console.error('❌ Conversations API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorMessage,
          body: payload
        })
      }

      throw error

    }

    if (payload?.success !== true || !Array.isArray(payload?.conversations)) {

      const errorMessage = payload?.error || 'Conversations API returned an invalid payload'

      const error = new Error(errorMessage)

      ;(error as any).details = {

        body: payload,

      }

      throw error

    }

    return payload as ConversationsApiResponse

  }, [])

  useEffect(() => {

    selectedConversationIdRef.current = selectedConversationId
  }, [selectedConversationId])

  useEffect(() => {
    if (!isMobile) {
      setMobileView('list')
      return
    }
    const hasExternalTarget = Boolean(searchParams.get('conversation') || searchParams.get('userId'))
    if (hasExternalTarget || activeChannel !== 'none') {
      setMobileView('detail')
    }
  }, [isMobile, activeChannel, searchParams])

  useLayoutEffect(() => {
    if (!selectedConversationId) return
    // Track which conversation the current message panel is bound to.
    // Avoid writing old conversation messages into the newly selected cache.
    messagesConversationIdRef.current = selectedConversationId
  }, [selectedConversationId])

  useEffect(() => {
    const conversationId = messagesConversationIdRef.current || selectedConversationIdRef.current
    if (!conversationId) return
    messagesByConversationRef.current.set(conversationId, messages)
  }, [messages])

  useEffect(() => {
    messagesByConversationRef.current.clear()
  }, [currentUser?.id, currentWorkspace?.id])

  useEffect(() => {

    currentUserRef.current = currentUser

  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return

    const isGlobal = !IS_DOMESTIC_VERSION

    if (isGlobal) {
      let supabase: any
      try {
        supabase = createClient()
      } catch (error) {
        console.error('Failed to create Supabase client for Presence:', error)
        return
      }

      const channel = supabase
        .channel('online-users')
        .subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            await channel.track({
              user_id: currentUser.id,
              online_at: new Date().toISOString(),
            })
            console.log('✅ Tracking presence for user:', currentUser.id)
          }
        })

      return () => {
        if (supabase) {
          supabase.removeChannel(channel)
        }
      }
    }
  }, [currentUser])

  useEffect(() => {

    currentWorkspaceRef.current = currentWorkspace

  }, [currentWorkspace])

  useEffect(() => {

    conversationsRef.current = conversations

  }, [conversations])

  useEffect(() => {

    if (currentUser && currentWorkspace && typeof window !== 'undefined') {

      const forcedReloadKey = getForcedReloadKey(currentUser.id, currentWorkspace.id)

      const forcedReloadDone = sessionStorage.getItem(forcedReloadKey) === 'true'

      hasForcedInitialReloadRef.current = forcedReloadDone

      const loadedKey = getConversationsLoadedKey(currentUser.id, currentWorkspace.id)

      const loadedFlag = sessionStorage.getItem(loadedKey) === 'true'

      conversationsLoadedRef.current = loadedFlag

    } else {

      hasForcedInitialReloadRef.current = false

      conversationsLoadedRef.current = false

    }

    lastLoadSignatureRef.current = ''

  }, [currentUser, currentWorkspace, getForcedReloadKey, getConversationsLoadedKey])

  const markConversationsLoaded = useCallback((userId: string, workspaceId: string) => {

    if (typeof window !== 'undefined') {

      const loadedKey = getConversationsLoadedKey(userId, workspaceId)

      sessionStorage.setItem(loadedKey, 'true')

      const forcedReloadKey = getForcedReloadKey(userId, workspaceId)

      sessionStorage.setItem(forcedReloadKey, 'true')

    }

    conversationsLoadedRef.current = true

    hasForcedInitialReloadRef.current = true

  }, [getConversationsLoadedKey, getForcedReloadKey])

  const restoreSelectedConversation = useCallback((

    incoming: ConversationWithDetails[],

    prevList?: ConversationWithDetails[]

  ): ConversationWithDetails[] => {

    const selectedId = selectedConversationIdRef.current

    if (!selectedId) {

      return incoming

    }

    if (incoming.some(c => c.id === selectedId)) {

      return incoming

    }

    const referenceList = prevList ?? conversationsRef.current

    const fallback = referenceList.find(c => c.id === selectedId)

    if (!fallback) {

      return incoming

    }

    const deduped = incoming.filter(c => c.id !== fallback.id)

    return [fallback, ...deduped]

  }, [])

  const persistPendingConversations = useCallback(() => {

    const user = currentUserRef.current

    const workspace = currentWorkspaceRef.current

    if (!user || !workspace || typeof window === 'undefined') return

    const pendingKey = getPendingConversationsKey(user.id, workspace.id)

    const pendingArray = Array.from(pendingConversationMapRef.current.values())

    if (pendingArray.length > 0) {

      localStorage.setItem(pendingKey, JSON.stringify(pendingArray))

    } else {

      localStorage.removeItem(pendingKey)

    }

  }, [getPendingConversationsKey])

  const hydratePendingConversations = useCallback(() => {

    if (pendingConversationMapRef.current.size > 0) return

    const user = currentUserRef.current

    const workspace = currentWorkspaceRef.current

    if (!user || !workspace || typeof window === 'undefined') return

    const pendingKey = getPendingConversationsKey(user.id, workspace.id)

    const stored = localStorage.getItem(pendingKey)

    if (!stored) return

    try {

      const parsed = JSON.parse(stored) as ConversationWithDetails[]

      parsed.forEach(conv => {

        pendingConversationMapRef.current.set(conv.id, conv)

      })

    } catch (error) {

      console.error('Failed to hydrate pending conversations:', error)

      localStorage.removeItem(pendingKey)

    }

  }, [getPendingConversationsKey])

  const mergePendingConversations = useCallback((

    incoming: ConversationWithDetails[],

    prevList?: ConversationWithDetails[]

  ): ConversationWithDetails[] => {

    hydratePendingConversations()

    let merged = [...incoming]

    let changed = false

    pendingConversationMapRef.current.forEach((pendingConv, pendingId) => {

      if (merged.some(c => c.id === pendingId)) {

        pendingConversationMapRef.current.delete(pendingId)

        changed = true

        return

      }

      const fallback = prevList?.find(c => c.id === pendingId) || pendingConv

      if (fallback) {

        pendingConversationMapRef.current.set(pendingId, fallback)

        merged = [fallback, ...merged]

        changed = true

      }

    })

    if (changed) {

      persistPendingConversations()

    }

    return merged

  }, [persistPendingConversations])

  const updatePendingConversation = useCallback((conversation?: ConversationWithDetails | null) => {

    if (!conversation) return

    if (!conversation.last_message) {

      pendingConversationMapRef.current.set(conversation.id, conversation)

    } else {

      pendingConversationMapRef.current.delete(conversation.id)

    }

    persistPendingConversations()

  }, [persistPendingConversations, hydratePendingConversations])

  const hasMemberDetails = useCallback((members?: User[]) => {

    return Array.isArray(members) && members.some(member => !!(member?.full_name || member?.username || member?.email))

  }, [])

  const isGroupConversationType = useCallback((conversation?: ConversationWithDetails | null) => {
    if (!conversation) return false
    return conversation.type === 'group' || conversation.type === 'channel'
  }, [])

  const isConversationMetaReady = useCallback((conversation?: ConversationWithDetails | null) => {
    if (!conversation) return false
    if (!isGroupConversationType(conversation)) return true
    return hasMemberDetails(conversation.members)
  }, [hasMemberDetails, isGroupConversationType])

  const updateConversationDetailsCache = useCallback((conversation?: ConversationWithDetails | null) => {

    if (!conversation) return

    if (!hasMemberDetails(conversation.members) && !conversation.last_message) {

      return

    }

    conversationDetailsRef.current.set(conversation.id, conversation)

  }, [hasMemberDetails])

  const removeConversationDetails = useCallback((conversationId: string) => {

    conversationDetailsRef.current.delete(conversationId)

  }, [])

  const preserveConversationDetails = useCallback((

    incoming: ConversationWithDetails,

    existing?: ConversationWithDetails

  ): ConversationWithDetails => {

    if (!existing) return incoming

    const shouldUseExistingMembers = !hasMemberDetails(incoming.members) && hasMemberDetails(existing.members)

    return {

      ...incoming,

      last_message: incoming.last_message || existing.last_message,

      last_message_at: incoming.last_message_at || existing.last_message_at,

      members: shouldUseExistingMembers ? existing.members : incoming.members,

    }

  }, [hasMemberDetails])

  const emitConversationsUpdated = useCallback(() => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('conversationsUpdated', {
      detail: {
        source: CONVERSATIONS_UPDATED_EVENT_SOURCE,
        at: Date.now(),
      },
    }))
  }, [])

  const persistConversationsCache = useCallback((updatedList: ConversationWithDetails[], selectedConvId?: string) => {
    if (!currentUser || !currentWorkspace || typeof window === 'undefined') {
      return
    }

    try {
      const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
      const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`
      localStorage.setItem(cacheKey, JSON.stringify(updatedList))
      localStorage.setItem(cacheTimestampKey, Date.now().toString())
      
      // CRITICAL: Store the currently selected conversation ID in localStorage
      // This allows workspace-header to immediately know which conversation is selected
      // even if the URL hasn't updated yet (router.push is async)
      if (selectedConvId) {
        const selectedConvKey = `selected_conversation_${currentUser.id}_${currentWorkspace.id}`
        localStorage.setItem(selectedConvKey, selectedConvId)
      }
      
      // Dispatch custom event to notify WorkspaceHeader of cache update
      emitConversationsUpdated()
    } catch (error) {
      console.warn('Failed to persist conversations cache:', error)
    }
  }, [currentUser, currentWorkspace, emitConversationsUpdated])

  // 置顶顺序在本地用一个 id 数组来记（最后置顶的在最上），避免后台刷新时顺序被时间字段“挤掉”
  const readPinnedIds = useCallback((): string[] => {
    if (!currentUser || !currentWorkspace || typeof window === 'undefined') return []
    try {
      const key = `pinned_conversations_${currentUser.id}_${currentWorkspace.id}`
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }, [currentUser, currentWorkspace])

  const writePinnedIds = useCallback((ids: string[]) => {
    if (!currentUser || !currentWorkspace || typeof window === 'undefined') return
    try {
      const key = `pinned_conversations_${currentUser.id}_${currentWorkspace.id}`
      localStorage.setItem(key, JSON.stringify(ids))
    } catch {
      // ignore
    }
  }, [currentUser, currentWorkspace])

  const applyPinnedOrdering = useCallback((list: ConversationWithDetails[]): ConversationWithDetails[] => {
    if (!currentUser || !currentWorkspace || typeof window === 'undefined') {
      // SSR 或还没拿到 user/workspace 时，不额外排序，直接返回
      return list
    }

    try {
      // 非置顶统一按「最后一条消息时间」排序（没有消息就看创建时间）
      const sortByTimeDesc = (a: ConversationWithDetails, b: ConversationWithDetails) => {
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
        // 时间完全一样时，用 id 保证稳定性
        return a.id.localeCompare(b.id)
      }

      // 1. 收集所有置顶的会话
      const pinnedConversations = list.filter(conv => conv.is_pinned)
      
      // 2. 按 pinned_at 时间倒序排序：最近 pin 的在前（pinned_at 越大越新）
      //    如果没有 pinned_at，使用本地记录的顺序（从后往前）
      const localPinnedIds = readPinnedIds()
      const localPinnedOrder = new Map<string, number>()
      localPinnedIds.forEach((id, index) => {
        localPinnedOrder.set(id, index)
      })

      pinnedConversations.sort((a, b) => {
        // 优先使用 pinned_at 字段排序（如果存在）
        if (a.pinned_at && b.pinned_at) {
          const aTime = new Date(a.pinned_at).getTime()
          const bTime = new Date(b.pinned_at).getTime()
          return bTime - aTime // 倒序：最新的在前
        }
        // 如果只有一个有 pinned_at，有 pinned_at 的在前
        if (a.pinned_at && !b.pinned_at) return -1
        if (!a.pinned_at && b.pinned_at) return 1
        // 如果都没有 pinned_at，使用本地记录的顺序（从后往前，即 index 大的在前）
        const aOrder = localPinnedOrder.get(a.id) ?? -1
        const bOrder = localPinnedOrder.get(b.id) ?? -1
        return bOrder - aOrder // 倒序：index 大的（后 pin 的）在前
      })

      // 3. 非置顶会话：按时间倒序（最近聊天在上面）
      const nonPinned = list
        .filter(conv => !conv.is_pinned)
        .sort(sortByTimeDesc)

      // 4. 最终列表：置顶的在前，非置顶的在后
      const finalList = [...pinnedConversations, ...nonPinned]

      // 调试用：打印当前侧边栏顺序 + 每个会话最后一条消息时间（或创建时间）
      try {
        const debugList = finalList.map((c, index) => ({
          index,
          id: c.id,
          is_pinned: !!c.is_pinned,
          pinned_at: c.pinned_at, // 添加 pinned_at 到调试日志
          last_message_at: c.last_message_at,
          created_at: c.created_at,
          // 非置顶排序用到的时间：优先 last_message_at，没有则用 created_at
          effective_time: c.last_message_at || c.created_at,
        }))
        console.log('📑 Sidebar conversations order (after applyPinnedOrdering):', debugList)
        console.log('📌 Pinned conversations details:', pinnedConversations.map(c => ({
          id: c.id,
          pinned_at: c.pinned_at,
          is_pinned: c.is_pinned,
        })))
      } catch {
        // ignore logging errors
      }

      return finalList
    } catch (error) {
      console.warn('Failed to apply pinned ordering:', error)
      return list
    }
  }, [currentUser, currentWorkspace, readPinnedIds])

  const enrichConversation = useCallback((conversation: ConversationWithDetails): ConversationWithDetails => {

    const cached = conversationDetailsRef.current.get(conversation.id)

    if (!cached) return conversation

    const shouldUseCachedMembers = !hasMemberDetails(conversation.members) && hasMemberDetails(cached.members)

    const shouldUseCachedLastMessage = !conversation.last_message && !!cached.last_message

    if (!shouldUseCachedMembers && !shouldUseCachedLastMessage) {

      return conversation

    }

    return {

      ...conversation,

      members: shouldUseCachedMembers ? cached.members : conversation.members,

      last_message: shouldUseCachedLastMessage ? cached.last_message : conversation.last_message,

    }

  }, [hasMemberDetails])

  // CRITICAL: Keep conversationsRef in sync with conversations state

  useEffect(() => {

    conversationsRef.current = conversations

  }, [conversations])

  useEffect(() => {

    if (!currentUser || !currentWorkspace || typeof window === 'undefined') {

      pendingConversationMapRef.current.clear()

      return

    }

    const pendingKey = getPendingConversationsKey(currentUser.id, currentWorkspace.id)

    pendingConversationMapRef.current.clear()

    hydratePendingConversations()

    setConversations(prev => {

      const merged = mergePendingConversations(prev, prev)

      return merged.map(enrichConversation)

    })

  }, [currentUser, currentWorkspace, hydratePendingConversations, mergePendingConversations, enrichConversation])

  const loadSingleConversation = useCallback(async (conversationId: string, workspaceId: string, retryCount = 0) => {

    // Prevent duplicate requests

    const requestKey = `${workspaceId}-${conversationId}`

    

    // OPTIMIZED: Check if conversation already exists using setState callback to avoid dependency

    // This avoids recreating the function when conversations change

    let existsInList = false
    let existingConversationSnapshot: ConversationWithDetails | undefined

    setConversations(prev => {

      existingConversationSnapshot = prev.find(c => c.id === conversationId)
      existsInList = !!existingConversationSnapshot

      return prev // No change, just checking

    })

    

    if (existsInList && retryCount === 0) {

      const needsMetaReload = !!existingConversationSnapshot &&
        (existingConversationSnapshot.type === 'group' || existingConversationSnapshot.type === 'channel') &&
        !hasMemberDetails(existingConversationSnapshot.members)

      if (needsMetaReload) {
        console.log('⚠️ Conversation exists but meta is incomplete, forcing reload:', conversationId)
      } else {

        console.log('✅ Conversation already exists in list, skipping load:', conversationId)

        return true

      }

    }

    

    // CRITICAL: Use atomic check-and-set pattern to prevent race conditions

    // Check for existing pending request FIRST (synchronously)

    let existingPromise = pendingConversationRequestsRef.current.get(requestKey)

    if (existingPromise) {

      console.log('⏳ Waiting for pending conversation request:', conversationId)

      try {

        await existingPromise

        console.log('✅ Pending request completed for:', conversationId)

        // After waiting, check if conversation is now in the list

        let existsAfterWait = false

        setConversations(prev => {

          existsAfterWait = prev.some(c => c.id === conversationId)

          return prev

        })

        return existsAfterWait

      } catch (error) {

        // Ignore errors from pending request

        console.log('⚠️ Pending request failed, will retry:', conversationId)

      }

      return false

    }

    

    // Also check if already loading (for retry cases)

    if (loadingConversationsRef.current.has(conversationId)) {

      console.log('⏳ Already loading this conversation, skipping...', conversationId)

      return false

    }

    

    // ATOMIC OPERATION: Create lock promise and set it IMMEDIATELY

    // This must be done in a single synchronous operation to prevent race conditions

    // Create a promise that will be resolved/rejected by the actual fetch

    let resolvePromise: (value: any) => void

    let rejectPromise: (error: any) => void

    const lockPromise = new Promise<any>((resolve, reject) => {

      resolvePromise = resolve

      rejectPromise = reject

    })

    

    // CRITICAL: Set the lock BEFORE marking as loading

    // This ensures any concurrent call that checks after this point will see the lock

    pendingConversationRequestsRef.current.set(requestKey, lockPromise)

    

    // Mark as loading immediately to prevent duplicate requests

    loadingConversationsRef.current.add(conversationId)

    

    console.log('🔒 Lock acquired for conversation load:', conversationId, 'pending requests:', pendingConversationRequestsRef.current.size)

    

    try {

      // Now create the actual fetch request

      const requestPromise = fetch(`/api/conversations?workspaceId=${workspaceId}&conversationId=${conversationId}`)

        .then(res => res.json())

        .then(data => {

          // Resolve the lock promise with the data

          resolvePromise!(data)

          return data

        })

        .catch(error => {

          // Reject the lock promise

          rejectPromise!(error)

          // Remove from pending on error so it can be retried

          pendingConversationRequestsRef.current.delete(requestKey)

          loadingConversationsRef.current.delete(conversationId)

          throw error

        })

      

      console.log('🚀 Starting conversation fetch:', conversationId)

      

      // First try to get the single conversation

      const singleData = await requestPromise

      

      if (singleData.success && singleData.conversation) {

        // Conversation found, add it to the list and move to front

        console.log('Conversation loaded successfully:', singleData.conversation)

        

        // Verify conversation has complete member information before using it

        const hasCompleteMembers = singleData.conversation.members && 

          singleData.conversation.members.length > 0 &&

          singleData.conversation.members.every((m: any) => 

            m && (m.full_name || m.username || m.email)

          )

        

        if (hasCompleteMembers) {

          // CRITICAL: Remove conversation from deletedConversations list if it exists

          // This ensures that if a conversation is loaded (e.g., from URL), it won't be filtered out

          if (currentUser && currentWorkspace && typeof window !== 'undefined') {

            const deletedKey = `deleted_conversations_${currentUser.id}_${currentWorkspace.id}`

            const deletedConversations = JSON.parse(localStorage.getItem(deletedKey) || '[]')

            

            if (deletedConversations.includes(conversationId)) {

              console.log('🔄 Restoring previously deleted conversation from load:', conversationId)

              const updatedDeleted = deletedConversations.filter((id: string) => id !== conversationId)

              localStorage.setItem(deletedKey, JSON.stringify(updatedDeleted))

            }

          }

          

          const existingConversation = conversationsRef.current.find(c => c.id === conversationId)

          const mergedConversation = preserveConversationDetails(singleData.conversation, existingConversation)

          setConversations(prev => {

            const exists = prev.some(c => c.id === conversationId)

            if (exists) {

              const updated = prev.map(c => c.id === conversationId ? mergedConversation : c)

              const selected = updated.find(c => c.id === conversationId)

              const others = updated.filter(c => c.id !== conversationId)

              return selected ? [selected, ...others] : updated

            }

            return [mergedConversation, ...prev]

          })

          // Don't auto-select - only update if user manually selected

          // This ensures initial load doesn't auto-select conversations

          // Clear temp conversation only when real conversation has complete info

          setTempConversation(null)

          tempConversationLoadedRef.current.delete(conversationId)

          updatePendingConversation(mergedConversation)

          updateConversationDetailsCache(mergedConversation)

          loadingConversationsRef.current.delete(conversationId)

          return true

        } else {

          console.log('Conversation loaded but members incomplete, keeping temp conversation')

          loadingConversationsRef.current.delete(conversationId)

          return false

        }

      } else {

        console.log('Single conversation API response:', singleData)

        // Conversation not found in single conversation API (404 or deleted)

        // CRITICAL: If conversation exists in current list, preserve its details (especially last_message)

        setConversations(prev => {

          const existingConversation = prev.find(c => c.id === conversationId)

          if (existingConversation) {

            console.log('✅ Conversation exists in current list, preserving details (including last_message)')

            // Preserve the existing conversation details - don't update or remove it

            // This ensures last_message is not lost when API returns 404

            loadingConversationsRef.current.delete(conversationId)

            return prev // No change needed - preserve existing data

          }

          return prev

        })

        

        // If conversation not found and not in list, stop retrying after 1 attempt

        if (retryCount < 1) {

          console.log(`Conversation not found, retrying... (${retryCount + 1}/1)`)

          setTimeout(() => {

            loadSingleConversation(conversationId, workspaceId, retryCount + 1)

          }, 1500)

        } else {

          console.log('Conversation not found after retries')

          loadingConversationsRef.current.delete(conversationId)

        }

      }

      return false

    } catch (error) {

      console.error('❌ Failed to load conversation:', error)

      loadingConversationsRef.current.delete(conversationId)

      pendingConversationRequestsRef.current.delete(requestKey)

      return false

    } finally {

      // Clean up loading flag immediately, but keep pending request for a short time

      // to allow concurrent calls to wait for the same request

      loadingConversationsRef.current.delete(conversationId)

      

      // Clean up pending request after a delay to allow reuse

      setTimeout(() => {

        pendingConversationRequestsRef.current.delete(requestKey)

        console.log('🧹 Cleaned up pending request for:', conversationId)

      }, 2000) // Increased delay to better handle concurrent calls

    }

  }, [updatePendingConversation, updateConversationDetailsCache]) // No dependencies - use setState callbacks to access current state

  const loadMessages = useCallback(async (conversationId: string, options?: { silent?: boolean }) => {

    const silent = options?.silent ?? false

    // Prevent duplicate requests

    if (loadingMessagesRef.current.has(conversationId)) {

      console.log('Messages already loading for conversation:', conversationId)

      if (!silent) {

        setIsLoadingMessages(true) // Still show loading if already loading

      }

      return

    }

    

    // Check if there's already a pending request

    const pendingKey = `messages-${conversationId}`

    if (pendingRequestsRef.current.has(pendingKey)) {

      console.log('Waiting for pending messages request:', conversationId)

      if (!silent) {

        setIsLoadingMessages(true) // Show loading while waiting

      }

      try {

        await pendingRequestsRef.current.get(pendingKey)

      } catch (error) {

        // Ignore errors from pending request

      }

      return

    }

    

    loadingMessagesRef.current.add(conversationId)

    if (!silent) {

      setIsLoadingMessages(true) // Set loading state

    }

    

    try {

      console.log('Loading messages for conversation:', conversationId, { silent })

      const requestPromise = (async () => {

        const res = await fetch(`/api/messages?conversationId=${conversationId}`)

        // 显式处理未登录 / 鉴权失败，避免一直卡在 Loading

        if (res.status === 401) {

          console.error('Failed to load messages: Unauthorized (401)')

          if (!silent) {

            alert(language === 'zh' ? '登录已失效，请重新登录后再试。' : 'Login session expired, please sign in again.')

          }

          // 可以根据你项目的路由调整

          if (typeof window !== 'undefined') {

            window.location.href = '/auth/login'

          }

          return { success: false, error: 'Unauthorized' }

        }

        return res.json()

      })()

      

      pendingRequestsRef.current.set(pendingKey, requestPromise)

      

      const data = await requestPromise

      console.log('Messages API response:', { success: data.success, messageCount: data.messages?.length, error: data.error })

      

      if (data.success) {

        console.log('Setting messages:', data.messages.length, 'messages')
        const cachedMessages = getValidatedCachedMessages(conversationId) || []
        let nextMessages: MessageWithSender[] = data.messages

        if (cachedMessages.length > 0) {
          const prevMap = new Map(cachedMessages.map(msg => [msg.id, msg]))

          nextMessages = data.messages.map((msg: MessageWithSender) => {
            const prevMsg = prevMap.get(msg.id)
            if (!prevMsg) {
              return msg
            }

            // 如果之前是 blob 预览，就保留 blob 直到真实图片预加载完成
            const prevFileUrl = prevMsg.metadata?.file_url
            const prevThumbUrl = prevMsg.metadata?.thumbnail_url
            const newFileUrl = msg.metadata?.file_url
            const newThumbUrl = msg.metadata?.thumbnail_url
            const shouldKeepBlob = prevFileUrl?.startsWith('blob:')

            if (shouldKeepBlob && prevMsg.metadata) {
              return {
                ...msg,
                metadata: {
                  ...msg.metadata,
                  file_url: prevFileUrl,
                  thumbnail_url: prevThumbUrl || newThumbUrl,
                  _real_file_url: newFileUrl || msg.metadata?._real_file_url,
                  _real_thumbnail_url: newThumbUrl || msg.metadata?._real_thumbnail_url,
                },
              }
            }

            // 否则合并 metadata，避免丢失 _real_* 等字段
            return {
              ...msg,
              metadata: {
                ...prevMsg.metadata,
                ...msg.metadata,
                file_url: newFileUrl || prevFileUrl,
                thumbnail_url: newThumbUrl || prevThumbUrl,
              },
            }
          })
        }

        messagesByConversationRef.current.set(conversationId, nextMessages)

        // Stale-request guard: if user has switched conversation, don't overwrite current panel.
        if (selectedConversationIdRef.current === conversationId) {
          messagesConversationIdRef.current = conversationId
          setMessages(nextMessages)
          // Fire-and-forget: mark messages as read by current user
          fetch('/api/messages/read', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId }),
          }).catch(() => {})
        } else {
          console.log('⏭️ Skip stale messages update for conversation:', conversationId)
        }

      } else {

        console.error('Failed to load messages:', data.error)

      }

    } catch (error) {

      console.error('Failed to load messages:', error)

      // Don't clear messages on error, keep existing ones

    } finally {

      loadingMessagesRef.current.delete(conversationId)

      pendingRequestsRef.current.delete(pendingKey)

      if (!silent && selectedConversationIdRef.current === conversationId) {
        setIsLoadingMessages(false) // Clear loading state for current conversation only
      }

      // CRITICAL: After loading messages, ensure the currently selected conversation
      // has unread_count = 0, even if it was updated by other sources (like loadConversations)
      // This prevents the red dot from reappearing after messages are loaded
      // Use refs to access current values since loadMessages has empty dependency array
      const currentSelectedId = selectedConversationIdRef.current
      const user = currentUserRef.current
      const workspace = currentWorkspaceRef.current
      
      if (conversationId === currentSelectedId && user && workspace) {
        console.log('🔒 Keeping selected conversation unread_count at 0 (loadMessages complete):', conversationId)
        
        setConversations(prev => {
          const updated = prev.map(conv =>
            conv.id === conversationId
              ? { ...conv, unread_count: 0 }
              : conv
          )
          
          // CRITICAL: Update conversationsRef.current immediately so that loadConversations
          // protection logic can correctly detect that this conversation has unread_count = 0
          conversationsRef.current = updated
          
          // Update cache to persist the read state
          if (typeof window !== 'undefined') {
            const cacheKey = `conversations_${user.id}_${workspace.id}`
            localStorage.setItem(cacheKey, JSON.stringify(updated))
            localStorage.setItem(`${cacheKey}_ts`, Date.now().toString())
            
            // Also store selected conversation ID for workspace-header
            const selectedConvKey = `selected_conversation_${user.id}_${workspace.id}`
            localStorage.setItem(selectedConvKey, conversationId)
          }
          
          // Dispatch event to notify workspace-header
          if (typeof window !== 'undefined') {
            emitConversationsUpdated()
          }
          
          return updated
        })
      }

    }

  }, [getValidatedCachedMessages, emitConversationsUpdated])

  const loadConversations = useCallback(async (userId: string, workspaceId: string, skipCache = false) => {

    // OPTIMIZED: Global deduplication - prevent multiple simultaneous requests

    const requestKey = `${userId}_${workspaceId}`

    

    // If there's already a pending request, wait for it (unless this is a background update)

    if (pendingConversationsListRef.current && !skipCache) {

      console.log('Conversations list already loading, waiting for existing request...')

      try {

        await pendingConversationsListRef.current

        return // Exit early, the existing request will update the state

      } catch (error) {

        // If the existing request failed, continue with new request

        console.log('Previous request failed, starting new one')

        // Clear the failed request reference

        pendingConversationsListRef.current = null

      }

    }

    

    // OPTIMIZED: Try to load from cache first for instant display

    const cacheKey = `conversations_${userId}_${workspaceId}`

    const cacheTimestampKey = `conversations_timestamp_${userId}_${workspaceId}`

    const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

    

    // Load from cache first for instant display (like WeChat)
    let cachedConversations: ConversationWithDetails[] = []
    
    try {
      // Check cache first (unless skipCache is true)
      if (!skipCache) {
        const cachedData = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null
        const cachedTimestamp = typeof window !== 'undefined' ? localStorage.getItem(cacheTimestampKey) : null

        if (cachedData && cachedTimestamp) {
          const cacheAge = Date.now() - parseInt(cachedTimestamp, 10)
          if (cacheAge < CACHE_DURATION) {
            try {
              cachedConversations = JSON.parse(cachedData) || []
              console.log('📦 Loading conversations from cache for instant display:', cachedConversations.length, 'conversations')
              
              // CRITICAL: Filter out conversations where the other user is not in contacts AND not a workspace member
              // This ensures deleted contacts' conversations don't appear even from cache
              try {
                const [contactsResponse, membersResponse] = await Promise.all([
                  fetch('/api/contacts'),
                  fetch(`/api/workspace-members?workspaceId=${workspaceId}`),
                ])
                if (contactsResponse.ok) {
                  const contactsData = await contactsResponse.json()
                  // Build workspace members set
                  let workspaceMemberIds = new Set<string>()
                  if (membersResponse.ok) {
                    try {
                      const membersData = await membersResponse.json()
                      if (membersData.success && membersData.members) {
                        workspaceMemberIds = new Set(
                          membersData.members.map((m: any) => m.id || m.user_id).filter(Boolean)
                        )
                      }
                    } catch { /* ignore */ }
                  }
                  if (contactsData.success && contactsData.contacts) {
                    const contactUserIds = new Set(
                      contactsData.contacts.map((c: any) => c.contact_user_id || c.user?.id).filter(Boolean)
                    )
                    contactUserIds.add(userId) // Add self
                    
                    const beforeFilterCount = cachedConversations.length
                    cachedConversations = cachedConversations.filter((conv: ConversationWithDetails) => {
                      // Only filter direct conversations
                      if (conv.type !== 'direct') {
                        return true
                      }
                      
                      // CRITICAL: Allow self-conversations (where members might be 1 or 2, but other user is same as current user)
                      // Check if this is a self-conversation first
                      const isSelfConversation = conv.members && conv.members.length >= 1 && 
                        conv.members.every((m: any) => (m.id || m) === userId)
                      
                      if (isSelfConversation) {
                        console.log('✅ [Cache] Keeping self-conversation:', conv.id)
                        return true // Keep self-conversations
                      }
                      
                      // If conversation has no members or invalid members, filter it out
                      if (!conv.members || conv.members.length !== 2) {
                        console.log('🗑️ [Cache] Filtering out direct conversation with invalid members:', conv.id)
                        return false
                      }
                      
                      // Find the other user (not current user)
                      const otherUser = conv.members.find((m: any) => (m.id || m) !== userId)
                      const otherUserId = typeof otherUser === 'string' ? otherUser : otherUser?.id
                      if (!otherUserId) {
                        console.log('🗑️ [Cache] Filtering out direct conversation without other user:', conv.id)
                        return false
                      }

                      // CRITICAL: Allow self-conversations (where otherUser is the same as current user)
                      if (otherUserId === userId) {
                        console.log('✅ [Cache] Keeping self-conversation:', conv.id)
                        return true // Keep self-conversations
                      }
                      
                      // If the other user is not in contacts AND not a workspace member, filter out this conversation
                      if (!contactUserIds.has(otherUserId) && !workspaceMemberIds.has(otherUserId) && !isSystemAssistantUserId(otherUserId)) {
                        console.log('🗑️ [Cache] Filtering out direct conversation - user not in contacts or workspace:', {
                          conversationId: conv.id,
                          otherUserId: otherUserId,
                        })
                        return false
                      }
                      
                      return true
                    })
                    
                    const filteredCount = beforeFilterCount - cachedConversations.length
                    if (filteredCount > 0) {
                      console.log(`✅ [Cache] Filtered out ${filteredCount} direct conversation(s) where other user is not in contacts`)
                      // Update cache immediately to remove filtered conversations
                      if (typeof window !== 'undefined') {
                        localStorage.setItem(cacheKey, JSON.stringify(cachedConversations))
                        localStorage.setItem(cacheTimestampKey, Date.now().toString())
                      }
                    }
                  }
                }
              } catch (cacheFilterError) {
                console.error('❌ [Cache] Error filtering conversations by contacts:', cacheFilterError)
                // Don't fail, just log the error - continue with cached conversations
              }
              
              // Immediately display cached conversations (like WeChat)
              if (cachedConversations && cachedConversations.length > 0) {
                cachedConversations = dedupeDirectConversations(cachedConversations, userId)
                const enrichedCached = applyPinnedOrdering(cachedConversations.map(enrichConversation))
                setConversations(enrichedCached)
                conversationsRef.current = enrichedCached
                setIsLoadingConversations(false) // Show cached data immediately
                setIsRefreshingConversations(true) // Show small loading indicator at top
                console.log('✅ Displayed cached conversations immediately, showing refresh indicator')
              }
            } catch (e) {
              console.warn('Failed to parse cached conversations:', e)
              cachedConversations = []
            }
          } else {
            console.log('Cache expired, will load from API')
          }
        }
      }
    } catch (error) {
      console.error('Error loading from cache:', error)
      // Continue to fetch from API
    }

    

    // Handle background updates separately (skipCache = true)

    if (skipCache) {

      // Background update (skipCache = true)

      const hasExistingConversations = conversationsRef.current.length > 0

      if (!isLoadingConversationsListRef.current) {

        if (!hasExistingConversations) {

          setIsLoadingConversations(true)

        }

        isLoadingConversationsListRef.current = true

      }

      try {

        console.log('🔄 Loading conversations for user (background update):', userId, 'workspace:', workspaceId)

        const response = await fetch(`/api/conversations?workspaceId=${workspaceId}`)

        // Handle 401 before parsing
        if (response.status === 401) {
          console.error('Unauthorized (401) - redirecting to login')
          // 🔧 DEBUG: Log 401 to visible panel
          if (typeof window !== 'undefined' && (window as any).__mpDebug) {
            const tkn = localStorage.getItem('chat_app_token')
            (window as any).__mpDebug('🚨401', `conversations API返回401!`)
            (window as any).__mpDebug('🚨401', `token=${tkn ? '有(' + tkn.length + '字符)' : '无!'}`)
            (window as any).__mpDebug('🚨401', `即将清除auth并跳转/login`)
          }
          // Clear mock auth state to avoid redirect loop between /chat and /login
          if (typeof window !== 'undefined') {
            mockAuth.logout()
            localStorage.removeItem('chat_app_token')
          }
          router.push('/login')
          return
        }

        const data = await parseConversationsResponse(response)

        

        console.log('📥 API Response:', {

          success: data.success,

          hasConversations: !!data.conversations,

          conversationsCount: data.conversations?.length || 0,

          error: data.error,

          conversationIds: data.conversations?.map((c: any) => ({ id: c.id, type: c.type, hasLastMessage: !!c.last_message })) || []

        })

        

        if (data.success && data.conversations) {

          // Get deleted conversations list

          const deletedKey = `deleted_conversations_${userId}_${workspaceId}`

          const deletedConversations = typeof window !== 'undefined'

            ? JSON.parse(localStorage.getItem(deletedKey) || '[]')

            : []

          

          // CRITICAL: Don't auto-cleanup deletedConversations if conversation is in API
          // If a conversation is in API but was deleted by user, it means:
          // 1. User deleted the contact, conversation should be hidden
          // 2. But API still returns it because deleted_at might not be set properly
          // 3. We should check contacts to verify if it should really be shown
          
          // Define allApiIds first before using it
          const allApiIds = new Set(data.conversations.map((c: any) => c.id))
          
          // GUARD: Skip contacts validation if conversation creation is in progress
          if (creatingConversationForUserRef.current) {
            // Skip contacts validation during creation to prevent race condition
          } else {
          // Check contacts AND workspace members to see if conversations should really be filtered
          try {
            // Fetch contacts and workspace members in parallel
            const [contactsResponse, membersResponse] = await Promise.all([
              fetch('/api/contacts'),
              fetch(`/api/workspace-members?workspaceId=${workspaceId}`),
            ])
            if (contactsResponse.ok) {
              const contactsData = await contactsResponse.json()
              // Build a set of workspace member IDs (fallback to empty if fetch failed)
              let workspaceMemberIds = new Set<string>()
              if (membersResponse.ok) {
                try {
                  const membersData = await membersResponse.json()
                  if (membersData.success && membersData.members) {
                    workspaceMemberIds = new Set(
                      membersData.members.map((m: any) => m.id || m.user_id).filter(Boolean)
                    )
                  }
                } catch { /* ignore parse errors */ }
              }
              if (contactsData.success && contactsData.contacts) {
                const contactUserIds = new Set(
                  contactsData.contacts.map((c: any) => c.contact_user_id || c.user?.id).filter(Boolean)
                )
                
                // Keep conversations where the other user is a contact OR a workspace member
                  const validConversationIds = new Set(
                    data.conversations
                      .filter((conv: any) => {
                        if (conv.type === 'direct') {
                          // CRITICAL: Allow self-conversations (where members might be 1 or 2, but other user is same as current user)
                          const isSelfConversation = conv.members && conv.members.length >= 1 && 
                            conv.members.every((m: any) => (m.id || m) === userId)
                          
                          if (isSelfConversation) {
                            return true // Keep self-conversations
                          }
                          
                          if (conv.members && conv.members.length === 2) {
                            const otherUser = conv.members.find((m: any) => (m.id || m) !== userId)
                            const otherUserId = (otherUser as any)?.id || otherUser
                            
                            // CRITICAL: Allow self-conversations (where otherUser is the same as current user)
                            if (otherUserId === userId) {
                              return true // Keep self-conversations
                            }
                            
                            // Keep if user is a contact, a workspace member, or a system assistant
                            return !!otherUserId && (contactUserIds.has(otherUserId) || workspaceMemberIds.has(otherUserId) || isSystemAssistantUserId(otherUserId))
                          }
                          return false // Filter out invalid direct conversations
                        }
                        return true // Keep non-direct conversations
                      })
                      .map((c: any) => c.id)
                    )
                
                // Only cleanup deletedConversations if conversation is valid AND in API
                const incorrectlyDeleted = deletedConversations.filter((deletedId: string) => 
                  allApiIds.has(deletedId) && validConversationIds.has(deletedId)
                )
                
                if (incorrectlyDeleted.length > 0 && typeof window !== 'undefined') {
                  console.warn('⚠️ Found conversations incorrectly marked as deleted:', incorrectlyDeleted)
                  console.log('🧹 Cleaning up deletedConversations list...')
                  const cleanedDeleted = deletedConversations.filter((id: string) => 
                    !(allApiIds.has(id) && validConversationIds.has(id))
                  )
                  localStorage.setItem(deletedKey, JSON.stringify(cleanedDeleted))
                  console.log('✅ Cleaned up deletedConversations list:', {
                    before: deletedConversations.length,
                    after: cleanedDeleted.length,
                    removed: incorrectlyDeleted
                  })

                  // Update the deletedConversations array to use the cleaned version
                  deletedConversations.length = 0
                  deletedConversations.push(...cleanedDeleted)
                } else {
                  console.log('✅ No incorrectly deleted conversations found - keeping deletedConversations as is')
                }
              }
            }
          } catch (contactsCheckError) {
            console.error('Failed to check contacts for conversation validation:', contactsCheckError)
            // If contacts check fails, don't auto-cleanup deletedConversations
          }
          } // end creatingConversationForUserRef guard

          

          console.log('🔍 Processing conversations:', {

            totalFromAPI: data.conversations.length,

            deletedConversations: deletedConversations.length,

            deletedIds: deletedConversations,

            allConversationIds: Array.from(allApiIds)

          })

          

          // Process and update cache (same logic as main request)

          // Filter out deleted conversations (but only those that are truly deleted, not in API)

          let directAndGroups = (data.conversations || []).filter(

            (c: ConversationWithDetails) => 

              c && 

              (c.type === 'direct' || c.type === 'group') &&

              !deletedConversations.includes(c.id)

          )

          

          console.log('🔍 After filtering:', {

            directAndGroupsCount: directAndGroups.length,

            conversationIds: directAndGroups.map((c: any) => ({ id: c.id, type: c.type, hasLastMessage: !!c.last_message }))

          })


          const frontendDirectConversationsByPair = new Map<string, ConversationWithDetails[]>()

          const frontendOtherConversations: ConversationWithDetails[] = []

          

          directAndGroups.forEach((conv: ConversationWithDetails) => {

            if (conv.type === 'direct' && conv.members && conv.members.length === 2) {

              const memberIds = conv.members.map((m: any) => m.id).sort()

              const pairKey = `${memberIds[0]}-${memberIds[1]}`

              

              if (!frontendDirectConversationsByPair.has(pairKey)) {

                frontendDirectConversationsByPair.set(pairKey, [])

              }

              frontendDirectConversationsByPair.get(pairKey)!.push(conv)

            } else {

              frontendOtherConversations.push(conv)

            }

          })

          

          const frontendDeduplicatedDirect: ConversationWithDetails[] = []

          frontendDirectConversationsByPair.forEach((duplicates, pairKey) => {

            if (duplicates.length > 1) {

              console.log(`⚠️ Found ${duplicates.length} duplicate direct conversations for pair ${pairKey}`)

              duplicates.sort((a, b) => {

                const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0

                const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0

                if (aTime !== bTime) return bTime - aTime

                const aCreated = new Date(a.created_at || 0).getTime()

                const bCreated = new Date(b.created_at || 0).getTime()

                if (aCreated !== bCreated) return aCreated - bCreated

                return a.id.localeCompare(b.id)

              })

              frontendDeduplicatedDirect.push(duplicates[0])

              console.log(`✅ Keeping conversation ${duplicates[0].id}, removing ${duplicates.length - 1} duplicates`)

            } else {

              frontendDeduplicatedDirect.push(duplicates[0])

            }

          })

          

          console.log('🔍 After deduplication:', {

            directCount: frontendDeduplicatedDirect.length,

            otherCount: frontendOtherConversations.length,

            directIds: frontendDeduplicatedDirect.map((c: any) => c.id),

            otherIds: frontendOtherConversations.map((c: any) => c.id)

          })

          

          const finalConversations = dedupeDirectConversations(
            [...frontendDeduplicatedDirect, ...frontendOtherConversations],
            userId,
          )

          // Incremental update: merge new conversations with existing ones (like WeChat)
          const currentList = conversationsRef.current
          const prevIds = new Set(currentList.map(c => c.id))
          const newIds = new Set(finalConversations.map(c => c.id))
          
          // Separate new and existing conversations
          const newConversations = finalConversations.filter(c => !prevIds.has(c.id))
          const existingConversations = finalConversations.filter(c => prevIds.has(c.id))
          
          // Create a map of existing conversations for quick lookup
          const existingMap = new Map(currentList.map(c => [c.id, c]))
          
          // Update existing conversations with new data, preserve position
          const updatedExisting = currentList.map(prevConv => {
            const newData = existingConversations.find(c => c.id === prevConv.id)
            if (newData) {
              // Merge: use new data but preserve optimistic states (like unread_count = 0)
              const currentConvId = selectedConversationId
              const shouldPreserveRead = currentConvId === prevConv.id && prevConv.unread_count === 0
              return {
                ...newData,
                unread_count: shouldPreserveRead ? 0 : (newData.unread_count || 0)
              }
            }
            return prevConv
          })
          
          // Merge: new conversations at top, then existing (updated) conversations
          const mergedConversations = [
            ...newConversations, // New conversations go to top
            ...updatedExisting    // Existing conversations (updated) follow
          ]

          const mergedWithRestored = restoreSelectedConversation(mergedConversations, currentList)

          const mergedWithPending = mergePendingConversations(mergedWithRestored, currentList)

          const enrichedConversations = applyPinnedOrdering(mergedWithPending.map(enrichConversation))

          

          console.log('🔍 Final conversations:', {

            totalCount: enrichedConversations.length,

            conversationIds: enrichedConversations.map((c: any) => ({ id: c.id, type: c.type, hasLastMessage: !!c.last_message }))

          })

          // Note: currentList is already used above for incremental update
          // This check is for edge case where API returns empty but we have data
          if (conversationsRef.current.length > 0 && enrichedConversations.length === 0) {

            console.log('⚠️ API returned 0 conversations but local state has data — keeping existing list to prevent flicker')

            // CRITICAL: Don't clear conversations if API returns empty but we have cached data

            // This prevents the UI from flickering when API temporarily returns empty

            // The cached conversations will remain visible until API returns valid data

            markConversationsLoaded(userId, workspaceId)

            setIsLoadingConversations(false)
            setIsRefreshingConversations(false)

            return

          }

          

          // CRITICAL: If API returns empty, clear cache and show empty list
          // This ensures that when database is cleared, UI reflects the actual state

          if (enrichedConversations.length === 0) {

            console.log('✅ API returned 0 conversations - clearing cache and showing empty list')

            // Clear all cache related to conversations

            if (typeof window !== 'undefined') {

              localStorage.removeItem(cacheKey)

              localStorage.removeItem(cacheTimestampKey)

              // Also clear deleted conversations list since everything is gone

              const deletedKey = `deleted_conversations_${userId}_${workspaceId}`

              localStorage.removeItem(deletedKey)

            }

            // Set empty list

            setConversations([])

            markConversationsLoaded(userId, workspaceId)

            setIsLoadingConversations(false)
            setIsRefreshingConversations(false)

            return

          }

          

          // Preserve unread_count = 0 for the currently selected conversation.
          const enrichedWithPreservedRead = enrichedConversations.map(conv => {
            if (selectedConversationIdRef.current === conv.id) {
              console.log('🔒 Keeping selected conversation unread_count at 0:', conv.id)
              return { ...conv, unread_count: 0 }
            }
            return conv
          })

          // Update cache

          if (typeof window !== 'undefined') {

            localStorage.setItem(cacheKey, JSON.stringify(enrichedWithPreservedRead))

            localStorage.setItem(cacheTimestampKey, Date.now().toString())

          }

          

          // CRITICAL FIX: Use functional update to preserve optimistically added conversations
          setConversations(prev => {
            const enrichedIds = new Set(enrichedWithPreservedRead.map(c => c.id))
            const preservedOptimistic = prev.filter(c => !enrichedIds.has(c.id))
            if (preservedOptimistic.length > 0) {
              return [...preservedOptimistic, ...enrichedWithPreservedRead]
            }
            return enrichedWithPreservedRead
          })

          markConversationsLoaded(userId, workspaceId)

          setIsLoadingConversations(false) // CRITICAL: Set loading to false
          setIsRefreshingConversations(false) // Hide refresh indicator

          console.log('✅ Updated conversations from background refresh:', enrichedConversations.length)

        }

      } catch (error) {

        console.error('❌ Background conversation update failed:', error)

        setIsLoadingConversations(false) // CRITICAL: Set loading to false on error
        setIsRefreshingConversations(false) // Hide refresh indicator

      } finally {

        // CRITICAL: Always ensure loading state is set to false in finally block

        setIsLoadingConversations(false)
        setIsRefreshingConversations(false) // Hide refresh indicator

        isLoadingConversationsListRef.current = false

        console.log('✅ Background update completed, loading state set to false')

      }

      return // Exit early for background updates

    }

    

    // Main request flow (skipCache = false)
    // Only show full loading if we don't have cached data
    const hasCachedData = cachedConversations && cachedConversations.length > 0
    if (!hasCachedData) {
      setIsLoadingConversations(true)
    } else {
      setIsRefreshingConversations(true) // Show small loading indicator instead
    }
    isLoadingConversationsListRef.current = true

    

    // Create and store the request promise for deduplication

    // IMPORTANT: Set the ref BEFORE executing to prevent race conditions

    const requestPromise = (async () => {

      try {

        console.log('Loading conversations for user:', userId, 'workspace:', workspaceId)

        const response = await fetch(`/api/conversations?workspaceId=${workspaceId}`)

        // Handle 401 before parsing
        if (response.status === 401) {
          console.error('Unauthorized (401) - redirecting to login')
          if (typeof window !== 'undefined') {
            mockAuth.logout()
            localStorage.removeItem('chat_app_token')
          }
          router.push('/login')
          return
        }

        const data = await parseConversationsResponse(response)

        console.log('Conversations API response:', { 

          success: data.success, 

          count: data.conversations?.length,

          error: data.error 

        })

        

        if (data.success) {

          console.log('Raw conversations from API:', data.conversations)

          console.log('Total conversations received:', data.conversations?.length || 0)

          

          // Get deleted conversations list

          const deletedKey = `deleted_conversations_${userId}_${workspaceId}`

          const deletedConversations = typeof window !== 'undefined'

            ? JSON.parse(localStorage.getItem(deletedKey) || '[]')

            : []

          

          // CRITICAL FIX: Only clean up deletedConversations list if conversation is NOT in API
          // BUT: Don't remove conversations that were just deleted by user (recent deletions)
          // We keep a timestamp check to avoid removing recently deleted conversations
          const allApiIds = new Set(data.conversations.map((c: any) => c.id))
          
          // Only clean up if conversation is in API AND was deleted more than 5 minutes ago
          // This prevents removing conversations that were just deleted
          const now = Date.now()
          const recentDeletionThreshold = 5 * 60 * 1000 // 5 minutes
          
          const incorrectlyDeleted = deletedConversations.filter((deletedId: string) => {
            if (!allApiIds.has(deletedId)) return false
            // Check if this was a recent deletion (within last 5 minutes)
            const deletionTimestampKey = `deletion_timestamp_${deletedId}_${userId}_${workspaceId}`
            const deletionTime = typeof window !== 'undefined' 
              ? parseInt(localStorage.getItem(deletionTimestampKey) || '0', 10)
              : 0
            // Don't remove if deleted within last 5 minutes
            if (deletionTime && (now - deletionTime) < recentDeletionThreshold) {
              return false
            }
            return true
          })

          // Clean up deletedConversations list: remove IDs that are still in the API (and not recently deleted)
          if (incorrectlyDeleted.length > 0 && typeof window !== 'undefined') {
            console.warn('⚠️ Found conversations incorrectly marked as deleted:', incorrectlyDeleted)
            console.log('🧹 Cleaning up deletedConversations list...')
            const cleanedDeleted = deletedConversations.filter((id: string) => !incorrectlyDeleted.includes(id))
            localStorage.setItem(deletedKey, JSON.stringify(cleanedDeleted))
            console.log('✅ Cleaned up deletedConversations list:', {
              before: deletedConversations.length,
              after: cleanedDeleted.length,
              removed: incorrectlyDeleted
            })
            // Update the deletedConversations array to use the cleaned version
            deletedConversations.length = 0
            deletedConversations.push(...cleanedDeleted)
          }

          

          // Filter to only direct messages and groups (exclude channels)
          
          // Also exclude deleted conversations (but only those that are truly deleted, not in API)
          
          // Also exclude hidden conversations
          
          let directAndGroups = (data.conversations || []).filter(
            
            (c: ConversationWithDetails) => 
            
              c && 
            
              (c.type === 'direct' || c.type === 'group') &&
            
              !deletedConversations.includes(c.id) &&
            
              !c.is_hidden // Exclude hidden conversations
            
          )

          

          console.log(`Filtered to ${directAndGroups.length} direct/group conversations`)

          console.log('Conversation details:', directAndGroups.map((c: ConversationWithDetails) => ({

            id: c.id,

            type: c.type,

            members: c.members?.length || 0,

            workspace_id: c.workspace_id

          })))

          

          // CRITICAL: If API returns empty, clear cache and show empty list
          // This ensures that when database is cleared, UI reflects the actual state

          const currentList = conversationsRef.current

          if (directAndGroups.length === 0) {

            console.log('✅ API returned 0 conversations - clearing cache and showing empty list')

            // Clear all cache related to conversations

            if (typeof window !== 'undefined') {

              localStorage.removeItem(cacheKey)

              localStorage.removeItem(cacheTimestampKey)

              // Also clear deleted conversations list since everything is gone

              const deletedKey = `deleted_conversations_${userId}_${workspaceId}`

              localStorage.removeItem(deletedKey)

            }

            // Set empty list

            const enrichedEmpty = applyPinnedOrdering([])

            setConversations(enrichedEmpty)

            markConversationsLoaded(userId, workspaceId)

            setIsLoadingConversations(false)
            setIsRefreshingConversations(false)

            return

          }

          

          // Sort by last_message_at (most recent first), or created_at if no messages

          // IMPORTANT: Conversations without messages should still be included and sorted by created_at

          // Use deterministic sorting to prevent flickering

          directAndGroups.sort((a: ConversationWithDetails, b: ConversationWithDetails) => {

            // Use last_message_at if available, otherwise use created_at

            // This ensures conversations without messages are still sorted correctly

            const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : new Date(a.created_at || 0).getTime()

            const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : new Date(b.created_at || 0).getTime()

            const timeDiff = bTime - aTime

            if (timeDiff !== 0) return timeDiff

            // If times are equal, use ID for deterministic sorting

            return a.id.localeCompare(b.id)

          })

          

          console.log(`✅ Sorted ${directAndGroups.length} conversations (${directAndGroups.filter(c => !c.last_message).length} without messages)`)

          

          // Auto-select first conversation with unread messages if no conversation is selected
          // This ensures users see new messages immediately when they open the chat page

          

          // IMPORTANT: Check if direct conversations are with deleted contacts
          // Auto-cleanup: If a direct conversation's other user is not in contacts, mark it as deleted
          // OPTIMIZED: Use cached contacts to avoid frequent API calls
          // GUARD: Skip auto-cleanup if conversation creation is in progress
          if (creatingConversationForUserRef.current) {
            // Skip cleanup during creation
          } else if (typeof window !== 'undefined' && userId) {
            try {
              console.log('🚦 Contacts cleanup starting...')
              let contactUserIds: Set<string> = new Set([userId]) // 默认只包含自己，保证最严清理
              
              // Try to use cached contacts first
              const contactsCacheKey = `contacts_${userId}`
              const contactsCacheTsKey = `contacts_timestamp_${userId}`
              const CONTACTS_CACHE_DURATION = 2 * 60 * 1000 // 2 minutes cache
              
              let useCache = false
              if (typeof window !== 'undefined') {
                const cachedContacts = localStorage.getItem(contactsCacheKey)
                const cachedTs = localStorage.getItem(contactsCacheTsKey)
                if (cachedContacts && cachedTs) {
                  const age = Date.now() - parseInt(cachedTs, 10)
                  if (age < CONTACTS_CACHE_DURATION) {
                    try {
                      const ids = JSON.parse(cachedContacts)
                      contactUserIds = new Set(ids)
                      contactUserIds.add(userId)
                      useCache = true
                      console.log('✅ Using cached contacts for cleanup')
                    } catch (e) {
                      console.warn('⚠️ Failed to parse cached contacts, fetching fresh')
                    }
                  }
                }
              }
              
              // CRITICAL: Always fetch contacts synchronously to ensure accurate cleanup
              // This prevents conversations from reappearing after refresh
              if (!useCache) {
                try {
                  console.log('🔄 Fetching contacts synchronously for accurate cleanup...')
                  const contactsResponse = await fetch('/api/contacts')
                  if (contactsResponse.ok) {
                    const contactsData = await contactsResponse.json()
                    if (contactsData && contactsData.contacts) {
                      const ids = (contactsData.contacts || []).map((c: any) => c.contact_user_id || c.user?.id).filter(Boolean)
                      contactUserIds = new Set(ids)
                      contactUserIds.add(userId)
                      // Update cache for next time
                      if (typeof window !== 'undefined') {
                        localStorage.setItem(contactsCacheKey, JSON.stringify(ids))
                        localStorage.setItem(contactsCacheTsKey, Date.now().toString())
                      }
                      console.log('✅ Fetched contacts synchronously and updated cache:', Array.from(contactUserIds))
                    }
                  }
                } catch (error) {
                  console.error('❌ Failed to fetch contacts synchronously, using self-only for cleanup:', error)
                  // Fall back to self-only cleanup if fetch fails
                }
              }
              
              const contactCount = contactUserIds.size - 1 // exclude self

              // Also fetch workspace members to avoid filtering out workspace conversations
              let workspaceMemberIds = new Set<string>()
              try {
                const membersResponse = await fetch(`/api/workspace-members?workspaceId=${workspaceId}`)
                if (membersResponse.ok) {
                  const membersData = await membersResponse.json()
                  if (membersData.success && membersData.members) {
                    workspaceMemberIds = new Set(
                      membersData.members.map((m: any) => m.id || m.user_id).filter(Boolean)
                    )
                  }
                }
              } catch { /* ignore */ }
              
              // Debug: contacts used for cleanup
              const contactIdsArray = Array.from(contactUserIds)
              console.log('👥 Contacts for cleanup', { count: contactCount, ids: contactIdsArray, workspaceMembers: workspaceMemberIds.size })

              // Check each direct conversation
              const conversationsToDelete: string[] = []
              directAndGroups.forEach((conv: ConversationWithDetails) => {
                if (conv.type === 'direct') {
                  // Guard: malformed direct conversations should be cleaned up too
                  if (!conv.members || conv.members.length !== 2) {
                    if (!deletedConversations.includes(conv.id)) {
                      conversationsToDelete.push(conv.id)
                      console.log(`🧹 Auto-marking conversation ${conv.id} as deleted (invalid members)`, { members: conv.members })
                    }
                    return
                  }

                  const memberIds = conv.members.map((m: any) => (m.id as string) || m)
                  const otherUser = conv.members.find((m: any) => (m.id || m) !== userId)
                  const otherUserId = (otherUser as any)?.id || otherUser
                  
                  // If missing otherUserId, treat as invalid and delete
                  const noOther = !otherUserId
                  // If the other user is not in contacts AND not a workspace member, mark this conversation as deleted
                  const isSystemAssistantConversation = isSystemAssistantUserId(otherUserId)
                  const isWorkspaceMember = otherUserId && workspaceMemberIds.has(otherUserId)
                  const noContacts = contactCount === 0
                  const notInContacts = otherUserId && !contactUserIds.has(otherUserId)
                  if ((noOther || (!isSystemAssistantConversation && !isWorkspaceMember && (noContacts || notInContacts))) && !deletedConversations.includes(conv.id)) {
                    conversationsToDelete.push(conv.id)
                    console.log(`🧹 Auto-marking conversation ${conv.id} as deleted (user ${otherUserId || 'unknown'} not in contacts or workspace)`, {
                      members: memberIds,
                      contactCount,
                      contactIds: contactIdsArray,
                    })
                  } else {
                    console.log('✅ Keeping direct conversation', {
                      conversationId: conv.id,
                      members: memberIds,
                      contactCount,
                      contactIds: contactIdsArray,
                    })
                  }
                }
              })

              // If contact list is empty and nothing was marked yet, force delete all direct conversations
              if (contactCount === 0 && conversationsToDelete.length === 0) {
                const allDirectIds = directAndGroups
                  .filter(c => {
                    if (c.type !== 'direct') return false
                    const memberIds = (c.members || []).map((m: any) => (m.id || m)).filter(Boolean)
                    const otherUserId = memberIds.find((id: string) => id !== userId)
                    return !isSystemAssistantUserId(otherUserId)
                  })
                  .map(c => c.id)
                conversationsToDelete.push(...allDirectIds)
                console.log('🧹 No contacts at all, force-deleting all direct conversations', allDirectIds)
              }
              
              // Add to deleted_conversations list
              if (conversationsToDelete.length > 0 && typeof window !== 'undefined') {
                const deletedKey = `deleted_conversations_${userId}_${workspaceId}`
                const currentDeleted = JSON.parse(localStorage.getItem(deletedKey) || '[]')
                const updatedDeleted = [...new Set([...currentDeleted, ...conversationsToDelete])]
                localStorage.setItem(deletedKey, JSON.stringify(updatedDeleted))
                
                // Store deletion timestamps
                const now = Date.now()
                conversationsToDelete.forEach(convId => {
                  const deletionTimestampKey = `deletion_timestamp_${convId}_${userId}_${workspaceId}`
                  localStorage.setItem(deletionTimestampKey, now.toString())
                })
                
                console.log(`✅ Auto-added ${conversationsToDelete.length} conversations to deleted list:`, conversationsToDelete)
                
                // Update deletedConversations array for current processing (create new array since it's const)
                const updatedDeletedConversations = [...deletedConversations, ...conversationsToDelete]
                
                // Remove from directAndGroups
                directAndGroups = directAndGroups.filter((c: ConversationWithDetails) => 
                  !conversationsToDelete.includes(c.id)
                )
                
                // Update the deletedConversations reference for filtering below
                deletedConversations.length = 0
                deletedConversations.push(...updatedDeletedConversations)
              }
            } catch (contactsError) {
              // 如果联系人接口异常，退化为只保留“自己”的直聊，其它直聊全部清掉
              console.error('Failed to check contacts for cleanup, falling back to self-only cleanup:', contactsError)
              const conversationsToDelete = directAndGroups
                .filter((conv: ConversationWithDetails) => conv.type === 'direct')
                .map(conv => conv.id)
                .filter(id => !deletedConversations.includes(id))

              if (conversationsToDelete.length > 0 && typeof window !== 'undefined') {
                const deletedKey = `deleted_conversations_${userId}_${workspaceId}`
                const currentDeleted = JSON.parse(localStorage.getItem(deletedKey) || '[]')
                const updatedDeleted = [...new Set([...currentDeleted, ...conversationsToDelete])]
                localStorage.setItem(deletedKey, JSON.stringify(updatedDeleted))
                const now = Date.now()
                conversationsToDelete.forEach(convId => {
                  const deletionTimestampKey = `deletion_timestamp_${convId}_${userId}_${workspaceId}`
                  localStorage.setItem(deletionTimestampKey, now.toString())
                })
              }

              directAndGroups = directAndGroups.filter((c: ConversationWithDetails) => c.type !== 'direct')
              deletedConversations.length = 0
              deletedConversations.push(...new Set([...deletedConversations, ...directAndGroups.map(c => c.id)]))
            }
          }

          // IMPORTANT: Additional deduplication at frontend level to ensure stability

          // Group direct conversations by member pair and keep only one

          const frontendDirectConversationsByPair = new Map<string, ConversationWithDetails[]>()

          const frontendOtherConversations: ConversationWithDetails[] = []

          

          directAndGroups.forEach((conv: ConversationWithDetails) => {

            if (conv.type === 'direct' && conv.members && conv.members.length === 2) {

              const memberIds = conv.members.map((m: any) => m.id || m).sort()

              const pairKey = `${memberIds[0]}-${memberIds[1]}`

              

              if (!frontendDirectConversationsByPair.has(pairKey)) {

                frontendDirectConversationsByPair.set(pairKey, [])

              }

              frontendDirectConversationsByPair.get(pairKey)!.push(conv)

            } else {

              frontendOtherConversations.push(conv)

            }

          })

          

          // For each pair, keep only one conversation (deterministic)

          const frontendDeduplicatedDirect: ConversationWithDetails[] = []

          frontendDirectConversationsByPair.forEach((duplicates, pairKey) => {

            if (duplicates.length > 1) {

              console.warn(`⚠️ Frontend: Found ${duplicates.length} duplicate direct conversations for pair ${pairKey}`)

              // Sort by: 1) last_message_at (most recent first), 2) created_at (oldest first), 3) id (deterministic)

              duplicates.sort((a: ConversationWithDetails, b: ConversationWithDetails) => {

                const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0

                const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0

                if (aTime !== bTime) return bTime - aTime

                const aCreated = new Date(a.created_at || 0).getTime()

                const bCreated = new Date(b.created_at || 0).getTime()

                if (aCreated !== bCreated) return aCreated - bCreated

                return a.id.localeCompare(b.id) // Deterministic by ID

              })

              // Keep only the first one (deterministic)

              frontendDeduplicatedDirect.push(duplicates[0])

              console.log(`✅ Frontend: Keeping conversation ${duplicates[0].id} (deterministic), removing ${duplicates.length - 1} duplicates`)

            } else {

              frontendDeduplicatedDirect.push(duplicates[0])

            }

          })

          

          // Combine deduplicated direct conversations with other conversations

          const finalConversations = dedupeDirectConversations(
            [...frontendDeduplicatedDirect, ...frontendOtherConversations],
            userId,
          )

          console.log('After frontend deduplication:', finalConversations.length, 'conversations')

          

          // CRITICAL: Update state and cache to ensure newly created conversations are visible

          // IMPORTANT: Only update if the list actually changed to prevent unnecessary re-renders

          // Compare by conversation IDs to detect changes

          console.log('🔍 About to update conversations state:', {

            finalConversationsCount: finalConversations.length,

            conversationsWithoutMessages: finalConversations.filter(c => !c.last_message).length,

            conversationIds: finalConversations.map(c => c.id)

          })

          

          setConversations(prev => {
            // Incremental update: merge new conversations with existing ones (like WeChat)
            // New conversations go to the top, existing ones are updated in place
            const prevIds = new Set(prev.map(c => c.id))
            const newIds = new Set(finalConversations.map(c => c.id))
            
            // Separate new and existing conversations
            const newConversations = finalConversations.filter(c => !prevIds.has(c.id))
            const existingConversations = finalConversations.filter(c => prevIds.has(c.id))
            
            // Create a map of existing conversations for quick lookup
            const existingMap = new Map(prev.map(c => [c.id, c]))
            
            // Update existing conversations with new data, preserve position
            const updatedExisting = prev.map(prevConv => {
              const newData = existingConversations.find(c => c.id === prevConv.id)
              if (newData) {
                if (selectedConversationIdRef.current === prevConv.id) {
                  console.log('🔒 Keeping selected conversation unread_count at 0:', prevConv.id)
                  return {
                    ...newData,
                    unread_count: 0
                  }
                }
                // For other conversations, use the new data's unread_count
                return {
                  ...newData,
                  unread_count: newData.unread_count || 0
                }
              }
              return prevConv
            })
            
            // Merge: new conversations at top, then existing (updated) conversations
            const mergedConversations = [
              ...newConversations, // New conversations go to top
              ...updatedExisting    // Existing conversations (updated) follow
            ]
            
            const mergedWithRestored = restoreSelectedConversation(mergedConversations, prev)
            const mergedWithPending = mergePendingConversations(mergedWithRestored, prev)
            const enrichedList = applyPinnedOrdering(mergedWithPending.map(enrichConversation))

            // Preserve unread_count = 0 for the currently selected conversation.
            const enrichedWithPreservedRead = enrichedList.map(conv => {
              if (selectedConversationIdRef.current === conv.id) {
                console.log('🔒 Keeping selected conversation unread_count at 0:', conv.id)
                return { ...conv, unread_count: 0 }
              }
              return conv
            })

            const enrichedIds = new Set(enrichedWithPreservedRead.map(c => c.id))

            

            console.log('🔍 Comparing conversation lists (incremental update):', {

              prevCount: prev.length,

              newCount: enrichedWithPreservedRead.length,

              newConversationsCount: newConversations.length,

              updatedConversationsCount: existingConversations.length,

              prevIds: Array.from(prevIds),

              enrichedIds: Array.from(enrichedIds),

              newInList: Array.from(enrichedIds).filter(id => !prevIds.has(id)),

              removedFromList: Array.from(prevIds).filter(id => !enrichedIds.has(id))

            })

            

            // Check if lists are different (new conversations added or existing ones updated)
            const hasNewConversations = newConversations.length > 0
            const hasUpdatedConversations = existingConversations.length > 0
            const hasChanges = hasNewConversations || hasUpdatedConversations || 
                              prevIds.size !== enrichedIds.size ||
                              !Array.from(prevIds).every(id => enrichedIds.has(id))

            if (hasChanges) {
              console.log('✅ Conversations updated (incremental):', {

                prevCount: prev.length,

                newCount: enrichedWithPreservedRead.length,

                newConversations: newConversations.map(c => ({

                  id: c.id,

                  type: c.type,

                  hasLastMessage: !!c.last_message

                })),

                updatedConversations: existingConversations.length

              })

              

              // Update cache IMMEDIATELY after state update

              if (typeof window !== 'undefined') {

                localStorage.setItem(cacheKey, JSON.stringify(enrichedWithPreservedRead))

                localStorage.setItem(cacheTimestampKey, Date.now().toString())

                // Dispatch custom event to notify WorkspaceHeader of cache update
                emitConversationsUpdated()

                console.log(`💾 Cached ${enrichedWithPreservedRead.length} conversations from API (including ${enrichedWithPreservedRead.filter(c => !c.last_message).length} without messages)`)

              }

              

              markConversationsLoaded(userId, workspaceId)

              setIsLoadingConversations(false)
              setIsRefreshingConversations(false) // Hide refresh indicator

              return enrichedWithPreservedRead

            }

            

            // Lists are the same, but check if order changed

            const prevOrder = prev.map(c => c.id).join(',')

            const newOrder = enrichedWithPreservedRead.map(c => c.id).join(',')

            if (prevOrder !== newOrder) {

              console.log('✅ Conversation order changed, updating state')

              

              // Update cache

              if (typeof window !== 'undefined') {

                localStorage.setItem(cacheKey, JSON.stringify(enrichedWithPreservedRead))

                localStorage.setItem(cacheTimestampKey, Date.now().toString())

              }

              

              markConversationsLoaded(userId, workspaceId)

              setIsLoadingConversations(false)
              setIsRefreshingConversations(false) // Hide refresh indicator

              return enrichedWithPreservedRead

            }

            

            // No changes, return previous state to prevent re-render

            console.log('✅ Conversations unchanged, keeping existing state')

            setIsLoadingConversations(false)
            setIsRefreshingConversations(false) // Hide refresh indicator

            conversationsLoadedRef.current = true

            return prev

          })

        }

      } catch (error: any) {

        console.error('❌ Failed to load conversations:', error)

        // Handle 401 Unauthorized - redirect to login
        if (error?.isUnauthorized || error?.details?.status === 401) {
          console.error('Unauthorized (401) - redirecting to login')
          if (typeof window !== 'undefined') {
            mockAuth.logout()
            localStorage.removeItem('chat_app_token')
          }
          router.push('/login')
          return
        }

        // Don't clear conversations on error, keep existing ones

        setIsLoadingConversations(false) // CRITICAL: Set loading to false on error
        setIsRefreshingConversations(false) // Hide refresh indicator

      } finally {

        // CRITICAL: Always set loading to false in finally block (redundant but safe)

        setIsLoadingConversations(false)
        setIsRefreshingConversations(false) // Hide refresh indicator

        isLoadingConversationsListRef.current = false

        // Clear the pending request - it will be set again if needed

        // We don't need to check if it's the current request since we're in the finally block

        // and the ref will be cleared when the promise completes

        pendingConversationsListRef.current = null

        console.log('✅ loadConversations completed, loading state set to false')

      }

    })()

    

    // Set the ref immediately to prevent duplicate requests

    pendingConversationsListRef.current = requestPromise

    

    // Execute the request

    await requestPromise

  }, [loadSingleConversation, parseConversationsResponse, restoreSelectedConversation, mergePendingConversations, enrichConversation, router, emitConversationsUpdated]) // Removed searchParams and selectedConversationId to prevent loops

  const loadSingleConversationRef = useRef(loadSingleConversation)

  useEffect(() => {
    loadSingleConversationRef.current = loadSingleConversation
  }, [loadSingleConversation])

  // Track if initial load has been done to prevent duplicate loads on route changes

  // Use sessionStorage to persist across component remounts (but reset on browser refresh)

  const getInitialLoadDone = () => {

    if (typeof window === 'undefined') return false

    return sessionStorage.getItem('conversations_initial_load_done') === 'true'

  }

  

  const setInitialLoadDone = (done: boolean) => {

    if (typeof window === 'undefined') return

    if (done) {

      sessionStorage.setItem('conversations_initial_load_done', 'true')

    } else {

      sessionStorage.removeItem('conversations_initial_load_done')

    }

  }

  // Check cache immediately on mount to show cached conversations instantly
  useEffect(() => {
    if (!currentUser || !currentWorkspace || typeof window === 'undefined') return
    // Only run once on mount, don't re-run when enrichConversation/applyPinnedOrdering change
    // eslint-disable-next-line react-hooks/exhaustive-deps
    if (conversations.length > 0) return // Already have conversations, skip
    
    const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
    const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`
    const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
    
    try {
      const cachedData = localStorage.getItem(cacheKey)
      const cachedTimestamp = localStorage.getItem(cacheTimestampKey)
      
      if (cachedData && cachedTimestamp) {
        const cacheAge = Date.now() - parseInt(cachedTimestamp, 10)
        if (cacheAge < CACHE_DURATION) {
          try {
            const cachedConversations = JSON.parse(cachedData)
            if (cachedConversations && cachedConversations.length > 0) {
              // Immediately show cached conversations, no loading screen
              console.log('📦 Found cached conversations on mount, displaying immediately:', cachedConversations.length)
              
              // Filter to only direct and group conversations (exclude channels)
              const directAndGroups = cachedConversations.filter(
                (c: ConversationWithDetails) => 
                  c && 
                  (c.type === 'direct' || c.type === 'group')
              )
              
              if (directAndGroups.length > 0) {
                // Immediately set conversations state so they show right away
                // Use the functions directly (they're defined before this useEffect)
                const enrichedCached = applyPinnedOrdering(directAndGroups.map(enrichConversation))
                setConversations(enrichedCached)
                conversationsRef.current = enrichedCached
                setIsLoadingConversations(false) // Hide loading immediately
                setIsRefreshingConversations(true) // Show refresh indicator
                console.log('✅ Displayed cached conversations immediately on mount')
              }
            }
          } catch (e) {
            console.warn('Failed to parse cached conversations on mount:', e)
          }
        }
      }
    } catch (error) {
      console.error('Error checking cache on mount:', error)
    }
  }, [currentUser, currentWorkspace, enrichConversation, applyPinnedOrdering])

  // Request notification permission on page load
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      // Only request if permission is default (not granted or denied)
      if (Notification.permission === 'default') {
        // Request permission after a short delay to avoid blocking initial load
        setTimeout(() => {
          import('@/lib/notifications').then(({ requestNotificationPermission }) => {
            requestNotificationPermission().then(permission => {
              if (permission === 'granted') {
                console.log('✅ Notification permission granted')
              } else {
                console.log('⚠️ Notification permission not granted:', permission)
              }
            })
          })
        }, 2000) // Wait 2 seconds after page load
      }
    }
  }, [])

  useEffect(() => {

    const loadSignature = `${pathname}|${searchParams.toString()}`

    if (

      pathname === '/chat' &&

      conversationsLoadedRef.current &&

      hasForcedInitialReloadRef.current &&

      lastLoadSignatureRef.current === loadSignature

    ) {

      console.log('⏭️ Skipping loadUserData, signature already handled:', loadSignature)

      return

    }

    lastLoadSignatureRef.current = loadSignature

    console.log('🔄 loadUserData useEffect triggered', {

      initialLoadDone: getInitialLoadDone(),

      conversationsLoaded: conversationsLoadedRef.current,

      pathname,

      searchParams: searchParams.toString()

    })

    

    // CRITICAL: Only run when on /chat page

    if (pathname !== '/chat') {

      return

    }

    

    const loadUserData = async () => {

      // First, try to get user from localStorage (fast)

      let user = mockAuth.getCurrentUser()

      const workspace = mockAuth.getCurrentWorkspace()

      console.log('🔍 [CHAT PAGE] loadUserData - Checking user and workspace:', {
        hasUser: !!user,
        userId: user?.id,
        hasWorkspace: !!workspace,
        workspaceId: workspace?.id,
        workspaceName: workspace?.name
      })

      // 🔧 DEBUG: Log to visible panel
      if (typeof window !== 'undefined' && (window as any).__mpDebug) {
        (window as any).__mpDebug('CHAT', `user=${user ? '✅' + user.id?.substring(0,8) : '❌无'}, ws=${workspace ? '✅' + workspace.name : '❌无'}`)
        (window as any).__mpDebug('CHAT', `token=${localStorage.getItem('chat_app_token') ? '✅有' : '❌无'}`)
      }

      if (!user || !workspace) {
        console.error('❌ [CHAT PAGE] Missing user or workspace, redirecting to login:', {
          hasUser: !!user,
          hasWorkspace: !!workspace
        })
        // 🔧 DEBUG
        if (typeof window !== 'undefined' && (window as any).__mpDebug) {
          (window as any).__mpDebug('🚨CHAT', `缺少${!user ? 'user' : ''}${!workspace ? 'workspace' : ''} → 跳转/login`)
        }
        router.push('/login')

        return

      }

      console.log('✅ [CHAT PAGE] User and workspace verified, continuing to load chat data')

      // Set user and workspace immediately so UI can render

      // This allows conversations to start loading right away

      setCurrentUser(user)

      setCurrentWorkspace(workspace)

      const forcedReloadKey = getForcedReloadKey(user.id, workspace.id)

      // Check if refresh parameter is present (from payment success redirect)
      const hasRefreshParam = searchParams?.has('refresh')
      
      // If refresh param exists, clear the forced reload flag to force fresh load
      if (hasRefreshParam && typeof window !== 'undefined') {
        sessionStorage.removeItem(forcedReloadKey)
        const conversationsLoadedKey = getConversationsLoadedKey(user.id, workspace.id)
        sessionStorage.removeItem(conversationsLoadedKey)
        // Remove refresh param from URL
        const newSearchParams = new URLSearchParams(searchParams?.toString() || '')
        newSearchParams.delete('refresh')
        const newUrl = newSearchParams.toString() 
          ? `/chat?${newSearchParams.toString()}`
          : '/chat'
        router.replace(newUrl, { scroll: false })
      }

      const forcedReloadDone = typeof window !== 'undefined' && sessionStorage.getItem(forcedReloadKey) === 'true'

      const conversationsLoadedKey = getConversationsLoadedKey(user.id, workspace.id)

      const storedConversationsLoaded =

        typeof window !== 'undefined' && sessionStorage.getItem(conversationsLoadedKey) === 'true'

      if (storedConversationsLoaded && !conversationsLoadedRef.current) {

        conversationsLoadedRef.current = true

      }

      const skipFullReload = conversationsLoadedRef.current && forcedReloadDone

      const hasExistingConversations = conversationsRef.current.length > 0 || conversations.length > 0

      // IMPORTANT: Check cache first, even if we skip loading

      const cacheKey = `conversations_${user.id}_${workspace.id}`

      const cacheTimestampKey = `conversations_timestamp_${user.id}_${workspace.id}`

      const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

      

      if (typeof window !== 'undefined' && conversations.length === 0) {

        const cachedData = localStorage.getItem(cacheKey)

        const cachedTimestamp = localStorage.getItem(cacheTimestampKey)

        

        if (cachedData && cachedTimestamp) {

          const cacheAge = Date.now() - parseInt(cachedTimestamp, 10)

          if (cacheAge < CACHE_DURATION) {

            const deletedKey = `deleted_conversations_${user.id}_${workspace.id}`

            try {
              const cachedConversations = JSON.parse(cachedData)
              const parsedDeleted = JSON.parse(localStorage.getItem(deletedKey) || '[]')
              const deletedConversations = Array.isArray(parsedDeleted) ? parsedDeleted : []

              const directAndGroups = Array.isArray(cachedConversations)
                ? cachedConversations.filter(
                    (c: ConversationWithDetails) =>
                      c &&
                      (c.type === 'direct' || c.type === 'group') &&
                      !deletedConversations.includes(c.id)
                  )
                : []

              console.log('📦 Loading conversations from cache:', directAndGroups.length)

              // 这里之前会先用缓存渲染一遍再用 API 覆盖，导致列表“先一版顺序、再一版顺序”闪动
              // 现在为了稳定顺序，直接只用 API 的结果，缓存只作为后备数据，不再用来即时渲染
              if (directAndGroups.length === 0) {
                // Cache exists but is empty - clear it and reload from API
                console.log('⚠️ Cache is empty, clearing and reloading from API...')
                localStorage.removeItem(cacheKey)
                localStorage.removeItem(cacheTimestampKey)
                // Continue to load from API below
              }
            } catch (cacheParseError) {
              console.warn('⚠️ Invalid conversations cache detected, clearing cache keys', {
                cacheKey,
                cacheTimestampKey,
                error: cacheParseError,
              })
              localStorage.removeItem(cacheKey)
              localStorage.removeItem(cacheTimestampKey)
            }

          } else {

            // Cache expired, but don't clear it yet - we might need it if API returns empty

            console.log('⚠️ Cache expired, but keeping it as fallback in case API returns empty')

            // Don't remove cache here - we'll use it as fallback if API fails

          }

        }

      }

      

      if (skipFullReload && hasExistingConversations) {

        console.log('✅ Conversations already loaded, skipping forced reload')

        hasForcedInitialReloadRef.current = true

        setIsLoadingConversations(false)
        setIsRefreshingConversations(false)

        return

      }

      hasForcedInitialReloadRef.current = true

      if (typeof window !== 'undefined') {

        sessionStorage.setItem(forcedReloadKey, 'true')

      }

      setInitialLoadDone(true)

      console.log('🔄 User on /chat page - FORCING reload from API to get ALL conversations (including empty ones)')

      

      // Reset ALL flags to force fresh load

      conversationsLoadedRef.current = false

      isLoadingConversationsListRef.current = false

      pendingConversationsListRef.current = null

      

      // CRITICAL: Skip cache and force API load to ensure newly created conversations are loaded

      // Even if cache exists, we need to reload from API to get the latest data

      // OPTIMIZED: Parallel loading - load conversations and user profile simultaneously

      // This reduces total wait time

      console.log('Starting to load conversations and user profile in parallel...', {

        userId: user.id,

        workspaceId: workspace.id,

        userName: user.full_name || user.username

      })

      

      // Load conversations - use ref to prevent multiple simultaneous loads

      // CRITICAL: Force skipCache=true to ensure we get latest data from API

  const loadOnce = async () => {

    // Check both the ref flag and the pending promise

    if (isLoadingConversationsListRef.current || pendingConversationsListRef.current) {

      console.log('Conversations already loading, skipping...')

      return

    }

    isLoadingConversationsListRef.current = true

    try {

      // CRITICAL: Use skipCache=true to force API load and get ALL conversations

      // This ensures newly created conversations (even without messages) are loaded

      await loadConversations(user.id, workspace.id, true) // skipCache = true

    } catch (error: any) {

      console.error('Failed to load conversations:', error)

      // Handle 401 Unauthorized - redirect to login
      if (error?.isUnauthorized || error?.details?.status === 401) {
        console.error('Unauthorized (401) - redirecting to login')
        if (typeof window !== 'undefined') {
          mockAuth.logout()
          localStorage.removeItem('chat_app_token')
        }
        router.push('/login')
        return
      }

    } finally {

      isLoadingConversationsListRef.current = false

    }

  }

      

      // OPTIMIZED: Load conversations and user profile in parallel

      // Use Promise.all to execute both requests simultaneously

      Promise.all([

        // Load conversations

        // Load conversations immediately (removed 100ms delay for faster loading)
        loadOnce().catch(() => {}), // Catch errors silently, already handled in loadOnce

        // Load user profile in parallel

        fetch('/api/users/profile')

          .then(res => res.json())

          .then(data => {

            if (data.success && data.user) {

              // Update localStorage with latest data

              mockAuth.setCurrentUser(data.user)

              const normalizedUser = mockAuth.getCurrentUser()
              setCurrentUser(normalizedUser || data.user)

            }

          })

          .catch(error => {

            console.error('Failed to fetch latest user data:', error)

            // Continue with cached user data if API fails

          })

      ]).then(() => {

        console.log('Parallel loading completed')

      })

    }

    loadUserData()

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [pathname]) // Reload when pathname changes (user navigates back to chat page)

  // Track if this is the initial page load

  const isInitialLoadRef = useRef<boolean>(true)

  const processedConversationRef = useRef<string | null>(null)

  const isManualSelectionRef = useRef<boolean>(false)

  

  useEffect(() => {

    // Only process if we're on the chat page

    if (pathname !== '/chat') {

      return

    }

    

    const conversationId = searchParams.get('conversation')
    
    // CRITICAL: When entering chat page without a conversation ID in URL,
    // clear the localStorage selected_conversation to ensure unread count is calculated correctly
    // This prevents old localStorage values from affecting unread count calculation
    if (!conversationId && typeof window !== 'undefined' && currentUser && currentWorkspace) {
      try {
        const selectedConvKey = `selected_conversation_${currentUser.id}_${currentWorkspace.id}`
        localStorage.removeItem(selectedConvKey)
        console.log('🧹 Cleared old selected_conversation from localStorage (no conversation in URL)')
      } catch (e) {
        // Ignore errors
      }
    }

    const userId = searchParams.get('userId') // For creating new conversation from contacts

    

    // Always handle userId-triggered conversation creation, even after initial load
    if (userId && !conversationId && currentWorkspace && currentUser) {
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false
      }

      if (creatingConversationForUserRef.current === userId) {
        console.log('⏳ Already processing conversation creation for userId, skipping duplicate trigger:', userId)
        return
      }

      creatingConversationForUserRef.current = userId

      // 标记为“正在根据 userId 创建 / 查找会话”，右侧显示 Loading UI
      setIsCreatingConversationFromUserId(true)

      console.log('📝 Creating/finding conversation for userId:', userId, {
        currentWorkspace: currentWorkspace.id,
        currentUser: currentUser.id
      })

      // Create conversation in background
      fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'direct',
          member_ids: [userId],
          skip_contact_check: true,
        }),
      })
        .then(response => {
          console.log('📥 Conversation creation response status:', response.status)
          return response.json()
        })
        .then(data => {
          console.log('📥 Conversation creation response data:', data)

          if (data.success && data.conversation) {
            console.log('✅ Conversation created successfully:', data.conversation.id)
            console.log('📋 Conversation data:', {
              id: data.conversation.id,
              type: data.conversation.type,
              members: data.conversation.members?.length || 0,
              hasMembers: !!data.conversation.members
            })

            // ALWAYS remove conversation from deleted list when user explicitly starts a chat
            // This allows restoring conversations when user explicitly starts a new chat
            // Whether it's a new conversation or existing one, we want to show it
            if (currentUser && currentWorkspace) {
              const deletedKey = `deleted_conversations_${currentUser.id}_${currentWorkspace.id}`
              const deletedConversations = typeof window !== 'undefined'
                ? JSON.parse(localStorage.getItem(deletedKey) || '[]')
                : []

              if (deletedConversations.includes(data.conversation.id)) {
                console.log('🔄 Restoring previously deleted conversation:', data.conversation.id)
                const updatedDeleted = deletedConversations.filter((id: string) => id !== data.conversation.id)
                if (typeof window !== 'undefined') {
                  localStorage.setItem(deletedKey, JSON.stringify(updatedDeleted))
                }
              }
            }

            // CRITICAL: Add the conversation to the list IMMEDIATELY
            // This ensures it's visible even if the list is still loading
            setConversations(prev => {
              console.log('📋 Current conversations count:', prev.length)

              // Check if conversation already exists
              const exists = prev.find(c => c.id === data.conversation.id)
              let updatedList: ConversationWithDetails[]

              if (exists) {
                console.log('🔄 Conversation already exists, updating...')
                // Update existing conversation and move to top
                const updated = prev.map(c => 
                  c.id === data.conversation.id ? data.conversation : c
                )
                const selected = updated.find(c => c.id === data.conversation.id)
                const others = updated.filter(c => c.id !== data.conversation.id)
                updatedList = selected ? [selected, ...others] : updated
              } else {
                console.log('➕ Adding new conversation to list (will be at top)')
                // Add new conversation to the top
                updatedList = [data.conversation, ...prev]
              }

              // Update cache IMMEDIATELY to persist the change
              if (typeof window !== 'undefined' && currentWorkspace) {
                const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
                const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`
                localStorage.setItem(cacheKey, JSON.stringify(updatedList))
                localStorage.setItem(cacheTimestampKey, Date.now().toString())
              }

              console.log('✅ Conversation added to list, new count:', updatedList.length)
              return updatedList
            })

            updatePendingConversation(data.conversation)

            // CRITICAL: Mark conversations as loaded to prevent list reload from overwriting
            conversationsLoadedRef.current = true
            setIsLoadingConversations(false)
            setIsRefreshingConversations(false)

            // Ensure conversation has complete data before proceeding
            if (!data.conversation.members || data.conversation.members.length === 0) {
              console.warn('⚠️ Conversation missing members, reloading...')
              // If members are missing, reload the conversation
              setTimeout(() => {
                loadSingleConversation(data.conversation.id, currentWorkspace.id, 0).then(() => {
                  setSelectedConversationId(data.conversation.id)
                  setMessages([])
                  setIsLoadingMessages(true)
                  loadMessages(data.conversation.id)
                })
              }, 100)
              return
            }

            // Set selected conversation FIRST (before URL update)
            // This ensures the conversation is selected immediately
            console.log('🎯 Setting selected conversation ID:', data.conversation.id)
            setSelectedConversationId(data.conversation.id)
            setMessages([])
            setIsLoadingMessages(true)

            // Update URL with conversation ID.
            // Keep call params when this navigation comes from contacts/workspace call buttons.
            const callType = searchParams.get('callType')
            const shouldAutoCall = searchParams.get('autoCall') === '1'
            const nextUrl =
              shouldAutoCall && (callType === 'voice' || callType === 'video')
                ? `/chat?conversation=${data.conversation.id}&callType=${callType}&autoCall=1`
                : `/chat?conversation=${data.conversation.id}`
            console.log('🔗 Updating URL to:', nextUrl)
            router.replace(nextUrl)

            // Mark conversation as processed to prevent duplicate processing
            processedConversationRef.current = data.conversation.id

            // Load messages for the new conversation
            console.log('📨 Loading messages for conversation:', data.conversation.id)
            loadMessages(data.conversation.id)
          } else {
            console.error('❌ Failed to create conversation:', data.error || 'Unknown error')
            alert(`Failed to create conversation: ${data.error || 'Unknown error'}`)
          }
        })
        .catch(error => {
          console.error('❌ Failed to create conversation:', error)
          alert(`Failed to create conversation: ${error.message || 'Unknown error'}`)
        })
        .finally(() => {
          // 无论成功或失败，都结束 “根据 userId 创建会话” 的 Loading 状态
          creatingConversationForUserRef.current = null
          setIsCreatingConversationFromUserId(false)
        })

      return
    }

    

    // On initial load, check if we have a conversation ID or userId in URL

    // If yes, it means we navigated from another page (e.g., contacts) - auto-select it

    // If no, it means we directly entered chat page - keep it empty

    if (isInitialLoadRef.current) {

      isInitialLoadRef.current = false

      

      // If we have userId but no conversationId, create/find conversation first

      if (userId && !conversationId && currentWorkspace && currentUser) {

        // 标记为“正在根据 userId 创建 / 查找会话”，右侧显示 Loading UI
        setIsCreatingConversationFromUserId(true)

        console.log('📝 Creating/finding conversation for userId:', userId, {

          currentWorkspace: currentWorkspace.id,

          currentUser: currentUser.id

        })

        

        // Create conversation in background

        fetch('/api/conversations', {

          method: 'POST',

          headers: {

            'Content-Type': 'application/json',

          },

          body: JSON.stringify({

            type: 'direct',

            member_ids: [userId],

            skip_contact_check: true,

          }),

        })

        .then(response => {

          console.log('📥 Conversation creation response status:', response.status)

          return response.json()

        })

        .then(data => {

          console.log('📥 Conversation creation response data:', data)

          

          if (data.success && data.conversation) {

            console.log('✅ Conversation created successfully:', data.conversation.id)

            console.log('📋 Conversation data:', {

              id: data.conversation.id,

              type: data.conversation.type,

              members: data.conversation.members?.length || 0,

              hasMembers: !!data.conversation.members

            })

            

            // ALWAYS remove conversation from deleted list when user explicitly starts a chat

            // This allows restoring conversations when user explicitly starts a new chat

            // Whether it's a new conversation or existing one, we want to show it

            if (currentUser && currentWorkspace) {

              const deletedKey = `deleted_conversations_${currentUser.id}_${currentWorkspace.id}`

              const deletedConversations = typeof window !== 'undefined'

                ? JSON.parse(localStorage.getItem(deletedKey) || '[]')

                : []

              

              if (deletedConversations.includes(data.conversation.id)) {

                console.log('🔄 Restoring previously deleted conversation:', data.conversation.id)

                const updatedDeleted = deletedConversations.filter((id: string) => id !== data.conversation.id)

                if (typeof window !== 'undefined') {

                  localStorage.setItem(deletedKey, JSON.stringify(updatedDeleted))

                }

              }

            }

            

            // CRITICAL: Add the conversation to the list IMMEDIATELY

            // This ensures it's visible even if the list is still loading

            setConversations(prev => {

              console.log('📋 Current conversations count:', prev.length)

              

              // Check if conversation already exists

              const exists = prev.find(c => c.id === data.conversation.id)

              let updatedList: ConversationWithDetails[]

              

              if (exists) {

                console.log('🔄 Conversation already exists, updating...')

                // Update existing conversation and move to top

                const updated = prev.map(c => 

                  c.id === data.conversation.id ? data.conversation : c

                )

                const selected = updated.find(c => c.id === data.conversation.id)

                const others = updated.filter(c => c.id !== data.conversation.id)

                updatedList = selected ? [selected, ...others] : updated

              } else {

                console.log('➕ Adding new conversation to list (will be at top)')

                // Add new conversation to the top

                updatedList = [data.conversation, ...prev]

              }

              

              // Update cache IMMEDIATELY to persist the change

              if (typeof window !== 'undefined' && currentWorkspace) {

                const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

                const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

                localStorage.setItem(cacheKey, JSON.stringify(updatedList))

                localStorage.setItem(cacheTimestampKey, Date.now().toString())

              }

              

              console.log('✅ Conversation added to list, new count:', updatedList.length)

              return updatedList

            })

            updatePendingConversation(data.conversation)

            

            // CRITICAL: Mark conversations as loaded to prevent list reload from overwriting

            conversationsLoadedRef.current = true

            setIsLoadingConversations(false)

            

            // Ensure conversation has complete data before proceeding

            if (!data.conversation.members || data.conversation.members.length === 0) {

              console.warn('⚠️ Conversation missing members, reloading...')

              // If members are missing, reload the conversation

              setTimeout(() => {

                loadSingleConversation(data.conversation.id, currentWorkspace.id, 0).then(() => {

                  setSelectedConversationId(data.conversation.id)

                  setMessages([])

                  setIsLoadingMessages(true)

                  loadMessages(data.conversation.id)

                })

              }, 100)

              return

            }

            

            // Set selected conversation FIRST (before URL update)

            // This ensures the conversation is selected immediately

            console.log('🎯 Setting selected conversation ID:', data.conversation.id)

            setSelectedConversationId(data.conversation.id)

            setMessages([])

            setIsLoadingMessages(true)

            

            // Update URL with conversation ID.
            // Keep call params when this navigation comes from contacts/workspace call buttons.
            const callType = searchParams.get('callType')
            const shouldAutoCall = searchParams.get('autoCall') === '1'
            const nextUrl =
              shouldAutoCall && (callType === 'voice' || callType === 'video')
                ? `/chat?conversation=${data.conversation.id}&callType=${callType}&autoCall=1`
                : `/chat?conversation=${data.conversation.id}`

            console.log('🔗 Updating URL to:', nextUrl)

            router.replace(nextUrl)

            

            // Mark conversation as processed to prevent duplicate processing

            processedConversationRef.current = data.conversation.id

            

            // Load messages for the new conversation

            console.log('📨 Loading messages for conversation:', data.conversation.id)

            loadMessages(data.conversation.id)

          } else {

            console.error('❌ Failed to create conversation:', data.error || 'Unknown error')

            alert(`Failed to create conversation: ${data.error || 'Unknown error'}`)

          }

        })

        .catch(error => {

          console.error('❌ Failed to create conversation:', error)

          alert(`Failed to create conversation: ${error.message || 'Unknown error'}`)

        })
        .finally(() => {

          // 无论成功或失败，都结束 “根据 userId 创建会话” 的 Loading 状态

          setIsCreatingConversationFromUserId(false)

        })

        return

      }

      

      if (conversationId && currentWorkspace) {

        // We have a conversation ID from external navigation - auto-select it immediately

        console.log('Initial load with conversation ID from external navigation:', conversationId)

        processedConversationRef.current = conversationId

        

        // Select immediately - don't wait for conversation to load

        // This ensures the UI shows the conversation as selected right away

        setSelectedConversationId(conversationId)

        // Clear messages and show loading when switching conversations

        setMessages([])

        setIsLoadingMessages(true)

        

        loadSingleConversation(conversationId, currentWorkspace.id, 0)

        return

      } else {

        if (!conversationsLoadedRef.current) {

          console.log('Initial load without conversation ID - checking for unread messages')

          setMessages([])

        } else {

          console.log('Initial load without conversation ID but data already present, skipping clear')

        }

        if (conversations.length > 0 || conversationsLoadedRef.current) {

          setIsLoadingConversations(false)
          setIsRefreshingConversations(false)

        }

        return

      }

    }

    

    // If this is a manual selection (user clicked a conversation), skip URL processing

    if (isManualSelectionRef.current) {

      isManualSelectionRef.current = false // Reset flag

      return

    }

    

    // Process URL changes from external navigation (e.g., from contacts page)

    // Auto-select the conversation when URL has conversation parameter

    if (conversationId && currentWorkspace) {

      if (processedConversationRef.current !== conversationId) {

        processedConversationRef.current = conversationId

        

        // Select immediately - don't wait for conversation to load

        setSelectedConversationId(conversationId)

        

        loadSingleConversation(conversationId, currentWorkspace.id, 0)

        return

      }

    } else if (!conversationId) {

      // URL has no conversation parameter - clear selection

      processedConversationRef.current = null

      // Don't clear selectedConversationId here - let user manually deselect

    }

  }, [pathname, searchParams, currentWorkspace, loadSingleConversation, router])

  useLayoutEffect(() => {
    if (!selectedConversationId) return

    messagesConversationIdRef.current = selectedConversationId
    const cachedMessages = getValidatedCachedMessages(selectedConversationId)
    if (cachedMessages && cachedMessages.length > 0) {
      // Instant switch: render cached messages first, then silently refresh.
      setMessages(cachedMessages)
      setIsLoadingMessages(false)
      loadMessages(selectedConversationId, { silent: true }).catch((error) => {
        console.error('Failed to refresh cached messages:', error)
      })
      return
    }

    setMessages([])
    setIsLoadingMessages(true)
    loadMessages(selectedConversationId).catch((error) => {
      console.error('Failed to load messages for selected conversation:', error)
    })
  }, [selectedConversationId, loadMessages, getValidatedCachedMessages])

  // 通话挂断后，立刻刷新当前会话的消息列表（显示最新的通话时长等）
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleCallEnded = (event: Event) => {
      try {
        const custom = event as CustomEvent<{ conversationId?: string }>
        const convId = custom.detail?.conversationId
        if (!convId) return
        // 只刷新当前打开的会话，避免多余请求
        if (convId !== selectedConversationId) return
        loadMessages(convId, { silent: true }).catch((err) => {
          console.error('Failed to reload messages after call end:', err)
        })
      } catch (err) {
        console.error('Error handling callEnded event:', err)
      }
    }

    window.addEventListener('callEnded', handleCallEnded as EventListener)
    return () => {
      window.removeEventListener('callEnded', handleCallEnded as EventListener)
    }
  }, [selectedConversationId, loadMessages])

  // Auto-select first conversation with unread messages when conversations are loaded
  // Only auto-select on initial page load (when page first mounts), not when user clicks Messages tab
  const hasAutoSelectedRef = useRef(false)
  const previousPathnameRef = useRef<string | null>(null)
  
  useEffect(() => {
    // Track pathname changes to detect navigation
    previousPathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    // Only auto-select if:
    // 1. No conversation is currently selected
    // 2. Conversations are loaded (not loading)
    // 3. URL doesn't have a conversation parameter
    // 4. We have conversations available
    // 5. Haven't already auto-selected
    // 6. This is the initial load (previousPathnameRef is null, meaning we just mounted)
    const isInitialLoad = previousPathnameRef.current === null
    
    if (
      !selectedConversationId &&
      !isLoadingConversations &&
      conversations.length > 0 &&
      !searchParams.get('conversation') &&
      !hasAutoSelectedRef.current &&
      isInitialLoad
    ) {
      const firstUnread = conversations.find(conv => (conv.unread_count || 0) > 0)
      if (firstUnread) {
        console.log('✅ Auto-selecting first conversation with unread messages on initial load:', firstUnread.id)
        hasAutoSelectedRef.current = true
        setSelectedConversationId(firstUnread.id)
        router.push(`/chat?conversation=${firstUnread.id}`, { scroll: false })
      }
    }
  }, [conversations, isLoadingConversations, selectedConversationId, searchParams, router, pathname])

  // Poll for new messages and update conversation list (less frequently to reduce server load)

  // Use a ref to track the current conversation ID to avoid stale closures

  const pollingConversationRef = useRef<string | undefined>(undefined)

  const lastPollTimeRef = useRef<number>(0)

  const isPollingRef = useRef<boolean>(false)

  

  useEffect(() => {

    pollingConversationRef.current = selectedConversationId

  }, [selectedConversationId])

  

  useEffect(() => {

    if (!currentWorkspace || !currentUser) return

    // Realtime is the primary source of truth, but WebView foreground/background
    // transitions can still miss events. Keep polling enabled for all deployments.
    const POLL_INTERVAL = IS_DOMESTIC_VERSION ? 2000 : 10000

    

    const interval = setInterval(async () => {
      if (typeof document !== 'undefined' && document.hidden) return

      // Prevent concurrent polling

        if (isPollingRef.current) return

      

      // Use ref to get current value, avoiding dependency on selectedConversationId

      const currentConvId = pollingConversationRef.current

      

        const now = Date.now()

        // Keep a small guard against duplicated timers.
        if (now - lastPollTimeRef.current < POLL_INTERVAL) return

        // Skip polling if message was sent recently (within 3 seconds)
        if (now - lastMessageSendTimeRef.current < 3000) return

      

      isPollingRef.current = true

      lastPollTimeRef.current = now

      

      try {

        // Reload messages for current conversation (only if not already loading)
        // IMPORTANT: Use silent mode so we don't反复切 isLoadingMessages，避免右侧一直显示 "Loading messages..."

        if (currentConvId && !loadingMessagesRef.current.has(currentConvId)) {

          loadMessages(currentConvId, { silent: true })

        }

        

        // Always keep conversation polling as a fallback. This repairs missed
        // realtime updates so unread badges and current-thread messages stay fresh.
        if (!isLoadingConversationsListRef.current) {

          try {

            isLoadingConversationsListRef.current = true

            const response = await fetch(`/api/conversations?workspaceId=${currentWorkspace.id}`)

            const data = await response.json()

            // DEBUG: Log API response
            console.log('🔄 [POLL] API response:', {
              success: data.success,
              conversationsCount: data.conversations?.length,
              conversationIds: data.conversations?.map((c: any) => c.id)
            })

            if (data.success && data.conversations) {

              // Filter out deleted conversations

              const deletedKey = `deleted_conversations_${currentUser.id}_${currentWorkspace.id}`

              const deletedConversations = typeof window !== 'undefined'

                ? JSON.parse(localStorage.getItem(deletedKey) || '[]')

                : []

              // DEBUG: Log deleted conversations
              console.log('🗑️ [POLL] Deleted conversations from localStorage:', deletedConversations)


              // Filter and deduplicate conversations (same logic as loadConversations)
              let directAndGroups = (data.conversations || []).filter(

                (c: ConversationWithDetails) =>

                  c &&

                  (c.type === 'direct' || c.type === 'group') &&

                  !deletedConversations.includes(c.id)

              )

              // DEBUG: Log after deleted filter
              console.log('📊 [POLL] After deleted filter:', {
                beforeCount: data.conversations?.length,
                afterCount: directAndGroups.length,
                filteredIds: data.conversations?.filter((c: any) => deletedConversations.includes(c.id)).map((c: any) => c.id)
              })

              // Deduplicate direct conversations by member pair
              const frontendDirectConversationsByPair = new Map<string, ConversationWithDetails[]>()

              const frontendOtherConversations: ConversationWithDetails[] = []

              directAndGroups.forEach((conv: ConversationWithDetails) => {

                if (conv.type === 'direct' && conv.members && conv.members.length === 2) {

                  const memberIds = conv.members.map((m: any) => m.id || m).sort()

                  const pairKey = `${memberIds[0]}-${memberIds[1]}`

                  if (!frontendDirectConversationsByPair.has(pairKey)) {

                    frontendDirectConversationsByPair.set(pairKey, [])

                  }

                  frontendDirectConversationsByPair.get(pairKey)!.push(conv)

                } else {

                  frontendOtherConversations.push(conv)

                }

              })

              // For each pair, keep only one conversation (deterministic)
              const frontendDeduplicatedDirect: ConversationWithDetails[] = []

              frontendDirectConversationsByPair.forEach((duplicates, pairKey) => {

                if (duplicates.length > 1) {

                  // Sort by: 1) last_message_at (most recent first), 2) created_at (oldest first), 3) id (deterministic)
                  duplicates.sort((a: ConversationWithDetails, b: ConversationWithDetails) => {

                    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0

                    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0

                    if (aTime !== bTime) return bTime - aTime

                    const aCreated = new Date(a.created_at || 0).getTime()

                    const bCreated = new Date(b.created_at || 0).getTime()

                    if (aCreated !== bCreated) return aCreated - bCreated

                    return a.id.localeCompare(b.id) // Deterministic by ID

                  })

                  // Keep only the first one (deterministic)
                  frontendDeduplicatedDirect.push(duplicates[0])

                } else {

                  frontendDeduplicatedDirect.push(duplicates[0])

                }

              })

              // Combine deduplicated direct conversations with other conversations
              const finalConversations = dedupeDirectConversations(
                [...frontendDeduplicatedDirect, ...frontendOtherConversations],
                currentUser.id,
              )

              // DEBUG: Log final conversations before ordering
              console.log('📋 [POLL] Final conversations before ordering:', {
                count: finalConversations.length,
                ids: finalConversations.map(c => c.id)
              })

              // 统一走 applyPinnedOrdering，保证轮询刷新时顺序也按同一套规则（置顶 + 时间）
              const ordered = applyPinnedOrdering(finalConversations.map(enrichConversation))

              // DEBUG: Log after ordering
              console.log('📋 [POLL] Ordered conversations:', {
                count: ordered.length,
                ids: ordered.map(c => c.id)
              })

              // Only update if the list actually changed to prevent flickering
              setConversations(prev => {

                const prevIds = new Set(prev.map(c => c.id))

                const newIds = new Set(ordered.map(c => c.id))

                // CRITICAL FIX: Preserve optimistically added conversations
                const optimisticConvs = prev.filter(c => !newIds.has(c.id))

                // DEBUG: Log comparison
                console.log('🔍 [POLL] Comparing conversations:', {
                  prevCount: prev.length,
                  newCount: ordered.length,
                  prevIds: Array.from(prevIds),
                  newIds: Array.from(newIds),
                  removed: Array.from(prevIds).filter(id => !newIds.has(id)),
                  added: Array.from(newIds).filter(id => !prevIds.has(id))
                })

                // CRITICAL: Preserve optimistic unread_count = 0 for currently selected conversation
                // This prevents the red dot from flickering (disappearing → appearing → disappearing)
                const currentConvId = pollingConversationRef.current
                const prevCurrentConv = currentConvId ? prev.find(c => c.id === currentConvId) : null

                // If current conversation was optimistically marked as read (unread_count = 0),
                // preserve that state even if backend still has unread_count > 0
                const orderedWithPreservedRead = ordered.map(conv => {
                  if (currentConvId && conv.id === currentConvId && prevCurrentConv && prevCurrentConv.unread_count === 0) {
                    // Preserve the optimistic read state
                    return { ...conv, unread_count: 0 }
                  }
                  return conv
                })

                // Check if lists are different (account for optimistic convos)
                const totalExpected = newIds.size + optimisticConvs.length
                if (prevIds.size !== totalExpected || 

                    !Array.from(newIds).every(id => prevIds.has(id))) {

                  // Lists are different, update state
                  if (typeof window !== 'undefined') {

                    const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

                    const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

                    localStorage.setItem(cacheKey, JSON.stringify(orderedWithPreservedRead))

                    localStorage.setItem(cacheTimestampKey, Date.now().toString())

                  }

                  return [...optimisticConvs, ...orderedWithPreservedRead]

                }

                // Lists are the same, check if order changed
                const prevOrder = prev.map(c => c.id).join(',')

                const newOrder = orderedWithPreservedRead.map(c => c.id).join(',')

                if (prevOrder !== newOrder) {

                  // Order changed, update state
                  if (typeof window !== 'undefined') {

                    const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

                    const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

                    localStorage.setItem(cacheKey, JSON.stringify(orderedWithPreservedRead))

                    localStorage.setItem(cacheTimestampKey, Date.now().toString())

                  }

                  return [...optimisticConvs, ...orderedWithPreservedRead]

                }

                // Check if unread_count changed (but preserve optimistic read state)
                const hasUnreadCountChange = prev.some(prevConv => {
                  const newConv = orderedWithPreservedRead.find(c => c.id === prevConv.id)
                  if (!newConv) return false
                  // Don't consider it a change if we're preserving the optimistic read state
                  if (currentConvId && prevConv.id === currentConvId && prevConv.unread_count === 0) {
                    return false
                  }
                  return prevConv.unread_count !== newConv.unread_count
                })

                if (hasUnreadCountChange) {
                  // Unread count changed, update state
                  if (typeof window !== 'undefined') {

                    const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

                    const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

                    localStorage.setItem(cacheKey, JSON.stringify(orderedWithPreservedRead))

                    localStorage.setItem(cacheTimestampKey, Date.now().toString())

                  }

                  return [...optimisticConvs, ...orderedWithPreservedRead]

                }

                // No changes, return previous state
                return prev

              })

            }

          } catch (error) {

            console.error('Failed to refresh conversations:', error)

          } finally {

            isLoadingConversationsListRef.current = false

          }

        }

      } finally {

        isPollingRef.current = false

      }

    }, POLL_INTERVAL)

    return () => clearInterval(interval)

  }, [currentUser, currentWorkspace, loadMessages])

  useEffect(() => {
    if (!currentUser || !currentWorkspace) return

    const refreshVisibleChat = () => {
      if (typeof document !== 'undefined' && document.hidden) return

      const currentConversationId = selectedConversationIdRef.current
      if (currentConversationId && !loadingMessagesRef.current.has(currentConversationId)) {
        void loadMessages(currentConversationId, { silent: true })
      }

      void loadConversations(currentUser.id, currentWorkspace.id, true).catch((error) => {
        console.error('Failed to refresh chat state on foreground:', error)
      })
    }

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        refreshVisibleChat()
      }
    }

    window.addEventListener('focus', refreshVisibleChat)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', refreshVisibleChat)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentUser, currentWorkspace, loadConversations, loadMessages])

  // Listen for contact deletion events to refresh conversations
  useEffect(() => {
    if (!currentUser || !currentWorkspace) return

    const handleContactDeleted = async (event: Event) => {
      const customEvent = event as CustomEvent
      console.log('📢 Contact deleted event received, removing conversation immediately...')
      const contactUserId = customEvent.detail?.contactUserId
      const conversationId = customEvent.detail?.conversationId as string | null
      
      // Clear contacts cache when contact is deleted
      if (typeof window !== 'undefined' && currentUser) {
        const contactsCacheKey = `contacts_${currentUser.id}`
        const contactsCacheTsKey = `contacts_timestamp_${currentUser.id}`
        localStorage.removeItem(contactsCacheKey)
        localStorage.removeItem(contactsCacheTsKey)
        console.log('🗑️ Cleared contacts cache due to contact deletion')
      }
      
      // OPTIMISTIC UPDATE: Immediately remove conversation from UI
      if (contactUserId || conversationId) {
        setConversations(prev => {
          const filtered = prev.filter(conv => {
            // Remove by explicit conversation id if provided
            if (conversationId && conv.id === conversationId) {
              return false
            }
            // Fallback: remove direct conversations with that user
            if (contactUserId && conv.type === 'direct' && conv.members && conv.members.length === 2) {
              const memberIds = conv.members.map((m: any) => m.id || m)
              return !memberIds.includes(contactUserId)
            }
            return true
          })

          // If we removed the currently selected conversation, clear selection
          if (conversationId && conversationId === selectedConversationId) {
            setSelectedConversationId(undefined)
          }

          const removedCount = prev.length - filtered.length
          if (removedCount > 0) {
            console.log(`🗑️ Removed ${removedCount} conversation(s) immediately (optimistic update)`, { contactUserId, conversationId })
          }

          // Persist to deleted_conversations list to keep cache consistent
          if (typeof window !== 'undefined') {
            const deletedKey = `deleted_conversations_${currentUser.id}_${currentWorkspace.id}`
            const deletedConversations = JSON.parse(localStorage.getItem(deletedKey) || '[]')
            const idsToAdd: string[] = []
            if (conversationId) idsToAdd.push(conversationId)
            // Also add any direct convs we filtered out for this contact
            prev.forEach(conv => {
              if (conv.type === 'direct' && conv.members && conv.members.length === 2) {
                const memberIds = conv.members.map((m: any) => m.id || m)
                if (contactUserId && memberIds.includes(contactUserId) && !idsToAdd.includes(conv.id)) {
                  idsToAdd.push(conv.id)
                }
              }
            })
            if (idsToAdd.length > 0) {
              const updated = [...new Set([...deletedConversations, ...idsToAdd])]
              localStorage.setItem(deletedKey, JSON.stringify(updated))
              // Store deletion timestamps
              const now = Date.now()
              idsToAdd.forEach(id => {
                const deletionTimestampKey = `deletion_timestamp_${id}_${currentUser.id}_${currentWorkspace.id}`
                localStorage.setItem(deletionTimestampKey, now.toString())
              })
              
              // CRITICAL: Update conversations cache to remove deleted conversations
              const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
              const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`
              const cachedData = localStorage.getItem(cacheKey)
              if (cachedData) {
                try {
                  const cachedConversations = JSON.parse(cachedData)
                  const updatedCache = cachedConversations.filter((conv: ConversationWithDetails) => 
                    !idsToAdd.includes(conv.id)
                  )
                  localStorage.setItem(cacheKey, JSON.stringify(updatedCache))
                  localStorage.setItem(cacheTimestampKey, Date.now().toString())
                  console.log(`✅ Updated conversations cache, removed ${idsToAdd.length} deleted conversation(s)`)
                } catch (e) {
                  console.warn('Failed to update conversations cache:', e)
                }
              }
            }
          }

          return filtered
        })
      }
      
      // Background refresh: Silently refresh conversations to ensure consistency
      // Don't show loading state, just update in background
      loadConversations(currentUser.id, currentWorkspace.id, true).catch(error => {
        console.error('Background refresh failed after contact deletion:', error)
        // Don't show error to user, optimistic update already succeeded
      })
    }

    window.addEventListener('contactDeleted', handleContactDeleted)

    // Keep this as a low-frequency background safety check.
    const contactCheckInterval = setInterval(async () => {
      if (!currentUser || !currentWorkspace) return
      // Avoid chat list jitter right after sending a message.
      if (Date.now() - lastMessageSendTimeRef.current < 8000) return

      try {
        // Fetch current contacts list
        const contactsResponse = await fetch('/api/contacts')
        if (!contactsResponse.ok) return

        const contactsData = await contactsResponse.json()
        if (!contactsData.success || !contactsData.contacts) return

        const currentContactIds = new Set(
          contactsData.contacts.map((c: any) => c.contact_user_id || c.user?.id).filter(Boolean)
        )

        // Check if any conversation's other user is no longer in contacts
        setConversations(prev => {
          const conversationsToRemove: string[] = []
          const updated = prev.filter(conv => {
            if (conv.type === 'direct' && conv.members && conv.members.length === 2) {
              const memberIds = conv.members.map((m: any) => m.id || m).filter(Boolean)
              const otherUserId = memberIds.find((id: string) => id !== currentUser.id)

              // CRITICAL: Allow self-conversations
              if (otherUserId === currentUser.id) {
                return true
              }

              // SLACK MODE: 在 Slack 模式下，工作区成员之间可以互相聊天
              // 不需要是联系人关系，所以不过滤非联系人的会话
              // 之前的逻辑会过滤掉非联系人的会话，这对于工作区成员聊天是不合适的
              // if (otherUserId && !currentContactIds.has(otherUserId)) {
              //   conversationsToRemove.push(conv.id)
              //   console.log(`🗑️ Marking conversation ${conv.id} for removal - user ${otherUserId} not in contacts`)
              //   return false
              // }
            }
            return true
          })

          // No structural change: keep previous reference to avoid re-render flicker.
          if (conversationsToRemove.length === 0) {
            return prev
          }
          
          // If we removed conversations, update deleted_conversations list and cache
          if (conversationsToRemove.length > 0 && typeof window !== 'undefined') {
            const deletedKey = `deleted_conversations_${currentUser.id}_${currentWorkspace.id}`
            const deletedConversations = JSON.parse(localStorage.getItem(deletedKey) || '[]')
            const updatedDeleted = [...new Set([...deletedConversations, ...conversationsToRemove])]
            localStorage.setItem(deletedKey, JSON.stringify(updatedDeleted))
            
            // Store deletion timestamps
            const now = Date.now()
            conversationsToRemove.forEach(id => {
              const deletionTimestampKey = `deletion_timestamp_${id}_${currentUser.id}_${currentWorkspace.id}`
              localStorage.setItem(deletionTimestampKey, now.toString())
            })
            
            // CRITICAL: Update conversations cache to remove deleted conversations
            const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
            const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`
            const cachedData = localStorage.getItem(cacheKey)
            if (cachedData) {
              try {
                const cachedConversations = JSON.parse(cachedData)
                const updatedCache = cachedConversations.filter((conv: ConversationWithDetails) => 
                  !conversationsToRemove.includes(conv.id)
                )
                localStorage.setItem(cacheKey, JSON.stringify(updatedCache))
                localStorage.setItem(cacheTimestampKey, Date.now().toString())
                console.log(`✅ Updated conversations cache, removed ${conversationsToRemove.length} deleted conversation(s)`)
              } catch (e) {
                console.warn('Failed to update conversations cache:', e)
              }
            }
            
            // If currently selected conversation was removed, clear selection
            if (selectedConversationId && conversationsToRemove.includes(selectedConversationId)) {
              setSelectedConversationId(undefined)
              router.push('/chat', { scroll: false })
              console.log('🗑️ Cleared selected conversation - it was deleted')
            }
            
            console.log(`🗑️ Removed ${conversationsToRemove.length} conversation(s) due to contact deletion by other party`, conversationsToRemove)
          }
          
          return updated
        })
      } catch (error) {
        console.error('Error checking contacts for deleted conversations:', error)
      }
    }, 30000)

    return () => {
      window.removeEventListener('contactDeleted', handleContactDeleted as EventListener)
      clearInterval(contactCheckInterval)
    }
  }, [currentUser, currentWorkspace, loadConversations])

  // Listen for conversationsUpdated event to refresh conversation list
  // This is triggered by system assistant messages and other components
  useEffect(() => {
    if (!currentUser || !currentWorkspace) return

    const handleConversationsUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<{ source?: string; at?: number }>
      if (customEvent.detail?.source === CONVERSATIONS_UPDATED_EVENT_SOURCE) {
        return
      }

      const now = Date.now()
      if (now - lastConversationsUpdateEventAtRef.current < 800) {
        return
      }
      lastConversationsUpdateEventAtRef.current = now

      loadConversations(currentUser.id, currentWorkspace.id, true).catch(error => {
        console.error('[ChatContent] Failed to refresh conversations:', error)
      })
    }

    window.addEventListener('conversationsUpdated', handleConversationsUpdated)

    return () => {
      window.removeEventListener('conversationsUpdated', handleConversationsUpdated)
    }
  }, [currentUser, currentWorkspace, loadConversations])

  // Listen for incoming-call popup events from realtime message handler
  useEffect(() => {
    if (!currentUser) return

    const handleShowCallDialog = (event: CustomEvent) => {
      const { messageId, conversationId, callType, callerId, callerName, callSessionId } = event.detail || {}
      if (!messageId || !conversationId) return

      // If another call is active in this tab, reject new invite as busy.
      const activeCall = getCallUiLock()
      const busyByDialogState = showIncomingCallDialog && incomingCallMessageId && incomingCallMessageId !== messageId
      const busyByGlobalLock = isCallUiBusy({ messageId })
      if (busyByDialogState || busyByGlobalLock) {
        void fetch(`/api/messages/${messageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metadata: {
              call_status: 'missed',
              rejected_at: new Date().toISOString(),
              reject_reason: 'busy',
              busy_by_message_id: activeCall?.messageId,
            },
          }),
        }).catch((error) => {
          console.error('[showCallDialog] Failed to auto-reject busy call:', error)
        })
        return
      }

      const conversation = conversations.find(c => c.id === conversationId)

      let recipient: User | null = null
      if (conversation) {
        if (callerId) {
          recipient = conversation.members.find(m => m.id === callerId) || null
        }
        if (!recipient) {
          recipient = conversation.members.find(m => m.id !== currentUser.id) || null
        }
      }
      if (!recipient && callerId) {
        const now = new Date().toISOString()
        const fallbackName = typeof callerName === 'string' && callerName.trim().length > 0
          ? callerName
          : 'User'
        recipient = {
          id: callerId,
          email: '',
          username: fallbackName,
          full_name: fallbackName,
          status: 'online',
          created_at: now,
          updated_at: now,
        }
      }
      if (!recipient || recipient.id === currentUser.id) {
        console.warn('[showCallDialog] Unable to resolve caller info:', {
          conversationId,
          callerId,
          callerName,
          currentUserId: currentUser.id,
        })
        return
      }

      setIncomingCallMessageId(messageId)
      setIncomingCallConversationId(conversationId)
      setIncomingCallRecipient(recipient)
      setIncomingCallType(callType === 'voice' ? 'voice' : 'video')
      setIncomingCallSessionId(typeof callSessionId === 'string' ? callSessionId : null)
      setIncomingCallAutoAnswer(false)
      setShowIncomingCallDialog(true)
    }

    window.addEventListener('showCallDialog', handleShowCallDialog as EventListener)
    return () => {
      window.removeEventListener('showCallDialog', handleShowCallDialog as EventListener)
    }
  }, [currentUser, conversations, showIncomingCallDialog, incomingCallMessageId])

  // Fallback call-invite sync for WebView/mobile-shell scenarios.
  // Realtime is the primary path; this polling path is for missed foreground/background transitions.
  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') return

    let disposed = false

    const checkPendingCallInvite = async (reason: 'initial' | 'interval' | 'focus' | 'pageshow' | 'visible') => {
      if (disposed || pendingCallPollInFlightRef.current) return
      if (reason === 'interval' && typeof document !== 'undefined' && document.hidden) return

      pendingCallPollInFlightRef.current = true
      try {
        const response = await fetch('/api/calls/pending?maxAgeSeconds=120', {
          method: 'GET',
          cache: 'no-store',
        })

        if (!response.ok) {
          // Session may be rotating in background; ignore transient 401/403.
          if (response.status !== 401 && response.status !== 403) {
            console.warn(`[call-pending] check failed (${reason}):`, response.status)
          }
          return
        }

        const data = await response.json() as PendingCallInviteApiResponse
        const invite = data?.invite
        if (!data?.success || !invite?.messageId || !invite?.conversationId) return

        dispatchIncomingCallPrompt({
          messageId: invite.messageId,
          conversationId: invite.conversationId,
          callType: invite.callType,
          callerId: invite.callerId,
          callerName: invite.callerName,
          callSessionId: invite.callSessionId,
        })
      } catch (error) {
        console.error('[call-pending] check failed:', error)
      } finally {
        pendingCallPollInFlightRef.current = false
      }
    }

    const intervalId = window.setInterval(() => {
      void checkPendingCallInvite('interval')
    }, 2000)

    const handleWindowFocus = () => {
      void checkPendingCallInvite('focus')
    }
    const handlePageShow = () => {
      void checkPendingCallInvite('pageshow')
    }
    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        void checkPendingCallInvite('visible')
      }
    }

    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    void checkPendingCallInvite('initial')

    return () => {
      disposed = true
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleWindowFocus)
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentUser?.id, dispatchIncomingCallPrompt])

  // Debug: log when conversation is selected but not found

  // Use a ref to prevent infinite loops

  const checkedConversationRef = useRef<Set<string>>(new Set())

  

  useEffect(() => {

    if (!selectedConversationId || !currentWorkspace) return

    

    // Only check if we haven't already checked this conversation

    if (checkedConversationRef.current.has(selectedConversationId)) {

      return

    }

    

    // Use a timeout to debounce the check and avoid checking on every render

    const timeoutId = setTimeout(() => {

      // Check conversations state inside timeout to avoid dependency

      setConversations(prev => {

        const selectedConversation = prev.find(c => c.id === selectedConversationId)

        if (!selectedConversation) {

          // Check if already loading or pending before adding to checked set

          const requestKey = `${currentWorkspace.id}-${selectedConversationId}`

          const existingPromise = pendingConversationRequestsRef.current.get(requestKey)

          if (existingPromise) {

            console.log('⏭️ Conversation already pending, waiting...', selectedConversationId)

            // Don't call loadSingleConversation, just wait for existing request

            return prev

          } else if (loadingConversationsRef.current.has(selectedConversationId)) {

            console.log('⏭️ Conversation already loading, skipping:', selectedConversationId)

            return prev

          }

          

          checkedConversationRef.current.add(selectedConversationId)

          console.log('📥 Conversation selected but not in list, loading...', {

            selectedConversationId,

            conversationsCount: prev.length

          })

          // Load in background, don't await

          loadSingleConversation(selectedConversationId, currentWorkspace.id, 0).then(() => {

            // Remove from checked set after a delay to allow retry if needed

            setTimeout(() => {

              checkedConversationRef.current.delete(selectedConversationId)

            }, 5000)

          })

        } else {

          // Conversation found, remove from checked set

          checkedConversationRef.current.delete(selectedConversationId)

        }

        return prev // Don't change conversations here

      })

    }, 500) // Debounce by 500ms

    

    return () => clearTimeout(timeoutId)

  }, [selectedConversationId, currentWorkspace, loadSingleConversation])

  // Load available users (contacts) for new conversation dialog

  const loadAvailableUsers = useCallback(async () => {

    if (!currentUser) return

    

    try {

      setIsLoadingUsers(true)

      const response = await fetch('/api/contacts')

      const data = await response.json()

      

      if (data.success && data.contacts) {

        // Transform contacts to User format

        const contactUsers = (data.contacts || [])

          .map((contact: any) => contact.user)

          .filter(Boolean) as User[]

        setAvailableUsers(contactUsers)

      } else {

        console.error('Failed to load contacts:', data.error)

        setAvailableUsers([])

      }

    } catch (error) {

      console.error('Failed to load available users:', error)

      setAvailableUsers([])

    } finally {

      setIsLoadingUsers(false)

    }

  }, [currentUser])

  // Load users when dialog opens

  useEffect(() => {

    if (showNewConversation && currentUser && availableUsers.length === 0 && !isLoadingUsers) {

      loadAvailableUsers()

    }

  }, [showNewConversation, currentUser, availableUsers.length, isLoadingUsers, loadAvailableUsers])

  const handleNewConversation = useCallback(() => {

    setShowNewConversation(true)

  }, [])

  const handleSendMessage = useCallback(async (content: string, type: string = 'text', file?: File, metadata?: any) => {

    if (!selectedConversationId || !currentUser) return

    const normalizedTextContent = normalizePlainTextMessage(content)

    // Allow sending if there's content OR a file

    if (!normalizedTextContent && !file) return

    // Record send time
    lastMessageSendTimeRef.current = Date.now()

    // Check message limit

    if (!limits.canSendMessage) {

      setShowLimitAlert('message')

      return

    }

    let fileForSend = file
    if (
      fileForSend &&
      fileForSend.type.startsWith('image/') &&
      fileForSend.size > IMAGE_AUTO_COMPRESS_THRESHOLD_BYTES
    ) {
      try {
        const compressed = await tryCompressImageForUpload(fileForSend)
        if (compressed.size < fileForSend.size) {
          console.log('[CHAT UPLOAD] Auto-compressed image before upload:', {
            originalSize: fileForSend.size,
            compressedSize: compressed.size,
            originalName: fileForSend.name,
            compressedName: compressed.name,
          })
          fileForSend = compressed
        }
      } catch (compressionError) {
        console.warn('[CHAT UPLOAD] Failed to auto-compress image, fallback to original file:', compressionError)
      }
    }

    // Check file size limit if file is provided
    if (fileForSend && !limits.canUploadFile(fileForSend.size)) {
      setShowLimitAlert('file')
      return
    }

    const hasText = normalizedTextContent.length > 0

    const hasFile = !!fileForSend

    // If both file and text exist, send them separately: file first, then text

    if (hasFile && hasText) {

      // First, send the file message (without text content)

      await handleSendMessage('', type, fileForSend, metadata)

      // Then, send the text message separately

      await handleSendMessage(normalizedTextContent, 'text', undefined, undefined)

      return

    }

    // Optimistic update: create message object inline for maximum speed

    const now = performance.now()

    const tempId = `temp-${now}`

    const timestamp = new Date().toISOString()

    

    const optimisticMessage: MessageWithSender = {

      id: tempId,

      conversation_id: selectedConversationId,

      sender_id: currentUser.id,

      sender: currentUser,

      content: hasFile ? '' : (type === 'code' ? (metadata?.code_content || content) : normalizedTextContent), // For code messages, use code_content from metadata

      type: type as any,

      reactions: [],

      is_edited: false,

      is_deleted: false,

      created_at: timestamp,

      updated_at: timestamp,

      reply_to: replyingToMessageId || undefined,

      metadata: fileForSend ? {
        ...(metadata || {}),

        file_name: fileForSend.name,

        file_size: fileForSend.size,

        mime_type: fileForSend.type,

        file_url: URL.createObjectURL(fileForSend),

        thumbnail_url: fileForSend.type.startsWith('image/') ? URL.createObjectURL(fileForSend) : undefined,

      } : metadata || undefined,

    }

    // Clear reply after sending

    if (replyingToMessageId) {

      setReplyingToMessageId(null)

    }

    // Add to UI immediately (<1ms) - synchronous state update

    setMessages(prev => [...prev, optimisticMessage])

    // OPTIMIZED: Update conversation list immediately (optimistic update)

    // This makes the UI feel instant - no waiting for API response

    setConversations(prev => {

      const updated = prev.map(conv => {

        if (conv.id === selectedConversationId) {

          // Format content for display in conversation list

          let displayContent = normalizedTextContent

          if (hasFile) {

            if (type === 'image') {

              displayContent = '📷 Image'

            } else if (type === 'file') {

              displayContent = '📎 ' + (fileForSend?.name || 'File')

            } else if (type === 'video') {

              displayContent = '🎥 Video'

            } else if (type === 'voice' || type === 'audio') {

              displayContent = '🎙️ Voice'

            } else {

              displayContent = fileForSend?.name || ''

            }

          } else if (type === 'code') {

            displayContent = '💻 Code'

          }

          const optimisticLastMessage: Message = {

            id: tempId,

            conversation_id: conv.id,

            sender_id: currentUser.id,

            content: displayContent,

            type: type as any,

            metadata: optimisticMessage.metadata,

            reactions: [],

            is_edited: false,

            is_deleted: false,

            created_at: timestamp,

            updated_at: timestamp,

          }

          

          return {

            ...conv,

            last_message: optimisticLastMessage,

            last_message_at: timestamp,

          }

        }

        return conv

      }) as ConversationWithDetails[]

      // 统一走 applyPinnedOrdering：排序规则和后台刷新时完全一致，避免“先上去再被别的逻辑拉下来”
      const ordered = applyPinnedOrdering(updated)
      persistConversationsCache(ordered)
      return ordered

    })

    // Save to database

    try {

      // If file exists, upload it first

      let fileMetadata = metadata

      if (fileForSend) {

        try {

          const formData = new FormData()

          formData.append('file', fileForSend)

          formData.append('conversationId', selectedConversationId)

          const uploadResponse = await fetch('/api/messages/upload', {

            method: 'POST',

            body: formData,

          })

          const uploadData = await parseUploadResponse(uploadResponse, language as 'zh' | 'en')

          

          if (!uploadData.success) {

            throw new Error(uploadData.error || 'Failed to upload file')

          }

          // DON'T update optimistic message here - wait for API response

          // This prevents the message from disappearing and reappearing

          // We'll update it once when the API returns the real message

          fileMetadata = {
            ...(metadata || {}),

            file_name: uploadData.file_name,

            file_size: uploadData.file_size,

            mime_type: uploadData.mime_type || uploadData.file_type || fileForSend.type,

            file_url: uploadData.file_url,

            thumbnail_url: fileForSend.type.startsWith('image/') ? uploadData.file_url : undefined,

          }

        } catch (uploadError: any) {

          console.error('Failed to upload file:', uploadError)

          // Remove failed message

          setMessages(prev => prev.filter(msg => msg.id !== tempId))

          // Show error to user

          alert(uploadError?.message || (language === 'zh' ? '上传文件失败' : 'File upload failed'))

          return

        }

      }

      // Use file name as content if no text content provided

      // For code messages, use the code content from metadata if available

      const messageContent = hasFile 

        ? (fileForSend?.name || '') 

        : (type === 'code' && metadata?.code_content 

          ? metadata.code_content 

          : normalizedTextContent)

      

      // For code messages, ensure metadata is passed correctly

      const finalMetadata = type === 'code' && !fileMetadata 

        ? metadata 

        : fileMetadata

      

      console.log('📤 Sending message:', {

        type,

        content: messageContent.substring(0, 50),

        hasMetadata: !!finalMetadata,

        metadataKeys: finalMetadata ? Object.keys(finalMetadata) : [],

        code_content: finalMetadata?.code_content?.substring(0, 50),

        code_language: finalMetadata?.code_language

      })

      

      const response = await fetch('/api/messages', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          conversationId: selectedConversationId,

          content: messageContent,

          type,

          metadata: finalMetadata,

        }),

      })

      

      const data = await response.json()

      

      console.log('📥 API Response:', {

        success: data.success,

        error: data.error,

        messageId: data.message?.id,

        messageType: data.message?.type,

        hasMetadata: !!data.message?.metadata,

        metadataKeys: data.message?.metadata ? Object.keys(data.message.metadata) : [],

        code_content: data.message?.metadata?.code_content?.substring(0, 50),

        code_language: data.message?.metadata?.code_language

      })

      if (data.success) {

        // Replace temp message with real one in ONE operation

        // CRITICAL: Update the message WITHOUT changing its position in the array

        // This prevents React from unmounting and remounting the component

        setMessages(prev => {

          const optimisticMsg = prev.find(msg => msg.id === tempId)

          if (!optimisticMsg) {

            // If optimistic message not found, just add the real one

            return [...prev, {

              ...data.message,

              sender: data.message.sender || currentUser,

            } as MessageWithSender]

          }

          

          const optimisticFileUrl = optimisticMsg.metadata?.file_url

          const optimisticThumbnailUrl = optimisticMsg.metadata?.thumbnail_url

          

          // CRITICAL: Keep blob URL until real URL is confirmed to be loaded

          // This prevents the image from disappearing during the transition

          // For code messages, preserve code metadata from both sources

          const finalMetadata = {

            ...(data.message.metadata || {}),

            // ALWAYS prefer blob URL if it exists, only use real URL if blob URL is not available

            // This ensures the image stays visible throughout the entire process

            file_url: optimisticFileUrl || data.message.metadata?.file_url,

            thumbnail_url: optimisticThumbnailUrl || data.message.metadata?.thumbnail_url,

            // Preserve all file metadata

            file_name: data.message.metadata?.file_name || optimisticMsg.metadata?.file_name,

            file_size: data.message.metadata?.file_size || optimisticMsg.metadata?.file_size,

            mime_type: data.message.metadata?.mime_type || optimisticMsg.metadata?.mime_type || data.message.metadata?.file_type || optimisticMsg.metadata?.file_type,

            // CRITICAL: Preserve code metadata - prefer API response, but fallback to optimistic

            code_content: data.message.metadata?.code_content || optimisticMsg.metadata?.code_content,

            code_language: data.message.metadata?.code_language || optimisticMsg.metadata?.code_language,

            // Store real URL separately for later use

            _real_file_url: data.message.metadata?.file_url,

            _real_thumbnail_url: data.message.metadata?.thumbnail_url,

          }

          

          // Debug: Log code message metadata

          if (type === 'code') {

            console.log('🔍 Code message metadata:', {

              optimistic: optimisticMsg.metadata,

              api: data.message.metadata,

              final: finalMetadata,

              messageType: data.message.type

            })

          }

          

          // Replace the optimistic message with the real one, keeping the same position

          // Use a function to update the URL after the image has loaded

          const updatedMessage = {

            ...data.message,

            metadata: finalMetadata,

            sender: data.message.sender || currentUser,

          } as MessageWithSender

          

          // After a delay, switch from blob URL to real URL

          // This ensures the image is fully loaded before switching

          if (optimisticFileUrl?.startsWith('blob:') && data.message.metadata?.file_url) {

            // 先预加载真实图片，加载成功后再切换，避免闪黑
            // 转换 CloudBase URL 为 cn-download API（如果需要）
            const convertUrlForPreload = (url: string, fileId?: string): string => {
              if (!url) return url
              // blob URL 不需要转换
              if (url.startsWith('blob:')) return url
              // 如果已经是 cn-download API URL，直接返回
              if (url.startsWith('/api/files/cn-download')) return url
              // 优先使用 file_id（永久有效）
              if (fileId && fileId.startsWith('cloud://')) {
                return `/api/files/cn-download?fileId=${encodeURIComponent(fileId)}`
              }
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

            const realFileUrl = data.message.metadata.file_url
            const realThumbUrl = data.message.metadata.thumbnail_url
            const fileId = data.message.metadata?.file_id

            // 转换 URL 用于预加载
            const convertedThumbUrl = convertUrlForPreload(realThumbUrl || realFileUrl, fileId)
            const convertedFileUrl = convertUrlForPreload(realFileUrl, fileId)

            setTimeout(() => {

              const preloadImg = new Image()

              preloadImg.onload = () => {

                setMessages(prevMsgs => prevMsgs.map(msg => {

                  if (msg.id === data.message.id) {

                    return {

                      ...msg,

                      metadata: {

                        ...msg.metadata,

                        // 使用转换后的 URL（确保 CloudBase URL 通过 cn-download API）
                        file_url: convertedFileUrl || msg.metadata?.file_url,

                        thumbnail_url: convertedThumbUrl || msg.metadata?.thumbnail_url,

                        _real_file_url: undefined,

                        _real_thumbnail_url: undefined,

                      }

                    }

                  }

                  return msg

                }))

                

                // 图片切换完成后再回收 blob

                setTimeout(() => {

                  try {

                    URL.revokeObjectURL(optimisticFileUrl)

                    if (optimisticThumbnailUrl && optimisticThumbnailUrl !== optimisticFileUrl) {

                      URL.revokeObjectURL(optimisticThumbnailUrl)

                    }

                  } catch (e) {

                    // Ignore errors

                  }

                }, 1000)

              }

              preloadImg.onerror = () => {

                console.warn('Failed to preload real image, keeping blob preview')

              }

              // 使用转换后的 URL 进行预加载
              preloadImg.src = convertedThumbUrl

            }, 300) // 略微延迟，确保真实 URL 可访问

          }

          

          return prev.map(msg => {

            if (msg.id === tempId) {

              return updatedMessage

            }

            return msg

          })

        })

        

        // Update conversation list with real message data (replace optimistic update)

        setConversations(prev => {

          const updated = prev.map(conv => {

            if (conv.id === selectedConversationId) {

              // Format content for display in conversation list

              let displayContent = data.message.content

              if (data.message.type === 'image') {

                displayContent = '📷 Image'

              } else if (data.message.type === 'file') {

                displayContent = '📎 ' + (data.message.metadata?.file_name || 'File')

              } else if (data.message.type === 'video') {

                displayContent = '🎥 Video'

              } else if (data.message.type === 'voice' || data.message.type === 'audio') {

                displayContent = '🎙️ Voice'

              } else if (data.message.type === 'code') {

                displayContent = '💻 Code'

              }

              const { sender: _sender, ...messageWithoutSender } = data.message

              const normalizedLastMessage: Message = {

                ...messageWithoutSender,

                content: displayContent,

              }

              

              return {

                ...conv,

                last_message: normalizedLastMessage,

                last_message_at: data.message.created_at,

              }

            }

            return conv

          })

          

          // Move conversation to top (both sender and receiver should see update)

          const updatedConv = updated.find(c => c.id === selectedConversationId)

          const finalList = updatedConv 

            ? [updatedConv, ...updated.filter(c => c.id !== selectedConversationId)]

            : updated

          

          // Update cache with real data

          if (typeof window !== 'undefined' && currentWorkspace) {

            const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

            const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

            localStorage.setItem(cacheKey, JSON.stringify(finalList))

            localStorage.setItem(cacheTimestampKey, Date.now().toString())

          }

          

          return finalList

        })

        pendingConversationMapRef.current.delete(selectedConversationId)

        persistPendingConversations()

      } else {

        console.error('Failed to send message:', {
          error: data?.error,
          details: data,
          type,
          conversationId: selectedConversationId,
        })

        // Remove failed message
        setMessages(prev => prev.filter(msg => msg.id !== tempId))

        const errorMsg = data?.error || (language === 'zh' ? '发送失败' : 'Failed to send message')
        alert(errorMsg)

      }

    } catch (error) {

      console.error('Failed to send message:', error)

      // Remove failed message
      setMessages(prev => prev.filter(msg => msg.id !== tempId))

      alert(language === 'zh' ? '发送失败，请稍后重试' : 'Failed to send message. Please try again.')

    }

  }, [selectedConversationId, currentUser, replyingToMessageId])

  const handleEditMessage = useCallback(async (messageId: string, content: string) => {

    try {

      const response = await fetch(`/api/messages/${messageId}`, {

        method: 'PUT',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ content }),

      })

      const data = await response.json()

      if (data.success) {

        setMessages(prev => prev.map(msg => msg.id === messageId ? data.message : msg))

      }

    } catch (error) {

      console.error('Failed to edit message:', error)

    }

  }, [])

  const handleRecallMessage = useCallback(async (messageId: string) => {
    console.log('[RECALL] 开始撤回消息:', messageId)

    try {

      const response = await fetch(`/api/messages/${messageId}`, {

        method: 'PATCH',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ action: 'recall' }),

      })

      const data = await response.json()
      console.log('[RECALL] API 响应:', data)

      if (data.success && data.message) {

        // Update recalled message in list, preserving sender info from original message
        setMessages(prev => {
          console.log('[RECALL] 更新前的消息列表长度:', prev.length)
          const updated = prev.map(msg => {
            if (msg.id === messageId) {
              console.log('[RECALL] 找到要撤回的消息:', messageId)
              // Preserve original sender info to avoid showing incomplete data
              // CRITICAL: Ensure is_recalled is true and reactions are empty to prevent showing reaction UI
              // CRITICAL: Preserve sender_id to maintain correct message position (left/right)
              // Always prioritize original message's sender_id to ensure correct positioning
              const updatedMsg = {
                ...data.message,
                sender_id: msg.sender_id ?? data.message.sender_id ?? (currentUser?.id || ''), // Preserve original sender_id, fallback to currentUser.id
                is_recalled: true, // Force is_recalled to true
                reactions: [], // Force reactions to empty array
                sender: msg.sender || data.message.sender, // Keep original sender if available
              }
              console.log('[RECALL] 更新后的消息:', { id: updatedMsg.id, is_recalled: updatedMsg.is_recalled, content: updatedMsg.content })
              return updatedMsg
            }
            return msg
          })
          console.log('[RECALL] 更新后的消息列表长度:', updated.length)
          return updated
        })

        // 撤回后，本地把当前会话的未读数清零，避免侧边栏还显示红色提醒
        if (selectedConversationId) {
          setConversations(prev => {
            const updated = prev.map(conv =>
              conv.id === selectedConversationId ? { ...conv, unread_count: 0 } : conv
            )
            persistConversationsCache(updated)
            return updated
          })
        }

        // CRITICAL: Don't reload conversations after recall - the UPDATE event listener already handles it
        // Reloading conversations might trigger filtering logic that removes the conversation
        // The UPDATE event listener already updates the last_message to "Message recalled"
        // No need to reload the entire conversation list
        // if (currentUser && currentWorkspace) {
        //   setTimeout(() => {
        //     loadConversations(currentUser.id, currentWorkspace.id, true).catch(err => {
        //       console.error('Error reloading conversations after recall:', err)
        //     })
        //   }, 500) // 延迟500ms，让消息更新先完成
        // }
      } else {
        // Show detailed error information
        const errorMsg = data.error || 'Failed to recall message'
        const debugInfo = data.debug ? `\n\nDebug info:\n${JSON.stringify(data.debug, null, 2)}` : ''
        console.error('Recall failed:', { error: errorMsg, debug: data.debug, fullResponse: data })
        alert(`${errorMsg}${debugInfo}`)
      }
    } catch (error) {
      console.error('Failed to recall message:', error)
      alert('Failed to recall message. Please try again.')
    }
  }, [currentUser, currentWorkspace, selectedConversationId, loadConversations, setConversations, persistConversationsCache])

  const handleForwardMessage = useCallback(async (messageId: string, targetConversationId: string) => {
    const msg = messages.find(m => m.id === messageId)
    if (!msg || !currentUser) return
    try {
      const forwardContent = msg.content
        ? `[转发] ${msg.content}`
        : `[转发] [${msg.type}]`
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: targetConversationId,
          content: forwardContent,
          type: 'text',
          metadata: { forwarded_from: msg.id },
        }),
      })
      const data = await res.json()
      if (data.success || data.message) {
        // Update conversation list to bump the target conversation to top
        setConversations(prev => {
          const updated = prev.map(conv =>
            conv.id === targetConversationId
              ? { ...conv, last_message_at: new Date().toISOString() }
              : conv
          )
          persistConversationsCache(updated)
          return updated
        })
        // Auto-switch to the target conversation so the user sees the message immediately
        setSelectedConversationId(targetConversationId)
      }
    } catch (error) {
      console.error('Failed to forward message:', error)
    }
  }, [messages, currentUser, setConversations, persistConversationsCache, setSelectedConversationId])

  const handleHideMessage = useCallback(async (messageId: string) => {

    if (!currentUser) return

    // 乐观更新：先在当前会话里把这条消息从列表里移除
    setMessages(prev => prev.filter(msg => msg.id !== messageId))

    try {
      const res = await fetch(`/api/messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hide' }),
      })

      const data = await res.json()

      if (!res.ok || !data.success) {
        console.error('Failed to hide message on server:', data.error)
        // 如果后端失败，可以简单地刷新一下当前会话消息，保证前后端一致
        if (selectedConversationId && currentWorkspace) {
          await loadMessages(selectedConversationId, { silent: true })
        }
      }
    } catch (error) {
      console.error('Error hiding message:', error)
      // 网络错误同样尝试刷新当前会话
      if (selectedConversationId && currentWorkspace) {
        await loadMessages(selectedConversationId, { silent: true })
      }
    }

  }, [currentUser, selectedConversationId, currentWorkspace, loadMessages])

  const handleDeleteMessage = useCallback(async (messageId: string) => {

    if (!selectedConversationId || !currentUser || !currentWorkspace) return

    

    try {

      const response = await fetch(`/api/messages/${messageId}`, {

        method: 'DELETE',

      })

      const data = await response.json()

      if (data.success) {

        // Update message in list

        setMessages(prev => prev.map(msg => msg.id === messageId ? data.message : msg))

        

        if (currentUser && currentWorkspace) {

          await loadConversations(currentUser.id, currentWorkspace.id, true)

        }

      }

    } catch (error) {

      console.error('Failed to delete message:', error)

    }

  }, [selectedConversationId, currentUser, currentWorkspace, loadConversations])

  const handleAddReaction = useCallback(async (messageId: string, emoji: string) => {

    if (!currentUser) return

    try {

      const response = await fetch(`/api/messages/${messageId}/reactions`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ emoji }),

      })

      const data = await response.json()

      if (data.success) {

        setMessages(prev => prev.map(msg => msg.id === messageId ? data.message : msg))

      }

    } catch (error) {

      console.error('Failed to add reaction:', error)

    }

  }, [currentUser])

  const handleRemoveReaction = useCallback(async (messageId: string, emoji: string) => {

    if (!currentUser) return

    try {

      const response = await fetch(`/api/messages/${messageId}/reactions?emoji=${encodeURIComponent(emoji)}`, {

        method: 'DELETE',

      })

      const data = await response.json()

      if (data.success) {

        setMessages(prev => prev.map(msg => msg.id === messageId ? data.message : msg))

      }

    } catch (error) {

      console.error('Failed to remove reaction:', error)

    }

  }, [currentUser])

  const handleCreateDirect = useCallback(async (userId: string) => {

    if (!currentUser || !currentWorkspace) return

    // Check if direct conversation already exists

    const existingDirect = conversations.find(

      c => c.type === 'direct' && 

      c.members.some(m => m.id === userId) && 

      c.members.some(m => m.id === currentUser.id) &&

      c.members.length === 2

    )

    if (existingDirect) {

      setSelectedConversationId(existingDirect.id)

      router.push(`/chat?conversation=${existingDirect.id}`)

      updateConversationDetailsCache(existingDirect)

      return

    }

    // Create conversation via API

    try {

      const response = await fetch('/api/conversations', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          type: 'direct',

          member_ids: [userId],

          skip_contact_check: true, // Skip contact check since user selected from contacts list

        }),

      })

      const data = await response.json()

      if (data.success && data.conversation) {

        console.log('✅ Conversation created successfully:', data.conversation.id)

        

        // CRITICAL: Remove conversation from deletedConversations list if it exists

        // This allows restoring conversations when user explicitly starts a new chat

        if (currentUser && currentWorkspace && typeof window !== 'undefined') {

          const deletedKey = `deleted_conversations_${currentUser.id}_${currentWorkspace.id}`

          const deletedConversations = JSON.parse(localStorage.getItem(deletedKey) || '[]')

          

          if (deletedConversations.includes(data.conversation.id)) {

            console.log('🔄 Restoring previously deleted conversation:', data.conversation.id)

            const updatedDeleted = deletedConversations.filter((id: string) => id !== data.conversation.id)

            localStorage.setItem(deletedKey, JSON.stringify(updatedDeleted))

          }

        }

        

        // OPTIMIZED: Add the new conversation to the list and update cache

        // This avoids a full API call when we already have the conversation data

        setConversations(prev => {

          // Check if conversation already exists

          const exists = prev.some(c => c.id === data.conversation.id)

          const updated = exists

            ? prev.map(c => c.id === data.conversation.id ? data.conversation : c)

            : [data.conversation, ...prev]

          

          // Update cache IMMEDIATELY to persist across page refreshes

          // CRITICAL: This ensures the conversation persists even after page refresh

          if (typeof window !== 'undefined' && currentWorkspace) {

            const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

            const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

            localStorage.setItem(cacheKey, JSON.stringify(updated))

            localStorage.setItem(cacheTimestampKey, Date.now().toString())

            console.log('💾 Cache updated with new conversation:', {

              conversationId: data.conversation.id,

              totalConversations: updated.length,

              hasLastMessage: !!data.conversation.last_message

            })

          }

          

          return updated

        })

        updatePendingConversation(data.conversation)

        updateConversationDetailsCache(data.conversation)

        

        // CRITICAL: Force reload conversations from API after creating/restoring

        // This ensures the conversation appears in the list immediately, even if it was previously deleted

        if (currentUser && currentWorkspace) {

          console.log('🔄 Reloading conversations after create/restore...')

          // Reload in background to update the list

          loadConversations(currentUser.id, currentWorkspace.id, true).catch(err => {

            console.error('Error reloading conversations:', err)

          })

        }

        

        // Select the new conversation and update URL

        setSelectedConversationId(data.conversation.id)

        setMessages([])

        setIsLoadingMessages(true)

        router.replace(`/chat?conversation=${data.conversation.id}`)

        

        // Load messages for the new conversation

        loadMessages(data.conversation.id)

      } else {

        console.error('Failed to create conversation:', data.error)

        alert(data.error || 'Failed to create conversation')

      }

    } catch (error) {

      console.error('Failed to create direct conversation:', error)

      alert('Failed to create conversation. Please try again.')

    }

  }, [currentUser, currentWorkspace, conversations, router, loadConversations, updatePendingConversation, updateConversationDetailsCache])

  const handleCreateGroup = useCallback(async (userIds: string[], name: string) => {

    if (!currentUser || !currentWorkspace) return

    try {

      const response = await fetch('/api/conversations', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          type: 'group',

          member_ids: userIds,

        name,

          skip_contact_check: true, // Skip contact check since users selected from contacts list

        }),

      })

      const data = await response.json()

      if (data.success && data.conversation) {

        // CRITICAL: Remove conversation from deletedConversations list if it exists

        // This allows restoring conversations when user explicitly creates a group

        if (currentUser && currentWorkspace && typeof window !== 'undefined') {

          const deletedKey = `deleted_conversations_${currentUser.id}_${currentWorkspace.id}`

          const deletedConversations = JSON.parse(localStorage.getItem(deletedKey) || '[]')

          

          if (deletedConversations.includes(data.conversation.id)) {

            console.log('🔄 Restoring previously deleted group conversation:', data.conversation.id)

            const updatedDeleted = deletedConversations.filter((id: string) => id !== data.conversation.id)

            localStorage.setItem(deletedKey, JSON.stringify(updatedDeleted))

          }

        }

        

        // OPTIMIZED: Don't reload all conversations, just add the new one to the list

        // This avoids a full API call when we already have the conversation data

        setConversations(prev => {

          // Check if conversation already exists

          const exists = prev.some(c => c.id === data.conversation.id)

          if (exists) {

            // Update existing conversation

            return prev.map(c => c.id === data.conversation.id ? data.conversation : c)

          } else {

            // Add new conversation to the front

            return [data.conversation, ...prev]

          }

        })

        updatePendingConversation(data.conversation)

        updateConversationDetailsCache(data.conversation)

        

        // Select the new group and update URL

        setSelectedConversationId(data.conversation.id)

        router.push(`/chat?conversation=${data.conversation.id}`)

      } else {

        alert(data.error || 'Failed to create group')

      }

    } catch (error: any) {

      console.error('Failed to create group:', error)

      alert(error.message || 'Failed to create group')

    }

  }, [currentUser, currentWorkspace, router, updatePendingConversation, updateConversationDetailsCache])

  const handlePinConversation = useCallback(async (id: string) => {

    if (!currentUser || !currentWorkspace) return

    // ---------- 前端乐观更新：点完立刻变成置顶，并更新本地置顶顺序 ----------
    const previousSnapshot = conversationsRef.current

    // 1) 先更新本地 pinned ids（保证 applyPinnedOrdering 读到的是最新置顶顺序）
    const existingIds = readPinnedIds().filter(existingId => existingId !== id)
    writePinnedIds([...existingIds, id])

    // 2) 再更新 UI state（内部会调用 applyPinnedOrdering）
    // 注意：这里需要设置 pinned_at 时间戳，以便排序正确
    const now = new Date().toISOString()
    setConversations(prev => {

      const updated = prev.map(conv =>

        conv.id === id ? { ...conv, is_pinned: true, pinned_at: now } : conv

      )

      const reordered = applyPinnedOrdering(updated)

      persistConversationsCache(reordered)

      return reordered

    })

    // ---------- 后端慢慢同步，失败时回滚 ----------
    try {

      const res = await fetch(`/api/conversations/${id}`, {

        method: 'PATCH',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ action: 'pin' }),

      })

      const data = await res.json()

      if (!res.ok || !data.success) {

        console.error('Failed to pin conversation:', data.error)

        // 回滚到之前的列表
        setConversations(previousSnapshot)

        // 回滚缓存
        persistConversationsCache(previousSnapshot)

        alert(data.error || 'Failed to pin conversation')

        return

      }

      // 后端成功 pin 后，更新 pinned_at 字段（如果后端返回了）
      if (data.state?.pinned_at) {
        setConversations(prev => {
          const updated = prev.map(conv =>
            conv.id === id ? { ...conv, is_pinned: true, pinned_at: data.state.pinned_at } : conv
          )
          const reordered = applyPinnedOrdering(updated)
          persistConversationsCache(reordered)
          return reordered
        })
      }

    } catch (error) {

      console.error('Error pinning conversation:', error)

      // 网络/后端错误，同样回滚
      setConversations(previousSnapshot)

      persistConversationsCache(previousSnapshot)

      alert('Failed to pin conversation')

    }

  }, [currentUser, currentWorkspace, persistConversationsCache, readPinnedIds, writePinnedIds])

  const handleUnpinConversation = useCallback(async (id: string) => {

    if (!currentUser || !currentWorkspace) return

    // ---------- 前端乐观更新：点完立刻取消置顶，并更新本地置顶顺序 ----------
    const previousSnapshot = conversationsRef.current

    // 1) 先从本地置顶顺序里删掉这个 id，保证 applyPinnedOrdering 不会再把它当置顶
    const filteredPinnedIds = readPinnedIds().filter(existingId => existingId !== id)
    writePinnedIds(filteredPinnedIds)

    // 2) 再更新 UI state（内部会调用 applyPinnedOrdering）
    setConversations(prev => {

      const updated = prev.map(conv =>

        conv.id === id ? { ...conv, is_pinned: false } : conv

      )

      const reordered = applyPinnedOrdering(updated)

      persistConversationsCache(reordered)

      return reordered

    })

    // ---------- 后端慢慢同步，失败时回滚 ----------
    try {

      const res = await fetch(`/api/conversations/${id}`, {

        method: 'PATCH',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ action: 'unpin' }),

      })

      const data = await res.json()

      if (!res.ok || !data.success) {

        console.error('Failed to unpin conversation:', data.error)

        // 回滚到之前的列表
        setConversations(previousSnapshot)

        try {

          if (typeof window !== 'undefined') {

            const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

            const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

            localStorage.setItem(cacheKey, JSON.stringify(previousSnapshot))

            localStorage.setItem(cacheTimestampKey, Date.now().toString())

          }

        } catch (e) {

          console.warn('Failed to rollback unpinned conversation cache:', e)

        }

        alert(data.error || 'Failed to unpin conversation')

        return

      }

    } catch (error) {

      console.error('Error unpinning conversation:', error)

      setConversations(previousSnapshot)

      try {

        if (typeof window !== 'undefined') {

          const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

          const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

          localStorage.setItem(cacheKey, JSON.stringify(previousSnapshot))

          localStorage.setItem(cacheTimestampKey, Date.now().toString())

        }

      } catch (e) {

        console.warn('Failed to rollback unpinned conversation cache:', e)

      }

      alert('Failed to unpin conversation')

    }

  }, [currentUser, currentWorkspace, setConversations, readPinnedIds, writePinnedIds])

  const handleHideConversation = useCallback(async (id: string) => {

    if (!currentUser || !currentWorkspace) return

    // ---------- 前端乐观更新：点完立刻从列表移除 ----------
    const previousSnapshot = conversationsRef.current

    setConversations(prev => prev.filter(conv => conv.id !== id))

    if (selectedConversationId === id) {

      setSelectedConversationId(undefined)

      setMessages([])

    }

    // 清除缓存，强制下次从 API 重新加载（确保获取最新的隐藏状态）
    try {

      if (typeof window !== 'undefined') {

        const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

        const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

        // 清除缓存，强制下次从 API 重新加载（确保获取最新的隐藏状态）
        localStorage.removeItem(cacheKey)
        localStorage.removeItem(cacheTimestampKey)

        console.log('✅ Cleared conversations cache after hiding conversation')

      }

    } catch (e) {

      console.warn('Failed to clear hidden conversation cache (optimistic):', e)

    }

    // ---------- 后端慢慢同步，失败时整体回滚 ----------
    try {

      const res = await fetch(`/api/conversations/${id}`, {

        method: 'PATCH',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ action: 'hide' }),

      })

      const data = await res.json()

      if (!res.ok || !data.success) {

        console.error('Failed to hide conversation:', data.error)

        // 回滚 UI
        setConversations(previousSnapshot)

        // 回滚缓存
        try {

          if (typeof window !== 'undefined') {

            const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

            const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

            localStorage.setItem(cacheKey, JSON.stringify(previousSnapshot))

            localStorage.setItem(cacheTimestampKey, Date.now().toString())

          }

        } catch (e) {

          console.warn('Failed to rollback hidden conversation cache:', e)

        }

        alert(data.error || 'Failed to hide conversation')

        return

      }

    } catch (error) {

      console.error('Error hiding conversation:', error)

      // 网络错误也回滚
      setConversations(previousSnapshot)

      try {

        if (typeof window !== 'undefined') {

          const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

          const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

          localStorage.setItem(cacheKey, JSON.stringify(previousSnapshot))

          localStorage.setItem(cacheTimestampKey, Date.now().toString())

        }

      } catch (e) {

        console.warn('Failed to rollback hidden conversation cache:', e)

      }

      alert('Failed to hide conversation')

    }

  }, [currentUser, currentWorkspace, selectedConversationId, setConversations, setMessages])

  const handleDeleteConversation = useCallback(async (id: string) => {

    if (!currentUser || !currentWorkspace) return

    

    console.log('🗑️ Deleting conversation:', id)

    

    try {

      // Call API to soft delete conversation (set deleted_at in database)

      const response = await fetch(`/api/conversations/${id}`, {

        method: 'PATCH',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ action: 'delete' }),

      })

      

      const data = await response.json()

      

      if (data.success) {

        // Remove from current list

        setConversations(prev => prev.filter(c => c.id !== id))

        removeConversationDetails(id)

        

        // Update cache to exclude deleted conversation

        if (typeof window !== 'undefined') {

          const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

          const cachedData = localStorage.getItem(cacheKey)

          if (cachedData) {

            const cachedConversations = JSON.parse(cachedData)

            const filtered = cachedConversations.filter((c: any) => c.id !== id)

            filtered.length

              ? localStorage.setItem(cacheKey, JSON.stringify(filtered))

              : localStorage.removeItem(cacheKey)

            const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

            localStorage.setItem(cacheTimestampKey, Date.now().toString())

          }

        }

        

        // Clear selected conversation if it was deleted

        if (selectedConversationId === id) {

          setSelectedConversationId(undefined)

          setMessages([])

          router.push('/chat')

        }

        

        pendingConversationMapRef.current.delete(id)

        persistPendingConversations()

        

        console.log('✅ Conversation deleted successfully in database')

        

        // CRITICAL: Force reload conversations from API to ensure consistency

        // This ensures the deleted conversation is removed from the list immediately

        if (currentUser && currentWorkspace) {

          console.log('🔄 Reloading conversations after delete...')

          await loadConversations(currentUser.id, currentWorkspace.id, true) // skipCache = true

        }

      } else {

        console.error('❌ Failed to delete conversation:', data.error)

        alert(data.error || 'Failed to delete conversation')

      }

    } catch (error) {

      console.error('❌ Error deleting conversation:', error)

      alert('Failed to delete conversation. Please try again.')

    }

  }, [selectedConversationId, router, currentUser, currentWorkspace, loadConversations, removeConversationDetails])

  const handlePinMessage = useCallback((messageId: string) => {

    // 本地标记消息置顶：仅影响当前会话视图

    setMessages(prev =>

      prev.map(msg =>

        msg.id === messageId ? { ...msg, is_pinned: true } : msg

      )

    )

  }, [])

  const handleReplyMessage = useCallback((messageId: string) => {

    setReplyingToMessageId(messageId)

    // Scroll to message input (optional)

  }, [])

  const handleUnpinMessage = useCallback((messageId: string) => {

    // 本地取消消息置顶

    setMessages(prev =>

      prev.map(msg =>

        msg.id === messageId ? { ...msg, is_pinned: false } : msg

      )

    )

  }, [])

  // If conversation is selected but not in list, try to create a minimal conversation object

  // This allows the chat interface to display even if the conversation isn't fully loaded

  // NOTE: This useEffect must be before the conditional return to maintain Hooks order

  // Use a ref to track if we've already loaded temp conversation to prevent infinite loops

  const tempConversationLoadedRef = useRef<Set<string>>(new Set())

  

  // Use a separate effect to check if conversation exists and load temp conversation if needed

  // This effect only runs when selectedConversationId changes, not when conversations changes

  useEffect(() => {

    if (!selectedConversationId || !currentUser || !currentWorkspace) {

      // Clear temp conversation if no conversation is selected

      setTempConversation(null)

      tempConversationLoadedRef.current = new Set()

      return

    }

    

    // Only load if we haven't already loaded this conversation

    if (tempConversationLoadedRef.current.has(selectedConversationId)) {

      return

    }

    

    // Check if conversation exists in the list using a ref to avoid dependency

    const checkAndLoad = async () => {

      // Use a delay to allow conversations to update first

      await new Promise(resolve => setTimeout(resolve, 200))

      

      // Check current conversations state using a functional update

      let conversationExists = false

      setConversations(prev => {

        conversationExists = prev.some(c => c.id === selectedConversationId)

        return prev // Don't change conversations here

      })

      

      if (conversationExists) {

        // Conversation is now in the list, clear temp conversation and ref

        setTempConversation(null)

        tempConversationLoadedRef.current.delete(selectedConversationId)

        return

      }

      

      // Mark as loading to prevent duplicate loads

      tempConversationLoadedRef.current.add(selectedConversationId)

      

      // Try to load conversation details from conversations API first (to get full member info)

      // This ensures we have complete user information (avatar, name) to avoid "Unknown User"

      try {

        // First, try to get the full conversation from conversations API

        // This will have complete member information with avatars and names

        let convResponse = await fetch(`/api/conversations?workspaceId=${currentWorkspace.id}&conversationId=${selectedConversationId}`)

        

        // If 404, wait a bit and retry (conversation might be just created)

        if (convResponse.status === 404) {

          console.log('Conversation not found in API, waiting for it to be created...')

          await new Promise(resolve => setTimeout(resolve, 800))

          convResponse = await fetch(`/api/conversations?workspaceId=${currentWorkspace.id}&conversationId=${selectedConversationId}`)

        }

        

        if (convResponse.ok) {

          const convData = await convResponse.json()

          if (convData.success && convData.conversation) {

            // Ensure members array has complete user information

            if (convData.conversation.members && convData.conversation.members.length > 0) {

              // Verify all members have full_name (not just id)

              const hasCompleteMembers = convData.conversation.members.every((m: any) => 

                m && (m.full_name || m.username || m.email)

              )

              

              if (hasCompleteMembers) {

                // Use the full conversation data with complete member information

                // This ensures we have proper avatars and names, not "unknown user"

                setTempConversation(convData.conversation)

                return

              }

            }

          }

        }

        

        // If conversations API doesn't work or members are incomplete, 

        // try to get member info from messages (messages should have full sender info)

        const messagesResponse = await fetch(`/api/messages?conversationId=${selectedConversationId}`)

        if (messagesResponse.ok) {

          const messagesData = await messagesResponse.json()

          let otherUser = null

          

          if (messagesData.success && messagesData.messages && messagesData.messages.length > 0) {

            // Get the other user from messages - they should have full user info from getMessages

            // which joins with users table

            const firstMessage = messagesData.messages[0]

            if (firstMessage.sender && firstMessage.sender.id !== currentUser.id) {

              // Verify sender has complete info (full_name, avatar_url, etc.)

              if (firstMessage.sender.full_name || firstMessage.sender.username || firstMessage.sender.email) {

                otherUser = firstMessage.sender

              }

            }

          }

          

          // Only create temp conversation if we have complete user info

          // Otherwise, wait for loadSingleConversation to complete

          if (otherUser && (otherUser.full_name || otherUser.username || otherUser.email)) {

            const temp: ConversationWithDetails = {

              id: selectedConversationId,

              workspace_id: currentWorkspace.id,

              type: 'direct',

              created_by: currentUser.id,

              is_private: true,

              created_at: new Date().toISOString(),

              updated_at: new Date().toISOString(),

              members: [currentUser, otherUser],

              unread_count: 0,

              last_message: messagesData.messages && messagesData.messages.length > 0 

                ? messagesData.messages[messagesData.messages.length - 1] 

                : undefined,

            }

            setTempConversation(temp)

          } else {

            // Don't create temp conversation with incomplete info

            // Let loadSingleConversation handle it

            console.log('Cannot create temp conversation: incomplete user info')

            tempConversationLoadedRef.current.delete(selectedConversationId)

          }

        } else {

          // No messages yet, don't create temp conversation with incomplete info

          // Wait for loadSingleConversation to complete

          console.log('No messages found, waiting for conversation to load...')

          tempConversationLoadedRef.current.delete(selectedConversationId)

        }

      } catch (error) {

        console.error('Failed to load temp conversation:', error)

        tempConversationLoadedRef.current.delete(selectedConversationId)

      }

    }

    

    checkAndLoad()

  }, [selectedConversationId, currentUser, currentWorkspace])

  

  // Separate effect to clear temp conversation when conversation appears in list

  // Only clear if the conversation has complete member information

  // Use a debounced check to avoid flickering

  const clearTempConversationTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  

  useEffect(() => {

    if (!selectedConversationId) return

    

    // Clear any pending timeout

    if (clearTempConversationTimeoutRef.current) {

      clearTimeout(clearTempConversationTimeoutRef.current)

    }

    

    // Debounce the check to avoid flickering

    clearTempConversationTimeoutRef.current = setTimeout(() => {

      const foundConversation = conversations.find(c => c.id === selectedConversationId)

      if (foundConversation && foundConversation.members && foundConversation.members.length > 0) {

        // Verify all members have complete info (not just id)

        const hasCompleteMembers = foundConversation.members.every((m: any) => 

          m && (m.full_name || m.username || m.email)

        )

        if (hasCompleteMembers) {

          // Only clear temp conversation if the real conversation has complete info

          setTempConversation(prev => {

            if (prev && prev.id === selectedConversationId) {

              console.log('Clearing temp conversation, real conversation loaded')

    return null

  }

            return prev

          })

          tempConversationLoadedRef.current.delete(selectedConversationId)

        }

      }

    }, 300) // Debounce by 300ms

    

    return () => {

      if (clearTempConversationTimeoutRef.current) {

        clearTimeout(clearTempConversationTimeoutRef.current)

      }

    }

  }, [selectedConversationId, conversations.length]) // Only depend on length to reduce updates

  useEffect(() => {
    const conversationId = selectedConversationId
    const requestToken = ++conversationMetaTokenRef.current

    if (!conversationId) {
      conversationMetaLoadRequestedRef.current = null
      setConversationMetaState('idle')
      return
    }

    const fromList = conversations.find(c => c.id === conversationId)
    const fromTemp = tempConversation?.id === conversationId ? tempConversation : null
    const targetConversation = fromList || fromTemp

    if (targetConversation && isConversationMetaReady(targetConversation)) {
      conversationMetaLoadRequestedRef.current = null
      setConversationMetaState('ready')
      return
    }

    setConversationMetaState('loading')

    if (!currentWorkspace?.id) {
      return
    }

    if (conversationMetaLoadRequestedRef.current === conversationId) {
      return
    }

    conversationMetaLoadRequestedRef.current = conversationId

    loadSingleConversation(conversationId, currentWorkspace.id, 0)
      .then(() => {
        if (conversationMetaTokenRef.current !== requestToken) return
        if (selectedConversationIdRef.current !== conversationId) return

        const latestConversation = conversationsRef.current.find(c => c.id === conversationId)
        if (isConversationMetaReady(latestConversation || null)) {
          conversationMetaLoadRequestedRef.current = null
          setConversationMetaState('ready')
          return
        }

        setConversationMetaState('failed')
      })
      .catch((error) => {
        console.error('Failed to sync conversation meta:', error)
        if (conversationMetaTokenRef.current !== requestToken) return
        if (selectedConversationIdRef.current !== conversationId) return
        setConversationMetaState('failed')
      })
  }, [
    selectedConversationId,
    conversations,
    tempConversation,
    currentWorkspace?.id,
    loadSingleConversation,
    isConversationMetaReady,
  ])

  const handleRetryConversationMeta = useCallback(() => {
    const conversationId = selectedConversationIdRef.current
    const workspaceId = currentWorkspaceRef.current?.id
    if (!conversationId || !workspaceId) return

    conversationMetaLoadRequestedRef.current = null
    const requestToken = ++conversationMetaTokenRef.current
    setConversationMetaState('loading')

    loadSingleConversation(conversationId, workspaceId, 0)
      .then(() => {
        if (conversationMetaTokenRef.current !== requestToken) return
        if (selectedConversationIdRef.current !== conversationId) return

        const latestConversation = conversationsRef.current.find(c => c.id === conversationId)
        if (isConversationMetaReady(latestConversation || null)) {
          conversationMetaLoadRequestedRef.current = null
          setConversationMetaState('ready')
          return
        }
        setConversationMetaState('failed')
      })
      .catch((error) => {
        console.error('Failed to retry conversation meta sync:', error)
        if (conversationMetaTokenRef.current !== requestToken) return
        if (selectedConversationIdRef.current !== conversationId) return
        setConversationMetaState('failed')
      })
  }, [loadSingleConversation, isConversationMetaReady])

  // Real-time message subscription to update conversation list

  useEffect(() => {

    if (!currentUser || !currentWorkspace) return

    console.log('🔔 Setting up realtime subscription for messages...')

    let supabase
    try {
      supabase = createClient()
    } catch (error: any) {
      console.error('❌ Failed to create Supabase client for realtime subscription:', error)
      // Don't throw - just log the error and return early
      // This prevents the app from crashing if Supabase is misconfigured
      return () => {
        // Return empty cleanup function
      }
    }

    

    // Subscribe to all new messages (we'll filter by conversation membership in the callback)
    let channel
    try {
      channel = supabase
        .channel(`messages-${currentUser.id}`)
        .on(

        'postgres_changes',

        {

          event: 'INSERT',

          schema: 'public',

          table: 'messages',

        },

        async (payload) => {

          const newMessage = payload.new as any

          // Skip welcome messages sent during contact acceptance to avoid double counting
          // These messages are already handled by the contact acceptance flow
          if (newMessage.content === 'We are now friends.' || 
              (newMessage.metadata && newMessage.metadata.is_welcome_message)) {
            console.log('⏭️ Skipping welcome message in realtime (already handled by contact acceptance):', newMessage.id)
            return
          }

          console.log('📨 New message received via realtime:', {

            messageId: newMessage.id,

            conversationId: newMessage.conversation_id,

            senderId: newMessage.sender_id,

            currentUserId: currentUser.id,

            isFromCurrentUser: newMessage.sender_id === currentUser.id

          })

          

          // Find the conversation this message belongs to

          const conversationId = newMessage.conversation_id

          // Speed path: trigger incoming-call popup immediately from realtime payload.
          // Do this before any membership/loading checks so receiver gets a near-instant dialog.
          const inviteMetadata = (() => {
            if (!newMessage?.metadata) return {}
            if (typeof newMessage.metadata === 'object') return newMessage.metadata
            if (typeof newMessage.metadata === 'string') {
              try {
                const parsed = JSON.parse(newMessage.metadata)
                return typeof parsed === 'object' && parsed ? parsed : {}
              } catch {
                return {}
              }
            }
            return {}
          })()
          const incomingCallType =
            inviteMetadata.call_type === 'voice'
              ? 'voice'
              : inviteMetadata.call_type === 'video'
                ? 'video'
                : null
          const isIncomingCallInvite =
            newMessage.type === 'system' &&
            !!incomingCallType &&
            inviteMetadata.call_status === 'calling' &&
            newMessage.sender_id !== currentUser.id
          if (isIncomingCallInvite) {
            dispatchIncomingCallPrompt({
              messageId: String(newMessage.id || ''),
              conversationId,
              callType: incomingCallType,
              callerId: inviteMetadata.caller_id,
              callerName: inviteMetadata.caller_name,
              callSessionId: inviteMetadata.call_session_id,
            })
          }

          // Ignore self-sent realtime messages (UI already has optimistic updates).
          if (newMessage.sender_id === currentUser.id) {
            console.log('⏭️ Skipping realtime update for self-sent message to avoid duplicates')
            return
          }

          

          // CRITICAL: First check if user is a member of this conversation

          const { data: membership } = await supabase

            .from('conversation_members')

            .select('conversation_id')

            .eq('conversation_id', conversationId)

            .eq('user_id', currentUser.id)

            .is('deleted_at', null)

            .maybeSingle()

          

          if (!membership) {

            console.log('⚠️ User is not a member of this conversation, ignoring message')

            return

          }

          

          // Check if conversation is in the list

          setConversations(prev => {

            const conversation = prev.find(c => c.id === conversationId)
            
            // Show browser notification for new message (if not in current conversation)
            if (conversation && selectedConversationIdRef.current !== conversationId) {
              // Import and call notification function asynchronously to avoid blocking
              import('@/lib/notifications').then(({ notifyNewMessage }) => {
                notifyNewMessage(
                  {
                    id: newMessage.id,
                    content: newMessage.content,
                    type: newMessage.type,
                    sender_id: newMessage.sender_id,
                    metadata: newMessage.metadata,
                  },
                  {
                    id: conversation.id,
                    name: conversation.name,
                    type: conversation.type,
                    members: conversation.members,
                  },
                  currentUser.id,
                  selectedConversationIdRef.current,
                  currentUser
                ).catch(error => {
                  console.error('Error showing notification:', error)
                })
              })
            }

            

            if (!conversation) {

              // Conversation not in list - load it

              console.log('⚠️ Conversation not found in list, loading...')

              loadSingleConversationRef.current(conversationId, currentWorkspace.id, 0)

              return prev

            }

            

            // Format message content for display

            let displayContent = newMessage.content

            if (newMessage.type === 'image') {

              displayContent = '📷 Image'

            } else if (newMessage.type === 'file') {

              displayContent = '📎 ' + (newMessage.metadata?.file_name || 'File')

            } else if (newMessage.type === 'video') {

              displayContent = '🎥 Video'

            } else if (newMessage.type === 'voice' || newMessage.type === 'audio') {

              displayContent = '🎙️ Voice'

            } else if (newMessage.type === 'code') {

              displayContent = '💻 Code'

            } else if (newMessage.type === 'system' && newMessage.metadata?.call_type) {

              displayContent = newMessage.metadata.call_type === 'video' ? '📹 Video Call' : '📞 Voice Call'
            }


            // Note: We removed the deduplication check here because it was too aggressive
            // The realtime subscription should process all messages normally
            // Only welcome messages are skipped above to avoid double counting

            const lastMessage: Message = {

              id: newMessage.id,

              conversation_id: conversationId,

              sender_id: newMessage.sender_id,

              content: displayContent,

              type: newMessage.type,

              metadata: newMessage.metadata,

              reactions: newMessage.reactions || [],

              is_edited: newMessage.is_edited || false,

              is_deleted: newMessage.is_deleted || false,

              created_at: newMessage.created_at,

              updated_at: newMessage.updated_at,

            }

            

            // Update the conversation.
            // Preserve unread_count = 0 for the currently selected conversation.
            const updated = prev.map(conv => {

              if (conv.id === conversationId) {
                const isSelectedConversation = selectedConversationIdRef.current === conversationId
                
                if (isSelectedConversation) {
                  console.log('🔒 Keeping selected conversation unread_count at 0 (realtime message):', conversationId)
                  return {
                    ...conv,
                    last_message: lastMessage,
                    last_message_at: newMessage.created_at,
                    unread_count: 0,
                  }
                }
                
                // If this is the currently selected conversation, keep unread_count at 0
                // (user is viewing it, so it's already "read")
                const isCurrentConversation = selectedConversationIdRef.current === conversationId
                
                // Get current unread_count, but don't increment if already processed
                const currentUnreadCount = conv.unread_count || 0
                const newUnreadCount = isCurrentConversation 
                  ? 0 
                  : currentUnreadCount + 1
                
                return {

                  ...conv,

                  last_message: lastMessage,

                  last_message_at: newMessage.created_at,
                  
                  // If this is the current conversation, keep unread_count at 0
                  // Otherwise, increase unread_count by 1
                  unread_count: newUnreadCount,

                }

              }

              return conv

            })

            

            // Move updated conversation to top

            const updatedConv = updated.find(c => c.id === conversationId)

            if (updatedConv) {

              const finalList = [updatedConv, ...updated.filter(c => c.id !== conversationId)]

              

              console.log('✅ Updated conversation list with new message:', {

                conversationId,

                messageContent: displayContent,

                newPosition: 'top'

              })

              

              // Update cache

              if (typeof window !== 'undefined') {

                const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

                const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

                localStorage.setItem(cacheKey, JSON.stringify(finalList))

                localStorage.setItem(cacheTimestampKey, Date.now().toString())

              }

              

              return finalList

            }

            

            return updated

          })

          

          // If this is the currently selected conversation, also update messages
          // CRITICAL: If user is viewing this conversation, immediately mark it as read
          // This ensures that messages received while viewing don't count as unread later
          if (selectedConversationIdRef.current === conversationId) {

            setMessages(prev => {

              // Check if message already exists (avoid duplicates)

              if (prev.some(msg => msg.id === newMessage.id)) {

                console.log('⚠️ Message already in list, skipping duplicate')

                return prev

              }

              

              // Get sender info

              const conversation = conversations.find(c => c.id === conversationId)

              const sender = conversation?.members?.find((m: any) => m.id === newMessage.sender_id) || {

                id: newMessage.sender_id

              }

              

              console.log('✅ Adding new message to current conversation')

              return [...prev, {

                ...newMessage,

                sender: sender,

                reactions: newMessage.reactions || [],

              } as MessageWithSender]

            })

            // Immediately mark conversation as read when receiving message in open chat
            // This prevents these messages from being counted as unread when user switches away
            fetch(`/api/conversations/${conversationId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'read' }),
            }).then(() => {
              // Update cache immediately to reflect read state
              if (typeof window !== 'undefined') {
                const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
                const cachedData = localStorage.getItem(cacheKey)
                if (cachedData) {
                  try {
                    const cachedConversations = JSON.parse(cachedData)
                    const updated = cachedConversations.map((conv: any) => {
                      if (conv.id === conversationId) {
                        return { ...conv, unread_count: 0 }
                      }
                      return conv
                    })
                    localStorage.setItem(cacheKey, JSON.stringify(updated))
                    emitConversationsUpdated()
                  } catch (e) {
                    console.warn('Failed to update cache after marking as read:', e)
                  }
                }
              }
            }).catch(error => {
              console.error('Failed to mark conversation as read after receiving message:', error)
            })
          }

        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const updatedMessage = payload.new as any
          const oldMessage = payload.old as any

          const normalizeMetadata = (value: any): Record<string, any> => {
            if (!value) return {}
            if (typeof value === 'object') return value
            if (typeof value === 'string') {
              try {
                return JSON.parse(value)
              } catch {
                return {}
              }
            }
            return {}
          }

          const newMetadata = normalizeMetadata(updatedMessage?.metadata)
          const oldMetadata = normalizeMetadata(oldMessage?.metadata)
          const callType = newMetadata.call_type || oldMetadata.call_type
          const oldCallStatus = oldMetadata.call_status
          const newCallStatus = newMetadata.call_status
          const isCallStatusChanged =
            updatedMessage?.type === 'system' &&
            !!callType &&
            !!newCallStatus &&
            oldCallStatus !== newCallStatus

          if (isCallStatusChanged && typeof window !== 'undefined') {
            const rejectReason = newMetadata.reject_reason || oldMetadata.reject_reason || ''
            const signalDetail = {
              messageId: String(updatedMessage.id || ''),
              conversationId: String(updatedMessage.conversation_id || ''),
              callType: callType === 'voice' ? 'voice' : 'video',
              callStatus: String(newCallStatus),
              previousStatus: String(oldCallStatus || ''),
              channelName: newMetadata.channel_name || oldMetadata.channel_name,
              callerId: newMetadata.caller_id || oldMetadata.caller_id,
              callerName: newMetadata.caller_name || oldMetadata.caller_name,
              callSessionId: newMetadata.call_session_id || oldMetadata.call_session_id,
              answeredAt: newMetadata.answered_at || oldMetadata.answered_at,
              answered_at: newMetadata.answered_at || oldMetadata.answered_at,
              rejectReason,
              reject_reason: rejectReason,
            }

            window.dispatchEvent(new CustomEvent('callSignal', { detail: signalDetail }))
            if (newCallStatus === 'answered') {
              window.dispatchEvent(new CustomEvent('callAnswered', {
                detail: {
                  messageId: signalDetail.messageId,
                  conversationId: signalDetail.conversationId,
                  callSessionId: signalDetail.callSessionId,
                  answeredAt: signalDetail.answeredAt,
                  answered_at: signalDetail.answered_at,
                },
              }))
            }
          }
          
          // Only process if message was just recalled or deleted (check if status actually changed)
          const wasJustRecalled = !oldMessage?.is_recalled && updatedMessage.is_recalled
          const wasJustDeleted = !oldMessage?.is_deleted && updatedMessage.is_deleted
          
          if (!wasJustRecalled && !wasJustDeleted) {
            // Status didn't change, skip
            return
          }
          
          console.log('📨 Message updated (recalled/deleted) via realtime:', {
            messageId: updatedMessage.id,
            conversationId: updatedMessage.conversation_id,
            is_recalled: updatedMessage.is_recalled,
            is_deleted: updatedMessage.is_deleted,
            wasJustRecalled,
            wasJustDeleted,
          })
          
          const conversationId = updatedMessage.conversation_id
          
          // Check if user is a member of this conversation
          // CRITICAL: For self-conversations, membership check might fail, but we should still process the update
          const { data: membership } = await supabase
            .from('conversation_members')
            .select('conversation_id')
            .eq('conversation_id', conversationId)
            .eq('user_id', currentUser.id)
            .is('deleted_at', null)
            .maybeSingle()
          
          // CRITICAL: Don't skip if membership check fails - might be a self-conversation
          // Instead, check if conversation exists in the current list
          // If it exists in the list, we should process the update even if membership check failed
          if (!membership) {
            // Check if conversation exists in current list (might be a self-conversation)
            const existsInList = conversationsRef.current?.some(c => c.id === conversationId)
            if (!existsInList) {
              console.log('⚠️ User is not a member of this conversation and conversation not in list, ignoring message update')
              return
            } else {
              console.log('⚠️ Membership check failed but conversation exists in list (might be self-conversation), proceeding with update')
            }
          }
          
          // Find the conversation and check if updated message is the last message
          setConversations(prev => {
            // CRITICAL: Don't process if conversations list is empty (might be initial load)
            if (!prev || prev.length === 0) {
              console.log('⚠️ Conversations list is empty, skipping message update')
              return prev
            }
            
            const conversation = prev.find(c => c.id === conversationId)
            if (!conversation) {
              console.log('⚠️ Conversation not found in list for message update:', conversationId)
              return prev
            }
            
            // If the updated message is the last message, we need to update the last_message display
            const isLastMessage = conversation.last_message?.id === updatedMessage.id
            
            if (isLastMessage) {
              // CRITICAL: Always keep the conversation, just update last_message to show "Message recalled"
              // Don't fetch new messages here - that's too complex and error-prone
              // Just update the last_message to show "Message recalled" and keep the conversation
              const updated = prev.map(conv => {
                if (conv.id === conversationId) {
                  return {
                    ...conv,
                      last_message: {
                        ...(conv.last_message || {}),
                        id: updatedMessage.id,
                        conversation_id: updatedMessage.conversation_id || conv.id,
                        sender_id: updatedMessage.sender_id || conv.last_message?.sender_id || currentUser.id,
                        content: getTranslation(language, 'messageRecalled'),
                        type: updatedMessage.type || conv.last_message?.type || 'text',
                        reactions: updatedMessage.reactions || conv.last_message?.reactions || [],
                        is_edited: updatedMessage.is_edited ?? conv.last_message?.is_edited ?? false,
                        is_deleted: updatedMessage.is_deleted ?? conv.last_message?.is_deleted ?? false,
                        created_at: updatedMessage.created_at || conv.last_message?.created_at || conv.created_at,
                        updated_at: updatedMessage.updated_at || conv.last_message?.updated_at || conv.updated_at || conv.created_at,
                      } as Message,
                    // Keep last_message_at unchanged to maintain conversation order
                    last_message_at: conv.last_message_at || updatedMessage.created_at || conv.created_at,
                  }
                }
                return conv
              })
              
              // Update cache
              if (typeof window !== 'undefined') {
                const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`
                localStorage.setItem(cacheKey, JSON.stringify(updated))
                localStorage.setItem(`conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`, Date.now().toString())
              }
              
              return updated
            }
            
            // Also update the message in the current conversation if it's open
            if (selectedConversationIdRef.current === conversationId) {
              setMessages(prev => prev.map(msg => {
                if (msg.id === updatedMessage.id) {
                  return {
                    ...msg,
                    is_recalled: updatedMessage.is_recalled || false,
                    is_deleted: updatedMessage.is_deleted || false,
                    content: updatedMessage.is_recalled ? getTranslation(language, 'messageRecalled') : updatedMessage.content,
                  }
                }
                return msg
              }))
            }
            
            return prev
          })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to messages')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('⚠️ Realtime subscription status:', status)
        } else if (status === 'CLOSED') {
          // CLOSED is a normal state when component unmounts or channel is cleaned up
          // This happens when:
          // 1. Component unmounts and cleanup function calls removeChannel()
          // 2. User navigates away from the page
          // 3. Network connection is lost and Supabase automatically closes the channel
          // Don't log as error, just as info - this is expected behavior
          console.log('🔕 Realtime subscription closed (normal cleanup)')
          // Note: The subscription will be automatically recreated if component remounts
          // No action needed here - the cleanup is handled by the useEffect cleanup function
        } else {
          console.log('🔔 Realtime subscription status:', status)
        }
      })
    } catch (error: any) {
      console.error('❌ Failed to set up realtime subscription:', error)
      // Don't throw - just log the error
      // The app can continue to work without realtime updates
      return () => {
        // Return empty cleanup function
      }
    }

    return () => {
      console.log('🔕 Cleaning up realtime subscription')
      try {
        if (channel) {
          supabase.removeChannel(channel)
        }
      } catch (error: any) {
        console.error('❌ Error removing channel:', error)
      }
    }

  }, [currentUser, currentWorkspace, dispatchIncomingCallPrompt, emitConversationsUpdated, loadSingleConversationRef])

  // Update user status to offline when page closes/unloads
  useEffect(() => {
    if (!currentUser) return

    const updateStatusToOffline = async () => {
      try {
        const response = await fetch('/api/users/status', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'offline' }),
          // Use keepalive to ensure request completes even if page is closing
          keepalive: true,
        })
        if (response.ok) {
          console.log('✅ Updated user status to offline on page unload')
        }
      } catch (error) {
        console.error('Failed to update user status to offline on page unload:', error)
      }
    }

    // Handle page unload/close
    const handleBeforeUnload = () => {
      // Use sendBeacon for more reliable delivery during page unload
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify({ status: 'offline' })], { type: 'application/json' })
        navigator.sendBeacon('/api/users/status', blob)
      } else {
        updateStatusToOffline()
      }
    }

    // Handle visibility change (tab switch, minimize, etc.)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // When tab becomes hidden, update status to away (optional)
        // Or keep online if you want to only update on actual close
        // For now, we'll only update on actual unload
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentUser])

  // Real-time subscription to user status changes
  useEffect(() => {
    if (!currentUser || !currentWorkspace) return

    let supabase: ReturnType<typeof createClient> | null = null
    try {
      supabase = createClient()
    } catch (e) {
      // CloudBase region, skip real-time subscription
      return
    }

    console.log('👥 Setting up real-time user status subscription')

    // Subscribe to changes in users table for status updates
    // Listen to all user status updates (we'll filter in the handler)
    const channel = supabase
      .channel(`user-status-${currentUser.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
        },
        (payload) => {
          const updatedUser = payload.new as any
          const oldUser = payload.old as any
          
          // Only process if status actually changed
          if (oldUser?.status === updatedUser.status) {
            return
          }

          console.log('👥 User status updated:', {
            userId: updatedUser.id,
            oldStatus: oldUser?.status,
            newStatus: updatedUser.status,
          })

          // Update the user's status in conversations
          setConversations(prev => {
            let hasUpdate = false
            const updated = prev.map(conv => {
              // Check if this user is a member of this conversation
              const isMember = conv.members?.some((member: any) => member.id === updatedUser.id)
              if (!isMember) {
                return conv
              }

              hasUpdate = true
              // Update member status in the conversation
              const updatedMembers = conv.members?.map((member: any) => {
                if (member.id === updatedUser.id) {
                  return { ...member, status: updatedUser.status }
                }
                return member
              })
              return { ...conv, members: updatedMembers }
            })
            
            if (hasUpdate) {
              console.log('✅ Updated user status in conversations:', updatedUser.id, updatedUser.status)
            }
            return updated
          })
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to user status changes')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('⚠️ User status subscription status:', status)
        } else if (status === 'CLOSED') {
          console.log('🔕 User status subscription closed (normal cleanup)')
        } else {
          console.log('🔔 User status subscription status:', status)
        }
      })

    return () => {
      console.log('🔕 Cleaning up user status subscription')
      if (channel && supabase) {
        supabase.removeChannel(channel)
      }
    }
  }, [currentUser, currentWorkspace])

  // Find selected conversation, or create a temporary one if it's not in the list yet

  const selectedConversation = conversations.find(c => c.id === selectedConversationId)

  const handleWorkspaceChange = useCallback((nextWorkspace: Workspace) => {
    if (!currentUser) return
    if (nextWorkspace.id === currentWorkspace?.id) return

    setCurrentWorkspace(nextWorkspace)
    currentWorkspaceRef.current = nextWorkspace

    // Reset chat detail state to avoid leaking previous workspace context.
    setSelectedConversationId(undefined)
    selectedConversationIdRef.current = undefined
    setMessages([])
    messagesConversationIdRef.current = undefined
    setTempConversation(null)
    setConversationMetaState('idle')
    setGroupInfoOpen(false)
    setAnnouncementDrawerOpen(false)
    messagesByConversationRef.current.clear()
    conversationDetailsRef.current.clear()
    pendingConversationMapRef.current.clear()
    loadingConversationsRef.current.clear()
    loadingMessagesRef.current.clear()
    pendingRequestsRef.current.clear()
    pendingConversationRequestsRef.current.clear()
    pendingConversationsListRef.current = null
    isLoadingConversationsListRef.current = false
    setConversations([])
    conversationsRef.current = []
    setIsLoadingConversations(true)
    setIsRefreshingConversations(false)

    const params = new URLSearchParams(searchParams.toString())
    params.delete('conversation')
    params.delete('userId')
    params.delete('callType')
    params.delete('autoCall')
    const query = params.toString()
    router.replace(query ? `/chat?${query}` : '/chat', { scroll: false })

    loadConversations(currentUser.id, nextWorkspace.id, true).catch((error) => {
      console.error('Failed to reload conversations after workspace switch:', error)
      setIsLoadingConversations(false)
    })
  }, [currentUser, currentWorkspace?.id, loadConversations, router, searchParams])
  const closeActiveChannel = useCallback(() => {
    setActiveChannel('none')
    if (isMobile && !selectedConversationId) {
      setMobileView('list')
    }
  }, [isMobile, selectedConversationId])

  if (!currentUser || !currentWorkspace) {

    return (
      <div className="flex h-screen mobile-app-shell items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )

  }

  

  // Use temp conversation only if it matches current selected id, avoid stale cross-conversation display.
  const displayConversation =
    selectedConversation ||
    (tempConversation?.id === selectedConversationId ? tempConversation : null)

  // Check if this is a system assistant conversation (用户不能回复系统通知)
  const isSystemAssistantConversation = (() => {
    if (!displayConversation || displayConversation.type !== 'direct') return false
    return displayConversation.members?.some(
      (m: any) => isSystemAssistantUserId((m.id || m.user_id || m) as string)
    ) || false
  })()


  // If conversation is selected but not in list, we still want to show the chat interface

  // The conversation will be loaded shortly

  const showChatInterface = selectedConversationId !== undefined && displayConversation !== null
  const isGroupConversationForMeta = isGroupConversationType(displayConversation)
  const shouldShowGroupMetaSkeleton =
    isGroupConversationForMeta && conversationMetaState === 'loading'
  const shouldShowGroupMetaFailed =
    isGroupConversationForMeta && conversationMetaState === 'failed'
  const shouldGateGroupMeta = shouldShowGroupMetaSkeleton || shouldShowGroupMetaFailed
  const isMobileDetailView = isMobile && mobileView === 'detail'
  const showTopWorkspaceShell = !isMobileDetailView
  const showBottomNavigation = isMobile && !isMobileDetailView

  return (
    <>
      <SessionValidator />
      <div className="flex h-screen flex-col mobile-app-shell mobile-overscroll-contain">

      {showTopWorkspaceShell && (
        <>
          <WorkspaceHeader
            workspace={currentWorkspace}
            currentUser={currentUser}
            totalUnreadCount={conversations
              .filter(conv => conv.type === 'direct')
              .reduce((sum, conv) => sum + (conv.unread_count || 0), 0)}
            onWorkspaceChange={handleWorkspaceChange}
          />

          <ChatTopBannerAd />
        </>
      )}



      {/* Limit Alert */}

      {showLimitAlert && (

        <div className="px-4 pt-2">

          <LimitAlert

            type={showLimitAlert as any}

            limits={limits}

            onDismiss={() => setShowLimitAlert(null)}

          />

        </div>

      )}

      <div className="relative flex flex-1 min-w-0 overflow-hidden mobile-overscroll-contain">
        {/* 左侧导航栏（仅桌面端显示） */}
        {!isMobile && <AppNavigation totalUnreadCount={conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0)} />}

        <div
          data-testid="chat-list-panel"
          className={cn(
            "min-w-0 h-full",
            isMobile ? "w-full" : "relative shrink-0",
            isMobile && mobileView === 'detail' ? "hidden" : "block"
          )}
          style={!isMobile ? {
            width: sidebarExpanded ? '420px' : '340px'
          } : undefined}
        >

          <Sidebar

            conversations={conversations}

            currentConversationId={selectedConversationId}

            currentUser={currentUser}

            isLoadingConversations={isLoadingConversations}
            isRefreshingConversations={isRefreshingConversations}

            onSelectConversation={async (conversationId) => {

              // When user manually selects a conversation, update state immediately

              // Don't wait for URL to update - make it instant

              console.log('User manually selected conversation:', conversationId)

              // Exit Blind Zone / Global Announcement channel when selecting a conversation
              setActiveChannel('none')

              // Clear all refs to allow switching

              processedConversationRef.current = null

              isManualSelectionRef.current = true

              

              // If switching to a different conversation, clear messages and show loading

              if (selectedConversationId !== conversationId) {
                messagesConversationIdRef.current = conversationId
                const cachedMessages = getValidatedCachedMessages(conversationId)
                if (cachedMessages && cachedMessages.length > 0) {
                  setMessages(cachedMessages)
                  setIsLoadingMessages(false)
                } else {
                  setMessages([]) // No cache yet, show loading state
                  setIsLoadingMessages(true)
                }
              }

              

              // 本地把未读数清 0（乐观），并更新缓存，保证红点点一下就消失、刷新也不回来
              // CRITICAL: Pass conversationId to persistConversationsCache so workspace-header
              // can immediately know which conversation is selected (even before URL updates)
              console.log('🔒 Set selected conversation unread_count to 0 (onSelectConversation):', conversationId)

              setConversations(prev => {

                const updated = prev.map(conv =>

                  conv.id === conversationId

                    ? { ...conv, unread_count: 0 }

                    : conv

                )
                
                // CRITICAL: Update conversationsRef.current immediately
                conversationsRef.current = updated

                persistConversationsCache(updated, conversationId)

                return updated

              })

              // Update state immediately - this should be instant

              selectedConversationIdRef.current = conversationId
              setSelectedConversationId(conversationId)
              if (isMobile) {
                setMobileView('detail')
              }

              // Update URL asynchronously (don't block)

              router.push(`/chat?conversation=${conversationId}`, { scroll: false })

              // 异步通知后端，把该会话标记为已读，保证后端未读计数也清空

              try {

                await fetch(`/api/conversations/${conversationId}`, {

                  method: 'PATCH',

                  headers: { 'Content-Type': 'application/json' },

                  body: JSON.stringify({ action: 'read' }),

                })

              } catch (error) {

                console.error('Failed to mark conversation as read:', error)

              }

              // Reset manual selection flag after a short delay

              setTimeout(() => {

                isManualSelectionRef.current = false

              }, 100)

            }}

            onNewConversation={handleNewConversation}

            expanded={sidebarExpanded}
            isMobile={isMobile}
            isMobileOpen={isMobile ? mobileView === 'list' : true}
            onToggleExpand={() => setSidebarExpanded(prev => !prev)}

            onPinConversation={handlePinConversation}

            onUnpinConversation={handleUnpinConversation}

            onHideConversation={handleHideConversation}

            onDeleteConversation={handleDeleteConversation}

            contacts={availableUsers}
            workspaceId={currentWorkspace?.id || ''}
            activeChannel={activeChannel}
            onSelectAnnouncement={() => {
              const nextChannel = activeChannel === 'announcement' ? 'none' : 'announcement'
              setActiveChannel(nextChannel)
              if (isMobile) {
                if (nextChannel === 'none' && !selectedConversationId) {
                  setMobileView('list')
                } else {
                  setMobileView('detail')
                }
              }
            }}
            onSelectBlindZone={() => {
              const nextChannel = activeChannel === 'blind' ? 'none' : 'blind'
              setActiveChannel(nextChannel)
              if (isMobile) {
                if (nextChannel === 'none' && !selectedConversationId) {
                  setMobileView('list')
                } else {
                  setMobileView('detail')
                }
              }
            }}

          />

        </div>

        <div
          data-testid="chat-detail-panel"
          className={cn(
            "min-w-0 flex flex-1",
            isMobile && mobileView === 'list' ? "hidden" : "flex"
          )}
        >

          <div className="flex flex-1 min-w-0 flex-col">

          {/* Global Announcement or Blind Zone channel - highest priority */}
          {activeChannel !== 'none' ? (
            activeChannel === 'blind' ? (
              <BlindZoneChat
                isOpen={activeChannel === 'blind'}
                onClose={closeActiveChannel}
                workspaceId={currentWorkspace?.id || ''}
                isWorkspaceAdmin={(() => {
                  // 检查当前用户是否是工作区管理员
                  // 通过检查 currentWorkspace 的 owner_id 或者其他方式
                  return currentWorkspace?.owner_id === currentUser?.id
                })()}
              />
            ) : (
              <GlobalAnnouncement
                isOpen={activeChannel === 'announcement'}
                onClose={closeActiveChannel}
                workspaceId={currentWorkspace?.id || ''}
              />
            )
          ) : showChatInterface && displayConversation ? (

            <>

              {shouldGateGroupMeta ? (
                <ConversationMetaSkeleton
                  variant="header"
                  isMobile={isMobile}
                  mode={shouldShowGroupMetaFailed ? 'failed' : 'loading'}
                  onRetry={shouldShowGroupMetaFailed ? handleRetryConversationMeta : undefined}
                />
              ) : (
                <>
                  <ChatHeader
                    key={displayConversation.id}
                    conversation={displayConversation}
                    currentUser={currentUser}
                    onToggleSidebar={isMobile ? () => setMobileView('list') : undefined}
                    mobileBackLabel={language === 'zh' ? '返回会话列表' : 'Back to conversations'}
                    onToggleGroupInfo={() => setGroupInfoOpen(prev => !prev)}
                    onImportChat={() => setShowImportDialog(true)}
                  />

                  {displayConversation.type === 'group' && (
                    <ChatTabs
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                    />
                  )}

                  {displayConversation.type === 'group' && activeTab === 'messages' && (
                    <AnnouncementBanner
                      key={`announcement-banner-${displayConversation.id}`}
                      conversationId={displayConversation.id}
                      isAdmin={displayConversation.members?.some(
                        (m: any) => m.user_id === currentUser.id && (m.role === 'admin' || m.role === 'owner')
                      ) || false}
                      onOpenDrawer={() => setAnnouncementDrawerOpen(true)}
                    />
                  )}
                </>
              )}

              {activeTab === 'messages' && (
                <>
                  <MessageList

                    messages={messages}

                    currentUser={currentUser}

                    isLoading={isLoadingMessages}
                    participantsById={Object.fromEntries(
                      (displayConversation?.members || [])
                        .map((member: any) => [member?.id || member?.user_id, member] as const)
                        .filter(([id]) => !!id),
                    )}

                    onEditMessage={handleEditMessage}

                    onDeleteMessage={handleDeleteMessage}

                    onRecallMessage={handleRecallMessage}

                    onHideMessage={handleHideMessage}

                    onAddReaction={handleAddReaction}

                    onRemoveReaction={handleRemoveReaction}

                    onPinMessage={handlePinMessage}

                    onUnpinMessage={handleUnpinMessage}

                    onReplyMessage={handleReplyMessage}
                    onForwardMessage={handleForwardMessage}
                    conversations={conversations.map(c => ({
                      id: c.id,
                      name: c.name || c.members?.map((m: any) => m.full_name || m.username).filter(Boolean).join(', ') || undefined,
                      type: c.type,
                    }))}
                    searchQuery={messageSearchQuery}
                    onSearchQueryChange={setMessageSearchQuery}
                  />

                  {/* 系统助手会话不显示输入框 - 只能接收通知，不能回复 */}
                  {!isSystemAssistantConversation && (
                    <MessageInput onSendMessage={handleSendMessage} />
                  )}
                </>
              )}

              {activeTab === 'announcements' && displayConversation.type === 'group' && (
                <AnnouncementsView
                  key={`announcements-view-${displayConversation.id}`}
                  conversationId={displayConversation.id}
                  isAdmin={displayConversation.members?.some(
                    (m: any) => m.user_id === currentUser.id && (m.role === 'admin' || m.role === 'owner')
                  ) || false}
                />
              )}

              {activeTab === 'files' && displayConversation.type === 'group' && (
                <FilesView
                  key={`files-view-${displayConversation.id}`}
                  conversationId={displayConversation.id}
                  isAdmin={displayConversation.members?.some(
                    (m: any) => m.user_id === currentUser.id && (m.role === 'admin' || m.role === 'owner')
                  ) || false}
                />
              )}

            </>

          ) : showChatInterface && selectedConversationId ? (

            // Conversation is selected but not loaded yet - show loading state

            <div className="flex-1 flex items-center justify-center text-muted-foreground">

              <div className="text-center">

                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-20 animate-pulse" />

                <h3 className="text-lg font-semibold mb-2">{language === 'zh' ? '正在加载会话...' : 'Loading conversation...'}</h3>

                <p>{language === 'zh' ? '请稍候' : 'Please wait'}</p>

              </div>

            </div>

          ) : isCreatingConversationFromUserId || (searchParams.get('userId') && !displayConversation) ? (

            // 来自 /contacts?userId=xxx 或 /chat?userId=xxx，正在后台创建 / 查找会话时，显示 Loading UI
            // 注意：即使 isCreatingConversationFromUserId 还没被设置（等待 currentUser/currentWorkspace 加载），
            // 只要 URL 中有 userId 参数且 displayConversation 还没有，就显示加载动画

            <div className="flex-1 flex items-center justify-center text-muted-foreground">

              <div className="text-center">

                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-20 animate-pulse" />

                <h3 className="text-lg font-semibold mb-2">{language === 'zh' ? '正在加载会话...' : 'Loading conversation...'}</h3>

                <p>{language === 'zh' ? '请稍候' : 'Please wait'}</p>

              </div>

            </div>

          ) : (

            <div className="flex-1 flex items-center justify-center text-muted-foreground">

              <div className="text-center">

                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-20" />

                <h3 className="text-lg font-semibold mb-2">{t('noConversationSelected')}</h3>

                <p>{t('selectConversationToStart')}</p>
                {isMobile && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setMobileView('list')}
                  >
                    {language === 'zh' ? '返回会话列表' : 'Back to conversations'}
                  </Button>
                )}

              </div>

            </div>

          )}

          </div>

          {/* Group Info Panel */}
          {displayConversation && displayConversation.type === 'group' && (
            isMobile ? (
              <Sheet open={groupInfoOpen} onOpenChange={setGroupInfoOpen}>
                <SheetContent side="right" className="w-full p-0 sm:w-[420px]">
                  {shouldGateGroupMeta ? (
                    <ConversationMetaSkeleton
                      variant="sheet"
                      isOpen={groupInfoOpen}
                      mode={shouldShowGroupMetaFailed ? 'failed' : 'loading'}
                      onRetry={shouldShowGroupMetaFailed ? handleRetryConversationMeta : undefined}
                    />
                  ) : (
                    <GroupInfoPanel
                      key={displayConversation.id}
                      conversation={displayConversation}
                      currentUser={currentUser}
                      isOpen={groupInfoOpen}
                      onClose={() => setGroupInfoOpen(false)}
                      variant="sheet"
                      onUpdate={() => {
                        if (currentUser && currentWorkspace) {
                          loadConversations(currentUser.id, currentWorkspace.id, true)
                        }
                      }}
                    />
                  )}
                </SheetContent>
              </Sheet>
            ) : (
              shouldGateGroupMeta ? (
                <ConversationMetaSkeleton
                  variant="panel"
                  isOpen={groupInfoOpen}
                  mode={shouldShowGroupMetaFailed ? 'failed' : 'loading'}
                  onRetry={shouldShowGroupMetaFailed ? handleRetryConversationMeta : undefined}
                />
              ) : (
                <GroupInfoPanel
                  key={displayConversation.id}
                  conversation={displayConversation}
                  currentUser={currentUser}
                  isOpen={groupInfoOpen}
                  onClose={() => setGroupInfoOpen(false)}
                  onUpdate={() => {
                    if (currentUser && currentWorkspace) {
                      loadConversations(currentUser.id, currentWorkspace.id, true)
                    }
                  }}
                />
              )
            )
          )}

        </div>

      </div>
      {showBottomNavigation && (
        <AppNavigation
          totalUnreadCount={conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0)}
          mobile
        />
      )}

      <NewConversationDialog

        open={showNewConversation}

        onOpenChange={setShowNewConversation}

        users={availableUsers}

        currentUser={currentUser}

        onCreateDirect={handleCreateDirect}

        onCreateGroup={handleCreateGroup}

      />

      {/* Incoming call dialog */}
      {showIncomingCallDialog && incomingCallRecipient && incomingCallConversationId && incomingCallMessageId && currentUser && (
        incomingCallType === 'voice' ? (
          <VoiceCallDialog
            open={showIncomingCallDialog}
            onOpenChange={(open) => {
              setShowIncomingCallDialog(open)
              if (!open) {
                setIncomingCallMessageId(null)
                setIncomingCallConversationId(null)
                setIncomingCallRecipient(null)
                setIncomingCallType('video')
                setIncomingCallSessionId(null)
                setIncomingCallAutoAnswer(false)
              }
            }}
            recipient={incomingCallRecipient}
            currentUser={currentUser}
            conversationId={incomingCallConversationId}
            callMessageId={incomingCallMessageId}
            callSessionId={incomingCallSessionId || undefined}
            isIncoming={true}
            autoAnswer={incomingCallAutoAnswer}
          />
        ) : (
          <VideoCallDialog
            open={showIncomingCallDialog}
            onOpenChange={(open) => {
              setShowIncomingCallDialog(open)
              if (!open) {
                setIncomingCallMessageId(null)
                setIncomingCallConversationId(null)
                setIncomingCallRecipient(null)
                setIncomingCallType('video')
                setIncomingCallSessionId(null)
                setIncomingCallAutoAnswer(false)
              }
            }}
            recipient={incomingCallRecipient}
            currentUser={currentUser}
            conversationId={incomingCallConversationId}
            callMessageId={incomingCallMessageId}
            callSessionId={incomingCallSessionId || undefined}
            isIncoming={true}
            autoAnswer={incomingCallAutoAnswer}
          />
        )
      )}

      {/* Announcement drawer */}
      {displayConversation?.type === 'group' && (
        <AnnouncementDrawer
          open={announcementDrawerOpen}
          onOpenChange={setAnnouncementDrawerOpen}
          conversationId={displayConversation.id}
          isAdmin={displayConversation.members?.some(
            (m: any) => m.user_id === currentUser.id && (m.role === 'admin' || m.role === 'owner')
          ) || false}
        />
      )}

    </div>

    {/* Chat Import Dialog */}
    {displayConversation && (
      <ChatImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        conversationId={displayConversation.id}
        conversationType={displayConversation.type as 'direct' | 'group' | 'channel'}
        currentUserName={currentUser?.full_name || currentUser?.username || ''}
        onImportComplete={() => {
          if (displayConversation?.id) {
            loadMessages(displayConversation.id)
          }
        }}
      />
    )}
    </>
  )

}

export default ChatPageContent










