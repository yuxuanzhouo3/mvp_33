import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isChinaRegion } from '@/lib/config/region';
import { getCloudBaseDb } from '@/lib/cloudbase/client';
import { verificationCodeService } from '@/lib/email/verification-code-service';
import { emailService } from '@/lib/email/email-service';
import { getPasswordResetTemplate } from '@/lib/email/templates';

const schema = z.object({
  email: z.string().email('邮箱格式不正确'),
});

export async function POST(request: NextRequest) {
  try {
    console.log('[send-reset-code] 收到发送密码重置验证码请求');

    const isChina = isChinaRegion();
    console.log('[send-reset-code] isChinaRegion() 返回:', isChina);

    if (!isChina) {
      console.log('[send-reset-code] 非中国区，拒绝请求');
      return NextResponse.json({ error: '当前区域不支持' }, { status: 400 });
    }

    const body = await request.json();
    console.log('[send-reset-code] 请求体:', { email: body.email });

    const validationResult = schema.safeParse(body);

    if (!validationResult.success) {
      console.error('[send-reset-code] 验证失败:', validationResult.error.errors);
      return NextResponse.json(
        { error: validationResult.error.errors[0]?.message || '输入格式不正确' },
        { status: 400 }
      );
    }

    const { email } = validationResult.data;
    const clientIP = request.headers.get('x-forwarded-for') || undefined;
    console.log('[send-reset-code] 客户端 IP:', clientIP);

    const db = getCloudBaseDb();
    if (!db) {
      console.error('[send-reset-code] CloudBase 数据库未初始化');
      return NextResponse.json({ error: '服务器配置错误' }, { status: 500 });
    }

    // 检查用户是否存在
    const existingUser = await db
      .collection('users')
      .where({ email })
      .limit(1)
      .get();

    // 为了安全起见，不管用户是否存在都返回成功信息
    // 防止通过注册功能探测已注册用户
    if (!existingUser.data || existingUser.data.length === 0) {
      console.log('[send-reset-code] 用户不存在:', email);
      return NextResponse.json({ message: '如果该邮箱已注册，验证码将发送到邮箱' });
    }

    console.log('[send-reset-code] 开始创建验证码');
    const result = await verificationCodeService.createCode(email, 'reset_password', clientIP);

    if (!result.success) {
      console.error('[send-reset-code] 创建验证码失败:', result.error);
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    console.log('[send-reset-code] 验证码创建成功，准备发送邮件');
    console.log('[send-reset-code] 邮箱:', email);
    console.log('[send-reset-code] 验证码:', result.code);

    try {
      const emailHtml = getPasswordResetTemplate(result.code!);
      await emailService.sendEmail(email, '密码重置验证码', emailHtml);
      console.log('[send-reset-code] 邮件发送成功');
    } catch (emailError: any) {
      console.error('[send-reset-code] 邮件发送失败:', emailError?.message || emailError);
      // 邮件发送失败也返回成功，防止泄露邮箱是否存在
      return NextResponse.json({ message: '如果该邮箱已注册，验证码将发送到邮箱' });
    }

    return NextResponse.json({ message: '如果该邮箱已注册，验证码将发送到邮箱' });
  } catch (error: any) {
    console.error('[send-reset-code] 异常:', error?.message || error);
    console.error('[send-reset-code] 异常详情:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
