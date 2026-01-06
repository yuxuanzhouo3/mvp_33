'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { loadStripe, StripeElementsOptions } from '@stripe/stripe-js'
import {
  Elements,
  CardElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// Get Stripe publishable key from environment
const STRIPE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || 
  'pk_test_51SPhe7FKUeg2OuIVQa5ZtAtJ0vF1mU55Cn2hiZ2DcY6LsrehmQNUtpeEGcIwdrxmhQQl3LurUDXGu1OLCMLYbRzy00U2jmgL6K'

// Lazy load Stripe
const getStripePromise = () => {
  const key = STRIPE_PUBLISHABLE_KEY
  if (!key || key === 'pk_test_dummy' || key.trim() === '') {
    return null
  }
  return loadStripe(key, {
    locale: 'en' as const,
  })
}

interface StripePaymentProps {
  amount: number
  currency: string
  orderNo: string
  clientSecret?: string
  onSuccess: (orderNo: string) => void
  onError: (error: string) => void
}

const StripePaymentForm: React.FC<StripePaymentProps & { isConfigured: boolean }> = ({
  amount,
  currency,
  orderNo,
  clientSecret,
  onSuccess,
  onError,
  isConfigured
}) => {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  // Check if Stripe and Elements are ready
  useEffect(() => {
    if (stripe && elements && clientSecret) {
      const timer = setTimeout(() => {
        setIsReady(true)
      }, 100)
      return () => clearTimeout(timer)
    } else {
      setIsReady(false)
    }
  }, [stripe, elements, clientSecret])

  // Reset ready state when clientSecret changes
  useEffect(() => {
    setIsReady(false)
    setProcessing(false)
  }, [clientSecret])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (!stripe || !elements) {
      setErrorMessage('Stripe is not ready. Please wait a moment and try again.')
      setErrorDialogOpen(true)
      return
    }

    if (!clientSecret) {
      setErrorMessage('Payment intent not found. Please try again.')
      setErrorDialogOpen(true)
      return
    }

    if (processing) {
      return
    }

    setProcessing(true)

    try {
      const cardElement = elements.getElement(CardElement)
      if (!cardElement) {
        throw new Error('Card element not found')
      }

      const paymentPromise = stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {}
        }
      })
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Payment confirmation timeout. Please try again.'))
        }, 30000)
      })
      
      const { error, paymentIntent } = await Promise.race([paymentPromise, timeoutPromise]) as any

      if (error) {
        const errorMsg = error.message || ''
        if (errorMsg.includes('processing error') || 
            errorMsg.includes('timeout') || 
            errorMsg.includes('network') ||
            errorMsg.toLowerCase().includes('a processing error occurred')) {
          setProcessing(false)
          return
        }
        
        const finalErrorMsg = errorMsg || 'Payment failed'
        setErrorMessage(finalErrorMsg)
        setErrorDialogOpen(true)
        setProcessing(false)
        return
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        try {
          await fetch('/api/payment/confirm', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              order_no: orderNo,
              payment_provider_order_id: paymentIntent.id,
              payment_status: 'paid',
              payment_data: paymentIntent
            }),
          })

          await new Promise(resolve => setTimeout(resolve, 1000))
        } catch (updateError: any) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
        setProcessing(false)
        onSuccess(orderNo)
      } else {
        setProcessing(false)
      }
    } catch (err: any) {
      const errorMsg = err.message || ''
      if (errorMsg.includes('timeout') || 
          errorMsg.includes('network') || 
          errorMsg.includes('Network Error') ||
          errorMsg.includes('Script error')) {
        setProcessing(false)
        return
      }
      
      const finalErrorMsg = errorMsg || 'Payment processing failed'
      setErrorMessage(finalErrorMsg)
      setErrorDialogOpen(true)
      setProcessing(false)
    }
  }

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#424770',
        '::placeholder': {
          color: '#aab7c4',
        },
      },
      invalid: {
        color: '#9e2146',
      },
    },
  }

  if (!isConfigured) {
    return (
      <Alert>
        <AlertDescription>
          ✅ Payment order created successfully! Order Number: {orderNo}
          <br />
          <span className="text-xs mt-1 block">
            Using mock payment mode. Configure Stripe to enable real payment processing.
          </span>
        </AlertDescription>
      </Alert>
    )
  }

  if (!clientSecret) {
    return null
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {(!isConfigured || (clientSecret && clientSecret.startsWith('pi_mock'))) && (
          <Alert>
            <AlertDescription>
              <strong>⚠️ Sandbox Test Mode - Use Test Cards Only:</strong>
              <br />
              <strong>Successful Payment:</strong> 4242 4242 4242 4242
              <br />
              <strong>Expiry:</strong> Any future date (e.g., 12/25)
              <br />
              <strong>CVC:</strong> Any 3 digits (e.g., 123)
              <br />
              <strong>ZIP:</strong> Any 5 digits (e.g., 12345)
            </AlertDescription>
          </Alert>
        )}

        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground mb-4">
            Card Information
          </p>
          <div className="p-2 border rounded">
            <CardElement options={cardElementOptions} />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={!isReady || processing}
        >
          {processing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing Payment...
            </>
          ) : (
            `Pay ${currency === 'USD' ? '$' : ''}${amount}`
          )}
        </Button>
      </form>

      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Payment Error</DialogTitle>
          </DialogHeader>
          <p className="text-sm">{errorMessage || 'An error occurred during payment processing.'}</p>
          <Button onClick={() => setErrorDialogOpen(false)} className="mt-4">
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function StripePayment({ clientSecret, ...props }: StripePaymentProps) {
  const stripeKey = STRIPE_PUBLISHABLE_KEY
  const isConfigured = Boolean(
    stripeKey && 
    stripeKey !== 'pk_test_dummy' &&
    stripeKey.trim() !== ''
  )

  const options: StripeElementsOptions = useMemo(() => ({
    mode: 'payment',
    amount: Math.round(props.amount * 100),
    currency: props.currency.toLowerCase(),
    appearance: {
      theme: 'stripe' as const,
    },
  }), [props.amount, props.currency])

  const stripePromise = useMemo(() => {
    if (!isConfigured) return null
    return getStripePromise()
  }, [isConfigured])
  
  if (!clientSecret) {
    return null
  }
  
  if (!stripePromise) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin mb-2" />
        <p className="text-sm text-muted-foreground">Loading Stripe...</p>
      </div>
    )
  }
  
  return (
    <Elements stripe={stripePromise} options={options} key={`stripe-elements-${clientSecret}`}>
      <StripePaymentForm {...props} clientSecret={clientSecret} isConfigured={isConfigured} />
    </Elements>
  )
}








































































