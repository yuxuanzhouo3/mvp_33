# 支付订单表设置指南

本文档说明如何设置支付订单表（orders）以支持支付功能。

## 数据库表结构

### Supabase (PostgreSQL)

运行以下SQL脚本创建orders表：

```bash
# 在Supabase SQL Editor中运行
scripts/037_create_orders_table.sql
```

或者手动执行：

```sql
-- 创建orders表
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no VARCHAR(64) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payment_method VARCHAR(20) NOT NULL,
    payment_status VARCHAR(20) DEFAULT 'pending',
    status VARCHAR(20) DEFAULT 'pending',
    region VARCHAR(10) NOT NULL,
    description TEXT,
    payment_provider_order_id VARCHAR(255),
    payment_provider_response JSONB,
    payment_data JSONB,
    callback_data JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP WITH TIME ZONE
);
```

### CloudBase (NoSQL)

运行以下脚本创建orders集合：

```bash
node scripts/038_create_orders_cloudbase.js
```

或者手动在CloudBase控制台创建`orders`集合。

## 用户表字段

确保`users`表包含以下字段（用于订阅管理）：

- `subscription_type`: VARCHAR(20) - 'free', 'monthly', 'yearly'
- `subscription_expires_at`: TIMESTAMP - 订阅过期时间
- `region`: VARCHAR(10) - 'cn' 或 'global'
- `country`: VARCHAR(10) - 国家代码（如 'CN'）

SQL脚本会自动添加这些字段（如果不存在）。

## 设置步骤

### 1. Supabase设置

1. 打开Supabase Dashboard
2. 进入SQL Editor
3. 运行 `scripts/037_create_orders_table.sql`
4. 验证表已创建：
   ```sql
   SELECT * FROM orders LIMIT 1;
   ```

### 2. CloudBase设置

1. 确保`.env.local`中配置了CloudBase环境变量：
   ```env
   CLOUDBASE_ENV_ID=your_env_id
   CLOUDBASE_SECRET_ID=your_secret_id
   CLOUDBASE_SECRET_KEY=your_secret_key
   ```

2. 运行设置脚本：
   ```bash
   cd mvp_33-main
   node scripts/038_create_orders_cloudbase.js
   ```

3. 在CloudBase控制台验证`orders`集合已创建

## 表字段说明

### orders表字段

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | UUID/BIGINT | 主键 |
| order_no | VARCHAR(64) | 订单号（唯一） |
| user_id | UUID/BIGINT | 用户ID |
| amount | DECIMAL(10,2) | 金额 |
| currency | VARCHAR(3) | 货币（USD/CNY） |
| payment_method | VARCHAR(20) | 支付方式（stripe/paypal/wechat/alipay） |
| payment_status | VARCHAR(20) | 支付状态（pending/paid/failed/cancelled） |
| status | VARCHAR(20) | 订单状态（pending/completed/failed/cancelled） |
| region | VARCHAR(10) | 区域（cn/global） |
| description | TEXT | 订单描述（如"Pro Plan - Pro Monthly"） |
| payment_provider_order_id | VARCHAR(255) | 支付提供商订单ID |
| payment_provider_response | JSONB/JSON | 支付提供商响应 |
| payment_data | JSONB/JSON | 支付数据 |
| callback_data | JSONB/JSON | 回调数据 |
| ip_address | VARCHAR(45) | IP地址 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |
| paid_at | TIMESTAMP | 支付时间 |

## 索引

SQL脚本会自动创建以下索引以提高查询性能：

- `idx_orders_order_no` - 订单号索引
- `idx_orders_user_id` - 用户ID索引
- `idx_orders_payment_status` - 支付状态索引
- `idx_orders_status` - 订单状态索引
- `idx_orders_created_at` - 创建时间索引
- `idx_orders_region` - 区域索引

## RLS策略（Supabase）

SQL脚本会自动设置Row Level Security (RLS)策略：

### 四种操作类型说明

在Supabase中，RLS策略有4种操作类型：

1. **SELECT（查询）** - 用户只能查看自己的订单
   ```sql
   CREATE POLICY "Users can view their own orders"
     ON orders FOR SELECT
     USING (auth.uid() = user_id);
   ```

