import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseClient } from '@/lib/database-router'

/**
 * Get workspace members for current user
 * GET /api/workspace-members?workspaceId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const workspaceId = searchParams.get('workspaceId')

    const dbClient = await getDatabaseClient()
    const userRegion = dbClient.region === 'cn' ? 'cn' : 'global'

    console.log('[API /api/workspace-members] Database:', {
      type: dbClient.type,
      region: userRegion,
      workspaceId
    })

    // CN version: use CloudBase
    if (dbClient.type === 'cloudbase' && userRegion === 'cn') {
      // Get current user from headers (CloudBase auth)
      const userId = request.headers.get('x-user-id')
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Import CloudBase services
      const { getUserService, getChatService } = await import('@/lib/services')
      const chatService = getChatService()

      // Get user's workspaces
      const workspaces = await chatService.getUserWorkspaces(userId)

      // If no workspaceId provided, use first workspace
      const targetWorkspaceId = workspaceId || (workspaces.length > 0 ? workspaces[0] : null)

      if (!targetWorkspaceId) {
        return NextResponse.json({
          success: true,
          members: []
        })
      }

      // Get workspace members
      const members = await chatService.getWorkspaceMembers(targetWorkspaceId)

      // Filter out current user
      const otherMembers = members.filter((m: any) => m.user_id !== userId)

      return NextResponse.json({
        success: true,
        members: otherMembers,
        workspaceId: targetWorkspaceId
      })
    }

    // INTL version: use Supabase
    // RLS policies have been fixed - no more infinite recursion
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspace members from Supabase
    let query = supabase
      .from('workspace_members')
      .select(`
        user_id,
        role,
        workspaces!workspace_members_workspace_id_fkey (
          id,
          name,
          domain
        ),
        users!workspace_members_user_id_fkey (
          id,
          email,
          full_name,
          username,
          avatar_url,
          title,
          status,
          status_message
        )
      `)
      .neq('user_id', user.id) // Exclude current user

    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId)
    }

    const { data: members, error } = await query

    if (error) {
      console.error('Error fetching workspace members:', error)
      return NextResponse.json(
        { error: 'Failed to fetch workspace members' },
        { status: 500 }
      )
    }

    // Transform data
    const transformedMembers = (members || []).map((m: any) => ({
      ...m.users,
      role: m.role,
      workspace: m.workspaces
    })).filter(Boolean)

    return NextResponse.json({
      success: true,
      members: transformedMembers,
      workspaceId: workspaceId || (members?.[0]?.workspaces?.[0]?.id)
    })
  } catch (error: any) {
    console.error('Get workspace members error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get workspace members' },
      { status: 500 }
    )
  }
}
