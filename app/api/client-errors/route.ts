import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const safeBody = typeof body === 'object' && body ? body : {}
    console.error('[CLIENT ERROR REPORT]', {
      timestamp: new Date().toISOString(),
      type: safeBody.type,
      message: safeBody.message,
      stack: safeBody.stack,
      digest: safeBody.digest,
      url: safeBody.url,
      line: safeBody.line,
      column: safeBody.column,
      href: safeBody.href,
      userAgent: safeBody.userAgent,
      extra: safeBody.extra,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[CLIENT ERROR REPORT] Failed to record error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
