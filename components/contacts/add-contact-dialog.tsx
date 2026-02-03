'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { User } from '@/lib/types'
import { Search, UserPlus, Mail, User as UserIcon, UserCircle, Phone, Building2, Loader2 } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface ManualContactData {
  full_name: string
  email: string
  phone?: string
  company?: string
  notes?: string
}

interface AddContactDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  allUsers: User[]
  currentUser: User
  onAddContact: (userId: string) => void
  onAddManualContact?: (contactData: ManualContactData) => void
}

export function AddContactDialog({
  open,
  onOpenChange,
  allUsers = [],
  currentUser,
  onAddContact,
  onAddManualContact,
}: AddContactDialogProps) {
  const [tab, setTab] = useState<'search' | 'manual'>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  
  // Manual contact form fields
  const [manualName, setManualName] = useState('')
  const [manualEmail, setManualEmail] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualCompany, setManualCompany] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  // Search users via API when search query changes
  useEffect(() => {
    const searchUsers = async () => {
      if (!searchQuery || searchQuery.length < 2) {
        setSearchResults([])
        return
      }

      setIsSearching(true)
      setSearchError(null)

      try {
        const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery)}`)
        const data = await response.json()

        if (!response.ok) {
          if (response.status === 401) {
            console.error('Unauthorized - user needs to login')
            setSearchError('Please login to search for users')
            setSearchResults([])
            return
          }
          throw new Error(data.error || 'Failed to search users')
        }

        setSearchResults(data.users || [])
      } catch (error: any) {
        console.error('Search users error:', error)
        if (error.message && error.message.includes('Unauthorized')) {
          setSearchError('Please login to search for users')
        } else {
          setSearchError(error.message || 'Failed to search users')
        }
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }

    const timeoutId = setTimeout(searchUsers, 300)
    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  // 过滤并去重（避免数据重复导致滚动异常），同时过滤掉当前用户
  const filteredUsers = searchQuery.length >= 2 
    ? Array.from(new Map(searchResults.filter(u => u.id !== currentUser?.id).map(user => [user.id, user])).values())
    : Array.from(new Map(allUsers.filter(u => u.id !== currentUser?.id).map(user => [user.id, user])).values())

  const handleUserSelect = (user: User) => {
    setSelectedUser(user)
  }

  const handleAdd = () => {
    if (tab === 'search' && selectedUser) {
      onAddContact(selectedUser.id)
      handleClose()
    } else if (tab === 'manual' && manualName.trim() && manualEmail.trim()) {
      if (onAddManualContact) {
        onAddManualContact({
          full_name: manualName.trim(),
          email: manualEmail.trim(),
          phone: manualPhone.trim() || undefined,
          company: manualCompany.trim() || undefined,
          notes: manualNotes.trim() || undefined,
        })
      }
      handleClose()
    }
  }

  const handleClose = () => {
    setSearchQuery('')
    setSelectedUser(null)
    setSearchResults([])
    setSearchError(null)
    setManualName('')
    setManualEmail('')
    setManualPhone('')
    setManualCompany('')
    setManualNotes('')
    setTab('search')
    onOpenChange(false)
  }

  const canAddSearch = selectedUser !== null
  const canAddManual = manualName.trim() !== '' && manualEmail.trim() !== ''
  const canAdd = tab === 'search' ? canAddSearch : canAddManual

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-full sm:max-w-2xl max-h-[88vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('addContact')}</DialogTitle>
          <DialogDescription>
            {t('searchForUserOrManual')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 gap-4 pb-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'search' | 'manual')} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="search">
                <Search className="h-4 w-4 mr-2" />
                {t('searchUser')}
              </TabsTrigger>
              <TabsTrigger value="manual">
                <UserCircle className="h-4 w-4 mr-2" />
                {t('manualAdd')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="search" className="flex-1 mt-4 flex flex-col gap-4 min-h-0 overflow-hidden">
              <div className="space-y-2">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder={t('nameUsernameOrEmail')}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setSelectedUser(null)
                    }}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>

              <div className="rounded-xl border bg-background/60 p-4 shadow-sm mb-4">
                <ScrollArea className="h-[320px] max-h-[35vh] pr-4">
                  <div className="space-y-3 pb-4 pr-2">
                    {searchQuery.length >= 2 ? (
                      // 输入 >= 2 个字符时，显示搜索结果
                      isSearching ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                          {t('searching')}
                        </div>
                      ) : searchError ? (
                        <div className="text-sm text-destructive py-4 text-center">
                          {searchError}
                        </div>
                      ) : filteredUsers.length > 0 ? (
                        filteredUsers.map((user) => (
                          <button
                            key={user.id}
                            onClick={() => handleUserSelect(user)}
                            className={cn(
                              'w-full flex items-center justify-between gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent border',
                              selectedUser?.id === user.id ? 'bg-accent border-primary' : 'border-transparent'
                            )}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <Avatar className="h-10 w-10 flex-shrink-0">
                                <AvatarImage src={user.avatar_url || undefined} />
                                <AvatarFallback name={user.full_name}>
                                  {user.full_name.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{user.full_name}</div>
                                <div className="text-sm text-muted-foreground truncate">
                                  @{user.username} • {user.email}
                                </div>
                                {user.title && (
                                  <div className="text-xs text-muted-foreground truncate">
                                    {user.title}
                                  </div>
                                )}
                              </div>
                            </div>
                            {selectedUser?.id === user.id && (
                              <div className="ml-3 h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                                <svg className="h-3 w-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </button>
                        ))
                      ) : (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                          <UserIcon className="h-12 w-12 mx-auto mb-2 opacity-20" />
                          <p>{t('noUsersFound')}</p>
                          <p className="text-xs mt-1">{t('tryDifferentSearch')}</p>
                        </div>
                      )
                    ) : searchQuery.length === 1 ? (
                      // 输入 1 个字符时，提示用户继续输入
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        <Search className="h-12 w-12 mx-auto mb-2 opacity-20" />
                        <p>{t('keepTypingToSearch')}</p>
                        <p className="text-xs mt-1">{t('typeAtLeast2Chars')}</p>
                      </div>
                    ) : (
                      // 没有输入时，显示提示
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        <Search className="h-12 w-12 mx-auto mb-2 opacity-20" />
                        <p>{t('startTypingToSearch')}</p>
                        <p className="text-xs mt-1">{t('typeAtLeast2Chars')}</p>
                      </div>
                    )}
                  </div>
                  <ScrollBar orientation="vertical" forceMount className="opacity-100" />
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="flex-1 mt-4 flex flex-col min-h-0 overflow-hidden">
              <div className="rounded-xl border bg-background/60 p-4 shadow-sm mb-4">
                <ScrollArea className="h-[320px] max-h-[46vh] pr-4">
                  <div className="space-y-4 pb-4">
                    <div className="space-y-2">
                      <Label htmlFor="manual-name">
                        {t('fullName')} <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="manual-name"
                        placeholder="John Doe"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        autoFocus
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manual-email">
                        {t('email')} <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="manual-email"
                          type="email"
                          placeholder="john.doe@example.com"
                          value={manualEmail}
                          onChange={(e) => setManualEmail(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manual-phone">{t('phoneOptional')}</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="manual-phone"
                          type="tel"
                          placeholder="+1 (555) 123-4567"
                          value={manualPhone}
                          onChange={(e) => setManualPhone(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manual-company">{t('companyOptional')}</Label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="manual-company"
                          placeholder="Acme Inc."
                          value={manualCompany}
                          onChange={(e) => setManualCompany(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="manual-notes">{t('notesOptional')}</Label>
                      <Textarea
                        id="manual-notes"
                        placeholder={t('additionalInfoPlaceholder')}
                        value={manualNotes}
                        onChange={(e) => setManualNotes(e.target.value)}
                        rows={4}
                      />
                    </div>
                  </div>
                  <ScrollBar orientation="vertical" forceMount className="opacity-100" />
                </ScrollArea>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="mt-2 flex-shrink-0 bg-background">
          <Button variant="outline" onClick={handleClose}>
            {t('cancel')}
          </Button>
          <Button onClick={handleAdd} disabled={!canAdd}>
            <UserPlus className="h-4 w-4 mr-2" />
            {t('addContact')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}