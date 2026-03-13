'use client'

import { Badge } from '@/components/ui/badge'
import { SubscriptionInfo } from '@/hooks/use-subscription'
import { useSettings } from '@/lib/settings-context'

interface SubscriptionBadgeProps {
  subscription: SubscriptionInfo
  showDays?: boolean
}

export function SubscriptionBadge({ subscription, showDays = false }: SubscriptionBadgeProps) {
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)

  if (subscription.type === 'free' || !subscription.isActive) {
    return (
      <Badge variant="outline">
        {tr('免费', 'Free')}
      </Badge>
    )
  }

  const planName = subscription.type === 'yearly'
    ? tr('Pro 年度', 'Pro Annual')
    : tr('Pro 月度', 'Pro Monthly')

  return (
    <Badge variant="default">
      {planName}
      {showDays && subscription.daysRemaining !== null && (
        <span className="ml-1 text-xs opacity-90">
          ({subscription.daysRemaining} {tr('天', 'days')})
        </span>
      )}
    </Badge>
  )
}









