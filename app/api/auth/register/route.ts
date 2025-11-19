import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserByEmail } from '@/lib/supabase/database'
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

    const supabase = await createClient()

    // Check if user already exists in our users table
    const existingUser = await getUserByEmail(email)
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      )
    }

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          username: email.split('@')[0],
        },
      },
    })

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || 'Registration failed' },
        { status: 400 }
      )
    }

    // Wait a bit for the trigger to create user, or create manually
    // The trigger should create the user, but we'll also try to create it
    let user = await getUserByEmail(email)
    
    if (!user) {
      // Create user in our users table manually (in case trigger didn't fire)
      // Use the auth user ID directly instead of relying on session
      try {
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert({
            id: authData.user.id, // Use auth user ID directly
            email: authData.user.email!,
            username: email.split('@')[0],
            full_name: name,
            avatar_url: null,
            status: 'online',
          })
          .select()
          .single()

        if (insertError) {
          // If user already exists (created by trigger), fetch it
          if (insertError.code === '23505') { // Unique violation
            await new Promise(resolve => setTimeout(resolve, 500))
            user = await getUserByEmail(email)
            if (!user) {
              throw new Error('Failed to create user record')
            }
          } else {
            throw insertError
          }
        } else {
          user = newUser as User
        }
      } catch (dbError: any) {
        // If user was created by trigger, fetch it
        await new Promise(resolve => setTimeout(resolve, 500))
        user = await getUserByEmail(email)
        if (!user) {
          return NextResponse.json(
            { error: dbError.message || 'Failed to create user record' },
            { status: 500 }
          )
        }
      }
    }

    // Get session - signUp may return session directly
    let session = authData.session
    let token = session?.access_token || ''

    // If no session from signUp, try to sign in to establish session
    // This handles cases where email confirmation is disabled but session wasn't created
    if (!session) {
      // Try to sign in with the same credentials to establish session
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (!signInError && signInData.session) {
        session = signInData.session
        token = session.access_token
      } else {
        // If sign in also fails, try to get existing session
        const { data: sessionData } = await supabase.auth.getSession()
        session = sessionData?.session || null
        token = session?.access_token || ''
      }
    }

    // Ensure workspace is created for new user
    if (session) {
      const { data: workspaceMembers } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)

      if (!workspaceMembers || workspaceMembers.length === 0) {
        const domain = `workspace-${user.id.substring(0, 8)}-${Date.now()}`
        const { data: newWorkspace, error: workspaceError } = await supabase
          .from('workspaces')
          .insert({
            name: 'My Workspace',
            domain,
            owner_id: user.id,
          })
          .select()
          .single()

        if (!workspaceError && newWorkspace) {
          await supabase.from('workspace_members').insert({
            workspace_id: newWorkspace.id,
            user_id: user.id,
            role: 'owner',
          })
        }
      }
    }

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

