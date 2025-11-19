'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { mockAuth } from '@/lib/mock-auth'
import { ContactsPanel } from '@/components/contacts/contacts-panel'
import { WorkspaceHeader } from '@/components/chat/workspace-header'
import { User, Workspace } from '@/lib/types'

export default function ContactsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [contacts, setContacts] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      // Check Supabase session first
      const { hasValidSession } = await import('@/lib/supabase/auth-check')
      const hasSession = await hasValidSession()
      
      if (!hasSession) {
        // No valid Supabase session - redirect to login
        router.push('/login')
        return
      }
      
      // Check localStorage for user and workspace
      const user = mockAuth.getCurrentUser()
      const workspace = mockAuth.getCurrentWorkspace()

      if (!user || !workspace) {
        router.push('/login')
        return
      }

      setCurrentUser(user)
      setCurrentWorkspace(workspace)
      loadContacts()
    }
    
    checkAuth()
  }, [router])

  const loadContacts = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/contacts')
      const data = await response.json()

      if (!response.ok) {
        // If unauthorized, redirect to login
        if (response.status === 401) {
          console.error('Unauthorized - redirecting to login')
          router.push('/login')
          return
        }
        throw new Error(data.error || 'Failed to load contacts')
      }

      // Transform contacts to User format
      const contactUsers = (data.contacts || []).map((contact: any) => contact.user).filter(Boolean)
      setContacts(contactUsers)
    } catch (error) {
      console.error('Load contacts error:', error)
      // If unauthorized error, redirect to login
      if (error instanceof Error && error.message.includes('Unauthorized')) {
        router.push('/login')
        return
      }
      setContacts([])
    } finally {
      setIsLoading(false)
    }
  }

  if (!currentUser || !currentWorkspace) {
    return null
  }

  const handleStartChat = async (userId: string) => {
    if (!currentUser || !currentWorkspace) return
    
    try {
      // Create or get direct conversation
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'direct',
          member_ids: [userId],
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create conversation')
      }

      // Navigate to chat with the conversation
      router.push(`/chat?conversation=${data.conversation.id}`)
    } catch (error: any) {
      console.error('Start chat error:', error)
      alert(error.message || 'Failed to start chat')
    }
  }

  const handleAddContact = async (userId: string, message?: string) => {
    if (!currentUser) return
    
    try {
      // Send contact request instead of directly adding
      const response = await fetch('/api/contact-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient_id: userId,
          message: message || `Hi! I'd like to add you as a contact.`,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send contact request')
      }

      alert('Contact request sent!')
    } catch (error: any) {
      console.error('Add contact error:', error)
      alert(error.message || 'Failed to send contact request')
    }
  }

  const handleAddManualContact = async (contactData: {
    full_name: string
    email: string
    phone?: string
    company?: string
    notes?: string
  }) => {
    if (!currentUser) return
    
    // For manual contacts, we need to search for the user by email first
    // or create a manual contact entry
    try {
      // Try to find user by email
      const searchResponse = await fetch(`/api/users/search?q=${encodeURIComponent(contactData.email)}`)
      const searchData = await searchResponse.json()

      if (searchResponse.ok && searchData.users && searchData.users.length > 0) {
        // User exists, add as contact
        const user = searchData.users[0]
        await handleAddContact(user.id)
      } else {
        // User doesn't exist, show error or create manual contact
        alert('User not found. Please search for existing users by email or username.')
      }
    } catch (error: any) {
      console.error('Add manual contact error:', error)
      alert(error.message || 'Failed to add contact')
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <WorkspaceHeader workspace={currentWorkspace} currentUser={currentUser} />
      <div className="flex-1 overflow-hidden">
        <ContactsPanel
          users={contacts}
          currentUser={currentUser}
          onStartChat={handleStartChat}
          onAddContact={handleAddContact}
          onAddManualContact={handleAddManualContact}
          allUsers={[]}
          onContactAccepted={loadContacts}
        />
      </div>
    </div>
  )
}
