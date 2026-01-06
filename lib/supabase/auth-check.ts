/**
 * Client-side authentication check utility
 * Verifies Supabase session is valid
 */

import { createClient } from './client'

/**
 * Check if user has a valid Supabase session
 * Returns true if session exists and is valid
 */
export async function hasValidSession(): Promise<boolean> {
  try {
    const supabase = createClient()
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error || !session) {
      return false
    }
    
    // Verify session is not expired
    if (session.expires_at && session.expires_at < Date.now() / 1000) {
      return false
    }
    
    return true
  } catch (error) {
    console.error('Error checking session:', error)
    return false
  }
}

/**
 * Get current user from Supabase session
 * Returns null if no valid session
 */
export async function getCurrentSupabaseUser() {
  try {
    const supabase = createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error || !user) {
      return null
    }
    
    return user
  } catch (error) {
    console.error('Error getting user:', error)
    return null
  }
}

