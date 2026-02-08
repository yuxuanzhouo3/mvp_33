
## 开发日志 - 2025年11月26日

## 一、概述

本日围绕「对话删除、未读提醒、文件消息、自聊、联系人页」五条核心链路进行了梳理和改造，目标是：

- 对话删除行为明确为**本端软删**：删除只影响当前用户的对话列表和视图，不影响对方的历史记录。  
- 未读提醒从“仅实时 + 状态不稳定”升级为“实时 + 历史 + 刷新后不反弹”的完整方案。  
- 文件/代码消息在发送与下载路径上增强交互：发送后立即可见，并清晰区分“预览”和“下载”。  
- 自聊（自己与自己）在模型、入口、展示与轮询行为上与普通直聊保持一致。  
- 联系人页补齐“当前用户也是联系人”的能力，并对 `/api/contacts` 的网络波动进行降噪处理。

以下按“问题背景 → 目标 → 技术方案 → 效果”的结构记录本日主要工作。

---

## 二、对话删除：本端软删，保持对方视角不变

### 2.1 问题背景

早期实现中，对话删除采用的是“软删当前用户 membership”的方案：  
- 当前用户删除会话时，只更新其在 `conversation_members` 表中的 `deleted_at`。  
- `conversations` 记录及其他成员的 `conversation_members` 不受影响。  
- 当前用户若再次从联系人发起直聊，如果后端复用了原有会话，就可能重新拉出历史消息，使人误以为“删除未生效”。

在你多轮实际测试后，可以确认：你期望的行为是类似微信的“清空本端聊天记录”——**只影响当前用户这一侧，对方视角不变**。

### 2.2 目标

- 删除某个会话时：  
  - 仅对当前登录用户生效（软删当前用户的 membership）；  
  - 不改动 `conversations` 记录及其他成员的 membership。  
- 再次从联系人发起与同一对象的对话时，当前用户以“新的本端视角”进入该关系，历史消息是否再次可见由后续查询策略决定。

### 2.3 技术方案

#### 2.3.1 API 层：显式实现 per-user 软删

- 文件：`app/api/conversations/[conversationId]/route.ts`。  
- `PATCH /api/conversations/[conversationId]` 中，`action === 'delete'` 的实现：  
  - 先验证当前用户确为该会话成员；  
  - 仅对当前用户在 `conversation_members` 表中的记录执行软删更新（`deleted_at = now()`）；  
  - 给单会话查询接口（`GET /api/conversations?workspaceId=...&conversationId=...`）增加约束：  
    - 校验 membership 时要求 `deleted_at IS NULL`，即**已经被当前用户软删的会话不再允许通过单会话接口被“复活”**。  
  - 完全移除对“整会话软删” RPC（原 `soft_delete_conversation`）的依赖，所有删除语义都统一为 per-user 软删。

#### 2.3.2 前端：本机删除持久化与列表过滤

- 文件：`app/chat/page.tsx`。  
- 删除入口 `handleDeleteConversation`：  
  - 后端返回成功后，先从内存状态 `setConversations` 中移除该会话，并同步更新本地 `conversations_{user}_{workspace}` 缓存；  
  - 额外维护一个 per-user 的本地删除清单：  
    - key：`deleted_conversations_${currentUser.id}_${currentWorkspace.id}`；  
    - 删除成功后将会话 `id` 追加进该数组并写入 `localStorage`；  
    - 这样即使缓存中仍残留旧会话数据，也会在渲染前被本地删除清单过滤掉。  
- 会话加载逻辑统一尊重本地删除清单：  
  - 从缓存加载时：对 `cachedConversations` 按 `!deletedConversations.includes(c.id)` 过滤后再展示；  
  - 从 `/api/conversations` 加载时：同样在前端按删除清单过滤；  
  - 同时移除之前那段“若 API 仍返回某个已在删除清单里的会话，则自动认为本地误删并从删除清单中移除”的修正逻辑，避免会话在本机被“自动复活”。  
- 单会话懒加载（从 URL 携带 `conversation=...` 时）现在也受到后端 `deleted_at IS NULL` 限制：  
  - 对于已被当前用户软删的会话，后端将返回 404，前端不会再把它重新塞入列表。

