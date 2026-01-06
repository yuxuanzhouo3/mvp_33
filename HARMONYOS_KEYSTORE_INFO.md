# 鸿蒙应用 Keystore 信息（老板提供的）

## 📁 文件位置

所有文件在 `harmony/` 目录下：

```
harmony/
├── release.p12          # 密钥库文件（PKCS12 格式）
├── multigpt.cer         # 证书文件（从华为平台下载）
└── release.csr          # CSR 文件（已使用）
```

## 🔑 Keystore 信息

### 密钥库文件
- **文件路径**: `harmony/release.p12`
- **格式**: PKCS12
- **密码**: `Zyx!213416`
- **别名 (Alias)**: `release`
- **密钥密码**: `Zyx!213416`（通常与密钥库密码相同）

### 证书信息
- **证书文件**: `harmony/multigpt.cer`
- **证书类型**: 发布类型证书（Release Certificate）
- **证书主题**: CN="电子科学（深圳）有限公司(1828281838808901185)\\,Release"
- **序列号**: 9fc0d34c9f23c432419ce584c72
- **有效期**: 2025-11-27 至 2028-11-27（3年）
- **签名算法**: SHA384withECDSA
- **密钥算法**: 256位 EC (secp256r1)
- **SHA-256 指纹**: `70:24:1F:1B:33:AD:6B:1A:1A:C5:EC:E5:25:30:D8:4A:BF:B3:60:52:4F:EF:48:36:E6:DE:E2:D2:8E:2B:B6:4E`
- **证书链**: 包含完整的华为证书链（根证书 + 中间证书 + 应用证书）

## ✅ 验证结果

- ✅ 密钥库文件有效
- ✅ 密码正确（`Zyx!213416`）
- ✅ 证书文件存在
- ✅ 证书有效期：25年（至 2050-11-21）

## 🔧 在 DevEco Studio 中使用

### 等代码完成后配置

1. **打开项目**
   - 在 DevEco Studio 中打开你的鸿蒙项目

2. **配置签名**
   - **File** > **Project Structure** > **Signing Configs**
   - 点击 **+** 添加新配置
   - 填写信息：
     ```
     Store File: harmony/release.p12
     Store Password: Zyx!213416
     Key Alias: release
     Key Password: Zyx!213416
     Profile File: harmony/multigpt.cer  (或 .p7b 文件，如果有)
     ```

3. **关联到 Build Type**
   - 切换到 **Build Types** 标签
   - 选择 **release**
   - 在 **Signing Config** 中选择刚创建的配置

### 在 build-profile.json5 中配置（可选）

```json5
{
  "app": {
    "signingConfig": {
      "release": {
        "signingConfig": {
          "storeFile": "harmony/release.p12",
          "storePassword": "Zyx!213416",
          "keyAlias": "release",
          "keyPassword": "Zyx!213416",
          "profileFile": "harmony/multigpt.cer",
          "signAlg": "SHA256withRSA",
          "type": "HarmonyOS"
        }
      }
    }
  }
}
```

## 📊 与 Android 证书对比

| 项目 | Android | HarmonyOS |
|------|---------|-----------|
| 密钥库文件 | `keystores(android)/multigpt-key.jks` | `harmony/release.p12` |
| 证书文件 | 内置在 .jks 中 | `harmony/multigpt.cer` |
| 密码 | `Zyx!213416` | `Zyx!213416` |
| 别名 | `multigpt-alias` | `release` |
| 密钥算法 | RSA 2048位 | EC 256位 (secp256r1) |
| 签名算法 | SHA384withRSA | SHA384withECDSA |

## ⚠️ 重要提示

### 文件安全

**必须妥善保管：**
- ✅ `harmony/release.p12` - 密钥库文件（最重要！）
- ✅ `harmony/multigpt.cer` - 证书文件
- ✅ 密码：`Zyx!213416`
- ✅ 别名：`release`

**不要提交到版本控制：**
- 将 `harmony/` 目录添加到 `.gitignore`
- 或只忽略证书文件：
  ```
  harmony/*.p12
  harmony/*.cer
  harmony/*.p7b
  harmony/*.csr
  ```

### 备份建议

1. **备份整个 harmony 文件夹**
2. **记录密码和别名信息**（已保存在此文档）
3. **不要丢失**，否则无法更新应用

## 🔄 使用流程

```
代码完成后
  ↓
在 DevEco Studio 中打开项目
  ↓
File -> Project Structure -> Signing Configs
  ↓
配置签名信息（使用 harmony/release.p12）
  ↓
关联到 release Build Type
  ↓
测试打包和签名
  ↓
发布应用
```

## ✅ 检查清单

- [x] ✅ 已确认密钥库文件存在（`harmony/release.p12`）
- [x] ✅ 已确认证书文件存在（`harmony/multigpt.cer`）
- [x] ✅ 已验证密码正确（`Zyx!213416`）
- [x] ✅ 已确认别名（`release`）
- [x] ✅ 已验证证书有效期（至 2050-11-21）
- [ ] ⏸️ 等代码完成后配置项目签名
- [ ] ⏸️ 测试打包和签名

## 📚 相关文档

- 详细配置指南：`docs/HARMONYOS_SIGNING_SETUP.md`
- 时间线指南：`docs/HARMONYOS_SIGNING_TIMELINE.md`
- 使用已有 Keystore：`docs/HARMONYOS_EXISTING_KEYSTORE.md`
- Android 证书信息：`KEYSTORE_INFO.md`

