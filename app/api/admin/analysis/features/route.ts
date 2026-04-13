import { NextRequest, NextResponse } from "next/server";
import { getFeatureUsageReport } from "@/lib/admin/analysis/service";
import { requireAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

function parseNumber(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();
    const params = request.nextUrl.searchParams;
    const report = await getFeatureUsageReport({
      startDate: params.get("startDate") || undefined,
      endDate: params.get("endDate") || undefined,
      rangeDays: parseNumber(params.get("rangeDays"), 30),
      featureLimit: parseNumber(params.get("limit"), 12),
    });

    return NextResponse.json({ success: true, ...report });
  } catch (error: any) {
    const status = String(error?.message || "").includes("管理员") ? 401 : 500;
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load feature usage report" },
      { status },
    );
  }
}
