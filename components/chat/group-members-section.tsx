'use client'

import { useState, useEffect } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { User } from '@/lib/types'
import { Search, ChevronRight, Plus } from 'lucide-react'

interface GroupMembersSectionProps {
  conversationId: string
  isAdmin: boolean
  onAddMembers: () => void
}

export function GroupMembersSection({
  conversationId,
  isAdmin,
  onAddMembers
}: GroupMembersSectionProps) {
  const [members, setMembers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    loadMembers()
  }, [conversationId])

  const loadMembers = async () => {
    setIsLoading(true)
    try {
      console.log('[GroupMembersSection] 开始加载成员', { conversationId })
      const response = await fetch(`/api/groups/${conversationId}/members`)
      console.log('[GroupMembersSection] API 响应状态', { status: response.status, ok: response.ok })
      const data = await response.json()
      console.log('[GroupMembersSection] API 响应数据', data)
      if (data.success && data.members) {
        console.log('[GroupMembersSection] 设置成员列表', { count: data.members.length })
        setMembers(data.members)
      } else {
        console.warn('[GroupMembersSection] API 返回失败或无成员数据', data)
      }
    } catch (error) {
      console.error('[GroupMembersSection] 加载成员失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredMembers = searchQuery
    ? members.filter(m =>
        m.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : members

  const displayMembers = filteredMembers.slice(0, 7)
  const remainingCount = filteredMembers.length - 7

  return (
    <div className="border-t">
      <div
        className="flex items-center justify-between p-3 hover:bg-accent cursor-pointer transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-sm font-medium">群成员 {members.length}</span>
        <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex flex-row gap-2 items-center flex-wrap">
            {displayMembers.map((member) => (
              <Avatar key={member.id} className="h-10 w-10" userId={member.id} showOnlineStatus={true}>
                <AvatarImage src={member.avatar_url || undefined} />
                <AvatarFallback className="text-xs">
                  {member.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}

            {remainingCount > 0 && (
              <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center">
                <span className="text-xs font-medium">+{remainingCount}</span>
              </div>
            )}

            {isAdmin && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onAddMembers()
                }}
                className="h-10 w-10 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center hover:border-muted-foreground/50 hover:bg-accent transition-colors"
              >
                <Plus className="h-5 w-5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
