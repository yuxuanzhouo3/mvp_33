'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { mockAuth } from '@/lib/mock-auth'
import { storeAuthData } from '@/lib/auth-api'
import { User } from '@/lib/types'

const MP_QUERY_KEYS = [
  'token',
  'openid',
  'expiresIn',
  'mpNickName',
  'mpAvatarUrl',
  'mpProfileTs',
  'mpCode',
]

const MP_TOKEN_PROCESSED_KEY = 'mp_login_token_processed'

/**
 * Decode a JWT payload WITHOUT verifying the signature (client-side only).
 * We trust the token because it was issued by our own server.
 */
function decodeTokenPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload
  } catch {
    return null
  }
}

function buildMiniProgramUser(params: {
  userId: string // server-side UUID from token payload.sub
  openid: string
  nickName: string
  avatarUrl: string
}): User {
  const safeOpenId = params.openid || ''
  const displayName = params.nickName || '微信用户'
  const email = safeOpenId
    ? `miniprogram_${safeOpenId}@local.wechat`
    : 'miniprogram_unknown@local.wechat'

  return {
    id: params.userId || safeOpenId || `mp_${Date.now()}`,
    email,
    username: displayName,
    full_name: displayName,
    avatar_url: params.avatarUrl || null,
    provider: 'wechat_miniprogram',
    provider_id: safeOpenId || null,
    wechat_openid: safeOpenId || null,
    region: 'cn',
    country: 'CN',
    status: 'online',
  }
}

export function MpLoginBridge() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || ''

    if (!token) return

    const openid = params.get('openid') || ''
    const mpNickName = params.get('mpNickName') || ''
    const mpAvatarUrl = params.get('mpAvatarUrl') || ''

    const processedToken = window.sessionStorage.getItem(MP_TOKEN_PROCESSED_KEY)
    if (processedToken === token) {
      // Already processed — just clean up URL params
      MP_QUERY_KEYS.forEach((key) => params.delete(key))
      const cleaned = params.toString()
      const cleanUrl = `${window.location.pathname}${cleaned ? `?${cleaned}` : ''}${window.location.hash}`
      window.history.replaceState({}, '', cleanUrl)
      return
    }

    // Mark as processed
    window.sessionStorage.setItem(MP_TOKEN_PROCESSED_KEY, token)

    // Persist token
    window.localStorage.setItem('chat_app_token', token)

    // Decode the JWT to get the real server-side user UUID
    const payload = decodeTokenPayload(token)
    const userId = payload?.sub || openid || `mp_${Date.now()}`

    const user = buildMiniProgramUser({
      userId,
      openid,
      nickName: mpNickName,
      avatarUrl: mpAvatarUrl,
    })

    // Store user via both mockAuth and auth-api for maximum compatibility
    mockAuth.setCurrentUser(user)
    storeAuthData(
      {
        id: user.id,
        email: user.email,
        username: user.username,
        full_name: user.full_name,
        avatar_url: user.avatar_url,
        department: null,
        title: null,
        status: user.status || 'online',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        provider: 'wechat_miniprogram',
        provider_id: openid || undefined,
      },
      token
    )

    // Clean URL parameters
    MP_QUERY_KEYS.forEach((key) => params.delete(key))
    const cleaned = params.toString()
    const cleanUrl = `${window.location.pathname}${cleaned ? `?${cleaned}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', cleanUrl)

    // Dispatch event for legacy listeners
    window.dispatchEvent(new Event('mpLoginSuccess'))

    // Navigate based on workspace availability
    const hasWorkspace = mockAuth.getCurrentWorkspace()
    if (hasWorkspace) {
      router.replace('/chat')
    } else {
      router.replace('/login')
    }
  }, [router])

  return null
}
