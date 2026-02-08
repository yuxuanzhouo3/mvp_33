# OrbitChat 群聊功能应用层架构设计

> **设计日期**: 2026-02-08
> **架构师**: Claude Sonnet 4.5
> **项目**: OrbitChat MVP33 - 群聊功能应用层实现

---

## 一、设计概述

### 1.1 设计目标

基于已完成的 Supabase 数据库设计（见 `docs/supabase_schema_design.md`），完成 OrbitChat 群聊功能的应用层架构，包括前端界面、API 路由、实时通讯和状态管理。

### 1.2 核心功能需求

- ✅ 群聊创建（简化流程）
- ✅ 群主转让
- ✅ 成员邀请审批
- ✅ 成员踢出/禁言
- ✅ 成员数量限制
- ✅ 按成员控制发言权限
- ✅ 实时消息推送
- ✅ 群设置管理

### 1.3 设计原则

1. **简化优先** - 采用简化的群聊创建流程，快速创建后可修改
2. **参考飞书** - 界面布局参考飞书的设计模式
3. **国际版优先** - 先完成 Supabase（国际版）实现，国内版后续完成
4. **YAGNI 原则** - 只实现当前明确需要的功能

---

## 二、整体架构设计

### 2.1 前端层次结构

```
app/chat/
├── [id]/
│   ├── group-info-drawer.tsx    # 群信息右侧抽屉
│   └── member-detail-dialog.tsx # 成员详情对话框

components/chat/
├── create-group-dialog.tsx      # 创建群聊对话框
├── group-settings-panel.tsx     # 群设置面板
├── member-list.tsx              # 成员列表组件
└── group-invite-panel.tsx       # 邀请成员面板
```

### 2.2 API 路由层

```
app/api/
├── groups/
│   ├── route.ts                 # POST 创建群聊
│   ├── [id]/route.ts            # GET/PUT/DELETE 群信息
│   ├── [id]/members/route.ts    # GET/POST 成员管理
│   ├── [id]/settings/route.ts   # PUT 群设置
│   └── [id]/transfer/route.ts   # POST 转让群主
```

### 2.3 数据库交互层

```
lib/database/supabase/
├── groups.ts                    # 群聊 CRUD 操作
├── group-members.ts             # 成员管理操作
└── group-requests.ts            # 加群申请操作
```

### 2.4 实时通讯层

- 使用 Supabase Realtime 全局订阅
- 订阅 `messages`、`conversations`、`conversation_members` 表
- 在 `chat-wrapper.tsx` 中统一管理订阅

---

## 三、核心组件设计

### 3.1 创建群聊对话框 (create-group-dialog.tsx)

**功能**：
- 显示联系人列表（可多选）
- 最少选择 2 人（除了自己）
- 点击"创建"后自动生成群名称（如"张三、李四、王五"）
- 创建成功后自动跳转到新群聊

**状态管理**：
```typescript
interface CreateGroupDialogState {
  selectedUsers: User[]  // 已选择的用户
  isCreating: boolean    // 创建中状态
  searchQuery: string    // 搜索关键词
}
```

**界面布局**：
```
Dialog (600px 宽, 70vh 高)
├── 搜索框（顶部）
├── 联系人列表（可滚动）
│   └── 每项：Checkbox + Avatar + 名称
├── 已选择的用户（底部）
│   └── 头像列表（横向滚动）
└── 操作按钮
    ├── 取消
    └── 创建（至少选2人才可点击）
```

### 3.2 群信息右侧抽屉 (group-info-drawer.tsx)

**布局结构**（从上到下）：
```
Sheet (400px 宽，从右侧滑入)
├── 群头像和群名称（可点击编辑）
├── 群成员列表（显示头像、名称、角色标签）
│   └── 点击成员 → 打开成员详情对话框
├── 群设置面板
│   ├── 群名称修改
│   ├── 群公告
│   ├── 加群方式（需要审批/直接加入）
│   ├── 成员��请权限（所有人/仅管理员）
│   └── 全员禁言开关
└── 危险操作区
    ├── 退出群聊（普通成员）
    ├── 解散群聊（仅群主）
    └── 转让群主（仅群主）
```

