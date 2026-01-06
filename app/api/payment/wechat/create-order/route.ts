import { NextRequest, NextResponse } from 'next/server'

// WeChat payment service (supports sandbox environment)
// Requires configuration: WECHAT_APP_ID, WECHAT_MERCHANT_ID, WECHAT_API_KEY, WECHAT_API_V3_KEY (optional)

let wechatpay: any = null
const isSandbox = process.env.WECHAT_SANDBOX === 'true' || process.env.WECHAT_SANDBOX === '1'

// Initialize WeChat payment (if environment variables are configured)
if (process.env.WECHAT_APP_ID && process.env.WECHAT_MERCHANT_ID && process.env.WECHAT_API_KEY) {
  try {
    const WechatPay = require('wechatpay-node-v3')
    const config = {
      appid: process.env.WECHAT_APP_ID,
      mchid: process.env.WECHAT_MERCHANT_ID,
      publicKey: process.env.WECHAT_API_KEY,
      key: process.env.WECHAT_API_V3_KEY || process.env.WECHAT_API_KEY,
      ...(isSandbox && { sandbox: true })
    }
    
    wechatpay = new WechatPay(config)
    
    if (isSandbox) {
      console.log('WeChat payment initialized in sandbox mode')
    } else {
      console.log('WeChat payment initialized in production mode')
    }
  } catch (error) {
    console.error('WeChat payment initialization error:', error)
  }
} else {
  console.log('WeChat payment not configured - using mock mode')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { amount, currency, order_no, description } = body

    if (!amount || !currency || !order_no) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing required fields: amount, currency, order_no',
        },
        { status: 400 }
      )
    }

    // If WeChat payment not configured, return mock data
    if (!wechatpay) {
      return NextResponse.json({
        success: true,
        data: {
          qr_code: 'https://example.com/qr-code',
          payment_url: 'weixin://wxpay/bizpayurl?pr=xxx',
          prepay_id: `PREPAY_${Date.now()}`,
          note: 'This is mock data, please configure WeChat payment environment variables to use real payment'
        }
      })
    }

    // Actual WeChat payment API call
    const notifyUrl = process.env.WECHAT_NOTIFY_URL || 
                     `${(process.env.NEXT_PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:3001').trim()}/api/payment/wechat/callback`
    
    const paymentData = {
      appid: process.env.WECHAT_APP_ID,
      mchid: process.env.WECHAT_MERCHANT_ID,
      description: description || 'Subscription Service',
      out_trade_no: order_no,
      notify_url: notifyUrl,
      amount: {
        total: Math.round(amount * 100), // WeChat payment amount unit is cents
        currency: 'CNY'
      }
    }

    const result = await wechatpay.transactions_native(paymentData)

    return NextResponse.json({
      success: true,
      data: {
        qr_code: result.code_url,
        payment_url: result.code_url,
        prepay_id: result.prepay_id,
        sandbox: isSandbox
      }
    })
  } catch (error: any) {
    console.error('WeChat payment order creation error:', error)
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Failed to create WeChat payment order',
      },
      { status: 500 }
    )
  }
}



















































































