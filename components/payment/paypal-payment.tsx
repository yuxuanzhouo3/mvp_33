'use client'

import React, { useState, useEffect } from 'react'
import { PayPalButtons, PayPalScriptProvider, usePayPalScriptReducer } from '@paypal/react-paypal-js'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2 } from 'lucide-react'

interface PayPalPaymentProps {
  amount: number
  currency: string
  orderNo: string
  paypalOrderId?: string
  onSuccess: (orderNo: string) => void
  onError: (error: string) => void
}

// Get PayPal Client ID from environment
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || 
  'AYTzR9jSS9PMF3uEO-d83C0s2oNgkkbtrMGT8mRDaeH5hK-VAvMDrghcGGRhLrGzWXd3HMGFVWiFcg0V'

// Internal component for detecting script loading status
const PayPalButtonWrapper: React.FC<{
  createOrder: () => Promise<string>
  onApprove: (data: { orderID: string; payerID?: string | null }) => Promise<void>
  onError: (err: any) => void
  onCancel: (data: any) => void
  amount: number
  currency: string
  orderNo: string
  onScriptLoad: () => void
  onScriptError: (error: string) => void
}> = ({ createOrder, onApprove, onError, onCancel, amount, currency, orderNo, onScriptLoad, onScriptError }) => {
  const [{ isResolved, isPending, isRejected }] = usePayPalScriptReducer()

  useEffect(() => {
    if (isResolved) {
      const timeoutId = setTimeout(() => {
        onScriptLoad()
      }, 800)
      return () => clearTimeout(timeoutId)
    } else if (isRejected) {
      const timeoutId = setTimeout(() => {
        onScriptError('PayPal script failed to load. This may be due to network issues. Please check your internet connection, refresh the page, or try using Stripe payment instead.')
      }, 5000)
      return () => clearTimeout(timeoutId)
    }
  }, [isResolved, isPending, isRejected, onScriptLoad, onScriptError])

  if (isPending || (!isResolved && !isRejected)) {
    return (
      <div className="flex items-center gap-2 min-h-[50px]">
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-sm text-muted-foreground">
          Loading PayPal script... This may take a few seconds.
        </p>
      </div>
    )
  }

  if (!isResolved) {
    return null
  }

  return (
    <div className="relative mb-0">
      <PayPalButtons
        createOrder={createOrder}
        onApprove={onApprove as any}
        onError={onError}
        onCancel={onCancel}
        style={{
          layout: 'vertical',
          color: 'blue',
          shape: 'rect',
          label: 'paypal',
          height: 45
        }}
        forceReRender={[amount, currency, orderNo]}
      />
    </div>
  )
}

