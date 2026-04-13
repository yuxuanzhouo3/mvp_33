import { NextRequest, NextResponse } from "next/server";
import { getFeedbackAggregationReport } from "@/lib/admin/analysis/service";
import { getDatabaseAdapter } from "@/lib/admin/database";
import { requireAdminSession } from "@/lib/admin/session";
import type { CreateFeedbackData } from "@/lib/admin/types";

export const runtime = "nodejs";

function parseNumber(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminSession();
    const params = request.nextUrl.searchParams;
    const adapter = getDatabaseAdapter();
    const report = await getFeedbackAggregationReport({
      startDate: params.get("startDate") || undefined,
      endDate: params.get("endDate") || undefined,
      rangeDays: parseNumber(params.get("rangeDays"), 30),
    });

    const items = await adapter.listFeedback({
      status: (params.get("status") as any) || undefined,
      source: (params.get("source") as any) || undefined,
      version: params.get("version") || undefined,
      feature_key: params.get("featureKey") || undefined,
      search: params.get("search") || undefined,
      start_date: params.get("startDate") || undefined,
      end_date: params.get("endDate") || undefined,
      limit: parseNumber(params.get("limit"), 50),
    });

    return NextResponse.json({ success: true, ...report, items });
  } catch (error: any) {
    const status = String(error?.message || "").includes("管理员") ? 401 : 500;
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to load feedback report" },
      { status },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdminSession();
    const body = (await request.json()) as Partial<CreateFeedbackData>;
    const content = String(body.content || "").trim();

    if (!content) {
      return NextResponse.json(
        { success: false, error: "content is required" },
        { status: 400 },
      );
    }

    const adapter = getDatabaseAdapter();
    const feedback = await adapter.createFeedback({
      user_id: body.user_id,
      email: body.email,
      content,
      source: body.source || "system",
      images: Array.isArray(body.images) ? body.images : [],
      screenshot_urls: Array.isArray(body.screenshot_urls) ? body.screenshot_urls : [],
      version: typeof body.version === "string" ? body.version : undefined,
      feature_key: typeof body.feature_key === "string" ? body.feature_key : undefined,
      pros: Array.isArray(body.pros) ? body.pros : [],
      cons: Array.isArray(body.cons) ? body.cons : [],
      metadata: body.metadata,
      status: body.status,
    });

    return NextResponse.json({ success: true, feedback });
  } catch (error: any) {
    const status = String(error?.message || "").includes("管理员") ? 401 : 500;
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to create feedback" },
      { status },
    );
  }
}
