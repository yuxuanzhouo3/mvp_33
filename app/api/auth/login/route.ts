import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserByEmail, createUser } from '@/lib/supabase/database'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Sign in with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || 'Invalid email or password' },
        { status: 401 }
      )
    }

    // Get or create user in our users table
    let user = await getUserByEmail(email)
    
    if (!user) {
      // User exists in auth but not in users table - create it
      user = await createUser({
        email: authData.user.email!,
        username: email.split('@')[0],
        full_name: authData.user.user_metadata?.full_name || email.split('@')[0],
        avatar_url: authData.user.user_metadata?.avatar_url || null,
      })
    } else {
      // Update user status to online
      await supabase
        .from('users')
        .update({ status: 'online', updated_at: new Date().toISOString() })
        .eq('id', user.id)
      
      user.status = 'online'
    }

    // Ensure user has a workspace
    const { data: workspaceMembers } = await supabase
      .from('workspace_members')
      .select('workspace_id, workspaces (*)')
      .eq('user_id', user.id)
      .limit(1)

    if (!workspaceMembers || workspaceMembers.length === 0) {
      // Create default workspace for user
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
        // Add user as owner
        await supabase.from('workspace_members').insert({
          workspace_id: newWorkspace.id,
          user_id: user.id,
          role: 'owner',
        })
      }
    }

    // Get session token and ensure cookies are set
    // Explicitly call getSession() to ensure @supabase/ssr sets cookies properly
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token || ''

    // Verify session exists
    if (!sessionData?.session) {
      console.error('No session after login')
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      user,
      token,
    })
  } catch (error: any) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: error.message || 'Login failed' },
      { status: 500 }
    )
  }
}

