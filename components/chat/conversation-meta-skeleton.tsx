'use client'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'

type ConversationMetaSkeletonMode = 'loading' | 'failed'

interface ConversationMetaSkeletonProps {
  variant: 'header' | 'panel'
  mode?: ConversationMetaSkeletonMode
  isMobile?: boolean
  isOpen?: boolean
  onRetry?: () => void
}

export function ConversationMetaSkeleton({
  variant,
  mode = 'loading',
  isMobile = false,
  isOpen = true,
  onRetry,
}: ConversationMetaSkeletonProps) {
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)
  const isFailed = mode === 'failed'

  if (variant === 'panel') {
    return (
      <div
        className={cn(
          'border-l bg-background transition-all duration-300 ease-out',
          isOpen ? 'w-64' : 'w-0 overflow-hidden'
        )}
      >
        {isOpen && (
          <div className="flex h-full flex-col">
            <div className="border-b p-4">
              <div className="mb-4 flex items-center justify-between">
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
              <div className="flex items-start gap-3">
                <Skeleton className="h-12 w-12 rounded-xl shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </div>

            <div className="space-y-3 p-4">
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
              <div className="pt-2">
                <Skeleton className="h-4 w-24 mb-3" />
                <div className="grid grid-cols-4 gap-2">
                  <Skeleton className="h-14 w-full rounded-md" />
                  <Skeleton className="h-14 w-full rounded-md" />
                  <Skeleton className="h-14 w-full rounded-md" />
                  <Skeleton className="h-14 w-full rounded-md" />
                </div>
              </div>
            </div>

            {isFailed && (
              <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span>{tr('群信息同步中，稍后自动恢复', 'Group info is syncing and will recover automatically')}</span>
                </div>
                {onRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={onRetry}
                  >
                    <RefreshCw className="mr-1.5 h-3 w-3" />
                    {tr('重试', 'Retry')}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="border-b bg-background">
      <div className={cn('flex items-center justify-between', isMobile ? 'px-2.5 py-2' : 'px-4 py-2.5')}>
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className={cn('rounded-lg', isMobile ? 'h-9 w-9' : 'h-10 w-10')} />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            {!isMobile && <Skeleton className="h-3 w-20" />}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md" />
        </div>
      </div>

      <div className={cn('border-t', isMobile ? 'px-2.5 py-2' : 'px-4 py-2')}>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
        {isFailed && (
          <div className="mt-2 flex items-center justify-between rounded-md bg-muted/60 px-2.5 py-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
              <span>{tr('群信息同步中，可继续查看消息', 'Group info is syncing, you can continue viewing messages')}</span>
            </div>
            {onRetry && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onRetry}>
                {tr('重试', 'Retry')}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
