import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { isChinaRegion } from '@/lib/config/region';
import { getCloudBaseDb } from '@/lib/cloudbase/client';

const schema = z.object({
  email: z.string().email('邮箱格式不正确'),
  resetToken: z.string().min(1, '重置令牌不能为空'),
  password: z.string().min(6, '密码至少需要6个字符'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword'],
});

export async function POST(request: NextRequest) {
  try {
    console.log('[reset-password] 收到重置密码请求');

    const isChina = isChinaRegion();
    if (!isChina) {
      return NextResponse.json({ error: '当前区域不支持' }, { status: 400 });
    }

    const body = await request.json();
    const validationResult = schema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0]?.message || '输入格式不正确' },
        { status: 400 }
      );
    }

    const { email, resetToken, password } = validationResult.data;

    const db = getCloudBaseDb();
    if (!db) {
      return NextResponse.json({ error: '服务器配置错误' }, { status: 500 });
    }

    const now = new Date().toISOString();

    // 查找有效的重置token
    let result;
    try {
      result = await db
        .collection('password_reset_tokens')
        .where({
          email,
          used: false,
          expires_at: db.command.gte(now),
        })
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();
    } catch (queryError: any) {
      console.error('[reset-password] 查询token失败:', queryError?.message || queryError);
      return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
    }

    if (!result.data || result.data.length === 0) {
      return NextResponse.json({ error: '重置令牌无效或已过期' }, { status: 400 });
    }

    const tokenRecord = result.data[0];
    const isValid = await bcrypt.compare(resetToken, tokenRecord.token);

    if (!isValid) {
      return NextResponse.json({ error: '重置令牌无效' }, { status: 400 });
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 更新用户密码
    // 先找到用户文档
    let userResult;
    try {
      userResult = await db
        .collection('users')
        .where({ email })
        .limit(1)
        .get();
    } catch (userQueryError: any) {
      console.error('[reset-password] 查询用户失败:', userQueryError?.message || userQueryError);
      return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
    }

    if (!userResult.data || userResult.data.length === 0) {
      return NextResponse.json({ error: '用户不存在' }, { status: 400 });
    }

    const userDocId = userResult.data[0]._id;

    try {
      await db
        .collection('users')
        .doc(userDocId)
        .update({
          password_hash: hashedPassword,
          updated_at: now,
        });
    } catch (updateError: any) {
      console.error('[reset-password] 更新密码失败:', updateError?.message || updateError);
      return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
    }

    // 标记token已使用
    try {
      await db
        .collection('password_reset_tokens')
        .doc(tokenRecord._id)
        .update({
          used: true,
        });
    } catch (tokenUpdateError: any) {
      console.error('[reset-password] 更新token状态失败:', tokenUpdateError?.message || tokenUpdateError);
      // 密码已经更新了，返回成功
    }

    console.log('[reset-password] 密码重置成功');

    return NextResponse.json({ message: '密码重置成功' });
  } catch (error: any) {
    console.error('[reset-password] 异常:', error?.message || error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
