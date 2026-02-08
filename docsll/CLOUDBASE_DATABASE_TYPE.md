# CloudBase 数据库类型说明

## 问题说明

CloudBase 提供**两种不同类型的数据库**：

### 1. CloudBase 文档数据库（NoSQL，默认）
- **类型**：类似 MongoDB 的文档数据库
- **使用方式**：`cloudbaseApp.database()` → `db.collection('users')`
- **当前代码使用**：✅ 当前代码使用的是这种
- **特点**：
  - 不需要建表，直接使用集合（collections）
  - 数据以 JSON 文档形式存储
  - 不需要 SQL

### 2. CloudBase MySQL 数据库（关系型）
- **类型**：标准的 MySQL 数据库
- **使用方式**：需要通过 MySQL 客户端连接（如 `mysql2` 包）
- **当前代码使用**：❌ 当前代码**没有**使用这种
- **特点**：
  - 需要建表（你已经在 MySQL 里建了表）
  - 使用 SQL 查询
  - 需要 MySQL 连接配置

## 当前情况

**你配置了 CloudBase 环境变量，但代码使用的是文档数据库，而不是 MySQL！**

所以：
- ✅ 环境变量配置正确
- ❌ 但代码写的是文档数据库（collections），不是 MySQL（tables）
- ❌ 所以数据不会出现在你的 MySQL 表里

## 解决方案

### 方案一：使用 CloudBase 文档数据库（推荐，简单）

**优点**：
- 不需要建表，自动创建集合
- 代码已经支持
- 更简单，适合快速开发

**缺点**：
- 不是关系型数据库
- 不能使用 SQL

**操作**：
1. 不需要做任何事，代码已经配置好了
2. 数据会自动存储在 CloudBase 文档数据库中
3. 在 CloudBase 控制台 → "数据库" → "集合" 中查看数据

### 方案二：使用 CloudBase MySQL 数据库（需要修改代码）

**优点**：
- 使用标准的 MySQL，可以使用 SQL
- 你已经建好了表结构

**缺点**：
- 需要修改代码，使用 MySQL 客户端
- 需要配置 MySQL 连接信息

**操作步骤**：

#### 1. 获取 CloudBase MySQL 连接信息

在 CloudBase 控制台：
1. 进入你的环境
2. 找到 "MySQL 数据库" 或 "数据库" → "MySQL"
3. 获取连接信息：
   - 主机地址（Host）
   - 端口（Port，通常是 3306）
   - 数据库名（Database）
   - 用户名（Username）
   - 密码（Password）

#### 2. 安装 MySQL 客户端

```bash
npm install mysql2
```

#### 3. 配置环境变量

在 `.env.local` 中添加：

```env
# CloudBase MySQL 连接配置
CLOUDBASE_MYSQL_HOST=your-mysql-host
CLOUDBASE_MYSQL_PORT=3306
CLOUDBASE_MYSQL_DATABASE=your-database-name
CLOUDBASE_MYSQL_USER=your-username
CLOUDBASE_MYSQL_PASSWORD=your-password
```

#### 4. 修改代码使用 MySQL

需要修改 `lib/cloudbase/database.ts` 和 `lib/cloudbase/client.ts`，使用 MySQL 客户端而不是文档数据库。

## 如何选择？

### 如果你想要：
- ✅ **快速上线** → 使用方案一（文档数据库）
- ✅ **使用 SQL 查询** → 使用方案二（MySQL）
- ✅ **关系型数据库** → 使用方案二（MySQL）

### 如果你已经：
- ✅ 在 MySQL 里建好了表 → 使用方案二（MySQL）
- ✅ 想要最简单的方案 → 使用方案一（文档数据库）

## 检查当前使用的是哪种数据库

查看 `lib/cloudbase/database.ts`：

```typescript
// 如果看到这样的代码，说明使用的是文档数据库：
const result = await db.collection('users').get()  // ← 文档数据库

// 如果看到这样的代码，说明使用的是 MySQL：
const [rows] = await mysql.query('SELECT * FROM users')  // ← MySQL
```

**当前代码使用的是文档数据库！**

## 下一步

1. **决定使用哪种数据库**
2. **如果选择 MySQL**：告诉我，我会帮你修改代码
3. **如果选择文档数据库**：不需要做任何事，代码已经配置好了



































































