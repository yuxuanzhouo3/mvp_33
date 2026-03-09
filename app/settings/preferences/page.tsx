'use client'

import { useCallback, useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Languages, Sun, Moon, Code, Sparkles, Sunset, Star, Bell, Volume2, Vibrate } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { PrivacySettings } from '@/components/settings/privacy-settings'
import { BlockedUsersList } from '@/components/settings/blocked-users-list'
import { AppNavigation } from '@/components/layout/app-navigation'
import { useIsMobile } from '@/hooks/use-mobile'
import { toast } from 'sonner'

type NativeNotificationStatus = {
  pushEnabled?: boolean
  soundEnabled?: boolean
  vibrationEnabled?: boolean
  permissionGranted?: boolean
  notificationsEnabled?: boolean
}

type NativeNotificationBridge = {
  getStatus?: () => NativeNotificationStatus
  openPushSettings?: () => void
  openSoundVibrationSettings?: () => void
  openNotificationSettings?: () => void
  openNotificationChannelSettings?: () => void
  ensureNotificationPermission?: () => boolean
}

declare global {
  interface Window {
    OrbitChatNotificationBridge?: NativeNotificationBridge
  }
}

function getNativeNotificationBridge(): NativeNotificationBridge | null {
  if (typeof window === 'undefined') return null
  return window.OrbitChatNotificationBridge ?? null
}

function NotificationRow({
  icon: Icon,
  title,
  description,
  checked,
  onClick,
  disabled,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  checked: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left disabled:cursor-not-allowed disabled:opacity-60"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 rounded-md bg-muted p-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">{description}</div>
        </div>
      </div>
      <Switch checked={checked} className="pointer-events-none" />
    </button>
  )
}

