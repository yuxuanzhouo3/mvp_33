/**
 * Authentication API client
 * Centralized functions for authentication API calls
 */

export interface AuthResponse {
  success: boolean
  user?: {
    id: string
    email: string
    username: string
    full_name: string
    avatar_url: string | null
    department: string | null
    title: string | null
    status: string
    created_at: string
    updated_at: string
    provider?: string
    provider_id?: string
  }
  token?: string
  error?: string
}

/**
 * Register a new user with email and password
 */
export async function register(
  email: string,
  password: string,
  name: string
): Promise<AuthResponse> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, name }),
  })

  const data = await response.json()

  if (!response.ok) {
    return {
      success: false,
      error: data.error || 'Registration failed',
    }
  }

  return data
}

/**
 * Login with email and password
 */
export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  const data = await response.json()

  if (!response.ok) {
    return {
      success: false,
      error: data.error || 'Login failed',
    }
  }

  return data
}

/**
 * Initiate OAuth flow for Google (using Supabase)
 */
export function initiateGoogleOAuth(action: 'login' | 'register' = 'login') {
  window.location.href = `/api/auth/oauth/google?action=${action}`
}

/**
 * Initiate OAuth flow for WeChat
 */
export function initiateWeChatOAuth(action: 'login' | 'register' = 'login') {
  window.location.href = `/api/auth/oauth/wechat?action=${action}`
}

/**
 * Store authentication data in localStorage
 */
export function storeAuthData(user: AuthResponse['user'], token: string) {
  if (typeof window !== 'undefined') {
    if (user) {
      localStorage.setItem('chat_app_current_user', JSON.stringify(user))
    }
    localStorage.setItem('chat_app_token', token)
  }
}

/**
 * Get stored authentication data
 */
export function getStoredAuthData(): {
  user: AuthResponse['user'] | null
  token: string | null
} {
  if (typeof window === 'undefined') {
    return { user: null, token: null }
  }

  const userStr = localStorage.getItem('chat_app_current_user')
  const token = localStorage.getItem('chat_app_token')

  return {
    user: userStr ? JSON.parse(userStr) : null,
    token,
  }
}

/**
 * Clear authentication data
 */
export function clearAuthData() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('chat_app_current_user')
    localStorage.removeItem('chat_app_token')
  }
}

