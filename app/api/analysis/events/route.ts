import { NextRequest, NextResponse } from "next/server";
import { getDatabaseAdapter } from "@/lib/admin/database";
import type { CreateUserBehaviorEventData } from "@/lib/admin/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<CreateUserBehaviorEventData>;
    const featureKey = String(body.feature_key || "").trim();
    const eventType = String(body.event_type || "").trim();

    if (!featureKey || !eventType) {
      return NextResponse.json(
        { success: false, error: "feature_key and event_type are required" },
        { status: 400 },
      );
    }

    const adapter = getDatabaseAdapter();
    const event = await adapter.createBehaviorEvent({
      user_id: body.user_id,
      session_id: body.session_id,
      event_type: body.event_type as CreateUserBehaviorEventData["event_type"],
      feature_key: featureKey,
      page_path: body.page_path,
      source: body.source,
      duration_ms: typeof body.duration_ms === "number" ? body.duration_ms : undefined,
      scroll_depth: typeof body.scroll_depth === "number" ? body.scroll_depth : undefined,
      properties: body.properties,
      occurred_at: body.occurred_at,
    });

    return NextResponse.json({ success: true, event });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to create analysis event" },
      { status: 500 },
    );
  }
}
