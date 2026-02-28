import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaces, createWorkspace as createCloudBaseWorkspace } from '@/lib/cloudbase/workspaces'
import { getCloudBaseUser } from '@/lib/cloudbase/auth'
import { v4 as uuidv4 } from 'uuid'
import { getDeploymentRegion } from '@/config'

/**
 * Get user's workspaces
 * GET /api/workspaces
 */
export async function GET(request: NextRequest) {
  const requestId = Date.now().toString(36)
  console.log(`\n[${requestId}] ========== GET /api/workspaces ==========`)
  console.log(`[${requestId}] Timestamp:`, new Date().toISOString())

  try {
    const deploymentRegion = getDeploymentRegion()
    console.log(`[${requestId}] Deployment region:`, deploymentRegion)

    // For China region, use CloudBase
    if (deploymentRegion === 'CN') {
      console.log(`[${requestId}] Using CloudBase (CN region)`)
      const currentUser = await getCloudBaseUser(request)

      console.log(`[${requestId}] CloudBase user:`, currentUser ? { id: currentUser.id, email: currentUser.email } : null)

      if (!currentUser) {
        console.log(`[${requestId}] ❌ Unauthorized - No CloudBase user`)
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const workspaces = await getWorkspaces(currentUser.id)
      console.log(`[${requestId}] CloudBase workspaces result:`, workspaces?.length || 0, 'workspaces')
      return NextResponse.json({
        success: true,
        workspaces: workspaces || []
      })
    }

    // For international region, use Supabase
    console.log(`[${requestId}] Using Supabase (International region)`)
    const supabase = await createClient()

    console.log(`[${requestId}] Getting auth user...`)
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    console.log(`[${requestId}] Auth result:`, {
      userId: user?.id || null,
      userEmail: user?.email || null,
      authError: authError ? authError.message : null
    })

    if (!user) {
      console.log(`[${requestId}] ❌ Unauthorized - No user found`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspaces where user is a member (through workspace_members table)
    console.log(`[${requestId}] Querying workspace_members for user_id:`, user.id)

    const { data: memberWorkspaces, error } = await supabase
      .from('workspace_members')
      .select(`
        workspaces (
          id,
          name,
          domain,
          logo_url,
          owner_id,
          invite_code,
          settings,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', user.id)

    console.log(`[${requestId}] Query result:`, {
      rowCount: memberWorkspaces?.length || 0,
      error: error ? { message: error.message, code: error.code, details: error.details } : null,
      rawData: memberWorkspaces
    })

    if (error) {
      console.error(`[${requestId}] ❌ Get workspaces error:`, error)
      return NextResponse.json(
        { error: 'Failed to get workspaces', details: error.message },
        { status: 500 }
      )
    }

    // Extract workspace data from the join result
    const workspaces = memberWorkspaces
      ?.map((m: any) => m.workspaces)
      .filter(Boolean)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    console.log(`[${requestId}] ✅ Final result: ${workspaces?.length || 0} workspaces`)
    console.log(`[${requestId}] Workspaces:`, workspaces?.map((w: any) => ({ id: w.id, name: w.name })))
    console.log(`[${requestId}] ========== END ==========\n`)

    return NextResponse.json({
      success: true,
      workspaces: workspaces || []
    })
  } catch (error: any) {
    console.error(`[${requestId}] ❌ Unhandled error:`, error)
    console.log(`[${requestId}] ========== END (ERROR) ==========\n`)
    return NextResponse.json(
      { error: 'Internal server error', details: error?.message },
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

    const deploymentRegion = getDeploymentRegion()

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
