import { getDeploymentRegion } from '@/config'
import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTpnsAndroidNotification } from '@/lib/push/tpns'

type NotifyNewMessageInput = {
  conversationId: string
  senderId: string
  messageId: string
  content: string
  type: string
}

type PushRegion = 'CN' | 'INTL'

type PushConversationRecord = {
  id?: string
  type?: string
  name?: string | null
}

type PushSenderRecord = {
  id?: string
  full_name?: string | null
  username?: string | null
  email?: string | null
  name?: string | null
}

function formatNotificationContent(region: PushRegion, type: string, content: string, metadata?: any): string {
  if (type === 'image') return region === 'CN' ? '图片' : 'Image'
  if (type === 'video') return region === 'CN' ? '视频' : 'Video'
  if (type === 'audio') return region === 'CN' ? '语音消息' : 'Voice message'
  if (type === 'code') return region === 'CN' ? '代码消息' : 'Code'
  if (type === 'file') return metadata?.file_name || (region === 'CN' ? '文件' : 'File')

  const text = String(content || '').trim()
  if (!text) {
    return region === 'CN' ? '新消息' : 'New message'
  }

  return text.length > 120 ? `${text.slice(0, 120)}...` : text
}

function resolveSenderName(sender: PushSenderRecord | null | undefined, region: PushRegion): string {
  const senderName = String(
    sender?.full_name || sender?.name || sender?.username || sender?.email || '',
  ).trim()

  if (senderName) return senderName
  return region === 'CN' ? '新消息' : 'Someone'
}

function buildNotificationTitle(
  region: PushRegion,
  conversation: PushConversationRecord | null | undefined,
  sender: PushSenderRecord | null | undefined,
): string {
  const senderName = resolveSenderName(sender, region)
  const conversationName = String(conversation?.name || '').trim()
  const isDirectConversation = conversation?.type === 'direct'

  if (isDirectConversation || !conversationName) {
    return senderName
  }

  return region === 'CN'
    ? `${senderName} 在 ${conversationName}`
    : `${senderName} in ${conversationName}`
}

function buildTargets(devices: any[]): { token: string; userId?: string }[] {
  return Array.from(
    new Map(
      (devices || [])
        .map((device: any) => ({
          token: String(device?.push_token || '').trim(),
          userId: String(device?.user_id || '').trim() || undefined,
          clientType: String(device?.client_type || '').trim(),
          deviceType: String(device?.device_type || '').trim(),
        }))
        .filter((device) => device.token)
        .filter((device) => device.clientType === 'android_app' || device.deviceType === 'android')
        .map((device) => [device.token, { token: device.token, userId: device.userId }]),
    ).values(),
  )
}

async function notifyIntlRecipients(input: NotifyNewMessageInput): Promise<void> {
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
    console.error('[push][INTL] Failed to load conversation members:', membershipError)
    return
  }
  if (conversationError) {
    console.error('[push][INTL] Failed to load conversation:', conversationError)
    return
  }
  if (senderError) {
    console.error('[push][INTL] Failed to load sender profile:', senderError)
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
    console.error('[push][INTL] Failed to load recipient devices:', devicesError)
    return
  }

  const targets = buildTargets(devices || [])
  if (targets.length === 0) {
    console.warn('[push][INTL] Skip TPNS send: no registered android push tokens found for recipients', {
      conversationId: input.conversationId,
      recipientIds,
    })
    return
  }

  try {
    const result = await sendTpnsAndroidNotification(
      targets,
      {
        title: buildNotificationTitle('INTL', conversation, sender),
        content: formatNotificationContent('INTL', input.type, input.content),
        customContent: {
          conversationId: input.conversationId,
          messageId: input.messageId,
          targetUrl: `/chat?conversation=${input.conversationId}`,
          type: input.type,
        },
      },
      'INTL',
    )

    if (!result.success && result.skipped) {
      console.warn('[push][INTL] TPNS send skipped:', result.skipped)
    }
  } catch (error) {
    console.error('[push][INTL] TPNS send failed:', error)
  }
}

async function notifyCnRecipients(input: NotifyNewMessageInput): Promise<void> {
  const db = getCloudBaseDb()
  if (!db) {
    console.error('[push][CN] CloudBase not configured')
    return
  }

  const cmd = db.command
  const [{ data: memberships }, { data: conversations }, { data: senders }] = await Promise.all([
    db.collection('conversation_members').where({ conversation_id: input.conversationId }).get(),
    db.collection('conversations').where({ id: input.conversationId }).limit(1).get(),
    db.collection('users').where({ id: input.senderId }).limit(1).get(),
  ])

  const recipientIds = (Array.isArray(memberships) ? memberships : [])
    .filter((membership: any) => membership?.user_id && membership.user_id !== input.senderId)
    .filter((membership: any) => membership?.notification_setting !== 'none')
    .filter((membership: any) => !membership?.deleted_at && !membership?.is_hidden)
    .map((membership: any) => String(membership.user_id).trim())
    .filter(Boolean)

  if (recipientIds.length === 0) {
    return
  }

  const devicesRes = await db
    .collection('user_devices')
    .where({ user_id: cmd.in(recipientIds) })
    .get()

  const devices = Array.isArray(devicesRes?.data) ? devicesRes.data : []
  const targets = buildTargets(devices)

  if (targets.length === 0) {
    console.warn('[push][CN] Skip TPNS send: no registered android push tokens found for recipients', {
      conversationId: input.conversationId,
      recipientIds,
    })
    return
  }

  const conversation = Array.isArray(conversations) ? conversations[0] : null
  const sender = Array.isArray(senders) ? senders[0] : null

  try {
    const result = await sendTpnsAndroidNotification(
      targets,
      {
        title: buildNotificationTitle('CN', conversation, sender),
        content: formatNotificationContent('CN', input.type, input.content),
        customContent: {
          conversationId: input.conversationId,
          messageId: input.messageId,
          targetUrl: `/chat?conversation=${input.conversationId}`,
          type: input.type,
        },
      },
      'CN',
    )

    if (!result.success && result.skipped) {
      console.warn('[push][CN] TPNS send skipped:', result.skipped)
    }
  } catch (error) {
    console.error('[push][CN] TPNS send failed:', error)
  }
}

export async function notifyRecipientsOfNewMessage(input: NotifyNewMessageInput): Promise<void> {
  if (getDeploymentRegion() === 'CN') {
    await notifyCnRecipients(input)
    return
  }

  await notifyIntlRecipients(input)
}
