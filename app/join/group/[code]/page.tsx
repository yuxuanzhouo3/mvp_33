'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Users, MessageSquare, LoaderCircle, AlertCircle, CheckCircle2 } from 'lucide-react'
import { mockAuth } from '@/lib/mock-auth'
import { IS_DOMESTIC_VERSION } from '@/config'

interface GroupInfo {
  id: string
  name: string
  avatar_url: string | null
  member_count: number
  description: string | null
}

type PageState =
  | { status: 'loading' }
  | { status: 'expired' }
  | { status: 'not_found' }
  | { status: 'ready'; group: GroupInfo; expires_at: string }
  | { status: 'joining'; group: GroupInfo; expires_at: string }
  | { status: 'joined'; conversationId: string }
  | { status: 'error'; message: string }

/** i18n helper – CN deployment shows Chinese, INTL shows English */
const t = (zh: string, en: string) => (IS_DOMESTIC_VERSION ? zh : en)

export default function JoinGroupPage() {
  const params = useParams()
  const router = useRouter()
  const code = params?.code as string
  const [state, setState] = useState<PageState>({ status: 'loading' })
  const currentUser = mockAuth.getCurrentUser()
  const isLoggedIn = !!currentUser

  const loadGroupInfo = useCallback(async () => {
    if (!code) {
      setState({ status: 'not_found' })
      return
    }
    try {
      const res = await fetch(`/api/groups/join?code=${encodeURIComponent(code)}`)
      const data = await res.json()

      if (res.status === 410 || data.is_expired) {
        setState({ status: 'expired' })
        return
      }
      if (!res.ok || !data.success) {
        setState({ status: 'not_found' })
        return
      }
      setState({ status: 'ready', group: data.group, expires_at: data.expires_at })
    } catch {
      setState({ status: 'error', message: t('网络错误，请稍后重试', 'Network error, please try again later') })
    }
  }, [code])

  useEffect(() => {
    loadGroupInfo()
  }, [loadGroupInfo])

  const handleJoin = async () => {
    if (!isLoggedIn) {
      // Redirect to login, then come back
      router.push(`/login?redirect=${encodeURIComponent(`/join/group/${code}`)}`)
      return
    }

    // Preserve group info while joining
    setState((prev) => {
      if (prev.status === 'ready') {
        return { status: 'joining', group: prev.group, expires_at: prev.expires_at }
      }
      return prev
    })

    try {
      const res = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()

      if (res.status === 410 || data.is_expired) {
        setState({ status: 'expired' })
        return
      }
      if (!res.ok || !data.success) {
        setState({ status: 'error', message: data.error || t('加入失败，请重试', 'Failed to join, please try again') })
        return
      }
      setState({ status: 'joined', conversationId: data.conversation_id })
      // Auto-navigate after brief success display
      setTimeout(() => {
        router.push(`/chat?conversation=${data.conversation_id}`)
      }, 1200)
    } catch {
      setState({ status: 'error', message: t('网络错误，请稍后重试', 'Network error, please try again later') })
    }
  }

  const handleEnter = (conversationId: string) => {
    router.push(`/chat?conversation=${conversationId}`)
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f0f4ff 0%, #faf0ff 50%, #f0fff4 100%)',
        padding: '24px',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* App logo bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '40px' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <MessageSquare size={18} color="white" />
        </div>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>MornChat</span>
      </div>

      {/* Card */}
      <div style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px)',
        borderRadius: 24,
        boxShadow: '0 8px 32px rgba(99,102,241,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '40px 32px',
        maxWidth: 420,
        width: '100%',
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.8)',
      }}>

        {/* Loading */}
        {state.status === 'loading' && (
          <div style={{ padding: '24px 0' }}>
            <LoaderCircle size={40} color="#6366f1" style={{ margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#6b7280', fontSize: 15 }}>{t('正在加载群聊信息...', 'Loading group info...')}</p>
          </div>
        )}

        {/* Expired */}
        {state.status === 'expired' && (
          <div>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              {t('邀请链接已过期', 'Invite Link Expired')}
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
              {t(
                '该邀请链接已失效（有效期 7 天）。\n请联系群主重新生成邀请链接。',
                'This invite link has expired (valid for 7 days).\nPlease ask the group owner to generate a new one.'
              )}
            </p>
          </div>
        )}

        {/* Not found */}
        {state.status === 'not_found' && (
          <div>
            <AlertCircle size={48} color="#ef4444" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              {t('群聊不存在', 'Group Not Found')}
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280' }}>
              {t('该群聊已解散或邀请链接无效。', 'This group has been disbanded or the invite link is invalid.')}
            </p>
          </div>
        )}

        {/* Error */}
        {state.status === 'error' && (
          <div>
            <AlertCircle size={48} color="#f59e0b" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              {t('出错了', 'Something Went Wrong')}
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>{state.message}</p>
            <button
              onClick={loadGroupInfo}
              style={{
                padding: '10px 24px',
                borderRadius: 12,
                background: '#6366f1',
                color: 'white',
                fontWeight: 600,
                fontSize: 14,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {t('重试', 'Retry')}
            </button>
          </div>
        )}

        {/* Joined success */}
        {state.status === 'joined' && (
          <div>
            <CheckCircle2 size={56} color="#10b981" style={{ margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              {t('加入成功！', 'Joined Successfully!')}
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
              {t('正在跳转到群聊...', 'Redirecting to chat...')}
            </p>
            <button
              onClick={() => handleEnter(state.conversationId)}
              style={{
                padding: '12px 32px',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                color: 'white',
                fontWeight: 700,
                fontSize: 15,
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
              }}
            >
              {t('进入群聊', 'Enter Chat')}
            </button>
          </div>
        )}

        {/* Ready / Joining – group info preview */}
        {(state.status === 'ready' || state.status === 'joining') && (() => {
          const group = state.group
          const isJoining = state.status === 'joining'

          return (
            <div>
              {/* Group avatar */}
              {group.avatar_url ? (
                <img
                  src={group.avatar_url}
                  alt={group.name}
                  style={{
                    width: 80, height: 80, borderRadius: 20,
                    margin: '0 auto 16px',
                    objectFit: 'cover',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                  }}
                />
              ) : (
                <div style={{
                  width: 80, height: 80, borderRadius: 20,
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                  boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
                }}>
                  <Users size={36} color="white" />
                </div>
              )}

              {/* Group name */}
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 6, lineHeight: 1.3 }}>
                {group.name}
              </h1>

              {/* Member count */}
              <p style={{ fontSize: 14, color: '#6b7280', marginBottom: group.description ? 10 : 28 }}>
                {t(`当前 ${group.member_count} 位成员`, `${group.member_count} members`)}
              </p>

              {/* Description */}
              {group.description && (
                <p style={{
                  fontSize: 13, color: '#9ca3af',
                  background: '#f9fafb',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginBottom: 24,
                  lineHeight: 1.6,
                  textAlign: 'left',
                }}>
                  {group.description}
                </p>
              )}

              {/* CTA button */}
              <button
                onClick={handleJoin}
                disabled={isJoining}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: 14,
                  background: isJoining
                    ? '#a5b4fc'
                    : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: 16,
                  border: 'none',
                  cursor: isJoining ? 'not-allowed' : 'pointer',
                  boxShadow: isJoining ? 'none' : '0 4px 14px rgba(99,102,241,0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all 0.2s ease',
                }}
              >
                {isJoining ? (
                  <>
                    <LoaderCircle size={18} style={{ animation: 'spin 1s linear infinite' }} />
                    {t('正在加入...', 'Joining...')}
                  </>
                ) : isLoggedIn ? (
                  t('加入群聊', 'Join Group')
                ) : (
                  t('登录后加入群聊', 'Log in to Join')
                )}
              </button>

              {/* Expire hint */}
              <p style={{ fontSize: 12, color: '#d1d5db', marginTop: 14 }}>
                {t('链接 7 天内有效', 'Link valid for 7 days')}
              </p>
            </div>
          )
        })()}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
