'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { mockAuth } from '@/lib/mock-auth'
import { WorkspaceHeader } from '@/components/chat/workspace-header'
import { AppNavigation } from '@/components/layout/app-navigation'
import { User, Workspace } from '@/lib/types'
import { Video, Plus, Calendar, Users, Clock, Trash2, Copy, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSettings } from '@/lib/settings-context'
import { useIsMobile } from '@/hooks/use-mobile'

interface Meeting {
  _id: string
  id?: string
  title: string
  type: 'instant' | 'scheduled'
  room_id: string
  host_id: string
  host_name: string
  start_time: string
  end_time: string | null
  status: 'active' | 'scheduled' | 'ended'
  participants: string[]
  created_at: string
}

export default function MeetingsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(() => mockAuth.getCurrentUser())
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(() => mockAuth.getCurrentWorkspace())
  const isMobile = useIsMobile()
  const { language } = useSettings()

  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  const [showJoinDialog, setShowJoinDialog] = useState(false)
  const [scheduleTitle, setScheduleTitle] = useState('')
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('')
  const [joinRoomId, setJoinRoomId] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const user = mockAuth.getCurrentUser()
    const workspace = mockAuth.getCurrentWorkspace()
    if (!user || !workspace) {
      router.push('/login')
      return
    }
    setCurrentUser(user)
    setCurrentWorkspace(workspace)
  }, [router])

  const handleWorkspaceChange = (newWorkspace: Workspace) => {
    setCurrentWorkspace(newWorkspace)
  }

  const fetchMeetings = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/meetings')
      const data = await res.json()
      if (data.success) {
        setMeetings(data.meetings || [])
      }
    } catch (err) {
      console.error('Failed to fetch meetings:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentUser) fetchMeetings()
  }, [currentUser, fetchMeetings])

  const createInstantMeeting = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'instant', title: language === 'zh' ? '即时会议' : 'Instant Meeting' }),
      })
      const data = await res.json()
      if (data.success && data.meeting) {
        setMeetings(prev => [data.meeting, ...prev])
        // Copy room ID to clipboard
        await navigator.clipboard?.writeText(data.meeting.room_id).catch(() => {})
        alert(language === 'zh'
          ? `会议已创建！会议号: ${data.meeting.room_id}\n已复制到剪贴板`
          : `Meeting created! Room ID: ${data.meeting.room_id}\nCopied to clipboard`)
      }
    } catch (err) {
      console.error('Failed to create meeting:', err)
    } finally {
      setCreating(false)
    }
  }

  const createScheduledMeeting = async () => {
    if (!scheduleTitle || !scheduleDate || !scheduleTime) return
    setCreating(true)
    try {
      const startTime = new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'scheduled', title: scheduleTitle, start_time: startTime }),
      })
      const data = await res.json()
      if (data.success && data.meeting) {
        setMeetings(prev => [data.meeting, ...prev])
        setShowScheduleDialog(false)
        setScheduleTitle('')
        setScheduleDate('')
        setScheduleTime('')
      }
    } catch (err) {
      console.error('Failed to schedule meeting:', err)
    } finally {
      setCreating(false)
    }
  }

  const deleteMeeting = async (id: string) => {
    try {
      await fetch(`/api/meetings?id=${id}`, { method: 'DELETE' })
      setMeetings(prev => prev.filter(m => (m._id || m.id) !== id))
    } catch (err) {
      console.error('Failed to delete meeting:', err)
    }
  }

  const joinMeeting = () => {
    if (!joinRoomId.trim()) return
    alert(language === 'zh'
      ? `加入会议: ${joinRoomId}\n(视频通话功能将在对话页面中启动)`
      : `Joining meeting: ${joinRoomId}\n(Video call will launch in the chat page)`)
    setShowJoinDialog(false)
    setJoinRoomId('')
  }

  const copyRoomId = async (roomId: string) => {
    await navigator.clipboard?.writeText(roomId).catch(() => {})
    alert(language === 'zh' ? '会议号已复制' : 'Room ID copied')
  }

  if (!currentUser || !currentWorkspace) {
    return (
      <div className="flex h-screen mobile-app-shell items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    )
  }

  const activeMeetings = meetings.filter(m => m.status === 'active' || m.status === 'scheduled')
  const pastMeetings = meetings.filter(m => m.status === 'ended')

  return (
    <div className="flex h-screen flex-col mobile-app-shell mobile-overscroll-contain">
      <WorkspaceHeader workspace={currentWorkspace} currentUser={currentUser} onWorkspaceChange={handleWorkspaceChange} />

      <div className="relative flex flex-1 min-w-0 overflow-hidden mobile-overscroll-contain">
        {!isMobile && <AppNavigation />}

        <div className="min-w-0 flex-1 flex flex-col overflow-y-auto">
          {/* Header */}
          <div className="border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold">{language === 'zh' ? '视频会议' : 'Video Meetings'}</h1>
              <Button size="sm" className="gap-2" onClick={() => setShowScheduleDialog(true)}>
                <Plus className="h-4 w-4" />
                {language === 'zh' ? '预约会议' : 'Schedule'}
              </Button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <button
                onClick={createInstantMeeting}
                disabled={creating}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-dashed
                           hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-all group disabled:opacity-50"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600
                                flex items-center justify-center shadow-lg group-hover:shadow-blue-200 transition-shadow">
                  {creating ? <Loader2 className="h-7 w-7 text-white animate-spin" /> : <Video className="h-7 w-7 text-white" />}
                </div>
                <div className="text-center">
                  <p className="font-semibold text-sm">{language === 'zh' ? '即时会议' : 'Instant Meeting'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{language === 'zh' ? '立即开始一个视频通话' : 'Start a video call now'}</p>
                </div>
              </button>

              <button
                onClick={() => setShowScheduleDialog(true)}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-dashed
                           hover:border-purple-400 hover:bg-purple-50/50 dark:hover:bg-purple-950/20 transition-all group"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600
                                flex items-center justify-center shadow-lg group-hover:shadow-purple-200 transition-shadow">
                  <Calendar className="h-7 w-7 text-white" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-sm">{language === 'zh' ? '预约会议' : 'Schedule Meeting'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{language === 'zh' ? '安排一个未来的会议' : 'Plan a future meeting'}</p>
                </div>
              </button>

              <button
                onClick={() => setShowJoinDialog(true)}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-dashed
                           hover:border-green-400 hover:bg-green-50/50 dark:hover:bg-green-950/20 transition-all group"
              >
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-green-600
                                flex items-center justify-center shadow-lg group-hover:shadow-green-200 transition-shadow">
                  <Users className="h-7 w-7 text-white" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-sm">{language === 'zh' ? '加入会议' : 'Join Meeting'}</p>
                  <p className="text-xs text-muted-foreground mt-1">{language === 'zh' ? '输入会议号加入' : 'Enter meeting ID to join'}</p>
                </div>
              </button>
            </div>

            {/* Meetings List */}
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                {language === 'zh' ? '正在加载...' : 'Loading...'}
              </div>
            ) : meetings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Video className="h-20 w-20 mb-4 opacity-15" />
                <h3 className="text-lg font-semibold mb-2">{language === 'zh' ? '暂无会议记录' : 'No meeting history'}</h3>
                <p className="text-sm">{language === 'zh' ? '发起或加入会议后会在此显示' : 'Meetings will appear here after creation'}</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Active / Upcoming */}
                {activeMeetings.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                      {language === 'zh' ? '即将到来' : 'Upcoming'}
                    </h2>
                    <div className="space-y-2">
                      {activeMeetings.map(m => (
                        <div key={m._id || m.id} className="flex items-center justify-between p-4 rounded-xl border hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                              {m.status === 'active' ? <Video className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{m.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(m.start_time).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                                {' · '}{m.room_id}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyRoomId(m.room_id)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => deleteMeeting(m._id || m.id!)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Past */}
                {pastMeetings.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
                      {language === 'zh' ? '已结束' : 'Past'}
                    </h2>
                    <div className="space-y-2">
                      {pastMeetings.map(m => (
                        <div key={m._id || m.id} className="flex items-center justify-between p-4 rounded-xl border opacity-60 hover:opacity-80 transition-opacity">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-400 flex items-center justify-center">
                              <Video className="h-5 w-5" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{m.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(m.start_time).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
                              </p>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => deleteMeeting(m._id || m.id!)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isMobile && <AppNavigation mobile />}

      {/* Schedule Meeting Dialog */}
      {showScheduleDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowScheduleDialog(false)}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{language === 'zh' ? '预约会议' : 'Schedule Meeting'}</h2>
              <button onClick={() => setShowScheduleDialog(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">{language === 'zh' ? '会议标题' : 'Meeting Title'}</label>
                <Input value={scheduleTitle} onChange={e => setScheduleTitle(e.target.value)} placeholder={language === 'zh' ? '输入会议标题...' : 'Enter meeting title...'} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">{language === 'zh' ? '日期' : 'Date'}</label>
                  <Input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">{language === 'zh' ? '时间' : 'Time'}</label>
                  <Input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
                </div>
              </div>
              <Button className="w-full" onClick={createScheduledMeeting} disabled={creating || !scheduleTitle || !scheduleDate || !scheduleTime}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {language === 'zh' ? '创建会议' : 'Create Meeting'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Join Meeting Dialog */}
      {showJoinDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowJoinDialog(false)}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{language === 'zh' ? '加入会议' : 'Join Meeting'}</h2>
              <button onClick={() => setShowJoinDialog(false)} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">{language === 'zh' ? '会议号' : 'Meeting ID'}</label>
                <Input value={joinRoomId} onChange={e => setJoinRoomId(e.target.value)} placeholder={language === 'zh' ? '输入会议号...' : 'Enter meeting ID...'} />
              </div>
              <Button className="w-full" onClick={joinMeeting} disabled={!joinRoomId.trim()}>
                <Users className="h-4 w-4 mr-2" />
                {language === 'zh' ? '加入' : 'Join'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
