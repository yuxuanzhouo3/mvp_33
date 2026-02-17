import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserByEmail as getSupabaseUserByEmail, createUser as createSupabaseUser } from '@/lib/database/supabase/users'
import { getUserByEmail as getCloudBaseUserByEmail } from '@/lib/database/cloudbase/users'
import { createCloudBaseSession, setCloudBaseSessionCookie } from '@/lib/cloudbase/auth'
import { User } from '@/lib/types'
import { IS_DOMESTIC_VERSION } from '@/config'
import { verifyPassword } from '@/lib/utils/password'
import { recordDevice } from '@/lib/database/devices'
import { parseDeviceInfo, getClientIP, getLocationFromIP } from '@/lib/utils/device-parser'

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

    // Route to appropriate authentication based on environment variable
    if (IS_DOMESTIC_VERSION) {
      console.log('[LOGIN] Using domestic version (CloudBase)')
      return handleCloudBaseLogin(email, password)
    }

    // International version: use Supabase
    console.log('[LOGIN] Using international version (Supabase)')
    const supabase = await createClient()

    // Always check Supabase only
    console.log('[LOGIN] Checking Supabase only')
    console.log('[LOGIN] Searching for user with email:', email)
    
    // Use admin client to bypass RLS (user is not authenticated yet)
    const supabaseUser = await getSupabaseUserByEmail(email, true)
    
    console.log('[LOGIN] Supabase user lookup result:', {
      found: !!supabaseUser,
      userId: supabaseUser?.id,
      email: supabaseUser?.email,
      username: supabaseUser?.username,
      region: supabaseUser?.region,
      searchEmail: email,
    })
    
    let authEmailForSupabase = email
    let registeredRegion: 'cn' | 'global' = 'global'
    let finalUser: User | null = null
    
    if (supabaseUser) {
      finalUser = supabaseUser
      authEmailForSupabase = email // Global users use original email
      console.log('[LOGIN] ✅ Found Supabase user in public.users, using email for auth:', {
        authEmail: authEmailForSupabase,
        userId: supabaseUser.id,
        userEmail: supabaseUser.email,
        userRegion: supabaseUser.region,
      })
    } else {
      // User not found in public.users, but might exist in auth.users
      // Try to authenticate first, then create/find the user record
      console.warn('[LOGIN] ⚠️ User not found in public.users table, but will try Supabase Auth anyway')
      authEmailForSupabase = email
      finalUser = null // Will be set after successful auth
    }

    console.log('[LOGIN] Attempting auth:', {
      email,
      registeredRegion,
      authEmailForSupabase,
      hasFinalUser: !!finalUser,
      finalUserRegion: finalUser?.region,
    })

    // Sign in with Supabase Auth using region-specific auth email if needed
    console.log('[LOGIN] ========== CALLING SUPABASE AUTH ==========')
    console.log('[LOGIN] Calling Supabase Auth signInWithPassword:', {
      email: authEmailForSupabase,
      passwordLength: password.length,
      originalEmail: email,
      finalUserExists: !!finalUser,
      finalUserId: finalUser?.id,
      finalUserEmail: finalUser?.email,
    })
    console.log('[LOGIN] About to call: supabase.auth.signInWithPassword({ email: "' + authEmailForSupabase + '", password: "***" })')
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: authEmailForSupabase,
      password,
    })
    
    console.log('[LOGIN] ========== SUPABASE AUTH RESPONSE ==========')
    console.log('[LOGIN] Supabase Auth signInWithPassword response:', {
      hasUser: !!authData?.user,
      userId: authData?.user?.id,
      userEmail: authData?.user?.email,
      hasSession: !!authData?.session,
      sessionToken: authData?.session?.access_token ? 'present' : 'missing',
      hasError: !!authError,
      errorMessage: authError?.message,
      errorCode: authError?.code,
      errorStatus: authError?.status,
      fullError: authError ? JSON.stringify(authError, null, 2) : 'null',
      fullAuthData: authData ? JSON.stringify({
        user: authData.user ? {
          id: authData.user.id,
          email: authData.user.email,
          email_confirmed_at: authData.user.email_confirmed_at,
        } : null,
        session: authData.session ? 'present' : null,
      }, null, 2) : 'null',
    })

    if (authError || !authData.user) {
      console.error('[LOGIN] ❌ Supabase Auth signInWithPassword failed:', {
        error: authError,
        message: authError?.message,
        status: authError?.status,
        code: authError?.code,
        email: authEmailForSupabase,
        originalEmail: email,
        registeredRegion,
        hasFinalUser: !!finalUser,
        finalUserRegion: finalUser?.region,
      })
      
      // Check if error is due to email not confirmed
      const errorMessage = authError?.message?.toLowerCase() || ''
      if (errorMessage.includes('email not confirmed') || 
          errorMessage.includes('email_not_confirmed') ||
          errorMessage.includes('confirm') ||
          authError?.code === 'email_not_confirmed') {
        console.error('[LOGIN] Email not confirmed error detected')
        return NextResponse.json(
          { 
            error: 'Please check your email and confirm your account before logging in',
            code: 'EMAIL_NOT_CONFIRMED',
          },
          { status: 401 }
        )
      }
      
      // Check if user doesn't exist
      if (errorMessage.includes('invalid login credentials') ||
          errorMessage.includes('invalid_credentials') ||
          errorMessage.includes('user not found') ||
          authError?.code === 'invalid_credentials') {
        console.error('[LOGIN] Invalid credentials - user not found or wrong password')
      }
      
      // Always return simple error message for other cases
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    // CRITICAL: Verify that auth.users ID matches public.users ID
    // This is a common issue when registration partially fails
    console.log('[LOGIN] ========== CHECKING ID MATCH ==========')
    console.log('[LOGIN] Comparing IDs:', {
      authUserId: authData.user.id,
      publicUserId: finalUser?.id,
      idsMatch: finalUser ? authData.user.id === finalUser.id : 'N/A (no finalUser)',
      authUserEmail: authData.user.email,
      publicUserEmail: finalUser?.email,
    })
    
    if (finalUser && authData.user.id !== finalUser.id) {
      console.error('[LOGIN] ❌ CRITICAL: ID mismatch between auth.users and public.users!', {
        authUserId: authData.user.id,
        publicUserId: finalUser.id,
        email: email,
        authEmail: authEmailForSupabase,
        authUserEmail: authData.user.email,
        publicUserEmail: finalUser.email,
        message: 'This indicates the user was created incorrectly. The IDs must match!'
      })
      
      // Try to find user by auth ID instead
      console.log('[LOGIN] Attempting to find user by auth ID:', authData.user.id)
      const { data: userByAuthId, error: lookupError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single()
      
      console.log('[LOGIN] Lookup by auth ID result:', {
        found: !!userByAuthId,
        userId: userByAuthId?.id,
        email: userByAuthId?.email,
        error: lookupError?.message,
      })
      
      if (userByAuthId && !lookupError) {
        console.log('[LOGIN] ✅ Found user by auth ID, using that instead:', {
          authUserId: authData.user.id,
          publicUserId: userByAuthId.id,
          email: userByAuthId.email,
        })
        finalUser = userByAuthId as User
        registeredRegion = userByAuthId.region === 'cn' ? 'cn' : 'global'
      } else {
        console.error('[LOGIN] ❌ User not found by auth ID either. This is a data integrity issue.')
        console.error('[LOGIN] This means auth.users has a user but public.users does not have a matching ID')
        return NextResponse.json(
          { 
            error: 'Account data mismatch. Please contact support.',
            code: 'ID_MISMATCH',
          },
          { status: 500 }
        )
      }
    } else if (finalUser) {
      console.log('[LOGIN] ✅ IDs match correctly!')
    } else {
      console.warn('[LOGIN] ⚠️ No finalUser to compare with auth user ID')
    }

    // If user authenticated successfully but not found in public.users, try to find or create
    if (registeredRegion === 'global' && !finalUser) {
      console.log('[LOGIN] ========== USER AUTHENTICATED BUT NOT IN public.users ==========')
      console.log('[LOGIN] Auth user ID:', authData.user.id)
      console.log('[LOGIN] Auth user email:', authData.user.email)
      
      // First, try to find user by auth ID (might have been created by trigger)
      console.log('[LOGIN] Attempting to find user by auth ID:', authData.user.id)
      const { data: userByAuthId, error: lookupError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user.id)
        .single()

      console.log('[LOGIN] Lookup by auth ID result:', {
        found: !!userByAuthId,
        userId: userByAuthId?.id,
        email: userByAuthId?.email,
        error: lookupError?.message,
        errorCode: lookupError?.code,
      })

      if (userByAuthId && !lookupError) {
        console.log('[LOGIN] ✅ Found user by auth ID (created by trigger):', {
          userId: userByAuthId.id,
          email: userByAuthId.email,
          region: userByAuthId.region,
        })
        finalUser = userByAuthId as User
        registeredRegion = userByAuthId.region === 'cn' ? 'cn' : 'global'
      } else {
        // User doesn't exist, try to create it
        console.log('[LOGIN] User not found by auth ID, attempting to create user record')
        try {
          // Use admin client to bypass RLS (user is authenticated but might not have users table record yet)
          finalUser = await createSupabaseUser(
            {
              email: authData.user.email || email,
              username: email.split('@')[0],
              full_name: authData.user.user_metadata?.full_name || email.split('@')[0],
              avatar_url: authData.user.user_metadata?.avatar_url || null,
            },
            authData.user.id,
            true // useAdminClient = true to bypass RLS
          )
          registeredRegion = 'global'
          console.log('[LOGIN] ✅ Created user in Supabase users table:', {
            userId: finalUser.id,
            email: finalUser.email,
          })
        } catch (createError: any) {
          console.error('[LOGIN] ❌ Failed to create user:', {
            error: createError?.message,
            code: createError?.code,
            email,
            authUserId: authData.user.id,
            fullError: JSON.stringify(createError, null, 2),
          })
          
          // If creation failed due to unique constraint, try to fetch again
          if (createError?.code === '23505') {
            console.log('[LOGIN] User creation failed due to unique constraint, retrying fetch')
            const { data: retryUser } = await supabase
              .from('users')
              .select('*')
              .eq('id', authData.user.id)
              .single()

            if (retryUser) {
              console.log('[LOGIN] ✅ Found user after retry:', {
                userId: retryUser.id,
                email: retryUser.email,
              })
              finalUser = retryUser as User
              registeredRegion = retryUser.region === 'cn' ? 'cn' : 'global'
            } else {
              console.error('[LOGIN] ❌ User not found after retry')
              return NextResponse.json(
                { error: 'Account setup incomplete. Please contact support.' },
                { status: 500 }
              )
            }
          } else {
            console.error('[LOGIN] ❌ User creation failed with unexpected error')
            return NextResponse.json(
              { error: 'Account setup incomplete. Please contact support.' },
              { status: 500 }
            )
          }
        }
      }
    }

    if (!finalUser) {
      finalUser = await getSupabaseUserByEmail(email) || null
    }

    if (!finalUser) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    console.log('[LOGIN] User info:', {
      email,
      registeredRegion,
      userRegion: finalUser.region,
      userFoundIn: 'Supabase',
    })
    
    // Update user status to online immediately after login
    console.log('[LOGIN] Updating user status to online for user:', finalUser.id)
    
    let updatedUser = finalUser
    const { data: userData, error: updateError } = await supabase
      .from('users')
      .update({ status: 'online', updated_at: new Date().toISOString() })
      .eq('id', finalUser.id)
      .select()
      .single()
    
    if (updateError) {
      console.error('[LOGIN] Failed to update user status to online:', updateError)
      // Set status manually in response
      updatedUser.status = 'online'
      console.warn('[LOGIN] Status update failed, but continuing with login. User status set to online in response.')
    } else if (userData) {
      console.log('[LOGIN] Successfully updated user status to online:', userData.status)
      updatedUser = userData
    }

    // Get session token immediately (session is already created by signInWithPassword)
    const token = authData.session?.access_token || ''

    // Verify session exists
    if (!authData.session) {
      console.error('No session after login')
      return NextResponse.json(
        { error: 'Failed to create session' },
        { status: 500 }
      )
    }
    
    // Workspace creation can be done asynchronously after login
    // Don't block login for workspace creation

    // Get device info
    const userAgent = request.headers.get('user-agent') || ''
    const deviceInfo = parseDeviceInfo(userAgent)
    const ip = getClientIP(request)
    const location = await getLocationFromIP(ip)

    // Record device
    try {
      await recordDevice({
        user_id: updatedUser.id,
        device_name: deviceInfo.deviceName,
        device_type: deviceInfo.deviceType,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        ip_address: ip,
        location: location,
        session_token: token,
      })
      console.log('[LOGIN] Device recorded successfully')
    } catch (error) {
      console.error('[LOGIN] Failed to record device:', error)
      // Don't fail login if device recording fails
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
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

/**
 * Handle CloudBase login (for domestic version)
 */
async function handleCloudBaseLogin(email: string, password: string) {
  try {
    console.log('[LOGIN] ========== CloudBase Login Started ==========')
    console.log('[LOGIN] CloudBase authentication for:', email)
    console.log('[LOGIN] Password length:', password.length)
    console.log('[LOGIN] Password first 2 chars:', password.substring(0, 2))
    console.log('[LOGIN] Password last 2 chars:', password.substring(password.length - 2))

    // Get user from CloudBase (with password hash for authentication)
    const user = await getCloudBaseUserByEmail(email, true)

    if (!user) {
      console.error('[LOGIN] ❌ User not found in CloudBase:', email)
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    console.log('[LOGIN] ✓ User found in CloudBase:', {
      userId: user.id,
      email: user.email,
      username: user.username,
    })

    // Verify password
    const storedPasswordHash = (user as any).password_hash
    if (!storedPasswordHash) {
      console.error('[LOGIN] ❌ No password hash found for user:', email)
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    console.log('[LOGIN] Password hash from database:', storedPasswordHash)
    console.log('[LOGIN] Password hash length:', storedPasswordHash.length)
    console.log('[LOGIN] Password hash starts with:', storedPasswordHash.substring(0, 7))

    console.log('[LOGIN] Calling verifyPassword...')
    const isPasswordValid = await verifyPassword(password, storedPasswordHash)
    console.log('[LOGIN] Password verification result:', isPasswordValid ? '✓ VALID' : '❌ INVALID')

    if (!isPasswordValid) {
      console.error('[LOGIN] ❌ Invalid password for user:', email)
      console.error('[LOGIN] Password provided:', password)
      console.error('[LOGIN] Hash in database:', storedPasswordHash)
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    console.log('[LOGIN] CloudBase user authenticated:', user.id)

    // Create CloudBase session
    const token = createCloudBaseSession(user)

    // Get device info
    const userAgent = request.headers.get('user-agent') || ''
    const deviceInfo = parseDeviceInfo(userAgent)
    const ip = getClientIP(request)
    const location = await getLocationFromIP(ip)

    // Record device
    try {
      await recordDevice({
        user_id: user.id,
        device_name: deviceInfo.deviceName,
        device_type: deviceInfo.deviceType,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        ip_address: ip,
        location: location,
        session_token: token,
      })
      console.log('[LOGIN] Device recorded successfully')
    } catch (error) {
      console.error('[LOGIN] Failed to record device:', error)
      // Don't fail login if device recording fails
    }

    // Create response with session cookie
    const response = NextResponse.json({
      success: true,
      user: user,
      token,
    })

    // Set session cookie
    setCloudBaseSessionCookie(response, token)

    console.log('[LOGIN] CloudBase session created successfully')

    return response
  } catch (error: any) {
    console.error('[LOGIN] CloudBase login error:', error)
    return NextResponse.json(
      { error: error.message || 'Login failed' },
      { status: 500 }
    )
  }
}
