import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { isChinaRegion } from '@/lib/config/region';
import { getCloudBaseDb } from '@/lib/cloudbase/client';
import { verificationCodeService } from '@/lib/email/verification-code-service';

const schema = z.object({
  email: z.string().email('邮箱格式不正确'),
  code: z.string().length(6, '验证码必须是6位数字'),
});

export async function POST(request: NextRequest) {
  try {
    console.log('[verify-reset-code] 收到验证验证码请求');

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

    const { email, code } = validationResult.data;

    // 验证验证码
    const result = await verificationCodeService.verifyCode(email, code, 'reset_password');

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // 生成重置token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = await bcrypt.hash(resetToken, 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5分钟有效期

    const db = getCloudBaseDb();
    if (!db) {
      return NextResponse.json({ error: '服务器配置错误' }, { status: 500 });
    }

    // 存储重置token
    try {
      await db.collection('password_reset_tokens').add({
        email,
        token: hashedToken,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        used: false,
      });
    } catch (dbError: any) {
      console.error('[verify-reset-code] 存储token失败:', dbError?.message || dbError);
      return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
    }

    console.log('[verify-reset-code] 验证码验证成功，token已生成');

    return NextResponse.json({ resetToken });
  } catch (error: any) {
    console.error('[verify-reset-code] 异常:', error?.message || error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
