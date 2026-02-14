/**
 * 加密工具模块
 *
 * 提供 HMAC 签名和验证功能
 * 使用 Node.js 内置的 crypto 模块，无需额外依赖
 */

import { createHmac, timingSafeEqual } from "crypto";

// ==================== 常量定义 ====================

/**
 * 签名算法
 * 使用 SHA-256 提供 256 位的签名强度
 */
const SIGNATURE_ALGORITHM = "sha256";

/**
 * 签名编码格式
 */
const SIGNATURE_ENCODING = "hex" as const;

// ==================== 签名功能 ====================

/**
 * 创建 HMAC 签名
 *
 * HMAC (Hash-based Message Authentication Code) 是一种基于哈希函数的消息认证码
 * 它结合了密钥和消息，生成一个固定长度的签名
 *
 * @param data - 需要签名的数据
 * @param secret - 密钥
 * @returns 签名字符串（hex 格式）
 */
export function sign(data: string, secret: string): string {
  const hmac = createHmac(SIGNATURE_ALGORITHM, secret);
  hmac.update(data);
  return hmac.digest(SIGNATURE_ENCODING);
}

/**
 * 验证 HMAC 签名
 *
 * 使用 timingSafeEqual 防止时序攻击
 * 时序攻击是一种通过测量比较操作的时间差异来推断信息的攻击方式
 *
 * @param data - 原始数据
 * @param signature - 签名
 * @param secret - 密钥
 * @returns 签名是否有效
 */
export function verify(data: string, signature: string, secret: string): boolean {
  const expectedSignature = sign(data, secret);

  // 使用 timingSafeEqual 防止时序攻击
  // timingSafeEqual 要求两个 Buffer 长度相同，所以先检查长度
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  try {
    return timingSafeEqual(
      Buffer.from(signature, SIGNATURE_ENCODING),
      Buffer.from(expectedSignature, SIGNATURE_ENCODING)
    );
  } catch {
    return false;
  }
}

// ==================== 工具函数 ====================

/**
 * 生成随机字符串
 *
 * @param length - 字符串长度
 * @returns 随机字符串
 */
export function generateRandomString(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }

  return result;
}

/**
 * 生成安全的随机密钥
 *
 * @param bytes - 字节数（默认 32 字节 = 256 位）
 * @returns hex 格式的密钥
 */
export function generateSecretKey(bytes: number = 32): string {
  const { randomBytes } = require("crypto");
  return randomBytes(bytes).toString("hex");
}
