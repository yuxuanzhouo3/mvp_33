# 鸿蒙（HarmonyOS）应用签名配置指南

## 📋 概述

鸿蒙应用的签名流程与 Android 类似，但需要：
1. 使用 DevEco Studio 开发
2. 在华为开发者平台生成证书
3. 配置签名信息

## ✅ 可以提前准备证书吗？

**可以！** 即使代码还没写完，也可以提前准备证书：

- ✅ **证书是独立的**：证书生成不依赖代码完成度
- ✅ **提前准备更好**：避免开发完成后才去申请，节省时间
- ✅ **证书可以复用**：同一个证书可以用于多个应用版本
- ⚠️ **重要**：妥善保管证书和密码，丢失后无法找回

## 🔑 证书信息

根据你提供的信息：
- **密码**: `Zyx!213416`
- **华为开发者账号**: `18870661556`
- **证书类型**: 发布类型证书（Publish Certificate）

## 📝 详细步骤

### 步骤 1: 下载 DevEco Studio

1. 访问：https://developer.huawei.com/consumer/cn/deveco-studio/
2. 下载并安装 DevEco Studio
3. 启动 DevEco Studio

### 步骤 2: 生成 CSR 文件

根据官方文档：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V3/publish_app-0000001053223745-V3#section9752152162813

#### 2.1 在 DevEco Studio 中生成 CSR

1. 打开 DevEco Studio
2. 进入 **Tools** > **SDK Manager** 或 **File** > **Settings** > **HarmonyOS SDK**
3. 找到 **Keytool** 工具（通常在 SDK 的 `tools` 目录下）
4. 或者使用命令行工具生成 CSR

#### 2.2 使用命令行生成 CSR（推荐）

```bash
# 在项目目录下运行
keytool -genkeypair -alias "harmonyos-release" -keyalg RSA -keysize 2048 -validity 9125 -keystore harmonyos-release.p12 -storetype PKCS12 -storepass "Zyx!213416"

# 生成 CSR 文件
keytool -certreq -alias "harmonyos-release" -keystore harmonyos-release.p12 -storepass "Zyx!213416" -file harmonyos-release.csr
```

**参数说明：**
- `-alias "harmonyos-release"`: 密钥别名（可以自定义）
- `-keysize 2048`: 密钥长度
- `-validity 9125`: 有效期（25年，约9125天）
- `-storepass "Zyx!213416"`: 密钥库密码
- `harmonyos-release.p12`: 生成的密钥库文件
- `harmonyos-release.csr`: 生成的 CSR 文件

### 步骤 3: 登录华为开发者平台

1. 访问：https://developer.huawei.com/
2. 使用手机号 `18870661556` 登录
3. 验证码找老板要
4. 进入 **我的项目** > **证书管理**

### 步骤 4: 上传 CSR 并生成证书

1. 在 **证书与 App ID** 界面
2. 点击 **创建证书** 或 **上传 CSR**
3. 选择类型：**发布类型证书**（Publish Certificate）
4. 上传刚才生成的 `harmonyos-release.csr` 文件
5. 填写证书信息：
   - 证书名称：可以自定义（如：`multigpt-harmonyos-release`）
   - 证书类型：发布类型证书
6. 提交后，华为平台会生成两个文件：
   - **证书文件**（.cer 或 .p7b）
   - **证书配置文件**（可能需要）

### 步骤 5: 下载证书文件

1. 在证书列表中，找到刚创建的证书
2. 下载证书文件到本地
3. 保存好证书文件和 CSR 文件

## 🔧 在项目中配置签名

### 方法 1: 在 DevEco Studio 中配置

1. 打开项目
2. 进入 **File** > **Project Structure** > **Signing Configs**
3. 添加签名配置：
   - **Store File**: 选择 `harmonyos-release.p12` 文件
   - **Store Password**: `Zyx!213416`
   - **Key Alias**: `harmonyos-release`（或你设置的别名）
   - **Key Password**: `Zyx!213416`
   - **Certificate File**: 选择从华为平台下载的证书文件

### 方法 2: 在 build-profile.json5 中配置

```json5
{
  "app": {
    "signingConfig": {
      "debug": {
        // 调试签名配置
      },
      "release": {
        "signingConfig": {
          "storeFile": "harmonyos-release.p12",
          "storePassword": "Zyx!213416",
          "keyAlias": "harmonyos-release",
          "keyPassword": "Zyx!213416",
          "profileFile": "harmonyos-release.p7b",  // 华为平台下载的证书
          "signAlg": "SHA256withRSA",
          "type": "HarmonyOS"
        }
      }
    }
  }
}
```

