'use client'

import { cn } from '@/lib/utils'

interface MessageSkeletonProps {
  count?: number
}

export function MessageSkeleton({ count = 5 }: MessageSkeletonProps) {
  // Generate skeleton messages with varying lengths and positions
  // Simulate real chat: alternating between own and other messages, different sizes
  const skeletonMessages = [
    { isOwn: false, width: 'w-48', height: 'h-16', showAvatar: true }, // Other user, short
    { isOwn: true, width: 'w-64', height: 'h-20', showAvatar: false },  // Own, medium (grouped)
    { isOwn: false, width: 'w-56', height: 'h-12', showAvatar: false }, // Other user, short (grouped)
    { isOwn: true, width: 'w-52', height: 'h-16', showAvatar: true }, // Own, short (new group)
    { isOwn: false, width: 'w-72', height: 'h-24', showAvatar: true }, // Other user, long (new group)
  ].slice(0, count)

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      {skeletonMessages.map((msg, index) => (
        <div
          key={index}
          className={cn(
            'flex gap-3',
            msg.isOwn && 'flex-row-reverse'
          )}
        >
          {/* Avatar skeleton - only show when starting a new message group */}
          <div className={cn(
            'flex-shrink-0',
            !msg.showAvatar && 'opacity-0' // Hide but keep space for alignment
          )}>
            <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
          </div>

          {/* Message content skeleton */}
          <div className={cn(
            'flex flex-col gap-1.5',
            msg.isOwn ? 'items-end' : 'items-start'
          )}>
            {/* Sender name skeleton (only for other user, when showing avatar) */}
            {!msg.isOwn && msg.showAvatar && (
              <div className="h-3 w-20 bg-muted/60 rounded animate-pulse mb-0.5" />
            )}

            {/* Message bubble skeleton */}
            <div
              className={cn(
                'rounded-2xl animate-pulse',
                msg.width,
                msg.height,
                msg.isOwn 
                  ? 'bg-primary/10' 
                  : 'bg-muted'
              )}
            />

            {/* Timestamp skeleton - smaller and subtle */}
            <div className={cn(
              'h-2.5 w-14 bg-muted/40 rounded animate-pulse mt-0.5',
              msg.isOwn ? 'ml-auto' : 'mr-auto'
            )} />
          </div>
        </div>
      ))}
    </div>
  )
}

