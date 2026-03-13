'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useSubscription } from '@/hooks/use-subscription'
import { SubscriptionBadge } from '@/components/subscription/subscription-badge'
import { ArrowRight, ArrowLeft, Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AppNavigation } from '@/components/layout/app-navigation'
import { useIsMobile } from '@/hooks/use-mobile'
import { useSettings } from '@/lib/settings-context'

export default function SettingsPage() {
  const router = useRouter()
  const { subscription } = useSubscription()
  const isMobile = useIsMobile()
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)

  return (
    <div className="flex h-screen min-w-0 flex-col mobile-app-shell mobile-overscroll-contain">
      <div className="flex-1 overflow-y-auto mobile-scroll-y mobile-overscroll-contain">
        <div className="container mx-auto max-w-4xl px-4 py-6 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="mb-4 h-9 px-2"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {tr('返回', 'Back')}
      </Button>
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2 sm:text-3xl">{tr('设置', 'Settings')}</h1>
        <p className="text-muted-foreground">{tr('管理订阅和使用情况', 'Manage your subscription and usage')}</p>
      </div>

      {/* Subscription Status */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {tr('订阅状态', 'Subscription Status')}
                <SubscriptionBadge subscription={subscription} showDays />
              </CardTitle>
              <CardDescription className="mt-1">
                {subscription.type === 'free' ? (
                  tr('您当前为免费方案', 'You are currently on the free plan')
                ) : subscription.isActive ? (
                  subscription.daysRemaining !== null
                    ? tr(`您的订阅将在 ${subscription.daysRemaining} 天后到期`, `Your subscription expires in ${subscription.daysRemaining} days`)
                    : tr('您的订阅已激活', 'Your subscription is active')
                ) : (
                  tr('您的订阅已过期', 'Your subscription has expired')
                )}
              </CardDescription>
            </div>
            {subscription.type === 'free' && (
              <Button
                onClick={() => router.push('/payment')}
                variant="default"
                className="w-full gap-2 sm:w-auto"
              >
                {tr('升级至 Pro', 'Upgrade to Pro')}
              </Button>
            )}
            {subscription.type !== 'free' && !subscription.isActive && (
              <Button
                onClick={() => router.push('/payment')}
                variant="outline"
                className="w-full gap-2 sm:w-auto"
              >
                {tr('续订', 'Renew Subscription')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {subscription.type === 'free' && (
            <Alert>
              <AlertDescription>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium mb-1">{tr('免费方案限制', 'Free Plan Limits')}</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• {tr('每月 1,000 条消息', '1,000 messages per month')}</li>
                      <li>• {tr('1GB 存储空间', '1GB storage space')}</li>
                      <li>• {tr('1 个工作区', '1 workspace')}</li>
                      <li>• {tr('每个工作区最多 10 位成员', 'Up to 10 members per workspace')}</li>
                    </ul>
                  </div>
                  <Button
                    onClick={() => router.push('/payment')}
                    className="w-full gap-2 sm:w-auto"
                  >
                    {tr('查看 Pro 方案', 'View Pro Plans')}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Account Security & Management */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{tr('账号安全与管理', 'Account Security & Management')}</CardTitle>
          <CardDescription>{tr('管理登录设备和安全设置', 'Manage your devices and security settings')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() => router.push('/settings/preferences#notification-settings')}
            variant="outline"
            className="w-full justify-between"
          >
            <span className="inline-flex items-center gap-2">
              <Bell className="h-4 w-4" />
              {tr('消息通知', 'Message Notifications')}
            </span>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => router.push('/settings/preferences')}
            variant="outline"
            className="w-full justify-between"
          >
            <span>{tr('偏好与隐私', 'Preferences & Privacy')}</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => router.push('/settings/devices')}
            variant="outline"
            className="w-full justify-between"
          >
            <span>{tr('设备管理', 'Device Management')}</span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Pro Features */}
      {subscription.type === 'free' && (
        <Card>
          <CardHeader>
            <CardTitle>{tr('Pro 功能', 'Pro Features')}</CardTitle>
            <CardDescription>{tr('升级至 Pro 解锁以下功能', 'Upgrade to Pro to unlock the following features')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground mt-2" />
                <div>
                  <p className="font-medium">{tr('无限消息', 'Unlimited Messages')}</p>
                  <p className="text-sm text-muted-foreground">{tr('消息发送不受限制', 'Send messages without restrictions')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground mt-2" />
                <div>
                  <p className="font-medium">{tr('大容量存储', 'Large Storage')}</p>
                  <p className="text-sm text-muted-foreground">{tr('月度 100GB 或年度 1TB', '100GB (Monthly) or 1TB (Annual)')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground mt-2" />
                <div>
                  <p className="font-medium">{tr('无限工作区', 'Unlimited Workspaces')}</p>
                  <p className="text-sm text-muted-foreground">{tr('可创建任意数量的工作区', 'Create as many workspaces as you need')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground mt-2" />
                <div>
                  <p className="font-medium">{tr('视频通话', 'Video Calls')}</p>
                  <p className="text-sm text-muted-foreground">{tr('高清视频通话功能', 'HD video calling features')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground mt-2" />
                <div>
                  <p className="font-medium">{tr('无限成员', 'Unlimited Members')}</p>
                  <p className="text-sm text-muted-foreground">{tr('每个工作区无成员数量限制', 'No member limit per workspace')}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground mt-2" />
                <div>
                  <p className="font-medium">{tr('优先支持', 'Priority Support')}</p>
                  <p className="text-sm text-muted-foreground">{tr('7x24 优先客户支持', '24/7 priority customer support')}</p>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <Button
                onClick={() => router.push('/payment')}
                variant="default"
                className="w-full gap-2"
              >
                {tr('立即升级 Pro', 'Upgrade to Pro Now')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
        </div>
      </div>
      {isMobile && <AppNavigation mobile />}
    </div>
  )
}
