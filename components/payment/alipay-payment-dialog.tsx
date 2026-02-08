'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CheckCircle2 } from 'lucide-react'
import Image from 'next/image'

interface AlipayPaymentDialogProps {
  open: boolean
  onClose: () => void
  amount: number
  currency: string
  orderNo: string
  qrCode: string
  onSuccess: (orderNo: string) => void
  onError: (error: string) => void
  isMockMode?: boolean
}

export function AlipayPaymentDialog({
  open,
  onClose,
  amount,
  currency,
  orderNo,
  qrCode,
  onSuccess,
  onError,
  isMockMode = false,
}: AlipayPaymentDialogProps) {
  const [showSuccess, setShowSuccess] = useState(false)

  const getQRCodeUrl = () => {
    if (qrCode && !qrCode.includes('example.com')) {
      return qrCode
    }
    const qrData = `alipays://platformapi/startapp?saId=10000007&qrcode=https://qr.alipay.com/${orderNo}`
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`
  }

  useEffect(() => {
    if (open && isMockMode) {
      setShowSuccess(false)
      const timer = setTimeout(async () => {
        setShowSuccess(true)
        
        try {
          await fetch('/api/payment/confirm', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              order_no: orderNo,
              payment_provider_order_id: `MOCK_${orderNo}_${Date.now()}`,
              payment_status: 'paid',
              payment_data: { mock: true, completed_at: new Date().toISOString() },
            }),
          })
          
          await new Promise(resolve => setTimeout(resolve, 2000))
        } catch (error) {
          // Ignore errors
        }
        
        setTimeout(() => {
          onSuccess(orderNo)
          onClose()
        }, 1500)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [open, orderNo, onSuccess, onClose, isMockMode])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alipay</DialogTitle>
        </DialogHeader>
        
        {showSuccess ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold">Payment Successful</h3>
          </div>
        ) : (
          <div className="flex flex-col items-center p-6">
            <h3 className="text-lg font-semibold mb-2 text-center">
              Scan QR Code to Pay
            </h3>
            <p className="text-sm text-muted-foreground mb-4 text-center">
              Open Alipay and scan the QR code below
            </p>
            <div className="w-[300px] h-[300px] relative mb-4">
              <Image
                src={getQRCodeUrl()}
                alt="Alipay QR Code"
                fill
                className="object-contain"
              />
            </div>
            {isMockMode && (
              <p className="text-xs text-muted-foreground text-center">
                Mock Mode: Auto login in 3 seconds
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}


























































































































































