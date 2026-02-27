'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Bell, X, Pin, Send, Shield, Loader2, Edit2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

interface Announcement {
  id: string
  workspace_id: string
  title: string
  content: string
  is_pinned: boolean
  created_at: string
  updated_at: string
  creator: {
    id: string
    full_name: string
    avatar_url: string | null
  } | null
}

interface GlobalAnnouncementProps {
  isOpen: boolean
  onClose: () => void
  workspaceId: string
}

export function GlobalAnnouncement({ isOpen, onClose, workspaceId }: GlobalAnnouncementProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null)
  const [deletingAnnouncementId, setDeletingAnnouncementId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isPublishing, setIsPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const formatTime = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }
    return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const loadAnnouncements = useCallback(async () => {
    if (!workspaceId) {
      setAnnouncements([])
      setCanManage(false)
      setCurrentUserRole(null)
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/workspace-announcements?workspaceId=${encodeURIComponent(workspaceId)}`
      )
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load announcements')
      }

      setAnnouncements(data.announcements || [])
      setCanManage(Boolean(data.canManage))
      setCurrentUserRole(data.currentUserRole || null)
    } catch (loadError: any) {
      setError(loadError.message || (language === 'zh' ? '加载公告失败' : 'Failed to load announcements'))
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId, language])

  useEffect(() => {
    if (isOpen) {
      loadAnnouncements()
    }
  }, [isOpen, loadAnnouncements])

  const resetEditor = () => {
    setEditingAnnouncementId(null)
    setTitle('')
    setContent('')
    setPublishError(null)
  }

  const handleStartEdit = (announcement: Announcement) => {
    setEditingAnnouncementId(announcement.id)
    setTitle(announcement.title)
    setContent(announcement.content)
    setPublishError(null)
  }

  const handlePublish = async () => {
    if (!workspaceId || !title.trim() || !content.trim() || isPublishing) {
      return
    }

    setIsPublishing(true)
    setPublishError(null)

    try {
      const response = await fetch('/api/workspace-announcements', {
        method: editingAnnouncementId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspaceId || undefined,
          announcementId: editingAnnouncementId || undefined,
          title: title.trim(),
          content: content.trim(),
        }),
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to publish announcement')
      }

      resetEditor()
      await loadAnnouncements()
    } catch (publishErr: any) {
      setPublishError(publishErr.message || (language === 'zh' ? '发布公告失败' : 'Failed to publish announcement'))
    } finally {
      setIsPublishing(false)
    }
  }

  const handleDelete = async (announcementId: string) => {
    const shouldDelete = confirm(
      language === 'zh' ? '确定删除这条公告吗？' : 'Are you sure you want to delete this announcement?'
    )
    if (!shouldDelete) {
      return
    }

    setDeletingAnnouncementId(announcementId)
    try {
      const response = await fetch('/api/workspace-announcements', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcementId }),
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete announcement')
      }

      if (editingAnnouncementId === announcementId) {
        resetEditor()
      }
      await loadAnnouncements()
    } catch (deleteErr: any) {
      setPublishError(deleteErr.message || (language === 'zh' ? '删除公告失败' : 'Failed to delete announcement'))
    } finally {
      setDeletingAnnouncementId(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="h-16 border-b flex items-center justify-between px-6 bg-background/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
            <Bell size={20} />
          </div>
          <div>
            <div className="font-bold flex items-center">
              {t('globalAnnouncement')}
            </div>
            <div className="text-xs text-muted-foreground">
              {language === 'zh' ? '官方发布' : 'Official Release'}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-accent rounded-full text-muted-foreground transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Announcements List */}
      <ScrollArea className="flex-1 p-6">
        <div className="space-y-4">
          {canManage && (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="font-semibold text-sm">
                {editingAnnouncementId
                  ? (language === 'zh' ? '编辑工作区公告' : 'Edit workspace announcement')
                  : (language === 'zh' ? '发布工作区公告' : 'Publish workspace announcement')}
              </div>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                placeholder={language === 'zh' ? '公告标题（必填）' : 'Announcement title (required)'}
              />
              <Textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                maxLength={5000}
                rows={4}
                placeholder={language === 'zh' ? '输入公告内容...' : 'Write announcement content...'}
              />
              {publishError && (
                <div className="text-xs text-destructive">{publishError}</div>
              )}
              <div className="flex justify-end gap-2">
                {editingAnnouncementId && (
                  <Button
                    onClick={resetEditor}
                    variant="outline"
                    size="sm"
                    disabled={isPublishing}
                  >
                    {language === 'zh' ? '取消编辑' : 'Cancel'}
                  </Button>
                )}
                <Button
                  onClick={handlePublish}
                  disabled={isPublishing || !title.trim() || !content.trim()}
                  size="sm"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {editingAnnouncementId
                        ? (language === 'zh' ? '更新中...' : 'Updating...')
                        : (language === 'zh' ? '发布中...' : 'Publishing...')}
                    </>
                  ) : (
                    <>
                      {editingAnnouncementId ? (
                        <Edit2 className="mr-2 h-4 w-4" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      {editingAnnouncementId
                        ? (language === 'zh' ? '更新公告' : 'Update')
                        : (language === 'zh' ? '发布公告' : 'Publish')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {!canManage && currentUserRole && (
            <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
              {language === 'zh'
                ? '仅工作区 Owner / Admin 可发布公告，你当前可查看公告。'
                : 'Only workspace owner/admin can publish announcements. You have read-only access.'}
            </div>
          )}

          {!workspaceId && (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground text-center">
              {language === 'zh' ? '请先选择工作区' : 'Please select a workspace first'}
            </div>
          )}

          {isLoading && (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {!isLoading && !error && workspaceId && announcements.length === 0 && (
            <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">
              {language === 'zh' ? '当前工作区暂无公告' : 'No announcements for this workspace yet'}
            </div>
          )}

          {!isLoading && !error && announcements.map((announcement) => {
            const creatorName = announcement.creator?.full_name || (language === 'zh' ? '管理员' : 'Admin')

            return (
              <div
                key={announcement.id}
                className={cn(
                  'rounded-xl border p-4 transition-all hover:shadow-md',
                  announcement.is_pinned
                    ? 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800'
                    : 'bg-card'
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {announcement.is_pinned && (
                      <Pin className="h-4 w-4 text-blue-500" />
                    )}
                    <h3 className="font-semibold text-lg">{announcement.title}</h3>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleStartEdit(announcement)}
                        disabled={isPublishing || deletingAnnouncementId === announcement.id}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDelete(announcement.id)}
                        disabled={deletingAnnouncementId === announcement.id || isPublishing}
                      >
                        {deletingAnnouncementId === announcement.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed mb-4 whitespace-pre-wrap">
                  {announcement.content}
                </p>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={announcement.creator?.avatar_url || undefined} />
                      <AvatarFallback className="text-[10px]">
                        {creatorName.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span>{creatorName}</span>
                  </div>
                  <span>{formatTime(announcement.created_at)}</span>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t bg-background">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Shield className="h-4 w-4" />
          <span>
            {canManage
              ? (language === 'zh' ? '你当前拥有发布公告权限' : 'You can publish announcements in this workspace')
              : (language === 'zh' ? '公告内容由工作区管理员发布' : 'Announcements are published by workspace admins')}
          </span>
        </div>
      </div>
    </div>
  )
}
