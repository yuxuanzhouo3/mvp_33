import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaces } from '@/lib/cloudbase/workspaces'

/**
 * Get user's workspaces
 * GET /api/workspaces
 */
export async function GET(request: NextRequest) {
  try {
    const deploymentRegion = process.env.NEXT_PUBLIC_DEPLOYMENT_REGION

    // For China region, use CloudBase
    if (deploymentRegion === 'CN') {
      const workspaces = await getWorkspaces()
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

    // Get workspaces where user is a member
    const { data: workspaces, error } = await supabase
      .from('workspaces')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Get workspaces error:', error)
      return NextResponse.json(
        { error: 'Failed to get workspaces' },
        { status: 500 }
      )
    }

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
