# Antumi user guide

Look up configuration and features here when you need them. On first use, the pet checks whether an agent is installed and usable, then asks whether to configure task sources. To check again, open **Help → Check your setup** at the bottom left.

## Agent installation and sign-in

Open [**Settings → External agents**](antumi:settings/agents) to check installation, enabled state and readiness. Agents can use their own account or a compatible model provider; the setup check shows what your agent needs.

![Settings → External agents: agents installed and signed in show Ready](assets/guide/agents-ready.en.png)

- To use the agent's own account: run the sign-in command on that row in a terminal, then click **Scan again**.
- Listed under **Available to install** (click to open it): click **Install in terminal**, or run the install command yourself, then click **Scan again**.
- To use a model provider: configure a compatible provider as described below. If it is already configured in the agent itself, follow the setup check's confirmation prompt.

## Model providers

**Skip this when the agent uses its own account.** Add one for a coding plan such as Volcengine Ark, Zhipu GLM or Kimi, or to let OpenCode, Pi or DeepSeek Harness answer.

![Settings → Model providers → Add provider: pick a plan, paste the API key](assets/guide/provider.en.png)

In [**Settings → Model providers**](antumi:settings/model-providers), click **Add provider**: pick a plan, paste the API key, tick the agents that use it, and click **Save and test**. A ✓ on every line means it works. Cursor cannot use a provider.

Pick it in the **Provider** control of the input box when starting a conversation. It bills the provider's plan, not the agent's quota, and cannot be changed once the conversation has started.

**A local proxy (CLIProxyAPI and the like)**: pick **CLIProxyAPI**; its addresses are filled in for the default port 8317. Use one of the keys under `access.api-keys` in its config, then click **Fetch models from the endpoints**. For another proxy pick **Custom**: Claude Code needs the Anthropic endpoint, Codex the Responses endpoint, and OpenCode takes any. Where the endpoint does not say how large a model is, enter its real limits in the **Context** and **Max output** columns of the model table; tick **Images** for a model that reads them.

Using Claude, Gemini or other subscription accounts through a proxy may break their terms and get them banned, more so when left running unattended or with several conversations at once. CLIProxyAPI keeps Antumi's own small requests, such as titles and translations, off it by default (**Titles, translations and commit messages**); if the proxy tells clients apart by their headers, set them under **Extra request headers**.

## Multiple accounts

**Optional,** for Claude Code and Codex only.

![Settings → Accounts: switching when an account runs out, and adding one](assets/guide/accounts.en.png)

In [**Settings → Accounts**](antumi:settings/accounts), click **Add Claude Code account** (or Codex), then **Add and sign in**, finish in the terminal below and click **Make active**. When an account runs out, the conversation moves on to the next one by default.

## Task sources

**Optional,** to import tasks from GitHub, Jira, Linear or ZenTao.

![Settings → Plugins → Recommended plugins](assets/guide/plugins.en.png)

1. In [**Settings → Plugins**](antumi:settings/plugins), click **Install plugin**.
2. Open **Settings → Integrations → the source's name**, fill in the site and filters, click **Sign in** with your token, and turn on **Sync to inbox**.
3. In **Inbox** in the sidebar, click **Sync now**, then **Import task** on an issue.

| Source | What you need |
|---|---|
| GitHub | Personal access token and a search query (add `label:bug` for bugs only) |
| Jira | Site, sign-in email, API token and JQL |
| Linear | Personal API key |
| ZenTao | RESTful API v1 URL (such as `https://zentao.company.com/zentao/api.php/v1`), token and product ID |

