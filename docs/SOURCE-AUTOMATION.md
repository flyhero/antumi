# 来源事项自动化闭环（设计）

> 状态：回写地基及「中枢新建任务 → 独立任务完成 → 检查 → PR（GitHub）→ 待验收」已实现；平台问答、自动改派与多周期返工仍为设计。具体流程见 SOURCE-AUTO-INVESTIGATION.md。

事项进入范围后，Antumi 自己接单、处理、在平台上提问并等回复、交付并交接给下游，被打回时自己返工；用户只在需要决策时出现。硬约束：**平台上不属于用户本人的操作一律不做**——缺陷只走到「提测 / 已解决」，验证和关闭留给 QA。

它建在三块已有的东西上：[来源回写](SOURCE-WRITEBACK.md)（改状态、发评论）、[来源评论同步](SOURCE-COMMENTS.md)、[事项自动化](SOURCE-AUTO-INVESTIGATION.md)（接单队列）。参考过 Linear 给智能体的建议（按状态类型推进，等输入和完成是不同的状态）、Multica（完成留给人，反馈去重）、GitLab 的 Jira 集成（按类别找下一个状态；同一状态在不同类型的工作流里 ID 不同）、orca（拿不准就不动）。

## 原则

1. **只在事项归我时动它。** 每次自动写入前现取处理人，由 core 判定归属；不归我就不写。不靠提示词。
2. **Agent 只提交结果，core 执行写入。** Agent 读过不受信的原文，拿不到任何写平台的工具。
3. **任务决策交给中枢，执行边界由 core 守住。** 中枢选择任务标题、详情、项目、Agent、模型及推理强度；core 校验并执行，不猜测或替换参数。平台状态仍由用户的类型规则和归属守卫决定，每一步都有记录。
4. **意图先落库，再外发。** 任务状态变化和「要回写」的意图同一事务提交；投递时再现取上下文、过守卫、重试。
5. **默认保守，逐级放开。** 默认不进完成类状态；演练模式只记不写；任何时候可接管。
6. **只加不改。** 协议、插件、MCP 工具、配置文件都只加可选字段；旧插件、旧 core、旧数据照常工作。

## 整条链路

```
事项进入范围 ─▶ 接单（去重、分流、选项目、排队）─▶ 建任务并无人值守开始
   ─▶ Agent 工作 ─▶ source_report 提交结果
        ├ needs_input ─▶ 平台提问（@报告人）─▶ 等回复 ─▶ 允许的人回复 ─▶ 原任务续跑
        ├ blocked ────▶ 通知主人
        ├ answered ───▶ 回写结论
        └ delivered ──▶ 交付关卡（已提交 → 检查 → 可选复核 → PR）─▶〔默认：主人确认〕
                        ─▶ 交接：改到提测状态、改派给下游、发总结和验证说明、挂 PR
   已交接 ─▶ 观察：被打回且回到我手里 ─▶ 返工（新周期）
           ─▶ 别人完成 / 关闭 / PR 合并 ─▶ 任务自动验收，运行结束
```

所有对平台的写入走同一条路：**意图 → 投递器（现取事实 → 泳道 → 归属守卫 → 选转换 → 写入 → 记录）**。

## 归属判定

插件只报告事实：当前账号 `viewer`、处理人列表 `assignees`、报告人、类型、范围。结论由 core 的 `sourceOwnership()` 算，五个值：

| 结论 | 含义 | 手动开始的任务 | 自动接单的运行 |
|---|---|---|---|
| `sole` | 处理人只有我 | 写 | 写 |
| `unassigned` | 没有处理人 | 写，记录里注明 | 不接 |
| `shared` | 处理人有我也有别人 | 只发评论；来源可选择算作归我 | 跳过 |
| `other` | 处理人不是我 | 状态和评论都不写 | 结束运行 |
| `unknown` | 旧插件或平台取不到 | 照旧执行，记录「归属未校验」 | 跳过 |

