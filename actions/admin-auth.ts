"use server";

/**
 * 管理员认证 Server Actions
 *
 * 处理管理员登录、登出、密码修改等操作
 * 支持双数据库（CloudBase + Supabase）
 */

import { headers } from "next/headers";
import { adminLogin, adminLogout as authLogout } from "@/lib/admin/auth";
import { requireAdminSession } from "@/lib/admin/session";
import { redirect } from "next/navigation";

// ==================== 类型定义 ====================

export interface LoginResult {
  success: boolean;
  error?: string;
}

export interface ChangePasswordResult {
  success: boolean;
  error?: string;
}

export interface CurrentAdmin {
  adminId: string;
  username: string;
  role: "admin" | "super_admin";
}

// ==================== Server Actions ====================

/**
 * 管理员登录
 *
 * @param formData - 表单数据
 * @returns 登录结果
 */
export async function adminLoginAction(formData: FormData): Promise<LoginResult> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return {
      success: false,
      error: "请输入用户名和密码",
    };
  }

  // 获取 IP 地址和用户代理（用于日志记录）
  const headersList = await headers();
  const ipAddress = headersList.get("x-forwarded-for") ||
                     headersList.get("x-real-ip") ||
                     undefined;
  const userAgent = headersList.get("user-agent") || undefined;

  // 调用认证函数
  const result = await adminLogin(
    { username, password },
    ipAddress,
    userAgent
  );

  return result;
}

/**
 * 管理员登出
 */
export async function adminLogoutAction(): Promise<void> {
  // 获取当前会话
  const session = await requireAdminSession();

  // 调用登出函数
  await authLogout(session.adminId);

  // 重定向到登录页
  redirect("/admin/login");
}

/**
 * 修改密码
 *
 * @param formData - 表单数据
 * @returns 修改结果
 */
export async function changePasswordAction(formData: FormData): Promise<ChangePasswordResult> {
  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  // 验证输入
  if (!currentPassword || !newPassword || !confirmPassword) {
    return {
      success: false,
      error: "请填写所有字段",
    };
  }

  if (newPassword !== confirmPassword) {
    return {
      success: false,
      error: "两次输入的新密码不一致",
    };
  }

  // 获取当前管理员会话
  const session = await requireAdminSession();

  // 调用密码修改函数
  const { changePassword } = await import("@/lib/admin/auth");
  const result = await changePassword(session.adminId, currentPassword, newPassword);

  return result;
}

/**
 * 获取当前管理员信息
 *
 * @returns 当前管理员信息或 null
 */
export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  try {
    const session = await requireAdminSession();

    return {
      adminId: session.adminId,
      username: session.username,
      role: session.role,
    };
  } catch {
    return null;
  }
}

/**
 * 验证管理员会话
 *
 * @returns 是否已登录
 */
export async function verifyAdminSession(): Promise<boolean> {
  try {
    await requireAdminSession();
    return true;
  } catch {
    return false;
  }
}
