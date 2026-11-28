# 远程服务器（SSH）

> 状态：第一阶段已实现（分支 `feat/remote-ssh`），对着容器里的 sshd 验证过，见「验证」。还没有在真实的远程服务器、x64 服务器和 Windows 客户端上用过，见「待验证」。

有的用户想让 Agent 跑在一台 Linux 服务器上：机器更强、开着不关、代码和数据本来就在那里。界面仍留在自己的电脑上。

## 做法：和 WSL 同一个形状，把 `wsl.exe` 换成 `ssh`

core 和 daemon 在服务器上以那台机器的用户运行，桌面端是它们的客户端。git、PTY、Agent、Antumi 的 MCP 服务、登录状态、用量和历史会话都在服务器上，和在本机时一样。

```
本机                                       服务器（Linux）
┌────────────────────┐   ssh（标准输入输出）  ┌──────────────────────────────┐
│ desktop（界面）     │── RPC（WebSocket）──▶│ core ── daemon ── Agent / PTY │
│ 内置浏览器的标签页   │◀─ 浏览器 host ───────│   └─ mcp.mjs（Agent 启动）     │
└────────────────────┘                      │ ~/.antumi（任务、会话、设置）   │
                                            └──────────────────────────────┘
```

WSL 已经把这条路走通了（[WSL.md](WSL.md)）：后端包、安装、替换旧 daemon、等 core 应答、经一个子进程的标准输入输出转发两个方向的连接。远程服务器复用这一切，只换掉「怎么在那台 Linux 上跑一条命令」：

- 安装、启动、问 core 在哪，这些步骤与通道无关（`desktop/src/main/linux-backend/`），WSL 和 SSH 各给它一个「在那台 Linux 上运行」的实现。
- 转发程序（`backend-tunnel.mjs`，原来叫 `wsl-tunnel.mjs`）原样复用，由 `ssh host node backend-tunnel.mjs` 启动。

其他项目和工具大多也是这么做的（VS Code Remote-SSH、Zed、Claude 桌面端、t3code、orca）。不选「服务器监听网络端口、桌面端直连」，因为那要另做加密和配对，暴露面也更大。这条路留给第二阶段：复用手机的 Noise 网关。

## 代码结构

主进程和界面只问后端「能做什么」，从不问它是哪一种（`linux-backend/backend-elsewhere.ts`）：

- `BackendElsewhere`：WSL 和 SSH 的会话各自实现。路径怎么换算、选目录对话框从哪开、浏览器有没有代理、后端的版本，都由它回答；`AppBackend` 只在按用户的选择创建会话时看一次类型。
- `files()`：这台电脑能不能按路径打开后端的文件。WSL 能（经 `\\wsl.localhost`），给 `null`；SSH 不能，给一套经 ssh 的读、写、判断目录，和能自己打开那边文件的编辑器（`ssh/ssh-files.ts`）。预览、用默认应用打开、拖入文件、浏览器下载、「用…打开」、「在访达中显示」都只看它。
- 界面拿到的是 `BackendAccess`（在哪、`filesHere`），选目录、访达、拖入、账号页的说明都按 `filesHere`。

以后经中转连另一台电脑时，再实现一个 `BackendElsewhere`：文件经 core 的 RPC 读写，其余照旧。

## 连接

- **用系统的 `ssh`**，不自己实现 SSH：用户的 `~/.ssh/config`、ssh-agent、跳板机、known_hosts 都照常生效。「服务器」一栏填的就是 `ssh` 认得的目标（`user@host`，或 config 里的别名）。
- 第一版只支持**不用输入密码的登录**（密钥在 ssh-agent 里，或密钥没有口令）：用 `BatchMode=yes`，有提示就直接失败并说明。没见过的主机密钥也会失败，提示用户先在终端里 `ssh` 一次。在应用内输入密码（askpass）放到以后。
- 每条命令都加 `-T`、`RemoteCommand=none`、`ClearAllForwardings=yes`：用户 config 里给交互登录配的远程命令和端口转发不能混进来。保活用 `ServerAliveInterval=15`。
- 除 Windows 外用 `ControlMaster`：一次握手，后面每条命令复用，套接字放在 `~/.antumi/ssh/`。问 core 在哪这类小命令因此很便宜。
- **远程命令一定经过对方的登录 shell**，这一点躲不开，而对方的 shell 可能是 bash、zsh 或 fish。所以 argv 先按 POSIX sh 的规矩转义，整段 base64 编码，再交给 `/bin/sh -c 'eval "$(echo … | base64 -d)"'`：对方 shell 看到的只有 base64 字符，任何 shell 都不会改动它。令牌和大块数据仍走标准输入，不进命令行。

