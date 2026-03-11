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

function isRealSmsEnabled(): boolean {
  return (process.env.ENABLE_REAL_SMS || '').toLowerCase() === 'true';
}

async function sendTencentSms(phone: string, code: string) {
  const secretId = process.env.TENCENT_SMS_SECRET_ID || '';
  const secretKey = process.env.TENCENT_SMS_SECRET_KEY || '';
  const smsSdkAppId = process.env.TENCENT_SMS_APP_ID || '';
  const signName = process.env.TENCENT_SMS_SIGN_NAME || '';
  const templateId = process.env.TENCENT_SMS_TEMPLATE_ID || '';

  const tencentcloud: any = await import('tencentcloud-sdk-nodejs');
  const SmsClient = tencentcloud.sms.v20210111.Client;

  const client = new SmsClient({
    credential: {
      secretId,
      secretKey,
    },
    region: 'ap-guangzhou',
    profile: {
      httpProfile: {
        endpoint: 'sms.tencentcloudapi.com',
      },
    },
  });

  const params = {
    PhoneNumberSet: [`+86${phone}`],
    SmsSdkAppId: smsSdkAppId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: [code],
  };

  const response = await client.SendSms(params);
  console.log('[SMS] Tencent SendSms response:', JSON.stringify(response));

  const status = response?.SendStatusSet?.[0];
  if (!status || status.Code !== 'Ok') {
    console.error('[SMS] Tencent SendSms failed:', JSON.stringify({
      Code: status?.Code,
      Message: status?.Message,
      Response: response,
    }));
    throw new Error(status?.Message || '短信发送失败');
  }

  return response;
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
    const enableRealSms = isRealSmsEnabled();

    // MOCK MODE (for testing only). Remove this block when real SMS is fully enabled.
    if (!enableRealSms) {
      console.log(`[SMS] Mock code for ${phone}: ${code}`);
      return NextResponse.json({ message: '验证码已发送' });
    }

    if (!isSmsConfigured()) {
      console.warn('[SMS] Tencent SMS config missing, skipping send');
      return NextResponse.json({ error: '短信服务未配置' }, { status: 500 });
    }

    try {
      await sendTencentSms(phone, code);
      return NextResponse.json({ message: '验证码已发送' });
    } catch (error: any) {
      console.error('[SMS] Tencent SendSms error:', JSON.stringify({
        Code: error?.code,
        Message: error?.message,
        Response: error?.response,
        Error: error,
      }));
      return NextResponse.json({ error: '短信发送失败' }, { status: 500 });
    }
  } catch (error) {
    console.error('[sms-send] error:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
