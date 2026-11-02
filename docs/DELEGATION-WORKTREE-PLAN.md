# 开发委派在独立 worktree 里做：方案

状态：第二版，已吸收 Codex 对第一版的评审（2026-11-01）；按此实现于 2026-11-02，实现后的行为以 docs/ARCHITECTURE.md「智能体与委派」为准。第一版的主要错误：想直接复用会话创建的 `worktree: true` 路径（会卡住委派服务的串行队列、吞掉 setup 失败、撞上 Git 忙检查、拿不到起点）；把「不交叠」当成了放开主会话的充分条件（`summary.writing`、结果投递、输入框都另有判断）；对清理归属的现状描述反了（子会话根本不在清理服务的列表里，风险是误清而不是清不掉）。

## 1. 问题

开发委派（`capability: develop`）的子会话直接沿用主会话的目录（`agent-profile-service.ts` 的 `reconcile` 把 `current.projectPaths` 原样传给 `chats.create`）。`overlaps` 按目录判交叠，交叠的开发委派只能串行（`waiting: 'writer'`），开发成员工作期间主会话也不能发消息（`guard` 抛 `agent-call-writing`，输入框按 `delegation.writing` 禁发）。

对「跨很多目录的机械性改动」这是瓶颈：本可以拆成三四份同时做，现在只能排队。

## 2. 目标与第一版范围

目标：

- 主 Agent（或用户在委派对话框里）可以为一次开发委派选择「在独立 worktree 里做」。
- 这样的委派之间、以及它们与主会话之间互不阻塞。
- 成员把工作提交到自己的分支；主会话合并，合并后重新验证。
- 留下的 worktree 被清理页认出，委派结束后按现有规则可清。

第一版砍掉（按评审建议）：

- **只支持一个可写 Git 项目**。调用者有多个可写项目、或可写项目不是 Git（含无项目会话的 `sessions/<id>/workspace`）→ 拒绝。`prepareConversationWorktrees` 按 `--show-toplevel` 去重，同一仓库的两个 linked checkout 会被当成两个仓库而撞分支名；单仓库绕开这个问题，也让「失败回滚」不再出现（见 §4.4）。
- **不自动合并**，不自动给主会话做快照提交。起点必须是已提交状态。
- **worktree 委派不支持「继续委派」**（resume）。续跑要重建目录、重跑 setup、核对分支，第一版没有这套状态机。
- **清理页不单独分组、不显示「相对调用者分支的差异」**。只做到正确归属和正确的可清判断。
- 团队、群聊、例程、小助手的委派：`canDelegate` 已排除，不变。

## 3. 已有的积木与它们的限制

| 能力 | 在哪 | 限制（评审指出） |
|---|---|---|
| 按会话 id 建 worktree，分支 `antumi/<短id>` 从 HEAD 拉，同 id 重入找回已建的 | `workspace.ts` `prepareConversationWorktrees` | 返回只有 `{dir, topLevel, created}`，没有分支和起点；多仓库时后面失败会 `worktree remove` 前面新建的 |
| 会话创建时建 worktree 并跑 setup | `conversation-service.ts` `create` 的 `worktree: true` 分支 | 同步等 setup 退出；忽略 `setUp` 返回的失败列表；经 `gitPreparation` = `git.withRepositories`，源 checkout 有 Agent 不空闲就抛 `chat-busy` |
| copy / setup 命令与信任 | `project-config.ts`、`worktree-setup.ts` | 配置按 `gitTopLevel(repoPath)` 读，调用者是任务时读的是任务 worktree 里那份；信任按 top level 路径 + 命令 hash 记；`project-config-untrusted` 的 message 是路径，桌面端拿它去弹确认 |
| 列出、归属、清理 worktree | `worktree-service.ts`、`checkCleanWorktree` | 注入的是 `ConversationService`，`list()` 默认不含委派子会话；`inUse` 只看 `chat.turn === 'running'`；`clean` 在拿锁前读状态 |
| 委派排队、交叠、回传 | `agent-profile-service.ts` | `dispatch`/`reconcile`/`cancel`/`resume` 共用一条串行链；`summary.writing` 把所有非排队的开发委派算作写入；结果只在没有 writer 时投递 |
| 合并分支 | `git-service.ts` `merge` action，检查器「分支」页 | 受「Git 写操作须等 Agent 空闲」约束 |

