# 用户Region字段迁移指南

## 概述

系统现在支持基于用户注册时的IP地址来区分国内和国外用户。为了确保系统能正确识别用户的region，建议为所有现有用户设置`region`字段。

## 当前逻辑

即使没有`region`字段，系统也能通过"在哪个数据库找到用户"来判断：
- **在Supabase找到用户** → 默认 `region='global'`（国外用户）
- **在CloudBase找到用户** → 默认 `region='cn'`（国内用户）

但是，**强烈建议显式标记`region`字段**，原因：
1. 更可靠：明确标识用户的注册地区
2. 更清晰：代码逻辑更简单，不需要依赖数据库位置
3. 更安全：如果将来数据迁移，region字段能明确标识

## 迁移步骤

### 1. Supabase用户（国外用户）

运行SQL脚本为所有Supabase用户设置`region='global'`：

```bash
# 在Supabase SQL Editor中运行
scripts/039_update_users_region.sql
```

或者直接在Supabase Dashboard的SQL Editor中执行：

```sql
UPDATE users
SET region = 'global'
WHERE region IS NULL OR region NOT IN ('cn', 'global');
```

### 2. CloudBase用户（国内用户）

运行Node.js脚本为所有CloudBase用户设置`region='cn'`：

```bash
node scripts/040_update_cloudbase_users_region.js
```

## 验证

### Supabase验证

```sql
SELECT 
  COUNT(*) as total_users,
  COUNT(CASE WHEN region = 'global' THEN 1 END) as global_users,
  COUNT(CASE WHEN region = 'cn' THEN 1 END) as cn_users,
  COUNT(CASE WHEN region IS NULL THEN 1 END) as null_region_users
FROM users;
```

所有Supabase用户应该显示`region='global'`。

### CloudBase验证

脚本运行后会显示更新统计信息。所有CloudBase用户应该显示`region='cn'`。

## 新用户注册

新用户注册时会自动设置`region`字段：
- 国内IP注册 → `region='cn'`，存储在CloudBase
- 国外IP注册 → `region='global'`，存储在Supabase

## 注意事项

1. **数据一致性**：确保每个用户只在对应的数据库中存在
2. **备份**：运行迁移脚本前，建议先备份数据库
3. **测试**：在生产环境运行前，先在测试环境验证

## 故障排查

如果登录时出现region不匹配的错误：

1. 检查用户的`region`字段是否正确设置
2. 检查用户是否在正确的数据库中
3. 查看登录日志中的region信息




































































