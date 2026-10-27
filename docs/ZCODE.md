# ZCode

Antumi 通过 ZCode 的 **app-server**（`zcode app-server --stdio`）接入 [ZCode](https://github.com/zai-org/ZCode)。ZCode 桌面版自己也是这样驱动它的 CLI：一个会话一个常驻进程，说的是 ZCode Protocol，stdio 上逐行 JSON。ZCode 没有 ACP 模式。

## 安装

Z.ai 只发布桌面版安装包（dmg / exe），没有单独的 CLI 发行版。可用的 `zcode` 有三种来源：

- **ZCode 桌面版**：装好后 PATH 上的 `zcode` 指向应用内置的运行时。app-server 和 `--prompt` 都能用，终端界面（TUI）用不了，Antumi 也用不到它。
- **`zcode-app-cli`**：社区维护的 npm 包，打包了桌面版同一个运行时，`npm install -g zcode-app-cli@latest`。设置 → 外部智能体 缺少 ZCode 时提供的就是这条命令，升级也按 npm 包走。
- **从源码构建**：见 ZCode 仓库的 `apps/zcode-cli/docs/usage/01-quickstart.md`。

模型和登录都用 ZCode 自己的：`zcode login`（Z.ai 或 BigModel 账号），或在 `~/.zcode/v2/provider_config.json` 配置模型服务商。外部智能体 的「已登录」看的是这个文件或 `~/.zcode/v2/credentials.json` 是否存在。

## 用量

ZCode 自己配置了 GLM 编程套餐的 API key 时，用量额度和底部用量栏显示套餐的 5 小时、每周额度和每月的 MCP 额度：Antumi 读 ZCode 默认模型所属服务商的 key（`~/.zcode/v2/provider_config.json`，或旧版的 `~/.zcode/cli/config.json`），只认 `api.z.ai`、`open.bigmodel.cn` 的地址或 `zai-api`、`bigmodel-api` 模板，再请求 `<主机>/api/monitor/usage/quota/limit`，和 Z.ai 控制台、Orca 读的是同一个接口。用 `zcode login` 登录账号的，凭据是 ZCode 加密保存的，Antumi 不去解密，这时不显示额度。

## 协议

ZCode Protocol 是它桌面端私有的协议，`@zcode/shared` 没有发布，Antumi 在 `core/src/agents/zcode/zcode-schema.ts` 里只写用到的部分，字段一律宽松解析。用到的方法：

| 用途 | 方法 |
|---|---|
| 新建会话 | `v4/command` `createSession`（带模式、模型、附加目录和 MCP 服务器） |
| 恢复会话 | `session/resume`（带 MCP 服务器），再订阅 |
| 会话内容 | `v4/conversation/subscribe` 订阅 `conversation/<sessionId>`：先收快照，再收行和状态的增量；超大的帧拆成 base64 分片，按 crc32 校验后拼回 |
| 模型、思考强度、斜杠命令 | `session/read` |
| 发消息 | `v4/command` `sendText`；带图片时用旧的 `session/send`，按文件路径传图（V4 只收上传的字节） |
| 插话 | `sendText` 带 `requestedDelivery: 'guide'`，ZCode 在下一个能插入的地方接住，接不住就在本轮结束后执行 |
| 停止 | `v4/command` `stop` |
| 切换模式 / 模型 / 思考强度 | `switchCollaborationMode` / `switchModelConfig`，带当前 `revision`（过期会被拒绝） |
| 审批 | ZCode 发 `interaction/requestPermission`，Antumi 回所选选项的 `response`（拒绝时回 `{ decision: 'deny', reason }`） |
| 提问、计划审批 | ZCode 发 `interaction/requestUserInput`；计划审批回 `{ action: 'accept', content: { answer: 'approve' } }`，其他文字作为意见让它继续规划 |

恢复会话时，Antumi 依次切到会话选定的权限模式、模型和思考强度，每次等 ZCode 报回新状态再切下一项；最后权限模式不对（比如会话原来是全部放行，切不回「修改前询问」），阶段拒绝启动，不会比用户选的更宽松地跑。

在 createSession 时给出的 MCP 服务器只活在那个进程里，冷恢复的会话要在 `session/resume` 里再给一次，否则 Antumi 的工具会消失。ZCode 不带模式新建会话时用工作区默认值 `yolo`，所以 Antumi 总是写明模式。

ZCode 还会请求 `session/requestRuntimePreferences`（Antumi 回附加目录，关掉记忆和工具搜索）、官方 MCP 的鉴权头、浏览器等桌面端自己的服务，后者一律回「不支持」。

日志里不记流式增量（`row.delta`，完成的行带全文）、遥测和启动进度，`session/resume`、`session/read` 的历史消息也不记，所以从日志重放和实时得到同样的条目（`zcode-app-server.test.ts` 逐份 fixture 对比两者）。

## 权限模式

| Antumi | ZCode | 行为 |
|---|---|---|
| ask | `build` | 修改文件、运行有风险的命令前先问 |
| acceptEdits | `edit` | 修改项目里的文件不问，其他照 build |
| plan | 规划标志（`planEnabled`）叠在 build 上 | 只读代码，用 ExitPlanMode 交计划，批准时可换成别的模式执行 |
| auto | `guarded` | 有风险时才问 |
| readOnly | `build` | ZCode 没有只读模式：改文件的请求（Write、Edit 等）由 Antumi 直接拒绝，命令仍由 ZCode 判断要不要问 |
| bypass | `yolo` | 都不问 |

ZCode 运行 MCP 工具前都会问，Antumi 自己那些只读的工具（预览、浏览器读取、待办等）由 driver 直接放行，和其他 Agent 一样。参考项目和只读知识库里的修改直接拒绝。

## 限制

- 分叉对话用移交，不用 ZCode 的 `forkAssistant`：它以行号分叉，Antumi 没有对应的名字。
- 技能库不交给 ZCode：它只从自己的设置文件加载技能。
- 模型列表是 ZCode 报告的可用模型。用模拟服务商测试时它只报当前模型，真实账号下的列表还没有验证。

## 服务商

ZCode 能跑在设置里的服务商上（Anthropic、Chat、Responses 三种接口，优先 Anthropic）。ZCode 只从它的服务商文件读 Key，所以这是 Antumi 里唯一把服务商 Key 写进文件的 Agent：

- 文件在 `~/.antumi/sessions/<会话>/launch/<阶段>/.zcode/v2/provider_config.json`，目录 0700、文件 0600（Windows 上用 ACL 限定为当前用户，做不到就拒绝启动），只含这一个服务商。
- 用 `ZCODE_DATA_BASE_DIR` 指向这个目录，再把 `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE`、`ZCODE_CLI_CREDENTIALS_FILE` 指进去：这个进程看不到用户自己的服务商和 Z.ai 登录；会话、设置和日志仍在 `~/.zcode/cli`，恢复会话不受影响。
- ZCode 监听这个文件，删掉后下一轮就没有模型，所以文件留到进程退出，由 core 删除（见 ARCHITECTURE.md 的「阶段的启动目录」）。
- 启动后不在选定的那个服务商模型上（地址或 Key 错了时，ZCode 会静默地没有模型），阶段拒绝启动；恢复会话时切不到它也一样。
- 已验证：三种接口用本机模拟服务实测了请求地址和鉴权头；正常请求、401、服务商文件写错时，Key 都不出现在 Antumi 的 wire 日志、ZCode 的会话库、model-io 日志和运行日志里。ZCode 自己的工具（如 Bash）仍能读到这个文件，和其他 Agent 能读到环境变量里的 Key 一样，挡不住。

已验证的版本：`zcode-app-cli 3.16.2-38`（运行时 0.17.0，对应 ZCode 3.16.2），2026-10-23。