## 安装和启动

和 WSL 相同（`linux-backend.ts`），只有三处不同：

1. **预检**多看两项：系统是 Linux（`uname -s`），架构是 x86_64 或 aarch64，分别用对应的后端包。
2. **启动**：WSL 靠一直开着的 `wsl.exe` 保住发行版；SSH 断开后后端要继续跑，所以在服务器上用 `setsid nohup … &` 脱离这次会话，输出接到 `~/.antumi/logs/`。
3. **logind**：主机设了 `KillUserProcesses=yes` 而用户没开 linger 时，SSH 一断 systemd 就会杀掉这个用户的所有进程，包括后端和正在跑的 Agent。预检发现这种情况就报出来，让用户执行 `loginctl enable-linger`。

后端包和 WSL 用的是同一种，多打一个 arm64 的，并随所有桌面端安装包一起带上（`resources/linux-backend/`，每个约 3MB）。版本目录、替换旧 daemon 的规矩、清理旧版本目录都沿用 WSL 的。

## 自带 Node

后端要 Node 24 以上（WSL.md 说了为什么）。服务器上有就用它；没有，或版本太旧，就装一份固定版本的官方 Node（`linux-backend/managed-node.ts`），WSL 也一样。做法照 VS Code 的远程服务器：

- 版本和每个架构的 sha256 写在代码里（`MANAGED_NODE`，取自 nodejs.org 的 `SHASUMS256.txt`），跟着 Electron 里的 Node 升。用 `.tar.gz` 不用 `.tar.xz`：精简的系统未必有 xz。
- 先让服务器自己下载：依次试 nodejs.org 和 npmmirror（国内访问 nodejs.org 常常很慢），curl 或 wget 都行，按 sha256 校验，所以镜像和原站一样可信。只解出 `bin/node`，放在 `~/.antumi/node/<版本>/`，权限 700。
- 服务器上不了网（或没有 curl、wget）时，由应用在本机下载、校验，存进应用目录的 `linux-node/`，再经标准输入送过去，脚本同样校验。
- 清理旧版本目录时一并清掉别的 Node 版本，仍有进程从里面运行的留着。
- 两边都没拿到时报「没能装好 Node 24」并给出原因，同时仍给出自己装 Node 的命令。

第一次连接要下载约 58MB，之后不再下。

## 路径和文件

core 只认服务器上的路径，本机的文件对它没有意义。WSL 能靠 `\\wsl.localhost` 直接读到发行版的文件，这里没有这条路，所以：

| 功能 | 远程时怎么做 |
| --- | --- |
| 选项目目录、选插件目录 | 在服务器上浏览目录，不开本机的对话框（`ServerFolderDialog`，经 core 已有的 `files.list` / `files.resolve`，`roots` 给 `/`：不用新 RPC，旧 core 也能用） |
| 文件预览 | 主进程经 ssh 读（`ssh/ssh-files.ts`：`realpath`、`stat` 限 32MB、`cat`），和 WSL 经 `\\wsl.localhost` 读同一个位置；不改协议 |
| 拖进输入框的本地文件、文件夹 | 主进程经 ssh 放到服务器的 `~/.antumi/drops/<id>/` 下（文件原样，文件夹打成 tar），插入服务器上的路径；单次最多 100MB。和 orca 的做法相同 |
| 用默认应用打开 | 下载到本机临时目录再打开，和 VS Code 远程窗口一样；最多 100MB，文件夹不行 |
| 用…打开 | 只列 VS Code、Cursor、Zed，打开它们自己的远程链接（`vscode://vscode-remote/ssh-remote+<host>/…`、`zed://ssh/<host>/…`），参照 t3code |
| 在访达中显示 | 不显示 |

## 内置浏览器

标签页仍在本机渲染，但网页的网络请求要从服务器发出，这样 Agent 在服务器上起的 `localhost:3000` 能直接打开。和 Orca 一样，本机开一个 SOCKS5 入口，连接由服务器那端拨出。core 连浏览器 host 这一方向和 WSL 相同。

