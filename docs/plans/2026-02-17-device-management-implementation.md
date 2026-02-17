# 多设备登录管理功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现类似飞书的多设备登录管理功能，支持查看所有登录设备并踢下线指定设备

**Architecture:** 采用统一抽象层模式，通过 IS_DOMESTIC_VERSION 标志路由到 Supabase 或 CloudBase，前端使用相同代码。登录时自动记录设备信息（User-Agent解析），踢下线采用混合机制（删除session + 实时推送）。

**Tech Stack:** Next.js 16, React 19, Supabase/CloudBase, ua-parser-js, ipapi.co

---

## Task 1: 安装依赖

**Files:**
- Modify: `package.json`

**Step 1: 安装 ua-parser-js**

```bash
npm install ua-parser-js
npm install --save-dev @types/ua-parser-js
```

Expected: 依赖安装成功

**Step 2: 验证安装**

```bash
npm list ua-parser-js
```

Expected: 显示已安装的版本

**Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: add ua-parser-js dependency for device detection"
```

---

## Task 2: 创建 Supabase 数据库迁移

**Files:**
- Create: `supabase/migrations/20260217000000_create_user_devices.sql`

**Step 1: 创建迁移文件**

```sql
-- Create user_devices table
CREATE TABLE user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name VARCHAR(255) NOT NULL,
  device_type VARCHAR(50) NOT NULL,
  browser VARCHAR(100),
  os VARCHAR(100),
  ip_address VARCHAR(45),
  location VARCHAR(255),
  session_token TEXT NOT NULL UNIQUE,
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, session_token)
);

-- Create indexes
CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX idx_user_devices_session_token ON user_devices(session_token);

-- Enable RLS
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own devices"
ON user_devices FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices"
ON user_devices FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Allow service role to insert devices (for login API)
CREATE POLICY "Service role can insert devices"
ON user_devices FOR INSERT
TO service_role
WITH CHECK (true);
```

**Step 2: 提交**

```bash
git add supabase/migrations/20260217000000_create_user_devices.sql
git commit -m "feat: add user_devices table migration for Supabase"
```

---

## Task 3: 创建统一抽象层 - 类型定义

**Files:**
- Create: `lib/database/devices.ts`

**Step 1: 创建设备类型定义**

```typescript
export interface DeviceData {
  user_id: string
  device_name: string
  device_type: 'ios' | 'android' | 'web' | 'desktop'
  browser?: string
  os?: string
  ip_address?: string
  location?: string
  session_token: string
}

export interface Device extends DeviceData {
  id: string
  last_active_at: string
  created_at: string
}
```

**Step 2: 提交**

```bash
git add lib/database/devices.ts
git commit -m "feat: add device types for multi-device management"
```

---

## Task 4: 实现 Supabase 设备操作

**Files:**
- Modify: `lib/database/devices.ts`

**Step 1: 添加 Supabase 设备操作函数**

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function getSupabaseDevices(userId: string): Promise<Device[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('user_devices')
    .select('*')
    .eq('user_id', userId)
    .order('last_active_at', { ascending: false })

  if (error) throw error
  return data || []
}

async function recordSupabaseDevice(data: DeviceData): Promise<Device> {
  const supabase = await createAdminClient()
  const { data: device, error } = await supabase
    .from('user_devices')
    .insert(data)
    .select()
    .single()

  if (error) throw error
  return device
}

async function deleteSupabaseDevice(deviceId: string, userId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('user_devices')
    .delete()
    .eq('id', deviceId)
    .eq('user_id', userId)

  if (error) throw error
}
```

**Step 2: 提交**

```bash
git add lib/database/devices.ts
git commit -m "feat: implement Supabase device operations"
```

---

## Task 5: 实现 CloudBase 设备操作

**Files:**
- Modify: `lib/database/devices.ts`

**Step 1: 添加 CloudBase 设备操作函数**

```typescript
import { getCloudBaseDB } from '@/lib/cloudbase/db'

async function getCloudBaseDevices(userId: string): Promise<Device[]> {
  const db = getCloudBaseDB()
  const res = await db.collection('user_devices')
    .where({ user_id: userId })
    .orderBy('last_active_at', 'desc')
    .get()

  return res.data.map((doc: any) => ({
    id: doc._id,
    user_id: doc.user_id,
    device_name: doc.device_name,
    device_type: doc.device_type,
    browser: doc.browser,
    os: doc.os,
    ip_address: doc.ip_address,
    location: doc.location,
    session_token: doc.session_token,
    last_active_at: doc.last_active_at,
    created_at: doc.created_at,
  }))
}

async function recordCloudBaseDevice(data: DeviceData): Promise<Device> {
  const db = getCloudBaseDB()
  const res = await db.collection('user_devices').add({
    ...data,
    last_active_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  })

  return {
    id: res.id,
    ...data,
    last_active_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}

async function deleteCloudBaseDevice(deviceId: string, userId: string): Promise<void> {
  const db = getCloudBaseDB()
  await db.collection('user_devices')
    .where({ _id: deviceId, user_id: userId })
    .remove()
}
```

