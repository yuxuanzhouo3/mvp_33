# Slack/Boss直聘模式改造设计方案

> 创建日期：2026-02-20
> 状态：已确认

## 一、需求概述

将聊天核心逻辑从"强好友关系"转变为"基于 Workspace 的开放社交"：
- 同一 Workspace 的成员可以直接发消息
- 支持隐私开关、拉黑和举报功能
- 国内版和国际版完全隔离

### 关键决策

| 决策点 | 选择 |
|--------|------|
| 默认 Workspace 策略 | 所有用户自动加入默认组织（国内/国际各自独立） |
| 隐私设置默认值 | 默认开放（允许非好友发消息） |
| 拉黑行为 | 双向屏蔽 |
| 举报功能 | 完整系统（前端+后端+管理后台） |
| 群聊邀请权限 | 所有群成员都可邀请 |
| UI 改造范围 | 最小改动 |

## 二、核心架构

### 2.1 适配器模式架构

```
lib/
├── interfaces/
│   ├── IUserService.ts      # 用户服务接口
│   ├── IChatService.ts      # 聊天服务接口
│   ├── IWorkspaceService.ts # Workspace 服务接口
│   └── types.ts             # 共享类型定义
├── services/
│   ├── supabase/
│   │   ├── SupabaseUserService.ts
│   │   ├── SupabaseChatService.ts
│   │   └── SupabaseWorkspaceService.ts
│   ├── cloudbase/
│   │   ├── CloudBaseUserService.ts
│   │   ├── CloudBaseChatService.ts
│   │   └── CloudBaseWorkspaceService.ts
│   └── ServiceFactory.ts    # 工厂类，根据环境返回正确实例
```

**关键原则**：
- API 路由只调用 `IUserService`、`IChatService` 等接口
- `ServiceFactory` 根据 `IS_DOMESTIC_VERSION` 返回对应实现
- 所有新功能（拉黑、举报、隐私设置）都在接口中定义

## 三、数据库设计

### 3.1 Supabase (国际版)

```sql
-- 1. 用户隐私设置（扩展现有 users 表）
ALTER TABLE users ADD COLUMN IF NOT EXISTS allow_non_friend_messages BOOLEAN DEFAULT true;

-- 2. 拉黑关系表（双向）
CREATE TABLE blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(blocker_id, blocked_id)
);

-- 3. 举报记录表
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES users(id),
  reported_user_id UUID REFERENCES users(id),
  reported_conversation_id UUID REFERENCES conversations(id),
  report_type TEXT NOT NULL CHECK (report_type IN ('spam', 'harassment', 'inappropriate', 'other')),
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  admin_notes TEXT,
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 默认 Workspace（确保存在）
INSERT INTO workspaces (id, name, domain, owner_id, settings)
VALUES ('default-intl-workspace', 'OrbitChat', 'orbitchat', 'system', '{"allow_guest_users": true, "max_file_size_mb": 50, "locale": "en"}')
ON CONFLICT (id) DO NOTHING;

-- 5. Workspace 成员关系
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'guest')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- 索引
CREATE INDEX idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX idx_blocked_users_blocked ON blocked_users(blocked_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_reported_user ON reports(reported_user_id);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
```

### 3.2 CloudBase (国内版)

对应添加以下集合：

1. **blocked_users** 集合
```json
{
  "blocker_id": "string",
  "blocked_id": "string",
  "reason": "string (optional)",
  "created_at": "ISO date string"
}
```

2. **reports** 集合
```json
{
  "reporter_id": "string",
  "reported_user_id": "string (optional)",
  "reported_conversation_id": "string (optional)",
  "report_type": "spam|harassment|inappropriate|other",
  "description": "string (optional)",
  "status": "pending|reviewing|resolved|dismissed",
  "admin_notes": "string (optional)",
  "resolved_by": "string (optional)",
  "resolved_at": "ISO date string (optional)",
  "created_at": "ISO date string"
}
```

3. **workspace_members** 集合
```json
{
  "workspace_id": "string",
  "user_id": "string",
  "role": "owner|admin|member|guest",
  "joined_at": "ISO date string"
}
```

4. **users** 集合添加字段
```json
{
  "allow_non_friend_messages": true
}
```

## 四、API 设计

### 4.1 新增 API 端点

