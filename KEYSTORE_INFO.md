# Keystore 配置信息

## Keystore 文件位置
```
keystores(android)\multigpt-key.jks
```

## 配置值

### 1. Keystore 密码 (Store Password)
```
Zyx!213416
```

### 2. Key Alias (密钥别名)
```
multigpt-alias
```

### 3. Key Password (密钥密码)
```
Zyx!213416
```

## 证书信息

- **别名**: multigpt-alias
- **创建日期**: 2025年11月22日
- **有效期**: 2025年11月22日 - 2050年11月16日
- **证书主题**: CN=morn science, OU=mornscience, O=mornscience, L=ShenZhen, ST=GuangDong, C=86
- **密钥算法**: 2048位 RSA
- **签名算法**: SHA384withRSA

## 在 Android Gradle 中使用

在 `android/app/build.gradle` 或 `android/build.gradle` 中配置：

```gradle
android {
    signingConfigs {
        release {
            storeFile file('../keystores(android)/multigpt-key.jks')
            storePassword 'Zyx!213416'
            keyAlias 'multigpt-alias'
            keyPassword 'Zyx!213416'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

## 在环境变量中使用

如果使用环境变量（推荐，更安全）：

```gradle
android {
    signingConfigs {
        release {
            storeFile file('../keystores(android)/multigpt-key.jks')
            storePassword System.getenv("KEYSTORE_PASSWORD") ?: 'Zyx!213416'
            keyAlias System.getenv("KEY_ALIAS") ?: 'multigpt-alias'
            keyPassword System.getenv("KEY_PASSWORD") ?: 'Zyx!213416'
        }
    }
}
```

然后在 `.env` 或 CI/CD 配置中设置：
```
KEYSTORE_PASSWORD=Zyx!213416
KEY_ALIAS=multigpt-alias
KEY_PASSWORD=Zyx!213416
```

## 注意事项

⚠️ **安全提示**：
- 不要将密码提交到版本控制系统
- 在生产环境中使用环境变量或密钥管理服务
- 妥善保管 keystore 文件和密码









