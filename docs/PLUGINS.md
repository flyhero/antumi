# 任务来源插件

首版只提供任务来源，不提供 Agent 接入或自定义界面。插件是可信的本机程序：独立 Node 进程隔离崩溃，但不限制文件或网络访问；登录和同步会把对应来源的凭据交给它。

[安装与使用](#使用) · [开发插件](#开发一个任务来源插件) · [Manifest](#manifest) · [通信协议](#协议-v1)

## 使用

「设置 → 插件」的推荐列表包含 GitHub、Jira、Linear 和禅道，只保存 GitHub 仓库与发布定位信息。点击安装时，core 下载对应插件最新正式 Release 的 ZIP；启动、查看列表和构建应用都不会下载或安装来源插件。也可以安装本地目录、ZIP 或 GitHub Release。目录和 ZIP 的根目录必须有 `manifest.json`；目录安装会复制文件，后续修改开发目录不会改变已安装版本。GitHub 输入 `owner/repository`，可指定 Release 标签和 ZIP 附件名；未指定标签时使用最新正式 Release，多个 ZIP 时必须指定附件。安装来源可选 `tagPrefix`，按此前缀筛选正式 Release 并取语义版本最高者；显式 `tag` 优先。API 分页每页 100 条、最多 10 页；超限要求显式标签，不猜测版本。API 限流时按发布网页分页筛选，最多 10 页。查 Release 先用 GitHub 接口；接口因同一出口 IP 请求过多拒绝（403、429，多人共用的 VPN 常见）时，改从仓库的发布页读标签（`releases/latest` 的跳转）和附件列表（`releases/expanded_assets/<标签>`），下载地址同样只接受该仓库的 `releases/download/`。

安装文件放在 `ANTUMI_HOME/plugins/<id>/<version>/`（默认 `~/.antumi/plugins/`）。`active.json` 原子记录启用状态、当前版本、安装来源和来源 ID 归属。版本目录不覆盖；重新开发需要增加版本号。手动更新使用原安装来源，GitHub 更新按可选标签前缀检查最新正式 Release；不兼容版本拒绝安装。界面可以切换到保留的旧版。

安装和更新先检查包、Antumi 版本、协议握手和已有设置。切换前暂停该来源，取消登录与请求、等待正在提交的数据完成，再校验设置和原子替换指针；失败继续使用旧版。首版不支持数据迁移，更新必须兼容已有配置及凭据格式，不允许增删来源 ID。

登录和筛选条件仍在「集成」的对应来源页面设置。停用会移除来源入口并停止同步；卸载删除插件程序，但保留来源设置、凭据和导入任务。来源 ID 的归属也保留，防止其他插件接管凭据。

## 独立维护的推荐插件

四个插件统一在 `flyhero/antumi-plugins` 仓库维护，目录为 `plugins/github`、`plugins/jira`、`plugins/linear`、`plugins/zentao`。仓库按插件身份组织，名称不限定任务来源能力；当前 SDK 仍只提供来源接口，不预设尚未实现的贡献点。插件 ID 为 `antumi.<来源>`，来源 ID 为 `github`、`jira`、`linear`、`zentao`。Antumi 主仓库仅在 `packages/core/src/plugins-recommended.json` 中维护推荐名称、说明、仓库地址、标签前缀与旧仓库列表，不保存或打包这些插件的 ZIP、源码与依赖。

推荐列表由 core 提供。客户端只能用推荐 ID 请求安装，core 从列表解析仓库，下载后校验包内 ID、版本兼容性、文件结构和握手。安装来源记录为 GitHub，后续「检查并更新」按 `github-v`、`jira-v`、`linear-v`、`zentao-v` 前缀分别查找最高正式版本，跳过草稿与预发布。当前安装器读取公开 Release，仓库尚未发布 ZIP 时安装会提示重试，不改变现有数据。

旧版已安装的 GitHub 插件继续从用户插件目录加载；旧 `bundled` 安装记录仍可读取，通过推荐条目的 GitHub 仓库检查更新。原四个 `flyhero/antumi-plugin-*` 仓库的安装在用户主动检查更新时迁移到新仓库；只匹配推荐条目明确列出的旧地址，不迁移本地安装或自定义 fork。新包验证成功后才保存来源变更，同版本也会保存新来源，失败保留原记录。不会覆盖已有安装或自动重新启用被停用、卸载的插件。

Jira 的站点、JQL、凭据及已导入任务继续保留。升级不会自动安装 Jira；用户点击推荐里的 Jira 后，core 接续旧 `jira: builtin` 归属并使用原实例设置，成功安装后归属改为 `antumi.jira`。未安装或下载失败时不改写旧数据。旧 `jira.json` 的配置迁移仍由 core 负责，与插件下载分开。

插件仓库根目录运行 `npm ci && npm run check`，得到各 `plugins/<slug>/dist/plugin/` 和带版本号的 ZIP。普通 CI 只检查和上传构建产物；推送与插件版本匹配的 `<slug>-vX.Y.Z` 标签后，Release 工作流验证并只上传对应插件的 ZIP。预发布不作为推荐安装的默认版本，已有 Release 不覆盖。应用构建只处理自身运行时，不需要访问插件仓库或网络。

新客户端连接缺少 `plugin-recommendations` 能力的旧 core 时隐藏推荐部分，保留原安装入口。

## 开发一个任务来源插件

插件在自己的仓库开发、测试和发布，通过安装包接入 Antumi。推荐列表是可选的分发入口；第三方插件可以直接用本地目录、ZIP 或 GitHub 仓库地址安装。

当前 SDK 提供任务来源接口，适用于任务、Bug、需求、Issue 等事项。`type` 表示事项类型，一个来源可以返回多种类型；右侧边栏、自定义页面和 Agent 接入目前没有可用的 SDK 接口。

### 1. 从模板跑通第一个插件

准备 Node 24、npm，以及 Antumi 主仓库约定的 pnpm 12。下面的命令在 macOS/Linux 终端执行，Windows 可以复制相同目录和文件后运行对应的 npm 命令。

SDK 尚未发布到 npm 时，可从主仓库生成一个独立的 SDK 包。它包含运行时代码和类型声明，插件仓库之后只需保留这个包，无需依赖本地 Antumi 源码：

```sh
git clone https://github.com/flyhero/antumi.git
cd antumi
pnpm install --frozen-lockfile
mkdir -p work
pnpm --dir packages/plugin-sdk pack --out ../../work/antumi-plugin-sdk-0.1.2.tgz
cd ..

cp -R antumi/templates/source-plugin antumi-plugin-acme
cp antumi/LICENSE antumi-plugin-acme/LICENSE
mkdir -p antumi-plugin-acme/vendor
cp antumi/work/antumi-plugin-sdk-0.1.2.tgz antumi-plugin-acme/vendor/
cd antumi-plugin-acme
npm install ./vendor/antumi-plugin-sdk-0.1.2.tgz
npm run check
```

SDK 已发布到 npm 后，也可以安装你验证过的 `@antumi/plugin-sdk` 版本。首次安装生成的 `package-lock.json` 一起提交，之后独立仓库和 CI 使用 `npm ci`。使用本地 SDK 包时，`vendor/*.tgz` 也需要提交；`node_modules/`、`dist/`、Token 和 `.env` 文件不提交。

模板无需真实平台账号，先返回一条 `EX-1` 演示事项。执行检查后，在 Antumi 的「设置 → 插件 → 从其他位置安装」选择 `dist/plugin/` 或生成的 ZIP，即可验证安装、登录、收件箱和详情拉取。

### 2. 设置自己的标识与配置字段

接入真实平台前，修改下面这些位置：

| 文件 | 修改内容 |
|---|---|
| `package.json` | 包名，例如 `antumi-plugin-acme`，以及插件版本 |
| `manifest.json` | 插件 ID，例如 `acme.tracker`；来源 ID，例如 `acme-tracker`；显示名称、设置字段、环境变量白名单和已验证的 Antumi 版本范围 |
| `src/source.ts` | `source.id` 与 manifest 中的来源 ID 保持一致，实现平台 API 调用 |
| `src/source.test.ts` | 替换演示数据，验证你自己的登录、筛选、分页、状态映射与详情 |

插件 ID 使用自己的命名空间；来源 ID 以小写字母开头，只含小写字母、数字和连字符，最多 32 字符。发布后这些 ID 会关联用户的配置、凭据及已导入任务，应保持稳定。`package.json` 与 manifest 中的版本必须相同。

设置字段只在 manifest 声明，由 Antumi 渲染。自建平台可以声明一个地址字段：

```json
{
  "key": "apiBase",
  "type": "url",
  "label": "API 地址",
  "required": true,
  "bindsCredential": true,
  "placeholder": "https://tracker.example.com/api",
  "translations": { "en": { "label": "API URL" } }
}
```

`normalizeSettings` 负责校验和规范化地址，包括平台是否支持自定义域名、端口或部署子目录。`bindsCredential: true` 会在地址变更时退出登录；Token 等密钥通过登录问答获取，不做成设置字段。需要环境变量时，同时写进 manifest 的 `env` 白名单和 `envCredential` 实现。

`engines.antumi` 按实际验证的宿主版本填写，不要直接沿用模板范围。协议都是 v1，也可能只有较新的宿主支持图片等可选能力。

### 3. 实现来源接口

入口沿用模板的 `src/main.ts`：

```ts
import { runSourcePlugin } from '@antumi/plugin-sdk'
import manifest from '../manifest.json' with { type: 'json' }
import { source } from './source.js'

runSourcePlugin({ manifest, sources: [source] })
```

业务对象实现 SDK 的 `SourcePlugin`。设置、凭据存储、登录界面、同步和导入由 Antumi 管理；插件负责与目标平台通信：

| 方法 | 要做的事 |
|---|---|
| `normalizeSettings(values)` | 校验地址、应用默认筛选，返回字符串字典 |
| `login(session, settings, signal)` | 用 `await session.prompt(...)` 获取 Token 等凭据，调用平台验证后返回 `{ credential, account }` |
| `list(settings, credential, signal)` | 分页读取和筛选平台事项，返回最多 200 条 `SourceIssue` |
| `fetch(settings, credential, key, signal, options)` | 读取完整正文、评论，返回事项字段和 Markdown 原文快照；`options.images === false` 时可先不下载图片，用 `imagesDeferred` 写明留下的张数（SDK 0.1.2） |
| `normalizeKey(key)`，可选 | 规范化事项编号，例如去掉空格或统一大小写 |
| `envCredential(env)`，可选 | 从获准传入的环境变量读取凭据，未配置时返回 `null` |

`SourceIssue` 的最小例子：

```ts
import type { SourceIssue } from '@antumi/plugin-sdk'

const issue: SourceIssue = {
  key: 'ACME-123',
  title: '修复登录失败',
  url: 'https://tracker.example.com/issues/123',
  status: '处理中',
  statusCategory: 'doing',
  type: 'Bug',
  priority: 'P1',
  updatedAt: null
}
```

`key` 最多 160 字符，只含字母、数字和 `._/#-`，首字符必须是字母或数字；将平台编号转换为稳定、唯一的值。`statusCategory` 映射到 `todo`、`doing`、`done` 或 `unknown`。`updatedAt` 是毫秒时间戳，缺失时返回 `null`；没有优先级时 `priority` 也返回 `null`。

`fetch` 在同样的事项字段上增加 `markdown`，最多 50,000 字符；图片的返回格式见下方「来源图片」。平台无效凭据、查询错误、事项不存在等情况使用 SDK 的 `SourceError`，不要把 Token 或完整响应正文带进错误和日志。

所有网络请求传递收到的 `signal`；登录问题逐个 `await`。每次操作会启动一个新进程，不依赖跨操作的内存状态。stdout 留给 SDK 协议，日志写 stderr。插件只导入公开的 `@antumi/plugin-sdk`，不导入 core、Electron 或私有 workspace 包。完整接口和限制见 [SDK 文档](../packages/plugin-sdk/README.md)。

### 4. 测试、构建与本地安装

```sh
npm run check
```

检查包括类型、单元测试和打包。测试使用模拟平台响应，覆盖登录失败、分页和筛选、事项编号、状态映射、取消请求以及正文转换；有自建站点时验证地址和子目录保留。发布前再用目标平台的真实账号验证权限与 API 版本。

模板生成的目录形态如下，文件名随包名和版本变化：

```text
dist/
  plugin/
    manifest.json
    main.mjs
  antumi-plugin-acme-0.1.0.zip
```

ZIP 根目录直接放 `manifest.json` 与入口，SDK 和运行时依赖已打进 `main.mjs`。用户不需要安装 Node 或执行 npm。选择本地目录安装时选 `dist/plugin/`，不要选含 ZIP 的整个 `dist/`。

需要额外检查安装包时，可回到 Antumi 主仓库执行：

```sh
pnpm exec tsx scripts/verify-source-plugin.ts ../antumi-plugin-acme/dist/antumi-plugin-acme-0.1.0.zip
```

它检查解压、宿主版本兼容及真实插件进程加载，不登录平台、不读用户数据。应用内联调使用独立测试目录：`ANTUMI_HOME=~/.antumi-demo pnpm dev`。目录安装会复制产物，修改源码后要重新构建并增加版本号，再安装新版本。

### 5. 发布到自己的 GitHub 仓库

将插件源码、锁文件及必要的 SDK 包推送到独立仓库。在 GitHub 创建正式 Release，把构建得到的插件 ZIP 作为附件上传；自动生成的源码 ZIP 不是插件安装包。模板 CI 只验证并上传构建产物，不自动创建 Release；需要自动发版时可参考 [antumi-plugins 的 Release 工作流](https://github.com/flyhero/antumi-plugins/blob/main/.github/workflows/release.yml)，用插件标签前缀分别发布。

用户在「设置 → 插件 → 从其他位置安装」选择 `GitHub Release`，填写 `owner/repository` 并确认信任即可安装。默认读取最新正式 Release；测试版需要填写 Release 标签，多个 ZIP 则填写目标 ZIP 的附件名。后续「检查并更新」仍从同一仓库下载。

每次更新同步增加 package 和 manifest 的版本，保持来源 ID、凭据格式和已有设置兼容。安装包不覆盖同一版本，Antumi 会保留旧版供切换。

### 6. 申请加入推荐列表

发布带插件 ZIP 的正式 Release 后，可以向 Antumi 提交 PR，更新 `packages/core/src/plugins-recommended.json`：

```json
{
  "id": "acme.tracker",
  "name": "Acme Tracker",
  "description": "同步 Acme 的任务与 Bug。",
  "descriptionEn": "Sync tasks and bugs from Acme.",
  "repository": "your-account/antumi-plugin-acme"
}
```

推荐条目的 `id` 必须与安装包 manifest 一致。PR 中说明已验证的 Antumi 和平台 API 版本、登录方式、数据访问范围及安装验证结果；推荐列表只保留元信息，插件仍由你的仓库独立发布。

### 可以参考的完整实现

- [GitHub](https://github.com/flyhero/antumi-plugins/tree/main/plugins/github)：Token 登录、搜索筛选、Issues 与 Pull Requests。
- [Jira](https://github.com/flyhero/antumi-plugins/tree/main/plugins/jira)：JQL、富文本、评论与图片附件。
- [Linear](https://github.com/flyhero/antumi-plugins/tree/main/plugins/linear)：团队和项目筛选、GraphQL 分页。
- [禅道](https://github.com/flyhero/antumi-plugins/tree/main/plugins/zentao)：自定义站点、任务/Bug/需求及 RESTful API v1。

## Manifest

```json
{
  "id": "example.tracker",
  "version": "1.0.0",
  "engines": { "antumi": ">=0.20.0-beta.2 <1.0.0" },
  "contributes": {
    "sources": [{ "id": "tracker", "name": "Tracker", "settings": [] }]
  },
  "entry": { "runtime": "node", "main": "main.mjs" },
  "env": ["TRACKER_TOKEN"]
}
```

`id` 用点分命名空间，来源 ID 服从 `SOURCE_ID_PATTERN`。`settings` 使用现有 `SettingField` schema。入口只能是包内 JS 文件，依赖预先打包；安装时不执行脚本，不安装依赖，不接受原生二进制、符号链接或越界路径。包大小上限 32 MiB，最多 2048 个文件及目录。

core 使用 `process.execPath` 和 argv 启动入口，不经过 shell。环境只包含 manifest 白名单、`PATH` 和宿主固定的 `ELECTRON_RUN_AS_NODE=1`；禁止声明 `NODE_*`、`ELECTRON_*`、动态链接器变量及 `ANTUMI_HOME`。环境凭据在启用时读取并缓存；修改运行环境后重启 core 或重新启用插件。

## 协议 v1

唯一协议定义在 `packages/protocol/src/plugin.ts`，使用独立的 `PLUGIN_PROTOCOL_VERSION`。独立插件推荐使用 [`@antumi/plugin-sdk`](../packages/plugin-sdk/README.md)；SDK 从这份协议构建，不另维护协议副本。下面是消息约定；参数和结果以 zod schema 为准。

每个操作启动一个进程，先握手，再调用一个方法。一次登录包括全部问答，共用同一进程。stdout 只允许 NDJSON 协议消息；stderr 是日志通道，宿主限制其大小且不展示可能含凭据的原始内容。

```json
{"type":"call","id":"hello","method":"handshake","params":{"protocolVersion":1}}
{"type":"result","id":"hello","result":{"protocolVersion":1,"id":"example.tracker","version":"1.0.0","sources":["tracker"]}}
{"type":"call","id":"call","method":"normalizeSettings","params":{"source":"tracker","settings":{}}}
{"type":"result","id":"call","result":{}}
```

方法为 `handshake`、`normalizeSettings`、`normalizeKey`、`envCredential`、`login`、`list`、`fetch`。`fetch` 返回文本快照和可选图片（见下文）。`envCredential` 读取进程自己的环境，返回凭据或 `null`，不得索取完整宿主环境。

仅 `login` 期间允许反向消息：

```json
{"type":"prompt","id":"token","prompt":{"kind":"secret","label":"API token"}}
{"type":"answer","id":"token","value":"用户输入"}
{"type":"notify","notice":{"message":"正在验证账号"}}
{"type":"result","id":"call","result":{"credential":{"kind":"token","payload":{"token":"用户输入"}},"account":"账号名称"}}
```

每次只能有一个待回答问题，prompt ID 不重复。失败返回 `{"type":"error","id":"call","error":{"code":"auth-failed","message":"登录失败"}}`，错误码来自现有 `SourceFailure`。

握手 5 秒超时；普通调用最多 120 秒，来源同步 20 秒、规范化 20 秒、环境凭据 10 秒；登录整体最多 15 分钟，单个问题沿用现有 5 分钟等待。除 `fetch` 为 72 MiB 外，输出上限 8 MiB；非法消息、进程退出、取消和超时均结束调用。宿主终止不响应的进程，旧 generation 的结果不得写入来源或任务数据。

## 来源图片

SDK 的 `fetch` 可以返回 `images: [{ name, bytes: Uint8Array }]`。SDK 转成 base64，宿主校验后解码，再交给既有附件仓库存储与检查。限制与 Jira 导入一致：20 张、单张 10 MiB、合计 50 MiB；`fetch` 的进程输出最多 72 MiB，其余操作仍为 8 MiB。按块收集输出后逐行解码，避免对大图片反复复制缓冲。

这是 v1 的可选扩展，旧插件继续工作；图片插件必须使用包含此扩展的宿主。早期 v1 宿主会忽略图片字段，不能以协议版本相同作为图片兼容依据。独立 Jira 插件还要求宿主已移除内置 Jira，否则来源所有权冲突会拒绝安装。
