import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'

// Generate order number
const generateOrderNo = () => {
  return `ORDER${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { amount, currency, payment_method, region, description } = body

    // Validate parameters
    if (!amount || !payment_method) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing required fields: amount, payment_method',
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
          message: 'Authentication required. Please login first.',
          error: 'Missing authentication token',
        },
        { status: 401 }
      )
    }

    // Get database client based on user IP and profile
    // This automatically routes to CloudBase (CN) or Supabase (Global)
    const dbClient = await getDatabaseClientForUser(request)
    
    // Validate payment method based on region
    // China region: only allow WeChat Pay and Alipay
    // Global region: only allow Stripe and PayPal
    const isChinaRegion = dbClient.region === 'cn'
    const chinaPaymentMethods = ['wechat', 'alipay']
    const globalPaymentMethods = ['stripe', 'paypal']
    
    if (isChinaRegion && !chinaPaymentMethods.includes(payment_method.toLowerCase())) {
      return NextResponse.json(
        {
          success: false,
          message: `Payment method "${payment_method}" is not available in China region. Please use WeChat Pay or Alipay.`,
        },
        { status: 400 }
      )
    }
    
    if (!isChinaRegion && !globalPaymentMethods.includes(payment_method.toLowerCase())) {
      return NextResponse.json(
        {
          success: false,
          message: `Payment method "${payment_method}" is not available in your region. Please use Stripe or PayPal.`,
        },
        { status: 400 }
      )
    }
    
    // Generate order number
    const order_no = generateOrderNo()

    // Create order in the appropriate database (CloudBase for CN, Supabase for Global)
    let order: any = null
    let orderError: any = null
    
    if (dbClient.type === 'cloudbase') {
      // Use CloudBase for China region
      try {
        const db = dbClient.cloudbase
        const result = await db.collection('orders').add({
          order_no,
          user_id: user.id,
          amount,
          currency,
          payment_method,
          region: dbClient.region,
          description,
          status: 'pending',
          created_at: new Date()
        })
        order = { id: result.id, ...result.data, order_no }
      } catch (error: any) {
        orderError = error
        console.warn(`Orders collection not found in CloudBase, using mock mode:`, error.message)
      }
    } else {
      // Use Supabase for Global region
      const { data, error } = await dbClient.supabase
        .from('orders')
        .insert({
          order_no,
          user_id: user.id,
          amount,
          currency,
          payment_method,
          region: dbClient.region,
          description,
          status: 'pending',
          created_at: new Date().toISOString(),
        })
        .select()
        .single()
      
      order = data
      orderError = error
      
      if (orderError) {
        console.warn(`Orders table not found in ${dbClient.region} system, using mock mode`)
      }
    }

    // Prepare response based on payment method
    const response: any = {
      success: true,
      data: {
        order_no,
      },
    }

    // Call payment service based on payment method
    if (payment_method === 'stripe') {
      try {
        const stripeResponse = await fetch(`${request.nextUrl.origin}/api/payment/stripe/create-intent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount,
            currency,
            order_no,
            user_id: user.id,
            description
          }),
        })
        
        const safeErrorNote = 'Stripe payment is not available right now. Please try again later or use PayPal.'

        if (stripeResponse.ok) {
          const stripeData = await stripeResponse.json()
          if (stripeData.success && stripeData.data?.client_secret) {
            response.data.client_secret = stripeData.data.client_secret
            response.data.payment_intent_id = stripeData.data.payment_intent_id
          } else {
            // When Stripe returns an error, mark as note only, DO NOT send mock client_secret
            response.data.note = stripeData.message || safeErrorNote
          }
        } else {
          // Stripe create-intent failed (e.g., ECONNRESET) – do not provide mock client_secret
          response.data.note = safeErrorNote
        }
      } catch (error: any) {
        // Network / connection error – keep it as a note, frontend will show error instead of calling Stripe.js
        response.data.note = 'Stripe payment is not available right now. Please try again later or use PayPal.'
      }
    } else if (payment_method === 'paypal') {
      try {
        const paypalResponse = await fetch(`${request.nextUrl.origin}/api/payment/paypal/create-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount,
            currency,
            order_no,
            description
          }),
        })
        
        if (paypalResponse.ok) {
          const paypalData = await paypalResponse.json()
          if (paypalData.success && paypalData.data?.order_id) {
            response.data.order_id = paypalData.data.order_id
            response.data.approval_url = paypalData.data.approval_url
          } else {
            response.data.order_id = `PAYPAL_${order_no}`
            response.data.note = paypalData.message || 'PayPal payment not configured'
          }
        } else {
          response.data.order_id = `PAYPAL_${order_no}`
          response.data.note = 'PayPal payment not configured'
        }
      } catch (error) {
        response.data.order_id = `PAYPAL_${order_no}`
        response.data.note = 'PayPal payment not configured'
      }
    } else if (payment_method === 'wechat') {
      try {
        const wechatResponse = await fetch(`${request.nextUrl.origin}/api/payment/wechat/create-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount,
            currency,
            order_no,
            description
          }),
        })
        
        if (wechatResponse.ok) {
          const wechatData = await wechatResponse.json()
          if (wechatData.success && wechatData.data?.qr_code) {
            response.data.qr_code = wechatData.data.qr_code
            response.data.payment_url = wechatData.data.payment_url
            response.data.prepay_id = wechatData.data.prepay_id
            response.data.sandbox = wechatData.data.sandbox
          } else {
            response.data.qr_code = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`wechatpay://pay?order_no=${order_no}`)}`
            response.data.note = wechatData.message || 'Mock mode: WeChat payment not configured'
          }
        } else {
          response.data.qr_code = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`wechatpay://pay?order_no=${order_no}`)}`
          response.data.note = 'Mock mode: WeChat payment not configured'
        }
      } catch (error) {
        response.data.qr_code = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`wechatpay://pay?order_no=${order_no}`)}`
        response.data.note = 'Mock mode: WeChat payment not configured'
      }
    } else if (payment_method === 'alipay') {
      try {
        const alipayResponse = await fetch(`${request.nextUrl.origin}/api/payment/alipay/create-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount,
            currency,
            order_no,
            description
          }),
        })
        
        if (alipayResponse.ok) {
          const alipayData = await alipayResponse.json()
          if (alipayData.success && alipayData.data?.qr_code) {
            response.data.qr_code = alipayData.data.qr_code
            response.data.payment_url = alipayData.data.payment_url
            response.data.trade_no = alipayData.data.trade_no
          } else {
            response.data.qr_code = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`alipays://platformapi/startapp?saId=10000007&qrcode=https://qr.alipay.com/${order_no}`)}`
            response.data.note = alipayData.message || 'Mock mode: Alipay payment not configured'
          }
        } else {
          response.data.qr_code = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`alipays://platformapi/startapp?saId=10000007&qrcode=https://qr.alipay.com/${order_no}`)}`
          response.data.note = 'Mock mode: Alipay payment not configured'
        }
      } catch (error) {
        response.data.qr_code = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`alipays://platformapi/startapp?saId=10000007&qrcode=https://qr.alipay.com/${order_no}`)}`
        response.data.note = 'Mock mode: Alipay payment not configured'
      }
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('Payment creation error:', error)
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Payment creation failed',
      },
      { status: 500 }
    )
  }
}

