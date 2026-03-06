// Mock authentication service (replace with real auth later)
import { User, Workspace } from './types'

const STORAGE_KEY = 'chat_app_current_user'
const WORKSPACE_KEY = 'chat_app_current_workspace'

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function normalizeUser(input: any): User | null {
  if (!input || typeof input !== 'object') return null
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  if (!id) return null

  const email = typeof input.email === 'string' ? input.email.trim() : ''
  const fallbackName = email ? email.split('@')[0] : id.slice(0, 8)
  const username =
    typeof input.username === 'string' && input.username.trim()
      ? input.username.trim()
      : fallbackName || 'user'
  const fullName =
    typeof input.full_name === 'string' && input.full_name.trim()
      ? input.full_name.trim()
      : username || fallbackName || 'User'

  return {
    ...input,
    id,
    email,
    username,
    full_name: fullName,
  } as User
}

function normalizeWorkspace(input: any): Workspace | null {
  if (!input || typeof input !== 'object') return null
  const id = typeof input.id === 'string' ? input.id.trim() : ''
  if (!id) return null

  const name =
    typeof input.name === 'string' && input.name.trim()
      ? input.name.trim()
      : 'Workspace'
  const domain =
    typeof input.domain === 'string' && input.domain.trim()
      ? input.domain.trim()
      : id

  return {
    ...input,
    id,
    name,
    domain,
  } as Workspace
}

export const mockAuth = {
  // Get current authenticated user
  getCurrentUser: (): User | null => {
    if (typeof window === 'undefined') return null
    const parsed = safeParse<any>(localStorage.getItem(STORAGE_KEY))
    const user = normalizeUser(parsed)
    if (!user) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    // Self-heal malformed historical data in localStorage.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    return user
  },

  // Set current user
  setCurrentUser: (user: User | null) => {
    if (typeof window === 'undefined') return
    const normalized = normalizeUser(user)
    if (normalized) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  },

  // Get current workspace
  getCurrentWorkspace: (): Workspace | null => {
    if (typeof window === 'undefined') return null
    const parsed = safeParse<any>(localStorage.getItem(WORKSPACE_KEY))
    const workspace = normalizeWorkspace(parsed)
    if (!workspace) {
      localStorage.removeItem(WORKSPACE_KEY)
      return null
    }
    // Self-heal malformed historical data in localStorage.
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace))
    return workspace
  },

  // Set current workspace
  setCurrentWorkspace: (workspace: Workspace | null) => {
    if (typeof window === 'undefined') return
    const normalized = normalizeWorkspace(workspace)
    if (normalized) {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(normalized))
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem('chat_app_token')
    }
  },
}
