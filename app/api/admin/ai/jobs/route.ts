import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/admin/session'
import { listAiJobs } from '@/lib/admin/ai/orchestrator'

export const runtime = 'nodejs'

export async function GET() {
  try {
    await requireAdminSession()
    const jobs = await listAiJobs()
    return NextResponse.json({ success: true, jobs })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to list AI jobs' }, { status: 500 })
  }
}
