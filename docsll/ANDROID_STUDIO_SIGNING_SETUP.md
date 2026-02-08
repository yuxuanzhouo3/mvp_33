# Android Studio 签名配置指南

## 📋 前提条件

- 已安装 Android Studio
- 已有 Android 项目
- Keystore 文件：`keystores(android)\multigpt-key.jks`

## 🔑 Keystore 信息

- **Keystore 文件路径**: `keystores(android)\multigpt-key.jks`
- **Keystore 密码**: `Zyx!213416`
- **Key Alias**: `multigpt-alias`
- **Key Password**: `Zyx!213416`

## 📝 配置步骤

### 方法 1: 在 build.gradle 中配置（推荐）

#### 步骤 1: 打开项目

1. 在 Android Studio 中打开你的 Android 项目
2. 找到 `app/build.gradle` 或 `app/build.gradle.kts` 文件

#### 步骤 2: 配置签名信息

在 `android` 块中添加 `signingConfigs`：

**对于 Groovy (build.gradle):**

```gradle
android {
    // ... 其他配置
    
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
            // ... 其他 release 配置
        }
    }
}
```

**对于 Kotlin DSL (build.gradle.kts):**

```kotlin
android {
    // ... 其他配置
    
    signingConfigs {
        create("release") {
            storeFile = file("../keystores(android)/multigpt-key.jks")
            storePassword = "Zyx!213416"
            keyAlias = "multigpt-alias"
            keyPassword = "Zyx!213416"
        }
    }
    
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
            // ... 其他 release 配置
        }
    }
}
```

#### 步骤 3: 同步项目

1. 点击 **File** > **Sync Project with Gradle Files**
2. 或者点击工具栏上的 **Sync Now** 按钮

#### 步骤 4: 构建签名 APK

1. 点击 **Build** > **Generate Signed Bundle / APK**
2. 选择 **APK** 或 **Android App Bundle**
3. 选择你的 keystore 文件
4. 输入密码和别名
5. 选择 **release** build variant
6. 点击 **Finish**

### 方法 2: 使用 keystore.properties 文件（更安全）

#### 步骤 1: 创建 keystore.properties 文件

在项目根目录创建 `keystore.properties` 文件：

```properties
storePassword=Zyx!213416
keyPassword=Zyx!213416
keyAlias=multigpt-alias
storeFile=keystores(android)/multigpt-key.jks
```

**⚠️ 重要**: 将 `keystore.properties` 添加到 `.gitignore`，不要提交到版本控制！

#### 步骤 2: 在 build.gradle 中读取配置

**Groovy (build.gradle):**

```gradle
// 在文件顶部
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    // ... 其他配置
    
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

**Kotlin DSL (build.gradle.kts):**

```kotlin
// 在文件顶部
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = java.util.Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(java.io.FileInputStream(keystorePropertiesFile))
}

android {
    // ... 其他配置
    
    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            }
        }
    }
    
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

### 方法 3: 通过 Android Studio UI 配置

#### 步骤 1: 打开签名配置

1. 点击 **File** > **Project Structure**
2. 选择 **Modules** > **app**
3. 点击 **Signing Configs** 标签

#### 步骤 2: 添加签名配置

1. 点击 **+** 按钮添加新的签名配置
2. 填写以下信息：
   - **Name**: `release`
   - **Store File**: 选择 `keystores(android)/multigpt-key.jks`
   - **Store Password**: `Zyx!213416`
   - **Key Alias**: `multigpt-alias`
   - **Key Password**: `Zyx!213416`
3. 点击 **OK**

#### 步骤 3: 关联到 Build Type

1. 在同一个对话框中，切换到 **Build Types** 标签
2. 选择 **release**
3. 在 **Signing Config** 下拉菜单中选择 `release`
4. 点击 **OK**

## 🚀 构建和签名 APK

### 使用 Gradle 命令行

在项目根目录运行：

```bash
# Windows
gradlew assembleRelease

# Mac/Linux
./gradlew assembleRelease
```

签名后的 APK 会在：`app/build/outputs/apk/release/app-release.apk`

### 使用 Android Studio

1. 点击 **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)**
2. 等待构建完成
3. 点击通知中的 **locate** 链接查看 APK 位置

## ✅ 验证签名

构建完成后，可以使用以下命令验证签名：

```bash
# 使用 jarsigner 验证
jarsigner -verify -verbose -certs app-release.apk

# 或使用 apksigner（如果已安装 Android SDK）
apksigner verify --verbose app-release.apk
```

## 🔒 安全建议

1. **不要将密码提交到版本控制**
   - 使用 `keystore.properties` 文件（添加到 `.gitignore`）
   - 或使用环境变量

2. **备份 keystore 文件**
   - 妥善保管 keystore 文件和密码
   - 丢失后无法更新已发布的应用

3. **使用 CI/CD 时**
   - 将密码存储在 CI/CD 系统的密钥管理器中
   - 使用环境变量传递密码

## 📁 文件结构示例

```
your-android-project/
├── app/
│   └── build.gradle
├── keystores(android)/
│   └── multigpt-key.jks
├── keystore.properties  (可选，添加到 .gitignore)
└── build.gradle
```

## 🐛 常见问题

### 问题 1: 找不到 keystore 文件

**解决方案**: 检查文件路径是否正确，使用相对路径时从项目根目录开始。

### 问题 2: 密码错误

**解决方案**: 确认密码是 `Zyx!213416`（注意大小写和特殊字符）。

### 问题 3: 签名验证失败

**解决方案**: 
- 确保使用 `release` build type
- 检查 keystore 文件是否损坏
- 重新构建项目

## 📚 相关文档

- [Android 官方签名文档](https://developer.android.com/studio/publish/app-signing)
- [Keystore 信息](./KEYSTORE_INFO.md)









