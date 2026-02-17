# 多设备登录管理功能设计文档

> **设计日期**: 2026-02-17
> **架构师**: Claude Sonnet 4.5
> **项目**: OrbitChat MVP33 - 多设备登录管理

---

## 一、功能概述

实现类似飞书的多设备登录管理功能，允许用户查看所有登录设备并踢下线指定设备。

### 核心需求
- ✅ 自动识别设备名称（基于User-Agent解析）
- ✅ 混合踢下线机制（删除session + 实时推送）
- ✅ 详细设备信息显示（设备名称、类型、最后活跃时间、IP地址、地理位置）
- ✅ 统一抽象层（支持Supabase和CloudBase双数据库）

---

## 二、数据库表结构设计

### 2.1 Supabase版本 - `user_devices` 表

```sql
CREATE TABLE user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name VARCHAR(255) NOT NULL,
  device_type VARCHAR(50) NOT NULL, -- 'ios', 'android', 'web', 'desktop'
  browser VARCHAR(100),
  os VARCHAR(100),
  ip_address VARCHAR(45),
  location VARCHAR(255), -- 基于IP的地理位置
  session_token TEXT NOT NULL UNIQUE,
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, session_token)
);

CREATE INDEX idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX idx_user_devices_session_token ON user_devices(session_token);

-- RLS策略
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own devices"
ON user_devices FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices"
ON user_devices FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
```

### 2.2 CloudBase版本 - `user_devices` 集合

字段结构：
```json
{
  "_id": "自动生成的ID",
  "user_id": "用户ID（字符串）",
  "device_name": "设备名称",
  "device_type": "设备类型（ios/android/web/desktop）",
  "browser": "浏览器名称",
  "os": "操作系统",
  "ip_address": "IP地址",
  "location": "地理位置",
  "session_token": "Session令牌",
  "last_active_at": "最后活跃时间",
  "created_at": "创建时间"
}
```

---

## 三、后端API设计

### 3.1 登录时记录设备信息

在 `app/api/auth/login/route.ts` 中添加：

```typescript
import UAParser from 'ua-parser-js'

// 解析User-Agent
const userAgent = request.headers.get('user-agent') || ''
const parser = new UAParser(userAgent)
const device = parser.getDevice()
const browser = parser.getBrowser()
const os = parser.getOS()

// 获取IP地址
const ip = request.headers.get('x-forwarded-for') ||
           request.headers.get('x-real-ip') ||
           'unknown'

// 生成设备名称（自动识别）
const deviceName = `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`

// 获取地理位置
const location = await getLocationFromIP(ip)

// 记录到数据库
await recordDevice({
  user_id: user.id,
  device_name: deviceName,
  device_type: device.type || 'web',
  browser: browser.name,
  os: os.name,
  ip_address: ip,
  location: location,
  session_token: authData.session.access_token
})
```

### 3.2 API端点

- `GET /api/devices` - 获取当前用户的所有设备列表
- `DELETE /api/devices/:id` - 踢下线指定设备
- `GET /api/devices/current` - 获取当前设备的session_token

### 3.3 统一抽象层

创建 `lib/database/devices.ts`：

```typescript
import { IS_DOMESTIC_VERSION } from '@/config'

export async function getDevices(userId: string) {
  if (IS_DOMESTIC_VERSION) {
    return getCloudBaseDevices(userId)
  }
  return getSupabaseDevices(userId)
}

export async function recordDevice(data: DeviceData) {
  if (IS_DOMESTIC_VERSION) {
    return recordCloudBaseDevice(data)
  }
  return recordSupabaseDevice(data)
}

export async function deleteDevice(deviceId: string, userId: string) {
  if (IS_DOMESTIC_VERSION) {
    return deleteCloudBaseDevice(deviceId, userId)
  }
  return deleteSupabaseDevice(deviceId, userId)
}
```

---

## 四、前端UI设计

### 4.1 设置页面结构调整

在 `app/settings/page.tsx` 中添加"账号安全与管理"卡片：

