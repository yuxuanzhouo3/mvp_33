/**
 * Block User Dialog
 * 拉黑用户对话框
 */

'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { toast } from '@/hooks/use-toast'

interface BlockUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  userName: string
  onBlocked: () => void
}

export function BlockUserDialog({
  open,
  onOpenChange,
  userId,
  userName,
  onBlocked,
}: BlockUserDialogProps) {
  const [reason, setReason] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const handleBlock = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/blocked-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocked_user_id: userId,
          reason: reason.trim() || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || (language === 'zh' ? '屏蔽失败' : 'Failed to block user'))
      }

      // 显示成功提示
      toast({
        title: language === 'zh' ? '屏蔽成功' : 'User Blocked',
        description: language === 'zh'
          ? `已成功屏蔽 ${userName}，双方将无法互相发送消息`
          : `Successfully blocked ${userName}. Neither of you can send messages to each other.`,
      })

      // 重置状态
      setReason('')
      onBlocked()
      onOpenChange(false)
    } catch (error: any) {
      console.error('Block user error:', error)
      // 显示错误提示
      toast({
        variant: 'destructive',
        title: language === 'zh' ? '屏蔽失败' : 'Block Failed',
        description: error.message || (language === 'zh' ? '操作失败，请重试' : 'Operation failed, please try again'),
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      setReason('')
      onOpenChange(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {language === 'zh' ? '屏蔽用户' : 'Block User'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <p className="text-muted-foreground">
                {language === 'zh'
                  ? `确定要屏蔽 ${userName} 吗？屏蔽后：`
                  : `Are you sure you want to block ${userName}? After blocking:`}
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>{language === 'zh' ? '双方将无法互相发送消息' : 'Neither of you can send messages to each other'}</li>
                <li>{language === 'zh' ? '对方将不在您的联系人列表中显示' : 'They will be removed from your contacts'}</li>
                <li>{language === 'zh' ? '您可以随时在设置中解除屏蔽' : 'You can unblock them anytime in settings'}</li>
              </ul>
              <div className="space-y-2 pt-2">
                <Label htmlFor="block-reason">
                  {language === 'zh' ? '屏蔽原因（可选）' : 'Reason (optional)'}
                </Label>
                <Textarea
                  id="block-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={language === 'zh' ? '请输入屏蔽原因...' : 'Enter reason...'}
                  rows={3}
                  disabled={isLoading}
                />
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {language === 'zh' ? '取消' : 'Cancel'}
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={handleBlock}
            disabled={isLoading}
          >
            {isLoading
              ? (language === 'zh' ? '处理中...' : 'Processing...')
              : (language === 'zh' ? '确认屏蔽' : 'Block')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
