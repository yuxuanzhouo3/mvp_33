# CloudBase 数据库设置指南

本文档说明如何将 Supabase 数据库结构迁移到腾讯云 CloudBase。

## 概述

CloudBase 使用 NoSQL 数据库（类似 MongoDB），而 Supabase 使用 PostgreSQL。本脚本将 Supabase 的表结构转换为 CloudBase 的集合结构，并包含所有后续新增的字段。

## 数据库结构对应关系

| Supabase 表 | CloudBase 集合 | 说明 |
|------------|---------------|------|
| users | users | 用户表 |
| workspaces | workspaces | 工作空间表 |
| workspace_members | workspace_members | 工作空间成员表 |
| conversations | conversations | 会话表（包含 deleted_at 字段） |
| conversation_members | conversation_members | 会话成员表（包含 is_hidden, hidden_at, is_pinned, pinned_at, deleted_at 字段） |
| messages | messages | 消息表（包含 type: 'code', is_recalled 字段） |
| contacts | contacts | 联系人表 |
| contact_requests | contact_requests | 联系人请求表（新增） |
| departments | departments | 部门表 |
| user_profiles | user_profiles | 用户资料表 |
| hidden_messages | hidden_messages | 隐藏消息表（新增） |

## 字段映射说明

### 数据类型转换

- PostgreSQL `UUID` → CloudBase `String` (使用 UUID 格式)
- PostgreSQL `VARCHAR/TEXT` → CloudBase `String`
- PostgreSQL `BOOLEAN` → CloudBase `Boolean`
- PostgreSQL `TIMESTAMP WITH TIME ZONE` → CloudBase `Date`
- PostgreSQL `JSONB` → CloudBase `Object`
- PostgreSQL `TEXT[]` → CloudBase `Array`

### 主键和外键

- CloudBase 使用 `_id` 作为文档 ID（自动生成）
- 外键关系通过存储引用 ID（String 类型）实现
- 唯一约束需要在 CloudBase 控制台创建唯一索引

## 新增字段说明

以下字段是在 Supabase 建表后新增的，已包含在 CloudBase 结构中：

### conversations 表
- `deleted_at` (Date, nullable): 软删除时间戳

### conversation_members 表
- `is_hidden` (Boolean, default: false): 是否隐藏会话
- `hidden_at` (Date, nullable): 隐藏时间
- `is_pinned` (Boolean, default: false): 是否置顶会话
- `pinned_at` (Date, nullable): 置顶时间
- `deleted_at` (Date, nullable): 用户删除时间

### messages 表
- `type` 字段新增 'code' 类型：`'text', 'image', 'file', 'video', 'audio', 'system', 'code'`
- `is_recalled` (Boolean, default: false): 是否撤回消息

### 新增表
- `contact_requests`: 联系人请求表
- `hidden_messages`: 隐藏消息表（用户级别的消息隐藏）

## 安装和配置

### 1. 安装依赖

```bash
cd mvp_33-main
npm install @cloudbase/node-sdk dotenv
```

### 2. 配置环境变量

在项目根目录创建或编辑 `.env` 文件：

```env
CLOUDBASE_ENV_ID=your_env_id
CLOUDBASE_SECRET_ID=your_secret_id
CLOUDBASE_SECRET_KEY=your_secret_key
```

**示例配置**（来自 mvp_6-main 项目，仅供参考）：
```env
CLOUDBASE_ENV_ID=cloud1-xxxxx  # 请替换为你的环境 ID
CLOUDBASE_SECRET_ID=your_secret_id_here  # 请替换为你的 Secret ID
CLOUDBASE_SECRET_KEY=your_secret_key_here  # 请替换为你的 Secret Key
```

