# 开发日志 - 2025年11月22日（第三天）

## 概述
主要解决了 RLS（Row Level Security）策略问题，优化了消息发送和接收的用户体验，并添加了多个功能增强。

## 主要工作

### 1. RLS 策略修复 🔧

#### 问题背景

**核心问题**：Supabase 的 Row Level Security (RLS) 策略导致多个严重问题：

1. **INSERT 失败**：
   - `conversation_members` 表无法插入数据
   - 返回 42501 错误（违反 RLS 策略）
   - 创建对话时无法添加成员，导致对话创建失败

2. **SELECT 递归错误**：
   - 查询对话时出现 "infinite recursion detected in policy" 错误
   - RLS 策略之间相互调用，形成无限循环
   - 用户无法查看自己创建的对话和参与的对话

3. **Workspace Members 问题**：
   - `workspace_members` 表同样存在 RLS 策略问题
   - 用户选择 workspace 后无法加入，数据库表始终为空
   - 导致每次创建对话都要执行 upsert 操作，浪费约 1 秒

#### 解决方案

**1.1 修复 conversation_members INSERT 策略**

**问题**：直接插入 `conversation_members` 时，RLS 策略检查用户是否创建了对话，但检查过程本身又需要查询 `conversation_members` 表，形成递归。

**解决方案**：创建多个 SQL 脚本，逐步优化：

- **`021_fix_conversation_members_insert.sql`**（初始版本）
  - 创建 `is_conversation_creator` SECURITY DEFINER 函数
  - 函数以创建者权限运行，绕过 RLS 检查
  - 在 INSERT 策略中使用该函数，避免递归

- **`022_fix_conversation_members_insert_v2.sql`**（改进版本）
  - 确保删除所有旧策略，避免冲突
  - 添加 `SET search_path = public` 确保函数正确执行
  - 更完善的错误处理和权限授予

- **`023_create_insert_members_function.sql`**（最终方案）
  - 创建 `insert_conversation_members` 数据库函数
  - 使用 `SECURITY DEFINER` 完全绕过 RLS
  - 支持批量插入多个成员，减少网络往返
  - 在 API 中直接调用 RPC，更可靠

**优化效果**：
- 成功插入 conversation_members，对话创建功能恢复正常
- 批量插入成员，减少网络往返次数
- 避免 RLS 递归问题，性能更稳定

**代码位置**：
- `scripts/021_fix_conversation_members_insert.sql`
- `scripts/022_fix_conversation_members_insert_v2.sql`
- `scripts/023_create_insert_members_function.sql`
- `app/api/conversations/route.ts` - POST 端点（行 436-495）

**1.2 修复 conversation_members SELECT 策略**

**问题**：查询 `conversation_members` 时，RLS 策略需要检查用户是否是成员，但检查过程又需要查询 `conversation_members` 表，形成无限递归。

**解决方案**：
- **`024_fix_conversation_members_select.sql`**
  - 创建 `is_conversation_member` SECURITY DEFINER 函数
  - 函数以创建者权限运行，绕过 RLS 检查
  - 修复 `conversations` 表的 SELECT 策略，使用函数避免递归
  - 确保用户可以看到自己创建的对话和参与的对话

**优化效果**：
- 成功查询对话列表，不再出现递归错误
- 用户可以正常查看自己创建的对话和参与的对话
- 查询性能稳定，无递归开销

**代码位置**：
- `scripts/024_fix_conversation_members_select.sql`

**1.3 修复 workspace_members RLS 策略**

**问题**：
- `workspace_members` 表缺少 INSERT 策略
- 用户选择 workspace 后无法加入，数据库表始终为空
- 每次创建对话时都要执行 upsert 操作，浪费约 1 秒

**解决方案**：
- **`020_add_workspace_members_policies.sql`**
  - 创建 `is_workspace_member` SECURITY DEFINER 函数
  - 添加 SELECT 策略：用户可以查看自己所属 workspace 的成员
  - 添加 INSERT 策略：用户可以加入 workspace（将自己添加到 workspace_members）
  - 添加 UPDATE 策略：用户可以更新自己的成员信息
  - 使用 SECURITY DEFINER 函数避免递归

**优化效果**：
- 用户选择 workspace 后可以正常加入
- 避免每次创建对话时的 upsert 操作
- 节省约 1 秒的创建对话时间

**代码位置**：
- `scripts/020_add_workspace_members_policies.sql`
- `app/api/workspaces/join/route.ts`（新创建的 API 端点）
- `app/login/page.tsx` - `handleWorkspaceSelect` 函数

