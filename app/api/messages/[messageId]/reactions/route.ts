import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { addReaction, removeReaction } from '@/lib/database/supabase/messages'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { addReaction as addReactionCN, removeReaction as removeReactionCN } from '@/lib/database/cloudbase/messages'

// POST /api/messages/[messageId]/reactions - Add reaction
export async function POST(
  request: NextRequest,
  { params }: { params: { messageId: string } }
) {
  try {
    const body = await request.json()
    const { emoji } = body

    if (!emoji) {
      return NextResponse.json(
        { error: 'emoji is required' },
        { status: 400 }
      )
    }

    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      const message = await addReactionCN(params.messageId, emoji, user.id)

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

    const message = await addReaction(params.messageId, emoji, user.id)

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
  { params }: { params: { messageId: string } }
) {
  try {
    const searchParams = request.nextUrl.searchParams
    const emoji = searchParams.get('emoji')

    if (!emoji) {
      return NextResponse.json(
        { error: 'emoji is required' },
        { status: 400 }
      )
    }

    // Verify user is authenticated
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      const message = await removeReactionCN(params.messageId, emoji, user.id)

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

    const message = await removeReaction(params.messageId, emoji, user.id)

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

