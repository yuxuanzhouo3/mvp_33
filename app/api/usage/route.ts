import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'

/**
 * GET /api/usage
 * Calculate user's actual usage statistics
 */
export async function GET(request: NextRequest) {
  try {
    const dbClient = await getDatabaseClientForUser(request)
    const isCloudbase = dbClient.type === 'cloudbase' && dbClient.region === 'cn'
    let userId: string

    let messagesUsed = 0
    let storageUsed = 0 // in MB
    let workspacesUsed = 0
    let membersUsed = 0

    if (isCloudbase) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const currentUser = await verifyCloudBaseSession(request)
      if (!currentUser) {
        return NextResponse.json(
          {
            success: false,
            message: 'Unauthorized',
          },
          { status: 401 }
        )
      }
      userId = currentUser.id

      // CloudBase calculation
      const db = dbClient.cloudbase
      
      // Count messages (last 30 days for free, all for pro)
      // Note: We'll need to check subscription type to determine time range
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      
      try {
        // Count messages sent by user
        const messagesResult = await db.collection('messages')
          .where({
            sender_id: userId,
            created_at: db.command.gte(thirtyDaysAgo)
          })
          .count()
        messagesUsed = messagesResult.total || 0

        // Calculate storage: sum all file_size from messages metadata
        const messagesWithFiles = await db.collection('messages')
          .where({
            sender_id: userId,
            metadata: db.command.neq(null)
          })
          .get()

        let totalStorageBytes = 0
        messagesWithFiles.data?.forEach((msg: any) => {
          if (msg.metadata?.file_size) {
            totalStorageBytes += msg.metadata.file_size
          }
        })
        storageUsed = totalStorageBytes / (1024 * 1024) // Convert to MB

        // Count workspaces
        const workspacesResult = await db.collection('workspace_members')
          .where({
            user_id: userId
          })
          .count()
        workspacesUsed = workspacesResult.total || 0

        // Count members (max across all workspaces)
        // Get all workspace IDs user is member of
        const userWorkspaces = await db.collection('workspace_members')
          .where({
            user_id: userId
          })
          .get()

        const workspaceIds = userWorkspaces.data?.map((wm: any) => wm.workspace_id) || []
        
        if (workspaceIds.length > 0) {
          const membersResult = await db.collection('workspace_members')
            .where({
              workspace_id: db.command.in(workspaceIds)
            })
            .count()
          membersUsed = membersResult.total || 0
        }
      } catch (error: any) {
        console.error('CloudBase usage calculation error:', error)
        // Return zeros if calculation fails
      }
    } else {
      const supabase = dbClient.supabase || await createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        return NextResponse.json(
          {
            success: false,
            message: 'Unauthorized',
          },
          { status: 401 }
        )
      }
      userId = user.id

      // Supabase calculation
      const supabaseClient = supabase

      // Count messages sent by user (last 30 days for free users)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      
      const { count: messagesCount } = await supabaseClient
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('sender_id', userId)
        .gte('created_at', thirtyDaysAgo)
      
      messagesUsed = messagesCount || 0

      // Calculate storage: sum all file_size from messages metadata
      // Get all messages with files (where metadata contains file_size)
      const { data: messagesWithFiles } = await supabaseClient
        .from('messages')
        .select('metadata')
        .eq('sender_id', userId)
        .not('metadata', 'is', null)

      let totalStorageBytes = 0
      if (messagesWithFiles) {
        messagesWithFiles.forEach((msg: any) => {
          if (msg.metadata && typeof msg.metadata === 'object') {
            const fileSize = msg.metadata.file_size
            if (typeof fileSize === 'number') {
              totalStorageBytes += fileSize
            }
          }
        })
      }
      storageUsed = totalStorageBytes / (1024 * 1024) // Convert to MB

      // Count workspaces user is member of
      const { count: workspacesCount } = await supabaseClient
        .from('workspace_members')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
      
      workspacesUsed = workspacesCount || 0

      // Count total members across all user's workspaces
      // First get all workspace IDs
      const { data: userWorkspaces } = await supabaseClient
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', userId)

      if (userWorkspaces && userWorkspaces.length > 0) {
        const workspaceIds = userWorkspaces.map((w:any) => w.workspace_id)
        
        const { count: membersCount } = await supabaseClient
          .from('workspace_members')
          .select('*', { count: 'exact', head: true })
          .in('workspace_id', workspaceIds)
        
        membersUsed = membersCount || 0
      }

      // Also include avatar storage if exists
      // Check user's avatar_url to see if it's in storage
      const { data: userProfile } = await supabaseClient
        .from('users')
        .select('avatar_url')
        .eq('id', userId)
        .single()

      // If avatar is in storage, we could estimate its size (typically 50-200KB)
      // For now, we'll skip this as it's usually small compared to message files
    }

    return NextResponse.json({
      success: true,
      data: {
        messagesUsed,
        storageUsed: Math.round(storageUsed * 100) / 100, // Round to 2 decimal places
        workspacesUsed,
        membersUsed,
      },
    })
  } catch (error: any) {
    console.error('Usage calculation error:', error)
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Failed to calculate usage',
      },
      { status: 500 }
    )
  }
}






































































