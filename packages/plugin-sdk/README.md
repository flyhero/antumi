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
- `comments(settings, credential, key, signal, options)`：可选，manifest 里声明 `commentSync: 1` 的来源实现，增量返回评论。SDK 0.1.4 起每条评论可带 `images: [{ id, name }]`，列出评论里的图片（最多 20 张），只给编号不给内容。
- `image(settings, credential, key, id, signal)`：可选（SDK 0.1.4 起），返回评论里某张图片的 `{ name, bytes }`。宿主把评论发给 Agent 时才按 `images` 里的编号来取，同步评论时不下载图片；评论列出了图片就必须实现它。
- `fetch` 的第五个参数 `options`（SDK 0.1.2 起）：`options.images === false` 表示宿主想先拿到正文，图片会另调一次 `fetch` 来取。能分开取图的插件这时不下载图片，在结果里用 `imagesDeferred` 写明留下了几张；不理会这个参数、照常返回图片也可以。宿主排查问题时用它先让 Agent 开始，不让慢图片拖住。

设置和凭据由 core 保存；SDK 不读写用户配置、不访问数据库、不依赖 Electron。站点地址字段需要设置 `bindsCredential: true`，防止改地址后把旧凭据发到新站点。

传入的 `signal` 必须交给网络请求。宿主断开时会取消操作；宿主还会强制终止超时进程。登录问题必须逐个 `await`，最多 32 个。普通调用超时 120 秒，登录超时 15 分钟；宿主的同步、问题等待等限制可能更短。

## 错误和日志

预期错误使用 `SourceError`，支持的 `SourceFailure` 类型由 SDK 导出。错误消息会显示给用户，不能包含 Token、密码或完整响应正文。来源的非预期错误统一显示通用消息；页面处理器的 Error 消息会传给页面。

stdout 专供协议使用；日志使用 stderr（例如 `console.error`），同样不得输出凭据。每个进程只执行握手及其后的一个操作，登录的所有问答共享这个进程；不要依赖跨操作的内存状态。

## 独立构建和安装