**使用的 shadcn/ui 组件**：
- Sheet（抽屉容器）
- Avatar、Badge、Button、Switch、Input
- Separator（分隔线）

### 3.3 成员详情对话框 (member-detail-dialog.tsx)

**显示内容**：
- 成员基本信息（头像、姓名、职位）
- 角色标签（群主/管理员/成员）

**管理操作**（仅管理员可见）：
- 设为管理员 / 取消管理员
- 禁言 / 解除禁言
- 禁止发言 / 允许发言
- 移出群聊

**权限规则**：
- 群主不能被操作
- 管理员不能操作群主
- 普通成员只能查看信息

**界面布局**：
```
Dialog (500px 宽，居中显示)
├── 顶部：大头像 + 名称 + 职位
├── 角色标签：Badge 组件（群主/管理员）
├── 分隔线
└── 操作按钮组（垂直排列）
    ├── 设为管理员（仅群主可见）
    ├── 禁言 / 解除禁言
    ├── 禁止发言 / 允许发言
    └── 移出群聊（红色按钮）
```

---

## 四、数据流和状态管理

### 4.1 群聊创建流程

```
用户操作 → 创建对话框 → API 调用 → 数据库操作 → 实时订阅更新

详细步骤：
1. 用户选择联系人（至少2人）
2. 点击"创建"按钮
3. 前端调用 POST /api/groups
4. 后端执行：
   - 创建 conversation 记录（type='group'）
   - 自动生成群名称（成员名称拼接，最多3个）
   - 批量插入 conversation_members 记录
   - 创建者角色设为 'owner'
   - 触发 member_count 自动更新（数据库触发器）
5. 返回新群聊 ID
6. 前端跳转到新群聊页面
7. Realtime 订阅自动推送新群聊到侧边栏
```

### 4.2 实时订阅管理

**订阅策略**：全局订阅（订阅用户所有群聊的消息）

**实现位置**：`chat-wrapper.tsx`

**订阅内容**：
```typescript
const channel = supabase
  .channel('user-realtime')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'messages'
  }, handleNewMessage)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'conversation_members'
  }, handleMemberChange)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'conversations'
  }, handleConversationChange)
  .subscribe()
```

**优点**：
- 实时更新所有群聊的未读数
- 实时更新最后消息预览
- 实时更新成员变更

### 4.3 状态管理

**使用 React 状态 + Supabase Realtime**：

```typescript
// 在 chat-wrapper.tsx 中管理
interface ChatState {
  conversations: ConversationWithDetails[]  // 会话列表
  currentConversation: ConversationWithDetails | null  // 当前会话
  messages: MessageWithSender[]  // 消息列表
  isGroupInfoOpen: boolean  // 群信息抽屉状态
}
```

**不需要额外的状态管理库**（如 Redux），因为：
- Supabase Realtime 提供实时数据同步
- React 状态足够管理 UI 状态
- 符合 YAGNI 原则

---

## 五、API 路由设计

### 5.1 创建群聊 API

```typescript
POST /api/groups

请求体：
{
  userIds: string[]     // 选中的用户 ID 列表（不包括当前用户）
  workspaceId: string   // 工作空间 ID
}

响应：
{
  success: boolean
  groupId: string
  message: string
}

后端逻辑：
1. 验证用户身份（auth.uid()）
2. 检查成员数量限制（根据订阅类型）
3. 创建 conversation 记录（type='group'）
4. 自动生成群名称（取前3个成员名称，如"张三、李四、王五"）
5. 批量插入 conversation_members（包括创建者）
6. 创建者角色设为 'owner'，其他成员设为 'member'
7. 返回新群聊 ID
```

### 5.2 群成员管理 API

```typescript
GET /api/groups/[id]/members
功能：获取群成员列表
响应：成员列表（包含角色、禁言状态等）

POST /api/groups/[id]/members
功能：邀请新成员
请求体：{
  userIds: string[],
  invitedBy: string
}
权限：需检查邀请权限和数量限制

PUT /api/groups/[id]/members/[userId]
功能：更新成员权限
请求体：{
  role?: 'admin' | 'member',
  is_muted?: boolean,
  can_send_messages?: boolean,
  muted_until?: string
}
权限：仅管理员可操作

DELETE /api/groups/[id]/members/[userId]
功能：移除成员
权限：管理员踢人或成员退群
```

