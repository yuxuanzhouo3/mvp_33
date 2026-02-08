'use client'

// 动态导入 AgoraRTC，只在客户端加载
let AgoraRTC: any = null

// 注意：Agora SDK 会在控制台输出一些内部错误日志（如 WS_ABORT），
// 这些是 SDK 内部的日志，我们无法完全阻止。但这些错误已被捕获并静默处理，
// 不会影响功能。如果看到 WS_ABORT 错误但功能正常，可以忽略这些日志。

async function loadAgoraRTC() {
  if (typeof window === 'undefined') {
    throw new Error('AgoraRTC can only be used in the browser')
  }
  if (!AgoraRTC) {
    AgoraRTC = (await import('agora-rtc-sdk-ng')).default
  }
  return AgoraRTC
}

export interface AgoraConfig {
  appId: string
  token?: string // 可选，用于生产环境
  channel: string
  uid: number | string
}

export class AgoraClient {
  private client: any
  private localAudioTrack: any = null
  private localVideoTrack: any = null
  private remoteUsers: Map<string, any> = new Map()
  private onRemoteUserPublished?: (user: any) => void
  private onRemoteUserUnpublished?: (uid: string) => void
  private agoraRTC: any = null

  constructor(private config: AgoraConfig) {
    // 构造函数中不初始化 client，等到 join() 时再初始化
  }

  private async ensureAgoraRTC() {
    if (!this.agoraRTC) {
      this.agoraRTC = await loadAgoraRTC()
    }
    return this.agoraRTC
  }

  // 设置远程用户回调
  setOnRemoteUserPublished(callback: (user: any) => void) {
    this.onRemoteUserPublished = callback
  }

  setOnRemoteUserUnpublished(callback: (uid: string) => void) {
    this.onRemoteUserUnpublished = callback
  }

  // 获取并选择最佳摄像头设备（优先真实摄像头，排除虚拟摄像头）
  private async selectBestCameraDevice(AgoraRTC: any): Promise<string | undefined> {
    try {
      const devices = await AgoraRTC.getCameras()
      if (!devices || devices.length === 0) {
        return undefined
      }
      
      // 优先选择真实摄像头（排除包含 virtual/obs/screen 等关键词的设备）
      const realCamera = devices.find((device: any) => {
        const label = (device.label || '').toLowerCase()
        return !label.includes('virtual') && 
               !label.includes('obs') && 
               !label.includes('screen') &&
               !label.includes('mirror')
      })
      
      if (realCamera) {
        console.log('Selected real camera:', realCamera.label, 'deviceId:', realCamera.deviceId)
        return realCamera.deviceId
      }
      
      // 如果没有找到真实摄像头，使用第一个可用设备
      if (devices.length > 0) {
        console.log('Using first available camera:', devices[0].label, 'deviceId:', devices[0].deviceId)
        return devices[0].deviceId
      }
      
      return undefined
    } catch (error) {
      console.warn('Failed to get camera devices:', error)
      return undefined
    }
  }

