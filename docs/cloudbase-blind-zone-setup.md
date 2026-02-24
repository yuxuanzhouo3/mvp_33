# CloudBase 盲区消息集合配置指南

## 国内版 (CN) CloudBase 数据库配置

### 1. 创建集合

在腾讯云 CloudBase 控制台中创建以下集合：

#### 集合名称: `blind_zone_messages`

### 2. 字段结构

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `workspace_id` | string | 是 | 工作区ID |
| `sender_id` | string | 是 | 发送者ID（后端验证用，前端不显示） |
| `content` | string | 是 | 消息内容 |
| `type` | string | 是 | 消息类型：text, image, file |
| `metadata` | object | 否 | 额外信息（文件URL等） |
| `is_deleted` | boolean | 是 | 是否被删除 |
| `deleted_by` | string | 否 | 删除消息的管理员ID |
| `created_at` | string | 是 | 创建时间（ISO 8601格式） |
| `updated_at` | string | 是 | 更新时间（ISO 8601格式） |
| `region` | string | 是 | 区域标识，固定为 'cn' |

### 3. 索引配置

在 CloudBase 控制台创建以下索引以提高查询性能：

```json
{
  "indexes": [
    {
      "name": "workspace_created",
      "unique": false,
      "fields": [
        { "name": "workspace_id", "order": "asc" },
        { "name": "created_at", "order": "desc" }
      ]
    },
    {
      "name": "workspace_region",
      "unique": false,
      "fields": [
        { "name": "workspace_id", "order": "asc" },
        { "name": "region", "order": "asc" }
      ]
    }
  ]
}
```

### 4. 安全规则

在 CloudBase 控制台设置以下安全规则：

```json
{
  "read": "auth != null && get(`database.workspace_members.${auth.uid}_${doc.workspace_id}`) != null",
  "write": "auth != null && get(`database.workspace_members.${auth.uid}_${doc.workspace_id}`) != null",
  "create": "auth != null && auth.uid == doc.sender_id",
  "update": "auth != null && get(`database.workspace_members.${auth.uid}_${doc.workspace_id}`).role in ['owner', 'admin']"
}
```

**注意**: 以上安全规则是示意性的，实际规则需要根据你的 workspace_members 集合结构进行调整。

### 5. 初始数据示例

```json
{
  "workspace_id": "workspace_123",
  "sender_id": "user_456",
  "content": "欢迎进入盲区交流！",
  "type": "text",
  "metadata": null,
  "is_deleted": false,
  "deleted_by": null,
  "created_at": "2026-02-23T10:00:00.000Z",
  "updated_at": "2026-02-23T10:00:00.000Z",
  "region": "cn"
}
```

## 匿名性保证

为确保盲区交流的完全匿名性：

1. **前端显示**：所有消息的发送者显示为 "Anonymous/无名氏"
2. **头像生成**：使用 DiceBear 基于消息ID生成随机头像，每条消息头像不同
3. **API 响应**：API 返回消息时不包含 sender_id 字段
4. **数据库存储**：sender_id 仅用于后端权限验证，不对前端暴露

## 部署步骤

1. 登录腾讯云 CloudBase 控制台
2. 选择你的环境（国内版）
3. 进入"数据库" -> "集合管理"
4. 点击"添加集合"，输入集合名称 `blind_zone_messages`
5. 配置索引和安全规则
6. 部署完成后，前端即可使用盲区功能