事项交接给 QA 后归属变成 `other`，之后任何规则（包括「由我关闭」）都被跳过：这是「不替别人操作」的硬保证，不依赖用户把规则配对。手动在任务详情里改状态、发评论不过守卫：那是用户本人的操作。

为什么不是简单的「处理人 == 我」：TAPD 的处理人是分号分隔的多人，GitHub 可以有多个 assignee，禅道多人任务的 `assignedTo` 取不到；旧插件什么都不报告，若一律当作「不是我」，升级 core 会让现有规则全部静默失效。

## 流程策略：按类型的泳道

一个来源同时接任务、缺陷、需求、PR，各自的工作流不同。

- 不设通用规则或通配泳道：只执行用户明确配置的类型规则，未配置或无法识别类型时不自动回写。`SourceWritebackConfig` 为兼容旧协议保留字段，来源级只使用总结要求。
- `writebackLanes` 按事项类型独立配置。`WritebackLane { typeId, scopeId?, mode: 'on' | 'off', start, review, done }`，没写的阶段不做操作。`resolveLane()` 优先取类型和范围都匹配的规则，否则取该类型无范围限制的规则；两者都没有就不回写。复制另一类型的规则后，两份配置独立，不建立继承关系。
- 阶段的目标是联合类型 `{ names } | { statusId, name }`：现在用状态名（`A|B`，取第一个此刻能流转到的），有了状态目录后存平台的状态 ID。
- `writebackOptions { dryRun, sharedCounts }`：演练模式；多人处理时是否算作归我。
- 都存在 `sources.json` 的同一条实例配置里，文件版本号不变（改版本号会让旧 core 把整个文件当成无效而覆盖）。
- 类型从哪来：插件 manifest 的 `writebackTypes`（TAPD、禅道、GitHub 的类型是固定的，各带自己的预设）加上收件箱里实际出现的类型（Jira）。Pull Request 默认 `off`。

**完成类状态。** 不能按类别一刀切地禁止：「已解决」在 Jira、禅道、TAPD 都属于完成类，却正是开发交给测试的那一步。规则是：默认值永不指向完成类状态；用户明确配置的照办；原来的「验收通过」一栏改叫「由我关闭」，新泳道默认不填。真正拦住越界的是归属守卫：交接之后事项不再归我。

下线的越界预设：GitHub 提交验收时的 `Done|completed`（会在交接时关掉 Issue）、禅道验收通过的「已关闭」。已经保存的这类值不动，设置页给出警告。

## 意图与投递

原来规则写入只在内存里排队：任务状态已经存库，写入还没发出时 core 退出，这次反馈就丢了，重启也补不回来。

- 表 `source_intents(id, task_id, trigger, created_at, state, attempts, next_at)`。`TaskStore.update(id, patch, link?)` 在任务状态变化的同一事务里插入一行（和建任务时 `TaskCreationLink` 的做法一样：别的存储借任务库的连接写）。只记「哪个任务、哪个时刻」，不记具体写什么：目标状态和归属要到投递时现取才知道。
- 不能做成「启动时按任务当前状态补发」：那会给每个历史任务都补一遍规则。也不用确定性的 ID 去重：验收被打回再提交，规则应当再走一次（只有「开始执行」对同一任务只生效一次）。
- 投递器 `SourceWriteback.drain()`：状态监听回调和启动时各触发一次，按事项串行。每条意图：现取事实 → 选泳道 → 过守卫 → 选转换 → 写入，结果记进 `source_writes`。
- `source_writes` 的记录只加可选字段（`guard` 归属结论、`planned` 演练时本来会写的内容、`lane` 用了哪条泳道、`attempts`），不扩已有的枚举：降级的旧 core 启动时会解析所有未完成的记录，认不出新枚举值就起不来。
- 重试：状态写入自动重试，退避 1、5、15 分钟后放弃；每次都先读当前状态，所以重复执行是安全的。评论结果不明仍记「结果待确认」等用户点重试（第三期加读回核实后自动补发）。鉴权、权限、事项不存在的错误不重试。
- 演练模式：走完整流程但不调用写接口，记录为跳过并写明本来会写什么。
- `sources.writebackPlan { target, trigger }` 预览一步：会写什么、归属结论和原因。任务详情在「提交验收」前展示它；对手动开始的任务，这一下点击就是「交接前确认」。