  // 初始化并加入频道
  async join(options?: { audioOnly?: boolean }): Promise<void> {
    try {
      const audioOnly = options?.audioOnly || false
      // 确保 AgoraRTC 已加载
      const AgoraRTC = await this.ensureAgoraRTC()

      // 如果已有客户端，先强制清理（不等待 leave 完成，避免阻塞）
      if (this.client) {
        try {
          // 先清理轨道
          if (this.localAudioTrack) {
            try {
              this.localAudioTrack.stop()
              this.localAudioTrack.close()
            } catch (e) {}
            this.localAudioTrack = null
          }
          if (this.localVideoTrack) {
            try {
              this.localVideoTrack.stop()
              this.localVideoTrack.close()
            } catch (e) {}
            this.localVideoTrack = null
          }
          // 尝试离开，但不等待结果
          this.client.leave().catch(() => {})
        } catch (error) {
          console.warn('Error cleaning up existing client:', error)
        }
        // 强制清空引用
        this.client = null
        this.remoteUsers.clear()
      }

      // 创建新的客户端
      this.client = AgoraRTC.createClient({ 
        mode: 'rtc', 
        codec: 'vp8' 
      })

      // 监听用户加入
      this.client.on('user-published', async (user: any, mediaType: string) => {
        try {
          // 确保 user 对象有效
          if (!user || !user.uid) {
            console.warn('Invalid user object in user-published event:', user)
            return
          }
          
          // 检查客户端是否仍然有效（避免在清理过程中订阅）
          if (!this.client) {
            console.warn('Client is null, skipping subscription for user:', user.uid)
            return
          }
          
          // 检查客户端连接状态（如果可用）
          try {
            const connectionState = this.client.connectionState
            if (connectionState === 'DISCONNECTED' || connectionState === 'DISCONNECTING') {
              console.warn('Client is disconnected or disconnecting, skipping subscription for user:', user.uid, 'state:', connectionState)
              return
            }
          } catch (e) {
            // connectionState 可能不存在，继续执行
          }
          
          console.log('User published:', user.uid, 'mediaType:', mediaType)
          
          // 订阅远程用户的媒体流
          await this.client.subscribe(user, mediaType)
          
          if (mediaType === 'video') {
            this.remoteUsers.set(user.uid.toString(), user)
            if (this.onRemoteUserPublished) {
              this.onRemoteUserPublished(user)
            }
          }
          
          if (mediaType === 'audio' && user.audioTrack) {
            user.audioTrack.play()
          }
        } catch (error: any) {
          const errorMsg = error?.message || ''
          const errorCode = error?.code || ''
          
          // 静默处理常见的订阅错误（流不存在或已关闭、PeerConnection断开等）
          if (
            errorMsg.includes('no such stream') ||
            errorMsg.includes('SUBSCRIBE_REQUEST_INVALID') ||
            errorMsg.includes('PeerConnection') ||
            errorMsg.includes('peerConnection') ||
            errorMsg.includes('disconnected') ||
            errorMsg.includes('Cannot subscribe remote user when peerConnection disconnected') ||
            errorCode === 2021 ||
            errorCode === 'ERR_SUBSCRIBE_REQUEST_INVALID' ||
            errorCode === 'INVALID_OPERATION' ||
            String(errorCode) === 'INVALID_OPERATION'
          ) {
            // 静默处理，不输出警告（这些错误在快速重连/清理时很常见）
            return
          }
          
          // 其他错误才输出日志
          console.error('Failed to subscribe to user:', error)
        }
      })

      // 监听用户离开
      this.client.on('user-unpublished', (user: any, mediaType: string) => {
        try {
          if (!user || !user.uid) {
            console.warn('Invalid user object in user-unpublished event:', user)
            return
          }
          
          console.log('User unpublished:', user.uid, 'mediaType:', mediaType)
          
          if (mediaType === 'video') {
            this.remoteUsers.delete(user.uid.toString())
            if (this.onRemoteUserUnpublished) {
              this.onRemoteUserUnpublished(user.uid.toString())
            }
          }
        } catch (error) {
          console.error('Error handling user-unpublished:', error)
        }
      })

      // 加入频道（添加错误处理，静默处理 WS_ABORT 错误）
      try {
        await this.client.join(
          this.config.appId,
          this.config.channel,
          this.config.token || null,
          this.config.uid
        )
      } catch (joinError: any) {
        // 如果是 WS_ABORT 错误（通常由快速切换/清理导致），静默处理
        const errorMsg = joinError?.message || ''
        const errorCode = joinError?.code || ''
        if (errorMsg.includes('WS_ABORT') || errorCode === 'WS_ABORT' || errorMsg.includes('LEAVE')) {
          // 清理状态并返回，不抛出错误
          this.localAudioTrack = null
          this.localVideoTrack = null
          this.client = null
          this.remoteUsers.clear()
          return // 静默返回，不抛出错误
        }
        // 其他错误继续抛出
        throw joinError
      }

      // 创建本地音视频轨道（Agora SDK 会自动请求权限）
      // 音频轨道：如果失败，尝试继续（某些场景下可以仅视频通话）
      try {
        this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack()
      } catch (audioError: any) {
        console.warn('Failed to create local audio track, call will continue as video-only:', audioError)
        const errorMsg = audioError?.message || ''
        const errorName = audioError?.name || ''
        
        // 如果是权限错误，记录但不阻止通话（允许视频通话）
        if (
          errorMsg.includes('permission') ||
          errorMsg.includes('Permission') ||
          errorMsg.includes('denied') ||
          errorName === 'NotAllowedError'
        ) {
          console.warn('Microphone permission denied, continuing as video-only call')
          this.localAudioTrack = null
          // 不离开频道，继续尝试视频通话
        } else {
          // 其他音频错误：如果是严重错误，离开频道
          // 但大多数情况下，可以继续视频通话
          console.warn('Audio track creation failed, but continuing call:', errorMsg)
          this.localAudioTrack = null
        }
        // 不抛出错误，允许通话继续（即使没有音频）
      }

      // 视频轨道：如果创建失败（权限/设备问题），降级为纯音频，不中断整个通话
      if (!audioOnly) {
        try {
          // 直接使用默认摄像头，避免调用 getCameras() 导致的额外权限请求
          // 用户可以通过浏览器设置选择摄像头设备
          this.localVideoTrack = await AgoraRTC.createCameraVideoTrack()
          console.log('Created video track with default camera')
        } catch (videoError: any) {
          console.error('Failed to create local video track, will fallback to audio-only:', videoError)
          const errorMsg = videoError?.message || ''
          const errorName = videoError?.name || ''

          if (
            errorMsg.includes('permission') ||
            errorMsg.includes('Permission') ||
            errorMsg.includes('denied') ||
            errorMsg.includes('Could not start video source') ||
            errorName === 'NotAllowedError' ||
            errorName === 'NotReadableError'
          ) {
            // 仅记录警告：继续使用音频通话，前端显示头像占位图
            console.warn('Camera permission or device issue, using avatar placeholder instead of video.')
            this.localVideoTrack = null
          } else {
            // 其他未知视频错误：保守起见，离开频道并抛出
            if (this.client) {
              try {
                await this.client.leave()
              } catch (leaveError) {
                console.warn('Error leaving after video track failure:', leaveError)
              }
              this.client = null
            }
            throw videoError
          }
        }
      }

      // 确保至少有一个轨道或客户端存在
      if (!this.client) {
        throw new Error('Client not initialized')
      }

      // 发布本地轨道（发布前再次校验 client/轨道存在）
      // 如果没有音频轨道，只发布视频轨道（允许视频通话）
      try {
        const tracksToPublish: any[] = []
        if (this.localAudioTrack) {
          tracksToPublish.push(this.localAudioTrack)
        }
        if (this.localVideoTrack && !audioOnly) {
          tracksToPublish.push(this.localVideoTrack)
        }
        
        // 如果没有任何轨道，抛出错误
        if (tracksToPublish.length === 0) {
          throw new Error('No tracks available to publish (both audio and video failed)')
        }
        
        if (this.client && tracksToPublish.length > 0) {
          await this.client.publish(tracksToPublish)
          console.log(`Published ${tracksToPublish.length} track(s):`, {
            audio: !!this.localAudioTrack,
            video: !!this.localVideoTrack
          })
        } else {
          throw new Error('Client or tracks not available for publish')
        }
      } catch (publishError: any) {
        const errorMsg = publishError?.message || ''
        // 如果是 PeerConnection 已断开等错误，静默处理（可能是快速关闭导致的）
        if (errorMsg.includes('PeerConnection') || errorMsg.includes('disconnected')) {
          console.warn('Publish failed due to connection state, cleaning up:', errorMsg)
          if (this.client) {
            try {
              await this.client.leave()
            } catch (_) {}
            this.client = null
          }
          this.localAudioTrack = null
          this.localVideoTrack = null
          return // 静默返回，不抛出错误
        }
        
        console.error('Failed to publish local tracks:', publishError)
        // 发布失败时离开频道并清理
        if (this.client) {
          try {
            await this.client.leave()
          } catch (_) {}
          this.client = null
        }
        this.localAudioTrack = null
        this.localVideoTrack = null
        throw publishError
      }
    } catch (error: any) {
      // 部分场景（快速切换/关闭对话框）Agora 会抛出一些“看起来是错误，其实是正常中断”的异常：
      // - WS_ABORT / LEAVE / OPERATION_ABORTED：表示连接在操作过程中被主动关闭
      // - "PeerConnection already disconnected"：本地 PeerConnection 在 publish 过程中已经断开
      // 这些在用户快速挂断/关闭通话对话框时非常常见，不应该当成致命错误。
      const msg = error?.message || ''
      const code = error?.code || ''
      if (
        msg.includes('WS_ABORT') ||
        msg.includes('LEAVE') ||
        code === 'WS_ABORT' ||
        code === 'OPERATION_ABORTED' ||
        msg.includes('PeerConnection already disconnected') ||
        msg.includes('PeerConnection') // 防御性匹配，避免类似错误打断流程
      ) {
        // 静默处理，不输出警告日志（SDK 本身已经打印了详细日志）
        // 清理本地引用后直接返回，不再向上抛
        this.localAudioTrack = null
        this.localVideoTrack = null
        if (this.client) {
          try {
            await this.client.leave()
          } catch (_) {}
          this.client = null
        }
        return
      }

      console.error('Failed to join Agora channel:', error)
      // 确保清理状态
      this.localAudioTrack = null
      this.localVideoTrack = null
      if (this.client) {
        try {
          await this.client.leave()
        } catch (e) {}
        this.client = null
      }
      throw error
    }
  }

