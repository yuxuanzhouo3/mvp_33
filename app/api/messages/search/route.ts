import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { searchMessages as searchMessagesCN } from '@/lib/database/cloudbase/messages'

// GET /api/messages/search?conversationId=xxx&q=xxx
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const conversationId = searchParams.get('conversationId')
    const query = searchParams.get('q')

    if (!conversationId || !query) {
      return NextResponse.json(
        { error: 'conversationId and q are required' },
        { status: 400 }
      )
    }

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'
    const isCloudbase = dbClient.type === 'cloudbase' && userRegion === 'cn'

    let user: { id: string } | null = null

    if (isCloudbase) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (cloudBaseUser) {
        user = { id: cloudBaseUser.id }
      }
    } else {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (supabaseUser) {
        user = { id: supabaseUser.id }
      }
    }

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    if (isCloudbase) {
      const messages = await searchMessagesCN(conversationId, query)
      return NextResponse.json({ success: true, messages })
    }

    // International (Supabase) – not implemented yet
    return NextResponse.json({ success: true, messages: [] })
  } catch (error) {
    console.error('Search messages error:', error)
    return NextResponse.json(
      { error: 'Failed to search messages' },
      { status: 500 }
    )
  }
}