## 4. 方案

### 4.1 协议（`packages/protocol`）

可选字段，不 bump `PROTOCOL_VERSION`。`waiting`、`state`、`resumeCheck.blocker` 都是枚举，**不加值**（老客户端解析会失败）。

```ts
// agent-profile.ts
export const AgentCallWorkspace = z.enum(['shared', 'worktree'])

AgentCall 增加：
  workspace: AgentCallWorkspace.default('shared'),
  // worktree 委派的工作区，准备完成时写入，之后不变（outcome 除外）。
  worktree: z.object({
    source: z.string(),          // 调用者的 checkout（任务时是任务 worktree，不是主仓库）
    dir: z.string(),             // 成员的 worktree，realpath
    branch: z.string(),          // antumi/<子会话短id>
    base: z.string(),            // 起点 SHA，建分支时读，setup 之前
    // 准备阶段：建目录 → setup → 启动成员。进行中给界面看；老客户端不认识就不显示。
    stage: z.enum(['laying-out', 'setup', 'ready']).optional(),
    setupFailures: z.array(z.string()).default([]),
    // 结束时读到的 Git 事实；读不到的字段为 null，error 说明原因。
    outcome: z.object({
      branch: z.string().nullable(), head: z.string().nullable(),
      commits: z.number().int().nullable(), changes: z.number().int().nullable(),
      error: z.string().nullable()
    }).nullable().default(null),
    // 用户在清理页清掉了目录；分支和提交还在。
    removed: z.boolean().default(false)
  }).nullable().default(null)

// rpc.ts
'agentCalls.dispatch' params 增加 workspace: AgentCallWorkspace.optional()
CORE_FEATURES 增加 'delegation-worktree'
// worktree.ts
ManagedWorktree 增加 agentCall: { id, parentId, open: boolean }.nullable().optional()
```

兼容：

- 新 MCP 对老 core 发 `workspace: 'worktree'`，老 core 的 schema 会丢掉这个字段、按 shared 执行。所以 `mcp-agent-tools.ts` 启动时按 core 的 feature 列表判断，没有 `delegation-worktree` 就不在工具参数里暴露 `workspace`；收到了也拒绝，不静默降级。
- `agentCalls.dispatch` 的 ref 幂等比较（`dispatch` 里 `same` 的判断）加上 `workspace`：同一 ref 换了工作区模式视为「引用已用于其他工作」。
- `WorktreeCleanResult.reason` 是 string，新阻塞码 `delegation-open` 不破坏解析；桌面端对不认识的 reason 显示通用文案（需核实现有 fallback）。

MCP 工具 `antumi_agent_dispatch` 的描述补一段（只在 core 支持时）：

> `workspace` 默认 `shared`：成员直接在主会话的目录里改，同目录的开发委派排队。`worktree`：成员在从当前提交拉出的独立 worktree 和分支上做，几个这样的委派可以并行，主会话也不用等；适合跨很多目录、彼此不重叠的机械性改动。要求主会话只有一个可写项目、是 Git 仓库、没有未提交的改动（未跟踪文件也算）。成员结束时把工作提交到自己的分支，结果里带分支名和提交数，由你合并并在合并后重新验证。每个 worktree 都要跑项目的 setup（可能装依赖），小改动不值得。

### 4.2 派发时的校验（`dispatch`）

`workspace === 'worktree'` 时在现有校验后追加，任一不满足就拒绝，文案给主 Agent 看：

