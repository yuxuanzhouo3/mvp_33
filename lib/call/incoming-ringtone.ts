let audioContext: AudioContext | null = null
let activeOwner: string | null = null
let intervalId: number | null = null
let running = false
let usingMp3 = false
let ringtoneAudio: HTMLAudioElement | null = null

const RINGTONE_PATH = '/sounds/ringtone.mp3'

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (audioContext) return audioContext

  const Ctx = window.AudioContext || (window as any).webkitAudioContext
  if (!Ctx) return null
  audioContext = new Ctx()
  return audioContext
}

function getRingtoneAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null
  if (ringtoneAudio) return ringtoneAudio

  const audio = new Audio(RINGTONE_PATH)
  audio.preload = 'auto'
  audio.loop = true
  audio.volume = 1
  ;(audio as any).playsInline = true
  ringtoneAudio = audio
  return audio
}

function pauseMp3(resetTime: boolean) {
  if (!ringtoneAudio) return
  try {
    ringtoneAudio.pause()
    if (resetTime) {
      ringtoneAudio.currentTime = 0
    }
  } catch {
    // Ignore pause/reset failures.
  }
  usingMp3 = false
}

function clearToneLoop() {
  if (intervalId !== null && typeof window !== 'undefined') {
    window.clearInterval(intervalId)
  }
  intervalId = null
}

function clearPlayback(resetMp3: boolean) {
  clearToneLoop()
  pauseMp3(resetMp3)
  running = false
}

function startToneLoop(owner: string) {
  const context = getAudioContext()
  if (!context || typeof window === 'undefined') return

  clearToneLoop()
  usingMp3 = false

  void context.resume().catch(() => {})

  if (document.visibilityState === 'visible') {
    scheduleToneBurst(context)
  }

  intervalId = window.setInterval(() => {
    if (!running || activeOwner !== owner) return
    if (document.visibilityState !== 'visible') return
    scheduleToneBurst(context)
  }, 1400)
}

function tryStartMp3(owner: string, resetTime: boolean): boolean {
  const audio = getRingtoneAudio()
  if (!audio) return false

  clearToneLoop()

  try {
    audio.loop = true
    if (resetTime) {
      audio.currentTime = 0
    }

    const playResult = audio.play()
    if (playResult && typeof playResult.then === 'function') {
      void playResult
        .then(() => {
          if (!running || activeOwner !== owner) {
            pauseMp3(true)
            return
          }
          usingMp3 = true
        })
        .catch(() => {
          if (!running || activeOwner !== owner) return
          startToneLoop(owner)
        })
      return true
    }

    usingMp3 = true
    return true
  } catch {
    usingMp3 = false
    return false
  }
}

export function unlockRingtoneAudio(): void {
  const context = getAudioContext()
  if (context) {
    void context.resume().catch(() => {})
  }

  const audio = getRingtoneAudio()
  if (!audio) return

  const previousMuted = audio.muted
  const previousVolume = audio.volume
  audio.muted = true
  audio.volume = 0

  const playResult = audio.play()
  if (playResult && typeof playResult.then === 'function') {
    void playResult
      .then(() => {
        audio.pause()
        audio.currentTime = 0
      })
      .catch(() => {})
      .finally(() => {
        audio.muted = previousMuted
        audio.volume = previousVolume
      })
  } else {
    audio.pause()
    audio.currentTime = 0
    audio.muted = previousMuted
    audio.volume = previousVolume
  }
}

function scheduleToneBurst(context: AudioContext) {
  const now = context.currentTime
  const playBeep = (offsetSec: number, frequency: number) => {
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(frequency, now + offsetSec)

    gain.gain.setValueAtTime(0.0001, now + offsetSec)
    gain.gain.exponentialRampToValueAtTime(0.14, now + offsetSec + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offsetSec + 0.24)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now + offsetSec)
    oscillator.stop(now + offsetSec + 0.25)
  }

  playBeep(0, 880)
  playBeep(0.28, 740)
}

export function startIncomingRingtone(owner: string) {
  if (!owner) return
  if (activeOwner === owner && running) return

  clearPlayback(true)
  activeOwner = owner
  running = true

  if (!tryStartMp3(owner, true)) {
    startToneLoop(owner)
  }
}

export function stopIncomingRingtone(owner: string) {
  if (!owner) return
  if (activeOwner !== owner) return

  clearPlayback(true)
  activeOwner = null
}

export function pauseIncomingRingtone(owner: string) {
  if (!owner || activeOwner !== owner) return

  clearToneLoop()
  pauseMp3(false)
  running = false
}

export function resumeIncomingRingtone(owner: string) {
  if (!owner || activeOwner !== owner) return
  if (running) return

  running = true
  if (!tryStartMp3(owner, false)) {
    startToneLoop(owner)
  }
}
