'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { mockAuth } from '@/lib/mock-auth'
import { getUserConversations, mockUsers, createConversation, pinConversation, unpinConversation, hideConversation, deleteConversation } from '@/lib/mock-data'
import { mockMessageService } from '@/lib/mock-messages'
import { Sidebar } from '@/components/chat/sidebar'
import { WorkspaceHeader } from '@/components/chat/workspace-header'
import { ChatHeader } from '@/components/chat/chat-header'
import { MessageList } from '@/components/chat/message-list'
import { MessageInput } from '@/components/chat/message-input'
import { NewConversationDialog } from '@/components/contacts/new-conversation-dialog'
import { User, Workspace, ConversationWithDetails, MessageWithSender } from '@/lib/types'
import { MessageSquare } from 'lucide-react'

export default function ChatPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string>()
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [sidebarExpanded, setSidebarExpanded] = useState(false)

  useEffect(() => {
    const user = mockAuth.getCurrentUser()
    const workspace = mockAuth.getCurrentWorkspace()

    if (!user || !workspace) {
      router.push('/login')
      return
    }

    setCurrentUser(user)
    setCurrentWorkspace(workspace)

    const userConversations = getUserConversations(user.id, workspace.id)
    setConversations(userConversations)
    
    if (userConversations.length > 0) {
      setSelectedConversationId(userConversations[0].id)
    }
  }, [router])

  useEffect(() => {
    if (selectedConversationId) {
      const conversationMessages = mockMessageService.getMessages(selectedConversationId)
      setMessages(conversationMessages)
    }
  }, [selectedConversationId])

  const handleNewConversation = useCallback(() => {
    setShowNewConversation(true)
  }, [])

  const handleSendMessage = useCallback((content: string, type: string = 'text', file?: File) => {
    if (!selectedConversationId || !currentUser || !content.trim()) return

    // Optimistic update: create message object inline for maximum speed
    const now = performance.now()
    const tempId = `temp-${now}`
    const timestamp = new Date().toISOString()
    
    const optimisticMessage: MessageWithSender = {
      id: tempId,
      conversation_id: selectedConversationId,
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
        selectedConversationId,
        currentUser.id,
        content,
        type,
        file
      )
      
      // Replace temp message with real one
      setMessages(prev => prev.map(msg => msg.id === tempId ? newMessage : msg))
    })
  }, [selectedConversationId, currentUser])

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

  const handleCreateDirect = useCallback((userId: string) => {
    if (!currentUser || !currentWorkspace) return

    // Check if direct conversation already exists
    const existingDirect = conversations.find(
      c => c.type === 'direct' && 
      c.members.some(m => m.id === userId) && 
      c.members.some(m => m.id === currentUser.id) &&
      c.members.length === 2
    )

    if (existingDirect) {
      // If exists, just select it
      setSelectedConversationId(existingDirect.id)
      return
    }

    const newDirect = createConversation(
      currentWorkspace.id,
      'direct',
      currentUser.id,
      {
        memberIds: [currentUser.id, userId],
      }
    )

    // Add to conversations list and select it
    setConversations(prev => [...prev, newDirect])
    setSelectedConversationId(newDirect.id)
    
    // Initialize empty messages for the new conversation
    mockMessageService.getMessages(newDirect.id)
  }, [currentUser, currentWorkspace, conversations])

  const handleCreateGroup = useCallback((userIds: string[], name: string) => {
    if (!currentUser || !currentWorkspace) return

    const newGroup = createConversation(
      currentWorkspace.id,
      'group',
      currentUser.id,
      {
        name,
        memberIds: [currentUser.id, ...userIds], // Include creator
      }
    )

    // Add to conversations list and select it
    setConversations(prev => [...prev, newGroup])
    setSelectedConversationId(newGroup.id)
    
    // Initialize empty messages for the new group
    mockMessageService.getMessages(newGroup.id)
  }, [currentUser, currentWorkspace])

  const handlePinConversation = useCallback((id: string) => {
    const updated = pinConversation(id)
    if (updated) {
      setConversations(prev => prev.map(c => c.id === id ? updated : c))
    }
  }, [])

  const handleUnpinConversation = useCallback((id: string) => {
    const updated = unpinConversation(id)
    if (updated) {
      setConversations(prev => prev.map(c => c.id === id ? updated : c))
    }
  }, [])

  const handleHideConversation = useCallback((id: string) => {
    const updated = hideConversation(id)
    if (updated) {
      setConversations(prev => prev.map(c => c.id === id ? updated : c))
    }
  }, [])

  const handleDeleteConversation = useCallback((id: string) => {
    if (deleteConversation(id)) {
      setConversations(prev => prev.filter(c => c.id !== id))
      if (selectedConversationId === id) {
        setSelectedConversationId(undefined)
      }
    }
  }, [selectedConversationId])

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

  const selectedConversation = conversations.find(c => c.id === selectedConversationId)

  return (
    <div className="flex h-screen flex-col">
      <WorkspaceHeader workspace={currentWorkspace} currentUser={currentUser} />

      <div className="flex flex-1 overflow-hidden">
        <div 
          className="transition-all duration-300 ease-in-out relative"
          style={{ width: sidebarExpanded ? '400px' : '320px' }}
        >
          <Sidebar
            conversations={conversations}
            currentConversationId={selectedConversationId}
            currentUser={currentUser}
            onSelectConversation={setSelectedConversationId}
            onNewConversation={handleNewConversation}
            expanded={sidebarExpanded}
            onToggleExpand={() => setSidebarExpanded(!sidebarExpanded)}
            onPinConversation={handlePinConversation}
            onUnpinConversation={handleUnpinConversation}
            onHideConversation={handleHideConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        </div>

        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              <ChatHeader 
                conversation={selectedConversation} 
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
                <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <h3 className="text-lg font-semibold mb-2">No conversation selected</h3>
                <p>Select a conversation to start messaging</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <NewConversationDialog
        open={showNewConversation}
        onOpenChange={setShowNewConversation}
        users={mockUsers}
        currentUser={currentUser}
        onCreateDirect={handleCreateDirect}
        onCreateGroup={handleCreateGroup}
      />
    </div>
  )
}
