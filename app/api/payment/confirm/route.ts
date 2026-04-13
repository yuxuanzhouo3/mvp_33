import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { updateUserSubscriptionAfterPayment } from '@/lib/payment/subscription-update'
import { handleInviteeFirstPaidOrder } from '@/lib/market/invite-program'
import { markCouponUsedFromOrder } from '@/lib/payment/coupon-tracking'
import { handleMarketingAttributedOrderPaid } from '@/lib/payment/marketing-attribution'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      order_no,
      payment_provider_order_id,
      payment_status,
      payment_data,
    } = body
    const isPaymentSuccess = payment_status === 'paid' || payment_status === 'completed'
    const normalizedPaymentStatus = isPaymentSuccess ? 'completed' : 'failed'

    if (!order_no || !payment_status) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing required fields: order_no, payment_status',
        },
        { status: 400 }
      )
    }

    // Get database client based on user IP and profile
    const dbClient = await getDatabaseClientForUser(request)
    const isCloudbase = dbClient.type === 'cloudbase' && dbClient.region === 'cn'

    let user: { id: string } | null = null
    if (isCloudbase) {
      const { verifyCloudBaseSession } = await import('@/lib/cloudbase/auth')
      const cloudBaseUser = await verifyCloudBaseSession(request)
      if (cloudBaseUser) {
        user = { id: cloudBaseUser.id }
      }
    } else {
      const supabase = dbClient.supabase || await createClient()
      const { data: { user: supabaseUser } } = await supabase.auth.getUser()
      if (supabaseUser) {
        user = { id: supabaseUser.id }
      }
    }

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'Authentication required',
        },
        { status: 401 }
      )
    }

    // Find order in the appropriate database
    let order: any = null
    
    if (dbClient.type === 'cloudbase') {
      // CloudBase
      const db = dbClient.cloudbase
      try {
        const orderResult = await db.collection('orders')
          .where({ order_no: order_no, user_id: user.id })
          .get()
        
        if (orderResult.data && orderResult.data.length > 0) {
          order = orderResult.data[0]
        }
      } catch (error: any) {
        console.warn('CloudBase order query error:', error)
      }
    } else {
      // Supabase
      const { data: foundOrder } = await dbClient.supabase
        .from('orders')
        .select('*')
        .eq('order_no', order_no)
        .eq('user_id', user.id)
        .single()
      
      order = foundOrder
    }

    // Update order status
    if (order) {
      if (dbClient.type === 'cloudbase') {
        // CloudBase
        const db = dbClient.cloudbase
        try {
          await db.collection('orders')
            .doc(order.id || order._id)
            .update({
              status: normalizedPaymentStatus,
              payment_status: normalizedPaymentStatus,
              payment_provider_order_id: payment_provider_order_id || null,
              payment_data: payment_data || null,
              updated_at: new Date()
            })
        } catch (error: any) {
          console.warn('CloudBase order update error:', error)
        }
      } else {
        // Supabase
        const { error: updateError } = await dbClient.supabase
          .from('orders')
          .update({
            status: normalizedPaymentStatus,
            payment_status: normalizedPaymentStatus,
            payment_provider_order_id,
            payment_data,
            updated_at: new Date().toISOString(),
          })
          .eq('order_no', order_no)
          .eq('user_id', user.id)

        if (updateError) {
          console.warn('Supabase order update error:', updateError)
        }
      }
    } else {
      console.warn(`Order ${order_no} not found`)
    }

    // If payment is successful, update user subscription
    if (isPaymentSuccess && order) {
      if (order.coupon_id) {
        try {
          await markCouponUsedFromOrder({
            dbType: dbClient.type,
            couponId: order.coupon_id,
            orderNo: order_no,
            userId: String(order.user_id || user.id),
          })
          console.log(`[confirmPayment] Marked coupon ${order.coupon_id} as used for order ${order_no}`)
        } catch (couponError) {
          console.error('[confirmPayment] Failed to update coupon status:', couponError)
        }
      }

      try {
        await handleMarketingAttributedOrderPaid({
          order,
          orderNo: order_no,
        })
      } catch (commissionError) {
        console.error('[confirmPayment] Failed to record partner commission:', commissionError)
      }

      try {
        // Extract plan description from order
        const planDescription = order.description || 
          order.payment_provider_response?.description || 
          (typeof order.payment_provider_response === 'string' 
            ? JSON.parse(order.payment_provider_response || '{}').description 
            : '') ||
          ''

        if (planDescription) {
          // Update subscription using the same database client
          await updateUserSubscriptionAfterPayment(
            user.id,
            planDescription,
            dbClient
          )
          
          // Wait a bit for database sync
          await new Promise(resolve => setTimeout(resolve, 1000))
        } else {
          console.warn('[confirmPayment] No plan description found in order:', order_no)
        }
      } catch (updateSubError: any) {
        // Log error but don't fail the payment confirmation
        console.error('[confirmPayment] Subscription update error:', updateSubError)
      }

      try {
        await handleInviteeFirstPaidOrder({
          userId: String(order.user_id || user.id),
          orderNo: order_no,
        })
      } catch (inviteError) {
        console.error('[confirmPayment] Invite first-order reward error:', inviteError)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment confirmed successfully',
      data: {
        order_no: order_no,
        payment_status: normalizedPaymentStatus,
        payment_provider_order_id: payment_provider_order_id
      }
    })
  } catch (error: any) {
    console.error('Payment confirmation error:', error)
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Payment confirmation failed',
      },
      { status: 500 }
    )
  }
}
