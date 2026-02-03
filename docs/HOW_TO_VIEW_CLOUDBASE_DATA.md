# 如何查看 CloudBase 文档数据库中的数据

## 问题：为什么看不到数据？

如果你在 CloudBase 文档数据库中看不到数据，可能的原因有：

1. **集合还没有创建** - CloudBase 需要先创建集合才能存储数据
2. **数据写入失败** - 注册时可能出错了，但没有显示错误
3. **查看位置不对** - 需要在正确的位置查看数据
4. **环境变量未配置** - CloudBase 连接配置有问题

## 步骤 1：检查环境变量配置

首先确认环境变量已正确配置：

1. 检查项目根目录是否有 `.env.local` 文件
2. 确认文件中包含以下变量：
   ```env
   CLOUDBASE_ENV_ID=你的环境ID
   CLOUDBASE_SECRET_ID=你的Secret ID
   CLOUDBASE_SECRET_KEY=你的Secret Key
   ```

## 步骤 2：运行诊断脚本

运行诊断脚本检查 CloudBase 连接和数据：

```bash
node scripts/test-cloudbase-data.js
```

这个脚本会：
- ✅ 检查环境变量配置
- ✅ 测试 CloudBase 连接
- ✅ 检查 users 集合是否存在
- ✅ 查询所有用户数据
- ✅ 测试写入数据

## 步骤 3：在 CloudBase 控制台查看数据

### 方法一：通过集合管理查看

1. **登录 CloudBase 控制台**
   - 访问：https://console.cloud.tencent.com/tcb
   - 使用你的腾讯云账号登录

2. **选择环境**
   - 在左侧菜单找到"环境"或"云开发"
   - 选择你的环境（环境ID应该和 `CLOUDBASE_ENV_ID` 一致）

3. **进入数据库**
   - 在左侧菜单点击"数据库"
   - 选择"云数据库"（不是MySQL数据库）

4. **查看集合**
   - 点击"集合管理"
   - 找到 `users` 集合
   - 如果看不到 `users` 集合，说明集合还没有创建

5. **查看数据**
   - 点击 `users` 集合
   - 在"数据管理"标签页查看数据
   - 如果集合是空的，会显示"暂无数据"

### 方法二：通过数据管理查看

1. 在 CloudBase 控制台 → 数据库 → 数据管理
2. 选择 `users` 集合
3. 查看所有文档

## 步骤 4：如果集合不存在，创建集合

如果 `users` 集合不存在，需要先创建：

### 方法一：在控制台手动创建（推荐）

1. 进入 CloudBase 控制台 → 数据库 → 集合管理
2. 点击"新建集合"
3. 输入集合名称：`users`
4. 点击"确定"
5. 集合创建后，重新尝试注册用户

### 方法二：运行初始化脚本

```bash
node scripts/cloudbase_setup.js
```

这个脚本会自动创建所有需要的集合。

## 步骤 5：检查注册日志

如果集合存在但没有数据，检查注册时的日志：

1. **查看服务器日志**
   - 在终端/控制台查看运行 `npm run dev` 时的输出
   - 查找以 `[REGISTER]` 或 `[CloudBase]` 开头的日志

2. **检查关键日志**
   - `[REGISTER] IP detection:` - 确认IP检测是否正确
   - `[REGISTER] User created in CloudBase:` - 确认用户是否创建成功
   - `[CloudBase] User created successfully:` - 确认数据是否写入成功

3. **常见错误**
   - `CloudBase not configured` - 环境变量未配置
   - `Collection not exist` - 集合不存在
   - `Permission denied` - 权限不足

## 步骤 6：验证数据写入

### 测试注册流程

1. 使用**中国IP**注册一个新账号
2. 观察服务器日志，确认：
   - IP检测为 `region: 'cn'`
   - 显示 `[REGISTER] User created in CloudBase`
   - 没有错误信息

3. 运行诊断脚本验证：
   ```bash
   node scripts/test-cloudbase-data.js
   ```

## 常见问题

### Q1: 为什么注册后看不到数据？

**可能原因：**
- 注册时IP检测为国际IP，数据写入了 Supabase（不是 CloudBase）
- 集合不存在，数据写入失败
- 环境变量配置错误

**解决方案：**
1. 检查注册日志，确认 `region` 是否为 `'cn'`
2. 确认 `users` 集合已创建
3. 检查环境变量配置

### Q2: 如何确认数据写入了哪个数据库？

**检查方法：**
1. 查看注册日志中的 `[REGISTER] IP detection:` 日志
2. 如果 `region: 'cn'`，数据应该写入 CloudBase
3. 如果 `region: 'global'`，数据写入 Supabase

### Q3: 集合存在但没有数据？

**可能原因：**
- 注册时出错了，但没有抛出错误
- 数据写入了其他环境
- 权限问题导致写入失败

**解决方案：**
1. 运行诊断脚本测试写入
2. 检查服务器日志中的错误信息
3. 确认 Secret ID/Key 有写入权限

## 下一步

如果按照以上步骤仍然看不到数据，请：

1. 运行诊断脚本并分享输出结果
2. 分享注册时的服务器日志
3. 确认 CloudBase 控制台中 `users` 集合是否存在



































































