# CodeArts

Antumi 接入华为云码道（CodeArts）代码智能体的 CLI：经 Antumi 自带的桥运行它官方文档里的本地服务 `codearts serve`，再用通用 ACP driver 和它对话。支持聊天、任务、预约运行、恢复和分叉会话、图片输入、命令审批，以及 Antumi 的 MCP 工具；模型列表读取服务实际提供的选项。

## 为什么是桥

CLI 里带着 OpenCode 1 的 ACP 服务（启动脚本也专门处理 `codearts acp`），但这个版本的 CLI 把 `acp` 放在不支持的命令名单里，运行就报「The 'acp' command is not supported」。`codearts serve` 是它的 TUI 自己用的服务，官方文档列出，接口就是 OpenCode 的 REST 加事件流（`codearts generate` 能导出完整 OpenAPI）。

所以 Antumi 带一个桥（`core/src/codearts-bridge-main.ts`，打包后是 `codearts-bridge.mjs`，和 MCP 服务一样由 Electron 自带的 Node 运行）：

- 每个会话进程启动一个只属于它的 `codearts serve`：只监听 127.0.0.1，端口由桥自己挑（不用它默认的 4096，那也是 OpenCode 的端口），用户名和随机密码只有桥知道。
- 桥在标准输入输出上说 ACP，另一侧调用服务的接口：建会话、`prompt_async` 发消息、订阅 `/global/event` 事件流、回复权限请求、中止、分叉、读历史。消息发出后不占着请求等结果：事件流报告会话空闲后再读这一轮的回答，长回合不会撞上 HTTP 超时。
- 桥的逻辑（`agents/codearts/codearts-bridge.ts`）照它自带的 ACP 服务的做法：文字和思考按增量转发，工具调用转成 ACP 的工具更新，`todowrite` 转成计划，子 Agent 的调用和审批归到发起它的会话。MCP 工具要经 `tool_call` 调用，它把这一层也记成一次调用，桥只显示真正的工具。
- daemon 停止进程组（Windows 是进程树）时，服务随桥一起退出。

## 运行要求

- 用官方安装脚本安装，可从 设置 → 外部智能体 安装：macOS / Linux 是 `install.sh`，Windows 是 PowerShell 的 `install.ps1`（见[码道 CLI 安装](https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0005.html)）。它装在 `~/.codeartsdoer/installers/`，`codearts upgrade` 升级。
- **需要华为云访问密钥。** 除了交互式 TUI，它的每个子命令（包括 `serve`）启动时都只认环境变量 `CODEARTS_CLI_AK` / `CODEARTS_CLI_SK`（或华为云通用的 `HW_ACCESS_KEY` / `HW_SECRET_KEY`），网页登录不算（[授权](https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0026.html)）。变量要让 Antumi 读到：从程序坞启动的 Antumi 读不到 `~/.zshrc` 里的 `export`，macOS 可以用 `launchctl setenv CODEARTS_CLI_AK …` 设置后重启 Antumi，Windows 设为用户环境变量。设置 → 外部智能体按这两个变量显示是否可用。没有时新建会话直接显示它的提示「认证失败，没有设置环境变量 CODEARTS_CLI_AK/CODEARTS_CLI_SK」。
- **文件夹信任**（`~/.codeartsdoer/cli-data/settings.json` 的 `security.trustedFolders`）：服务只在被信任的目录里启动，否则报「文件夹未被信任」，Antumi 会附上处理办法。信任按前缀生效，信任 Antumi 的 worktree 目录（`~/.antumi/worktrees`）就一并信任其中所有任务的工作区。Antumi 不替用户信任任何目录。
- 新建页的模型列表要先探测一次：探测在 Antumi 的会话目录里启动服务，那个目录通常没被信任，探测会失败，列表等第一次聊天后再出现。

## 启动方式

桥直接运行安装目录 `bin/` 下的可执行文件（Windows 是 `bin/codearts.exe`）：Windows 上的启动脚本是批处理，只能由 cmd.exe 运行。启动脚本设置的环境变量（`KERNEL_DATA_DIR`、`OPENCODE_CONFIG` 等）由 Antumi 照样设置，唯独不设它的 `NODE_TLS_REJECT_UNAUTHORIZED=0`：那会关掉它所有请求的证书校验。PATH 上的 `codearts` 是链接时顺着找到安装目录；是用户自己的包装脚本时，改用 `~/.codeartsdoer/installers/` 下的。

## 权限与边界

| Antumi 名称 | 它的 agent | 行为 |
| --- | --- | --- |
| Build | `build` | 码道自己的 Build：改文件不问；命令在它的沙箱里运行，它认为有风险的（黑名单命令、沙箱拦下的）先问 |
| 自动 | `antumi-auto` | 项目和会话里的其他项目可改、可运行命令；项目外只读参考项目和附件，其余直接拒绝；有风险的命令直接拒绝；不读 `.env`；无人值守运行用它 |
| 规划 | `antumi-plan` | 只读代码、给出计划；没有编辑、命令、子 Agent 和改技能的工具 |
| 只读 | `antumi-readonly` | 同上，用于群聊成员和只读委派 |
| 全部放行 | `antumi-bypass` | 什么都不问；仅在 Antumi 允许全部放行时出现 |

