import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserByEmail as getSupabaseUserByEmail, createUser as createSupabaseUser } from '@/lib/database/supabase/users'
import { getUserByEmail as getCloudBaseUserByEmail } from '@/lib/cloudbase/database'
import { createCloudBaseSession, setCloudBaseSessionCookie } from '@/lib/cloudbase/auth'
import { User } from '@/lib/types'
import { v4 as uuidv4 } from 'uuid'
import { hashPassword } from '@/lib/utils/password'
import { IS_DOMESTIC_VERSION, getDeploymentRegion } from '@/config'
import { verificationCodeService } from '@/lib/email/verification-code-service'

export async function POST(request: NextRequest) {
  try {
    console.log('[REGISTER] ===== Registration request started =====')
    console.log('[REGISTER] Environment variables:', {
      DEPLOYMENT_REGION: process.env.DEPLOYMENT_REGION,
      RESOLVED_REGION: getDeploymentRegion(),
      IS_DOMESTIC_VERSION,
      CLOUDBASE_ENV_ID: process.env.CLOUDBASE_ENV_ID ? 'configured' : 'missing',
    })

    const body = await request.json()
    const { email, password, name, verificationCode } = body
    console.log('[REGISTER] Request data:', { email, name, passwordLength: password?.length, hasVerificationCode: !!verificationCode })

    // Validate input
    if (!email || !password || !name) {
      console.log('[REGISTER] Validation failed: missing required fields')
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      console.log('[REGISTER] Validation failed: invalid email format')
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Validate password strength
    if (password.length < 8) {
      console.log('[REGISTER] Validation failed: password too short')
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // Check if we should use CloudBase (domestic version)
    console.log('[REGISTER] Checking version:', { IS_DOMESTIC_VERSION })
    if (IS_DOMESTIC_VERSION) {
      console.log('[REGISTER] ✓ Using CloudBase (domestic version)')
      return handleCloudBaseRegister(email, password, name, verificationCode)
    } else {
      console.log('[REGISTER] ✓ Using Supabase (global version)')
    }

    // Continue with existing Supabase logic
    console.log('[REGISTER] Using Supabase (global version)')

    // Always use global region (Supabase) - IP detection removed
    const region = 'global'
    const country = null

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

    // 新用户自动加入 TechCorp 总组 (Supabase/国际版)
    console.log('[REGISTER] Adding user to TechCorp workspace (Supabase)...')
    try {
      // 先查询 TechCorp 工作区是否存在
      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id')
        .eq('domain', 'techcorp')
        .limit(1)

      if (workspaces && workspaces.length > 0) {
        const workspaceId = workspaces[0].id
        // 添加用户到工作区
        await supabase
          .from('workspace_members')
          .upsert({
            workspace_id: workspaceId,
            user_id: user.id,
            role: 'member',
          }, { onConflict: 'workspace_id,user_id' })
        console.log('[REGISTER] ✓ User added to TechCorp workspace')
      } else {
        console.log('[REGISTER] TechCorp workspace not found, skipping workspace join')
      }
    } catch (workspaceError) {
      console.error('[REGISTER] Failed to add user to workspace:', workspaceError)
      // 不阻塞注册流程
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

/**
 * Handle CloudBase registration (for domestic version)
 * Requires email verification code
 */
async function handleCloudBaseRegister(
  email: string,
  password: string,
  name: string,
  verificationCode?: string
): Promise<NextResponse> {
  try {
    console.log('[REGISTER] ===== CloudBase registration started =====')
    console.log('[REGISTER] CloudBase registration for:', email)

    // Validate verification code for domestic version
    if (!verificationCode || verificationCode.length !== 6) {
      console.error('[REGISTER] 验证码格式错误:', verificationCode);
      return NextResponse.json(
        { error: '请输入6位验证码' },
        { status: 400 }
      );
    }

    console.log('[REGISTER] 开始验证验证码');
    const verifyResult = await verificationCodeService.verifyCode(
      email,
      verificationCode,
      'register'
    );

    if (!verifyResult.success) {
      console.error('[REGISTER] 验证码验证失败:', verifyResult.error);
      return NextResponse.json(
        { error: verifyResult.error || '验证码验证失败' },
        { status: 400 }
      );
    }

    console.log('[REGISTER] 验证码验证成功');

    // Check if user already exists
    console.log('[REGISTER] Checking if user already exists...')
    const existingUser = await getCloudBaseUserByEmail(email)
    console.log('[REGISTER] Existing user check result:', existingUser ? 'User exists' : 'User not found')

    if (existingUser) {
      console.log('[REGISTER] ✗ Registration failed: Email already registered')
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      )
    }

    // Generate unique user ID
    const userId = uuidv4()
    console.log('[REGISTER] Generated user ID:', userId)

    // Hash password
    console.log('[REGISTER] Hashing password...')
    const passwordHash = await hashPassword(password)
    console.log('[REGISTER] Password hashed successfully')

    // Get CloudBase database
    console.log('[REGISTER] Getting CloudBase database instance...')
    const { getCloudBaseDb } = await import('@/lib/cloudbase/client')
    const db = getCloudBaseDb()
    console.log('[REGISTER] Database instance:', db ? 'obtained' : 'null')

    if (!db) {
      console.log('[REGISTER] ✗ CloudBase not configured')
      throw new Error('CloudBase not configured')
    }

    // Create user in CloudBase
    const userData = {
      id: userId,
      email: email,
      username: email.split('@')[0],
      full_name: name,
      avatar_url: null,
      password_hash: passwordHash,
      provider: 'email',
      provider_id: email,
      status: 'online',
      region: 'cn',
      country: 'CN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    console.log('[REGISTER] User data prepared:', {
      id: userData.id,
      email: userData.email,
      username: userData.username,
      full_name: userData.full_name,
      provider: userData.provider,
    })

    console.log('[REGISTER] Writing to CloudBase users collection...')
    const result = await db.collection('users').add(userData)
    console.log('[REGISTER] CloudBase write result:', result)

    console.log('[REGISTER] ✓ CloudBase user created:', userId)

    // 新用户自动加入 TechCorp 总组
    console.log('[REGISTER] Adding user to TechCorp workspace...')
    try {
      const workspaceId = '7746c6e86994694300e707d4734fa1ad' // TechCorp 总组 ID
      await db.collection('workspace_members').add({
        workspace_id: workspaceId,
        user_id: userId,
        role: 'member',
        joined_at: new Date().toISOString(),
      })
      console.log('[REGISTER] ✓ User added to TechCorp workspace')
    } catch (workspaceError) {
      console.error('[REGISTER] Failed to add user to workspace:', workspaceError)
      // 不阻塞注册流程，只是记录错误
    }

    // Create user object for response (without password_hash)
    console.log('[REGISTER] Creating user object for response...')
    const user: User = {
      id: userId,
      email: email,
      username: email.split('@')[0],
      full_name: name,
      avatar_url: null,
      auth_email: null,
      provider: 'email',
      provider_id: email,
      wechat_openid: null,
      wechat_unionid: null,
      status: 'online',
      region: 'cn',
      country: 'CN',
      subscription_type: null,
      subscription_expires_at: null,
      created_at: userData.created_at,
      updated_at: userData.updated_at,
    }

    // Create session token
    console.log('[REGISTER] Creating session token...')
    const token = createCloudBaseSession(user, {
      provider: 'email',
      provider_id: email,
    })
    console.log('[REGISTER] Session token created:', token ? 'success' : 'failed')

    // Create response with session cookie
    console.log('[REGISTER] Creating response with session cookie...')
    const response = NextResponse.json({
      success: true,
      user,
      token,
      requiresEmailConfirmation: false, // No email verification needed
    })

    // Set session cookie
    console.log('[REGISTER] Setting session cookie...')
    setCloudBaseSessionCookie(response, token)

    console.log('[REGISTER] ✓ CloudBase registration successful, session created')
    console.log('[REGISTER] ===== Registration completed successfully =====')

    return response
  } catch (error: any) {
    console.error('[REGISTER] ✗ CloudBase registration error:', error)
    console.error('[REGISTER] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    })
    return NextResponse.json(
      { error: error.message || 'Registration failed' },
      { status: 500 }
    )
  }
}
