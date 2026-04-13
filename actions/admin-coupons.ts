"use server";

import { requireAdminSession } from "@/lib/admin/session";
import { getDatabaseAdapter } from "@/lib/admin/database";
import type {
  Coupon,
  CouponFilters,
  CreateCouponData,
  CouponStatus,
  CouponSummary,
  ApiResponse,
  PaginatedResult,
} from "@/lib/admin/types";
import { listMarketingSettings } from "@/lib/market/marketing";
import type { MarketingCouponDiscountType, MarketingSetting } from "@/lib/market/marketing-types";

export interface CouponCreationDefaults {
  discount_ratio: number;
  user_id: string;
  source_discount_type: MarketingCouponDiscountType;
  source_discount_value: number;
}

const FALLBACK_COUPON_DEFAULTS: CouponCreationDefaults = {
  discount_ratio: 0.8,
  user_id: "",
  source_discount_type: "percentage",
  source_discount_value: 20,
};

function getSettingValue(settings: MarketingSetting[], key: string) {
  return settings.find((item) => item.key === key)?.value;
}

function safeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampDiscountRatio(value: number) {
  return Math.min(0.99, Math.max(0.1, Math.round(value * 100) / 100));
}

function buildCouponCreationDefaults(settings: MarketingSetting[]): CouponCreationDefaults {
  const discountTypeValue = String(
    getSettingValue(settings, "invite_coupon_discount_type") || FALLBACK_COUPON_DEFAULTS.source_discount_type,
  ).trim();
  const source_discount_type: MarketingCouponDiscountType =
    discountTypeValue === "fixed" ? "fixed" : "percentage";
  const source_discount_value = safeNumber(
    getSettingValue(settings, "invite_coupon_discount_value"),
    FALLBACK_COUPON_DEFAULTS.source_discount_value,
  );
  const user_id = String(getSettingValue(settings, "invite_coupon_default_user_id") || "").trim();

  if (source_discount_type !== "percentage") {
    return {
      ...FALLBACK_COUPON_DEFAULTS,
      user_id,
      source_discount_type,
      source_discount_value,
    };
  }

  return {
    discount_ratio: clampDiscountRatio(1 - source_discount_value / 100),
    user_id,
    source_discount_type,
    source_discount_value,
  };
}

export async function getCouponCreationDefaults(): Promise<ApiResponse<CouponCreationDefaults>> {
  try {
    await requireAdminSession();
    const settings = await listMarketingSettings();

    return {
      success: true,
      data: buildCouponCreationDefaults(settings),
    };
  } catch (error: any) {
    console.error("Failed to load coupon creation defaults", error);
    return {
      success: false,
      error: error.message || "Failed to load coupon creation defaults",
    };
  }
}

export async function listCoupons(
  filters?: CouponFilters,
): Promise<ApiResponse<PaginatedResult<Coupon>>> {
  try {
    await requireAdminSession();
    const db = await getDatabaseAdapter();

    const result = await db.getCoupons(filters || {});

    const pageSize = filters?.limit || 20;
    const page = filters?.offset ? Math.floor(filters.offset / pageSize) + 1 : 1;

    return {
      success: true,
      data: {
        items: result.items,
        total: result.total,
        page,
        pageSize,
        totalPages: Math.ceil(result.total / pageSize),
      },
    };
  } catch (error: any) {
    console.error("Failed to fetch coupons", error);
    return {
      success: false,
      error: error.message || "Failed to fetch coupons",
    };
  }
}

export async function createCoupon(data: CreateCouponData): Promise<ApiResponse<Coupon>> {
  try {
    const session = await requireAdminSession();
    const db = await getDatabaseAdapter();
    const coupon = await db.createCoupon({
      ...data,
      issued_by_admin_id: data.issued_by_admin_id || session.adminId,
      issued_to_user_id: data.issued_to_user_id || data.user_id,
    });
    return {
      success: true,
      data: coupon,
    };
  } catch (error: any) {
    console.error("Failed to create coupon", error);
    return {
      success: false,
      error: error.message || "Failed to create coupon",
    };
  }
}

export async function updateCouponStatus(
  id: string,
  status: CouponStatus,
  orderNo?: string,
  usedByUserId?: string,
): Promise<ApiResponse<boolean>> {
  try {
    await requireAdminSession();
    const db = await getDatabaseAdapter();
    const success = await db.updateCouponStatus(id, status, orderNo, usedByUserId);
    return {
      success: true,
      data: success,
    };
  } catch (error: any) {
    console.error("Failed to update coupon status", error);
    return {
      success: false,
      error: error.message || "Failed to update coupon status",
    };
  }
}

export async function deleteCoupon(id: string): Promise<ApiResponse<boolean>> {
  try {
    await requireAdminSession();
    const db = await getDatabaseAdapter();
    const success = await db.deleteCoupon(id);
    return {
      success: true,
      data: success,
    };
  } catch (error: any) {
    console.error("Failed to delete coupon", error);
    return {
      success: false,
      error: error.message || "Failed to delete coupon",
    };
  }
}

export async function getCouponSummary(
  filters?: CouponFilters,
): Promise<ApiResponse<CouponSummary>> {
  try {
    await requireAdminSession();
    const db = await getDatabaseAdapter();
    const summary = await db.getCouponSummary(filters || {});
    return {
      success: true,
      data: summary,
    };
  } catch (error: any) {
    console.error("Failed to fetch coupon summary", error);
    return {
      success: false,
      error: error.message || "Failed to fetch coupon summary",
    };
  }
}