**Step 2: 提交**

```bash
git add lib/database/devices.ts
git commit -m "feat: implement CloudBase device operations"
```

---

## Task 6: 实现统一抽象层导出

**Files:**
- Modify: `lib/database/devices.ts`

**Step 1: 添加统一导出函数**

```typescript
import { IS_DOMESTIC_VERSION } from '@/config'

export async function getDevices(userId: string): Promise<Device[]> {
  if (IS_DOMESTIC_VERSION) {
    return getCloudBaseDevices(userId)
  }
  return getSupabaseDevices(userId)
}

export async function recordDevice(data: DeviceData): Promise<Device> {
  if (IS_DOMESTIC_VERSION) {
    return recordCloudBaseDevice(data)
  }
  return recordSupabaseDevice(data)
}

export async function deleteDevice(deviceId: string, userId: string): Promise<void> {
  if (IS_DOMESTIC_VERSION) {
    return deleteCloudBaseDevice(deviceId, userId)
  }
  return deleteSupabaseDevice(deviceId, userId)
}
```

**Step 2: 提交**

```bash
git add lib/database/devices.ts
git commit -m "feat: add unified device management abstraction layer"
```

---

## Task 7: 创建设备信息解析工具

**Files:**
- Create: `lib/utils/device-parser.ts`

**Step 1: 实现设备信息解析**

```typescript
import UAParser from 'ua-parser-js'

export function parseDeviceInfo(userAgent: string) {
  const parser = new UAParser(userAgent)
  const device = parser.getDevice()
  const browser = parser.getBrowser()
  const os = parser.getOS()

  const deviceName = `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`

  let deviceType: 'ios' | 'android' | 'web' | 'desktop' = 'web'
  if (device.type === 'mobile') {
    if (os.name?.toLowerCase().includes('ios')) {
      deviceType = 'ios'
    } else if (os.name?.toLowerCase().includes('android')) {
      deviceType = 'android'
    }
  } else if (device.type === 'tablet') {
    deviceType = os.name?.toLowerCase().includes('ios') ? 'ios' : 'android'
  } else {
    deviceType = 'desktop'
  }

  return {
    deviceName,
    deviceType,
    browser: browser.name,
    os: os.name,
  }
}

export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')

  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  return realIp || 'unknown'
}

export async function getLocationFromIP(ip: string): Promise<string> {
  if (ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') {
    return 'Local'
  }

  try {
    const response = await fetch(`https://ipapi.co/${ip}/json/`, {
      next: { revalidate: 3600 }
    })
    const data = await response.json()
    return `${data.city || 'Unknown'}, ${data.country_name || 'Unknown'}`
  } catch {
    return 'Unknown'
  }
}
```

**Step 2: 提交**

```bash
git add lib/utils/device-parser.ts
git commit -m "feat: add device info parser utilities"
```

---

## Task 8: 修改登录API记录设备信息

**Files:**
- Modify: `app/api/auth/login/route.ts`

**Step 1: 在登录成功后添加设备记录逻辑**

在 `POST` 函数中，找到返回成功响应之前的位置（约370行），添加：

```typescript
import { recordDevice } from '@/lib/database/devices'
import { parseDeviceInfo, getClientIP, getLocationFromIP } from '@/lib/utils/device-parser'

// ... 在返回响应之前添加设备记录
// Get device info
const userAgent = request.headers.get('user-agent') || ''
const deviceInfo = parseDeviceInfo(userAgent)
const ip = getClientIP(request)
const location = await getLocationFromIP(ip)

