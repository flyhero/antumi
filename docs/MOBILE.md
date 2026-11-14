# 手机端

> 状态：阶段一和阶段二已实现；原计划的阶段三（公共中转服务）不做，改为经用户自己服务器上的 Antumi 中转或 WireGuard（见「网络与发现」）。已在 GitHub Releases 发布正式签名的 APK（`mobile-v0.1.x`），见文末「实现状态与验证」。

手机端是 Antumi 的又一个客户端，用来离开电脑时跟进会话：看 Agent 在做什么、回答它的确认和提问、发一句话让它继续、必要时打断它。写代码、看 diff、管理 Git 和设置仍在电脑上做。

目前只有 Android 版，不上应用商店，在 GitHub Releases 提供 APK 下载；iOS 见「分发」。

不需要服务器：手机和电脑在同一个局域网，或者都连着用户自己的 Tailscale / ZeroTier 时可用；有自己的服务器时也可以经它转发（见「经自己服务器上的 Antumi 中转」和「经自己的服务器中转」）。App 关着时的提醒走 ntfy 这类推送地址（见「通知」）。不装这类工具、在外面直接连回电脑，不在范围内。

## 信任模型

先说清楚手机能做到什么程度，后面的设计都从这里来：

- **可操作的手机和电脑一样能驱动会话。** 能发消息，就能让 Agent 在会话的权限模式内做任何事；回答请求时也和电脑上一样，可以「本会话都允许」「始终允许」，执行计划时可以选「全部放行」，也能直接改会话的权限模式。参考项目的做法相同：t3code 的手机上有完整的权限模式选择（含 Full access），审批可以「本会话允许」；orca 原样转发 Agent 的「不再询问」并补一个「始终允许」；superset 直接把终端交给手机。
- **只读的手机只能看。** 配对时由用户在电脑上选「允许查看」还是「允许查看和操作」，确认框里写明后者等于把会话的控制权交给这台手机。之后可以在设备列表里随时改。
- 手机丢了的应对办法是在电脑上撤销这台设备，见「设备撤销」；App 也可以设成打开时验证指纹或面容。
- 白名单限制的是**手机上提供哪些功能**（不开终端、文件、Git、设置、凭据），不是安全边界：可操作的手机放宽权限后，Agent 本身就能读写文件、执行命令。

## 范围

| 有 | 不做 |
|---|---|
| 会话列表（等你、在跑、最近）、读聊天记录、加载更早的消息 | 终端、文件编辑、Git |
| 回答请求（全部选项）、回答问答卡 | 内置浏览器 |
| 发文字和图片、打断本轮、继续已停的会话 | 设置、账号、服务商、MCP、插件、来源凭据 |
| 改权限模式、模型和推理强度 | 删除会话、添加任意项目路径 |
| 在最近项目里新建会话（可选 worktree、权限模式、模型和推理强度） | 结束 Agent 进程、停后台工具 |
| 任务看板：在最近项目里新建任务、开始、接受或标记完成、取消 | 不经局域网、Tailscale 或中转服务器的远程连接；内置地址、对所有人开放的公共中转 |
| ntfy 推送、打开时验证指纹或面容、检查更新 | |

Agent、任务和会话仍在电脑上跑，手机断开不影响它们。电脑休眠或关机时手机只能显示离线。

## 总体结构

```
┌──────── 手机 App ────────┐
│  React Native（Expo）     │  packages/mobile
└────────────┬─────────────┘
             │ WebSocket + Noise 加密 + 分片（局域网 / Tailscale）
┌────────────▼─────────────┐
│  gateway  core 的子进程    │  core/src/gateway.ts、gateway-main.ts
│  监听、握手、加解密、限流     │
└────────────┬─────────────┘
             │ JSON-RPC over WebSocket（127.0.0.1 + token）
             │ 每台手机一个连接，system.hello 声明设备
┌────────────▼─────────────┐
│  core                    │  core/src/mobile-service.ts、rpc-server.ts
│  设备与配对的持久化、授权裁决 │
└──────────────────────────┘
```

分工：**core 持久化设备、裁决每个请求能不能做；gateway 只管网络和加密。** 两边共用的数据结构在 `protocol/src/mobile.ts`（只依赖 zod，进主入口），Noise、分片和手机端的连接器在 `@antumi/protocol/mobile` 子入口（桌面端不加载）。

### 为什么网关是独立进程

- core 只监听 `127.0.0.1` 这条规则不变，对外的端口由网关持有。用户关掉「允许手机连接」，端口随网关进程一起消失。
- 网关解析的是来自网络的不可信数据，放在单独进程里，它出问题崩溃不会带走 core。

