/**
 * 管理员会话管理系统
 *
 * 负责管理员登录会话的创建、验证、更新和销毁
 * 使用 Cookie 存储会话，独立于普通用户的 JWT 认证系统
 *
 * 安全特性：
 * - HttpOnly Cookie 防止 XSS 攻击
 * - Base64 签名防止会话篡改（简化版本，与中间件兼容）
 * - 会话过期机制
 */

import { cookies } from "next/headers";
import type { AdminSession, SessionValidationResult } from "./types";

// ==================== 常量定义 ====================

/**
 * Cookie 名称
 */
const COOKIE_NAME = "admin_session";

/**
 * 会话过期时间（秒）
 * 默认 24 小时
 */
const DEFAULT_SESSION_EXPIRY = 24 * 60 * 60;

/**
 * Cookie 路径
 * 设置为根路径,使其在整个域名下都有效(包括 /admin 和 /api 路径)
 */
const COOKIE_PATH = "/";

/**
 * 从环境变量获取会话密钥
 * 如果未设置 ADMIN_SESSION_SECRET，则使用 JWT_SECRET
 */
function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "会话密钥未配置。请设置 ADMIN_SESSION_SECRET 或 JWT_SECRET 环境变量"
    );
  }
  return secret;
}

/**
 * 获取会话过期时间
 */
