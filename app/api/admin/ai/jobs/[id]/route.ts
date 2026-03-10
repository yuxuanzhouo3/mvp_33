import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import { getAiJob, processAiJob } from '@/lib/admin/ai/orchestrator'

export const runtime = 'nodejs'

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession()
    const { id } = await context.params
    const current = await getAiJob(id)
    const result = current.job.status === 'queued' || current.job.status === 'in_progress'
      ? await processAiJob(id)
      : current

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to get AI job' }, { status: 500 })
  }
}