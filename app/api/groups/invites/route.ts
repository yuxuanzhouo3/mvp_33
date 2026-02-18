import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCloudBaseDb } from '@/lib/cloudbase/client'

const isCloudBase = process.env.NEXT_PUBLIC_DEFAULT_LANGUAGE === 'zh' && !process.env.FORCE_GLOBAL_DATABASE

export async function GET(request: Request) {
  try {
    const { IS_DOMESTIC_VERSION } = await import('@/config')
    let user: any = null

    if (IS_DOMESTIC_VERSION) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (!cloudBaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = cloudBaseUser
    } else {
      const supabase = await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (!supabaseUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      user = supabaseUser
    }

    let invites = []

    if (IS_DOMESTIC_VERSION) {
      // CloudBase 实现
      const db = getCloudBaseDb()
      if (!db) {
        return NextResponse.json({ error: 'Database not available' }, { status: 500 })
      }

      const membersRes = await db.collection('conversation_members')
        .where({
          user_id: user.id,
          join_status: 'pending'
        })
        .get()

      const members = membersRes.data || []

      // 获取群组详情
      if (members.length > 0) {
        const groupIds = members.map((m: any) => m.conversation_id)
        const groupsRes = await db.collection('conversations')
          .where({
            id: db.command.in(groupIds),
            type: 'group'
          })
          .get()

        const groups = groupsRes.data || []
        invites = members.map((m: any) => {
          const group = groups.find((g: any) => g.id === m.conversation_id)
          return {
            ...m,
            group
          }
        })
      }
    } else {
      // Supabase 实现
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('conversation_members')
        .select(`
          *,
          conversations!conversation_members_conversation_id_fkey (*)
        `)
        .eq('user_id', user.id)
        .eq('join_status', 'pending')
        .eq('conversations.type', 'group')

      if (error) {
        console.error('Get group invites error:', error)
        return NextResponse.json({ error: 'Failed to get invites' }, { status: 500 })
      }

      invites = data || []
    }

    return NextResponse.json({ success: true, invites })
  } catch (error) {
    console.error('Get group invites error:', error)
    return NextResponse.json(
      { error: 'Failed to get group invites' },
      { status: 500 }
    )
  }
}