  // 离开频道
  async leave(): Promise<void> {
    // 停止并关闭本地轨道
    if (this.localAudioTrack) {
      try {
        this.localAudioTrack.stop()
        this.localAudioTrack.close()
      } catch (error) {
        console.warn('Error closing audio track:', error)
      }
      this.localAudioTrack = null
    }
    
    if (this.localVideoTrack) {
      try {
        this.localVideoTrack.stop()
        this.localVideoTrack.close()
      } catch (error) {
        console.warn('Error closing video track:', error)
      }
      this.localVideoTrack = null
    }

    // 离开频道（即使失败也要清理引用）
    if (this.client) {
      try {
        await this.client.leave()
      } catch (error) {
        console.warn('Error leaving channel:', error)
        // 即使 leave 失败，也要清理引用，避免状态混乱
      }
      this.client = null
    }
    
    this.remoteUsers.clear()
  }

  // 静音/取消静音
  async setMuted(muted: boolean): Promise<void> {
    if (this.localAudioTrack) {
      this.localAudioTrack.setMuted(muted)
    }
  }

  // 开启/关闭视频
  async setVideoEnabled(enabled: boolean): Promise<void> {
    if (this.localVideoTrack) {
      this.localVideoTrack.setEnabled(enabled)
    }
  }

  // 获取本地视频轨道（用于显示）
  getLocalVideoTrack(): any {
    return this.localVideoTrack
  }

  // 获取远程用户列表
  getRemoteUsers(): Map<string, any> {
    return this.remoteUsers
  }

  // 获取远程用户的视频轨道
  getRemoteUserVideoTrack(uid: string): any {
    const user = this.remoteUsers.get(uid)
    return user?.videoTrack || null
  }
}


