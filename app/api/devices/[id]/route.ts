import { NextRequest, NextResponse } from 'next/server'
import { deleteDevice } from '@/lib/database/devices'
import { createClient } from '@/lib/supabase/server'
import { verifyCloudBaseSession } from '@/lib/cloudbase/auth'
import { IS_DOMESTIC_VERSION } from '@/config'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params
    console.log('[DELETE DEVICE API] Device ID:', params.id)

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
      console.log('[DELETE DEVICE API] User ID:', userId)
    }

    console.log('[DELETE DEVICE API] Calling deleteDevice...')
    await deleteDevice(params.id, userId)
    console.log('[DELETE DEVICE API] Device deleted successfully')
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE DEVICE API] Delete device error:', error)
    console.error('[DELETE DEVICE API] Error message:', error.message)
    console.error('[DELETE DEVICE API] Error stack:', error.stack)
    return NextResponse.json(
      { error: error.message || 'Failed to delete device' },
      { status: 500 }
    )
  }
}
