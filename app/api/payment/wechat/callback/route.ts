import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { updateUserSubscriptionAfterPayment } from '@/lib/payment/subscription-update'
import { getCloudBaseDb } from '@/lib/cloudbase/client'

/**
 * WeChat payment callback handler
 * POST /api/payment/wechat/callback
 */
export async function POST(request: NextRequest) {
  try {
    // WeChat payment V3 API callback format
    let callbackData: any = {}
    
    try {
      const body = await request.json()
      callbackData = body
    } catch (e) {
      // If JSON parse fails, try to get from body as string
      const bodyText = await request.text()
      try {
        callbackData = JSON.parse(bodyText)
      } catch (e2) {
        console.error('Failed to parse WeChat callback data:', e2)
        return NextResponse.json({
          code: 'FAIL',
          message: 'Invalid callback data format'
        }, { status: 400 })
      }
    }

    // Extract order information from callback
    // WeChat V3 format: resource.data contains encrypted data, or directly in body
    const order_no = callbackData.out_trade_no || callbackData.resource?.data?.out_trade_no
    const trade_state = callbackData.trade_state || callbackData.resource?.data?.trade_state
    const transaction_id = callbackData.transaction_id || callbackData.resource?.data?.transaction_id
    
    // Determine payment status
    const payment_status = (trade_state === 'SUCCESS' || trade_state === 'TRADE_SUCCESS') ? 'paid' : 'failed'
    const payment_provider_order_id = transaction_id || ''

    if (!order_no) {
      console.warn('WeChat callback missing order_no')
      return NextResponse.json({
        code: 'FAIL',
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
            
            console.log('[WeChat Callback] Subscription updated for user:', order.user_id)
          } else {
            console.warn('[WeChat Callback] No plan description found in order:', order_no)
          }
        } catch (updateSubError: any) {
          // Log error but don't fail the callback
          console.error('[WeChat Callback] Subscription update error:', updateSubError)
        }
      }
    } else {
      console.warn(`[WeChat Callback] Order ${order_no} not found`)
    }

    // Return format required by WeChat
    return NextResponse.json({
      code: 'SUCCESS',
      message: 'Success'
    })
  } catch (error: any) {
    console.error('[WeChat Callback] Error:', error)
    return NextResponse.json({
      code: 'FAIL',
      message: 'Processing failed'
    }, { status: 500 })
  }
}





















