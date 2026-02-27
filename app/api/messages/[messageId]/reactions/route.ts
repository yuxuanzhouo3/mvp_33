import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addReaction, removeReaction } from '@/lib/database/supabase/messages'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { addReaction as addReactionCN, removeReaction as removeReactionCN } from '@/lib/database/cloudbase/messages'

// POST /api/messages/[messageId]/reactions - Add reaction
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> | { messageId: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const body = await request.json()
    const { emoji } = body

    if (!emoji) {
      return NextResponse.json(
        { error: 'emoji is required' },
        { status: 400 }
      )
    }

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const user = await verifyCloudBaseSession(request)
      if (!user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      const message = await addReactionCN(resolvedParams.messageId, emoji, user.id)

      if (!message) {
        return NextResponse.json(
          { error: 'Message not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        message,
      })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const message = await addReaction(resolvedParams.messageId, emoji, user.id)

    if (!message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message,
    })
  } catch (error) {
    console.error('Add reaction error:', error)
    return NextResponse.json(
      { error: 'Failed to add reaction' },
      { status: 500 }
    )
  }
}

// DELETE /api/messages/[messageId]/reactions - Remove reaction
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> | { messageId: string } }
) {
  try {
    const resolvedParams = await Promise.resolve(params)
    const searchParams = request.nextUrl.searchParams
    const emoji = searchParams.get('emoji')

    if (!emoji) {
      return NextResponse.json(
        { error: 'emoji is required' },
        { status: 400 }
      )
    }

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const user = await verifyCloudBaseSession(request)
      if (!user) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      const message = await removeReactionCN(resolvedParams.messageId, emoji, user.id)

      if (!message) {
        return NextResponse.json(
          { error: 'Message not found' },
          { status: 404 }
        )
      }

      return NextResponse.json({
        success: true,
        message,
      })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const message = await removeReaction(resolvedParams.messageId, emoji, user.id)

    if (!message) {
      return NextResponse.json(
        { error: 'Message not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      message,
    })
  } catch (error) {
    console.error('Remove reaction error:', error)
    return NextResponse.json(
      { error: 'Failed to remove reaction' },
      { status: 500 }
    )
  }
}
