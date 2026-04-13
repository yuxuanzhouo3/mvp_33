import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isChinaRegion } from '@/lib/config/region'
import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { createCloudBaseSession, setCloudBaseSessionCookie } from '@/lib/cloudbase/auth'
import { User } from '@/lib/types'
import { applyInviteSignupFromRequest, handleInviteProgramLogin } from '@/lib/market/invite-program'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const wxloginSchema = z.object({
  code: z.string().min(1, 'WeChat code is required'),
  nickName: z.string().optional(),
  avatarUrl: z.string().optional(),
})

const DEFAULT_SESSION_TTL = 7 * 24 * 60 * 60

function getSessionExpiresInSeconds() {
  const raw = Number(process.env.CLOUDBASE_SESSION_TTL || DEFAULT_SESSION_TTL)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SESSION_TTL
}

function buildSessionUser(params: {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
  openid: string
}): User {
  return {
    id: params.id,
    email: params.email,
    username: params.name,
    full_name: params.name,
    avatar_url: params.avatarUrl || null,
    provider: 'wechat_miniprogram',
    provider_id: params.openid,
    wechat_openid: params.openid,
    region: 'cn',
    country: 'CN',
    status: 'online',
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('[wxlogin] ========== Request Start ==========')
    console.log('[wxlogin] NEXT_PUBLIC_DEPLOYMENT_REGION:', process.env.NEXT_PUBLIC_DEPLOYMENT_REGION)
    console.log('[wxlogin] isChinaRegion():', isChinaRegion())

    const body = await request.json()
    console.log('[wxlogin] Request body:', {
      hasCode: Boolean(body.code),
      hasNickName: Boolean(body.nickName),
      hasAvatarUrl: Boolean(body.avatarUrl),
    })

    const clientIP =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown'
    console.log('[wxlogin] Client IP:', clientIP)

    const validationResult = wxloginSchema.safeParse(body)
    if (!validationResult.success) {
      console.error('[wxlogin] Validation failed:', validationResult.error.errors)
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid input',
          message: 'code is required',
        },
        { status: 400 }
      )
    }

    if (!isChinaRegion()) {
      console.error('[wxlogin] Region check failed - not China region')
      return NextResponse.json(
        {
          success: false,
          error: 'REGION_NOT_SUPPORTED',
          message: 'WeChat login only available in China region',
        },
        { status: 400 }
      )
    }
    console.log('[wxlogin] Region check passed')

    const { code, nickName, avatarUrl } = validationResult.data
    console.log('[wxlogin] Validation passed')

    const appId = process.env.WECHAT_MINIPROGRAM_APPID
    const appSecret = process.env.WECHAT_MINIPROGRAM_SECRET
    console.log('[wxlogin] Config check:', {
      hasAppId: Boolean(appId),
      appIdPrefix: appId ? appId.substring(0, 6) : 'none',
      hasAppSecret: Boolean(appSecret),
    })

    if (!appId || !appSecret) {
      console.error('[wxlogin] Missing WeChat configuration')
      return NextResponse.json(
        {
          success: false,
          error: 'CONFIG_ERROR',
          message: 'WeChat mini program configuration missing',
        },
        { status: 500 }
      )
    }

    console.log('[wxlogin] Calling WeChat jscode2session API...')

    const wxResponse = await fetch(
      `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`
    )

    const data = await wxResponse.json()

    console.log('[wxlogin] WeChat API response:', {
      hasError: Boolean(data.errcode),
      errcode: data.errcode,
      errmsg: data.errmsg,
      hasOpenid: Boolean(data.openid),
    })

    if (data.errcode) {
      console.error('[wxlogin] WeChat API error:', data.errcode, data.errmsg)
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_CODE',
          message: data.errmsg || 'WeChat code invalid or expired',
        },
        { status: 400 }
      )
    }

    const openid = String(data.openid || '')
    const sessionKey = String(data.session_key || '')

    if (!openid || !sessionKey) {
      console.error('[wxlogin] Invalid WeChat session:', { hasOpenid: Boolean(openid), hasSessionKey: Boolean(sessionKey) })
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_SESSION',
          message: 'WeChat session invalid',
        },
        { status: 400 }
      )
    }

    console.log('[wxlogin] Got openid successfully')

    const db = getCloudBaseDb()
    if (!db) {
      console.error('[wxlogin] CloudBase not configured')
      return NextResponse.json(
        { success: false, error: 'SERVER_ERROR', message: 'CloudBase not configured' },
        { status: 500 }
      )
    }

    const now = new Date().toISOString()
    const usersCollection = db.collection('users')

    let userId: string
    let email = `miniprogram_${openid}@local.wechat`
    let displayName = nickName || '小程序用户'
    let finalAvatarUrl = avatarUrl || null

    const queryResult = await usersCollection
      .where({ wechat_miniprogram_openid: openid })
      .limit(1)
      .get()

    let previousLastLoginAt: string | null = null

    if (queryResult.data && queryResult.data.length > 0) {
      const existingUser = queryResult.data[0]
      userId = existingUser.id || existingUser._id || `wechat_mp_${openid}`
      email = existingUser.email || email
      displayName = nickName || existingUser.full_name || existingUser.name || existingUser.username || displayName
      finalAvatarUrl = avatarUrl || existingUser.avatar_url || existingUser.avatar || finalAvatarUrl
      previousLastLoginAt = existingUser.last_login_at ? String(existingUser.last_login_at) : null

      console.log('[wxlogin] Existing user found:', { userId, hasAvatar: Boolean(finalAvatarUrl) })

      const updateData: Record<string, any> = {
        wechat_session_key: sessionKey,
        wechat_miniprogram_openid: openid,
        login_count: (existingUser.login_count || 0) + 1,
        last_login_at: now,
        last_login_ip: clientIP,
        updated_at: now,
        status: 'online',
        provider: 'wechat_miniprogram',
        provider_id: openid,
      }

      if (!existingUser.id) {
        updateData.id = userId
      }

      if (nickName) {
        updateData.full_name = displayName
        updateData.name = displayName
        updateData.username = displayName
      }

      if (avatarUrl) {
        updateData.avatar_url = finalAvatarUrl
      }

      await usersCollection.doc(existingUser._id).update(updateData)
    } else {
      userId = `wechat_mp_${openid}`
      displayName = nickName || displayName
      finalAvatarUrl = avatarUrl || null

      console.log('[wxlogin] Creating new mini program user:', { userId })

      const newUser = {
        id: userId,
        email,
        username: displayName,
        full_name: displayName,
        name: displayName,
        avatar_url: finalAvatarUrl,
        provider: 'wechat_miniprogram',
        provider_id: openid,
        wechat_miniprogram_openid: openid,
        wechat_session_key: sessionKey,
        status: 'online',
        region: 'cn',
        country: 'CN',
        login_count: 1,
        last_login_at: now,
        last_login_ip: clientIP,
        created_at: now,
        updated_at: now,
      }

      await usersCollection.add(newUser)
    }

    try {
      await applyInviteSignupFromRequest({
        request,
        invitedUserId: userId,
        invitedEmail: email,
        occurredAt: now,
      })
    } catch (bindError) {
      console.warn('[wxlogin] Referral binding skipped:', bindError)
    }

    try {
      await handleInviteProgramLogin({
        userId,
        occurredAt: now,
        source: 'auth.wxlogin',
        previousLastLoginAt,
      })
    } catch (inviteError) {
      console.warn('[wxlogin] Invite program login processing skipped:', inviteError)
    }

    const sessionUser = buildSessionUser({
      id: userId,
      email,
      name: displayName,
      avatarUrl: finalAvatarUrl,
      openid,
    })

    const token = createCloudBaseSession(sessionUser, {
      provider: 'wechat_miniprogram',
      provider_id: openid,
    })

    const expiresIn = getSessionExpiresInSeconds()

    console.log('[wxlogin] Generated session token:', { userId, expiresIn })

    const nextResponse = NextResponse.json({
      success: true,
      token,
      openid,
      expiresIn,
      user: {
        id: userId,
        openid,
        nickName: displayName,
        avatarUrl: finalAvatarUrl,
        email,
      },
    })

    setCloudBaseSessionCookie(nextResponse, token)
    return nextResponse
  } catch (error: any) {
    console.error('WeChat mini program login error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'SERVER_ERROR',
        message: 'WeChat mini program login failed',
        details: error?.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}


