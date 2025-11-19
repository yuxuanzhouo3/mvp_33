'use client'

import { useState, useEffect, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { User } from '@/lib/types'
import { Search, UserPlus, Users, Star, Building2, MessageSquare, Phone, Video, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { AddContactDialog } from './add-contact-dialog'
import { ContactRequestsPanel } from './contact-requests-panel'

interface ManualContactData {
  full_name: string
  email: string
  phone?: string
  company?: string
  notes?: string
}

interface ContactsPanelProps {
  users: User[]
  currentUser: User
  onStartChat: (userId: string) => void
  onAddContact?: (userId: string, message?: string) => void
  onAddManualContact?: (contactData: ManualContactData) => void
  allUsers?: User[] // All available users for adding contacts
  onContactAccepted?: () => void
}

export function ContactsPanel({ 
  users, 
  currentUser, 
  onStartChat,
  onAddContact,
  onAddManualContact,
  allUsers = []
}: ContactsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [showAddContactDialog, setShowAddContactDialog] = useState(false)
  const [showScrollDownButton, setShowScrollDownButton] = useState(false)
  const [showScrollUpButton, setShowScrollUpButton] = useState(false)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  // Get the scroll container
  const getScrollContainer = (): HTMLDivElement | null => {
    if (viewportRef.current) return viewportRef.current
    
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement ||
                       scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement
      
      if (viewport) {
        viewportRef.current = viewport
        return viewport
      }
      
      // Fallback: find any scrollable div child
      const children = scrollAreaRef.current.querySelectorAll('div')
      for (const child of children) {
        const style = window.getComputedStyle(child)
        if (style.overflowY === 'auto' || style.overflowY === 'scroll' || 
            style.overflow === 'auto' || style.overflow === 'scroll') {
          viewportRef.current = child as HTMLDivElement
          return child as HTMLDivElement
        }
      }
    }
    return null
  }

  useEffect(() => {
    let scrollContainer: HTMLDivElement | null = null
    let resizeObserver: ResizeObserver | null = null
    let retryTimer: NodeJS.Timeout | null = null
    let checkTimer: NodeJS.Timeout | null = null
    let handleScroll: (() => void) | null = null

    const findAndSetupScroll = () => {
      scrollContainer = getScrollContainer()
      
      if (!scrollContainer) {
        retryTimer = setTimeout(findAndSetupScroll, 100)
        return
      }

      handleScroll = () => {
        if (!scrollContainer) return
        
        const scrollTop = scrollContainer.scrollTop
        const scrollHeight = scrollContainer.scrollHeight
        const clientHeight = scrollContainer.clientHeight
        
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
        const isNearTop = scrollTop < 100
        const isScrollable = scrollHeight > clientHeight
        
        setShowScrollDownButton(!isNearBottom && isScrollable)
        setShowScrollUpButton(!isNearTop && isScrollable)
      }

      scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
      checkTimer = setTimeout(handleScroll, 200)
      
      resizeObserver = new ResizeObserver(() => {
        if (handleScroll) {
          setTimeout(handleScroll, 100)
        }
      })
      resizeObserver.observe(scrollContainer)
    }

    const timer = setTimeout(findAndSetupScroll, 100)
    
    return () => {
      clearTimeout(timer)
      if (retryTimer) clearTimeout(retryTimer)
      if (checkTimer) clearTimeout(checkTimer)
      if (scrollContainer && handleScroll) {
        scrollContainer.removeEventListener('scroll', handleScroll)
      }
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
    }
  }, [users, searchQuery])

  const scrollToBottom = () => {
    const scrollContainer = getScrollContainer()
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: 'smooth'
      })
      setShowScrollDownButton(false)
      setShowScrollUpButton(true)
    }
  }

  const scrollToTop = () => {
    const scrollContainer = getScrollContainer()
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: 0,
        behavior: 'smooth'
      })
      setShowScrollUpButton(false)
      setShowScrollDownButton(true)
    }
  }

  const scrollAreaCallbackRef = (node: HTMLDivElement | null) => {
    if (node) {
      scrollAreaRef.current = node
      setTimeout(() => {
        const viewport = node.querySelector('[data-slot="scroll-area-viewport"]') as HTMLDivElement
        if (viewport) {
          viewportRef.current = viewport
        }
      }, 50)
    }
  }

  const filteredUsers = users
    .filter(u => u.id !== currentUser.id)
    .filter(u => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return (
        u.full_name.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query) ||
        u.department?.toLowerCase().includes(query) ||
        u.title?.toLowerCase().includes(query)
      )
    })

  const usersByDepartment = filteredUsers.reduce((acc, user) => {
    const dept = user.department || 'Other'
    if (!acc[dept]) acc[dept] = []
    acc[dept].push(user)
    return acc
  }, {} as Record<string, User[]>)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500'
      case 'away': return 'bg-yellow-500'
      case 'busy': return 'bg-red-500'
      default: return 'bg-gray-400'
    }
  }

  const getStatusText = (status: string) => {
    const statusKey = status as 'online' | 'away' | 'busy' | 'offline'
    return t(statusKey)
  }

  return (
    <div className="flex h-full">
      {/* Contacts list */}
      <div className="w-80 border-r flex flex-col">
        <div className="border-b p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t('contacts')}</h2>
            {(onAddContact || onAddManualContact) && (
              <Button 
                size="icon" 
                variant="ghost"
                onClick={() => setShowAddContactDialog(true)}
                title="Add Contact"
              >
                <UserPlus className="h-5 w-5" />
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('searchContacts')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <Tabs defaultValue="all" className="flex-1 flex flex-col">
          <TabsList className="mx-4 mt-2">
            <TabsTrigger value="all" className="flex-1">
              <Users className="h-4 w-4 mr-2" />
              {t('all')}
            </TabsTrigger>
            <TabsTrigger value="favorites" className="flex-1">
              <Star className="h-4 w-4 mr-2" />
              {t('favorites')}
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex-1">
              <UserPlus className="h-4 w-4 mr-2" />
              Requests
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 relative overflow-hidden min-h-0">
            <ScrollArea className="h-full" ref={scrollAreaCallbackRef}>
              <TabsContent value="requests" className="m-0">
                <ContactRequestsPanel
                  currentUser={currentUser}
                  onAccept={() => {
                    if (onContactAccepted) onContactAccepted()
                  }}
                  onMessage={onStartChat}
                />
              </TabsContent>
              <TabsContent value="all" className="m-0">
                {Object.entries(usersByDepartment).map(([department, deptUsers]) => (
                  <div key={department} className="p-2">
                    <div className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-muted-foreground">
                      <Building2 className="h-4 w-4" />
                      {department}
                      <Badge variant="secondary" className="ml-auto">
                        {deptUsers.length}
                      </Badge>
                    </div>
                    {deptUsers.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => setSelectedUser(user)}
                        className={cn(
                          'w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent',
                          selectedUser?.id === user.id && 'bg-accent'
                        )}
                      >
                        <div className="relative">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user.avatar_url || "/placeholder.svg"} />
                            <AvatarFallback>
                              {user.full_name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span className={cn('absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background', getStatusColor(user.status))} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{user.full_name}</div>
                          <p className="text-sm text-muted-foreground truncate">
                            {user.title}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="favorites" className="m-0 p-4">
                <div className="text-center text-muted-foreground py-8">
                  <Star className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>{t('noFavoriteContacts')}</p>
                </div>
              </TabsContent>
            </ScrollArea>

            {showScrollUpButton && (
              <Button
                onClick={scrollToTop}
                size="icon"
                variant="default"
                className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg z-20 bg-background border hover:bg-accent"
                aria-label="Scroll to top"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
            )}
            {showScrollDownButton && (
              <Button
                onClick={scrollToBottom}
                size="icon"
                variant="default"
                className="absolute bottom-2 right-2 h-8 w-8 rounded-full shadow-lg z-20 bg-background border hover:bg-accent"
                aria-label="Scroll to bottom"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            )}
          </div>
        </Tabs>
      </div>

      {/* Contact details */}
      <div className="flex-1 flex flex-col">
        {selectedUser ? (
          <>
            <div className="border-b p-6">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={selectedUser.avatar_url || "/placeholder.svg"} />
                    <AvatarFallback className="text-2xl">
                      {selectedUser.full_name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <span className={cn('absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-background', getStatusColor(selectedUser.status))} />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-semibold mb-1">
                    {selectedUser.full_name}
                  </h2>
                  <p className="text-muted-foreground mb-2">{selectedUser.title}</p>
                  <Badge variant="secondary">
                    {getStatusText(selectedUser.status)}
                  </Badge>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <Button 
                  className="flex-1"
                  onClick={() => onStartChat(selectedUser.id)}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  {t('message')}
                </Button>
                <Button variant="outline">
                  <Phone className="h-4 w-4 mr-2" />
                  {t('call')}
                </Button>
                <Button variant="outline">
                  <Video className="h-4 w-4 mr-2" />
                  {t('video')}
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-6">
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h3 className="text-sm font-semibold mb-3">{t('contactInformation')}</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm text-muted-foreground">{t('email')}</label>
                      <p className="font-medium">{selectedUser.email}</p>
                    </div>
                    {selectedUser.phone && (
                      <div>
                        <label className="text-sm text-muted-foreground">{t('phone')}</label>
                        <p className="font-medium">{selectedUser.phone}</p>
                      </div>
                    )}
                    <div>
                      <label className="text-sm text-muted-foreground">{t('username')}</label>
                      <p className="font-medium">@{selectedUser.username}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold mb-3">{t('workInformation')}</h3>
                  <div className="space-y-3">
                    {selectedUser.department && (
                      <div>
                        <label className="text-sm text-muted-foreground">{t('department')}</label>
                        <p className="font-medium">{selectedUser.department}</p>
                      </div>
                    )}
                    {selectedUser.title && (
                      <div>
                        <label className="text-sm text-muted-foreground">{t('title')}</label>
                        <p className="font-medium">{selectedUser.title}</p>
                      </div>
                    )}
                  </div>
                </div>

                {selectedUser.status_message && (
                  <div>
                    <h3 className="text-sm font-semibold mb-3">{t('status')}</h3>
                    <p className="text-muted-foreground">{selectedUser.status_message}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Users className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <h3 className="text-lg font-semibold mb-2">{t('noContactSelected')}</h3>
              <p>{t('selectContactToViewDetails')}</p>
            </div>
          </div>
        )}
      </div>

      {(onAddContact || onAddManualContact) && (
        <AddContactDialog
          open={showAddContactDialog}
          onOpenChange={setShowAddContactDialog}
          allUsers={allUsers.length > 0 ? allUsers : users}
          currentUser={currentUser}
          onAddContact={onAddContact || (() => {})}
          onAddManualContact={onAddManualContact}
        />
      )}
    </div>
  )
}
