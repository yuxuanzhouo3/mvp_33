# 扫码添加好友功能设计文档

**日期**: 2026-02-12
**版本**: 国际版（Supabase）
**状态**: 设计完成，待实现

## 功能概述

实现类似微信的扫码添加好友功能，包含两个核心场景：
1. **生成二维码**：用户生成包含自己用户ID的二维码，展示给他人扫描
2. **扫码添加**：用户通过摄像头扫描他人的二维码，获取用户ID后发送好友请求

## 技术选型

- **二维码生成**：`qrcode.react` - 轻量级，React友好
- **二维码扫描**：`html5-qrcode` - 支持摄像头扫描，无需原生权限
- **二维码格式**：`orbitchat://add-friend?userId={userId}` - 自定义协议，便于扩展

## 组件结构

```
components/contacts/
├── qr-code-dialog.tsx          # 我的二维码对话框
├── scan-qr-dialog.tsx          # 扫一扫对话框
└── contacts-panel.tsx          # 现有组件，添加入口按钮
```

## 数据流

1. 用户点击"我的二维码" → 生成包含当前用户ID的二维码 → 展示在对话框中
2. 用户点击"扫一扫" → 打开摄像头 → 扫描二维码 → 解析用户ID → 调用现有的添加好友API

## UI组件设计

### 1. 我的二维码对话框 (QRCodeDialog)

**功能**：
- 显示当前用户的二维码（包含用户ID）
- 展示用户基本信息（头像、昵称、用户名）
- 提供保存二维码图片的功能（可选）

**交互流程**：
1. 用户在联系人页面点击"我的二维码"按钮
2. 弹出对话框，自动生成二维码
3. 二维码格式：`orbitchat://add-friend?userId={userId}`
4. 用户可以让他人扫描此二维码

### 2. 扫一扫对话框 (ScanQRDialog)

**功能**：
- 调用设备摄像头进行扫描
- 实时显示摄像头画面
- 扫描成功后解析用户ID
- 自动跳转到添加好友确认界面

**交互流程**：
1. 用户在联系人页面点击"扫一扫"按钮
2. 请求摄像头权限（浏览器原生权限）
3. 显示摄像头画面，等待扫描
4. 扫描到二维码后，解析出用户ID
5. 调用 `/api/users/search?q={userId}` 获取用户信息
6. 显示用户信息确认界面
7. 用户点击"添加"后，调用现有的 `/api/contact-requests` API 发送好友请求

### 3. 联系人页面入口

在 `contacts-panel.tsx` 的顶部工具栏添加两个按钮：
- "我的二维码"图标按钮（QrCode图标）
- "扫一扫"图标按钮（Scan图标）

## 实现细节

### 1. 依赖安装

```bash
npm install qrcode.react html5-qrcode
```

### 2. 二维码格式设计

**格式**：`orbitchat://add-friend?userId={userId}`

**示例**：`orbitchat://add-friend?userId=123e4567-e89b-12d3-a456-426614174000`

**解析逻辑**：
```typescript
function parseQRCode(data: string): string | null {
  const match = data.match(/orbitchat:\/\/add-friend\?userId=(.+)/)
  return match ? match[1] : null
}
```

### 3. 核心实现逻辑

**生成二维码**：
- 使用 `qrcode.react` 的 `QRCodeSVG` 组件
- 传入格式化的URL字符串
- 设置合适的尺寸（建议256x256）

**扫描二维码**：
- 使用 `html5-qrcode` 的 `Html5Qrcode` 类
- 请求摄像头权限
- 扫描成功后解析userId
- 调用 `/api/users/search?q={userId}` 获取用户详情
- 展示用户信息供确认
- 调用现有的 `/api/contact-requests` POST接口发送好友请求

### 4. 与现有功能集成

- 复用现有的 `/api/contact-requests` API（无需修改）
- 复用现有的 `/api/users/search` API（无需修改）
- 扫码成功后的添加流程与搜索添加完全一致

## 错误处理和边界情况

### 1. 摄像头权限处理

**场景**：用户拒绝摄像头权限或设备无摄像头
**处理**：
- 显示友好的错误提示："需要摄像头权限才能扫描二维码"
- 提供"重新授权"按钮
- 提供"手动输入用户ID"的备选方案

### 2. 二维码扫描失败

**场景**：扫描到的不是有效的OrbitChat二维码
**处理**：
- 显示提示："这不是有效的OrbitChat二维码"
- 继续保持扫描状态，等待下一次扫描

### 3. 用户不存在

**场景**：扫描的二维码包含的用户ID在数据库中不存在
**处理**：
- 调用 `/api/users/search?q={userId}` 返回空结果
- 显示提示："该用户不存在或已注销"
- 关闭扫描对话框

### 4. 重复添加

**场景**：扫描的用户已经是好友
**处理**：
- 调用 `/api/contact-requests` 返回错误
- 显示提示："该用户已经是您的好友"
- 提供"查看联系人"按钮跳转到该用户详情

### 5. 跨区域限制

**场景**：国际版用户扫描国内版用户的二维码（或反之）
**处理**：
- 现有API已经有区域检查逻辑
- 显示提示："无法添加不同区域的用户"

### 6. 网络错误

**场景**：API调用失败（网络问题、服务器错误）
**处理**：
- 显示通用错误提示："网络错误，请稍后重试"
- 提供"重试"按钮

## 国际化支持

需要在 `lib/i18n.ts` 中添加以下翻译键：
- `myQRCode`: 我的二维码
- `scanQRCode`: 扫一扫
- `scanToAddFriend`: 扫描二维码添加好友
- `showMyQRCode`: 展示我的二维码
- `cameraPermissionDenied`: 需要摄像头权限才能扫描二维码
- `invalidQRCode`: 这不是有效的OrbitChat二维码
- `userNotFound`: 该用户不存在或已注销
- `alreadyFriend`: 该用户已经是您的好友
- `crossRegionNotAllowed`: 无法添加不同区域的用户

## 实现步骤

1. 安装依赖包 `qrcode.react` 和 `html5-qrcode`
2. 创建 `qr-code-dialog.tsx` 组件
3. 创建 `scan-qr-dialog.tsx` 组件
4. 修改 `contacts-panel.tsx` 添加入口按钮
5. 添加国际化翻译
6. 测试各种场景和错误处理

## 注意事项

- 国内版（Cloudbase）后续参照国际版实现
- 二维码格式保持一致，便于跨版本兼容
- 摄像头权限需要HTTPS环境或localhost
- 考虑移动端和桌面端的不同体验
