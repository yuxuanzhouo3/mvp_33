import { NextRequest, NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import type { RepoAnalysisRequest } from '@/lib/admin/types'
import { createRepoAnalysisJob } from '@/lib/admin/ai/orchestrator'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminSession()
    const body = await request.json() as RepoAnalysisRequest

    if (!body?.language) {
      return NextResponse.json({ success: false, error: 'language is required' }, { status: 400 })
    }

    const job = await createRepoAnalysisJob(body, session.adminId)
    return NextResponse.json({ success: true, jobId: job.id, job })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to create repo analysis job' }, { status: 500 })
  }
}
