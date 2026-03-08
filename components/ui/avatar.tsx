'use client'

import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'

import { cn } from '@/lib/utils'
import { getAvatarColor, getInitials } from '@/lib/avatar-utils'
import { useOnlineStatus } from '@/hooks/use-online-status'
import { useSettings } from '@/lib/settings-context'

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
  const { language } = useSettings()
  const isOnline = useOnlineStatus(
    showOnlineStatus ? userId : undefined,
    userRegion
  )

  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        'relative flex size-8 shrink-0 rounded-full overflow-visible',
        className,
      )}
      {...props}
    >
      {props.children}
      {showOnlineStatus && (
        <span
          className="pointer-events-none absolute -bottom-1 -right-1 z-10 rounded-full bg-background p-0.5"
          aria-label={isOnline ? (language === 'zh' ? '在线' : 'Online') : (language === 'zh' ? '离线' : 'Offline')}
        >
          {isOnline ? (
            <span className="block h-[13px] w-[13px] rounded-full border-2 border-background bg-[#2bac76]" />
          ) : (
            <span className="block h-[13px] w-[13px] rounded-full border-2 border-gray-400 bg-transparent" />
          )}
        </span>
      )}
    </AvatarPrimitive.Root>
  )
}

function AvatarImage({
  className,
  onError,
  onLoad,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full rounded-[inherit] object-cover', className)}
      onError={(e) => {
        // 当图片加载失败时，隐藏图片元素以显示 Fallback
        const target = e.target as HTMLImageElement
        target.style.display = 'none'
        onError?.(e)
      }}
      onLoad={(e) => {
        // 如果后续 src 恢复有效，确保图片重新显示
        const target = e.target as HTMLImageElement
        target.style.display = ''
        onLoad?.(e)
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
  const normalizedName = typeof name === 'string' ? name.trim() : ''
  const fallbackText = typeof children === 'string' ? children.trim() : ''
  const initials = normalizedName
    ? getInitials(normalizedName)
    : (fallbackText || '?').slice(0, 1).toUpperCase()
  const bgColor = normalizedName ? getAvatarColor(normalizedName) : '#94A3B8'
  
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center rounded-[inherit] text-sm font-medium text-white',
        className,
      )}
      style={{ backgroundColor: bgColor }}
      {...props}
    >
      {initials}
    </AvatarPrimitive.Fallback>
  )
}

export { Avatar, AvatarImage, AvatarFallback }
