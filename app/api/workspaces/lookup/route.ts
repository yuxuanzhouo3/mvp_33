import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { getWorkspaceByInviteCode } from '@/lib/cloudbase/workspaces'

/**
 * Lookup a workspace by invite code (preview only, does not join)
 * GET /api/workspaces/lookup?code=XXXXXX
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const inviteCode = searchParams.get('code')

    if (!inviteCode || !inviteCode.trim()) {
      return NextResponse.json(
        { error: 'Invite code is required' },
        { status: 400 }
      )
    }

    const normalizedCode = inviteCode.toUpperCase().trim()
    const deploymentRegion = process.env.NEXT_PUBLIC_DEPLOYMENT_REGION

    // 国内版：从CloudBase数据库查询工作区
    if (deploymentRegion === 'CN') {
      const workspace = await getWorkspaceByInviteCode(normalizedCode)
      if (!workspace) {
        return NextResponse.json(
          { error: 'Workspace not found' },
          { status: 404 }
        )
      }

      // 返回公开信息（不包含敏感数据）
      return NextResponse.json({
        workspace: {
          id: workspace.id || workspace._id,
          name: workspace.name,
          domain: workspace.domain,
          logo_url: workspace.logo_url,
          description: workspace.description,
        }
      })
    }

    // 国际版：从Supabase查询工作区
    const supabase = await createClient()
    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('id, name, domain, logo_url')
      .eq('invite_code', normalizedCode)
      .maybeSingle()

    if (error) {
      console.error('Lookup workspace error:', error)
      return NextResponse.json(
        { error: 'Failed to lookup workspace' },
        { status: 500 }
      )
    }

    if (!workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        domain: workspace.domain,
        logo_url: workspace.logo_url,
      }
    })
  } catch (error: any) {
    console.error('Lookup workspace error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to lookup workspace' },
      { status: 500 }
    )
  }
}
