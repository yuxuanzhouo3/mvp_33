## 开发日志 - 2025年11月25日

## 概述
今天的核心任务是修复 Google OAuth 登录后「Select Workspace ➜ Login ➜ Select Workspace」的闪退，并在文档中记录可复现、可扩展的方案，确保后续的多身份提供商体验一致。

---

## 关键修复：OAuth Splash Fix

### 现象
- 用户在 Google OAuth 完成后会短暂回到初始登录页（Google/WeChat/Email 选项），再跳回 Workspace 选择器。
- 问题发生在点击「授权」后、尚未选择 Workspace 前，整体体验断断续续。

### 根因
- `app/login/page.tsx` 作为同构组件，始终以 `step = 'login'` 进行 SSR，客户端再通过 `useEffect` 将 `step` 变为 `'workspace'`。
- 在 React StrictMode 与热更新场景下，`useEffect` 会被重复执行，导致首屏出现 Login ➜ Workspace ➜ Login 的闪动。
- Next.js 16 在开发模式下把 `searchParams` 暴露为 Promise，直接访问 `searchParams.oauth` 触发「A searchParam property was accessed directly」错误。

### 处理步骤
1. **Server / Client 拆分**
   - 新增 `app/login/login-page-client.tsx`，保留全部交互逻辑。
   - `app/login/page.tsx` 升级为纯 Server 组件，只负责解析 `searchParams` 并传入 `initialStep`。
2. **同步识别 OAuth 回调**
   - Server 渲染阶段检查 `?oauth=success`，首屏直接渲染 Workspace 选择器，避免闪屏。
   - 客户端继续使用 `URLSearchParams` 处理 token、用户信息以及 workspace 状态，但不再与初始渲染冲突。
3. **Promise searchParams 兼容**
   - 将 `searchParams` 声明为 `SearchParams | Promise<SearchParams>`，并在 Server 组件中 `await`。
   - 彻底移除控制台的「Invalid source map / searchParams is Promise」报错。

### 成果
- Google OAuth 完成后，页面直接停留在 Select Workspace，不再出现 Login ↔ Workspace 的闪烁。
- 控制台保持干净，后续若新增其他 OAuth Provider，可继续复用该模式。

---

## 代码变更摘要

### `app/login/page.tsx`
- 改为 async Server 组件，解析 `searchParams`（支持 Promise）。
- 计算 `initialStep` 并渲染 `LoginPageClient`。

### `app/login/login-page-client.tsx`
- 新增 Client 组件，包含原有登录表单、注册、重置密码以及 Workspace 选择逻辑。
- 初始化 `step` 时直接使用 Server 传入的 `initialStep`，防止闪屏。
- 保留 OAuth token 去重、sessionStorage 标记、workspace 强制写入等保护逻辑。

---

## 遇到的问题与解决

### 1. searchParams Promise 报错
- **现象**：`searchParams.oauth` 抛出「A searchParam property was accessed直接」错误。
- **原因**：Next.js 16 dev 模式在 App Router 中把 `searchParams` 提供为 Promise。
- **解决**：在 Server 组件中统一 `await`，并封装 `SearchParams` 类型。

### 2. Source Map 无法解析
- **现象**：Dev Server 输出「Invalid source map」。
- **原因**：报错堆栈中断在 `app/login/page.tsx`，与 Promise searchParams 问题串联。
- **解决**：同上；待 Promise 解析完成后该报错随之消失。

---

## 后续建议
1. 将同样的 Server / Client 拆分策略复用到其他存在首屏闪屏的页面（例如注册完成后的 Workspace 选择）。
2. 为 OAuth 登录流程增加 Playwright 或 Cypress E2E，用来断言：
   - `oauthProcessedRef` 只执行一次；
   - 选择 Workspace 前浏览器 URL 保持 `?oauth=success`，选择后才清理。
3. 继续收敛登录相关日志输出，保留 `[WORKSPACE SELECT]` 级别的必要信息，减少噪音。

---

> 今日关键词：**OAuth Splash Fix** — 让登录体验与企业级产品一致，从首屏渲染开始把控状态一致性。








































































































