import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{ slug: string[] }> | { slug: string[] }
  },
) {
  const { slug } = await Promise.resolve(context.params);
  const path = Array.isArray(slug) ? slug.filter(Boolean).map(encodeURIComponent).join("/") : "";

  if (!path) {
    return NextResponse.redirect(new URL("/download", _request.url), 308);
  }

  return NextResponse.redirect(new URL(`/download/${path}`, _request.url), 308);
}