- **本机**：`linux-backend/socks-entry.ts` 在 `127.0.0.1` 上收 SOCKS5（只有 CONNECT、不认证，Chromium 只用这些），握手完把连接交给转发通道，打开一条 `connect:<端口>:<主机>` 的流。端口在转发程序重启之间不变。
- **服务器**：转发程序带上 `connect: true` 后，替这种流去连那个主机和端口；服务器上不多开任何监听端口。
- **浏览器**：标签页的 session（`persist:antumi-browser`）设上这个代理，加 `<-loopback>`，否则 Chromium 对 localhost 不走代理。Chromium 的 socks5 把主机名原样交出，所以 `localhost` 和内网域名由服务器解析。插件页面的 session 不动，仍从本机上网，那里是用户自己登录的社区网站。
- 连接按两个地址族都试（`localhost` 可能先解析成 `::1`，开发服务器却只监听 `127.0.0.1`）。Node 在这种回退时会丢掉连上之前的 `end()`，所以连上之前收到的数据和结束先存着，连上再交出去。
- **下载**：文件仍先存到本机的下载目录，下完后放到服务器的 `~/.antumi/downloads/<id>/` 下，交给 core 的记录写服务器上的路径，Agent 照常去读；放到服务器上之后才算下载完成，放不上就算中断。「打开」「在访达中显示」用本机那份。
- 本机的这个 SOCKS 入口和 `ssh -D` 一样，本机别的程序也能用它经服务器上网；Chromium 的 SOCKS5 不支持认证，无从加锁。

## 断线

- Agent、PTY 和 core 都在服务器上，断线不影响它们。
- 转发程序断了按退避重启（WSL 已有）；重连后界面重新拉取状态，和 core 重启后一样。
- 应用启动时连不上服务器，和 WSL 一样退回本机后端，并在列表上方提示「显示的是本机的任务」，后端位置页写明原因和怎么补。只退回界面：连不上之前没有任何东西要搬。
- 已经连上之后断开，不退回本机：界面像 core 重启时那样等它回来，转发程序在后台重连。

## 两台电脑连同一台服务器

这是常见用法：公司和家里的电脑都把后端位置设成同一台服务器，看到的是同一份任务、会话和 Agent。core 本来就接受多个客户端（手机也是这样连的），要处理的是两处只能有一个的东西：

- **内置浏览器**：core 经服务器上的 `~/.antumi/browser/host.json` 找浏览器，一次只用一个。每个转发程序把自己的入口记在旁边的 `hosts/<pid>.json`，`host.json` 写最新连上的那个；它退出时，`host.json` 改写成剩下的里最新的、仍在运行的那个，没有了才删。core 盯着这个文件，换了就重连。所以 Agent 用的是最后连上的那台电脑的浏览器，那台关了就回到另一台。
- **后端版本**：见下面「版本」。

### 版本

本机和 WSL 只有一个应用，所以后端版本和应用不同就换成应用的。服务器可能同时有两台电脑连着，各自的应用版本未必一样，照这条规矩会互相把对方的后端换掉，二十秒一次。所以对服务器（`prepare`、`replace-daemon` 带 `--keep-newer`）：只换比应用旧的，比应用新的留着用，设置页提示把这台电脑上的应用更新一下。

## 服务器上 Agent 的登录

第一版不代办。账号页的「添加账号」本来就是在一个终端里跑 Agent 自己的登录，这个终端在服务器上，所以和用户 ssh 上去登录一样：按终端里给的链接和提示完成。也可以给 Agent 配模型服务商。账号页在远程时写明这一点（`AgentAccounts.onServer`）。

## 第一阶段的步骤

1. [x] 设计（本文）
2. [x] 把 Linux 后端的安装和启动从 WSL 中抽出，与通道无关
3. [x] SSH 通道：命令、预检、会话、后端位置里的「远程服务器」
4. [x] 后端包：x64 和 arm64，随所有安装包带上
5. [x] 在服务器上浏览目录，选项目
6. [x] 预览、拖入文件、用…打开、在访达中显示
7. [x] 内置浏览器经服务器上网
8. [x] 自带 Node
9. [x] 端到端：对着容器里的 sshd 从安装跑到界面连上（见「验证」）

## 验证

`ssh/ssh-smoke.test.ts` 把这些模块对着真的 ssh 和一台真的 Linux 跑，不指给它服务器时跳过。本机用 Colima（或任何 Docker）起一台：

