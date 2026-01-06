# APK 签名脚本 - 使用 apksigner（推荐）
# 使用方法: .\sign-apk-with-apksigner.ps1 -ApkPath "你的APK路径.apk"

param(
    [Parameter(Mandatory=$false)]
    [string]$ApkPath = "$env:USERPROFILE\Desktop\app_new.apk",
    
    [Parameter(Mandatory=$false)]
    [string]$OutputPath = ""
)

# 如果未指定输出路径，自动生成
if ([string]::IsNullOrEmpty($OutputPath)) {
    $OutputPath = $ApkPath -replace '\.apk$', '-signed.apk'
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

if (-not (Test-Path $androidHome)) {
    Write-Host "错误: 未找到 Android SDK" -ForegroundColor Red
    Write-Host "请设置 ANDROID_HOME 环境变量或安装 Android SDK" -ForegroundColor Yellow
    exit 1
}

$buildTools = Get-ChildItem "$androidHome\build-tools" -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $buildTools) {
    Write-Host "错误: 未找到 build-tools" -ForegroundColor Red
    exit 1
}

$apksigner = Join-Path $buildTools.FullName "apksigner.bat"
if (-not (Test-Path $apksigner)) {
    Write-Host "错误: 未找到 apksigner" -ForegroundColor Red
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "APK 签名工具 (使用 apksigner)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "输入 APK: $ApkPath" -ForegroundColor Yellow
Write-Host "输出 APK: $OutputPath" -ForegroundColor Yellow
Write-Host "Keystore: $keystorePath" -ForegroundColor Yellow
Write-Host "apksigner: $apksigner" -ForegroundColor Yellow
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
$tempDir = "$env:TEMP\apk-sign-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    Write-Host "步骤 1/3: 删除旧签名..." -ForegroundColor Cyan
    
    # 解压 APK
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ApkPath, $tempDir, $true)
    
    # 删除 META-INF
    $metaInfDirs = Get-ChildItem -Path $tempDir -Directory -Filter "META-INF" -Recurse -ErrorAction SilentlyContinue
    foreach ($dir in $metaInfDirs) {
        Remove-Item -Path $dir.FullName -Recurse -Force
    }
    
    Write-Host "  ✓ 已删除旧签名" -ForegroundColor Green
    
    Write-Host "步骤 2/3: 重新打包..." -ForegroundColor Cyan
    
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
    
    Write-Host "步骤 3/3: 使用 apksigner 签名..." -ForegroundColor Cyan
    
    # 使用 apksigner 签名（支持 v1, v2, v3）
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
        Write-Host "签名成功！" -ForegroundColor Green
        Write-Host "输出文件: $OutputPath" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        
        # 验证签名
        Write-Host "验证签名..." -ForegroundColor Yellow
        & $apksigner verify --verbose $OutputPath
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
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
    exit 1
} finally {
    # 清理临时文件
    if (Test-Path $tempDir) {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}









