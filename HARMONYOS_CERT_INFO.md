# 鸿蒙应用证书信息

## 📋 证书文件

### 已生成的文件

1. **密钥库文件**: `harmonyos-release.p12`
   - 格式：PKCS12
   - 别名：`harmonyos-release`
   - 密码：`Zyx!213416`
   - 密钥算法：RSA 2048位
   - 有效期：25年（9125天）

2. **CSR 文件**: `harmonyos-release.csr`
   - 用途：上传到华为开发者平台申请证书
   - 状态：✅ 已生成，待上传

## 🔑 证书信息

- **别名 (Alias)**: `harmonyos-release`
- **密钥库密码**: `Zyx!213416`
- **密钥密码**: `Zyx!213416`
- **证书主题**: CN=morn science, OU=mornscience, O=mornscience, L=ShenZhen, ST=GuangDong, C=CN
- **证书类型**: 发布类型证书（Publish Certificate）

## 📝 下一步操作

### 1. 登录华为开发者平台

1. 访问：https://developer.huawei.com/
2. 使用手机号登录：`18870661556`
3. 验证码：找老板要
4. 进入：**我的项目** > **证书管理** > **证书与 App ID**

### 2. 上传 CSR 文件

1. 点击 **创建证书** 或 **上传 CSR**
2. 选择证书类型：**发布类型证书**（Publish Certificate）
3. 上传文件：`harmonyos-release.csr`
4. 填写证书信息：
   - 证书名称：`multigpt-harmonyos-release`（可自定义）
   - 证书类型：发布类型证书
5. 提交申请

### 3. 下载证书文件

1. 在证书列表中，找到刚创建的证书
2. 下载证书文件（通常是 `.p7b` 或 `.cer` 格式）
3. 保存到项目目录

### 4. 在项目中配置

下载证书后，在 `build-profile.json5` 中配置：

```json5
{
  "app": {
    "signingConfig": {
      "release": {
        "signingConfig": {
          "storeFile": "harmonyos-release.p12",
          "storePassword": "Zyx!213416",
          "keyAlias": "harmonyos-release",
          "keyPassword": "Zyx!213416",
          "profileFile": "harmonyos-release.p7b",  // 从华为平台下载的文件
          "signAlg": "SHA256withRSA",
          "type": "HarmonyOS"
        }
      }
    }
  }
}
```

## ⚠️ 重要提示

### 文件安全

**必须妥善保管以下文件：**
- ✅ `harmonyos-release.p12` - 密钥库文件（最重要！）
- ✅ `harmonyos-release.csr` - CSR 文件（已使用，可备份）
- ✅ 华为平台下载的证书文件（下载后保存）

**密码信息：**
- 密钥库密码：`Zyx!213416`
- 密钥密码：`Zyx!213416`
- 别名：`harmonyos-release`

### 不要提交到版本控制

将这些文件添加到 `.gitignore`：

```
# HarmonyOS 证书文件
harmonyos-release.p12
harmonyos-release.csr
harmonyos-release.p7b
*.p7b
*.cer
```

## 🔄 与 Android 证书对比

| 项目 | Android | HarmonyOS |
|------|---------|-----------|
| 密钥库文件 | `multigpt-key.jks` | `harmonyos-release.p12` |
| 密码 | `Zyx!213416` | `Zyx!213416` |
| 别名 | `multigpt-alias` | `harmonyos-release` |
| 证书来源 | 自己生成 | 华为平台申请 |
| 证书格式 | `.jks` | `.p12` + `.p7b` |

## ✅ 检查清单

- [x] 已生成密钥库文件 (`harmonyos-release.p12`)
- [x] 已生成 CSR 文件 (`harmonyos-release.csr`)
- [ ] 已登录华为开发者平台
- [ ] 已上传 CSR 文件
- [ ] 已创建发布类型证书
- [ ] 已下载华为平台证书文件
- [ ] 已在项目中配置签名信息

## 📚 相关文档

- 详细指南：`docs/HARMONYOS_SIGNING_SETUP.md`
- 华为开发者平台：https://developer.huawei.com/
- DevEco Studio：https://developer.huawei.com/consumer/cn/deveco-studio/






