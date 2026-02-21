/**
 * Privacy Settings Component
 * 隐私设置组件
 */

'use client'

import { useState, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

export function PrivacySettings() {
  const [allowNonFriendMessages, setAllowNonFriendMessages] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const { language } = useSettings()

  // 加载当前设置
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch('/api/user/settings')
        if (response.ok) {
          const data = await response.json()
          setAllowNonFriendMessages(data.settings?.allow_non_friend_messages ?? true)
        }
      } catch (error) {
        console.error('Failed to load privacy settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSettings()
  }, [])

  // 更新设置
  const handleToggle = async (checked: boolean) => {
    setIsSaving(true)
    try {
      const response = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow_non_friend_messages: checked }),
      })

      if (response.ok) {
        setAllowNonFriendMessages(checked)
      } else {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update settings')
      }
    } catch (error: any) {
      console.error('Failed to update privacy settings:', error)
      alert(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="h-6 w-11 bg-muted animate-pulse rounded-full" />
        <div className="h-4 w-48 bg-muted animate-pulse rounded" />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between space-x-4 py-4">
      <div className="flex-1 space-y-1">
        <Label htmlFor="privacy-messages" className="text-base font-medium">
          {language === 'zh' ? '允许非好友发消息' : 'Allow Non-Friend Messages'}
        </Label>
        <p className="text-sm text-muted-foreground">
          {language === 'zh'
            ? '关闭后，只有您的好友才能直接向您发送消息'
            : 'When disabled, only your friends can send you direct messages'}
        </p>
      </div>
      <Switch
        id="privacy-messages"
        checked={allowNonFriendMessages}
        onCheckedChange={handleToggle}
        disabled={isSaving}
      />
    </div>
  )
}
