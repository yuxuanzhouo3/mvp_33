# 在线状态功能改进实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标**: 修复在线状态功能的显示和判断问题，优化心跳参数，实现 Slack 风格的在线状态指示器

**架构**: 修复 Avatar 组件渲染在线状态圆点，修复 API 返回 last_seen_at 字段，优化心跳频率（30秒）和判断阈值（60秒）

**技术栈**: React, TypeScript, Next.js, Supabase, CloudBase

---

## Task 1: 修复 Avatar 组件显示在线状态指示器

**文件:**
- 修改: `components/ui/avatar.tsx:15-35`

**步骤 1: 修改 Avatar 组件添加在线状态圆点**

在 Avatar 组件的 return 语句中，在 `{props.children}` 之后添加在线状态指示器：

```typescript
function Avatar({
  className,
  userId,
  showOnlineStatus,
  ...props
}: AvatarProps) {
  const isOnline = useOnlineStatus(showOnlineStatus ? userId : undefined)

  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        'relative flex size-8 shrink-0 overflow-hidden rounded-full',
        className,
      )}
      {...props}
    >
      {props.children}
      {showOnlineStatus && isOnline && (
        <span
          className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-white"
          aria-label="在线"
        />
      )}
    </AvatarPrimitive.Root>
  )
}
```

**步骤 2: 验证修改**

运行开发服务器：
```bash
npm run dev
```

预期：应用正常启动，无编译错误

**步骤 3: 提交代码**

```bash
git add components/ui/avatar.tsx
git commit -m "$(cat <<'EOF'
fix: Avatar 组件显示在线状态指示器

- 添加 Slack 风格的绿色圆点
- 只在 showOnlineStatus=true 且 isOnline=true 时显示
- 离线时不显示任何指示器

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 修复 API 返回 last_seen_at 字段

**文件:**
- 修改: `app/api/users/[id]/route.ts:50-60` (CloudBase)
- 修改: `app/api/users/[id]/route.ts:78-84` (Supabase)

**步骤 1: 修改 CloudBase 用户数据格式化**

在 `formattedUser` 对象中添加 `last_seen_at` 字段：

```typescript
const formattedUser = {
  id: user.id || user._id,
  email: user.email,
  username: user.username || user.email?.split('@')[0] || '',
  full_name: user.full_name || user.name || '',
  avatar_url: user.avatar_url || null,
  department: user.department || undefined,
  title: user.title || undefined,
  status: user.status || 'offline',
  last_seen_at: user.last_seen_at || null,
  region: user.region || 'cn',
}
```

**步骤 2: 修改 Supabase 查询添加 last_seen_at 字段**

在 Supabase 查询的 select 语句中添加 `last_seen_at`：

```typescript
const { data: user, error } = await supabase
  .from('users')
  .select('id, email, username, full_name, avatar_url, department, title, status, last_seen_at, region')
  .eq('id', userId)
  .eq('region', 'global')
  .single()
```

**步骤 3: 测试 API**

运行开发服务器并测试 API：
```bash
npm run dev
```

在浏览器或使用 curl 测试：
```bash
curl http://localhost:3000/api/users/[some-user-id]
```

预期：返回的 JSON 包含 `last_seen_at` 字段

**步骤 4: 提交代码**

```bash
git add app/api/users/[id]/route.ts
git commit -m "$(cat <<'EOF'
fix: API 返回 last_seen_at 字段

- CloudBase 和 Supabase 都返回 last_seen_at
- 修复国内版在线状态判断失败的问题

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 调整心跳频率参数

**文件:**
- 修改: `hooks/use-heartbeat.ts:25`

**步骤 1: 修改心跳间隔为 30 秒**

将 `setInterval` 的第二个参数从 `60000` 改为 `30000`：

```typescript
sendHeartbeat()
const interval = setInterval(sendHeartbeat, 30000) // 从 60000 改为 30000

return () => clearInterval(interval)
```

**步骤 2: 验证修改**

检查文件内容：
```bash
grep -n "setInterval" hooks/use-heartbeat.ts
```

预期：显示 `setInterval(sendHeartbeat, 30000)`