1. `readOnly`（配置只读，或调用者在规划 / 只读模式）→ `invalid-params`「只读委派不需要独立 worktree」。
2. 可写项目恰好一个（`projectPaths` 去掉 `referencePaths`），且是 Git 仓库 → 否则 `invalid-params`「worktree 委派第一版只支持一个可写的 Git 项目」。
3. 工作区干净：`git status --porcelain=v2 -z --untracked-files=all` 为空，`rev-parse HEAD` 成功；读不到 Git 状态也拒绝 → 新拒绝码 `delegation-dirty`，文案「<项目> 有未提交的改动，先提交再派 worktree 委派；或改用 shared」。被忽略的文件不算脏；`project.json` 的 copy 带过去的本地文件不等于提交内容，文案不必提，文档里说明。
4. setup 已信任：`readProjectConfig(source)` 后 `requireTrusted([source])`。拒绝码沿用 `project-config-untrusted`，**message 保持是路径**（桌面端靠它弹确认）；MCP 层把它包装成「项目的 setup 命令还没确认，请用户到设置 → 项目确认后再派」。信任记的是 `source` 的 top level：调用者是任务时就是任务 worktree 的路径，用户信任过主仓库不等于信任过它。第一版照这个粒度来，不改配置的读取来源。

3 在准备阶段再查一次（§4.3）。

### 4.3 准备与启动

**不复用 `chats.create` 的 `worktree: true` 路径**，委派自己做准备，原因见 §3。流程：

```
queued ──(调用者回合结束、容量够)──▶ 准备中（仍是 queued，worktree.stage 推进）
   建目录 ─▶ 记 base ─▶ copy/setup ─▶ 记 setupFailures ─▶ stage: ready
──▶ starting：chats.create(agent, [dir], …, { deferStart }) ─▶ continue ─▶ send ─▶ running
```

- **排队条件**：首次启动仍等调用者回合结束（`waitOn 'parent'`），这条不放开。worktree 委派**不等 writer**：它的可写目录是自己的 worktree（见 §4.5 的定义），和谁都不交叠。容量照旧。
- **准备在串行链之外跑**。`reconcile` 对满足条件的 worktree 委派只做一件事：若没在准备，就起一个异步任务记在 `preparing: Map<callId, Promise>`，然后继续处理别的委派。准备任务自己分三步，每步结束回到 `serially` 里写状态；全部完成后调 `tick()`，下一轮 `reconcile` 看到 `stage === 'ready'` 才真正 `create` 子会话。这样装依赖再久也不挡别的委派的启动、收尾和取消。
- **建目录**：`git.withRepositoryLock([source], …)`（只拿仓库锁，不查 checkout 忙）里跑：再查一次干净（脏 → 委派 `failed`，`delegation-dirty`）；`prepareConversationWorktrees(call.conversationId, [source], worktreesRoot)`；`rev-parse HEAD` 作 `base`（此时 setup 还没跑，起点准确）；`realpath(dir)`；写 `call.worktree = { source, dir, branch, base, stage: 'setup' }`。
  为什么不用 `withRepositories`：它查的是源 checkout 里有没有 Agent 不空闲，调用者留着后台服务时 `chat.turn` 仍是 running 会被判忙；而 `worktree add -b` 只动 refs 和 worktree 元数据，不碰源 checkout 的工作树和 HEAD，锁住仓库防并发 Git 操作就够（worktree 删除走的也是只拿锁）。拿锁失败（`git-busy`）→ 留在 queued、`waiting: 'writer'`（枚举不加值，复用这个，含义是「等别的仓库操作」），`GitService` 锁释放的 `changed()` 接到 `profiles.tick()` 再试。
  `prepareConversationWorktrees` 同 id 重入会找回已建目录，所以 core 重启后 queued 的委派重新准备是幂等的；`created: false` 时跳过 setup。单仓库下它的失败回滚不会触发（回滚只删「前面成功、后面失败」的那些），不会出现违反 AGENTS.md「worktree 不自动删」的情况。多仓库支持时要先统一这条规则。
