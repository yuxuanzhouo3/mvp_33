import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function resolveAppOrigin(request: NextRequest): string {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim()

  if (envUrl) {
    try {
      return new URL(envUrl).origin
    } catch {
      // Fallback to request origin if env value is malformed.
    }
  }

  return request.nextUrl.origin
}

/**
 * Initiate Google OAuth flow using Supabase
 * GET /api/auth/oauth/google
 */
export async function GET(request: NextRequest) {
  try {
    const origin = resolveAppOrigin(request)
    
    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.redirect(`${origin}/login?error=supabase_not_configured`)
    }

    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get('action') || 'login' // 'login' or 'register'
    const source = searchParams.get('source') || 'web'
    
    // Get the origin URL for redirect
    const redirectTo = `${origin}/api/auth/oauth/google/callback?action=${action}&source=${encodeURIComponent(source)}`

    // Initiate Google OAuth with Supabase
    // Optimized for speed: use select_account for faster login (only show account selection if needed)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'online',
          prompt: 'select_account', // Faster: only show account selection if needed, skip consent screen for returning users
        },
      },
    })

    if (error) {
      console.error('Supabase Google OAuth error:', error)
      return NextResponse.redirect(`${origin}/login?error=oauth_init_failed`)
    }

    if (data?.url) {
      return NextResponse.redirect(data.url)
    }

    return NextResponse.redirect(`${origin}/login?error=oauth_init_failed`)
  } catch (error) {
    console.error('Google OAuth initiation error:', error)
    const origin = resolveAppOrigin(request)
    return NextResponse.redirect(`${origin}/login?error=oauth_init_failed`)
  }
}
