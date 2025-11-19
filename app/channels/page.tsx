'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { mockAuth } from '@/lib/mock-auth'
import { getUserConversations, mockUsers, createConversation, pinConversation, unpinConversation, hideConversation, deleteConversation } from '@/lib/mock-data'
import { mockMessageService } from '@/lib/mock-messages'
import { WorkspaceHeader } from '@/components/chat/workspace-header'
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

export default function ChannelsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string>()
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [showChannelInfo, setShowChannelInfo] = useState(false)
  const [showCreateChannel, setShowCreateChannel] = useState(false)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  useEffect(() => {
    const user = mockAuth.getCurrentUser()
    const workspace = mockAuth.getCurrentWorkspace()

    if (!user || !workspace) {
      router.push('/login')
      return
    }

    setCurrentUser(user)
    setCurrentWorkspace(workspace)

    // Load only channels and groups
    const allConversations = getUserConversations(user.id, workspace.id)
    const channelsAndGroups = allConversations.filter(
      c => c.type === 'channel' || c.type === 'group'
    )
    setConversations(channelsAndGroups)
    
    if (channelsAndGroups.length > 0) {
      setSelectedChannelId(channelsAndGroups[0].id)
    }
  }, [router])

  useEffect(() => {
    if (selectedChannelId) {
      const channelMessages = mockMessageService.getMessages(selectedChannelId)
      setMessages(channelMessages)
    }
  }, [selectedChannelId])

  const handleSendMessage = useCallback((content: string, type: string = 'text', file?: File) => {
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

    // Sync with service asynchronously (non-blocking)
    Promise.resolve().then(() => {
      const newMessage = mockMessageService.sendMessage(
        selectedChannelId,
        currentUser.id,
        content,
        type,
        file
      )
      
      // Replace temp message with real one
      setMessages(prev => prev.map(msg => msg.id === tempId ? newMessage : msg))
    })
  }, [selectedChannelId, currentUser])

  const handleEditMessage = useCallback((messageId: string, content: string) => {
    const updatedMessage = mockMessageService.editMessage(messageId, content)
    if (updatedMessage) {
      setMessages(prev => prev.map(msg => msg.id === messageId ? updatedMessage : msg))
    }
  }, [])

  const handleDeleteMessage = useCallback((messageId: string) => {
    const deletedMessage = mockMessageService.deleteMessage(messageId)
    if (deletedMessage) {
      setMessages(prev => prev.map(msg => msg.id === messageId ? deletedMessage : msg))
    }
  }, [])

  const handleAddReaction = useCallback((messageId: string, emoji: string) => {
    if (!currentUser) return
    const updatedMessage = mockMessageService.addReaction(messageId, emoji, currentUser.id)
    if (updatedMessage) {
      setMessages(prev => prev.map(msg => msg.id === messageId ? updatedMessage : msg))
    }
  }, [currentUser])

  const handleRemoveReaction = useCallback((messageId: string, emoji: string) => {
    if (!currentUser) return
    const updatedMessage = mockMessageService.removeReaction(messageId, emoji, currentUser.id)
    if (updatedMessage) {
      setMessages(prev => prev.map(msg => msg.id === messageId ? updatedMessage : msg))
    }
  }, [currentUser])

  const handleCreateChannel = useCallback((data: { name: string; description: string; isPrivate: boolean }) => {
    if (!currentUser || !currentWorkspace) return

    const newChannel = createConversation(
      currentWorkspace.id,
      'channel',
      currentUser.id,
      {
        name: data.name,
        description: data.description,
        isPrivate: data.isPrivate,
        memberIds: [currentUser.id], // Creator is automatically a member
      }
    )

    // Add to conversations list and select it
    setConversations(prev => [...prev, newChannel])
    setSelectedChannelId(newChannel.id)
    
    // Initialize empty messages for the new channel
    mockMessageService.getMessages(newChannel.id)
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
    const updated = mockMessageService.pinMessage(messageId)
    if (updated) {
      setMessages(prev => prev.map(msg => msg.id === messageId ? updated : msg))
    }
  }, [])

  const handleUnpinMessage = useCallback((messageId: string) => {
    const updated = mockMessageService.unpinMessage(messageId)
    if (updated) {
      setMessages(prev => prev.map(msg => msg.id === messageId ? updated : msg))
    }
  }, [])

  if (!currentUser || !currentWorkspace) {
    return null
  }

  const selectedChannel = conversations.find(c => c.id === selectedChannelId)

  return (
    <div className="flex h-screen flex-col">
      <WorkspaceHeader workspace={currentWorkspace} currentUser={currentUser} />

      <div className="flex flex-1 overflow-hidden">
        <ChannelsPanel
          conversations={conversations}
          onSelectChannel={setSelectedChannelId}
          onCreateChannel={() => setShowCreateChannel(true)}
          selectedChannelId={selectedChannelId}
          onPinChannel={handlePinChannel}
          onUnpinChannel={handleUnpinChannel}
          onHideChannel={handleHideChannel}
          onDeleteChannel={handleDeleteChannel}
        />

        <div className="flex-1 flex flex-col">
          {selectedChannel ? (
            <>
              <ChatHeader 
                conversation={selectedChannel} 
                currentUser={currentUser} 
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
