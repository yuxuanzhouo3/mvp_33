'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { mockAuth } from '@/lib/mock-auth'
import { WorkspaceHeader } from '@/components/chat/workspace-header'
import { AppNavigation } from '@/components/layout/app-navigation'
import { User, Workspace } from '@/lib/types'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X, Trash2, Loader2, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSettings } from '@/lib/settings-context'
import { useIsMobile } from '@/hooks/use-mobile'

interface CalendarEvent {
  _id: string
  id?: string
  user_id: string
  title: string
  description: string
  start_time: string
  end_time: string
  color: string
  all_day: boolean
  created_at: string
}

const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六']
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4']

function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate() }
function getFirstDayOfMonth(year: number, month: number) { return new Date(year, month, 1).getDay() }

export default function CalendarPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(() => mockAuth.getCurrentUser())
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(() => mockAuth.getCurrentWorkspace())
  const isMobile = useIsMobile()
  const { language } = useSettings()
  const [viewDate, setViewDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newStartTime, setNewStartTime] = useState('09:00')
  const [newEndTime, setNewEndTime] = useState('10:00')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [newAllDay, setNewAllDay] = useState(false)

  useEffect(() => {
    const user = mockAuth.getCurrentUser()
    const workspace = mockAuth.getCurrentWorkspace()
    if (!user || !workspace) { router.push('/login'); return }
    setCurrentUser(user)
    setCurrentWorkspace(workspace)
  }, [router])

  const handleWorkspaceChange = (newWorkspace: Workspace) => setCurrentWorkspace(newWorkspace)

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/calendar?year=${year}&month=${month}`)
      const data = await res.json()
      if (data.success) setEvents(data.events || [])
    } catch (err) {
      console.error('Failed to fetch events:', err)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    if (currentUser) fetchEvents()
  }, [currentUser, fetchEvents])

  const createEvent = async () => {
    if (!newTitle || selectedDay === null) return
    setCreating(true)
    try {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
      const startTime = newAllDay ? `${dateStr}T00:00:00` : `${dateStr}T${newStartTime}:00`
      const endTime = newAllDay ? `${dateStr}T23:59:59` : `${dateStr}T${newEndTime}:00`
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle, description: newDesc,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
          color: newColor, all_day: newAllDay,
        }),
      })
      const data = await res.json()
      if (data.success && data.event) {
        setEvents(prev => [...prev, data.event])
        setShowCreateDialog(false)
        setNewTitle(''); setNewDesc(''); setNewStartTime('09:00'); setNewEndTime('10:00')
      }
    } catch (err) {
      console.error('Failed to create event:', err)
    } finally {
      setCreating(false)
    }
  }

  const deleteEvent = async (eventId: string) => {
    try {
      await fetch(`/api/calendar?id=${eventId}`, { method: 'DELETE' })
      setEvents(prev => prev.filter(e => (e._id || e.id) !== eventId))
    } catch (err) {
      console.error('Failed to delete event:', err)
    }
  }

  if (!currentUser || !currentWorkspace) {
    return <div className="flex h-screen mobile-app-shell items-center justify-center text-sm text-muted-foreground">Loading...</div>
  }

  const today = new Date()
  const isToday = (day: number) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === day
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const weekdays = language === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN

  const prevMonth = () => { setViewDate(new Date(year, month - 1, 1)); setSelectedDay(null) }
  const nextMonth = () => { setViewDate(new Date(year, month + 1, 1)); setSelectedDay(null) }
  const goToday = () => { setViewDate(new Date()); setSelectedDay(today.getDate()) }

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const getEventsForDay = (day: number) => {
    const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter(e => {
      const eDate = new Date(e.start_time)
      return eDate.getFullYear() === year && eDate.getMonth() === month && eDate.getDate() === day
    })
  }

  const selectedEvents = selectedDay !== null ? getEventsForDay(selectedDay) : []

  const monthLabel = language === 'zh'
    ? `${year}年${month + 1}月`
    : `${viewDate.toLocaleString('en', { month: 'long' })} ${year}`

  return (
    <div className="flex h-screen flex-col mobile-app-shell mobile-overscroll-contain">
      <WorkspaceHeader workspace={currentWorkspace} currentUser={currentUser} onWorkspaceChange={handleWorkspaceChange} />

      <div className="relative flex flex-1 min-w-0 overflow-hidden mobile-overscroll-contain">
        {!isMobile && <AppNavigation />}

        <div className="min-w-0 flex-1 flex overflow-hidden">
          {/* Calendar Grid */}
          <div className="flex-1 flex flex-col overflow-y-auto">
            <div className="border-b px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold">{monthLabel}</h1>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={goToday}>{language === 'zh' ? '今天' : 'Today'}</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
                  </div>
                </div>
                <Button size="sm" className="gap-2" onClick={() => {
                  if (selectedDay === null) setSelectedDay(today.getDate())
                  setShowCreateDialog(true)
                }}>
                  <Plus className="h-4 w-4" />
                  {language === 'zh' ? '新建日程' : 'New Event'}
                </Button>
              </div>
            </div>

            <div className="p-4 sm:p-6 flex-1">
              <div className="grid grid-cols-7 mb-2">
                {weekdays.map(d => (
                  <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                {cells.map((day, i) => {
                  const dayEvents = day ? getEventsForDay(day) : []
                  return (
                    <div
                      key={i}
                      onClick={() => day && setSelectedDay(day === selectedDay ? null : day)}
                      className={`bg-background min-h-[80px] sm:min-h-[100px] p-2 text-sm transition-colors cursor-pointer
                        ${day ? 'hover:bg-muted/50' : ''}
                        ${day === selectedDay ? 'ring-2 ring-blue-500 ring-inset bg-blue-50/30 dark:bg-blue-950/20' : ''}`}
                    >
                      {day && (
                        <>
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium
                            ${isToday(day) ? 'bg-blue-500 text-white shadow-sm' : 'text-foreground'}`}>
                            {day}
                          </span>
                          {dayEvents.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {dayEvents.slice(0, 2).map(e => (
                                <div key={e._id || e.id} className="text-[10px] truncate px-1 py-0.5 rounded"
                                  style={{ backgroundColor: e.color + '20', color: e.color }}>
                                  {e.title}
                                </div>
                              ))}
                              {dayEvents.length > 2 && (
                                <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 2}</div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right Panel: Events for selected day */}
          {selectedDay !== null && (
            <div className="w-[320px] border-l flex flex-col bg-muted/20 hidden sm:flex">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h2 className="font-semibold text-sm">
                  {`${month + 1}/${selectedDay}`} — {selectedEvents.length} {language === 'zh' ? '个日程' : 'events'}
                </h2>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowCreateDialog(true) }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedDay(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {selectedEvents.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-20" />
                    {language === 'zh' ? '暂无日程' : 'No events'}
                  </div>
                ) : (
                  selectedEvents.map(e => (
                    <div key={e._id || e.id} className="p-3 rounded-xl border bg-background hover:shadow-sm transition-shadow">
                      <div className="flex items-start gap-2">
                        <div className="w-1 h-8 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: e.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{e.title}</p>
                          {e.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{e.description}</p>}
                          <p className="text-xs text-muted-foreground mt-1">
                            {e.all_day ? (language === 'zh' ? '全天' : 'All day') :
                              `${new Date(e.start_time).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })} - ${new Date(e.end_time).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`}
                          </p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-red-500 hover:text-red-600" onClick={() => deleteEvent(e._id || e.id!)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {isMobile && <AppNavigation mobile />}

      {/* Create Event Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateDialog(false)}>
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{language === 'zh' ? '新建日程' : 'New Event'}</h2>
              <button onClick={() => setShowCreateDialog(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">{language === 'zh' ? '标题' : 'Title'}</label>
                <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder={language === 'zh' ? '日程标题...' : 'Event title...'} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{language === 'zh' ? '描述' : 'Description'}</label>
                <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder={language === 'zh' ? '可选描述...' : 'Optional description...'} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="allDay" checked={newAllDay} onChange={e => setNewAllDay(e.target.checked)} className="rounded" />
                <label htmlFor="allDay" className="text-sm">{language === 'zh' ? '全天' : 'All day'}</label>
              </div>
              {!newAllDay && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium mb-1 block">{language === 'zh' ? '开始时间' : 'Start'}</label>
                    <Input type="time" value={newStartTime} onChange={e => setNewStartTime(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">{language === 'zh' ? '结束时间' : 'End'}</label>
                    <Input type="time" value={newEndTime} onChange={e => setNewEndTime(e.target.value)} />
                  </div>
                </div>
              )}
              <div>
                <label className="text-sm font-medium mb-1 block">{language === 'zh' ? '颜色' : 'Color'}</label>
                <div className="flex gap-2">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setNewColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${newColor === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <Button className="w-full" onClick={createEvent} disabled={creating || !newTitle}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {language === 'zh' ? '创建日程' : 'Create Event'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
