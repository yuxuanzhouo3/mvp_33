import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { IS_DOMESTIC_VERSION } from '@/config';
import { isChinaRegion } from '@/lib/config/region';
import { smsVerificationCodeService } from '@/lib/email/verification-code-service';

const schema = z.object({
  phone: z.string().regex(/^1\d{10}$/, '手机号格式不正确'),
});

function isSmsConfigured(): boolean {
  return Boolean(
    process.env.TENCENT_SMS_SECRET_ID &&
      process.env.TENCENT_SMS_SECRET_KEY &&
      process.env.TENCENT_SMS_APP_ID &&
      process.env.TENCENT_SMS_SIGN_NAME &&
      process.env.TENCENT_SMS_TEMPLATE_ID
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!IS_DOMESTIC_VERSION || !isChinaRegion()) {
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

    const { phone } = validationResult.data;
    const clientIP = request.headers.get('x-forwarded-for') || undefined;

    const result = await smsVerificationCodeService.createCode(phone, clientIP);
    if (!result.success) {
      return NextResponse.json({ error: result.error || '验证码发送失败' }, { status: 400 });
    }

    const code = result.code || '';
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      console.log(`[SMS] Dev mock code for ${phone}: ${code}`);
      return NextResponse.json({ message: '验证码已发送' });
    }

    if (!isSmsConfigured()) {
      console.warn('[SMS] Tencent SMS config missing, skipping send');
      return NextResponse.json({ error: '短信服务未配置' }, { status: 500 });
    }

    // TODO: integrate Tencent SMS
    console.warn('[SMS] Tencent SMS integration placeholder - not implemented yet');

    return NextResponse.json({ message: '验证码已发送' });
  } catch (error) {
    console.error('[sms-send] error:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
