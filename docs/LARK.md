# Lark 资料接入（设计）

> 状态：设计，未实现。来自 [#11](https://github.com/flyhero/antumi/issues/11)。Meegle（飞书项目）作为任务来源另起一期，不在本文。B 节 2026-11-26 改为接飞书官方 MCP、读写都可（原先是只读、自己实现工具），2026-11-27 起完整设计移到 [CHANNEL-LOOP.md](CHANNEL-LOOP.md) 第三节。

让智能体使用 Lark（含飞书）的文档、知识库和多维表格。分两种用法，安全模型完全不同：

| | 谁在用 | 用什么身份 | Antumi 要做的 |
|---|---|---|---|
| A. 自己用的智能体 | 主人本人 | 主人自己（`lark-cli` 登录），或应用 | 推荐技能 + 使用说明，不写新功能 |
| B. 接到聊天平台的智能体 | 在飞书里 @ 机器人的同事 | 机器人（应用身份，tenant_access_token） | 转接飞书官方 MCP，主人勾选开放的工具，Antumi 附上凭据 |

主人自己的身份（他登录的 `lark-cli`）只在主人同意之后、在他开始执行的任务里用，见 CHANNELS.md「主人在聊天平台上同意」。

文中「Lark」同时指飞书和 Lark：两者接口相同，只是开放平台域名不同（见「平台差异」）。

## A. 自己用的智能体：官方 CLI + 技能

Lark 官方的 `lark-cli`（npm `@larksuite/cli`，MIT）覆盖文档、知识库、多维表格等，仓库 `larksuite/cli` 的 `skills/` 带有 `lark-doc`、`lark-wiki`、`lark-base`、`lark-shared`（认证与身份，其他技能都依赖它）等 Agent 技能。`larksuite/meegle-cli`（MIT）同理，带 `skills/meegle`。

Antumi 的技能库已经能装这两个仓库（`git clone` 后先扫 `skills/`，见 ARCHITECTURE.md 的技能一节），所以只做两件事：

1. `packages/core/src/skills-recommended.ts` 加两条推荐：
   - `https://github.com/larksuite/cli`，`skills: ['lark-shared', 'lark-doc', 'lark-wiki', 'lark-base']`，说明里写「需要先安装 lark-cli 并登录」。
   - `https://github.com/larksuite/meegle-cli`，`skills: ['meegle']`，说明同上。
2. 本文这一节作为使用说明，桌面端推荐卡片的主页链接指向官方仓库。

使用步骤（写给用户）：

1. `npm install -g @larksuite/cli`；`lark-cli config init --brand lark`（飞书用 `feishu`），填自建应用的 App ID / Secret。可以用聊天平台接入的同一个应用。
2. 选身份：`lark-cli auth login`（设备码，本人授权）后默认以本人身份；不登录则以应用身份（`--as bot`），只能读分享给应用的内容。lark-cli 的规则是有未过期的用户令牌就用用户，否则用应用。
3. 「设置 → 任务 → 技能」安装推荐的 Lark 技能，按 Agent 启用。

要知道的：

- Antumi 不替用户装 CLI、不代管它的登录，也不改 `~/.claude`、`~/.agents` 等目录。
- 这台电脑上所有能执行命令的 Agent 共用这份授权，包括「全部放行」的会话。只查资料就只申请读权限。
- Codex、Antigravity 收不到 Antumi 交的技能，靠各自的全局技能目录（ARCHITECTURE.md「本机技能」）。
- 应用身份查本人资源时 lark-cli 会返回空的成功而不是报错（`lark-shared` 技能原文），查不到时先确认身份。

## B. 聊天平台上的智能体：以机器人身份用飞书 MCP

完整设计（工具怎么到智能体手里、调用链、文档放哪和给谁开权限、风险说明、待验证）见 [CHANNEL-LOOP.md](CHANNEL-LOOP.md) 第三节。要点：

- 接飞书托管的远程 MCP（`https://mcp.feishu.cn/mcp`），请求头 `X-Lark-MCP-TAT` 带应用 token、`X-Lark-MCP-Allowed-Tools` 带主人勾选的工具；token 只在网关里，智能体拿不到。
- 机器人能用的工具：读 `fetch-doc`、`list-docs`、`get-comments`、`fetch-file`、`get-user`，写 `create-doc`、`update-doc`、`add-comments`；`search-doc`、`search-user` 只支持用户身份。
- 文档建在主人指定的知识库节点下，建好后以应用身份给提问人开编辑权限。
- Lark 用 `mcp.larksuite.com/mcp`，同一份工具。Lark 的文档只写了以用户身份调用的个人链接，但它也认应用身份：2026-11-27 用一个 Lark 用户的应用调通了 `tools/list` 和 `fetch-doc`。
- 不接 `lark-openapi-mcp`：仍是 beta、2025-08 后没再更新、不能编辑文档。

## 以后：提问人身份

只在需要「读提问人自己能看的内容」时考虑，且**只在私聊**：群里的回答谁都能看到，用提问人身份读也照样泄露给群里的人。照 Lark 官方 OpenClaw 插件的做法：

- 设备码授权：`POST https://accounts.<brand>/oauth/v1/device_authorization`（Basic `app_id:app_secret`，`scope` 加 `offline_access`），轮询换 token。这一套没有公开文档，只在 lark-cli 和官方插件的代码里，接入前要再核实。
- 授权链接以卡片发给提问人；拿到 token 后用 `authen/v1/user_info` 核对 `open_id` 是提问人本人，防止别人点了链接把自己的身份绑上去。
- token 按 `应用:open_id` 存进 core 的凭据库（0600），不进 Agent 的上下文。access_token 约 2 小时；refresh_token 7 天、只能用一次、每次刷新都换新，需要按用户加锁刷新；365 天必须重新授权。
- 官方插件把这种模式硬性限定给应用所有者，其他人一律拒绝。我们若做，至少要同样限定或让主人逐个授权。

## 平台差异

| | 飞书 | Lark |
|---|---|---|
| 开放平台 | `https://open.feishu.cn` | `https://open.larksuite.com` |
| 授权服务（用户身份才用） | `accounts.feishu.cn` | `accounts.larksuite.com` |
| 资料域名 | `<租户>.feishu.cn`，`larkoffice.com` 是别名 | `<租户>.larksuite.com` |

接口路径、权限名、错误码两边相同。开放平台按品牌固定，不随租户域名变。

## 接口依据

- 托管 MCP：[开发者调用远程 MCP](https://open.feishu.cn/document/mcp_open_tools/developers-call-remote-mcp-server?lang=zh-CN)（`X-Lark-MCP-TAT`、`X-Lark-MCP-UAT`、`X-Lark-MCP-Allowed-Tools`）、[支持的工具](https://open.feishu.cn/document/mcp_open_tools/supported-tools?lang=zh-CN)。用应用身份时，应用也要被授予每份文档或知识库的访问权限。
- `lark-openapi-mcp`：[README](https://github.com/larksuite/lark-openapi-mcp)（`--token-mode`、`-t` 工具与预设；不支持直接编辑文档和上传文件）。
- 个人 MCP 令牌那条路（`mcp.feishu.cn` 的个人链接）正在由飞书 CLI 取代，2026-02-24 起链接 7 天过期，和这里无关：这里只用应用身份。
- 应用要读写一份资料，必须同时满足：开通了对应权限（企业管理员审批），并且这份资料对应用可见：所有者或管理者用「添加文档应用」加了它、分享给了含机器人的群、开了「组织内获得链接的人可阅读/编辑」，或知识库把应用加为成员（覆盖整个空间）或某个节点的协作者（覆盖该节点及子节点）。多维表格开了高级权限时要「可管理」。
- 原设计自己调开放平台接口（`docs/v1/content`、`wiki/v2`、`bitable/v1`、未公开的 Search v2）的细节见本文件的 git 历史（2026-11-21 版）；二期若 `lark-openapi-mcp` 不合用，可以回到那套。

## 调研（2026-11-21）

| 项目 | 读资料的身份 | 文档怎么读 | 权限与群聊 |
|---|---|---|---|
| OpenClaw 自带飞书扩展（`openclaw/openclaw` 的 `extensions/feishu`，源自 m1heng） | 只用应用身份 | `raw_content` 纯文本 + 标题 + 块列表，Markdown 只用于写入 | 按工具族的开关（`tools.doc/wiki/drive/bitable` 默认开，`perm` 默认关），注册时隐藏、调用时再查；知识库为空时提示把机器人加为成员；触发由群白名单、必须 @、发送人白名单控制，读文档不再看提问人 |
| m1heng/clawdbot-feishu | 只用应用身份 | 同上 | `99991672` 时从错误里取申请链接告诉用户（只用在通讯录接口上） |
| Lark 官方 OpenClaw 插件 `@larksuite/openclaw-lark` | 读资料一律用户身份，应用身份只用于发评论 | Lark 托管的 MCP（`mcp.feishu.cn` / `mcp.larksuite.com`）的 `fetch-doc`，返回 Markdown | 只有应用所有者能用，其他人得到 `permission_denied`；授权是设备码 + 群里的卡片，核对 `user_info`；token 存钥匙串，按用户加锁刷新；缺权限时自动发授权卡片 |
| `larksuite/cli` | 每个命令声明支持的身份，`--as user\|bot`，有用户令牌优先用户 | 未公开的 `docs_ai/v1/documents/:token/fetch` | 为 Agent 设计了 `--no-wait` 先发链接、下一步再取 token 的登录 |

本地的 multica、codeg、opensquilla 接了飞书或 Lark，都只收发消息，没有读资料。

## 调研（2026-11-25）

聊天平台上的编程 Agent 和本地开源项目怎么处理「机器人替谁干活」：

| | 在聊天平台里用什么身份 | 谁能触发、怎么保护 |
|---|---|---|
| Claude Tag（原 Claude Code in Slack） | 频道里用服务账号，按频道配凭据；私聊才用本人账号 | 管理员决定给哪些频道什么凭据，并明说「频道里谁都能让 Claude 用这份凭据干活」；凭据在出口代理附上，不进沙箱；其他人的消息只当资料 |
| Cursor | 团队服务账号 | 先绑定账号；可限定只有发起人能追问 |
| Codex | 发起人绑定的账号 | 要授权的操作只给发起人弹 Allow/Deny 卡片 |
| GitHub Copilot | 频道里用应用身份 | 对仓库有写权限的人才能触发；频道里开的 PR 多一次批准 |
| multica | 每人绑定账号，检查是否有权调用这个智能体 | 一个任务一张卡片，思考 → 输出 → 完成 |
| opensquilla | 机器人 + 白名单 | 非主人看不到敏感工具；授权卡片只本人能点，「总是允许」只有管理员；刻意不给机器人申请文档权限，文档走飞书 MCP / CLI |
| lobehub | 主人 | 应用身份只读文档（文档要分享给应用） |

飞书官方的 `lark-cli` 和 OpenClaw 插件都建议不要把接了它们的机器人拉进群。OWASP「过度代理」（LLM06:2025）和 Meta 的「二选一」原则都主张最小权限、高影响操作要人批准。本文的取舍：权限范围交给主人（Claude Tag 的做法），Antumi 只保证凭据不交给智能体、不用主人身份、每次调用有记录。