export function PayPalPayment({
  amount,
  currency,
  orderNo,
  paypalOrderId,
  onSuccess,
  onError
}: PayPalPaymentProps) {
  const [processing, setProcessing] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [scriptError, setScriptError] = useState<string | null>(null)
  const [initKey, setInitKey] = useState(0)

  // Reset script loaded state when orderNo changes
  useEffect(() => {
    setScriptLoaded(false)
    setScriptError(null)
    setProcessing(false)
    setInitKey(prev => prev + 1)
  }, [orderNo])

  // Check if PayPal is configured
  const isConfigured = Boolean(
    PAYPAL_CLIENT_ID && 
    PAYPAL_CLIENT_ID !== '' &&
    PAYPAL_CLIENT_ID !== 'dummy'
  )

  const createOrder = async (): Promise<string> => {
    if (!scriptLoaded) {
      await new Promise(resolve => setTimeout(resolve, 500))
      if (!scriptLoaded) {
        throw new Error('PayPal script is not ready. Please wait a moment and try again.')
      }
    }

    if (!paypalOrderId) {
      throw new Error('PayPal order not initialized. Please click “Pay” again to restart the payment.')
    }

    return paypalOrderId
  }

  const onApprove = async (data: { orderID: string; payerID?: string | null }) => {
    try {
      setProcessing(true)

      if (data.payerID) {
        localStorage.setItem('paypal_account_logged_in', 'true')
      }
      
      const captureResponse = await fetch('/api/payment/paypal/capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order_id: data.orderID,
          order_no: orderNo
        }),
      })

      if (!captureResponse.ok) {
        const errorData = await captureResponse.json()
        throw new Error(errorData.message || 'Failed to capture payment')
      }

      const captureData = await captureResponse.json()

      try {
        await fetch('/api/payment/confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            order_no: orderNo,
            payment_provider_order_id: data.orderID,
            payment_status: 'paid',
            payment_data: captureData.data
          }),
        })

        await new Promise(resolve => setTimeout(resolve, 1000))
      } catch (updateError: any) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      setProcessing(false)
      onSuccess(orderNo)
    } catch (err: any) {
      const errorMessage = err.message || 'Payment capture failed'
      onError(errorMessage)
      setProcessing(false)
      throw err
    }
  }

  const onCancel = (data: any) => {
    setProcessing(false)
    onError('Payment was cancelled by user')
  }

  const handlePayPalError = (err: any) => {
    const rawMessage = err?.message || err?.details?.[0]?.description || ''
    const errorMessage = rawMessage || ''
    if (errorMessage.includes('timeout') || 
        errorMessage.includes('Script error') || 
        errorMessage.includes('script') ||
        errorMessage.includes('zoid destroyed')) {
      setProcessing(false)
      return
    }

    // Map PayPal 的“系统暂时不可用 / 无响应”等错误为更清晰的提示
    const lowered = errorMessage.toLowerCase()
    const isSystemUnavailable =
      lowered.includes('system') ||
      lowered.includes('unavailable') ||
      lowered.includes('temporarily') ||
      errorMessage.includes('系统暂时') ||
      errorMessage.includes('系统暂时无响应') ||
      errorMessage.includes('系统暂时不可用')

    const friendlyMessage = isSystemUnavailable
      ? 'PayPal 系统暂时不可用，请稍后重试，或者优先使用 Stripe 支付。'
      : (errorMessage || 'PayPal 支付失败，请稍后重试，或者使用 Stripe。')

    onError(friendlyMessage)
    setProcessing(false)
  }

  const paypalOptions = {
    clientId: PAYPAL_CLIENT_ID,
    currency: currency,
    intent: 'capture' as const,
    disableFunding: 'card,credit,paylater,venmo,sepa',
    enableFunding: 'paypal',
    dataNamespace: undefined,
    components: 'buttons',
  }

  return (
    <div className="space-y-4">
      {processing && (
        <div className="flex justify-center items-center mb-2">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <p className="text-sm text-muted-foreground">
            Processing PayPal payment...
          </p>
        </div>
      )}

      {isConfigured ? (
        <PayPalScriptProvider 
          options={paypalOptions}
          key={`paypal-${orderNo}-${initKey}`}
        >
          <PayPalButtonWrapper
            createOrder={createOrder}
            onApprove={onApprove}
            onError={handlePayPalError}
            onCancel={onCancel}
            amount={amount}
            currency={currency}
            orderNo={orderNo}
            onScriptLoad={() => {
              setScriptLoaded(true)
              setScriptError(null)
            }}
            onScriptError={(error) => {
              setScriptError(error)
              setScriptLoaded(false)
            }}
          />
        </PayPalScriptProvider>
      ) : (
        <Alert>
          <AlertDescription>
            ⚠️ PayPal未配置，使用模拟支付模式
            <br />
            <span className="text-xs mt-1 block">
              订单已创建（Order Number: {orderNo}），但PayPal支付未配置。
              <br />
              请在项目根目录的.env文件中配置 NEXT_PUBLIC_PAYPAL_CLIENT_ID
            </span>
          </AlertDescription>
        </Alert>
      )}

      {isConfigured && orderNo && !scriptLoaded && !scriptError && (
        <div className="mt-2 flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <Alert>
            <AlertDescription className="text-sm">
              Loading PayPal payment button... This may take a few seconds.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {scriptError && (
        <Alert variant="destructive">
          <AlertDescription>
            {scriptError}
            <br />
            <span className="text-xs mt-1 block">
              Please refresh the page and try again. If the problem persists, try using Stripe payment instead.
            </span>
          </AlertDescription>
        </Alert>
      )}

      {isConfigured && scriptLoaded && (
        <Alert className="py-2">
          <AlertDescription className="text-xs">
            <strong>⚠️ Sandbox Test Mode:</strong>
            <br />
            <strong>Test Account:</strong> sb-lhti947118677@personal.example.com
            <br />
            <strong>Password:</strong> Ql+QcAl7
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}








































































