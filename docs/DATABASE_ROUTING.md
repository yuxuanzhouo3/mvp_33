# 数据库路由指南

本文档说明如何根据用户IP自动路由到正确的数据库：
- **国内IP** → 腾讯云 CloudBase
- **国外IP** → Supabase

## 路由逻辑

数据库路由的优先级（从高到低）：
1. **用户注册时的区域**（从用户profile中的`region`字段）
2. **请求参数中的region**（如果API调用时指定了region参数）
3. **用户的国家代码**（从用户profile中的`country`字段，CN表示中国）
4. **IP地址检测**（默认使用global，可扩展）

## 使用方法

### 在API路由中使用

```typescript
import { NextRequest } from 'next/server'
import { getDatabaseClientForUser } from '@/lib/database-router'

export async function GET(request: NextRequest) {
  // 自动根据用户IP和profile选择数据库
  const dbClient = await getDatabaseClientForUser(request)
  
  if (dbClient.type === 'cloudbase') {
    // 使用 CloudBase
    const db = dbClient.cloudbase
    const result = await db.collection('users').get()
    // ...
  } else {
    // 使用 Supabase
    const supabase = dbClient.supabase
    const { data } = await supabase.from('users').select('*')
    // ...
  }
}
```

### 手动指定区域

```typescript
import { getDatabaseClient } from '@/lib/database-router'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { region } = body // 可选：手动指定区域
  
  // 手动指定区域
  const dbClient = await getDatabaseClient(
    request,
    null, // userRegion
    region, // requestRegion
    null   // userCountry
  )
  
  // 使用数据库客户端...
}
```

## 环境变量配置

### CloudBase 配置（国内）

在 `.env.local` 中添加：

```env
CLOUDBASE_ENV_ID=cloud1-xxxxx  # 请替换为你的环境 ID
CLOUDBASE_SECRET_ID=your_secret_id_here  # 请替换为你的 Secret ID
CLOUDBASE_SECRET_KEY=your_secret_key_here  # 请替换为你的 Secret Key
```

### Supabase 配置（国外）

在 `.env.local` 中添加：

```env
NEXT_PUBLIC_SUPABASE_URL=https://kradpewmiizgughuxveg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

## 数据库操作示例

### CloudBase 操作

```typescript
if (dbClient.type === 'cloudbase') {
  const db = dbClient.cloudbase
  
  // 查询
  const result = await db.collection('users')
    .where({ email: 'user@example.com' })
    .get()
  
  // 插入
  await db.collection('users').add({
    email: 'user@example.com',
    name: 'User Name',
    created_at: new Date()
  })
  
  // 更新
  await db.collection('users')
    .doc(userId)
    .update({ name: 'New Name' })
  
  // 删除
  await db.collection('users')
    .doc(userId)
    .remove()
}
```

### Supabase 操作

```typescript
if (dbClient.type === 'supabase') {
  const supabase = dbClient.supabase
  
  // 查询
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('email', 'user@example.com')
  
  // 插入
  const { data } = await supabase
    .from('users')
    .insert({ email: 'user@example.com', name: 'User Name' })
  
  // 更新
  const { data } = await supabase
    .from('users')
    .update({ name: 'New Name' })
    .eq('id', userId)
  
  // 删除
  const { data } = await supabase
    .from('users')
    .delete()
    .eq('id', userId)
}
```

## 迁移现有API路由

### 步骤1：导入数据库路由函数

```typescript
import { getDatabaseClientForUser } from '@/lib/database-router'
```

### 步骤2：替换数据库客户端获取

**之前：**
```typescript
const supabase = await createClient()
```

**之后：**
```typescript
const dbClient = await getDatabaseClientForUser(request)
const supabase = dbClient.supabase // 如果使用Supabase
// 或
const cloudbase = dbClient.cloudbase // 如果使用CloudBase
```

### 步骤3：根据数据库类型执行操作

```typescript
if (dbClient.type === 'cloudbase') {
  // CloudBase 操作
} else {
  // Supabase 操作
}
```

## 注意事项

1. **认证**：用户认证仍然使用Supabase（全局），但数据存储根据区域路由
2. **数据一致性**：确保CloudBase和Supabase的表结构保持一致
3. **IP检测**：当前IP检测默认返回global，如需精确检测，需要集成IP地理位置服务
4. **回退机制**：如果CloudBase未配置，会自动回退到Supabase

## 需要更新的API路由

以下API路由需要更新以使用新的数据库路由：

- [ ] `/api/auth/*` - 认证相关
- [ ] `/api/users/*` - 用户相关
- [ ] `/api/conversations/*` - 会话相关
- [ ] `/api/messages/*` - 消息相关
- [ ] `/api/contacts/*` - 联系人相关
- [ ] `/api/payment/*` - 支付相关
- [ ] `/api/workspaces/*` - 工作空间相关

## 测试

1. **测试国内IP**：设置用户profile的`region`为`'cn'`，应该使用CloudBase
2. **测试国外IP**：设置用户profile的`region`为`'global'`，应该使用Supabase
3. **测试回退**：不配置CloudBase环境变量，应该回退到Supabase








































































