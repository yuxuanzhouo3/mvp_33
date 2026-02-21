/**
 * User Settings API
 * 用户设置 API - 隐私设置等
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserService } from '@/lib/services'
import { IS_DOMESTIC_VERSION } from '@/config'
import { createClient } from '@/lib/supabase/server'
import { verifyCloudBaseSession } from '@/lib/cloudbase/auth'

/**
 * 获取用户隐私设置
 * GET /api/user/settings
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
    const settings = await userService.getPrivacySettings(currentUser.id)

    return NextResponse.json({
      success: true,
      settings,
    })
  } catch (error: any) {
    console.error('Get user settings error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get settings' },
      { status: 500 }
    )
  }
}

/**
 * 更新用户隐私设置
 * PATCH /api/user/settings
 */
export async function PATCH(request: NextRequest) {
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
    const userService = getUserService()
    const settings = await userService.updatePrivacySettings(currentUser.id, body)

    return NextResponse.json({
      success: true,
      settings,
    })
  } catch (error: any) {
    console.error('Update user settings error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update settings' },
      { status: 500 }
    )
  }
}
