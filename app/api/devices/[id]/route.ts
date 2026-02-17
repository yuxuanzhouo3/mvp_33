import { NextRequest, NextResponse } from 'next/server'
import { deleteDevice } from '@/lib/database/devices'
import { createClient } from '@/lib/supabase/server'
import { verifyCloudBaseSession } from '@/lib/cloudbase/auth'
import { IS_DOMESTIC_VERSION } from '@/config'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    let userId: string | null = null

    if (IS_DOMESTIC_VERSION) {
      const user = await verifyCloudBaseSession(request)
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    } else {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    await deleteDevice(params.id, userId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete device error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete device' },
      { status: 500 }
    )
  }
}
