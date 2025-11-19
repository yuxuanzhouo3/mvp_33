import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserByEmail } from '@/lib/supabase/database'

/**
 * Search users by username or email
 * GET /api/users/search?q=search_query
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')?.trim()

    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: 'Search query must be at least 2 characters' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get current user
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      console.error('Auth error in search API:', authError)
    }
    
    if (!currentUser) {
      console.error('No current user in search API. Auth error:', authError)
      // Try to get session for debugging
      const { data: sessionData } = await supabase.auth.getSession()
      console.error('Session data:', sessionData ? 'exists' : 'null')
      
      return NextResponse.json(
        { error: 'Unauthorized', details: authError?.message || 'No user found' },
        { status: 401 }
      )
    }

    // Search users by username, email, or full_name
    // Supabase .or() syntax: column.operator.value,column.operator.value
    const searchPattern = `%${query}%`
    
    // Build OR query for multiple columns
    // Note: Supabase .or() requires proper escaping of special characters
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, username, full_name, avatar_url, department, title, status')
      .or(`username.ilike.${searchPattern},email.ilike.${searchPattern},full_name.ilike.${searchPattern}`)
      .neq('id', currentUser.id) // Exclude current user
      .limit(20) // Limit results

    if (error) {
      console.error('Search users error:', error)
      return NextResponse.json(
        { error: 'Failed to search users' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      users: users || [],
    })
  } catch (error: any) {
    console.error('Search users error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to search users' },
      { status: 500 }
    )
  }
}

