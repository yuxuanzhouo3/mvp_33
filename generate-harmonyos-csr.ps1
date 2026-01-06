# 鸿蒙应用 CSR 生成脚本
# 使用方法: .\generate-harmonyos-csr.ps1

$alias = "harmonyos-release"
$password = "Zyx!213416"
$keystoreFile = "harmonyos-release.p12"
$csrFile = "harmonyos-release.csr"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "鸿蒙应用 CSR 生成工具" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Java keytool
try {
    $javaHome = (Get-Command java).Source | Split-Path -Parent | Split-Path -Parent
    $keytool = Join-Path $javaHome "bin\keytool.exe"
    
    if (-not (Test-Path $keytool)) {
        Write-Host "错误: 未找到 keytool" -ForegroundColor Red
        Write-Host "请确保已安装 Java JDK" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "错误: 未找到 Java，请先安装 Java JDK" -ForegroundColor Red
    exit 1
}

Write-Host "配置信息:" -ForegroundColor Yellow
Write-Host "  别名 (Alias): $alias" -ForegroundColor Gray
Write-Host "  密码: $password" -ForegroundColor Gray
Write-Host "  密钥库文件: $keystoreFile" -ForegroundColor Gray
Write-Host "  CSR 文件: $csrFile" -ForegroundColor Gray
Write-Host ""

# 检查文件是否已存在
if (Test-Path $keystoreFile) {
    $overwrite = Read-Host "密钥库文件已存在，是否覆盖？(y/n)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "已取消" -ForegroundColor Yellow
        exit 0
    }
    Remove-Item $keystoreFile -Force
}

if (Test-Path $csrFile) {
    $overwrite = Read-Host "CSR 文件已存在，是否覆盖？(y/n)"
    if ($overwrite -ne "y" -and $overwrite -ne "Y") {
        Write-Host "已取消" -ForegroundColor Yellow
        exit 0
    }
    Remove-Item $csrFile -Force
}

Write-Host "步骤 1/2: 生成密钥库..." -ForegroundColor Cyan

# 生成密钥库
& $keytool -genkeypair `
    -alias $alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity 9125 `
    -keystore $keystoreFile `
    -storetype PKCS12 `
    -storepass $password `
    -keypass $password `
    -dname "CN=morn science, OU=mornscience, O=mornscience, L=ShenZhen, ST=GuangDong, C=CN"

if ($LASTEXITCODE -ne 0) {
    Write-Host "错误: 生成密钥库失败" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ 密钥库已生成: $keystoreFile" -ForegroundColor Green

Write-Host "步骤 2/2: 生成 CSR 文件..." -ForegroundColor Cyan

# 生成 CSR
& $keytool -certreq `
    -alias $alias `
    -keystore $keystoreFile `
    -storepass $password `
    -file $csrFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "错误: 生成 CSR 失败" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ CSR 文件已生成: $csrFile" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "生成完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "生成的文件:" -ForegroundColor Yellow
Write-Host "  1. $keystoreFile (密钥库文件 - 请妥善保管)" -ForegroundColor Cyan
Write-Host "  2. $csrFile (CSR 文件 - 上传到华为平台)" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步操作:" -ForegroundColor Yellow
Write-Host "  1. 登录华为开发者平台: https://developer.huawei.com/" -ForegroundColor White
Write-Host "  2. 账号: 18870661556" -ForegroundColor White
Write-Host "  3. 进入: 我的项目 > 证书管理 > 证书与 App ID" -ForegroundColor White
Write-Host "  4. 选择: 创建证书 > 发布类型证书" -ForegroundColor White
Write-Host "  5. 上传: $csrFile" -ForegroundColor White
Write-Host "  6. 下载: 华为平台生成的证书文件" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  重要提示:" -ForegroundColor Red
Write-Host "  - 妥善保管密钥库文件 ($keystoreFile)" -ForegroundColor Yellow
Write-Host "  - 密码: $password" -ForegroundColor Yellow
Write-Host "  - 别名: $alias" -ForegroundColor Yellow
Write-Host "  - 丢失后无法找回，将无法更新应用！" -ForegroundColor Yellow
Write-Host ""






