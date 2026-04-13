import { NextRequest, NextResponse } from "next/server";
import { getDatabaseAdapter } from "@/lib/admin/database";
import type { CreateFeedbackData } from "@/lib/admin/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
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
      source: body.source || "web",
      images: Array.isArray(body.images) ? body.images : [],
      screenshot_urls: Array.isArray(body.screenshot_urls) ? body.screenshot_urls : [],
      version: typeof body.version === "string" ? body.version : undefined,
      feature_key: typeof body.feature_key === "string" ? body.feature_key : undefined,
      pros: Array.isArray(body.pros) ? body.pros : [],
      cons: Array.isArray(body.cons) ? body.cons : [],
      metadata: body.metadata,
    });

    return NextResponse.json({ success: true, feedback });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to submit feedback" },
      { status: 500 },
    );
  }
}
