import { getAdminDatabase } from "@/lib/admin/database";
import { markMarketingCouponUsed } from "@/lib/market/marketing";

const MARKETING_COUPON_PREFIX = "marketing:";

export async function markCouponUsedFromOrder(input: {
  dbType: "cloudbase" | "supabase";
  couponId?: string | null;
  orderNo?: string | null;
  userId?: string | null;
}) {
  const couponId = String(input.couponId || "").trim();
  const orderNo = String(input.orderNo || "").trim();
  const userId = String(input.userId || "").trim();

  if (!couponId || !orderNo || !userId) {
    return { updated: false, reason: "missing_required_fields" as const };
  }

  if (couponId.toLowerCase().startsWith(MARKETING_COUPON_PREFIX)) {
    const marketingCouponId = couponId.slice(MARKETING_COUPON_PREFIX.length).trim();
    return markMarketingCouponUsed({
      id: marketingCouponId,
      orderNo,
      userId,
    });
  }

  const adminDb = getAdminDatabase(input.dbType);
  await adminDb.updateCouponStatus(couponId, "used", orderNo, userId);

  return { updated: true as const };
}