#### 2.3.3 SQL 层：移除整会话软删脚本

- 删除脚本：`scripts/030_soft_delete_conversation.sql`。  
- 该脚本原先用于“整会话软删（所有成员一起标记 deleted_at）”，与当前期望的本端删除行为不符，因此从代码库中移除，避免后续误用。

### 2.4 效果

- 当前用户侧：  
  - 删除会话后，该对话不会再出现在本端左侧列表和右侧消息面板中；  
  - 即便后台刷新会话列表或重新打开 `/chat`，也不会因为缓存或单会话懒加载而“又弹出来”；  
  - 后续从联系人再次发起对话时，本端视角从删除之后开始累积新消息。  
- 对方侧：  
  - 不受本端删除操作影响，仍可查看既有会话卡片和完整历史记录。  

整体行为与微信“删除聊天只影响本端”的体验保持一致，并通过“后端 membership 软删 + 本地删除清单 + 单会话 404”三重约束，消除了“删完会话又自己冒出来”的问题。

---

## 三、未读提醒：实时 + 历史 + 刷新后不反弹

### 3.1 问题背景

在本次优化前，未读提醒存在以下问题：

- 只在页面已打开且订阅 Realtime 的情况下对新消息递增 `unread_count`，属于“在线实时未读”。  
- 对于“先发后开”的场景（你后来才进入 `/chat`），没有根据 `last_read_at` 计算历史未读，刷新后所有会话 `unread_count` 通常为 0。  
- 在你开始使用红点后，又出现两类体验问题：  
  - 点进会话后红点消失，但刷新后又重新出现；  
  - 点击某会话时红点会短暂闪烁：“消失 → 再出现 → 最终消失”。

### 3.2 目标

- 支持完整的历史未读计算：即使页面是“事后打开”，也能看到准确的未读数。  
- 点击会话后：  
  - 红点立即清零；  
  - 刷新页面后不再反弹；  
  - 不再出现红点闪烁现象。

### 3.3 技术方案

#### 3.3.1 SQL：基于 `last_read_at` 计算未读数

- 新增脚本：`scripts/031_get_unread_counts.sql`。  
- 函数：`get_unread_counts(p_user_id)` → `(conversation_id, unread_count)`。  
- 计算规则：  
  - 仅统计 `m.created_at > COALESCE(cm.last_read_at, '1970-01-01')` 的消息；  
  - 排除当前用户自己发送的消息（`m.sender_id <> p_user_id`）；  
  - 仅统计当前用户 membership 未被软删的会话（`cm.deleted_at IS NULL`）。

#### 3.3.2 后端：在会话查询中接入未读数

- 文件：`lib/supabase/database.ts`，函数 `getUserConversations`。  
- 处理流程：  
  - 先查询当前用户在 `conversation_members` 中的所有 `conversation_id`；  
  - 然后调用 `supabase.rpc('get_unread_counts', { p_user_id: userId })`，构建 `unreadMap`；  
  - 对每条会话构造 `ConversationWithDetails` 时：  
    - `unread_count = unreadMap.get(conv.id) ?? 0`；  
    - 从 `messages` 表按 `created_at DESC` 查询最后一条消息，统一设置：  
      - `last_message`（侧边预览文本）；  
      - `last_message_at = lastMessage.created_at || conv.last_message_at || conv.created_at`（排序依据）。

#### 3.3.3 SQL：用数据库时间标记会话已读

- 新增脚本：`scripts/032_mark_conversation_read.sql`。  
- 函数：`mark_conversation_read(p_conversation_id, p_user_id)`：  
  - 校验用户是否为该会话成员；  
  - 使用数据库服务器时间 `NOW()` 更新 `conversation_members.last_read_at`。  
- 避免使用前端 `new Date().toISOString()` 带来的时钟偏差。

#### 3.3.4 API：`PATCH /api/conversations/[conversationId]?action=read`

