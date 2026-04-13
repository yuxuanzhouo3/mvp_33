import { buildDemoDownloadResponse } from "@/lib/demo-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return buildDemoDownloadResponse();
}
