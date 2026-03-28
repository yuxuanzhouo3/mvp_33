import { NextRequest, NextResponse } from 'next/server'
import { getDeploymentRegion } from '@/config'
import { getCloudBaseDb } from '@/lib/cloudbase/client'

export const runtime = 'nodejs'

// Helper: authenticate user based on region
async function getAuthenticatedUser(request: NextRequest) {
  const region = getDeploymentRegion()
  if (region === 'CN') {
    const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
    return await verifyCloudBaseSession(request)
  } else {
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user
  }
}

/**
 * GET /api/meetings — list user's meetings
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = getCloudBaseDb()
    if (!db) {
      // Fallback: return empty list
      return NextResponse.json({ success: true, meetings: [] })
    }

    try {
      const result = await db.collection('meetings')
        .where({ host_id: user.id })
        .orderBy('created_at', 'desc')
        .limit(50)
        .get()

      // Also get meetings where user is a participant
      const participantResult = await db.collection('meetings')
        .where({ participants: user.id })
        .orderBy('created_at', 'desc')
        .limit(50)
        .get()

      // Merge and deduplicate
      const allMeetings = [...(result.data || []), ...(participantResult.data || [])]
      const uniqueMeetings = Array.from(
        new Map(allMeetings.map(m => [m._id, m])).values()
      )

      return NextResponse.json({ success: true, meetings: uniqueMeetings })
    } catch (err: any) {
      if (err?.code === 'DATABASE_COLLECTION_NOT_EXIST') {
        return NextResponse.json({ success: true, meetings: [] })
      }
      throw err
    }
  } catch (error: any) {
    console.error('[API /api/meetings GET] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to get meetings' }, { status: 500 })
  }
}

/**
 * POST /api/meetings — create a meeting
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, type, start_time, end_time, participants } = body

    // Generate room ID
    const roomId = `mtg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    const now = new Date().toISOString()

    const meeting = {
      title: title || (type === 'instant' ? '即时会议' : '预约会议'),
      type: type || 'instant', // 'instant' | 'scheduled'
      room_id: roomId,
      host_id: user.id,
      host_name: (user as any).full_name || (user as any).username || (user as any).email || 'Unknown',
      start_time: start_time || now,
      end_time: end_time || null,
      status: type === 'instant' ? 'active' : 'scheduled', // 'active' | 'scheduled' | 'ended'
      participants: participants || [user.id],
      created_at: now,
      updated_at: now,
    }

    const db = getCloudBaseDb()
    if (!db) {
      // No DB: return meeting with fake ID for instant use
      return NextResponse.json({
        success: true,
        meeting: { ...meeting, _id: roomId, id: roomId },
      })
    }

    try {
      const result = await db.collection('meetings').add(meeting)
      return NextResponse.json({
        success: true,
        meeting: { ...meeting, _id: result.id, id: result.id },
      })
    } catch (err: any) {
      if (err?.code === 'DATABASE_COLLECTION_NOT_EXIST') {
        // Collection doesn't exist yet — return without persisting
        return NextResponse.json({
          success: true,
          meeting: { ...meeting, _id: roomId, id: roomId },
        })
      }
      throw err
    }
  } catch (error: any) {
    console.error('[API /api/meetings POST] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to create meeting' }, { status: 500 })
  }
}

/**
 * DELETE /api/meetings — delete a meeting
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const meetingId = searchParams.get('id')
    if (!meetingId) {
      return NextResponse.json({ error: 'Meeting ID is required' }, { status: 400 })
    }

    const db = getCloudBaseDb()
    if (!db) {
      return NextResponse.json({ success: true })
    }

    await db.collection('meetings').doc(meetingId).remove()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API /api/meetings DELETE] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to delete meeting' }, { status: 500 })
  }
}
