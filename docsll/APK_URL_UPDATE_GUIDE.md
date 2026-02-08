# APK URL 更新指南

## 📋 概述

你的 APK 是一个 WebView 应用，使用 Median (GoNative) 框架生成。应用的 URL 配置在 `assets/appConfig.json` 文件中。

**当前配置的 URL：**
```
https://express-js-on-vercel-two-jade-85.vercel.app
```

## ✅ 关于使用 Vercel URL 的问题

**没问题！** 使用 Vercel 生成的 URL 来生成 APK 是完全正常的做法：

1. ✅ **可以随时修改**：URL 配置在 APK 的配置文件中，可以修改后重新打包
2. ✅ **不影响功能**：只要你的 Vercel 网站正常运行，APK 就能正常访问
3. ✅ **后续可以更换**：当你准备好正式域名或新的 URL 时，可以更新配置并重新生成 APK

## 🔄 如何修改 URL 并重新生成 APK

### 方法 1: 修改现有 APK（推荐）

#### 步骤 1: 解压 APK

```powershell
# 创建临时目录
$tempDir = "$env:TEMP\apk-update-url-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# 解压 APK
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory("C:\Users\hp\Desktop\app_new-signed.apk", $tempDir)
```

#### 步骤 2: 修改 appConfig.json

找到 `$tempDir\assets\appConfig.json` 文件，修改 `initialUrl` 字段：

```json
{
  "general": {
    "initialUrl": "你的新URL",  // 修改这里
    // ... 其他配置保持不变
  }
}
```

**示例：**
- 新的 Vercel URL: `"initialUrl": "https://your-new-app.vercel.app"`
- 自定义域名: `"initialUrl": "https://yourdomain.com"`
- 本地开发: `"initialUrl": "http://localhost:3001"`（仅用于测试）

#### 步骤 3: 重新打包 APK

```powershell
# 删除旧的 META-INF（签名）
Get-ChildItem -Path $tempDir -Directory -Filter "META-INF" -Recurse | Remove-Item -Recurse -Force

# 重新打包
$unsignedApk = "$tempDir\unsigned.apk"
$files = Get-ChildItem -Path $tempDir -File -Recurse | Where-Object { $_.Name -ne "unsigned.apk" }
$zip = [System.IO.Compression.ZipFile]::Open($unsignedApk, [System.IO.Compression.ZipArchiveMode]::Create)

foreach ($file in $files) {
    $relPath = $file.FullName.Substring($tempDir.Length + 1).Replace('\', '/')
    if ($relPath) {
        $entry = $zip.CreateEntry($relPath)
        $entryStream = $entry.Open()
        $fileStream = [System.IO.File]::OpenRead($file.FullName)
        $fileStream.CopyTo($entryStream)
        $fileStream.Close()
        $entryStream.Close()
    }
}
$zip.Dispose()
```

#### 步骤 4: 重新签名

使用之前创建的签名脚本：

```powershell
# 使用 apksigner 重新签名
$apksigner = "C:\Users\hp\AppData\Local\Android\Sdk\build-tools\36.1.0\apksigner.bat"
$keystorePath = "keystores(android)\multigpt-key.jks"
$alias = "multigpt-alias"
$storePassword = "Zyx!213416"
$keyPassword = "Zyx!213416"
$outputPath = "C:\Users\hp\Desktop\app_new-updated.apk"

& $apksigner sign `
    --ks $keystorePath `
    --ks-key-alias $alias `
    --ks-pass "pass:$storePassword" `
    --key-pass "pass:$keyPassword" `
    --v1-signing-enabled true `
    --v2-signing-enabled true `
    --v3-signing-enabled true `
    --out $outputPath `
    $unsignedApk

# 清理临时文件
Remove-Item -Path $tempDir -Recurse -Force
```

### 方法 2: 使用自动化脚本

我已经为你创建了一个自动化脚本（见下方）。

## 📝 需要修改的配置项

在 `appConfig.json` 中，你可能需要修改以下 URL 相关配置：

### 1. 主要 URL（必需）

```json
"general": {
  "initialUrl": "https://your-new-url.vercel.app"  // 应用启动时加载的 URL
}
```

### 2. 侧边栏菜单 URL（可选）

```json
"navigation": {
  "sidebarNavigation": {
    "menus": [{
      "items": [
        {
          "url": "https://your-new-url.vercel.app/",  // 更新所有菜单项 URL
          "label": "Home"
        },
        // ... 其他菜单项
      ]
    }]
  }
}
```

### 3. 内部/外部链接规则（可选）

```json
"navigation": {
  "regexInternalExternal": {
    "rules": [
      {
        "regex": "https?:\\/\\/([-\\w]+\\.)*vercel.app(\\/.*)?$",  // 更新域名规则
        "mode": "internal",
        "label": "All pages on my domain"
      }
    ]
  }
}
```

## 🚀 快速更新脚本

创建一个自动化脚本来更新 URL：

```powershell
# update-apk-url.ps1
param(
    [Parameter(Mandatory=$true)]
    [string]$NewUrl,
    
    [string]$ApkPath = "$env:USERPROFILE\Desktop\app_new-signed.apk",
    [string]$OutputPath = "$env:USERPROFILE\Desktop\app_new-updated.apk"
)

# ... (完整脚本见下方)
```

## ⚠️ 重要提示

1. **每次修改 URL 后都需要重新签名**
   - 修改配置文件后，APK 的签名会失效
   - 必须使用相同的 keystore 重新签名

2. **保持 keystore 一致**
   - 使用相同的 keystore 文件签名所有版本
   - 这样用户才能正常更新应用

3. **测试新 URL**
   - 在修改前，确保新 URL 可以正常访问
   - 检查 HTTPS 证书是否有效

4. **Vercel URL 可能会变化**
   - 如果重新部署，Vercel 可能会生成新的 URL
   - 建议设置自定义域名，避免 URL 变化

## 📚 相关文件

- Keystore 信息：`KEYSTORE_INFO.md`
- 签名脚本：`sign-apk-with-apksigner.ps1`
- Vercel 部署：`docs/VERCEL_DEPLOYMENT.md`

## 🔗 设置自定义域名（推荐）

为了避免 URL 变化，建议在 Vercel 中设置自定义域名：

1. 在 Vercel Dashboard 中打开项目
2. 进入 **Settings** > **Domains**
3. 添加你的自定义域名
4. 按照提示配置 DNS 记录
5. 更新 APK 中的 URL 为自定义域名

这样即使重新部署，URL 也不会变化。