## 📁 文件结构

```
your-harmonyos-project/
├── harmonyos-release.p12          # 本地密钥库（自己生成）
├── harmonyos-release.csr          # CSR 文件（上传到华为平台）
├── harmonyos-release.p7b         # 华为平台下载的证书文件
└── entry/
    └── build-profile.json5        # 签名配置
```

## ⚠️ 重要注意事项

### 1. 证书安全

- **妥善保管**以下文件：
  - `harmonyos-release.p12`（密钥库文件）
  - `harmonyos-release.csr`（CSR 文件）
  - 华为平台下载的证书文件
  - 密码：`Zyx!213416`

- **不要提交到版本控制**：
  - 将这些文件添加到 `.gitignore`
  - 使用环境变量或密钥管理服务

### 2. 证书类型

- **调试证书**：用于开发测试
- **发布证书**：用于正式发布（你选择的是这个）

### 3. 证书有效期

- 证书通常有有效期限制
- 过期后需要重新申请
- 建议设置较长的有效期（如 25 年）

### 4. 与 Android 的区别

| 项目 | Android | HarmonyOS |
|------|---------|-----------|
| 密钥库格式 | .jks 或 .keystore | .p12 |
| 证书格式 | .cer | .p7b |
| 签名工具 | jarsigner/apksigner | DevEco Studio |
| 证书来源 | 自己生成 | 华为平台申请 |

## 🚀 快速生成脚本

创建一个 PowerShell 脚本来生成 CSR：

```powershell
# generate-harmonyos-csr.ps1
$alias = "harmonyos-release"
$password = "Zyx!213416"
$keystoreFile = "harmonyos-release.p12"
$csrFile = "harmonyos-release.csr"

# 检查 Java keytool
$javaHome = (Get-Command java).Source | Split-Path -Parent | Split-Path -Parent
$keytool = Join-Path $javaHome "bin\keytool.exe"

if (-not (Test-Path $keytool)) {
    Write-Host "错误: 未找到 keytool" -ForegroundColor Red
    exit 1
}

Write-Host "生成密钥库..." -ForegroundColor Cyan
& $keytool -genkeypair `
    -alias $alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity 9125 `
    -keystore $keystoreFile `
    -storetype PKCS12 `
    -storepass $password `
    -dname "CN=multigpt, OU=mornscience, O=mornscience, L=ShenZhen, ST=GuangDong, C=CN"

Write-Host "生成 CSR 文件..." -ForegroundColor Cyan
& $keytool -certreq `
    -alias $alias `
    -keystore $keystoreFile `
    -storepass $password `
    -file $csrFile

Write-Host "完成！" -ForegroundColor Green
Write-Host "密钥库: $keystoreFile" -ForegroundColor Yellow
Write-Host "CSR 文件: $csrFile" -ForegroundColor Yellow
Write-Host ""
Write-Host "下一步：将 $csrFile 上传到华为开发者平台" -ForegroundColor Cyan
```

## 📚 相关文档

- [DevEco Studio 下载](https://developer.huawei.com/consumer/cn/deveco-studio/)
- [鸿蒙应用发布指南](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V3/publish_app-0000001053223745-V3)
- [华为开发者平台](https://developer.huawei.com/)

## 🔄 与 Android 证书对比

你已经有了 Android 证书：
- **Android Keystore**: `keystores(android)\multigpt-key.jks`
- **密码**: `Zyx!213416`
- **Alias**: `multigpt-alias`

**注意**：鸿蒙和 Android 使用不同的证书系统，需要分别申请。

## ✅ 检查清单

- [ ] 已安装 DevEco Studio
- [ ] 已生成 CSR 文件
- [ ] 已登录华为开发者平台（18870661556）
- [ ] 已上传 CSR 并创建发布证书
- [ ] 已下载华为平台生成的证书文件
- [ ] 已保存所有证书文件和密码
- [ ] 已在项目中配置签名信息

## 💡 建议

1. **提前准备**：即使代码没写完，也可以先申请证书
2. **备份证书**：将证书文件备份到安全位置
3. **记录信息**：保存证书相关信息（别名、密码、有效期等）
4. **测试签名**：代码完成后，先测试签名流程






