/**
 * 管理员会话验证 API
 *
 * 用于检查当前用户是否已登录管理后台
 */

import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin/session';

export async function GET() {
  try {
    const result = await getAdminSession();

    if (result.valid && result.session) {
      // 会话有效，返回 200
      return NextResponse.json({
        success: true,
        session: {
          username: result.session.username,
          role: result.session.role,
        },
      });
    }

    // 会话无效，返回 401
    return NextResponse.json(
      { success: false, error: result.error || '未登录' },
      { status: 401 }
    );
  } catch (error) {
    console.error('检查管理员会话失败:', error);
    return NextResponse.json(
      { success: false, error: '验证失败' },
      { status: 500 }
    );
  }
}
