# 如何创建演示用户

## 问题

`users` 表有一个外键约束，要求 `users.id` 必须存在于 `auth.users` 中。这意味着不能直接插入到 `public.users` 表，必须先创建 Supabase Auth 用户。

## 解决方案

### 方法 1：通过 Supabase Dashboard 创建（推荐）

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择项目：`communication_tool`
3. 进入 **Authentication** > **Users**
4. 点击 **Add user** 按钮
5. 为每个演示用户创建账号：

   - **Alice**: 
     - Email: `alice@company.com`
     - Password: `password123` (临时密码，用户可以修改)
   
   - **Bob**: 
     - Email: `bob@company.com`
     - Password: `password123`
   
   - **Carol**: 
     - Email: `carol@company.com`
     - Password: `password123`
   
   - **David**: 
     - Email: `david@company.com`
     - Password: `password123`
   
   - **Emma**: 
     - Email: `emma@company.com`
     - Password: `password123`

6. 创建用户后，触发器会自动在 `public.users` 表中创建记录
7. 运行 `scripts/007_create_demo_auth_users.sql` 来更新用户详细信息
8. 然后运行 `scripts/006_seed_contact_requests.sql` 来创建联系人请求

### 方法 2：通过应用注册

1. 打开应用注册页面
2. 依次注册每个演示用户：
   - alice@company.com / password123
   - bob@company.com / password123
   - carol@company.com / password123
   - david@company.com / password123
   - emma@company.com / password123
3. 注册后，触发器会自动创建 `public.users` 记录
4. 运行 `scripts/007_create_demo_auth_users.sql` 来更新用户详细信息
5. 然后运行 `scripts/006_seed_contact_requests.sql` 来创建联系人请求

### 方法 3：使用 Supabase Management API（高级）

如果你有 Service Role Key，可以使用 API 创建用户：

```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/auth/v1/admin/users' \
  -H "apikey: YOUR_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "alice@company.com",
    "password": "password123",
    "user_metadata": {
      "full_name": "Alice Zhang",
      "username": "alice"
    },
    "email_confirm": true
  }'
```

对每个用户重复此操作。

## 验证

创建用户后，检查：

1. **Supabase Dashboard** > **Authentication** > **Users** - 应该看到 5 个用户
2. **Table Editor** > **users** - 应该看到 5 条记录（由触发器自动创建）
3. 运行 `scripts/007_create_demo_auth_users.sql` 更新用户详细信息
4. 运行 `scripts/006_seed_contact_requests.sql` 创建联系人请求

## 注意事项

- 触发器 `on_auth_user_created` 会自动在 `public.users` 中创建记录
- 如果触发器没有工作，检查触发器是否已创建（见 `scripts/003_supabase_setup.sql`）
- 用户 ID 是自动生成的 UUID，不是固定的 `00000000-...`，所以脚本使用邮箱来查找用户

