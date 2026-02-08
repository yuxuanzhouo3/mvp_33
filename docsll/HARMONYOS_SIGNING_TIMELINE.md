# 鸿蒙应用签名时间线指南

## 📅 现在可以做什么（代码未完成时）

### ✅ 可以提前准备（推荐现在就做）

1. **生成 CSR 文件** ✅ **已完成**
   - 文件：`harmonyos-release.p12` 和 `harmonyos-release.csr`
   - 状态：已生成，可以上传到华为平台

2. **申请华为证书** ✅ **现在可以做**
   - 登录华为开发者平台
   - 上传 CSR 文件
   - 下载证书文件（`.p7b`）
   - **不需要代码完成**

3. **保存证书信息** ✅ **现在可以做**
   - 记录密码、别名等信息
   - 备份证书文件到安全位置

### ❌ 暂时不需要做（等代码写完）

1. **File -> Project Structure 配置签名** ❌ **暂时不需要**
   - 原因：需要先有项目才能配置
   - 时机：等代码写完，在 DevEco Studio 中打开项目后再配置

2. **在 build-profile.json5 中配置** ❌ **暂时不需要**
   - 原因：需要先有项目结构
   - 时机：等代码写完后再配置

3. **测试签名** ❌ **暂时不需要**
   - 原因：需要先有可编译的项目
   - 时机：等代码写完，可以打包时再测试

## 🎯 建议的时间线

### 阶段 1: 现在（代码未完成）✅

**目标：准备证书文件**

- [x] ✅ 生成密钥库文件 (`harmonyos-release.p12`)
- [x] ✅ 生成 CSR 文件 (`harmonyos-release.csr`)
- [ ] ⏳ 上传 CSR 到华为平台
- [ ] ⏳ 下载华为证书文件
- [ ] ⏳ 备份所有证书文件

**不需要：**
- ❌ 在 DevEco Studio 中配置项目签名
- ❌ 修改 build-profile.json5
- ❌ 测试打包

### 阶段 2: 代码完成后

**目标：配置项目签名**

1. 在 DevEco Studio 中打开项目
2. 进入 **File** > **Project Structure** > **Signing Configs**
3. 配置签名信息（使用之前准备的证书文件）
4. 测试打包和签名

## 📝 File -> Project Structure 配置说明

### 什么时候需要？

**等代码写完，准备打包时再配置**

### 配置步骤（代码完成后）

1. **打开项目**
   - 在 DevEco Studio 中打开你的鸿蒙项目

2. **进入签名配置**
   - 点击 **File** > **Project Structure**
   - 选择 **Signing Configs** 标签

3. **添加 Release 签名配置**
   - 点击 **+** 添加新配置
   - 填写信息：
     ```
     Store File: harmonyos-release.p12
     Store Password: Zyx!213416
     Key Alias: harmonyos-release
     Key Password: Zyx!213416
     Profile File: harmonyos-release.p7b (从华为平台下载的)
     ```

4. **关联到 Build Type**
   - 切换到 **Build Types** 标签
   - 选择 **release**
   - 在 **Signing Config** 中选择刚创建的配置

## 🔄 完整流程时间线

```
现在（代码未完成）
  ↓
[1] 生成 CSR ✅ 已完成
  ↓
[2] 上传 CSR 到华为平台 ⏳ 现在可以做
  ↓
[3] 下载华为证书文件 ⏳ 现在可以做
  ↓
[4] 备份证书文件 ⏳ 现在可以做
  ↓
  ... 继续写代码 ...
  ↓
代码完成后
  ↓
[5] 在 DevEco Studio 中打开项目
  ↓
[6] File -> Project Structure 配置签名 ⏸️ 等代码完成
  ↓
[7] 测试打包和签名 ⏸️ 等代码完成
  ↓
[8] 发布应用
```

## ✅ 当前任务清单

### 现在可以做的（代码未完成时）

- [x] ✅ 生成密钥库和 CSR 文件（已完成）
- [ ] ⏳ 登录华为开发者平台
- [ ] ⏳ 上传 `harmonyos-release.csr` 文件
- [ ] ⏳ 创建发布类型证书
- [ ] ⏳ 下载华为平台生成的证书文件（`.p7b`）
- [ ] ⏳ 备份所有证书文件到安全位置
- [ ] ⏳ 记录证书信息（已保存在 `HARMONYOS_CERT_INFO.md`）

### 等代码完成后再做

- [ ] ⏸️ 在 DevEco Studio 中打开项目
- [ ] ⏸️ File -> Project Structure 配置签名
- [ ] ⏸️ 在 build-profile.json5 中配置（如果需要）
- [ ] ⏸️ 测试打包
- [ ] ⏸️ 验证签名

## 💡 建议

### 现在（代码未完成）

**重点：准备证书文件**
1. 上传 CSR 到华为平台
2. 下载证书文件
3. 妥善保管所有文件

**不需要：**
- 在 DevEco Studio 中配置项目
- 修改项目配置文件

### 代码完成后

**重点：配置项目签名**
1. 打开项目
2. 配置签名信息
3. 测试打包

## 📚 相关文件

- 证书信息：`HARMONYOS_CERT_INFO.md`
- 详细配置指南：`docs/HARMONYOS_SIGNING_SETUP.md`
- CSR 文件：`harmonyos-release.csr`（待上传）
- 密钥库：`harmonyos-release.p12`（已生成）

## ⚠️ 重要提示

1. **证书文件可以提前准备**，不依赖代码完成度
2. **项目签名配置需要等代码完成**，因为需要打开项目
3. **先准备好证书**，代码完成后直接配置即可，节省时间





