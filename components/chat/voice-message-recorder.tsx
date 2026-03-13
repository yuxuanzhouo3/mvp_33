'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Mic, Square, Trash2, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSettings } from '@/lib/settings-context'

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
  const { language } = useSettings()
  const tr = (zh: string, en: string) => (language === 'zh' ? zh : en)

  useEffect(() => {
    if (open) {
      // Reset state when opening the recorder panel
      setIsRecording(false)
      setAudioBlob(null)
      updateDuration(0)
      recordingStartRef.current = null
    } else {
      cleanupRecorder()
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
      alert(tr('无法使用麦克风，请检查权限设置。', 'Unable to access microphone. Please check permissions.'))
      onOpenChange(false)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const cleanupRecorder = () => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    } catch {}
    try {
      const tracks = (mediaRecorderRef.current as any)?.stream?.getTracks?.() || []
      tracks.forEach((track: MediaStreamTrack) => track.stop())
    } catch {}
    mediaRecorderRef.current = null
    chunksRef.current = []
    recordingStartRef.current = null
  }

  const handleSend = () => {
    if (audioBlob) {
      onSend(audioBlob, durationRef.current)
      handleClose()
    }
  }

  const handleClose = () => {
    if (isRecording) {
      stopRecording()
    }
    setAudioBlob(null)
    updateDuration(0)
    onOpenChange(false)
  }

  const handleDelete = () => {
    if (isRecording) {
      stopRecording()
    }
    setAudioBlob(null)
    updateDuration(0)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!open) return null

  const isIdle = !isRecording && !audioBlob
  const isReady = !isRecording && audioBlob != null

  return (
    <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-700">
          {tr('语音消息', 'Voice message')}
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label={tr('关闭语音录制', 'Close voice recorder')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={isIdle ? startRecording : undefined}
          disabled={!isIdle}
          className={cn(
            'h-20 w-20 rounded-full flex items-center justify-center transition',
            isRecording ? 'bg-red-500 animate-pulse' : 'bg-[#1a9dff]',
            isIdle ? 'cursor-pointer' : 'cursor-default opacity-70'
          )}
          aria-label={tr('开始录音', 'Start recording')}
        >
          <Mic className="h-9 w-9 text-white" />
        </button>

        <div className="text-center">
          <div className="text-2xl font-mono font-bold">{formatDuration(duration)}</div>
          <div className="text-xs text-gray-500 mt-1">
            {isRecording
              ? tr('录音中...', 'Recording...')
              : isReady
                ? tr('录音完成', 'Recording ready')
                : tr('点击开始录音', 'Tap to start recording')}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isRecording && (
            <Button
              size="sm"
              variant="outline"
              onClick={stopRecording}
              className="gap-1.5"
            >
              <Square className="h-4 w-4" />
              {tr('停止', 'Stop')}
            </Button>
          )}
          {isReady && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDelete}
                className="gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                {tr('删除', 'Delete')}
              </Button>
              <Button
                size="sm"
                onClick={handleSend}
                className="gap-1.5 bg-[#1a9dff] hover:bg-[#128de7]"
                disabled={!audioBlob}
              >
                <Send className="h-4 w-4" />
                {tr('发送', 'Send')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