#### 技术要点

**SECURITY DEFINER 函数**：
- 函数以创建者权限运行，而不是调用者权限
- 完全绕过 RLS 检查，避免递归问题
- 适用于需要跨表查询的场景

**避免递归**：
- 使用函数而不是直接子查询
- 函数内部查询不受 RLS 限制
- 避免 RLS 策略之间的相互调用

**权限管理**：
- 正确授予函数执行权限给 `authenticated`、`anon` 和 `service_role`
- 确保所有用户角色都能调用必要的函数
- 使用 `GRANT EXECUTE` 明确权限范围

### 2. 消息发送和接收优化 ⚡

#### 2.1 立即更新对话列表（乐观更新）

**问题**：
- 用户发送消息后，左侧对话列表需要等待 3-4 秒 API 响应才更新
- 对话不会自动移到列表顶部
- `last_message` 和 `last_message_at` 不会立即更新
- 用户体验差，感觉应用很慢

**解决方案**：
- **乐观更新策略**：在消息发送时立即更新对话列表（<1ms），不等待 API 响应
- **立即更新 UI**：
  - 将对话移到列表顶部（最新消息的对话在最上面）
  - 更新 `last_message` 和 `last_message_at`
  - 显示最新消息内容
- **缓存同步**：同时更新 localStorage 缓存，确保刷新后数据一致
- **API 确认**：API 返回成功后，用真实数据替换乐观更新的数据（确保数据准确性）

**实现细节**：
- 创建临时消息对象（使用临时 ID）
- 立即添加到消息列表
- 立即更新对话列表状态
- 发送 API 请求
- API 返回后，用真实消息替换临时消息

**优化效果**：
- **用户体验**：从等待 3-4 秒变为立即更新（<1ms）
- **感知性能**：提升 3000+ 倍
- **交互流畅度**：用户感觉应用响应非常快

**代码位置**：`app/chat/page.tsx` - `handleSendMessage` 函数（行 1020-1100）

#### 2.2 缓存优化

**问题**：
- 空缓存时仍然跳过 API 调用，导致对话列表为空
- 用户刷新页面后看不到任何对话
- 缓存过期后不会自动重新加载

**解决方案**：
- **智能缓存检查**：
  - 检查缓存中的对话数量
  - 如果缓存为空（0 个对话），清除缓存并重新加载
  - 如果缓存过期（超过 5 分钟），清除并重新加载
  - 只有缓存有效且包含数据时才跳过 API 调用
- **缓存策略**：
  - 使用 `localStorage` 存储对话列表
  - 使用时间戳跟踪缓存有效期（5 分钟）
  - 缓存键格式：`conversations_${userId}_${workspaceId}`

**优化效果**：
- 空缓存时自动重新加载，不会显示空白列表
- 有效缓存时立即显示，提升响应速度
- 缓存过期时自动更新，保持数据新鲜

**代码位置**：`app/chat/page.tsx` - `loadConversations` 函数（行 380-450）

### 3. 功能增强 ✨

#### 3.1 职位显示功能

**需求**：
- 在聊天页面顶部显示对方的职位（Title）
- 如果没有职位，则显示状态（status）
- 让用户能够快速了解对方的职位信息

**问题**：
- 聊天头部只显示用户名和状态
- 没有显示职位信息
- 用户需要跳转到联系人页面才能看到职位

**解决方案**：
- **修改聊天头部组件**：
  - 修改 `chat-header.tsx` 中的 `getConversationDisplay` 函数
  - 优先显示 `title` 字段（职位）
  - 如果没有职位，则显示 `status` 字段（状态）
- **更新数据查询**：
  - 修改 `getUserConversations` 函数（`lib/supabase/database.ts`）
  - 在查询用户信息时包含 `title` 和 `status` 字段
  - 确保用户数据包含职位信息

**实现细节**：
- 使用 `otherUser?.title || otherUser?.status` 的优先级逻辑
- 确保向后兼容（如果没有 title，仍显示 status）

**优化效果**：
- 用户可以直接在聊天页面看到对方的职位
- 无需跳转到联系人页面
- 提升用户体验和信息可见性

**代码位置**：
- `components/chat/chat-header.tsx` - `getConversationDisplay` 函数
- `lib/supabase/database.ts` - `getUserConversations` 函数

#### 3.2 点击头像查看联系人详情

