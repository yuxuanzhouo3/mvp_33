import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import type { AiMarketingProfile } from '@/lib/admin/types'
import { getDatabaseAdapter } from '@/lib/admin/database'
import { getDefaultMarketingProfile, sanitizeMarketingProfile } from '@/lib/admin/ai/marketing-profile'

export const runtime = 'nodejs'

export async function GET() {
  try {
    await requireAdminSession()
    const adapter = getDatabaseAdapter()
    const stored = await adapter.getConfig('ai_studio_marketing_profile')

    if (!stored) {
      return NextResponse.json({
        success: true,
        profile: getDefaultMarketingProfile(),
      })
    }

    const profile = sanitizeMarketingProfile(stored, { allowEmpty: true })
    return NextResponse.json({ success: true, profile })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to load marketing profile' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdminSession()
    const adapter = getDatabaseAdapter()
    const body = await request.json() as AiMarketingProfile
    const profile = sanitizeMarketingProfile(body, { allowEmpty: true })

    await adapter.setConfig(
      'ai_studio_marketing_profile',
      profile,
      'ai',
      'AI 创意中心宣传配置',
    )

    return NextResponse.json({ success: true, profile })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update marketing profile' }, { status: 500 })
  }
}
