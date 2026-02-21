/**
 * 管理员举报管理 API
 *
 * GET: 获取所有举报列表（带分页和状态筛选）
 * PATCH: 更新举报状态（处理/驳回）
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/session'
import { getUserService } from '@/lib/services'

/**
 * 获取所有举报列表
 * GET /api/admin/reports?status=pending&page=1&limit=20
 */
export async function GET(request: NextRequest) {
  try {
    // 验证管理员会话
    const sessionResult = await getAdminSession()
    if (!sessionResult.valid || !sessionResult.session) {
      return NextResponse.json(
        { error: 'Unauthorized', details: sessionResult.error || '未登录' },
        { status: 401 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status') || undefined
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '20', 10)

    // 获取举报列表
    const userService = getUserService()
    const reports = await userService.getAllReports(status)

    // 简单的分页处理
    const offset = (page - 1) * limit
    const paginatedReports = reports.slice(offset, offset + limit)

    return NextResponse.json({
      success: true,
      data: {
        items: paginatedReports,
        total: reports.length,
        page,
        limit,
        totalPages: Math.ceil(reports.length / limit),
      },
    })
  } catch (error: any) {
    console.error('获取举报列表失败:', error)
    return NextResponse.json(
      { error: 'Failed to get reports', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * 更新举报状态
 * PATCH /api/admin/reports
 * Body: { reportId: string, status: 'resolved' | 'dismissed', adminNotes?: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    // 验证管理员会话
    const sessionResult = await getAdminSession()
    if (!sessionResult.valid || !sessionResult.session) {
      return NextResponse.json(
        { error: 'Unauthorized', details: sessionResult.error || '未登录' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { reportId, status, adminNotes } = body

    if (!reportId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: reportId, status' },
        { status: 400 }
      )
    }

    if (!['resolved', 'dismissed'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "resolved" or "dismissed"' },
        { status: 400 }
      )
    }

    // 更新举报状态
    const userService = getUserService()
    const adminId = sessionResult.session.username // 使用管理员用户名作为 ID

    const updatedReport = await userService.updateReport(reportId, adminId, {
      status,
      admin_notes: adminNotes,
    })

    return NextResponse.json({
      success: true,
      data: updatedReport,
    })
  } catch (error: any) {
    console.error('更新举报状态失败:', error)
    return NextResponse.json(
      { error: 'Failed to update report', details: error.message },
      { status: 500 }
    )
  }
}
