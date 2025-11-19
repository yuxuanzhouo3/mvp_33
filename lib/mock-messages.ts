// Mock message service
import { MessageWithSender, User } from './types'
import { getUserById } from './mock-data'

// In-memory message storage
const messageStore = new Map<string, MessageWithSender[]>()
let messageIdCounter = 0

// Initialize with demo messages - conversations between 5 demo users
const initMessages = (conversationId: string): MessageWithSender[] => {
  const demoMessages: MessageWithSender[] = []
  const alice = getUserById('00000000-0000-0000-0000-000000000001')!
  const bob = getUserById('00000000-0000-0000-0000-000000000002')!
  const carol = getUserById('00000000-0000-0000-0000-000000000003')!
  const david = getUserById('00000000-0000-0000-0000-000000000004')!
  const emma = getUserById('00000000-0000-0000-0000-000000000005')!
  
  if (conversationId === '30000000-0000-0000-0000-000000000001') {
    // General channel - all 5 users chatting
    demoMessages.push(
      {
        id: 'msg-gen-1',
        conversation_id: conversationId,
        sender_id: david.id,
        sender: david,
        content: 'Welcome everyone to TechCorp! Looking forward to working with you all. 👋',
        type: 'text',
        reactions: [{ emoji: '👋', user_ids: [alice.id, bob.id], count: 2 }],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg-gen-2',
        conversation_id: conversationId,
        sender_id: alice.id,
        sender: alice,
        content: 'Thanks David! Excited to be here! 🚀',
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg-gen-3',
        conversation_id: conversationId,
        sender_id: bob.id,
        sender: bob,
        content: 'Team standup at 10am today - please join!',
        type: 'text',
        reactions: [{ emoji: '✅', user_ids: [alice.id, david.id, emma.id], count: 3 }],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg-gen-4',
        conversation_id: conversationId,
        sender_id: emma.id,
        sender: emma,
        content: "Don't forget about the product launch next week! 📢",
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg-gen-5',
        conversation_id: conversationId,
        sender_id: carol.id,
        sender: carol,
        content: 'The new design mockups are ready for review! 🎨',
        type: 'text',
        reactions: [{ emoji: '👍', user_ids: [bob.id, emma.id], count: 2 }],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      }
    )
  } else if (conversationId === '30000000-0000-0000-0000-000000000002') {
    // Engineering channel - Alice and David
    demoMessages.push(
      {
        id: 'msg-eng-1',
        conversation_id: conversationId,
        sender_id: david.id,
        sender: david,
        content: 'Good morning team! Let\'s review the sprint goals.',
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg-eng-2',
        conversation_id: conversationId,
        sender_id: alice.id,
        sender: alice,
        content: 'Code review for PR #234 please',
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      }
    )
  } else if (conversationId === '30000000-0000-0000-0000-000000000003') {
    // Direct message between Alice and Bob
    demoMessages.push(
      {
        id: 'msg-dm-1',
        conversation_id: conversationId,
        sender_id: alice.id,
        sender: alice,
        content: 'Hey Bob, can we discuss the new feature requirements?',
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg-dm-2',
        conversation_id: conversationId,
        sender_id: bob.id,
        sender: bob,
        content: 'Sure! I have some time after lunch.',
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg-dm-3',
        conversation_id: conversationId,
        sender_id: alice.id,
        sender: alice,
        content: 'Perfect! Let me know when you are ready.',
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      }
    )
  } else if (conversationId === '30000000-0000-0000-0000-000000000004') {
    // Product Planning group - Bob, Carol, Emma
    demoMessages.push(
      {
        id: 'msg-prod-1',
        conversation_id: conversationId,
        sender_id: bob.id,
        sender: bob,
        content: 'Let\'s discuss the Q1 roadmap',
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg-prod-2',
        conversation_id: conversationId,
        sender_id: emma.id,
        sender: emma,
        content: 'Updated the roadmap document - please review',
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg-prod-3',
        conversation_id: conversationId,
        sender_id: carol.id,
        sender: carol,
        content: 'I\'ll review the design requirements and provide feedback.',
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      }
    )
  } else if (conversationId === '30000000-0000-0000-0000-000000000005') {
    // Direct message between Alice and Carol
    demoMessages.push(
      {
        id: 'msg-dm-ac-1',
        conversation_id: conversationId,
        sender_id: alice.id,
        sender: alice,
        content: 'Hi Carol! The design looks great. Can we make the buttons a bit larger?',
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg-dm-ac-2',
        conversation_id: conversationId,
        sender_id: carol.id,
        sender: carol,
        content: 'Thanks for the feedback on the design! I\'ll update that right away.',
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      }
    )
  } else if (conversationId === '30000000-0000-0000-0000-000000000006') {
    // Direct message between Alice and Emma
    demoMessages.push(
      {
        id: 'msg-dm-ae-1',
        conversation_id: conversationId,
        sender_id: alice.id,
        sender: alice,
        content: 'Hi Emma! How\'s the marketing campaign going?',
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'msg-dm-ae-2',
        conversation_id: conversationId,
        sender_id: emma.id,
        sender: emma,
        content: 'The marketing campaign is going well! We\'re seeing great engagement.',
        type: 'text',
        reactions: [],
        is_edited: false,
        is_deleted: false,
        created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      }
    )
  }

  return demoMessages
}