- 文件：`app/api/conversations/[conversationId]/route.ts`。  
- 当 `action === 'read'` 时：  
  - 优先调用 `mark_conversation_read` RPC；  
  - 如果 RPC 不可用，则回退到直接更新 `last_read_at` 的兼容逻辑。  

#### 3.3.5 前端：本地清零、缓存同步与红点防反弹

- 文件：`app/chat/page.tsx`。  
- 点击会话（`onSelectConversation`）时：  
  - 立即将该会话的 `unread_count` 在内存状态中置 0；  
  - 同步写回 `localStorage` 中的对话列表缓存，确保刷新后读取的是“已读之后”的状态；  
  - 使用 `forceReadConversationsRef: Set<string>` 记录本次前端会话中已被用户打开的会话 ID。  
- 后台刷新对话列表时（`loadConversations`）：  
  - 合并 API 返回数据时，如果某个会话 ID 已存在于 `forceReadConversationsRef`，无论后端返回的 `unread_count` 如何，都强制将其重置为 0，防止旧数据覆盖本端“已读”状态。  
- 在上述操作的同时，异步调用 `PATCH /api/conversations/[id]`，`{ action: 'read' }` 同步更新数据库的 `last_read_at`，但不阻塞 UI。

### 3.4 效果

- 历史未读：即使是“先发后开” `/chat` 的场景，只要 `last_read_at` 正确，左侧会话列表也能给出合理的未读数与红点。  
- 点击即清零：点击某会话后，红点立即消失，并且刷新页面后不会再反弹；红点闪烁问题也被消除。

---

## 四、文件与代码消息：即时显示与下载语义增强

### 4.1 问题背景

在文件/代码消息方面，你反馈了两个具体问题：  
- 发送 `.py` 文件时，消息在上传完成前列表底部一段时间是空白的，看起来像“没有发出去”；  
- 点击“下载”时，部分浏览器会直接打开预览页（尤其是 `.py` 被当作文本预览），而不是触发真正的下载。

本质上，前者是“发送动作与 UI 反馈之间的时间差”，后者是浏览器对 `<a download>` 的行为差异导致的语义混淆。

### 4.2 目标

- 发送任意类型的消息（文字、图片、文件、代码）后，消息列表中应**立即出现一条气泡**，即使文件仍在上传，也要给出明确的“上传中”提示。  
- 对每条文件消息：  
  - 明确区分“在浏览器内预览”和“作为附件下载”；  
  - 下载操作应稳定触发浏览器下载流程，而不是进入预览页。

### 4.3 技术方案

#### 4.3.1 乐观消息：发送后立即显示

- 文件：`app/chat/page.tsx`，函数 `handleSendMessage`。  
- 实现要点：  
  - 在调用后端 API 前，构造一个带 `tempId` 的“乐观消息”对象，并立即 `setMessages` 将其插入列表；  
  - 若包含文件：  
    - 使用 `URL.createObjectURL(file)` 为本地文件生成预览 URL，写入 `metadata.file_url`；  
    - 为该消息标记 `is_sending: true`，在 UI 上显示“Uploading…”状态；  
  - 后端 `/api/messages` 返回真实消息后：  
    - 根据 `tempId` 定位乐观消息，用真实消息替换，`is_sending` 置为 `false`，消息位置保持不变。

#### 4.3.2 文件消息：区分预览和下载

- 文件：`components/chat/message-list.tsx`。  
- 对 `type === 'file' | 'video'` 且具备 `metadata.file_url` 的消息：  
  - 中间区域展示文件名、大小等基本信息；  
  - 右侧提供两个按钮：  
    - 预览：  
      - 使用 `<a href={file_url} target="_blank" rel="noopener noreferrer">` 在新标签页打开；  
      - `.py` 等文件在浏览器中以文本/源码形式展示。  
    - 下载：  
      - 使用 `fetch(file_url)` 获取 `blob`；  
      - 通过 `URL.createObjectURL` 生成临时 URL，并构造隐藏的 `<a download>` 节点触发浏览器下载；  
      - 下载完成后释放临时 URL，避免内存泄漏。

### 4.4 效果

