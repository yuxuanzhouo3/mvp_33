'use client'

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ConversationWithDetails } from '@/lib/types'
import { Loader2, Trash2, Upload, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSettings } from '@/lib/settings-context'

interface GroupSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversation: ConversationWithDetails
  isOwner: boolean
  onUpdate?: () => void
}

export function GroupSettingsDialog({
  open,
  onOpenChange,
  conversation,
  isOwner,
  onUpdate
}: GroupSettingsDialogProps) {
  const router = useRouter()
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(conversation.name || '')
  const [description, setDescription] = useState(conversation.description || '')
  const [avatarUrl, setAvatarUrl] = useState(conversation.avatar_url || '')
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)

  // 同步 conversation prop 的变化到本地状态
  useEffect(() => {
    console.log('[GroupSettings] Name changed:', conversation.name)
    setName(conversation.name || '')
  }, [conversation.name])

  useEffect(() => {
    console.log('[GroupSettings] Description changed:', conversation.description)
    setDescription(conversation.description || '')
  }, [conversation.description])

  useEffect(() => {
    console.log('[GroupSettings] Avatar URL changed:', conversation.avatar_url)
    setAvatarUrl(conversation.avatar_url || '')
  }, [conversation.avatar_url])

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert(tr('请选择图片文件', 'Please select an image file'))
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      alert(tr('图片大小不能超过5MB', 'Image size cannot exceed 5MB'))
      return
    }

    console.log('[GroupSettings] Starting avatar upload for conversation:', conversation.id)
    setIsUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/groups/${conversation.id}/upload-avatar`, {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        console.log('[GroupSettings] Avatar upload successful, new URL:', data.avatar_url)
        console.log('[GroupSettings] Current conversation.avatar_url:', conversation.avatar_url)
        setAvatarUrl(data.avatar_url)
        console.log('[GroupSettings] Local avatarUrl state updated to:', data.avatar_url)
        console.log('[GroupSettings] Calling onUpdate callback')
        onUpdate?.()
      } else {
        const data = await response.json()
        console.error('[GroupSettings] Avatar upload failed:', data.error)
        alert(tr(`上传失败: ${data.error || '未知错误'}`, `Upload failed: ${data.error || 'Unknown error'}`))
      }
    } catch (error) {
      console.error('[GroupSettings] 上传头像失败:', error)
      alert(tr('上传失败，请重试', 'Upload failed, please try again'))
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleUpdate = async () => {
    if (!name.trim()) {
      alert(tr('群名称不能为空', 'Group name cannot be empty'))
      return
    }

    setIsUpdating(true)
    try {
      const response = await fetch(`/api/groups/${conversation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim()
        })
      })

      if (response.ok) {
        onUpdate?.()
        onOpenChange(false)
      } else {
        const data = await response.json()
        alert(tr(`更新失败: ${data.error || '未知错误'}`, `Update failed: ${data.error || 'Unknown error'}`))
      }
    } catch (error) {
      console.error('更新群设置失败:', error)
      alert(tr('更新失败，请重试', 'Update failed, please try again'))
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(tr('确定要删除这个群聊吗？此操作无法撤销，所有消息和数据都将被永久删除。', 'Delete this group? This action cannot be undone and all messages/data will be permanently removed.'))) {
      return
    }

    if (!confirm(tr('再次确认：删除后无法恢复，确定要继续吗？', 'Please confirm again: this cannot be recovered. Continue?'))) {
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch(`/api/groups/${conversation.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        onOpenChange(false)
        router.push('/chat')
      } else {
        const data = await response.json()
        alert(tr(`删除失败: ${data.error || '未知错误'}`, `Delete failed: ${data.error || 'Unknown error'}`))
      }
    } catch (error) {
      console.error('删除群聊失败:', error)
      alert(tr('删除失败，请重试', 'Delete failed, please try again'))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tr('群聊设置', 'Group Settings')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{tr('群头像', 'Group Avatar')}</Label>
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={avatarUrl || undefined} />
                <AvatarFallback>
                  <Users className="h-10 w-10" />
                </AvatarFallback>
              </Avatar>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                >
                  {isUploadingAvatar ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {tr('上传中...', 'Uploading...')}
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      {tr('上传头像', 'Upload Avatar')}
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-1">{tr('支持JPG、PNG格式，最大5MB', 'Supports JPG/PNG, up to 5MB')}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-name">{tr('群名称', 'Group Name')}</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr('输入群名称', 'Enter group name')}
              maxLength={50}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-description">{tr('群描述', 'Description')}</Label>
            <Textarea
              id="group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={tr('输入群描述（可选）', 'Enter group description (optional)')}
              rows={3}
              maxLength={200}
            />
          </div>

          {isOwner && (
            <>
              <div className="border-t pt-4 mt-6">
                <div className="space-y-2">
                  <Label className="text-destructive">{tr('危险操作', 'Danger Zone')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {tr('删除群聊后，所有消息和数据都将被永久删除，此操作无法撤销。', 'Deleting this group permanently removes all messages and data. This cannot be undone.')}
                  </p>
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {tr('删除中...', 'Deleting...')}
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        {tr('删除群聊', 'Delete Group')}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tr('取消', 'Cancel')}
          </Button>
          <Button onClick={handleUpdate} disabled={isUpdating}>
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {tr('保存中...', 'Saving...')}
              </>
            ) : (
              tr('保存', 'Save')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
