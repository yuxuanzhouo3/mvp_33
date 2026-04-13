import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import { buildOrderCallbackData, resolveMarketingOrderPricing } from '@/lib/payment/marketing-attribution'

// Generate order number
const generateOrderNo = () => {
  return `ORDER${Date.now()}${Math.random().toString(36).substr(2, 9).toUpperCase()}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { amount, currency, payment_method, region, description, couponCode } = body

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

    // Get database client based on user IP and profile
    // This automatically routes to CloudBase (CN) or Supabase (Global)
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
          message: 'Authentication required. Please login first.',
          error: 'Missing authentication token',
        },
        { status: 401 }
      )
    }

    // --- Coupon Validation & Discount Calculation ---
    const originalAmount = Number(amount)
    let finalAmount = originalAmount
    let couponId: string | undefined
    let callbackData: Record<string, unknown> | null = null

    if (couponCode) {
      try {
        const normalizedCouponCode = String(couponCode || '').trim()
        if (!normalizedCouponCode) {
          throw new Error('Empty coupon code')
        }

        const { getAdminDatabase } = await import('@/lib/admin/database')
        const adminDb = getAdminDatabase(dbClient.type)
        const coupon = await adminDb.getCouponByCode(normalizedCouponCode)

        if (coupon) {
          if (coupon.status === 'active') {
            const issuedToUserId = coupon.issued_to_user_id || coupon.user_id
            // Check if the coupon belongs to the user or is generic
            if (!issuedToUserId || issuedToUserId === user.id) {
              // Check expiration
              const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date()
              if (!isExpired) {
                finalAmount = Math.round(originalAmount * coupon.discount_ratio * 100) / 100
                couponId = coupon.id
                console.log(`[Payment] Applied admin coupon ${normalizedCouponCode}: ${amount} -> ${finalAmount}`)
              } else {
                console.warn(`[Payment] Admin coupon ${normalizedCouponCode} has expired`)
              }
            } else {
              console.warn(`[Payment] Admin coupon ${normalizedCouponCode} does not belong to user ${user.id}`)
            }
          } else {
            console.warn(`[Payment] Admin coupon ${normalizedCouponCode} is not active`)
          }
        } else {
          const { getMarketingCouponByCode } = await import('@/lib/market/marketing')
          const marketingCoupon = await getMarketingCouponByCode(normalizedCouponCode)

          if (marketingCoupon) {
            const marketingPricing = await resolveMarketingOrderPricing({
              dbClient,
              userId: user.id,
              amount: originalAmount,
              couponCode: normalizedCouponCode,
            })

            finalAmount = marketingPricing.finalAmount
            couponId = marketingPricing.couponId
            callbackData = buildOrderCallbackData(marketingPricing.marketingAttribution)

            if (marketingPricing.reason === 'coupon_discount_applied') {
              console.log(`[Payment] Applied marketing coupon ${normalizedCouponCode}: ${amount} -> ${finalAmount}`)
            } else if (marketingPricing.reason === 'coupon_repeat_commission_only') {
              console.log(`[Payment] Reused marketing attribution ${normalizedCouponCode}: buyer pays full price ${finalAmount}, partner commission remains active`)
            } else {
              console.warn(`[Payment] Marketing coupon ${normalizedCouponCode} not applied: ${marketingPricing.reason}`)
            }
          } else {
            console.warn(`[Payment] Coupon ${normalizedCouponCode} is invalid`)
          }
        }
      } catch (err) {
        console.error('[Payment] Coupon validation error:', err)
      }
    } else {
      try {
        const marketingPricing = await resolveMarketingOrderPricing({
          dbClient,
          userId: user.id,
          amount: originalAmount,
        })

        if (marketingPricing.marketingAttribution) {
          finalAmount = marketingPricing.finalAmount
          callbackData = buildOrderCallbackData(marketingPricing.marketingAttribution)
          console.log(`[Payment] Applied repeat marketing attribution for ${user.id}: ${marketingPricing.reason}`)
        }
      } catch (marketingError) {
        console.error('[Payment] Repeat attribution lookup error:', marketingError)
      }
    }
    // -------------------------------------------------
    
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
          amount: finalAmount,
          original_amount: originalAmount,
          coupon_id: couponId,
          currency,
          payment_method,
          region: dbClient.region,
          description,
          status: 'pending',
          payment_status: 'pending',
          callback_data: callbackData,
          created_at: new Date()
        })
        order = { id: result.id, ...result.data, order_no }
      } catch (error: any) {
        orderError = error
        console.warn(`Orders collection not found in CloudBase, using mock mode:`, error.message)
      }
    } else {
      // Use Supabase for Global region
      const orderPayload = {
        order_no,
        user_id: user.id,
        amount: finalAmount,
        original_amount: originalAmount,
        coupon_id: couponId,
        currency,
        payment_method,
        region: dbClient.region,
        description,
        status: 'pending',
        payment_status: 'pending',
        callback_data: callbackData,
        created_at: new Date().toISOString(),
      }

      let { data, error } = await dbClient.supabase
        .from('orders')
        .insert(orderPayload)
        .select()
        .single()

      // 兼容尚未添加 payment_status 列的旧表结构
      if (error && String(error.message || '').toLowerCase().includes('payment_status')) {
        const { payment_status, ...legacyPayload } = orderPayload
        const retry = await dbClient.supabase
          .from('orders')
          .insert(legacyPayload)
          .select()
          .single()
        data = retry.data
        error = retry.error
      }

      if (error && String(error.message || '').toLowerCase().includes('callback_data')) {
        const { callback_data, ...legacyPayload } = orderPayload
        const retry = await dbClient.supabase
          .from('orders')
          .insert(legacyPayload)
          .select()
          .single()
        data = retry.data
        error = retry.error
      }
      
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
            amount: finalAmount,
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
            amount: finalAmount,
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
            amount: finalAmount,
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
            amount: finalAmount,
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
