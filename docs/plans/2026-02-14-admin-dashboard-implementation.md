# 管理后台实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为项目添加管理后台功能,支持国内版(CloudBase)和国际版(Supabase)双数据库环境,优先实现用户统计和支付统计。

**Architecture:** 使用数据库适配器模式,根据 `NEXT_PUBLIC_DEFAULT_LANGUAGE` 环境变量选择 CloudBase 或 Supabase。前端界面直接复制模板项目,后端实现数据库适配器层。认证系统使用独立的管理员账号表和 session-based 认证。

**Tech Stack:** Next.js 16, TypeScript, CloudBase SDK, Supabase, bcrypt, shadcn/ui, Recharts

---

## 任务 1: 创建类型定义

**Files:**
- Create: `lib/admin/types.ts`

**Step 1: 创建类型定义文件**

从模板项目复制类型定义:

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\lib\admin\types.ts" lib/admin/types.ts
```

**Step 2: 验证文件创建**

```bash
ls -la lib/admin/types.ts
```

Expected: 文件存在

**Step 3: 提交**

```bash
git add lib/admin/types.ts
git commit -m "feat(admin): add admin types definitions

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 2: 创建工具函数

**Files:**
- Create: `lib/admin/crypto.ts`

**Step 1: 创建密码加密工具**

从模板项目复制:

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\lib\admin\crypto.ts" lib/admin/crypto.ts
```

**Step 2: 安装依赖**

```bash
npm install bcryptjs @types/bcryptjs
```

**Step 3: 验证安装**

```bash
npm list bcryptjs
```

Expected: bcryptjs 已安装

**Step 4: 提交**

```bash
git add lib/admin/crypto.ts package.json package-lock.json
git commit -m "feat(admin): add password encryption utilities

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 3: 创建数据库适配器接口

**Files:**
- Create: `lib/admin/database.ts`

**Step 1: 复制数据库适配器工厂**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\lib\admin\database.ts" lib/admin/database.ts
```

**Step 2: 修改适配器工厂以使用现有环境变量**

编辑 `lib/admin/database.ts`,将:

```typescript
const region = process.env.NEXT_PUBLIC_DEPLOYMENT_REGION;
```

改为:

```typescript
import { IS_DOMESTIC_VERSION } from '@/config';

const isDomestic = IS_DOMESTIC_VERSION;
```

并将:

```typescript
if (region === "CN") {
  return new CloudBaseAdminAdapter();
} else if (region === "INTL") {
  return new SupabaseAdminAdapter();
}
```

改为:

```typescript
if (isDomestic) {
  return new CloudBaseAdminAdapter();
} else {
  return new SupabaseAdminAdapter();
}
```

**Step 3: 提交**

```bash
git add lib/admin/database.ts
git commit -m "feat(admin): add database adapter factory

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 4: 创建 CloudBase 适配器

**Files:**
- Create: `lib/admin/cloudbase-adapter.ts`

**Step 1: 复制 CloudBase 适配器**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\lib\admin\cloudbase-adapter.ts" lib/admin/cloudbase-adapter.ts
```

**Step 2: 验证文件**

```bash
cat lib/admin/cloudbase-adapter.ts | head -20
```

Expected: 看到 CloudBaseAdminAdapter 类定义

**Step 3: 提交**

```bash
git add lib/admin/cloudbase-adapter.ts
git commit -m "feat(admin): add CloudBase database adapter

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 5: 创建 Supabase 适配器

**Files:**
- Create: `lib/admin/supabase-adapter.ts`

**Step 1: 复制 Supabase 适配器**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\lib\admin\supabase-adapter.ts" lib/admin/supabase-adapter.ts
```

**Step 2: 验证文件**

```bash
cat lib/admin/supabase-adapter.ts | head -20
```

Expected: 看到 SupabaseAdminAdapter 类定义

**Step 3: 提交**

```bash
git add lib/admin/supabase-adapter.ts
git commit -m "feat(admin): add Supabase database adapter

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 6: 创建 Session 管理

**Files:**
- Create: `lib/admin/session.ts`

