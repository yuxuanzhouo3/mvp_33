import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createGroup } from '@/lib/database/supabase/groups'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { userIds, workspaceId } = await request.json()

    // TEMP: Allow creating group with 0 or more members (creator will be added automatically)
    // if (!userIds || userIds.length < 2) {
    //   return NextResponse.json(
    //     { error: 'At least 2 members required' },
    //     { status: 400 }
    //   )
    // }

    const result = await createGroup(user.id, userIds, workspaceId)

    if (!result) {
      return NextResponse.json(
        { error: 'Failed to create group' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      groupId: result.groupId
    })
  } catch (error) {
    console.error('Create group error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
