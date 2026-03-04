'use client'

import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'

import { cn } from '@/lib/utils'
import { getAvatarColor, getInitials } from '@/lib/avatar-utils'
import { useOnlineStatus } from '@/hooks/use-online-status'

interface AvatarProps extends React.ComponentProps<typeof AvatarPrimitive.Root> {
  userId?: string
  userRegion?: 'cn' | 'global'
  showOnlineStatus?: boolean
}

function Avatar({
  className,
  userId,
  userRegion,
  showOnlineStatus,
  ...props
}: AvatarProps) {
  const isOnline = useOnlineStatus(
    showOnlineStatus ? userId : undefined,
    userRegion
  )

  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        'relative flex size-8 shrink-0 rounded-full',
        className,
      )}
      {...props}
    >
      {props.children}
      {showOnlineStatus && (
        <span
          className="pointer-events-none absolute -bottom-2 -right-2 z-10 rounded-full bg-background p-1"
          aria-label={isOnline ? '在线' : '离线'}
        >
          {isOnline ? (
            <span className="block h-[clamp(0.625rem,25%,1.25rem)] w-[clamp(0.625rem,25%,1.25rem)] rounded-full border-2 border-background bg-[#2bac76]" />
          ) : (
            <span className="block h-[clamp(0.625rem,25%,1.25rem)] w-[clamp(0.625rem,25%,1.25rem)] rounded-full border-[3px] border-gray-400 bg-transparent" />
          )}
        </span>
      )}
    </AvatarPrimitive.Root>
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full rounded-[inherit] object-cover', className)}
      onError={(e) => {
        // 当图片加载失败时,隐藏图片元素以显示 Fallback
        const target = e.target as HTMLImageElement
        target.style.display = 'none'
      }}
      {...props}
    />
  )
}

interface AvatarFallbackProps extends React.ComponentProps<typeof AvatarPrimitive.Fallback> {
  name?: string
}

function AvatarFallback({
  className,
  name,
  children,
  ...props
}: AvatarFallbackProps) {
  // If name is provided, use it to generate color and initials
  const initials = name ? getInitials(name) : (children as string) || '?'
  const bgColor = name ? getAvatarColor(name) : undefined
  
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center rounded-[inherit] text-sm font-medium text-white',
        className,
      )}
      style={bgColor ? { backgroundColor: bgColor } : undefined}
      {...props}
    >
      {name ? initials : children}
    </AvatarPrimitive.Fallback>
  )
}

export { Avatar, AvatarImage, AvatarFallback }
