/**
 * Blocked Users List Component
 * 已屏蔽用户列表组件
 */

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useSettings } from '@/lib/settings-context'
import { toast } from '@/hooks/use-toast'
import { UserX, Loader2 } from 'lucide-react'

interface BlockedUser {
  id: string
  blocker_id: string
  blocked_id: string      // 被拉黑用户的ID（与后端服务返回的字段名一致）
  reason?: string
  created_at: string
  blocked_user?: {
    id: string
    username?: string
    full_name?: string
    avatar_url?: string
  }
}

export function BlockedUsersList() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [unblockingId, setUnblockingId] = useState<string | null>(null)
  const { language } = useSettings()

  // 加载已屏蔽用户列表
  useEffect(() => {
    const loadBlockedUsers = async () => {
      try {
        const response = await fetch('/api/blocked-users')
        if (response.ok) {
          const data = await response.json()
          setBlockedUsers(data.blockedUsers || [])
        } else if (response.status === 401) {
          // 未登录，静默处理
          console.log('User not authenticated')
        }
      } catch (error) {
        console.error('Failed to load blocked users:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadBlockedUsers()
  }, [])

  // 解除屏蔽
  const handleUnblock = async (blockedUserId: string, userName: string) => {
    setUnblockingId(blockedUserId)
    try {
      const response = await fetch(`/api/blocked-users?userId=${blockedUserId}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || (language === 'zh' ? '解除屏蔽失败' : 'Failed to unblock user'))
      }

      // 从列表中移除
      setBlockedUsers(prev => prev.filter(u => u.blocked_id !== blockedUserId))

      // 检查是否仍然存在拉黑关系（可能是对方也拉黑了当前用户）
      if (data.stillBlocked) {
        toast({
          title: language === 'zh' ? '已解除您的屏蔽' : 'Your Block Removed',
          description: language === 'zh'
            ? `您已解除对 ${userName} 的屏蔽，但对方可能也屏蔽了您，导致无法互相发送消息`
            : `You have unblocked ${userName}, but they may have also blocked you, preventing mutual messaging.`,
          variant: 'default',
        })
      } else {
        // 显示成功提示
        toast({
          title: language === 'zh' ? '已解除屏蔽' : 'User Unblocked',
          description: language === 'zh'
            ? `已解除对 ${userName} 的屏蔽，现在可以正常聊天了`
            : `${userName} has been unblocked. You can now chat normally.`,
        })
      }
    } catch (error: any) {
      console.error('Failed to unblock user:', error)
      toast({
        variant: 'destructive',
        title: language === 'zh' ? '解除屏蔽失败' : 'Unblock Failed',
        description: error.message || (language === 'zh' ? '操作失败，请重试' : 'Operation failed, please try again'),
      })
    } finally {
      setUnblockingId(null)
    }
  }

  // 获取用户显示名称
  const getDisplayName = (user: BlockedUser) => {
    return user.blocked_user?.full_name || user.blocked_user?.username || 'Unknown User'
  }

  // 获取头像
  const getAvatar = (user: BlockedUser) => {
    return user.blocked_user?.avatar_url
  }

  // 格式化日期
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return language === 'zh'
      ? date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
      : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">
          {language === 'zh' ? '加载中...' : 'Loading...'}
        </span>
      </div>
    )
  }

  if (blockedUsers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <UserX className="h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">
          {language === 'zh' ? '暂无已屏蔽的用户' : 'No blocked users'}
        </p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          {language === 'zh'
            ? '当您屏蔽用户后，他们会显示在这里'
            : 'Blocked users will appear here'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground mb-4">
        {language === 'zh'
          ? `共 ${blockedUsers.length} 位被屏蔽的用户`
          : `${blockedUsers.length} blocked user${blockedUsers.length > 1 ? 's' : ''}`}
      </p>

      <div className="space-y-3">
        {blockedUsers.map((user) => {
          const displayName = getDisplayName(user)
          const isUnblocking = unblockingId === user.blocked_id

          return (
            <div
              key={user.id}
              className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center space-x-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={getAvatar(user)} alt={displayName} />
                  <AvatarFallback>
                    {displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {language === 'zh' ? '屏蔽于 ' : 'Blocked on '}
                    {formatDate(user.created_at)}
                  </p>
                  {user.reason && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {language === 'zh' ? '原因：' : 'Reason: '}
                      {user.reason}
                    </p>
                  )}
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleUnblock(user.blocked_id, displayName)}
                disabled={isUnblocking || unblockingId !== null}
              >
                {isUnblocking ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {language === 'zh' ? '处理中...' : 'Processing...'}
                  </>
                ) : (
                  language === 'zh' ? '解除屏蔽' : 'Unblock'
                )}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
