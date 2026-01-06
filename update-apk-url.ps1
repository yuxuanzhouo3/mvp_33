# APK URL 更新脚本
# 使用方法: .\update-apk-url.ps1 -NewUrl "https://your-new-url.vercel.app"

param(
    [Parameter(Mandatory=$true)]
    [string]$NewUrl,
    
    [string]$ApkPath = "$env:USERPROFILE\Desktop\app_new-signed.apk",
    [string]$OutputPath = ""
)

# 如果未指定输出路径，自动生成
if ([string]::IsNullOrEmpty($OutputPath)) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputPath = $ApkPath -replace '\.apk$', "-updated-$timestamp.apk"
}

# 配置信息
$keystorePath = "$PSScriptRoot\keystores(android)\multigpt-key.jks"
$alias = "multigpt-alias"
$storePassword = "Zyx!213416"
$keyPassword = "Zyx!213416"

# 查找 apksigner
$androidHome = $env:ANDROID_HOME
if (-not $androidHome) {
    $androidHome = "$env:LOCALAPPDATA\Android\Sdk"
}

$buildTools = Get-ChildItem "$androidHome\build-tools" -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $buildTools) {
    Write-Host "错误: 未找到 Android build-tools" -ForegroundColor Red
    exit 1
}

$apksigner = Join-Path $buildTools.FullName "apksigner.bat"
if (-not (Test-Path $apksigner)) {
    Write-Host "错误: 未找到 apksigner" -ForegroundColor Red
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "APK URL 更新工具" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "输入 APK: $ApkPath" -ForegroundColor Yellow
Write-Host "新 URL: $NewUrl" -ForegroundColor Yellow
Write-Host "输出 APK: $OutputPath" -ForegroundColor Yellow
Write-Host ""

# 检查文件
if (-not (Test-Path $ApkPath)) {
    Write-Host "错误: APK 文件不存在: $ApkPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $keystorePath)) {
    Write-Host "错误: Keystore 文件不存在: $keystorePath" -ForegroundColor Red
    exit 1
}

# 创建临时目录
$tempDir = "$env:TEMP\apk-update-url-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    Write-Host "步骤 1/5: 解压 APK..." -ForegroundColor Cyan
    
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ApkPath, $tempDir, $true)
    Write-Host "  ✓ APK 已解压" -ForegroundColor Green
    
    Write-Host "步骤 2/5: 更新 appConfig.json..." -ForegroundColor Cyan
    
    $configPath = Join-Path $tempDir "assets\appConfig.json"
    if (-not (Test-Path $configPath)) {
        Write-Host "错误: 未找到 appConfig.json" -ForegroundColor Red
        exit 1
    }
    
    # 读取配置文件
    $configContent = Get-Content $configPath -Raw -Encoding UTF8
    $config = $configContent | ConvertFrom-Json
    
    # 保存旧 URL
    $oldUrl = $config.general.initialUrl
    Write-Host "  旧 URL: $oldUrl" -ForegroundColor Gray
    
    # 更新 URL
    $config.general.initialUrl = $NewUrl
    
    # 更新侧边栏菜单中的 URL（如果存在）
    if ($config.navigation.sidebarNavigation.menus) {
        foreach ($menu in $config.navigation.sidebarNavigation.menus) {
            if ($menu.items) {
                foreach ($item in $menu.items) {
                    if ($item.url -and $item.url -like "*$oldUrl*") {
                        $item.url = $item.url -replace [regex]::Escape($oldUrl), $NewUrl
                    }
                }
            }
        }
    }
    
    # 更新内部链接规则中的域名（如果使用 vercel.app）
    if ($config.navigation.regexInternalExternal -and $config.navigation.regexInternalExternal.rules) {
        foreach ($rule in $config.navigation.regexInternalExternal.rules) {
            if ($rule.regex -like "*vercel.app*") {
                # 提取新域名
                $newDomain = ([System.Uri]$NewUrl).Host
                $oldDomain = ([System.Uri]$oldUrl).Host
                $rule.regex = $rule.regex -replace [regex]::Escape($oldDomain), $newDomain
            }
        }
    }
    
    # 保存配置文件
    $updatedConfig = $config | ConvertTo-Json -Depth 100
    [System.IO.File]::WriteAllText($configPath, $updatedConfig, [System.Text.Encoding]::UTF8)
    
    Write-Host "  ✓ URL 已更新为: $NewUrl" -ForegroundColor Green
    
    Write-Host "步骤 3/5: 删除旧签名..." -ForegroundColor Cyan
    
    # 删除 META-INF
    $metaInfDirs = Get-ChildItem -Path $tempDir -Directory -Filter "META-INF" -Recurse -ErrorAction SilentlyContinue
    foreach ($dir in $metaInfDirs) {
        Remove-Item -Path $dir.FullName -Recurse -Force
    }
    Write-Host "  ✓ 已删除旧签名" -ForegroundColor Green
    
    Write-Host "步骤 4/5: 重新打包 APK..." -ForegroundColor Cyan
    
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
    
    Write-Host "  ✓ 已打包 $($files.Count) 个文件" -ForegroundColor Green
    
    Write-Host "步骤 5/5: 重新签名 APK..." -ForegroundColor Cyan
    
    & $apksigner sign `
        --ks $keystorePath `
        --ks-key-alias $alias `
        --ks-pass "pass:$storePassword" `
        --key-pass "pass:$keyPassword" `
        --v1-signing-enabled true `
        --v2-signing-enabled true `
        --v3-signing-enabled true `
        --out $OutputPath `
        $unsignedApk
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✓ 签名完成" -ForegroundColor Green
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "URL 更新成功！" -ForegroundColor Green
        Write-Host "输出文件: $OutputPath" -ForegroundColor Cyan
        Write-Host "新 URL: $NewUrl" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        
        # 验证签名
        Write-Host "验证签名..." -ForegroundColor Yellow
        & $apksigner verify --verbose $OutputPath | Out-Null
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ 签名验证通过" -ForegroundColor Green
        }
    } else {
        Write-Host ""
        Write-Host "错误: 签名失败" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host ""
    Write-Host "错误: $_" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    # 清理临时文件
    if (Test-Path $tempDir) {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}