第一次开发可从 [完整开发指南](https://github.com/flyhero/antumi/blob/main/docs/PLUGINS.md) 开始，包含模板引导、SDK 本地包、接口说明、本地联调、GitHub Release 和推荐申请。

参考主仓库 `templates/source-plugin`：使用 esbuild 把 SDK 和依赖一起打包。安装包根目录必须有 `manifest.json` 和入口文件，不包含 `node_modules`，安装时不执行脚本。

在 Antumi「设置 → 插件」可以安装构建目录、ZIP 或 GitHub Release ZIP。目录安装会复制文件，修改源码后需要重新构建、增加插件版本并更新安装。

## 维护与发布 SDK

在 Antumi 主仓库运行：

```sh
pnpm --filter @antumi/plugin-sdk build
pnpm --filter @antumi/plugin-sdk pack --out /absolute/path/antumi-plugin-sdk-0.3.0.tgz
pnpm verify:plugin-sdk
```

构建从 `packages/protocol` 生成所需声明，并把运行时代码打包；发布包不依赖私有 workspace 包。协议定义只在 `packages/protocol` 修改，不编辑生成的 `dist`。

`verify:plugin-sdk` 把 SDK 打成 tgz，在仓库之外安装到模板项目，验证 NodeNext 类型（包含声明文件检查）、测试、构建和实际进程通信；运行需要访问依赖仓库。外置插件 ZIP 可用 `pnpm exec tsx scripts/verify-source-plugin.ts /path/plugin.zip` 验证解压、版本兼容和宿主加载，不访问用户数据或平台账号。

初次发布前，可将生成的 tgz 放进插件仓库 `vendor/`，以 `file:vendor/antumi-plugin-sdk-0.3.0.tgz` 依赖它；无需 npm 发布权限即可独立安装、构建。npm 正式发布后，把依赖改为正式版本并更新锁文件。SDK 维护者发布前需确认 npm 包名的所有权，执行全仓库检查和独立包验证；发布是单独操作。

SDK API 遵循语义化版本。只重构 SDK 不改变插件协议；更改协议时必须同步宿主支持和 `PLUGIN_PROTOCOL_VERSION`，不得让已经发布的 v1 插件失效。

## Incremental comments (SDK 0.1.3)

A source can opt into comment synchronization with `commentSync: 1` in its manifest source entry and a `comments` implementation. Older sources remain compatible and are never sent this operation.

`fetch` returns optional `commentState: commentState(comments)` alongside the existing Markdown snapshot. Pass stable native IDs, author, creation and edit timestamps, a web URL, Markdown, and `truncated`. The initial snapshot can keep twenty comments, but its checkpoint must include **all** IDs sharing the newest creation timestamp. Never invent an ID from body text or an array offset.

`comments(settings, credential, key, signal, { checkpoint, continuation })` fetches all native pages down to the inclusive creation-time boundary, then returns `commentPage(comments, options)`. Each result contains at most 100 comments, an optional continuation, and a complete checkpoint. Keep fetching native pages until the boundary is covered; do not cap incremental results at twenty. The helper freezes the upper boundary during pagination and includes same-time identities so arrivals between calls are picked up next time. Native timestamps and identities must remain stable.

```ts
import { commentState, commentPage } from '@antumi/plugin-sdk'
// In fetch, use the same native response as the Markdown snapshot:
return { ...issue, markdown, commentState: commentState(nativeComments) }
// In comments, fetch down to options.checkpoint inclusively:
return commentPage(nativeComments, options)
```

Only complete checkpoints may advance after every page succeeds. Callers may repeat operations; keep stable identities so they can deduplicate. New comments are synchronized as external reference data and never wake an Agent automatically. Comment edits and deletions do not have a complete audit guarantee in this version.

## Pages (SDK 0.2.0)

Plugins may ship pages alongside sources, or pages alone. Declare each page in the manifest:

```json
{
  "id": "example.dashboard",
  "version": "1.0.0",
  "engines": { "antumi": ">=0.21.8 <1.0.0" },
  "contributes": {
    "pages": [{ "id": "dashboard", "label": "Dashboard", "entry": "page/index.html" }]
  },
  "entry": { "runtime": "node", "main": "main.mjs" }
}
```

The HTML entry must live in a subdirectory of the package. Antumi serves that directory recursively, including its JS, CSS and image assets. Page IDs and source IDs must match their registrations exactly. `runPlugin` accepts optional `sources` and `pages`; `runSourcePlugin` remains available with its existing signature.

A page may declare `icon: { path: 'M6 4v12h9' }` for its sidebar entry. The host draws the SVG path on a fixed `0 0 20 20` grid with a 1.6px rounded stroke in the current text color. Paths are limited to 1024 characters of SVG path commands and numbers; markup and image URLs are not accepted. Older hosts and pages without an icon use the generic plugin mark.

```ts
import { runPlugin, SourceError } from '@antumi/plugin-sdk'
import manifest from '../manifest.json' with { type: 'json' }

runPlugin({
  manifest,
  pages: {
    dashboard: {
      async summary(params, { signal }) {
        const response = await fetch('https://example.com/api/summary', { signal })
        if (!response.ok) throw new SourceError('request-failed', 'Could not load the summary')
        return response.json()
      }
    }
  }
})
```

Handlers have type `PluginPageHandler`; the registrations have type `PluginPages`. A handler receives unknown JSON params and `{ signal: AbortSignal }`, and returns a value or promise. Each call starts a fresh backend process: there is no memory between calls. Use the signal for I/O. Both `SourceError` and ordinary `Error` messages from page handlers reach the page; keep credentials out of them.

### Browser sessions (SDK 0.3.0)

Declare `browserSites: [{ id: 'forum', origin: 'https://forum.example', loginPath: '/login' }]` in the manifest. Page handlers receive `context.browser(request)`, available only when the host advertises `browser-sessions` during the handshake. If the site uses a separate HTTPS request origin, list it explicitly in `requestOrigins`. Older hosts reject this capability with an upgrade message.

Requests use `{ action: 'open' | 'status' | 'disconnect', site: 'forum' }`, or `{ action: 'request', site: 'forum', path: '/posts', method: 'GET' | 'POST', headers: {}, body?: string, bodyEncoding?: 'text' | 'base64' }`. Bodies are bounded to 4 MiB; for bytes (an upload's multipart form), send them base64-encoded with `bodyEncoding: 'base64'` and the host decodes them before sending. That needs a host advertising `browser-binary` (SDK 0.4.0); on an older one the SDK rejects the request rather than send the encoded text. Results contain `connected`, optionally `tabId`, and for a request `response: { status, headers, body }`. `connected` means a browser cookie exists, not that the account is authenticated: verify the site's current-user response. Opening is immediate; the user signs in on the actual website and returns to the plugin to check the account.

Sessions persist separately for each Antumi home, plugin and declared site. Requests use Chromium with that session's cookies, never expose `Set-Cookie`, never follow redirects, and allow only relative URLs on the login origin or an explicitly declared request origin. Request headers are restricted. Responses are bounded to 4 MiB; each request times out after 12 seconds by default, while `timeoutMs` permits long polling up to 40 seconds within the 60-second page call. The host never retries writes. Disconnect cancels requests, closes that session's tabs and clears its browser data. Cookies do not belong in page state, handler results, errors or logs.

The browser entry is dependency-free. Bundle it into a classic IIFE script, referenced by an external `<script src="./main.js"></script>` in the page. ES modules and inline scripts are not supported.

```ts
import { connect } from '@antumi/plugin-sdk/page'

async function start() {
  const host = await connect()
  const summary = await host.call<{ count: number }>('summary', { days: 7 })
  console.log(summary.count, host.locale, host.state, host.theme)
  const unsubscribe = host.onTheme((theme) => console.log(theme.scheme))
  host.setState({ days: 7 })
  host.open('https://example.com')
  // host.leave() returns to conversations; unsubscribe() removes the theme listener.
}
void start()
```

`connect(): Promise<PageHost>` waits up to 10 seconds for the host. `PageHost` exposes:

- `call<T = unknown>(method: string, params?: unknown): Promise<T>`: calls this page's backend, rejecting with the host's error message or after 60 seconds.
- Readonly `theme: PageTheme`, `locale: 'zh-CN' | 'en'`, and `state: unknown`: current theme, language and last saved state (`null` initially). `PageTheme` is `{ scheme: 'light' | 'dark'; variables: Record<string, string> }`.
- `setState(value: unknown): void`: replaces the saved JSON state, up to 32 KiB.
- `onTheme(listener: (theme: PageTheme) => void): () => void`: subscribes to changes and returns an unsubscribe function. The bridge applies CSS variables, `color-scheme` and `data-scheme` to the document before notifying listeners.
- `open(url: string): void`: opens an http/https URL in the app's browser.
- `leave(): void`: returns to conversations.

Leaving a page hides it rather than unloading it (SDK 0.4.0): coming back within 10 minutes finds it as it was; past that, or with more than three pages hidden, the oldest is unloaded and reopens from `state`. While hidden, the bridge reports `document.visibilityState === 'hidden'` and fires `visibilitychange`, so pause polling on that event as a web page would in a background tab. New calls made while hidden wait until the page is shown (and fail if held over 50 seconds); `open`, `leave` and forwarded shortcuts are ignored.

The sandbox blocks network requests (`connect-src 'none'`); fetch remote data in the Node handler. Remote images must use HTTPS; local packaged images are supported. Fonts are not accepted. Page files total at most 8 MiB and 256 files. Backend calls last at most 60 seconds, output at most 8 MiB, and accept at most 3 MiB of JSON params (64 KiB before SDK 0.4.0); at most four calls may run at once per plugin. Saved JSON state is limited to 32 KiB. The bridge forwards modifier chords and F1–F12 so app shortcuts work while the frame has focus.
