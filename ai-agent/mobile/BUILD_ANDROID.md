# WorkHogee Android APP 构建指南

## 方式一：GitHub Actions 自动构建（推荐）

已配置 GitHub Actions 自动构建，推送代码到 `main` 分支后会自动构建 APK。

1. 推送代码到 GitHub
2. 进入仓库的 **Actions** 页面
3. 找到最新的 **Build Android APK** 工作流
4. 下载 **workhogee-android-apk** 产物中的 APK 文件

## 方式二：本地构建

### 环境要求

- **Java JDK 17** 或更高版本
- **Android SDK**（含 Android SDK Build-Tools、Android SDK Platform-Tools）
- **Node.js 18** 或更高版本
- **npm** 或 **yarn**

### 步骤

#### 1. 安装 Java JDK

下载并安装 [JDK 17](https://adoptium.net/temurin/releases/?version=17)

设置环境变量：
```bash
JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot
PATH=%JAVA_HOME%\bin;%PATH%
```

#### 2. 安装 Android SDK

下载 [Android Studio](https://developer.android.com/studio) 或 [Android 命令行工具](https://developer.android.com/studio#command-tools)

安装以下 SDK 组件：
- Android SDK Platform 34
- Android SDK Build-Tools 34.0.0
- Android SDK Platform-Tools

设置环境变量：
```bash
ANDROID_HOME=C:\Users\<用户名>\AppData\Local\Android\Sdk
PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\tools;%PATH%
```

#### 3. 安装项目依赖

```bash
cd ai-agent/mobile
npm install
```

#### 4. 生成 Android 原生项目

```bash
npx expo prebuild --platform android
```

#### 5. 构建 APK

```bash
cd android
./gradlew assembleRelease
```

构建完成后，APK 文件位于：
```
android/app/build/outputs/apk/release/app-release.apk
```

#### 6. 安装到手机

```bash
adb install app/build/outputs/apk/release/app-release.apk
```

## 配置说明

### API 地址配置

编辑 `app.json` 中的 `extra.apiBaseUrl`：

```json
{
  "expo": {
    "extra": {
      "apiBaseUrl": "http://你的服务器地址:3000/api"
    }
  }
}
```

### 应用签名（可选）

生成签名密钥：
```bash
keytool -genkeypair -v -storetype PKCS12 -keystore my-upload-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

配置 `android/gradle.properties`：
```
MYAPP_UPLOAD_STORE_FILE=my-upload-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=my-key-alias
MYAPP_UPLOAD_STORE_PASSWORD=*****
MYAPP_UPLOAD_KEY_PASSWORD=*****
```

## 常见问题

### Q: 构建失败，提示找不到 SDK
A: 确保 `ANDROID_HOME` 环境变量正确设置，并且已安装所需的 SDK 组件。

### Q: Java 版本不兼容
A: 确保使用 JDK 17 或更高版本，运行 `java -version` 检查。

### Q: 网络问题导致依赖下载失败
A: 配置 npm 镜像：`npm config set registry https://registry.npmmirror.com`

### Q: APK 安装后无法连接服务器
A: 确保手机和服务器在同一网络，或服务器有公网访问地址，并在 `app.json` 中配置正确的 API 地址。
