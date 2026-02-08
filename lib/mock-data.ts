// Mock data service for development
import { User, Workspace, WorkspaceMember, Conversation, Message, ConversationWithDetails, MessageWithSender } from './types'

// Mock users - 5 demo users for chat
export const mockUsers: User[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'alice@company.com',
    username: 'alice',
    full_name: 'Alice Zhang',
    avatar_url: '/placeholder-user.jpg',
    department: 'Engineering',
    title: 'Senior Software Engineer',
    status: 'online',
    status_message: 'Working on new features',
    created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'bob@company.com',
    username: 'bob',
    full_name: 'Bob Smith',
    avatar_url: '/placeholder-user.jpg',
    department: 'Product',
    title: 'Product Manager',
    status: 'online',
    status_message: 'In a meeting',
    created_at: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'carol@company.com',
    username: 'carol',
    full_name: 'Carol Wang',
    avatar_url: '/placeholder-user.jpg',
    department: 'Design',
    title: 'UI/UX Designer',
    status: 'away',
    status_message: 'Be right back',
    created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'david@company.com',
    username: 'david',
    full_name: 'David Lee',
    avatar_url: '/placeholder-user.jpg',
    department: 'Engineering',
    title: 'Engineering Manager',
    status: 'online',
    status_message: 'Available for questions',
    created_at: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    email: 'emma@company.com',
    username: 'emma',
    full_name: 'Emma Brown',
    avatar_url: '/placeholder-user.jpg',
    department: 'Marketing',
    title: 'Marketing Director',
    status: 'busy',
    status_message: 'Focusing on campaign',
    created_at: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
]

