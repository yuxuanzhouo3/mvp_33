import { NextRequest, NextResponse } from 'next/server'
import { getUserByWeChatId, createUser as createCloudBaseUser, updateUser as updateCloudBaseUser, getUserById } from '@/lib/database/cloudbase/users'
import { createCloudBaseSession, setCloudBaseSessionCookie } from '@/lib/cloudbase/auth'

const WECHAT_APP_ID = process.env.WECHAT_APP_ID || ''
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || ''
const FRONTEND_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'

/**
 * Handle WeChat OAuth callback
 * GET /api/auth/oauth/wechat/callback
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state') || ''
    const error = searchParams.get('error')

    if (error) {
      return NextResponse.redirect(`${FRONTEND_URL}/login?error=oauth_cancelled`)
    }

    if (!code) {
      return NextResponse.redirect(`${FRONTEND_URL}/login?error=oauth_failed`)
    }

    // Extract action from state (login or register)
    const action = state.split('_')[0] || 'login'

    // Exchange authorization code for access token
    const tokenUrl = new URL('https://api.weixin.qq.com/sns/oauth2/access_token')
    tokenUrl.searchParams.set('appid', WECHAT_APP_ID)
    tokenUrl.searchParams.set('secret', WECHAT_APP_SECRET)
    tokenUrl.searchParams.set('code', code)
    tokenUrl.searchParams.set('grant_type', 'authorization_code')

    const tokenResponse = await fetch(tokenUrl.toString(), {
      method: 'GET',
    })

    if (!tokenResponse.ok) {
      return NextResponse.redirect(`${FRONTEND_URL}/login?error=token_exchange_failed`)
    }

    const tokenData = await tokenResponse.json()

    if (tokenData.errcode) {
      return NextResponse.redirect(`${FRONTEND_URL}/login?error=wechat_error&message=${tokenData.errmsg}`)
    }

    const { access_token, openid } = tokenData

    // Get user info from WeChat
    const userInfoUrl = new URL('https://api.weixin.qq.com/sns/userinfo')
    userInfoUrl.searchParams.set('access_token', access_token)
    userInfoUrl.searchParams.set('openid', openid)
    userInfoUrl.searchParams.set('lang', 'zh_CN')

    const userInfoResponse = await fetch(userInfoUrl.toString(), {
      method: 'GET',
    })

    if (!userInfoResponse.ok) {
      return NextResponse.redirect(`${FRONTEND_URL}/login?error=user_info_failed`)
    }

    const wechatUser = await userInfoResponse.json()

    if (wechatUser.errcode) {
      return NextResponse.redirect(`${FRONTEND_URL}/login?error=wechat_error&message=${wechatUser.errmsg}`)
    }

    console.log('[WECHAT OAUTH] Callback action:', action, 'state:', state)

    const unionid = wechatUser.unionid || null
    const nickname = wechatUser.nickname || `wechat_${openid.substring(0, 8)}`
    const fallbackEmail = `${openid}@wechat.user`

    let user =
      (await getUserByWeChatId({ unionid, openid })) ||
      null

    if (!user) {
      // Create brand new CloudBase user for WeChat account
      user = await createCloudBaseUser(
        {
          id: unionid ? `wechat_${unionid}` : `wechat_${openid}`,
          email: fallbackEmail,
          username: nickname,
          full_name: nickname,
          avatar_url: wechatUser.headimgurl || null,
          region: 'cn',
          country: 'CN',
        },
        {
          provider: 'wechat',
          provider_id: openid,
          wechat_openid: openid,
          wechat_unionid: unionid,
          status: 'online',
        }
      )
      console.log('[WECHAT OAUTH] Created CloudBase user:', user.id)
    } else {
      // Update existing CloudBase user with latest info
      await updateCloudBaseUser(user.id, {
        full_name: nickname || user.full_name,
        avatar_url: wechatUser.headimgurl || user.avatar_url || null,
        provider: 'wechat',
        provider_id: openid,
        wechat_openid: openid,
        wechat_unionid: unionid || user.wechat_unionid || null,
        status: 'online',
        updated_at: new Date().toISOString(),
      })
      user = (await getUserById(user.id)) || user
      console.log('[WECHAT OAUTH] Updated CloudBase user:', user.id)
    }

    const sessionToken = createCloudBaseSession(user, {
      provider: 'wechat',
      provider_id: openid,
    })

    const redirectUrl = new URL(`${FRONTEND_URL}/login`)
    redirectUrl.searchParams.set('oauth', 'success')
    redirectUrl.searchParams.set('provider', 'wechat')
    redirectUrl.searchParams.set('token', sessionToken)
    redirectUrl.searchParams.set('user', JSON.stringify(user))

    const response = NextResponse.redirect(redirectUrl.toString())
    setCloudBaseSessionCookie(response, sessionToken)

    return response
  } catch (error) {
    console.error('WeChat OAuth callback error:', error)
    return NextResponse.redirect(`${FRONTEND_URL}/login?error=oauth_callback_failed`)
  }
}

