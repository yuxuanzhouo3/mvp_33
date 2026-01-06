# APK 重新签名脚本 - 简化版
# 直接对 APK 文件进行重新签名（无需 Android 项目）

param(
    [string]$ApkPath = "$env:USERPROFILE\Desktop\app_new.apk",
    [string]$OutputPath = "$env:USERPROFILE\Desktop\app_new-signed.apk"
)

# 配置信息
$keystorePath = "$PSScriptRoot\keystores(android)\multigpt-key.jks"
$alias = "multigpt-alias"
$storePassword = "Zyx!213416"
$keyPassword = "Zyx!213416"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "APK 重新签名工具" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
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

# 找到 jarsigner
try {
    $javaHome = (Get-Command java).Source | Split-Path -Parent | Split-Path -Parent
    $jarsigner = Join-Path $javaHome "bin\jarsigner.exe"
    
    if (-not (Test-Path $jarsigner)) {
        Write-Host "错误: jarsigner 未找到，请确保已安装 Java JDK" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "错误: 未找到 Java，请先安装 Java JDK" -ForegroundColor Red
    exit 1
}

Write-Host "输入 APK: $ApkPath" -ForegroundColor Yellow
Write-Host "输出 APK: $OutputPath" -ForegroundColor Yellow
Write-Host "Keystore: $keystorePath" -ForegroundColor Yellow
Write-Host ""

# 创建临时目录
$tempDir = "$env:TEMP\apk-resign-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    Write-Host "步骤 1/4: 解压 APK..." -ForegroundColor Cyan
    
    # 使用 .NET 方法解压
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ApkPath, $tempDir, $true)
    Write-Host "  ✓ APK 已解压" -ForegroundColor Green
    
    Write-Host "步骤 2/4: 删除旧签名..." -ForegroundColor Cyan
    
    # 删除所有 META-INF 文件夹（可能包含多个签名）
    $metaInfDirs = Get-ChildItem -Path $tempDir -Directory -Filter "META-INF" -Recurse -ErrorAction SilentlyContinue
    foreach ($dir in $metaInfDirs) {
        Remove-Item -Path $dir.FullName -Recurse -Force
        Write-Host "  ✓ 已删除: $($dir.FullName)" -ForegroundColor Green
    }
    
    if ($metaInfDirs.Count -eq 0) {
        Write-Host "  ℹ 未找到 META-INF 文件夹（可能已经是未签名状态）" -ForegroundColor Yellow
    }
    
    Write-Host "步骤 3/4: 重新打包 APK..." -ForegroundColor Cyan
    
    $unsignedApk = "$tempDir\unsigned.apk"
    if (Test-Path $unsignedApk) {
        Remove-Item -Path $unsignedApk -Force
    }
    
    # 获取所有文件
    $allFiles = Get-ChildItem -Path $tempDir -File -Recurse
    
    # 创建新的 ZIP/APK
    $zip = [System.IO.Compression.ZipFile]::Open($unsignedApk, [System.IO.Compression.ZipArchiveMode]::Create)
    
    $fileCount = 0
    foreach ($file in $allFiles) {
        $relativePath = $file.FullName.Substring($tempDir.Length + 1).Replace('\', '/')
        if ($relativePath -and -not $relativePath.StartsWith('unsigned.apk')) {
            try {
                $entry = $zip.CreateEntry($relativePath)
                $entryStream = $entry.Open()
                $fileStream = [System.IO.File]::OpenRead($file.FullName)
                $fileStream.CopyTo($entryStream)
                $fileStream.Close()
                $entryStream.Close()
                $fileCount++
            } catch {
                Write-Host "  警告: 无法添加文件 $relativePath" -ForegroundColor Yellow
            }
        }
    }
    
    $zip.Dispose()
    Write-Host "  ✓ 已打包 $fileCount 个文件" -ForegroundColor Green
    
    Write-Host "步骤 4/4: 签名 APK..." -ForegroundColor Cyan
    
    # 使用 jarsigner 签名
    $jarsignerArgs = @(
        "-verbose",
        "-sigalg", "SHA256withRSA",
        "-digestalg", "SHA256",
        "-keystore", $keystorePath,
        "-storepass", $storePassword,
        "-keypass", $keyPassword,
        $unsignedApk,
        $alias
    )
    
    $signResult = & $jarsigner $jarsignerArgs 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        # 复制到输出位置
        Copy-Item -Path $unsignedApk -Destination $OutputPath -Force
        Write-Host "  ✓ 签名完成" -ForegroundColor Green
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "签名成功！" -ForegroundColor Green
        Write-Host "输出文件: $OutputPath" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        
        # 验证签名
        Write-Host "验证签名..." -ForegroundColor Yellow
        $verifyResult = & $jarsigner -verify -verbose -certs $OutputPath 2>&1 | Select-Object -Last 3
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ 签名验证通过" -ForegroundColor Green
        } else {
            Write-Host "⚠ 签名验证有警告（可能是自签名证书）" -ForegroundColor Yellow
        }
    } else {
        Write-Host ""
        Write-Host "错误: 签名失败" -ForegroundColor Red
        Write-Host $signResult -ForegroundColor Red
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









