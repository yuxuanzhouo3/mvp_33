import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import type { AssetRegenerateRequest } from '@/lib/admin/types'
import { regenerateFromAsset } from '@/lib/admin/ai/orchestrator'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAdminSession()
    const { id } = await context.params
    const body = await request.json() as AssetRegenerateRequest

    if (!body?.supplemental_prompt) {
      return NextResponse.json({ success: false, error: 'supplemental_prompt is required' }, { status: 400 })
    }

    const job = await regenerateFromAsset(id, { asset_id: id, supplemental_prompt: body.supplemental_prompt }, session.adminId)
    return NextResponse.json({ success: true, jobId: job.id, job })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to regenerate AI asset' }, { status: 500 })
  }
}