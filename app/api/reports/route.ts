/**
 * Reports API
 * 举报 API
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserService } from '@/lib/services'
import { IS_DOMESTIC_VERSION } from '@/config'
import { createClient } from '@/lib/supabase/server'
import { verifyCloudBaseSession } from '@/lib/cloudbase/auth'
import { ReportType } from '@/lib/interfaces/types'

/**
 * 获取用户提交的举报列表
 * GET /api/reports
 */
export async function GET(request: NextRequest) {
  try {
    let currentUser: { id: string } | null = null

    if (IS_DOMESTIC_VERSION) {
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (!cloudBaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUser = cloudBaseUser
    } else {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUser = user
    }

    const userService = getUserService()
    const reports = await userService.getReportsByReporter(currentUser.id)

    return NextResponse.json({
      success: true,
      reports,
    })
  } catch (error: any) {
    console.error('Get reports error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get reports' },
      { status: 500 }
    )
  }
}

/**
 * 提交举报
 * POST /api/reports
 * Body: { reported_user_id: string, type: ReportType, description?: string }
 */
export async function POST(request: NextRequest) {
  try {
    let currentUser: { id: string } | null = null

    if (IS_DOMESTIC_VERSION) {
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (!cloudBaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUser = cloudBaseUser
    } else {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUser = user
    }

    const body = await request.json()
    const { reported_user_id, type, description } = body

    if (!reported_user_id) {
      return NextResponse.json(
        { error: 'reported_user_id is required' },
        { status: 400 }
      )
    }

    if (!type) {
      return NextResponse.json(
        { error: 'type is required' },
        { status: 400 }
      )
    }

    const validTypes: ReportType[] = ['spam', 'harassment', 'inappropriate', 'other']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // 不能举报自己
    if (reported_user_id === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot report yourself' },
        { status: 400 }
      )
    }

    const userService = getUserService()
    const report = await userService.reportUser(currentUser.id, {
      reported_user_id,
      type,
      description,
    })

    return NextResponse.json({
      success: true,
      report,
    })
  } catch (error: any) {
    console.error('Report user error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to report user' },
      { status: 500 }
    )
  }
}