**步骤 3: 提交代码**

```bash
git add hooks/use-heartbeat.ts
git commit -m "$(cat <<'EOF'
perf: 心跳频率从 60 秒优化为 30 秒

- 提高在线状态更新的实时性
- 用户上线后 30 秒内显示在线状态

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 调整在线状态判断参数

**文件:**
- 修改: `hooks/use-online-status.ts:51` (判断阈值)
- 修改: `hooks/use-online-status.ts:62` (检查间隔)

**步骤 1: 修改判断阈值为 60 秒**

将判断条件中的 `120000` 改为 `60000`：

```typescript
const lastSeen = new Date(user.last_seen_at).getTime()
const now = Date.now()
setIsOnline(now - lastSeen < 60000) // 从 120000 改为 60000
```

**步骤 2: 修改检查间隔为 15 秒**

将 `setInterval` 的第二个参数从 `30000` 改为 `15000`：

```typescript
checkOnlineStatus()
const interval = setInterval(checkOnlineStatus, 15000) // 从 30000 改为 15000

return () => clearInterval(interval)
```

**步骤 3: 验证修改**

检查文件内容：
```bash
grep -n "60000\|15000" hooks/use-online-status.ts
```

预期：显示判断阈值 60000 和检查间隔 15000

**步骤 4: 提交代码**

```bash
git add hooks/use-online-status.ts
git commit -m "$(cat <<'EOF'
perf: 优化在线状态判断参数

- 判断阈值从 120 秒优化为 60 秒
- 检查间隔从 30 秒优化为 15 秒
- 用户离线后 60 秒内显示离线状态

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 测试在线状态功能

**步骤 1: 启动开发服务器**

```bash
npm run dev
```

预期：应用正常启动在 http://localhost:3000

**步骤 2: 测试在线状态显示**

1. 打开浏览器访问聊天页面
2. 查看聊天列表中的用户头像
3. 验证在线用户头像右下角显示绿色圆点
4. 验证离线用户不显示任何指示器

预期：
- 在线用户显示绿色圆点
- 离线用户不显示指示器
- 圆点位置在头像右下角
- 圆点有白色边框

**步骤 3: 测试心跳机制（国内版）**

如果是国内版：
1. 打开浏览器开发者工具 Network 面板
2. 筛选 `/api/users/heartbeat` 请求
3. 观察请求频率

预期：每 30 秒发送一次心跳请求

**步骤 4: 测试在线状态判断**

1. 打开两个浏览器窗口，分别登录不同用户
2. 在窗口 A 中查看窗口 B 用户的在线状态
3. 关闭窗口 B
4. 观察窗口 A 中该用户的在线状态变化

预期：
- 窗口 B 关闭后 60 秒内，窗口 A 显示该用户离线
- 重新打开窗口 B 后 30 秒内，窗口 A 显示该用户在线

**步骤 5: 测试跨版本一致性**

如果有国际版和国内版环境：
1. 分别在两个版本中测试在线状态显示
2. 验证视觉效果一致
3. 验证状态更新时间相近

预期：两个版本的用户体验一致

**步骤 6: 更新设计文档状态**

```bash
# 更新设计文档状态为"已实施"
```

**步骤 7: 最终提交**

```bash
git add docs/plans/2026-02-28-online-status-improvement.md
git commit -m "$(cat <<'EOF'
docs: 更新在线状态改进设计文档状态

标记功能为已实施

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## 实施注意事项

1. **最简原则**: 只修改必要的代码，不添加额外功能
2. **向后兼容**: 确保修改不影响现有功能
3. **错误处理**: 所有网络请求都有适当的错误处理
4. **性能**: 30 秒心跳对服务器压力可接受
5. **清理**: 确保所有定时器在组件卸载时正确清理

## 验收标准

- ✅ 在线用户头像右下角显示绿色圆点
- ✅ 离线用户不显示任何指示器
- ✅ 用户离线后 60 秒内状态更新
- ✅ 国内版和国际版体验一致
- ✅ 无编译错误和运行时错误
- ✅ 所有修改已提交到 git
