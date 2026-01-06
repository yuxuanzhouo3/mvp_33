# APK 重新签名脚本 - 正确版本
# 先删除旧签名，然后重新签名

# 配置信息
$apkPath = "$env:USERPROFILE\Desktop\app_new.apk"
$keystorePath = "$PSScriptRoot\keystores(android)\multigpt-key.jks"
$alias = "multigpt-alias"
$storePassword = "Zyx!213416"
$keyPassword = "Zyx!213416"
$outputApk = "$env:USERPROFILE\Desktop\app_new-signed.apk"

# 检查文件是否存在
if (-not (Test-Path $apkPath)) {
    Write-Host "错误: APK 文件不存在: $apkPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $keystorePath)) {
    Write-Host "错误: Keystore 文件不存在: $keystorePath" -ForegroundColor Red
    exit 1
}

# 找到 jarsigner
$javaHome = (Get-Command java).Source | Split-Path -Parent | Split-Path -Parent
$jarsigner = Join-Path $javaHome "bin\jarsigner.exe"

if (-not (Test-Path $jarsigner)) {
    Write-Host "错误: jarsigner 未找到" -ForegroundColor Red
    exit 1
}

Write-Host "开始重新签名 APK..." -ForegroundColor Green
Write-Host "APK: $apkPath" -ForegroundColor Cyan
Write-Host "Keystore: $keystorePath" -ForegroundColor Cyan
Write-Host "Alias: $alias" -ForegroundColor Cyan

# 创建临时目录
$tempDir = "$env:TEMP\apk-resign-$(Get-Random)"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    # 1. 解压 APK（使用 .NET 方法，因为 APK 是 zip 格式）
    Write-Host ""
    Write-Host "步骤 1: 解压 APK..." -ForegroundColor Yellow
    
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($apkPath, $tempDir)
    Write-Host "APK 已解压" -ForegroundColor Green
    
    # 2. 删除旧的签名（META-INF 文件夹）
    Write-Host "步骤 2: 删除旧签名..." -ForegroundColor Yellow
    $metaInfPath = Join-Path $tempDir "META-INF"
    if (Test-Path $metaInfPath) {
        Remove-Item -Path $metaInfPath -Recurse -Force
        Write-Host "已删除 META-INF 文件夹" -ForegroundColor Green
    } else {
        Write-Host "未找到 META-INF 文件夹" -ForegroundColor Yellow
    }
    
    # 3. 重新打包成 zip（APK 格式）
    Write-Host "步骤 3: 重新打包..." -ForegroundColor Yellow
    $unsignedApk = "$tempDir\unsigned.apk"
    if (Test-Path $unsignedApk) {
        Remove-Item -Path $unsignedApk -Force
    }
    
    # 获取所有文件（不包括目录本身）
    $files = Get-ChildItem -Path $tempDir -File -Recurse
    
    # 创建新的 APK 文件
    $zip = [System.IO.Compression.ZipFile]::Open($unsignedApk, [System.IO.Compression.ZipArchiveMode]::Create)
    foreach ($file in $files) {
        $relativePath = $file.FullName.Substring($tempDir.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $relativePath) | Out-Null
    }
    $zip.Dispose()
    
    Write-Host "未签名 APK 已创建" -ForegroundColor Green
    
    # 4. 用 jarsigner 签名（自动使用密码）
    Write-Host ""
    Write-Host "步骤 4: 使用 keystore 签名..." -ForegroundColor Yellow
    
    # jarsigner 使用密码自动签名
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
    
    & $jarsigner $jarsignerArgs
    
    if ($LASTEXITCODE -eq 0) {
        # 5. 复制到输出位置
        Copy-Item -Path $unsignedApk -Destination $outputApk -Force
        Write-Host ""
        Write-Host "签名完成！" -ForegroundColor Green
        Write-Host "输出文件: $outputApk" -ForegroundColor Cyan
        
        # 6. 验证签名
        Write-Host ""
        Write-Host "步骤 5: 验证签名..." -ForegroundColor Yellow
        & $jarsigner -verify -verbose -certs $outputApk
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "签名验证成功！" -ForegroundColor Green
        } else {
            Write-Host ""
            Write-Host "签名验证失败" -ForegroundColor Yellow
        }
    } else {
        Write-Host ""
        Write-Host "签名失败，请检查密码是否正确" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "错误: $_" -ForegroundColor Red
    exit 1
} finally {
    # 清理临时文件
    if ($tempDir -and (Test-Path $tempDir)) {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}