```
/api/
├── workspaces/
│   ├── route.ts                    # GET: 获取用户所属的 Workspace 列表
│   └── [workspaceId]/
│       └── members/
│           └── route.ts            # GET: 获取 Workspace 成员列表
├── user/
│   └── settings/
│       └── route.ts                # GET/PATCH: 用户隐私设置
├── blocked-users/
│   └── route.ts                    # GET: 拉黑列表, POST: 拉黑, DELETE: 取消拉黑
├── reports/
│   └── route.ts                    # POST: 提交举报, GET: 查询自己的举报
└── admin/
    └── reports/
        └── route.ts                # 管理后台：查询和处理举报
```

### 4.2 修改现有 API

#### `/api/conversations` (创建会话)

**原逻辑**：检查是否为好友

**新逻辑**：
```
1. A 尝试联系 B
2. 检查 A 是否被 B 拉黑（blocked_users 表双向查询）
   - 查询: blocker_id = B AND blocked_id = A
   - 或: blocker_id = A AND blocked_id = B（双向）
3. 如果存在拉黑关系 → 返回 403 "User has blocked you"
4. 检查 B 的隐私设置 allow_non_friend_messages
5. 如果 B.allow_non_friend_messages = false 且 A 和 B 不是好友
   → 返回 403 "User only accepts messages from friends"
6. 通过检查 → 创建/返回现有会话
```

#### `/api/groups/[id]/members` (添加群成员)

**原逻辑**：校验好友关系

**新逻辑**：
```
1. 移除好友校验
2. 新增校验：被邀请者是否属于当前 Workspace
   - 查询 workspace_members 表
   - 确认被邀请者与当前群聊属于同一 Workspace
3. 注：隐私设置仅对 1v1 私聊生效，群聊不受影响
```

### 4.3 注册流程修改

```
1. 用户注册成功后
2. 根据 IS_DOMESTIC_VERSION 确定默认 Workspace
   - 国内版：name = 'OrbitChat' 或 'techcorp'
   - 国际版：name = 'OrbitChat'
3. 查询默认 Workspace 是否存在
4. 如果存在 → 自动创建 workspace_members 记录（role: 'member'）
5. 如果不存在 → 先创建默认 Workspace，再添加用户
```

## 五、前端设计

### 5.1 按钮和菜单变更

**联系人详情页 (`contacts-panel.tsx`)：**
- "加好友" 按钮 → "发送消息" 按钮（保持现有）
- 新增下拉菜单选项：
  - "🚫 屏蔽" / "🚫 Block"
  - "⚠️ 举报" / "⚠️ Report"

### 5.2 隐私设置开关

**设置页面 (`app/settings/preferences/page.tsx`)：**
```
新增 Switch 开关：
[开关] 允许非好友直接向我发送消息
       Allow non-friends to send me messages directly
       （默认开启）
```

### 5.3 新增组件

- `BlockUserDialog.tsx` - 确认拉黑对话框，可选填写原因
- `ReportUserDialog.tsx` - 举报表单（类型选择 + 描述）

### 5.4 状态管理

**新增 Workspace Context：**
```typescript
// lib/workspace-context.tsx
interface WorkspaceContextValue {
  activeWorkspaceId: string | null
  workspaces: Workspace[]
  setActiveWorkspace: (id: string) => void
  fetchWorkspaces: () => Promise<void>
  isLoading: boolean
}
```

### 5.5 登录后跳转

```
1. 登录成功 → 调用 GET /api/workspaces
2. 获取用户的 Workspace 列表
3. 读取 localStorage 中上次访问的 workspaceId
4. 或默认取第一个 Workspace
5. 设置 activeWorkspaceId
6. 跳转到 /chat（现有路由，通过 query 参数或 context 传递 workspaceId）
```

## 六、管理后台设计

### 6.1 举报管理页面

**新增页面：`app/admin/reports/page.tsx`**

功能：
- 举报列表展示（分页、状态筛选、类型筛选）
- 举报详情查看
- 处理状态更新
- 管理员备注
- 封禁用户（可选）

### 6.2 举报状态流转

```
pending（待处理）
    ↓
reviewing（处理中）
    ↓
┌───────────────────────────────────┐
│ resolved（已解决）                 │
│ dismissed（驳回）                  │
└───────────────────────────────────┘
```

## 七、多语言支持

### 7.1 新增翻译键