**需求**：
- 点击聊天页面顶部的头像，跳转到联系人详情页面
- 显示完整的联系人信息（Email、Username、Department、Title 等）
- 提供无缝的导航体验

**问题**：
- 聊天头部的头像和名字不可点击
- 用户需要手动导航到联系人页面
- 无法快速查看对方的详细信息

**解决方案**：
- **修改聊天头部组件**：
  - 在 `chat-header.tsx` 中，将头像和名字区域包装为可点击的按钮
  - 添加 `onClick` 事件处理函数
  - 添加 hover 效果，提示用户可以点击
- **实现导航逻辑**：
  - 点击后跳转到 `/contacts?userId=xxx`
  - 使用 Next.js 的 `useRouter` 进行导航
- **修改联系人页面**：
  - 修改 `contacts/page.tsx`，从 URL 参数读取 `userId`
  - 将 `userId` 传递给 `ContactsPanel` 组件
- **修改联系人面板**：
  - 修改 `contacts-panel.tsx`，支持 `initialUserId` prop
  - 使用 `useEffect` 自动选中并显示该用户
  - 确保用户详情面板自动展开

**实现细节**：
- 只在直接消息（direct message）时启用点击功能
- 群组消息不显示点击功能
- 使用 `cursor-pointer` 和 hover 效果提供视觉反馈

**优化效果**：
- 用户可以快速从聊天页面跳转到联系人详情
- 自动选中目标用户，无需手动查找
- 无缝的导航体验，提升用户效率

**代码位置**：
- `components/chat/chat-header.tsx` - `handleAvatarClick` 函数和头像按钮
- `app/contacts/page.tsx` - URL 参数读取和传递
- `components/contacts/contacts-panel.tsx` - `initialUserId` prop 和处理逻辑

### 4. 数据库查询优化（减少网络往返）🚀

#### 4.1 使用数据库函数减少查询次数

**问题**：创建直接消息时，需要多次查询：
1. 查询当前用户的 conversations
2. 查询另一个用户的 conversations
3. 查询 members
4. 查询 conversations 详情
**总计**：4 次网络往返，约 3.9 秒

**解决方案**：
- 创建 `find_direct_conversation` 数据库函数（`scripts/019_find_direct_conversation_function.sql`）
- 所有逻辑在数据库端完成，只需 1 次 RPC 调用
- 使用 `SECURITY DEFINER` 绕过 RLS，避免递归问题

**优化效果**：
- 查询次数：从 4 次减少到 1 次
- 网络往返：从 4 次减少到 1 次
- 预计时间：从 3.9 秒降到 1-1.5 秒

**代码位置**：
- `app/api/conversations/route.ts` - POST 端点（行 349-391）
- `scripts/019_find_direct_conversation_function.sql`

#### 4.2 并行查询优化

**问题**：串行查询 contacts 和 workspace 导致总时间累加

**解决方案**：
- 使用 `Promise.all` 并行执行 contacts 和 workspace 查询
- 同时检查双向联系人关系（user → contact 和 contact → user）

**优化效果**：
- 总时间：从串行累加变为并行最大值
- 预计节省：约 200-400ms

**代码位置**：`app/api/conversations/route.ts` - POST 端点（行 213-236）

#### 4.3 Workspace 查询优化

**问题**：
- Workspace 不存在时，先尝试创建（失败），再查询现有 workspace
- 浪费约 800ms 在失败的创建尝试上

**解决方案**：
- 如果 `workspace_members` 查询返回空，先查询 workspace 是否存在
- 避免失败的创建尝试
- 只在 workspace 不存在时才创建

**优化效果**：
- 节省时间：约 800ms（避免失败的创建尝试）

**代码位置**：`app/api/conversations/route.ts` - POST 端点（行 269-345）

#### 4.4 成员检查优化

**问题**：每次创建对话时都执行 upsert workspace_member，即使用户已是成员

**解决方案**：
- 在 upsert 前先检查用户是否已是成员
- 如果已是成员，跳过 upsert 操作

**优化效果**：
- 如果用户已是成员：节省约 1 秒（跳过 upsert）
- 如果用户不是成员：正常执行 upsert

**代码位置**：`app/api/conversations/route.ts` - POST 端点（行 284-308）

#### 4.5 使用 RPC 插入成员

**问题**：直接插入 conversation_members 可能遇到 RLS 策略问题

**解决方案**：
- 使用 `insert_conversation_members` 数据库函数（`scripts/023_create_insert_members_function.sql`）
- 使用 `SECURITY DEFINER` 绕过 RLS
- 支持批量插入多个成员

