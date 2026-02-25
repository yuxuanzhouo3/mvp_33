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

    console.log('[Lookup] ========== 开始查找工作区 ==========')
    console.log('[Lookup] 原始邀请码:', JSON.stringify(inviteCode))
    console.log('[Lookup] 邀请码长度:', inviteCode?.length)
    console.log('[Lookup] 邀请码字符代码:', inviteCode?.split('').map(c => c.charCodeAt(0)).join(', '))

    if (!inviteCode || !inviteCode.trim()) {
      console.log('[Lookup] 错误: 邀请码为空')
      return NextResponse.json(
        { error: 'Invite code is required' },
        { status: 400 }
      )
    }

    const normalizedCode = inviteCode.toUpperCase().trim()
    const deploymentRegion = process.env.NEXT_PUBLIC_DEPLOYMENT_REGION

    console.log('[Lookup] 标准化后的邀请码:', JSON.stringify(normalizedCode))
    console.log('[Lookup] 标准化后长度:', normalizedCode.length)
    console.log('[Lookup] 部署区域:', deploymentRegion)
    console.log('[Lookup] 是否为国内版 (CN):', deploymentRegion === 'CN')

    // 国内版：从CloudBase数据库查询工作区
    if (deploymentRegion === 'CN') {
      console.log('[Lookup] 使用 CloudBase 查询国内版数据库')
      const workspace = await getWorkspaceByInviteCode(normalizedCode)
      console.log('[Lookup] CloudBase 查询结果:', JSON.stringify(workspace))

      if (!workspace) {
        console.log('[Lookup] CloudBase 未找到工作区，邀请码:', JSON.stringify(normalizedCode))
        return NextResponse.json(
          { error: 'Workspace not found', searchedCode: normalizedCode },
          { status: 404 }
        )
      }

      console.log('[Lookup] CloudBase 成功找到工作区:', workspace.name)

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
    console.log('[Lookup] 使用 Supabase 查询国际版数据库')
    const supabase = await createClient()

    console.log('[Lookup] 执行查询: invite_code =', JSON.stringify(normalizedCode))

    const { data: workspace, error } = await supabase
      .from('workspaces')
      .select('id, name, domain, logo_url, invite_code')
      .eq('invite_code', normalizedCode)
      .maybeSingle()

    console.log('[Lookup] 查询结果:', JSON.stringify(workspace))
    console.log('[Lookup] 查询错误:', error)

    // 额外调试：尝试模糊查询看看有没有相似的
    const { data: similarWorkspaces } = await supabase
      .from('workspaces')
      .select('id, name, invite_code')
      .ilike('invite_code', `%${normalizedCode.substring(0, 4)}%`)
      .limit(5)

    console.log('[Lookup] 相似的工作区 (前4字符匹配):', JSON.stringify(similarWorkspaces))

    if (error) {
      console.error('[Lookup] 查询出错:', error)
      return NextResponse.json(
        { error: 'Failed to lookup workspace', details: error.message },
        { status: 500 }
      )
    }

    if (!workspace) {
      console.log('[Lookup] 未找到工作区，邀请码:', JSON.stringify(normalizedCode))
      return NextResponse.json(
        { error: 'Workspace not found', searchedCode: normalizedCode },
        { status: 404 }
      )
    }

    console.log('[Lookup] 成功找到工作区:', workspace.name)

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