```typescript
// lib/i18n.ts 扩展
{
  en: {
    // 拉黑相关
    block: 'Block',
    unblock: 'Unblock',
    blockUser: 'Block User',
    blockConfirm: 'Are you sure you want to block this user?',
    blockConfirmDescription: 'After blocking, neither of you will be able to send messages to each other.',
    blockedUsers: 'Blocked Users',
    noBlockedUsers: 'No blocked users',
    userBlocked: 'User blocked successfully',
    userUnblocked: 'User unblocked successfully',

    // 举报相关
    report: 'Report',
    reportUser: 'Report User',
    reportType: 'Report Type',
    reportSpam: 'Spam',
    reportHarassment: 'Harassment',
    reportInappropriate: 'Inappropriate Content',
    reportOther: 'Other',
    reportDescription: 'Description',
    reportDescriptionPlaceholder: 'Please describe the issue...',
    reportSubmitted: 'Report submitted successfully',
    reportThankYou: 'Thank you for your report. We will review it shortly.',

    // 隐私设置
    allowNonFriendMessages: 'Allow non-friends to send me messages',
    allowNonFriendMessagesDescription: 'When enabled, anyone in your workspace can send you direct messages. When disabled, only your friends can message you.',

    // 错误消息
    userBlockedYou: 'This user has blocked you',
    userOnlyAcceptsFriends: 'This user only accepts messages from friends',

    // 管理后台
    reportManagement: 'Report Management',
    pendingReports: 'Pending Reports',
    reviewing: 'Reviewing',
    resolved: 'Resolved',
    dismissed: 'Dismissed',
    markAsReviewing: 'Mark as Reviewing',
    markAsResolved: 'Mark as Resolved',
    dismissReport: 'Dismiss',
    banUser: 'Ban User',
    adminNotes: 'Admin Notes',
    viewChatHistory: 'View Chat History',
  },
  zh: {
    // 拉黑相关
    block: '屏蔽',
    unblock: '取消屏蔽',
    blockUser: '屏蔽用户',
    blockConfirm: '确定要屏蔽该用户吗？',
    blockConfirmDescription: '屏蔽后，双方都将无法互相发送消息。',
    blockedUsers: '已屏蔽用户',
    noBlockedUsers: '暂无已屏蔽用户',
    userBlocked: '已屏蔽该用户',
    userUnblocked: '已取消屏蔽',

    // 举报相关
    report: '举报',
    reportUser: '举报用户',
    reportType: '举报类型',
    reportSpam: '垃圾信息',
    reportHarassment: '骚扰',
    reportInappropriate: '不当内容',
    reportOther: '其他',
    reportDescription: '描述',
    reportDescriptionPlaceholder: '请描述问题...',
    reportSubmitted: '举报已提交',
    reportThankYou: '感谢您的举报，我们会尽快处理。',

    // 隐私设置
    allowNonFriendMessages: '允许非好友直接向我发送消息',
    allowNonFriendMessagesDescription: '开启后，同一工作区的任何成员都可以给您发送私聊消息。关闭后，只有您的好友可以发送消息。',

    // 错误消息
    userBlockedYou: '该用户已屏蔽您',
    userOnlyAcceptsFriends: '该用户只接受好友的消息',

    // 管理后台
    reportManagement: '举报管理',
    pendingReports: '待处理举报',
    reviewing: '处理中',
    resolved: '已解决',
    dismissed: '已驳回',
    markAsReviewing: '标记为处理中',
    markAsResolved: '标记为已解决',
    dismissReport: '驳回',
    banUser: '封禁用户',
    adminNotes: '管理员备注',
    viewChatHistory: '查看聊天记录',
  }
}
```

## 八、实施计划

### 阶段 1：核心适配器架构
1. 创建 `lib/interfaces/` 接口定义
2. 实现 `ServiceFactory`
3. 为现有功能创建 Supabase 和 CloudBase 实现

### 阶段 2：数据库表和迁移
1. Supabase：执行 SQL 迁移
2. CloudBase：创建新集合
3. 确保默认 Workspace 存在

### 阶段 3：后端 API 改造
1. 新增 `/api/blocked-users`
2. 新增 `/api/reports`
3. 新增 `/api/user/settings`
4. 修改 `/api/conversations` 逻辑
5. 修改 `/api/groups/[id]/members` 逻辑
6. 修改注册流程

### 阶段 4：前端 UI 改造
1. 添加拉黑/举报按钮和对话框
2. 添加隐私设置开关
3. 创建 Workspace Context
4. 修改登录后跳转逻辑

### 阶段 5：管理后台
1. 创建举报管理页面
2. 实现举报处理功能

### 阶段 6：测试和修复
1. 功能测试
2. 边界情况处理
3. Bug 修复

## 九、风险和注意事项

1. **数据隔离**：确保国内版和国际版的数据完全隔离，Workspace 和成员关系各自独立
2. **向后兼容**：现有好友关系保持不变，隐私设置默认开放
3. **性能考虑**：创建会话时需要查询拉黑表，考虑添加索引
4. **双向拉黑**：拉黑操作需要同时检查两个方向的记录