// Record device
try {
  await recordDevice({
    user_id: updatedUser.id,
    device_name: deviceInfo.deviceName,
    device_type: deviceInfo.deviceType,
    browser: deviceInfo.browser,
    os: deviceInfo.os,
    ip_address: ip,
    location: location,
    session_token: token,
  })
  console.log('[LOGIN] Device recorded successfully')
} catch (error) {
  console.error('[LOGIN] Failed to record device:', error)
  // Don't fail login if device recording fails
}
```

**Step 2: 同样修改 CloudBase 登录函数**

在 `handleCloudBaseLogin` 函数中，找到返回响应之前的位置（约445行），添加相同的设备记录逻辑。

**Step 3: 提交**

```bash
git add app/api/auth/login/route.ts
git commit -m "feat: record device info on login"
```

---

## Task 9: 创建获取设备列表API

**Files:**
- Create: `app/api/devices/route.ts`

**Step 1: 实现GET端点**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDevices } from '@/lib/database/devices'
import { createClient } from '@/lib/supabase/server'
import { verifyCloudBaseSession } from '@/lib/cloudbase/auth'
import { IS_DOMESTIC_VERSION } from '@/config'

export async function GET(request: NextRequest) {
  try {
    let userId: string | null = null

    if (IS_DOMESTIC_VERSION) {
      const user = await verifyCloudBaseSession(request)
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    } else {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    const devices = await getDevices(userId)
    return NextResponse.json({ devices })
  } catch (error: any) {
    console.error('Get devices error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get devices' },
      { status: 500 }
    )
  }
}
```

**Step 2: 提交**

```bash
git add app/api/devices/route.ts
git commit -m "feat: add GET /api/devices endpoint"
```

---

## Task 10: 创建获取当前设备token API

**Files:**
- Create: `app/api/devices/current/route.ts`

**Step 1: 实现GET端点**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCloudBaseSessionToken } from '@/lib/cloudbase/auth'
import { IS_DOMESTIC_VERSION } from '@/config'

export async function GET(request: NextRequest) {
  try {
    let sessionToken: string | null = null

    if (IS_DOMESTIC_VERSION) {
      sessionToken = getCloudBaseSessionToken(request)
    } else {
      const supabase = await createClient()
      const { data: { session } } = await supabase.auth.getSession()
      sessionToken = session?.access_token || null
    }

    if (!sessionToken) {
      return NextResponse.json({ error: 'No session found' }, { status: 401 })
    }

    return NextResponse.json({ sessionToken })
  } catch (error: any) {
    console.error('Get current device error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get current device' },
      { status: 500 }
    )
  }
}
```

**Step 2: 提交**

```bash
git add app/api/devices/current/route.ts
git commit -m "feat: add GET /api/devices/current endpoint"
```

---

## Task 11: 创建删除设备API

**Files:**
- Create: `app/api/devices/[id]/route.ts`

**Step 1: 实现DELETE端点**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { deleteDevice } from '@/lib/database/devices'
import { createClient } from '@/lib/supabase/server'
import { verifyCloudBaseSession } from '@/lib/cloudbase/auth'
import { IS_DOMESTIC_VERSION } from '@/config'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    let userId: string | null = null

    if (IS_DOMESTIC_VERSION) {
      const user = await verifyCloudBaseSession(request)
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    } else {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      userId = user.id
    }

    await deleteDevice(params.id, userId)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete device error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete device' },
      { status: 500 }
    )
  }
}
```

**Step 2: 提交**

```bash
git add app/api/devices/[id]/route.ts
git commit -m "feat: add DELETE /api/devices/:id endpoint"
```

---

## Task 12: 创建设备管理页面

**Files:**
- Create: `app/settings/devices/page.tsx`

**Step 1: 创建设备管理页面组件**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Smartphone, Monitor, Globe, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Device {
  id: string
  device_name: string
  device_type: 'ios' | 'android' | 'web' | 'desktop'
  last_active_at: string
  ip_address?: string
  location?: string
  session_token: string
}

export default function DevicesPage() {
  const router = useRouter()
  const [devices, setDevices] = useState<Device[]>([])
  const [currentSessionToken, setCurrentSessionToken] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDevices()
    loadCurrentSession()
  }, [])

  const loadDevices = async () => {
    try {
      const res = await fetch('/api/devices')
      const data = await res.json()
      setDevices(data.devices || [])
    } catch (error) {
      toast.error('Failed to load devices')
    } finally {
      setLoading(false)
    }
  }

  const loadCurrentSession = async () => {
    try {
      const res = await fetch('/api/devices/current')
      const data = await res.json()
      setCurrentSessionToken(data.sessionToken || '')
    } catch (error) {
      console.error('Failed to load current session:', error)
    }
  }

  const isCurrentDevice = (device: Device) => {
    return device.session_token === currentSessionToken
  }

  const handleKickDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to sign out this device?')) return

    try {
      await fetch(`/api/devices/${deviceId}`, { method: 'DELETE' })
      toast.success('Device signed out successfully')
      loadDevices()
    } catch (error) {
      toast.error('Failed to sign out device')
    }
  }

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'ios':
      case 'android':
        return <Smartphone className="h-8 w-8" />
      case 'desktop':
        return <Monitor className="h-8 w-8" />
      default:
        return <Globe className="h-8 w-8" />
    }
  }

  const formatTime = (time: string) => {
    const date = new Date(time)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes} minutes ago`
    if (hours < 24) return `${hours} hours ago`
    return `${days} days ago`
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Device Management</h1>
      <p className="text-muted-foreground mb-8">
        Manage your logged-in devices
      </p>

      <div className="space-y-4">
        {devices.map(device => (
          <Card key={device.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                {getDeviceIcon(device.device_type)}

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{device.device_name}</span>
                    {isCurrentDevice(device) && (
                      <Badge variant="default">This Device</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Last active: {formatTime(device.last_active_at)}
                  </div>
                  {device.ip_address && device.location && (
                    <div className="text-xs text-muted-foreground">
                      {device.ip_address} · {device.location}
                    </div>
                  )}
                </div>
              </div>

              {!isCurrentDevice(device) && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleKickDevice(device.id)}
                >
                  Sign Out
                </Button>
              )}
            </CardContent>
          </Card>
        ))}

        {devices.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No devices found
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
```

