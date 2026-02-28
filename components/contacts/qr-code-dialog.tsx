'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from '@/lib/types'
import { QRCodeSVG } from 'qrcode.react'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

interface QRCodeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUser: User
}

export function QRCodeDialog({ open, onOpenChange, currentUser }: QRCodeDialogProps) {
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)
  const [canonicalUserId, setCanonicalUserId] = useState(currentUser.id)

  useEffect(() => {
    setCanonicalUserId(currentUser.id)
  }, [currentUser.id])

  useEffect(() => {
    if (!open) return

    let cancelled = false

    const loadCanonicalProfile = async () => {
      try {
        const response = await fetch('/api/users/profile', { cache: 'no-store' })
        let data: any = {}
        try {
          data = await response.json()
        } catch {
          data = {}
        }
        if (!cancelled && response.ok && data?.user?.id) {
          setCanonicalUserId(String(data.user.id))
        }
      } catch {
        // Keep local currentUser.id as fallback.
      }
    }

    loadCanonicalProfile()

    return () => {
      cancelled = true
    }
  }, [open])

  const qrCodeData = `orbitchat://add-friend?userId=${encodeURIComponent(canonicalUserId)}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('myQRCode')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-4">
          <div className="flex flex-col items-center gap-3">
            <Avatar className="h-20 w-20">
              <AvatarImage src={currentUser.avatar_url || undefined} />
              <AvatarFallback name={currentUser.full_name}>
                {currentUser.full_name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <div className="font-semibold text-lg">{currentUser.full_name}</div>
              <div className="text-sm text-muted-foreground">@{currentUser.username}</div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg">
            <QRCodeSVG value={qrCodeData} size={256} level="H" />
          </div>

          <p className="text-sm text-muted-foreground text-center">
            {t('scanToAddFriend')}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
