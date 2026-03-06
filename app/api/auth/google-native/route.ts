import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.json({ success: false, error: 'Supabase not configured' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const idToken = String(body?.idToken || '').trim()

    if (!idToken) {
      return NextResponse.json({ success: false, error: 'Missing Google ID token' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    })

    if (error || !data?.session || !data?.user) {
      console.error('[GOOGLE NATIVE] signInWithIdToken failed:', error)
      return NextResponse.json({ success: false, error: 'Google sign-in failed' }, { status: 401 })
    }

    const { user, session } = data

    // Keep behavior aligned with OAuth callback route.
    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    let dbUser = existingUser

    if (!dbUser || userError) {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: user.email || '',
          username: user.email?.split('@')[0] || user.id.substring(0, 8),
          full_name:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split('@')[0] ||
            'User',
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
          status: 'online',
        })
        .select()
        .single()

      if (createError && createError.code !== '23505') {
        console.error('[GOOGLE NATIVE] Failed to create users row:', createError)
      } else if (newUser) {
        dbUser = newUser
      }
    }

    if (dbUser) {
      const { data: updatedUser } = await supabase
        .from('users')
        .update({ status: 'online', updated_at: new Date().toISOString() })
        .eq('id', dbUser.id)
        .select()
        .single()

      if (updatedUser) {
        dbUser = updatedUser
      }
    }

    const responseUser = {
      id: dbUser?.id || user.id,
      email: dbUser?.email || user.email || '',
      username: dbUser?.username || user.email?.split('@')[0] || user.id.substring(0, 8),
      full_name:
        dbUser?.full_name ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split('@')[0] ||
        'User',
      avatar_url: dbUser?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
      department: dbUser?.department || null,
      title: dbUser?.title || null,
      status: dbUser?.status || 'online',
      created_at: dbUser?.created_at || user.created_at,
      updated_at: dbUser?.updated_at || new Date().toISOString(),
      provider: 'google',
      provider_id: user.id,
    }

    return NextResponse.json({
      success: true,
      user: responseUser,
      token: session.access_token,
    })
  } catch (error: any) {
    console.error('[GOOGLE NATIVE] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Google native auth failed' },
      { status: 500 }
    )
  }
}

