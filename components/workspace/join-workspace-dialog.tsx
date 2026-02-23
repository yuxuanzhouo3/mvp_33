'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserPlus, Loader2, AlertCircle } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

interface JoinWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onJoin: (inviteCode: string) => Promise<{ success: boolean; error?: string }>
}

export function JoinWorkspaceDialog({ open, onOpenChange, onJoin }: JoinWorkspaceDialogProps) {
  const [inviteCode, setInviteCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteCode.trim()) return

    setIsLoading(true)
    setError('')

    try {
      const result = await onJoin(inviteCode.trim())
      if (result.success) {
        setInviteCode('')
        onOpenChange(false)
      } else {
        setError(result.error || 'Invalid invite code')
      }
    } catch (err) {
      setError('Failed to join workspace')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setInviteCode('')
    setError('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {language === 'zh' ? '加入组织' : 'Join Organization'}
          </DialogTitle>
          <DialogDescription>
            {language === 'zh' ? '请输入邀请码加入工作区' : 'Enter the invite code to join the workspace'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-4">
            <Input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder={language === 'zh' ? '输入邀请码...' : 'Enter invite code...'}
              className="text-center text-lg tracking-widest font-mono"
              maxLength={8}
              autoFocus
            />
            {error && (
              <div className="mt-2 flex items-center gap-2 text-sm text-red-500">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {language === 'zh' ? '取消' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={!inviteCode.trim() || isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {language === 'zh' ? '加入中...' : 'Joining...'}
                </>
              ) : (
                language === 'zh' ? '加入' : 'Join'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
