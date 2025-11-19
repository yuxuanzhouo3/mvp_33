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
          // If unauthorized, don't show error - user needs to login
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
        // Don't show error for unauthorized - user needs to login
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

    // Debounce search
    const timeoutId = setTimeout(searchUsers, 300)
    return () => clearTimeout(timeoutId)
  }, [searchQuery])

  // Use API search results if available, otherwise fall back to allUsers
  const filteredUsers = searchQuery.length >= 2 
    ? searchResults 
    : allUsers.filter(u => u.id !== currentUser.id)

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
      <DialogContent className="sm:max-w-md max-h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription>
            Search for a user or manually add a contact
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'search' | 'manual')} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search">
              <Search className="h-4 w-4 mr-2" />
              Search User
            </TabsTrigger>
            <TabsTrigger value="manual">
              <UserCircle className="h-4 w-4 mr-2" />
              Manual Add
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="flex-1 mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Name, username, or email..."
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

          {searchQuery && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {isSearching ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Searching...
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
                    className={`w-full flex items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-accent ${
                      selectedUser?.id === user.id ? 'bg-accent border border-primary' : ''
                    }`}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={user.avatar_url || "/placeholder.svg"} />
                      <AvatarFallback>
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
                    {selectedUser?.id === user.id && (
                      <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
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
                  <p>No users found</p>
                  <p className="text-xs mt-1">Try a different search term</p>
                </div>
              )}
            </div>
          )}

          {!searchQuery && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>Start typing to search for users</p>
            </div>
          )}

            {selectedUser && (
              <div className="rounded-lg border p-4 bg-muted/50">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={selectedUser.avatar_url || "/placeholder.svg"} />
                    <AvatarFallback>
                      {selectedUser.full_name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{selectedUser.full_name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      @{selectedUser.username}
                    </div>
                    {selectedUser.title && (
                      <div className="text-xs text-muted-foreground truncate">
                        {selectedUser.title}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="manual" className="flex-1 mt-4 space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manual-name">
                  Full Name <span className="text-destructive">*</span>
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
                  Email <span className="text-destructive">*</span>
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
                <Label htmlFor="manual-phone">Phone (Optional)</Label>
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
                <Label htmlFor="manual-company">Company/Organization (Optional)</Label>
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
                <Label htmlFor="manual-notes">Notes (Optional)</Label>
                <Textarea
                  id="manual-notes"
                  placeholder="Additional information about this contact..."
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={!canAdd}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

