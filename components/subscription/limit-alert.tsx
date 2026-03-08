'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle, Crown, Zap } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { SubscriptionLimits } from '@/hooks/use-subscription'
import { useSettings } from '@/lib/settings-context'

interface LimitAlertProps {
  type: 'message' | 'workspace' | 'member' | 'file' | 'video' | 'storage'
  limits: SubscriptionLimits
  onUpgrade?: () => void
  onDismiss?: () => void
  showUpgrade?: boolean
}

const limitMessages = {
  message: {
    title: { zh: '消息数量已达上限', en: 'Message Limit Reached' },
    description: {
      zh: '免费版每月限制 1000 条消息。升级到 Pro 版可享受无限制消息。',
      en: 'Free plan is limited to 1000 messages per month. Upgrade to Pro for unlimited messages.',
    },
    action: { zh: '升级到 Pro', en: 'Upgrade to Pro' },
  },
  workspace: {
    title: { zh: '工作区数量已达上限', en: 'Workspace Limit Reached' },
    description: {
      zh: '免费版只能创建 1 个工作区。升级到 Pro 版可创建无限工作区。',
      en: 'Free plan supports only 1 workspace. Upgrade to Pro for unlimited workspaces.',
    },
    action: { zh: '升级到 Pro', en: 'Upgrade to Pro' },
  },
  member: {
    title: { zh: '成员数量已达上限', en: 'Member Limit Reached' },
    description: {
      zh: '免费版每个工作区最多 10 名成员。升级到 Pro 版可添加无限成员。',
      en: 'Free plan supports up to 10 members per workspace. Upgrade to Pro for unlimited members.',
    },
    action: { zh: '升级到 Pro', en: 'Upgrade to Pro' },
  },
  file: {
    title: { zh: '文件大小超出限制', en: 'File Size Limit Exceeded' },
    description: {
      zh: '免费版单文件最大 10MB。升级到 Pro 版可上传最大 500MB 的文件。',
      en: 'Free plan allows files up to 10MB. Upgrade to Pro to upload files up to 500MB.',
    },
    action: { zh: '升级到 Pro', en: 'Upgrade to Pro' },
  },
  video: {
    title: { zh: '视频通话需要 Pro 版', en: 'Video Calls Require Pro' },
    description: {
      zh: '视频通话是 Pro 版专享功能。升级后即可使用高清视频通话。',
      en: 'Video calls are a Pro feature. Upgrade to enable HD video calls.',
    },
    action: { zh: '升级到 Pro', en: 'Upgrade to Pro' },
  },
  storage: {
    title: { zh: '存储空间不足', en: 'Insufficient Storage' },
    description: {
      zh: '免费版提供 1GB 存储空间。升级到 Pro 版可获得 100GB（月度）或 1TB（年度）存储空间。',
      en: 'Free plan includes 1GB storage. Upgrade to Pro for 100GB (monthly) or 1TB (yearly).',
    },
    action: { zh: '升级到 Pro', en: 'Upgrade to Pro' },
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
  const { language } = useSettings()
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
        <span>{message.title[language]}</span>
        {!limits.canSendMessage && type === 'message' && (
          <Crown className="h-4 w-4" />
        )}
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p className="text-sm text-muted-foreground mb-3">{message.description[language]}</p>
        <div className="flex items-center gap-2">
          {showUpgrade && (
            <Button
              size="sm"
              onClick={handleUpgrade}
              className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700"
            >
              <Zap className="h-3 w-3 mr-1" />
              {message.action[language]}
            </Button>
          )}
          {onDismiss && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDismiss}
            >
              {language === 'zh' ? '稍后提醒' : 'Remind me later'}
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}






