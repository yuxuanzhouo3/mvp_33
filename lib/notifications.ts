/**
 * Browser notification utilities for message alerts
 */

export interface NotificationOptions {
  title: string
  body: string
  icon?: string
  badge?: string
  tag?: string
  data?: any
  requireInteraction?: boolean
}

/**
 * Check if browser notifications are supported
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) {
    return 'denied'
  }
  return Notification.permission
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    console.warn('Browser notifications are not supported')
    return 'denied'
  }

  if (Notification.permission === 'granted') {
    return 'granted'
  }

  if (Notification.permission === 'denied') {
    console.warn('Notification permission was previously denied')
    return 'denied'
  }

  try {
    const permission = await Notification.requestPermission()
    return permission
  } catch (error) {
    console.error('Error requesting notification permission:', error)
    return 'denied'
  }
}

/**
 * Show a browser notification
 */
export function showNotification(options: NotificationOptions): Notification | null {
  if (!isNotificationSupported()) {
    console.warn('Browser notifications are not supported')
    return null
  }

  if (Notification.permission !== 'granted') {
    console.warn('Notification permission not granted')
    return null
  }

  try {
    const notification = new Notification(options.title, {
      body: options.body,
      icon: options.icon || '/favicon.ico',
      badge: options.badge || '/favicon.ico',
      tag: options.tag, // Group notifications by tag
      data: options.data,
      requireInteraction: options.requireInteraction || false,
    })

    // Auto-close notification after 5 seconds (unless requireInteraction is true)
    if (!options.requireInteraction) {
      setTimeout(() => {
        notification.close()
      }, 5000)
    }

    return notification
  } catch (error) {
    console.error('Error showing notification:', error)
    return null
  }
}

/**
 * Check if page is currently focused/visible
 */
export function isPageFocused(): boolean {
  if (typeof document === 'undefined') return false
  return document.hasFocus() && document.visibilityState === 'visible'
}

/**
 * Show notification for new message if conditions are met
 */
export async function notifyNewMessage(
  message: {
    id?: string
    content: string
    type: string
    sender_id: string
    metadata?: any
  },
  conversation: {
    id: string
    name?: string
    type: string
    members?: Array<{ id: string; full_name?: string; username?: string; email?: string }>
  },
  currentUserId: string,
  currentConversationId: string | undefined,
  currentUser: { full_name?: string; username?: string; email?: string }
): Promise<void> {
  // Don't notify if message is from current user
  if (message.sender_id === currentUserId) {
    return
  }

  // Don't notify if this is the currently selected conversation
  if (currentConversationId === conversation.id) {
    return
  }

  // Check if page is focused - if focused, we might still want to show notification
  // but only if user is viewing a different conversation
  const pageFocused = isPageFocused()

  // Format message content for notification
  let messageBody = message.content
  if (message.type === 'image') {
    messageBody = '📷 Image'
  } else if (message.type === 'file') {
    messageBody = `📎 ${message.metadata?.file_name || 'File'}`
  } else if (message.type === 'video') {
    messageBody = '🎥 Video'
  } else if (message.type === 'code') {
    messageBody = '💻 Code'
  } else if (message.type === 'audio') {
    messageBody = '🎤 Voice message'
  }

  // Truncate long messages
  if (messageBody.length > 100) {
    messageBody = messageBody.substring(0, 100) + '...'
  }

  // Get sender name
  let senderName = 'Someone'
  if (conversation.type === 'direct' && conversation.members) {
    const sender = conversation.members.find(m => m.id === message.sender_id)
    if (sender) {
      senderName = sender.full_name || sender.username || sender.email || 'Someone'
    }
  } else if (conversation.name) {
    senderName = conversation.name
  }

  // Get conversation name for notification title
  let conversationName = conversation.name
  if (!conversationName && conversation.type === 'direct' && conversation.members) {
    const otherMember = conversation.members.find(m => m.id !== currentUserId)
    if (otherMember) {
      conversationName = otherMember.full_name || otherMember.username || otherMember.email || 'Direct message'
    }
  }
  if (!conversationName) {
    conversationName = conversation.type === 'direct' ? 'Direct message' : 'Group'
  }

  // Request permission if needed
  const permission = await requestNotificationPermission()
  if (permission !== 'granted') {
    return
  }

  // Show notification
  showNotification({
    title: `${senderName}${conversation.type === 'direct' ? '' : ` in ${conversationName}`}`,
    body: messageBody,
    tag: `conversation-${conversation.id}`, // Group notifications by conversation
    data: {
      conversationId: conversation.id,
      messageId: message.id,
    },
    requireInteraction: false,
  })
}

