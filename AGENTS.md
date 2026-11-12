# Antumi

Task-first multi-agent manager. See docs/ARCHITECTURE.md for the architecture diagram and implementation details.

## Process boundaries

- **daemon** owns every agent process and PTY. **core** owns tasks, git and persistence. **desktop** is a client only, and so is core's MCP server (`mcp-main.ts`), a process of its own that agents start.
- **desktop main** holds the built-in browser's tabs (`WebContentsView`) and runs the browser host; core connects to it over its loopback WebSocket, finding it through the host file, and keeps the policy (which conversation owns a tab, which sites the user allowed). With no app running there is no browser.
- Electron main stays thin: no task logic, no git, no PTYs. Browser tabs are the one exception, and they live in main rather than in a window for the same reason: a window closing or crashing must never touch a running agent, nor a page it is on.
- Native modules (node-pty) load only in the daemon, which runs on plain Node. Never import a native module into Electron.
- core must stay free of Electron imports so it can run headless on a server.
- **Phones** reach core only through its gateway (`core/src/gateway-main.ts`), a child process core starts when phone access is on: it owns the port phones reach and the Noise link, and is a client of core like the MCP server. What a phone may do is decided in core (`MOBILE_METHODS` in protocol, checked in `rpc-server.ts` before any handler); a new RPC stays off phones until it is added there. See docs/MOBILE.md.

## Protocol

- `packages/protocol` is the single source of truth. Define a new RPC method or notification there as a zod schema, then implement it in `core/src/rpc-handlers.ts`.
- Clients and core can be on different versions. Adding an optional field is safe. A breaking change bumps `PROTOCOL_VERSION`, or `DAEMON_PROTOCOL_VERSION` for the daemon wire.
- Index `rpcSchemas` / `daemonSchemas` with a generic method name. Indexing the raw `rpcMethods` widens to a union of every schema.
- Status rules live in `checkMove` / `checkStart` / `manualMoves`. The UI calls them; it never re-encodes the rules.
- What an agent is and can do lives in its descriptor (`protocol/src/agents`) and adapter (`core/src/agents`); code elsewhere asks those, never `agent === '<id>'`. See docs/ARCHITECTURE.md, 新增 Agent.

## Safety

- core binds to 127.0.0.1 only and requires the token from `core.json`: any web page can open a localhost WebSocket.
- Agent commands are argv arrays with `--` before the prompt. Never go through a shell.
- Only a refused connection proves a daemon socket is stale. A timeout or EPERM proves nothing.
- Worktrees may hold the only copy of an agent's work. A worktree goes only when the user cleans it, or when it provably holds nothing: a planning checkout once its task runs, or one whose conversation was archived or whose task or conversation was deleted, once idle as long as the user allows, with no ignored file setup or a build would not make again. Either way it is removed without force, its branch kept, and never one with changes or a commit no ref contains.

## Style

- Keep comments brief and non-obvious (why, not how).
- Avoid type assertions except `as const`.
- Name files after the concept they hold, never `utils` or `helpers`.
- Cross-platform: keep platform checks explicit (named pipes on Windows, `spawn-helper` on macOS).
- Visual decisions (colour, type, spacing, radius, the chat's row rhythm) follow `DESIGN.md`; read tokens from `styles.css`'s `:root`, never hard-code a colour.

## Verify

`pnpm typecheck && pnpm test`, plus `pnpm build` for desktop changes.

To try the app by hand, run it against the test home instead of the user's real data: `ANTUMI_HOME=~/.antumi-demo pnpm dev` (see docs/ARCHITECTURE.md, 从源码运行).

## Release

Bumping the version, packaging a dmg/exe and publishing follow [docs/RELEASING.md](docs/RELEASING.md) step by step. Packaging alone changes no file; pushing a release tag publishes on GitHub, so do it only when the user asks.

## Changelog

A change a user can notice gets a line in `CHANGELOG.md` under `## 未发布`, in the commit that makes it: `### 新功能`, `### 改进` or `### 修复` (`### 破坏性改动` for what bumps the minor version). That section becomes the GitHub release notes, read by users rather than developers.

- One sentence, two at most: about 60 characters for a fix or an improvement, 100 for a new feature.
- What the user now sees or can do, and where. Not why, how it is built, or its edge cases: those go in `docs/`.
- A fix says what no longer goes wrong (「X 不再 Y」), not how it used to.
- At most one limit worth knowing (「仅 macOS」); the rest is for the docs.
- Things go by the names the interface shows, never an RPC, field or component.

```
- 支持 OpenCode 2：可用全部权限模式（含定时和例程），显示真实可用的模型和每轮用量。
- Codex 在后台跑的开发服务器不再在 30 分钟后被一起停掉。
```

## Commits

A trimmed version of Angular's [commit message format](https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md).

```
<type>(<scope>): <summary>

<body>

<footer>
```

- **type**: `feat` (new feature), `fix` (bug fix), `refactor` (neither), `perf`, `test`, `docs`, `build` (build, dependencies, scripts), or `chore` (repo housekeeping that fits nothing else, like `.gitignore`).
- **scope**: the package: `protocol`, `core`, `daemon` or `desktop`. Leave it out when the change spans packages.
- **summary**: imperative, present tense, lowercase first letter, no trailing period, under 72 characters.
- **body**: why the change is needed, and how behavior differs from before. Required except for `docs` and `chore`.
- **footer**: `BREAKING CHANGE: <summary>` plus migration steps for anything that bumps `PROTOCOL_VERSION` or `DAEMON_PROTOCOL_VERSION`. `Fixes #<issue>` when there is one.
- One self-contained change per commit, with its tests.

```
fix(core): tell clients of a chat reopened after a restart

A client that lists conversations before reconcile has opened their
chats holds them with a session but no chat, so the composer reads as
busy and sends nothing.
```