For a platform outside the recommendations, use **Install from another source** with a GitHub repository or a local ZIP. To write your own, see the [plugin development guide](https://github.com/flyhero/antumi/blob/main/docs/PLUGINS.md).

## On your phone

**Optional,** Android only for now. Away from the computer, read conversations, answer requests and send messages to keep agents going. Agents still run on the computer; a phone disconnecting does not stop them.

1. Download `Antumi-…-android-arm64-v8a.apk` from [GitHub Releases](https://github.com/flyhero/antumi/releases) and install it; nearly every phone takes this one. If a very old 32-bit phone will not install it, get `Antumi-…-android-armeabi-v7a.apk` instead. The first time, allow installing apps from unknown sources; if the phone warns you, check the source and continue.
2. In [**Settings → Phone**](antumi:settings/mobile), turn on **Allow phones to connect** and click **Add a phone**.
3. On the phone, tap **Add a computer** and scan the code on the computer. If you cannot scan it, click **Copy pairing link** on the computer, send the link to your phone, and tap it or paste it into the app.
4. Check that the phone and the computer show the same 6-digit code, then choose on the computer:
   - **View only**: read conversations and tasks;
   - **View and operate**: send messages and images, answer requests, start conversations and widen permissions. This hands the phone control of your conversations.

The phone and the computer need to be on the same Wi‑Fi, with the computer on and awake (click the coffee cup in the status bar to turn on **Keep awake**). If you lose the phone, click **Revoke** in the device list under **Settings → Phone**; in the phone app's **Settings** you can also ask for fingerprint or face when it opens.

### Away from home: Tailscale

Off your Wi‑Fi, the phone reaches the computer through [Tailscale](https://tailscale.com). No Antumi server is involved; Tailscale just puts both devices on one private network.

1. Install Tailscale on the computer and the phone and sign in with the same account.
2. In **Settings → Phone** on the computer, look at the addresses phones try: a name ending in `.ts.net` means Antumi found Tailscale.
3. Pair as usual. A phone paired before does not need to scan again: it picks up the name the next time it connects.
4. Keep Tailscale on on the phone when you are out. The phone tries the local addresses first and soon moves on to Tailscale.

If it cannot connect, check that Tailscale and Antumi are both running on the computer, that MagicDNS is on (the default), and, if you changed Tailscale's access controls, that the phone may reach the computer's port 7820 (or the port you set in **Settings → Phone**). Android runs one VPN at a time: another VPN turns Tailscale off.

### Away from home: your own server

With a Linux server that has a public IP (a cloud server will do; 3 Mbps is plenty), [WireGuard](https://www.wireguard.com) can relay between the phone and the computer. The phone and the computer already encrypt end to end, so the server only passes on data it cannot read. Nothing to install on the computer and no admin rights: Antumi runs [wireproxy](https://github.com/windtf/wireproxy) itself, downloading it from GitHub the first time (about 4 MB). The same on macOS, Windows and Linux.

1. Under **How phones connect** in **Settings → Phone**, click **Set up** next to “Your own server (WireGuard)”, enter the server's public IP or host name (UDP port 51820 by default); if the cloud server has a bandwidth limit, enter it in Mbps (say 3) and replies reach the phone several times faster. Click **Create**.
2. Click **Copy server script** and paste it into a root shell on the server (Debian, Ubuntu, CentOS, Alibaba Cloud Linux and the like). It installs WireGuard and starts it at boot. Then allow that UDP port in your cloud provider's firewall or security group.
3. Back in Settings, step 2 says “Connected to the server” once this computer's side works.
4. On the phone, scan the left code to install WireGuard (without Google Play, choose “Download APK File”). In WireGuard, tap **+** → **Scan from QR code** and scan the code shown by **Show the code**, then turn the tunnel on. Only 10.77.0.x goes through the server, so it can stay on without touching the phone's other traffic.

A phone paired before needs no new Antumi code: it picks up the relay's address the next time it connects.

If it cannot connect, read step 2 in Settings, and run `wg show wg-antumi` on the server to see recent handshakes from the computer and the phone. Android runs one VPN at a time, so it is this or Tailscale. For another tunnel or a port forward, enter the address phones use there under **Other addresses**.

### Notices while the app is closed: ntfy

1. Install the [ntfy](https://ntfy.sh) app on the phone and subscribe to a topic only you know, such as `antumi-` followed by random characters.
2. On the computer, enter `https://ntfy.sh/your-topic` in **Settings → Phone → Push address** and save.

When a conversation waits for you, finishes a turn or its agent exits unexpectedly, ntfy shows a one-line notice, never the conversation's title or content. ntfy.sh is a public server, so pick a topic that is hard to guess, or use your own ntfy server.

## Features

Look up these features when the relevant situation comes up.

### Handoff

![The agent menu at the bottom left of the input box](assets/guide/handoff.en.png)

Out of quota, or want another agent to carry on? Click the agent's name at the bottom left of the input box, pick another, add a note and click **Hand off**. The new agent gets the chat history and keeps working in the same folder.

### Cross-conversation references

To build on an earlier discussion, type `@` in the composer, select **Conversations**, and find one by title, project, or agent. Select it and describe what to do. The current agent can read the referenced history as needed and keeps working in its current folder. Click a referenced title in a sent message to open the original conversation.

The Conversations category requires **Let Agents read your Antumi records** in [Settings → Permissions](antumi:settings/permissions). Enabling provides the reading tools from the agent's next start; disabling blocks reads immediately. Handoff changes the agent working on the current conversation; a conversation reference adds source material.

### Scheduling: send when quota resets, or at a set time

![The Schedule message popover opened from the clock button](assets/guide/schedule.en.png)

1. Write your message in the input box.
2. Click the **clock** button at the bottom right of the input box.
3. Choose **When quota resets** or **At a specific time**.
4. Confirm.

| You can also schedule | Where |
|---|---|
| A task | The clock button on the task's toolbar |
| Approving a plan | **Schedule approval** on the plan card |
| View, reschedule or cancel | "N schedules" in the status bar, or **Up next** in the Overview |

When it is due, the agent runs unattended in the mode shown in the popover; **Change in settings** picks another. Nothing runs while the computer sleeps; turn on **Keep computer awake** from the coffee cup in the status bar.

### Split view: two conversations side by side

![Open in right split pane in a conversation's right-click menu](assets/guide/split.en.png)

| To | Do this |
|---|---|
| Open a split | Right-click another conversation → **Open in right split pane**; or ⌘-click it; or drag it onto the chat |
| Move focus | ⌘1 for the left pane, ⌘2 for the right |
| Resize | Drag the divider between them |
| Put away / bring back | ⌘\ |

Each side has its own input, progress and approvals.

### Helper and translation

![The right-click menu on selected text](assets/guide/helper.en.png)

Select part of a reply and right-click:

- **Ask helper**: opens on the right with a light model and its own context, to explain or dig in without touching the main conversation.
- **Translate**: translates just the selection. When a reply is in another language, a **Translate** button under it translates the whole reply.

![Translate in Settings](assets/guide/translate.en.png)

| Setting | Where |
|---|---|
| Language to translate into, auto-translate, model used for translation | [**Settings → Conversations**](antumi:settings/conversation) |

### Also worth knowing

| Feature | How |
|---|---|
| To-dos | Agents note what you need to do later; tick them off in the inspector's **To-dos** tab |
| Conversation groups | **Group and sort** on the sidebar's **Conversations**: by project, agent or run status |
| Keeps running | Agents run in a background process; closing the window does not stop them |

You can open this guide any time from **Help → User guide** at the bottom left.
