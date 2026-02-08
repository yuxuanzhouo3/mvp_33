# CloudBase 云存储使用指南

## 概述

CloudBase 提供了**云存储服务**，专门用于存储文件（图片、文档、视频等）。这与文档数据库不同：

- **文档数据库**：存储 JSON 数据（用户信息、消息内容等）
- **云存储**：存储文件（图片、PDF、视频等）

## 为什么需要云存储？

1. **文档数据库不适合存储文件**：
   - 虽然可以存储 Base64 编码的图片，但会影响性能
   - 不适合存储大文件（>1MB）
   - 会增加数据库负担

2. **云存储的优势**：
   - 专门为文件存储设计
   - 提供 CDN 加速
   - 支持权限控制
   - 性能更好

## CloudBase 云存储 API

### 1. 初始化云存储

```typescript
import cloudbase from '@cloudbase/node-sdk'

const app = cloudbase.init({
  env: process.env.CLOUDBASE_ENV_ID,
  secretId: process.env.CLOUDBASE_SECRET_ID,
  secretKey: process.env.CLOUDBASE_SECRET_KEY
})

// 获取云存储实例
const storage = app.storage()
```

### 2. 上传文件

```typescript
// 上传文件到云存储
const result = await storage.uploadFile({
  cloudPath: 'avatars/user123/avatar.jpg',  // 云存储路径
  fileContent: fileBuffer,  // 文件内容（Buffer）
})

// 获取文件 URL
const fileUrl = result.fileID
```

### 3. 获取文件下载链接

```typescript
// 获取临时下载链接（有效期 1 小时）
const downloadUrl = await storage.getTempFileURL({
  fileList: ['avatars/user123/avatar.jpg']
})

// 获取永久链接（需要配置域名）
const permanentUrl = `https://${envId}.tcb.qcloud.la/${filePath}`
```

### 4. 删除文件

```typescript
await storage.deleteFile({
  fileList: ['avatars/user123/avatar.jpg']
})
```

## 在数据库中的存储方式

**不要直接存储文件内容**，而是存储**文件 URL**：

```json
{
  "id": "user123",
  "avatar_url": "https://cloud1-xxx.tcb.qcloud.la/avatars/user123/avatar.jpg",
  "profile_image_url": "https://cloud1-xxx.tcb.qcloud.la/profiles/user123/image.jpg"
}
```

## 实现建议

### 方案 1：为国内用户创建 CloudBase 云存储 API

创建 `app/api/files/upload/route.ts`（国内用户专用）：

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getDatabaseClientForUser } from '@/lib/database-router'
import cloudbase from '@cloudbase/node-sdk'

export async function POST(request: NextRequest) {
  // 1. 检查用户区域
  const dbClient = await getDatabaseClientForUser(request)
  
  if (dbClient.type !== 'cloudbase') {
    // 非国内用户，使用 Supabase Storage
    // ... 现有逻辑
  }
  
  // 2. 国内用户使用 CloudBase 云存储
  const app = cloudbase.init({
    env: process.env.CLOUDBASE_ENV_ID,
    secretId: process.env.CLOUDBASE_SECRET_ID,
    secretKey: process.env.CLOUDBASE_SECRET_KEY
  })
  
  const storage = app.storage()
  const formData = await request.formData()
  const file = formData.get('file') as File
  
  // 3. 上传到 CloudBase 云存储
  const fileBuffer = Buffer.from(await file.arrayBuffer())
  const filePath = `files/${Date.now()}-${file.name}`
  
  const result = await storage.uploadFile({
    cloudPath: filePath,
    fileContent: fileBuffer,
  })
  
  // 4. 返回文件 URL
  return NextResponse.json({
    success: true,
    file_url: `https://${process.env.CLOUDBASE_ENV_ID}.tcb.qcloud.la/${filePath}`,
    file_name: file.name,
    file_size: file.size,
  })
}
```

### 方案 2：在 CloudBase 控制台配置云存储

1. 登录 [CloudBase 控制台](https://console.cloud.tencent.com/tcb)
2. 进入 **云存储** 页面
3. 创建存储桶（如 `files`、`avatars`、`messages`）
4. 配置权限（公开读取、私有等）
5. 配置 CDN 加速（可选）

## 当前系统状态

目前系统使用 **Supabase Storage** 存储文件。对于国内用户，建议：

1. **短期方案**：继续使用 Supabase Storage（如果可访问）
2. **长期方案**：为国内用户实现 CloudBase 云存储集成

## 总结

- ✅ **文档数据库**：存储 JSON 数据（用户信息、消息等）
- ✅ **云存储**：存储文件（图片、文档、视频等）
- ✅ **在数据库中存储文件 URL**，而不是文件内容
- ✅ CloudBase 提供云存储服务，类似 Supabase Storage


































































