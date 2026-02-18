'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useRegion } from '@/lib/region-context'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { CheckCircle2, Loader2, Sparkles, ShieldCheck, Zap, Crown, ArrowLeft } from 'lucide-react'
import { WechatPaymentDialog } from '@/components/payment/wechat-payment-dialog'
import { AlipayPaymentDialog } from '@/components/payment/alipay-payment-dialog'
import { StripePayment } from '@/components/payment/stripe-payment'
import { PayPalPayment } from '@/components/payment/paypal-payment'
import { toast } from 'sonner'
import { useSubscription } from '@/hooks/use-subscription'
import { SubscriptionBadge } from '@/components/subscription/subscription-badge'
import { useSettings } from '@/lib/settings-context'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface Plan {
  id: string
  name: string
  price: number
  currency: string
  features: string[]
  popular?: boolean
}

interface PaymentMethod {
  id: string
  name: string
  color: string
  accent: string
  description: string
  badge?: string
}

export default function PaymentPage() {
  const router = useRouter()
  const { region, isChina, loading: regionLoading } = useRegion()
  const { subscription, refresh: refreshSubscription } = useSubscription()
  const { t, language } = useSettings()
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<string>('')
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orderNo, setOrderNo] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [paypalOrderId, setPaypalOrderId] = useState<string | null>(null)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [showWechatDialog, setShowWechatDialog] = useState(false)
  const [showAlipayDialog, setShowAlipayDialog] = useState(false)
  const [isMockMode, setIsMockMode] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)

  const plans: Plan[] = useMemo(() => {
    return isChina
      ? [
          {
            id: 'pro-monthly',
            name: 'Pro Monthly',
            price: 99,
            currency: 'CNY',
            features: [ t('unlimitedMessages'),
                        t('storage100GB'),
                        t('unlimitedWorkspaces'),
                        t('unlimitedMembers'),
                        t('prioritySupport')],
            popular: false,
          },
          {
            id: 'pro-yearly',
            name: 'Pro Yearly',
            price: 999,
            currency: 'CNY',
            features: [ t('unlimitedMessages'),
                        t('storage1TB'),
                        t('unlimitedWorkspaces'),
                        t('unlimitedMembers'),
                        t('prioritySupport'),
                        `${t('saveAmount')} ¥189`],
            popular: true,
          },
        ]
      : [
          {
            id: 'pro-monthly',
            name: 'Pro Monthly',
            price: 14.99,
            currency: 'USD',
            features: [ t('unlimitedMessages'),
                        t('storage100GB'),
                        t('unlimitedWorkspaces'),
                        t('unlimitedMembers'),
                        t('prioritySupport')],
            popular: false,
          },
          {
            id: 'pro-yearly',
            name: 'Pro Yearly',
            price: 149.99,
            currency: 'USD',
            features: [t('unlimitedMessagesCapital'), t('storage1TBCapital'), t('unlimitedWorkspacesCapital'), t('unlimitedMembersCapital'), t('prioritySupportCapital'), `${t('saveAmount')} $29.89`],
            popular: true,
          },
        ]
  }, [isChina, t])

  const paymentMethods: PaymentMethod[] = useMemo(() => {
    return isChina
      ? [
          {
            id: 'wechat',
            name: 'WeChat Pay',
            color: 'bg-emerald-50',
            accent: 'bg-emerald-500/20 text-emerald-700',
            description: t('payWithWeChatQR'),
            badge: t('recommended'),
          },
          {
            id: 'alipay',
            name: 'Alipay',
            color: 'bg-sky-50',
            accent: 'bg-sky-500/20 text-sky-700',
            description: t('idealForPayments'),
          },
        ]
      : [
          {
            id: 'stripe',
            name: 'Stripe',
            color: 'bg-indigo-50',
            accent: 'bg-indigo-500/20 text-indigo-700',
            description: t('payWithCreditCard'),
            badge: t('secure'),
          },
          {
            id: 'paypal',
            name: 'PayPal',
            color: 'bg-blue-50',
            accent: 'bg-blue-500/20 text-blue-700',
            description: t('payWithPayPalAccount'),
          },
        ]
  }, [isChina, t])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const planId = params.get('plan')
    if (planId && plans.length > 0) {
      const plan = plans.find(p => p.id.includes(planId) || planId.includes(p.id.replace('pro-', '')))
      if (plan) {
        setSelectedPlan(plan)
      }
    }
  }, [plans])

  useEffect(() => {
    if (plans.length > 0) {
      // If selectedPlan is not in the current plans list, or if it's null, set to first plan
      // Also check if currency matches current region (plans already reflect the correct region)
      if (!selectedPlan || !plans.find(p => p.id === selectedPlan.id)) {
        setSelectedPlan(plans[0])
      } else {
        // If selectedPlan exists but currency doesn't match current plans, reset it
        const currentPlan = plans.find(p => p.id === selectedPlan.id)
        if (currentPlan && currentPlan.currency !== selectedPlan.currency) {
          setSelectedPlan(plans[0])
        }
      }
    }
  }, [plans, selectedPlan])

  useEffect(() => {
    if (paymentMethods.length > 0) {
      setSelectedMethod((prev) => {
        // If previous method is still valid, keep it
        if (prev && paymentMethods.some((method) => method.id === prev)) {
          return prev
        }
        // Otherwise, select the first available method
        return paymentMethods[0].id
      })
    } else {
      // If no payment methods available, clear selection
      setSelectedMethod('')
    }
  }, [paymentMethods])

  const resetPaymentFlow = () => {
    setProcessing(false)
    setClientSecret(null)
    setPaypalOrderId(null)
    setOrderNo(null)
    setQrCode(null)
    setShowPaymentForm(false)
    setError(null)
  }

  const handlePaymentSuccess = async (orderNo: string) => {
    resetPaymentFlow()
    // Refresh subscription status so header / payment page update immediately
    try {
      await refreshSubscription()
    } catch (e) {
      // ignore refresh errors, still show success toast
    }
    // 显示明显的支付成功弹窗
    setShowSuccessDialog(true)
    toast.success('Payment successful! Your Pro membership is now active.')
    
    // Clear chat page cache to force reload when navigating to chat
    // This ensures conversations are reloaded with fresh data
    if (typeof window !== 'undefined') {
      // Clear session storage flags that prevent reload
      const keysToRemove: string[] = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key && (key.includes('conversations_forced_reload') || key.includes('conversations_loaded'))) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key))
    }
  }

  const proceedWithPayment = async (method?: string) => {
    if (!selectedPlan) return
    
    const paymentMethod = method || selectedMethod
    if (!paymentMethod) {
      setError('Please select a payment method')
      return
    }

    try {
      setProcessing(true)
      setError(null)
      setClientSecret(null)
      setPaypalOrderId(null)

      const response = await fetch('/api/payment/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: selectedPlan.price,
          currency: selectedPlan.currency,
          payment_method: paymentMethod,
          region: region,
          description: `Pro Plan - ${selectedPlan.name}`,
        }),
      })

      // Check if response is ok and has content
      if (!response.ok) {
        const errorText = await response.text()
        let errorMessage = `HTTP error! status: ${response.status}`
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.message || errorMessage
        } catch {
          errorMessage = errorText || errorMessage
        }
        throw new Error(errorMessage)
      }

      // Check if response has content
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        throw new Error(`Invalid response format. Expected JSON, got: ${text.substring(0, 100)}`)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.message || 'Payment creation failed')
      }

      setOrderNo(data.data.order_no)

      if (paymentMethod === 'stripe') {
        // If backend indicates Stripe is unavailable (no real client_secret), show error instead of using mock
        if (!data.data.client_secret) {
          const note =
            data.data.note ||
            'Stripe payment is not available right now. Please try again later or use PayPal.'
          throw new Error(note)
        }
        setClientSecret(data.data.client_secret)
        setShowPaymentForm(true)
      } else if (paymentMethod === 'paypal' && data.data.order_id) {
        if (data.data.note) {
          throw new Error(data.data.note || 'PayPal payment is not configured yet.')
        }
        setPaypalOrderId(data.data.order_id)
        setShowPaymentForm(true)
      } else if (paymentMethod === 'wechat' && data.data.order_no) {
        setQrCode(data.data.qr_code || '')
        setIsMockMode(data.data.note !== undefined || data.data.qr_code?.includes('example.com'))
        setShowWechatDialog(true)
      } else if (paymentMethod === 'alipay' && data.data.order_no) {
        setQrCode(data.data.qr_code || '')
        setIsMockMode(data.data.note !== undefined || data.data.qr_code?.includes('example.com'))
        setShowAlipayDialog(true)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create payment')
      toast.error(err.message || 'Failed to create payment')
      setShowPaymentForm(false)
      setOrderNo(null)
      setClientSecret(null)
      setPaypalOrderId(null)
    } finally {
      setProcessing(false)
    }
  }

  // Don't block page rendering while detecting region
  // Show default content first, then update when region is detected
  // This improves user experience by showing the page immediately

  const heroPerks = [
    { icon: Sparkles, label: 'Unlimited team members' },
    { icon: ShieldCheck, label: 'Enterprise-grade security' },
    { icon: Zap, label: 'Priority support' },
  ]

  const billingUnit = selectedPlan?.name?.includes('Yearly') ? 'year' : 'month'
  const currentPlanLabel =
    subscription.type === 'yearly' ? 'Pro Annual' :
    subscription.type === 'monthly' ? 'Pro Monthly' :
    subscription.type.charAt(0).toUpperCase() + subscription.type.slice(1)

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.back()}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        {t('back')}
      </Button>
      {subscription.type !== 'free' && subscription.isActive && (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                {t('currentMembership')}
              </p>
              <p className="text-sm font-medium text-foreground">
                {currentPlanLabel}
              </p>
              {subscription.daysRemaining !== null && (
                <p className="text-xs text-muted-foreground mt-1">
                  {subscription.daysRemaining} {t('daysRemaining')}
                </p>
              )}
            </div>
            <SubscriptionBadge subscription={subscription} showDays />
          </CardContent>
        </Card>
      )}
      <div className="text-center space-y-2 mb-8">
        <h1 className="text-3xl font-medium text-foreground">
          {t('chooseYourPlan')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('allProPlansInclude')}
        </p>
        {subscription.type !== 'free' && subscription.isActive && (
          <p className="text-xs text-muted-foreground mt-1">
            {t('youAlreadyHaveActive')}
            {subscription.daysRemaining !== null && ` (${subscription.daysRemaining} ${t('daysRemaining')})`}.
          </p>
        )}
        {regionLoading ? (
          <p className="text-xs text-muted-foreground mt-2">{t('detectingYourRegion')}</p>
        ) : (
          <p className="text-xs text-muted-foreground mt-2">
            {t('availablePaymentMethods')} {isChina 
              ? 'WeChat Pay, Alipay' 
              : 'Stripe, PayPal'}
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((plan) => {
          const isActive = selectedPlan?.id === plan.id
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlan(plan)}
              className={cn(
                'border rounded-lg p-6 text-left transition-all',
                isActive ? 'border-foreground bg-muted/50' : 'border-border hover:border-foreground/50'
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    {plan.name.includes('Yearly') ? t('yearly') : t('monthly')}
                  </p>
                  <h3 className="text-3xl font-medium text-foreground">
                    {plan.currency === 'CNY' ? '¥' : '$'}
                    {plan.price}
                    <span className="text-base font-normal text-muted-foreground">
                      /{plan.name.includes('Yearly') ? (language === 'zh' ? '年' : 'year') : (language === 'zh' ? '月' : 'month')}
                    </span>
                  </h3>
                </div>
                {plan.popular && (
                  <span className="text-xs text-muted-foreground border border-border rounded px-2 py-1">
                    {t('popular')}
                  </span>
                )}
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {plan.features.slice(0, 5).map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <span className="text-foreground mt-0.5">•</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>

          {showPaymentForm && selectedPlan && selectedMethod && (
            <div className="border rounded-lg p-6 mt-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-medium">{t('paymentDetails')}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('orderNo')} {orderNo}
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {t('paying')} {selectedPlan.currency === 'CNY' ? '¥' : '$'}
                    {selectedPlan.price.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    {' '}{t('forPlan')} {selectedPlan.name}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetPaymentFlow}
                  className="shrink-0"
                >
                  {t('changeMethod')}
                </Button>
              </div>
              <div className="pt-2">
                {selectedMethod === 'stripe' && orderNo && clientSecret && (
                  <StripePayment
                    amount={selectedPlan.price}
                    currency={selectedPlan.currency}
                    orderNo={orderNo}
                    clientSecret={clientSecret}
                    onSuccess={handlePaymentSuccess}
                    onError={(error) => {
                      setError(error)
                      setShowPaymentForm(false)
                    }}
                  />
                )}

                {selectedMethod === 'paypal' && orderNo && (
                  <PayPalPayment
                    amount={selectedPlan.price}
                    currency={selectedPlan.currency}
                    orderNo={orderNo}
                    paypalOrderId={paypalOrderId || undefined}
                    onSuccess={handlePaymentSuccess}
                    onError={(error) => {
                      setError(error)
                      setShowPaymentForm(false)
                    }}
                  />
                )}
              </div>
            </div>
          )}

      {selectedPlan && !showPaymentForm && (
        <div className="border rounded-lg p-6 space-y-6">
          <div>
            <h3 className="text-lg font-medium mb-4">{t('paymentMethod')}</h3>
            <RadioGroup
              value={selectedMethod}
              onValueChange={(value) => {
                setSelectedMethod(value)
                setOrderNo(null)
                setClientSecret(null)
                setPaypalOrderId(null)
                setShowPaymentForm(false)
                setError(null)
              }}
              className="space-y-2"
            >
              {paymentMethods.map((method) => {
                const isActive = selectedMethod === method.id
                return (
                  <label
                    key={method.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 border rounded p-3 transition-all',
                      isActive ? 'border-foreground bg-muted/50' : 'border-border hover:border-foreground/50'
                    )}
                  >
                    <RadioGroupItem value={method.id} className="sr-only" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{method.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{method.description}</p>
                    </div>
                    {isActive && <span className="text-xs">✓</span>}
                  </label>
                )
              })}
            </RadioGroup>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">{t('total')}</span>
              <span className="text-2xl font-medium">
                {selectedPlan?.currency === 'CNY' ? '¥' : '$'}
                {selectedPlan?.price?.toLocaleString(undefined, { minimumFractionDigits: 0 })}
              </span>
            </div>
            <Button
              size="lg"
              variant="outline"
              className="w-full border-foreground bg-foreground text-background hover:bg-foreground/90"
              disabled={!selectedPlan || !selectedMethod || processing || paymentMethods.length === 0}
              onClick={() => proceedWithPayment()}
            >
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('processing')}
                </>
              ) : paymentMethods.length === 0 ? (
                t('noPaymentMethodAvailable')
              ) : (
                `${t('payWith')} ${paymentMethods.find((m) => m.id === selectedMethod)?.name}`
              )}
            </Button>
          </div>
        </div>
      )}
      {/* WeChat Payment Dialog */}
      {selectedPlan && orderNo && (
        <WechatPaymentDialog
          open={showWechatDialog}
          onClose={() => {
            setShowWechatDialog(false)
            setOrderNo(null)
            setQrCode(null)
          }}
          amount={selectedPlan.price}
          currency={selectedPlan.currency}
          orderNo={orderNo}
          qrCode={qrCode || ''}
          isMockMode={isMockMode}
          onSuccess={(orderNo) => {
            handlePaymentSuccess(orderNo)
            setShowWechatDialog(false)
          }}
          onError={(error) => {
            setError(error)
            setShowWechatDialog(false)
          }}
        />
      )}

      {/* Payment success dialog */}
      <Dialog
        open={showSuccessDialog}
        onOpenChange={(open) => {
          setShowSuccessDialog(open)
          if (!open) {
            router.push('/chat')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              {t('paymentSuccessful')}
            </DialogTitle>
            <DialogDescription className="pt-2">
              {t('proMembershipActive')}
              {subscription.daysRemaining !== null && subscription.isActive && (
                <>
                  <br />
                  <span className="text-sm text-muted-foreground">
                    {t('youHave')} <span className="font-medium">{subscription.daysRemaining}</span> {t('daysRemainingText')}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={() => {
                setShowSuccessDialog(false)
                // Clear chat page cache flags to force reload
                if (typeof window !== 'undefined') {
                  // Clear session storage flags that prevent reload
                  const keysToRemove: string[] = []
                  for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i)
                    if (key && (key.includes('conversations_forced_reload') || key.includes('conversations_loaded'))) {
                      keysToRemove.push(key)
                    }
                  }
                  keysToRemove.forEach(key => sessionStorage.removeItem(key))
                }
                // Navigate to chat page - it will detect the cleared flags and reload
                router.push('/chat?refresh=' + Date.now())
              }}
            >
              {t('goToChat')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Alipay Payment Dialog */}
      {selectedPlan && orderNo && (
        <AlipayPaymentDialog
          open={showAlipayDialog}
          onClose={() => {
            setShowAlipayDialog(false)
            setOrderNo(null)
            setQrCode(null)
          }}
          amount={selectedPlan.price}
          currency={selectedPlan.currency}
          orderNo={orderNo}
          qrCode={qrCode || ''}
          isMockMode={isMockMode}
          onSuccess={(orderNo) => {
            handlePaymentSuccess(orderNo)
            setShowAlipayDialog(false)
          }}
          onError={(error) => {
            setError(error)
            setShowAlipayDialog(false)
          }}
        />
      )}

    </div>
  )
}