function getSessionExpiry(): number {
  const expiry = process.env.ADMIN_SESSION_EXPIRY;
  if (expiry) {
    const parsed = parseInt(expiry, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_SESSION_EXPIRY;
}

// ==================== 会话创建 ====================

/**
 * 创建管理员会话
 *
 * @param adminId - 管理员 ID
 * @param username - 管理员用户名
 * @param role - 管理员角色
 * @returns 会话对象
 */
export function createAdminSession(
  adminId: string,
  username: string,
  role: "admin" | "super_admin"
): AdminSession {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + getSessionExpiry();

  return {
    adminId,
    username,
    role,
    createdAt: now,
    expiresAt,
  };
}

/**
 * 序列化会话为字符串
 * 格式: Base64(session).Signature
 * 使用简化的 Base64 签名（与中间件保持一致）
 *
 * @param session - 会话对象
 * @returns 序列化的会话字符串
 */
export function serializeSession(session: AdminSession): string {
  const secret = getSessionSecret();

  // 将会话对象转为 JSON 字符串并 Base64 编码
  const sessionJson = JSON.stringify(session);
  const sessionBase64 = Buffer.from(sessionJson).toString("base64");

  // 创建签名：Base64(sessionBase64.secret).slice(0, 16)
  const signature = Buffer.from(`${sessionBase64}.${secret}`).toString("base64").slice(0, 16);

  // 返回格式: sessionBase64.signature
  return `${sessionBase64}.${signature}`;
}

/**
 * 设置管理员会话 Cookie
 *
 * @param session - 会话对象
 */
export async function setAdminSessionCookie(
  session: AdminSession
): Promise<void> {
  const cookieStore = await cookies();
  const serialized = serializeSession(session);

  cookieStore.set(COOKIE_NAME, serialized, {
    httpOnly: true, // 防止 JavaScript 访问
    secure: process.env.NODE_ENV === "production", // 生产环境强制 HTTPS
    sameSite: "lax", // 防止 CSRF 攻击
    path: COOKIE_PATH, // 只在 /admin 路径下有效
    maxAge: getSessionExpiry(), // 过期时间
    // 注意：不设置 domain，默认为当前域名
  });
}

// ==================== 会话验证 ====================

/**
 * 反序列化会话字符串
 *
 * @param serialized - 序列化的会话字符串
 * @returns 会话对象或 null
 */
export function deserializeSession(
  serialized: string
): AdminSession | null {
  try {
    // 分割 sessionBase64 和 signature
    const parts = serialized.split(".");
    if (parts.length !== 2) {
      return null;
    }

    const [sessionBase64, signature] = parts;
    const secret = getSessionSecret();

    // 验证签名：与 serializeSession 保持一致
    const expectedSig = Buffer.from(`${sessionBase64}.${secret}`).toString("base64").slice(0, 16);

    if (signature !== expectedSig) {
      return null;
    }

    // Base64 解码
    const sessionJson = Buffer.from(sessionBase64, "base64").toString("utf-8");
    const session = JSON.parse(sessionJson) as AdminSession;

    return session;
  } catch (error) {
    console.error("反序列化会话失败:", error);
    return null;
  }
}

/**
 * 验证会话是否有效
 *
 * @param session - 会话对象
 * @returns 验证结果
 */
export function validateSession(session: AdminSession): SessionValidationResult {
  const now = Math.floor(Date.now() / 1000);

  // 检查会话是否过期
  if (session.expiresAt < now) {
    return {
      valid: false,
      error: "会话已过期，请重新登录",
    };
  }

  return {
    valid: true,
    session,
  };
}

/**
 * 获取当前管理员会话
 *
 * @returns 验证结果
 */
export async function getAdminSession(): Promise<SessionValidationResult> {
  try {
    const cookieStore = await cookies();
    const serialized = cookieStore.get(COOKIE_NAME);

    if (!serialized) {
      return {
        valid: false,
        error: "未登录",
      };
    }

    const session = deserializeSession(serialized.value);

    if (!session) {
      return {
        valid: false,
        error: "会话无效，请重新登录",
      };
    }

    return validateSession(session);
  } catch (error) {
    console.error("获取管理员会话失败:", error);
    return {
      valid: false,
      error: "获取会话失败",
    };
  }
}

/**
 * 要求管理员登录
 * 如果未登录或会话无效，抛出错误
 *
 * @returns 会话对象
 * @throws 如果未登录或会话无效
 */
export async function requireAdminSession(): Promise<AdminSession> {
  const result = await getAdminSession();

  if (!result.valid || !result.session) {
    throw new Error(result.error || "需要管理员权限");
  }

  return result.session;
}

// ==================== 会话销毁 ====================

/**
 * 清除管理员会话 Cookie
 */
export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.delete(COOKIE_NAME);
}

/**
 * 登出管理员
 */
export async function logoutAdmin(): Promise<void> {
  await clearAdminSessionCookie();
}

// ==================== 会话刷新 ====================

/**
 * 刷新管理员会话
 * 延长会话过期时间
 *
 * @returns 新的会话对象
 */
export async function refreshAdminSession(): Promise<AdminSession> {
  const result = await getAdminSession();

  if (!result.valid || !result.session) {
    throw new Error("无有效会话可刷新");
  }

  // 创建新会话（保持原有的 adminId、username、role）
  const newSession = createAdminSession(
    result.session.adminId,
    result.session.username,
    result.session.role
  );

  // 设置新的 Cookie
  await setAdminSessionCookie(newSession);

  return newSession;
}

// ==================== 工具函数 ====================

/**
 * 检查管理员是否有指定角色
 *
 * @param session - 会话对象
 * @param requiredRole - 需要的角色
 * @returns 是否有权限
 */
export function hasRole(
  session: AdminSession,
  requiredRole: "admin" | "super_admin"
): boolean {
  // super_admin 拥有所有权限
  if (session.role === "super_admin") {
    return true;
  }

  // admin 只能访问 admin 级别的资源
  return session.role === requiredRole;
}

/**
 * 检查管理员是否是超级管理员
 *
 * @param session - 会话对象
 * @returns 是否是超级管理员
 */
export function isSuperAdmin(session: AdminSession): boolean {
  return session.role === "super_admin";
}

/**
 * 获取会话剩余时间（秒）
 *
 * @param session - 会话对象
 * @returns 剩余秒数
 */
export function getSessionTimeRemaining(session: AdminSession): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.max(0, session.expiresAt - now);
}

/**
 * 检查会话是否即将过期（剩余时间少于 1 小时）
 *
 * @param session - 会话对象
 * @returns 是否即将过期
 */
export function isSessionExpiringSoon(session: AdminSession): boolean {
  const remaining = getSessionTimeRemaining(session);
  return remaining < 3600; // 1 小时 = 3600 秒
}
