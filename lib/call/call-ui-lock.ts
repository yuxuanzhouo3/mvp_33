export type CallType = 'voice' | 'video'
export type CallDirection = 'incoming' | 'outgoing'
export type CallPhase = 'incoming' | 'outgoing' | 'active' | 'ending'

export interface CallUiLock {
  token: string
  callType: CallType
  direction: CallDirection
  conversationId: string
  phase: CallPhase
  messageId?: string
  updatedAt: number
}

let activeLock: CallUiLock | null = null
const STALE_LOCK_MS = 15000

function purgeStaleLock(): void {
  if (!activeLock) return
  if (Date.now() - activeLock.updatedAt <= STALE_LOCK_MS) return
  activeLock = null
}

export function createCallLockToken(prefix = 'call'): string {
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now()}_${rand}`
}

export function getCallUiLock(): CallUiLock | null {
  purgeStaleLock()
  return activeLock
}

export function acquireCallUiLock(lock: Omit<CallUiLock, 'updatedAt'>): boolean {
  purgeStaleLock()
  if (!activeLock) {
    activeLock = { ...lock, updatedAt: Date.now() }
    return true
  }

  const sameToken = activeLock.token === lock.token
  const sameMessage = !!lock.messageId && !!activeLock.messageId && activeLock.messageId === lock.messageId
  if (sameToken || sameMessage) {
    activeLock = { ...activeLock, ...lock, updatedAt: Date.now() }
    return true
  }

  return false
}

export function updateCallUiLock(token: string, patch: Partial<Omit<CallUiLock, 'token' | 'updatedAt'>>): void {
  purgeStaleLock()
  if (!activeLock || activeLock.token !== token) return
  activeLock = {
    ...activeLock,
    ...patch,
    updatedAt: Date.now(),
  }
}

export function releaseCallUiLock(token: string): void {
  purgeStaleLock()
  if (!activeLock) return
  if (activeLock.token !== token) return
  activeLock = null
}

export function isCallUiBusy(incoming?: { messageId?: string }): boolean {
  purgeStaleLock()
  if (!activeLock) return false
  if (activeLock.phase === 'ending') return false
  if (!incoming?.messageId) return true
  if (!activeLock.messageId) return true
  return activeLock.messageId !== incoming.messageId
}