**Step 1: 复制 Session 管理**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\lib\admin\session.ts" lib/admin/session.ts
```

**Step 2: 验证文件**

```bash
cat lib/admin/session.ts | head -20
```

Expected: 看到 session 相关函数

**Step 3: 提交**

```bash
git add lib/admin/session.ts
git commit -m "feat(admin): add session management

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 7: 创建认证逻辑

**Files:**
- Create: `lib/admin/auth.ts`

**Step 1: 复制认证逻辑**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\lib\admin\auth.ts" lib/admin/auth.ts
```

**Step 2: 验证文件**

```bash
cat lib/admin/auth.ts | head -20
```

Expected: 看到认证相关函数

**Step 3: 提交**

```bash
git add lib/admin/auth.ts
git commit -m "feat(admin): add authentication logic

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 8: 创建认证 Actions

**Files:**
- Create: `actions/admin-auth.ts`

**Step 1: 创建 actions 目录**

```bash
mkdir -p actions
```

**Step 2: 复制认证 actions**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\actions\admin-auth.ts" actions/admin-auth.ts
```

**Step 3: 验证文件**

```bash
cat actions/admin-auth.ts | head -20
```

Expected: 看到 "use server" 和认证相关函数

**Step 4: 提交**

```bash
git add actions/admin-auth.ts
git commit -m "feat(admin): add authentication actions

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 9: 创建用户统计 Actions

**Files:**
- Create: `actions/admin-users.ts`

**Step 1: 复制用户统计 actions**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\actions\admin-users.ts" actions/admin-users.ts
```

**Step 2: 验证文件**

```bash
cat actions/admin-users.ts | head -30
```

Expected: 看到 getUserStats 等函数

**Step 3: 提交**

```bash
git add actions/admin-users.ts
git commit -m "feat(admin): add user statistics actions

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 10: 创建支付统计 Actions

**Files:**
- Create: `actions/admin-payments.ts`

**Step 1: 复制支付统计 actions**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\actions\admin-payments.ts" actions/admin-payments.ts
```

**Step 2: 验证文件**

```bash
cat actions/admin-payments.ts | head -30
```

Expected: 看到 listPayments、getPaymentStats 等函数

**Step 3: 提交**

```bash
git add actions/admin-payments.ts
git commit -m "feat(admin): add payment statistics actions

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 11: 创建管理后台布局

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `app/admin/components/AdminSidebar.tsx`

**Step 1: 创建目录结构**

```bash
mkdir -p app/admin/components
```

**Step 2: 复制布局文���**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\app\admin\layout.tsx" app/admin/layout.tsx
```

**Step 3: 复制侧边栏组件**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\app\admin\components\AdminSidebar.tsx" app/admin/components/AdminSidebar.tsx
```

**Step 4: 验证文件**

```bash
ls -la app/admin/
```

Expected: 看到 layout.tsx 和 components 目录

**Step 5: 提交**

```bash
git add app/admin/layout.tsx app/admin/components/AdminSidebar.tsx
git commit -m "feat(admin): add admin layout and sidebar

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 12: 创建登录页面

**Files:**
- Create: `app/admin/login/page.tsx`
- Create: `app/admin/login/layout.tsx`

**Step 1: 创建登录目录**

```bash
mkdir -p app/admin/login
```

**Step 2: 复制登录页面**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\app\admin\login\page.tsx" app/admin/login/page.tsx
```

**Step 3: 复制登录布局**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\app\admin\login\layout.tsx" app/admin/login/layout.tsx
```

**Step 4: 验证文件**

```bash
ls -la app/admin/login/
```

Expected: 看到 page.tsx 和 layout.tsx

**Step 5: 提交**

```bash
git add app/admin/login/
git commit -m "feat(admin): add login page

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 13: 创建数据统计页面

**Files:**
- Create: `app/admin/dashboard/page.tsx`

**Step 1: 创建 dashboard 目录**

```bash
mkdir -p app/admin/dashboard
```

