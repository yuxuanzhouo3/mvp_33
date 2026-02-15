'use client'

import { useEffect, useCallback, useRef } from 'react'

export function useNotifications(userId?: string) {
  const intervalRef = useRef<NodeJS.Timeout>()

  const checkNotifications = useCallback(async () => {
    if (!userId) return

    try {
      // 并行检查好友请求和群组邀请
      const [friendRequestsRes, groupInvitesRes] = await Promise.all([
        fetch('/api/contact-requests?type=received&status=pending'),
        fetch('/api/groups/invites')
      ])

      if (friendRequestsRes.ok) {
        const data = await friendRequestsRes.json()
        // 触发自定义事件通知好友请求面板更新
        window.dispatchEvent(new CustomEvent('friend-requests-updated', {
          detail: { requests: data.requests || [] }
        }))
      }

      if (groupInvitesRes.ok) {
        const data = await groupInvitesRes.json()
        // 触发自定义事件通知群组邀请更新
        window.dispatchEvent(new CustomEvent('group-invites-updated', {
          detail: { invites: data.invites || [] }
        }))
      }
    } catch (error) {
      console.error('Check notifications error:', error)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return

    // 立即检查一次
    checkNotifications()

    // 每30秒检查一次
    intervalRef.current = setInterval(checkNotifications, 30000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [userId, checkNotifications])
}
