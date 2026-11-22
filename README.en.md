<div align="center">

# Antumi

**Put the Claude Code, Codex and other agents you already have to work: investigating bugs, answering your colleagues in chat, and building together.**

[![Release](https://img.shields.io/github/v/release/flyhero/antumi?include_prereleases&label=release&color=blue)](https://github.com/flyhero/antumi/releases)
[![Downloads](https://img.shields.io/github/downloads/flyhero/antumi/total?color=blue)](https://github.com/flyhero/antumi/releases)
![macOS](https://img.shields.io/badge/macOS-000000?logo=apple&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-0078D4?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTAgMy40IDkuOCAydjkuNUgwek0xMSAxLjggMjQgMHYxMS40SDExek0wIDEyLjVoOS44VjIyTDAgMjAuNnpNMTEgMTIuNWgxM1YyNGwtMTMtMS44eiIvPjwvc3ZnPg==)
![Linux](https://img.shields.io/badge/Linux-FCC624?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PGVsbGlwc2UgY3g9IjEyIiBjeT0iMTMiIHJ4PSI3IiByeT0iMTAiIGZpbGw9IiMxMTEiLz48ZWxsaXBzZSBjeD0iMTIiIGN5PSIxNS41IiByeD0iNC42IiByeT0iNi41IiBmaWxsPSIjZmZmIi8+PGNpcmNsZSBjeD0iOS44IiBjeT0iNy4yIiByPSIxLjUiIGZpbGw9IiNmZmYiLz48Y2lyY2xlIGN4PSIxNC4yIiBjeT0iNy4yIiByPSIxLjUiIGZpbGw9IiNmZmYiLz48Y2lyY2xlIGN4PSIxMCIgY3k9IjcuNCIgcj0iLjciIGZpbGw9IiMxMTEiLz48Y2lyY2xlIGN4PSIxNCIgY3k9IjcuNCIgcj0iLjciIGZpbGw9IiMxMTEiLz48cGF0aCBkPSJNOS44IDkuNmg0LjRMMTIgMTEuNnoiIGZpbGw9IiNGN0E0MUQiLz48ZWxsaXBzZSBjeD0iOCIgY3k9IjIyLjQiIHJ4PSIzIiByeT0iMS40IiBmaWxsPSIjRjdBNDFEIi8+PGVsbGlwc2UgY3g9IjE2IiBjeT0iMjIuNCIgcng9IjMiIHJ5PSIxLjQiIGZpbGw9IiNGN0E0MUQiLz48L3N2Zz4=)
[![Android](https://img.shields.io/badge/Android-3DDC84?logo=android&logoColor=white)](docs/MOBILE.md)
[![License](https://img.shields.io/github/license/flyhero/antumi?color=lightgrey)](LICENSE)

[Download](https://github.com/flyhero/antumi/releases) · [Start in three minutes](#start-in-three-minutes) · [Highlights](#highlights) · [Supported agents](#supported-agents) · [Docs](#docs)

[简体中文](README.md) · **English**

<p align="center">
  <a href="#supported-agents" title="Claude Code"><img src="docs/assets/agents/claude.svg" alt="Claude Code" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#supported-agents" title="Codex"><img src="docs/assets/agents/codex.svg" alt="Codex" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#supported-agents" title="Cursor"><img src="docs/assets/agents/cursor.svg" alt="Cursor" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#supported-agents" title="OpenCode"><img src="docs/assets/agents/opencode.svg" alt="OpenCode" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#supported-agents" title="Pi"><img src="docs/assets/agents/pi.svg" alt="Pi" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#supported-agents" title="DeepSeek Harness"><img src="docs/assets/agents/dsh.svg" alt="DeepSeek Harness" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#supported-agents" title="Antigravity"><img src="docs/assets/agents/antigravity.svg" alt="Antigravity" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#supported-agents" title="ZCode"><img src="docs/assets/agents/zcode.svg" alt="ZCode" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#supported-agents" title="Kimi Code"><img src="docs/assets/agents/kimi.svg" alt="Kimi Code" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#supported-agents" title="Gemini CLI"><img src="docs/assets/agents/gemini.svg" alt="Gemini CLI" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#supported-agents" title="CodeBuddy"><img src="docs/assets/agents/codebuddy.svg" alt="CodeBuddy" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#supported-agents" title="CodeArts"><img src="docs/assets/agents/codearts.svg" alt="CodeArts" width="32" height="32" /></a>
</p>

<img src="docs/assets/showcase.png" alt="Antumi on the desktop, the same conversation carried on from a phone, and colleagues asking an agent in Slack, Feishu and DingTalk" />

**One minute:** three bugs, from the inbox all the way to a merge.

https://github.com/user-attachments/assets/74747188-10e9-4d1d-b444-86c867f25c58

</div>

## Who it's for

You already use Claude Code, Codex or another agent CLI in a terminal, and you want more from them: a first look at every new bug, answers to your colleagues' questions about the code, and several agents on the bigger jobs.

Antumi does not replace those CLIs, and it does not ask you to sign in again. A session you started in a terminal can be imported and continued.

## Highlights

Three things come first. The rest (switching accounts when quota runs out, reading conversations and answering requests on your phone, routines and scheduling, split view, the built-in browser and terminal, the helper and translation, usage totals) is under [Also included](#also-included). Details are in the [user guide](docs/GETTING-STARTED.en.md).

### New bugs are investigated automatically

When a new issue syncs in from GitHub, Jira, Linear or ZenTao, Antumi opens an investigation conversation on its own: the agent reads the issue, its attached images and the code, finds the cause and proposes a fix. Give it the permission and it goes on to change the code.

The inbox shows the status and investigation record of every issue. You can also investigate a single issue by hand, or import it as a task: the agent proposes a plan and changes code only after you approve.

[Connect a source](docs/GETTING-STARTED.en.md#task-sources) · [Automatic investigation](docs/SOURCE-AUTO-INVESTIGATION.md) (Chinese) · [The inbox](docs/ARCHITECTURE.md#任务来源与收件箱) (Chinese)

<img src="docs/assets/features/investigate.webp" alt="Automatic investigation: a new bug is filed on GitHub, syncs into the inbox and is investigated on its own; the agent reads the code, reports the cause and a proposed fix, and makes the change once you tell it to" width="100%" />

### An agent answers for you in team chat

Put an agent on Slack, Feishu, Lark or DingTalk and it stands in for you there. Colleagues mention it to ask where a feature lives or what an error means, with a screenshot if they like. It reads the code to answer, in a reply under their message, and you are not interrupted.

It reads and never changes anything, sees only the projects you picked, and is never given files such as keys. Who asked what, which files it read and what it answered are all on record.

[Set it up](docs/GETTING-STARTED.en.md#let-colleagues-ask-on-slack-feishu-or-dingtalk) · [What it can reach](docs/CHANNELS.md#信任模型) (Chinese)

<img src="docs/assets/features/channel.webp" alt="Answering in team chat: an agent connected to Feishu, a colleague mentions it in a group, it reads the code and replies there, and Antumi's record shows the question, the answer and the files it read" width="100%" />

### Agents work together freely

Any supported agents can be paired: Claude Code builds and Codex reviews, or the other way round. There are three ways to do it:

- **Delegation.** Type `@` in the composer to hand work to another agent that is ready on this machine, or to a saved agent (a code reviewer, a test verifier). The sub-session works on its own, and the result comes back to the main conversation. Read-only analysis, and development in its own worktree, can run at the same time.
- **Teams.** Bigger work goes to a team: a lead splits it up, a developer builds it, a reviewer checks it, all in one worktree.
- **Group chat.** Two to five agents discuss a plan: a round table, split research, or draft and review. Each member can use a different model. Discussion is read-only and does not change code.

You can also hand a conversation to another agent partway through. Each task gets its own worktree, so the code does not collide. Approvals, questions and reviews sit together in the overview. You get a system notification when an agent finishes or is waiting for you.

[Delegation](docs/ARCHITECTURE.md#智能体与委派) · [Teams](docs/ARCHITECTURE.md#团队) · [Group chat](docs/ARCHITECTURE.md#群聊) · [Handoff](docs/GETTING-STARTED.en.md#handoff)

<img src="docs/assets/features/delegate.webp" alt="Delegation: type @ to name the code reviewer, the card shows it working, and the review comes back to the main conversation" width="100%" />

## Start in three minutes

You need at least one agent CLI installed and signed in. ZCode uses the desktop app or `zcode-app-cli`. Antigravity is downloaded under Settings → External agents. The first launch checks whether each agent is installed and usable. The installer itself does not need Node.

1. **Install.** Download from [Releases](https://github.com/flyhero/antumi/releases): macOS Apple Silicon / Intel, Windows x64, Linux x64. The macOS app is ad-hoc signed only. After dragging it to Applications, clear the quarantine attribute, then open it:

   ```bash
   xattr -dr com.apple.quarantine /Applications/Antumi.app
   ```

2. **Give it a small task.** In the sidebar, open Tasks and click +, pick a project and an agent, write what should change, and click Start. Antumi creates a worktree. The agent proposes a plan first and changes code only after you approve it.

3. **Review.** A system notification arrives when it is done. In the inspector on the right, read the diff of the whole branch, run the project's checks, and have the agent open the page in the built-in browser. Merge when you are satisfied.

To import issues or have them investigated automatically, install the source plugin under Settings → Plugins first. Routines, scheduled sends, automatic investigation and chat-platform answers all need the computer to stay awake. Model providers, extra accounts and chat platforms are in the [user guide](docs/GETTING-STARTED.en.md), also under Help → User guide in the app.

<details>
<summary><b>macOS notifications, Windows, Linux</b></summary>

**macOS.** Do not run the app from the dmg, or system notifications will not be delivered. After clearing quarantine, choose Allow the first time a notification is sent. If you miss it, open System Settings → Notifications → Antumi, turn on Allow Notifications, and set the style to Banners or Alerts. If you would rather not use the command, double-click once so Gatekeeper blocks it, then choose Open Anyway under System Settings → Privacy & Security. Troubleshooting is in [Packaging and install](docs/ARCHITECTURE.md#8-打包与安装).

**Windows.** The installer is unsigned. SmartScreen stops it once: choose More info → Run anyway.

**Linux.** Debian and Ubuntu: `sudo apt install ./Antumi-<version>-linux-amd64.deb`. Other distributions: AppImage, `chmod +x` and run it. Ubuntu 22.04 and later need `sudo apt install libfuse2` first. On Ubuntu 23.10 and later, a sandbox error means use the deb, or start with `--no-sandbox`. The AppImage updates itself in the background. The deb only tells you a new version is out; download and install it again.

</details>

<details>
<summary><b>Run from source</b></summary>

Node ≥ 22.13 and pnpm 12. A machine with the installed app needs neither.

```bash
git clone https://github.com/flyhero/antumi.git
cd antumi
pnpm install
pnpm dev
```

For a hands-on try, use a separate home so your real data stays untouched:

```bash
ANTUMI_HOME=~/.antumi-demo pnpm dev
```

Packaging: `pnpm dist:mac` (Apple Silicon and Intel), `pnpm dist:win` (x64, can be built on macOS), `pnpm dist:linux` (x64, Linux only, needs `build-essential` and `python3`). Output is in `packages/desktop/dist/`. Steps are in [Releasing](docs/RELEASING.md).

</details>

## Supported agents

Any of them can hand off to another. In a plain conversation or a single-agent task, type `@` to delegate to any agent that is installed and ready.

<details>
<summary><b>How each agent is connected, its permission modes and what it supports</b></summary>

| Agent | Integration | Common permission modes | Plan approval | Read-only delegation | Routines / scheduling |
|---|---|---|:-:|:-:|:-:|
| [**Claude Code**](https://github.com/anthropics/claude-code) | `claude -p` (stream-json) | Ask each time · Accept edits · Plan · Automatic | ✓ | ✓ | ✓ |
| [**Codex**](https://github.com/openai/codex) | `codex app-server` | Ask each time · Automatic · Plan · Read only | ✓ | ✓ | ✓ |
| [**Cursor**](https://cursor.com/cli) | `cursor-agent acp` | Agent · Plan · Ask | ✓ | ✓ | — |
| [**OpenCode**](https://opencode.ai) | `opencode acp` | Build · Automatic · Plan · Read only | — | ✓ | ✓ |
| [**Pi**](https://pi.dev) | `pi --mode rpc` | Default · Automatic · Plan · Read only | ✓ | ✓ | ✓ |
| [**DeepSeek Harness**](docs/DEEPSEEK.md) | `dsh --profile antumi` (ACP) | Default · Automatic · Plan · Read only | ✓ | ✓ | ✓ |
| [**Antigravity**](docs/ANTIGRAVITY.md) | Google's Antigravity ACP server | Default · Auto Edit | — | — | — |
| [**ZCode**](docs/ZCODE.md) | `zcode app-server` | Ask before changes · Edit freely · Plan · Autonomous · Read only | ✓ | ✓ | ✓ |
| [**Kimi Code**](docs/KIMI.md) | `kimi acp` (Node.js CLI 2.3.2+) | Default · Plan · Auto | ✓ | ✓ | ✓ |
| [**Gemini CLI**](docs/GEMINI.md) | `gemini --acp` (0.66.0+) | Default · Auto Edit · Plan | ✓ | — | ✓ |
| [**CodeBuddy**](docs/CODEBUDDY.md) | `codebuddy --acp` | Always Ask · Accept Edits · Plan · Auto | ✓ | — | ✓ |
| [**CodeArts**](docs/CODEARTS.md) | `codearts serve` (through Antumi’s bridge) | Build · Automatic · Plan · Read only | — | ✓ | ✓ |

An agent marked — for read-only delegation can only be given work that may change code. In conversations you run yourself, Allow everything is never selected by default. Unattended runs (routines and scheduled sends) default to Allow everything on a fresh install; switch to the more cautious Careful under Settings → Permissions. Settings → External agents also lists agent CLIs Antumi recognises but does not drive yet.

You can also skip the official account. Under Settings → Model providers, connect a coding plan such as Volcengine Ark, Zhipu or Kimi, or a custom endpoint. Cursor cannot use a provider. Using a subscription account through a proxy may break its terms and get the account banned; see the [user guide](docs/GETTING-STARTED.en.md#model-providers).

</details>

## Also included

| | |
|---|---|
| **Keeps going when quota runs out** | With more than one Claude Code or Codex account, a used-up quota switches to the next account and the same conversation keeps going. With no account left, it waits for the reset and continues, or you hand off to another agent. [Docs](docs/GETTING-STARTED.en.md#multiple-accounts) |
| **Phone app** | On an Android phone, read conversations, answer requests, send messages and images, create and start tasks. Agents still run on the computer. [Docs](docs/GETTING-STARTED.en.md#on-your-phone) |
| **Agents** | Save a role, a model, skills and MCP servers as one of My agents. Chat with it, delegate to it with `@`, add it to a team, or pin it to the sidebar. [Docs](docs/ARCHITECTURE.md#智能体与委派) |
| **Chat commands** | Save a prompt you use often as a command, and pin up to three above the composer to send with one click. Under Settings → Chat commands. |
| **Split view** | Hold ⌘ and click another conversation: implement on one side, read another agent's advice on the other. [Docs](docs/GETTING-STARTED.en.md#split-view-two-conversations-side-by-side) |
| **Routines and scheduling** | Run daily, on weekdays or weekly, or hold a message until a time or until quota resets. Cursor and Antigravity are not supported yet. The computer needs to stay awake. [Docs](docs/GETTING-STARTED.en.md#scheduling-send-when-quota-resets-or-at-a-set-time) |
| **Helper and translation** | Select a passage and hand it to the helper, or translate a reply into your language. A lightweight model does it, outside the main conversation's context. Language and auto-translate are under Settings → Conversations. [Docs](docs/GETTING-STARTED.en.md#helper-and-translation) |
| **To-dos** | An agent records what you need to do later; tick items off in the inspector. The overview lists them across conversations. [Docs](docs/ARCHITECTURE.md#待办) |
| **Files, terminal, browser** | Edit files, watch the dev server and check pages in the workspace. Each panel can be dragged out into its own window. |
| **References and a knowledge base** | Type `@` to cite a file, a project or an earlier conversation. An agent can write notes into your Markdown or Obsidian vault. |
| **Usage** | Totals over a period, and an estimate of when quota runs out. [Docs](docs/USAGE-ANALYTICS.md) |

Shortcuts you will use: <kbd>N</kbd> on the board to note a task, <kbd>⌘</kbd><kbd>K</kbd> to search, <kbd>⌘</kbd><kbd>E</kbd> / <kbd>⌘</kbd><kbd>J</kbd> / <kbd>⌘</kbd><kbd>L</kbd> for files, the terminal and the browser. The full list is under Settings → Keyboard shortcuts: 23 actions you can change or disable, applied at once.

## Docs

| | |
|---|---|
| **Using** | [User guide](docs/GETTING-STARTED.en.md) · [Automatic investigation](docs/SOURCE-AUTO-INVESTIGATION.md) (Chinese) · [Usage ledger](docs/USAGE-ANALYTICS.md) · [Markdown themes](docs/MARKDOWN-THEMES.md) (Chinese) · [Antigravity](docs/ANTIGRAVITY.md) · [DeepSeek Harness](docs/DEEPSEEK.md) · [ZCode](docs/ZCODE.md) · [Kimi Code](docs/KIMI.md) · [Gemini CLI](docs/GEMINI.md) |
| **Extending** | [Task source plugins](docs/PLUGINS.md): GitHub, Jira, Linear, ZenTao, or write your own |
| **Developing** | [Architecture](docs/ARCHITECTURE.md) (Chinese) · [Chat platforms](docs/CHANNELS.md) (Chinese) · [Phone app](docs/MOBILE.md) (Chinese) · [WSL](docs/WSL.md) (Chinese) · [AGENTS.md](AGENTS.md) · [DESIGN.md](DESIGN.md) |
| **Releasing** | [Releasing and packaging](docs/RELEASING.md) · [Changelog](CHANGELOG.md) |

## Community & Support

- **WeChat**: scan the QR code to join our group for discussions, feedback and updates:

  <img src="docs/assets/wechat-group.jpg" alt="Antumi WeChat group" width="200" />

- **Issues**: if something feels awkward, or you want another agent connected, open an [issue](https://github.com/flyhero/antumi/issues).
- **LINUX DO**: thanks to the [LINUX DO](https://linux.do) community for their support.
- **V2EX**: thanks to the [V2EX](https://www.v2ex.com) community for their support.

## Contributing

Read [AGENTS.md](AGENTS.md) and [DESIGN.md](DESIGN.md) before changing code. Before a commit:

```bash
pnpm typecheck && pnpm test
```

Add `pnpm build` when the desktop app changed.