- **copy / setup**：`worktreeSetup.setUp(call.conversationId, [{ topLevel, dir }], setups)`。它在子会话 id 名下开终端跑，所以取消委派时 `stopTerminals(call.conversationId)` 能停掉它。返回的失败列表记进 `setupFailures`，**不因此失败**，和任务一样把失败输出尾部附在成员的第一条消息里让它处理。
- **启动成员**：`chats.create(profile.agent, [dir], bypass, { …现有选项, deferStart: true })`，`projectPaths` 就是 worktree 的 realpath，`referencePaths` 照旧原地只读。之后 `continue`、`send`，状态 `running`。`create` 失败 → `failed`，错误原文回传；worktree 保留。
- **第一条消息**（`prompt`）在 worktree 模式下追加：

  > 你在独立的 worktree 里工作：目录 `<dir>`，分支 `<branch>`，起点 `<base 前 8 位>`。结束前把所有改动提交到这个分支（`git add -A && git commit`），不要 push、不要合并到别的分支、不要切换分支。结果里写明提交列表和还没提交的文件；主会话会合并你的分支并重新验证。

  保留现有那句「这些目录里还有其他会话留在后台运行的命令……不要停止或重启」里的约束部分：worktree 隔离的是文件检出，不隔离端口、数据库、Docker 服务和外部缓存。去掉「修改文件时留意它们」的那半句。setup 有失败时再附一段「setup 失败：…」。

### 4.4 取消、重启、删除主会话

- **取消**：准备中 → `stopTerminals(childId)` 停 setup 终端，准备任务收到取消后不再推进；已建的目录和分支留着。运行中照旧 `stopChild`。取消后也尽力收一次 outcome（§4.6），读失败不阻塞结束。
- **core 重启**：`queued` 且 `worktree.stage` 未到 `ready` → 重新准备（幂等）。`starting`/`running` 而子会话不存在 → 现有逻辑标 `failed`（`AGENT_CALL_NOT_STARTED`），worktree 留着归用户清。
- **删除主会话**：现在 `cancelForParent` 只取消，不级联删子会话和 call 记录；清理页要能在主会话已不存在时照样归属（显示「主会话已删除」，不强取标题）。

### 4.5 调度：按「实际占用的可写目录」统一判断

新增一个私有函数，所有交叠判断都用它：

```ts
// 一次开发委派实际会写的目录：shared 是调用者的可写目录；worktree 是它自己的 worktree（准备好之前为空）。
private writableRoots(call, owner): string[]
```

改四处（评审「必须改 1」）：

| 位置 | 现在 | 改为 |
|---|---|---|
| 排队循环的 writer 判断 | 用调用者目录比较所有运行中的开发委派 | 比较「待启动委派的 writableRoots」和「运行中委派的 writableRoots」；worktree 委派两边都不交叠，直接过 |
| `guard(conversation)` | 有运行中开发委派且其调用者目录与本会话交叠就挡 | 用委派的 writableRoots 与本会话目录比；worktree 委派不挡调用者 |
| `summary().writing` | 任何非排队的开发委派 | 只算 shared 的（或 writableRoots 与调用者交叠的） |
| 结果投递的 `writer` | 任何运行中开发委派 | 同上 |

效果：worktree 委派在跑时，主会话输入框可用、已完成的其他委派结果照常回传、shared 委派的排队也不被它挡。首次启动等调用者回合结束的规则不变。调用者空闲时被停下腾名额的逻辑不变。

**任务级检查不放开**：`task-service.ts` 的状态移动、`submit`、`submitChecked` 查的是 `delegationBusy`（有无未结束委派），继续保留。主会话能不能继续干活，和任务能不能宣告完成是两回事。

### 4.6 结束与回传

成员回合结束（以及失败、取消）时，core 自己读 Git 事实写进 `worktree.outcome`，不信成员自述：

