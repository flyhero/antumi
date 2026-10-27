# Kimi Code

Antumi 通过官方 `kimi acp` 接入 Kimi Code CLI，复用通用 ACP driver。支持聊天、任务、预约运行、原生会话恢复、图片输入、权限审批、提问和计划审批；模型及思考级别读取 CLI 实际返回的选项。

## 运行要求

- 使用 Node.js 版 `@moonshot-ai/kimi-code` 2.3.2 或更新版本；旧 Python 版 `kimi-cli` 不支持。
- 可从 设置 → 外部智能体 安装官方 npm 包（需要 Node.js 22.19 以上），也可使用官方独立安装器。启动时会重新核对 PATH 上的 CLI 版本。
- 登录使用 `kimi login`，也可在 Kimi Code 自己的配置中设置模型服务商。Antumi 不代办登录、不读取或修改凭据；环境检查只确认 CLI 可用，登录状态由用户确认，创建会话时再由 Kimi 验证。
- 默认数据目录是 `~/.kimi-code`，尊重 `KIMI_CODE_HOME`。

## 权限与边界

| Antumi / Kimi 名称 | ACP 模式 | 行为 |
| --- | --- | --- |
| Default | `default` | Kimi 的手动审批规则 |
| Plan | `plan` | Kimi 原生规划模式 |
| Auto | `auto` | Kimi 自动批准安全操作，其他操作询问 |
| YOLO | `yolo` | 全部放行，仅在 Antumi 允许全部放行时可选 |

命令只传 `['acp']`，权限通过会话配置设置；不使用根命令上的 `--auto` 或 `--yolo`，因为它们不配置 ACP 会话。提问使用官方兼容的权限请求桥接，显示单题单选；跳过、取消和中断会关闭对应请求。原生计划审批保留计划正文，批准后回到 Default，计划卡只提供这一执行模式。仅规划阶段可以保存或退回计划，不能批准执行。

Kimi 没有独立的只读工作模式或 Antumi 的「自由编辑」模式，不把 Plan 当作只读团队成员运行；只读团队阶段会拒绝启动。群聊讨论使用 Plan。参考项目的明确文件修改请求由 Antumi 拒绝，命令的副作用仍由 Kimi 自己的权限规则控制；这些模式不是操作系统沙箱。

会话绑定原工作目录；恢复使用 CLI 声明的 `session/load` 或 `session/resume`，历史重放不会重复进入聊天。工作目录变化或分叉通过交接创建新会话：Kimi 原生 fork 保留来源会话的 MCP 配置，会把旧 Antumi 会话权限带过去，因此不使用原生 fork。

Antumi 的 MCP 和用户选择的 MCP 随会话传入，不改写 Kimi 配置；设置 → MCP 也可导入 `~/.kimi-code/mcp.json`。额外项目通过 ACP additionalDirectories 传入，新建会话生效；恢复时 Kimi 忽略该字段，Antumi 仍在首条消息中告知额外项目路径。知识库规则沿用 ACP 公共启动说明。

暂不注入 Antumi 技能库、不使用 Antumi 托管的模型服务商，也不支持多账号、外部历史导入或额度查询。Kimi 自己配置的技能和模型服务商照常生效。当前 CLI 返回真实上下文占用，不返回每轮计费 token 明细；Antumi 不用上下文占用代替每轮用量。

## 参考与验证

- [官方 IDE / ACP 文档](https://moonshotai.github.io/kimi-code/en/guides/ides.html)
- [官方配置与数据位置](https://moonshotai.github.io/kimi-code/en/configuration/data-locations.html)
- [官方 ACP 实现](https://github.com/MoonshotAI/kimi-code/tree/main/packages/acp-server)
- 本地只读参考：Multica 的 `server/pkg/agent/kimi.go`（ACP 会话、模型、审批与恢复），Magpie 的 `internal/agent/kimi.go`（新版目录和模型配置）。

`packages/core/src/agents/kimi/fixtures/` 保存官方 2.3.2 CLI 对本地模拟模型的通信记录。测试覆盖版本检测、模式与思考选项、会话恢复及重放、命令审批、提问、计划审批、参考项目拒写和认证失败；不需要真实登录或网络。
