import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()

    if (!currentUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      )
    }

    const dbClient = await getDatabaseClientForUser(request)

    let subscriptionType: 'free' | 'monthly' | 'yearly' | null = 'free'
    let expiresAt: string | null = null

    if (dbClient.type === 'cloudbase') {
      // CN region: read from CloudBase users collection
      try {
        const { getUserById } = await import('@/lib/database/cloudbase/users')
        const user = await getUserById(currentUser.id)
        if (user && (user as any).subscription_type) {
          const t = (user as any).subscription_type
          if (t === 'monthly' || t === 'yearly') {
            subscriptionType = t
          }
        }
        if (user && (user as any).subscription_expires_at) {
          const raw = (user as any).subscription_expires_at
          const d = raw instanceof Date ? raw : new Date(raw)
          if (!isNaN(d.getTime())) {
            expiresAt = d.toISOString()
          }
        }
      } catch (err) {
        console.error('[SUBSCRIPTION] CloudBase read error:', err)
      }
    } else {
      // Global region: read from Supabase users table
      try {
        const { data, error } = await dbClient.supabase
          .from('users')
          .select('subscription_type, subscription_expires_at')
          .eq('id', currentUser.id)
          .maybeSingle()

        if (!error && data) {
          if (data.subscription_type === 'monthly' || data.subscription_type === 'yearly') {
            subscriptionType = data.subscription_type
          }
          if (data.subscription_expires_at) {
            const d = new Date(data.subscription_expires_at)
            if (!isNaN(d.getTime())) {
              expiresAt = d.toISOString()
            }
          }
        }
      } catch (err) {
        console.error('[SUBSCRIPTION] Supabase read error:', err)
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        subscription_type: subscriptionType,
        subscription_expires_at: expiresAt,
      },
    })
  } catch (error: any) {
    console.error('[SUBSCRIPTION] API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to load subscription',
      },
      { status: 500 }
    )
  }
}












































