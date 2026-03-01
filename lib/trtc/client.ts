'use client'

let TRTCSDK: any = null
let trtcScriptPromise: Promise<any> | null = null

declare global {
  interface Window {
    TRTC?: any
  }
}

async function loadTRTC() {
  if (typeof window === 'undefined') {
    throw new Error('TRTC can only be used in the browser')
  }

  if (window.TRTC) {
    TRTCSDK = window.TRTC
    return TRTCSDK
  }

  if (!TRTCSDK) {
    if (!trtcScriptPromise) {
      trtcScriptPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-trtc-sdk="v5"]') as HTMLScriptElement | null
        if (existing) {
          if (window.TRTC) {
            resolve(window.TRTC)
            return
          }
          existing.addEventListener('load', () => resolve(window.TRTC), { once: true })
          existing.addEventListener('error', () => reject(new Error('Failed to load TRTC SDK')), { once: true })
          return
        }

        const script = document.createElement('script')
        script.src = 'https://web.sdk.qcloud.com/trtc/webrtc/v5/trtc.js'
        script.async = true
        script.defer = true
        script.dataset.trtcSdk = 'v5'
        script.onload = () => {
          if (window.TRTC) {
            resolve(window.TRTC)
          } else {
            reject(new Error('TRTC SDK loaded but global object is missing'))
          }
        }
        script.onerror = () => reject(new Error('Failed to load TRTC SDK'))
        document.head.appendChild(script)
      })
    }

    TRTCSDK = await trtcScriptPromise
  }

  return TRTCSDK
}

export interface TrtcConfig {
  appId: string | number
  token?: string // userSig
  channel: string
  uid: number | string
}

type TrtcRemoteUser = {
  uid: string
  audioTrack?: any
  videoTrack?: any
  _audioStreamType?: any
  _videoStreamType?: any
}

export class TrtcClient {
  private trtc: any = null
  private trtcSDK: any = null
  private localVideoTrack: any = null
  private remoteUsers: Map<string, TrtcRemoteUser> = new Map()
  private onRemoteUserPublished?: (user: any) => void
  private onRemoteUserUnpublished?: (uid: string) => void
  private localAudioMuted = false

  constructor(private config: TrtcConfig) {}

  setOnRemoteUserPublished(callback: (user: any) => void) {
    this.onRemoteUserPublished = callback
  }

  setOnRemoteUserUnpublished(callback: (uid: string) => void) {
    this.onRemoteUserUnpublished = callback
  }

  private async ensureTRTC() {
    if (!this.trtcSDK) {
      this.trtcSDK = await loadTRTC()
    }
    return this.trtcSDK
  }

  private getMainStreamType() {
    return this.trtcSDK?.TYPE?.STREAM_TYPE_MAIN
  }