**Step 2: 提交**

```bash
git add app/settings/devices/page.tsx
git commit -m "feat: add device management page"
```

---

## Task 13: 在设置页面添加设备管理入口

**Files:**
- Modify: `app/settings/page.tsx`

**Step 1: 添加设备管理卡片**

在订阅状态卡片之后（约103行），添加：

```typescript
{/* Account Security & Management */}
<Card className="mb-6">
  <CardHeader>
    <CardTitle>Account Security & Management</CardTitle>
    <CardDescription>Manage your devices and security settings</CardDescription>
  </CardHeader>
  <CardContent>
    <Button
      onClick={() => router.push('/settings/devices')}
      variant="outline"
      className="w-full justify-between"
    >
      <span>Device Management</span>
      <ArrowRight className="h-4 w-4" />
    </Button>
  </CardContent>
</Card>
```

**Step 2: 提交**

```bash
git add app/settings/page.tsx
git commit -m "feat: add device management entry to settings page"
```

---

## Task 14: 实现实时推送监听（Supabase）

**Files:**
- Create: `hooks/use-device-listener.ts`

**Step 1: 创建设备监听hook**

```typescript
'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { IS_DOMESTIC_VERSION } from '@/config'

export function useDeviceListener(currentSessionToken: string) {
  const router = useRouter()

  useEffect(() => {
    if (!currentSessionToken || IS_DOMESTIC_VERSION) return

    const supabase = createClient()

    const channel = supabase
      .channel(`device:${currentSessionToken}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'user_devices',
          filter: `session_token=eq.${currentSessionToken}`
        },
        () => {
          handleForceLogout()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [currentSessionToken])

  const handleForceLogout = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')

    toast.error('Your device has been signed out', {
      description: 'You have been signed out from another device'
    })

    router.push('/login')
  }
}
```

**Step 2: 提交**

```bash
git add hooks/use-device-listener.ts
git commit -m "feat: add device listener hook for real-time kick-off"
```

---

## Task 15: 在设备管理页面集成监听

**Files:**
- Modify: `app/settings/devices/page.tsx`

**Step 1: 添加监听hook**

在组件顶部添加：

```typescript
import { useDeviceListener } from '@/hooks/use-device-listener'

// 在组件内部，loadCurrentSession之后添加
useDeviceListener(currentSessionToken)
```

**Step 2: 提交**

```bash
git add app/settings/devices/page.tsx
git commit -m "feat: integrate device listener in device management page"
```

---

## Task 16: 测试完整流程

**Step 1: 运行开发服务器**

```bash
npm run dev
```

**Step 2: 测试登录记录设备**

1. 打开浏览器访问 http://localhost:3000/login
2. 登录账号
3. 检查控制台是否有 "[LOGIN] Device recorded successfully" 日志

**Step 3: 测试设备列表**

1. 访问 http://localhost:3000/settings
2. 点击 "Device Management"
3. 验证能看到当前设备，且标记为 "This Device"

**Step 4: 测试踢下线（需要两个浏览器）**

1. 在Chrome登录
2. 在Firefox登录
3. 在Chrome的设备管理页面，踢下线Firefox设备
4. 验证Firefox自动跳转到登录页

**Step 5: 提交测试结果**

如果所有测试通过：

```bash
git add .
git commit -m "test: verify multi-device management feature"
```

---

## 完成

所有任务完成后，功能应该完全可用：
- ✅ 登录时自动记录设备信息
- ✅ 设备管理页面显示所有设备
- ✅ 可以踢下线其他设备
- ✅ 被踢下线的设备实时收到通知并退出
- ✅ 支持 Supabase 和 CloudBase 双数据库