1. 在 Linux 容器里编后端包：`bundle-backend.mjs --platform linux --linux-backend`，再 `pack-linux-backend.mjs`。Apple 芯片上的容器是 arm64，正好覆盖 arm64 的包。
2. 起一个装了 `openssh-server` 和 Node 24 的容器，放进一把临时密钥的公钥，端口映射到 `127.0.0.1:2222`。
3. 写一个临时的 ssh config（`HostName 127.0.0.1`、`Port 2222`、`IdentityFile` 指向临时密钥、`UserKnownHostsFile` 指向一个临时文件），不碰 `~/.ssh`。
4. `ANTUMI_SSH_SMOKE=<别名> ANTUMI_SSH_SMOKE_BACKEND=<包所在目录> ANTUMI_SSH_SMOKE_CONFIG=<config> pnpm vitest run packages/desktop/src/main/ssh/ssh-smoke.test.ts`

界面：从源码运行时，`ANTUMI_LINUX_BACKEND=<包所在目录>` 让开发版带上后端包，`ANTUMI_SSH_CONFIG=<config>` 代替 `~/.ssh/config`（打包的应用不认这两个）。再加 `--user-data-dir=<临时目录>`，在那里的 `backend.json` 写 `{"kind":"ssh","host":"<别名>"}`，免得改到装好的应用的选择。

已验证（2026-11-23，macOS arm64 → Debian 12 arm64 容器，Node 24）：

- 主机密钥没见过时报「还没有确认过主机密钥」；config 里给交互登录配的 `RemoteCommand` 和 `LocalForward` 不影响 Antumi 的连接。
- 后端包（3.4MB）装上、daemon 和 core 启动、经转发程序调 `system.hello` 和 `system.environment`，共约 2 秒。
- core 和 daemon 各自是一个会话的首进程，父进程是 1；断开共享的连接后同一个 core 仍在，再走一遍启动找到的是它。
- 共享连接上一条命令不到 1.5 秒。
- 没有 Node 的服务器（Debian 12 slim，只有 curl）：自己从 nodejs.org 下载 Node v24.22.3，后端在它上面启动，冒烟测试全过，约 7 秒。连 curl、wget 都没有的：应用在本机下载 arm64 的包再送过去，同样全过。
- 两台电脑共用服务器：版本更旧的应用连上时，用的是服务器上已有的那个更新的 core（pid 不变），它装的旧版本目录随后被清掉；两个应用先后连上、再先后退出，`host.json` 依次指向后连上的、先连上的，最后没有。
- 开发版的界面连上服务器上的 core：环境里是服务器的路径，后端位置页显示「服务器 antumi-e2e」。
- 选目录对话框列出服务器的主目录，逐层进入后选中 `/home/dev/projects/demo`；起点不存在时回到主目录。
- 内置浏览器打开 `http://localhost:3000` 得到的是服务器上只监听 `127.0.0.1:3000` 的页面（本机同一端口上另有一个应用）；`https://example.com` 照常打开，服务器上能看到去 443 的连接。在标签页里下载服务器上的一个 4KB 文件，下载记录写的是服务器上的路径，那份文件的 sha256 和原文件一致，目录是 700。
- 服务器上的图片经 `antumi-preview://` 显示，不存在的文件得到 404；拖入的文件和文件夹出现在服务器的 `~/.antumi/drops/` 下（目录 700）；「用…打开」只剩 VS Code 和 Cursor；用默认应用打开服务器上的文件夹时说明不行；「在访达中显示」不出现。

## 待验证

1. 真实的远程服务器：延迟高、会断线的网络下，界面、终端和内置浏览器用起来如何；隔一夜断网再连。
2. x64 服务器：只在 arm64 容器里跑过，x64 的包由同一套脚本在 x64 机器上打出。
3. Windows 客户端：系统自带的 OpenSSH（不共享连接，每条命令都握手一次）和 `tar.exe`。
4. 服务器上的 Agent 登录：Claude、Codex 在账号页的终端里登录是否顺利，Codex 回调到服务器 `localhost` 的那一步能否用内置浏览器完成。
5. 开了 `KillUserProcesses` 的服务器上，提示和 `loginctl enable-linger` 之后的表现。

## 已知的限制

- **数据是两份**：本机和服务器的 `~/.antumi` 各有各的任务、会话和设置，切到哪边看到哪边。
- 一个界面一次只连一个后端。
- 服务器只支持 Linux。
