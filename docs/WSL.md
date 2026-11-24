# WSL 支持

> 状态：主进程、后端包和转发程序已写完，并在 Windows 运行器的 WSL 2 里从安装跑到了界面能连上 core（见「已验证」）。装好的 Windows 应用本身还没有人在 WSL 上用过，见「待验证」。

Windows 用户里有一类人整天在 WSL 里干活：项目放在发行版自己的目录里（`/home/<用户>/...`），Claude Code、Codex 这些 CLI 也只装在里面。Windows 上的 Antumi 只在 Windows 里找 Agent，于是一个都找不到。

## 做法：后端跑在 WSL 里，Windows 只留界面

core 和 daemon 在发行版里以 Linux 进程运行，Windows 的桌面端作为客户端连过去。git、PTY、Agent、Antumi 的 MCP 服务、登录状态、用量和历史会话都是 Linux 下的原样行为，各 Agent 的 adapter 不用改。

```
Windows                                   WSL 发行版
┌────────────────────┐                    ┌──────────────────────────────┐
│ desktop（界面）     │── RPC（WebSocket）─▶│ core ── daemon ── Agent / PTY │
│ 内置浏览器的标签页   │◀─ 浏览器 host ──────│   └─ mcp.mjs（Agent 启动）     │
└────────────────────┘                    │ ~/.antumi（任务、会话、设置）   │
                                          └──────────────────────────────┘
```

这条路现成可走，因为进程边界本来就是这样划的：core 不依赖 Electron，桌面端只是客户端，原生模块只在 daemon 里。`mcpCommand` 用 `process.execPath` 加 `ANTUMI_MCP_JS` 启动 MCP 服务（`core/src/mcp-command.ts`），换成 Linux 的 Node 不用改。

### 为什么不是「后端留在 Windows，每条命令经 `wsl.exe` 转进去」

那样要在 Windows 和 Linux 之间逐处转换路径和环境变量，git 得按项目在哪边分别处理，每个 Agent 的登录状态、用量和历史会话的位置也要单独对付。项目放在发行版自己的目录里时，Windows 的 git 经 `\\wsl.localhost` 去读又慢又不可靠，而这正是要支持的情况。

## 第一版的范围

选好发行版就能用：桌面端自己把后端装进发行版、启动它、跟着应用升级，内置浏览器可用。用户要自己准备的只有各 Agent 的 CLI；发行版里没有 24 以上的 Node 时，Antumi 自己装一份（见 [REMOTE.md](REMOTE.md) 自带 Node）。

### Linux 后端包

发版时多一个任务（`release.yml` 的 `linux-backend`）：在 Linux 上按 Linux 打出 `out/backend`（`bundle-backend.mjs --platform linux --linux-backend`，多出转发程序和 `backend-control` 两个入口，别的安装包里都没有），再由 `pack-linux-backend.mjs` 打成 `backend-linux-x64.tar.gz`，旁边一个写着 sha256 和版本的 json。各平台的打包任务都取来放进安装包的 `resources/linux-backend/`（远程服务器也用它，另有 arm64 的一份，见 [REMOTE.md](REMOTE.md)）。本机 `pnpm dist:win` 打的包里没有它，「后端位置」就不给选发行版。

- 里面是全部 `.mjs`、`plugins` 和 Linux 上编译的 node-pty，解开就是发行版里的一份后端。
- 在 `ubuntu-22.04` 上编：node-pty 按新 glibc 编出来的，旧 glibc 的发行版加载不了。再旧的发行版在预检时报出来。
- 一定要在这台 runner 上真编一次：pnpm 默认把编好的 node-pty 存进 store，store 又随 CI 缓存在各任务间共用，`verify`（`ubuntu-latest`）编的那份曾被原样打进 0.21.8，要 glibc 2.42，Ubuntu 24.04 都加载不了。所以 `pnpm-workspace.yaml` 关了 `sideEffectsCache`，Linux 的任务装完再 `pnpm rebuild node-pty`，`bundle-backend.mjs` 打 Linux 包时还要查绑定要的 glibc 不超过 2.35、在本机加载得了，不然直接失败。Linux 桌面包（`ubuntu-24.04`）也受这条检查。
- 只有 x64。ARM 的 Windows 上发行版是 arm64，预检时报不支持。
- 不带 Node。后端是按 Electron 自带的 Node 24 写和测的，22 上 core 一启动就缺 `node:zlib` 的 zstd，Ubuntu 24.04 用 apt 装到的是 18，不够：发行版里有 24 以上的就用它，没有就装一份固定版本的官方 Node（`linux-backend/managed-node.ts`，见 REMOTE.md）。