**代码位置**：
- `app/api/conversations/route.ts` - POST 端点（行 436-495）
- `scripts/023_create_insert_members_function.sql`

### 5. 请求去重机制（类似分布式锁）🔒

#### 5.1 对话列表请求去重

**问题**：多个地方同时调用 `loadConversations`，导致重复请求

**解决方案**：
- 使用 `pendingConversationsListRef` 存储正在进行的请求 Promise
- 如果已有请求进行中，等待现有请求完成
- 使用 `sessionStorage` 跟踪初始加载状态，防止组件重新挂载时重复加载

**代码位置**：`app/chat/page.tsx` - `loadConversations` 函数

#### 5.2 单个对话请求去重

**问题**：多个地方同时调用 `loadSingleConversation`，导致重复请求

**解决方案**：
- 使用 `pendingConversationRequestsRef`（Map）存储每个对话的请求 Promise
- 使用原子检查-设置模式（atomic check-and-set）防止竞态条件
- 在发起 fetch 前立即设置锁，避免并发调用同时通过检查
- 所有调用点使用 `get()` 检查 pending request，如果存在则等待

**优化效果**：
- 单个对话只加载一次，即使多个地方同时调用
- 并发调用会等待同一个请求，而不是发送多个请求

**代码位置**：`app/chat/page.tsx` - `loadSingleConversation` 函数

### 6. 缓存机制优化 💾

#### 6.1 对话列表缓存

**问题**：每次刷新页面都要重新加载对话列表（2-3 秒）

**解决方案**：
- 使用 `localStorage` 缓存对话列表（5 分钟有效期）
- 首次加载时立即显示缓存数据（< 100ms）
- 后台静默更新，完成后自动刷新 UI
- 如果缓存为空，清除缓存并重新加载

**优化效果**：
- 首次登录：仍需加载（约 2-3 秒），但会缓存
- 再次登录（5 分钟内）：立即显示缓存数据（< 100ms），后台更新

**代码位置**：`app/chat/page.tsx` - `loadConversations` 函数

### 7. 对话创建后立即更新状态 ✨

**问题**：创建新对话后，对话列表不更新，需要手动刷新

**解决方案**：
- 在 `handleCreateDirect` 函数中，创建成功后立即更新 `conversations` 状态
- 将新对话添加到列表顶部
- 同时更新 localStorage 缓存
- 确保新对话立即显示在列表中

**代码位置**：`app/chat/page.tsx` - `handleCreateDirect` 函数

### 8. 消息加载状态显示 🔄

**问题**：
- 从 contacts 页面点击 message 后，消息加载时没有 loading 提示
- 左侧对话列表先显示，右侧消息列表后显示，用户体验不佳

**解决方案**：
- 添加 `isLoadingMessages` 状态来跟踪消息加载
- 在 `MessageList` 组件中显示 loading 状态（当 `isLoading && messages.length === 0` 时）
- 切换对话时立即清空消息并显示 loading
- 从 URL 选择对话时也清空消息并显示 loading

**代码位置**：
- `app/chat/page.tsx` - `isLoadingMessages` 状态和 `loadMessages` 函数
- `components/chat/message-list.tsx` - loading UI 显示

## 性能优化总结

### 消息发送优化
- **之前**：发送消息 → 等待 API（3-4秒）→ 更新列表
- **现在**：发送消息 → 立即更新列表（<1ms）→ API 后台确认
- **提升**：感知性能提升 3000+ 倍

### 对话列表加载优化
- **缓存策略**：5 分钟缓存，减少 API 调用
- **空缓存处理**：自动检测并重新加载
- **乐观更新**：立即显示，后台同步
- **请求去重**：使用 ref 和 Map 防止重复请求

### 数据库查询优化（核心优化）

#### 减少查询次数
- **之前**：创建直接消息需要 4 次查询（用户1的对话、用户2的对话、成员、详情）
- **现在**：使用 `find_direct_conversation` 数据库函数，只需 1 次 RPC 调用
- **效果**：查询次数从 4 次减少到 1 次，时间从 3.9 秒降到 1-1.5 秒

#### 减少网络往返
- **RPC 调用**：使用数据库函数将所有逻辑在数据库端完成，减少网络往返
- **并行查询**：使用 `Promise.all` 并行执行独立查询（contacts + workspace）
- **批量操作**：使用 `insert_conversation_members` 函数批量插入成员

