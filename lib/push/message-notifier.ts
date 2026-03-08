import { createAdminClient } from '@/lib/supabase/admin'
import { getDeploymentRegion } from '@/config'
import { sendTpnsAndroidNotification } from '@/lib/push/tpns'

type NotifyNewMessageInput = {
  conversationId: string
  senderId: string
  messageId: string
  content: string
  type: string
}

function formatNotificationContent(type: string, content: string, metadata?: any): string {
  if (type === 'image') return '📷 Image'
  if (type === 'video') return '🎥 Video'
  if (type === 'audio') return '🎤 Voice message'
  if (type === 'code') return '💻 Code'
  if (type === 'file') return `📎 ${metadata?.file_name || 'File'}`
  const text = String(content || '').trim()
  if (!text) return 'New message'
  return text.length > 120 ? `${text.slice(0, 120)}...` : text
}

export async function notifyRecipientsOfNewMessage(input: NotifyNewMessageInput): Promise<void> {
  if (getDeploymentRegion() !== 'INTL') {
    return
  }

  const supabase = createAdminClient()

  const [{ data: memberships, error: membershipError }, { data: conversation, error: conversationError }, { data: sender, error: senderError }] = await Promise.all([
    supabase
      .from('conversation_members')
      .select('user_id, notification_setting, deleted_at')
      .eq('conversation_id', input.conversationId)
      .is('deleted_at', null),
    supabase
      .from('conversations')
      .select('id, type, name')
      .eq('id', input.conversationId)
      .maybeSingle(),
    supabase
      .from('users')
      .select('id, full_name, username, email')
      .eq('id', input.senderId)
      .maybeSingle(),
  ])

  if (membershipError) {
    console.error('[push] Failed to load conversation members:', membershipError)
    return
  }
  if (conversationError) {
    console.error('[push] Failed to load conversation:', conversationError)
    return
  }
  if (senderError) {
    console.error('[push] Failed to load sender profile:', senderError)
    return
  }

  const recipientIds = (memberships || [])
    .filter((membership: any) => membership.user_id && membership.user_id !== input.senderId)
    .filter((membership: any) => membership.notification_setting !== 'none')
    .map((membership: any) => String(membership.user_id))

  if (recipientIds.length === 0) {
    return
  }

  const { data: devices, error: devicesError } = await supabase
    .from('user_devices')
    .select('*')
    .in('user_id', recipientIds)
    .eq('client_type', 'android_app')

  if (devicesError) {
    console.error('[push] Failed to load recipient devices:', devicesError)
    return
  }

  const targets = Array.from(
    new Map(
      (devices || [])
        .map((device: any) => ({
          token: String(device.push_token || '').trim(),
          userId: String(device.user_id || ''),
        }))
        .filter((device) => device.token)
        .map((device) => [device.token, device]),
    ).values(),
  )

  if (targets.length === 0) {
    console.warn('[push] Skip TPNS send: no registered android push tokens found for recipients', {
      conversationId: input.conversationId,
      recipientIds,
    })
    return
  }

  const senderName = String(sender?.full_name || sender?.username || sender?.email || 'Someone')
  const conversationName = String(conversation?.name || '').trim()
  const isDirectConversation = conversation?.type === 'direct'

  const title = isDirectConversation
    ? senderName
    : conversationName
      ? `${senderName} in ${conversationName}`
      : senderName

  const content = formatNotificationContent(input.type, input.content)

  try {
    const result = await sendTpnsAndroidNotification(targets, {
      title,
      content,
      customContent: {
        conversationId: input.conversationId,
        messageId: input.messageId,
        targetUrl: `/chat?conversation=${input.conversationId}`,
        type: input.type,
      },
    })

    if (!result.success && result.skipped) {
      console.warn('[push] TPNS send skipped:', result.skipped)
    }
  } catch (error) {
    console.error('[push] TPNS send failed:', error)
  }
}