### 安装和启动

应用启动时由 `desktop/src/main/app-backend.ts` 看「后端位置」：选了发行版就走下面这几步（`wsl/wsl-backend.ts` 的 `ensureWslBackend`），哪一步不成就说清缺什么、怎么补，并退回本机后端。

1. **预检**：发行版存在、是 WSL 2、x64，找登录 shell 的 PATH 上 24 以上的 Node，没有就装一份。登录 shell 的 PATH 只取这一次，后面每次启动都显式带上。
2. **安装**：`~/.antumi/backend/<版本>-<包的哈希前 12 位>/` 里没有就绪标记时，把后端包经标准输入送进发行版，校验 sha256，解开，最后才改成这个名字。同一版本重新打的包哈希不同，所以也会装。
3. **检查 node-pty**：让装好的 `backend-control.mjs check` 试着加载它。node-pty 自己的报错只留最后试的那个位置（Linux 上永远是不存在的 `prebuilds/linux-x64`），所以加载不了时再单独加载 `build/Release/pty.node` 拿真正的原因。原因是 `GLIBC_…`/`GLIBCXX_…` not found 才说发行版的系统库太旧；别的都当安装包的问题，附上报错。
4. **替换**：`backend-control.mjs prepare <版本>` 在发行版里跑和本机同一套规矩（`protocol/src/node/backend-lifecycle.ts`）：别的版本的 core 请它退出，daemon 只在不跑东西时才换，答回要启动哪几个。
5. **启动**：每个由一个无窗口的 `wsl.exe -d <发行版> --exec env PATH=… /bin/sh -c … node <入口>` 带起来，和本机 `launch()` 一样不随应用退出。桌面端先隐藏启动系统自带的 Windows PowerShell；它用 `ProcessStartInfo` 的 `CreateNoWindow=true`、`UseShellExecute=false` 启动 `wsl.exe`，成功后立即退出，桌面端等到这个结果才继续。Linux 进程留在 `wsl.exe` 的前台，不在发行版里再做一次后台化：有 `wsl.exe` 连着，发行版才不会被回收。输出由那段 `sh` 接到发行版自己的 `~/.antumi/logs/` 里。
6. **等 core 应答**：`backend-control.mjs endpoint` 答回 core 的端口和令牌。core 要把账号、插件、技能等都加载完才监听、写 `core.json`，冷启动的发行版第一次曾超过 30 秒，所以还没答回时 `endpoint` 顺带说这个目录的 `core.mjs` 还在不在跑（查 `/proc/*/cmdline`）：在就最多等三分钟，这次拉起的 core 不在了（拉起后 5 秒宽限）就马上报错，不白等。core.log 里 `listening` 那行带着启动用了几秒。

应用开着的时候，core 没了（比如 `wsl --shutdown` 之后）会在界面再来问它在哪时重新走一遍，最多二十秒一次；旧 daemon 的替换沿用本机那个定时检查，改问 `backend-control.mjs replace-daemon`。

core 应答后顺手清掉别的版本的目录，仍有进程从里面运行的留着（为手上的会话留下的旧 daemon，Agent 从里面启动的 MCP 服务）。

### 连接

Antumi 自己的协议都不变，变的只是字节怎么过 Windows 和发行版之间的那道边界：两个方向都走转发程序，不走网络。

