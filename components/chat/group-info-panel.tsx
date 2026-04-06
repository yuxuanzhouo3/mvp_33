'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { ConversationWithDetails, User } from '@/lib/types'
import { Users, Settings, UserPlus, LogOut, X, MoreVertical, Shield, Crown, Megaphone, FileIcon, Bell, BellOff, Pin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GroupSettingsDialog } from './group-settings-dialog'
import { AddMembersDialog } from './add-members-dialog'
import { MemberActionsMenu } from './member-actions-menu'
import { GroupMembersSection } from './group-members-section'
import { AnnouncementDrawer } from './announcement-drawer'
import { GroupFilesDialog } from './group-files-dialog'
import { GroupNicknameDialog } from './group-nickname-dialog'
import { useSettings } from '@/lib/settings-context'
import { toast } from 'sonner'

interface GroupInfoPanelProps {
  conversation: ConversationWithDetails
  currentUser: User
  isOpen: boolean
  onClose: () => void
  onUpdate?: () => void
  variant?: 'panel' | 'sheet'
}

export function GroupInfoPanel({
  conversation,
  currentUser,
  isOpen,
  onClose,
  onUpdate,
  variant = 'panel'
}: GroupInfoPanelProps) {
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)
  const isSheet = variant === 'sheet'
  const [showSettings, setShowSettings] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [showAnnouncements, setShowAnnouncements] = useState(false)
  const [showFiles, setShowFiles] = useState(false)
  const [showNickname, setShowNickname] = useState(false)
  const [selectedMember, setSelectedMember] = useState<User | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [currentNickname, setCurrentNickname] = useState<string>('')

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
    if (!confirm(tr('确定要离开这个群聊吗？', 'Are you sure you want to leave this group?'))) return

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
      alert(tr('离开群聊失败，请重试', 'Failed to leave group, please try again'))
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
          isSheet ? 'w-full h-full bg-background' : 'border-l bg-background transition-all duration-300 ease-out',
          !isSheet && (isOpen ? 'w-64' : 'w-0 overflow-hidden')
        )}
      >
        {isOpen && (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="border-b p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-lg">{tr('群聊信息', 'Group Info')}</h2>
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
                  <p className="text-sm text-muted-foreground">
                    {language === 'zh' ? `${conversation.members.length} 位成员` : `${conversation.members.length} members`}
                  </p>
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
                  {/* Invite members – visible to ALL members (WeChat-style) */}
                  <Button
                    variant="ghost"
                    className="w-full justify-start hover:bg-accent transition-colors duration-200 rounded-lg"
                    onClick={() => setShowAddMembers(true)}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    {tr('邀请成员', 'Invite Members')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start hover:bg-accent transition-colors duration-200 rounded-lg"
                    onClick={() => setShowAnnouncements(true)}
                  >
                    <Megaphone className="mr-2 h-4 w-4" />
                    {tr('群公告', 'Announcements')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start hover:bg-accent transition-colors duration-200 rounded-lg"
                    onClick={() => setShowFiles(true)}
                  >
                    <FileIcon className="mr-2 h-4 w-4" />
                    {tr('群文件', 'Files')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full justify-start hover:bg-accent transition-colors duration-200 rounded-lg"
                    onClick={() => setShowNickname(true)}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    {tr('群昵称', 'Group Nickname')}
                  </Button>
                  {isAdmin && (
                      <Button
                        variant="ghost"
                        className="w-full justify-start hover:bg-accent transition-colors duration-200 rounded-lg"
                        onClick={() => setShowSettings(true)}
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        {tr('群聊设置', 'Group Settings')}
                      </Button>
                  )}
                </div>

                <GroupMembersSection
                  conversationId={conversation.id}
                  isAdmin={isAdmin}
                  onAddMembers={() => setShowAddMembers(true)}
                />

                <Separator />

                {/* Settings */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-2 rounded-lg hover:bg-accent transition-colors duration-200">
                    <div className="flex items-center gap-2">
                      {isMuted ? <BellOff className="h-4 w-4 text-muted-foreground" /> : <Bell className="h-4 w-4 text-muted-foreground" />}
                      <span className="text-sm">{tr('消息免打扰', 'Mute Notifications')}</span>
                    </div>
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className={cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                        isMuted ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                          isMuted ? 'translate-x-5' : 'translate-x-0.5'
                        )}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-2 rounded-lg hover:bg-accent transition-colors duration-200">
                    <div className="flex items-center gap-2">
                      <Pin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{tr('置顶会话', 'Pin Conversation')}</span>
                    </div>
                    <button
                      onClick={() => setIsPinned(!isPinned)}
                      className={cn(
                        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                        isPinned ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                      )}
                    >
                      <span
                        className={cn(
                          'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                          isPinned ? 'translate-x-5' : 'translate-x-0.5'
                        )}
                      />
                    </button>
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
                    {tr('离开群聊', 'Leave Group')}
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
        conversationName={conversation.name || undefined}
        existingMemberIds={conversation.members.map(m => m.id)}
        onUpdate={onUpdate}
        showInviteLink={true}
        isAdmin={isAdmin}
      />

      <AnnouncementDrawer
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

      <GroupNicknameDialog
        open={showNickname}
        onOpenChange={setShowNickname}
        conversationId={conversation.id}
        currentNickname={currentNickname}
        onUpdate={onUpdate}
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
