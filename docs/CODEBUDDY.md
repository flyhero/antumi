# CodeBuddy

Antumi 通过官方 `codebuddy --acp` 接入腾讯的 CodeBuddy Code CLI，复用通用 ACP driver。支持聊天、任务、预约运行、原生会话恢复、图片输入、权限审批和计划审批；模型及思考级别读取 CLI 实际返回的选项。

## 运行要求

- 安装官方 npm 包 `@tencent-ai/codebuddy-code`（需要 Node.js 18 以上），可从 设置 → 外部智能体 安装。按 2.185.0 验证；启动时只确认 PATH 上有 `codebuddy`，不限制版本。
- 在终端运行 `codebuddy`，在登录方式里选 **Chinese Site**（中国站，copilot.tencent.com，微信登录）或 **International Site**（国际站，codebuddy.ai，Google / GitHub 登录）。用的是国内版还是国际版，由这次登录决定，Antumi 不另外设置。企业域名和 iOA 登录也照常可用。
- 用 API Key 的话，在 设置 → 账号 里添加 Key 账号（见下），不必再设环境变量。
- Antumi 不代办登录、不读取或修改它的登录凭据。未登录时，新建会话会提示先在终端登录。

## 多账号：本机登录 + API Key

CodeBuddy 把登录信息存在系统固定位置（macOS 是 `~/Library/Application Support/CodeBuddyExtension/Data/Public/auth/`），国内版和国际版共用同一份，`CODEBUDDY_CONFIG_DIR` 也改不了它：同一台电脑同一时间只有一个登录账号。所以在 设置 → 账号 里：

- **本机账号**是你在终端登录的那个（中国站或国际站）。点「登录」会在一个空目录里打开 `codebuddy`，选站点登录后退出即可。
- **其他账号**用 API Key 添加：填名称、选版本（国际版 / 国内版 / iOA）、填 Key。Key 存在 Antumi 的凭据文件里，不写进账号列表，也不会再显示；每个 Key 账号有自己的配置目录，带 `CODEBUDDY_API_KEY` 和 `CODEBUDDY_INTERNET_ENVIRONMENT` 启动，会话历史、技能、MCP 配置和自定义模型与本机目录共享。

每个会话可以在输入框下方选账号：新建时选，或在会话中途换（空闲时立即用新账号接上同一个会话，正在回复时等这一轮结束）。选定了账号的会话一直用它，不跟状态栏切换，额度用完时也不自动换号。不选就跟随状态栏的当前账号。两个版本的模型不同，切换后原来的模型没有时用新版本的默认模型；新建页里列出的是当前账号的模型。

## 权限与边界

| Antumi 名称 | ACP 模式 | 行为 |
| --- | --- | --- |
| 每次询问 | `default` | 每个工具第一次使用前询问 |
| 自动接受编辑 | `acceptEdits` | 改文件不再问，其他操作仍会问 |
| 规划 | `plan` | 只读代码、写计划文件，批准后执行 |
| 自动审查 | `auto` | CodeBuddy 的 AI 审查员直接放行或拦下，不再询问；无人值守运行用它 |
| 全部放行 | `bypassPermissions` | 仅在 Antumi 允许全部放行时可选 |

CodeBuddy 另有 `dontAsk` 和 `fullAccess`，Antumi 不使用。命令只传 `--acp`，权限通过会话配置设置。

计划审批是 `ExitPlanMode` 的权限请求，计划正文取自它写的计划文件（请求里的 `codebuddy.ai/planFilePath`）。CodeBuddy 批准后会自己回到进入规划前的模式，却不通知客户端；Antumi 在批准的同时把模式切到「每次询问」，计划卡只提供这一执行模式。仅规划阶段可以保存或退回计划，不能批准执行。

它没有只读工作模式，团队设置和启动会提前检查队长、只读成员是否支持只读模式，CodeBuddy 可担任开发测试成员；群聊讨论使用规划。参考项目的明确文件修改请求由 Antumi 拒绝，命令的副作用仍由 CodeBuddy 自己的权限规则控制；这些模式不是操作系统沙箱。CodeBuddy 的提问工具只提供给声明了 ACP elicitation 的客户端，Antumi 尚未声明，所以它不会在聊天里提问。

会话绑定原工作目录，恢复使用 `session/load`，历史重放不会重复进入聊天。它不提供 ACP 分叉，分叉通过交接创建新会话。额外项目、参考项目和知识库目录通过 `--add-dir` 传入。

Antumi 的 MCP 和用户选择的 MCP 随会话传入，不改写 CodeBuddy 配置；设置 → MCP 也可导入 `~/.codebuddy/.mcp.json`（CodeBuddy 只读第一个存在的用户级文件，Antumi 同样）。它的会话配置里有布尔开关（如 `multitask`），Antumi 不认识的配置项会被跳过。

它的 ACP 一行最多读 32 MiB，超过的消息既不回应、也不再读后面的输入，进程就此卡住；所以发给它的消息（主要是图片）超过 32 MB 时，Antumi 直接拒绝发送并提示减少图片。

子 Agent 在主会话里运行，它的回复和调用都带 `_meta.codebuddy.ai/parentToolCallId`。dialect 的 `subagentOf` 据此把它们归到对应的 Task 卡片：卡片计数它的调用（同一调用会通知两次，只计一次）、显示它交回的结果，它的回复不进聊天；它请求的审批照常单独弹出，标题和参数取自它通知过的调用。

可以接着聊在终端里用过的 CodeBuddy 会话：Antumi 读取 `~/.codebuddy/projects/<目录>/<会话>.jsonl`（随 `CODEBUDDY_CONFIG_DIR` 移动）。标题依次取 `/rename` 的自定义标题、AI 标题、话题，再退回第一条消息；系统代用户插入的消息（`isMeta`）不算提问，斜杠命令显示成输入的样子；图片从它的 `blobs/` 读取并按 SHA-256 校验，读不到的留一条提示。MCP 调用拆开 `DeferExecuteTool` 外壳，子 Agent 的记录在 `subagents/` 下，不单独列出。

暂不注入 Antumi 技能库、不使用 Antumi 托管的模型服务商，也不支持额度查询。CodeBuddy 自己的 `models.json` 自定义模型照常生效；它的用户技能（`~/.codebuddy/skills`，随 `CODEBUDDY_CONFIG_DIR` 移动）会显示在 Antumi 的技能库旁边。

## 参考与验证

- [CodeBuddy Code CLI 文档](https://www.codebuddy.ai/docs/cli)（CLI 包内也带一份，`dist/web-ui/docs/`）
- [Zed 的 CodeBuddy Code ACP 页面](https://zed.dev/acp/agent/codebuddy-code)

`packages/core/src/agents/codebuddy/fixtures/` 保存官方 2.185.0 CLI 对本地模拟模型的通信记录：设一个任意的 `CODEBUDDY_API_KEY`，再用独立 `CODEBUDDY_CONFIG_DIR` 里的 `models.json` 把模型指到本地 OpenAI 兼容服务，不需要真实账号或网络。测试覆盖模式、布尔配置项、命令和 MCP 审批、计划审批后的模式同步、子 Agent、会话恢复与重放、超大消息、未登录提示、CLI 检测和历史导入。
