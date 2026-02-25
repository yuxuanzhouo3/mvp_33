# 工作区成员管理后端设计

> **设计日期**: 2026-02-24
> **状态**: 已确认，准备实施

---

## 一、需求概述

### 1.1 功能需求

1. **角色系统**：`owner` / `admin` / `member` 三种角色
2. **申请审批流程**：用户通过邀请码加入工作区后，需要 owner 或 admin 审批
3. **审批权限**：owner 和 admin 都可以批准/拒绝申请，任一人同意即可
4. **移除成员**：只有 owner 和 admin 可以移除成员（不能移除 owner）

### 1.2 设计决策

| 问题 | 决策 |
|------|------|
| 申请流程 | 点击邀请链接后直接创建待审批记录 |
| 申请理由 | 可选 |
| 新成员角色 | 统一为 member |
| 审批权限 | owner 和 admin |

---

## 二、数据库设计

### 2.1 Supabase（国际版）

```sql
-- 1. 修改 workspace_members 表，添加 admin 角色支持
ALTER TABLE workspace_members
DROP CONSTRAINT IF EXISTS workspace_members_role_check;

ALTER TABLE workspace_members
ADD CONSTRAINT workspace_members_role_check
CHECK (role IN ('owner', 'admin', 'member'));

-- 2. 创建 workspace_join_requests 表
CREATE TABLE workspace_join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(workspace_id, user_id, status)
);

CREATE INDEX idx_workspace_join_requests_workspace
ON workspace_join_requests(workspace_id, status);
```

### 2.2 CloudBase（国内版）

创建 `orbitchat_workspace_join_requests` 集合：

```json
{
  "_id": "request_uuid",
  "workspace_id": "workspace_uuid",
  "user_id": "user_uuid",
  "reason": "申请理由（可选）",
  "status": "pending",
  "reviewed_by": "admin_user_uuid",
  "reviewed_at": "2026-02-24T12:00:00Z",
  "created_at": "2026-02-24T10:00:00Z"
}
```

---

## 三、API 设计

### 3.1 端点列表

| 端点 | 方法 | 功能 | 权限 |
|------|------|------|------|
| `/api/workspace-join-requests` | GET | 获取待审批列表 | owner/admin |
| `/api/workspace-join-requests` | POST | 创建申请 | 已登录用户 |
| `/api/workspace-join-requests/approve` | POST | 批准申请 | owner/admin |
| `/api/workspace-join-requests/reject` | POST | 拒绝申请 | owner/admin |
| `/api/workspace-members` | DELETE | 移除成员 | owner/admin |

### 3.2 权限验证

```typescript
async function isWorkspaceAdmin(workspaceId: string, userId: string) {
  const member = await db.collection('workspace_members')
    .where({ workspace_id: workspaceId, user_id: userId })
    .where('role', 'in', ['owner', 'admin'])
    .getOne()
  return !!member
}
```

### 3.3 业务逻辑

**批准申请**：
1. 更新申请状态为 `approved`
2. 在 `workspace_members` 表中添加成员（角色为 `member`）
3. 记录审批人和审批时间

**移除成员**：
- 不能移除 `owner` 角色的成员
- 只有 `owner` 和 `admin` 可以执行

---

## 四、文件变更清单

| 操作 | 文件路径 | 说明 |
|------|----------|------|
| 新增 | `scripts/workspace_join_requests.sql` | Supabase 迁移脚本 |
| 新增 | `app/api/workspace-join-requests/route.ts` | 获取/创建申请 API |
| 新增 | `app/api/workspace-join-requests/approve/route.ts` | 批准申请 API |
| 新增 | `app/api/workspace-join-requests/reject/route.ts` | 拒绝申请 API |
| 修改 | `app/api/workspace-members/route.ts` | 添加 DELETE 方法 |
| 修改 | `components/chat/workspace-members-panel.tsx` | 连接真实 API |

---

## 五、实施步骤

1. **数据库**：执行 SQL 迁移，创建表和约束
2. **后端 API**：实现 4 个 API 端点（双数据库支持）
3. **前端**：修改组件调用真实 API
4. **测试**：验证功能正常