2. **INSERT（插入）** - 用户只能创建自己的订单
   ```sql
   CREATE POLICY "Users can create their own orders"
     ON orders FOR INSERT
     WITH CHECK (auth.uid() = user_id);
   ```

3. **UPDATE（更新）** - 用户只能更新自己的订单
   ```sql
   CREATE POLICY "Users can update their own orders"
     ON orders FOR UPDATE
     USING (auth.uid() = user_id);
   ```

4. **ALL（全部操作）** - Service role可以管理所有订单（用于后端操作）
   ```sql
   CREATE POLICY "Service role can manage all orders"
     ON orders FOR ALL
     USING (auth.jwt() ->> 'role' = 'service_role');
   ```

### 推荐配置

**✅ 推荐：使用SQL脚本自动创建**（已包含所有4种策略）

SQL脚本会自动创建以上所有策略，你不需要手动选择。只需要运行：
```sql
-- 运行整个脚本即可
\i scripts/037_create_orders_table.sql
```

**如果手动创建**，建议选择：
- 对于普通用户：分别创建 SELECT、INSERT、UPDATE 三个策略
- 对于Service Role：创建一个 ALL 策略（包含所有操作）

### 为什么需要4种策略？

- **SELECT**: 用户需要查看自己的订单历史
- **INSERT**: 用户需要创建新订单
- **UPDATE**: 支付成功后需要更新订单状态
- **ALL (Service Role)**: 后端API需要完整权限来管理所有订单（包括支付回调等）

## CloudBase MySQL 权限设置

如果你使用的是 CloudBase MySQL，需要为 `orders` 表设置权限。

### 权限选项说明

CloudBase MySQL 提供以下4种权限选项：

1. **读取全部数据，修改本人数据**
   - 适用场景：用户评论、用户公开信息等
   - 说明：所有人都可以读取，但只能修改自己创建的数据

2. **读取和修改本人数据** ⭐ **推荐用于 orders 表**
   - 适用场景：用户个人设置、用户订单管理等
   - 说明：只能读取和修改自己创建的数据

3. **读取全部数据，不可修改数据**
   - 适用场景：商品信息等
   - 说明：所有人都可以读取，但无法修改

4. **无权限**
   - 适用场景：后台流水数据等
   - 说明：完全禁止访问

### orders 表权限配置

**推荐选择：读取和修改本人数据**

**原因：**
- ✅ 用户只能查看自己的订单（保护隐私）
- ✅ 用户只能修改自己的订单（如取消订单）
- ✅ 符合数据安全要求

**注意事项：**
- 支付回调（后端API更新订单状态）需要使用服务端API或管理员权限
- 如果后端API无法更新订单，可能需要：
  1. 使用 CloudBase 服务端 SDK（使用 Secret ID/Key）
  2. 或者临时调整权限为"读取全部数据，修改本人数据"（不推荐，安全性较低）

### 权限设置步骤

1. 在 CloudBase 控制台进入"MySQL 数据库" → "表管理"
2. 找到 `orders` 表，点击进入
3. 进入"权限设置"或"安全设置"
4. 选择"读取和修改本人数据"
5. 保存设置

## 验证

设置完成后，可以通过以下方式验证：

1. **Supabase**:
   ```sql
   -- 检查表是否存在
   SELECT table_name FROM information_schema.tables 
   WHERE table_name = 'orders';
   
   -- 检查字段
   SELECT column_name, data_type FROM information_schema.columns 
   WHERE table_name = 'orders';
   ```

2. **CloudBase**:
   - 在CloudBase控制台查看`orders`集合
   - 尝试创建一个测试订单

## 故障排除

### 问题：表已存在错误

如果表已存在，SQL脚本会跳过创建。可以手动删除后重新运行，或者直接使用现有表。

### 问题：权限错误

确保使用Service Role Key或具有足够权限的账户运行SQL脚本。

### 问题：CloudBase连接失败

检查环境变量是否正确配置，并确保CloudBase SDK已安装：
```bash
npm install @cloudbase/node-sdk
```

## 下一步

设置完成后，支付功能应该可以正常工作：

1. 用户选择套餐并支付
2. 系统创建订单记录
3. 支付成功后更新订单状态
4. 自动更新用户订阅信息

