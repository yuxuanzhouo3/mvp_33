/**
 * Blocked Users API
 * 拉黑用户 API
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserService } from '@/lib/services'
import { IS_DOMESTIC_VERSION } from '@/config'
import { createClient } from '@/lib/supabase/server'
import { verifyCloudBaseSession } from '@/lib/cloudbase/auth'

/**
 * 获取拉黑列表
 * GET /api/blocked-users
 * Query params:
 *   - checkUserId: 可选，检查与指定用户的屏蔽关系
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

    const { searchParams } = new URL(request.url)
    const checkUserId = searchParams.get('checkUserId')

    const userService = getUserService()

    // 如果指定了 checkUserId，检查与该用户的屏蔽关系
    if (checkUserId) {
      const isBlocked = await userService.checkBlockRelation(currentUser.id, checkUserId)
      console.log('[GET /api/blocked-users] Check block relation:', {
        currentUserId: currentUser.id,
        checkUserId,
        isBlocked,
      })
      return NextResponse.json({
        success: true,
        isBlocked,
      })
    }

    const blockedUsers = await userService.getBlockedUsers(currentUser.id)

    // 获取被拉黑用户的详细信息
    if (blockedUsers.length > 0) {
      const blockedUserIds = blockedUsers.map(bu => bu.blocked_id)
      const blockedUserInfos = await userService.getUsersByIds(blockedUserIds)

      // 创建用户ID到用户信息的映射
      const userInfoMap = new Map(blockedUserInfos.map(u => [u.id, u]))

      // 将用户信息添加到拉黑记录中
      const blockedUsersWithInfo = blockedUsers.map(bu => ({
        ...bu,
        blocked_user: userInfoMap.get(bu.blocked_id) ? {
          id: userInfoMap.get(bu.blocked_id)!.id,
          username: userInfoMap.get(bu.blocked_id)!.username,
          full_name: userInfoMap.get(bu.blocked_id)!.full_name,
          avatar_url: userInfoMap.get(bu.blocked_id)!.avatar_url,
        } : null
      }))

      return NextResponse.json({
        success: true,
        blockedUsers: blockedUsersWithInfo,
      })
    }

    return NextResponse.json({
      success: true,
      blockedUsers,
    })
  } catch (error: any) {
    console.error('Get blocked users error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get blocked users' },
      { status: 500 }
    )
  }
}

/**
 * 拉黑用户
 * POST /api/blocked-users
 * Body: { blocked_user_id: string, reason?: string }
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
    const { blocked_user_id, reason } = body

    if (!blocked_user_id) {
      return NextResponse.json(
        { error: 'blocked_user_id is required' },
        { status: 400 }
      )
    }

    // 不能拉黑自己
    if (blocked_user_id === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot block yourself' },
        { status: 400 }
      )
    }

    const userService = getUserService()
    const blockedUser = await userService.blockUser(currentUser.id, {
      blocked_user_id,
      reason,
    })

    return NextResponse.json({
      success: true,
      blockedUser,
    })
  } catch (error: any) {
    console.error('Block user error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to block user' },
      { status: 500 }
    )
  }
}

/**
 * 取消拉黑
 * DELETE /api/blocked-users?userId=xxx
 */
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const blockedUserId = searchParams.get('userId')

    console.log('[DELETE /api/blocked-users] Request params:', {
      currentUserId: currentUser.id,
      blockedUserId,
    })

    if (!blockedUserId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      )
    }

    const userService = getUserService()

    // 先检查是否存在拉黑记录
    const isBlocked = await userService.checkBlockRelation(currentUser.id, blockedUserId)
    console.log('[DELETE /api/blocked-users] Block relation before unblock:', isBlocked)

    await userService.unblockUser(currentUser.id, blockedUserId)

    // 验证是否删除成功
    const stillBlocked = await userService.checkBlockRelation(currentUser.id, blockedUserId)
    console.log('[DELETE /api/blocked-users] Block relation after unblock:', stillBlocked)

    return NextResponse.json({
      success: true,
      wasBlocked: isBlocked,
      stillBlocked: stillBlocked,
    })
  } catch (error: any) {
    console.error('Unblock user error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to unblock user' },
      { status: 500 }
    )
  }
}
