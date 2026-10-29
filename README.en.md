<div align="center">

# Antumi

**Keep using Claude Code, Codex and your other agents. Antumi takes over the copying and pasting between windows.**

See your quota · Keep working when it runs out · Run tasks in parallel · Let agents delegate

[![Version](https://img.shields.io/github/package-json/v/flyhero/antumi?label=version&color=blue)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
![Platform](https://img.shields.io/badge/platform-macOS%20%C2%B7%20Windows-lightgrey)
![Agents](https://img.shields.io/badge/agents-9%20supported-8A2BE2)

[Download](https://github.com/flyhero/antumi/releases) · [Why not just the terminal](#why-not-just-the-terminal) · [More features](#more-features) · [Getting started](#getting-started) · [Docs](#docs) · [Changelog](CHANGELOG.md) · [Feedback](https://github.com/flyhero/antumi/issues)

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
  <a href="#supported-agents" title="Kimi Code"><img src="docs/assets/agents/kimi.svg" alt="Kimi Code" width="32" height="32" /></a>
  <a href="#supported-agents" title="Gemini CLI"><img src="docs/assets/agents/gemini.svg" alt="Gemini CLI" width="32" height="32" /></a>
</p>

https://github.com/user-attachments/assets/44398279-8f26-441f-ad24-fa1b1e344674

</div>

> Antumi supports both English and Simplified Chinese (switch in Settings). The launch video and demos below were recorded with sample project data.

## Why not just the terminal

Antumi runs the agent CLIs you have already installed and signed in to, so there is no setup or login to redo, and sessions you started in a terminal can be imported and continued.

### No more copy and paste

With several agents at once, much of the day goes into carrying things between them. In Antumi you no longer paste:

- **Between agents**: a handoff brings the chat history, a [delegation](#let-agents-delegate-to-each-other)'s result comes back to the main conversation, and agents in a [group chat](#group-chat) answer each other; agents can also look up what you discussed with other agents before.
- **Errors and output**: agents look at pages, read the console and take screenshots in the built-in browser, and read dev server output in the built-in terminal.
- **Tasks and bugs**: issues from GitHub, Jira, Linear and ZenTao come in as tasks; a group chat's conclusion becomes a task in one click.
- **Code**: type @ in the composer to reference a file or project instead of pasting paths and snippets.
- **Notes and to-dos**: agents write notes straight into your Markdown or Obsidian knowledge base, and record what you need to do later as [to-dos](#to-dos).
- **Replies you don't follow**: select text and ask the [side assistant](#side-assistant), or [translate](#translation) it in one click.
- **Prompts and config**: save instructions you repeat as an agent or a [routine](#routines-and-scheduling); set up MCP servers once and pick which agents get them.

Below are the four things that get in the way most often in a terminal; the rest is under [More features](#more-features).

### See your quota

In a terminal you find out your quota is gone when you hit the limit. Antumi's status bar keeps Claude Code, Codex, Cursor, Antigravity and ZCode usage in view; hover for each agent's quota windows and reset times. It also paces your usage against the next reset: plenty left just before a reset, and it tells you to use it; on track to run out early, and it suggests a lighter model or another agent for the small jobs.

<img src="docs/assets/features/quota.webp" alt="Quota: zoom into the status bar, hover each agent for usage and reset times, then show remaining percentages" width="100%" />

### Keep working when quota runs out

In a terminal, a turn that hits the limit just stops and waits for you. In Antumi, with several Claude Code or Codex accounts it switches account and goes on in the same session; with none to switch to, it continues by itself when the quota resets; or click the agent name at the bottom left of the composer to hand the work to another agent, which picks up the chat history in the same folder.

<img src="docs/assets/features/handoff.webp" alt="Handoff: switch the composer from Claude Code to Codex, add a note, and Codex continues with tests" width="100%" />

### Run agents on tasks in parallel

Five agents in five terminal windows means switching between them to find out which one is waiting for approval and which one is done. In Antumi each task gets its own worktree, so they never touch each other's code; whatever waits for your approval, answer or review is gathered in the overview, and you get a notification when an agent finishes or needs you.

<img src="docs/assets/overview.png" alt="Overview: four tasks by Claude Code, Codex and Cursor waiting for a reply or review, with upcoming reservations on the right" width="100%" />

### Let agents delegate to each other

In a terminal, getting a second agent to review the work means copying between windows and pasting its findings back. In Antumi, save the roles you call on often as agents, such as a code reviewer or a test verifier, each with its own external agent, model, skills, and MCP servers, or start from a template; type @ in a conversation to name one, and the main agent also calls one on its own when it needs to. A delegated agent works in its own sub-conversation, a card shows its progress, and its result comes back to the main conversation. Read-only analysis runs in parallel; delegations that change code run one at a time, each step approved.

<img src="docs/assets/features/delegate.webp" alt="Delegation: type @ to name the code reviewer, the card shows it working, and the review comes back to the main conversation" width="100%" />

<sub>I built Antumi after half a year of heavy use of several agents, to fix these pain points of my own.</sub>

## More features

[Side assistant](#side-assistant) · [Translation](#translation) · [Split view](#split-view) · [Group chat](#group-chat) · [Teams](#teams) · [Routines and scheduling](#routines-and-scheduling) · [To-dos](#to-dos)

<sub>Looping demos use real UI components with sample data: the pointer makes real clicks, and small areas are zoomed in. The interface shown is in Chinese.</sub>

### Side assistant

Select part of a conversation, right-click and choose **Ask helper**: the side assistant opens on the right with the passage quoted, ready to explain, follow up, or take on a small task. It defaults to a lightweight model with its own context, so the main conversation stays focused.

<img src="docs/assets/features/assistant.webp" alt="Side assistant: select a term, right-click to hand it to the assistant, and ask about it on the right" width="100%" />

### Translation

Click **Translate** under a reply to read it in your language, and click again for the original; or select one sentence and translate it from the right-click menu. A lightweight model does the work outside the main conversation's context.

<img src="docs/assets/features/translation.webp" alt="Translation: translate a reply, switch back to the original, then translate one selected sentence" width="100%" />

### Split view

⌘-click another conversation, or choose **Open in right split pane** from its menu, to put two conversations side by side: work on an implementation while checking another agent's advice. Each pane has its own input, progress, and approval requests, with a draggable divider to adjust the space.

<img src="docs/assets/features/split.webp" alt="Split view: ⌘-click a second conversation to show Claude Code and Codex side by side, then type on the right" width="100%" />

### Group chat

Bring 2–5 agents into one conversation to answer independently, then respond to each other's ideas. Jump in or @ a member at any time, steer the pace with **Continue** and **Summarize now**, and let the chair summarize agreements and disagreements; discussions are read-only and do not change code.

<img src="docs/assets/features/discussion.webp" alt="Group chat: three agents answer independently, respond after Continue, and the chair summarizes after Summarize now" width="100%" />

### Teams

Assign external agents, models, and responsibilities to a team lead, developers, and reviewers, or pick agents you have saved, then give the team a task. The team lead agrees on a plan with you before dispatching work in a shared worktree, with sequential development and parallel read-only analysis.

<img src="docs/assets/features/squad.webp" alt="Teams: click Edit and expand the developer to see its external agent, model, and responsibilities" width="100%" />

### Routines and scheduling

Under **Routines** in the sidebar, schedule Claude Code, Codex, OpenCode, Pi, DeepSeek Harness, or ZCode to work daily, on weekdays, or weekly; the clock beside the composer reserves a message for a set time or for when quota resets, and tasks and plan approvals can be reserved too. Routines can choose an agent with available quota; unattended runs answer prompts automatically based on permission modes. The computer must stay awake; Cursor and Antigravity are not supported for routines.

<img src="docs/assets/features/schedule.webp" alt="Scheduling: open routines and reservations from the sidebar, then reserve a message with the composer clock" width="100%" />

### To-dos

When an agent's reply mentions things for you to do later (before release, to verify, to configure), it records them as the conversation's to-dos, and the inspector button in the header shows how many are open. Tick them off in the **To-dos** tab; **Overview → To-dos** gathers every conversation's to-dos, and items marked "Agent can do" can be handed back to the agent.

<img src="docs/assets/features/todos.webp" alt="To-dos: an agent records to-dos, the header inspector opens the to-dos tab to tick one off, and the overview lists them all" width="100%" />

<details>
<summary><b>More: from running tasks to reviewing results</b></summary>

- **Overview**: bring approvals, questions, and reviews together, with what is running and what comes next in view.
- **Task board**: isolated worktrees, multi-project tasks, and dependencies that unlock after acceptance.
- **Review and Git**: inspect the entire task branch, run project checks, and update from remote with fast-forward/rebase.
- **Files, terminals, and browser**: edit files, manage development servers, and let agents verify pages you can take over.
- **Model providers & multi-account**: connect third-party coding plans or custom endpoints; Claude Code and Codex support multi-account auto-switching on quota limits.
- **Usage analytics**: 7/30/90-day ledgers by model, account, and source, with countdowns to quota exhaustion.
- **Sources and extensions**: connect Jira, GitHub, Obsidian, Agent Skills, MCP servers, and import CLI sessions.
- **Local-first**: records stay on your machine, and background agents keep working when the window closes.

</details>

## Supported agents

Antumi drives the agent CLIs you already have installed and signed in to.

| Agent | Integration | Permission modes | Plan approval | Handoff | Routines / scheduling |
|---|---|---|:-:|:-:|:-:|
| [**Claude Code**](https://github.com/anthropics/claude-code) | `claude -p` (stream-json) | ask · accept edits · plan · auto | ✓ | ✓ | ✓ |
| [**Codex**](https://github.com/openai/codex) | `codex app-server` | ask · auto · plan · read-only | ✓ | ✓ | ✓ |
| [**Cursor**](https://cursor.com/cli) | `cursor-agent acp` | Agent · Plan · Ask | ✓ | ✓ | — |
| [**OpenCode**](https://opencode.ai) | `opencode acp` | Build · auto · Plan · read-only | — | ✓ | ✓ |
| [**Pi**](https://pi.dev) | `pi --mode rpc` | default · auto · plan · read-only | ✓ | ✓ | ✓ |
| [**DeepSeek Harness**](docs/DEEPSEEK.md) | `dsh --profile antumi` (ACP) | default · automatic · plan · read-only | ✓ | ✓ | ✓ |
| [**Antigravity**](docs/ANTIGRAVITY.md) | Google's Antigravity ACP server | Default · Auto Edit | — | ✓ | — |
| [**ZCode**](docs/ZCODE.md) | `zcode app-server` | ask · edit freely · plan · autonomous · read-only | ✓ | ✓ | ✓ |
| [**Kimi Code**](docs/KIMI.md) | `kimi acp` (Node.js CLI 2.3.2+) | Default · Plan · Auto | ✓ | ✓ | ✓ |
| [**Gemini CLI**](docs/GEMINI.md) | `gemini --acp` (0.66.0+) | Default · Auto Edit · Plan | ✓ | ✓ | ✓ |

"Bypass everything" is never selected by default. Settings → Agents also lists the agent CLIs Antumi recognises but does not drive yet.

## Getting started

**Prerequisite**: At least one agent ready (install CLI for Claude Code, Codex, Cursor, OpenCode, Pi, or DeepSeek Harness, and the ZCode desktop app or `zcode-app-cli` for ZCode; Antigravity can be downloaded directly in Settings).

**Run from source**, with Node ≥ 22.13 and pnpm 12:

```bash
git clone https://github.com/flyhero/antumi.git
cd antumi
pnpm install
pnpm dev          # starts the daemon, core and the desktop app together
```

**Build a macOS app** (Apple Silicon):

```bash
pnpm dist:mac     # output: packages/desktop/dist/Antumi-<version>-arm64.dmg
```

**Build a Windows installer** (x64; it builds on macOS too):

```bash
pnpm dist:win     # output: packages/desktop/dist/Antumi-Setup-<version>-x64.exe
```

A machine with the app installed needs neither Node nor pnpm. The builds are unsigned: on another Mac, right-click → Open the first time; on Windows, SmartScreen stops it once, so choose More info → Run anyway.

<p align="center">
  <img src="docs/assets/agents.png" alt="Settings → Agents: Claude Code, Codex and Cursor installed and signed in" width="720" />
</p>

<details>
<summary><b>Keyboard shortcuts</b></summary>

<br/>

| Keys | Action |
|---|---|
| <kbd>N</kbd> (on the board) | Quick-add a task at the top of the Pending column |
| <kbd>⌘</kbd> <kbd>N</kbd> | Open the full new-task dialog |
| <kbd>Ctrl</kbd> <kbd>`</kbd> | Toggle the terminal panel |
| <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>`</kbd> | Toggle the browser panel |
| <kbd>⌘</kbd> <kbd>,</kbd> | Settings |
| <kbd>⌘</kbd> <kbd>F</kbd> | Search the current chat |
| <kbd>⌘</kbd> <kbd>S</kbd> | Save the file open in the inspector |
| <kbd>Enter</kbd> / <kbd>Shift</kbd> <kbd>Enter</kbd> | Send / new line; while the agent is busy, Enter queues the message |
| <kbd>Tab</kbd> or <kbd>→</kbd> | Accept Claude Code's predicted next message |
| <kbd>Esc</kbd> | Interrupt the current turn; on a task page, back to the board |

</details>

## Local-first, safety-first

- **Your data stays with you**: tasks, conversations and worktrees live in `~/.antumi/`; nothing essential depends on a hosted Antumi service.
- **Loopback only**: core listens on `127.0.0.1` and every connection must present a token.
- **No shell in between**: agent commands are launched as argument arrays, with `--` before the prompt.
- **Credentials stay put**: Jira / GitHub credentials are stored separately (mode 600), never returned to the UI and never given to agents.
- **External content is untrusted**: imported issue text is wrapped in `<untrusted-source>` before an agent sees it; task images lose their EXIF data before they are stored.
- **Your results are never deleted for you**: worktrees are cleaned only when you confirm, re-checked right before, and anything with uncommitted changes or unique commits is kept.

## Docs

The documentation is in Chinese for now.

| I want to… | Read |
|---|---|
| Understand the architecture, process boundaries and protocol | [Architecture · Overview](docs/ARCHITECTURE.md#1-总体架构) |
| Learn how tasks flow: planning, review, dependencies | [Architecture · Task model](docs/ARCHITECTURE.md#2-任务模型) |
| Manage worktrees, branches and merge conflicts | [Architecture · Worktrees and Git](docs/ARCHITECTURE.md#3-worktree-与-git) |
| See how each agent is integrated and what the permission modes map to | [Architecture · Agents and chat](docs/ARCHITECTURE.md#4-agent-接入与聊天) |
| Let agents verify pages in the browser | [Architecture · Built-in browser](docs/ARCHITECTURE.md#5-内置浏览器) |
| Connect task or bug sources | [Task source plugins](docs/PLUGINS.md) |
| Write a task-source plugin | [Plugin development](docs/PLUGINS.md#开发一个任务来源插件) |
| Package, install, uninstall | [Architecture · Packaging](docs/ARCHITECTURE.md#8-打包与安装) |
| Publish a release | [Architecture · Automated releases](docs/ARCHITECTURE.md#自动发布) |
| See what changed in each release | [CHANGELOG.md](CHANGELOG.md) |

## Contributing

Start with [AGENTS.md](AGENTS.md) (process boundaries, protocol, commit format) and [DESIGN.md](DESIGN.md) (visual rules). Before committing:

```bash
pnpm typecheck && pnpm test     # plus pnpm build for desktop changes
```

To try the app by hand without touching your real data, run a separate instance against a test home:

```bash
ANTUMI_HOME=~/.antumi-demo pnpm dev
```

## Status

Antumi is currently in **development preview** (0.21.x), developed and tested mainly on macOS (Windows runs and packages). Next, in order:

- **Windows testing**: Polishing auto-updates, real-machine installation and CI.
- **Remote execution**: Let agents work on repositories over SSH / WSL while the board stays local.
- **More agents and ecosystem**: Expanding support for more agent CLIs and ACP servers.

Something feels off, or you want another agent supported? [Open an issue](https://github.com/flyhero/antumi/issues).

## The name

**Antumi is a coined word inspired by "ant".** One ant is small; together they move things far bigger than themselves. Antumi brings different AI coding agents onto one workbench so work can move forward in parallel while progress and results stay visible.

The mascot is a little ant: it holds three agent blocks on the app icon.

## License

[Apache License 2.0](LICENSE)