## 结构化结果

`source_report` 不改名（MCP 工具只加不改），加可选字段，`summary` 仍必填，只带 `summary` 的旧调用照常：

```ts
{ summary, outcome?: 'delivered' | 'answered' | 'needs_input' | 'blocked',
  verification?,   // 给验证人的说明：怎么验、影响范围
  question?,       // needs_input 时的一个具体问题
  blocker?,
  fix?: { decision: 'repair' | 'needs_input' | 'no_fix', evidence, plan,
    task?: { title, details, agent, repos: [{ path, reference?, startRef? }],
      model?, effort?, modelProvider?, dependsOn? } } }
```

中枢不再通过 `source_report` 提交任务提案，改用 `source_task_create` 当场新建（见 SOURCE-AUTO-INVESTIGATION.md）；任务权限只取用户策略。`verification` 作为单独一段带进交接评论。`needs_input` 和 `blocked` 的平台提问和上报仍待第三期。归属不由 Agent 判断，所以没有「不归我」这种结果。

发往平台的评论，凡是来自总结或最后一条回复的，先过 `channel-output.ts` 的 `redact` 和 `withoutMachinePaths`（密钥、主目录路径）；用户亲手写的不动。

## 入站与唤醒（第三期）

- 评论加 `author { id, name, bot? }` 和 `replyTo?`。
- 唤醒条件全部满足才让 Agent 继续：在提问之后；作者是报告人、被 Agent 点名的人或白名单里的人；不是机器人，也不是 Antumi 自己发的。其他评论照常同步，下次一并带上，但不唤醒。
- 回复经 `SourceUpdates.send` 的投递路径送回原任务会话，仍用 `untrustedSource` 包裹；续跑的那一轮不提升权限。
- 有运行在等回复时，该事项 1 到 2 分钟轮询一次（按实例限速），其余保持 15 分钟。
- 评论结果不明时读回评论列表核实（作者是我、正文一致、时间在发送之后），再决定是否补发。
- 每个周期最多提问 3 次，超出转「需要你」。
- 禅道没有评论接口，只有状态这一层的闭环。

## 自动接单与交付关卡（第四期）

- 接单由 `SourceInvestigationService` 扩展：沿用 binding / seen 去重、每日上限、额度和容量检查；并发从全局 1 个放开为可配（默认 2）；泳道决定处理、只排查还是不接；按平台项目、组件、标签路由到本地项目。只接归属为 `sole` 的事项。
- 启动复用 `TaskService.start(id, allowBypass, unattended, options)` 和 `unattendedAnswer`。
- 运行状态机 `queued → preparing → working → waiting-reply | waiting-owner | delivering → handed-off → closed`，带周期号（被打回一次加一）。`decide(run, event, policy, context)` 是纯函数；`source_run_events` 只追加，供时间线和排错。
- 交付关卡按序：改动已提交 → `WorktreeSetup.check` 通过（失败退回 Agent，最多 3 次）→ 可选的独立复核 → `PullRequestService.create` 开 PR（非 GitHub 只推分支）→ 按自主程度决定是否等主人。
- 自主程度：`confirm-handoff`（默认，交接前等主人确认一次）或 `auto`（过关卡即交接）。不自动合并 PR。
- 回合结束却没提交结果：提醒 Agent 一次，仍没有就转「需要你」。

## 状态目录与交接动作（第二期）

- 插件 `catalog`：按范围和类型列出全部状态（ID、名字、类别），只读，现有 Token 就够。设置页的泳道表从它取下拉选项。
- 起草策略：按类别和名称启发；可选读最近若干条经手事项的流转历史（`history`），看哪些步骤是我做的、之后交给了谁。用户确认一次后固定。
- 交接时的其他动作：改派（保持不变 / 报告人 / 插件给的角色如 TAPD 的测试人员 / 指定的人）、挂 PR 链接。`transition` 可带 `assignee` 和 `fields`（如 Jira 的解决结果）。

