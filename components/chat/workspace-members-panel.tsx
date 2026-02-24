'use client'

import { useState, useEffect } from 'react'
import { User, Workspace } from '@/lib/types'
import { Search, Users, Loader2, Shield, Clock, Trash2, MessageSquare, Phone, Video } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

// 待审批申请的类型定义
interface JoinRequest {
  id: string
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

// Mock 待审批数据
const mockJoinRequests: JoinRequest[] = [
  {
    id: 'req-1',
    name: '张三',
    email: 'zhangsan@example.com',
    reason: '我是产品团队成员，需要加入工作区进行协作',
    time: '10分钟前',
    avatarColor: 'bg-blue-500'
  },
  {
    id: 'req-2',
    name: '李四',
    email: 'lisi@example.com',
    reason: '新入职员工，需要加入团队工作区',
    time: '1小时前',
    avatarColor: 'bg-green-500'
  }
]

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
  const [requests, setRequests] = useState<JoinRequest[]>(mockJoinRequests)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)
  const isZh = language === 'zh'

  useEffect(() => {
    loadWorkspaceMembers()
  }, [workspaceId])

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
        // 添加 mock 角色和加入时间数据
        const membersWithRoles: MemberWithRole[] = (data.members || []).map((member: User, index: number) => ({
          ...member,
          role: index === 0 ? 'owner' : (index <= 2 ? 'admin' : 'member') as MemberRole,
          joinedAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN')
        }))
        setMembers(membersWithRoles)
      }
    } catch (error) {
      console.error('Failed to load workspace members:', error)
    } finally {
      setIsLoading(false)
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
  })

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
                      alert(isZh ? '电话功能即将推出！' : 'Call feature coming soon!')
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition"
                  >
                    <Phone size={18} />
                    {isZh ? '电话' : 'Call'}
                  </button>
                  <button
                    onClick={() => {
                      // TODO: 实现视频功能
                      alert(isZh ? '视频功能即将推出！' : 'Video call feature coming soon!')
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition"
                  >
                    <Video size={18} />
                    {isZh ? '视频' : 'Video'}
                  </button>
                </div>
              )}

              <div className="flex gap-4 relative z-10">
                {activeTab === 'members' && selectedMember ? (
                  selectedMember.role !== 'owner' && (
                    <button
                      onClick={() => {
                        // TODO: 实现移除成员逻辑
                        console.log('Remove member:', selectedMember.id)
                      }}
                      className="flex-1 flex items-center justify-center gap-2 py-4 border-2 border-red-100 text-red-500 font-bold rounded-2xl hover:bg-red-50 transition"
                    >
                      <Trash2 size={18} />
                      {isZh ? `从 ${workspaceName} 移除` : `Remove from ${workspaceName}`}
                    </button>
                  )
                ) : selectedRequest ? (
                  <>
                    <button
                      onClick={() => {
                        // TODO: 实现拒绝逻辑
                        setRequests(requests.filter(r => r.id !== selectedRequest.id))
                        setSelectedId(null)
                      }}
                      className="flex-1 py-4 border-2 border-gray-100 text-gray-400 font-bold rounded-2xl hover:bg-gray-50 transition"
                    >
                      {isZh ? '拒绝' : 'Reject'}
                    </button>
                    <button
                      onClick={() => {
                        // TODO: 实现批准逻辑
                        console.log('Approve request:', selectedRequest.id)
                        setRequests(requests.filter(r => r.id !== selectedRequest.id))
                        setSelectedId(null)
                      }}
                      className="flex-1 py-4 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition"
                    >
                      {isZh ? '批准加入' : 'Approve'}
                    </button>
                  </>
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
    </div>
  )
}
