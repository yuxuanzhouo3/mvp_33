import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import type { PosterGenerationRequest } from '@/lib/admin/types'
import { generatePosterPromptBundle } from '@/lib/admin/ai/orchestrator'
import { resolveAiRegion } from '@/lib/admin/ai/provider-router'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession()
    const body = await request.json() as PosterGenerationRequest

    if (!body?.poster_goal || !body?.audience || !body?.style || !body?.aspect_ratio || !body?.title || !body?.cta) {
      return NextResponse.json({ success: false, error: 'poster_goal, audience, style, aspect_ratio, title, cta are required' }, { status: 400 })
    }

    const promptBundle = await generatePosterPromptBundle(body, resolveAiRegion())
    return NextResponse.json({ success: true, prompt_bundle: promptBundle })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to generate poster prompt' }, { status: 500 })
  }
}
