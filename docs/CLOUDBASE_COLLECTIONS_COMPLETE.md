# CloudBase 文档型数据库 - 完整集合列表

## 📋 需要创建的集合（共 12 个）

### ⭐⭐⭐ 核心集合（必须创建）

#### 1. **users** - 用户表
- **用途**：存储用户基本信息
- **何时需要**：注册/登录时立即需要
- **关键字段**：
  - `id` (String): Supabase Auth 用户 ID
  - `email` (String): 邮箱（唯一）
  - `username` (String): 用户名（唯一）
  - `full_name` (String): 全名
  - `avatar_url` (String, nullable): 头像 URL
  - `phone` (String, nullable): 电话
  - `department` (String, nullable): 部门
  - `title` (String, nullable): 职位
  - `status` (String): 在线状态 ('online', 'offline', 'away', 'busy')
  - `status_message` (String, nullable): 状态消息
  - `region` (String): 注册区域 ('cn', 'global')
  - `country` (String, nullable): 国家代码
  - `subscription_type` (String, nullable): 订阅类型
  - `subscription_expires_at` (Date, nullable): 订阅过期时间
  - `created_at` (Date): 创建时间
  - `updated_at` (Date): 更新时间

#### 2. **orders** - 订单表
- **用途**：存储支付订单信息
- **何时需要**：用户支付时
- **关键字段**：
  - `id` (String): 订单 ID
  - `user_id` (String): 用户 ID
  - `order_no` (String): 订单号（唯一）
  - `amount` (Number): 金额
  - `currency` (String): 货币类型
  - `payment_method` (String): 支付方式
  - `payment_status` (String): 支付状态
  - `region` (String): 区域
  - `created_at` (Date): 创建时间
  - `updated_at` (Date): 更新时间

### ⭐⭐ 重要集合（核心功能）

#### 3. **workspaces** - 工作空间表
- **用途**：存储工作空间信息
- **关键字段**：
  - `id` (String): 工作空间 ID
  - `name` (String): 名称
  - `domain` (String): 域名（唯一）
  - `owner_id` (String): 所有者 ID
  - `logo_url` (String, nullable): Logo URL
  - `settings` (Object): 设置
  - `created_at` (Date): 创建时间
  - `updated_at` (Date): 更新时间

#### 4. **workspace_members** - 工作空间成员表
- **用途**：存储工作空间成员关系
- **关键字段**：
  - `id` (String): 成员关系 ID
  - `workspace_id` (String): 工作空间 ID
  - `user_id` (String): 用户 ID
  - `role` (String): 角色 ('owner', 'admin', 'member', 'guest')
  - `joined_at` (Date): 加入时间

#### 5. **messages** - 消息表
- **用途**：存储聊天消息
- **关键字段**：
  - `id` (String): 消息 ID
  - `conversation_id` (String): 会话 ID
  - `sender_id` (String): 发送者 ID
  - `content` (String): 消息内容
  - `type` (String): 消息类型 ('text', 'image', 'file', 'video', 'audio', 'system', 'code')
  - `metadata` (Object, nullable): 元数据（文件信息等）
  - `is_recalled` (Boolean): 是否撤回
  - `created_at` (Date): 创建时间
  - `updated_at` (Date): 更新时间

#### 6. **conversations** - 会话表
- **用途**：存储会话信息（聊天室、群组等）
- **关键字段**：
  - `id` (String): 会话 ID
  - `workspace_id` (String): 工作空间 ID
  - `type` (String): 类型 ('direct', 'group', 'channel')
  - `name` (String, nullable): 名称
  - `created_by` (String): 创建者 ID
  - `last_message_at` (Date, nullable): 最后消息时间
  - `deleted_at` (Date, nullable): 删除时间（软删除）
  - `created_at` (Date): 创建时间
  - `updated_at` (Date): 更新时间

#### 7. **conversation_members** - 会话成员表
- **用途**：存储会话成员关系
- **关键字段**：
  - `id` (String): 成员关系 ID
  - `conversation_id` (String): 会话 ID
  - `user_id` (String): 用户 ID
  - `role` (String): 角色
  - `is_hidden` (Boolean): 是否隐藏
  - `is_pinned` (Boolean): 是否置顶
  - `deleted_at` (Date, nullable): 删除时间
  - `joined_at` (Date): 加入时间

### ⭐ 辅助集合（可选功能）

