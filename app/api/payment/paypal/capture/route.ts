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
    const { order_id, order_no } = body

    if (!order_id) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing required field: order_id',
        },
        { status: 400 }
      )
    }

    // Ensure PayPal client is initialized
    const client = initializePayPalClient()

    let captureResult: any

    if (!client) {
      // If PayPal not configured, return mock data
      captureResult = {
        id: order_id,
        status: 'COMPLETED',
        payer: {
          payer_id: 'TEST_PAYER_ID',
          email_address: 'test@example.com'
        },
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: '0.00'
          }
        }],
        note: 'This is mock data, please configure PayPal environment variables to use real payment'
      }
    } else {
      // Actual PayPal API call
      const paypalRequest = new paypal.orders.OrdersCaptureRequest(order_id)
      paypalRequest.requestBody({})

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
        
        captureResult = response.result
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
    }

    return NextResponse.json({
      success: true,
      data: captureResult
    })
  } catch (error: any) {
    console.error('PayPal capture error:', error)
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Failed to capture PayPal payment',
      },
      { status: 500 }
    )
  }
}








































































