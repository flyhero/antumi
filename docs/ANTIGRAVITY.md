# Antigravity

Antumi 通过 ACP 接入 Antigravity，兼容 **agy 原生 ACP** 和 **独立 Antigravity ACP Server**，两种后端共用账号池、额度监控和会话账号绑定。

## 运行后端

在 设置 → 外部智能体 中选择「自动 / agy 原生 ACP / 独立 ACP Server」：

| 选项 | 配置值 | 运行方式 |
|---|---|---|
| 自动 | `auto` | 优先使用已安装的 `agy`，否则使用独立 ACP Server |
| agy 原生 ACP | `agy-cli` | 需要支持 `acp --stdio --gemini-dir` 的 `agy` |
| 独立 ACP Server | `managed-acp` | 使用 Antumi 下载的 Antigravity ACP Server 1.4.1，无需安装 `agy` 或编辑器 |

已有安装默认保留「独立 ACP Server」，避免静默迁移；全新安装默认「自动」。选择保存在聊天设置的 `agentBackends.antigravity`。全局运行时切换仅对新建会话生效，已有会话默认沿用上一阶段所绑定的后端；若原后端不可用则直接报错提示，不会自动回退到另一后端或静默触发摘要 Handoff。所选后端未安装时，仍可在该行切回其他后端。

两种后端均使用 设置 → 账号 中的 Antigravity 账号池。`agy-cli` 的凭据和会话保存在各自 Gemini home 下的 `<home>/antigravity-cli-acp/`，通过 `--gemini-dir` 指定隔离目录，并设置 `AGY_CLI_FORCE_FILE_TOKEN_STORAGE=1`，不访问系统 Keyring，也不读写 `~/.gemini/antigravity-cli/`。

凭据只在登录或切换后端时显式同步，以经过验证的 Google `sub` 确认账号身份；身份冲突时拒绝静默覆盖。额度检查严格只读，不同步或改写凭据。

会话按后端隔离存储在 `<home>/antigravity-acp/conversations` 和 `<home>/antigravity-cli-acp/conversations`。agy-cli 历史按账号独立保存，不跨账号共享 SQLite；Antumi 只读扫描本机、添加账号和归档目录，让历史统一可见；切换后端后继续已有对话会通过摘要移交上下文，不保证无损续接。

## 安装

使用独立 ACP Server 时，设置 → 外部智能体 里，Antigravity 缺失时标为「未下载」，提供「在终端安装」，完整命令收在「详情」里。安装命令会：

1. 从 `dl.google.com/agy-extensions/releases` 下载 [ACP registry](https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json) 列出的 `1.4.1` 压缩包，大小 110–340 MB；
2. 核对压缩包的 SHA-256；Google 不发布校验和，这里的值钉在 `core/src/agents/antigravity/antigravity-runtime.ts`；
3. 先解压到 `~/.antumi/runtimes/antigravity-acp/1.4.1.partial`，再改名为 `1.4.1`。中途失败的安装不会被当成已安装。

在 Linux（含 WSL）和 macOS 上优先使用 `unzip`，也可以用 Python 3 解压。两种工具都没有时，安装命令会在下载前提示。

压缩包里有 `agy_acp_server` 和与它放在同一目录的 `localharness_external`。支持 macOS 和 Linux（x64、arm64），以及 Windows（x64、arm64）。在 Linux 上按 registry 的写法以 `--uid=` 启动；不加这个参数时，以 root 身份启动的服务会降权成 nobody。

升级版本的步骤：改 `ANTIGRAVITY_VERSION`，把各平台的地址和 SHA-256 都换掉，再从 registry 下载每个压缩包核对哈希。

## 登录

两种后端均使用 Google 账号登录，可在 设置 → 账号 中管理。以下是独立 ACP Server 的 `oauth-personal` 认证流程：

