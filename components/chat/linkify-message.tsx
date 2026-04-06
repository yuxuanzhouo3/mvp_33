'use client'

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Loader2, X, UserPlus, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IS_DOMESTIC_VERSION } from '@/config'
import { toast } from 'sonner'

const t = (zh: string, en: string) => (IS_DOMESTIC_VERSION ? zh : en)

/** Regex for generic URLs */
const URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/g

/** Check if a URL is a group invite link */
function parseGroupInviteUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const match = u.pathname.match(/^\/join\/group\/([a-zA-Z0-9]+)$/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Group preview data shape (from GET /api/groups/join?code=xxx)      */
/* ------------------------------------------------------------------ */
interface GroupPreview {
  id: string
  name: string
  avatar_url: string | null
  member_count: number
  description: string | null
}

/* ------------------------------------------------------------------ */
/*  WeChat-style inline preview dialog                                 */
/* ------------------------------------------------------------------ */
function GroupPreviewDialog({
  group,
  code,
  onClose,
}: {
  group: GroupPreview
  code: string
  onClose: () => void
}) {
  const router = useRouter()
  const [joining, setJoining] = useState(false)

  const handleJoin = async () => {
    if (joining) return
    setJoining(true)
    try {
      const res = await fetch('/api/groups/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()

      if (data.success && data.conversation_id) {
        if (data.already_member) {
          toast(t('你已经是群成员了', 'You are already a member'), {
            icon: <CheckCircle2 className="h-5 w-5 text-blue-500" />,
            description: t('正在跳转到群聊...', 'Redirecting to the group...'),
          })
        } else {
          toast.success(t('🎉 成功加入群聊！', '🎉 Successfully joined!'), {
            description: group.name,
          })
        }
        onClose()
        // Use window.location to force full navigation (router.push doesn't
        // reliably trigger conversation selection when already on /chat).
        // The chat page reads the param as "conversation", not "conversationId".
        setTimeout(() => {
          window.location.href = `/chat?conversation=${data.conversation_id}`
        }, 600) // small delay so the user sees the toast
      } else if (res.status === 401) {
        toast.info(t('请先登录后再加入', 'Please log in to join'))
        router.push(`/login?redirect=/join/group/${code}`)
      } else if (res.status === 410) {
        toast.error(t('😔 邀请链接已过期', '😔 Invite link expired'), {
          description: t('请联系群成员获取新链接', 'Ask a group member for a new link'),
        })
      } else if (res.status === 404) {
        toast.error(t('群聊不存在或已解散', 'Group not found or disbanded'))
      } else {
        toast.error(t('加入失败', 'Failed to join'), {
          description: data.error || t('请稍后重试', 'Please try again later'),
        })
      }
    } catch {
      toast.error(t('网络出错啦', 'Network error'), {
        description: t('请检查网络后重试', 'Check your connection and try again'),
      })
    } finally {
      setJoining(false)
    }
  }

  return (
    /* Full-screen overlay */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      {/* Card */}
      <div
        className="relative w-[340px] max-w-[90vw] rounded-2xl bg-background shadow-2xl border overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 h-7 w-7 rounded-full flex items-center justify-center hover:bg-accent transition-colors z-10"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header gradient */}
        <div
          className="h-24 w-full"
          style={{
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%)',
          }}
        />

        {/* Group avatar overlapping the header */}
        <div className="flex flex-col items-center -mt-10 px-6 pb-6">
          <div className="w-20 h-20 rounded-2xl border-4 border-background shadow-lg flex items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-500 to-purple-600">
            {group.avatar_url ? (
              <img
                src={group.avatar_url}
                alt={group.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Users className="h-9 w-9 text-white" />
            )}
          </div>

          {/* Group name */}
          <h3 className="mt-3 text-lg font-bold text-foreground text-center truncate max-w-full">
            {group.name}
          </h3>

          {/* Description */}
          {group.description && (
            <p className="mt-1 text-xs text-muted-foreground text-center line-clamp-2 max-w-full">
              {group.description}
            </p>
          )}

          {/* Member count */}
          <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>
              {group.member_count} {t('位成员', 'members')}
            </span>
          </div>

          {/* Invite hint */}
          <p className="mt-4 text-xs text-muted-foreground/70 text-center">
            {t('邀请你加入群聊', 'You are invited to join this group')}
          </p>

          {/* Join button */}
          <button
            onClick={handleJoin}
            disabled={joining}
            className={cn(
              'mt-4 w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200',
              'bg-gradient-to-r from-indigo-500 to-purple-600 text-white',
              'hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg',
              'active:scale-[0.98]',
              'disabled:opacity-60 disabled:cursor-wait'
            )}
          >
            {joining ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('加入中...', 'Joining...')}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <UserPlus className="h-4 w-4" />
                {t('加入群聊', 'Join Group')}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  The invite card shown inside chat messages                         */
/* ------------------------------------------------------------------ */
function GroupInviteCard({ code }: { code: string }) {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<GroupPreview | null>(null)
  const [showDialog, setShowDialog] = useState(false)

  const handleClick = useCallback(async () => {
    if (loading) return
    // If we already have preview data, just show the dialog
    if (preview) {
      setShowDialog(true)
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/groups/join?code=${code}`)
      const data = await res.json()

      if (data.success && data.group) {
        setPreview(data.group)
        setShowDialog(true)
      } else if (res.status === 410) {
        toast.error(t('该邀请链接已过期', 'This invite link has expired'), {
          icon: <Clock className="h-5 w-5" />,
          description: t('请联系群成员获取新链接', 'Ask a member for a new link'),
        })
      } else if (res.status === 404) {
        toast.error(t('群聊不存在', 'Group not found'), {
          icon: <AlertCircle className="h-5 w-5" />,
          description: t('该群聊可能已解散', 'The group may have been disbanded'),
        })
      } else {
        toast.error(data.error || t('无法加载群信息', 'Unable to load group info'))
      }
    } catch {
      toast.error(t('网络错误，请重试', 'Network error, please try again'))
    } finally {
      setLoading(false)
    }
  }, [code, loading, preview])

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={cn(
          'block w-full text-left my-1 rounded-xl overflow-hidden border cursor-pointer',
          'bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40',
          'border-indigo-200/60 dark:border-indigo-800/50',
          'hover:shadow-md active:scale-[0.98] transition-all duration-200',
          'max-w-[280px]',
          loading && 'opacity-70 cursor-wait'
        )}
      >
        <div className="flex items-center gap-3 px-3.5 py-3">
          <div
            className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' }}
          >
            {loading ? (
              <Loader2 size={20} color="white" className="animate-spin" />
            ) : (
              <Users size={20} color="white" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {t('群聊邀请', 'Group Invitation')}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading
                ? t('加载中...', 'Loading...')
                : t('点击查看并加入', 'Tap to preview & join')}
            </p>
          </div>
          {!loading && (
            <svg className="shrink-0 w-4 h-4 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          )}
        </div>
      </button>

      {/* WeChat-style preview dialog */}
      {showDialog && preview && (
        <GroupPreviewDialog
          group={preview}
          code={code}
          onClose={() => setShowDialog(false)}
        />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Linkify utility: parse text → React nodes                          */
/* ------------------------------------------------------------------ */

/**
 * Takes a plain-text message string and returns React elements with:
 * 1. Group invite URLs → rich inline card (opens preview dialog)
 * 2. Other URLs → clickable links
 * 3. Plain text → text nodes
 */
export function linkifyMessageContent(text: string): React.ReactNode {
  if (!text) return text

  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  // Reset regex
  URL_REGEX.lastIndex = 0

  while ((match = URL_REGEX.exec(text)) !== null) {
    const url = match[0]
    const startIdx = match.index

    // Push text before the URL
    if (startIdx > lastIndex) {
      parts.push(text.slice(lastIndex, startIdx))
    }

    const inviteCode = parseGroupInviteUrl(url)
    if (inviteCode) {
      parts.push(<GroupInviteCard key={`invite-${startIdx}`} code={inviteCode} />)
    } else {
      parts.push(
        <a
          key={`link-${startIdx}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 break-all"
        >
          {url}
        </a>
      )
    }

    lastIndex = startIdx + url.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? <>{parts}</> : text
}
