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
| Language to translate into, auto-translate | **Settings → Translate** |
| Model used for translation | [**Settings → Conversations → "Model for quick tasks"**](antumi:settings/conversation) |

### Also worth knowing

| Feature | How |
|---|---|
| To-dos | Agents note what you need to do later; tick them off in the inspector's **To-dos** tab |
| Conversation groups | **Group and sort** on the sidebar's **Conversations**: by project, agent or run status |
| Keeps running | Agents run in a background process; closing the window does not stop them |

You can open this guide any time from **Help → User guide** at the bottom left.
