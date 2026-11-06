# Antumi Plugin SDK

为独立 Node 任务来源插件提供通信、协议校验、登录问答和标准错误。SDK 版本独立于 Antumi；目前使用插件协议 v1，适配支持该协议的 Antumi（插件自身在 manifest 中声明具体版本范围）。

```ts
import { runSourcePlugin } from '@antumi/plugin-sdk'
import manifest from '../manifest.json' with { type: 'json' }
import { source } from './source.js'

runSourcePlugin({ manifest, sources: [source] })
```

插件只依赖公开的 SDK，不引用 `@antumi/protocol` 或 core 源码。`manifest.json` 是名称、设置字段和入口的唯一来源；`sources` 必须与其中声明的来源 ID 一一对应。

## 来源接口

`SourcePlugin` 必须实现 `id`、`normalizeSettings`、`login`、`list` 和 `fetch`。

- `normalizeSettings(values)`：校验非敏感设置、应用默认值，返回字符串字典。无效设置抛出 `SourceError('invalid-settings', message)`。
- `normalizeKey(key)`：可选，校验并规范化事项编号；默认原样返回。
- `envCredential(env)`：可选，从 manifest 白名单中的环境变量读取凭据；默认返回 `null`。
- `login(session, settings, signal)`：使用 `session.prompt()` 顺序提问（`text` / `secret` / `select`），用 `session.notify()` 显示进度。成功返回经过平台验证的 `{ credential, account }`。
- `list(settings, credential, signal)`：返回最多 200 个 `SourceIssue`，在平台侧完成分页、筛选和状态映射。
- `fetch(settings, credential, key, signal)`：返回事项字段和最多 50,000 字符的 `markdown` 原文快照。SDK 0.1.1 起可附带 `images: [{ name, bytes: Uint8Array }]`（20 张、单张 10 MiB、合计 50 MiB），需要支持来源图片的宿主。SDK 负责 base64 编解码约定，宿主附件仓库验证实际图片。
- `fetch` 的第五个参数 `options`（SDK 0.1.2 起）：`options.images === false` 表示宿主想先拿到正文，图片会另调一次 `fetch` 来取。能分开取图的插件这时不下载图片，在结果里用 `imagesDeferred` 写明留下了几张；不理会这个参数、照常返回图片也可以。宿主排查问题时用它先让 Agent 开始，不让慢图片拖住。

设置和凭据由 core 保存；SDK 不读写用户配置、不访问数据库、不依赖 Electron。站点地址字段需要设置 `bindsCredential: true`，防止改地址后把旧凭据发到新站点。

传入的 `signal` 必须交给网络请求。宿主断开时会取消操作；宿主还会强制终止超时进程。登录问题必须逐个 `await`，最多 32 个。普通调用超时 120 秒，登录超时 15 分钟；宿主的同步、问题等待等限制可能更短。

## 错误和日志

预期错误使用 `SourceError`，支持的 `SourceFailure` 类型由 SDK 导出。错误消息会显示给用户，不能包含 Token、密码或完整响应正文。非预期错误统一显示通用消息。

stdout 专供协议使用；日志使用 stderr（例如 `console.error`），同样不得输出凭据。每个进程只执行握手及其后的一个操作，登录的所有问答共享这个进程；不要依赖跨操作的内存状态。

## 独立构建和安装

第一次开发可从 [完整开发指南](https://github.com/flyhero/antumi/blob/main/docs/PLUGINS.md) 开始，包含模板引导、SDK 本地包、接口说明、本地联调、GitHub Release 和推荐申请。

参考主仓库 `templates/source-plugin`：使用 esbuild 把 SDK 和依赖一起打包。安装包根目录必须有 `manifest.json` 和入口文件，不包含 `node_modules`，安装时不执行脚本。

在 Antumi「设置 → 插件」可以安装构建目录、ZIP 或 GitHub Release ZIP。目录安装会复制文件，修改源码后需要重新构建、增加插件版本并更新安装。

## 维护与发布 SDK

在 Antumi 主仓库运行：

```sh
pnpm --filter @antumi/plugin-sdk build
pnpm --filter @antumi/plugin-sdk pack --out /absolute/path/antumi-plugin-sdk-0.1.1.tgz
pnpm verify:plugin-sdk
```

构建从 `packages/protocol` 生成所需声明，并把运行时代码打包；发布包不依赖私有 workspace 包。协议定义只在 `packages/protocol` 修改，不编辑生成的 `dist`。

`verify:plugin-sdk` 把 SDK 打成 tgz，在仓库之外安装到模板项目，验证 NodeNext 类型（包含声明文件检查）、测试、构建和实际进程通信；运行需要访问依赖仓库。外置插件 ZIP 可用 `pnpm exec tsx scripts/verify-source-plugin.ts /path/plugin.zip` 验证解压、版本兼容和宿主加载，不访问用户数据或平台账号。

初次发布前，可将生成的 tgz 放进插件仓库 `vendor/`，以 `file:vendor/antumi-plugin-sdk-0.1.1.tgz` 依赖它；无需 npm 发布权限即可独立安装、构建。npm 正式发布后，把依赖改为正式版本并更新锁文件。SDK 维护者发布前需确认 npm 包名的所有权，执行全仓库检查和独立包验证；发布是单独操作。

SDK API 遵循语义化版本。只重构 SDK 不改变插件协议；更改协议时必须同步宿主支持和 `PLUGIN_PROTOCOL_VERSION`，不得让已经发布的 v1 插件失效。
