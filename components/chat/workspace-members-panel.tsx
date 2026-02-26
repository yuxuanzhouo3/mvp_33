'use client'

import { useState, useEffect } from 'react'
import { User, Workspace } from '@/lib/types'
import { Search, Users, Loader2, Shield, Clock, Trash2, MessageSquare, Phone, Video, ShieldOff } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// 待审批申请的类型定义
interface JoinRequest {
  id: string
  user_id?: string
  name: string
  email: string
  reason: string
  time: string
  avatarColor: string
}

interface WorkspaceMembersPanelProps {
  currentUser: User
  workspaceId?: string
  workspace?: Workspace
  onStartChat: (userId: string) => void
}

// 成员角色类型
type MemberRole = 'owner' | 'admin' | 'member' | 'guest'

// 扩展 User 类型，添加角色和加入时间
interface MemberWithRole extends User {
  role: MemberRole
  joinedAt: string
}

// 头像颜色映射
const avatarColors = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-cyan-500',
  'bg-red-500',
  'bg-indigo-500'
]

const getAvatarColor = (name: string) => {
  const index = name.charCodeAt(0) % avatarColors.length
  return avatarColors[index]
}

// 角色排序权重：owner 最前，admin 其次，member 再次，guest 最后
const getRoleWeight = (role: MemberRole): number => {
  const roleWeights: Record<MemberRole, number> = {
    owner: 0,
    admin: 1,
    member: 2,
    guest: 3
  }
  return roleWeights[role] ?? 4
}

