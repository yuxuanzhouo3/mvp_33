import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { IS_DOMESTIC_VERSION } from '@/config';
import { isChinaRegion } from '@/lib/config/region';
import { smsVerificationCodeService } from '@/lib/email/verification-code-service';
import { getCloudBaseDb } from '@/lib/cloudbase/client';
import { createCloudBaseSession, setCloudBaseSessionCookie } from '@/lib/cloudbase/auth';
import { updateUser as updateCloudBaseUser } from '@/lib/database/cloudbase/users';
import { User } from '@/lib/types';
import { recordDevice } from '@/lib/database/devices';
import { buildDeviceFingerprint, parseDeviceInfo, getClientIP, getLocationFromIP } from '@/lib/utils/device-parser';
import { applyInviteSignupFromRequest, handleInviteProgramLogin } from '@/lib/market/invite-program';

const WORKSPACE_ID = '7746c6e86994694300e707d4734fa1ad';

const schema = z
  .object({
    phone: z.string().regex(/^1\d{10}$/, '手机号格式不正确'),
    code: z.string().length(6, '验证码必须是6位数字'),
  })
  .passthrough();

interface DeviceRequestPayload {
  deviceModel?: string;
  deviceBrand?: string;
  deviceFingerprint?: string;
  clientType?: string;
  deviceCategory?: string;
}

function extractDevicePayload(body: any): DeviceRequestPayload {
  return {
    deviceModel: typeof body?.deviceModel === 'string' ? body.deviceModel : undefined,
    deviceBrand: typeof body?.deviceBrand === 'string' ? body.deviceBrand : undefined,
    deviceFingerprint: typeof body?.deviceFingerprint === 'string' ? body.deviceFingerprint : undefined,
    clientType: typeof body?.clientType === 'string' ? body.clientType : undefined,
    deviceCategory: typeof body?.deviceCategory === 'string' ? body.deviceCategory : undefined,
  };
}

