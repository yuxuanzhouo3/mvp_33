import { NextRequest, NextResponse } from 'next/server'

// WeChat OAuth configuration
const WECHAT_APP_ID = process.env.WECHAT_APP_ID || ''
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET || ''
const WECHAT_REDIRECT_URI = process.env.WECHAT_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/auth/oauth/wechat/callback`

/**
 * Initiate WeChat OAuth flow
 * GET /api/auth/oauth/wechat
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const action = searchParams.get('action') || 'login' // 'login' or 'register'

    // Generate state for CSRF protection
    const state = `${action}_${Date.now()}_${Math.random().toString(36).substring(7)}`
    
    // Build WeChat OAuth URL using open.weixin.qq.com
    // For website applications, use qrconnect for QR code login
    // For web applications in WeChat browser, use oauth2/authorize
    // We'll use qrconnect which provides a standard login interface on open.weixin.qq.com
    const wechatAuthUrl = new URL('https://open.weixin.qq.com/connect/qrconnect')
    wechatAuthUrl.searchParams.set('appid', WECHAT_APP_ID)
    wechatAuthUrl.searchParams.set('redirect_uri', encodeURIComponent(WECHAT_REDIRECT_URI))
    wechatAuthUrl.searchParams.set('response_type', 'code')
    wechatAuthUrl.searchParams.set('scope', 'snsapi_login') // For website login
    wechatAuthUrl.searchParams.set('state', state)

    // Redirect to WeChat OAuth on open.weixin.qq.com
    return NextResponse.redirect(wechatAuthUrl.toString() + '#wechat_redirect')
  } catch (error) {
    console.error('WeChat OAuth initiation error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate WeChat OAuth' },
      { status: 500 }
    )
  }
}

