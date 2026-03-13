import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { IS_DOMESTIC_VERSION } = await import('@/config')

    if (IS_DOMESTIC_VERSION) {
      const {
        getCloudBaseAuthFromRequest,
        clearCloudBaseSessionCookie,
        revokeCloudBaseSessionToken,
      } = await import('@/lib/cloudbase/auth')
      const { updateUser: updateCloudBaseUser } = await import('@/lib/cloudbase/database')

      const auth = await getCloudBaseAuthFromRequest(request)
      const response = NextResponse.json({
        success: true,
        message: 'Logged out successfully',
      })

      if (auth) {
        console.log('[LOGOUT] Updating CloudBase user status to offline for user:', auth.user.id)
        try {
          await updateCloudBaseUser(auth.user.id, { status: 'offline' })
          console.log('[LOGOUT] Successfully updated CloudBase user status to offline')
        } catch (cloudbaseError: any) {
          console.warn('[LOGOUT] Failed to update CloudBase user status:', cloudbaseError?.message || cloudbaseError)
        }

        try {
          await revokeCloudBaseSessionToken(auth.token, auth.user.id, 'logout')
          console.log('[LOGOUT] CloudBase session revoked')
        } catch (revokeError: any) {
          console.warn('[LOGOUT] Failed to revoke CloudBase session:', revokeError?.message || revokeError)
        }
      } else {
        console.warn('[LOGOUT] No CloudBase session found, skipping status update')
      }

      clearCloudBaseSessionCookie(response)
      return response
    }

    const supabase = await createClient()

    // Get current user before signing out
    const { data: { user: currentUser } } = await supabase.auth.getUser()

    // Update user status to offline before signing out
    if (currentUser) {
      console.log('[LOGOUT] Updating user status to offline for user:', currentUser.id)

      // 1) Update Supabase users table (global region)
      try {
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({ status: 'offline', updated_at: new Date().toISOString() })
          .eq('id', currentUser.id)
          .select()
          .maybeSingle()

        if (updateError) {
          console.error('[LOGOUT] Failed to update Supabase user status to offline:', updateError)
        } else if (updatedUser) {
          console.log('[LOGOUT] Successfully updated Supabase user status to offline')
        }
      } catch (supabaseError) {
        console.error('[LOGOUT] Error updating Supabase user status:', supabaseError)
      }

      // 2) Also try to update CloudBase user status to offline (China region users)
      try {
        const { updateUser: updateCloudBaseUser } = await import('@/lib/cloudbase/database')
        await updateCloudBaseUser(currentUser.id, { status: 'offline' })
        console.log('[LOGOUT] Successfully updated CloudBase user status to offline')
      } catch (cloudbaseError: any) {
        // CloudBase may not be configured or user may not exist there – that's okay
        console.warn('[LOGOUT] Skipping CloudBase status update or failed to update:', cloudbaseError?.message || cloudbaseError)
      }
    } else {
      console.warn('[LOGOUT] No current user found in Supabase, skipping Supabase status update')
      // We could still try to clear CloudBase session cookie via middleware if needed
    }

    // Sign out from Supabase
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('[LOGOUT] Sign out error:', error)
      return NextResponse.json(
        { error: error.message || 'Logout failed' },
        { status: 500 }
      )
    }

    console.log('[LOGOUT] Successfully signed out')
    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    })
  } catch (error: any) {
    console.error('[LOGOUT] Logout error:', error)
    return NextResponse.json(
      { error: error.message || 'Logout failed' },
      { status: 500 }
    )
  }
}