除 Build 外，这些 agent 由 Antumi 启动时写进 `OPENCODE_CONFIG_CONTENT`，合并在用户自己的配置之上，不改写 `~/.codeartsdoer/` 下的任何文件。

码道的权限服务和 OpenCode 不同：审批时它只按自己的运行模式（`cli-data/storage/permission/config.json` 的 `bash_mode`，和用户的 TUI 共用）、黑名单和白名单回答，配置里定义的 agent 的规则不起作用，读、改、写文件固定放行。命令由它的 bash 工具决定：安全的直接在沙箱里跑（沙箱默认不联网），有风险的才发审批。所以：

- **规划和只读**在 agent 配置里拒绝 `edit`、`write`、`deleteFile`、`bash`、`task`、`skill_manage`、`question`。整类被拒的工具不会提供给模型（实测只剩读、搜索、待办、技能和 MCP 工具），这一点不靠它的权限服务。代价是这两种模式不能运行命令。
- **自动、全部放行和参考项目**由 Antumi 的权限插件执行。插件写在会话目录下，经配置的 `plugin` 加载；它的 `permission.ask` 钩子在码道的规则之前作答，按这个会话最近一次提示所用的 agent 决定放行或拒绝（子 Agent 的会话跟随启动它的那个）。路径按真实路径比较（macOS 的 `/tmp` 实为 `/private/tmp`）。所有模式下，改参考项目和只读知识库的请求都被拒绝；命令的副作用不在此列，这些模式不是操作系统沙箱。
- 插件加载后写一个就绪文件。会话启动后 10 秒内没有出现，就拒绝启动并提示升级，不在模式失效的情况下运行。

在审批卡上选「本会话允许」时，码道会把这条命令写进它的全局白名单（TUI 里的「始终允许」也是如此），之后在码道里同样免问。拒绝一条命令不会结束这一轮，它会收到拒绝后继续。

它的提问工具在 Antumi 的 agent 里都关掉了；Build 照常提供，若它提问，桥会替用户拒绝（转给 Antumi 的提问还没做）。

## 会话、MCP 与技能

- 会话绑定原工作目录，恢复时读回它的历史（不会重复进入聊天）；分叉用它的会话分叉接口，只能从最新一轮整体复制。
- 不接受额外目录：会话里的其他项目在第一条消息开头列出，按绝对路径访问。
- Antumi 的 MCP 和用户选择的 MCP 随会话加到这个进程的服务上，不写进它的配置；聊天里显示为 `antumi.<工具>`。码道自己配置的 MCP 照常加载。设置 → MCP 暂不能导入 `codearts_cli.json` 里的 MCP（它是 JSONC）。
- Antumi 的技能库经配置的 `skills.paths` 传入，桥把它整理成项目 `.codeartsdoer/skills`、用户技能（`~/.codeartsdoer/skills`）、技能库的顺序再交给服务，`/` 菜单按同一顺序去重，同名只留前面的（服务端是否也是前者优先尚待在真机上确认）。用户技能照旧显示在技能库旁边。
- 模型列表显示每个模型的计费倍率（如 `0.12x`）和上下文窗口，可按模型切换推理档位；档位来自服务端给出的 variants，另加 `default`（和 OpenCode 自己的 ACP 一样）。选 `default` 时不传 variant，由服务决定，新会话和换模型后都是它；没有档位的模型不显示。
- 斜杠命令来自服务端的命令列表，技能作为单独一组，和命令同名的技能不列出（选不中）。和其他 Agent 一样只在消息开头输入 `/` 时弹出；选中命令直接发送，选中技能先填进输入框接着写要做的事。发送时由桥展开（命令只替换模板里的 `$ARGUMENTS`，技能按“使用技能”指向它的 `SKILL.md`），服务端不解析 `/name`。
- 用量：每轮的 token 和上下文占用来自服务；花费按它报告的美元数，套餐额度请在华为云控制台看。
- 暂不支持 Antumi 托管的模型服务商、在 Antumi 里保存 AK/SK、额度查询和接着聊终端里的码道会话。

## 参考与验证

- [码道 CLI 命令](https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0034.html)、[权限配置](https://support.huaweicloud.com/intl/en-us/usermanual-cli/codeartsagent_cli_0006.html)、[安全策略](https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0007.html)
- 参考实现：multica（`server/pkg/agent/codearts.go`，每轮一次 `codearts run`）和 multi-agent-hub（`server/drivers/codearts-acp.ts`，在 `codearts run` 外包一层 ACP）。`codearts run` 会自动拒绝所有审批请求，所以两者都没有审批。

`agents/codearts/fixtures/` 是 Antumi 的 AcpDriver 经桥和真实 26.11.11 服务的通信记录，录制方法见那里的 `codearts-recordings.md`。没有华为云账号也能录：占位的 AK/SK 通过启动检查；在隔离的 HOME 里把 `huaweicloud-maas` 服务商的地址指到本地的 OpenAI 兼容模拟服务，并预置一份模型缓存。测试覆盖模式、插件的放行和拒绝、审批与拒绝、MCP 工具、恢复、分叉、中止和缺少密钥的提示；桥的单元测试覆盖事件转换、权限往返、子 Agent、错误和历史重放。另经一个临时的 Antumi core 实测了整条链路（启动、插件就绪、模式切换、写文件和 MCP 工具）。真实华为云账号上的模型调用还没测过。