> ⚠️ **注意**：如果使用现有的 CloudBase 环境，可以使用上面的配置。如果是新环境，请在 [腾讯云 CloudBase 控制台](https://console.cloud.tencent.com/tcb) 获取你自己的环境 ID 和密钥。

### 3. 在 CloudBase 控制台手动创建集合

⚠️ **重要**：CloudBase 文档型数据库**必须**在控制台手动创建所有集合，API 无法自动创建集合。

#### 方法一：在控制台手动创建所有集合（推荐）

1. 登录 [腾讯云 CloudBase 控制台](https://tcb.cloud.tencent.com/dev?envId=cloud1-3giwb8x723267ff3#/db/doc/collection/)
2. 选择你的环境（环境 ID: `cloud1-3giwb8x723267ff3`）
3. 进入"数据库" → "集合管理"页面
4. 点击"新建集合"，依次创建以下 11 个集合：
   - `users`
   - `workspaces`
   - `workspace_members`
   - `conversations`
   - `conversation_members`
   - `messages`
   - `contacts`
   - `contact_requests`
   - `departments`
   - `user_profiles`
   - `hidden_messages`

> 💡 **提示**：集合名称必须完全匹配（区分大小写）。创建时不需要设置字段，字段会在插入数据时自动创建。

#### 方法二：使用数据模型创建（可选）

1. 进入"数据模型"页面
2. 创建数据模型，系统会自动在集合管理中创建对应的集合
3. 确保数据模型中的字段与 Supabase 表中的字段一致

### 4. 验证集合是否创建成功

在控制台手动创建所有集合后，运行验证脚本：

```bash
node scripts/cloudbase_verify.js
```

这个脚本会检查所有集合是否已创建。如果所有集合都存在，会显示成功信息。

### 5. 运行初始化脚本（插入测试数据，可选）

验证通过后，可以运行初始化脚本插入测试数据结构：

```bash
node scripts/cloudbase_setup.js
```

> ⚠️ **注意**：如果集合已在控制台创建，这个脚本主要用于验证和插入测试数据，不会创建新集合。

**如果遇到 "Db or Table not exist" 错误**，请按以下步骤排查：

1. **确认数据库已初始化**：
   - 在控制台手动创建至少一个集合（如 `_init`）
   - 这会让数据库实例完全初始化

2. **检查配置**：
   - 确认环境 ID 正确：`cloud1-3giwb8x723267ff3`
   - 确认 Secret ID 和 Secret Key 有效且有数据库访问权限

3. **重新运行脚本**：
   ```bash
   node scripts/cloudbase_setup.js
   ```

4. **如果仍然失败**：
   - 检查 CloudBase 控制台的"权限管理"，确保 Secret ID 有数据库读写权限
   - 尝试在控制台手动创建一个集合，确认数据库功能正常

## 创建索引

CloudBase 的索引需要在控制台手动创建。建议创建以下索引：

### users 集合
- `email` (唯一索引)
- `username` (唯一索引)

### workspaces 集合
- `domain` (唯一索引)
- `owner_id` (普通索引)

### workspace_members 集合
- `workspace_id` + `user_id` (复合唯一索引)

### conversations 集合
- `workspace_id` (普通索引)
- `workspace_id` + `last_message_at` (复合索引，降序)
- `deleted_at` (普通索引，用于过滤未删除的会话)

### conversation_members 集合
- `conversation_id` + `user_id` (复合唯一索引)
- `user_id` + `is_hidden` (复合索引)
- `user_id` + `pinned_at` (复合索引，降序)
- `deleted_at` (普通索引)

### messages 集合
- `conversation_id` + `created_at` (复合索引，降序)
- `sender_id` (普通索引)
- `is_recalled` (普通索引)

### contacts 集合
- `user_id` (普通索引)
- `user_id` + `contact_user_id` (复合唯一索引)

### contact_requests 集合
- `requester_id` (普通索引)
- `recipient_id` (普通索引)
- `requester_id` + `recipient_id` (复合唯一索引)

### hidden_messages 集合
- `user_id` (普通索引)
- `message_id` (普通索引)
- `user_id` + `message_id` (复合唯一索引)

## 注意事项

1. **集合自动创建**: CloudBase 会在首次插入数据时自动创建集合，但建议先运行初始化脚本确保结构正确。

2. **测试数据**: 初始化脚本会插入测试数据然后删除，用于创建集合结构。

3. **索引创建**: 索引必须在 CloudBase 控制台手动创建，脚本无法自动创建索引。

4. **数据迁移**: 如果需要从 Supabase 迁移现有数据，需要编写额外的迁移脚本。

5. **唯一约束**: CloudBase 的唯一约束通过唯一索引实现，需要在控制台创建。

6. **时间戳**: CloudBase 使用 JavaScript Date 对象存储时间，会自动处理时区。

7. **JSON 字段**: PostgreSQL 的 JSONB 字段在 CloudBase 中存储为 Object 类型。

## 验证

初始化完成后，可以在 CloudBase 控制台查看创建的集合：

1. 登录 [腾讯云 CloudBase 控制台](https://console.cloud.tencent.com/tcb)
2. 进入你的环境
3. 打开"数据库"页面
4. 检查所有集合是否已创建
5. 验证每个集合的字段结构是否正确

## 故障排除

### 错误：环境变量未设置
确保 `.env` 文件存在且包含所有必要的环境变量。

### 错误：集合创建失败
- 检查 CloudBase 环境 ID 是否正确
- 检查 Secret ID 和 Secret Key 是否有权限
- 查看 CloudBase 控制台是否有错误日志

### 错误：索引创建失败
索引必须在 CloudBase 控制台手动创建，脚本无法创建索引。

## 相关文档

- [CloudBase 数据库文档](https://cloud.tencent.com/document/product/876/19369)
- [Supabase 数据库结构](../scripts/003_supabase_setup.sql)

