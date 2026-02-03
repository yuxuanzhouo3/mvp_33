// Mock contacts service for external/manual contacts
import { User } from './types'

// In-memory storage for manual contacts (external contacts not in the system)
const manualContactsStore = new Map<string, User[]>()

// Get manual contacts for a user
export const getManualContacts = (userId: string): User[] => {
  return manualContactsStore.get(userId) || []
}

// Add a manual contact
export const addManualContact = (
  userId: string,
  contactData: {
    full_name: string
    email: string
    phone?: string
    company?: string
    notes?: string
  }
): User => {
  const now = new Date().toISOString()
  const contactId = `manual-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  
  // Generate username from email
  const username = contactData.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
  
  const newContact: User = {
    id: contactId,
    email: contactData.email,
    username: username,
    full_name: contactData.full_name,
    avatar_url: undefined,
    department: contactData.company || 'External',
    title: contactData.company ? `Contact at ${contactData.company}` : 'External Contact',
    status: 'offline',
    status_message: contactData.notes,
    phone: contactData.phone,
    created_at: now,
    updated_at: now,
  }

  const userContacts = manualContactsStore.get(userId) || []
  userContacts.push(newContact)
  manualContactsStore.set(userId, userContacts)

  return newContact
}

// Add a system user as contact
export const addSystemContact = (userId: string, contactUserId: string): void => {
  // This would typically track which system users are in the contact list
  // For now, we just track manual contacts
  // System users are already available in the users list
}

// Get all contacts (system users + manual contacts)
export const getAllContacts = (userId: string, systemUsers: User[]): User[] => {
  const manualContacts = getManualContacts(userId)
  // Combine system users and manual contacts, removing duplicates by email
  const allContacts = [...systemUsers]
  
  manualContacts.forEach(manual => {
    // Only add if not already in system users
    if (!systemUsers.some(u => u.email === manual.email)) {
      allContacts.push(manual)
    }
  })
  
  return allContacts
}

