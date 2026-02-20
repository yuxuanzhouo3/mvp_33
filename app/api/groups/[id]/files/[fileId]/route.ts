import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCloudBaseDb } from '@/lib/cloudbase/client'
import { getDatabaseClientForUser } from '@/lib/database-router'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; fileId: string }> }
) {
  try {
    // Verify authentication based on version
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

    const { fileId } = await params

    const dbClient = await getDatabaseClientForUser()

    // CN users: delete from CloudBase
    if (dbClient.type === 'cloudbase' && dbClient.region === 'cn' && dbClient.cloudbase) {
      const db = getCloudBaseDb()
      if (!db) {
        return NextResponse.json({ error: 'Database not available' }, { status: 500 })
      }

      // Delete file record from CloudBase
      await db.collection('group_files')
        .doc(fileId)
        .remove()

      return NextResponse.json({ success: true })
    }

    // Global users: delete from Supabase
    const supabase = await createClient()
    const { error } = await supabase
      .from('group_files')
      .delete()
      .eq('id', fileId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[GROUP FILES DELETE] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