**Step 2: 复制数据统计页面**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\app\admin\dashboard\page.tsx" app/admin/dashboard/page.tsx
```

**Step 3: 验证文件**

```bash
cat app/admin/dashboard/page.tsx | head -30
```

Expected: 看到 DashboardPage 组件

**Step 4: 提交**

```bash
git add app/admin/dashboard/page.tsx
git commit -m "feat(admin): add dashboard page

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 14: 创建支付记录页面

**Files:**
- Create: `app/admin/payments/page.tsx`

**Step 1: 创建 payments 目录**

```bash
mkdir -p app/admin/payments
```

**Step 2: 复制支付记录页面**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\app\admin\payments\page.tsx" app/admin/payments/page.tsx
```

**Step 3: 验证文件**

```bash
cat app/admin/payments/page.tsx | head -30
```

Expected: 看到 PaymentsManagementPage 组件

**Step 4: 提交**

```bash
git add app/admin/payments/page.tsx
git commit -m "feat(admin): add payments page

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 15: 创建占位页面

**Files:**
- Create: `app/admin/ads/page.tsx`
- Create: `app/admin/social-links/page.tsx`
- Create: `app/admin/releases/page.tsx`
- Create: `app/admin/files/page.tsx`
- Create: `app/admin/settings/page.tsx`

**Step 1: 创建目录**

```bash
mkdir -p app/admin/ads app/admin/social-links app/admin/releases app/admin/files app/admin/settings
```

