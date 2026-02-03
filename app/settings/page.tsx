'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useSubscription } from '@/hooks/use-subscription'
import { SubscriptionBadge } from '@/components/subscription/subscription-badge'
import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function SettingsPage() {
  const router = useRouter()
  const { subscription, usage, limits } = useSubscription()

  const getUsagePercentage = (used: number, limit: number) => {
    if (limit === Infinity) return 0
    return Math.min((used / limit) * 100, 100)
  }

  const getStorageUsagePercentage = () => {
    return getUsagePercentage(usage.storageUsed, usage.storageLimit)
  }

  const getMessagesUsagePercentage = () => {
    return getUsagePercentage(usage.messagesUsed, usage.messagesLimit)
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage your subscription and usage</p>
      </div>

      {/* Subscription Status */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Subscription Status
                <SubscriptionBadge subscription={subscription} showDays />
              </CardTitle>
              <CardDescription className="mt-1">
                {subscription.type === 'free' ? (
                  'You are currently on the free plan'
                ) : subscription.isActive ? (
                  subscription.daysRemaining !== null
                    ? `Your subscription expires in ${subscription.daysRemaining} days`
                    : 'Your subscription is active'
                ) : (
                  'Your subscription has expired'
                )}
              </CardDescription>
            </div>
            {subscription.type === 'free' && (
              <Button
                onClick={() => router.push('/payment')}
                variant="default"
                className="gap-2"
              >
                Upgrade to Pro
              </Button>
            )}
            {subscription.type !== 'free' && !subscription.isActive && (
              <Button
                onClick={() => router.push('/payment')}
                variant="outline"
                className="gap-2"
              >
                Renew Subscription
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {subscription.type === 'free' && (
            <Alert>
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium mb-1">Free Plan Limits</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• 1,000 messages per month</li>
                      <li>• 1GB storage space</li>
                      <li>• 1 workspace</li>
                      <li>• Up to 10 members per workspace</li>
                    </ul>
                  </div>
                  <Button
                    onClick={() => router.push('/payment')}
                    className="gap-2"
                  >
                    View Pro Plans
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Usage Statistics */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Usage Statistics</CardTitle>
          <CardDescription>View your resource usage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Messages Usage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Messages</span>
              <span className="text-sm text-muted-foreground">
                {usage.messagesUsed} / {usage.messagesLimit === Infinity ? '∞' : usage.messagesLimit}
              </span>
            </div>
            <Progress value={getMessagesUsagePercentage()} className="h-2" />
            {!limits.canSendMessage && (
              <p className="text-xs text-muted-foreground mt-1">Limit reached. Please upgrade to Pro</p>
            )}
          </div>

          {/* Storage Usage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Storage</span>
              <span className="text-sm text-muted-foreground">
                {(usage.storageUsed / 1024).toFixed(2)} GB / {usage.storageLimit === Infinity ? '∞' : (usage.storageLimit / 1024).toFixed(0)} GB
              </span>
            </div>
            <Progress value={getStorageUsagePercentage()} className="h-2" />
          </div>

          {/* Workspaces Usage */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Workspaces</span>
              <span className="text-sm text-muted-foreground">
                {usage.workspacesUsed} / {usage.workspacesLimit === Infinity ? '∞' : usage.workspacesLimit}
              </span>
            </div>
            {!limits.canCreateWorkspace && (
              <p className="text-xs text-muted-foreground mt-1">Limit reached. Please upgrade to Pro</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pro Features */}
      {subscription.type === 'free' && (
        <Card>
          <CardHeader>
            <CardTitle>Pro Features</CardTitle>
            <CardDescription>Upgrade to Pro to unlock the following features</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground mt-2" />
                <div>
                  <p className="font-medium">Unlimited Messages</p>
                  <p className="text-sm text-muted-foreground">Send messages without restrictions</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground mt-2" />
                <div>
                  <p className="font-medium">Large Storage</p>
                  <p className="text-sm text-muted-foreground">100GB (Monthly) or 1TB (Annual)</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground mt-2" />
                <div>
                  <p className="font-medium">Unlimited Workspaces</p>
                  <p className="text-sm text-muted-foreground">Create as many workspaces as you need</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground mt-2" />
                <div>
                  <p className="font-medium">Video Calls</p>
                  <p className="text-sm text-muted-foreground">HD video calling features</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground mt-2" />
                <div>
                  <p className="font-medium">Unlimited Members</p>
                  <p className="text-sm text-muted-foreground">No member limit per workspace</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground mt-2" />
                <div>
                  <p className="font-medium">Priority Support</p>
                  <p className="text-sm text-muted-foreground">24/7 priority customer support</p>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <Button
                onClick={() => router.push('/payment')}
                variant="default"
                className="w-full gap-2"
              >
                Upgrade to Pro Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