#### 避免不必要的操作
- **Workspace 查询**：先检查是否存在，避免失败的创建尝试（节省 800ms）
- **成员检查**：在 upsert 前先检查是否已是成员，避免不必要的 upsert（节省 1 秒）

### 请求去重机制（类似分布式锁）
- **对话列表**：使用 `pendingConversationsListRef` 防止重复请求
- **单个对话**：使用 `pendingConversationRequestsRef`（Map）存储每个对话的请求 Promise
- **原子操作**：使用原子检查-设置模式防止竞态条件
- **效果**：确保每个资源只请求一次，即使多个地方同时调用

## 创建的 SQL 脚本

### 数据库查询优化脚本

1. **`019_find_direct_conversation_function.sql`** 
   - **用途**：数据库查询优化（非 RLS 修复）
   - **功能**：创建 `find_direct_conversation` 数据库函数
   - **效果**：将创建直接消息时的 4 次查询减少到 1 次 RPC 调用
   - **位置**：详见"4.1 使用数据库函数减少查询次数"

### RLS 策略修复脚本

2. **`020_add_workspace_members_policies.sql`**
   - **用途**：修复 workspace_members 表的 RLS 策略
   - **功能**：添加 SELECT、INSERT、UPDATE 策略，允许用户加入 workspace
   - **位置**：详见"1.3 修复 workspace_members RLS 策略"

3. **`021_fix_conversation_members_insert.sql`**
   - **用途**：修复 conversation_members 表的 INSERT 策略（初始版本）
   - **功能**：创建 `is_conversation_creator` SECURITY DEFINER 函数
   - **位置**：详见"1.1 修复 conversation_members INSERT 策略"

4. **`022_fix_conversation_members_insert_v2.sql`**
   - **用途**：修复 conversation_members 表的 INSERT 策略（改进版本）
   - **功能**：改进版本，确保删除所有旧策略，添加 `SET search_path`
   - **位置**：详见"1.1 修复 conversation_members INSERT 策略"

5. **`023_create_insert_members_function.sql`**
   - **用途**：修复 conversation_members 表的 INSERT 策略（最终方案）
   - **功能**：创建 `insert_conversation_members` 数据库函数，支持批量插入
   - **位置**：详见"1.1 修复 conversation_members INSERT 策略"和"4.5 使用 RPC 插入成员"

6. **`024_fix_conversation_members_select.sql`**
   - **用途**：修复 conversation_members 表的 SELECT 策略
   - **功能**：创建 `is_conversation_member` SECURITY DEFINER 函数，避免递归
   - **位置**：详见"1.2 修复 conversation_members SELECT 策略"

## 修复的 Bug

1. ✅ `conversation_members` 表无法插入数据（RLS 策略问题）
2. ✅ 查询对话时出现无限递归错误
3. ✅ 发送消息后对话列表延迟更新
4. ✅ 空缓存时对话列表为空
5. ✅ 创建对话后列表不更新
6. ✅ 聊天头部不显示职位信息
7. ✅ 无法从聊天页面跳转到联系人详情

## 代码统计

- **修改文件数**：约 15 个
- **新增 SQL 脚本**：6 个
- **新增功能**：2 个（职位显示、头像跳转）
- **性能优化**：8 处
  - 数据库函数优化（减少查询次数）
  - 并行查询优化
  - Workspace 查询优化
  - 成员检查优化
  - RPC 调用优化
  - 请求去重机制
  - 缓存机制
  - 乐观更新

## 技术亮点

1. **数据库函数优化**：使用 `find_direct_conversation` 将 4 次查询减少到 1 次，大幅减少网络往返
2. **SECURITY DEFINER 函数**：巧妙解决 RLS 递归问题，允许批量操作
3. **请求去重机制（类似分布式锁）**：使用 ref 和 Map 实现原子检查-设置模式，防止重复请求
4. **并行查询优化**：使用 `Promise.all` 并行执行独立查询，减少总等待时间
5. **智能缓存管理**：localStorage + sessionStorage，平衡性能和数据新鲜度
6. **乐观更新策略**：消息发送后立即更新 UI，大幅提升用户体验
7. **避免不必要操作**：先检查再操作，避免失败的创建尝试和不必要的 upsert
8. **无缝导航**：聊天页面到联系人页面的流畅跳转

## 下一步计划

- 继续优化消息加载性能
- 添加消息实时同步（WebSocket/Server-Sent Events）
- 优化大列表渲染性能
- 添加更多用户交互功能


