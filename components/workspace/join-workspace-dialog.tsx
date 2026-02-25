'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserPlus, Loader2, AlertCircle, Search, ArrowRight, Check, Building2, CheckCircle } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

interface Workspace {
  id: string
  name: string
  domain: string
  logo_url?: string
  description?: string
}

interface JoinWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onJoin: (workspaceId: string) => Promise<{ success: boolean; error?: string }>
}

export function JoinWorkspaceDialog({ open, onOpenChange, onJoin }: JoinWorkspaceDialogProps) {
  const [inviteCode, setInviteCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState('')
  const [foundWorkspace, setFoundWorkspace] = useState<Workspace | null>(null)
  const [isSelected, setIsSelected] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false) // 申请成功状态

  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const handleSearch = async () => {
    if (!inviteCode.trim()) return

    setIsSearching(true)
    setError('')
    setFoundWorkspace(null)
    setIsSelected(false)

    try {
      const response = await fetch(`/api/workspaces/lookup?code=${encodeURIComponent(inviteCode.trim())}`)
      const data = await response.json()

      if (!response.ok) {
        setError(data.error || (language === 'zh' ? '未找到工作区' : 'Workspace not found'))
        return
      }

      setFoundWorkspace(data.workspace)
    } catch (err) {
      setError(language === 'zh' ? '搜索失败' : 'Search failed')
    } finally {
      setIsSearching(false)
    }
  }

  const handleJoin = async () => {
    if (!foundWorkspace) return

    setIsLoading(true)
    setError('')

    try {
      const result = await onJoin(foundWorkspace.id)
      if (result.success) {
        setIsSuccess(true) // 显示成功状态
        // 不再立即关闭对话框，让用户看到成功消息
      } else {
        setError(result.error || 'Failed to submit join request')
      }
    } catch (err) {
      setError('Failed to submit join request')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setInviteCode('')
    setError('')
    setFoundWorkspace(null)
    setIsSelected(false)
    setIsSuccess(false)
  }

  const handleClose = () => {
    handleReset()
    onOpenChange(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (!foundWorkspace) {
        handleSearch()
      } else if (isSelected) {
        handleJoin()
      }
    }
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
            {language === 'zh' ? '请输入邀请码搜索工作区' : 'Enter the invite code to search for a workspace'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* 成功状态 */}
          {isSuccess ? (
            <div className="flex flex-col items-center justify-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold">
                  {language === 'zh' ? '申请已发送' : 'Request Sent'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {language === 'zh'
                    ? '您的申请已发送，请等待管理员审核。审核结果将通过系统助手通知您。'
                    : 'Your request has been sent. Please wait for admin approval. You will be notified via System Assistant.'}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* 输入框和搜索按钮 */}
              <div className="flex gap-2">
                <Input
                  value={inviteCode}
                  onChange={(e) => {
                    setInviteCode(e.target.value.toUpperCase())
                    setFoundWorkspace(null)
                    setIsSelected(false)
                    setError('')
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={language === 'zh' ? '输入邀请码...' : 'Enter invite code...'}
                  className="text-center text-lg tracking-widest font-mono flex-1"
                  maxLength={50}
                  autoFocus
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  onClick={handleSearch}
                  disabled={!inviteCode.trim() || isSearching || isLoading}
                  className="px-3"
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* 错误提示 */}
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {/* 搜索到的工作区 */}
              {foundWorkspace && (
                <div
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5'
                      : 'border-muted hover:border-primary/50 hover:bg-muted/50'
                  }`}
                  onClick={() => setIsSelected(!isSelected)}
                >
                  <div className="flex items-center gap-3">
                    {/* 工作区图标 */}
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shrink-0 overflow-hidden">
                      {foundWorkspace.logo_url ? (
                        <img
                          src={foundWorkspace.logo_url}
                          alt={foundWorkspace.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Building2 className="h-6 w-6" />
                      )}
                    </div>

                    {/* 工作区信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-base truncate">
                        {foundWorkspace.name}
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {foundWorkspace.domain}
                      </div>
                      {foundWorkspace.description && (
                        <div className="text-xs text-muted-foreground truncate mt-1">
                          {foundWorkspace.description}
                        </div>
                      )}
                    </div>

                    {/* 选中标记 */}
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/30'
                    }`}>
                      {isSelected && <Check className="h-4 w-4" />}
                    </div>
                  </div>

                  {/* 提示文字 */}
                  <div className="mt-3 text-xs text-muted-foreground text-center">
                    {isSelected
                      ? (language === 'zh' ? '已选择，点击下方按钮申请加入' : 'Selected, click button below to apply')
                      : (language === 'zh' ? '点击选择此工作区' : 'Click to select this workspace')
                    }
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {isSuccess ? (
            <Button
              type="button"
              onClick={handleClose}
              className="w-full sm:w-auto"
            >
              {language === 'zh' ? '完成' : 'Done'}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="w-full sm:w-auto"
              >
                {language === 'zh' ? '取消' : 'Cancel'}
              </Button>

              {foundWorkspace && isSelected && (
                <Button
                  type="button"
                  onClick={handleJoin}
                  disabled={isLoading}
                  className="w-full sm:w-auto"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {language === 'zh' ? '申请中...' : 'Applying...'}
                    </>
                  ) : (
                    language === 'zh' ? '申请加入' : 'Apply to Join'
                  )}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