要说清楚的是，**这不是权限隔离**：网关和 core 以同一个系统用户运行，拿着完整的 token。网关代码一旦被攻破，就等于 core 被攻破。所以网关保持最小：不执行命令、不读写项目文件，只做转发。

用户打开开关后，core 用 `fork` 启动网关（从源码走 tsx，打包后是和 `core.mjs` 放在一起的 `gateway.mjs`，在 Electron 里加 `ELECTRON_RUN_AS_NODE`）：

- 网关的设置、设备列表、配对码都从 core 经 IPC 发来（`gateway-ipc.ts`），它自己不读数据库。IPC 断了（core 退出或崩溃）就立即退出，不留孤儿进程。
- 网关异常退出时 core 按退避重启（1、5、30 秒，之后每分钟）；端口被占用时不重试，设置页提示换端口。
- 关闭开关或改端口时 core 结束网关（SIGTERM），改端口后重新启动。

### 授权在 core 里做

网关为每台手机单开一个到 core 的本地连接，在 `system.hello` 里多带一个参数 `client: { kind: 'mobile', deviceId }`。core 查到这台设备后把连接标成手机连接（`Connection.mobile`），此后：

- `rpc-server.ts` 在任何处理函数之前按 `MOBILE_METHODS`（`protocol/src/mobile-access.ts`）和设备的权限检查方法，不通过就以 `mobile-not-allowed` 拒绝。
- 通知只发 `MOBILE_NOTIFICATIONS` 里的那些。
- 设备的权限改了，正在连着的连接立即按新权限检查；设备被撤销时，core 立即关闭它的所有连接。

连接是按设备分开的，所以 `watchChat` 这类按连接记录的状态和桌面端完全一样。

## 网络与发现

- 网关监听所有网卡（`::`，不支持 IPv6 时退回 `0.0.0.0`）上的固定端口（默认 7820，可改），只接受私有地址来的连接。没有做「选择网卡」的设置：监听全部、靠地址过滤，电脑换网络时不用重新配置。
- 来源地址过滤只是减少暴露面的辅助手段，身份只认配对密钥：
  - 只接受私有地址：`10/8`、`172.16/12`、`192.168/16`、`100.64/10`、`127/8`、链路本地、IPv6 ULA；IPv4 映射的 IPv6 地址先还原再判断。
  - `100.64/10` 不等于「用户自己的 Tailscale」，经过 SNAT 或子网路由时看到的也可能是网关地址，所以按来源地址限速（每分钟 10 次失败就暂时拒绝）只防暴力尝试，不当作身份。
  - 不读取任何转发头。
- 二维码里带电脑当前的私有 IPv4 地址（Wi‑Fi / 以太网在前），以及 Tailscale 的 MagicDNS 名（`tailscale status --json`），再加上中转地址和用户填的「其他地址」。
- **其他地址**：设置 → 手机 里填的 IP 或域名（不带端口，最多 8 个，`MobileExtraHost`），用于电脑在自己网卡上看不到、由别的隧道或端口转发交到这台电脑端口的地址。
  - 和中转地址一起排在本机地址之后，放进二维码和每次的欢迎消息；地址总数上限 16，总给它们留位置。
  - 经本机转发进来的连接来源是 `127.0.0.1`，能过地址过滤，失败限速也按它合在一起算；身份照样只认配对密钥。
  - 手机把欢迎消息里的地址并进自己的列表，所以删掉的地址还会在手机上留一阵，连不上时不影响别的地址。
- **手机同时试多个地址**（`protocol/src/mobile/connector.ts` 的 `firstOpen`）：每个地址先单独试 300 毫秒，还没连上就让下一个一起试；连接失败的立刻让位给下一个。哪个 WebSocket 先打开就用哪个，其余的关掉，握手只在它上面做，所以网关不会看到同一部手机的两次握手。在外面时局域网地址连不上，不用每个都等满 5 秒。
- **没有做 mDNS。** 新版 React Native 只支持新架构，现有的 mDNS 原生库不确定能用，又没法真机验证，所以改为：每次连上时网关在欢迎消息里带上电脑当前的地址，手机更新自己保存的地址列表。只要有一个地址还连得上（MagicDNS 名一般一直能用），之后换了 IP 也能找到；全都连不上时重新扫码，同一部手机重新配对会沿用原来的设备 ID。
- 电脑休眠会断线。手机显示「电脑离线，上次在线 …」，提示可以在电脑上打开保持唤醒（已有的 `system.setAwakeMode`）。

### 经自己服务器上的 Antumi 中转