  private getRoomId(channel: string): number {
    const hash = channel.split('').reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0)
    let roomId = hash === 0 ? 1 : hash
    if (roomId > 4294967294) {
      roomId = 4294967294
    }
    return roomId
  }

  private isAvailable(event: any): boolean {
    if (typeof event?.isAvailable === 'boolean') return event.isAvailable
    if (typeof event?.available === 'boolean') return event.available
    if (typeof event?.isVideoAvailable === 'boolean') return event.isVideoAvailable
    if (typeof event?.isAudioAvailable === 'boolean') return event.isAudioAvailable
    return true
  }

  private ensureRemoteUser(uid: string): TrtcRemoteUser {
    const existing = this.remoteUsers.get(uid)
    if (existing) return existing
    const user: TrtcRemoteUser = { uid }
    this.remoteUsers.set(uid, user)
    return user
  }

  private emitRemotePublished(user: TrtcRemoteUser) {
    if (this.onRemoteUserPublished) {
      this.onRemoteUserPublished(user)
    }
  }

  private emitRemoteUnpublished(uid: string) {
    if (this.onRemoteUserUnpublished) {
      this.onRemoteUserUnpublished(uid)
    }
  }

  private removeRemoteTrack(uid: string, mediaType: 'audio' | 'video') {
    const user = this.remoteUsers.get(uid)
    if (!user) return

    if (mediaType === 'audio') {
      delete user.audioTrack
      delete user._audioStreamType
    } else {
      delete user.videoTrack
      delete user._videoStreamType
    }

    if (!user.audioTrack && !user.videoTrack) {
      this.remoteUsers.delete(uid)
      this.emitRemoteUnpublished(uid)
    }
  }

  private bind(eventName: any, handler: (event: any) => void) {
    if (!eventName || !this.trtc || typeof this.trtc.on !== 'function') return
    this.trtc.on(eventName, handler)
  }

  private async startRemoteAudio(uid: string, streamType: any) {
    if (!this.trtc || typeof this.trtc.startRemoteAudio !== 'function') return
    try {
      await Promise.resolve(this.trtc.startRemoteAudio({ userId: uid, streamType }))
    } catch (error) {
      console.warn('Failed to start remote audio:', error)
    }
  }

  private async startRemoteVideo(uid: string, streamType: any, view?: HTMLElement | null) {
    if (!this.trtc || typeof this.trtc.startRemoteVideo !== 'function') return
    try {
      if (view) {
        await Promise.resolve(this.trtc.startRemoteVideo({ userId: uid, streamType, view }))
      } else {
        await Promise.resolve(this.trtc.startRemoteVideo({ userId: uid, streamType }))
      }
    } catch (error) {
      console.warn('Failed to start remote video:', error)
    }
  }

  private createRemoteAudioTrack(uid: string, streamType: any) {
    const trackId = `remote-audio-${uid}-${String(streamType)}`
    return {
      play: () => {
        void this.startRemoteAudio(uid, streamType)
      },
      getTrackId: () => trackId,
    }
  }

  private createRemoteVideoTrack(uid: string, streamType: any) {
    const trackId = `remote-video-${uid}-${String(streamType)}`
    return {
      play: (view?: HTMLElement | null) => {
        void this.startRemoteVideo(uid, streamType, view)
      },
      getTrackId: () => trackId,
    }
  }

  private createLocalVideoTrack() {
    const trackId = `local-video-${String(this.config.uid)}`
    return {
      play: (view?: HTMLElement | null) => {
        void this.startLocalVideo(view)
      },
      setEnabled: (enabled: boolean) => {
        void this.setVideoEnabled(enabled)
      },
      getTrackId: () => trackId,
    }
  }

  private async startLocalVideo(view?: HTMLElement | null) {
    if (!this.trtc || typeof this.trtc.startLocalVideo !== 'function') {
      this.localVideoTrack = null
      return
    }

    try {
      if (view) {
        try {
          await Promise.resolve(this.trtc.startLocalVideo({ view }))
        } catch {
          await Promise.resolve(this.trtc.startLocalVideo(view))
        }
      } else {
        await Promise.resolve(this.trtc.startLocalVideo())
      }
      this.localVideoTrack = this.createLocalVideoTrack()
    } catch (error: any) {
      const message = String(error?.message || '')
      if (message.toLowerCase().includes('already')) {
        if (view && typeof this.trtc.updateLocalVideo === 'function') {
          try {
            await Promise.resolve(this.trtc.updateLocalVideo({ view, mute: false }))
          } catch {}
        }
        this.localVideoTrack = this.createLocalVideoTrack()
        return
      }
      this.localVideoTrack = null
      throw error
    }
  }

  private bindCoreEvents() {
    const EVENT = this.trtcSDK?.EVENT || {}
    const mainStreamType = this.getMainStreamType()

    this.bind(EVENT.REMOTE_AUDIO_AVAILABLE, (event: any) => {
      const uid = String(event?.userId ?? event?.uid ?? '')
      if (!uid || !this.isAvailable(event)) return

      const streamType = event?.streamType ?? mainStreamType
      const user = this.ensureRemoteUser(uid)
      user._audioStreamType = streamType
      user.audioTrack = this.createRemoteAudioTrack(uid, streamType)
      this.emitRemotePublished(user)
      void this.startRemoteAudio(uid, streamType)
    })

    this.bind(EVENT.REMOTE_AUDIO_UNAVAILABLE, (event: any) => {
      const uid = String(event?.userId ?? event?.uid ?? '')
      if (!uid) return
      this.removeRemoteTrack(uid, 'audio')
    })

    this.bind(EVENT.REMOTE_VIDEO_AVAILABLE, (event: any) => {
      const uid = String(event?.userId ?? event?.uid ?? '')
      if (!uid || !this.isAvailable(event)) return

      const streamType = event?.streamType ?? mainStreamType
      const user = this.ensureRemoteUser(uid)
      user._videoStreamType = streamType
      user.videoTrack = this.createRemoteVideoTrack(uid, streamType)
      this.emitRemotePublished(user)
    })

    this.bind(EVENT.REMOTE_VIDEO_UNAVAILABLE, (event: any) => {
      const uid = String(event?.userId ?? event?.uid ?? '')
      if (!uid) return
      this.removeRemoteTrack(uid, 'video')
    })

    const leaveEvents = [EVENT.USER_LEAVE, EVENT.REMOTE_USER_LEAVE, EVENT.REMOTE_USER_EXIT].filter(Boolean)
    leaveEvents.forEach((eventName: any) => {
      this.bind(eventName, (event: any) => {
        const uid = String(event?.userId ?? event?.uid ?? '')
        if (!uid) return
        this.remoteUsers.delete(uid)
        this.emitRemoteUnpublished(uid)
      })
    })
  }

  async join(options?: { audioOnly?: boolean }): Promise<void> {
    const audioOnly = options?.audioOnly || false
    const trtcSDK = await this.ensureTRTC()

    const sdkAppId = Number.parseInt(String(this.config.appId || ''), 10)
    if (!Number.isFinite(sdkAppId) || sdkAppId <= 0) {
      throw new Error('TRTC SDKAppID not configured')
    }

    const userSig = String(this.config.token || '').trim()
    if (!userSig) {
      throw new Error('TRTC userSig not configured')
    }

    if (this.trtc) {
      await this.leave()
    }

    this.remoteUsers.clear()
    this.localVideoTrack = null
    this.localAudioMuted = false

    this.trtc = trtcSDK.create({
      assetsPath: 'https://web.sdk.qcloud.com/trtc/webrtc/v5/assets/',
    })

    this.bindCoreEvents()

    const roomId = this.getRoomId(this.config.channel)

    await Promise.resolve(
      this.trtc.enterRoom({
        roomId,
        scene: trtcSDK?.TYPE?.SCENE_RTC || 'rtc',
        sdkAppId,
        userId: String(this.config.uid),
        userSig,
      }),
    )

    if (typeof this.trtc.startLocalAudio === 'function') {
      await Promise.resolve(this.trtc.startLocalAudio())
    }

    if (!audioOnly) {
      try {
        await this.startLocalVideo()
      } catch (error) {
        console.warn('Failed to start local video, fallback to audio-only:', error)
      }
    }
  }

  async leave(): Promise<void> {
    if (!this.trtc) {
      this.remoteUsers.clear()
      this.localVideoTrack = null
      return
    }

    try {
      if (typeof this.trtc.stopLocalVideo === 'function') {
        await Promise.resolve(this.trtc.stopLocalVideo())
      }
    } catch (error) {
      console.warn('Failed to stop local video:', error)
    }

    try {
      if (typeof this.trtc.stopLocalAudio === 'function') {
        await Promise.resolve(this.trtc.stopLocalAudio())
      }
    } catch (error) {
      console.warn('Failed to stop local audio:', error)
    }

    try {
      if (typeof this.trtc.exitRoom === 'function') {
        await Promise.resolve(this.trtc.exitRoom())
      }
    } catch (error) {
      console.warn('Failed to exit TRTC room:', error)
    }

    try {
      if (typeof this.trtc.destroy === 'function') {
        await Promise.resolve(this.trtc.destroy())
      }
    } catch (error) {
      console.warn('Failed to destroy TRTC instance:', error)
    }

    this.trtc = null
    this.localVideoTrack = null
    this.remoteUsers.clear()
  }

  async setMuted(muted: boolean): Promise<void> {
    this.localAudioMuted = muted
    if (!this.trtc) return

    try {
      if (muted) {
        if (typeof this.trtc.muteLocalAudio === 'function') {
          await Promise.resolve(this.trtc.muteLocalAudio())
          return
        }
      } else if (typeof this.trtc.unmuteLocalAudio === 'function') {
        await Promise.resolve(this.trtc.unmuteLocalAudio())
        return
      }

      if (typeof this.trtc.updateLocalAudio === 'function') {
        await Promise.resolve(this.trtc.updateLocalAudio({ mute: muted }))
        return
      }

      if (muted && typeof this.trtc.stopLocalAudio === 'function') {
        await Promise.resolve(this.trtc.stopLocalAudio())
      } else if (!muted && typeof this.trtc.startLocalAudio === 'function') {
        await Promise.resolve(this.trtc.startLocalAudio())
      }
    } catch (error) {
      console.warn('Failed to set local mute state:', error)
    }
  }

  async setVideoEnabled(enabled: boolean): Promise<void> {
    if (!this.trtc) {
      this.localVideoTrack = null
      return
    }

    try {
      if (!enabled) {
        if (typeof this.trtc.stopLocalVideo === 'function') {
          await Promise.resolve(this.trtc.stopLocalVideo())
        } else if (typeof this.trtc.updateLocalVideo === 'function') {
          await Promise.resolve(this.trtc.updateLocalVideo({ mute: true }))
        }
        this.localVideoTrack = null
        return
      }

      await this.startLocalVideo()
    } catch (error) {
      console.warn('Failed to set local video state:', error)
      if (!enabled) {
        this.localVideoTrack = null
      }
    }
  }

  getLocalVideoTrack(): any {
    return this.localVideoTrack
  }

  getRemoteUsers(): Map<string, any> {
    return this.remoteUsers
  }

  getRemoteUserVideoTrack(uid: string): any {
    const user = this.remoteUsers.get(uid)
    return user?.videoTrack || null
  }
}