export const mockMessageService = {
  getMessages: (conversationId: string): MessageWithSender[] => {
    if (!messageStore.has(conversationId)) {
      messageStore.set(conversationId, initMessages(conversationId))
    }
    return messageStore.get(conversationId) || []
  },

  getMessageById: (messageId: string): MessageWithSender | null => {
    for (const messages of messageStore.values()) {
      const message = messages.find(m => m.id === messageId)
      if (message) return message
    }
    return null
  },

  sendMessage: (
    conversationId: string, 
    senderId: string, 
    content: string, 
    type: string = 'text',
    file?: File
  ): MessageWithSender => {
    const sender = getUserById(senderId)
    if (!sender) throw new Error('Sender not found')

    // Generate unique message ID using high-resolution time for <1ms speed
    messageIdCounter++
    const now = performance.now()
    const messageId = `msg-${now}-${messageIdCounter}`

    const newMessage: MessageWithSender = {
      id: messageId,
      conversation_id: conversationId,
      sender_id: senderId,
      sender,
      content,
      type: type as any,
      reactions: [],
      is_edited: false,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: file ? {
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        file_url: URL.createObjectURL(file),
        thumbnail_url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      } : undefined,
    }

    const messages = mockMessageService.getMessages(conversationId)
    messages.push(newMessage)
    messageStore.set(conversationId, messages)

    return newMessage
  },

  editMessage: (messageId: string, content: string): MessageWithSender | null => {
    const message = mockMessageService.getMessageById(messageId)
    if (!message) return null

    message.content = content
    message.is_edited = true
    message.updated_at = new Date().toISOString()

    return message
  },

  deleteMessage: (messageId: string): MessageWithSender | null => {
    const message = mockMessageService.getMessageById(messageId)
    if (!message) return null

    message.is_deleted = true
    message.content = 'This message has been deleted'
    message.updated_at = new Date().toISOString()

    return message
  },

  addReaction: (messageId: string, emoji: string, userId: string): MessageWithSender | null => {
    const message = mockMessageService.getMessageById(messageId)
    if (!message) return null

    const existingReaction = message.reactions.find(r => r.emoji === emoji)
    if (existingReaction) {
      if (!existingReaction.user_ids.includes(userId)) {
        existingReaction.user_ids.push(userId)
        existingReaction.count = existingReaction.user_ids.length
      }
    } else {
      message.reactions.push({
        emoji,
        user_ids: [userId],
        count: 1,
      })
    }

    message.updated_at = new Date().toISOString()
    return message
  },

  removeReaction: (messageId: string, emoji: string, userId: string): MessageWithSender | null => {
    const message = mockMessageService.getMessageById(messageId)
    if (!message) return null

    const reaction = message.reactions.find(r => r.emoji === emoji)
    if (reaction) {
      reaction.user_ids = reaction.user_ids.filter(id => id !== userId)
      reaction.count = reaction.user_ids.length

      if (reaction.count === 0) {
        message.reactions = message.reactions.filter(r => r.emoji !== emoji)
      }
    }

    message.updated_at = new Date().toISOString()
    return message
  },

  pinMessage: (messageId: string): MessageWithSender | null => {
    const message = mockMessageService.getMessageById(messageId)
    if (!message) return null

    message.is_pinned = true
    message.updated_at = new Date().toISOString()
    return message
  },

  unpinMessage: (messageId: string): MessageWithSender | null => {
    const message = mockMessageService.getMessageById(messageId)
    if (!message) return null

    message.is_pinned = false
    message.updated_at = new Date().toISOString()
    return message
  },
}