- 第一次对话时，服务会在浏览器打开 Google 登录页，并通过本机回环地址接收回调，最长等 5 分钟。这一步计入启动等待时间（`startTimeoutMs`，6 分钟）。
- 在等待授权时可以停止会话或取消启动。Antumi 会结束这次启动，不会发送首条消息；要继续时可以重试。
- 在 WSL 中没有显式设置 `BROWSER` 时，Antumi 用 Windows 默认浏览器打开授权页。仅打开「外部智能体」或点击「检查更新」不会触发授权，需要在 Antigravity 会话中发送第一条消息。
- WSL 的 `BROWSER` 模板为 `rundll32.exe url.dll,FileProtocolHandler %s`，不附加 ` &`：agy 原生 ACP 经 `xdg-open` 打开浏览器时会把它当普通参数传给 Windows，导致 OAuth `state` 尾部多出空格，回调报 `Invalid or missing state parameter`。独立 ACP Server 使用的 Python `webbrowser` 也兼容不带 ` &` 的模板。
- Antumi 启动服务时设置 `AGY_ACP_FORCE_FILE_STORAGE=1`，登录凭据存在 `~/.gemini/antigravity-acp/acp_token.json`（权限 0600），而不是 macOS 钥匙串。原因是读钥匙串里别的程序存的条目，每次都会弹授权框，而读用量需要凭据。所以在 Zed、JetBrains 里登录过的账号（存在钥匙串里）在 Antumi 里还要再登录一次。外部智能体 的「已登录」就是查这个文件。
- 没登录时，Antumi 不去探测模型目录，免得没人操作就弹出登录页。模型列表要等第一次对话打开会话后才有。

独立 ACP Server 的本机账号使用默认的 `GEMINI_HOME`（`~/.gemini`），读取用户自己的全局规则（`~/.gemini/GEMINI.md` 等）和 `~/.gemini/config/mcp_config.json`。原生 ACP 使用上文的隔离运行目录；两个后端的会话目录分别保存，仅通过只读历史扫描统一展示。

## 多账号

在 设置 → 账号 中添加 Antigravity 账号，终端面板会显示授权进度，浏览器打开 Google 登录页。每个账号的 `GEMINI_HOME` 指向 `~/.antumi/agent-accounts/antigravity/<账号id>`，凭据独立保存；本机账号继续使用原有目录。

账号共享全局配置、规则、技能和独立 ACP Server 的会话历史（`antigravity-acp/conversations`）。agy 原生 ACP 的 `antigravity-cli-acp/conversations` 按账号隔离，不跨账号共享 SQLite，也不与独立 ACP Server 混用；删除添加的账号前，历史会归档到本机 Gemini home 的 `antigravity-cli-acp/archived-conversations/<账号id>/`。Antumi 通过只读扫描统一展示活动账号及归档历史；跨后端通过摘要移交。设置中可重命名、重新登录、删除添加的账号。额度按账号分别读取，开启自动切换后可按额度读数选择其他有余额的账号。服务将额度不足作为普通回复文字时，不保证当轮自动重试。

## 权限模式

Antumi 会根据当前运行时返回的 ACP `configOptions` 动态展示可用权限模式，不模拟后端原生不支持的通用模式，也不开放无人值守（定时任务、例程）。只读阶段（团队队长、只读成员、只读智能体及只读委派）锁定在 `default`（「逐项确认」）模式下运行，并由 Antumi 在 ACP 权限请求层自动拒绝所有文件编辑、删除和移动操作；命令执行仍按审批流逐项确认（不是操作系统沙箱）。

`agy` 原生 ACP（以 `agy` 1.5.17 实测为准）支持以下五种模式：

| Antumi | `agy` 原生 | 界面显示 | 行为 |
|---|---|---|---|
| ask | `default` | 逐项确认 | 按权限设置执行，改文件、运行命令前先问你 |
| acceptEdits | `accept-edits` | 自动接受编辑 | 直接批准工作区内的文件修改，其他操作仍会问 |
| auto | `auto` | 自动判断 | 自动批准文件修改和安全命令，不可逆操作前先问你 |
| plan | `plan` | 规划 | 先分析并制定执行计划，再开始动手 |
| bypass | `--dangerously-skip-permissions` | 全部放行 | 进程级自动批准所有工具调用，不再询问；不修改任何账号的全局设置 |

独立 ACP Server 1.4.1 支持以下三种原生模式：

| Antumi | 独立 ACP Server | 界面显示 | 行为 |
|---|---|---|---|
| ask | `default` | 逐项确认 | 修改文件、运行命令前先请求批准 |
| acceptEdits | `auto_edit` | 自动接受编辑 | 自动批准修改文件，运行命令仍需批准 |
| bypass | `yolo` | 全部放行 | 自动批准所有工具；企业策略要求审核终端命令时，命令仍需批准 |

