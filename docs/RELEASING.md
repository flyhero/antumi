# 发版与打包

按顺序照做即可，不需要其他上下文。打包原理、签名和安装排错见 [ARCHITECTURE.md §8 打包与安装](ARCHITECTURE.md#8-打包与安装)。

先分清用户要哪一种：

| 用户说的 | 做什么 | 改文件吗 | 对外可见吗 |
| --- | --- | --- | --- |
| 「打个包」「打个 dmg 试试」「打个 beta 包」 | [本地打包](#本地打包)，不升版本 | 不改 | 否 |
| 「升级版本」「发版」「release」 | [正式发版](#正式发版)第 1–4 步：升版本号、写更新日志、提交 | 改 | 否 |
| 「推送」「发布到 GitHub」「打标签」 | [正式发版](#正式发版)第 5 步：推送提交和标签，触发自动发布 | 不改 | **是**，先跟用户确认 |

## 版本号规则

[语义化版本](https://semver.org/lang/zh-CN/)，1.0 之前：

- `CHANGELOG.md` 的「未发布」里有 `### 破坏性改动` → 升第二位，第三位归零：`0.19.1` → `0.20.0`。
- 其他情况（新功能、改进、修复）→ 升第三位：`0.19.1` → `0.19.2`。
- 预发布在后面加后缀：`0.19.2-beta.1`、`0.19.2-beta.2`。带 `-` 的版本在 GitHub 上标为 Pre-release，不会成为 Latest。

`PROTOCOL_VERSION`（`packages/protocol/src/rpc.ts`）和 `DAEMON_PROTOCOL_VERSION` 是通信协议的版本号，单独计数，**发版时不要动**。只有改了协议的那次提交才升它们。

当前版本：

```bash
node -p 'require("./package.json").version'
```

## 本地打包

只在本机生成安装包，不改任何文件。在仓库根目录执行：

```bash
pnpm install
pnpm dist:mac    # → packages/desktop/dist/Antumi-<版本>-macos-arm64.dmg（Apple 芯片）
pnpm dist:win    # → packages/desktop/dist/Antumi-<版本>-windows-x64.exe（macOS 上也能打）
pnpm dist:linux  # → packages/desktop/dist/Antumi-<版本>-linux-x86_64.AppImage 和 -linux-amd64.deb（只能在 Linux 上打，要有 C++ 编译器和 python3）
```

`<版本>` 取自 `packages/desktop/package.json`。耗时约 1–3 分钟。日志里出现 `skipped macOS application code signing … 0 valid identities found` 是正常的：没有 Apple 证书，App 走 ad-hoc 签名。

**打一个带 beta 版本号的包，但不改仓库**：把构建拆开，给 electron-builder 临时覆盖版本号（`<下一版>` 按上面的规则算）：

```bash
cd packages/desktop
pnpm exec electron-vite build
node scripts/bundle-backend.mjs --platform darwin
pnpm exec electron-builder --mac --publish never -c.extraMetadata.version=<下一版>-beta.1
# → packages/desktop/dist/Antumi-<下一版>-beta.1-macos-arm64.dmg
```

打完检查（mac）：

```bash
cd packages/desktop
/usr/libexec/PlistBuddy -c "Print CFBundleShortVersionString" dist/mac-arm64/Antumi.app/Contents/Info.plist   # 应为期望的版本号
codesign --verify --deep --strict dist/mac-arm64/Antumi.app && echo 签名完好
hdiutil verify dist/Antumi-<版本>-macos-arm64.dmg                                                                # 末行应为 VALID
```

`packages/desktop/dist/` 不进 git，产物留在那里，把完整路径告诉用户即可。

## 正式发版

在 `main` 上做。当前不在 `main`（例如在 `dev`）时，先问用户在哪个分支发版，不要自己合并或切分支。开始前 `git status` 应当是干净的，有别人的未提交改动就停下来问。

### 1. 定版本号

按[版本号规则](#版本号规则)，从 `CHANGELOG.md` 的「未发布」和当前版本算出新版本，下文记为 `X.Y.Z`。「未发布」下面没有任何条目时，没有可发布的内容，停下来问用户。

### 2. 改五个 `package.json` 的 `version`

必须五个一致，Release 工作流会逐个校验：

- `package.json`
- `packages/core/package.json`
- `packages/daemon/package.json`
- `packages/desktop/package.json`
- `packages/protocol/package.json`

`packages/plugin-sdk/package.json` 的 SDK 版本独立，**不要跟随应用版本修改**。四个推荐来源插件在独立的 `antumi-plugin-*` 仓库维护与发布，应用只维护 `packages/core/src/plugins-recommended.json` 中的推荐信息；不要将插件 ZIP 放入应用分发包。`pnpm-lock.yaml` 不记录上述五个应用包的版本号，不用改，也不用重新 `pnpm install`。

一条命令改完（把 `X.Y.Z` 换成新版本），再核对：

```bash
node -e 'const fs=require("fs");for(const d of [".","packages/core","packages/daemon","packages/desktop","packages/protocol"]){const f=d+"/package.json";fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/"version": "[^"]+"/,`"version": "${process.argv[1]}"`))}' X.Y.Z
node -e 'for (const d of [".","packages/core","packages/daemon","packages/desktop","packages/protocol"]) console.log(d, require("./"+d+"/package.json").version)'
```

两份 README 顶部的版本徽章是静态的（shields.io 读 GitHub 的动态徽章时常返回 520，图会裂），也要改成新版本（预发布版本号里的连字符要写成两个，如 `0.21.4--beta.1`，shields.io 把单个连字符当分隔符）：

```bash
sed -i '' 's#badge/version-.*-blue#badge/version-X.Y.Z-blue#' README.md README.en.md
```

### 3. 改 `CHANGELOG.md`

在 `## 未发布` 下面插入一行版本标题，原来「未发布」里的条目就归到这个版本下；`## 未发布` 本身保留，下面留空。日期用今天（`date +%F`），中间是长破折号 `—`，工作流靠这个格式找发布说明：

```diff
 ## 未发布

+## X.Y.Z — 2026-10-20
+
 ### 改进

 - ……
```

发版前按 [AGENTS.md 的「Changelog」](../AGENTS.md#changelog) 过一遍条目：超出长度的精简成一两句，意思不变；别的不要改写。

### 4. 校验并提交

```bash
pnpm typecheck && pnpm test && pnpm build
git add package.json packages/core/package.json packages/daemon/package.json packages/desktop/package.json packages/protocol/package.json CHANGELOG.md
git commit -m "build: release X.Y.Z" -m "Align the application and workspace package versions at X.Y.Z and record the accumulated changes in the changelog."
```

提交里只能有这六个文件。需要安装包时，再按[本地打包](#本地打包)执行 `pnpm dist:mac`，此时不需要 `extraMetadata`，产物名就是新版本。

### 5. 推送并发布（对外，先确认）

这一步会在 GitHub 上公开发布，发出去的 Release 不能覆盖。**用户明确说要推送或发布之后才做**：

```bash
git push origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

标签一推送，[Release 工作流](../.github/workflows/release.yml)自动运行：

1. 校验标签格式，五个 `package.json` 的版本必须等于标签去掉 `v`，`CHANGELOG.md` 里必须有非空的 `## X.Y.Z` 段落；然后跑类型检查和测试。
2. 分别在 macOS、Windows 和 Linux 上执行 `dist:mac`、`dist:win` 和 `dist:linux`。
3. 创建 GitHub Release，标题 `Antumi vX.Y.Z`，说明取自 CHANGELOG 的这一段，附上 DMG、EXE、AppImage、deb 和它们的 `SHA256SUMS`（App 在 GitHub 接口限流、改读发布订阅时，靠它校验安装包）。

查看进度：`gh run list --workflow=Release --limit 3`，`gh run watch <id>`。

## Android 手机端

手机端（`packages/mobile`）不上应用商店，在 GitHub Releases 提供 APK，和桌面端分开发版：版本号只在 `packages/mobile/package.json` 和 `app.json`（`expo.version`，`android.versionCode` 每次加一）里改，不跟随上面五个 `package.json`，标签用 `mobile-vX.Y.Z`。App 的「检查更新」只认这种标签、带 `.apk` 附件的 Release。

打包要本机装好 JDK 17 和 Android SDK，还要一把发布签名密钥。密钥只有一把，离线备份，永远不换：换了密钥，已安装的用户只能卸载重装。

密钥文件和密码不进仓库，写在本机的 `~/.gradle/gradle.properties`（权限 600）：

```properties
ANTUMI_RELEASE_STORE_FILE=/绝对路径/antumi-release.jks
ANTUMI_RELEASE_KEY_ALIAS=…
ANTUMI_RELEASE_STORE_PASSWORD=…
ANTUMI_RELEASE_KEY_PASSWORD=…
```

`plugins/release-signing.js` 让 release 包用它签名；没有这几项时退回调试密钥，Gradle 日志里会警告这样的包不能发布。已发布的 APK 证书 SHA-256 是 `1f71e041034775a1f20d8ba1e436f0578d295d6a8274accba0fd919a03536355`，每次发布前核对：`$ANDROID_HOME/build-tools/37.0.0/apksigner verify --print-certs dist/*.apk`。

不装 Android Studio 也行：`brew install openjdk@17` 和 `brew install --cask android-commandlinetools`，接受许可（`sdkmanager --sdk_root=$HOME/Library/Android/sdk --licenses`）后装 `platform-tools`、`platforms;android-37.0`、`build-tools;37.0.0`、`ndk;27.1.12297006`、`cmake;3.22.1`（React Native 0.88 的要求，见 `react-native/gradle/libs.versions.toml`）。要模拟器再装 `emulator`、一个 arm64 系统镜像和 `cmdline-tools;latest`（Homebrew 那份 `avdmanager` 找不到这个 SDK 里的镜像）。

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
cd packages/mobile
pnpm prebuild:android          # 生成 android/（不提交）
cd android
rm -rf app/build/generated/assets/react app/build/generated/res/react   # 见下
./gradlew assembleRelease
cd .. && pnpm collect:apks     # 按发布用的名字复制到 dist/
# → dist/Antumi-X.Y.Z-android-arm64-v8a.apk、dist/Antumi-X.Y.Z-android-armeabi-v7a.apk
```

Gradle 会把打 JS 包的任务（`createBundleReleaseJsAndAssets`）误判为已是最新，monorepo 里别的包改了它看不出来，于是 APK 里还是旧的 JS。打包前删掉上面两个目录，强制重打。第一次编译要下载 1–2 GB 依赖，十分钟左右。

release 包按架构拆成两个 APK，每部手机只下载自己那一份：`arm64-v8a` 和 `armeabi-v7a`，即 `app.json` 里 `expo-build-properties` 的 `buildArchs`，由 `plugins/abi-splits.js` 拆开（debug 包仍是一个，`expo run:android` 照常用）。x86 的模拟器两个都装不上；Apple 芯片 Mac 上的模拟器是 arm64，装 `arm64-v8a` 那个。改了 `app.json` 要重新 `pnpm prebuild:android`，`android/` 才会跟上。

在模拟器或接了 USB 调试的手机上装：`adb install -r dist/Antumi-X.Y.Z-android-arm64-v8a.apk`；用 `adb shell am start -a android.intent.action.VIEW -d '<配对链接>' app.antumi.mobile` 打开配对链接，不用扫码。

发布前在真机上至少过一遍：扫码配对、确认码一致、看会话、回答确认、发消息和图片、撤销后被拒、断网重连。推标签前先问用户。

两个 APK 都传到 Release。Release 说明写清这一版需要的桌面端最低版本（手机端要求电脑上的 core 支持 `mobile`），再放上下面这段，把版本号换掉：

```markdown
### 选哪个安装包

- **Antumi-X.Y.Z-android-arm64-v8a.apk**：绝大多数手机选这个，近几年的安卓手机都是 64 位。
- **Antumi-X.Y.Z-android-armeabi-v7a.apk**：只给很老或很便宜的 32 位手机。

不确定就先装 arm64-v8a；提示「应用未安装」或「与设备不兼容」时，换另一个装就行。已经装了 Antumi 的，到 App 的 设置 → 检查更新，会直接给出适合这部手机的那个。
```

## 出错时

- **工作流报 `does not match`**：有 `package.json` 的版本和标签不一致。不要移动已推送的标签：补一个修正提交，打下一个版本号（或下一个 `-beta.N`）重新发。
- **工作流报 `CHANGELOG.md has no entry`**：标题格式不对。必须是 `## X.Y.Z` 或 `## X.Y.Z — 日期`，版本号前后没有 `v`。
- **构建中途失败**：留下的草稿 Release 可以重跑：Actions → Release → Run workflow，分支选 `main`，填已推送的标签。已经发布的 Release 拒绝覆盖。
- **本地 `dist:mac` 失败**：先单独跑 `pnpm build`，看是不是代码本身编译不过。
