import { buildDemoDownloadResponse } from "@/lib/demo-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ clientId: string }> | { clientId: string } },
) {
  const params = await Promise.resolve(context.params);
  return buildDemoDownloadResponse(params.clientId);
}