### 5.3 群设置 API

```typescript
PUT /api/groups/[id]/settings
功能：更新群设置
请求体：{
  name?: string,
  settings?: {
    join_approval_required?: boolean,
    allow_member_invite?: boolean,
    only_admin_can_send?: boolean,
    allow_at_all?: boolean
  }
}
权限：仅管理员可操作

POST /api/groups/[id]/transfer
功能：转让群主
请求体：{ newOwnerId: string }
权限：仅群主可操作
后端逻辑：
1. 验证当前用户是群主
2. 验证新群主是群成员
3. 更新原群主角色为 'admin'
4. 更新新群主角色为 'owner'
```

---

## 六、双数据库架构适配

### 6.1 数据库路由

**现有机制**：`lib/database-router.ts` 已实现数据库路由
- 根据 `NEXT_PUBLIC_DEFAULT_LANGUAGE` 选择数据库
- `zh` → CloudBase (国内版)
- `en` → Supabase (国际版)

### 6.2 实现策略

**第一阶段**：先完成 Supabase（国际版）实现
```
lib/database/supabase/
├── groups.ts           # 群聊 CRUD 操作
├── group-members.ts    # 成员管理操作
└── group-requests.ts   # 加群申请操作
```

**第二阶段**：后续完成 CloudBase（国内版）实现
```
lib/database/cloudbase/
├── groups.ts           # 群聊 CRUD 操作（适配 NoSQL）
├── group-members.ts    # 成员管理操作
└── group-requests.ts   # 加群申请操作
```

### 6.3 CloudBase 特殊处理（后续实现）

**差异点**：
- 没有 RLS 策���，需要在应用层实现权限检查
- 没有触发器，需要手动更新 member_count
- 查询语法不同，需要适配 CloudBase SDK

---

## 七、错误处理策略

### 7.1 常见错误场景

| 错误场景 | HTTP 状态码 | 处理方式 |
|---------|-----------|---------|
| 权限不足（非管理员尝试管理操作） | 403 Forbidden | 返回错误信息 + toast 提示 |
| 成员数量超限（超过订阅类型限制） | 400 Bad Request | 提示升级订阅 |
| 群聊不存在或已解散 | 404 Not Found | 跳转到聊天首页 |
| 数据库 RLS 策略阻止操作 | 403 Forbidden | 返回详细错误信息 |
| 网络或数据库连接失败 | 500 Internal Server Error | 显示重试按钮 |

### 7.2 前端错误处理

```typescript
错误处理机制：
1. 使用 toast 通知显示错误信息
2. 关键操作失败后自动重新加载数据
3. 网络错误时显示重试按钮
4. 权限错误时禁用相关操作按钮
```

---

## 八、界面样式设计

### 8.1 群聊列表展示（参考飞书）

**侧边栏中的群聊显示**：
- 群头像：圆形容器 + Users 图标（h-10 w-10）
- 群名称：粗体显示（font-medium）
- 最后消息预览：灰色文字（text-muted-foreground），单行截断
- 未读数：红色圆形徽章（Badge variant="destructive"）
- 置顶标识：Pin 图标（h-3 w-3，名称左侧）

**排序规则**：
1. 置顶的群聊在最上方（按 pinned_at 倒序）
2. 未置顶的按最后消息时间倒序排列

### 8.2 群信息抽屉样式

**布局**：
- 宽度：400px（桌面端）/ 全屏（移动端）
- 从右侧滑入动画（Sheet 组件）
- 背景：半透明遮罩层

**内容区域**：
```
├── 顶部：群头像（大）+ 群名称（可编辑）
├── 成员区域：
│   ├── 标题："群成员 (12)"
│   ├── 成员网格：3列头像 + 名称
│   └── "查看全部成员"按钮
├── 设置区域：
│   ├── 开关组件（Switch）
│   └── 输入框（Input）
└── 底部：危险操作按钮（红色 Button variant="destructive"）
```

### 8.3 成员详情对话框样式

**布局**：
- 居中显示（Dialog）
- 宽度：500px
- 圆角：8px

