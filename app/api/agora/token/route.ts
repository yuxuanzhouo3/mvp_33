import { NextRequest, NextResponse } from 'next/server'
import { RtcTokenBuilder, RtcRole } from 'agora-token'

export async function POST(request: NextRequest) {
  try {
    const { channelName, uid } = await request.json()
    
    const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID || process.env.AGORA_APP_ID
    const appCertificate = process.env.AGORA_APP_CERTIFICATE
    
    if (!appId || !appCertificate) {
      return NextResponse.json(
        { error: 'Agora App ID or Certificate not configured' },
        { status: 500 }
      )
    }
    
    const expirationTimeInSeconds = 3600 // 1小时
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const tokenExpire = currentTimestamp + expirationTimeInSeconds
    const privilegeExpire = currentTimestamp + expirationTimeInSeconds
    
    // 生成 Token
    // buildTokenWithUid 需要 7 个参数：appId, appCertificate, channelName, uid, role, tokenExpire, privilegeExpire
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      Number(uid) || 0,
      RtcRole.PUBLISHER,
      tokenExpire,
      privilegeExpire
    )
    
    return NextResponse.json({ success: true, token })
  } catch (error: any) {
    console.error('Failed to generate Agora token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate token' },
      { status: 500 }
    )
  }
}

