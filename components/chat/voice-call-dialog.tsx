'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Mic, MicOff, Phone, Volume2, VolumeX } from 'lucide-react'
import { User } from '@/lib/types'

interface VoiceCallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipient: User
  isGroup?: boolean
  groupName?: string
  groupMembers?: User[]
}

export function VoiceCallDialog({ 
  open, 
  onOpenChange, 
  recipient,
  isGroup = false,
  groupName,
  groupMembers = []
}: VoiceCallDialogProps) {
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true)
  const [callDuration, setCallDuration] = useState(0)
  const [callStatus, setCallStatus] = useState<'calling' | 'connected' | 'ended'>('calling')

  useEffect(() => {
    if (open) {
      setCallStatus('calling')
      // Simulate call connection after 2 seconds
      const timer = setTimeout(() => {
        setCallStatus('connected')
      }, 2000)
      return () => clearTimeout(timer)
    } else {
      setCallDuration(0)
      setCallStatus('calling')
      setIsMuted(false)
      setIsSpeakerOn(true)
    }
  }, [open])

  useEffect(() => {
    if (callStatus === 'connected') {
      const interval = setInterval(() => {
        setCallDuration(prev => prev + 1)
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [callStatus])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleEndCall = () => {
    setCallStatus('ended')
    setTimeout(() => {
      onOpenChange(false)
    }, 500)
  }

  const displayName = isGroup ? groupName : recipient.full_name
  const displayMembers = isGroup ? groupMembers : [recipient]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {callStatus === 'calling' && 'Calling...'}
            {callStatus === 'connected' && formatDuration(callDuration)}
            {callStatus === 'ended' && 'Call Ended'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-6">
          {isGroup ? (
            <div className="flex -space-x-4">
              {displayMembers.slice(0, 3).map((member) => (
                <Avatar key={member.id} className="h-20 w-20 border-4 border-background">
                  <AvatarImage src={member.avatar_url || "/placeholder.svg"} />
                  <AvatarFallback>
                    {member.full_name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          ) : (
            <Avatar className="h-24 w-24">
              <AvatarImage src={recipient.avatar_url || "/placeholder.svg"} />
              <AvatarFallback className="text-2xl">
                {recipient.full_name.split(' ').map(n => n[0]).join('')}
              </AvatarFallback>
            </Avatar>
          )}

          <div className="text-center">
            <h3 className="text-xl font-semibold">{displayName}</h3>
            {isGroup && (
              <p className="text-sm text-muted-foreground">
                {displayMembers.length} participants
              </p>
            )}
            {!isGroup && recipient.title && (
              <p className="text-sm text-muted-foreground">{recipient.title}</p>
            )}
          </div>

          <div className="flex items-center gap-4 mt-4">
            <Button
              size="icon"
              variant={isSpeakerOn ? 'default' : 'outline'}
              className="h-14 w-14 rounded-full"
              onClick={() => setIsSpeakerOn(!isSpeakerOn)}
            >
              {isSpeakerOn ? (
                <Volume2 className="h-6 w-6" />
              ) : (
                <VolumeX className="h-6 w-6" />
              )}
            </Button>

            <Button
              size="icon"
              variant={isMuted ? 'outline' : 'default'}
              className="h-14 w-14 rounded-full"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? (
                <MicOff className="h-6 w-6" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </Button>

            <Button
              size="icon"
              variant="destructive"
              className="h-14 w-14 rounded-full"
              onClick={handleEndCall}
            >
              <Phone className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
