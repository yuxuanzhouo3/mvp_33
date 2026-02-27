'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'

import { mockAuth } from '@/lib/mock-auth'

import { Sidebar } from '@/components/chat/sidebar'

import { WorkspaceHeader } from '@/components/chat/workspace-header'

import { ChatHeader } from '@/components/chat/chat-header'

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

import { VideoCallDialog } from '@/components/chat/video-call-dialog'

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

type ConversationsApiResponse = {

  success: true

  conversations: ConversationWithDetails[]

  error?: string

}

const SYSTEM_ASSISTANT_IDS = new Set([
  'system-assistant',
  '00000000-0000-0000-0000-000000000001',
])

const isSystemAssistantUserId = (userId?: string | null): boolean => {
  if (!userId) return false
  return SYSTEM_ASSISTANT_IDS.has(userId)
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

  const [showNewConversation, setShowNewConversation] = useState(false)

  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true) // Mobile sidebar state
  const [groupInfoOpen, setGroupInfoOpen] = useState(false) // Group info panel state
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

  const { limits, subscription } = useSubscription()
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  useHeartbeat(currentUser?.id)
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
  const selectedConversationIdsRef = useRef<Set<string>>(new Set())

  const conversationsRef = useRef<ConversationWithDetails[]>([])
  const messagesByConversationRef = useRef<Map<string, MessageWithSender[]>>(new Map())

  const pendingConversationMapRef = useRef<Map<string, ConversationWithDetails>>(new Map())

  const conversationDetailsRef = useRef<Map<string, ConversationWithDetails>>(new Map())

  const currentUserRef = useRef<User | null>(null)

  const currentWorkspaceRef = useRef<Workspace | null>(null)

  const hasForcedInitialReloadRef = useRef<boolean>(false)

  const lastLoadSignatureRef = useRef<string>('')

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
    // CRITICAL: When conversation is selected, add it to the "welded" set
    // This ensures unread_count stays at 0 no matter what
    if (selectedConversationId) {
      selectedConversationIdsRef.current.add(selectedConversationId)
      console.log('🔒 Welded conversation unread_count to 0:', selectedConversationId)
    }
  }, [selectedConversationId])

  useEffect(() => {
    if (!selectedConversationId) return
    messagesByConversationRef.current.set(selectedConversationId, messages)
  }, [selectedConversationId, messages])

  useEffect(() => {
    messagesByConversationRef.current.clear()
  }, [currentUser?.id, currentWorkspace?.id])

  useEffect(() => {

    currentUserRef.current = currentUser

  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return

    const isGlobal = process.env.NEXT_PUBLIC_FORCE_GLOBAL_DATABASE !== 'false'

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
      window.dispatchEvent(new Event('conversationsUpdated'))
    } catch (error) {
      console.warn('Failed to persist conversations cache:', error)
    }
  }, [currentUser, currentWorkspace])

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

    setConversations(prev => {

      existsInList = prev.some(c => c.id === conversationId)

      return prev // No change, just checking

    })

    

    if (existsInList && retryCount === 0) {

      console.log('✅ Conversation already exists in list, skipping load:', conversationId)

      return true

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

            alert('登录已失效，请重新登录后再试。')

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
        const cachedMessages = messagesByConversationRef.current.get(conversationId) || []
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
          setMessages(nextMessages)
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
        // CRITICAL: Ensure this conversation is in the "welded" set
        selectedConversationIdsRef.current.add(conversationId)
        console.log('🔒 Welded conversation unread_count to 0 (loadMessages complete):', conversationId)
        
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
            window.dispatchEvent(new Event('conversationsUpdated'))
          }
          
          return updated
        })
      }

    }

  }, [])

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
    let cachedConversations: ConversationWithDetails[] | null = null
    
    try {
      // Check cache first (unless skipCache is true)
      if (!skipCache) {
        const cachedData = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null
        const cachedTimestamp = typeof window !== 'undefined' ? localStorage.getItem(cacheTimestampKey) : null

        if (cachedData && cachedTimestamp) {
          const cacheAge = Date.now() - parseInt(cachedTimestamp, 10)
          if (cacheAge < CACHE_DURATION) {
            try {
              cachedConversations = JSON.parse(cachedData)
              console.log('📦 Loading conversations from cache for instant display:', cachedConversations.length, 'conversations')
              
              // CRITICAL: Filter out conversations where the other user is not in contacts
              // This ensures deleted contacts' conversations don't appear even from cache
              try {
                const contactsResponse = await fetch('/api/contacts')
                if (contactsResponse.ok) {
                  const contactsData = await contactsResponse.json()
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
                      
                      // If the other user is not in contacts, filter out this conversation
                      if (!contactUserIds.has(otherUserId) && !isSystemAssistantUserId(otherUserId)) {
                        console.log('🗑️ [Cache] Filtering out direct conversation - user not in contacts:', {
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
                const enrichedCached = applyPinnedOrdering(cachedConversations.map(enrichConversation))
                setConversations(enrichedCached)
                conversationsRef.current = enrichedCached
                setIsLoadingConversations(false) // Show cached data immediately
                setIsRefreshingConversations(true) // Show small loading indicator at top
                console.log('✅ Displayed cached conversations immediately, showing refresh indicator')
              }
            } catch (e) {
              console.warn('Failed to parse cached conversations:', e)
              cachedConversations = null
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
          
          // Check contacts to see if conversations should really be filtered
          try {
            const contactsResponse = await fetch('/api/contacts')
            if (contactsResponse.ok) {
              const contactsData = await contactsResponse.json()
              if (contactsData.success && contactsData.contacts) {
                const contactUserIds = new Set(
                  contactsData.contacts.map((c: any) => c.contact_user_id || c.user?.id).filter(Boolean)
                )
                
                // Only keep conversations where the other user is still in contacts
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
                            
                            return !!otherUserId && (contactUserIds.has(otherUserId) || isSystemAssistantUserId(otherUserId))
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

                const aCreated = new Date(a.created_at).getTime()

                const bCreated = new Date(b.created_at).getTime()

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

          

          const finalConversations = [...frontendDeduplicatedDirect, ...frontendOtherConversations]

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

          

          // CRITICAL: Preserve optimistic unread_count = 0 for currently selected conversation
          // This prevents the red dot from flickering (disappearing → appearing → disappearing)
          // If a conversation is in the "welded" set (user clicked it), ALWAYS set its unread_count to 0
          // This "welds" (焊死) the unread_count to 0 - no matter what happens
          const enrichedWithPreservedRead = enrichedConversations.map(conv => {
            // CRITICAL: If this conversation is in the "welded" set, ALWAYS set unread_count to 0
            // This ensures that even if loadConversations runs after loadMessages, the unread_count stays at 0
            if (selectedConversationIdsRef.current.has(conv.id)) {
              console.log('🔒 Keeping welded conversation unread_count at 0:', conv.id)
              return { ...conv, unread_count: 0 }
            }
            return conv
          })

          // Update cache

          if (typeof window !== 'undefined') {

            localStorage.setItem(cacheKey, JSON.stringify(enrichedWithPreservedRead))

            localStorage.setItem(cacheTimestampKey, Date.now().toString())

          }

          

          setConversations(enrichedWithPreservedRead)

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

            const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : new Date(a.created_at).getTime()

            const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : new Date(b.created_at).getTime()

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
          if (typeof window !== 'undefined' && userId) {
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
              
              // Debug: contacts used for cleanup
              const contactIdsArray = Array.from(contactUserIds)
              console.log('👥 Contacts for cleanup', { count: contactCount, ids: contactIdsArray })

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
                  // If the other user is not in contacts list, mark this conversation as deleted
                  const isSystemAssistantConversation = isSystemAssistantUserId(otherUserId)
                  const noContacts = contactCount === 0
                  const notInContacts = otherUserId && !contactUserIds.has(otherUserId)
                  if ((noOther || (!isSystemAssistantConversation && (noContacts || notInContacts))) && !deletedConversations.includes(conv.id)) {
                    conversationsToDelete.push(conv.id)
                    console.log(`🧹 Auto-marking conversation ${conv.id} as deleted (user ${otherUserId || 'unknown'} not in contacts or contact list empty)`, {
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

                const aCreated = new Date(a.created_at).getTime()

                const bCreated = new Date(b.created_at).getTime()

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

          const finalConversations = [...frontendDeduplicatedDirect, ...frontendOtherConversations]

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
                // CRITICAL: If this conversation is in the "welded" set (user clicked it),
                // ALWAYS set unread_count to 0, no matter what the API returns
                // This "welds" (焊死) the unread_count to 0
                if (selectedConversationIdsRef.current.has(prevConv.id)) {
                  console.log('🔒 Keeping welded conversation unread_count at 0:', prevConv.id)
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

            // CRITICAL: Preserve optimistic unread_count = 0 for currently selected conversation
            // This prevents the red dot from flickering (disappearing → appearing → disappearing)
            // If a conversation is in the "welded" set (user clicked it), ALWAYS set its unread_count to 0
            // This "welds" (焊死) the unread_count to 0 - no matter what happens
            const enrichedWithPreservedRead = enrichedList.map(conv => {
              // CRITICAL: If this conversation is in the "welded" set, ALWAYS set unread_count to 0
              // This ensures that even if loadConversations runs after loadMessages, the unread_count stays at 0
              if (selectedConversationIdsRef.current.has(conv.id)) {
                console.log('🔒 Keeping welded conversation unread_count at 0:', conv.id)
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
                window.dispatchEvent(new Event('conversationsUpdated'))

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

  }, [loadSingleConversation, parseConversationsResponse, restoreSelectedConversation, mergePendingConversations, enrichConversation, router]) // Removed searchParams and selectedConversationId to prevent loops

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

      if (!user || !workspace) {
        console.error('❌ [CHAT PAGE] Missing user or workspace, redirecting to login:', {
          hasUser: !!user,
          hasWorkspace: !!workspace
        })
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

            const cachedConversations = JSON.parse(cachedData)

            // Get deleted conversations list

            const deletedKey = `deleted_conversations_${user.id}_${workspace.id}`

            const deletedConversations = typeof window !== 'undefined'

              ? JSON.parse(localStorage.getItem(deletedKey) || '[]')

              : []

            

            let directAndGroups = cachedConversations.filter(

              (c: ConversationWithDetails) => 

                c && 

                (c.type === 'direct' || c.type === 'group') &&

                !deletedConversations.includes(c.id)

            )

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

              setCurrentUser(data.user)

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

  const creatingConversationForUserRef = useRef<string | null>(null)

  

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

            // Update URL with conversation ID
            console.log('🔗 Updating URL to:', `/chat?conversation=${data.conversation.id}`)
            router.replace(`/chat?conversation=${data.conversation.id}`)

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

            

            // Update URL with conversation ID

            console.log('🔗 Updating URL to:', `/chat?conversation=${data.conversation.id}`)

            router.replace(`/chat?conversation=${data.conversation.id}`)

            

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

  useEffect(() => {
    if (!selectedConversationId) return

    const cachedMessages = messagesByConversationRef.current.get(selectedConversationId)
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
  }, [selectedConversationId, loadMessages])

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

    if (!selectedConversationId || !currentWorkspace || !currentUser) return

    // Poll less frequently: every 10 seconds instead of 2 seconds

    // This reduces server load while still keeping data relatively fresh

    const POLL_INTERVAL = 10000 // 10 seconds

    

    const interval = setInterval(async () => {

      // Prevent concurrent polling

      if (isPollingRef.current) {

        console.log('⏭️ Polling already in progress, skipping...')

        return

      }

      

      // Use ref to get current value, avoiding dependency on selectedConversationId

      const currentConvId = pollingConversationRef.current

      if (!currentConvId) return

      

      // Throttle: don't poll if last poll was less than 8 seconds ago

      const now = Date.now()

      if (now - lastPollTimeRef.current < 8000) {

        console.log('⏭️ Polling throttled, skipping...')

        return

      }

      // Skip polling if message was sent recently (within 3 seconds)
      if (now - lastMessageSendTimeRef.current < 3000) {
        console.log('⏭️ Polling skipped: message was sent recently')
        return
      }

      

      isPollingRef.current = true

      lastPollTimeRef.current = now

      

      try {

        // Reload messages for current conversation (only if not already loading)
        // IMPORTANT: Use silent mode so we don't反复切 isLoadingMessages，避免右侧一直显示 "Loading messages..."

        if (!loadingMessagesRef.current.has(currentConvId)) {

          loadMessages(currentConvId, { silent: true })

        }

        

        // Also reload conversations list to update last_message for all conversations

        // This ensures both sender and receiver see updates

        // But only if conversations list is not currently loading

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

                    const aCreated = new Date(a.created_at).getTime()

                    const bCreated = new Date(b.created_at).getTime()

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
              const finalConversations = [...frontendDeduplicatedDirect, ...frontendOtherConversations]

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

                // Check if lists are different
                if (prevIds.size !== newIds.size || 

                    !Array.from(prevIds).every(id => newIds.has(id)) ||

                    !Array.from(newIds).every(id => prevIds.has(id))) {

                  // Lists are different, update state
                  if (typeof window !== 'undefined') {

                    const cacheKey = `conversations_${currentUser.id}_${currentWorkspace.id}`

                    const cacheTimestampKey = `conversations_timestamp_${currentUser.id}_${currentWorkspace.id}`

                    localStorage.setItem(cacheKey, JSON.stringify(orderedWithPreservedRead))

                    localStorage.setItem(cacheTimestampKey, Date.now().toString())

                  }

                  return orderedWithPreservedRead

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

                  return orderedWithPreservedRead

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

                  return orderedWithPreservedRead

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

  }, [currentUser, currentWorkspace, loadMessages]) // Include dependencies for currentUser and currentWorkspace

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

    // CRITICAL: Add polling mechanism to check if contacts were deleted by the other party
    // This ensures both users see the deletion effect even if they don't refresh the page
    // Poll every 5 seconds to check for deleted contacts (reduced from 30s for faster sync)
    const contactCheckInterval = setInterval(async () => {
      if (!currentUser || !currentWorkspace) return

      console.log('👥 [CONTACT-CHECK] Running contact check poll...')

      try {
        // Fetch current contacts list
        const contactsResponse = await fetch('/api/contacts')
        if (!contactsResponse.ok) return

        const contactsData = await contactsResponse.json()
        if (!contactsData.success || !contactsData.contacts) return

        console.log('👥 [CONTACT-CHECK] Contacts fetched:', contactsData.contacts.length)

        const currentContactIds = new Set(
          contactsData.contacts.map((c: any) => c.contact_user_id || c.user?.id).filter(Boolean)
        )

        // Check if any conversation's other user is no longer in contacts
        setConversations(prev => {
          console.log('👥 [CONTACT-CHECK] Checking conversations:', prev.length)

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
    }, 5000) // Check every 5 seconds for faster sync

    return () => {
      window.removeEventListener('contactDeleted', handleContactDeleted as EventListener)
      clearInterval(contactCheckInterval)
    }
  }, [currentUser, currentWorkspace, loadConversations])

  // Listen for conversationsUpdated event to refresh conversation list
  // This is triggered by system assistant messages and other components
  useEffect(() => {
    if (!currentUser || !currentWorkspace) return

    const handleConversationsUpdated = () => {
      console.log('[ChatContent] Received conversationsUpdated event, refreshing conversations...')
      loadConversations(currentUser.id, currentWorkspace.id, true).catch(error => {
        console.error('[ChatContent] Failed to refresh conversations:', error)
      })
    }

    window.addEventListener('conversationsUpdated', handleConversationsUpdated)

    return () => {
      window.removeEventListener('conversationsUpdated', handleConversationsUpdated)
    }
  }, [currentUser, currentWorkspace, loadConversations])

  // Listen for answer call and reject call events from message list
  useEffect(() => {
    if (!currentUser) return

    const handleAnswerCall = async (event: CustomEvent) => {
      const { messageId, conversationId } = event.detail
      
      try {
        // Get conversation to find recipient
        const conversation = conversations.find(c => c.id === conversationId)
        if (!conversation) {
          console.error('Conversation not found:', conversationId)
          return
        }

        // Get recipient user (for direct calls) - 确保 recipient 不是 currentUser
        let recipient: User | null = null
        if (conversation.type === 'direct') {
          recipient = conversation.members.find(m => m.id !== currentUser.id) || null
        } else {
          // For group calls, use the first member that is not currentUser
          recipient = conversation.members.find(m => m.id !== currentUser.id) || conversation.members[0] || null
        }

        if (!recipient) {
          console.error('Recipient not found')
          return
        }
        
        // 严格验证：确保 recipient 不是 currentUser（防止显示错误）
        if (recipient.id === currentUser.id) {
          console.error('[handleAnswerCall] ❌ CRITICAL: recipient is same as currentUser! This will cause wrong display.', {
            recipientId: recipient.id,
            recipientName: recipient.full_name,
            currentUserId: currentUser.id,
            currentUserName: currentUser.full_name,
            conversationId,
            conversationType: conversation.type,
            members: conversation.members.map(m => ({ id: m.id, name: m.full_name }))
          })
          // 尝试找到另一个成员
          const otherMember = conversation.members.find(m => m.id !== currentUser.id)
          if (otherMember) {
            recipient = otherMember
            console.warn('[handleAnswerCall] Using alternative recipient:', otherMember.id)
          } else {
            console.error('[handleAnswerCall] No alternative recipient found, cannot proceed')
            return
          }
        }

        // Get message to get channel name
        const msgResponse = await fetch(`/api/messages?conversationId=${conversationId}`)
        const msgData = await msgResponse.json()
        if (!msgData.success) {
          console.error('Failed to get messages')
          return
        }

        const callMessage = msgData.messages.find((m: any) => m.id === messageId)
        if (!callMessage) {
          console.error('Call message not found')
          return
        }

        // Update message status to answered
        const updatedMetadata = {
          ...callMessage.metadata,
          call_status: 'answered',
          answered_at: new Date().toISOString(),
        }
        
        await fetch(`/api/messages/${messageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metadata: updatedMetadata,
          }),
        })

        // Open video call dialog and start call immediately
        setIncomingCallMessageId(messageId)
        setIncomingCallConversationId(conversationId)
        setIncomingCallRecipient(recipient)
        setShowIncomingCallDialog(true)
      } catch (error) {
        console.error('Failed to handle answer call:', error)
      }
    }

    const handleRejectCall = async (event: CustomEvent) => {
      const { messageId } = event.detail
      
      try {
        // Update message status to rejected
        const conversation = conversations.find(c => 
          c.last_message?.id === messageId || messages.some(m => m.id === messageId)
        )
        
        if (conversation) {
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
        }
      } catch (error) {
        console.error('Failed to handle reject call:', error)
      }
    }

    window.addEventListener('answerCall', handleAnswerCall as EventListener)
    window.addEventListener('rejectCall', handleRejectCall as EventListener)

    return () => {
      window.removeEventListener('answerCall', handleAnswerCall as EventListener)
      window.removeEventListener('rejectCall', handleRejectCall as EventListener)
    }
  }, [currentUser, conversations, messages])

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

  // Track last message send time to prevent polling flicker
  const lastMessageSendTimeRef = useRef<number>(0)

  const handleSendMessage = useCallback(async (content: string, type: string = 'text', file?: File, metadata?: any) => {

    if (!selectedConversationId || !currentUser) return

    // Allow sending if there's content OR a file

    if (!content.trim() && !file) return

    // Record send time
    lastMessageSendTimeRef.current = Date.now()

    // Check message limit

    if (!limits.canSendMessage) {

      setShowLimitAlert('message')

      return

    }

    // Check file size limit if file is provided

    if (file && !limits.canUploadFile(file.size)) {

      setShowLimitAlert('file')

      return

    }

    const hasText = content.trim().length > 0

    const hasFile = !!file

    // If both file and text exist, send them separately: file first, then text

    if (hasFile && hasText) {

      // First, send the file message (without text content)

      await handleSendMessage('', type, file, metadata)

      // Then, send the text message separately

      await handleSendMessage(content, 'text', undefined, undefined)

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

      content: hasFile ? '' : (type === 'code' ? (metadata?.code_content || content) : content), // For code messages, use code_content from metadata

      type: type as any,

      reactions: [],

      is_edited: false,

      is_deleted: false,

      created_at: timestamp,

      updated_at: timestamp,

      reply_to: replyingToMessageId || undefined,

      metadata: file ? {

        file_name: file.name,

        file_size: file.size,

        mime_type: file.type,

        file_url: URL.createObjectURL(file),

        thumbnail_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,

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

          let displayContent = content

          if (hasFile) {

            if (type === 'image') {

              displayContent = '📷 Image'

            } else if (type === 'file') {

              displayContent = `📎 ${file?.name || 'File'}`

            } else if (type === 'video') {

              displayContent = '🎥 Video'

            } else {

              displayContent = file?.name || ''

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

      if (file) {

        try {

          const formData = new FormData()

          formData.append('file', file)

          formData.append('conversationId', selectedConversationId)

          const uploadResponse = await fetch('/api/messages/upload', {

            method: 'POST',

            body: formData,

          })

          const uploadData = await uploadResponse.json()

          

          if (!uploadData.success) {

            throw new Error(uploadData.error || 'Failed to upload file')

          }

          // DON'T update optimistic message here - wait for API response

          // This prevents the message from disappearing and reappearing

          // We'll update it once when the API returns the real message

          fileMetadata = {

            file_name: uploadData.file_name,

            file_size: uploadData.file_size,

            mime_type: uploadData.mime_type || uploadData.file_type || file.type,

            file_url: uploadData.file_url,

            thumbnail_url: file.type.startsWith('image/') ? uploadData.file_url : undefined,

          }

        } catch (uploadError: any) {

          console.error('Failed to upload file:', uploadError)

          // Remove failed message

          setMessages(prev => prev.filter(msg => msg.id !== tempId))

          // Show error to user

          alert(`Failed to upload file: ${uploadError.message || 'Unknown error'}`)

          return

        }

      }

      // Use file name as content if no text content provided

      // For code messages, use the code content from metadata if available

      const messageContent = hasFile 

        ? (file?.name || '') 

        : (type === 'code' && metadata?.code_content 

          ? metadata.code_content 

          : content.trim())

      

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

                displayContent = `📎 ${data.message.metadata?.file_name || 'File'}`

              } else if (data.message.type === 'video') {

                displayContent = '🎥 Video'

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

        // Remove failed message

        setMessages(prev => prev.filter(msg => msg.id !== tempId))

      }

    } catch (error) {

      console.error('Failed to send message:', error)

      // Remove failed message

      setMessages(prev => prev.filter(msg => msg.id !== tempId))

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

          

          if (newMessage.sender_id === currentUser.id) {

            console.log('⏭️ Skipping realtime update for self-sent message to avoid duplicates')

            return

          }

          

          // Check if conversation is in the list

          setConversations(prev => {

            const conversation = prev.find(c => c.id === conversationId)
            
            // Show browser notification for new message (if not in current conversation)
            if (conversation && selectedConversationId !== conversationId) {
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
                  selectedConversationId,
                  currentUser
                ).catch(error => {
                  console.error('Error showing notification:', error)
                })
              })
            }

            

            if (!conversation) {

              // Conversation not in list - load it

              console.log('⚠️ Conversation not found in list, loading...')

              loadSingleConversation(conversationId, currentWorkspace.id, 0)

              return prev

            }

            

            // Format message content for display

            let displayContent = newMessage.content

            if (newMessage.type === 'image') {

              displayContent = '📷 Image'

            } else if (newMessage.type === 'file') {

              displayContent = `📎 ${newMessage.metadata?.file_name || 'File'}`

            } else if (newMessage.type === 'video') {

              displayContent = '🎥 Video'

            } else if (newMessage.type === 'code') {

              displayContent = '💻 Code'

            } else if (newMessage.type === 'system' && newMessage.metadata?.call_type) {

              displayContent = newMessage.metadata.call_type === 'video' ? '📹 Video Call' : '📞 Voice Call'

              // 如果是通话邀请且不是自己发起的，显示接听界面
              if (newMessage.metadata.call_status === 'calling' && newMessage.sender_id !== currentUser.id) {
                // 触发显示通话对话框
                window.dispatchEvent(new CustomEvent('showCallDialog', {
                  detail: {
                    messageId: newMessage.id,
                    conversationId: conversationId,
                    callType: newMessage.metadata.call_type,
                    callerId: newMessage.metadata.caller_id,
                  }
                }))
              }
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

            

            // Update the conversation
            // CRITICAL: Preserve optimistic unread_count = 0 for currently selected conversation
            // If conversation is in the "welded" set (user clicked it), ALWAYS keep unread_count at 0
            const updated = prev.map(conv => {

              if (conv.id === conversationId) {
                // CRITICAL: If this conversation is in the "welded" set, ALWAYS keep unread_count at 0
                // This "welds" (焊死) the unread_count to 0 - no matter what happens
                const isWelded = selectedConversationIdsRef.current.has(conversationId)
                
                if (isWelded) {
                  console.log('🔒 Keeping welded conversation unread_count at 0 (realtime message):', conversationId)
                  return {
                    ...conv,
                    last_message: lastMessage,
                    last_message_at: newMessage.created_at,
                    unread_count: 0, // WELDED: Always 0
                  }
                }
                
                // If this is the currently selected conversation, keep unread_count at 0
                // (user is viewing it, so it's already "read")
                const isCurrentConversation = selectedConversationId === conversationId
                
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
          if (selectedConversationId === conversationId) {

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
                    window.dispatchEvent(new Event('conversationsUpdated'))
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
                      id: updatedMessage.id,
                      content: getTranslation(language, 'messageRecalled'),
                      type: updatedMessage.type || conv.last_message?.type || 'text',
                      created_at: updatedMessage.created_at || conv.last_message?.created_at || conv.created_at,
                    },
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
            if (selectedConversationId === conversationId) {
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
          console.error('❌ Realtime subscription error:', status)
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

  }, [currentUser, currentWorkspace, selectedConversationId, loadSingleConversation])

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
          console.error('❌ User status subscription error:', status)
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

  if (!currentUser || !currentWorkspace) {

    return null

  }

  

  // Use temp conversation if selected conversation is not in list

  const displayConversation = selectedConversation || tempConversation

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

  return (
    <>
      <SessionValidator />
      <div className="flex h-screen flex-col">

      <WorkspaceHeader
        workspace={currentWorkspace}
        currentUser={currentUser}
        totalUnreadCount={conversations
          .filter(conv => conv.type === 'direct')
          .reduce((sum, conv) => sum + (conv.unread_count || 0), 0)}
      />



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

      <div className="flex flex-1 overflow-hidden relative">
        {/* 左侧导航栏（仅桌面端显示） */}
        {!isMobile && <AppNavigation totalUnreadCount={conversations.reduce((sum, conv) => sum + (conv.unread_count || 0), 0)} />}
        {/* Mobile overlay */}
        {isMobile && sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div 
          className={cn(
            "transition-all duration-300 ease-in-out relative",
            isMobile && !sidebarOpen && "-translate-x-[calc(100%-40px)]",
            isMobile && sidebarOpen && "translate-x-0"
          )}
          style={{
            width: isMobile
              ? '280px'
              : (sidebarExpanded ? '420px' : '340px')
          }}
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
                const cachedMessages = messagesByConversationRef.current.get(conversationId)
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
              // CRITICAL: Add to "welded" set to ensure unread_count stays at 0 no matter what
              selectedConversationIdsRef.current.add(conversationId)
              console.log('🔒 Welded conversation unread_count to 0 (onSelectConversation):', conversationId)

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
            isMobileOpen={sidebarOpen}
            onToggleMobile={() => setSidebarOpen(!sidebarOpen)}
            onToggleExpand={() => setSidebarExpanded(!sidebarExpanded)}

            onPinConversation={handlePinConversation}

            onUnpinConversation={handleUnpinConversation}

            onHideConversation={handleHideConversation}

            onDeleteConversation={handleDeleteConversation}

            contacts={availableUsers}
            workspaceId={currentWorkspace?.id || ''}
            activeChannel={activeChannel}
            onSelectAnnouncement={() => {
              setActiveChannel(activeChannel === 'announcement' ? 'none' : 'announcement')
            }}
            onSelectBlindZone={() => {
              setActiveChannel(activeChannel === 'blind' ? 'none' : 'blind')
            }}

          />

        </div>

        <div className="flex-1 flex">

          <div className="flex-1 flex flex-col">

          {/* Global Announcement or Blind Zone channel - highest priority */}
          {activeChannel !== 'none' ? (
            activeChannel === 'blind' ? (
              <BlindZoneChat
                isOpen={activeChannel === 'blind'}
                onClose={() => setActiveChannel('none')}
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
                onClose={() => setActiveChannel('none')}
                workspaceId={currentWorkspace?.id || ''}
              />
            )
          ) : showChatInterface && displayConversation ? (

            <>

              <ChatHeader
                conversation={displayConversation}
                currentUser={currentUser}
                onToggleSidebar={isMobile ? () => setSidebarOpen(!sidebarOpen) : undefined}
                onToggleGroupInfo={() => setGroupInfoOpen(!groupInfoOpen)}
              />

              {displayConversation.type === 'group' && (
                <ChatTabs
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                />
              )}

              {displayConversation.type === 'group' && activeTab === 'messages' && (
                <AnnouncementBanner
                  conversationId={displayConversation.id}
                  isAdmin={displayConversation.members?.some(
                    m => m.user_id === currentUser.id && (m.role === 'admin' || m.role === 'owner')
                  ) || false}
                  onOpenDrawer={() => setAnnouncementDrawerOpen(true)}
                />
              )}

              {activeTab === 'messages' && (
                <>
                  <MessageList

                    messages={messages}

                    currentUser={currentUser}

                    isLoading={isLoadingMessages}

                    onEditMessage={handleEditMessage}

                    onDeleteMessage={handleDeleteMessage}

                    onRecallMessage={handleRecallMessage}

                    onHideMessage={handleHideMessage}

                    onAddReaction={handleAddReaction}

                    onRemoveReaction={handleRemoveReaction}

                    onPinMessage={handlePinMessage}

                    onUnpinMessage={handleUnpinMessage}

                    onReplyMessage={handleReplyMessage}

                  />

                  {/* 系统助手会话不显示输入框 - 只能接收通知，不能回复 */}
                  {!isSystemAssistantConversation && (
                    <MessageInput onSendMessage={handleSendMessage} />
                  )}
                </>
              )}

              {activeTab === 'announcements' && displayConversation.type === 'group' && (
                <AnnouncementsView
                  conversationId={displayConversation.id}
                  isAdmin={displayConversation.members?.some(
                    m => m.user_id === currentUser.id && (m.role === 'admin' || m.role === 'owner')
                  ) || false}
                />
              )}

              {activeTab === 'files' && displayConversation.type === 'group' && (
                <FilesView
                  conversationId={displayConversation.id}
                  isAdmin={displayConversation.members?.some(
                    m => m.user_id === currentUser.id && (m.role === 'admin' || m.role === 'owner')
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

              </div>

            </div>

          )}

          </div>

          {/* Group Info Panel */}
          {displayConversation && displayConversation.type === 'group' && (
            <GroupInfoPanel
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
          )}

        </div>

      </div>

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
        <VideoCallDialog
          open={showIncomingCallDialog}
          onOpenChange={setShowIncomingCallDialog}
          recipient={incomingCallRecipient}
          currentUser={currentUser}
          conversationId={incomingCallConversationId}
          callMessageId={incomingCallMessageId}
          isIncoming={true}
          autoAnswer={true}
        />
      )}

      {/* Announcement drawer */}
      {displayConversation?.type === 'group' && (
        <AnnouncementDrawer
          open={announcementDrawerOpen}
          onOpenChange={setAnnouncementDrawerOpen}
          conversationId={displayConversation.id}
          isAdmin={displayConversation.members?.some(
            m => m.user_id === currentUser.id && (m.role === 'admin' || m.role === 'owner')
          ) || false}
        />
      )}

    </div>
    </>
  )

}

export default ChatPageContent

