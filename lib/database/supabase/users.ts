/**
 * Supabase user database operations
 * Handles user operations in Supabase (for Global region)
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { User } from '@/lib/types'

export async function getUserById(userId: string): Promise<User | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error || !data) return null
  return data as User
}

export async function getUserByEmail(email: string, useAdminClient: boolean = false): Promise<User | null> {
  // For login operations, we need to bypass RLS because user is not authenticated yet
  // useAdminClient should be true when called from login API
  const supabase = useAdminClient ? createAdminClient() : await createClient()
  
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single()

  if (error || !data) {
    if (error) {
      console.log('[getUserByEmail] Query error:', {
        email,
        errorCode: error.code,
        errorMessage: error.message,
        useAdminClient,
      })
    }
    return null
  }
  
  return data as User
}

export async function createUser(
  userData: {
    email: string
    username: string
    full_name: string
    avatar_url?: string
    department?: string
    title?: string
    provider?: string
    provider_id?: string
  },
  userId?: string // Optional: if provided, use this ID instead of getting from session
): Promise<User> {
  const supabase = await createClient()
  
  let authUserId = userId
  
  // If userId not provided, try to get from auth session
  if (!authUserId) {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser) {
      authUserId = authUser.id
    } else {
      throw new Error('User not authenticated and userId not provided')
    }
  }

  const { data, error } = await supabase
    .from('users')
    .insert({
      id: authUserId, // Use provided or auth user ID
      email: userData.email,
      username: userData.username,
      full_name: userData.full_name,
      avatar_url: userData.avatar_url || null,
      department: userData.department || null,
      title: userData.title || null,
      status: 'online',
    })
    .select()
    .single()

  if (error) {
    // If user already exists (created by trigger), fetch it
    if (error.code === '23505') { // Unique violation
      const existingUser = await getUserByEmail(userData.email)
      if (existingUser) return existingUser
    }
    throw error
  }
  return data as User
}

export async function updateUser(userId: string, updates: Partial<User>): Promise<User> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single()

  if (error) throw error
  return data as User
}


















