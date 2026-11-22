<div align="center">

# Antumi（安图米）

**让已经装好的 Claude Code、Codex 等 Agent 自动排查 bug、替你在群里答疑、几个一起把活做完。**

[![Release](https://img.shields.io/github/v/release/flyhero/antumi?include_prereleases&label=release&color=blue)](https://github.com/flyhero/antumi/releases)
[![Downloads](https://img.shields.io/github/downloads/flyhero/antumi/total?color=blue)](https://github.com/flyhero/antumi/releases)
![macOS](https://img.shields.io/badge/macOS-000000?logo=apple&logoColor=white)
![Windows](https://img.shields.io/badge/Windows-0078D4?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZiIgZD0iTTAgMy40IDkuOCAydjkuNUgwek0xMSAxLjggMjQgMHYxMS40SDExek0wIDEyLjVoOS44VjIyTDAgMjAuNnpNMTEgMTIuNWgxM1YyNGwtMTMtMS44eiIvPjwvc3ZnPg==)
![Linux](https://img.shields.io/badge/Linux-FCC624?logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PGVsbGlwc2UgY3g9IjEyIiBjeT0iMTMiIHJ4PSI3IiByeT0iMTAiIGZpbGw9IiMxMTEiLz48ZWxsaXBzZSBjeD0iMTIiIGN5PSIxNS41IiByeD0iNC42IiByeT0iNi41IiBmaWxsPSIjZmZmIi8+PGNpcmNsZSBjeD0iOS44IiBjeT0iNy4yIiByPSIxLjUiIGZpbGw9IiNmZmYiLz48Y2lyY2xlIGN4PSIxNC4yIiBjeT0iNy4yIiByPSIxLjUiIGZpbGw9IiNmZmYiLz48Y2lyY2xlIGN4PSIxMCIgY3k9IjcuNCIgcj0iLjciIGZpbGw9IiMxMTEiLz48Y2lyY2xlIGN4PSIxNCIgY3k9IjcuNCIgcj0iLjciIGZpbGw9IiMxMTEiLz48cGF0aCBkPSJNOS44IDkuNmg0LjRMMTIgMTEuNnoiIGZpbGw9IiNGN0E0MUQiLz48ZWxsaXBzZSBjeD0iOCIgY3k9IjIyLjQiIHJ4PSIzIiByeT0iMS40IiBmaWxsPSIjRjdBNDFEIi8+PGVsbGlwc2UgY3g9IjE2IiBjeT0iMjIuNCIgcng9IjMiIHJ5PSIxLjQiIGZpbGw9IiNGN0E0MUQiLz48L3N2Zz4=)
[![Android](https://img.shields.io/badge/Android-3DDC84?logo=android&logoColor=white)](docs/MOBILE.md)
[![License](https://img.shields.io/github/license/flyhero/antumi?color=lightgrey)](LICENSE)

[下载](https://github.com/flyhero/antumi/releases) · [三分钟开始](#三分钟开始) · [主要能力](#主要能力) · [支持的 Agent](#支持的-agent) · [文档](#文档)

**简体中文** · [English](README.en.md)

<p align="center">
  <a href="#支持的-agent" title="Claude Code"><img src="docs/assets/agents/claude.svg" alt="Claude Code" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#支持的-agent" title="Codex"><img src="docs/assets/agents/codex.svg" alt="Codex" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#支持的-agent" title="Cursor"><img src="docs/assets/agents/cursor.svg" alt="Cursor" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#支持的-agent" title="OpenCode"><img src="docs/assets/agents/opencode.svg" alt="OpenCode" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#支持的-agent" title="Pi"><img src="docs/assets/agents/pi.svg" alt="Pi" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#支持的-agent" title="DeepSeek Harness"><img src="docs/assets/agents/dsh.svg" alt="DeepSeek Harness" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#支持的-agent" title="Antigravity"><img src="docs/assets/agents/antigravity.svg" alt="Antigravity" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#支持的-agent" title="ZCode"><img src="docs/assets/agents/zcode.svg" alt="ZCode" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#支持的-agent" title="Kimi Code"><img src="docs/assets/agents/kimi.svg" alt="Kimi Code" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#支持的-agent" title="Gemini CLI"><img src="docs/assets/agents/gemini.svg" alt="Gemini CLI" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#支持的-agent" title="CodeBuddy"><img src="docs/assets/agents/codebuddy.svg" alt="CodeBuddy" width="32" height="32" /></a>&nbsp;&nbsp;
  <a href="#支持的-agent" title="CodeArts"><img src="docs/assets/agents/codearts.svg" alt="CodeArts" width="32" height="32" /></a>
</p>

<img src="docs/assets/showcase.png" alt="Antumi 桌面端，同一个会话在手机上接着做，同事在 Slack、飞书、钉钉群里 @ 智能体" />

**一分钟看完：** 三个 bug，从收件箱一路做到合并。

https://github.com/user-attachments/assets/74747188-10e9-4d1d-b444-86c867f25c58

</div>

## 适合谁

你已经在终端里用 Claude Code、Codex 或其他 Agent CLI，想让它们多干点活：新 bug 来了先查一遍，同事问代码的事替你答，大一点的活几个 Agent 一起做。

Antumi 不替换这些 CLI，也不要求重新登录。终端里聊到一半的会话可以导进来接着聊。

## 主要能力

主打下面三件事。其余的（额度用完自动换号接着跑、在手机上看会话和回答确认、定时与预约、分屏、内置浏览器和终端、小助手与翻译、用量统计）见[还能做什么](#还能做什么)，细节在[使用指南](docs/GETTING-STARTED.md)。

### 新 bug 进来，自动排查

GitHub、Jira、Linear、禅道的新 issue 一同步进来，Antumi 就自动开一个排查会话：Agent 读问题原文、附件图片和代码，找出原因，给出修改方案。你放开权限，它接着把代码改了。

每条问题的状态和排查记录都在收件箱里。也可以只挑一条手动排查，或导入成任务：Agent 先拿出计划，你批准后才改代码。

[接入来源](docs/GETTING-STARTED.md#任务来源) · [自动排查](docs/SOURCE-AUTO-INVESTIGATION.md) · [收件箱](docs/ARCHITECTURE.md#任务来源与收件箱)

<img src="docs/assets/features/investigate.webp" alt="自动排查演示：GitHub 上来了一个新 bug，同步进收件箱后自动开始排查，Agent 读完代码给出原因和修改方案，回一句「按方案改」它接着改" width="100%" />

### 智能体当你的替身，在群里答疑

把智能体接到飞书、Lark、钉钉或 Slack，它就是你在群里的替身。同事 @ 它问「这个功能在哪实现的」「这个报错是什么原因」，也可以发截图；它读代码来回答，答案回在那条消息下面，你不用被打断。

它只读不改，只能看你选的项目，密钥这类文件不提供。谁问了什么、它读了哪些文件、答了什么，都有记录。

[怎么接](docs/GETTING-STARTED.md#让同事在-slack飞书或钉钉上提问) · [它能碰到什么](docs/CHANNELS.md#信任模型)

<img src="docs/assets/features/channel.webp" alt="群里答疑演示：智能体接上飞书，同事在群里 @ 它提问，它读代码后把答案回在群里，Antumi 的提问记录里能看到问题、回答和读过的文件" width="100%" />

### 多个 Agent 自由协作

支持的 Agent 可以任意搭配：Claude Code 实现、Codex 审查，或者反过来。有三种搭法：

- **委派。** 输入框打 `@`，把活交给本机另一个已就绪的 Agent，或交给存好的智能体（代码审查员、测试验证专员）。子会话独立工作，结果回到主会话。只读分析和独立 worktree 里的开发可以同时进行。
- **团队。** 复杂一点的活交给团队：队长拆分任务，开发实现，评审把关，都在同一个 worktree 里。
- **群聊。** 2–5 个 Agent 讨论方案：圆桌、分工调研或起草评审，每位成员可以用不同的模型。讨论只读，不改代码。

聊到一半也可以把会话移交给另一个 Agent 接着做。每个任务一个 worktree，代码互不干扰。等你批准、回答、验收的事集中在总览里，做完或在等你时会发系统通知。

[委派](docs/ARCHITECTURE.md#智能体与委派) · [团队](docs/ARCHITECTURE.md#团队) · [群聊](docs/ARCHITECTURE.md#群聊) · [移交](docs/GETTING-STARTED.md#无缝移交)

<img src="docs/assets/features/delegate.webp" alt="委派演示：在输入框 @ 代码审查员，主 Agent 委派后卡片显示工作中，审查结果自动回到主会话" width="100%" />

## 三分钟开始

需要至少装好并登录一个 Agent CLI。ZCode 用桌面版或 `zcode-app-cli`；Antigravity 在设置 → 外部智能体里下载。第一次打开会检查 Agent 装没装、能不能用。安装包本身不需要 Node。

1. **安装。** 到 [Releases](https://github.com/flyhero/antumi/releases) 下载：macOS Apple Silicon / Intel、Windows x64、Linux x64。macOS 只有 ad-hoc 签名，拖进「应用程序」后先去掉隔离属性，再打开：

   ```bash
   xattr -dr com.apple.quarantine /Applications/Antumi.app
   ```

2. **交一个小任务。** 侧栏「任务」点 +，选项目和 Agent，写一句要改什么，点「开始执行」。Antumi 建好独立 worktree。Agent 先拿出计划，你批准后它才改代码。

3. **验收。** 做完会有系统通知。在右侧检查器看整条分支的 diff，跑项目检查，让 Agent 在内置浏览器里打开页面。满意了再合并。

要从 issue 导入任务或自动排查，先在设置 → 插件装上来源插件。定时、预约、自动排查和聊天平台答疑都需要电脑保持唤醒。接服务商、配多个账号、接聊天平台见[使用指南](docs/GETTING-STARTED.md)，应用里也可以从帮助 → 使用指南打开。

<details>
<summary><b>macOS 通知、Windows、Linux</b></summary>

**macOS。** 不要在 dmg 里直接运行，否则系统通知发不出来。去掉隔离属性后，第一次发通知时选「允许」。错过了就到「系统设置 → 通知 → Antumi」打开「允许通知」，样式选「横幅」或「提示」。不想敲命令时，可以先双击被拦一次，再去「系统设置 → 隐私与安全性」点「仍要打开」。排查见[打包与安装](docs/ARCHITECTURE.md#8-打包与安装)。

**Windows。** 安装包没有签名，SmartScreen 会拦一下，点「更多信息 → 仍要运行」。

**Linux。** Debian、Ubuntu：`sudo apt install ./Antumi-<版本>-linux-amd64.deb`。其他发行版用 AppImage：`chmod +x` 后运行；Ubuntu 22.04 及以上先 `sudo apt install libfuse2`。Ubuntu 23.10 及以上若报 sandbox 错误，改用 deb，或加 `--no-sandbox`。AppImage 会在后台自动更新；deb 只提示新版本，需要重新下载安装。

</details>

<details>
<summary><b>从源码运行</b></summary>

需要 Node ≥ 22.13 和 pnpm 12。装了安装包的机器不需要这两样。

```bash
git clone https://github.com/flyhero/antumi.git
cd antumi
pnpm install
pnpm dev
```

手动试用时用测试目录，避免碰到自己的真实数据：

```bash
ANTUMI_HOME=~/.antumi-demo pnpm dev
```

打包：`pnpm dist:mac`（Apple Silicon 和 Intel）、`pnpm dist:win`（x64，在 macOS 上也能打）、`pnpm dist:linux`（x64，只能在 Linux 上打，需要 `build-essential` 和 `python3`）。产物在 `packages/desktop/dist/`。步骤见[发版与打包](docs/RELEASING.md)。

</details>

## 支持的 Agent

它们之间都能相互移交。普通会话和单 Agent 任务里打 `@`，可以把活委派给本机已就绪的任何一个。

<details>
<summary><b>各 Agent 的接入方式、权限模式和支持的功能</b></summary>

| Agent | 接入方式 | 常用权限模式 | 计划审批 | 只读委派 | 定时 / 预约 |
|---|---|---|:-:|:-:|:-:|
| [**Claude Code**](https://github.com/anthropics/claude-code) | `claude -p`（stream-json） | 逐项确认 · 自动接受编辑 · 规划 · 自动判断 | ✓ | ✓ | ✓ |
| [**Codex**](https://github.com/openai/codex) | `codex app-server` | 逐项确认 · 自动 · 规划 · 只读 | ✓ | ✓ | ✓ |
| [**Cursor**](https://cursor.com/cli) | `cursor-agent acp` | Agent · Plan · Ask | ✓ | ✓ | — |
| [**OpenCode**](https://opencode.ai) | `opencode acp` | Build · 自动 · Plan · 只读 | — | ✓ | ✓ |
| [**Pi**](https://pi.dev) | `pi --mode rpc` | 默认 · 自动 · 规划 · 只读 | ✓ | ✓ | ✓ |
| [**DeepSeek Harness**](docs/DEEPSEEK.md) | `dsh --profile antumi`（ACP） | 默认 · 自动 · 规划 · 只读 | ✓ | ✓ | ✓ |
| [**Antigravity**](docs/ANTIGRAVITY.md) | Google 的 Antigravity ACP 服务 | Default · Auto Edit | — | — | — |
| [**ZCode**](docs/ZCODE.md) | `zcode app-server` | 修改前询问 · 自由编辑 · 规划 · 自主 · 只读 | ✓ | ✓ | ✓ |
| [**Kimi Code**](docs/KIMI.md) | `kimi acp`（Node.js 版 2.3.2+） | Default · Plan · Auto | ✓ | ✓ | ✓ |
| [**Gemini CLI**](docs/GEMINI.md) | `gemini --acp`（0.66.0+） | Default · Auto Edit · Plan | ✓ | — | ✓ |
| [**CodeBuddy**](docs/CODEBUDDY.md) | `codebuddy --acp` | 每次询问 · 自动接受编辑 · 规划 · 自动审查 | ✓ | — | ✓ |
| [**CodeArts**](docs/CODEARTS.md) | `codearts serve`（经 Antumi 的桥） | Build · 自动 · 规划 · 只读 | — | ✓ | ✓ |

「只读委派」为 — 的，只能以可改代码的方式被委派。你自己聊的会话里，「全部放行」不会默认选中。定时和预约这类无人值守运行，新安装默认「全部放行」，可在设置 → 权限改成更谨慎的「稳妥」。设置 → 外部智能体还会列出 Antumi 认识、但尚未接入的 Agent CLI。

也可以不走官方账号：在设置 → 服务商接入火山方舟、智谱、Kimi 等编程套餐，或自定义接口。Cursor 用不了服务商。通过代理使用订阅账号可能违反服务条款并导致封号，见[使用指南](docs/GETTING-STARTED.md#模型服务商)。

</details>

## 还能做什么

| | |
|---|---|
| **额度用完接着跑** | 配了多个 Claude Code 或 Codex 账号时自动换号，在原会话里继续；没有可换的号就等额度恢复后自动继续，或移交给另一个 Agent。[说明](docs/GETTING-STARTED.md#多个账号) |
| **手机端** | 在 Android 手机上看会话、回答确认、发消息和图片、新建和开始任务。Agent 仍在电脑上运行。[说明](docs/GETTING-STARTED.md#在手机上使用) |
| **智能体** | 把角色、模型、技能和 MCP 存成「我的智能体」，直接聊天、被 `@` 委派或加入团队，还能固定在侧栏。[说明](docs/ARCHITECTURE.md#智能体与委派) |
| **聊天命令** | 把常用的指令存成命令，最多固定 3 条在输入框上方，点一下就发。在设置 → 聊天命令。 |
| **分屏** | 按住 ⌘ 点另一个会话，一边实现，一边看另一个 Agent 的建议。[说明](docs/GETTING-STARTED.md#分屏两个会话并排) |
| **定时与预约** | 按每天、工作日或每周跑；也可以把一条消息预约到指定时间或额度恢复后。Cursor 与 Antigravity 暂不支持。电脑需保持唤醒。[说明](docs/GETTING-STARTED.md#预约额度恢复后或到点再发) |
| **小助手与翻译** | 选中一段交给小助手解释，或把回复翻成你的语言。用轻量模型，不占主会话上下文。语言和自动翻译在设置 → 会话。[说明](docs/GETTING-STARTED.md#小助手与翻译) |
| **待办** | Agent 记下要你之后做的事，在检查器里勾掉；总览汇总所有会话。[说明](docs/ARCHITECTURE.md#待办) |
| **文件、终端、浏览器** | 在工作台里改文件、看开发服务、验证页面。三个面板都能拖成独立窗口。 |
| **引用与知识库** | 输入框打 `@` 引用文件、项目或以前的会话。Agent 可以把笔记写进你的 Markdown 或 Obsidian 知识库。 |
| **用量** | 统计一段时间内的用量，并估计额度什么时候用完。[说明](docs/USAGE-ANALYTICS.md) |

常用快捷键：看板上 <kbd>N</kbd> 记一条任务，<kbd>⌘</kbd><kbd>K</kbd> 搜索，<kbd>⌘</kbd><kbd>E</kbd> / <kbd>⌘</kbd><kbd>J</kbd> / <kbd>⌘</kbd><kbd>L</kbd> 打开文件、终端、浏览器。完整列表在设置 → 快捷键，23 项可改、可禁用，改完立即生效。

## 文档

| | |
|---|---|
| **使用** | [使用指南](docs/GETTING-STARTED.md) · [新问题自动排查](docs/SOURCE-AUTO-INVESTIGATION.md) · [用量账本](docs/USAGE-ANALYTICS.md) · [Markdown 主题](docs/MARKDOWN-THEMES.md) · [Antigravity](docs/ANTIGRAVITY.md) · [DeepSeek Harness](docs/DEEPSEEK.md) · [ZCode](docs/ZCODE.md) · [Kimi Code](docs/KIMI.md) · [Gemini CLI](docs/GEMINI.md) |
| **扩展** | [任务来源插件](docs/PLUGINS.md)：GitHub、Jira、Linear、禅道，或自己写一个 |
| **开发** | [技术架构](docs/ARCHITECTURE.md) · [聊天平台接入](docs/CHANNELS.md) · [手机端](docs/MOBILE.md) · [WSL](docs/WSL.md) · [AGENTS.md](AGENTS.md) · [DESIGN.md](DESIGN.md) |
| **发布** | [发版与打包](docs/RELEASING.md) · [更新日志](CHANGELOG.md) |

## 社区与支持

- **微信群**：扫码加入交流群，聊用法、提反馈、看更新：

  <img src="docs/assets/wechat-group.jpg" alt="Antumi 微信交流群" width="200" />

- **Issues**：用下来哪里别扭、想接哪个 Agent，欢迎提 [issue](https://github.com/flyhero/antumi/issues)。
- **LINUX DO**：感谢 [LINUX DO](https://linux.do) 社区的支持。
- **V2EX**：感谢 [V2EX](https://www.v2ex.com) 社区的支持。

## 参与

改代码前先读 [AGENTS.md](AGENTS.md) 和 [DESIGN.md](DESIGN.md)。提交前跑：

```bash
pnpm typecheck && pnpm test
```

桌面端改动再加 `pnpm build`。
