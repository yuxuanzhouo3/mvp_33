"use server";

/**
 * 管理后台 - 支付记录管理 Server Actions
 *
 * 提供支付记录列表、查看、统计等功能
 * 支持双数据库（CloudBase + Supabase）
 */

import { requireAdminSession } from "@/lib/admin/session";
import { getDatabaseAdapter } from "@/lib/admin/database";
import type {
  Payment,
  PaymentFilters,
  ApiResponse,
  PaginatedResult,
} from "@/lib/admin/types";
import { revalidatePath } from "next/cache";
import { unstable_noStore } from "next/cache";
import { RegionConfig } from "@/lib/config/region";

/**
 * 获取支付记录列表
 */
export async function listPayments(
  filters?: PaymentFilters
): Promise<ApiResponse<PaginatedResult<Payment>>> {
  try {
    const session = await requireAdminSession();

    const db = await getDatabaseAdapter();
    const payments = await db.listPayments(filters || {});
    const total = await db.countPayments(filters || {});

    const pageSize = filters?.limit || 20;
    const page = filters?.offset ? Math.floor(filters.offset / pageSize) + 1 : 1;

    return {
      success: true,
      data: {
        items: payments,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  } catch (error: any) {
    console.error("获取支付记录失败:", error);
    return {
      success: false,
      error: error.message || "获取支付记录失败",
    };
  }
}

/**
 * 获取支付记录详情
 */
export async function getPaymentById(
  paymentId: string
): Promise<ApiResponse<Payment>> {
  try {
    const session = await requireAdminSession();

    const db = await getDatabaseAdapter();
    const payment = await db.getPaymentById(paymentId);

    if (!payment) {
      return {
        success: false,
        error: "支付记录不存在",
      };
    }

    return {
      success: true,
      data: payment,
    };
  } catch (error: any) {
    console.error("获取支付详情失败:", error);
    return {
      success: false,
      error: error.message || "获取支付详情失败",
    };
  }
}

/**
 * 获取支付统计信息
 */
export async function getPaymentStats(): Promise<ApiResponse<{
  total: number;
  thisMonth: number;
  today: number;
  totalRevenue: number;
  byMethod: Record<string, number>;
}>> {
  // 禁用 Next.js 缓存，确保每次都获取最新数据
  unstable_noStore();

  try {
    const session = await requireAdminSession();
    const db = await getDatabaseAdapter();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // 获取所有支付记录
    const allPayments = await db.listPayments({ limit: 10000 });

    // 只统计已成功支付的订单（paid 状态）
    const paidPayments = allPayments.filter((p) => p.status === "paid");

    // 统计各时间段的支付数量
    const total = paidPayments.length;
    const thisMonth = paidPayments.filter(
      (p) => p.created_at && p.created_at >= startOfMonth
    ).length;
    const today = paidPayments.filter(
      (p) => p.created_at && p.created_at >= startOfDay
    ).length;

    // 计算总收入
    const totalRevenue = paidPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    // 只统计当前环境支持的支付方式
    const byMethod: Record<string, number> = {};
    RegionConfig.payment.methods.forEach((method) => {
      byMethod[method] = paidPayments
        .filter((p) => p.method === method)
        .reduce((sum, p) => sum + (p.amount ?? 0), 0) || 0;
    });

    // 按币种统计（国际版 USD，国内版 CNY）
    const totalRevenueByCurrency = {
      USD: (byMethod.stripe ?? 0) + (byMethod.paypal ?? 0),
      CNY: (byMethod.wechat ?? 0) + (byMethod.alipay ?? 0),
    };

    return {
      success: true,
      data: {
        total,
        thisMonth,
        today,
        totalRevenue,
        totalRevenueByCurrency,
        byMethod,
        lastUpdated: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error("获取支付统计失败:", error);
    return {
      success: false,
      error: error.message || "获取支付统计失败",
    };
  }
}

/**
 * 获取支付趋势数据
 */
export async function getPaymentTrends(
  days: number = 30
): Promise<ApiResponse<{
  daily: Array<{ date: string; revenue: number; orders: number }>;
  todayRevenue: number;
  todayOrders: number;
}>> {
  unstable_noStore();

  try {
    const session = await requireAdminSession();
    const db = await getDatabaseAdapter();

    const now = new Date();
    const startDate = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // 获取所有支付记录
    const allPayments = await db.listPayments({ limit: 10000 });

    // 按日期聚合数据
    const dailyMap = new Map<string, { revenue: number; revenueUSD: number; revenueCNY: number; orders: number }>();

    // 初始化每一天的数据（使用本地日期）
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      dailyMap.set(dateStr, { revenue: 0, revenueUSD: 0, revenueCNY: 0, orders: 0 });
    }

    let todayRevenue = 0;
    let todayOrders = 0;

    // 统计今日收入按币种（用于 Dashboard 显示）
    let todayRevenueUSD = 0;
    let todayRevenueCNY = 0;

    // 统计每日收入和订单数
    allPayments.forEach(payment => {
      if (payment.status === "paid" && payment.created_at) {
        // 使用本地日期而不是UTC日期
        const createdDateLocal = new Date(payment.created_at);
        const createdDate = `${createdDateLocal.getFullYear()}-${String(createdDateLocal.getMonth() + 1).padStart(2, '0')}-${String(createdDateLocal.getDate()).padStart(2, '0')}`;

        if (dailyMap.has(createdDate)) {
          const data = dailyMap.get(createdDate)!;
          data.revenue += payment.amount || 0;
          data.orders++;

          // 按币种统计每日收入
          if (payment.method === "stripe" || payment.method === "paypal") {
            data.revenueUSD += payment.amount || 0;
          } else if (payment.method === "wechat" || payment.method === "alipay") {
            data.revenueCNY += payment.amount || 0;
          }
        }

        // 统计今日数据
        if (payment.created_at >= startOfDay) {
          todayRevenue += payment.amount || 0;
          todayOrders++;

          // 按币种统计今日收入
          if (payment.method === "stripe" || payment.method === "paypal") {
            todayRevenueUSD += payment.amount || 0;
          } else if (payment.method === "wechat" || payment.method === "alipay") {
            todayRevenueCNY += payment.amount || 0;
          }
        }
      }
    });

    // 转换为数组
    const daily = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date: date.substring(5), // 只显示 MM-DD
      revenue: Math.round(data.revenue * 100) / 100, // 总收入，保留两位小数
      revenueUSD: Math.round(data.revenueUSD * 100) / 100, // USD收入
      revenueCNY: Math.round(data.revenueCNY * 100) / 100, // CNY收入
      orders: data.orders,
    }));

    return {
      success: true,
      data: {
        daily,
        todayRevenue: Math.round(todayRevenue * 100) / 100,
        todayOrders,
        todayRevenueByCurrency: {
          USD: Math.round(todayRevenueUSD * 100) / 100,
          CNY: Math.round(todayRevenueCNY * 100) / 100,
        },
        lastUpdated: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error("获取支付趋势失败:", error);
    return {
      success: false,
      error: error.message || "获取支付趋势失败",
    };
  }
}