- `symbolic-ref --short HEAD`（实际分支，和 `branch` 不一致要标出来：成员可能切了分支，「合并 antumi/xxx」就不含它的工作）、`rev-parse HEAD`、`rev-list --count <base>..HEAD`、`status --porcelain=v2 -z --untracked-files=all` 的条目数（`-z` 全量，避免一个未跟踪目录只算一行）。
- 任一命令失败 → 对应字段 null，`error` 写原因；不阻塞委派结束，不影响其他委派的回传。
- 结果文本尾部追加一段（和「已停止成员留在后台的命令」同样的做法）：

  > （worktree 委派：分支 `antumi/xxx`，3 个提交，0 个未提交文件。合并后请重新运行检查。）

  有未提交文件：「有 N 个未提交文件留在 worktree 里，合并前别清理」；实际分支不对：「成员当前在分支 `yyy`，不是 `antumi/xxx`」。
- 回传 JSON 多一个 `worktree: { dir, branch, base, outcome }` 字段，和 `...resumedNote(call)` 的扩展方式一致；独立字段也避免 result 截到 20000 字时丢掉尾部。
- `state` 仍按回合结果定，未提交文件不改判。

### 4.7 合并

不自动合。两条路：

- **主 Agent 自己合**：在主会话目录里 `git merge --no-edit antumi/xxx`（或 cherry-pick），解冲突，跑检查。指引见 §4.9。
- **用户在界面合**：卡片和检查器「委派」页显示分支名，提供「复制分支名」「在 Git 页面打开」（定位到调用者的 checkout，分支树右键「合并到当前分支」已有）。第一版不在卡片上放「合并」按钮。

任务里的委派：调用者在 `antumi/<任务>` 分支的 worktree 上，成员从它再拉一条（从 linked worktree 发起 `worktree add` 可行，评审已核实），合回任务分支。验收起点和 `check` 的执行目录不变；任务提交验收仍要等委派全部结束（§4.5）。

### 4.8 清理（`worktree-service.ts`、`checkCleanWorktree`）

现状：`main.ts` 把 `ConversationService` 直接当 `WorktreeConversations` 注入，`list()` 不含委派子会话，所以委派 worktree 会被当成**无归属**目录，干净就能清，哪怕委派还在跑。这是必须补的。

改法：

- 注入换成一个小对象：`list()` 返回 `conversations.list(false, false, true)` 过滤出 `parentConversationId` 非空的，每条带 `agentCallId`；另给 `callState(id)` 查委派是否 open（来自 `AgentProfileService`）。
- `inspectAll`：归到子会话的目录填 `agentCall = { id, parentId, open }`，`conversationId` 照填；`inUse` 对委派 worktree = `open`（覆盖 starting / awaiting / 准备中的 setup 终端，比只看 `turn === 'running'` 严）。
- `checkCleanWorktree`：`agentCall` 非空时，`open` → `delegation-open`；否则跳过 `conversation-open`，走 in-use / locked / dirty / alone。分支和提交留着，清目录不丢东西。
- **清理与续跑的竞争**：第一版 worktree 委派不能 resume（§2），所以没有「清理用了旧快照、委派同时被续跑」的问题。但 `clean` 仍要在 `remove` 之前进 `AgentProfileService.serially` 再确认一次 call 不 open，并把 `worktree.removed = true` 写回；以后支持续跑时靠这个标记挡。
- 清理页每行：主会话标题（已删除则写明）、智能体名、分支；`unmerged` 仍比 origin 默认分支，行上显示真实的 `into`，不说成「还没合回主会话」。

### 4.9 给主 Agent 的指引

`conversation-service.ts` 里那条委派说明补一句：

> 跨很多目录、彼此不重叠的机械性改动，可以拆成几个 `workspace: worktree` 的开发委派同时做：先把自己的改动提交，派出后可以继续做不相关的事，但别改派出去的那些文件；结果回来后合并各个分支（`git merge`），解决冲突，重新跑检查。

### 4.10 桌面端