#### 8. **contacts** - 联系人表
- **用途**：存储联系人信息
- **关键字段**：
  - `id` (String): 联系人关系 ID
  - `user_id` (String): 用户 ID
  - `contact_user_id` (String): 联系人用户 ID
  - `nickname` (String, nullable): 昵称
  - `is_favorite` (Boolean): 是否收藏
  - `added_at` (Date): 添加时间

#### 9. **contact_requests** - 联系人请求表
- **用途**：存储联系人添加请求
- **关键字段**：
  - `id` (String): 请求 ID
  - `requester_id` (String): 请求者 ID
  - `recipient_id` (String): 接收者 ID
  - `status` (String): 状态 ('pending', 'accepted', 'rejected', 'cancelled')
  - `created_at` (Date): 创建时间

#### 10. **departments** - 部门表
- **用途**：存储部门信息
- **关键字段**：
  - `id` (String): 部门 ID
  - `workspace_id` (String): 工作空间 ID
  - `name` (String): 部门名称
  - `parent_id` (String, nullable): 父部门 ID
  - `manager_id` (String, nullable): 管理者 ID

#### 11. **user_profiles** - 用户资料表
- **用途**：存储用户详细资料
- **关键字段**：
  - `user_id` (String): 用户 ID
  - `bio` (String, nullable): 个人简介
  - `location` (String, nullable): 位置
  - `preferences` (Object): 偏好设置

#### 12. **hidden_messages** - 隐藏消息表
- **用途**：存储用户隐藏的消息
- **关键字段**：
  - `id` (String): 隐藏记录 ID
  - `user_id` (String): 用户 ID
  - `message_id` (String): 消息 ID
  - `hidden_at` (Date): 隐藏时间

## 🚀 创建方法

### 方法 1：使用脚本自动创建（推荐）

```bash
cd mvp_33-main
node scripts/cloudbase_setup.js
```

这个脚本会：
- ✅ 自动创建所有 11 个核心集合（不包括 orders）
- ✅ 插入测试数据后立即删除（用于创建集合）
- ✅ 显示创建结果

**注意**：`orders` 集合需要单独创建，运行：
```bash
node scripts/038_create_orders_cloudbase.js
```

### 方法 2：在 CloudBase 控制台手动创建

1. 登录 [CloudBase 控制台](https://console.cloud.tencent.com/tcb)
2. 选择你的环境
3. 进入 **数据库** → **集合管理**
4. 点击 **新建集合**
5. 依次创建以下集合（名称必须完全匹配，区分大小写）：

```
users
orders
workspaces
workspace_members
messages
conversations
conversation_members
contacts
contact_requests
departments
user_profiles
hidden_messages
```

**重要**：创建集合时不需要设置字段，字段会在插入数据时自动创建。

## 📝 创建顺序建议

### 立即创建（必须）
1. ✅ **users** - 注册功能需要

### 按需创建（当功能被使用时）
- 支付功能 → **orders**
- 工作空间功能 → **workspaces**, **workspace_members**
- 聊天功能 → **messages**, **conversations**, **conversation_members**
- 联系人功能 → **contacts**, **contact_requests**

### 一次性全部创建（推荐）
如果你想要一次性准备好所有功能，可以创建所有 12 个集合。

## ⚠️ 注意事项

1. **集合名称必须完全匹配**（区分大小写）
2. **不需要预先定义字段**，字段会在插入数据时自动创建
3. **可以先只创建 `users`**，其他集合按需创建
4. 如果某个功能报错 "Db or Table not exist"，说明对应的集合还没创建
5. **索引建议**：在控制台创建以下索引以提高查询性能：
   - `users`: `email` (唯一), `username` (唯一), `id`
   - `orders`: `order_no` (唯一), `user_id`
   - `workspaces`: `domain` (唯一), `owner_id`
   - `workspace_members`: `workspace_id`, `user_id` (复合唯一)
   - `messages`: `conversation_id`, `created_at` (复合)
   - `conversations`: `workspace_id`, `last_message_at`
   - `conversation_members`: `conversation_id`, `user_id` (复合唯一)

## 🔍 验证集合是否创建成功

运行测试脚本：
```bash
node scripts/test-cloudbase-data.js
```

这个脚本会：
- 检查环境变量配置
- 列出所有已创建的集合
- 查询 `users` 集合的示例数据


































































