'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle, Crown, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { SubscriptionLimits } from '@/hooks/use-subscription'

interface LimitAlertProps {
  type: 'message' | 'workspace' | 'member' | 'file' | 'video' | 'storage'
  limits: SubscriptionLimits
  onUpgrade?: () => void
  onDismiss?: () => void
  showUpgrade?: boolean
}

const limitMessages = {
  message: {
    title: '消息数量已达上限',
    description: '免费版每月限制 1000 条消息。升级到 Pro 版可享受无限制消息。',
    action: '升级到 Pro',
  },
  workspace: {
    title: '工作区数量已达上限',
    description: '免费版只能创建 1 个工作区。升级到 Pro 版可创建无限工作区。',
    action: '升级到 Pro',
  },
  member: {
    title: '成员数量已达上限',
    description: '免费版每个工作区最多 10 名成员。升级到 Pro 版可添加无限成员。',
    action: '升级到 Pro',
  },
  file: {
    title: '文件大小超出限制',
    description: '免费版单文件最大 10MB。升级到 Pro 版可上传最大 500MB 的文件。',
    action: '升级到 Pro',
  },
  video: {
    title: '视频通话需要 Pro 版',
    description: '视频通话是 Pro 版专享功能。升级后即可使用高清视频通话。',
    action: '升级到 Pro',
  },
  storage: {
    title: '存储空间不足',
    description: '免费版提供 1GB 存储空间。升级到 Pro 版可获得 100GB（月度）或 1TB（年度）存储空间。',
    action: '升级到 Pro',
  },
}

export function LimitAlert({
  type,
  limits,
  onUpgrade,
  onDismiss,
  showUpgrade = true,
}: LimitAlertProps) {
  const router = useRouter()
  const message = limitMessages[type]

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade()
    } else {
      router.push('/payment')
    }
  }

  return (
    <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
      <AlertCircle className="h-4 w-4 text-orange-600" />
      <AlertTitle className="flex items-center gap-2">
        <span>{message.title}</span>
        {!limits.canSendMessage && type === 'message' && (
          <Crown className="h-4 w-4" />
        )}
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm text-muted-foreground mb-3">{message.description}</p>
        <div className="flex items-center gap-2">
          {showUpgrade && (
            <Button
              size="sm"
              onClick={handleUpgrade}
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
            >
              <Zap className="h-3 w-3 mr-1" />
              {message.action}
            </Button>
          )}
          {onDismiss && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
            >
              稍后提醒
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}






