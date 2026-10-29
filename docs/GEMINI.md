# Gemini CLI

Antumi 通过官方 `gemini --acp` 接入 Gemini CLI。支持聊天、任务、预约运行、图片输入、工具审批、计划审批、MCP、每轮 token 用量及 Google 账号的每日额度。模型列表来自 CLI，不提供推理强度选项。

## 运行要求

- `@google/gemini-cli` 0.66.0 或更新版本，以及 PATH 上的 Node.js 20 或更新版本。设置 → 外部智能体 可以安装官方 npm 包。
- 在终端运行 `gemini` 完成 Google 登录，或设置 `GEMINI_API_KEY`。Vertex 使用 Gemini 自己的认证设置和 Google 凭据。Antumi 不代办登录，未登录时不启动目录探测或浏览器认证。
- 用户配置与凭据默认在 `~/.gemini`；设置 `GEMINI_CLI_HOME` 后读取该目录下的 `.gemini`，与官方 CLI 保持一致。

## 权限和计划

| 界面模式 | ACP 模式 | 行为 |
| --- | --- | --- |
| Default | `default` | 需要授权的工具运行前询问 |
| Auto Edit | `autoEdit` | 自动批准文件编辑，其他工具仍可能询问 |
| Plan | `plan` | 读取、探索及在专用目录写计划 |
| YOLO | `yolo` | 全部放行，需要用户主动选择 |

计划审批展示本会话最近一次完成的计划文件编辑正文；正文没有出现在工具记录中时展示文件路径。批准后进入 Default；退回意见通过后续消息送达。仅规划阶段可以保存或退回计划，不能批准执行。群聊讨论使用 Plan，但不把原生规划模式当作通用只读团队工作模式。

每个进程使用 `--skip-trust` 信任启动工作区，不改写用户信任配置；额外项目、参考目录和知识库通过 `--include-directories` 传入。Antumi 拒绝明确写入参考项目的文件请求；命令副作用仍受 Gemini 自己的规则控制，这不是操作系统沙箱。

## 继续会话与 MCP

同一进程内的连续回合复用 Gemini 会话；进程停止、退出后继续或分叉时，新建 Gemini 会话，并通过 Antumi 保存的历史移交上下文。首版不调用 `session/load`：上游 [#29707](https://github.com/google-gemini/gemini-cli/issues/29707) 会在响应后继续重放历史，无法可靠区分新旧消息。

Antumi MCP 和用户选择的 MCP 随 `session/new` 传入，不修改 Gemini 配置。Gemini 会过滤 MCP 的 `ELECTRON_RUN_AS_NODE`，因此打包版使用 PATH 上的 Node 运行 Antumi MCP；工具列表加载失败会明确报错。设置 → MCP 可以导入 Gemini 的 `settings.json` 中的 `mcpServers`；SSE 配置暂不能导入。

## 用量与额度

每轮用量采用 ACP `PromptResponse.usage`：Gemini 的输入 token 已含缓存读取，不重复相加；输出含思考 token。`usage_update` 仅用于显示上下文占用。已知模型的成本参考 [Google 官方 API 价格](https://ai.google.dev/gemini-api/docs/pricing)，未识别的模型或自动路由不猜测价格；这不是订阅账号的实际账单。

Google OAuth 账号读取 `oauth_creds.json`，用 Code Assist 的 `loadCodeAssist` 和 `retrieveUserQuota` 获取模型额度，显示为「今天」。重置时间沿用服务端，不按本机午夜推算。令牌过期时读取已安装 CLI 自带的公开 OAuth 客户端信息刷新，仅缓存在内存，不覆盖用户凭据。API key 和 Vertex 登录不返回此订阅额度，需在 Google 控制台查看。

## 验证与限制

`packages/core/src/agents/gemini/fixtures/` 保存官方 0.66.0 CLI 对本地模拟 Gemini API 的真实 ACP 录制，不使用真实账号。测试覆盖模式、MCP、计划、参考目录保护、额度解析、令牌刷新，以及停止、重启和分叉后的移交。

- 当前 CLI 的 shell 调用可能不返回输出文本，工具仍会显示执行状态，见 [#29930](https://github.com/google-gemini/gemini-cli/issues/29930)。
- 真实 Google 账号的额度响应未做实账号验证；额度测试采用服务端结构的模拟响应。
- 首版不提供 Antumi 托管模型服务商、多账号、技能库注入、外部历史导入或一次性小任务；Gemini 自身配置仍由 Gemini 读取。

参考：[官方 ACP 文档](https://geminicli.com/docs/ide-integration/)；[官方源代码](https://github.com/google-gemini/gemini-cli/tree/v0.66.0/packages/cli/src/acp)。
