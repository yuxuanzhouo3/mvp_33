'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from '@/lib/types'
import { Html5Qrcode } from 'html5-qrcode'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'
import { Loader2, Camera, AlertCircle, UserPlus } from 'lucide-react'

interface ScanQRDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddContact: (userId: string) => void
}

export function ScanQRDialog({ open, onOpenChange, onAddContact }: ScanQRDialogProps) {
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scannedUser, setScannedUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const qrReaderRef = useRef<HTMLDivElement>(null)

  const parseQRCode = (data: string): string | null => {
    const match = data.match(/orbitchat:\/\/add-friend\?userId=(.+)/)
    return match ? match[1] : null
  }

  const startScanning = async () => {
    if (!qrReaderRef.current) return

    try {
      setError(null)
      setScanning(true)

      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText) => {
          const userId = parseQRCode(decodedText)

          if (!userId) {
            setError(t('invalidQRCode'))
            return
          }

          await stopScanning()
          setLoading(true)

          try {
            const response = await fetch(`/api/users/search?q=${encodeURIComponent(userId)}`)
            const data = await response.json()

            if (!response.ok || !data.users || data.users.length === 0) {
              setError(t('userNotFound'))
              setLoading(false)
              return
            }

            setScannedUser(data.users[0])
          } catch (err) {
            setError(t('networkError'))
          } finally {
            setLoading(false)
          }
        },
        () => {}
      )
    } catch (err: any) {
      setScanning(false)
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
        setError(t('cameraPermissionDenied'))
      } else {
        setError(t('cameraError'))
      }
    }
  }

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop()
        scannerRef.current = null
      } catch (err) {
        console.error('停止扫描失败:', err)
      }
    }
    setScanning(false)
  }

  const handleClose = async () => {
    await stopScanning()
    setError(null)
    setScannedUser(null)
    setLoading(false)
    onOpenChange(false)
  }

  const handleAddContact = () => {
    if (scannedUser) {
      onAddContact(scannedUser.id)
      handleClose()
    }
  }

  useEffect(() => {
    if (open && !scanning && !scannedUser && !error) {
      startScanning()
    }

    return () => {
      if (scannerRef.current) {
        stopScanning()
      }
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('scanQRCode')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          {scannedUser ? (
            <div className="flex flex-col items-center gap-4 w-full">
              <Avatar className="h-20 w-20">
                <AvatarImage src={scannedUser.avatar_url || undefined} />
                <AvatarFallback name={scannedUser.full_name}>
                  {scannedUser.full_name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="text-center">
                <div className="font-semibold text-lg">{scannedUser.full_name}</div>
                <div className="text-sm text-muted-foreground">@{scannedUser.username}</div>
                {scannedUser.title && (
                  <div className="text-sm text-muted-foreground mt-1">{scannedUser.title}</div>
                )}
              </div>
              <Button onClick={handleAddContact} className="w-full">
                <UserPlus className="h-4 w-4 mr-2" />
                {t('addContact')}
              </Button>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{t('loading')}</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <AlertCircle className="h-12 w-12 text-destructive" />
              <p className="text-sm text-center text-destructive">{error}</p>
              <Button onClick={startScanning} variant="outline">
                {t('retry')}
              </Button>
            </div>
          ) : (
            <div className="w-full">
              <div id="qr-reader" ref={qrReaderRef} className="w-full" />
              {scanning && (
                <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground">
                  <Camera className="h-4 w-4" />
                  <span>{t('scanningQRCode')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
