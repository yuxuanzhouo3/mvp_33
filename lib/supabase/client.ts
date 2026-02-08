import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Check if Supabase is configured
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables.')
    throw new Error(
      'Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables.'
    )
  }

  // Validate URL format
  try {
    new URL(supabaseUrl)
  } catch (error) {
    console.error('❌ Invalid Supabase URL format:', supabaseUrl)
    throw new Error('Invalid Supabase URL format. Please check NEXT_PUBLIC_SUPABASE_URL.')
  }

  try {
    return createBrowserClient(supabaseUrl, supabaseAnonKey)
  } catch (error: any) {
    console.error('❌ Failed to create Supabase client:', error)
    throw new Error(`Failed to create Supabase client: ${error.message || 'Unknown error'}`)
  }
}