设置 → 手机 → 连接方式 里的「自己的服务器（Antumi 中转）」：用户在自己的 Linux 服务器上装一个 Antumi 中转（bridge），电脑的网关主动连过去，手机经它连回电脑。手机上不用装别的，走 TCP，不占手机的 VPN。中转只按消息转发手机连接里的 Noise 密文，没有任何一方的密钥，读不了也改不了内容，冒充不了电脑（手机核对配对时记下的公钥）。作者的中转按邀请共用：设置页给出作者的微信，地址在微信里给，不写进 App，这样人数、带宽和滥用都控制在作者手里；它只是一台普通的 Antumi 中转，没有别的机制。

- **连接**（`core/src/bridge-protocol.ts`）：网关对 `/v1/computer/<id>` 保持一条控制连接；手机连 `/v1/phone/<id>`，中转在控制连接上告诉网关 `incoming` 和一个流编号，网关再开 `/v1/accept/<id>/<流>`，中转把两条连接按消息原样对接，文本和二进制都保留。网关拿到的这条连接和端口上来的手机连接一样走握手（`gateway.ts` 的 `admit`），只是不查来源地址，失败限速按 `bridge:<手机地址>` 分开算。
- **身份**：中转 ID（16 字节随机数）只出现在二维码和欢迎消息里；电脑另有 32 字节的密钥，只留在电脑上（`<home>/mobile/bridge.json`，0600）。中转第一次见到某个 ID 时记下密钥的 SHA-256，之后别的密钥一律拒绝，所以知道 ID 的人（比如被撤销的手机）也冒充不了电脑。半年没出现的 ID 会被中转忘掉。
- **手机怎么找到它**：二维码和欢迎消息新增 `bridges`（完整的 `ws://` 地址），手机把它排在局域网地址后面一起试；欢迎消息带了 `bridges` 就以它为准，电脑停用中转后手机不再留着旧地址。电脑不在线时中转在 WebSocket 升级前就回 404，手机马上换下一个地址。
- **中转本身**（`bridge-server.ts`、`bridge-server-main.ts`）：Node 14 以上能跑，打包成一个不依赖 zod 和 protocol 的文件（约 55KB），压缩后放进安装脚本（`bridge-install.ts`），服务器上除了 Node.js 不用下载别的；systemd 用临时用户运行。上限：每台电脑 8 条同时的手机连接、手机等电脑接手 10 秒、等待期间最多 8 条消息、每个来源每分钟 60 次连接、单条消息 70KB；接收方积压超过 1MB 时暂停发送方。
- **速度**：两端都是系统自己的 TCP，不受 wireproxy 突发丢包的影响。在 3Mbps 的服务器上实测，2MB 图片上传 5 到 7 秒、下载约 7 秒，不用整形。
- 安装脚本只在服务器没有 Node.js 时安装它；已有的 Node 不替换，低于 14 时停下来说明。

### 经自己的服务器中转

设置 → 手机 → 连接方式 里的「自己的服务器（WireGuard）」：用户自己的 Linux 服务器跑 WireGuard，在手机和电脑之间转发。电脑上不装 VPN、不要管理员权限；内容照旧是 Noise 端到端加密，服务器只经手密文，也冒充不了电脑（手机核对配对时记下的公钥）。

