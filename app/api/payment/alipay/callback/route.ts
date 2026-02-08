import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { updateUserSubscriptionAfterPayment } from '@/lib/payment/subscription-update'

/**
 * Alipay payment callback handler
 * POST /api/payment/alipay/callback
 */
export async function POST(request: NextRequest) {
  try {
    // Alipay callback format (can be form data or JSON)
    let callbackData: any = {}
    
    try {
      const contentType = request.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        callbackData = await request.json()
      } else {
        // Form data
        const formData = await request.formData()
        formData.forEach((value, key) => {
          callbackData[key] = value
        })
      }
    } catch (e) {
      console.error('Failed to parse Alipay callback data:', e)
      return NextResponse.json({
        success: false,
        message: 'Invalid callback data format'
      }, { status: 400 })
    }

    // Extract order information from callback
    const order_no = callbackData.out_trade_no || callbackData.trade_no
    const trade_status = callbackData.trade_status
    const trade_no = callbackData.trade_no || callbackData.trade_no
    
    // Determine payment status
    const payment_status = (trade_status === 'TRADE_SUCCESS' || trade_status === 'TRADE_FINISHED') ? 'paid' : 'failed'
    const payment_provider_order_id = trade_no || ''

    if (!order_no) {
      console.warn('Alipay callback missing order_no')
      return NextResponse.json({
        success: false,
        message: 'Missing order_no'
      }, { status: 400 })
    }

    // Get database client (for CloudBase CN users)
    const dbClient = await getDatabaseClientForUser(request)
    
    // Find order in the appropriate database
    let order: any = null
    
    if (dbClient.type === 'cloudbase') {
      // CloudBase
      const db = dbClient.cloudbase
      try {
        const orderResult = await db.collection('orders')
          .where({ order_no: order_no })
          .get()
        
        if (orderResult.data && orderResult.data.length > 0) {
          order = orderResult.data[0]
        }
      } catch (error: any) {
        console.warn('CloudBase order query error:', error)
      }
    } else {
      // Supabase - try to find order
      try {
        const { data: foundOrder } = await dbClient.supabase
          .from('orders')
          .select('*')
          .eq('order_no', order_no)
          .single()
        
        order = foundOrder
      } catch (error: any) {
        console.warn('Supabase order query error:', error)
      }
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
              status: payment_status === 'paid' ? 'completed' : 'failed',
              payment_provider_order_id: payment_provider_order_id || null,
              payment_data: callbackData || null,
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
            status: payment_status === 'paid' ? 'completed' : 'failed',
            payment_provider_order_id,
            payment_data: callbackData,
            updated_at: new Date().toISOString(),
          })
          .eq('order_no', order_no)

        if (updateError) {
          console.warn('Supabase order update error:', updateError)
        }
      }

      // If payment is successful, update user subscription
      if (payment_status === 'paid' && order.user_id) {
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
              order.user_id,
              planDescription,
              dbClient
            )
            
            console.log('[Alipay Callback] Subscription updated for user:', order.user_id)
          } else {
            console.warn('[Alipay Callback] No plan description found in order:', order_no)
          }
        } catch (updateSubError: any) {
          // Log error but don't fail the callback
          console.error('[Alipay Callback] Subscription update error:', updateSubError)
        }
      }
    } else {
      console.warn(`[Alipay Callback] Order ${order_no} not found`)
    }

    // Return format required by Alipay
    return NextResponse.text('success')
  } catch (error: any) {
    console.error('[Alipay Callback] Error:', error)
    return NextResponse.text('fail', { status: 500 })
  }
}





















