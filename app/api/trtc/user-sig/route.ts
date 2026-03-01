import { NextResponse } from 'next/server'
import { generateUserSig } from '@/lib/trtc/generate-user-sig'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('userId')

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  try {
    const userSig = generateUserSig(userId)
    const sdkAppId = Number.parseInt(process.env.TENCENT_TRTC_SDK_APP_ID || '0', 10)

    if (!sdkAppId) {
      throw new Error('Missing TRTC SDKAppID in environment variables')
    }

    return NextResponse.json({
      userSig,
      sdkAppId,
      userId,
    })
  } catch (error: any) {
    console.error('Error generating TRTC userSig:', error)
    return NextResponse.json({ error: error?.message || 'Failed to generate userSig' }, { status: 500 })
  }
}
