import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserByEmail as getSupabaseUserByEmail, createUser as createSupabaseUser } from '@/lib/database/supabase/users'
import { User } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, name } = body

    // Validate input
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // Always use global region (Supabase) - IP detection removed
    const region = 'global'
    const country = null

    console.log('[REGISTER] Using global region (Supabase only, IP detection removed)')

    // Check if user already exists in Supabase (use admin client to bypass RLS during pre-auth)
    const existingUser = await getSupabaseUserByEmail(email, true)

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Use original email for Supabase Auth (no region aliasing)
    const supabaseAuthEmail = email

    // Build email confirmation redirect URL (user clicks link in email)
    const origin = request.nextUrl.origin
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || origin
    // After the user clicks "Confirm your email" in Supabase email,
    // redirect them to a simple static confirmation page.
    const emailRedirectTo = `${appUrl}/email-confirmed`

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: supabaseAuthEmail,
      password,
      options: {
        emailRedirectTo,
        data: {
          full_name: name,
          username: email.split('@')[0],
        },
      },
    })

    // Handle Supabase Auth errors
    let authUser = authData.user
    let authSession = authData.session
    
    if (authError || !authUser) {
      console.error('Supabase Auth signUp error:', {
        error: authError,
        message: authError?.message,
        status: authError?.status,
        user: authData?.user
      })
      
      // If user already exists in Supabase Auth, try to sign in instead
      // This covers the case "user clicks register again with the same password"
      if (authError?.status === 422 || authError?.message?.includes('already registered') || authError?.message?.includes('already exists')) {
        console.log('[REGISTER] Email already exists in Supabase Auth, attempting to sign in to reuse existing identity')
        
        // Try to sign in with the password to get the user (same-region re-register)
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: supabaseAuthEmail,
          password,
        })
        
        if (signInError || !signInData.user) {
          return NextResponse.json(
            { 
              error: 'Email already registered',
            },
            { status: 400 }
          )
        }
        
        // Use the existing auth user
        authUser = signInData.user
        authSession = signInData.session
        console.log('[REGISTER] Using existing Supabase Auth user for cross-region registration:', authUser.id)
      } else {
        return NextResponse.json(
          { 
            error: 'Registration failed',
          },
          { status: 400 }
        )
      }
    }

    // Create user in Supabase (always global region, IP detection removed)
    let user: User
    try {
      console.log('[REGISTER] Creating user in Supabase (global region only, using admin client to bypass RLS)')
      
      // Try to get user first (might be created by trigger)
      let existingUser = await getSupabaseUserByEmail(email, true)
      
      if (!existingUser) {
        // Create user in Supabase users table directly (admin client bypasses RLS)
        const { data: newUser, error: insertError } = await adminSupabase
          .from('users')
          .insert({
            id: authUser.id,
            email: authUser.email!,
            username: email.split('@')[0],
            full_name: name,
            avatar_url: null,
            status: 'online',
            region: 'global',
            country: country,
          })
          .select()
          .single()

        if (insertError) {
          // If user already exists (created by trigger), fetch it
          if (insertError.code === '23505') {
            // Retry once after a short delay, using admin client to bypass RLS
            await new Promise(resolve => setTimeout(resolve, 200))
            existingUser = await getSupabaseUserByEmail(email, true)
            if (!existingUser) {
              throw new Error('Failed to create user record')
            }
          } else {
            throw insertError
          }
        } else {
          existingUser = newUser as User
        }
      }
      
      // Update region and country if not set (use admin client so this also works before login)
      if (existingUser && (!existingUser.region || !existingUser.country)) {
        const { data: updatedUser } = await adminSupabase
          .from('users')
          .update({
            region: 'global',
            country: country,
          })
          .eq('id', existingUser.id)
          .select()
          .single()
        
        if (updatedUser) {
          existingUser = updatedUser as User
        }
      }
      
      user = existingUser!
      console.log('[REGISTER] User created in Supabase:', user.id)
    } catch (dbError: any) {
      console.error('[REGISTER] Database error saving new user:', {
        error: dbError,
        message: dbError.message,
        code: dbError.code,
        region,
      })
      
      return NextResponse.json(
        { 
          error: 'Failed to create user record',
          details: dbError.message || 'Database error',
        },
        { status: 500 }
      )
    }

    // Get session - use authSession from signUp or signIn
    let session = authSession
    let token = session?.access_token || ''

    // If no session, try to get existing session
    if (!session) {
      const { data: sessionData } = await supabase.auth.getSession()
      session = sessionData?.session || null
      token = session?.access_token || ''
    }

    // Don't auto-create workspace - let user choose/create workspace after registration
    // Workspace selection happens in the frontend after login

    // Explicitly get session to ensure cookies are set
    // This is important for @supabase/ssr to properly set cookies
    const { data: finalSessionData } = await supabase.auth.getSession()
    if (finalSessionData?.session) {
      session = finalSessionData.session
      token = session.access_token
    }

    return NextResponse.json({
      success: true,
      user,
      token,
      requiresEmailConfirmation: !session,
    })
  } catch (error: any) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: error.message || 'Registration failed' },
      { status: 500 }
    )
  }
}

