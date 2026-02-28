'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { mockAuth } from '@/lib/mock-auth'
import { mockUsers, pinConversation, unpinConversation, hideConversation, deleteConversation } from '@/lib/mock-data'
import { WorkspaceHeader } from '@/components/chat/workspace-header'
import { AppNavigation } from '@/components/layout/app-navigation'
import { ChannelsPanel } from '@/components/channels/channels-panel'
import { ChatHeader } from '@/components/chat/chat-header'
import { MessageList } from '@/components/chat/message-list'
import { MessageInput } from '@/components/chat/message-input'
import { ChannelInfoPanel } from '@/components/channels/channel-info-panel'
import { CreateChannelDialog } from '@/components/channels/create-channel-dialog'
import { User, Workspace, ConversationWithDetails, MessageWithSender } from '@/lib/types'
import { Hash } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

const CHANNELS_CACHE_TTL = 60 * 1000

function getChannelsCacheKey(userId: string, workspaceId: string) {
  return `channels_page_conversations_${userId}_${workspaceId}`
}

function getChannelsCacheTsKey(userId: string, workspaceId: string) {
  return `channels_page_conversations_ts_${userId}_${workspaceId}`
}

export default function ChannelsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(() => mockAuth.getCurrentUser())
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(() => mockAuth.getCurrentWorkspace())
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([])
  const [isConversationsLoading, setIsConversationsLoading] = useState(() => !!(mockAuth.getCurrentUser() && mockAuth.getCurrentWorkspace()))
  const [selectedChannelId, setSelectedChannelId] = useState<string>()
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [showChannelInfo, setShowChannelInfo] = useState(false)
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const isMobile = useIsMobile()
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  useEffect(() => {
    const user = mockAuth.getCurrentUser()
    const workspace = mockAuth.getCurrentWorkspace()
    let hasFreshCache = false

    if (!user || !workspace) {
      router.push('/login')
      return
    }

    setCurrentUser(user)
    setCurrentWorkspace(workspace)

    // Render cached channels immediately to avoid loading flicker when switching pages.
    try {
      const cacheKey = getChannelsCacheKey(user.id, workspace.id)
      const cacheTsKey = getChannelsCacheTsKey(user.id, workspace.id)
      const cachedData = localStorage.getItem(cacheKey)
      const cachedTs = localStorage.getItem(cacheTsKey)

      if (cachedData && cachedTs) {
        const age = Date.now() - parseInt(cachedTs, 10)
        if (age < CHANNELS_CACHE_TTL) {
          const parsed = JSON.parse(cachedData) as ConversationWithDetails[]
          setConversations(parsed)
          setIsConversationsLoading(false)
          hasFreshCache = true
        }
      }
    } catch (error) {
      console.warn('Failed to read channels cache:', error)
    }

    // Refresh in background. Only show loading if no cache is available.
    loadConversations(user.id, workspace.id, { showLoading: !hasFreshCache })
  }, [router])

  useEffect(() => {
    if (!currentUser || !currentWorkspace || isConversationsLoading) return

    try {
      const cacheKey = getChannelsCacheKey(currentUser.id, currentWorkspace.id)
      const cacheTsKey = getChannelsCacheTsKey(currentUser.id, currentWorkspace.id)
      localStorage.setItem(cacheKey, JSON.stringify(conversations))
      localStorage.setItem(cacheTsKey, Date.now().toString())
    } catch (error) {
      console.warn('Failed to persist channels cache:', error)
    }
  }, [conversations, currentUser, currentWorkspace, isConversationsLoading])

  useEffect(() => {
    if (selectedChannelId) {
      loadMessages(selectedChannelId)
    }
  }, [selectedChannelId])

  // Poll for new messages every 2 seconds
  useEffect(() => {
    if (!selectedChannelId) return

    const interval = setInterval(() => {
      loadMessages(selectedChannelId)
    }, 2000)

    return () => clearInterval(interval)
  }, [selectedChannelId])

  const loadConversations = async (
    userId: string,
    workspaceId: string,
    options: { showLoading?: boolean } = {}
  ) => {
    const { showLoading = true } = options
    if (showLoading) {
      setIsConversationsLoading(true)
    }
    try {
      const response = await fetch(`/api/conversations?workspaceId=${workspaceId}`)
      const data = await response.json()
      if (data.success) {
        // Load only channels and groups
        const channelsAndGroups = data.conversations.filter(
          (c: ConversationWithDetails) => c.type === 'channel' || c.type === 'group'
        )
        setConversations(channelsAndGroups)
        
        // Don't auto-select first channel - let user choose
      }
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      setIsConversationsLoading(false)
    }
  }

  const loadMessages = async (conversationId: string) => {
    try {
      const response = await fetch(`/api/messages?conversationId=${conversationId}`)
      const data = await response.json()
      if (data.success) {
        setMessages(data.messages)
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
      // Don't clear messages on error, keep existing ones
    }
  }

  const handleSendMessage = useCallback(async (content: string, type: string = 'text', file?: File) => {
    if (!selectedChannelId || !currentUser || !content.trim()) return

    // Optimistic update: create message object inline for maximum speed
    const now = performance.now()
    const tempId = `temp-${now}`
    const timestamp = new Date().toISOString()
    
    const optimisticMessage: MessageWithSender = {
      id: tempId,
      conversation_id: selectedChannelId,
      sender_id: currentUser.id,
      sender: currentUser,
      content,
      type: type as any,
      reactions: [],
      is_edited: false,
      is_deleted: false,
      created_at: timestamp,
      updated_at: timestamp,
      metadata: file ? {
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        file_url: URL.createObjectURL(file),
        thumbnail_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      } : undefined,
    }

    // Add to UI immediately (<1ms) - synchronous state update
    setMessages(prev => [...prev, optimisticMessage])

    // Save to database
    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedChannelId,
          content,
          type,
          metadata: file ? {
            file_name: file.name,
            file_size: file.size,
            file_type: file.type,
          } : undefined,
        }),
      })
      
      const data = await response.json()
      if (data.success) {
        // Replace temp message with real one
        setMessages(prev => prev.map(msg => msg.id === tempId ? data.message : msg))
      } else {
        // Remove failed message
        setMessages(prev => prev.filter(msg => msg.id !== tempId))
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      // Remove failed message
      setMessages(prev => prev.filter(msg => msg.id !== tempId))
    }
  }, [selectedChannelId, currentUser])

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

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    try {
      const response = await fetch(`/api/messages/${messageId}`, {
        method: 'DELETE',
      })
      const data = await response.json()
      if (data.success) {
        setMessages(prev => prev.map(msg => msg.id === messageId ? data.message : msg))
      }
    } catch (error) {
      console.error('Failed to delete message:', error)
    }
  }, [])

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

  const handleCreateChannel = useCallback(async (data: { name: string; description: string; isPrivate: boolean }) => {
    if (!currentUser || !currentWorkspace) return

    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'channel',
          member_ids: [currentUser.id],
          name: data.name,
          description: data.description,
          is_private: data.isPrivate,
        }),
      })

      const result = await response.json()
      if (result.success && result.conversation) {
        // Reload conversations to get full details
        await loadConversations(currentUser.id, currentWorkspace.id, { showLoading: false })
        
        // Select the new channel
        setSelectedChannelId(result.conversation.id)
      } else {
        console.error('Failed to create channel:', result.error)
      }
    } catch (error) {
      console.error('Failed to create channel:', error)
    }
  }, [currentUser, currentWorkspace])

  const handlePinChannel = useCallback((id: string) => {
    const updated = pinConversation(id)
    if (updated) {
      setConversations(prev => prev.map(c => c.id === id ? updated : c))
    }
  }, [])

  const handleUnpinChannel = useCallback((id: string) => {
    const updated = unpinConversation(id)
    if (updated) {
      setConversations(prev => prev.map(c => c.id === id ? updated : c))
    }
  }, [])

  const handleHideChannel = useCallback((id: string) => {
    const updated = hideConversation(id)
    if (updated) {
      setConversations(prev => prev.map(c => c.id === id ? updated : c))
    }
  }, [])

  const handleDeleteChannel = useCallback((id: string) => {
    if (deleteConversation(id)) {
      setConversations(prev => prev.filter(c => c.id !== id))
      if (selectedChannelId === id) {
        setSelectedChannelId(undefined)
      }
    }
  }, [selectedChannelId])

  const handlePinMessage = useCallback((messageId: string) => {
    // TODO: Implement pin message API
    console.log('Pin message:', messageId)
  }, [])

  const handleUnpinMessage = useCallback((messageId: string) => {
    // TODO: Implement unpin message API
    console.log('Unpin message:', messageId)
  }, [])

  if (!currentUser || !currentWorkspace) {
    return (
      <div className="flex items-center justify-center h-screen text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  const selectedChannel = conversations.find(c => c.id === selectedChannelId)

  return (
    <div className="flex h-screen flex-col">
      <WorkspaceHeader 
        workspace={currentWorkspace} 
        currentUser={currentUser}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* 左侧导航栏（仅桌面端显示） */}
        {!isMobile && <AppNavigation />}

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
              : (sidebarExpanded ? '400px' : '320px')
          }}
        >
          <ChannelsPanel
            conversations={conversations}
            isLoading={isConversationsLoading}
            onSelectChannel={(id) => {
              setSelectedChannelId(id)
              if (isMobile) setSidebarOpen(false)
            }}
            onCreateChannel={() => setShowCreateChannel(true)}
            selectedChannelId={selectedChannelId}
            onPinChannel={handlePinChannel}
            onUnpinChannel={handleUnpinChannel}
            onHideChannel={handleHideChannel}
            onDeleteChannel={handleDeleteChannel}
          />
        </div>

        <div className="flex-1 flex flex-col">
          {selectedChannel ? (
            <>
              <ChatHeader 
                conversation={selectedChannel} 
                currentUser={currentUser}
                onToggleSidebar={isMobile ? () => setSidebarOpen(!sidebarOpen) : undefined}
              />
              <MessageList 
                messages={messages} 
                currentUser={currentUser}
                onEditMessage={handleEditMessage}
                onDeleteMessage={handleDeleteMessage}
                onAddReaction={handleAddReaction}
                onRemoveReaction={handleRemoveReaction}
                onPinMessage={handlePinMessage}
                onUnpinMessage={handleUnpinMessage}
              />
              <MessageInput onSendMessage={handleSendMessage} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Hash className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <h3 className="text-lg font-semibold mb-2">{t('noChannelSelected')}</h3>
                <p>{t('selectChannelToViewMessages')}</p>
              </div>
            </div>
          )}
        </div>

        {selectedChannel && (
          <ChannelInfoPanel
            conversation={selectedChannel}
            isOpen={showChannelInfo}
            onClose={() => setShowChannelInfo(false)}
          />
        )}
      </div>

      <CreateChannelDialog
        open={showCreateChannel}
        onOpenChange={setShowCreateChannel}
        onCreateChannel={handleCreateChannel}
      />
    </div>
  )
}
