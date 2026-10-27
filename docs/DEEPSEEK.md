# DeepSeek Harness

Antumi 支持官方 DSH `0.2.1-rc.2`。设置 → 外部智能体 显示 CLI 检测结果和安装命令；其他版本暂不作为已验证版本启动。

```sh
npm install -g @deepseek-ai/dsh@0.2.1-rc.2
```

DSH 可沿用自己的服务商配置，也能选择 Antumi 设置里的服务商。后者支持 Chat Completions、Responses 和 Anthropic 接口；模型和推理强度以实际目录为准，空闲时可切换。图片支持由 DSH 握手和所选模型决定。回复和思考使用官方 ACP 的已提交语义事件，不伪造逐 token 增量。仅记录实际报告的 token，没有可靠价格时不显示估算费用。

## 专用 profile 与分发

`packages/dsh-runtime` 是随 Antumi 提供的 DSH 插件，不需要发布到 npm。`scripts/build-plugins.mjs` 构建并打包它；桌面后端打包时将 tarball 放入 `plugins/dsh/runtime.tgz`。

首次读取模型目录或启动 DSH 时，core 通过 argv 调用 `dsh plugin --profile antumi add <tarball>`。profile 位于 `$DSH_HOME/profiles/antumi`，默认 `~/.dsh/profiles/antumi`；DSH 自己准备基础依赖，因此主机需要可用的 pnpm 和网络。首次准备可能比正常启动久。

内容摘要与安装记录一致时复用已有插件；更新 Antumi 后按新摘要安装。并发准备合并为一次，失败不清理 profile，下一次操作可重试。其他 profile、凭据文件和用户的 DSH 默认模型设置不改动。用户对专用 profile 的额外自定义可能影响兼容性。

core 为每个阶段在自己的会话目录写入启动覆盖层，注入技能路径和服务商元数据。Key 仅通过子进程环境交付，不写入参数、覆盖层或 wire 日志；DSH 的 MCP 启动器会过滤凭据形状的环境变量，Antumi 的 shell 提供者还显式清空服务商 Key。启用服务商时只允许选择该服务商的模型。

## 权限与项目范围

| 模式 | 行为 |
|---|---|
| 默认 | 项目内编辑和命令直接执行，扩大权限需审批 |
| 自动 | 项目内直接执行，扩大权限的操作拒绝；适用于定时和例程 |
| 规划 | 只读探索；`exit_plan_mode` 显示计划卡，批准后进入自动模式 |
| 只读 | 读和搜索，拒绝编辑、任意代码执行和未经允许的 MCP 工具 |
| 全部放行 | 仅在 Antumi 允许 bypass 且没有额外只读目录时提供 |

规划专用阶段、群聊与团队的只读成员保留阶段约束。恢复会话时重新应用当前阶段模式，旧的全部放行权限不能覆盖它。无人值守期间的问题与审批由 Antumi 现有的代答规则处理。

文件提供者以规范化后的实际路径校验项目和只读目录，拒绝通过符号链接越界。shell 每次根据 `workdir` 选择对应项目作为可写根，保留 DSH 平台沙箱的临时目录权限；一个命令需同时修改多个项目时，应拆成每个项目各一次调用，不扩大到共同父目录。

知识库可写时作为额外项目根；只读时加入保护目录。若可写项目内嵌有保护目录，shell 无法表达该排除项时直接拒绝，避免放宽保护。规划与只读模式保守允许原生读取工具、受限只读命令及 Antumi 已声明的读取工具；未经证明的外部 MCP 调用拒绝。

## 协议与生命周期

插件通过官方 ACP 的 stream 扩展提供 `_antumi/models`、`_antumi/question`、`_antumi/plan` 和权限配置项；初始化返回桥接协议版本，不兼容时在打开会话前失败。会话、模型选择、MCP 连接、图片处理、取消和持久化继续由官方 ACP 实现。

core 使用通用 ACP driver，按握手能力调用 `session/resume`。计划映射到共享计划卡；批准时先确认权限切换，再回复批准。取消后仍不退出的进程由 daemon 按宽限期终止。会话绑定目录，没有原生 fork 的场景沿用 Antumi 的移交。

新增 Agent 类型将 core 协议递增到 16，旧客户端会拒绝不匹配的 core；桌面端与远程 core 同步更新即可，数据库无需迁移，daemon 协议不变。

## 验证

默认 `pnpm test` 使用假 CLI 和协议帧，并测试实际文件写入、符号链接、保护目录、恢复握手、计划卡及日志重放。不会查找或执行用户已安装的 DSH，也不调用真实模型。

显式集成检查使用固定版本 DSH、打包后的插件、独立 DSH home 和本地假服务商：

```sh
node scripts/build-plugins.mjs
pnpm test:dsh-runtime --dsh /absolute/path/to/@deepseek-ai/dsh/lib/bin.js
```

检查覆盖三种服务商协议、MCP 共存和凭据隔离、多项目写入与命令、越界拒绝、提问、计划审批、取消及只读恢复。测试目录位于系统临时目录和仓库忽略的 `work/`，结束后清理；命令沙箱检查需要主机能启动 DSH 的原生沙箱。