- 从用户视角：  
  - 任何类型的消息（尤其是较大的文件）发送后，列表中都会立即出现对应的消息气泡，并有清晰的“上传中”状态提示；  
  - 不会再出现“刚点发送，底部一片空白”的体验。  
- 对文件消息：  
  - 用户可通过“预览”快速在浏览器中查看内容；  
  - 通过“下载”获得一个稳定可用的本地文件（你已用 VS Code 验证 `.py` 文件内容无误）。

---

## 五、自聊体验：模型与交互与普通直聊保持一致

### 5.1 问题背景

围绕“自己与自己聊天”的场景，初始实现存在以下问题：  
- 从联系人点击自己时，偶发地跳转到了与他人的对话或无法正确创建自聊会话；  
- 左侧会话有时显示 `Unknown User`；  
- 右侧聊天区头像与名字对齐不自然，自身消息一侧缺少完整用户信息；  
- 自聊会话发过消息后，列表排序仍靠后；  
- 停留在自聊会话时，右侧不定期出现 “Loading messages…”。

### 5.2 目标

- 从联系人点击当前用户时：  
  - 若不存在自聊会话，则创建一个仅包含当前用户的 direct 会话；  
  - 若已存在自聊会话，则复用该会话，不再误跳到其他对话。  
- 左侧与右侧展示：  
  - 自聊会话使用当前用户的头像、姓名及职位/状态信息；  
  - 消息两端布局规范，头像与姓名对齐自然。  
- 排序与 Loading 行为与普通直聊一致，不出现异常的重复加载。

### 5.3 技术方案

#### 5.3.1 后端：自聊模型支持

- 文件：`scripts/019_find_direct_conversation_function.sql`。  
- 对于 `p_user1_id = p_user2_id` 的情况：  
  - 允许 `COUNT(members) = 1`，即仅当前用户一个成员的 direct 会话；  
  - 过滤 `conversations.deleted_at IS NOT NULL` 和 `conversation_members.deleted_at IS NOT NULL`，确保自聊会话也遵循统一的软删规则。

#### 5.3.2 前端：从联系人发起自聊

- 文件：`app/contacts/page.tsx`，函数 `handleStartChat`。  
- 当 `userId === currentUser.id` 时：  
  - 优先在本地缓存 `conversations_{user}_{workspace}` 中查找“类型为 direct 且仅一个成员为当前用户”的会话；  
  - 若找到，则直接导航到 `/chat?conversation=xxx`；  
  - 若未找到，则调用 `POST /api/conversations` 创建 `member_ids = [currentUser.id]` 的会话，并更新缓存后跳转。  
- 当 `userId !== currentUser.id` 时，沿用原有“两人直聊”的查找与创建逻辑。

#### 5.3.3 展示逻辑：统一头像和姓名

- 文件：`components/chat/sidebar.tsx` 与 `components/chat/chat-header.tsx`。  
- 对于直聊会话：  
  - 首先尝试以 `members.find(m => m.id !== currentUser.id)` 识别“对方”；  
  - 若找不到（自聊），则使用 `currentUser` 作为展示对象。  
- 文件：`components/chat/message-list.tsx`。  
  - 使用 `flex items-start` 调整消息布局，使头像和姓名在纵向上对齐；  
  - 自己发送的消息在右侧同样显示自己的头像和姓名，视觉上与对方消息对称。

#### 5.3.4 排序与 Loading 行为

- 排序：  
  - `getUserConversations` 为每条会话设置统一的 `last_message_at`；  
  - 侧边栏按“置顶优先 + 最新消息时间优先”排序，因此自聊会话在有新消息时能排到顶部。  
- Loading：  
  - 第一阶段减少不必要的 `/api/messages` 重拉，将自聊从“无最后消息”的特殊 case 中剥离；  
  - 最终版本中：轮询不再调用会切换 `isLoadingMessages` 的 `loadMessages`，而是在后台静默 `fetch('/api/messages?conversationId=...')` 并 `setMessages`，从而在停留于某个会话时右侧不会周期性出现“Loading messages…”。

### 5.4 效果