const normalizeCloudBaseUser = (userData: any): User => ({
  id: userData.id || userData._id,
  email: userData.email,
  username: userData.username || userData.email?.split('@')[0] || '',
  full_name: userData.full_name || userData.name || '',
  avatar_url: userData.avatar_url || null,
  auth_email: userData.auth_email || null,
  provider: userData.provider || null,
  provider_id: userData.provider_id || null,
  wechat_openid: userData.wechat_openid || null,
  wechat_unionid: userData.wechat_unionid || null,
  phone: userData.phone || undefined,
  department: userData.department || undefined,
  title: userData.title || undefined,
  status: userData.status || 'offline',
  status_message: userData.status_message || undefined,
  region: userData.region || 'cn',
  country: userData.country || null,
  subscription_type: userData.subscription_type || null,
  subscription_expires_at: userData.subscription_expires_at || null,
  last_seen_at: userData.last_seen_at || undefined,
  created_at: userData.created_at || new Date().toISOString(),
  updated_at: userData.updated_at || new Date().toISOString(),
});

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

    const { phone, code } = validationResult.data;
    const devicePayload = extractDevicePayload(body);

    const verifyResult = await smsVerificationCodeService.verifyCode(phone, code);
    if (!verifyResult.success) {
      return NextResponse.json(
        { error: verifyResult.error || '验证码验证失败' },
        { status: 400 }
      );
    }

    const db = getCloudBaseDb();
    if (!db) {
      return NextResponse.json({ error: '服务器配置错误' }, { status: 500 });
    }

    const now = new Date().toISOString();
    const existing = await db
      .collection('users')
      .where({ phone })
      .limit(1)
      .get();

    let responseUser: User | null = null;
    let userId: string | null = null;

    if (existing.data && existing.data.length > 0) {
      const record = existing.data[0];
      userId = record.id || record._id;

      if (record.id) {
        try {
          responseUser = await updateCloudBaseUser(record.id, {
            status: 'online',
            last_seen_at: now,
          });
        } catch (statusError: any) {
          console.warn('[SMS VERIFY] Failed to update status:', statusError?.message || statusError);
          responseUser = normalizeCloudBaseUser({
            ...record,
            status: 'online',
            last_seen_at: now,
            updated_at: now,
          });
        }
      } else {
        try {
          await db.collection('users').doc(record._id).update({
            id: userId,
            status: 'online',
            last_seen_at: now,
            updated_at: now,
          });
        } catch (updateError) {
          console.warn('[SMS VERIFY] Failed to backfill user id:', updateError);
        }
        responseUser = normalizeCloudBaseUser({
          ...record,
          id: userId,
          status: 'online',
          last_seen_at: now,
          updated_at: now,
        });
      }
    } else {
      userId = uuidv4();
      const email = `phone_${phone}@sms.user`;
      const username = `user_${phone.slice(-4)}`;
      const userData = {
        id: userId,
        email,
        username,
        full_name: username,
        avatar_url: null,
        provider: 'sms',
        provider_id: phone,
        phone,
        status: 'online',
        region: 'cn',
        country: 'CN',
        created_at: now,
        updated_at: now,
      };

      await db.collection('users').add(userData);

      try {
        await db.collection('workspace_members').add({
          workspace_id: WORKSPACE_ID,
          user_id: userId,
          role: 'member',
          joined_at: now,
        });
      } catch (workspaceError) {
        console.error('[SMS VERIFY] Failed to add user to workspace:', workspaceError);
      }

      responseUser = normalizeCloudBaseUser(userData);
    }

    if (!responseUser || !userId) {
      return NextResponse.json({ error: '登录失败' }, { status: 500 });
    }

    // Never expose password hash if present.
    if ((responseUser as any).password_hash) {
      delete (responseUser as any).password_hash;
    }

    const token = createCloudBaseSession(responseUser, {
      provider: 'sms',
      provider_id: phone,
    });

    // Record device
    try {
      const userAgent = request.headers.get('user-agent') || '';
      const deviceInfo = parseDeviceInfo(
        userAgent,
        devicePayload.deviceModel,
        devicePayload.deviceBrand,
        devicePayload.clientType,
        devicePayload.deviceCategory
      );
      const ip = getClientIP(request);
      const location = await getLocationFromIP(ip);
      const deviceFingerprint = buildDeviceFingerprint({
        explicitFingerprint: devicePayload.deviceFingerprint,
        userAgent,
        clientType: deviceInfo.clientType,
        deviceCategory: deviceInfo.deviceCategory,
        deviceModel: deviceInfo.deviceModel,
        deviceBrand: deviceInfo.deviceBrand,
        os: deviceInfo.os,
        browser: deviceInfo.browser,
      });

      await recordDevice({
        user_id: userId,
        device_name: deviceInfo.deviceName,
        device_type: deviceInfo.deviceType,
        device_category: deviceInfo.deviceCategory,
        client_type: deviceInfo.clientType,
        device_model: deviceInfo.deviceModel,
        device_brand: deviceInfo.deviceBrand,
        device_fingerprint: deviceFingerprint,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        ip_address: ip,
        location: location,
        session_token: token,
      });
    } catch (deviceError) {
      console.warn('[SMS VERIFY] Device record failed:', deviceError);
    }

    try {
      await applyInviteSignupFromRequest({
        request,
        invitedUserId: responseUser.id,
        invitedEmail: responseUser.email,
      });
    } catch (bindError) {
      console.warn('[SMS VERIFY] Referral binding skipped:', bindError);
    }

    try {
      await handleInviteProgramLogin({
        userId: responseUser.id,
        source: 'auth.sms_verify',
      });
    } catch (inviteError) {
      console.warn('[SMS VERIFY] Invite program login processing skipped:', inviteError);
    }

    const response = NextResponse.json({
      success: true,
      user: responseUser,
      token,
    });

    setCloudBaseSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error('[sms-verify] error:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
