import { NextRequest, NextResponse } from "next/server";
import { getStoredFeedbackClusters, refreshFeedbackClusters } from "@/lib/admin/analysis/service";
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
    const report = await getStoredFeedbackClusters({
      snapshotKey: params.get("snapshotKey") || undefined,
      startDate: params.get("startDate") || undefined,
      endDate: params.get("endDate") || undefined,
      rangeDays: parseNumber(params.get("rangeDays"), 30),
      clusterLimit: parseNumber(params.get("limit"), 12),
    });

    return NextResponse.json({ success: true, ...report });
  } catch (error: any) {
    const status = String(error?.message || "").includes("管理员") ? 401 : 500;
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load feedback clusters" },
      { status },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();
    const body = await request.json().catch(() => ({}));
    const report = await refreshFeedbackClusters({
      startDate: typeof body.startDate === "string" ? body.startDate : undefined,
      endDate: typeof body.endDate === "string" ? body.endDate : undefined,
      rangeDays: Number.isFinite(Number(body.rangeDays)) ? Number(body.rangeDays) : 30,
      clusterLimit: Number.isFinite(Number(body.clusterLimit)) ? Number(body.clusterLimit) : 12,
    });

    return NextResponse.json({ success: true, ...report });
  } catch (error: any) {
    const status = String(error?.message || "").includes("管理员") ? 401 : 500;
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to refresh feedback clusters" },
      { status },
    );
  }
}