## 下游回流（第五期）

已交接的运行每轮同步核对状态和处理人：

- 回到未完成状态且归属回到我：新周期，把交接之后的评论带给原任务返工（最多 3 个周期）。
- 别人完成或关闭、PR 合并：任务自动验收，运行结束。
- 被改派给别人：运行结束。
- PR 检查变红或评审要求修改：自动走 `PullRequestService.handoff`，带次数上限。

收件箱加「自动处理」视图：处理中、等回复、需要你、已交接。

## 插件协议

- **SDK 0.7.0（第一期，没有新方法）**：`transitions()` 的返回值加可选事实 `statusId`、`viewer`、`assignees`、`reporter`、`type`、`scope`，选项加 `toStatusId`；`SourceIssue` 加可选 `typeId`、`scope`；manifest 的来源加 `writebackTypes`。旧 core 丢弃不认识的字段，旧插件不返回就是 `unknown`。不加新方法有两个原因：SDK 运行时遇到不认识的方法会直接退出；每次调用是一个新进程，一步交接拆成几次调用太慢。
- **之后各期（manifest 声明了才调用）**：`catalog`、`assign` / `roles`、`link`、`history`；评论的作者 ID、回复关系、`mentions`。

## 各平台

| 平台 | 归属事实 | 典型交接 | Antumi 不做 |
|---|---|---|---|
| Jira | `myself.accountId` 对 `assignee.accountId` | 缺陷 → 团队的提测 / Resolved 状态 | 验证、关闭 |
| TAPD | 当前用户 nick 对 `owner` / `current_owner`（可能多人） | 缺陷 → 已解决；需求 → 团队的提测状态 | 已验证、已关闭 |
| 禅道 | account 对 `assignedTo`（多人任务取不到 → `unknown`） | Bug「解决」后平台自动指回创建人；任务「完成」 | 关闭 |
| GitHub | user id 对 `assignees[]`（PR 看作者） | 开 PR 带 `Refs/Fixes #n`，评论总结 | 关 Issue、合并或关闭 PR |
| Linear | `viewer.id` 对 `assignee.id` | In Review（团队有才改）；完成交给 PR 合并 | Done |
| 飞书项目 | 当前负责人或节点 owners 的稳定用户 ID；身份完整时核验 | 完成我独自负责的进行中节点 | 别人的节点、无法核验归属的节点 |

## 安全

- 事项原文和评论一律 `untrustedSource` 包裹；Agent 没有写平台的工具。
- 发出的评论打码；代码只推任务分支和 PR，不动默认分支、不合并。
- 唤醒按平台用户 ID 的白名单。
- 演练模式；逐来源、逐运行可暂停；用户在任务里一操作即接管（沿用自动排查的 handed-over）。
- 新增的 RPC 都不开放给手机。

## 分期

| 期 | 交付 | 状态 |
|---|---|---|
| 一 地基 | 归属守卫、按类型泳道（状态名）、持久意图和状态自动重试、`source_report` 结构化字段、演练和写入预览、评论打码、下线越界预设、五个插件报告事实 | 实现中 |
| 二 状态目录与交接 | 状态目录和状态 ID 下拉、策略起草、改派和角色、PR 链接 | 设计 |
| 三 问答回路 | 平台提问、评论作者 ID、自适应轮询、自动续跑、评论读回核实 | 设计 |
| 四 自动接单 | 接单扩展、运行状态机和事件日志、项目路由、并发、交付关卡、自主程度 | 设计 |
| 五 下游回流 | 打回返工、PR 自动交回、外部完成自动验收、自动处理视图、飞书项目节点流 | 设计 |

已定的取舍：交接前默认要用户确认一次，每个来源可放开；能唤醒 Agent 的是报告人、被点名的人和白名单；首批平台是 Jira、TAPD、禅道、GitHub、Linear。
