import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
  apiVersion: '2024-11-20.acacia',
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { amount, currency, order_no, user_id, description } = body

    if (!amount || !currency || !order_no) {
      return NextResponse.json(
        {
          success: false,
          message: 'Missing required fields: amount, currency, order_no',
        },
        { status: 400 }
      )
    }

    // If Stripe key not configured, return mock data
    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_dummy') {
      return NextResponse.json({
        success: true,
        data: {
          payment_intent_id: `pi_mock_${Date.now()}`,
          note: 'This is mock data, please configure STRIPE_SECRET_KEY environment variable to use real payment'
        }
      })
    }

    // Actual Stripe API call
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe amount unit is cents
      currency: currency.toLowerCase(),
      metadata: {
        order_no: order_no,
        user_id: user_id?.toString() || ''
      },
      description: description || 'Subscription Service'
    })

    return NextResponse.json({
      success: true,
      data: {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id
      }
    })
  } catch (error: any) {
    console.error('Stripe payment intent creation error:', error)
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Failed to create Stripe payment intent',
      },
      { status: 500 }
    )
  }
}



















































































