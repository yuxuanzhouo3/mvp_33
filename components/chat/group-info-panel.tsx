'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { ConversationWithDetails, User } from '@/lib/types'
import { Users, Settings, UserPlus, LogOut, X, MoreVertical, Shield, Crown, Megaphone, FileIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GroupSettingsDialog } from './group-settings-dialog'
import { AddMembersDialog } from './add-members-dialog'
import { MemberActionsMenu } from './member-actions-menu'
import { GroupMembersSection } from './group-members-section'
import { GroupAnnouncementsDialog } from './group-announcements-dialog'
import { GroupFilesDialog } from './group-files-dialog'

interface GroupInfoPanelProps {
  conversation: ConversationWithDetails
  currentUser: User
  isOpen: boolean
  onClose: () => void
  onUpdate?: () => void
}

export function GroupInfoPanel({
  conversation,
  currentUser,
  isOpen,
  onClose,
  onUpdate
}: GroupInfoPanelProps) {
  const [showSettings, setShowSettings] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [showAnnouncements, setShowAnnouncements] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [selectedMember, setSelectedMember] = useState<User | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)

  // 获取当前用户在群聊中的角色
  const currentUserMember = conversation.members.find(m => m.id === currentUser.id)
  const isOwner = currentUserMember?.role === 'owner'
  const isAdmin = currentUserMember?.role === 'admin' || isOwner

  const handleMemberContextMenu = (e: React.MouseEvent, member: User) => {
    e.preventDefault()
    setSelectedMember(member)
    setMenuPosition({ x: e.clientX, y: e.clientY })
  }

  const handleLeaveGroup = async () => {
    if (!confirm('确定要离开这个群聊吗？')) return

    try {
      const response = await fetch(`/api/conversations/${conversation.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        onClose()
        window.location.href = '/chat'
      }
    } catch (error) {
      console.error('离开群聊失败:', error)
      alert('离开群聊失败，请重试')
    }
  }

  const getMemberRoleIcon = (member: User) => {
    const memberData = conversation.members.find(m => m.id === member.id)
    if (memberData?.role === 'owner') {
      return <Crown className="h-3 w-3 text-yellow-500" />
    }
    if (memberData?.role === 'admin') {
      return <Shield className="h-3 w-3 text-blue-500" />
    }
    return null
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'away': return 'bg-yellow-500'
      case 'busy': return 'bg-red-500'
      default: return 'bg-gray-400'
    }
  }

  return (
    <>
      <div
        className={cn(
          'border-l bg-background transition-all duration-300 ease-out',
          isOpen ? 'w-80' : 'w-0 overflow-hidden'
        )}
      >
        {isOpen && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="border-b p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg">群聊信息</h2>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={onClose}
                  className="h-8 w-8"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 rounded-xl shrink-0">
                  <AvatarImage src={conversation.avatar_url || undefined} />
                  <AvatarFallback className="rounded-xl bg-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base truncate">{conversation.name}</h3>
                  <p className="text-sm text-muted-foreground">{conversation.members.length} 位成员</p>
                </div>
              </div>

              {conversation.description && (
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                  {conversation.description}
                </p>
              )}
            </div>

            {/* Actions */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Quick Actions */}
                <div className="space-y-1">
                  <Button
                    variant="ghost"
                    className="w-full justify-start hover:bg-accent transition-colors duration-200 rounded-lg"
                    onClick={() => setShowAnnouncements(true)}
                  >
                    <Megaphone className="mr-2 h-4 w-4" />
                    群公告
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start hover:bg-accent transition-colors duration-200 rounded-lg"
                    onClick={() => setShowFiles(true)}
                  >
                    <FileIcon className="mr-2 h-4 w-4" />
                    群文件
                  </Button>
                  {isAdmin && (
                    <>
                      <Button
                        variant="ghost"
                        className="w-full justify-start hover:bg-accent transition-colors duration-200 rounded-lg"
                        onClick={() => setShowAddMembers(true)}
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        添加成员
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start hover:bg-accent transition-colors duration-200 rounded-lg"
                        onClick={() => setShowSettings(true)}
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        群聊设置
                      </Button>
                    </>
                  )}
                </div>

                <GroupMembersSection
                  conversationId={conversation.id}
                  isAdmin={isAdmin}
                  onAddMembers={() => setShowAddMembers(true)}
                />

                <Separator />

                {/* Members List */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-muted-foreground">
                      成员列表
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {conversation.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent cursor-pointer transition-colors duration-200"
                        onContextMenu={(e) => isAdmin && handleMemberContextMenu(e, member)}
                        onClick={(e) => {
                          if (isAdmin) {
                            handleMemberContextMenu(e, member)
                          }
                        }}
                      >
                        <div className="relative">
                          <Avatar className="h-10 w-10 rounded-lg">
                            <AvatarImage src={member.avatar_url || undefined} />
                            <AvatarFallback className="text-sm">
                              {member.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className={cn(
                            'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background',
                            getStatusColor(member.status)
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-sm font-medium truncate">{member.full_name}</p>
                            {getMemberRoleIcon(member)}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {member.title || member.username}
                          </p>
                        </div>
                        {isAdmin && member.id !== currentUser.id && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleMemberContextMenu(e, member)
                            }}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Leave Group */}
                <div className="space-y-1">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors duration-200"
                    onClick={handleLeaveGroup}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    离开群聊
                  </Button>
                </div>
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <GroupSettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        conversation={conversation}
        isOwner={isOwner}
        onUpdate={onUpdate}
      />

      <AddMembersDialog
        open={showAddMembers}
        onOpenChange={setShowAddMembers}
        conversationId={conversation.id}
        existingMemberIds={conversation.members.map(m => m.id)}
        onUpdate={onUpdate}
      />

      <GroupAnnouncementsDialog
        open={showAnnouncements}
        onOpenChange={setShowAnnouncements}
        conversationId={conversation.id}
        isAdmin={isAdmin}
      />

      <GroupFilesDialog
        open={showFiles}
        onOpenChange={setShowFiles}
        conversationId={conversation.id}
        currentUserId={currentUser.id}
        isAdmin={isAdmin}
      />

      {selectedMember && menuPosition && (
        <MemberActionsMenu
          member={selectedMember}
          conversation={conversation}
          currentUser={currentUser}
          isOwner={isOwner}
          isAdmin={isAdmin}
          position={menuPosition}
          onClose={() => {
            setSelectedMember(null)
            setMenuPosition(null)
          }}
          onUpdate={onUpdate}
        />
      )}
    </>
  )
}