```tsx
{/* 账号安全与管理 */}
<Card className="mb-6">
  <CardHeader>
    <CardTitle>{t('accountSecurity')}</CardTitle>
    <CardDescription>{t('manageDevicesAndSecurity')}</CardDescription>
  </CardHeader>
  <CardContent>
    <Button
      onClick={() => router.push('/settings/devices')}
      variant="outline"
      className="w-full justify-between"
    >
      <span>{t('deviceManagement')}</span>
      <ArrowRight className="h-4 w-4" />
    </Button>
  </CardContent>
</Card>
```

### 4.2 设备管理页面

创建 `app/settings/devices/page.tsx`：

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Smartphone, Monitor, Globe } from 'lucide-react'

export default function DevicesPage() {
  const [devices, setDevices] = useState([])
  const [currentSessionToken, setCurrentSessionToken] = useState('')

  const isCurrentDevice = (device) => {
    return device.session_token === currentSessionToken
  }

  const handleKickDevice = async (deviceId) => {
    if (!confirm(t('confirmSignOutDevice'))) return

    await fetch(`/api/devices/${deviceId}`, { method: 'DELETE' })
    // 刷新设备列表
    loadDevices()
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">{t('deviceManagement')}</h1>
      <p className="text-muted-foreground mb-8">{t('manageLoginDevices')}</p>

      <div className="space-y-4">
        {devices.map(device => (
          <Card key={device.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-4">
                <DeviceIcon type={device.device_type} />

                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{device.device_name}</span>
                    {isCurrentDevice(device) && (
                      <Badge variant="success">{t('thisDevice')}</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t('lastActive')}: {formatTime(device.last_active_at)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {device.ip_address} · {device.location}
                  </div>
                </div>
              </div>

              {!isCurrentDevice(device) && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleKickDevice(device.id)}
                >
                  {t('signOut')}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

---

## 五、实时推送机制

### 5.1 Supabase Realtime订阅

```typescript
// 订阅当前设备的状态变化
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
    (payload) => {
      // 设备被踢下线，立即退出登录
      handleForceLogout()
    }
  )
  .subscribe()
```

### 5.2 CloudBase实时监听

```typescript
// 监听设备记录的删除
const watcher = db.collection('user_devices')
  .where({
    session_token: currentSessionToken
  })
  .watch({
    onChange: (snapshot) => {
      if (snapshot.docChanges.some(change => change.queueType === 'remove')) {
        handleForceLogout()
      }
    }
  })
```

### 5.3 强制退出登录逻辑

```typescript
function handleForceLogout() {
  // 清除本地session
  localStorage.removeItem('user')
  localStorage.removeItem('token')

  // 显示通知
  toast({
    title: t('deviceSignedOut'),
    description: t('yourDeviceHasBeenSignedOut'),
    variant: 'destructive'
  })

  // 跳转到登录页
  router.push('/login')
}
```

### 5.4 地理位置获取

```typescript
async function getLocationFromIP(ip: string) {
  try {
    const response = await fetch(`https://ipapi.co/${ip}/json/`)
    const data = await response.json()
    return `${data.city}, ${data.country_name}`
  } catch {
    return 'Unknown'
  }
}
```

---

## 六、实施步骤

1. **数据库迁移**
   - 创建Supabase迁移脚本
   - 创建CloudBase集合

2. **后端实现**
   - 安装 `ua-parser-js` 依赖
   - 实现统一抽象层 `lib/database/devices.ts`
   - 修改登录API记录设备信息
   - 创建设备管理API端点

3. **前端实现**
   - 创建设备管理页面
   - 在设置页面添加入口
   - 实现实时推送监听
   - 添加国际化翻译

4. **测试**
   - 测试多设备登录
   - 测试踢下线功能
   - 测试实时推送
   - 测试双数据库兼容性

---

**文档版本**: v1.0
**最后更新**: 2026-02-17
**状态**: 设计完成，待实施