**Step 2: 复制占位页面**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\app\admin\ads\page.tsx" app/admin/ads/page.tsx
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\app\admin\social-links\page.tsx" app/admin/social-links/page.tsx
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\app\admin\releases\page.tsx" app/admin/releases/page.tsx
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\app\admin\files\page.tsx" app/admin/files/page.tsx
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\app\admin\settings\page.tsx" app/admin/settings/page.tsx
```

**Step 3: 验证文件**

```bash
ls -la app/admin/*/page.tsx
```

Expected: 看到所有页面文件

**Step 4: 提交**

```bash
git add app/admin/ads/ app/admin/social-links/ app/admin/releases/ app/admin/files/ app/admin/settings/
git commit -m "feat(admin): add placeholder pages

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 16: 创建管理后台首页

**Files:**
- Create: `app/admin/page.tsx`

**Step 1: 复制首页**

```bash
cp "D:\newcode\ai teacher\fuben2-project\mvp_25-main\mvp_25-main\app\admin\page.tsx" app/admin/page.tsx
```

**Step 2: 验证文件**

```bash
cat app/admin/page.tsx
```

Expected: 看到重定向到 dashboard 的逻辑

**Step 3: 提交**

```bash
git add app/admin/page.tsx
git commit -m "feat(admin): add admin home page

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 17: 更新中间件保护管理后台路由

**Files:**
- Modify: `middleware.ts`

**Step 1: 读取现有中间件**

```bash
cat middleware.ts | head -50
```

**Step 2: 添加管理后台路由保护**

在中间件中添加管理后台路由的保护逻辑,检查 admin session。

参考模板项目的中间件实现。

**Step 3: 验证修改**

```bash
cat middleware.ts | grep -A 10 "admin"
```

Expected: 看到管理后台路由保护逻辑

**Step 4: 提交**

```bash
git add middleware.ts
git commit -m "feat(admin): add middleware protection for admin routes

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 18: 创建数据库表(CloudBase)

**Files:**
- Create: `scripts/create-admin-tables-cloudbase.js`

**Step 1: 创建脚本目录**

```bash
mkdir -p scripts
```

**Step 2: 创建 CloudBase 建表脚本**

```javascript
// scripts/create-admin-tables-cloudbase.js
const cloudbase = require('@cloudbase/node-sdk');

async function createAdminTables() {
  const app = cloudbase.init({
    env: process.env.CLOUDBASE_ENV_ID,
    secretId: process.env.CLOUDBASE_SECRET_ID,
    secretKey: process.env.CLOUDBASE_SECRET_KEY,
  });

  const db = app.database();

  // 创建管理员表
  const adminCollection = db.collection('admin_users');

  // 创建索引
  await adminCollection.createIndex({
    keys: [{ name: 'username', direction: '1' }],
    unique: true,
  });

  console.log('CloudBase admin tables created successfully');
}

createAdminTables().catch(console.error);
```

**Step 3: 运行脚本**

```bash
node scripts/create-admin-tables-cloudbase.js
```

Expected: "CloudBase admin tables created successfully"

**Step 4: 提交**

```bash
git add scripts/create-admin-tables-cloudbase.js
git commit -m "feat(admin): add CloudBase table creation script

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 19: 创建数据库表(Supabase)

**Files:**
- Create: `scripts/create-admin-tables-supabase.sql`

**Step 1: 创建 Supabase 建表 SQL**

```sql
-- scripts/create-admin-tables-supabase.sql

-- 创建管理员表
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'super_admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);

-- 添加注释
COMMENT ON TABLE admin_users IS '管理员用户表';
COMMENT ON COLUMN admin_users.username IS '管理员用户名';
COMMENT ON COLUMN admin_users.password_hash IS 'bcrypt加密的密码';
COMMENT ON COLUMN admin_users.role IS '角色: admin 或 super_admin';
```

**Step 2: 执行 SQL(手动在 Supabase 控制台执行)**

提示用户在 Supabase 控制台执行此 SQL。

**Step 3: 提交**

```bash
git add scripts/create-admin-tables-supabase.sql
git commit -m "feat(admin): add Supabase table creation script

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 20: 创建初始管理员账号脚本

**Files:**
- Create: `scripts/create-initial-admin.ts`

**Step 1: 创建初始管理员脚本**

```typescript
// scripts/create-initial-admin.ts
import { getDatabaseAdapter } from '@/lib/admin/database';
import { hashPassword } from '@/lib/admin/crypto';

async function createInitialAdmin() {
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || 'admin123';

  const db = getDatabaseAdapter();
  const passwordHash = await hashPassword(password);

  const admin = await db.createAdmin({
    username,
    password_hash: passwordHash,
    role: 'super_admin',
  });

  console.log('Initial admin created:', admin.username);
}

createInitialAdmin().catch(console.error);
```

**Step 2: 添加 npm 脚本**

在 `package.json` 中添加:

```json
{
  "scripts": {
    "admin:create": "tsx scripts/create-initial-admin.ts"
  }
}
```

**Step 3: 安装 tsx**

```bash
npm install -D tsx
```

**Step 4: 提交**

```bash
git add scripts/create-initial-admin.ts package.json package-lock.json
git commit -m "feat(admin): add initial admin creation script

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 任务 21: 测试管理后台

**Step 1: 启动开发服务器**

```bash
npm run dev
```

**Step 2: 访问管理后台**

打开浏览器访问: http://localhost:3000/admin

Expected: 重定向到登录页面

**Step 3: 创建初始管理员**

```bash
npm run admin:create admin admin123
```

Expected: "Initial admin created: admin"

**Step 4: 登录测试**

使用 admin/admin123 登录

Expected: 成功登录并看到 dashboard

**Step 5: 测试数据统计**

访问 dashboard 页面,查看用户统计和支付统计

Expected: 看到统计数据(可能为空)

---

## 任务 22: 最终提交

**Step 1: 查看所有更改**

```bash
git status
```

**Step 2: 确保所有文件已提交**

```bash
git log --oneline -10
```

Expected: 看到所有相关提交

**Step 3: 创建最终提交(如有遗漏)**

```bash
git add .
git commit -m "feat(admin): complete admin dashboard implementation

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## 完成

管理后台实施完成!

**功能清单:**
- ✅ 数据库适配器(CloudBase + Supabase)
- ✅ 认证系统(独立管理员账号)
- ✅ 用户数据统计
- ✅ 支付数据统计
- ✅ 占位页面(广告、社交、版本、文件、设置)

**下一步:**
1. 根据实际数据库表结构调整适配器实现
2. 测试双数据库切换
3. 添加更多统计维度
4. 实现其他功能模块
