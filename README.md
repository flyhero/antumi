<div align="center">

# Antumi（安图米）

**Claude Code、Codex 等 Agent 照常用，Antumi 帮你省掉在窗口之间复制粘贴的那些活。**

issue 直接开工 · 多 Agent 协作 · 自己验证 · 额度不断档

[![Version](https://img.shields.io/github/package-json/v/flyhero/antumi?label=version&color=blue)](CHANGELOG.md)
![Platform](https://img.shields.io/badge/platform-macOS%20%C2%B7%20Windows%20%C2%B7%20Linux-lightgrey)
![Agents](https://img.shields.io/badge/agents-10%20supported-8A2BE2)

[下载](https://github.com/flyhero/antumi/releases) · [为什么不只用终端](#为什么不只用终端) · [更多功能](#更多功能) · [快速开始](#快速开始) · [文档](#文档) · [更新日志](CHANGELOG.md) · [社区](#社区)

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
  <a href="#支持的-agent" title="Gemini CLI"><img src="docs/assets/agents/gemini.svg" alt="Gemini CLI" width="32" height="32" /></a>
</p>

https://github.com/user-attachments/assets/44398279-8f26-441f-ad24-fa1b1e344674

</div>

## 为什么不只用终端

Antumi 驱动的就是你装好、登录好的 Agent CLI，配置和登录都不用重来，终端里聊到一半的会话也能导进来接着聊。

### 不用再复制粘贴

同时用几个 Agent，很多时间都花在当搬运工上。在 Antumi 里，这些不用你再贴来贴去：

- **在 Agent 之间**：移交带着聊天记录，[委派](#多个-agent-相互协作)的结果自动回到主会话，[群聊](#群聊)里互相回应；Agent 也能自己翻以前和别的 Agent 聊过的会话。
- **报错和运行输出**：Agent [自己在内置浏览器和终端里看](#agent-自己验证你只管验收)。
- **任务和 bug**：issue [直接导入成任务](#任务和-bug-直接进-ai-流程)，群聊的结论能一键新建任务。
- **代码**：在输入框打 @ 引用文件或项目，不用贴路径和片段。
- **笔记和待办**：Agent 直接把笔记写进你的 Markdown 或 Obsidian 知识库，要你之后处理的事记成[待办](#待办)。
- **看不懂的回复**：选中交给[小助手](#小助手)追问，或者一键[翻译](#翻译)。
- **提示词和配置**：常用指令存成智能体或[定时任务](#定时与预约)；MCP 服务器在一处配好，勾选交给哪些 Agent。

下面四件事串起从任务到成果的整条流程，其余的见[更多功能](#更多功能)。

### 任务和 bug 直接进 AI 流程

终端里接一个 bug，要先把 issue 原文复制给 Agent，再建分支、讲清楚要做什么。在 Antumi 里，GitHub、Jira、Linear、禅道的 issue 同步进侧栏「收件箱」，一键导入成任务：开始后自动建好独立 worktree 和带 issue 编号的分支，Agent 先读代码、拿出计划，你批准后才改代码。原因还不清楚的 bug 可以先「会话排查」，查清根因再动手；群聊的结论也能一键新建任务，任务之间可设前置依赖，前一个验收通过才解锁下一个。


[接入 issue 来源 →](docs/GETTING-STARTED.md#任务来源) · [任务怎么流转 →](docs/ARCHITECTURE.md#2-任务模型)
<img src="docs/assets/features/intake.webp" alt="任务演示：在收件箱把 GitHub issue 导入成任务，打开后点「开始执行」，Agent 读完代码拿出计划等你批准" width="100%" />

### 多个 Agent 相互协作

终端里开五个窗口跑五个 Agent，谁在等你批准、谁已经做完，只能挨个切过去看；想让另一个 Agent 帮忙审一遍，只能在窗口间复制粘贴。在 Antumi 里：

- **委派**：把常用角色存成智能体，如代码审查员、测试验证专员，各配外部智能体、模型、技能与 MCP，也可从模板开始；会话里打 @ 点名，主 Agent 也会按需自己调用。被委派的智能体在独立子会话里工作，结果自动回到主会话；只读分析可并行，改代码的委派依次执行。
- **[团队](#团队)与[群聊](#群聊)**：把一项任务交给队长带开发和评审一起做，或者让几个 Agent 先讨论方案再动手。
- **移交**：点输入框左下角的 Agent 名称，换另一个 Agent 带着聊天记录在同一个目录接着做。
- **并行不打架**：每个任务一个独立 worktree，代码互不干扰；等你批准、回答、验收的事集中在总览里，Agent 做完或在等你时会发系统通知。


[委派 →](docs/ARCHITECTURE.md#智能体与委派) · [移交 →](docs/GETTING-STARTED.md#无缝移交)
<img src="docs/assets/features/delegate.webp" alt="委派演示：在输入框 @ 代码审查员，主 Agent 委派后卡片显示工作中，审查结果自动回到主会话" width="100%" />

### Agent 自己验证，你只管验收

终端里 Agent 说「改好了」，你还得自己开浏览器点一遍，再把报错贴回去。在 Antumi 里，Agent 在内置浏览器里打开页面、点击、读控制台和网络请求、截图，在内置终端里看开发服务器的输出，发现问题自己接着修；你随时可以接管页面，或把选中的元素、截图直接加进会话。做完后检查整条任务分支的 diff、运行项目检查，满意了再合并。


[内置浏览器 →](docs/ARCHITECTURE.md#5-内置浏览器) · [验收 →](docs/ARCHITECTURE.md#验收之后)
<img src="docs/assets/features/verify.webp" alt="自己验证演示：Agent 打开页面截图发现逾期待办没标红，读控制台找到报错并修改，再截图确认修好" width="100%" />

### 额度用完，工作不停

终端里撞上限，这一轮就停在那儿等你。在 Antumi 里，配了多个 Claude Code / Codex 账号就自动换号，在原会话里接着跑；没有可换的号，就等额度恢复后自动继续；也可以一键移交给另一个 Agent。底部状态栏常驻各 Agent 的用量和恢复时间，快重置了还剩很多就提醒你放心多用，照这个速度会提前用完就建议换模型或换 Agent。


[配多个账号 →](docs/GETTING-STARTED.md#多个账号) · [额度节奏 →](docs/ARCHITECTURE.md#额度节奏与建议)
<img src="docs/assets/features/handoff.webp" alt="无缝移交演示：在输入框把 Claude Code 换成 Codex，写下补充说明，Codex 接着补测试" width="100%" />

<sub>我在重度使用多个 Agent 半年后，为解决自己的这些痛点做了 Antumi。</sub>

## 更多功能

[额度看得见](#额度看得见) · [小助手](#小助手) · [翻译](#翻译) · [分屏](#分屏) · [群聊](#群聊) · [团队](#团队) · [定时与预约](#定时与预约) · [待办](#待办)

### 额度看得见

底部状态栏常驻 Claude Code、Codex、Cursor、Antigravity、ZCode 的用量，悬停就能看各自的额度窗口和恢复时间，并按重置时间估算节奏：还剩很多就提醒你放心多用，会提前用完就建议换模型，或把轻活交给另一个 Agent。


[详细 →](docs/ARCHITECTURE.md#额度节奏与建议)
<img src="docs/assets/features/quota.webp" alt="额度演示：放大底部状态栏，依次悬停查看三个 Agent 的用量和恢复时间，再改看剩余额度" width="100%" />

### 小助手

选中聊天里的一段内容，右键「交给小助手」，它会带着这段引用在右侧打开，帮你解释、追问或处理。小助手默认使用轻量模型、拥有独立上下文，主会话继续专注手头的工作。


[详细 →](docs/GETTING-STARTED.md#小助手与翻译)
<img src="docs/assets/features/assistant.webp" alt="小助手演示：选中「幂等键」，右键交给小助手，在右侧追问并得到解释" width="100%" />

### 翻译

英文回复下方点「翻译」就能读中文，再点一下切回原文；也可以只选中一句，右键「翻译」。由轻量模型完成，不占主会话上下文。


[详细 →](docs/GETTING-STARTED.md#小助手与翻译)
<img src="docs/assets/features/translation.webp" alt="翻译演示：点「翻译」读中文、切回原文，再选中一句右键翻译" width="100%" />

### 分屏

按住 ⌘ 点击另一个会话，或在会话菜单里选「在右侧分屏打开」，两个会话就并排显示：一边推进实现，一边看另一个 Agent 的建议。两侧可以分别输入、查看进度和处理批准请求，拖动分隔线就能调整宽度。


[详细 →](docs/GETTING-STARTED.md#分屏两个会话并排)
<img src="docs/assets/features/split.webp" alt="分屏演示：⌘ 点击另一个会话，Claude Code 和 Codex 并排显示，在右侧输入" width="100%" />

### 群聊

让 2–5 个 Agent 在同一条对话里先独立作答，再互相回应，讨论方案的取舍。你可以随时插话或 @ 成员追问，用「继续」「立即总结」掌握节奏，最后由主持人汇总共识与分歧；讨论只读、不改代码。


[详细 →](docs/ARCHITECTURE.md#群聊)
<img src="docs/assets/features/discussion.webp" alt="群聊演示：三个 Agent 独立作答，点「继续」互相回应，点「立即总结」由主持人总结" width="100%" />

### 团队

为队长、开发和评审分别配置外部智能体、模型与职责，或直接选用已保存的智能体，然后把一项任务交给整个团队。队长先和你确认计划，再安排成员在同一个 worktree 中协作：开发串行，只读分析可并行。


[详细 →](docs/ARCHITECTURE.md#团队)
<img src="docs/assets/features/squad.webp" alt="团队演示：点「编辑」，展开开发成员，查看它的外部智能体、模型与职责" width="100%" />

### 定时与预约

在侧栏「定时」里让 Claude Code、Codex、OpenCode、Pi、DeepSeek Harness、ZCode、Kimi Code 或 Gemini CLI 按每天、工作日或每周执行工作；输入框旁的时钟按钮能把这条消息预约到指定时间或额度恢复后，任务和计划批准也能预约。定时任务可自动选择有额度的 Agent；无人值守时 Agent 问的事由 Antumi 按模式代答，不会停下来等你。电脑需保持唤醒，Cursor 与 Antigravity 暂不支持。


[详细 →](docs/GETTING-STARTED.md#预约额度恢复后或到点再发)
<img src="docs/assets/features/schedule.webp" alt="定时与预约演示：打开侧栏「定时」和「预约」，再用输入框旁的时钟预约发送消息" width="100%" />

### 待办

Agent 在回复里提到要你之后处理的事（上线前要做的、要你验证或配置的），会记成这条会话的待办，头部检查器按钮上显示未完成数。点开「待办」页签逐项勾掉；「总览 · 待办」汇总所有会话，标着「Agent 可做」的项还能一键交回给 Agent。


[详细 →](docs/ARCHITECTURE.md#待办)
<img src="docs/assets/features/todos.webp" alt="待办演示：Agent 记下待办，点头部检查器按钮打开「待办」页签勾掉一项，再在总览里查看所有会话的待办" width="100%" />

<details>
<summary><b>还有这些：从推进任务到验收成果</b></summary>

- **总览**：把等你批准、回答和验收的工作汇在一处，在跑和接下来要做的也一眼看清。
- **任务看板**：支持独立 worktree、多项目任务和前置依赖，验收通过后才解锁后续任务。
- **验收与 Git**：检查整条任务分支的 diff，运行项目检查，支持从远端更新与变基合并；独立的「Git」页按项目和 worktree 管理分支与标签。
- **文件、终端与浏览器**：在工作台里编辑文件、管理开发服务，让 Agent 验证页面，你也可以接管；内置浏览器带控制台、网络面板和下载管理，页面截图与选中内容可直接加入会话。
- **服务商与多账号**：支持第三方编程套餐与自定义模型接口；Claude Code 与 Codex 支持多账号及额度耗尽自动切号。
- **用量分析与预测**：深度账本统计 7/30/90 天用量与额度耗尽预测，定时预热与智能用卡自动化。
- **来源与扩展**：接入 Jira、GitHub、Obsidian、Agent Skills、MCP 服务器与终端会话导入。
- **本地优先**：记录保存在本机，Agent 由后台进程托管，关窗口不中断工作。

</details>

## 支持的 Agent

Antumi 驱动的是你已经装好、登录好的 Agent CLI。

| Agent | 接入方式 | 权限模式 | 计划审批 | 移交 | 定时 / 预约 |
|---|---|---|:-:|:-:|:-:|
| [**Claude Code**](https://github.com/anthropics/claude-code) | `claude -p`（stream-json） | 逐项确认 · 自动接受编辑 · 规划 · 自动判断 | ✓ | ✓ | ✓ |
| [**Codex**](https://github.com/openai/codex) | `codex app-server` | 逐项确认 · 自动 · 规划 · 只读 | ✓ | ✓ | ✓ |
| [**Cursor**](https://cursor.com/cli) | `cursor-agent acp` | Agent · Plan · Ask | ✓ | ✓ | — |
| [**OpenCode**](https://opencode.ai) | `opencode acp` | Build · 自动 · Plan · 只读 | — | ✓ | ✓ |
| [**Pi**](https://pi.dev) | `pi --mode rpc` | 默认 · 自动 · 规划 · 只读 | ✓ | ✓ | ✓ |
| [**DeepSeek Harness**](docs/DEEPSEEK.md) | `dsh --profile antumi`（ACP） | 默认 · 自动 · 规划 · 只读 | ✓ | ✓ | ✓ |
| [**Antigravity**](docs/ANTIGRAVITY.md) | Google 的 Antigravity ACP 服务 | Default · Auto Edit | — | ✓ | — |
| [**ZCode**](docs/ZCODE.md) | `zcode app-server` | 修改前询问 · 自由编辑 · 规划 · 自主 · 只读 | ✓ | ✓ | ✓ |
| [**Kimi Code**](docs/KIMI.md) | `kimi acp`（Node.js 版 2.3.2+） | Default · Plan · Auto | ✓ | ✓ | ✓ |
| [**Gemini CLI**](docs/GEMINI.md) | `gemini --acp`（0.66.0+） | Default · Auto Edit · Plan | ✓ | ✓ | ✓ |

「全部放行」不会默认选中。设置 → 外部智能体 还会列出 Antumi 认识、但尚未接入的 Agent CLI。

## 快速开始

**三步做完第一个任务：**

1. **装好**：到 [Releases](https://github.com/flyhero/antumi/releases) 下载安装包（macOS Apple Silicon · Windows x64 · Linux x64），再准备至少一个 Agent：Claude Code、Codex、Cursor、OpenCode、Pi、DeepSeek Harness、Kimi Code、Gemini CLI 装好 CLI 并登录，ZCode 装桌面版或 `zcode-app-cli`，Antigravity 在 设置 → 外部智能体 里一键下载。第一次打开 Antumi 会帮你检查 Agent 装没装、能不能用。
2. **交一个小任务**：侧栏「任务」点 +，选项目和 Agent，写一句要改什么，点「开始执行」。Antumi 建好独立 worktree，Agent 先读代码拿出计划，你批准后它才动手改。
3. **验收**：做完会有系统通知。在右侧检查器看整条分支的 diff，跑项目检查，让 Agent 在内置浏览器里打开页面看看效果，满意了再合并。

接服务商、配多个账号、从 GitHub / Jira 导入 issue，见[使用指南](docs/GETTING-STARTED.md)（App 里 帮助 → 使用指南 也能打开）。

**在 macOS 上安装 dmg**：App 只有 ad-hoc 签名，没经过 Apple 公证，所以比一般 App 多一步。

1. 打开 dmg，把 Antumi 拖进「应用程序」。不要在 dmg 里直接运行，那样系统通知发不出来。
2. 去掉下载带来的隔离属性，Gatekeeper 才会放行：

   ```bash
   xattr -dr com.apple.quarantine /Applications/Antumi.app
   ```

   不想敲命令的话，也可以先双击被拦一次，再去「系统设置 → 隐私与安全性」点「仍要打开」。
3. 打开 Antumi。它第一次发系统通知时（窗口不在前台，Agent 做完了或在等你），macOS 会问是否允许，选「允许」。这个问题只问一次：错过了或没点，之后的通知只会悄悄进通知中心、不弹出来。这时去「系统设置 → 通知 → Antumi」打开「允许通知」，提醒样式选「横幅」或「提示」。

收不到通知时怎么排查，见[技术架构 · 打包与安装](docs/ARCHITECTURE.md#8-打包与安装)。

**在 Windows 上安装**：安装包没有签名，SmartScreen 会拦一下，点「更多信息 → 仍要运行」。

**在 Linux 上安装**：Debian、Ubuntu 用 `sudo apt install ./Antumi-<版本>-amd64.deb`。其他发行版用 AppImage：`chmod +x` 后直接运行，Ubuntu 22.04 及以上要先 `sudo apt install libfuse2`；Ubuntu 23.10 及以上若启动时报 sandbox 错误，改用 deb，或加 `--no-sandbox` 启动。AppImage 会像 macOS、Windows 一样在后台自动更新；deb 只提示新版本，需要重新下载安装。

<details>
<summary><b>从源码运行与打包</b></summary>

<br/>

**从源码运行**，需要 Node ≥ 22.13 和 pnpm 12：

```bash
git clone https://github.com/flyhero/antumi.git
cd antumi
pnpm install
pnpm dev          # 同时启动 daemon、core 和桌面端
```

**打包成 macOS 应用**（Apple Silicon）：

```bash
pnpm dist:mac     # 产物在 packages/desktop/dist/Antumi-<版本>-arm64.dmg
```

**打包成 Windows 安装包**（x64，在 macOS 上也能打）：

```bash
pnpm dist:win     # 产物在 packages/desktop/dist/Antumi-Setup-<版本>-x64.exe
```

**打包成 Linux 应用**（x64，只能在 Linux 上打：node-pty 要在本机编译，需要 `build-essential` 和 `python3`）：

```bash
pnpm dist:linux   # 产物在 packages/desktop/dist/Antumi-<版本>-x86_64.AppImage 和 -amd64.deb
```

装了 App 的机器不需要 Node 和 pnpm。

</details>

<p align="center">
  <img src="docs/assets/agents.png" alt="设置 → 外部智能体：Claude Code、Codex、Cursor 都已安装并登录" width="720" />
</p>

<details>
<summary><b>常用快捷键</b></summary>

<br/>

| 按键 | 作用 |
|---|---|
| <kbd>N</kbd>（看板上） | 在「未执行」列顶部快速记一个任务 |
| <kbd>⌘</kbd> <kbd>N</kbd> | 打开完整的新建任务对话框 |
| <kbd>⌘</kbd> <kbd>E</kbd> | 打开 / 关闭文件面板 |
| <kbd>⌘</kbd> <kbd>J</kbd> 或 <kbd>Ctrl</kbd> <kbd>`</kbd> | 打开 / 关闭终端面板 |
| <kbd>⌘</kbd> <kbd>L</kbd> | 打开浏览器面板并跳到地址栏；在地址栏里再按一次关闭 |
| <kbd>⌘</kbd> <kbd>K</kbd> | 搜索会话、任务、智能体和文件 |
| <kbd>⌘</kbd> <kbd>,</kbd> | 设置 |
| <kbd>⌘</kbd> <kbd>F</kbd> | 搜索当前聊天 |
| <kbd>⌘</kbd> <kbd>S</kbd> | 保存文件面板里正在编辑的文件 |
| <kbd>Enter</kbd> / <kbd>Shift</kbd> <kbd>Enter</kbd> | 发送 / 换行；Agent 忙时 Enter 会把消息排队 |
| <kbd>Tab</kbd> 或 <kbd>→</kbd> | 采用 Claude Code 预测的下一句 |
| <kbd>Esc</kbd> | 中断当前回合；在任务页里回到看板 |

「设置 → 快捷键」按场景展示 23 项可配置操作，包括任务、侧栏、分屏、聊天发送与中断、查找、文件和表单提交。支持搜索、修改、禁用和恢复默认，按生效区域检查冲突，修改后立即生效并在本机保留；按钮与输入框提示同步显示当前绑定。面板开关在浏览器或终端获得焦点后也有效。复制粘贴等通用编辑按键另列为参考。

</details>

## 本地优先，安全优先

- **数据在你的机器上**：任务、会话和 worktree 都在 `~/.antumi/`，核心功能不依赖任何 Antumi 托管服务。
- **只对本机开放**：core 只监听 `127.0.0.1`，并且每个连接都要带 token。
- **不经过 shell**：Agent 命令以参数数组启动，prompt 前加 `--`。
- **凭据不外泄**：Jira / GitHub 凭据单独存放（权限 600），不返回给界面，也不交给 Agent。
- **外部内容当作不可信**：导入的 issue 原文包在 `<untrusted-source>` 里交给 Agent；任务图片保存前去掉 EXIF。
- **不替你删成果**：worktree 只在你确认后清理，删前重新检查，有未提交改动或独有提交的一律保留。

## 文档

| 我想…… | 看这里 |
|---|---|
| 装 Agent、接服务商、配多个账号、导入 issue | [使用指南](docs/GETTING-STARTED.md) |
| 了解整体架构、进程边界和通信协议 | [技术架构 · 总体架构](docs/ARCHITECTURE.md#1-总体架构) |
| 弄清任务怎么流转、规划、验收、处理依赖 | [技术架构 · 任务模型](docs/ARCHITECTURE.md#2-任务模型) |
| 管理 worktree、分支、合并冲突 | [技术架构 · Worktree 与 Git](docs/ARCHITECTURE.md#3-worktree-与-git) |
| 了解各 Agent 怎么接入、权限模式对应什么 | [技术架构 · Agent 接入与聊天](docs/ARCHITECTURE.md#4-agent-接入与聊天) |
| 让 Agent 用浏览器验证页面 | [技术架构 · 内置浏览器](docs/ARCHITECTURE.md#5-内置浏览器) |
| 接入任务或 Bug 来源 | [任务来源插件](docs/PLUGINS.md) |
| 写一个任务来源插件 | [插件开发指南](docs/PLUGINS.md#开发一个任务来源插件) |
| 打包、安装、卸载 | [技术架构 · 打包与安装](docs/ARCHITECTURE.md#8-打包与安装) |
| 发布新版本 | [技术架构 · 自动发布](docs/ARCHITECTURE.md#自动发布) |
| 看每个版本改了什么 | [CHANGELOG.md](CHANGELOG.md) |

## 社区

用下来哪里别扭、想接哪个 Agent，欢迎提 [issue](https://github.com/flyhero/antumi/issues)。

## 参与开发

先读 [AGENTS.md](AGENTS.md)（进程边界、协议、提交规范）和 [DESIGN.md](DESIGN.md)（视觉规范）。提交前跑：

```bash
pnpm typecheck && pnpm test     # 桌面端改动再加 pnpm build
```

手动试用时别碰自己的真实数据，用测试目录起一套独立实例：

```bash
ANTUMI_HOME=~/.antumi-demo pnpm dev
```

## 现状

Antumi 目前是**开发版**（0.21.x），主要在 macOS 上开发和测试，Windows 和 Linux 可以运行和打包。接下来按优先级：

- **Windows 实机体验**：完善 Windows 上的日常使用、自动更新和 CI。
- **远程执行**：让 Agent 在 SSH / WSL 里的仓库上干活，看板留在本机。
- **更多 Agent 与生态**：持续扩展主流 Agent CLI 与 ACP 生态支持。


## 关于名字

**Antumi（安图米）是一个受 ant（蚂蚁）启发的自造词。** 单只蚂蚁很小，合力却能完成大活。Antumi 把不同的 AI 编程 Agent 集中到同一个工作台，让任务分头推进，进度和成果都看得清楚。

## 许可

[Apache License 2.0](LICENSE)
