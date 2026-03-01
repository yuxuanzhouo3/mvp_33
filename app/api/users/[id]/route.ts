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
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const currentUser = await verifyCloudBaseSession(request)
      if (!currentUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const db = dbClient.cloudbase

      try {
        let matchedUser: any = null

        // Primary lookup by logical id field.
        const byIdResult = await db
          .collection('users')
          .where({
            id: userId,
            region: 'cn',
          })
          .limit(1)
          .get()

        if (byIdResult?.data && byIdResult.data.length > 0) {
          matchedUser = byIdResult.data[0]
        }

        // Legacy fallback: QR code may contain CloudBase document _id.
        if (!matchedUser) {
          try {
            const byDocIdResult = await db.collection('users').doc(userId).get()
            const docData = (byDocIdResult as any)?.data || null
            if (docData && (docData.region || 'cn') === 'cn') {
              matchedUser = docData
            }
          } catch (docLookupError) {
            // Ignore and keep final not found response below.
            console.warn('[GET /api/users/[id]] CloudBase doc lookup failed:', docLookupError)
          }
        }

        if (!matchedUser) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          )
        }

        const user = matchedUser
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
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !currentUser) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    let user: any = null

    // Primary lookup by UUID id.
    const { data: userById, error: errorById } = await supabase
      .from('users')
      .select('id, email, username, full_name, avatar_url, department, title, status, last_seen_at, region')
      .eq('id', userId)
      .eq('region', 'global')
      .maybeSingle()

    if (userById) {
      user = userById
    } else {
      // Backward compatibility for legacy QR payloads that encoded username/email as userId.
      const { data: userByUsername } = await supabase
        .from('users')
        .select('id, email, username, full_name, avatar_url, department, title, status, last_seen_at, region')
        .eq('username', userId)
        .eq('region', 'global')
        .maybeSingle()

      if (userByUsername) {
        user = userByUsername
      } else {
        const { data: userByEmail } = await supabase
          .from('users')
          .select('id, email, username, full_name, avatar_url, department, title, status, last_seen_at, region')
          .eq('email', userId)
          .eq('region', 'global')
          .maybeSingle()

        user = userByEmail || null
      }
    }

    if (!user) {
      console.error('Get user by ID error (supabase):', errorById, 'userId:', userId)
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
