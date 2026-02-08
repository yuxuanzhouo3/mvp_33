import { NextRequest, NextResponse } from 'next/server'
import paypal from '@paypal/checkout-server-sdk'

let paypalClient: paypal.core.PayPalHttpClient | null = null

// Fallback sandbox credentials copied from mvp6 (for local sandbox testing)
// NOTE: These are PUBLICLY VISIBLE in the mvp6 repository and are for sandbox only.
const FALLBACK_SANDBOX_CLIENT_ID =
  'AYTzR9jSS9PMF3uEO-d83C0s2oNgkkbtrMGT8mRDaeH5hK-VAvMDrghcGGRhLrGzWXd3HMGFVWiFcg0V'
const FALLBACK_SANDBOX_CLIENT_SECRET =
  'EHc8dR50OAx32Zr6Z9b_l9szJuMG9OAYC_bo59aQhup3fOAOunpvDAdUZLGKIvGM2FEZ2AdW5jZA42qD'

// Function to initialize PayPal client
const initializePayPalClient = () => {
  if (paypalClient) {
    return paypalClient
  }

  // Prefer explicit env, otherwise fall back to known sandbox test credentials from mvp6
  const clientId = process.env.PAYPAL_CLIENT_ID || FALLBACK_SANDBOX_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET || FALLBACK_SANDBOX_CLIENT_SECRET
  const mode = process.env.PAYPAL_MODE || 'sandbox'

  if (clientId && clientSecret) {
    try {
      const environment =
        mode === 'live'
          ? new paypal.core.LiveEnvironment(clientId, clientSecret)
          : new paypal.core.SandboxEnvironment(clientId, clientSecret)

      paypalClient = new paypal.core.PayPalHttpClient(environment)
      return paypalClient
    } catch (error) {
      console.error('PayPal client initialization error:', error)
      return null
    }
  } else {
    return null
  }
}

// Try to initialize when module loads
initializePayPalClient()

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

    // Ensure PayPal client is initialized
    const client = initializePayPalClient()
    
    // If PayPal not configured, return mock data
    if (!client) {
      return NextResponse.json({
        success: true,
        data: {
          order_id: `PAYPAL_${Date.now()}`,
          approval_url: `https://www.sandbox.paypal.com/checkoutnow?token=TOKEN_${Date.now()}`,
          note: 'This is mock data, please configure PayPal environment variables to use real payment'
        }
      })
    }

    // Actual PayPal API call
    const paypalRequest = new paypal.orders.OrdersCreateRequest()
    paypalRequest.prefer("return=representation")
    paypalRequest.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: order_no,
        amount: {
          currency_code: currency,
          value: amount.toString()
        },
        description: description || 'Subscription Service'
      }],
      application_context: {
        return_url: `${(process.env.NEXT_PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:3001').trim()}/payment/success`,
        cancel_url: `${(process.env.NEXT_PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'http://localhost:3001').trim()}/payment/cancel`
      }
    })

    // Add timeout handling
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('PayPal API request timeout (30s). Please try again.'))
      }, 30000)
    })
    
    try {
      const response = await Promise.race([
        client.execute(paypalRequest),
        timeoutPromise
      ]) as any

      const orderId = response.result.id
      const approvalUrl = response.result.links.find((link: any) => link.rel === 'approve')?.href

      return NextResponse.json({
        success: true,
        data: {
          order_id: orderId,
          approval_url: approvalUrl
        }
      })
    } catch (apiError: any) {
      // If timeout error, return more friendly error message
      if (apiError.message && apiError.message.includes('timeout')) {
        return NextResponse.json({
          success: false,
          message: 'PayPal system temporarily unresponsive, please try again later',
          error: 'Request timeout'
        }, { status: 504 })
      }
      
      throw apiError
    }
  } catch (error: any) {
    console.error('PayPal order creation error:', error)
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Failed to create PayPal order',
      },
      { status: 500 }
    )
  }
}











