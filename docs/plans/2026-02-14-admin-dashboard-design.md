# 管理后台设计文档

## 概述

为项目添加管理后台功能,支持国内版(CloudBase)和国际版(Supabase)双数据库环境。

## 需求

### 核心功能(优先实现)
1. **用户数据统计**
   - 总用户数、新增用户、活跃用户
   - 付费用户统计、转化率
   - 按区域统计(国内/国际)
   - 用户趋势图表

2. **支付数据统计**
   - 支付记录列表(分页、搜索、筛选)
   - 支付统计(总收入、今日/本月收入)
   - 按支付方式统计(微信/支付宝 vs PayPal/Stripe)
   - 支付趋势图表

### 后续功能(保留界面)
- 社交分析
- 广告管理
- 发布版本管理
- 文件管理
- 系统设置

## 技术方案

### 1. 环境区分

使用现有的环境变量方式:
- `NEXT_PUBLIC_DEFAULT_LANGUAGE=zh` → 国内版 → CloudBase + 微信支付宝
- `NEXT_PUBLIC_DEFAULT_LANGUAGE=en` → 国际版 → Supabase + PayPal/Stripe

### 2. 架构设计

```
app/admin/
├── login/              # 登录页面
│   ├── page.tsx
│   └── layout.tsx
├── dashboard/          # 数据统计
│   └── page.tsx
├── payments/           # 支付记录
│   └── page.tsx
├── ads/                # 广告管理(占位)
│   └── page.tsx
├── social-links/       # 社交链接(占位)
│   └── page.tsx
├── releases/           # 发布版本(占位)
│   └── page.tsx
├── files/              # 文件管理(占位)
│   └── page.tsx
├── settings/           # 系统设置(占位)
│   └── page.tsx
├── layout.tsx          # 管理后台布局
└── components/
    └── AdminSidebar.tsx # 侧边栏导航

lib/admin/
├── database.ts         # 数据库适配器工厂
├── cloudbase-adapter.ts # CloudBase适配器
├── supabase-adapter.ts  # Supabase适配器
├── session.ts          # Session管理
├── auth.ts             # 认证逻辑
├── crypto.ts           # 密码加密
└── types.ts            # 类型定义

actions/
├── admin-auth.ts       # 认证actions
├── admin-users.ts      # 用户统计actions
└── admin-payments.ts   # 支付统计actions
```

### 3. 数据库适配器模式

**适配器接口:**
```typescript
interface AdminDatabaseAdapter {
  // 用户相关
  listUsers(filters: UserFilters): Promise<User[]>
  countUsers(filters: UserFilters): Promise<number>

  // 支付相关
  listPayments(filters: PaymentFilters): Promise<Payment[]>
  countPayments(filters: PaymentFilters): Promise<number>
  getPaymentById(id: string): Promise<Payment | null>

  // 管理员相关
  getAdminByUsername(username: string): Promise<AdminUser | null>
  createAdmin(data: CreateAdminData): Promise<AdminUser>
}
```

**适配器工厂:**
```typescript
export function getDatabaseAdapter(): AdminDatabaseAdapter {
  const isDomestic = IS_DOMESTIC_VERSION

  if (isDomestic) {
    return new CloudBaseAdminAdapter()
  } else {
    return new SupabaseAdminAdapter()
  }
}
```

### 4. 认证系统

- 独立的管理员账号表(不使用用户表)
- Session-based认证(使用加密cookie)
- 密码使用bcrypt加密
- 中间件保护管理后台路由

### 5. 前端界面

直接复制模板项目的前端代码:
- 布局和侧边栏组件
- 数据统计页面
- 支付记录页面
- UI组件(使用shadcn/ui)

### 6. 数据统计逻辑

**用户统计:**
- 从数据库获取所有用户数据
- 在内存中进行统计计算
- 按时间范围筛选(今日、本周、本月)
- 按订阅类型分类(免费、专业版、企业版)

**支付统计:**
- 支持分页查询
- 按状态、支付方式、类型筛选
- 计算总收入、今日/本月收入
- 按支付方式统计收入

### 7. 环境适配

**国内版(zh):**
- 数据库: CloudBase
- 支付方式: 微信支付、支付宝
- 货币: CNY (人民币)

**国际版(en):**
- 数据库: Supabase
- 支付方式: PayPal、Stripe
- 货币: USD (美元)

## 实施步骤

### 阶段1: 基础设施
1. 创建目录结构
2. 复制类型定义和工具函数
3. 实现数据库适配器接口
4. 实现CloudBase适配器
5. 实现Supabase适配器

### 阶段2: 认证系统
1. 创建管理员表(CloudBase + Supabase)
2. 实现Session管理
3. 实现登录/登出功能
4. 添加中间件保护

### 阶段3: 用户统计
1. 实现用户统计actions
2. 复制dashboard页面
3. 适配数据显示逻辑

### 阶段4: 支付统计
1. 实现支付统计actions
2. 复制payments页面
3. 适配支付方式显示

### 阶段5: 完善
1. 添加其他页面占位
2. 测试双数据库切换
3. 优化错误处理

## 数据库表结构

### 管理员表 (admin_users)

**CloudBase:**
```javascript
{
  _id: string,
  username: string,      // 唯一
  password_hash: string, // bcrypt加密
  role: string,          // 'admin' | 'super_admin'
  created_at: Date,
  last_login_at: Date
}
```

**Supabase:**
```sql
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'super_admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);
```

## 注意事项

1. **安全性**
   - 管理员密码必须使用bcrypt加密
   - Session使用加密cookie
   - 中间件验证所有管理后台路由

2. **数据隔离**
   - 国内版只统计CloudBase数据
   - 国际版只统计Supabase数据
   - 两个环境完全独立

3. **最小化实现**
   - 只实现核心功能
   - 避免过度设计
   - 代码复用模板项目

4. **错误处理**
   - 统一的错误处理逻辑
   - 友好的错误提示
   - 日志记录

## 参考项目

模板项目路径: `D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main`

主要参考文件:
- `app/admin/dashboard/page.tsx` - 数据统计页面
- `app/admin/payments/page.tsx` - 支付记录页面
- `lib/admin/database.ts` - 数据库适配器
- `lib/admin/cloudbase-adapter.ts` - CloudBase实现
- `lib/admin/supabase-adapter.ts` - Supabase实现
