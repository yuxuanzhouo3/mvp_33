import { NextRequest, NextResponse } from 'next/server'

// Bump this tag on every release that needs deployment verification.
const RELEASE_TAG = 'release-check-20260302-001'

export async function GET(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const vercelCommit = process.env.VERCEL_GIT_COMMIT_SHA || null
  const vercelUrl = process.env.VERCEL_URL || null

  const response = NextResponse.json({
    ok: true,
    releaseTag: RELEASE_TAG,
    serverTime: new Date().toISOString(),
    runtime: process.env.NODE_ENV || 'unknown',
    host,
    commit: vercelCommit,
    vercelUrl,
  })

  // Avoid CDN/browser cache to ensure we always see current deployment.
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')
  return response
}