- **委派对话框**（`AgentDelegation.tsx`）：选了会改文件的目标、core 有 `delegation-worktree`、会话恰有一个可写 Git 项目时，多一个开关「在独立 worktree 里做」，默认关，下面一行说明：「从当前提交拉出分支，和主会话互不阻塞；做完要你或主会话合并。」提交走 `withProjectTrust`（和 `ConversationDraft` 一样），`project-config-untrusted` 弹确认后重试；`delegation-dirty` 显示文案。
- **卡片 / 检查器「委派」**：标记「独立 worktree」；准备中显示阶段（建 worktree / 运行 setup）；进行中显示分支；结束后显示「3 个提交 · 2 个未提交」，有未提交或分支不符的用警示色（取 `styles.css` 的 token）。菜单「复制分支名」「在 Git 页面打开」。「继续」对 worktree 委派不显示。
- **清理页**：见 §4.8，不单独分组。

### 4.11 文档与变更记录

- `docs/ARCHITECTURE.md`「智能体与委派」补 worktree 委派的规则（校验、准备、调度、回传、不支持续跑）；「清理 worktree」补委派 worktree 的归属与可清条件。
- `CHANGELOG.md` `## 未发布` → `### 新功能`：「开发委派可以在独立 worktree 里做：几个这样的委派同时进行，做完由主会话合并分支。」

## 5. 实施顺序

每步一个提交，带测试：

1. **protocol**：`workspace`、`worktree`、feature、`ManagedWorktree.agentCall`、`dispatch` 参数；`checkCleanWorktree` 的 `delegation-open`。protocol 测试。
2. **core 派发与调度**：`dispatch` 校验（含 ref 幂等带 workspace）、`writableRoots` 与四处交叠判断、任务级检查不动。`agent-profile-service.test.ts`：两个 worktree 开发委派并行；worktree 委派不挡调用者、不挡结果投递、`summary.writing` 为假；脏仓库 / 多项目 / 非 Git / 只读被拒。
3. **core 准备阶段**：串行链外的准备任务、仓库锁、base 记录、setup 失败附进首条消息、取消停 setup、重启幂等。测试用假 Git 仓库。
4. **core 收尾**：outcome 收集与回传字段、文本尾部。
5. **core 清理**：注入换成带子会话的来源、`inUse`、清理前复核。`worktree-service.test.ts`。
6. **MCP**：按 feature 暴露参数、描述、拒绝文案包装；主 Agent 指引。
7. **桌面端**：对话框开关与信任确认、卡片、清理页行。`pnpm build`。
8. 文档与 CHANGELOG 随各步提交。

## 6. 风险与取舍

- **起点要求干净**：主 Agent 多一次提交。接受。自动快照留作后续。
- **单可写项目**：多项目任务用不上。接受，先把单仓库跑通；多仓库要先决定 `prepareConversationWorktrees` 的失败回滚怎么和「不自动删」统一，并按 `git-common-dir` 去重。
- **每个 worktree 跑一遍 setup**：靠工具描述让主 Agent 只在大范围改动时用。
- **主会话边等边改**：放开后主会话可能改了派出去的文件，合并时冲突。提示词约束，不强制。
- **信任粒度**：任务里派 worktree 委派，要对任务 worktree 的路径再确认一次 setup。第一版接受；之后可以考虑信任按 `git-common-dir` 记。
- **`delegation-open`、`delegation-dirty` 是新字符串**：Rejection 的 reason 和 clean 的 reason 都是 string，不破坏解析；桌面端要有通用 fallback 文案（核实）。
- **不支持续跑**：worktree 委派失败后只能重新委派。新委派会建新的 worktree，老的留给用户清。

## 7. 待评审的问题

1. 准备阶段用「只拿仓库锁」代替 `withRepositories` 的忙检查，理由是 `worktree add` 不碰源 checkout 的工作树。是否接受？
2. `waiting` 不加值、复用 `'writer'` 表示「等仓库锁」；`stage` 放在 `worktree` 对象里而不是加 `state`。是否接受这种为兼容做的折衷？
3. 第一版不支持 worktree 委派续跑，界面上直接不给「继续」。还是给一个解释性的禁用状态？
4. 信任按任务 worktree 路径再确认一次，用户会不会觉得重复？
5. `delegation-dirty` 把未跟踪文件算脏。是否接受？