- 自聊会话的创建、进入、排序和展示均与普通直聊保持一致：  
  - 从联系人点击当前用户，可稳定进入自聊会话；  
  - 左侧与右侧都使用当前用户的头像和姓名及职位/状态信息；  
  - 自聊发过消息后会自然排在顶部；  
  - 停留在自聊界面时，不会反复看到“Loading messages…”提示。

---

## 六、联系人页：补齐当前用户与网络错误降噪

### 6.1 当前用户也作为联系人

**问题背景**  
- 初始实现中，联系人列表仅展示其他用户，当前用户被过滤掉；  
- 这使得从联系人页发起自聊的路径不够直观，也与常见 IM 产品中“自己也是一个可选聊天对象”的习惯不符。

**技术方案与效果**  
- 文件：`app/contacts/page.tsx`。  
  - 在 `loadContacts` 成功获取 `/api/contacts` 数据后，将 `data.contacts.map(c => c.user)` 映射为用户数组；  
  - 若当前用户不在该数组中，则将 `currentUser` 插入到列表首位；  
  - 通过额外的 `useEffect` 再次兜底，防止首次渲染时 `currentUser` 仍未注入导致遗漏。  
- 文件：`components/contacts/contacts-panel.tsx`。  
  - 删除原先 `filter(u => u.id !== currentUser.id)` 的逻辑，不再主动排除当前用户。  
- 效果：  
  - 当前用户始终出现在联系人列表中；  
  - 搭配前述自聊方案，可以以一致的路径从联系人页发起自聊。

### 6.2 `/api/contacts` 的网络错误处理

**问题背景**  
- 在开发环境下，`/api/contacts` 偶尔因本地服务重启或网络抖动触发 `TypeError: Failed to fetch`；  
- 这些属于网络层错误，而非业务逻辑错误，但若直接抛出，会导致页面被错误边界捕获，呈现整页错误状态。

**技术方案与效果**  
- 在 `loadContacts` 中对 `fetch('/api/contacts')` 外层增加网络级 `try/catch`：  
  - 对 `TypeError: Failed to fetch` 这类错误，仅记录 `console.warn` 并调用 `setIsLoading(false)`，不再向上抛出；  
  - 对有响应的 HTTP 错误（如 401），保留原有的业务处理流程（例如重定向至 `/login`）。  
- 结果：  
  - 偶发的网络波动不再中断联系人页的渲染流程；  
  - 用户仅在控制台看到告警信息，而不会面对整页错误界面。

---

## 七、典型问题与对应修复（摘要）

本日解决的关键问题可概括如下：

- **删除对话后，对方仍能看到历史消息**  
  - 设计上这是预期行为：删除只对本端生效，不应影响对方视角。  
  - 在代码和日志层面，已清理“整会话软删”的实现和表述，统一为 per-user 软删。  

- **未读红点刷新后反弹或点击时闪烁**  
  - 根因在于：`last_read_at` 使用前端时间、本地缓存未同步清零、后台刷新覆盖前端状态多因素叠加。  
  - 通过基于数据库时间的 `mark_conversation_read`、`get_unread_counts` 以及前端的缓存同步和 `forceReadConversationsRef`，实现稳定的“点击即清零且不反弹”。  

- **`.py` 文件下载时被浏览器直接预览**  
  - 通过使用 `fetch → blob → <a download>` 的前端下载流程，将“下载”为独立语义，与浏览器的预览逻辑解耦。  

- **自聊会话排序靠后、右侧频繁 Loading**  
  - 通过完善 `last_message_at` 的设置和改写轮询逻辑，避免将自聊误当作“无最后消息”的特殊 case，消除不必要的重复拉取及 Loading 抖动。  

- **联系人页 `Failed to fetch` 使页面报错**  
  - 通过网络级错误与业务错误的区分处理，将短暂网络异常对 UI 的影响降到最低。

---

## 八、小结

今天的改动，对“删除行为、未读状态、文件消息、自聊、联系人页”几条关键链路进行了系统性的校正与优化，使实现与实际使用习惯保持一致，并在多处细节上提升了稳定性和可预期性。后续如有新的使用反馈，可以在本次调整的基础上继续迭代。 


