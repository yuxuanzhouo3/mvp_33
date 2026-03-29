import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { markMessagesAsRead as markMessagesAsReadCN } from '@/lib/database/cloudbase/messages'

// POST /api/messages/read - Mark messages as read
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationId } = body

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
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
      const count = await markMessagesAsReadCN(conversationId, user.id)
      return NextResponse.json({ success: true, count })
    }

    // International (Supabase) – not implemented yet; return success
    return NextResponse.json({ success: true, count: 0 })
  } catch (error) {
    console.error('Mark messages read error:', error)
    return NextResponse.json(
      { error: 'Failed to mark messages as read' },
      { status: 500 }
    )
  }
}
