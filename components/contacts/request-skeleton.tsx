'use client'

import { cn } from '@/lib/utils'

interface RequestSkeletonProps {
  count?: number
}

export function RequestSkeleton({ count = 3 }: RequestSkeletonProps) {
  // Generate skeleton requests with varying message lengths
  const skeletonRequests = [
    { nameWidth: 'w-24', emailWidth: 'w-32', hasMessage: false },
    { nameWidth: 'w-28', emailWidth: 'w-36', hasMessage: true, messageWidth: 'w-48' },
    { nameWidth: 'w-20', emailWidth: 'w-28', hasMessage: true, messageWidth: 'w-40' },
  ].slice(0, count)

  return (
    <div className="p-4 space-y-3">
      {skeletonRequests.map((request, index) => (
        <div
          key={index}
          className="flex items-start gap-3 p-4 border rounded-lg"
        >
          {/* Avatar skeleton */}
          <div className="h-10 w-10 rounded-full bg-muted animate-pulse shrink-0" />

          {/* Content skeleton */}
          <div className="flex-1 min-w-0 pr-3 space-y-2">
            {/* Name and badge */}
            <div className="flex items-center gap-2">
              <div className={cn('h-4 bg-muted rounded animate-pulse', request.nameWidth)} />
              <div className="h-5 w-16 bg-muted/60 rounded animate-pulse" />
            </div>

            {/* Email */}
            <div className={cn('h-3 bg-muted/60 rounded animate-pulse', request.emailWidth)} />

            {/* Optional message */}
            {request.hasMessage && (
              <div className={cn('h-10 bg-muted/40 rounded animate-pulse mt-2', request.messageWidth)} />
            )}
          </div>

          {/* Action buttons skeleton */}
          <div className="flex flex-col gap-2 shrink-0 ml-auto">
            <div className="h-8 w-20 bg-muted rounded animate-pulse" />
            <div className="h-8 w-8 bg-muted/60 rounded animate-pulse" />
            <div className="h-8 w-8 bg-muted/60 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}








