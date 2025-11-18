'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Mic, MicOff, Phone, Video, VideoOff, Monitor } from 'lucide-react'
import { User } from '@/lib/types'
import { cn } from '@/lib/utils'

interface VideoCallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipient: User
  isGroup?: boolean
  groupName?: string
  groupMembers?: User[]
}

export function VideoCallDialog({ 
  open, 
  onOpenChange, 
  recipient,
  isGroup = false,
  groupName,
  groupMembers = []
}: VideoCallDialogProps) {
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOn, setIsVideoOn] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [callStatus, setCallStatus] = useState<'calling' | 'connected' | 'ended'>('calling')

  useEffect(() => {
    if (open) {
      setCallStatus('calling')
      const timer = setTimeout(() => {
        setCallStatus('connected')
      }, 2000)
      return () => clearTimeout(timer)
    } else {
      setCallDuration(0)
      setCallStatus('calling')
      setIsMuted(false)
      setIsVideoOn(true)
      setIsScreenSharing(false)
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
      <DialogContent className="sm:max-w-4xl h-[600px] p-0">
        <div className="relative h-full bg-black rounded-lg overflow-hidden">
          {/* Main video area */}
          <div className="h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
            {callStatus === 'calling' ? (
              <div className="text-center text-white space-y-4">
                {isGroup ? (
                  <div className="flex justify-center -space-x-4">
                    {displayMembers.slice(0, 3).map((member) => (
                      <Avatar key={member.id} className="h-24 w-24 border-4 border-gray-700">
                        <AvatarImage src={member.avatar_url || "/placeholder.svg"} />
                        <AvatarFallback>
                          {member.full_name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </div>
                ) : (
                  <Avatar className="h-32 w-32 mx-auto">
                    <AvatarImage src={recipient.avatar_url || "/placeholder.svg"} />
                    <AvatarFallback className="text-3xl">
                      {recipient.full_name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div>
                  <h3 className="text-2xl font-semibold">{displayName}</h3>
                  <p className="text-gray-400 mt-2">Calling...</p>
                </div>
              </div>
            ) : (
              <div className="w-full h-full relative">
                {/* Simulated video feed */}
                <div className="w-full h-full bg-gradient-to-br from-blue-900 to-purple-900 flex items-center justify-center">
                  {!isVideoOn ? (
                    <div className="text-center text-white">
                      <Avatar className="h-32 w-32 mx-auto mb-4">
                        <AvatarImage src={recipient.avatar_url || "/placeholder.svg"} />
                        <AvatarFallback className="text-3xl">
                          {recipient.full_name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <h3 className="text-xl font-semibold">{displayName}</h3>
                    </div>
                  ) : (
                    <div className="text-white text-center">
                      <div className="text-lg">Video Connected</div>
                      <div className="text-sm text-gray-300 mt-2">Simulated video call</div>
                    </div>
                  )}
                </div>

                {/* Self view */}
                <div className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden border-2 border-white/20">
                  <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                    <span className="text-white text-sm">You</span>
                  </div>
                </div>

                {/* Call info overlay */}
                <div className="absolute top-4 left-4 bg-black/50 px-4 py-2 rounded-lg backdrop-blur-sm">
                  <div className="text-white font-semibold">{displayName}</div>
                  <div className="text-gray-300 text-sm">{formatDuration(callDuration)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
            <div className="flex items-center justify-center gap-4">
              <Button
                size="icon"
                variant={isMuted ? 'destructive' : 'secondary'}
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
                variant={isVideoOn ? 'secondary' : 'destructive'}
                className="h-14 w-14 rounded-full"
                onClick={() => setIsVideoOn(!isVideoOn)}
              >
                {isVideoOn ? (
                  <Video className="h-6 w-6" />
                ) : (
                  <VideoOff className="h-6 w-6" />
                )}
              </Button>

              <Button
                size="icon"
                variant={isScreenSharing ? 'default' : 'secondary'}
                className="h-14 w-14 rounded-full"
                onClick={() => setIsScreenSharing(!isScreenSharing)}
              >
                <Monitor className="h-6 w-6" />
              </Button>

              <Button
                size="icon"
                variant="destructive"
                className="h-16 w-16 rounded-full"
                onClick={handleEndCall}
              >
                <Phone className="h-6 w-6" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
