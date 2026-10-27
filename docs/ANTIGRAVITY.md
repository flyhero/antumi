# Antigravity

Antumi 通过 Google 的 **Antigravity ACP 服务**接入 Antigravity。Zed、JetBrains、Xcode 的 Antigravity 扩展用的也是这个服务。`agy` CLI 没有 ACP 模式，所以不需要安装 `agy` 或 Antigravity 编辑器。

## 安装

设置 → 外部智能体 里，Antigravity 缺失时标为「未下载」，提供「在终端安装」，完整命令收在「详情」里。安装命令会：

1. 从 `dl.google.com/agy-extensions/releases` 下载 [ACP registry](https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json) 列出的 `1.4.1` 压缩包，大小 110–340 MB；
2. 核对压缩包的 SHA-256；Google 不发布校验和，这里的值钉在 `core/src/agents/antigravity/antigravity-runtime.ts`；
3. 先解压到 `~/.antumi/runtimes/antigravity-acp/1.4.1.partial`，再改名为 `1.4.1`。中途失败的安装不会被当成已安装。

压缩包里有 `agy_acp_server` 和与它放在同一目录的 `localharness_external`。支持 macOS 和 Linux（x64、arm64），以及 Windows（x64、arm64）。在 Linux 上按 registry 的写法以 `--uid=` 启动；不加这个参数时，以 root 身份启动的服务会降权成 nobody。

升级版本的步骤：改 `ANTIGRAVITY_VERSION`，把各平台的地址和 SHA-256 都换掉，再从 registry 下载每个压缩包核对哈希。

## 登录

Antumi 用 `oauth-personal`（Google 账号）认证：

- 第一次对话时，服务会在浏览器打开 Google 登录页，并通过本机回环地址接收回调，最长等 5 分钟。这一步计入启动等待时间（`startTimeoutMs`，6 分钟）。
- Antumi 启动服务时设置 `AGY_ACP_FORCE_FILE_STORAGE=1`，登录凭据存在 `~/.gemini/antigravity-acp/acp_token.json`（权限 0600），而不是 macOS 钥匙串。原因是读钥匙串里别的程序存的条目，每次都会弹授权框，而读用量需要凭据。所以在 Zed、JetBrains 里登录过的账号（存在钥匙串里）在 Antumi 里还要再登录一次。外部智能体 的「已登录」就是查这个文件。
- 没登录时，Antumi 不去探测模型目录，免得没人操作就弹出登录页。模型列表要等第一次对话打开会话后才有。

服务使用默认的 `GEMINI_HOME`（`~/.gemini`），所以会读取用户自己的全局规则（`~/.gemini/GEMINI.md` 等）和 `~/.gemini/config/mcp_config.json`。会话保存在 `~/.gemini/antigravity-acp/conversations`，与 `agy` CLI 的会话互不相通。

## 权限模式

| Antumi | Antigravity | 行为 |
|---|---|---|
| ask | `default` | 修改文件、运行命令前先请求批准 |
| acceptEdits | `auto_edit` | 自动批准修改文件，运行命令仍需批准 |
| bypass | `yolo` | 自动批准所有工具；企业策略要求审核终端命令时，命令仍需批准 |

以上行为根据 1.4.1 服务内 `_permission_handler` 的源码整理。服务没有只读或规划模式（`/plan` 是斜杠命令，不是会话模式）：

- 需要只读的阶段（团队的只读成员、任务协调者）会在启动时报错，不会退回到可以改文件的模式。
- 群聊成员以 Default 模式运行，改文件前会先问。
- 没有人值守时无法回答审批，所以 Antigravity 不支持定时任务和例程。

## 用量额度

设置 → 用量额度和底部用量栏显示 Antigravity 的额度，做法与服务自己的 `/usage` 命令相同（1.4.1 的 `ccpa_client.retrieve_user_quota_summary`）：

- 凭据文件里没有访问令牌，只有 `refresh_token`、OAuth client 和登录时解析出的 `project_id`。Antumi 用它向 Google 换一个访问令牌，只保存在内存里，提前一分钟过期，从不改写凭据文件。
- 向 `v1internal:retrieveUserQuotaSummary` POST `{"project": project_id}`，先请求 `daily-cloudcode-pa`，失败再请求 `cloudcode-pa`。服务按账号是否走 Cloud 条款选其中一个，但选择结果不保存。User-Agent 与服务发出的格式相同，`host_path` 是 `antumi/1`。
- 每个桶按 `window`（或 `bucketId` 的后缀）分成 5 小时和每周两种窗口，`remainingFraction` 换算成已用百分比，标了 `disabled` 的桶不显示。Gemini 的桶是账号自己的额度；其他组（Claude 和 GPT 共用的额度）以组名标出。
- Google 拒绝刷新（`invalid_grant`）时显示登录已过期，需要在 Antigravity 会话里重新登录。

## 已知边界

- 模型调用失败（例如额度用尽）不会作为 JSON-RPC 错误返回，而是作为一段回复文字，回合照常以 `end_turn` 结束。
- 服务的 harness 会往 `~/.gemini/antigravity/bin` 写辅助程序，即使设置了 `GEMINI_HOME` 也一样。
- 会话不接受 `additionalDirectories`。其他项目的路径会写在第一条消息前的说明里。
- 用个人 Google 账号登录时，服务的文件读写工具只能访问工作目录（主项目）、`~/.gemini` 和技能目录，访问别处直接报错（1.4.1 的 `make_safe_view_file` 和 harness 都是这样）。所以多项目任务和多项目会话里，附加项目和只读参考项目只能通过运行命令访问；默认和 Auto Edit 模式下每条命令都要批准。描述里的 `primaryOnlyFiles` 让启动任务和新建会话时给出提醒。企业账号按管理员的文件访问策略处理，可能允许访问工作区外。
- 只读参考项目：文件工具碰不到它，所以改不了；Default 模式下发来的编辑审批也由 Antumi 直接拒绝。Auto Edit 和 YOLO 下编辑不发审批，企业账号又允许访问工作区外时，Antumi 拦不住；命令写文件同样拦不住，只靠提示约束。
