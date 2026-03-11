'use client'

import { useEffect } from 'react'
import { mockAuth } from '@/lib/mock-auth'
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

function buildMiniProgramUser(params: {
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
    id: safeOpenId || `mp_${Date.now()}`,
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
      MP_QUERY_KEYS.forEach((key) => params.delete(key))
      const cleaned = params.toString()
      const cleanUrl = `${window.location.pathname}${cleaned ? `?${cleaned}` : ''}${window.location.hash}`
      window.history.replaceState({}, '', cleanUrl)
      return
    }

    window.sessionStorage.setItem(MP_TOKEN_PROCESSED_KEY, token)
    window.localStorage.setItem('chat_app_token', token)

    const user = buildMiniProgramUser({
      openid,
      nickName: mpNickName,
      avatarUrl: mpAvatarUrl,
    })

    mockAuth.setCurrentUser(user)

    MP_QUERY_KEYS.forEach((key) => params.delete(key))
    const cleaned = params.toString()
    const cleanUrl = `${window.location.pathname}${cleaned ? `?${cleaned}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', cleanUrl)

    window.dispatchEvent(new Event('mpLoginSuccess'))
  }, [])

  return null
}