说明：

- `agy` 原生 ACP 的「全部放行」（`bypass`）通过官方启动参数 `--dangerously-skip-permissions` 实现，需经会话 `allowBypass` 显式授权，仅作用于当前子进程，不改写 `settings.json` 或其他账号配置。因为 `agy` 同一进程内切换 `mode` 不会撤销该启动参数，在回合空闲时进入或退出「全部放行」会自动重启 `agy` 进程并通过 `session/resume` 续接同一会话，确保退出后权限审批真实恢复。
- `agy` 原生 ACP 运行时会按实际返回的 `configOptions` 动态展示 `default / accept-edits / auto / plan`；独立 ACP Server 不支持 `auto` 与 `plan`。
- 跨后端继续历史会话时，若原会话保存的权限模式不被目标后端支持，会自动回退到「逐项确认」（`ask`）。
- 两种后端均支持只读工作阶段（团队队长、只读成员与只读委派）：会话锁定在 `default` 模式，Antumi 自动拒绝文件写入类权限请求，命令仍走审批确认。`agy` 原生 ACP 同时支持团队「先和队长规划」和「直接开始」；独立 ACP Server 因没有原生 `plan` 模式，担任队长时自动走「直接开始」。群聊成员以「逐项确认」运行。Antigravity 仍不支持无人值守的定时任务和例程。

## 用量额度

两种后端均在 设置 → 用量额度和底部用量栏显示 Antigravity 的额度，复用同一账号的额度监控。检查不改写凭据；以下接口细节与独立 ACP Server 自己的 `/usage` 命令相同（1.4.1 的 `ccpa_client.retrieve_user_quota_summary`）：

- 凭据文件里没有访问令牌，只有 `refresh_token`、OAuth client 和登录时解析出的 `project_id`。Antumi 用它向 Google 换一个访问令牌，只保存在内存里，提前一分钟过期，从不改写凭据文件。
- 向 `v1internal:retrieveUserQuotaSummary` POST `{"project": project_id}`，先请求 `daily-cloudcode-pa`，失败再请求 `cloudcode-pa`。服务按账号是否走 Cloud 条款选其中一个，但选择结果不保存。User-Agent 与服务发出的格式相同，`host_path` 是 `antumi/1`。
- 每个桶按 `window`（或 `bucketId` 的后缀）分成 5 小时和每周两种窗口，`remainingFraction` 换算成已用百分比，标了 `disabled` 的桶不显示。Gemini 的桶是账号自己的额度；其他组（Claude 和 GPT 共用的额度）以组名标出。
- Google 拒绝刷新（`invalid_grant`）时显示登录已过期，需要在 Antigravity 会话里重新登录。

## 已知边界

以下服务内部行为以独立 ACP Server 1.4.1 为准：

- 模型调用失败（例如额度用尽）不会作为 JSON-RPC 错误返回，而是作为一段回复文字，回合照常以 `end_turn` 结束。
- 服务的 harness 会往 `~/.gemini/antigravity/bin` 写辅助程序，即使设置了 `GEMINI_HOME` 也一样。
- 会话不接受 `additionalDirectories`。其他项目的路径会写在第一条消息前的说明里。
- 用个人 Google 账号登录时，服务的文件读写工具只能访问工作目录（主项目）、`~/.gemini` 和技能目录，访问别处直接报错（1.4.1 的 `make_safe_view_file` 和 harness 都是这样）。所以多项目任务和多项目会话里，附加项目和只读参考项目只能通过运行命令访问；默认和 Auto Edit 模式下每条命令都要批准。描述里的 `primaryOnlyFiles` 让启动任务和新建会话时给出提醒。企业账号按管理员的文件访问策略处理，可能允许访问工作区外。
- 只读参考项目：文件工具碰不到它，所以改不了；Default 模式下发来的编辑审批也由 Antumi 直接拒绝。Auto Edit 和 YOLO 下编辑不发审批，企业账号又允许访问工作区外时，Antumi 拦不住；命令写文件同样拦不住，只靠提示约束。
