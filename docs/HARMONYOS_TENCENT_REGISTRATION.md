# 鸿蒙应用腾讯云备案 - 获取三个值

## 📋 三个值说明

### 1. MD5（SHA1指纹）✅ 已提取
```
49:07:EB:85:FF:C2:BE:C8:26:99:FA:FF:0E:44:A3:A6:EC:17:69:55
```

### 2. 包名 ✅ 已确定
```
com.orbital.chat.enterprise
```

**说明：**
- Android包名：`com.orbital.chat.enterprise`
- HarmonyOS包名：`com.orbital.chat.enterprise`（保持一致）

**在华为开发者平台创建应用时使用此包名。**

### 3. 公钥 ✅ 已提取
```
04 84 4c 24 0b e2 05 66 78 2e 2a 5e 29 cb 66 11 71 7a 0b e6 7a 09 bf 41 79 93 a6 1e 8b 4c de 5e b2 b8 35 44 a6 d7 d9 83 41 21 93 36 9a 89 79 b6 f4 7d d8 74 fa 6e cf 8e 94 72 37 0c b1 57 08 a7 df
```

**无空格格式：**
```
04844c240be20566782e2a5e29cb6611717a0be67a09bf417993a61e8b4cde5eb2b83544a6d7d983412193369a8979b6f47dd874fa6ecf8e9472370cb15708a7df
```

## 🔍 如何获取公钥（不需要创建项目）

### 方法1：直接查看证书文件（推荐）

1. **打开证书文件**
   - 双击 `harmony/app-cert-only.cer` 文件
   - 或者右键 > 打开方式 > 选择程序

2. **查看公钥**
   - 点击 **详细信息** 标签
   - 点击 **公钥**
   - 复制公钥信息（通常是 Base64 编码的字符串）

### 方法2：使用命令行（如果有 openssl）

```powershell
openssl x509 -in harmony/app-cert-only.cer -pubkey -noout
```

### 方法3：使用 keytool（已安装）

```powershell
keytool -printcert -file harmony/app-cert-only.cer
```

在输出中查找公钥信息。

## ❓ 关于"选择应用项目"

**重要说明：**

文档中说的"在我的项目页面，选择需要查询特征信息的应用项目"，这个步骤是：
- **如果你已经在华为开发者平台创建了应用项目**，可以在项目中查看包名
- **但如果你还没有创建项目**，不需要创建项目！

**原因：**
1. **包名**：已确定为 `com.orbital.chat.enterprise`（与Android保持一致）
2. **MD5**：已经从证书中提取了
3. **公钥**：可以从证书文件中直接提取，不需要项目

## ✅ 总结

**你不需要：**
- ❌ 在华为开发者平台创建应用项目
- ❌ 登录 AppGallery Connect
- ❌ 选择项目

**你需要：**
- ✅ 使用已提取的 MD5：`49:07:EB:85:FF:C2:BE:C8:26:99:FA:FF:0E:44:A3:A6:EC:17:69:55`
- ✅ 使用已确定的包名：`com.orbital.chat.enterprise`（与Android保持一致）
- ✅ 从证书文件中提取公钥（双击 `harmony/app-cert-only.cer` 查看）

## 📁 相关文件

- `harmony/app-cert-only.cer` - 应用证书（已删除证书链）
- `harmony-cert-files.zip` - 打包的证书文件
- `HARMONYOS_APP_INFO.md` - 完整信息文档

