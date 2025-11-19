// Mock authentication service (replace with real auth later)
import { User, Workspace } from './types'

const STORAGE_KEY = 'chat_app_current_user'
const WORKSPACE_KEY = 'chat_app_current_workspace'

export const mockAuth = {
  // Get current authenticated user
  getCurrentUser: (): User | null => {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : null
  },

  // Set current user
  setCurrentUser: (user: User | null) => {
    if (typeof window === 'undefined') return
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  },

  // Get current workspace
  getCurrentWorkspace: (): Workspace | null => {
    if (typeof window === 'undefined') return null
    const stored = localStorage.getItem(WORKSPACE_KEY)
    return stored ? JSON.parse(stored) : null
  },

  // Set current workspace
  setCurrentWorkspace: (workspace: Workspace | null) => {
    if (typeof window === 'undefined') return
    if (workspace) {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace))
    } else {
      localStorage.removeItem(WORKSPACE_KEY)
    }
  },

  // Mock login - supports all 5 demo users
  login: async (email: string, password: string): Promise<User> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Import mock users to find matching user
    const { mockUsers } = await import('./mock-data')
    
    // Find user by email, or default to first user
    let user = mockUsers.find(u => u.email === email) || mockUsers[0]
    
    // If user not found, create a new user entry
    if (!mockUsers.find(u => u.email === email)) {
      user = {
        ...mockUsers[0],
        email,
        username: email.split('@')[0],
        full_name: email.split('@')[0].charAt(0).toUpperCase() + email.split('@')[0].slice(1),
      }
    }
    
    mockAuth.setCurrentUser(user)
    return user
  },

  // Logout
  logout: () => {
    mockAuth.setCurrentUser(null)
    mockAuth.setCurrentWorkspace(null)
  },
}