// Mock workspaces
export const mockWorkspaces: Workspace[] = [
  {
    id: '10000000-0000-0000-0000-000000000001',
    name: 'TechCorp',
    logo_url: '/placeholder.svg?height=50&width=50',
    domain: 'techcorp',
    owner_id: '00000000-0000-0000-0000-000000000001',
    settings: {
      allow_guest_users: false,
      max_file_size_mb: 100,
      locale: 'en',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

// Mock conversations - conversations between the 5 demo users
export const mockConversations: ConversationWithDetails[] = [
  {
    id: '30000000-0000-0000-0000-000000000001',
    workspace_id: '10000000-0000-0000-0000-000000000001',
    type: 'channel',
    name: 'general',
    description: 'General discussion for the entire team',
    created_by: '00000000-0000-0000-0000-000000000001',
    is_private: false,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    last_message_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    members: mockUsers,
    unread_count: 3,
    last_message: {
      id: 'msg-1',
      conversation_id: '30000000-0000-0000-0000-000000000001',
      sender_id: '00000000-0000-0000-0000-000000000003',
      content: 'The new design mockups are ready for review! 🎨',
      type: 'text',
      reactions: [],
      is_edited: false,
      is_deleted: false,
      created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    },
  },
  {
    id: '30000000-0000-0000-0000-000000000002',
    workspace_id: '10000000-0000-0000-0000-000000000001',
    type: 'channel',
    name: 'engineering',
    description: 'Engineering team channel',
    created_by: '00000000-0000-0000-0000-000000000004',
    is_private: true,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    last_message_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    members: [mockUsers[0], mockUsers[3]],
    unread_count: 1,
    last_message: {
      id: 'msg-2',
      conversation_id: '30000000-0000-0000-0000-000000000002',
      sender_id: '00000000-0000-0000-0000-000000000001',
      content: 'Code review for PR #234 please',
      type: 'text',
      reactions: [],
      is_edited: false,
      is_deleted: false,
      created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    },
  },
  {
    id: '30000000-0000-0000-0000-000000000003',
    workspace_id: '10000000-0000-0000-0000-000000000001',
    type: 'direct',
    created_by: '00000000-0000-0000-0000-000000000001',
    is_private: true,
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    last_message_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    members: [mockUsers[0], mockUsers[1]],
    unread_count: 0,
    last_message: {
      id: 'msg-3',
      conversation_id: '30000000-0000-0000-0000-000000000003',
      sender_id: '00000000-0000-0000-0000-000000000001',
      content: 'Perfect! Let me know when you are ready.',
      type: 'text',
      reactions: [],
      is_edited: false,
      is_deleted: false,
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    },
  },
  {
    id: '30000000-0000-0000-0000-000000000004',
    workspace_id: '10000000-0000-0000-0000-000000000001',
    type: 'group',
    name: 'Product Planning',
    description: 'Product roadmap discussions',
    created_by: '00000000-0000-0000-0000-000000000002',
    is_private: false,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    last_message_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    members: [mockUsers[1], mockUsers[2], mockUsers[4]],
    unread_count: 0,
    last_message: {
      id: 'msg-4',
      conversation_id: '30000000-0000-0000-0000-000000000004',
      sender_id: '00000000-0000-0000-0000-000000000005',
      content: 'Updated the roadmap document - please review',
      type: 'text',
      reactions: [],
      is_edited: false,
      is_deleted: false,
      created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    },
  },
  {
    id: '30000000-0000-0000-0000-000000000005',
    workspace_id: '10000000-0000-0000-0000-000000000001',
    type: 'direct',
    created_by: '00000000-0000-0000-0000-000000000001',
    is_private: true,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    last_message_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    members: [mockUsers[0], mockUsers[2]],
    unread_count: 0,
    last_message: {
      id: 'msg-5',
      conversation_id: '30000000-0000-0000-0000-000000000005',
      sender_id: '00000000-0000-0000-0000-000000000003',
      content: 'Thanks for the feedback on the design!',
      type: 'text',
      reactions: [],
      is_edited: false,
      is_deleted: false,
      created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    },
  },
  {
    id: '30000000-0000-0000-0000-000000000006',
    workspace_id: '10000000-0000-0000-0000-000000000001',
    type: 'direct',
    created_by: '00000000-0000-0000-0000-000000000001',
    is_private: true,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    last_message_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    members: [mockUsers[0], mockUsers[4]],
    unread_count: 0,
    last_message: {
      id: 'msg-6',
      conversation_id: '30000000-0000-0000-0000-000000000006',
      sender_id: '00000000-0000-0000-0000-000000000005',
      content: 'The marketing campaign is going well!',
      type: 'text',
      reactions: [],
      is_edited: false,
      is_deleted: false,
      created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
  },
]

// Get user by ID
export const getUserById = (id: string): User | undefined => {
  return mockUsers.find(u => u.id === id)
}

// Get workspace members
export const getWorkspaceMembers = (workspaceId: string): User[] => {
  return mockUsers
}

// Get user's conversations
export const getUserConversations = (userId: string, workspaceId: string): ConversationWithDetails[] => {
  return mockConversations
}

// Create a new conversation (channel, group, or direct)
export const createConversation = (
  workspaceId: string,
  type: 'channel' | 'group' | 'direct',
  createdBy: string,
  data: {
    name?: string
    description?: string
    isPrivate?: boolean
    memberIds?: string[]
  }
): ConversationWithDetails => {
  const now = new Date().toISOString()
  const conversationId = `conv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  
  // Get members - for direct, use memberIds; for channel/group, include creator
  let members: User[] = []
  if (type === 'direct' && data.memberIds) {
    members = data.memberIds.map(id => getUserById(id)!).filter(Boolean)
  } else {
    const creator = getUserById(createdBy)
    if (creator) members.push(creator)
    if (data.memberIds) {
      data.memberIds.forEach(id => {
        const user = getUserById(id)
        if (user && !members.find(m => m.id === user.id)) {
          members.push(user)
        }
      })
    }
  }

  const newConversation: ConversationWithDetails = {
    id: conversationId,
    workspace_id: workspaceId,
    type,
    name: data.name || undefined,
    description: data.description || undefined,
    created_by: createdBy,
    is_private: data.isPrivate ?? (type === 'direct'),
    created_at: now,
    updated_at: now,
    last_message_at: now,
    members,
    unread_count: 0,
    last_message: undefined,
  }

  // Add to mock conversations array
  mockConversations.push(newConversation)
  
  return newConversation
}

// Pin/unpin conversation
export const pinConversation = (conversationId: string): ConversationWithDetails | null => {
  const conversation = mockConversations.find(c => c.id === conversationId)
  if (!conversation) return null
  
  conversation.is_pinned = true
  conversation.updated_at = new Date().toISOString()
  
  return conversation
}

export const unpinConversation = (conversationId: string): ConversationWithDetails | null => {
  const conversation = mockConversations.find(c => c.id === conversationId)
  if (!conversation) return null
  
  conversation.is_pinned = false
  conversation.updated_at = new Date().toISOString()
  
  return conversation
}

// Hide/show conversation
export const hideConversation = (conversationId: string): ConversationWithDetails | null => {
  const conversation = mockConversations.find(c => c.id === conversationId)
  if (!conversation) return null
  
  conversation.is_hidden = !conversation.is_hidden
  conversation.updated_at = new Date().toISOString()
  
  return conversation
}

// Delete conversation
export const deleteConversation = (conversationId: string): boolean => {
  const index = mockConversations.findIndex(c => c.id === conversationId)
  if (index === -1) return false
  
  mockConversations.splice(index, 1)
  return true
}
