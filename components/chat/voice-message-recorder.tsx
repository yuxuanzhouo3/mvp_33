'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Mic, Square, Trash2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VoiceMessageRecorderProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSend: (audioBlob: Blob, duration: number) => void
}

export function VoiceMessageRecorder({ open, onOpenChange, onSend }: VoiceMessageRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const durationRef = useRef(0)
  const recordingStartRef = useRef<number | null>(null)

  useEffect(() => {
    if (open && !isRecording) {
      startRecording()
    }
    return () => {
      if (mediaRecorderRef.current && isRecording) {
        stopRecording()
      }
    }
  }, [open])

  useEffect(() => {
    if (isRecording) {
      const interval = setInterval(() => {
        setDuration(prev => {
          const next = prev + 1
          durationRef.current = next
          return next
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [isRecording])

  const updateDuration = (next: number) => {
    const safeValue = Math.max(0, Math.round(next))
    durationRef.current = safeValue
    setDuration(safeValue)
  }

  const computeAudioDuration = async (blob: Blob): Promise<number> => {
    if (typeof window === 'undefined') return durationRef.current
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return durationRef.current
      const audioContext = new AudioCtx()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0))
      const seconds = Math.max(1, Math.round(audioBuffer.duration || 0))
      await audioContext.close()
      return seconds
    } catch (error) {
      console.warn('Failed to decode audio duration, using fallback:', error)
      return durationRef.current
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []
      recordingStartRef.current = Date.now()

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        stream.getTracks().forEach(track => track.stop())

        const recordedMs = recordingStartRef.current
          ? Math.max(0, Date.now() - recordingStartRef.current)
          : 0
        updateDuration(recordedMs > 0 ? recordedMs / 1000 : durationRef.current)
        recordingStartRef.current = null

        void computeAudioDuration(blob).then((seconds) => {
          updateDuration(seconds)
        })
      }

      mediaRecorder.start()
      setIsRecording(true)
      updateDuration(0)
    } catch (error) {
      console.error('Error accessing microphone:', error)
      alert('Unable to access microphone. Please check permissions.')
      onOpenChange(false)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob, durationRef.current)
      handleCancel()
    }
  }

  const handleCancel = () => {
    if (isRecording) {
      stopRecording()
    }
    setAudioBlob(null)
    updateDuration(0)
    onOpenChange(false)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Voice Message</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center gap-6 py-8">
          <div className={cn(
            'h-24 w-24 rounded-full flex items-center justify-center',
            isRecording ? 'bg-red-500 animate-pulse' : 'bg-primary'
          )}>
            <Mic className="h-12 w-12 text-white" />
          </div>

          <div className="text-center">
            <div className="text-3xl font-mono font-bold">
              {formatDuration(duration)}
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              {isRecording ? 'Recording...' : 'Recording stopped'}
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isRecording ? (
              <Button
                size="lg"
                variant="outline"
                onClick={stopRecording}
                className="gap-2"
              >
                <Square className="h-5 w-5" />
                Stop
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleCancel}
                  className="gap-2"
                >
                  <Trash2 className="h-5 w-5" />
                  Delete
                </Button>
                <Button
                  size="lg"
                  onClick={handleSend}
                  className="gap-2"
                  disabled={!audioBlob}
                >
                  <Send className="h-5 w-5" />
                  Send
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