转发程序（`core/src/backend-tunnel-main.ts`，随后端包装进发行版）由桌面端经 `wsl.exe` 启动，一个进程，字节走它的标准输入输出，上面复用多条连接（`protocol/src/node/stdio-tunnel.ts`）。桌面端这头是 `wsl/wsl-link.ts`，它没了就重新启动。

- **界面 → core**：桌面端在 Windows 的 `127.0.0.1` 上开一个端口，连进来的连接经转发程序接到发行版里 core 的端口。界面拿到的就是这个端口，自己不用改。Windows 直接连发行版的 `127.0.0.1` 在默认网络下也通，但换了网络模式就不一定，所以不走那条路。
- **core → 内置浏览器**：发行版里连不到 Windows 的 `127.0.0.1`。转发程序在发行版的 `127.0.0.1` 上开一个端口，把连进来的连接转给桌面端，桌面端再连本机的浏览器 host；它把这个端口和 host 的令牌写进发行版的 `~/.antumi/browser/host.json`，core 照原样去读、去连，不用改。它在标准输入关闭时退出并删掉那个文件。

core 仍然只绑 `127.0.0.1`。令牌都经标准输入给转发程序，不进命令行参数。浏览器 host 在这种时候把自己的地址写在应用自己的目录里，不写进本机的 `~/.antumi`：本机可能还留着一个之前启动的 core，不能让它也来接这个浏览器。

### 路径

core 只认 Linux 路径，界面按路径本身的样子处理，不看自己在哪个系统上。转换只发生在桌面端主进程碰到本机文件的地方（`desktop/src/main/index.ts`，规则在 `wsl/wsl-paths.ts`）：

- 选目录、选插件：对话框开在 `\\wsl.localhost\<发行版>\home\<用户>`，选中的路径转成 Linux 路径再交给 core；选了发行版够不着的地方（别的发行版、网络共享）就直说。
- 在文件管理器里显示、打开、「用…打开」、文件预览：Linux 路径转成 `\\wsl.localhost\<发行版>\...` 再交给系统，`/mnt/c/x` 转回 `C:\x`。
- 拖进输入框的 Windows 文件：`C:\x` 转成 `/mnt/c/x`。

### 这一版没有的，和什么时候做

| 没有的 | 原因 | 什么时候做 |
| --- | --- | --- |
| 保持唤醒 | core 在发行版里，管不到 Windows 的睡眠 | 第一版确认可用后的下一个版本：改由桌面端在 Windows 上替它做 |
| 局域网里的手机直连 | WSL 默认网络下，外面连不进发行版 | 有用 WSL 的用户要用手机时。在那之前，经自己的服务器中转和 WireGuard 两种方式是 core 往外连，不受影响（待验证） |
| 同时看到 Windows 和发行版两边的数据 | 一个界面只连一个 core | 不在计划里，要改的是界面连多个后端 |

## 还没做的

- 测试版发给用 WSL 的用户，过一遍「待验证」，再正式发。

## 已知的限制

- **数据是两份**。Windows 的 `~/.antumi` 和发行版里的 `~/.antumi` 各有各的任务、会话和设置，「后端位置」切到哪边就看到哪边的。同时连两个后端不在这份设计里。
- **只支持 WSL 2**，一次一个发行版。
- 项目放在 `/mnt/c/...` 下也能用，但 git 和文件监听会慢，建议放在发行版自己的目录里。

## 调用 `wsl.exe` 的规矩

实现时集中在一个模块里：

