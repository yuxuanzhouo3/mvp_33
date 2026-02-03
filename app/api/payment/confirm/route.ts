import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { updateUserSubscriptionAfterPayment } from '@/lib/payment/subscription-update'
import { getCloudBaseDb } from '@/lib/cloudbase/client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      order_no,
      payment_provider_order_id,
      payment_status,
      payment_data,
    } = body

    if (!order_no || !payment_status) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing required fields: order_no, payment_status',
        },
        { status: 400 }
      )
    }

    // Get user from global system (primary) for authentication
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: 'Authentication required',
        },
        { status: 401 }
      )
    }

    // Get database client based on user IP and profile
    const dbClient = await getDatabaseClientForUser(request)

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
              status: payment_status === 'paid' ? 'completed' : 'failed',
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
            status: payment_status === 'paid' ? 'completed' : 'failed',
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
    if (payment_status === 'paid' && order) {
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
    }

    return NextResponse.json({
      success: true,
      message: 'Payment confirmed successfully',
      data: {
        order_no: order_no,
        payment_status: payment_status || 'paid',
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

