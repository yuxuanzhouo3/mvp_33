'use client'

import { Badge } from '@/components/ui/badge'
import { SubscriptionInfo } from '@/hooks/use-subscription'

interface SubscriptionBadgeProps {
  subscription: SubscriptionInfo
  showDays?: boolean
}

export function SubscriptionBadge({ subscription, showDays = false }: SubscriptionBadgeProps) {
  if (subscription.type === 'free' || !subscription.isActive) {
    return (
      <Badge variant="outline">
        Free
      </Badge>
    )
  }

  const planName = subscription.type === 'yearly' ? 'Pro Annual' : 'Pro Monthly'

  return (
    <Badge variant="default">
      {planName}
      {showDays && subscription.daysRemaining !== null && (
        <span className="ml-1 text-xs opacity-90">
          ({subscription.daysRemaining} days)
        </span>
      )}
    </Badge>
  )
}









