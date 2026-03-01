import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { updateUser as updateCloudBaseUser } from '@/lib/database/cloudbase/users'

/**
 * Update user profile
 * PATCH /api/users/profile
 */
export async function PATCH(request: NextRequest) {
  try {
    const { IS_DOMESTIC_VERSION } = await import('@/config')
    let currentUser: any = null
    let supabase: Awaited<ReturnType<typeof createClient>> | null = null

    if (IS_DOMESTIC_VERSION) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (!cloudBaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUser = cloudBaseUser
    } else {
      supabase = await createClient()
      const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !supabaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUser = supabaseUser
    }

    const body = await request.json()
    const { full_name, department, title, phone, status_message, avatar_url } = body

    // Build update object with only provided fields
    // Convert empty strings to null for optional fields (CloudBase handles null better than empty strings)
    const updates: any = {}
    if (full_name !== undefined) updates.full_name = full_name
    if (department !== undefined) updates.department = department === '' ? null : department
    if (title !== undefined) updates.title = title === '' ? null : title
    if (phone !== undefined) updates.phone = phone === '' ? null : phone
    if (status_message !== undefined) updates.status_message = status_message === '' ? null : status_message
    if (avatar_url !== undefined) updates.avatar_url = avatar_url === '' ? null : avatar_url

    console.log('[PROFILE UPDATE] Update request:', {
      userId: currentUser.id,
      updates: Object.keys(updates),
    })

    // Get the correct database client based on user's registered region
    const dbClient = await getDatabaseClientForUser(request)
    
    console.log('[PROFILE UPDATE] Database client type:', dbClient.type, 'region:', dbClient.region)
    
    let updatedUser
    if (dbClient.type === 'cloudbase') {
      // Update in CloudBase
      console.log('[PROFILE UPDATE] Updating user in CloudBase:', currentUser.id, updates)
      try {
        updatedUser = await updateCloudBaseUser(currentUser.id, updates)
        console.log('[PROFILE UPDATE] CloudBase update successful:', updatedUser.id)
      } catch (cloudbaseError: any) {
        const errorMessage = cloudbaseError.message || cloudbaseError.toString() || 'Unknown CloudBase error'
        const errorCode = cloudbaseError.code || cloudbaseError.errCode || 'UNKNOWN'
        
        console.error('[PROFILE UPDATE] CloudBase update error:', {
          error: errorMessage,
          code: errorCode,
          stack: cloudbaseError.stack,
          fullError: JSON.stringify(cloudbaseError, Object.getOwnPropertyNames(cloudbaseError)),
        })
        
        // Return a proper error response
        return NextResponse.json(
          { 
            error: 'Failed to update profile',
            details: errorMessage,
            code: errorCode,
          },
          { status: 500 }
        )
      }
    } else {
      // Update in Supabase
      console.log('[PROFILE UPDATE] Updating user in Supabase:', currentUser.id, updates)
      if (!supabase) {
        return NextResponse.json(
          { error: 'Supabase client not initialized' },
          { status: 500 }
        )
      }
      
      // First, check if user exists in Supabase
      const { data: existingUser, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('id', currentUser.id)
        .maybeSingle()
      
      if (checkError && checkError.code !== 'PGRST116') {
        // Error other than "not found"
        console.error('[PROFILE UPDATE] Supabase check error:', checkError)
        return NextResponse.json(
          { error: 'Failed to check user', details: checkError.message },
          { status: 500 }
        )
      }
      
      if (!existingUser) {
        // User doesn't exist in Supabase - this shouldn't happen if routing is correct
        console.error('[PROFILE UPDATE] User not found in Supabase:', currentUser.id)
        return NextResponse.json(
          { 
            error: 'User not found in database',
            details: 'User profile does not exist in Supabase. Please contact support.',
          },
          { status: 404 }
        )
      }
      
      // User exists, proceed with update
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', currentUser.id)
        .select()
        .single()

      if (error) {
        console.error('[PROFILE UPDATE] Supabase update error:', {
          error: error.message,
          code: error.code,
          details: error.details,
        })
        return NextResponse.json(
          { error: 'Failed to update profile', details: error.message },
          { status: 500 }
        )
      }
      updatedUser = data
      console.log('[PROFILE UPDATE] Supabase update successful:', updatedUser.id)
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
    })
  } catch (error: any) {
    const errorMessage = error.message || error.toString() || 'Unknown error'
    const errorCode = error.code || error.errCode || 'UNKNOWN'
    
    console.error('[PROFILE UPDATE] Unexpected error:', {
      error: errorMessage,
      code: errorCode,
      stack: error.stack,
      name: error.name,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
    })
    
    return NextResponse.json(
      { 
        error: 'Failed to update profile',
        details: errorMessage,
        code: errorCode,
      },
      { status: 500 }
    )
  }
}

/**
 * Get user profile
 * GET /api/users/profile
 */
export async function GET(request: NextRequest) {
  try {
    const { IS_DOMESTIC_VERSION } = await import('@/config')
    let currentUser: any = null
    let supabase: Awaited<ReturnType<typeof createClient>> | null = null

    if (IS_DOMESTIC_VERSION) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (!cloudBaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUser = cloudBaseUser
    } else {
      supabase = await createClient()
      const { data: { user: supabaseUser }, error: authError } = await supabase.auth.getUser()
      if (authError || !supabaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUser = supabaseUser
    }

    // Get the correct database client based on user's registered region
    const dbClient = await getDatabaseClientForUser(request)
    
    let user
    if (dbClient.type === 'cloudbase') {
      // Get from CloudBase
      const { getUserById } = await import('@/lib/cloudbase/database')
      user = await getUserById(currentUser.id)
      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        )
      }
    } else {
      // Get from Supabase
      if (!supabase) {
        return NextResponse.json(
          { error: 'Supabase client not initialized' },
          { status: 500 }
        )
      }
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', currentUser.id)
        .single()

      if (error) {
        console.error('Get profile error:', error)
        return NextResponse.json(
          { error: 'Failed to get profile', details: error.message },
          { status: 500 }
        )
      }
      user = data
    }

    return NextResponse.json({
      success: true,
      user: user,
    })
  } catch (error: any) {
    console.error('Get profile error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get profile' },
      { status: 500 }
    )
  }
}


