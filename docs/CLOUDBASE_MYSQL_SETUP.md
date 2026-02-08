# CloudBase MySQL 数据库设置指南

## 概述

CloudBase MySQL 数据库需要通过控制台界面手动创建表。本文档说明如何创建所有必要的表。

## 创建表的步骤

### 1. 进入表管理页面

1. 登录 [CloudBase 控制台](https://tcb.cloud.tencent.com/dev?envId=cloud1-3giwb8x723267ff3)
2. 选择环境：`cloud1-3giwb8x723267ff3`
3. 进入"MySQL 数据库" → "表管理"

### 2. 创建表的方法

在 CloudBase MySQL 中，有两种方式创建表：

#### 方法一：通过"新建表"功能（如果有）

1. 点击"新建表"或"创建表"按钮
2. 输入表名
3. 添加字段（见下面的字段定义）
4. 保存

#### 方法二：通过数据模型创建（推荐）

1. 进入"数据模型"页面
2. 创建数据模型，系统会自动创建对应的表
3. 在模型中定义字段

### 3. 需要创建的表和字段

以下是所有需要创建的表及其字段定义：

---

## 表 1: users（用户表）

**字段列表：**

| 字段名 | 类型 | 长度 | 是否主键 | 是否唯一 | 是否非空 | 默认值 | 说明 |
|--------|------|------|----------|----------|----------|--------|------|
| id | VARCHAR | 36 | ✅ | ✅ | ✅ | - | 用户ID（UUID） |
| email | VARCHAR | 255 | - | ✅ | ✅ | - | 邮箱 |
| username | VARCHAR | 100 | - | ✅ | ✅ | - | 用户名 |
| full_name | VARCHAR | 255 | - | - | ✅ | - | 全名 |
| avatar_url | TEXT | - | - | - | - | NULL | 头像URL |
| phone | VARCHAR | 50 | - | - | - | NULL | 电话 |
| department | VARCHAR | 255 | - | - | - | NULL | 部门 |
| title | VARCHAR | 255 | - | - | - | NULL | 职位 |
| status | VARCHAR | 20 | - | - | - | 'offline' | 状态：online/offline/away/busy |
| status_message | TEXT | - | - | - | - | NULL | 状态消息 |
| created_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 更新时间 |

---

## 表 2: workspaces（工作空间表）

**字段列表：**

| 字段名 | 类型 | 长度 | 是否主键 | 是否唯一 | 是否非空 | 默认值 | 说明 |
|--------|------|------|----------|----------|----------|--------|------|
| id | VARCHAR | 36 | ✅ | ✅ | ✅ | - | 工作空间ID |
| name | VARCHAR | 255 | - | - | ✅ | - | 名称 |
| logo_url | TEXT | - | - | - | - | NULL | Logo URL |
| domain | VARCHAR | 255 | - | ✅ | ✅ | - | 域名 |
| owner_id | VARCHAR | 36 | - | - | - | NULL | 所有者ID（外键：users.id） |
| settings | JSON | - | - | - | - | '{"allow_guest_users": false, "max_file_size_mb": 100, "locale": "en"}' | 设置 |
| created_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 更新时间 |

**外键关系：**
- owner_id → users.id (ON DELETE CASCADE)

---

## 表 3: workspace_members（工作空间成员表）

**字段列表：**

| 字段名 | 类型 | 长度 | 是否主键 | 是否唯一 | 是否非空 | 默认值 | 说明 |
|--------|------|------|----------|----------|----------|--------|------|
| id | VARCHAR | 36 | ✅ | ✅ | ✅ | - | 成员ID |
| workspace_id | VARCHAR | 36 | - | - | ✅ | - | 工作空间ID（外键） |
| user_id | VARCHAR | 36 | - | - | ✅ | - | 用户ID（外键） |
| role | VARCHAR | 20 | - | - | - | 'member' | 角色：owner/admin/member/guest |
| joined_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 加入时间 |

**唯一约束：**
- (workspace_id, user_id) 组合唯一

**外键关系：**
- workspace_id → workspaces.id (ON DELETE CASCADE)
- user_id → users.id (ON DELETE CASCADE)

---

## 表 4: conversations（会话表）

**字段列表：**

| 字段名 | 类型 | 长度 | 是否主键 | 是否唯一 | 是否非空 | 默认值 | 说明 |
|--------|------|------|----------|----------|----------|--------|------|
| id | VARCHAR | 36 | ✅ | ✅ | ✅ | - | 会话ID |
| workspace_id | VARCHAR | 36 | - | - | ✅ | - | 工作空间ID（外键） |
| type | VARCHAR | 20 | - | - | ✅ | - | 类型：direct/group/channel |
| name | VARCHAR | 255 | - | - | - | NULL | 名称 |
| description | TEXT | - | - | - | - | NULL | 描述 |
| avatar_url | TEXT | - | - | - | - | NULL | 头像URL |
| created_by | VARCHAR | 36 | - | - | - | NULL | 创建者ID（外键） |
| is_private | BOOLEAN | - | - | - | - | TRUE | 是否私有 |
| created_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 更新时间 |
| last_message_at | TIMESTAMP | - | - | - | - | NULL | 最后消息时间 |
| deleted_at | TIMESTAMP | - | - | - | - | NULL | 删除时间（软删除） |

**外键关系：**
- workspace_id → workspaces.id (ON DELETE CASCADE)
- created_by → users.id (ON DELETE SET NULL)

---

## 表 5: conversation_members（会话成员表）

**字段列表：**

| 字段名 | 类型 | 长度 | 是否主键 | 是否唯一 | 是否非空 | 默认值 | 说明 |
|--------|------|------|----------|----------|----------|--------|------|
| id | VARCHAR | 36 | ✅ | ✅ | ✅ | - | 成员ID |
| conversation_id | VARCHAR | 36 | - | - | ✅ | - | 会话ID（外键） |
| user_id | VARCHAR | 36 | - | - | ✅ | - | 用户ID（外键） |
| role | VARCHAR | 20 | - | - | - | 'member' | 角色：owner/admin/member |
| joined_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 加入时间 |
| last_read_at | TIMESTAMP | - | - | - | - | NULL | 最后阅读时间 |
| notification_setting | VARCHAR | 20 | - | - | - | 'all' | 通知设置：all/mentions/none |
| is_hidden | BOOLEAN | - | - | - | - | FALSE | 是否隐藏（新增） |
| hidden_at | TIMESTAMP | - | - | - | - | NULL | 隐藏时间（新增） |
| is_pinned | BOOLEAN | - | - | - | - | FALSE | 是否置顶（新增） |
| pinned_at | TIMESTAMP | - | - | - | - | NULL | 置顶时间（新增） |
| deleted_at | TIMESTAMP | - | - | - | - | NULL | 删除时间（新增） |

**唯一约束：**
- (conversation_id, user_id) 组合唯一

**外键关系：**
- conversation_id → conversations.id (ON DELETE CASCADE)
- user_id → users.id (ON DELETE CASCADE)

---

## 表 6: messages（消息表）

**字段列表：**

| 字段名 | 类型 | 长度 | 是否主键 | 是否唯一 | 是否非空 | 默认值 | 说明 |
|--------|------|------|----------|----------|----------|--------|------|
| id | VARCHAR | 36 | ✅ | ✅ | ✅ | - | 消息ID |
| conversation_id | VARCHAR | 36 | - | - | ✅ | - | 会话ID（外键） |
| sender_id | VARCHAR | 36 | - | - | ✅ | - | 发送者ID（外键） |
| content | TEXT | - | - | - | ✅ | - | 内容 |
| type | VARCHAR | 20 | - | - | - | 'text' | 类型：text/image/file/video/audio/system/code |
| metadata | JSON | - | - | - | - | NULL | 元数据 |
| reply_to | VARCHAR | 36 | - | - | - | NULL | 回复的消息ID（外键） |
| reactions | JSON | - | - | - | - | '[]' | 反应 |
| is_edited | BOOLEAN | - | - | - | - | FALSE | 是否编辑 |
| is_deleted | BOOLEAN | - | - | - | - | FALSE | 是否删除 |
| is_recalled | BOOLEAN | - | - | - | - | FALSE | 是否撤回（新增） |
| created_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 更新时间 |

**外键关系：**
- conversation_id → conversations.id (ON DELETE CASCADE)
- sender_id → users.id (ON DELETE SET NULL)
- reply_to → messages.id (ON DELETE SET NULL)

---

## 表 7: contacts（联系人表）

**字段列表：**

| 字段名 | 类型 | 长度 | 是否主键 | 是否唯一 | 是否非空 | 默认值 | 说明 |
|--------|------|------|----------|----------|----------|--------|------|
| id | VARCHAR | 36 | ✅ | ✅ | ✅ | - | 联系人ID |
| user_id | VARCHAR | 36 | - | - | ✅ | - | 用户ID（外键） |
| contact_user_id | VARCHAR | 36 | - | - | ✅ | - | 联系人用户ID（外键） |
| nickname | VARCHAR | 255 | - | - | - | NULL | 昵称 |
| tags | JSON | - | - | - | - | '[]' | 标签 |
| is_favorite | BOOLEAN | - | - | - | - | FALSE | 是否收藏 |
| is_blocked | BOOLEAN | - | - | - | - | FALSE | 是否屏蔽 |
| added_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 添加时间 |

**唯一约束：**
- (user_id, contact_user_id) 组合唯一

**外键关系：**
- user_id → users.id (ON DELETE CASCADE)
- contact_user_id → users.id (ON DELETE CASCADE)

---

## 表 8: contact_requests（联系人请求表）

**字段列表：**

| 字段名 | 类型 | 长度 | 是否主键 | 是否唯一 | 是否非空 | 默认值 | 说明 |
|--------|------|------|----------|----------|----------|--------|------|
| id | VARCHAR | 36 | ✅ | ✅ | ✅ | - | 请求ID |
| requester_id | VARCHAR | 36 | - | - | ✅ | - | 请求者ID（外键） |
| recipient_id | VARCHAR | 36 | - | - | ✅ | - | 接收者ID（外键） |
| message | TEXT | - | - | - | - | NULL | 消息 |
| status | VARCHAR | 20 | - | - | - | 'pending' | 状态：pending/accepted/rejected/cancelled |
| created_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 更新时间 |

**唯一约束：**
- (requester_id, recipient_id) 组合唯一

**外键关系：**
- requester_id → users.id (ON DELETE CASCADE)
- recipient_id → users.id (ON DELETE CASCADE)

---

## 表 9: departments（部门表）

**字段列表：**

| 字段名 | 类型 | 长度 | 是否主键 | 是否唯一 | 是否非空 | 默认值 | 说明 |
|--------|------|------|----------|----------|----------|--------|------|
| id | VARCHAR | 36 | ✅ | ✅ | ✅ | - | 部门ID |
| workspace_id | VARCHAR | 36 | - | - | ✅ | - | 工作空间ID（外键） |
| name | VARCHAR | 255 | - | - | ✅ | - | 名称 |
| parent_id | VARCHAR | 36 | - | - | - | NULL | 父部门ID（外键） |
| manager_id | VARCHAR | 36 | - | - | - | NULL | 管理者ID（外键） |
| description | TEXT | - | - | - | - | NULL | 描述 |
| created_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 创建时间 |

**外键关系：**
- workspace_id → workspaces.id (ON DELETE CASCADE)
- parent_id → departments.id (ON DELETE SET NULL)
- manager_id → users.id (ON DELETE SET NULL)

---

## 表 10: user_profiles（用户资料表）

**字段列表：**

| 字段名 | 类型 | 长度 | 是否主键 | 是否唯一 | 是否非空 | 默认值 | 说明 |
|--------|------|------|----------|----------|----------|--------|------|
| user_id | VARCHAR | 36 | ✅ | ✅ | ✅ | - | 用户ID（外键） |
| bio | TEXT | - | - | - | - | NULL | 简介 |
| location | VARCHAR | 255 | - | - | - | NULL | 位置 |
| timezone | VARCHAR | 100 | - | - | - | NULL | 时区 |
| language | VARCHAR | 10 | - | - | - | 'en' | 语言 |
| preferences | JSON | - | - | - | - | '{"theme": "auto", "notification_sound": true, "message_preview": true, "compact_mode": false}' | 偏好设置 |

**外键关系：**
- user_id → users.id (ON DELETE CASCADE)

---

## 表 11: hidden_messages（隐藏消息表）

**字段列表：**

| 字段名 | 类型 | 长度 | 是否主键 | 是否唯一 | 是否非空 | 默认值 | 说明 |
|--------|------|------|----------|----------|----------|--------|------|
| id | VARCHAR | 36 | ✅ | ✅ | ✅ | - | 隐藏记录ID |
| user_id | VARCHAR | 36 | - | - | ✅ | - | 用户ID（外键） |
| message_id | VARCHAR | 36 | - | - | ✅ | - | 消息ID（外键） |
| hidden_at | TIMESTAMP | - | - | - | - | CURRENT_TIMESTAMP | 隐藏时间 |

**唯一约束：**
- (user_id, message_id) 组合唯一

**外键关系：**
- user_id → users.id (ON DELETE CASCADE)
- message_id → messages.id (ON DELETE CASCADE)

---

## 创建顺序

由于存在外键关系，请按以下顺序创建表：

1. **users**（无依赖）
2. **workspaces**（依赖 users）
3. **workspace_members**（依赖 workspaces, users）
4. **conversations**（依赖 workspaces, users）
5. **conversation_members**（依赖 conversations, users）
6. **messages**（依赖 conversations, users）
7. **contacts**（依赖 users）
8. **contact_requests**（依赖 users）
9. **departments**（依赖 workspaces, users）
10. **user_profiles**（依赖 users）
11. **hidden_messages**（依赖 users, messages）

---

## 注意事项

1. **字段类型**：
   - UUID 使用 `VARCHAR(36)` 存储
   - JSON 数据使用 `JSON` 类型
   - 数组使用 `JSON` 类型存储

2. **外键约束**：
   - 如果 CloudBase MySQL 不支持外键，可以省略外键定义，在应用层维护关系

3. **索引**：
   - 建议为常用查询字段创建索引
   - 主键自动创建索引
   - 唯一约束自动创建索引

4. **字符集**：
   - 建议使用 `utf8mb4` 字符集以支持 emoji 等特殊字符

---

## 权限设置

在 CloudBase MySQL 中，每个表都需要设置访问权限。以下是推荐的权限配置：

### CloudBase MySQL 权限选项说明

CloudBase MySQL 提供以下权限选项：

1. **读取全部数据，修改本人数据**
   - 适用场景：用户评论、用户公开信息等
   - 说明：所有人都可以读取，但只能修改自己创建的数据

2. **读取和修改本人数据**
   - 适用场景：用户个人设置、用户订单管理等
   - 说明：只能读取和修改自己创建的数据

3. **读取全部数据，不可修改数据**
   - 适用场景：商品信息等
   - 说明：所有人都可以读取，但无法修改

4. **无权限**
   - 适用场景：后台流水数据等
   - 说明：完全禁止访问

### 各表权限配置（推荐）

| 表名 | 权限选项 | 说明 |
|------|----------|------|
| **users** | 读取全部数据，修改本人数据 | 需要查看其他用户信息（显示用户名、头像），但只能修改自己的信息 |
| **workspaces** | 读取全部数据，修改本人数据 | 成员需要查看工作空间信息，但只有创建者/所有者可以修改 |
| **workspace_members** | 读取全部数据，修改本人数据 | 成员需要查看成员列表，但只有创建者/管理员可以添加/删除成员 |
| **conversations** | 读取全部数据，修改本人数据 | 成员需要查看会话列表，但只有创建者/管理员可以修改会话信息 |
| **conversation_members** | 读取全部数据，修改本人数据 | 成员需要查看会话成员列表，但只有创建者/管理员可以添加/删除成员 |
| **messages** | 读取全部数据，修改本人数据 | 成员需要查看所有消息，但只能修改自己发送的消息（撤回、编辑） |
| **contacts** | 读取和修改本人数据 | 联系人信息完全私有，只能查看和管理自己的联系人 |
| **contact_requests** | 读取和修改本人数据 | 只能查看自己发送或接收的请求，只能修改自己相关的请求 |
| **departments** | 读取全部数据，修改本人数据 | 成员需要查看部门信息，但只有创建者/管理员可以修改 |
| **user_profiles** | 读取全部数据，修改本人数据 | 可以查看其他用户的公开资料，但只能修改自己的资料 |
| **hidden_messages** | 读取和修改本人数据 | 隐藏消息设置完全私有，只能查看和管理自己的隐藏设置 |

### 详细说明

#### 1. users（用户表）
- **权限**：读取全部数据，修改本人数据
- **原因**：需要显示其他用户的用户名、头像等信息，但用户只能修改自己的信息

#### 2. workspaces（工作空间表）
- **权限**：读取全部数据，修改本人数据
- **原因**：成员需要查看工作空间信息，但只有创建者（owner_id）可以修改

#### 3. workspace_members（工作空间成员表）
- **权限**：读取全部数据，修改本人数据
- **原因**：成员需要查看成员列表，但只有创建者/管理员可以添加/删除成员

#### 4. conversations（会话表）
- **权限**：读取全部数据，修改本人数据
- **原因**：成员需要查看会话列表，但只有创建者（created_by）可以修改会话信息

#### 5. conversation_members（会话成员表）
- **权限**：读取全部数据，修改本人数据
- **原因**：成员需要查看会话成员列表，但只有创建者/管理员可以添加/删除成员

#### 6. messages（消息表）
- **权限**：读取全部数据，修改本人数据
- **原因**：成员需要查看所有消息，但只能修改自己发送的消息（撤回、编辑）

#### 7. contacts（联系人表）
- **权限**：读取和修改本人数据
- **原因**：联系人信息完全私有，用户只能查看和管理自己的联系人

#### 8. contact_requests（联系人请求表）
- **权限**：读取和修改本人数据
- **原因**：只能查看自己发送或接收的请求，只能修改自己相关的请求

#### 9. departments（部门表）
- **权限**：读取全部数据，修改本人数据
- **原因**：成员需要查看部门信息，但只有创建者/管理员可以修改

#### 10. user_profiles（用户资料表）
- **权限**：读取全部数据，修改本人数据
- **原因**：可以查看其他用户的公开资料，但只能修改自己的资料

#### 11. hidden_messages（隐藏消息表）
- **权限**：读取和修改本人数据
- **原因**：隐藏消息设置完全私有，只能查看和管理自己的隐藏设置

### 权限设置步骤

1. 在"表管理"页面，点击要设置权限的表
2. 进入"权限设置"或"安全设置"
3. 分别设置"读权限"和"写权限"
4. 保存设置

### 注意事项

1. **初始测试**：建议先设置为"仅登录用户读/写"进行测试，确保功能正常后再调整
2. **性能考虑**：权限检查会增加查询开销，但能提高安全性
3. **应用层验证**：即使设置了数据库权限，应用层也应该进行权限验证
4. **管理员权限**：如果需要管理员可以访问所有数据，可能需要使用服务端 API 或特殊权限配置

## 验证

创建完所有表后，可以在"表管理"页面查看所有表是否都已创建成功。

