'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { User } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'

interface GroupNicknameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  currentNickname?: string
  onUpdate?: () => void
}

export function GroupNicknameDialog({
  open,
  onOpenChange,
  conversationId,
  currentNickname = '',
  onUpdate
}: GroupNicknameDialogProps) {
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)
  const [nickname, setNickname] = useState(currentNickname)
  const [isLoading, setIsLoading] = useState(false)

  const handleSave = async () => {
    console.log('[GroupNicknameDialog] 开始保存群昵称', {
      conversationId,
      nickname: nickname.trim(),
      nicknameLength: nickname.trim().length
    })

    setIsLoading(true)
    try {
      const url = `/api/conversations/${conversationId}/nickname`
      console.log('[GroupNicknameDialog] 发送请求', { url, method: 'PUT' })

      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim() })
      })

      console.log('[GroupNicknameDialog] 收到响应', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      })

      const data = await response.json()
      console.log('[GroupNicknameDialog] 响应数据', data)

      if (response.ok) {
        console.log('[GroupNicknameDialog] 保存成功,关闭对话框')
        onUpdate?.()
        onOpenChange(false)
      } else {
        console.error('[GroupNicknameDialog] 保存失败', { status: response.status, data })
        alert(tr(`保存失败: ${data.error || '未知错误'}`, `Save failed: ${data.error || 'Unknown error'}`))
      }
    } catch (error) {
      console.error('[GroupNicknameDialog] 保存群昵称异常:', error)
      alert(tr(`保存失败: ${error instanceof Error ? error.message : '网络错误'}`, `Save failed: ${error instanceof Error ? error.message : 'Network error'}`))
    } finally {
      setIsLoading(false)
      console.log('[GroupNicknameDialog] 保存流程结束')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {tr('群昵称', 'Group Nickname')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Input
              placeholder={tr('添加我在本群的昵称', 'Set my nickname in this group')}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={50}
              className="h-10"
            />
            <p className="text-xs text-muted-foreground">
              {tr('设置后,你在本群的消息和成员列表中将显示此昵称', 'After setting, this nickname will appear in this group\'s messages and member list.')}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {tr('取消', 'Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? tr('保存中...', 'Saving...') : tr('保存', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
