import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordDevice } from '@/lib/database/devices'
import { parseDeviceInfo, getClientIP, getLocationFromIP } from '@/lib/utils/device-parser'

/**
 * Handle Google OAuth callback from Supabase
 * GET /api/auth/oauth/google/callback
 */
export async function GET(request: NextRequest) {
  try {
    // Use request origin instead of hardcoded localhost
    const origin = request.nextUrl.origin
    
    // Check if Supabase is configured
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return NextResponse.redirect(`${origin}/login?error=supabase_not_configured`)
    }

    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const action = searchParams.get('action') || 'login'
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(`${origin}/login?error=oauth_cancelled`)
    }

    if (!code) {
      return NextResponse.redirect(`${origin}/login?error=oauth_failed`)
    }

    // Exchange code for session (optimized: parallel operations where possible)
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError || !data.session || !data.user) {
      console.error('Supabase session exchange error:', exchangeError)
      return NextResponse.redirect(`${origin}/login?error=session_exchange_failed`)
    }

    const { user, session } = data

    // Get or create user in our users table
    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()
    
    let dbUser = existingUser
    
    // If user doesn't exist in users table, create it
    if (!dbUser || userError) {
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          id: user.id,
          email: user.email || '',
          username: user.email?.split('@')[0] || user.id.substring(0, 8),
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
          status: 'online',
        })
        .select()
        .single()
      
      if (createError && createError.code !== '23505') { // Ignore if user already exists
        console.error('[GOOGLE OAUTH] Failed to create user:', createError)
        // Try to fetch again (might have been created by trigger)
        const { data: retryUser } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single()
        if (retryUser) {
          dbUser = retryUser
        }
      } else if (newUser) {
        dbUser = newUser
      }
    }
    
    // Update user status to online
    if (dbUser) {
      console.log('[GOOGLE OAUTH] Updating user status to online for user:', dbUser.id)
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({ status: 'online', updated_at: new Date().toISOString() })
        .eq('id', dbUser.id)
        .select()
        .single()
      
      if (updateError) {
        console.error('[GOOGLE OAUTH] Failed to update user status:', updateError)
        console.error('[GOOGLE OAUTH] Error details:', JSON.stringify(updateError, null, 2))
      } else if (updatedUser) {
        console.log('[GOOGLE OAUTH] Successfully updated user status to online')
        dbUser = updatedUser
      }
    }

    // Don't auto-create workspace - let user choose/create workspace after OAuth login
    // Workspace selection happens in the frontend after login

    // Transform to our user format for frontend
    const userData = {
      id: dbUser?.id || user.id,
      email: dbUser?.email || user.email || '',
      username: dbUser?.username || user.email?.split('@')[0] || user.id.substring(0, 8),
      full_name: dbUser?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
      avatar_url: dbUser?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
      department: dbUser?.department || null,
      title: dbUser?.title || null,
      status: dbUser?.status || 'online',
      created_at: dbUser?.created_at || user.created_at,
      updated_at: dbUser?.updated_at || new Date().toISOString(),
      provider: 'google',
      provider_id: user.id,
    }

    // Store session token
    const token = session.access_token
    console.log('[GOOGLE OAUTH] ========== Device Recording Started ==========')
    console.log('[GOOGLE OAUTH] User ID:', userData.id)
    console.log('[GOOGLE OAUTH] Session token:', token ? 'present' : 'missing')

    // Get device info and record device
    const userAgent = request.headers.get('user-agent') || ''
    console.log('[GOOGLE OAUTH] User-Agent:', userAgent)

    const deviceInfo = parseDeviceInfo(userAgent)
    console.log('[GOOGLE OAUTH] Device info:', JSON.stringify(deviceInfo, null, 2))

    const ip = getClientIP(request)
    console.log('[GOOGLE OAUTH] IP address:', ip)

    const location = await getLocationFromIP(ip)
    console.log('[GOOGLE OAUTH] Location:', location)

    // Record device
    const deviceData = {
      user_id: userData.id,
      device_name: deviceInfo.deviceName,
      device_type: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      ip_address: ip,
      location: location,
      session_token: token,
    }
    console.log('[GOOGLE OAUTH] Device data to record:', JSON.stringify(deviceData, null, 2))

    try {
      console.log('[GOOGLE OAUTH] Calling recordDevice...')
      const recordedDevice = await recordDevice(deviceData)
      console.log('[GOOGLE OAUTH] ✅ Device recorded successfully:', JSON.stringify(recordedDevice, null, 2))
    } catch (error: any) {
      console.error('[GOOGLE OAUTH] ❌ Failed to record device')
      console.error('[GOOGLE OAUTH] Error message:', error?.message)
      console.error('[GOOGLE OAUTH] Error stack:', error?.stack)
      console.error('[GOOGLE OAUTH] Full error:', JSON.stringify(error, null, 2))
      // Don't fail OAuth if device recording fails
    }
    console.log('[GOOGLE OAUTH] ========== Device Recording Ended ==========')

    // Redirect to frontend with user data (optimized: direct redirect, no extra processing)
    const redirectUrl = new URL(`${origin}/login`)
    redirectUrl.searchParams.set('oauth', 'success')
    redirectUrl.searchParams.set('provider', 'google')
    redirectUrl.searchParams.set('token', token)
    redirectUrl.searchParams.set('user', JSON.stringify(userData))

    return NextResponse.redirect(redirectUrl.toString())
  } catch (error) {
    console.error('Google OAuth callback error:', error)
    const origin = request.nextUrl.origin
    return NextResponse.redirect(`${origin}/login?error=oauth_callback_failed`)
  }
}
