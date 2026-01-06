'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Hash, Lock } from 'lucide-react'
import { useSettings } from '@/lib/settings-context'
import { getTranslation } from '@/lib/i18n'

interface CreateChannelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateChannel: (data: {
    name: string
    description: string
    isPrivate: boolean
  }) => void
}

export function CreateChannelDialog({
  open,
  onOpenChange,
  onCreateChannel,
}: CreateChannelDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const { language } = useSettings()
  const t = (key: keyof typeof import('@/lib/i18n').translations.en) => getTranslation(language, key)

  const handleCreate = () => {
    if (name.trim()) {
      onCreateChannel({
        name: name.trim(),
        description: description.trim(),
        isPrivate,
      })
      handleClose()
    }
  }

  const handleClose = () => {
    setName('')
    setDescription('')
    setIsPrivate(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('createChannel')}</DialogTitle>
          <DialogDescription>
            {t('createNewChannel')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="channel-name">{t('channelName')}</Label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                {isPrivate ? (
                  <Lock className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Hash className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <Input
                id="channel-name"
                placeholder={t('channelNamePlaceholder')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel-description">{t('description')} ({t('optional')})</Label>
            <Textarea
              id="channel-description"
              placeholder={t('channelDescriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="private-channel" className="text-base">
                {t('privateChannel')}
              </Label>
              <p className="text-sm text-muted-foreground">
                {t('privateChannelDescription')}
              </p>
            </div>
            <Switch
              id="private-channel"
              checked={isPrivate}
              onCheckedChange={setIsPrivate}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('cancel')}
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim()}>
            {t('createChannel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
