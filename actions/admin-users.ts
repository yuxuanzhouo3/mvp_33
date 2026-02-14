"use server";

/**
 * 管理后台 - 用户统计 Server Actions
 *
 * 仅提供用户统计功能（用户列表、编辑、删除等管理功能已移除）
 * 支持双数据库（CloudBase + Supabase）
 */

import { requireAdminSession } from "@/lib/admin/session";
import { getDatabaseAdapter } from "@/lib/admin/database";
import type { ApiResponse } from "@/lib/admin/types";

/**
 * 获取用户统计信息
 */
export async function getUserStats(): Promise<ApiResponse<{
  total: number;
  free: number;
  pro: number;
  enterprise: number;
  newThisMonth: number;
  newToday: number;
  activeThisWeek: number;
  monthlyActive: number;
  dailyActive: number;
  paidUsers: number;
  conversionRate: number;
  byRegion: {
    domestic: number;
    international: number;
  };
  paidUsersByRegion: {
    domestic: number;
    international: number;
  };
}>> {
  try {
    const session = await requireAdminSession();
    const db = await getDatabaseAdapter();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const startOfMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // 获取所有用户进行统计
    const allUsers = await db.listUsers({ limit: 10000 });

    // Debug logging
    console.log("[getUserStats] Total users fetched:", allUsers.length);
    const usersWithLastLogin = allUsers.filter(u => u.last_login_at).length;
    const usersWithoutLastLogin = allUsers.length - usersWithLastLogin;
    console.log("[getUserStats] Users with last_login_at:", usersWithLastLogin);
    console.log("[getUserStats] Users without last_login_at:", usersWithoutLastLogin);
    console.log("[getUserStats] Date range - startOfMonthAgo:", startOfMonthAgo);
    console.log("[getUserStats] Date range - startOfDay:", startOfDay);
    console.log("[getUserStats] Date range - startOfWeek:", startOfWeek);

    // 在内存中统计
    const free = allUsers.filter(u =>
      !u.subscription_plan || u.subscription_plan === "free"
    ).length;

    const pro = allUsers.filter(u =>
      u.subscription_plan === "yearly" || u.subscription_plan === "monthly"
    ).length;

    const enterprise = allUsers.filter(u =>
      u.subscription_plan === "enterprise"
    ).length;

    const newThisMonth = allUsers.filter(u =>
      u.created_at >= startOfMonth
    ).length;

    const newToday = allUsers.filter(u =>
      u.created_at >= startOfDay
    ).length;

    const activeThisWeek = allUsers.filter(u =>
      u.last_login_at && u.last_login_at >= startOfWeek
    ).length;

    const monthlyActive = allUsers.filter(u =>
      u.last_login_at && u.last_login_at >= startOfMonthAgo
    ).length;

    const dailyActive = allUsers.filter(u =>
      u.last_login_at && u.last_login_at >= startOfDay
    ).length;

    console.log("[getUserStats] Monthly active (30 days):", monthlyActive);
    console.log("[getUserStats] Daily active:", dailyActive);
    console.log("[getUserStats] Weekly active:", activeThisWeek);

    const paidUsers = pro + enterprise;
    const conversionRate = allUsers.length > 0
      ? (paidUsers / allUsers.length) * 100
      : 0;

    // 按地区统计（国内 vs 国际）
    const domestic = allUsers.filter(u =>
      !u.region || u.region === 'CN' || u.region === 'china'
    ).length;

    const international = allUsers.length - domestic;

    // 按地区统计付费用户
    const paidUsersByRegion = {
      domestic: allUsers.filter(u =>
        (!u.region || u.region === 'CN' || u.region === 'china') &&
        (u.subscription_plan === 'yearly' || u.subscription_plan === 'monthly' || u.subscription_plan === 'enterprise')
      ).length,
      international: allUsers.filter(u =>
        u.region && u.region !== 'CN' && u.region !== 'china' &&
        (u.subscription_plan === 'yearly' || u.subscription_plan === 'monthly' || u.subscription_plan === 'enterprise')
      ).length,
    };

    return {
      success: true,
      data: {
        total: allUsers.length,
        free,
        pro,
        enterprise,
        newThisMonth,
        newToday,
        activeThisWeek,
        monthlyActive,
        dailyActive,
        paidUsers,
        conversionRate: Math.round(conversionRate * 10) / 10, // 保留一位小数
        byRegion: {
          domestic,
          international,
        },
        paidUsersByRegion,
      },
    };
  } catch (error: any) {
    console.error("获取用户统计失败:", error);
    return {
      success: false,
      error: error.message || "获取用户统计失败",
    };
  }
}

/**
 * 获取用户趋势数据
 */
export async function getUserTrends(
  days: number = 30
): Promise<ApiResponse<{
  daily: Array<{ date: string; newUsers: number; activeUsers: number }>;
  byRegion: {
    domestic: number;
    international: number;
  };
}>> {
  try {
    const session = await requireAdminSession();
    const db = await getDatabaseAdapter();

    const now = new Date();
    const startDate = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);

    // 获取所有用户
    const allUsers = await db.listUsers({ limit: 10000 });

    // 按日期聚合数据
    const dailyMap = new Map<string, {
      newUsers: number;
      activeUsers: number;
      activeUsersDomestic: number;
      activeUsersInternational: number;
    }>();

    // 初始化每一天的数据（使用本地日期）
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      dailyMap.set(dateStr, {
        newUsers: 0,
        activeUsers: 0,
        activeUsersDomestic: 0,
        activeUsersInternational: 0
      });
    }

    // 统计每日新增用户
    allUsers.forEach(user => {
      if (user.created_at) {
        // 使用本地日期而不是UTC日期
        const createdDateLocal = new Date(user.created_at);
        const createdDate = `${createdDateLocal.getFullYear()}-${String(createdDateLocal.getMonth() + 1).padStart(2, '0')}-${String(createdDateLocal.getDate()).padStart(2, '0')}`;
        if (dailyMap.has(createdDate)) {
          const data = dailyMap.get(createdDate)!;
          data.newUsers++;
        }
      }
    });

    // 统计每日活跃用户（按区域）
    allUsers.forEach(user => {
      if (user.last_login_at) {
        // 使用本地日期而不是UTC日期
        const lastLoginDateLocal = new Date(user.last_login_at);
        const lastLoginDate = `${lastLoginDateLocal.getFullYear()}-${String(lastLoginDateLocal.getMonth() + 1).padStart(2, '0')}-${String(lastLoginDateLocal.getDate()).padStart(2, '0')}`;
        if (dailyMap.has(lastLoginDate)) {
          const data = dailyMap.get(lastLoginDate)!;
          data.activeUsers++;

          // 判断是否为国内用户
          const isDomestic = !user.region || user.region === 'CN' || user.region === 'china';
          if (isDomestic) {
            data.activeUsersDomestic++;
          } else {
            data.activeUsersInternational++;
          }
        }
      }
    });

    // 转换为数组
    const daily = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date: date.substring(5), // 只显示 MM-DD
      ...data,
    }));

    // 按地区统计
    const domestic = allUsers.filter(u =>
      !u.region || u.region === 'CN' || u.region === 'china'
    ).length;

    const international = allUsers.length - domestic;

    return {
      success: true,
      data: {
        daily,
        byRegion: {
          domestic,
          international,
        },
      },
    };
  } catch (error: any) {
    console.error("获取用户趋势失败:", error);
    return {
      success: false,
      error: error.message || "获取用户趋势失败",
    };
  }
}