export default function PreferencesPage() {
  const { language, theme, setLanguage, setTheme, t } = useSettings()
  const isMobile = useIsMobile()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)
  const [nativeBridgeAvailable, setNativeBridgeAvailable] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [vibrationEnabled, setVibrationEnabled] = useState(false)

  const refreshNotificationStatus = useCallback(() => {
    const bridge = getNativeNotificationBridge()
    if (!bridge || typeof bridge.getStatus !== 'function') {
      setNativeBridgeAvailable(false)
      setPushEnabled(false)
      setSoundEnabled(false)
      setVibrationEnabled(false)
      return
    }

    const status = bridge.getStatus() || {}
    setNativeBridgeAvailable(true)
    setPushEnabled(!!status.pushEnabled)
    setSoundEnabled(!!status.soundEnabled)
    setVibrationEnabled(!!status.vibrationEnabled)
  }, [])

  useEffect(() => {
    refreshNotificationStatus()

    const onFocus = () => refreshNotificationStatus()
    const onVisibilityChange = () => {
      if (!document.hidden) refreshNotificationStatus()
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [refreshNotificationStatus])

  const openPushSettings = useCallback(() => {
    const bridge = getNativeNotificationBridge()
    if (!bridge) {
      toast.info(tr('请在 Android 客户端中使用此功能', 'Please use this in the Android app'))
      return
    }

    try {
      if (typeof bridge.openPushSettings === 'function') {
        bridge.openPushSettings()
      } else if (typeof bridge.openNotificationSettings === 'function') {
        bridge.openNotificationSettings()
      } else {
        throw new Error('open push settings method not available')
      }
      toast.success(tr('已打开系统通知设置', 'Opened system notification settings'))
      window.setTimeout(refreshNotificationStatus, 1000)
    } catch (error) {
      toast.error(tr('打开系统设置失败', 'Failed to open system settings'))
    }
  }, [refreshNotificationStatus, tr])

  const openSoundVibrationSettings = useCallback(() => {
    const bridge = getNativeNotificationBridge()
    if (!bridge) {
      toast.info(tr('请在 Android 客户端中使用此功能', 'Please use this in the Android app'))
      return
    }

    try {
      if (typeof bridge.openSoundVibrationSettings === 'function') {
        bridge.openSoundVibrationSettings()
      } else if (typeof bridge.openNotificationChannelSettings === 'function') {
        bridge.openNotificationChannelSettings()
      } else {
        throw new Error('open channel settings method not available')
      }
      toast.success(tr('已打开声音和震动设置', 'Opened sound and vibration settings'))
      window.setTimeout(refreshNotificationStatus, 1000)
    } catch (error) {
      toast.error(tr('打开系统设置失败', 'Failed to open system settings'))
    }
  }, [refreshNotificationStatus, tr])

  return (
    <div className="flex h-screen min-w-0 flex-col mobile-app-shell mobile-overscroll-contain">
      <div className="flex-1 overflow-y-auto mobile-scroll-y mobile-overscroll-contain">
        <div className="container mx-auto max-w-4xl px-4 py-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2 sm:text-3xl">{t('preferences')}</h1>
        <p className="text-muted-foreground">{t('customizeAppLanguage')}</p>
      </div>

      <Card id="notification-settings" className="mb-6">
        <CardHeader>
          <CardTitle>{language === 'zh' ? '消息通知' : 'Message Notifications'}</CardTitle>
          <CardDescription>
            {language === 'zh'
              ? '在系统设置中开启/关闭推送、声音与震动'
              : 'Control push, sound, and vibration in system settings'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border">
            <NotificationRow
              icon={Bell}
              title={language === 'zh' ? '系统消息通知' : 'System Message Notifications'}
              description={
                language === 'zh'
                  ? '开关状态读取系统配置，点击前往系统设置修改'
                  : 'Status comes from system settings. Tap to change.'
              }
              checked={pushEnabled}
              onClick={openPushSettings}
              disabled={!nativeBridgeAvailable}
            />
            <Separator />
            <NotificationRow
              icon={Volume2}
              title={language === 'zh' ? '声音' : 'Sound'}
              description={
                language === 'zh'
                  ? '点击前往通知渠道设置，修改消息提示音'
                  : 'Tap to open notification channel settings for sound.'
              }
              checked={soundEnabled}
              onClick={openSoundVibrationSettings}
              disabled={!nativeBridgeAvailable}
            />
            <Separator />
            <NotificationRow
              icon={Vibrate}
              title={language === 'zh' ? '震动' : 'Vibration'}
              description={
                language === 'zh'
                  ? '点击前往通知渠道设置，修改震动提醒'
                  : 'Tap to open notification channel settings for vibration.'
              }
              checked={vibrationEnabled}
              onClick={openSoundVibrationSettings}
              disabled={!nativeBridgeAvailable}
            />
          </div>

          {!nativeBridgeAvailable && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              {language === 'zh'
                ? '当前环境未检测到 Android 原生桥接，请在 APK 客户端内打开本页面。'
                : 'Native Android bridge not detected. Open this page inside the APK app.'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Privacy Settings Card - Slack Mode */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{language === 'zh' ? '隐私设置' : 'Privacy Settings'}</CardTitle>
          <CardDescription>
            {language === 'zh' ? '管理您的隐私偏好' : 'Manage your privacy preferences'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PrivacySettings />
        </CardContent>
      </Card>

      {/* Blocked Users Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{language === 'zh' ? '已屏蔽用户' : 'Blocked Users'}</CardTitle>
          <CardDescription>
            {language === 'zh'
              ? '管理您已屏蔽的用户，解除屏蔽后可恢复正常聊天'
              : 'Manage blocked users. Unblock to resume normal communication.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BlockedUsersList />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('languageAndTheme')}</CardTitle>
          <CardDescription>{t('customizeAppLanguage')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Language Settings */}
          <div>
            <Label className="mb-3 block">{t('language')}</Label>
            <div className="flex gap-2">
              <Button
                variant={language === 'en' ? 'default' : 'outline'}
                onClick={() => setLanguage('en')}
                className="flex-1"
              >
                <Languages className="mr-2 h-4 w-4" />
                English
                {language === 'en' && <span className="ml-auto">✓</span>}
              </Button>
              <Button
                variant={language === 'zh' ? 'default' : 'outline'}
                onClick={() => setLanguage('zh')}
                className="flex-1"
              >
                <Languages className="mr-2 h-4 w-4" />
                Chinese
                {language === 'zh' && <span className="ml-auto">✓</span>}
              </Button>
            </div>
          </div>

          {/* Theme Settings */}
          <div>
            <Label className="mb-3 block">{t('theme')}</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Button
                variant={theme === 'light' ? 'default' : 'outline'}
                onClick={() => setTheme('light')}
                className="flex-1"
              >
                <Sun className="mr-2 h-4 w-4" />
                {t('light')}
                {theme === 'light' && <span className="ml-auto">✓</span>}
              </Button>
              <Button
                variant={theme === 'dark' ? 'default' : 'outline'}
                onClick={() => setTheme('dark')}
                className="flex-1"
              >
                <Moon className="mr-2 h-4 w-4" />
                {t('dark')}
                {theme === 'dark' && <span className="ml-auto">✓</span>}
              </Button>
              <Button
                variant={theme === 'monokai' ? 'default' : 'outline'}
                onClick={() => setTheme('monokai')}
                className="flex-1"
              >
                <Code className="mr-2 h-4 w-4" />
                {t('monokai')}
                {theme === 'monokai' && <span className="ml-auto">✓</span>}
              </Button>
              <Button
                variant={theme === 'solarized-dark' ? 'default' : 'outline'}
                onClick={() => setTheme('solarized-dark')}
                className="flex-1"
              >
                <Sunset className="mr-2 h-4 w-4" />
                {t('solarized-dark')}
                {theme === 'solarized-dark' && <span className="ml-auto">✓</span>}
              </Button>
              <Button
                variant={theme === 'light-purple' ? 'default' : 'outline'}
                onClick={() => setTheme('light-purple')}
                className="flex-1"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {t('light-purple')}
                {theme === 'light-purple' && <span className="ml-auto">✓</span>}
              </Button>
              <Button
                variant={theme === 'light-yellow' ? 'default' : 'outline'}
                onClick={() => setTheme('light-yellow')}
                className="flex-1"
              >
                <Star className="mr-2 h-4 w-4" />
                {t('light-yellow')}
                {theme === 'light-yellow' && <span className="ml-auto">✓</span>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
        </div>
      </div>
      {isMobile && <AppNavigation mobile />}
    </div>
  )
}

