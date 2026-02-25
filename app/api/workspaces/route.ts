import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaces, createWorkspace as createCloudBaseWorkspace } from '@/lib/cloudbase/workspaces'
import { getCloudBaseUser } from '@/lib/cloudbase/auth'
import { v4 as uuidv4 } from 'uuid'

/**
 * Get user's workspaces
 * GET /api/workspaces
 */
export async function GET(request: NextRequest) {
  try {
    const deploymentRegion = process.env.NEXT_PUBLIC_DEPLOYMENT_REGION

    // For China region, use CloudBase
    if (deploymentRegion === 'CN') {
      const currentUser = await getCloudBaseUser(request)

      if (!currentUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const workspaces = await getWorkspaces(currentUser.id)
      return NextResponse.json({
        success: true,
        workspaces: workspaces || []
      })
    }

    // For international region, use Supabase
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspaces where user is a member (through workspace_members table)
    const { data: memberWorkspaces, error } = await supabase
      .from('workspace_members')
      .select(`
        workspaces (
          id,
          name,
          domain,
          logo_url,
          description,
          owner_id,
          invite_code,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', user.id)

    if (error) {
      console.error('Get workspaces error:', error)
      return NextResponse.json(
        { error: 'Failed to get workspaces' },
        { status: 500 }
      )
    }

    // Extract workspace data from the join result
    const workspaces = memberWorkspaces
      ?.map((m: any) => m.workspaces)
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({
      success: true,
      workspaces: workspaces || []
    })
  } catch (error) {
    console.error('Get workspaces error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Create a new workspace
 * POST /api/workspaces
 * Body: { name: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, inviteCode } = body

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Workspace name is required' },
        { status: 400 }
      )
    }

    if (!inviteCode || !inviteCode.trim()) {
      return NextResponse.json(
        { error: 'Invite code is required' },
        { status: 400 }
      )
    }

    const deploymentRegion = process.env.NEXT_PUBLIC_DEPLOYMENT_REGION

    // For China region, use CloudBase
    if (deploymentRegion === 'CN') {
      const currentUser = await getCloudBaseUser(request)

      if (!currentUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // Generate domain from name
      const domain = name.toLowerCase().replace(/\s+/g, '-') + '-' + uuidv4().substring(0, 6)

      // Create workspace in CloudBase with invite code
      const workspace = await createCloudBaseWorkspace({
        name: name.trim(),
        domain,
        owner_id: currentUser.id,
        invite_code: inviteCode.trim().toUpperCase(),
      })

      return NextResponse.json({
        success: true,
        workspace
      })
    }

    // For international region, use Supabase
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Generate unique domain
    const domain = name.toLowerCase().replace(/\s+/g, '-') + '-' + uuidv4().substring(0, 6)

    // Create workspace in Supabase with invite code
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .insert({
        name: name.trim(),
        domain,
        owner_id: user.id,
        invite_code: inviteCode.trim().toUpperCase(),
      })
      .select()
      .single()

    if (error) {
      console.error('Create workspace error:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to create workspace' },
        { status: 500 }
      )
    }

    // Add owner as member
    await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: user.id,
        role: 'owner',
      })

    return NextResponse.json({
      success: true,
      workspace
    })
  } catch (error: any) {
    console.error('Create workspace error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
