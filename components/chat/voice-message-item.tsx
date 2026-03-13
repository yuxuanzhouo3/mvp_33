'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface VoiceMessageItemProps {
  url: string
  durationSeconds?: number
  isOwn?: boolean
  isMobile?: boolean
  className?: string
}

export function VoiceMessageItem({
  url,
  durationSeconds = 0,
  isOwn = false,
  isMobile = false,
  className,
}: VoiceMessageItemProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [resolvedDuration, setResolvedDuration] = useState(durationSeconds)

  useEffect(() => {
    setResolvedDuration(durationSeconds || 0)
  }, [durationSeconds])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)
    const handleLoaded = () => {
      if (!durationSeconds && Number.isFinite(audio.duration)) {
        setResolvedDuration(Math.max(1, Math.round(audio.duration)))
      }
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadedmetadata', handleLoaded)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('loadedmetadata', handleLoaded)
    }
  }, [durationSeconds])

  const displayDuration = useMemo(() => {
    const fallback = Math.max(1, Math.round(durationSeconds || 0))
    return resolvedDuration > 0 ? Math.max(1, Math.round(resolvedDuration)) : fallback
  }, [durationSeconds, resolvedDuration])

  const bubbleWidth = useMemo(() => {
    const base = isMobile ? 92 : 120
    const perSecond = isMobile ? 4 : 5
    const extra = Math.min(isMobile ? 140 : 200, Math.max(0, displayDuration - 1) * perSecond)
    return base + extra
  }, [displayDuration, isMobile])

  const handleToggle = async () => {
    const audio = audioRef.current
    if (!audio) return
    try {
      if (isPlaying) {
        audio.pause()
        audio.currentTime = 0
        return
      }
      audio.currentTime = 0
      await audio.play()
    } catch (error) {
      console.warn('Failed to play voice message:', error)
      setIsPlaying(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      style={{ width: bubbleWidth }}
      className={cn(
        'flex items-center gap-2 rounded-full px-3 py-1.5 text-left transition-colors',
        isOwn
          ? (isMobile
            ? 'flex-row-reverse mobile-chat-bubble-own text-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
            : 'flex-row-reverse bg-[#E8F3FF] text-gray-900 border border-[#DDEBFA] shadow-[0_1px_2px_rgba(0,0,0,0.04)]')
          : 'flex-row bg-white text-gray-900 border border-[#E6ECF2] shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
        isPlaying && (isOwn ? 'ring-1 ring-[#1a9dff]/30' : 'ring-1 ring-emerald-300/80'),
        className
      )}
      aria-label={`Voice message ${displayDuration} seconds`}
    >
      <div className={cn(
        'flex items-end gap-1',
        isPlaying ? (isOwn ? 'text-white' : 'text-emerald-600') : (isOwn ? 'text-white/80' : 'text-foreground/70')
      )}>
        {[0, 1, 2].map((idx) => (
          <span
            key={idx}
            className={cn(
              'block w-1 rounded-full bg-current',
              isPlaying ? 'animate-pulse' : 'opacity-70'
            )}
            style={{
              height: 8 + idx * 3,
              animationDelay: `${idx * 120}ms`,
            }}
          />
        ))}
      </div>
      <span className={cn('text-xs font-medium', isOwn ? 'text-white/80' : 'text-foreground/70')}>{displayDuration}"</span>
      <audio ref={audioRef} src={url} preload="metadata" />
    </button>
  )
}