**内容**：
```
├── 顶部：大头像（h-20 w-20）+ 名称 + 职位
├── 角色标签：Badge 组件（群主/管理员）
├── 分隔线（Separator）
└── 操作按钮组（垂直排列，gap-2）
    ├── 设为管理员（仅群主可见）
    ├── 禁言 / 解除禁言
    ├── 禁止发言 / 允许发言
    └── 移出群聊（Button variant="destructive"）
```

### 8.4 创建群聊对话框样式

**布局**：
- 居中显示（Dialog）
- 宽度：600px
- 高度：70vh

**内容**：
```
├── 搜索框（顶部，带 Search 图标）
├── 联系人列表（ScrollArea，可滚动）
│   └── 每项：Checkbox + Avatar + 名称
├── 已选择的用户（底部，固定高度）
│   └── 头像列表（横向滚动，flex gap-2）
└── 操作按钮（DialogFooter）
    ├── 取消（Button variant="outline"）
    └── 创建（Button，至少选2人才可点击）
```

---

## 九、实施计划

### 9.1 开发顺序

**阶段 1：数据库交互层**
1. 创建 `lib/database/supabase/groups.ts`
2. 创建 `lib/database/supabase/group-members.ts`
3. 创建 `lib/database/supabase/group-requests.ts`

**阶段 2：API 路由层**
1. 创建 `app/api/groups/route.ts`（创建群聊）
2. 创建 `app/api/groups/[id]/route.ts`（群信息）
3. 创建 `app/api/groups/[id]/members/route.ts`（成员管理）
4. 创建 `app/api/groups/[id]/settings/route.ts`（群设置）
5. 创建 `app/api/groups/[id]/transfer/route.ts`（转让群主）

**阶段 3：前端组件**
1. 创建 `components/chat/create-group-dialog.tsx`
2. 创建 `app/chat/[id]/group-info-drawer.tsx`
3. 创建 `app/chat/[id]/member-detail-dialog.tsx`
4. 创建 `components/chat/member-list.tsx`
5. 创建 `components/chat/group-settings-panel.tsx`

**阶段 4：实时通讯集成**
1. 在 `chat-wrapper.tsx` 中添加 Realtime 订阅
2. 处理群聊消息推送
3. 处理成员变更推送
4. 处理群信息变更推送

**阶段 5：界面集成**
1. 在 `chat-header.tsx` 中添加群信息按钮
2. 在 `sidebar.tsx` 中优化群聊显示
3. 在 `message-list.tsx` 中添加群聊消息处理
4. 测试和优化

### 9.2 测试要点

**功能测试**：
- 创建群聊（2人、多人、最大人数）
- 邀请成员（权限检查、数量限制）
- 移除成员（管理员踢人、成员退群）
- 转让群主（权限验证）
- 禁言/解除禁言
- 群设置修改
- 实时消息推送

**权限测试**：
- 群主权限（转让、解散）
- 管理员权限（踢人、禁言、设置）
- 普通成员权限（查看、退群）
- RLS 策略验证

**边界测试**：
- 成员数量限制
- 订阅类型限制
- 网络异常处理
- 并发操作处理

---

## 十、总结

### 10.1 设计亮点

1. **简化流程** - 快速创建群聊，降低用户操作成本
2. **参考飞书** - 采用成熟的设计模式，用户体验好
3. **全局订阅** - 实时更新所有群聊状态，体验流畅
4. **详情页操作** - 提供充足空间展示成员信息和权限设置
5. **国际版优先** - 先完成 Supabase 实现，降低开发复杂度

### 10.2 技术栈

- **前端框架**: Next.js 16 + React 19
- **UI 组件**: shadcn/ui (Radix UI)
- **样式方案**: Tailwind CSS
- **数据库**: Supabase (PostgreSQL)
- **实时通讯**: Supabase Realtime
- **状态管理**: React State + Realtime

### 10.3 后续工作

1. 按照实施计划逐步开发
2. 完成国际版后，适配国内版（CloudBase）
3. 性能优化和用户体验优化
4. 添加更多群聊功能（群公告、@提醒等）

---

**文档版本**: v1.0
**最后更新**: 2026-02-08
**状态**: 已完成设计，待实施
