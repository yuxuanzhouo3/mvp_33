import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ clientId: string; slug: string[] }> | { clientId: string; slug: string[] }
  },
) {
  const { clientId, slug } = await Promise.resolve(context.params);
  const encodedClientId = encodeURIComponent(clientId);
  const encodedPath = Array.isArray(slug) ? slug.filter(Boolean).map(encodeURIComponent).join("/") : "";

  if (!encodedPath) {
    return NextResponse.redirect(new URL(`/download/${encodedClientId}`, request.url), 308);
  }

  return NextResponse.redirect(new URL(`/download/${encodedClientId}/${encodedPath}`, request.url), 308);
}
