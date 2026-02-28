# 手测脚本：扫码加好友 + 侧边栏首点空白 + 好友申请秒级响应（CN/INTL）

更新时间：2026-02-28
适用版本：`CN（CloudBase）`、`INTL（Supabase）`
目标：验证以下 3 个修复在国内/国际版本都生效
- 扫码加好友不再误报 `User not found or has been deactivated`
- 侧边栏各标签首次点击不再出现整页空白闪屏
- 好友申请通知在接收方页面实现秒级可见（目标 2 秒内）

---

## 0. 环境准备

### 0.1 启动命令
- CN：`npm run dev:cn`
- INTL：`npm run dev:intl`

默认访问：`http://localhost:3000`

### 0.2 测试账号要求（两边都需要 A/B 两个账号）
- A 账号：发起扫码加好友
- B 账号：被扫码方（展示二维码）
- A 与 B 必须在同一工作区（推荐 `techcorp`）
- A、B 账号必须可登录且未停用
- A 与 B 初始不是好友（无双向 `contacts` 记录）
- A->B 初始无 `pending` 好友申请（避免误判）

### 0.3 建议打开两个浏览器会话
- 窗口 1（或浏览器 1）：登录 A
- 窗口 2（或无痕）：登录 B

---

## 1. 用例总览（每个版本都执行一轮）

- TC-01：二维码扫描识别用户成功
- TC-02：发送好友申请成功
- TC-03：接收方秒级看到好友申请（请求列表 + 侧边栏红点）
- TC-04：侧边栏各标签首次点击无整页空白闪屏
- TC-05：异常二维码与自扫防护

---

## 2. 测试步骤（CN 版）

### TC-01 二维码扫描识别用户成功
前置：
- A、B 都登录 CN 版
- B 打开联系人页，展示“我的二维码”

步骤：
1. A 进入 `联系人` 页，点 `扫一扫`
2. 扫描 B 的二维码（或“从相册选择”二维码图片）
3. 观察扫描结果卡片

预期：
- 显示 B 的头像/姓名/用户名
- 不出现 `User not found or has been deactivated`

---

### TC-02 发送好友申请成功
步骤：
1. 在 A 的扫描结果里点击 `添加联系人`
2. 观察 toast/弹窗提示

预期：
- 提示发送成功（或已发送）
- `contact_requests` 新增 1 条记录：
  - `requester_id = A.id`
  - `recipient_id = B.id`
  - `status = pending`
  - `region = cn`

---

### TC-03 接收方秒级看到好友申请
前置：
- B 停留在联系人页（Requests 标签）或任意带左侧导航页面

步骤：
1. A 点击发送好友申请
2. 同时在 B 侧开始计时
3. 观察以下两个入口
- 联系人页 Requests 待处理列表
- 左侧导航 `联系人` 红点

预期：
- 2 秒内至少一个入口出现新请求提示
- 最长不超过 3 秒全部入口同步
- 切换到 Requests 标签可见 A 的待处理申请

---

### TC-04 侧边栏首次点击无整页空白闪屏
步骤：
1. 用 B 账号从 `聊天` 页开始
2. 依次首次点击：`联系人` -> `工作区` -> `频道` -> `聊天`
3. 每次点击观察整页渲染

预期：
- 不出现“整屏白底空白”再恢复的闪屏
- 若数据尚未到位，可看到 `Loading...` 占位，而不是空白页

---

### TC-05 异常二维码与自扫防护
步骤：
1. 用 A 扫非 OrbitChat 二维码
2. 用 A 扫自己的二维码并尝试添加

预期：
- 非法码提示：`invalidQRCode`
- 自己加自己提示失败：`Cannot send request to yourself`（或等价中文提示）

---

## 3. 测试步骤（INTL 版）

说明：流程与 CN 一致，只是数据落库在 Supabase，且 `region = global`。

### TC-01 ~ TC-05
按 CN 同样步骤执行。

额外核对（INTL）：
- `contact_requests` 记录为：
  - `requester_id = A.id`
  - `recipient_id = B.id`
  - `status = pending`
  - `recipient.region = global`

---

## 4. 建议数据库核对点

### CN（CloudBase）
- 集合：`users`、`contacts`、`contact_requests`、`workspace_members`
- 核对：A/B 的 `id` 与二维码解析出的用户标识是否一致

### INTL（Supabase）
- 表：`users`、`contacts`、`contact_requests`、`workspace_members`
- 核对：A/B 在同工作区，且没有历史 pending 干扰

---

## 5. 结果记录模板（每轮一份）

版本：`CN / INTL`
执行日期：
执行人：
账号：
- A：
- B：

结果：
- TC-01：`PASS / FAIL`
- TC-02：`PASS / FAIL`
- TC-03：`PASS / FAIL`，可见延迟：`__ 秒`
- TC-04：`PASS / FAIL`
- TC-05：`PASS / FAIL`

失败明细（必填）：
- 现象：
- 复现步骤：
- 首次出现时间：
- 控制台报错：
- 接口报错：

---

## 6. 回归建议

执行顺序建议：
1. 先跑 CN 全量 5 条
2. 再跑 INTL 全量 5 条
3. 每个 FAIL 立刻复测一次，排除偶发现象