export function WorkspaceMembersPanel({
  currentUser,
  workspaceId,
  workspace,
  onStartChat
}: WorkspaceMembersPanelProps) {
  const [members, setMembers] = useState<MemberWithRole[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'members' | 'pending'>('members')
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [isOperating, setIsOperating] = useState(false) // 操作中状态
  const [currentUserRole, setCurrentUserRole] = useState<MemberRole | null>(null) // 当前用户在工作区的角色

  // 确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    type: 'remove' | 'setAdmin' | 'removeAdmin' | null
    member: MemberWithRole | null
  }>({ open: false, type: null, member: null })
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)
  const isZh = language === 'zh'

  useEffect(() => {
    loadWorkspaceMembers()
  }, [workspaceId])

  // 切换到待审批 tab 时加载数据
  useEffect(() => {
    if (activeTab === 'pending' && workspaceId) {
      loadJoinRequests()
    }
  }, [activeTab, workspaceId])

  const loadJoinRequests = async () => {
    try {
      console.log('[WorkspaceMembersPanel] Loading join requests for workspace:', workspaceId)
      const response = await fetch(`/api/workspace-join-requests?workspaceId=${workspaceId}`)
      const data = await response.json()

      console.log('[WorkspaceMembersPanel] Join requests response:', data)

      if (data.success) {
        setRequests(data.requests || [])
      } else {
        // 显示错误给用户，而不是静默处理
        console.error('[WorkspaceMembersPanel] Failed to load join requests:', data.error)
        toast.error(data.error || (isZh ? '加载待审批申请失败' : 'Failed to load requests'))
        setRequests([])
      }
    } catch (error) {
      console.error('[WorkspaceMembersPanel] Failed to load join requests:', error)
      toast.error(isZh ? '加载待审批申请失败，请重试' : 'Failed to load join requests')
      setRequests([])
    }
  }

  const loadWorkspaceMembers = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (workspaceId) {
        params.set('workspaceId', workspaceId)
      }

      const response = await fetch(`/api/workspace-members?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        // 使用真实角色数据
        const membersWithRoles: MemberWithRole[] = (data.members || []).map((member: any) => ({
          ...member,
          role: (member.role || 'member') as MemberRole,
          joinedAt: member.joined_at ? new Date(member.joined_at).toLocaleDateString('zh-CN') : '-'
        }))
        setMembers(membersWithRoles)

        // 获取当前用户角色
        if (data.currentUserRole) {
          console.log('[WorkspaceMembersPanel] 当前用户角色:', data.currentUserRole)
          setCurrentUserRole(data.currentUserRole as MemberRole)
        }
      }
    } catch (error) {
      console.error('Failed to load workspace members:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 批准申请
  const handleApproveRequest = async (request: JoinRequest) => {
    if (isOperating) return
    try {
      setIsOperating(true)
      const response = await fetch('/api/workspace-join-requests/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, workspaceId })
      })
      const data = await response.json()

      if (data.success) {
        // 从列表中移除
        setRequests(prev => prev.filter(r => r.id !== request.id))
        setSelectedId(null)
        // 刷新成员列表
        loadWorkspaceMembers()
        toast.success(isZh ? '已批准加入申请' : 'Request approved')
      } else {
        toast.error(data.error || (isZh ? '操作失败' : 'Operation failed'))
      }
    } catch (error) {
      console.error('Approve request error:', error)
      toast.error(isZh ? '操作失败，请重试' : 'Operation failed, please try again')
    } finally {
      setIsOperating(false)
    }
  }

  // 拒绝申请
  const handleRejectRequest = async (request: JoinRequest) => {
    if (isOperating) return
    try {
      setIsOperating(true)
      const response = await fetch('/api/workspace-join-requests/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id, workspaceId })
      })
      const data = await response.json()

      if (data.success) {
        // 从列表中移除
        setRequests(prev => prev.filter(r => r.id !== request.id))
        setSelectedId(null)
        toast.success(isZh ? '已拒绝申请' : 'Request rejected')
      } else {
        toast.error(data.error || (isZh ? '操作失败' : 'Operation failed'))
      }
    } catch (error) {
      console.error('Reject request error:', error)
      toast.error(isZh ? '操作失败，请重试' : 'Operation failed, please try again')
    } finally {
      setIsOperating(false)
    }
  }

  // 移除成员
  const handleRemoveMember = async (member: MemberWithRole) => {
    if (isOperating) return
    // 打开确认对话框
    setConfirmDialog({ open: true, type: 'remove', member })
  }

  // 确认移除成员
  const confirmRemoveMember = async () => {
    const member = confirmDialog.member
    if (!member) return

    try {
      setIsOperating(true)
      const response = await fetch(`/api/workspace-members?memberId=${member.id}&workspaceId=${workspaceId}`, {
        method: 'DELETE'
      })
      const data = await response.json()

      if (data.success) {
        // 从列表中移除
        setMembers(prev => prev.filter(m => m.id !== member.id))
        setSelectedId(null)
        toast.success(isZh ? '已移除成员' : 'Member removed')
      } else {
        toast.error(data.error || (isZh ? '操作失败' : 'Operation failed'))
      }
    } catch (error) {
      console.error('Remove member error:', error)
      toast.error(isZh ? '操作失败，请重试' : 'Operation failed, please try again')
    } finally {
      setIsOperating(false)
      setConfirmDialog({ open: false, type: null, member: null })
    }
  }

  // 设为管理员
  const handleSetAdmin = async (member: MemberWithRole) => {
    if (isOperating) return
    // 打开确认对话框
    setConfirmDialog({ open: true, type: 'setAdmin', member })
  }

  // 确认设为管理员
  const confirmSetAdmin = async () => {
    const member = confirmDialog.member
    if (!member) return

    try {
      setIsOperating(true)
      console.log('[WorkspaceMembersPanel] 设为管理员:', { memberId: member.id, workspaceId })
      const response = await fetch('/api/workspace-members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, memberId: member.id, role: 'admin' })
      })
      const data = await response.json()

      if (data.success) {
        // 更新本地状态
        setMembers(prev => prev.map(m =>
          m.id === member.id ? { ...m, role: 'admin' as MemberRole } : m
        ))
        toast.success(isZh ? '已设为管理员' : 'Admin role assigned')
        console.log('[WorkspaceMembersPanel] 设为管理员成功')
      } else {
        toast.error(data.error || (isZh ? '操作失败' : 'Operation failed'))
      }
    } catch (error) {
      console.error('Set admin error:', error)
      toast.error(isZh ? '操作失败，请重试' : 'Operation failed, please try again')
    } finally {
      setIsOperating(false)
      setConfirmDialog({ open: false, type: null, member: null })
    }
  }

  // 取消管理员
  const handleRemoveAdmin = async (member: MemberWithRole) => {
    if (isOperating) return
    // 打开确认对话框
    setConfirmDialog({ open: true, type: 'removeAdmin', member })
  }

  // 确认取消管理员
  const confirmRemoveAdmin = async () => {
    const member = confirmDialog.member
    if (!member) return

    try {
      setIsOperating(true)
      console.log('[WorkspaceMembersPanel] 取消管理员:', { memberId: member.id, workspaceId })
      const response = await fetch('/api/workspace-members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, memberId: member.id, role: 'member' })
      })
      const data = await response.json()

      if (data.success) {
        // 更新本地状态
        setMembers(prev => prev.map(m =>
          m.id === member.id ? { ...m, role: 'member' as MemberRole } : m
        ))
        toast.success(isZh ? '已取消管理员' : 'Admin role removed')
        console.log('[WorkspaceMembersPanel] 取消管理员成功')
      } else {
        toast.error(data.error || (isZh ? '操作失败' : 'Operation failed'))
      }
    } catch (error) {
      console.error('Remove admin error:', error)
      toast.error(isZh ? '操作失败，请重试' : 'Operation failed, please try again')
    } finally {
      setIsOperating(false)
      setConfirmDialog({ open: false, type: null, member: null })
    }
  }

  // 执行确认操作
  const handleConfirmAction = () => {
    switch (confirmDialog.type) {
      case 'remove':
        confirmRemoveMember()
        break
      case 'setAdmin':
        confirmSetAdmin()
        break
      case 'removeAdmin':
        confirmRemoveAdmin()
        break
    }
  }

  // 获取确认对话框内容
  const getConfirmDialogContent = () => {
    const member = confirmDialog.member
    const memberName = member?.full_name || member?.username || ''

    switch (confirmDialog.type) {
      case 'remove':
        return {
          title: isZh ? '移除成员' : 'Remove Member',
          description: isZh
            ? `确定要将 ${memberName} 从工作区移除吗？`
            : `Are you sure you want to remove ${memberName} from the workspace?`,
          confirmText: isZh ? '确认移除' : 'Remove',
          variant: 'destructive' as const
        }
      case 'setAdmin':
        return {
          title: isZh ? '设为管理员' : 'Set as Admin',
          description: isZh
            ? `确定要将 ${memberName} 设为管理员吗？`
            : `Are you sure you want to set ${memberName} as admin?`,
          confirmText: isZh ? '确认' : 'Confirm',
          variant: 'default' as const
        }
      case 'removeAdmin':
        return {
          title: isZh ? '取消管理员' : 'Remove Admin',
          description: isZh
            ? `确定要取消 ${memberName} 的管理员身份吗？`
            : `Are you sure you want to remove ${memberName} from admin role?`,
          confirmText: isZh ? '确认' : 'Confirm',
          variant: 'default' as const
        }
      default:
        return { title: '', description: '', confirmText: '', variant: 'default' as const }
    }
  }

  const filteredMembers = members.filter(member => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      member.full_name?.toLowerCase().includes(query) ||
      member.username?.toLowerCase().includes(query) ||
      member.email?.toLowerCase().includes(query) ||
      member.title?.toLowerCase().includes(query)
    )
  }).sort((a, b) => getRoleWeight(a.role) - getRoleWeight(b.role)) // 按角色排序：owner > admin > member > guest

  const filteredRequests = requests.filter(request => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      request.name.toLowerCase().includes(query) ||
      request.email.toLowerCase().includes(query)
    )
  })

  // 获取选中的成员或申请
  const selectedMember = members.find(m => m.id === selectedId)
  const selectedRequest = requests.find(r => r.id === selectedId)
  const selectedItem = activeTab === 'members' ? selectedMember : selectedRequest

  // 获取角色显示文本和样式
  const getRoleInfo = (role: MemberRole) => {
    const roleMap = {
      owner: { text: 'Owner', color: 'bg-orange-50 text-orange-600' },
      admin: { text: 'Admin', color: 'bg-blue-50 text-blue-600' },
      member: { text: 'Member', color: 'bg-gray-50 text-gray-600' },
      guest: { text: 'Guest', color: 'bg-green-50 text-green-600' }
    }
    return roleMap[role] || roleMap.member
  }

  // 权限判断变量
  const isCurrentUserOwner = currentUserRole === 'owner'
  const isCurrentUserAdmin = currentUserRole === 'admin' || isCurrentUserOwner
  console.log('[WorkspaceMembersPanel] 权限判断:', { currentUserRole, isCurrentUserOwner, isCurrentUserAdmin })

  const getStatusText = (status: string) => {
    const statusKey = status as 'online' | 'away' | 'busy' | 'offline'
    return t(statusKey)
  }

  if (isLoading) {
    console.log('[WorkspaceMembersPanel] Loading...')
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  console.log('[WorkspaceMembersPanel] Render state:', {
    membersCount: members.length,
    selectedId,
    filteredCount: filteredMembers.length
  })

  const workspaceName = workspace?.name || (isZh ? '工作区' : 'Workspace')

  return (
    <div className="flex h-full">
      {/* 2. 中间列表区 */}
      <div className="w-[380px] border-r border-gray-200 bg-white flex flex-col">
        <div className="p-6">
          <h1 className="text-xl font-bold mb-4">
            {isZh ? '工作区成员' : 'Workspace Members'}
          </h1>

          {/* Tab 切换 */}
          <div className="flex border-b border-gray-100 mb-4">
            <button
              onClick={() => { setActiveTab('members'); setSelectedId(null); }}
              className={`flex-1 pb-2 text-sm font-medium transition ${activeTab === 'members' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}
            >
              {isZh ? '成员' : 'Members'} ({members.length})
            </button>
            <button
              onClick={() => { setActiveTab('pending'); setSelectedId(null); }}
              className={`flex-1 pb-2 text-sm font-medium transition relative ${activeTab === 'pending' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400'}`}
            >
              {isZh ? '待审批' : 'Pending'}
              {requests.length > 0 && (
                <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full uppercase font-bold tracking-tighter">
                  {isZh ? '新' : 'New'}
                </span>
              )}
            </button>
          </div>

          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={isZh ? '搜索名称或邮箱...' : 'Search name or email...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {activeTab === 'members' ? (
            filteredMembers.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                {isZh ? '暂无成员' : 'No members found'}
              </div>
            ) : (
              filteredMembers.map(m => {
                const roleInfo = getRoleInfo(m.role)
                return (
                  <div
                    key={m.id}
                    onClick={() => setSelectedId(m.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition mb-1 ${selectedId === m.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                  >
                    <div className={`w-9 h-9 rounded-full ${getAvatarColor(m.full_name || m.username)} text-white flex items-center justify-center font-bold text-sm`}>
                      {(m.full_name || m.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{m.full_name || m.username}</p>
                      <p className="text-[11px] text-gray-400 truncate">{m.email}</p>
                    </div>
                    {m.role === 'owner' && (
                      <span className={`text-[10px] ${roleInfo.color} px-1.5 py-0.5 rounded font-bold uppercase`}>
                        {roleInfo.text}
                      </span>
                    )}
                    {m.role === 'admin' && (
                      <span className={`text-[10px] ${roleInfo.color} px-1.5 py-0.5 rounded font-bold uppercase`}>
                        {roleInfo.text}
                      </span>
                    )}
                  </div>
                )
              })
            )
          ) : (
            filteredRequests.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                {isZh ? '暂无待审批申请' : 'No pending requests'}
              </div>
            ) : (
              filteredRequests.map(r => (
                <div
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`flex items-center gap-3 p-4 border border-transparent rounded-xl cursor-pointer transition mb-2 ${selectedId === r.id ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 hover:bg-gray-100'}`}
                >
                  <div className={`w-10 h-10 rounded-full ${r.avatarColor} text-white flex items-center justify-center font-bold`}>
                    {r.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate">{r.name}</p>
                    <p className="text-[11px] text-gray-500 italic truncate">
                      {isZh ? `申请加入 ${workspaceName}...` : `Request to join ${workspaceName}...`}
                    </p>
                  </div>
                  <div className="text-[10px] text-gray-400 whitespace-nowrap">{r.time}</div>
                </div>
              ))
            )
          )}
        </div>
      </div>

      {/* 3. 右侧详情区 */}
      <div className="flex-1 bg-white flex flex-col items-center justify-center p-12">
        {selectedItem ? (
          <div className="w-full max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white border border-gray-200 rounded-3xl p-10 shadow-sm relative overflow-hidden">

              {/* 背景装饰 */}
              <div className={`absolute top-0 left-0 right-0 h-24 ${activeTab === 'members' ? getAvatarColor((selectedMember?.full_name || selectedMember?.username || '')) : 'bg-blue-500'} opacity-10`}></div>

              <div className="flex flex-col items-center text-center mb-10 relative z-10">
                <div className={`w-24 h-24 rounded-[32px] ${activeTab === 'members' ? getAvatarColor((selectedMember?.full_name || selectedMember?.username || '')) : 'bg-blue-500'} text-white flex items-center justify-center text-4xl font-bold mb-6 shadow-lg`}>
                  {activeTab === 'members'
                    ? (selectedMember?.full_name || selectedMember?.username || '?').charAt(0).toUpperCase()
                    : (selectedRequest?.name || '?').charAt(0).toUpperCase()
                  }
                </div>
                <h2 className="text-3xl font-black mb-2">
                  {activeTab === 'members'
                    ? (selectedMember?.full_name || selectedMember?.username)
                    : selectedRequest?.name
                  }
                </h2>
                <p className="text-gray-400 font-medium italic">
                  {activeTab === 'members' ? selectedMember?.email : selectedRequest?.email}
                </p>
              </div>

              <div className="space-y-4 mb-10 relative z-10">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div className="flex items-center gap-3 text-gray-500 font-medium">
                    <Shield size={18} />
                    <span>{isZh ? '权限角色' : 'Role'}</span>
                  </div>
                  <span className="font-bold text-sm uppercase tracking-wider">
                    {activeTab === 'members'
                      ? getRoleInfo(selectedMember?.role || 'member').text
                      : (isZh ? '待审批' : 'Pending')
                    }
                  </span>
                </div>
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div className="flex items-center gap-3 text-gray-500 font-medium">
                    <Clock size={18} />
                    <span>{activeTab === 'members' ? (isZh ? '加入时间' : 'Joined') : (isZh ? '申请时间' : 'Request Time')}</span>
                  </div>
                  <span className="font-bold text-sm">
                    {activeTab === 'members' ? selectedMember?.joinedAt : selectedRequest?.time}
                  </span>
                </div>
              </div>

              {activeTab === 'pending' && selectedRequest && (
                <div className="mb-10 p-5 bg-blue-50 border border-blue-100 rounded-2xl">
                  <p className="text-xs font-bold text-blue-600 uppercase mb-2">
                    {isZh ? '申请理由' : 'Reason'}
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed italic">"{selectedRequest.reason}"</p>
                </div>
              )}

              {/* 成员操作按钮：发消息、电话、视频 */}
              {activeTab === 'members' && selectedMember && (
                <div className="flex gap-3 mb-6 relative z-10">
                  <button
                    onClick={() => onStartChat(selectedMember.id)}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition"
                  >
                    <MessageSquare size={18} />
                    {isZh ? '发消息' : 'Message'}
                  </button>
                  <button
                    onClick={() => {
                      // TODO: 实现电话功能
                      toast.info(isZh ? '电话功能即将推出！' : 'Call feature coming soon!')
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition"
                  >
                    <Phone size={18} />
                    {isZh ? '电话' : 'Call'}
                  </button>
                  <button
                    onClick={() => {
                      // TODO: 实现视频功能
                      toast.info(isZh ? '视频功能即将推出！' : 'Video call feature coming soon!')
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition"
                  >
                    <Video size={18} />
                    {isZh ? '视频' : 'Video'}
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-3 relative z-10">
                {activeTab === 'members' && selectedMember ? (
                  <>
                    {/* 只有 owner 能设置/取消管理员 */}
                    {isCurrentUserOwner && selectedMember.role === 'member' && (
                      <button
                        onClick={() => handleSetAdmin(selectedMember)}
                        disabled={isOperating}
                        className="flex items-center justify-center gap-2 py-3 border-2 border-blue-100 text-blue-600 font-bold rounded-2xl hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Shield size={18} />
                        {isOperating ? (isZh ? '处理中...' : 'Processing...') : (isZh ? '设为管理员' : 'Set as Admin')}
                      </button>
                    )}

                    {isCurrentUserOwner && selectedMember.role === 'admin' && (
                      <button
                        onClick={() => handleRemoveAdmin(selectedMember)}
                        disabled={isOperating}
                        className="flex items-center justify-center gap-2 py-3 border-2 border-gray-200 text-gray-600 font-bold rounded-2xl hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ShieldOff size={18} />
                        {isOperating ? (isZh ? '处理中...' : 'Processing...') : (isZh ? '取消管理员' : 'Remove Admin')}
                      </button>
                    )}

                    {/* 只有 owner 和 admin 能移除成员，且不能移除 owner */}
                    {isCurrentUserAdmin && selectedMember.role !== 'owner' && (
                      <button
                        onClick={() => handleRemoveMember(selectedMember)}
                        disabled={isOperating}
                        className="flex items-center justify-center gap-2 py-3 border-2 border-red-100 text-red-500 font-bold rounded-2xl hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 size={18} />
                        {isOperating ? (isZh ? '处理中...' : 'Processing...') : (isZh ? `从 ${workspaceName} 移除` : `Remove from ${workspaceName}`)}
                      </button>
                    )}
                  </>
                ) : selectedRequest ? (
                  <div className="flex gap-4">
                    <button
                      onClick={() => handleRejectRequest(selectedRequest)}
                      disabled={isOperating}
                      className="flex-1 py-4 border-2 border-gray-100 text-gray-400 font-bold rounded-2xl hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isOperating ? (isZh ? '处理中...' : 'Processing...') : (isZh ? '拒绝' : 'Reject')}
                    </button>
                    <button
                      onClick={() => handleApproveRequest(selectedRequest)}
                      disabled={isOperating}
                      className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isOperating ? (isZh ? '处理中...' : 'Processing...') : (isZh ? '批准加入' : 'Approve')}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center mb-6">
              <Users size={48} className="text-gray-300" strokeWidth={1.5} />
            </div>
            <h3 className="text-xl font-bold text-gray-400 mb-2">
              {isZh ? '未选择成员' : 'No member selected'}
            </h3>
            <p className="text-gray-300 text-sm max-w-xs leading-relaxed">
              {isZh
                ? `在工作区 [${workspaceName}] 中选择一个成员或申请进行操作。`
                : `Select a member or request in [${workspaceName}] to view details.`
              }
            </p>
          </div>
        )}
      </div>

      {/* 确认对话框 */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => {
        if (!open) setConfirmDialog({ open: false, type: null, member: null })
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{getConfirmDialogContent().title}</AlertDialogTitle>
            <AlertDialogDescription>
              {getConfirmDialogContent().description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isOperating}>
              {isZh ? '取消' : 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              disabled={isOperating}
              className={getConfirmDialogContent().variant === 'destructive' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {isOperating ? (isZh ? '处理中...' : 'Processing...') : getConfirmDialogContent().confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
