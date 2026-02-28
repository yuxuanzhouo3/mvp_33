import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'

/**
 * Get user by ID
 * GET /api/users/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await params

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const dbClient = await getDatabaseClientForUser(request)
    const currentRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    // CloudBase (China) users
    if (dbClient.type === 'cloudbase' && dbClient.cloudbase && currentRegion === 'cn') {
      const db = dbClient.cloudbase

      try {
        const result = await db
          .collection('users')
          .where({
            id: userId,
            region: 'cn'
          })
          .limit(1)
          .get()

        const rawUsers = result?.data || []

        if (rawUsers.length === 0) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          )
        }

        const user = rawUsers[0]
        const formattedUser = {
          id: user.id || user._id,
          email: user.email,
          username: user.username || user.email?.split('@')[0] || '',
          full_name: user.full_name || user.name || '',
          avatar_url: user.avatar_url || null,
          department: user.department || undefined,
          title: user.title || undefined,
          status: user.status || 'offline',
          last_seen_at: user.last_seen_at || null,
          region: user.region || 'cn',
        }

        return NextResponse.json({
          success: true,
          user: formattedUser,
        })
      } catch (error: any) {
        console.error('Get user by ID error (cloudbase):', error)
        return NextResponse.json(
          { error: 'Failed to get user', details: error.message || 'CloudBase query error' },
          { status: 500 }
        )
      }
    }

    // Supabase (global) users
    const supabase = await createClient()

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, username, full_name, avatar_url, department, title, status, last_seen_at, region')
      .eq('id', userId)
      .eq('region', 'global')
      .single()

    if (error || !user) {
      console.error('Get user by ID error (supabase):', error)
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      user,
    })
  } catch (error: any) {
    console.error('Get user by ID error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get user' },
      { status: 500 }
    )
  }
}