- 用绝对路径的 `System32\wsl.exe`，并给它一个确定存在的 Windows 工作目录。
- 一律 `--exec`，不用 `--`：后者会把每个参数里的 `$name` 展开。
- 设 `WSL_UTF8=1`，否则 `wsl.exe` 自己的报错是 UTF-16LE。
- `--exec` 拿不到登录 shell 的 PATH，要先取一次再显式带上；取的时候用标记把输出夹起来，Ubuntu 的登录 shell 会往标准输出打提示。
- 令牌走标准输入，不进命令行参数。
- 后台检查不要把已经停掉的发行版唤醒：先看 `wsl.exe --list --running`。
- 后端启动不直接给 `wsl.exe` 设置 `detached`：libuv 会同时设置 `DETACHED_PROCESS`，Windows 因而忽略 `CREATE_NO_WINDOW`，默认终端为 Windows Terminal 时仍会打开常驻窗口。隐藏启动器的子进程不继承 libuv 的结束随父进程退出的 job，所以无需这个标志仍能独立运行。启动器只执行固定脚本，文件、参数数组和工作目录经 UTF-8 JSON 标准输入传入，参数按 `CreateProcess` 规则引用，不拼进 PowerShell 脚本，也不经 `cmd.exe`。
- `wsl.exe --list` 的输出是 UTF-16LE 带 BOM；`docker-desktop` 这类发行版要滤掉。
- 「没问到」不等于「没有」：探测失败时保留上一次的结果，过一会儿再问。

## 已验证

`wsl/wsl-smoke.ts` 把上面这些模块原样拿到 GitHub 的 `windows-2025` 运行器上，对着真的 WSL 2（Ubuntu 24.04，默认的 NAT 网络）跑：

- **调用 `wsl.exe`**：带空格、引号、`$`、反斜杠、中文的参数和环境变量原样到达 Linux 程序，包括含 `Program Files (x86)` 的 PATH；`--list` 不带 `WSL_UTF8` 时是不带 BOM 的 UTF-16，解得出来；超时杀掉 `wsl.exe` 后 Linux 里不留进程；已经停掉的发行版，问它在不在跑不会把它启动。
- **登录环境**：`~/.bashrc` 里加进 PATH 的目录取得到，它往标准输出打的提示不碍事。
- **后端**：发版流程打出的包（3.1MB）装进发行版，daemon 和 core 在发行版自己的 Node 24 上启动，共 10 秒；从 Windows 调 `system.hello` 和 `system.environment` 有应答；再启动一次找到的是同一个 core；启动它的进程退出三分钟后，发行版和 core 都还在，应答如常。
- **转发程序**：经真的 `wsl.exe` 握手约 0.1 秒；3MB 从 Windows 到发行版再回来、1MB 反方向，内容一致；经它调 core 有应答；端点文件是 600，标准输入一关就退出并删掉文件。没有网络时字节照样过。
- **Node 22 不行**：core 一启动就缺 `node:zlib` 的 zstd，所以要 24。

运行器上没有桌面会话，「退出应用」是用启动它的进程退出来代替的；发行版里的用户是 root。

## 待验证

要真的 Windows 11 桌面和装好的应用才看得到的：

1. 应用本身：选发行版、重启、界面连上、开会话、跑一个 Agent。到现在跑过的是主进程用的模块，不是应用。
2. 退出应用、注销或睡眠后，发行版里的后端是否还在。
3. 镜像网络下是否一切照旧。运行器上开不了镜像网络（WSL 退成没有网络）。
4. 内置浏览器经转发程序用起来如何，截图这样的大消息有没有可感的延迟。
5. 文件预览和「用…打开」经 `\\wsl.localhost` 的表现：路径里有 Linux 的符号链接时预览读不读得到；各编辑器怎么打开这样的路径（VS Code 会提示改用 Remote - WSL 打开）。
6. Node 由 nvm 装、默认版本不是 24 时，提示是否说得清。

## 测试

各模块的单元测试用一个假的 `wsl.exe`。真的那个只有 Windows 上有：`wsl/wsl-smoke.ts` 打成一个文件后，在装了 WSL 2 的 Windows 上用 Node 跑。

```
node wsl-smoke.mjs <发行版> [--mutate] [--tunnel <backend-tunnel.mjs>]    # 调用 wsl.exe、登录环境、转发程序
node wsl-smoke.mjs <发行版> --backend <pack-linux-backend 的输出目录>    # 装上真的后端并从 Windows 调它
node wsl-smoke.mjs <发行版> --check-backend                            # 过几分钟，从另一个进程看它还在不在
```

GitHub 的 `windows-2025` 运行器上有 WSL 2，装上 Ubuntu 和 Node 就能跑这些；镜像网络和有桌面会话才有的行为仍要真机。
