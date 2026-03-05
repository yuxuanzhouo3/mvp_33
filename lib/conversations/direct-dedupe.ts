import { ConversationWithDetails } from '@/lib/types'

type ConversationLike = Pick<
  ConversationWithDetails,
  'id' | 'type' | 'members' | 'created_at' | 'last_message_at'
>

type DirectConversationKind = 'pair' | 'self' | 'single'

export interface DirectConversationIdentity {
  key: string
  kind: DirectConversationKind
  memberIds: string[]
}

function normalizeMemberId(member: unknown): string | null {
  if (!member) return null
  if (typeof member === 'string') return member.trim() || null
  if (typeof member === 'number') return String(member)
  if (typeof member === 'object') {
    const raw = member as Record<string, unknown>
    const directId = typeof raw.id === 'string' ? raw.id : null
    if (directId && directId.trim()) return directId.trim()
    const userId = typeof raw.user_id === 'string' ? raw.user_id : null
    if (userId && userId.trim()) return userId.trim()
  }
  return null
}

function toTimestamp(value: unknown): number {
  if (!value) return 0
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function getConversationMemberIds(conversation: ConversationLike): string[] {
  const members = Array.isArray(conversation.members) ? conversation.members : []
  return Array.from(new Set(members.map(normalizeMemberId).filter(Boolean))) as string[]
}

export function getDirectConversationIdentity(
  conversation: ConversationLike,
  currentUserId?: string,
): DirectConversationIdentity | null {
  if (conversation.type !== 'direct') return null

  const memberIds = getConversationMemberIds(conversation)
  if (memberIds.length === 0 || memberIds.length > 2) {
    return null
  }

  if (memberIds.length === 1) {
    const onlyMemberId = memberIds[0]
    const isSelf = !!currentUserId && onlyMemberId === currentUserId
    return {
      key: `${isSelf ? 'self' : 'single'}:${onlyMemberId}`,
      kind: isSelf ? 'self' : 'single',
      memberIds,
    }
  }

  const sorted = [...memberIds].sort()
  return {
    key: `pair:${sorted[0]}:${sorted[1]}`,
    kind: 'pair',
    memberIds: sorted,
  }
}

export function compareDirectConversationPriority(
  a: Pick<ConversationLike, 'id' | 'last_message_at' | 'created_at'>,
  b: Pick<ConversationLike, 'id' | 'last_message_at' | 'created_at'>,
): number {
  const aLast = toTimestamp(a.last_message_at)
  const bLast = toTimestamp(b.last_message_at)
  if (aLast !== bLast) return bLast - aLast

  const aCreated = toTimestamp(a.created_at)
  const bCreated = toTimestamp(b.created_at)
  if (aCreated !== bCreated) return aCreated - bCreated

  return String(a.id || '').localeCompare(String(b.id || ''))
}

export function dedupeDirectConversations<T extends ConversationLike>(
  conversations: T[],
  currentUserId?: string,
): T[] {
  const directByKey = new Map<string, T[]>()
  const nonDirect: T[] = []

  conversations.forEach((conversation) => {
    if (conversation.type !== 'direct') {
      nonDirect.push(conversation)
      return
    }

    const identity = getDirectConversationIdentity(conversation, currentUserId)
    if (!identity) {
      return
    }

    if (!directByKey.has(identity.key)) {
      directByKey.set(identity.key, [])
    }
    directByKey.get(identity.key)!.push(conversation)
  })

  const deduplicatedDirect: T[] = []
  directByKey.forEach((duplicates) => {
    duplicates.sort(compareDirectConversationPriority)
    deduplicatedDirect.push(duplicates[0])
  })

  return [...deduplicatedDirect, ...nonDirect]
}
