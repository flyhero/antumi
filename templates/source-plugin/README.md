# Antumi 来源插件模板

复制到独立仓库，修改 package.json 的包名、manifest.json 的插件 ID/来源 ID/名称，以及 src/source.ts 的来源 ID。设置字段在 manifest 中声明。完整的接口说明、本地验证、GitHub Release 分发和推荐申请见 [插件开发指南](https://github.com/flyhero/antumi/blob/main/docs/PLUGINS.md)。

要求 Node >=22.13。SDK npm 包首次发布前，先在 Antumi 主仓库生成 tgz，复制到新仓库 vendor/，再运行：

```sh
npm install ./vendor/antumi-plugin-sdk-0.1.2.tgz
npm install
npm run check
```

SDK 正式发布后可使用 package.json 中的 npm 版本依赖。使用本地 SDK 时一起提交 vendor/*.tgz 和 package-lock.json，保证 CI 可使用 npm ci。发布前将 engines.antumi 改为实际验证过的宿主版本范围。

构建生成 dist/plugin/manifest.json、dist/plugin/main.mjs 和 dist 下带版本号的 ZIP，ZIP 根目录直接包含前两个文件。可在 Antumi「设置 → 插件」安装 dist/plugin 目录或 ZIP；GitHub Release 的 ZIP 也可以按 owner/repository 安装。CI 只验证并上传构建产物，不自动创建 Release。

实现 SourcePlugin 的登录、列表和详情方法，网络请求必须接收 signal；不要把 Token 放进设置、原文快照或日志。API 地址字段声明 bindsCredential: true。stdout 只供 SDK 通信使用。
