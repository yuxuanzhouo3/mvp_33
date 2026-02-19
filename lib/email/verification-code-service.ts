import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getCloudBaseDb } from '@/lib/cloudbase/client';

const EMAIL_VERIFICATION_CODES = 'email_verification_codes';

interface EmailVerificationCode {
  _id?: string;
  email: string;
  code: string;
  type: 'register' | 'reset_password';
  attempts: number;
  ip_address?: string;
  created_at: string;
  expires_at: string;
  verified: boolean;
  verified_at?: string;
}

export class VerificationCodeService {
  generateCode(): string {
    return crypto.randomInt(100000, 999999).toString();
  }

  async createCode(
    email: string,
    type: 'register' | 'reset_password',
    ipAddress?: string
  ): Promise<{ success: boolean; code?: string; error?: string }> {
    try {
      const rateLimit = await this.checkRateLimit(email, type);
      if (!rateLimit.allowed) {
        return { success: false, error: rateLimit.error };
      }

      const code = this.generateCode();
      const hashedCode = await bcrypt.hash(code, 10);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

      const db = getCloudBaseDb();
      if (!db) {
        console.error('[VerificationCodeService] CloudBase 数据库未初始化');
        return { success: false, error: '服务器配置错误' };
      }

      await db.collection(EMAIL_VERIFICATION_CODES).add({
        email,
        code: hashedCode,
        type,
        attempts: 0,
        ip_address: ipAddress,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        verified: false,
      });

      return { success: true, code };
    } catch (error) {
      console.error('[VerificationCodeService] 创建验证码失败:', error);
      return { success: false, error: '创建验证码失败' };
    }
  }

  async verifyCode(
    email: string,
    code: string,
    type: 'register' | 'reset_password'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const db = getCloudBaseDb();
      if (!db) {
        console.error('[VerificationCodeService] CloudBase 数据库未初始化');
        return { success: false, error: '服务器配置错误' };
      }

      const now = new Date().toISOString();

      const result = await db
        .collection(EMAIL_VERIFICATION_CODES)
        .where({
          email,
          type,
          verified: false,
          expires_at: db.command.gte(now),
        })
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();

      if (!result.data || result.data.length === 0) {
        return { success: false, error: '验证码不存在或已过期' };
      }

      const record = result.data[0] as EmailVerificationCode;

      if (record.attempts >= 5) {
        return { success: false, error: '验证码尝试次数过多，请重新获取' };
      }

      const isValid = await bcrypt.compare(code, record.code);

      await db
        .collection(EMAIL_VERIFICATION_CODES)
        .doc(record._id!)
        .update({
          attempts: record.attempts + 1,
        });

      if (!isValid) {
        return { success: false, error: '验证码错误' };
      }

      await db
        .collection(EMAIL_VERIFICATION_CODES)
        .doc(record._id!)
        .update({
          verified: true,
          verified_at: new Date().toISOString(),
        });

      return { success: true };
    } catch (error) {
      console.error('[VerificationCodeService] 验证验证码失败:', error);
      return { success: false, error: '验证失败' };
    }
  }

  private async checkRateLimit(
    email: string,
    type: 'register' | 'reset_password'
  ): Promise<{ allowed: boolean; error?: string }> {
    try {
      const db = getCloudBaseDb();
      if (!db) {
        console.error('[VerificationCodeService] CloudBase 数据库未初始化');
        return { allowed: false, error: '服务器配置错误' };
      }

      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();

      const result = await db
        .collection(EMAIL_VERIFICATION_CODES)
        .where({
          email,
          type,
          created_at: db.command.gte(oneMinuteAgo),
        })
        .get();

      if (result.data && result.data.length > 0) {
        return { allowed: false, error: '发送过于频繁，请60秒后再试' };
      }

      return { allowed: true };
    } catch (error) {
      console.error('[VerificationCodeService] 检查频率限制失败:', error);
      return { allowed: false, error: '检查频率限制失败' };
    }
  }
}

export const verificationCodeService = new VerificationCodeService();
