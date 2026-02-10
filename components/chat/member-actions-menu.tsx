'use client'

import { useEffect, useRef } from 'react'
import { ConversationWithDetails, User } from '@/lib/types'
import { Shield, ShieldOff, UserMinus, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MemberActionsMenuProps {
  member: User
  conversation: ConversationWithDetails
  currentUser: User
  isOwner: boolean
  isAdmin: boolean
  position: { x: number; y: number }
  onClose: () => void
  onUpdate?: () => void
}

export function MemberActionsMenu({
  member,
  conversation,
  currentUser,
  isOwner,
  isAdmin,
  position,
  onClose,
  onUpdate
}: MemberActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // 获取成员角色
  const memberData = conversation.members.find(m => m.id === member.id)
  const memberRole = memberData?.role || 'member'
  const isMemberOwner = memberRole === 'owner'
  const isMemberAdmin = memberRole === 'admin'

  // 不能对自己操作
  if (member.id === currentUser.id) {
    onClose()
    return null
  }

  // 只有群主可以操作管理员
  if (isMemberAdmin && !isOwner) {
    onClose()
    return null
  }

  // 不能操作群主
  if (isMemberOwner) {
    onClose()
    return null
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  const handleSetAdmin = async () => {
    try {
      const response = await fetch(`/api/groups/${conversation.id}/members/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'admin' })
      })

      if (response.ok) {
        onUpdate?.()
        onClose()
      } else {
        const data = await response.json()
        alert(`设置管理员失败: ${data.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('设置管理员失败:', error)
      alert('设置管理员失败，请重试')
    }
  }

  const handleRemoveAdmin = async () => {
    try {
      const response = await fetch(`/api/groups/${conversation.id}/members/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'member' })
      })

      if (response.ok) {
        onUpdate?.()
        onClose()
      } else {
        const data = await response.json()
        alert(`取消管理员失败: ${data.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('取消管理员失败:', error)
      alert('取消管理员失败，请重试')
    }
  }

  const handleRemoveMember = async () => {
    if (!confirm(`确定要将 ${member.full_name} 移出群聊吗？`)) {
      return
    }

    try {
      const response = await fetch(`/api/groups/${conversation.id}/members/${member.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        onUpdate?.()
        onClose()
      } else {
        const data = await response.json()
        alert(`移除成员失败: ${data.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('移除成员失败:', error)
      alert('移除成员失败，请重试')
    }
  }

  const handleTransferOwnership = async () => {
    if (!confirm(`确定要将群主转让给 ${member.full_name} 吗？转让后您将成为管理员。`)) {
      return
    }

    if (!confirm('再次确认：转让群主后无法撤销，确定要继续吗？')) {
      return
    }

    try {
      const response = await fetch(`/api/groups/${conversation.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId: member.id })
      })

      if (response.ok) {
        onUpdate?.()
        onClose()
      } else {
        const data = await response.json()
        alert(`转让群主失败: ${data.error || '未知错误'}`)
      }
    } catch (error) {
      console.error('转让群主失败:', error)
      alert('转让群主失败，请重试')
    }
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] bg-popover border rounded-lg shadow-lg py-1"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
    >
      {/* 设置/取消管理员 */}
      {isOwner && (
        <button
          className={cn(
            'w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors duration-200 flex items-center gap-2',
            'cursor-pointer'
          )}
          onClick={isMemberAdmin ? handleRemoveAdmin : handleSetAdmin}
        >
          {isMemberAdmin ? (
            <>
              <ShieldOff className="h-4 w-4" />
              取消管理员
            </>
          ) : (
            <>
              <Shield className="h-4 w-4" />
              设为管理员
            </>
          )}
        </button>
      )}

      {/* 转让群主 */}
      {isOwner && (
        <button
          className={cn(
            'w-full px-3 py-2 text-sm text-left hover:bg-accent transition-colors duration-200 flex items-center gap-2',
            'cursor-pointer'
          )}
          onClick={handleTransferOwnership}
        >
          <Crown className="h-4 w-4" />
          转让群主
        </button>
      )}

      {/* 分隔线 */}
      {isOwner && <div className="h-px bg-border my-1" />}

      {/* 移除成员 */}
      {isAdmin && (
        <button
          className={cn(
            'w-full px-3 py-2 text-sm text-left text-destructive hover:bg-destructive/10 transition-colors duration-200 flex items-center gap-2',
            'cursor-pointer'
          )}
          onClick={handleRemoveMember}
        >
          <UserMinus className="h-4 w-4" />
          移出群聊
        </button>
      )}
    </div>
  )
}
