import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'

/**
 * Update user status
 * PUT /api/users/status
 * Body: { status: 'online' | 'offline' | 'away' | 'busy' }
 */
export async function PUT(request: NextRequest) {
  try {
    const { IS_DOMESTIC_VERSION } = await import('@/config')
    let currentUser: any = null
    let supabase: any = null

    if (IS_DOMESTIC_VERSION) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (!cloudBaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUser = cloudBaseUser
    } else {
      supabase = await createClient()
      const {
        data: { user: supabaseUser },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !supabaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      currentUser = supabaseUser
    }

    // Handle both JSON and Blob (from sendBeacon) requests
    let body: any
    const contentType = request.headers.get('content-type') || ''
    
    if (contentType.includes('application/json')) {
      body = await request.json()
    } else if (contentType.includes('text/plain') || contentType.includes('application/octet-stream')) {
      // Handle sendBeacon Blob data
      const text = await request.text()
      try {
        body = JSON.parse(text)
      } catch (e) {
        // If parsing fails, try to extract status from text
        body = { status: text.includes('offline') ? 'offline' : 'online' }
      }
    } else {
      // Try to parse as JSON anyway
      try {
        body = await request.json()
      } catch (e) {
        return NextResponse.json(
          { error: 'Invalid request body' },
          { status: 400 }
        )
      }
    }
    
    const { status } = body

    if (!status || !['online', 'offline', 'away', 'busy'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: online, offline, away, busy' },
        { status: 400 }
      )
    }

    const dbClient = await getDatabaseClientForUser(request)
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    if (dbClient.type === 'supabase' && userRegion === 'global') {
      // Update Supabase users table
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({ 
          status, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', currentUser.id)
        .select()
        .single()

      if (updateError) {
        console.error('[USER_STATUS] Failed to update user status:', updateError)
        return NextResponse.json(
          { error: 'Failed to update user status', details: updateError.message },
          { status: 500 }
        )
      }

      console.log(`[USER_STATUS] Successfully updated user status to ${status} for user ${currentUser.id}`)
      return NextResponse.json({
        success: true,
        user: updatedUser,
      })
    } else {
      // For CloudBase users, update status in CloudBase
      try {
        const { updateUser: updateCloudBaseUser } = await import('@/lib/cloudbase/database')
        const updatedUser = await updateCloudBaseUser(currentUser.id, { status })
        console.log(`[USER_STATUS] Successfully updated CloudBase user status to ${status} for user ${currentUser.id}`)
        return NextResponse.json({
          success: true,
          user: updatedUser,
        })
      } catch (cloudbaseError: any) {
        console.error('[USER_STATUS] Failed to update CloudBase user status:', cloudbaseError)
        return NextResponse.json(
          { error: 'Failed to update user status', details: cloudbaseError?.message },
          { status: 500 }
        )
      }
    }
  } catch (error: any) {
    console.error('[USER_STATUS] Error updating user status:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update user status' },
      { status: 500 }
    )
  }
}
