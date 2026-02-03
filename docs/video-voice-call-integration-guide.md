# 视频通话和语音通话第三方集成指南

## 目录
1. [服务提供商选择](#服务提供商选择)
2. [Agora（声网）集成](#agora声网集成) - 推荐国内使用
3. [Twilio Video 集成](#twilio-video-集成) - 推荐国际使用
4. [Daily.co 集成](#dailyco-集成) - 简单易用
5. [Jitsi Meet 集成](#jitsi-meet-集成) - 开源免费
6. [通用集成步骤](#通用集成步骤)
7. [信令服务器实现](#信令服务器实现)

---

## 服务提供商选择

### 对比表

| 服务商 | 地区 | 价格 | 难度 | 推荐场景 | 国内支持 |
|--------|------|------|------|----------|----------|
| **Agora（声网）** | 全球覆盖 | 按分钟计费 | 中等 | 国内+国际用户 | ✅ 优秀（全球） |
| **腾讯云 TRTC** | 全球（国内优化） | 按分钟计费 | 中等 | 国内用户为主 | ✅ 优秀 |
| **Twilio Video** | 全球 | 按分钟计费 | 中等 | 国际用户为主 | ⚠️ 一般 |
| **Daily.co** | 全球 | 按分钟计费 | 简单 | 快速上线（国际） | ❌ 不推荐 |
| **Jitsi Meet** | 全球 | 免费（自建） | 复杂 | 开源/私有化 | ✅ 可自建 |
| **Vonage Video** | 全球 | 按分钟计费 | 中等 | 企业级 | ⚠️ 一般 |

### 推荐方案

- **国内用户为主**：**Agora（声网）** 或 **腾讯云 TRTC** ⭐ 强烈推荐
- **国际用户为主**：**Agora（声网）** 或 Twilio Video 或 Daily.co
- **混合用户（国内+国际）**：**Agora（声网）** ⭐ 最佳选择 - 全球覆盖，国内优化最好
- **预算有限/开源需求**：Jitsi Meet（自建服务器）

### ✅ Agora（声网）全球覆盖说明

**Agora 同时支持国内和国外用户**，是全球性的实时音视频通信服务：

- ✅ **全球覆盖**：SD-RTN™ 网络覆盖全球 200+ 个国家和地区
- ✅ **国内优化**：国内网络延迟低（50-100ms），稳定性高
- ✅ **国际优化**：国际用户延迟也较低（100-200ms），连接稳定
- ✅ **全平台支持**：支持 6000+ 种移动终端和设备
- ✅ **高可用性**：端到端优质传输率 > 99%

**适合场景**：
- 国内用户为主 ✅
- 国际用户为主 ✅
- 混合用户（国内+国际）✅ **最佳选择**

### ⚠️ 重要提示：Daily.co 国内使用限制

**Daily.co 不太适合国内用户**，原因：
1. **网络延迟高**：服务器在海外，国内访问延迟较高（200-500ms+）
2. **连接不稳定**：可能受网络波动影响，通话质量不稳定
3. **监管限制**：部分功能可能在国内受限

**如果用户主要是国内用户，强烈推荐使用：**
- **Agora（声网）**：国内网络优化最好，延迟低（50-100ms），稳定性高
- **腾讯云 TRTC**：腾讯云服务，国内网络优化好，与微信生态集成方便

---

## Agora（声网）集成

### 1. 注册和获取密钥

1. 访问 [Agora 官网](https://www.agora.io/)
2. 注册账号并创建项目
3. 获取 **App ID** 和 **App Certificate**（可选，用于 Token 鉴权）

### 2. 安装 SDK

```bash
npm install agora-rtc-sdk-ng
# 或
yarn add agora-rtc-sdk-ng
```

### 3. 创建 Agora 服务封装

创建 `lib/agora/client.ts`：

```typescript
import AgoraRTC from 'agora-rtc-sdk-ng'

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

  constructor(private config: AgoraConfig) {
    this.client = AgoraRTC.createClient({ 
      mode: 'rtc', 
      codec: 'vp8' 
    })
  }

  // 初始化并加入频道
  async join(): Promise<void> {
    try {
      // 监听用户加入
      this.client.on('user-published', async (user: any, mediaType: string) => {
        await this.client.subscribe(user, mediaType)
        
        if (mediaType === 'video') {
          this.remoteUsers.set(user.uid, user)
        }
        
        if (mediaType === 'audio') {
          user.audioTrack?.play()
        }
      })

      // 监听用户离开
      this.client.on('user-unpublished', (user: any) => {
        this.remoteUsers.delete(user.uid)
      })

      // 加入频道
      await this.client.join(
        this.config.appId,
        this.config.channel,
        this.config.token || null,
        this.config.uid
      )

      // 创建本地音视频轨道
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack()
      this.localVideoTrack = await AgoraRTC.createCameraVideoTrack()

      // 发布本地轨道
      await this.client.publish([this.localAudioTrack, this.localVideoTrack])
    } catch (error) {
      console.error('Failed to join Agora channel:', error)
      throw error
    }
  }

  // 离开频道
  async leave(): Promise<void> {
    try {
      // 停止并关闭本地轨道
      this.localAudioTrack?.stop()
      this.localVideoTrack?.stop()
      this.localAudioTrack?.close()
      this.localVideoTrack?.close()

      // 离开频道
      await this.client.leave()
      
      this.remoteUsers.clear()
    } catch (error) {
      console.error('Failed to leave Agora channel:', error)
      throw error
    }
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
}
```

### 4. 创建 Token 生成 API（生产环境）

创建 `app/api/agora/token/route.ts`：

```typescript
import { NextRequest, NextResponse } from 'next/server'
import RtcTokenBuilder from '@/lib/agora/RtcTokenBuilder' // 需要安装 agora-access-token

export async function POST(request: NextRequest) {
  try {
    const { channelName, uid } = await request.json()
    
    const appId = process.env.AGORA_APP_ID!
    const appCertificate = process.env.AGORA_APP_CERTIFICATE!
    const expirationTimeInSeconds = 3600 // 1小时
    
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds
    
    // 生成 Token
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      uid,
      RtcTokenBuilder.Role.Role_Publisher,
      privilegeExpiredTs
    )
    
    return NextResponse.json({ success: true, token })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
```

### 5. 更新视频通话组件

更新 `components/chat/video-call-dialog.tsx`：

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { AgoraClient } from '@/lib/agora/client'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Mic, MicOff, Phone, Video, VideoOff } from 'lucide-react'
import { User } from '@/lib/types'

interface VideoCallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipient: User
  currentUser: User
}

export function VideoCallDialog({ 
  open, 
  onOpenChange, 
  recipient,
  currentUser
}: VideoCallDialogProps) {
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOn, setIsVideoOn] = useState(true)
  const [callStatus, setCallStatus] = useState<'calling' | 'connected' | 'ended'>('calling')
  const [callDuration, setCallDuration] = useState(0)
  
  const agoraClientRef = useRef<AgoraClient | null>(null)
  const localVideoRef = useRef<HTMLDivElement>(null)
  const remoteVideoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && callStatus === 'calling') {
      initializeCall()
    }
    
    return () => {
      if (agoraClientRef.current) {
        agoraClientRef.current.leave()
      }
    }
  }, [open])

  const initializeCall = async () => {
    try {
      // 生成频道名称（使用会话ID或用户ID组合）
      const channelName = `call_${currentUser.id}_${recipient.id}`
      
      // 获取 Token（生产环境）
      const tokenResponse = await fetch('/api/agora/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName,
          uid: currentUser.id,
        }),
      })
      const { token } = await tokenResponse.json()

      // 创建 Agora 客户端
      const client = new AgoraClient({
        appId: process.env.NEXT_PUBLIC_AGORA_APP_ID!,
        token,
        channel: channelName,
        uid: currentUser.id,
      })

      agoraClientRef.current = client

      // 加入频道
      await client.join()
      
      // 显示本地视频
      const localVideoTrack = client.getLocalVideoTrack()
      if (localVideoTrack && localVideoRef.current) {
        localVideoTrack.play(localVideoRef.current)
      }

      // 监听远程用户
      const checkRemoteUsers = setInterval(() => {
        const remoteUsers = client.getRemoteUsers()
        if (remoteUsers.size > 0 && remoteVideoRef.current) {
          const remoteUser = Array.from(remoteUsers.values())[0]
          remoteUser.videoTrack?.play(remoteVideoRef.current)
          setCallStatus('connected')
        }
      }, 500)

      setCallStatus('connected')
      
      // 清理定时器
      setTimeout(() => clearInterval(checkRemoteUsers), 10000)
    } catch (error) {
      console.error('Failed to initialize call:', error)
      setCallStatus('ended')
    }
  }

  const handleEndCall = async () => {
    if (agoraClientRef.current) {
      await agoraClientRef.current.leave()
    }
    setCallStatus('ended')
    setTimeout(() => {
      onOpenChange(false)
    }, 500)
  }

  const handleToggleMute = async () => {
    if (agoraClientRef.current) {
      await agoraClientRef.current.setMuted(!isMuted)
      setIsMuted(!isMuted)
    }
  }

  const handleToggleVideo = async () => {
    if (agoraClientRef.current) {
      await agoraClientRef.current.setVideoEnabled(!isVideoOn)
      setIsVideoOn(!isVideoOn)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0">
        <div className="relative w-full h-[600px] bg-black rounded-lg overflow-hidden">
          {/* 远程视频 */}
          <div 
            ref={remoteVideoRef}
            className="absolute inset-0 w-full h-full"
          />
          
          {/* 本地视频（小窗口） */}
          <div 
            ref={localVideoRef}
            className="absolute top-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden"
          />
          
          {/* 控制按钮 */}
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center justify-center gap-4">
              <Button
                size="icon"
                variant={isMuted ? "destructive" : "secondary"}
                onClick={handleToggleMute}
              >
                {isMuted ? <MicOff /> : <Mic />}
              </Button>
              
              <Button
                size="icon"
                variant={isVideoOn ? "secondary" : "destructive"}
                onClick={handleToggleVideo}
              >
                {isVideoOn ? <Video /> : <VideoOff />}
              </Button>
              
              <Button
                size="icon"
                variant="destructive"
                onClick={handleEndCall}
              >
                <Phone />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

### 6. 环境变量配置

在 `.env.local` 中添加：

```env
NEXT_PUBLIC_AGORA_APP_ID=your_app_id
AGORA_APP_CERTIFICATE=your_app_certificate
```

---

## Twilio Video 集成

### 1. 注册和获取密钥

1. 访问 [Twilio 官网](https://www.twilio.com/)
2. 注册账号并创建项目
3. 获取 **Account SID**、**API Key** 和 **API Secret**

### 2. 安装 SDK

```bash
npm install twilio-video
```

### 3. 创建 Twilio Token 生成 API

创建 `app/api/twilio/token/route.ts`：

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { AccessToken } from 'twilio'

export async function POST(request: NextRequest) {
  try {
    const { roomName, identity } = await request.json()
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID!
    const apiKey = process.env.TWILIO_API_KEY!
    const apiSecret = process.env.TWILIO_API_SECRET!
    
    // 创建 Access Token
    const token = new AccessToken(accountSid, apiKey, apiSecret, {
      identity,
    })
    
    // 授予视频权限
    const videoGrant = new AccessToken.VideoGrant({
      room: roomName,
    })
    token.addGrant(videoGrant)
    
    return NextResponse.json({
      success: true,
      token: token.toJwt(),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
```

### 4. 创建 Twilio 客户端封装

创建 `lib/twilio/client.ts`：

```typescript
import * as TwilioVideo from 'twilio-video'

export class TwilioVideoClient {
  private room: TwilioVideo.Room | null = null
  private localTracks: TwilioVideo.LocalTrack[] = []

  async joinRoom(token: string, roomName: string): Promise<void> {
    try {
      // 获取本地音视频轨道
      const localTracks = await TwilioVideo.createLocalTracks({
        audio: true,
        video: { width: 1280, height: 720 },
      })
      
      this.localTracks = localTracks

      // 加入房间
      this.room = await TwilioVideo.connect(token, {
        name: roomName,
        tracks: localTracks,
      })

      // 监听参与者加入
      this.room.on('participantConnected', (participant) => {
        console.log('Participant connected:', participant.identity)
      })

      // 监听参与者离开
      this.room.on('participantDisconnected', (participant) => {
        console.log('Participant disconnected:', participant.identity)
      })
    } catch (error) {
      console.error('Failed to join Twilio room:', error)
      throw error
    }
  }

  async leaveRoom(): Promise<void> {
    if (this.room) {
      this.room.disconnect()
      this.room = null
    }
    
    // 停止所有本地轨道
    this.localTracks.forEach(track => track.stop())
    this.localTracks = []
  }

  getLocalTracks(): TwilioVideo.LocalTrack[] {
    return this.localTracks
  }

  getRoom(): TwilioVideo.Room | null {
    return this.room
  }
}
```

### 5. 环境变量配置

```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_API_KEY=your_api_key
TWILIO_API_SECRET=your_api_secret
```

---

## Daily.co 集成

### 1. 注册和获取密钥

1. 访问 [Daily.co 官网](https://www.daily.co/)
2. 注册账号并创建项目
3. 获取 **API Key**

### 2. 安装 SDK

```bash
npm install @daily-co/daily-js
```

### 3. 创建 Daily.co Token 生成 API

创建 `app/api/daily/token/route.ts`：

```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { roomName, userId } = await request.json()
    
    const apiKey = process.env.DAILY_API_KEY!
    const dailyDomain = process.env.DAILY_DOMAIN!
    
    // 创建房间（如果不存在）
    const createRoomResponse = await fetch(
      `https://${dailyDomain}.daily.co/api/v1/rooms`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: roomName,
          privacy: 'private',
        }),
      }
    )
    
    const room = await createRoomResponse.json()
    
    // 生成临时 Token
    const tokenResponse = await fetch(
      `https://${dailyDomain}.daily.co/api/v1/meeting-tokens`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            user_id: userId,
            is_owner: true,
          },
        }),
      }
    )
    
    const { token } = await tokenResponse.json()
    
    return NextResponse.json({
      success: true,
      token,
      roomUrl: room.url,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
```

### 4. 使用 Daily.co 客户端

更新视频通话组件：

```typescript
import DailyIframe from '@daily-co/daily-js'

const callFrame = DailyIframe.createFrame({
  showLeaveButton: true,
  iframeStyle: {
    position: 'fixed',
    width: '100%',
    height: '100%',
    border: '0',
  },
})

// 加入房间
await callFrame.join({ url: roomUrl, token })
```

---

## Jitsi Meet 集成

### 1. 安装 SDK

```bash
npm install @jitsi/react-sdk
```

### 2. 使用 Jitsi Meet（最简单方式）

```typescript
import { JitsiMeeting } from '@jitsi/react-sdk'

<JitsiMeeting
  roomName="your-room-name"
  configOverwrite={{
    startWithAudioMuted: false,
    startWithVideoMuted: false,
  }}
  interfaceConfigOverwrite={{
    DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
  }}
  onApiReady={(api) => {
    // API 就绪回调
  }}
/>
```

### 3. 自建 Jitsi 服务器（可选）

如果需要私有化部署，需要：
1. 部署 Jitsi Meet 服务器
2. 配置域名和 SSL 证书
3. 使用自定义域名连接

---

## 通用集成步骤

### 步骤 1: 选择服务提供商

根据用户地区、预算和技术要求选择合适服务商。

### 步骤 2: 注册账号并获取密钥

- 注册服务商账号
- 创建项目/应用
- 获取 API 密钥和配置信息

### 步骤 3: 安装 SDK

```bash
# Agora
npm install agora-rtc-sdk-ng

# Twilio
npm install twilio-video

# Daily.co
npm install @daily-co/daily-js

# Jitsi
npm install @jitsi/react-sdk
```

### 步骤 4: 创建 Token 生成 API

在生产环境中，Token 必须在服务端生成，不能在前端暴露密钥。

### 步骤 5: 更新 UI 组件

更新现有的 `video-call-dialog.tsx` 和 `voice-call-dialog.tsx`，集成实际的 SDK。

### 步骤 6: 实现信令服务器

使用 Supabase Realtime 或 WebSocket 实现呼叫信令（发起、接听、挂断等）。

---

## 信令服务器实现

### 使用 Supabase Realtime

创建 `lib/call-signaling.ts`：

```typescript
import { createClient } from '@/lib/supabase/client'

export interface CallSignal {
  type: 'call' | 'answer' | 'reject' | 'hangup'
  from: string
  to: string
  callId: string
  roomName?: string
}

export class CallSignaling {
  private supabase = createClient()
  private channel: any

  constructor(private userId: string) {
    // 订阅呼叫信令频道
    this.channel = this.supabase
      .channel(`calls:${userId}`)
      .on('broadcast', { event: 'call-signal' }, (payload) => {
        // 处理信令
        this.handleSignal(payload.payload)
      })
      .subscribe()
  }

  // 发起呼叫
  async initiateCall(to: string, callId: string, roomName: string): Promise<void> {
    await this.channel.send({
      type: 'broadcast',
      event: 'call-signal',
      payload: {
        type: 'call',
        from: this.userId,
        to,
        callId,
        roomName,
      },
    })
  }

  // 接听呼叫
  async answerCall(callId: string): Promise<void> {
    await this.channel.send({
      type: 'broadcast',
      event: 'call-signal',
      payload: {
        type: 'answer',
        callId,
      },
    })
  }

  // 拒绝呼叫
  async rejectCall(callId: string): Promise<void> {
    await this.channel.send({
      type: 'broadcast',
      event: 'call-signal',
      payload: {
        type: 'reject',
        callId,
      },
    })
  }

  // 挂断
  async hangup(callId: string): Promise<void> {
    await this.channel.send({
      type: 'broadcast',
      event: 'call-signal',
      payload: {
        type: 'hangup',
        callId,
      },
    })
  }

  private handleSignal(signal: CallSignal): void {
    // 处理接收到的信令
    // 可以通过事件或回调通知 UI
  }

  cleanup(): void {
    this.supabase.removeChannel(this.channel)
  }
}
```

### 使用 WebSocket（自定义）

如果需要更灵活的控制，可以创建自定义 WebSocket 服务器：

```typescript
// app/api/ws/route.ts (需要 WebSocket 支持)
export async function GET(request: Request) {
  // WebSocket 升级逻辑
  // 处理信令消息
}
```

---

## 推荐实现方案

### 方案 1: Agora（声网）- 全球用户首选 ⭐⭐⭐

**优点**：
- ✅ **全球覆盖**：支持国内和国外用户，SD-RTN™ 网络覆盖 200+ 个国家和地区
- ✅ **国内网络优化最好**：国内延迟低（50-100ms），稳定性高
- ✅ **国际网络优化**：国际用户延迟也较低（100-200ms），连接稳定
- ✅ **稳定性高**：端到端优质传输率 > 99%
- ✅ **文档完善**：中英文文档齐全
- ✅ **功能丰富**：支持屏幕共享、美颜、录制等高级功能
- ✅ **全平台支持**：支持 6000+ 种移动终端和设备

**适用场景**：
- ✅ 国内用户为主
- ✅ 国际用户为主
- ✅ **混合用户（国内+国际）** - **最佳选择**

**实现步骤**：
1. 注册 Agora 账号
2. 获取 App ID
3. 安装 `agora-rtc-sdk-ng`
4. 实现 Token 生成 API
5. 更新视频通话组件
6. 实现信令服务器

**时间估算**：6-8 小时

---

### 方案 1.5: 腾讯云 TRTC - 国内用户备选 ⭐

**优点**：
- ✅ 腾讯云服务，国内网络优化好
- ✅ 与微信生态集成方便
- ✅ 价格相对便宜
- ✅ 稳定性高

**实现步骤**：
1. 注册腾讯云账号
2. 开通 TRTC 服务
3. 获取 SDKAppID 和 SecretKey
4. 安装 `trtc-js-sdk`
5. 实现 Token 生成 API
6. 更新视频通话组件

**时间估算**：6-8 小时

### 方案 2: Daily.co（⚠️ 仅限国际用户，不推荐国内）

**优点**：
- ✅ 集成简单
- ✅ 文档清晰
- ✅ 支持快速原型

**缺点**：
- ❌ **国内用户延迟高（200-500ms+）**
- ❌ **连接不稳定**
- ❌ **不推荐国内用户使用**

**实现步骤**：
1. 注册 Daily.co 账号
2. 获取 API Key
3. 安装 `@daily-co/daily-js`
4. 实现房间和 Token 生成 API
5. 更新视频通话组件

**⚠️ 注意**：如果用户主要是国内用户，请使用 Agora 或腾讯云 TRTC

### 方案 3: Jitsi Meet（开源免费）

**优点**：
- 完全免费
- 开源可定制
- 无需第三方服务

**缺点**：
- 需要自建服务器
- 配置较复杂

---

## 注意事项

### 1. 安全性

- **Token 必须在服务端生成**，不能在前端暴露密钥
- 使用 HTTPS 传输
- 实现 Token 过期和刷新机制

### 2. 性能优化

- 根据网络状况调整视频质量
- 实现自适应码率
- 处理网络断开重连

### 3. 用户体验

- 显示连接状态（连接中、已连接、断开）
- 处理权限请求（摄像头、麦克风）
- 提供清晰的错误提示

### 4. 成本控制

- 监控通话时长
- 设置使用限制
- 实现通话时长提醒

---

## 测试清单

- [ ] 一对一视频通话
- [ ] 一对一语音通话
- [ ] 群组视频通话
- [ ] 群组语音通话
- [ ] 静音/取消静音
- [ ] 开启/关闭视频
- [ ] 屏幕共享（视频通话）
- [ ] 网络断开重连
- [ ] 权限请求处理
- [ ] 多设备测试（桌面、移动端）

---

## 相关资源

- [Agora 文档](https://docs.agora.io/)
- [Twilio Video 文档](https://www.twilio.com/docs/video)
- [Daily.co 文档](https://docs.daily.co/)
- [Jitsi Meet 文档](https://jitsi.github.io/handbook/docs/)

---

## 总结

选择合适的三方服务提供商后，按照以下步骤集成：

1. 注册账号并获取密钥
2. 安装 SDK
3. 创建 Token 生成 API
4. 更新 UI 组件
5. 实现信令服务器
6. 测试和优化

## 国内用户选择建议

### ⚠️ Daily.co 国内使用问题

**Daily.co 不太适合国内用户**，主要原因：

1. **网络延迟高**：服务器在海外，国内访问延迟较高（200-500ms+）
2. **连接不稳定**：可能受网络波动影响，通话质量不稳定
3. **监管限制**：部分功能可能在国内受限

### 推荐方案

**如果用户主要是国内用户：**
- **首选：Agora（声网）** ⭐⭐⭐ - 国内网络优化最好，延迟最低（50-100ms）
- **备选：腾讯云 TRTC** ⭐ - 腾讯云服务，国内优化好，与微信生态集成方便

**如果用户主要是国际用户：**
- **首选：Agora（声网）** ⭐⭐⭐ - 全球覆盖，国际网络优化好，延迟低（100-200ms）
- **备选：Daily.co 或 Twilio Video** - 国际网络优化好，集成简单

**如果用户是混合（国内+国际）：**
- **强烈推荐：Agora（声网）** ⭐⭐⭐ - **最佳选择**
  - 全球覆盖，SD-RTN™ 网络覆盖 200+ 个国家和地区
  - 国内优化最好（延迟 50-100ms）
  - 国际优化也很好（延迟 100-200ms）
  - 一个 SDK 解决所有需求，无需切换服务商

### 总结

**强烈推荐使用 Agora（声网）**，无论用户是国内、国际还是混合：

1. ✅ **全球覆盖**：支持国内和国外用户，SD-RTN™ 网络覆盖 200+ 个国家和地区
2. ✅ **国内优化最好**：国内网络延迟最低（50-100ms），稳定性高
3. ✅ **国际优化也很好**：国际用户延迟也较低（100-200ms），连接稳定
4. ✅ **功能丰富**：支持屏幕共享、美颜、录制等高级功能
5. ✅ **文档完善**：中英文文档齐全，集成相对简单
6. ✅ **全平台支持**：支持 6000+ 种移动终端和设备

**时间估算**：6-8 小时（MVP 版本）