- **密钥**：填好服务器地址后，core 生成服务器、电脑、手机三对 WireGuard 密钥（X25519，Node 的 `crypto`），存进 `<home>/mobile/relay.json`（0600）。换服务器时密钥不变；停用时删除。
- **服务器**：设置页复制的脚本（`relay-config.ts` 的 `relayServerScript`）装 `wireguard-tools`，写 `/etc/wireguard/wg-antumi.conf`，打开 `ip_forward`，用 iptables 放行隧道内的转发，systemd 开机启动，开着 firewalld 或 ufw 时一并放行。脚本里只有服务器自己的私钥和另外两方的公钥；可以重复执行。
- **带宽整形**：用户填了服务器带宽时，隧道接口上加 htb + fq_codel，按带宽的 93% 匀速发出。云服务器的限速遇到超出的突发会成片丢包，而 wireproxy 的用户态 TCP 发送是一阵一阵的：在 3Mbps 的服务器上实测，电脑发往手机不整形只有约 35 KB/s，整形后约 315 KB/s；服务器自己的 TCP 不受影响，不整形也能跑满。
- **电脑**：手机访问打开时，core 运行 [wireproxy](https://github.com/windtf/wireproxy)（用户态的 WireGuard，不建网卡），和网关一样是 core 的子进程，意外退出后按退避重启（`mobile-relay.ts`）。它的 `TCPServerTunnel` 把隧道里发往 `10.77.0.2:<网关端口>` 的连接交给 `127.0.0.1:<网关端口>`。
  - wireproxy 不打包进安装包：第一次用时从 GitHub 下载固定版本（v1.1.3），压缩包的 SHA-256 必须和代码里记下的一致，解出的程序放进 `<home>/mobile/bin`（`wireproxy.ts`）。没有对应构建的系统显示不支持。
  - 状态来自 wireproxy 的健康端点（`-i`）里最近一次握手的时间：3 分钟内握过手算已连上（有 keepalive 时 WireGuard 每两分钟重新握手）。
- **手机**：用官方 WireGuard App 扫设置页上的配置码导入隧道。`AllowedIPs` 只有 `10.77.0.0/24`，可以一直开着；两端 MTU 都是 1280，照顾移动网络和 PPPoE。
- 服务器脚本和手机配置都带私钥，只经 `mobile.relaySetup` 交给桌面端，不放进 `mobile.status` 和 `mobile.changed`。
- 中转地址 `10.77.0.2` 自动加进手机要试的地址；手机在 App 里不用改，旧版 App 也能用，只是在外面时要先等局域网地址超时。

## 配对与加密

不用 TLS 证书：局域网 IP 拿不到受信任的证书，自签证书在手机上做证书固定又很麻烦。改为在 WebSocket 之上用 Noise 协议做双向认证和加密。

- **首次配对**：`Noise_XXpsk3_25519_ChaChaPoly_BLAKE2s`，配对码作为预共享密钥。
- **之后的连接**：`Noise_XX_25519_ChaChaPoly_BLAKE2s`，手机要求电脑的公钥和配对时记下的一致，网关要求手机的公钥在已配对设备里。
- 连接的第一条消息是明文的开场（版本、模式、配对 ID），它整体作为 prologue 绑进握手，改动了握手就失败，防止降级。
- 每次连接都重新握手，传输密钥不跨连接复用；认证失败或 nonce 用尽立即关闭连接。
- 实现（`protocol/src/mobile/noise.ts`）只做这两个模式需要的部分，底层用 noble 的 X25519、ChaCha20-Poly1305、BLAKE2s（经过审计、纯 JS，core 和 React Native 用同一份代码），并用 cacophony 的官方测试向量校验。没有找到能在 React Native 里直接用的现成 Noise 库，这是和「用成熟实现、不自己拼」的原计划不同的地方。

### 配对的状态

```
未配对 ──扫码握手成功──▶ 待确认 ──电脑上允许──▶ 已授权（只读 / 可操作）
                           │
                           └──拒绝 / 2 分钟超时 / 取消 / 换码 / 网关重启──▶ 已拒绝
```

1. 电脑在 设置 → 手机 里点「添加手机」，core 生成一次性配对码（32 字节随机数，5 分钟有效），显示二维码：地址、端口、电脑长期公钥、配对 ID 和配对码、协议版本。扫不了码时可以复制配对链接，在手机上点开（`antumi://pair?…`，App 注册了这个链接）或粘贴进去。
2. 手机生成自己的长期密钥对，用配对码做 `XXpsk3` 握手。握手里收到的电脑公钥必须等于二维码里的，否则中止。配对码不对时握手在最后一步失败，码保留给持有正确码的手机。
3. 握手成功的那一刻，网关和 core 都把配对码标为已用：同一个码只有第一个成功的握手有效，之后无论结果如何都不能再用。
4. 进入「待确认」：这个连接上只走配对状态消息，不转发任何 RPC。手机上显示一个 6 位确认码，由握手摘要（handshake hash）算出。
5. 电脑上出现确认框：设备名（仅供显示，不作为身份）、同一个 6 位确认码、「允许查看」「允许查看和操作」「拒绝」。确认结果绑定的是这次握手和手机公钥。
6. 允许后记入已配对设备，这个连接直接升级为已授权。

没有桌面端、core 跑在服务器上时，原计划用命令行配对（`antumi mobile pair`）。**这一项没有做**：现在的仓库没有面向用户的命令行入口；任何拿着 token 的 core 客户端都可以调 `mobile.*` 方法完成配对。

### 密钥和设备存放

- 已配对设备存进 core 数据库的 `mobile_devices` 表：设备 ID（由公钥算出，不接受手机自报）、显示名、平台、公钥、权限、配对时间、最后在线时间。开关、端口和推送地址存在 `mobile_settings` 表。
- 电脑的长期私钥存在 `~/.antumi/mobile/key.json`，权限 0600，和 `core.json` 同等对待。
- 手机的长期私钥和配对过的电脑存在系统安全存储里（`expo-secure-store`，Android Keystore / iOS 钥匙串，`WHEN_UNLOCKED_THIS_DEVICE_ONLY`），不随备份迁移到新手机，换手机就重新配对。

### 设备撤销

- 撤销后，core 立即关闭这台设备的所有连接，网关也断开它，此后它的握手都失败。
- 撤销**不会**撤回已经发出的消息，也不会停止正在跑的 Agent：要停就在电脑上停。
- 撤销没法擦除离线手机上的缓存；手机下次连上被拒时自己清掉。设置页的撤销确认里写明了这两点。

## 传输

Noise 的一条传输消息最多 65535 字节，而一个附件块是 512 KiB（Base64 后更大），一页聊天记录也可能很大，所以在 Noise 之上加了一层分片（`protocol/src/mobile/link.ts`）：

- 每条 RPC 帧切成不超过 60 KiB 的加密分片，每片带 1 字节结束标记和 32 位递增序号；一条帧的分片连续发送，所以不需要消息 ID。乱序、重放、伪造的分片都让连接关闭。
- 单条帧重组上限 8 MiB，一条帧 30 秒内收不齐就断开。
- 每台设备最多 2 个并发连接（第三个连上时关掉最早的）、16 个未完成请求（超出的直接回 `mobile-busy`）；全局最多 8 台设备同时在线。
- 网关按 WebSocket 的发送缓冲做背压：手机读得慢、缓冲超过 4 MiB 时暂停从 core 读取，而不是无限堆积。

聊天记录一页原本就是一整个阶段（stage），没有条目数上限。`watchChat` / `chatItems` 加了可选的 `limit`（手机用 200）：整段放不下的旧阶段留到下一页；最旧那个阶段被截断时结果带 `truncated`，它前面被截掉的部分没法再往前翻到，手机提示「更早的内容较长，请在电脑上查看」。这是分页游标以阶段为单位决定的。

## 手机能调用什么

| 用途 | 方法 / 通知 | 可操作 | 只读 |
|---|---|---|---|
| 读会话 | `conversations.list` `get` `watchChat` `unwatchChat` `chatItems` `messages` `search` `chatCatalog` `configuration` | ✓ | ✓ |
| 读其他 | `attachments.stat` `read`、`tasks.list`、`usage.list`、`projects.recent`、`system.environment` | ✓ | ✓ |
| 回答请求 | `conversations.respond`（全部参数，和电脑上一样） | ✓ | |
| 发消息 | `conversations.send` `cancelQueued` `sendQueued` `retryTurn`、`attachments.begin` `append` `commit` | ✓ | |
| 会话控制 | `conversations.interrupt`（结束本轮）、`continue`、`setOption`、`create`（只能用最近项目）、`projects.branches`（同样只限最近项目） | ✓ | |
| 任务 | `tasks.create`（只能用最近项目）、`start`、`move`（只到完成）、`cancel` | ✓ | |
| 通知 | `conversations.changed` `deleted` `chatItems` `chatDelta`、`tasks.changed` `deleted`、`usage.changed` | ✓ | ✓ |

说明：

- 回答请求的选项照着请求里给出的画（`choices`，没有时按 `decisions`），执行计划时可以选它给出的权限模式（`runModes`）。问答卡按电脑上的方式回答（`allow` 加 `answers`）。
- 手机新建会话时，core 检查每个项目路径都在 `projects.recent()` 里，并且不能带 `helperOf` 和 `profileId`，否则以 `mobile-project-not-recent` 拒绝。`projects.branches` 也只答最近项目，手机用它判断项目是不是 Git 仓库，不是就不提供 worktree（和桌面端一样）；电脑答不了时照旧提供。
- 新建会话页的模型和推理强度来自 `conversations.chatCatalog`，能选的权限模式和默认模式用 protocol 的 `startModes`、`defaultStartMode`，和电脑上的新会话一样；没选的模型和推理强度不传，由 Agent 用自己的默认。项目放在弹出的列表里选，最近项目再多也不会把发送按钮挤到下面。
- 「停下」按钮对应 `interrupt`，只结束本轮。
- 手机新建任务同样只能用最近项目，也不能带 `squadId`（小队连同它用的 Agent 配置都在电脑上设）。开始任务和电脑上从任务详情点开始一样：用任务保存的权限模式，没有就是规划，依赖的任务还没验收时也是规划（`mobile/src/task-start.ts`）；按钮文字也一样（开始规划、开始分析、直接执行）。开始后直接打开任务的会话，规划结果作为确认请求出现在那里。手动改状态只有到完成这一种（`manualMoves`），取消对应 `tasks.cancel`，重新打开、重做、删除留在电脑上。
- 手机不调 `system.hello`：网关替它做，握手后把服务端版本、能力列表、电脑的主目录和当前地址放进欢迎消息。

测试里检查了白名单里每个方法和通知都真实存在，只读设备调写方法被拒绝，名单外的方法和通知到不了手机（`mobile-access.test.ts`、`mobile-link.test.ts`）。

## 断线恢复与冲突

不做断点续传，**重连就全量刷新**：

- 重连后重新拉会话列表和任务，对正在看的会话重新 `watchChat` 拿权威快照。离线时缓存的会话和请求卡片照常显示，但回答、发送都会提示离线。
- 合并聊天条目用 `(stageId, itemId)`，`replaceStage` 时整段替换；这部分从桌面端 `chat-state.ts` 抽到了 `protocol/src/chat-merge.ts`，两端共用。
- `send` 带 `ref`，重试时不会重复发。其他写操作在断线中结果不明时不自动重发。
- 上传中的图片绑定在连接上，断线后要重新上传。
- 重连按 1、2、5、10、30 秒退避，只在 App 处于前台时进行；回到前台立即重连。

多个设备回答同一个请求时，core 是最终裁决者：第一份有效回答生效，后到的收到 `chat-request-gone`，手机提示「这个请求已在其他设备处理」并重新拉取这段聊天。各种 Agent 下的并发回答还没有逐一验证。

## 版本兼容

手机 App 的旧版本会长时间存在，所以手机和网关之间有单独的 `MOBILE_PROTOCOL_VERSION`（现在是 1），只加可选字段，破坏性改动才升版本；配对码和开场消息都带这个版本。

- 网关作为 core 的客户端照常用 `PROTOCOL_VERSION`，它和 core 总是同一个版本一起发布。
- 手机端用的是 `@antumi/protocol/mobile` 的 `connectMobile`（握手、分片、欢迎消息），复用 `createRpcClient` 和 schema，不用桌面端的 `connectRpc`。
- `ChatItemList` 会丢弃不认识的聊天条目，所以 `connectMobile` 在解析之前把它们换成一条提示（「这条内容请在电脑上查看」），新版 core 多了一种条目时，旧手机上那段对话不会无声地少一块。

## 手机 App

- React Native 0.88 + Expo 58（和桌面端同为 React 19.3.0），复用 `packages/protocol` 的 schema、聊天合并和提醒规则。桌面端的界面组件依赖 DOM，手机界面另写。
- Noise 是纯 JS，不需要原生模块；相机、安全存储、指纹、选图用 Expo 的模块。因为用了 `expo-build-properties` 等配置插件，要用 development build（`expo prebuild` / `expo run:android`），不能用 Expo Go。
- Hermes 可能缺的 `crypto.getRandomValues` 和 `TextDecoder` 由 `src/polyfills.ts` 补上（UTF-8 解码器有对照测试）。Noise 的 nonce 计数用普通数字而不是 BigInt 的 `DataView` 方法，避免依赖 Hermes 对它们的支持。
- 页面：电脑列表 → 扫码配对 → 会话列表（等你、在跑、最近）→ 聊天页（消息、折叠的工具调用和思考、请求卡片、图片、选项）；另有新建会话、任务看板（任务详情、新建任务）、设置。
- 聊天页照电脑上的样子显示消息流：工具调用用电脑上的名字（命令、编辑、MCP 服务 · 工具、Antumi 自己的工具），连续的几次调用合成一行（「读取 3 个文件，运行 2 个命令」），改了文件的调用显示 +/− 和 diff，子 Agent 显示类型、用量、指令和结果，命令显示非零退出码和后台状态；用户消息里的引用显示成卡片，移交和切换分支的附注去掉；上下文压缩显示成分隔线，可重试的通知带重试按钮，额度用完说明何时恢复，每个回合结束显示用时和 tokens。这些判断和电脑共用 protocol 里的 `tool-calls.ts`、`chat-quotes.ts`、`delegation-delivery.ts`，文字在手机端自己的 `tool-labels.ts`、`chat-text.ts`。
- 最近打开的 5 个会话（各最近 100 条）缓存在 App 沙盒，离线时可以翻看；取消配对或被撤销时清掉。
- 聊天页没发出的文字和已上传的图片按会话留在内存里，离开再回来还在；App 被系统结束、换一台电脑、取消配对时清掉。图片在电脑上已经存好，草稿只记它的 ID。
- 外观是手机自己的一套，不跟 `DESIGN.md`：令牌（颜色、圆角、间距、字号，分浅色和深色）都在 `src/theme.ts`，基础组件（`Screen`、`ListGroup`、`ListRow`、`Button`、`IconButton`、`AgentAvatar`）在 `src/components/ui.tsx`，新页面从这里取。做法参照 t3code、orca 等项目的手机端：大标题、圆角分组列表、右侧气泡的用户消息、工具调用压成一行、等确认的请求固定在输入框上方。
- 图标用 `lucide-react-native`，Agent 的标志从桌面端的图标转成 `src/components/agent-mark.tsx`；Markdown 用 `marked` 分词后画成原生文字（`src/components/markdown.tsx`），不用 WebView。
- 键盘：Android 15 起应用全屏绘制，系统不再为键盘缩小窗口，React Native 自带的 `KeyboardAvoidingView` 算不准。所以用 `react-native-keyboard-controller`：表单页用 `KeyboardAwareScrollView`，聊天页用它的 `KeyboardAvoidingView`。
- 界面文字有中文和英文，按手机语言选择。

### 平台限制

- **Android**：`app.json` 里用 `expo-build-properties` 打开了 `usesCleartextTraffic`，允许明文 `ws://`（内容已在应用层加密）；它作用于整个 App，而不只是局域网地址。较新的系统版本对访问局域网增加了运行时权限，要按目标 SDK 的官方说明核实。
- **iOS**（做 iOS 版时才涉及）：`app.json` 已写好本地网络、相机、面容的用途说明；还要处理 ATS 对明文 `ws://` 的限制。进入后台后连接能维持多久由系统决定，回到前台一律重新同步。
- 真机验证清单：拒绝和恢复本地网络授权、Wi‑Fi 与蜂窝切换、和其他 VPN 同时开着、电脑换 IP、电脑休眠唤醒。

## 代码组织

- 手机端在 `packages/mobile`，是 pnpm workspace 的正式成员。根目录的 `pnpm typecheck` 包含它；`pnpm test` 跑它不依赖 React Native 的纯逻辑测试。
- 它直接依赖 `@antumi/protocol`（主入口和 `/mobile` 子入口），不引用 `/node`。加一个手机要用的接口，在同一个提交里改 protocol、core 和手机端，并把方法加进 `MOBILE_METHODS`。
- 用 Metro 打 JS 包（`expo export --platform android`）在 pnpm 的结构下能直接通过，不需要额外的 `metro.config.js`。
- 打 APK 不进日常验证，见 `docs/RELEASING.md` 的「Android 手机端」。
- 安装体积：React Native 和 Expo 让 `pnpm install` 多装几百 MB。如果拖慢了桌面端的开发，改成 orca 的做法（`packages/mobile` 自己的 workspace 和 lockfile），并在根目录的 `typecheck` 里显式加上手机端。

## 分发

不上应用商店。

**Android：GitHub Releases 提供 APK**
- 本地用 Gradle 打签名的 APK（没有用 EAS Build），标签 `mobile-vX.Y.Z`，步骤见 `docs/RELEASING.md`。
- 签名密钥只有一把，离线备份，永远不换：换了密钥，已安装的用户只能卸载重装，本地缓存和配对都会丢。
- 每种架构一个 APK（`arm64-v8a`、`armeabi-v7a`），每部手机只下载自己那一份。App 的「检查更新」读 GitHub Releases，找到更新的 `mobile-v*` 版本后，按手机支持的架构（`Device.supportedCpuArchitectures`，手机最合适的排在前面）挑对应的 APK（`src/release-apk.ts`），用浏览器打开下载链接，由系统完成安装。没有做 App 内直接下载安装（要额外的安装权限和 FileProvider），也没有接 EAS Update（要 Expo 账号和项目配置）。
- 安装说明要配图：允许「安装未知来源应用」，以及小米、华为、OPPO 等系统和 Play Protect 的风险提示怎么处理。
- Google 宣布过要求商店外安装的应用也来自经过身份验证的开发者，分地区逐步执行。发布前要确认当时的政策，必要时注册开发者身份（不需要上架）。

**iOS：暂不提供**

苹果不允许安装任意安装包。不上架时唯一面向普通用户的办法是 TestFlight 公开链接，需要苹果开发者账号（每年 99 美元）和测试版审核，目前没有账号。以后两条路：

- **网页版**：网关顺带提供一个网页客户端。局域网 IP 拿不到正式证书，非 HTTPS 页面不能调用摄像头扫码、不能收 Web 推送，所以配对改为粘贴配对链接；配合 Tailscale Serve 时有正式 HTTPS。网页版走同一个网关、同一套授权。**还没有做。**
- **注册开发者账号后**：用同一份 React Native 代码打 iOS 包，走 TestFlight。

## 通知

- App 处于前台时，会话列表和聊天页实时更新。App 关着时收不到，除非设置了推送地址。
- 「该提醒什么」的规则抽成了 `protocol/src/conversation-alerts.ts` 的 `conversationAlert`（等你确认、本轮结束、本轮结束并留了问题、Agent 意外退出），桌面端的 `noticesBetween` 改为调用它，文案由各端自己写。例程、额度等提醒仍在桌面端。
- 推送由 core 的 `MobileService` 判断，而不是原计划的网关：core 本来就一直在线、本来就收到每次会话变化，放在网关里还得多开一个订阅连接。core 启动时先把已经在等的请求补发一次，按「会话 + 提醒种类 + 请求 ID」去重，同一条 30 秒内不重复。
- 推送地址填 ntfy 主题地址（设置 → 手机 → 推送），core 用 HTTP POST 发一句话（如「有会话在等你确认或回答」），不带会话标题、代码或对话内容：公共 ntfy 服务器看得到推送的内容。Bark 等其他服务只要接受同样的 POST 也能用，没有单独适配。

## 分阶段

**阶段一（已完成）**：core 的设备表、按连接授权、`mobile.*` 方法和 `mobile.changed` 通知、网关子进程；网关的监听、地址过滤、Noise 握手、配对状态机、分片与限流；桌面端的 设置 → 手机；Android App 的配对、会话列表、聊天、回答请求、发文字、打断和继续、重连、检查更新；文档和发布流程。

**阶段二（已完成）**：发图片、在最近项目里新建会话、改权限模式、模型和推理强度、只读任务看板、会话提醒规则移到 protocol、ntfy 推送、打开时验证指纹或面容。mDNS 改为由欢迎消息更新地址（见「网络与发现」）。

**阶段三（不做）**：原计划的中转服务和 APNs / FCM 推送取消。

## 安全清单

- core 仍只监听 `127.0.0.1`；对外端口只有网关，只接受私有地址，但身份只认配对密钥。
- 网关是可信代码，被攻破等于 core 被攻破；它保持最小，不执行命令、不碰文件。
- 未配对的连接拿不到任何数据；配对码一次性、5 分钟过期；待确认期间不转发 RPC；电脑上核对 6 位确认码后才授权。
- 内容端到端加密，每次连接重新握手，开场消息作为 prologue 绑定版本和模式。
- 授权在 core 里按设备执行：只读 / 可操作两档，方法和通知白名单，新 RPC 默认不开放。
- 可操作的手机和电脑一样能驱动会话、放宽权限，这是设计如此，和参考项目一致；配对确认框里写明，用户不放心就选「允许查看」。
- 撤销立即断开该设备所有连接，但不撤回已发的消息、不擦除离线缓存。
- 分片重组、并发连接、未完成请求都有上限，按设备计算；握手失败按来源地址限速。
- Antumi 中转不被信任：它只转发 Noise 密文，没有任何密钥；电脑靠只留在本机的密钥向它证明身份，中转首次见到 ID 时记下密钥的哈希。
- 经服务器中转时服务器不被信任：它只转发 Noise 密文；中转密钥存为 0600，服务器脚本里没有电脑和手机的私钥；下载的 wireproxy 先核对固定的 SHA-256。

## 实现状态与验证

已经验证的：

- Noise 实现与 cacophony 的 `Noise_XX_25519_ChaChaPoly_BLAKE2s`、`Noise_XXpsk3_25519_ChaChaPoly_BLAKE2s` 测试向量一致。
- 进程内的端到端测试（`core/src/mobile-link.test.ts`）：真实的 RPC 服务、网关和手机连接器，覆盖配对与确认码一致、授权先于处理函数、通知过滤、超过一条 Noise 消息的大帧、重连、不应答的地址不拖慢连接、拒绝未知设备和冒充的电脑、配对码错误时不消耗、拒绝配对、撤销。
- 用临时 `ANTUMI_HOME` 起真实的 daemon 和 core，经 RPC 打开手机访问，core fork 出网关子进程，Node 写的「手机」经局域网地址完成配对、调用 RPC、被拒绝写操作、被撤销。
- 打包后的 `gateway.mjs` 能作为子进程启动监听，IPC 断开即退出。
- 手机端通过 TypeScript 类型检查，`expo export --platform android` 能打出 Hermes 字节码包。

- Android 模拟器（API 36.1，arm64）上的 release 包，连临时 `ANTUMI_HOME` 的真实 core 和 Claude Code：配对链接打开 App 并完成配对、两边确认码一致、会话列表（等你 / 在跑 / 最近）、聊天页实时更新、在手机上批准写文件（Agent 真的写出了文件）、发文字、发图片（Agent 看到了图）、改权限模式（core 里生效）、在最近项目里新建会话、检查更新、core 退出后显示离线并在它回来后自动重连、撤销后显示被撤销并清掉缓存、同一部手机重新配对沿用原来的设备 ID、中文和英文界面、深色模式。
- 桌面端的 设置 → 手机 页面：截图核对了开关、状态、二维码、确认框和设备列表。

还没有验证的：

- **没在真机上跑过**：相机扫码（模拟器没有可用的相机画面）、指纹 / 面容、真实局域网和 Tailscale、App 退到后台再回来。
- 各种 Agent 下多设备并发回答同一个请求的行为。
