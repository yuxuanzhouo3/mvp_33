import { NextRequest, NextResponse } from 'next/server'
import { getDeploymentRegion } from '@/config'
import { getCloudBaseDb } from '@/lib/cloudbase/client'

export const runtime = 'nodejs'

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
 * GET /api/calendar — get events for a month
 * Query: ?year=2026&month=3
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth()))

    const startDate = new Date(year, month, 1).toISOString()
    const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

    const db = getCloudBaseDb()
    if (!db) {
      return NextResponse.json({ success: true, events: [] })
    }

    try {
      const _ = db.command
      const result = await db.collection('calendar_events')
        .where({
          user_id: user.id,
          start_time: _.gte(startDate).and(_.lte(endDate)),
        })
        .orderBy('start_time', 'asc')
        .limit(100)
        .get()

      return NextResponse.json({ success: true, events: result.data || [] })
    } catch (err: any) {
      if (err?.code === 'DATABASE_COLLECTION_NOT_EXIST') {
        return NextResponse.json({ success: true, events: [] })
      }
      throw err
    }
  } catch (error: any) {
    console.error('[API /api/calendar GET] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to get events' }, { status: 500 })
  }
}

/**
 * POST /api/calendar — create an event
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { title, description, start_time, end_time, color, all_day } = body

    if (!title || !start_time) {
      return NextResponse.json({ error: 'Title and start_time are required' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const event = {
      user_id: user.id,
      title,
      description: description || '',
      start_time,
      end_time: end_time || start_time,
      color: color || '#3b82f6',
      all_day: all_day || false,
      created_at: now,
      updated_at: now,
    }

    const db = getCloudBaseDb()
    if (!db) {
      return NextResponse.json({
        success: true,
        event: { ...event, _id: `evt_${Date.now()}`, id: `evt_${Date.now()}` },
      })
    }

    try {
      const result = await db.collection('calendar_events').add(event)
      return NextResponse.json({
        success: true,
        event: { ...event, _id: result.id, id: result.id },
      })
    } catch (err: any) {
      if (err?.code === 'DATABASE_COLLECTION_NOT_EXIST') {
        return NextResponse.json({
          success: true,
          event: { ...event, _id: `evt_${Date.now()}`, id: `evt_${Date.now()}` },
        })
      }
      throw err
    }
  } catch (error: any) {
    console.error('[API /api/calendar POST] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to create event' }, { status: 500 })
  }
}

/**
 * PUT /api/calendar — update an event
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { id, title, description, start_time, end_time, color, all_day } = body

    if (!id) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 })
    }

    const db = getCloudBaseDb()
    if (!db) {
      return NextResponse.json({ success: true })
    }

    await db.collection('calendar_events').doc(id).update({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(start_time !== undefined && { start_time }),
      ...(end_time !== undefined && { end_time }),
      ...(color !== undefined && { color }),
      ...(all_day !== undefined && { all_day }),
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API /api/calendar PUT] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to update event' }, { status: 500 })
  }
}

/**
 * DELETE /api/calendar — delete an event
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('id')
    if (!eventId) {
      return NextResponse.json({ error: 'Event ID is required' }, { status: 400 })
    }

    const db = getCloudBaseDb()
    if (!db) {
      return NextResponse.json({ success: true })
    }

    await db.collection('calendar_events').doc(eventId).remove()
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API /api/calendar DELETE] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to delete event' }, { status: 500 })
  }
}
