'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { mockAuth } from '@/lib/mock-auth'
import { Workspace } from '@/lib/types'
import { Building2, ChevronRight, Loader2, Plus, UserPlus, RefreshCw } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { JoinWorkspaceDialog } from './join-workspace-dialog'

interface WorkspaceSelectorProps {
  onSelect: (workspace: Workspace) => void
}

export function WorkspaceSelector({ onSelect }: WorkspaceSelectorProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showJoinDialog, setShowJoinDialog] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newWorkspaceName, setNewWorkspaceName] = useState('')
  const [newInviteCode, setNewInviteCode] = useState('')
  const [generatedInviteCode, setGeneratedInviteCode] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  useEffect(() => {
    async function loadWorkspaces() {
      try {
        const response = await fetch('/api/workspaces')
        const data = await response.json()

        if (data.success && data.workspaces && data.workspaces.length > 0) {
          setWorkspaces(data.workspaces)
        }
        // 如果没有从API获取到数据，显示空列表，让用户创建工作区
      } finally {
        setIsLoading(false)
      }
    }

    loadWorkspaces()
  }, [])

  const handleSelect = (workspace: Workspace) => {
    mockAuth.setCurrentWorkspace(workspace)
    onSelect(workspace)
  }

  const handleJoin = async (workspaceId: string): Promise<{ success: boolean; error?: string }> => {
    console.log('[WorkspaceSelector] ========== handleJoin 开始 ==========')
    console.log('[WorkspaceSelector] 目标工作区ID:', workspaceId)

    try {
      console.log('[WorkspaceSelector] 准备发送 POST 请求到 /api/workspace-join-requests')

      const response = await fetch('/api/workspace-join-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      })

      console.log('[WorkspaceSelector] 响应状态:', response.status, response.statusText)
      console.log('[WorkspaceSelector] 响应头:', JSON.stringify(Object.fromEntries(response.headers.entries())))

      const data = await response.json()
      console.log('[WorkspaceSelector] 响应数据:', JSON.stringify(data, null, 2))

      if (data.success) {
        console.log('[WorkspaceSelector] 申请成功!')
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('workspaceJoinRequestsUpdated'))
          window.dispatchEvent(new Event('pendingRequestsUpdated'))
        }
        // 申请已发送，不刷新工作区列表（因为用户还未加入）
        // 返回成功，让对话框显示"申请已发送"
        return { success: true }
      } else {
        console.log('[WorkspaceSelector] 申请失败:', data.error)
        return { success: false, error: data.error || 'Failed to submit request' }
      }
    } catch (error: any) {
      console.error('[WorkspaceSelector] 请求异常:', error)
      console.error('[WorkspaceSelector] 异常堆栈:', error.stack)
      return { success: false, error: 'Failed to submit join request' }
    }
  }

  const handleCreate = async () => {
    if (!newWorkspaceName.trim() || !newInviteCode.trim()) return

    setIsCreating(true)

    try {
      // 调用 API 创建工作区，传递邀请码
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newWorkspaceName, inviteCode: newInviteCode.trim().toUpperCase() }),
      })
      const data = await response.json()

      if (data.success) {
        // 保存邀请码，显示给用户
        setGeneratedInviteCode(newInviteCode.trim().toUpperCase())

        // 使用 API 返回的工作区数据，不再创建 mock 工作区
        if (data.workspace) {
          const newWorkspace: Workspace = {
            id: data.workspace.id,
            name: data.workspace.name || newWorkspaceName,
            domain: data.workspace.domain || newWorkspaceName.toLowerCase().replace(/\s+/g, '-'),
            description: data.workspace.description || '',
            logo_url: data.workspace.logo_url,
            owner_id: data.workspace.owner_id,
          }
          setWorkspaces([...workspaces, newWorkspace])
        }
        setNewWorkspaceName('')
        setNewInviteCode('')
      } else {
        // API 返回失败，不创建 mock 工作区，显示错误信息
        console.error('Create workspace failed:', data.error)
        alert(language === 'zh' ? `创建工作区失败: ${data.error || '请重试'}` : `Failed to create workspace: ${data.error || 'Please try again'}`)
        setIsCreating(false)
        return
      }
    } catch (error) {
      console.error('Create workspace error:', error)
      // 不创建 mock 工作区，显示错误信息
      alert(language === 'zh' ? '创建工作区失败，请检查网络连接后重试' : 'Failed to create workspace. Please check your connection and try again.')
      setIsCreating(false)
      return
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <>
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-xl font-semibold">
            {language === 'zh' ? '选择一个工作区以继续' : 'Select a workspace to continue'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : workspaces.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>{language === 'zh' ? '暂无工作区' : 'No workspaces yet'}</p>
              <p className="text-sm mt-2">{language === 'zh' ? '请联系管理员创建工作区' : 'Contact admin to create a workspace'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {workspaces.map((workspace) => (
                <Button
                  key={workspace.id}
                  variant="outline"
                  className="w-full justify-between h-auto p-3 hover:bg-primary/5"
                  onClick={() => handleSelect(workspace)}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-500 flex items-center justify-center text-white font-bold text-sm">
                      {workspace.name.charAt(0)}
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-sm">{workspace.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {workspace.domain}.chat
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Button>
              ))}
            </div>
          )}

          {/* 加入组织和创建新组织按钮 */}
          <div className="flex flex-col space-y-2 pt-3 border-t">
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowJoinDialog(true)}
            >
              <UserPlus className="h-4 w-4" />
              {language === 'zh' ? '加入组织' : 'Join Organization'}
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="h-4 w-4" />
              {language === 'zh' ? '创建新组织' : 'Create New Organization'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 加入组织对话框 */}
      <JoinWorkspaceDialog
        open={showJoinDialog}
        onOpenChange={setShowJoinDialog}
        onJoin={handleJoin}
      />

      {/* 创建新组织对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open)
        if (!open) {
          setNewWorkspaceName('')
          setNewInviteCode('')
          setGeneratedInviteCode('')
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {generatedInviteCode ? (language === 'zh' ? '创建成功' : 'Created Successfully') : (language === 'zh' ? '创建新组织' : 'Create New Organization')}
            </DialogTitle>
            <DialogDescription>
              {generatedInviteCode ? (language === 'zh' ? '请保存以下邀请码，分享给成员加入组织' : 'Save the invite code below to share with members') : (language === 'zh' ? '创建一个新的工作区' : 'Create a new workspace')}
            </DialogDescription>
          </DialogHeader>

          {generatedInviteCode ? (
            // 显示生成的邀请码
            <div className="py-4 space-y-4">
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-2">
                  {language === 'zh' ? '邀请码' : 'Invite Code'}
                </div>
                <div className="text-3xl font-mono font-bold tracking-widest text-primary bg-primary/10 px-6 py-3 rounded-lg">
                  {generatedInviteCode}
                </div>
              </div>
              <div className="text-center text-sm text-muted-foreground">
                {language === 'zh' ? '将此邀请码分享给需要加入组织的成员' : 'Share this invite code with members who need to join'}
              </div>
              <DialogFooter>
                <Button onClick={() => {
                  setShowCreateDialog(false)
                  setGeneratedInviteCode('')
                  setNewInviteCode('')
                }}>
                  {language === 'zh' ? '完成' : 'Done'}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            // 创建表单
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {language === 'zh' ? '组织名称' : 'Organization Name'}
                  </label>
                  <Input
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    placeholder={language === 'zh' ? '例如：TechCorp 总组' : 'e.g., TechCorp'}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">
                      {language === 'zh' ? '邀请码' : 'Invite Code'}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const prefix = newWorkspaceName.substring(0, 4).toUpperCase() || 'ORG'
                        const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase()
                        setNewInviteCode(`${prefix}${randomPart}`)
                      }}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      {language === 'zh' ? '随机生成' : 'Random'}
                    </button>
                  </div>
                  <Input
                    value={newInviteCode}
                    onChange={(e) => setNewInviteCode(e.target.value.toUpperCase())}
                    placeholder={language === 'zh' ? '例如：TECHCORP123' : 'e.g., TECHCORP123'}
                    className="font-mono"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setShowCreateDialog(false)
                  setNewWorkspaceName('')
                  setNewInviteCode('')
                }}>
                  {language === 'zh' ? '取消' : 'Cancel'}
                </Button>
                <Button onClick={handleCreate} disabled={!newWorkspaceName.trim() || !newInviteCode.trim() || isCreating}>
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {language === 'zh' ? '创建中...' : 'Creating...'}
                    </>
                  ) : (
                    language === 'zh' ? '创建' : 'Create'
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
