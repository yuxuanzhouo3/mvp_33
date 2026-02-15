'use client'

import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'

import { cn } from '@/lib/utils'
import { getAvatarColor, getInitials } from '@/lib/avatar-utils'
import { useOnlineStatus } from '@/hooks/use-online-status'

interface AvatarProps extends React.ComponentProps<typeof AvatarPrimitive.Root> {
  userId?: string
  showOnlineStatus?: boolean
}

function Avatar({
  className,
  userId,
  showOnlineStatus,
  ...props
}: AvatarProps) {
  const isOnline = useOnlineStatus(userId)

  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        'relative flex size-8 shrink-0 overflow-hidden rounded-full',
        className,
      )}
      {...props}
    >
      {props.children}
      {showOnlineStatus && userId && (
        <span
          className={cn(
            'absolute top-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-white shadow-sm',
            isOnline ? 'bg-green-400' : 'bg-gray-400'
          )}
        />
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
      className={cn('aspect-square size-full object-cover', className)}
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
        'flex size-full items-center justify-center rounded-full text-white font-medium text-sm',
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
