// Application-owned text. Values and external content are passed separately.
export const MESSAGES = {
  "ChatComposer.sendKeyHint": {"zh": "，{keys} 发送", "en": "; {keys} to send"},
  "KeyboardShortcuts.count": {"zh": "共 {count} 项可自定义快捷键", "en": "{count} customizable shortcuts"},
  "KeyboardShortcuts.sidebar": {"zh": "显示 / 隐藏侧栏", "en": "Toggle sidebar"},
  "ChatComposer.sendToAgentNow": {"zh": "不等回合结束，现在就交给 Agent{keys}", "en": "Send to Agent now without waiting for this turn to end{keys}"},
  "ConversationView.paneLabel": {"zh": "分栏 {number}{active}", "en": "Pane {number}{active}"},
  "composerPlaceholder.interruptKey": {"zh": "；{keys} 中断", "en": "; {keys} to interrupt"},
  "composerPlaceholder.workingWithKeys": {"zh": "Agent 正在处理，可以先写下一条{interrupt}", "en": "Agent is working. Draft the next message now{interrupt}"},
  "composerPlaceholder.queueWithKeys": {"zh": "{prefix}也可以写下一条{send}{steer}{interrupt}", "en": "{prefix}Draft another message{send}{steer}{interrupt}"},
  "composerPlaceholder.queueKey": {"zh": "，{keys} 排到回合结束后发送", "en": "; {keys} queues it after this turn"},
  "composerPlaceholder.steerKey": {"zh": "，{keys} 立刻插入", "en": ", {keys} to insert immediately"},
  "KeyboardShortcuts.title": {"zh": "快捷键", "en": "Keyboard shortcuts"},
  "KeyboardShortcuts.description": {"zh": "按使用场景查看和自定义快捷键，修改后立即生效。", "en": "Browse and customize shortcuts by context. Changes take effect immediately."},
  "KeyboardShortcuts.newTask": {"zh": "新建任务", "en": "New task"},
  "KeyboardShortcuts.quickAddTask": {"zh": "快速记任务", "en": "Quick add task"},
  "KeyboardShortcuts.quickAddSubmit": {"zh": "创建快速任务", "en": "Create quick task"},
  "KeyboardShortcuts.quickAddExpand": {"zh": "展开完整任务表单", "en": "Expand quick task into full form"},
  "KeyboardShortcuts.openSettings": {"zh": "打开 / 关闭设置", "en": "Toggle settings"},
  "KeyboardShortcuts.toggleSplit": {"zh": "收起 / 恢复分屏", "en": "Toggle conversation split"},
  "KeyboardShortcuts.focusLeft": {"zh": "聚焦左侧会话", "en": "Focus left conversation"},
  "KeyboardShortcuts.focusRight": {"zh": "聚焦右侧会话", "en": "Focus right conversation"},
  "KeyboardShortcuts.sendMessage": {"zh": "发送消息 / 排队", "en": "Send message / queue"},
  "KeyboardShortcuts.steerMessage": {"zh": "即时补充当前回合", "en": "Steer the running turn"},
  "KeyboardShortcuts.sendNewConversation": {"zh": "发送到同配置新会话", "en": "Send to a new conversation"},
  "KeyboardShortcuts.acceptSuggestion": {"zh": "采用输入建议", "en": "Accept input suggestion"},
  "KeyboardShortcuts.interruptTurn": {"zh": "中断当前回合", "en": "Interrupt current turn"},
  "KeyboardShortcuts.findContent": {"zh": "查找当前内容", "en": "Find in current content"},
  "KeyboardShortcuts.findNext": {"zh": "下一个查找结果", "en": "Next search result"},
  "KeyboardShortcuts.findPrevious": {"zh": "上一个查找结果", "en": "Previous search result"},
  "KeyboardShortcuts.quickOpenFile": {"zh": "按名称转到文件", "en": "Quick open file"},
  "KeyboardShortcuts.saveFile": {"zh": "保存当前文件", "en": "Save current file"},
  "KeyboardShortcuts.submitForm": {"zh": "提交 / 保存表单", "en": "Submit / save form"},
  "KeyboardShortcuts.groupApp": {"zh": "应用", "en": "Application"},
  "KeyboardShortcuts.groupTasks": {"zh": "任务", "en": "Tasks"},
  "KeyboardShortcuts.groupConversations": {"zh": "会话与分屏", "en": "Conversations and splits"},
  "KeyboardShortcuts.groupChat": {"zh": "聊天与查找", "en": "Chat and search"},
  "KeyboardShortcuts.groupFiles": {"zh": "文件", "en": "Files"},
  "KeyboardShortcuts.groupPanels": {"zh": "面板", "en": "Panels"},
  "KeyboardShortcuts.groupForms": {"zh": "表单", "en": "Forms"},
  "KeyboardShortcuts.groupEditing": {"zh": "通用编辑与导航", "en": "Standard editing and navigation"},
  "KeyboardShortcuts.scopeApp": {"zh": "应用界面", "en": "Application interface"},
  "KeyboardShortcuts.scopeBoard": {"zh": "任务看板，非输入区", "en": "Task board, outside inputs"},
  "KeyboardShortcuts.scopeQuickAdd": {"zh": "快速记任务输入框", "en": "Quick task input"},
  "KeyboardShortcuts.scopeComposer": {"zh": "当前聊天输入框", "en": "Active chat input"},
  "KeyboardShortcuts.scopeContent": {"zh": "当前聊天或文件", "en": "Current chat or file"},
  "KeyboardShortcuts.scopeFile": {"zh": "文件编辑区", "en": "File editor"},
  "KeyboardShortcuts.scopeForm": {"zh": "任务、例程、命令、待办和提交表单", "en": "Task, routine, command, to-do and commit forms"},
  "KeyboardShortcuts.copy": {"zh": "复制", "en": "Copy"},
  "KeyboardShortcuts.cut": {"zh": "剪切", "en": "Cut"},
  "KeyboardShortcuts.paste": {"zh": "粘贴", "en": "Paste"},
  "KeyboardShortcuts.undo": {"zh": "撤销", "en": "Undo"},
  "KeyboardShortcuts.redo": {"zh": "重做", "en": "Redo"},
  "KeyboardShortcuts.newline": {"zh": "输入框换行", "en": "New line in input"},
  "KeyboardShortcuts.dismiss": {"zh": "关闭菜单、弹窗或返回", "en": "Dismiss menus and dialogs or go back"},
  "KeyboardShortcuts.menuNavigation": {"zh": "菜单和候选项选择", "en": "Navigate and select menu items"},
  "KeyboardShortcuts.terminalInterrupt": {"zh": "终端中断程序", "en": "Interrupt terminal process"},
  "KeyboardShortcuts.nativeEditing": {"zh": "由当前输入控件或系统处理", "en": "Handled by the focused control or operating system"},
  "KeyboardShortcuts.files": {"zh": "显示 / 隐藏文件栏", "en": "Toggle files panel"},
  "KeyboardShortcuts.terminal": {"zh": "显示 / 隐藏终端栏", "en": "Toggle terminal panel"},
  "KeyboardShortcuts.browser": {"zh": "显示 / 隐藏浏览器栏", "en": "Toggle browser panel"},
  "KeyboardShortcuts.search": {"zh": "搜索动作或按键", "en": "Search actions or keys"},
  "KeyboardShortcuts.resetAll": {"zh": "全部恢复默认", "en": "Reset all to defaults"},
  "KeyboardShortcuts.hint": {"zh": "点击按键组合即可修改、禁用或恢复默认。每项注明生效区域，设置保存在这台设备上；面板开关在终端和网页中同样有效。", "en": "Click a binding to change, disable or reset it. Each action shows its scope. Saved on this device; panel shortcuts also work in terminals and web pages."},
  "KeyboardShortcuts.conflict": {"zh": "该组合已用于「{action}」，请换一个组合或先禁用该动作的快捷键。", "en": "This binding is used by “{action}”. Choose another combination or disable that action's shortcut first."},
  "KeyboardShortcuts.reserved": {"zh": "请使用默认按键、功能键或带 Ctrl / Command 的可用组合，避开系统、编辑和终端保留按键。", "en": "Use a default binding, function key, or available Ctrl / Command combination. Avoid reserved system, editing, and terminal keys."},
  "KeyboardShortcuts.disabled": {"zh": "未绑定", "en": "Unbound"},
  "KeyboardShortcuts.default": {"zh": "默认：{keys}", "en": "Default: {keys}"},
  "KeyboardShortcuts.modify": {"zh": "修改「{action}」的快捷键", "en": "Change shortcut for “{action}”"},
  "KeyboardShortcuts.recording": {"zh": "按下组合键…", "en": "Press a combination…"},
  "KeyboardShortcuts.disable": {"zh": "禁用", "en": "Disable"},
  "KeyboardShortcuts.reset": {"zh": "恢复默认", "en": "Reset"},
  "KeyboardShortcuts.noResults": {"zh": "没有匹配的快捷键。", "en": "No matching shortcuts."},
  "KeyboardShortcuts.recordingHint": {"zh": "正在修改「{action}」，按 Esc 取消。", "en": "Recording “{action}”. Press Esc to cancel."},
  "KeyboardShortcuts.cancel": {"zh": "取消录入", "en": "Cancel recording"},
  "antumiTools.profileList": {"zh": "查看智能体配置", "en": "List agent profiles"},
  "antumiTools.profileCreate": {"zh": "创建智能体", "en": "Create agent"},
  "antumiTools.profileUpdate": {"zh": "修改智能体", "en": "Update agent"},
  "antumiTools.squadList": {"zh": "查看团队配置", "en": "List teams"},
  "antumiTools.squadCreate": {"zh": "创建团队", "en": "Create team"},
  "antumiTools.squadUpdate": {"zh": "修改团队", "en": "Update team"},
  "antumiTools.scheduleList": {"zh": "查看预约", "en": "List schedules"},
  "antumiTools.scheduleCreate": {"zh": "创建预约", "en": "Create schedule"},
  "antumiTools.scheduleUpdate": {"zh": "修改预约", "en": "Update schedule"},
  "antumiTools.routineList": {"zh": "查看例程", "en": "List routines"},
  "antumiTools.routineCreate": {"zh": "创建例程", "en": "Create routine"},
  "antumiTools.routineUpdate": {"zh": "修改例程", "en": "Update routine"},
  "antumiTools.skillList": {"zh": "查看技能", "en": "List skills"},
  "antumiTools.skillSearch": {"zh": "搜索技能", "en": "Search skills"},
  "antumiTools.skillInstall": {"zh": "安装技能", "en": "Install skills"},
  "antumiTools.skillSetActivation": {"zh": "设置技能启用范围", "en": "Set skill activation"},
  "antumiTools.commandList": {"zh": "查看聊天命令", "en": "List chat commands"},
  "antumiTools.commandCreate": {"zh": "创建聊天命令", "en": "Create chat command"},
  "antumiTools.commandUpdate": {"zh": "修改聊天命令", "en": "Update chat command"},
  "antumiTools.agentList": {"zh": "查看可委派智能体", "en": "List callable agents"},
  "antumiTools.agentDispatch": {"zh": "委派智能体", "en": "Delegate to agent"},
  "antumiTools.agentStatus": {"zh": "查看委派进度", "en": "Check delegations"},
  "antumiTools.agentCancel": {"zh": "取消委派", "en": "Cancel delegation"},
  "antumiTools.squadRoster": {"zh": "查看团队成员", "en": "View team roster"},
  "antumiTools.squadDispatch": {"zh": "分派团队工作", "en": "Assign team work"},
  "antumiTools.squadFinish": {"zh": "提交团队成果", "en": "Submit team result"},
  "antumiTools.resultCount": {"zh": "{count} 项", "en": "{count} {count, plural, one {result} other {results}}"},
  "ChatCommandSettings.emptyTitle": {"zh": "把常用提示词存成命令", "en": "Turn frequent prompts into commands"},
  "ChatCommandSettings.emptyHint": {"zh": "创建后，在聊天输入框输入 / 即可选用；提示词填入后可编辑，再决定发送。", "en": "Create a command, then type / in the composer to use it. Edit the expanded prompt before sending."},
  "ChatCommandSettings.startFromExample": {"zh": "从示例开始", "en": "Start with an example"},
  "ChatCommandSettings.exampleHint": {"zh": "选择后进入编辑，不会自动保存或发送。", "en": "Opens an editable draft. Nothing is saved or sent automatically."},
  "ChatCommandSettings.reviewTitle": {"zh": "审查代码改动", "en": "Review code changes"},
  "ChatCommandSettings.summaryTitle": {"zh": "整理当前改动", "en": "Summarize changes"},
  "ChatCommandSettings.reviewPrompt": {"zh": "请审查当前项目的代码改动，重点检查潜在错误、行为回归和缺失的验证，并给出具体文件位置。补充要求：{args}", "en": "Review the current project’s changes for bugs, regressions and missing validation. Include specific file locations. Additional requirements: {args}"},
  "ChatCommandSettings.summaryPrompt": {"zh": "请整理当前项目的改动，说明解决了什么问题、行为如何变化，以及已经完成哪些验证。补充要求：{args}", "en": "Summarize the current project’s changes: the problem solved, changed behavior and completed validation. Additional requirements: {args}"},
  "ChatCommandSettings.filter": {"zh": "搜索名称、提示词或项目", "en": "Search names, prompts or projects"},
  "ChatCommandSettings.count": {"zh": "显示 {count} / {total} 个命令", "en": "Showing {count} of {total} commands"},
  "ChatCommandSettings.noMatches": {"zh": "没有匹配的命令", "en": "No matching commands"},
  "ChatCommandSettings.deleteNamed": {"zh": "删除 /{name}？之后将无法从输入框选用。", "en": "Delete /{name}? It will no longer be available in the composer."},
  "SkillsSettingsSection.emptyTitle": {"zh": "为 Agent 安装技能", "en": "Install skills for your agents"},
  "SkillsSettingsSection.emptyHint": {"zh": "选择上方安装入口，将技能提供给兼容的 Agent。", "en": "Choose an installation tab above to make skills available to compatible agents."},
  "SkillsSettingsSection.filterInstalled": {"zh": "搜索仓库或已安装技能", "en": "Search repositories or installed skills"},
  "SkillsSettingsSection.filteredCount": {"zh": "显示 {count} / {total} 个仓库", "en": "Showing {count} of {total} repositories"},
  "SkillsSettingsSection.activationHelp": {"zh": "启用、更新与兼容性说明", "en": "Activation, updates and compatibility"},
  "SkillsSettingsSection.detailsAndMaintenance": {"zh": "技能明细与仓库维护", "en": "Skills and repository maintenance"},
  "SkillsSettingsSection.installSafety": {"zh": "技能可能包含脚本，只安装你信任的仓库；安装后可选择启用范围。", "en": "Skills may contain scripts. Install only repositories you trust; choose their activation scope after installation."},
  "McpSettingsSection.emptyTitle": {"zh": "把外部工具交给 Agent", "en": "Connect external tools to agents"},
  "McpSettingsSection.emptyHint": {"zh": "添加本地命令或远程 MCP 地址，也可导入已有配置。保存后测试连接，再查看服务器提供的工具。", "en": "Add a local command or remote MCP URL, or import existing configuration. Save and test the connection to inspect its tools."},
  "McpSettingsSection.enabled": {"zh": "已启用", "en": "Enabled"},
  "McpSettingsSection.disabled": {"zh": "已停用", "en": "Disabled"},
  "McpSettingsSection.notTested": {"zh": "本页尚未测试连接", "en": "Connection not tested on this page"},
  "McpSettingsSection.probeUnavailable": {"zh": "连接测试未完成，请重试。", "en": "Connection test did not finish. Try again."},
  "McpSettingsSection.serverCount": {"zh": "{count} 个服务器 · {enabled} 个已启用", "en": "{count} servers · {enabled} enabled"},
  "McpSettingsSection.sharingHelp": {"zh": "共享方式与生效时间", "en": "Sharing and when changes take effect"},
  "McpSettingsSection.editServer": {"zh": "编辑 {name}", "en": "Edit {name}"},
  "McpSettingsSection.importFailed": {"zh": "无法读取 Agent 配置，请重试。", "en": "Could not read agent configuration. Try again."},
  "McpSettingsSection.noImportTitle": {"zh": "没有可导入的服务器", "en": "No servers available to import"},
  "SettingsPage.quotaAuthExpired": {"zh": "登录已过期，请重新登录；已有读数可能已过时。", "en": "Sign-in expired. Sign in again; existing readings may be outdated."},
  "SettingsPage.quotaRefreshFailed": {"zh": "刷新失败；已有读数可能已过时。", "en": "Refresh failed; existing readings may be outdated."},
  "SettingsPage.quotaDisplay": {"zh": "显示方式", "en": "Display"},
  "SettingsPage.quotaAgents": {"zh": "Agent 额度与状态栏显示", "en": "Agent quota and status bar visibility"},
  "SettingsPage.quotaAgentsHint": {"zh": "查看当前额度，选择哪些 Agent 显示在状态栏。", "en": "View current readings and choose which agents appear in the status bar."},
  "SettingsPage.quotaBarHidden": {"zh": "状态栏额度已隐藏，以下选择会保留。", "en": "Quota is hidden from the status bar. Your selections are preserved."},
  "SettingsPage.quotaEmptyHint": {"zh": "登录支持额度查询的外部智能体后，这里会显示实际用量。", "en": "Sign in to an external agent that supports quota readings to see its usage here."},
  "SettingsPage.manageNamedAccount": {"zh": "管理账号「{name}」", "en": "Manage account “{name}”"},
  "SettingsPage.accountsLoading": {"zh": "正在读取账号", "en": "Loading accounts"},
  "SettingsPage.accountsLoadingHint": {"zh": "账号与登录状态会在读取完成后显示。", "en": "Accounts and sign-in status will appear when loading finishes."},
  "SettingsPage.accountsDisconnected": {"zh": "连接后查看账号", "en": "Connect to view accounts"},
  "SettingsPage.accountCount": {"zh": "{count} 个账号", "en": "Accounts: {count}"},
  "SettingsPage.accountEmptyHint": {"zh": "添加一个账号并登录，随后可在这里切换。", "en": "Add and sign in to an account, then switch accounts here."},
  "SettingsPage.accountSwitchingHelp": {"zh": "账号切换如何影响会话？", "en": "How does switching affect conversations?"},
  "SettingsPage.backToProviders": {"zh": "返回服务商", "en": "Back to providers"},
  "SettingsPage.providerAdvanced": {"zh": "模型、适用 Agent 与连接地址", "en": "Models, agents and endpoints"},
  "SettingsPage.providerCustomSetup": {"zh": "配置模型与连接地址", "en": "Configure models and endpoints"},
  "SettingsPage.providerPresetHint": {"zh": "默认模型：{model}；适用于 {agents}。", "en": "Default model: {model}. Available to {agents}."},
  "SettingsPage.providerTested": {"zh": "连接测试通过", "en": "Connection test passed"},
  "SettingsPage.providerTestFailed": {"zh": "连接测试失败", "en": "Connection test failed"},
  "SettingsPage.providerUntested": {"zh": "尚未测试连接", "en": "Connection not tested"},
  "SettingsPage.providersDisconnected": {"zh": "连接后管理服务商", "en": "Connect to manage providers"},
  "SettingsPage.providerGetStarted": {"zh": "接入你已有的编程套餐", "en": "Connect your coding plan"},
  "SettingsPage.providerEmptyHint": {"zh": "选择已开通的套餐，填入对应的 API Key。也可以配置自定义服务商。", "en": "Choose a plan you already have and enter its API key, or configure a custom provider."},
  "SettingsPage.providerCustomAdd": {"zh": "添加自定义服务商", "en": "Add a custom provider"},
  "SettingsPage.providerChoosePlan": {"zh": "选择要配置的套餐", "en": "Choose a plan to configure"},
  "SettingsPage.providerAccountAlternative": {"zh": "使用官方账号？无需添加服务商", "en": "Using an agent’s own account? No provider needed"},
  "SettingsPage.providerAccountHint": {"zh": "未选择服务商的会话会使用外部智能体自己的登录账号。服务商的额度与官方账号分别计算。", "en": "Conversations without a provider use the external agent’s own signed-in account. Provider usage and account quota are separate."},
  "SettingsPage.automationLoadFailed": {"zh": "读取自动化设置失败，请重试。", "en": "Could not load automation settings. Try again."},
  "SettingsPage.automationLoading": {"zh": "正在读取额度自动化设置…", "en": "Loading quota automation settings…"},
  "SettingsPage.automationNoAccounts": {"zh": "还没有支持额度自动化的账号，添加账号后可配置预热和自动用卡。", "en": "No accounts support quota automation yet. Add an account to configure warmup and automatic reset credits."},
  "SettingsPage.previewCodeTitle": {"zh":"专注于当前任务", "en":"Focus on the current task"},
  "SettingsPage.appearanceSections": {"zh": "外观分类", "en": "Appearance sections"},
  "SettingsPage.compareDefaults": {"zh": "对比本组默认效果", "en": "Compare group defaults"},
  "SettingsPage.showCurrent": {"zh": "返回当前效果", "en": "Show current appearance"},
  "SettingsPage.comparingDefaults": {"zh": "正在预览本组默认效果，已保存的设置不会改变。", "en": "Previewing this group’s defaults. Your saved settings are unchanged."},
  "SettingsPage.customizedCount": {"zh": "本组有 {count} 项自定义设置", "en": "Customized settings in this group: {count}"},
  "SettingsPage.usingDefaults": {"zh": "本组使用默认设置", "en": "This group uses default settings"},
  "SettingsPage.resetGroup": {"zh": "恢复本组默认", "en": "Reset this group"},
  "SettingsPage.livePreview": {"zh": "实时预览", "en": "Live preview"},
  "SettingsPage.sample": {"zh": "示例", "en": "Sample"},
  "SettingsPage.previewPrompt": {"zh": "帮我整理这次改动。", "en": "Help me review these changes."},
  "SettingsPage.previewWork": {"zh": "2 步 · 3 秒", "en": "2 steps · 3 sec"},
  "SettingsPage.previewWorkDetail": {"zh": "读取项目文件，检查本次变更。", "en": "Read project files and inspect the changes."},
  "SettingsPage.previewAnswer": {"zh": "让工作更专注。这里可以查看聊天文字、代码与终端的显示效果。", "en": "A little more room to focus. See how messages, code and your terminal will look."},
  "SettingsPage.previewReply": {"zh": "继续聊聊…", "en": "Continue the conversation…"},
  "SettingsPage.previewTerminal": {"zh": "# 终端字体与行高预览", "en": "# Terminal font and line-height preview"},
  "SettingsPage.previewHint": {"zh": "示例内容，随外观设置即时更新。", "en": "Sample content. Updates as you change your appearance settings."},
  "SettingsPage.clearSearch": {"zh": "清除搜索", "en": "Clear search"},
  "ChatActivityStep.done": {"zh": "步骤已结束", "en": "Step finished"},
  "ChatActivityStep.awaiting": {"zh": "等待你确认或回答", "en": "Waiting for your approval or answer"},
  "AgentTemplates.title": {"zh":"智能体模板","en":"Agent templates"},
  "AgentTemplates.chooseHint": {"zh":"选择一个起点，调整配置后保存为自己的智能体。","en":"Choose a starting point, customize it, and save your own agent."},
  "AgentTemplates.emptyHint": {"zh":"还没有使用中的智能体。可以从模板开始，也可以空白创建。","en":"No active agents yet. Start from a template or create one from scratch."},
  "AgentTemplates.blank": {"zh":"空白创建","en":"Start from scratch"},
  "AgentTemplates.blankHint": {"zh":"自己填写名称、调用时机和工作指令","en":"Define the name, when to call it, and instructions"},
  "AgentTemplates.fromTemplate": {"zh":"从「{name}」模板创建","en":"Created from the {name} template"},
  "AgentTemplates.editHint": {"zh":"配置可以自由修改，保存后成为独立智能体。","en":"Customize freely. Saving creates an independent agent."},
  "AgentTemplates.back": {"zh":"返回智能体模板","en":"Back to agent templates"},
  "AgentTemplates.quick": {"zh":"建议轻量模型","en":"Lightweight model suggested"},
  "AgentTemplates.balanced": {"zh":"建议均衡模型","en":"Balanced model suggested"},
  "AgentTemplates.strong": {"zh":"建议较强模型","en":"More capable model suggested"},
  "AgentTemplates.modelHint": {"zh":"模板仅提供模型建议，请确认当前型号适合任务；降低推理强度不会切换成轻量模型。","en":"The model tier is a suggestion. Check the selected model; lowering reasoning effort does not select a smaller model."},
  "AgentTemplates.readOnlyUnsupported": {"zh":"所选外部智能体不支持只读模式，请选择其他外部智能体或切换为开发测试。","en":"This external agent does not support read-only mode. Choose another external agent or switch to development and testing."},
  "AgentTemplates.readOnlyHint": {"zh":"只运行已确认不会产生持久变更的检查；可用命令、网络和审批取决于外部智能体。","en":"Run only checks known not to make persistent changes. Commands, network access, and approvals depend on the external agent."},
  "AgentTemplates.developHint": {"zh":"委派时沿用主会话的权限模式，与同一目录的其他修改串行。","en":"Delegated work runs in the calling conversation's permission mode, one edit at a time in the same directories."},
  "AgentTemplates.toolsHint": {"zh":"这里只选择 Antumi 附加的技能和 MCP；外部智能体自身的配置仍可能加载。只读智能体仅收到服务器声明为只读的 MCP 工具。","en":"These choices control skills and MCP servers added by Antumi. The external agent may still load its own configuration. Read-only agents receive only MCP tools the server marks as read-only."},
  "AgentTemplates.example": {"zh":"例如：{example}","en":"Example: {example}"},
  "AgentTemplates.contextInstructions": {"zh":"先读取适用的仓库指令，围绕调用者给出的目标、文件范围和验收要求工作。\n如果本次是被委派的子任务，不假定自己拥有主会话的聊天历史。信息不足但可以安全继续时明确记录假设；缺失信息会影响目标、授权、环境或结论正确性时，返回“缺少必要信息”及最小所需信息，不猜测、不反复提问等待。直接作为主会话使用时可以正常澄清需求。权限审批仍须遵守。","en":"Read applicable repository instructions first. Work within the caller’s goal, file scope, and acceptance criteria.\nFor a delegated task, do not assume access to the main conversation’s history. If it is safe to proceed, state assumptions. If missing information affects the goal, authorization, environment, or correctness, return “Missing required information” and the minimum information needed. Do not guess or wait on repeated questions. In a direct conversation, clarify requirements normally. Always follow approval requirements."},
  "AgentTemplates.readOnlyInstructions": {"zh":"只读分析：不修改文件、数据、配置或部署状态，不提交、不推送。仅运行已确认不会产生持久变更的命令；测试、构建和类型检查都不默认视为只读。工具、网络或权限不足时说明限制，不绕过审批。","en":"Read-only analysis: do not modify files, data, configuration, or deployments; do not commit or push. Run only commands known not to make persistent changes. Tests, builds, and type checks are not inherently read-only. State tool, network, or permission limits rather than bypassing approvals."},
  "AgentTemplates.outputInstructions": {"zh":"输出第一句给出结论或当前阻塞原因，提供必要证据，区分事实与推断。最后说明实际检查范围、未验证部分和影响结论的待确认事项。","en":"Start with the conclusion or current blocker. Provide necessary evidence and distinguish facts from inferences. End with the actual scope checked, what remains unverified, and any missing information that affects the conclusion."},
  "AgentTemplates.explorerName": {"zh":"代码探索员","en":"Code explorer"},
  "AgentTemplates.explorerDescription": {"zh":"需要定位功能入口、梳理调用链、查找配置或判断修改范围时调用。返回关键文件和依据，不承担代码修改或完整方案设计。","en":"Use to locate entry points, trace call chains, find configuration, or identify the change scope. Return key files and evidence without modifying code or designing a full solution."},
  "AgentTemplates.explorerInstructions": {"zh":"你负责围绕指定问题探索代码库。\n从相关入口追踪核心逻辑和数据结构，优先使用定向搜索，避免遍历无关目录或倾倒大量源码。\n每个关键判断附文件路径、行号和简短依据。按重要性列出关键代码位置，通常不超过 5 个；更多时说明原因，不能为限额遗漏关键分支。\n输出直接结论、关键位置及作用、必要的调用链或数据流。功能不存在或无法定位时明确说明，给出最接近的相关位置，不猜测。","en":"Explore the codebase to answer the specified question.\nTrace relevant entry points through core logic and data structures. Prefer targeted searches; avoid unrelated directories and large source dumps.\nSupport key findings with file paths, line numbers, and brief evidence. Rank locations by importance, usually at most five; explain when more are needed rather than omitting important branches.\nReturn the answer, key locations and their roles, and necessary call chains or data flow. If the feature is absent or cannot be located, say so and identify the closest relevant code without guessing."},
  "AgentTemplates.explorerExample": {"zh":"定位自动更新的检查间隔与触发条件","en":"Locate the update-check interval and its triggers"},
  "AgentTemplates.reviewerName": {"zh":"代码审查员","en":"Code reviewer"},
  "AgentTemplates.reviewerDescription": {"zh":"代码修改完成、提交前或评审 PR 时调用。检查指定改动中的行为错误、兼容性问题、安全问题和测试遗漏。","en":"Use after code changes, before a commit, or to review a PR. Check the specified changes for behavioral bugs, compatibility problems, security issues, and missing tests."},
  "AgentTemplates.reviewerInstructions": {"zh":"你负责审查指定改动。\n先确认实际可见的审查范围。调用者未指定范围或基线时，检查工作区已暂存、未暂存及未跟踪的改动，并在输出中写明范围和基线。工作区干净时报告没有未提交的审查目标，不擅自改审最近一次提交。远程 PR 的 diff 或网络不可用时说明限制。\n阅读 diff 及必要上下文，重点检查需求符合度、行为错误、兼容性、安全问题（权限、注入、密钥）及关键回归。\n不要为凑数量提出风格建议；只有已确认被现有检查覆盖并已报告的问题才省略，不假定检查已经运行。\n每个问题包含：优先级（必须修 / 应修 / 可选）、文件位置、触发条件、影响和修复方向。证据不足的怀疑单独标注。未发现明确问题时直接说明，并注明验证范围。","en":"Review the specified changes.\nEstablish the scope actually available. Without a supplied scope or base, inspect staged, unstaged, and untracked workspace changes and state the scope and base. If the workspace is clean, report that there are no uncommitted changes to review; do not silently review the latest commit instead. State when a remote PR diff or network access is unavailable.\nRead the diff and necessary context. Focus on requirements, behavior, compatibility, security (authorization, injection, secrets), and important regressions.\nDo not invent style findings to fill a quota. Omit a finding as already covered only when an existing check is confirmed to have reported it; do not assume checks ran.\nFor each finding, include priority (must fix / should fix / optional), location, trigger, impact, and a fix direction. Label unsupported suspicions separately. If no definite issues are found, say so and state the verification scope."},
  "AgentTemplates.reviewerExample": {"zh":"检查界面状态切换是否存在回归","en":"Check UI state changes for regressions"},
  "AgentTemplates.debuggerName": {"zh":"故障根因分析员","en":"Root cause analyst"},
  "AgentTemplates.debuggerDescription": {"zh":"出现错误日志、测试失败、接口异常或行为与预期不符时调用。通过日志和代码定位根因，返回证据及最小修复建议，不直接修改。","en":"Use for errors, test failures, API incidents, or unexpected behavior. Investigate logs and code to return evidence and a minimal fix proposal without making changes."},
  "AgentTemplates.debuggerInstructions": {"zh":"你负责定位故障根因。\n根据提供的信息确定故障时间、环境、预期与实际行为，不猜测环境、租户、授权或目标数据。沿请求标识、错误堆栈和相关代码追踪错误链，区分根因、连锁错误与无关噪声。\n优先使用可用的只读日志、监控或 Issue 工具取证。工具缺失、被过滤、无权限或查询失败时，开头说明限制；可以安全继续则改用已有代码与堆栈分析，下调置信度，不能声称已确认线上根因，也不能把查询失败当成没有异常。\n提出可验证的假设，用查询、代码阅读或确认不改文件的命令支持或排除。需要改代码、配置或数据才能复现时，返回复现步骤并交回调用者。\n输出根因判断、证据链、置信程度及依据、最小修复方向和验证办法。隐藏密钥及无关个人信息。","en":"Investigate the root cause of the failure.\nUse supplied facts to identify the time, environment, expected behavior, and actual behavior. Do not guess the environment, tenant, authorization, or target data. Follow request identifiers, stack traces, and code to separate the root cause from cascading errors and noise.\nPrefer available read-only log, monitoring, or issue tools. If tools are missing, filtered, unauthorized, or queries fail, state that limitation first. If safe, continue with available code and traces, lower confidence, and do not claim to have confirmed the live incident’s cause. A failed query is not evidence of no errors.\nForm verifiable hypotheses and support or eliminate them with queries, code, or commands known not to write files. If reproduction requires changing code, configuration, or data, return the steps to the caller.\nReturn the diagnosis, evidence chain, confidence with reasons, minimal fix proposal, and verification approach. Redact secrets and unrelated personal information."},
  "AgentTemplates.debuggerExample": {"zh":"追踪一次接口 500 的真实错误链","en":"Trace the actual error chain behind an API 500"},
  "AgentTemplates.testerName": {"zh":"测试验证专员","en":"Test specialist"},
  "AgentTemplates.testerDescription": {"zh":"功能实现后需要补充回归测试、复现缺陷或验证验收条件时调用。主要修改测试和必要的测试数据，不承担业务功能开发。","en":"Use after implementation to add regression tests, reproduce defects, or verify acceptance criteria. Primarily modify tests and necessary fixtures, not application logic."},
  "AgentTemplates.testerInstructions": {"zh":"你负责验证指定行为及其关键回归风险。\n先读取仓库验证规范和现有测试，围绕验收条件选择必要的测试层级，覆盖真实缺陷、边界条件和状态变化，不写仅复述实现的测试。\n只修改测试及必要的测试数据，不修改业务实现。发现业务缺陷时，条件允许则留下稳定失败的复现测试，连同定位交回调用者，不自行修复；无法复现时说明证据缺口。不得跳过失败、削弱断言或放宽预期来获得通过。\n不提交、不推送，改动留在工作区。涉及数据库、网络或浏览器操作时使用项目约定的测试环境，不操作真实业务数据。\n先运行直接相关的测试，再按仓库规范完成必要检查，记录实际命令和结果。依赖缺失等环境故障须明确报告，不当作测试通过，也不擅自安装、升级依赖或修改锁文件。\n输出验证范围、改动文件、检查结果、产品或环境问题，以及未验证部分。","en":"Verify the specified behavior and its important regression risks.\nRead repository verification rules and existing tests. Choose necessary test levels based on acceptance criteria. Cover real defects, boundaries, and state transitions rather than mirroring the implementation.\nModify only tests and necessary fixtures, not application logic. For a product defect, leave a reliably failing reproduction test when feasible and return it with the diagnosis; do not fix the implementation. If reproduction is impossible, state the evidence gap. Never skip failures, weaken assertions, or loosen expectations to obtain a pass.\nDo not commit or push; leave changes in the workspace. Use the project’s designated test environment for database, network, or browser work, not real business data.\nRun directly relevant tests first, then required repository checks. Record actual commands and results. Report missing dependencies and other environment failures; do not count them as passes or install or upgrade dependencies or change lockfiles without authorization.\nReturn the scope, changed files, check results, product or environment issues, and unverified behavior."},
  "AgentTemplates.testerExample": {"zh":"验证链接间距、标点、图标与复制结果","en":"Test link spacing, punctuation, icons, and copied text"},
  "AgentTemplates.plannerName": {"zh":"技术方案规划员","en":"Technical planner"},
  "AgentTemplates.plannerDescription": {"zh":"需要独立分析跨模块设计、比较实现方案或形成技术评审材料时调用。已有计划时仅分析指定问题，不重复制定整份计划，不直接开发。","en":"Use for independent cross-module design, implementation trade-offs, or technical review material. If a plan exists, analyze only the requested question rather than recreating the whole plan. Do not implement."},
  "AgentTemplates.plannerInstructions": {"zh":"你负责把需求转成可以评审和实施的技术方案。\n明确业务目标、成功标准、范围边界和关键假设。先检查现有实现及项目约束，再提出方案；已有计划时先阅读它，只补充调用者指定的分析。\n有实际取舍时比较少量可行选项，解释推荐理由，不为形式堆砌替代方案。\n按模块说明改动、依赖、数据或接口变化、兼容方式与必要的验证办法。缺少关键资料时按共用规则返回必要信息，不凭假设决定授权、数据范围或破坏性变更。\n方案写在回复中。输出目标与边界、推荐方案、关键取舍、实施步骤、可检查的验收标准和影响方案选择的待确认事项。","en":"Turn the requirements into a reviewable, implementable technical proposal.\nIdentify the business goal, success criteria, boundaries, and key assumptions. Inspect the existing implementation and project constraints first. If a plan already exists, read it and add only the requested analysis.\nCompare a small set of feasible alternatives when there are real trade-offs, explaining the recommendation rather than inventing alternatives for formality.\nDescribe module changes, dependencies, data or API changes, compatibility, and necessary verification. Apply the shared missing-information rules; never assume authorization, data scope, or destructive changes.\nWrite the proposal in the response. Include goals and boundaries, the recommendation, key trade-offs, implementation steps, checkable acceptance criteria, and open questions that affect the choice."},
  "AgentTemplates.plannerExample": {"zh":"设计例程的增量读取与失败恢复","en":"Design incremental reads and failure recovery for routines"},
  "AgentProfiles.roleDescription": { "zh": "保存专长、指令、模型与工具配置，直接开始会话或接受委派。", "en": "Save expertise, instructions, models and tools for direct conversations or delegated work." },
  "AgentProfiles.createHint": { "zh": "配置指令、模型和工具", "en": "Configure instructions, models and tools" },
  "AgentProfiles.createWithAgentHint": { "zh": "也可以在会话中描述你需要什么样的智能体，让 Agent 帮你创建。", "en": "You can also describe the agent you need in a conversation and ask Agent to create it for you." },
  "Squads.createWithAgentHint": { "zh": "也可以在会话中描述团队目标和成员分工，让 Agent 帮你创建团队。", "en": "You can also describe your team's goal and member roles in a conversation and ask Agent to create the team for you." },
  "AgentsPageHeader.openNewConversation": { "zh": "前往新建会话", "en": "Start a conversation" },
  "AgentProfiles.pendingReturn": {"zh": "等待回传", "en": "Returning result"},
  "AgentProfiles.startingHint": {"zh": "正在准备独立会话，即将开始执行。", "en": "Preparing an independent conversation. Work will begin shortly."},
  "AgentProfiles.cardLabel": {"zh": "委派给 {name}", "en": "Delegated to {name}"},
  "AgentProfiles.mainConversation": {"zh": "主会话", "en": "Main conversation"},
  "AgentProfiles.assigned": {"zh": "已委派", "en": "Assigned"},
  "AgentProfiles.returned": {"zh": "结果返回", "en": "Result returned"},
  "AgentProfiles.waitingToStart": {"zh": "等待开始，轮到后自动执行。", "en": "Queued; work starts automatically when ready."},
  "AgentProfiles.waitingForParent": {"zh": "主会话这一轮结束后开始。", "en": "Starts when the main conversation's turn ends."},
  "AgentProfiles.waitingForWriter": {"zh": "同一项目里的其他修改结束后开始。", "en": "Starts when other edits in this project finish."},
  "AgentProfiles.waitingForCapacity": {"zh": "同时运行的 Agent 已达上限，有空位后开始。", "en": "Starts when a slot frees up: the limit on agents running at once is reached."},
  "AgentProfiles.needsAttention": {"zh": "需要审批或回答问题，打开子会话处理。", "en": "Approval or an answer is needed. Open the conversation to respond."},
  "AgentProfiles.workingHint": {"zh": "独立执行中，完成后自动带回结果。", "en": "Working independently. Results return automatically."},
  "AgentProfiles.noResult": {"zh": "本次委派未返回结果。", "en": "This delegation returned no result."},
  "AgentProfiles.details": {"zh": "详情", "en": "Details"},
  "AgentProfiles.handleRequest": {"zh": "去处理", "en": "Respond"},
  "AgentProfiles.dispatchHint": {"zh": "将子任务交给一个智能体，完成后结果会自动送回当前会话。", "en": "Assign work to an agent. Its result returns to this conversation automatically."},
  "AgentProfiles.chooseRole": {"zh": "选择智能体", "en": "Choose an agent"},
  "AgentProfiles.goal": {"zh": "目标", "en": "Goal"},
  "AgentProfiles.goalPlaceholder": {"zh": "希望这个智能体完成什么？", "en": "What should this agent accomplish?"},
  "AgentProfiles.context": {"zh": "补充说明（可选）", "en": "Additional context (optional)"},
  "AgentProfiles.contextPlaceholder": {"zh": "必要背景、文件范围、交付要求等", "en": "Background, file scope, expected output…"},
  "AgentProfiles.noAvailable": {"zh": "当前会话没有可调用的智能体。可在「智能体」中新建智能体或调整调用范围。", "en": "No agents are available to this conversation. Create an agent or adjust callable agents in Agents."},
  "AgentProfiles.resultReturned": {"zh": "委派结果已返回，主会话将继续处理", "en": "Delegation result returned; the main conversation will continue"},
  "AgentProfiles.history": {"zh": "委派记录", "en": "Delegation history"},
  "AgentProfiles.result": {"zh": "结果", "en": "Result"},
  "AgentProfiles.loadingCalls": {"zh": "正在读取委派记录…", "en": "Loading delegation history…"},
  "AgentProfiles.fixedConfig": {"zh": "本次运行沿用智能体配置", "en": "This run uses its saved agent configuration"},
  "AgentProfiles.delegating": {"zh": "委派工作中", "en": "Delegating work"},
  "AgentProfiles.back": {"zh": "返回智能体列表", "en": "Back to agents"},
  "AgentProfiles.title": {"zh": "智能体", "en": "Agents"},
  "AgentProfiles.roles": {"zh": "我的智能体", "en": "My agents"},
  "AgentProfiles.role": {"zh": "智能体", "en": "Agent"},
  "AgentProfiles.configure": {"zh": "配置智能体", "en": "Configure agent"},
  "AgentProfiles.description": {"zh": "保存指令、模型与工具配置，直接聊天、加入团队或接受委派。", "en": "Save instructions, models and tools for conversations, teams and delegated work."},
  "AgentProfiles.create": {"zh": "新建智能体", "en": "New agent"},
  "AgentProfiles.showArchived": {"zh": "查看已归档", "en": "Show archived"},
  "AgentProfiles.noArchived": {"zh": "没有已归档的智能体。", "en": "No archived agents."},
  "AgentProfiles.empty": {"zh": "还没有智能体。创建一个用于开发、审查或分析的智能体。", "en": "No agents yet. Create one for development, review or research."},
  "AgentProfiles.chat": {"zh": "开始会话", "en": "Start conversation"},
  "AgentProfiles.edit": {"zh": "编辑", "en": "Edit"},
  "AgentProfiles.archive": {"zh": "归档", "en": "Archive"},
  "AgentProfiles.restore": {"zh": "恢复", "en": "Restore"},
  "AgentProfiles.name": {"zh": "名称", "en": "Name"},
  "AgentProfiles.expertise": {"zh": "擅长的工作与调用时机", "en": "Expertise and when to call"},
  "AgentProfiles.instructions": {"zh": "工作指令", "en": "Instructions"},
  "AgentProfiles.engine": {"zh": "外部智能体", "en": "External agent"},
  "AgentProfiles.callable": {"zh": "允许调用的智能体", "en": "Agents it can call"},
  "AgentProfiles.callableHint": {"zh": "选中的智能体可在主会话中接受委派；子会话完成工作后返回结果。", "en": "Selected agents can receive delegated work from the main conversation and return results."},
  "AgentProfiles.skills": {"zh": "技能", "en": "Skills"},
  "AgentProfiles.inherit": {"zh": "沿用所选外部智能体的设置", "en": "Inherit this external agent’s settings"},
  "AgentProfiles.customMember": {"zh": "单独配置成员", "en": "Configure this member"},
  "AgentProfiles.noRole": {"zh": "直接使用外部智能体", "en": "Use an external agent directly"},
  "AgentProfiles.saveFromConversation": {"zh": "保存为智能体", "en": "Save as agent"},
  "AgentProfiles.calls": {"zh": "委派", "en": "Delegation"},
  "AgentProfiles.delegate": {"zh": "委派子任务", "en": "Delegate work"},
  "AgentProfiles.instruction": {"zh": "目标、必要背景、文件范围和交付要求", "en": "Goal, context, file scope and expected output"},
  "AgentProfiles.dispatch": {"zh": "委派", "en": "Delegate"},
  "AgentProfiles.noCalls": {"zh": "尚无委派。点击输入框上方的「委派」，或在消息中 @智能体。", "en": "No delegated work. Use Delegate above the composer, or @mention an agent."},
  "AgentProfiles.openConversation": {"zh": "查看会话", "en": "View conversation"},
  "AgentProfiles.cancelCall": {"zh": "取消委派", "en": "Cancel delegation"},
  "AgentProfiles.parent": {"zh": "返回主会话", "en": "Back to main conversation"},
  "AgentProfiles.queued": {"zh": "排队中", "en": "Queued"},
  "AgentProfiles.starting": {"zh": "正在启动", "en": "Starting"},
  "AgentProfiles.running": {"zh": "工作中", "en": "Working"},
  "AgentProfiles.awaiting": {"zh": "等你回答", "en": "Needs your input"},
  "AgentProfiles.completed": {"zh": "已完成", "en": "Completed"},
  "AgentProfiles.failed": {"zh": "失败", "en": "Failed"},
  "AgentProfiles.cancelled": {"zh": "已取消", "en": "Cancelled"},
  "SupportSettings.title": {"zh": "支持与反馈", "en": "Support & feedback"},
  "SupportSettings.description": {"zh": "支持 Antumi、分享给朋友、查看项目地址、反馈问题与交流。", "en": "Support Antumi, share it with friends, visit the project, send feedback, and connect with the community."},
  "SupportSettings.share": {"zh": "分享 Antumi", "en": "Share Antumi"},
  "SupportSettings.shareDescription": {"zh": "觉得好用？推荐给朋友，让更多人认识 Antumi。", "en": "Enjoying Antumi? Recommend it to friends and help more people discover it."},
  "SupportSettings.copyShare": {"zh": "复制分享文案", "en": "Copy share text"},
  "SupportSettings.shareText": {"zh": "Antumi（安图米）是一个开源的 AI 编程工作台，统一管理 Claude Code、Codex 等 Agent 的任务、会话与协作。\n\n如果你也同时用几个 AI 编程工具，推荐试试，让 Agent 协作起来，少切窗口、少搬上下文。\n\n项目地址：{url}", "en": "Antumi is an open-source AI coding workbench that brings tasks, conversations, and collaboration across Claude Code, Codex, and other agents into one place.\n\nIf you use several AI coding tools, try Antumi to let your agents work together with less window switching and context copying.\n\nProject: {url}"},
  "SupportSettings.shareThanks": {"zh": "文案已复制，感谢你愿意分享 Antumi，让更多人发现它！", "en": "Text copied. Thank you for sharing Antumi and helping more people discover it!"},
  "SupportSettings.shareFailed": {"zh": "复制失败，请重试。", "en": "Could not copy. Please try again."},
  "SupportSettings.feedback": {"zh": "问题反馈", "en": "Feedback"},
  "SupportSettings.feedbackDescription": {"zh": "报告问题或提出建议，在 GitHub Issues 中跟进。", "en": "Report a problem or suggest an improvement on GitHub Issues."},
  "SupportSettings.openFeedback": {"zh": "提交反馈", "en": "Submit feedback"},
  "SupportSettings.community": {"zh": "交流", "en": "Community"},
  "SupportSettings.communityDescription": {"zh": "交流入口将在开放后显示在这里。", "en": "Community links will appear here when available."},
  "SupportSettings.comingSoon": {"zh": "即将开放", "en": "Coming soon"},
  "ProjectStar.title": {"zh": "给个star鼓励下吧", "en": "Give us a star!"},
  "ProjectStar.thanks": {"zh": "感谢您的支持！", "en": "Thanks for your support!"},
  "ProjectStar.checking": {"zh": "正在检查 Star 状态…", "en": "Checking star status…"},
  "ProjectStar.starring": {"zh": "正在 Star…", "en": "Starring…"},
  "ProjectStar.star": {"zh": "Star", "en": "Star"},
  "ProjectStar.openGithub": {"zh": "打开 GitHub", "en": "Open GitHub"},
  "ProjectStar.unavailable": {"zh": "登录已失效，请在 GitHub 网页操作。", "en": "Sign-in is no longer available. Use GitHub in your browser."},
  "ProjectStar.permissionDenied": {"zh": "当前凭据没有 Star 权限，请在 GitHub 网页操作。", "en": "The current credentials cannot add stars. Use GitHub in your browser."},
  "ProjectStar.accountChanged": {"zh": "GitHub 账号已变化，请重试。", "en": "The GitHub account changed. Please try again."},
  "ProjectStar.failed": {"zh": "未能完成 Star，可重试或打开 GitHub 网页。", "en": "Could not add the star. Try again or open GitHub."},
  "Readiness.unknownProvider": { "zh": "已安装，原生服务商配置尚未确认", "en": "Installed; native provider setup is not yet confirmed" },
  "SetupGuide.title": {"zh": "检查使用环境", "en": "Check your setup"},
  "SetupGuide.agentStep": {"zh": "先准备一个外部智能体", "en": "Set up an external agent"},
  "SetupGuide.sourceStep": {"zh": "要接入任务来源吗？", "en": "Connect a task source?"},
  "SetupGuide.done": {"zh": "准备好了。", "en": "You’re all set."},
  "SetupGuide.waiting": {"zh": "正在读取环境和配置…", "en": "Reading your environment and configuration…"},
  "SetupGuide.disconnected": {"zh": "连接工作台后继续检查，已有进度会保留。", "en": "Reconnect to the workspace to continue. Your progress is saved."},
  "SetupGuide.chooseAgent": {"zh": "选择要使用的外部智能体", "en": "Choose an external agent"},
  "SetupGuide.pause": {"zh": "退出引导", "en": "Exit guide"},
  "SetupGuide.resumeHint": {"zh": "可在左下角「帮助 → 检查使用环境」继续。", "en": "Resume from Help → Check your setup at the bottom left."},
  "SetupGuide.agents": {"zh": "打开外部智能体", "en": "Open external agents"},
  "SetupGuide.enable": {"zh": "启用这个外部智能体", "en": "Enable this external agent"},
  "SetupGuide.providers": {"zh": "配置服务商", "en": "Configure a provider"},
  "SetupGuide.refresh": {"zh": "重新检测", "en": "Check again"},
  "SetupGuide.checking": {"zh": "正在检查…", "en": "Checking…"},
  "SetupGuide.confirm": {"zh": "已在外部智能体中配置", "en": "Already configured in the external agent"},
  "SetupGuide.deferAuth": {"zh": "知道了，稍后授权", "en": "Got it, authorize on first use"},
  "SetupGuide.confirmed": {"zh": "原生配置由你确认，尚未进行连接验证。", "en": "You confirmed the native setup; its connection has not been verified."},
  "SetupGuide.deferredAuth": {"zh": "已了解首次使用时需授权，当前尚未登录。", "en": "Authorization is deferred to first use; you are not signed in yet."},
  "SetupGuide.providerConfigured": {"zh": "已配置服务商「{name}」，连接状态以测试结果为准。", "en": "Provider “{name}” is configured. Connection status is shown by its test result."},
  "SetupGuide.providerUntested": {"zh": "尚未执行连接测试；可在服务商设置中手动测试。", "en": "Connection not tested yet. You can run a test in provider settings."},
  "SetupGuide.providerPassed": {"zh": "服务商连接测试已通过。", "en": "Provider connection test passed."},
  "SetupGuide.providerFailed": {"zh": "服务商连接测试未通过，请到服务商设置查看原因。", "en": "Provider connection test failed. Open provider settings for details."},
  "SetupGuide.providerTesting": {"zh": "服务商正在测试连接…", "en": "Testing the provider connection…"},
  "SetupGuide.sourceQuestion": {"zh": "外部智能体已准备好。可以接入 GitHub、Jira 等任务来源，也可以暂时跳过。", "en": "Your external agent is prepared. Connect a task source such as GitHub or Jira, or skip for now."},
  "SetupGuide.configureSources": {"zh": "配置任务来源", "en": "Configure a task source"},
  "SetupGuide.skipSources": {"zh": "暂时不需要", "en": "Not now"},
  "SetupGuide.installSources": {"zh": "安装任务来源插件", "en": "Install a task-source plugin"},
  "SetupGuide.sourceConfiguration": {"zh": "选择一个来源，保存必填设置并登录。没有需要的来源，可先安装插件。", "en": "Choose a source, save its required settings, and sign in. Install a plugin if your source is not listed."},
  "SetupGuide.selectSource": {"zh": "选择任务来源", "en": "Choose a task source"},
  "SetupGuide.sourceConfigured": {"zh": "已配置任务来源：{names}。", "en": "Task sources configured: {names}."},
  "SetupGuide.sourceSkipped": {"zh": "已跳过任务来源，以后可在设置中配置。", "en": "Task sources skipped. You can configure them later in Settings."},
  "SetupGuide.sourceProblem": {"zh": "任务来源同步仍有问题：{reason}", "en": "Task-source sync still has a problem: {reason}"},
  "SetupGuide.findingSessions": {"zh": "正在找你在终端里用过的会话…", "en": "Looking for sessions you ran in a terminal…"},
  "SetupGuide.sessionsNote": {"zh": "导入后保留原来的对话，发消息时外部智能体在原目录里恢复同一个会话接着聊。", "en": "Imported sessions keep their history. Your next message resumes the same session in its original folder."},
  "SetupGuide.skipSessions": {"zh": "从新会话开始", "en": "Start fresh"},
  "ResumableSessions.title": {"zh": "接着聊", "en": "Pick up where you left off"},
  "ResumableSessions.found": {"zh": "在这台电脑上找到 {count} 个 {agents} 会话，挑一个接着聊吧。", "en": "Found {count} {agents} {count, plural, one {session} other {sessions}} on this computer. Pick one to continue."},
  "ResumableSessions.resume": {"zh": "接着聊", "en": "Continue"},
  "ResumableSessions.resumeLabel": {"zh": "接着聊「{title}」", "en": "Continue “{title}”"},
  "ResumableSessions.resuming": {"zh": "正在导入…", "en": "Importing…"},
  "ResumableSessions.viewAll": {"zh": "查看全部", "en": "View all"},
  "SetupGuide.finish": {"zh": "完成检查", "en": "Finish setup"},
  "SetupGuide.noSupportedAgent": {"zh": "当前工作台未提供可检测的外部智能体，请检查连接或更新工作台。", "en": "This workspace provides no detectable external agents. Check the connection or update the workspace."},
  "Readiness.checking": {"zh": "正在读取 Agent 状态", "en": "Reading agent status"},
  "Readiness.unsupported": {"zh": "当前工作台尚未提供这个 Agent 的检测结果", "en": "This workspace has not reported this agent’s status"},
  "Readiness.disabled": {"zh": "Agent 已停用，请先启用", "en": "Agent disabled; enable it first"},
  "Readiness.missing": {"zh": "尚未安装 Agent", "en": "Agent not installed"},
  "Readiness.cli-missing": {"zh": "已发现桌面应用，还需要安装 Agent CLI", "en": "Desktop app found; the agent CLI is still required"},
  "Readiness.incompatible-version": {"zh": "当前版本与 Antumi 不兼容，需要更新", "en": "This version is incompatible with Antumi; update it"},
  "Readiness.probe-failed": {"zh": "已找到 Agent，但未能完成启动或版本检测", "en": "Agent found, but its launch or version check failed"},
  "Readiness.needs-check": {"zh": "已找到 Agent，启动和兼容性尚未确认", "en": "Agent found; launch and compatibility are not yet confirmed"},
  "Readiness.needs-account": {"zh": "需要登录账号", "en": "Sign in to an account"},
  "Readiness.needs-provider": {"zh": "需要配置模型服务商", "en": "Configure a model provider"},
  "Readiness.unknown-auth": {"zh": "已安装，原生账号或服务商配置尚未确认", "en": "Installed; native account or provider setup is not yet confirmed"},
  "Readiness.authorize-on-use": {"zh": "已安装，首次使用时会在浏览器请求授权", "en": "Installed; browser authorization is requested on first use"},
  "Readiness.accountReady": {"zh": "环境已就绪", "en": "Environment ready"},
  "Readiness.providerReady": {"zh": "服务商已配置", "en": "Provider configured"},
  "SkillsSettingsSection.activationMode": { "zh": "启用方式", "en": "Activation" },
  "SkillsSettingsSection.enableAll": { "zh": "全部启用", "en": "Enable all" },
  "SkillsSettingsSection.selectSkills": { "zh": "自选技能", "en": "Choose skills" },
  "SkillsSettingsSection.agentScope": { "zh": "适用 Agent", "en": "Applies to" },
  "SkillsSettingsSection.allCompatibleAgents": { "zh": "全部兼容 Agent", "en": "All compatible agents" },
  "SkillsSettingsSection.specificAgents": { "zh": "指定 Agent", "en": "Selected agents" },
  "SkillsSettingsSection.selectAll": { "zh": "全选", "en": "Select all" },
  "SkillsSettingsSection.futureAgents": { "zh": "自动包含当前及以后新增支持技能的 Agent。", "en": "Includes current and future agents that support skills." },
  "SkillsSettingsSection.unsupported": { "zh": "暂不支持", "en": "Not supported yet" },
  "SkillsSettingsSection.noAgents": { "zh": "未选择 Agent，这个仓库的技能暂不加载。", "en": "No agents selected. Skills from this repository will not be loaded." },
  "SkillsSettingsSection.skills": { "zh": "技能", "en": "Skills" },
  "SkillsSettingsSection.conflicts": { "zh": "同名技能在同一 Agent 中只能保留一个来源。请调整所选技能、适用 Agent，或管理下列来源后再保存。", "en": "An agent can use only one source for a skill name. Adjust the skills or agents, or manage the sources below before saving." },
  "SkillsSettingsSection.manageSource": { "zh": "管理 {name}", "en": "Manage {name}" },
  "SkillsSettingsSection.activationTiming": { "zh": "下次启动 Agent 时生效，已运行的会话保留当前技能。", "en": "Applies at the next agent start. Running sessions keep their current skills." },
  "SkillsSettingsSection.enabledCount": { "zh": "{count}/{total} 已选择", "en": "{count}/{total} selected" },
  "SkillsSettingsSection.configure": { "zh": "启用设置", "en": "Activation settings" },
  "SkillsSettingsSection.specificAgentCount": { "zh": "指定 {count} 个 Agent", "en": "{count} selected agents" },
  "SkillsSettingsSection.legacyActivation": { "zh": "沿用知识库设置；修改启用设置后按此配置加载。", "en": "Uses existing knowledge-base settings until activation is configured here." },
  "SkillsSettingsSection.updatePreview": { "zh": "更新预览", "en": "Update preview" },
  "SkillsSettingsSection.added": { "zh": "新增", "en": "Added" },
  "SkillsSettingsSection.removed": { "zh": "移除", "en": "Removed" },
  "SkillsSettingsSection.changed": { "zh": "修改", "en": "Changed" },
  "SkillsSettingsSection.updateAllHint": { "zh": "全部启用：新增的可用技能会在确认更新后启用。更新失败保留原版本，成功后可回退。", "en": "Enable all: new usable skills become active after you confirm the update. Failed updates keep the original version; successful updates can be rolled back." },
  "SkillsSettingsSection.updateSelectedHint": { "zh": "自选技能：新增技能默认关闭，保留已有选择。更新失败保留原版本，成功后可回退。", "en": "Choose skills: new skills stay off and existing selections are kept. Failed updates keep the original version; successful updates can be rolled back." },
  "SkillsSettingsSection.confirmUnavailable": { "zh": "确认更新，同时停用已移除或失效的技能：{names}", "en": "Confirm the update and deactivate removed or unusable skills: {names}" },
  "SkillsSettingsSection.discover": { "zh": "发现技能", "en": "Discover skills" },
  "labels.skillSelectionInvalid": { "zh": "技能或 Agent 选择无效", "en": "Invalid skill or agent selection" },
  "labels.skillUpdateConfirmation": { "zh": "更新会停用已启用的技能，请查看更新预览并确认", "en": "This update deactivates enabled skills. Review and confirm the update preview" },
  "Pet.builtin": {"zh": "随应用提供", "en": "Included"},
  "Pet.installed": {"zh": "已下载 · 点击使用", "en": "Downloaded · Use"},
  "Pet.downloadAndUse": {"zh": "下载并使用 · {size} KiB", "en": "Download & use · {size} KiB"},
  "Pet.updateAndUse": {"zh": "更新并使用", "en": "Update & use"},
  "Pet.downloading": {"zh": "正在下载 {percent}%", "en": "Downloading {percent}%"},
  "Pet.downloadProgress": {"zh": "宠物下载进度", "en": "Pet download progress"},
  "Pet.cancelDownload": {"zh": "取消下载", "en": "Cancel download"},
  "Pet.remove": {"zh": "移除下载", "en": "Remove download"},
  "Pet.downloadFailed": {"zh": "下载或加载失败，已保留原宠物，请稍后重试。", "en": "Could not download or load this pet. Your current pet is unchanged. Try again later."},
  "Pet.downloadFailedBecause": {"zh": "下载或加载失败，已保留原宠物：{reason}", "en": "Could not download or load this pet. Your current pet is unchanged: {reason}"},
  "Pet.removeFailed": {"zh": "未能移除宠物，请稍后重试。", "en": "Could not remove this pet. Try again later."},
  "Pet.downloadUnavailable": {"zh": "连接支持宠物下载的工作台后，可下载其他宠物。", "en": "Connect to a workspace that supports pet downloads to install more pets."},
  "Pet.title": { "zh": "Pet · 宠物", "en": "Pet" },
  "Pet.description": { "zh": "选择陪你工作的小伙伴，调整风格、大小和活跃程度。", "en": "Choose a companion and adjust its style, size, and activity." },
  "Pet.style": { "zh": "宠物风格", "en": "Pet style" },
  "Pet.createYourOwn": { "zh": "创作自己的宠物", "en": "Create your own pet" },
  "Pet.creationDescription": { "zh": "了解素材规格、动作排列，以及如何制作、预览和分享。", "en": "Learn the artwork requirements, pose layout, and how to build, preview, and share a pet." },
  "Pet.copyCreationGuide": { "zh": "复制创作指南", "en": "Copy creation guide" },
  "Pet.clay": { "zh": "Antumi · 软陶", "en": "Antumi · Clay" },
  "Pet.clayDescription": { "zh": "圆润、好奇的橙色小探险家", "en": "A round, curious orange explorer" },
  "Pet.moss": { "zh": "MOSS · 毛毡", "en": "MOSS · Felt" },
  "Pet.mossDescription": { "zh": "柔软、安静的薄荷绿小伙伴", "en": "A soft, quiet mint-green companion" },
  "Pet.zip": { "zh": "ZIP · 漫画", "en": "ZIP · Comic" },
  "Pet.zipDescription": { "zh": "机灵、调皮的多彩漫画小蚁", "en": "A clever, playful, colorful cartoon ant" },
  "Pet.activity": { "zh": "活跃程度", "en": "Activity" },
  "Pet.activityDescription": { "zh": "关闭后隐藏宠物；安静时以休息为主，活泼时更常探索界面。", "en": "Off hides the pet. Quiet favors resting; lively explores more often." },
  "Pet.off": { "zh": "关闭", "en": "Off" },
  "Pet.quiet": { "zh": "安静", "en": "Quiet" },
  "Pet.medium": { "zh": "适中", "en": "Balanced" },
  "Pet.lively": { "zh": "活泼", "en": "Lively" },
  "Pet.size": { "zh": "宠物大小", "en": "Pet size" },
  "Pet.sizeDescription": { "zh": "立即应用到窗口里的宠物。", "en": "Applies immediately to the companion in your window." },
  "Pet.running": { "zh": "工作", "en": "Work" },
  "Pet.waiting": { "zh": "等你", "en": "Waiting" },
  "Pet.review": { "zh": "查看", "en": "Review" },
  "Pet.failed": { "zh": "失落", "en": "Sad" },
  "Pet.peek": { "zh": "探头", "en": "Peek" },
  "Pet.waving": { "zh": "挥手", "en": "Wave" },
  "Pet.ariaName": { "zh": "宠物，点击互动或拖动更换位置", "en": "Pet: click to interact or drag to move" },
  "Pet.dismiss": { "zh": "关闭提示", "en": "Dismiss message" },
  "Pet.awaiting": { "zh": "「{title}」在等你回答", "en": "“{title}” needs your input" },
  "Pet.crashed": { "zh": "「{title}」需要你看看", "en": "“{title}” needs a look" },
  "UsageAnalytics.identityPaused": { "zh": "账号身份已改变或尚未识别，自动化已暂停；登录并重新保存配置后生效。", "en": "The account identity changed or is unknown. Automation is paused; sign in and save the policy again." },
  "UsageAnalytics.retryReset": { "zh": "核实并重试上次用卡", "en": "Check and retry the same reset" },
  "UsageAnalytics.unallocated": { "zh": "{count} 个会话只有累计用量（{tokens} token），未计入范围汇总与每日趋势。", "en": "{count} sessions have cumulative usage only ({tokens} tokens), excluded from range totals and daily trends." },
  "agentCli.targetNotReached": { "zh": "检测到版本变化，但未达到目标版本；请查看输出并重新检查。", "en": "The version changed but did not reach the target. Review output and check again." },
  "agentCli.checking": {"zh": "正在检查 CLI 版本…", "en": "Checking CLI version…"},
  "agentCli.channelNative": {"zh": "官方安装", "en": "Official installer"},
  "agentCli.channelNpm": {"zh": "npm 全局安装", "en": "npm global"},
  "agentCli.channelPnpm": {"zh": "pnpm 全局安装", "en": "pnpm global"},
  "agentCli.channelBun": {"zh": "bun 全局安装", "en": "bun global"},
  "agentCli.channelHomebrew": {"zh": "Homebrew 安装", "en": "Homebrew"},
  "agentCli.channelDesktop": {"zh": "桌面应用内置", "en": "Desktop app"},
  "agentCli.openConversation": {"zh": "打开会话：{title}", "en": "Open conversation: {title}"},
  "agentCli.cancel": {"zh": "停止升级", "en": "Stop upgrade"},
  "agentCli.starting": {"zh": "准备升级…", "en": "Preparing upgrade…"},
  "agentCli.upgrade": {"zh": "升级", "en": "Upgrade"},
  "agentCli.checkUpgrade": {"zh": "检查并升级", "en": "Check and upgrade"},
  "agentCli.checkUpgradeHint": {"zh": "检查新版本，有更新时自动安装", "en": "Checks for new versions and installs automatically"},
  "agentCli.orRunInTerminal": {"zh": "也可在终端运行：", "en": "Or run in a terminal:"},
  "agentCli.upgradeUnavailableInApp": {"zh": "当前无法在 Antumi 内升级，可在终端运行：", "en": "Upgrades are unavailable in Antumi. Run in a terminal:"},
  "agentCli.backendOutdatedUpgradeHint": {"zh": "当前后台暂不支持在应用内升级，可在终端运行：", "en": "This backend does not support in-app upgrades. Run in a terminal:"},
  "agentCli.check": {"zh": "检查更新", "en": "Check for updates"},
  "agentCli.output": {"zh": "查看升级输出", "en": "View upgrade output"},
  "agentCli.manual": {"zh": "无法确认可自动升级的安装来源，请按原安装方式手动升级。", "en": "The installation source could not be verified for automatic upgrades. Upgrade using the original installation method."},
  "agentCli.running": {"zh": "正在升级…", "en": "Upgrading…"},
  "agentCli.succeeded": {"zh": "升级成功，已验证新版本", "en": "Upgrade complete; new version verified"},
  "agentCli.unchanged": {"zh": "版本未变化", "en": "Version unchanged"},
  "agentCli.cancelled": {"zh": "升级已停止", "en": "Upgrade stopped"},
  "agentCli.failed": {"zh": "升级或检查未完成", "en": "Upgrade or check incomplete"},
  "agentCli.current": {"zh": "已是最新稳定版本或更新版本", "en": "At or above the latest stable version"},
  "agentCli.available": {"zh": "有新版本可用", "en": "Update available"},
  "agentCli.appManaged": {"zh": "随所属桌面应用更新，请更新该应用", "en": "Managed by its desktop app; update that app"},
  "agentCli.selfManaged": {"zh": "由工具检查最新版本并升级", "en": "Updates checked and installed by the tool"},
  "agentCli.missing": {"zh": "未找到 CLI", "en": "CLI not found"},
  "agentCli.unknown": {"zh": "暂时无法确认最新版本", "en": "Latest version could not be confirmed"},
  "agentCli.latestUncompared": {"zh": "已查到最新版本 {version}，尚未完成版本比较", "en": "Latest version {version} found; version comparison is incomplete"},
  "agentCli.updateTo": {"zh": "可更新至 {version}", "en": "Update available: {version}"},
  "agentCli.backendNotice": {"zh": "当前暂时无法在这里升级 Agent，不影响已安装 Agent 的使用。", "en": "Agent upgrades are currently unavailable here. Installed agents can still be used."},
  "agentCli.backendNoticeDetails": {"zh": "正在运行的 Antumi 后台尚不支持升级。重启后台会中断 Agent 进程，需要等运行中的工作结束后再处理；只关闭窗口不会重启后台。", "en": "The running Antumi backend does not support upgrades yet. Restarting it interrupts agent processes, so ongoing work must finish first. Closing the window does not restart the backend."},
  "InstalledAgentsSettings.details": {"zh": "详情", "en": "Details"},
  "InstalledAgentsSettings.ready": {"zh": "已就绪", "en": "Ready"},
  "InstalledAgentsSettings.needsSignIn": {"zh": "需登录", "en": "Sign-in required"},
  "InstalledAgentsSettings.needsCheck": {"zh": "需检查", "en": "Needs checking"},
  "InstalledAgentsSettings.signInUnknown": {"zh": "尚未确认登录状态", "en": "Sign-in status has not been confirmed"},
  "agentCli.active": {"zh": "该 Agent 仍有进程在运行（包括空闲会话、登录或临时调用），退出后再升级。", "en": "This agent still has a running process, including idle chats, sign-in, or temporary calls. Exit it before upgrading."},
  "agentCli.busy": {"zh": "另一个 CLI 升级正在进行，请稍后重试。", "en": "Another CLI upgrade is in progress. Try again later."},
  "agentCli.daemonOutdated": {"zh": "当前后台版本不支持升级；待运行中的工作结束后重启 Antumi 后台。", "en": "This backend does not support upgrades. Restart the Antumi backend after running work has finished."},
  "agentCli.changed": {"zh": "CLI 路径或安装来源已变化，请重新检查更新。", "en": "The CLI path or installation source changed. Check for updates again."},
  "agentCli.network": {"zh": "未能查询最新版本，请检查网络后重试。", "en": "Could not query the latest version. Check your connection and retry."},
  "agentCli.unchangedHint": {"zh": "命令已完成，但版本未变化；请查看输出确认安装状态。", "en": "The command finished but the version did not change. Review the output to confirm installation status."},
  "agentCli.unverified": {"zh": "升级后无法验证版本，请查看输出并重新检测。", "en": "The version could not be verified after upgrading. Review the output and scan again."},
  "agentCli.timeout": {"zh": "升级超过 5 分钟，已请求停止；请查看输出后重试。", "en": "The upgrade exceeded 5 minutes and was asked to stop. Review the output before retrying."},
  "agentCli.disconnected": {"zh": "后台连接已断开，重连后将恢复升级状态。", "en": "Backend disconnected. Upgrade status will recover after reconnection."},
  "agentCli.interrupted": {"zh": "未找到升级进程，无法确认结果；请重新检查版本。", "en": "The upgrade process could not be found. Check the version again."},
  "agentCli.failedHint": {"zh": "命令未成功完成，请查看终端输出检查网络、权限或文件占用后重试。", "en": "The command did not complete successfully. Review terminal output for connection, permission, or file-lock errors before retrying."},

  "sidebar.toggleSection": { "zh": "{action}{label}", "en": "{action} {label}" },
  "sidebar.tasks": { "zh": "任务", "en": "Tasks" },
  "sidebar.conversations": { "zh": "会话", "en": "Conversations" },
  "squad.leaderReadOnly": { "zh": "队长必须是只读成员", "en": "The team lead must be a read-only member" },
  "squad.developerRequired": { "zh": "至少需要一名开发成员", "en": "At least one developer is required" },
  "squad.memberDuplicate": { "zh": "成员标识和名称不能重复", "en": "Member IDs and names must be unique" },
  "SettingsPage.theme": { "zh": "主题", "en": "Theme" },
  "common.off": { "zh": "关闭", "en": "Off" },
  "language.interfaceLanguage": {
    "zh": "界面语言",
    "en": "Interface language"
  },
  "language.description": {
    "zh": "跟随系统或手动选择，仅改变应用界面，不影响 Agent 回复与翻译设置。",
    "en": "Follow the system or choose a language. Applies to the interface; Agent replies and translation settings remain independent."
  },
  "App.chooseOrCreateAGroupChat": {
    "zh": "选择或新建一个群聊",
    "en": "Choose or create a group chat"
  },
  "App.chooseOrCreateAConversation": {
    "zh": "选择或新建一条会话",
    "en": "Choose or create a conversation"
  },
  "approvalChoiceText.thisRun": {
    "zh": "这次运行内",
    "en": "This run"
  },
  "approvalChoiceText.futureRunsInThisProject": {
    "zh": "本项目以后",
    "en": "Future runs in this project"
  },
  "approvalChoiceText.futureRunsInAllProjects": {
    "zh": "所有项目以后",
    "en": "Future runs in all projects"
  },
  "approvalChoiceText.futureRuns": {
    "zh": "以后",
    "en": "Future runs"
  },
  "approvalChoiceText.expiresWhenTheAgentStopsOrRestarts": {
    "zh": "Agent 停下或重启后就失效",
    "en": "Expires when the Agent stops or restarts"
  },
  "approvalChoiceText.savedToThisProjectSClaudeSettingsLocal": {
    "zh": "写进本项目的 .claude/settings.local.json（Git 忽略），之后的会话也生效",
    "en": "Saved to this project's .claude/settings.local.json (ignored by Git), including future conversations"
  },
  "approvalChoiceText.savedToThisProjectSClaudeSettingsJson": {
    "zh": "写进本项目的 .claude/settings.json，会随仓库提交",
    "en": "Saved to this project's .claude/settings.json and committed with the repository"
  },
  "approvalChoiceText.savedToClaudeSettingsJsonForAllProjects": {
    "zh": "写进 ~/.claude/settings.json，所有项目都生效",
    "en": "Saved to ~/.claude/settings.json for all projects"
  },
  "approvalChoiceText.savedInTheAgentSRulesIncludingFuture": {
    "zh": "记进 Agent 自己的规则，之后的会话也生效",
    "en": "Saved in the Agent's rules, including future conversations"
  },
  "approvalChoiceText.andItemsInTotal": {
    "zh": "{shown} 等 {value2} 项",
    "en": "{shown} and {value2} {value2, plural, one {item} other {items}} in total"
  },
  "approvalChoiceText.donTAskForCommandsStartingWith": {
    "zh": "以 {value1} 开头的命令不再问",
    "en": "Don't ask for commands starting with {value1}"
  },
  "approvalChoiceText.neverAllow": {
    "zh": "都不许用 {what}",
    "en": "Never allow {what}"
  },
  "approvalChoiceText.alwaysAskBefore": {
    "zh": "{what} 每次都先问",
    "en": "Always ask before {what}"
  },
  "approvalChoiceText.donTAskBefore": {
    "zh": "{what} 不再问",
    "en": "Don't ask before {what}"
  },
  "approvalChoiceText.switchToMode": {
    "zh": "改用「{value1}」模式",
    "en": "Switch to “{value1}” mode"
  },
  "approvalChoiceText.donTAskToAccess": {
    "zh": "访问 {what} 不再问",
    "en": "Don't ask to access {what}"
  },
  "approvalChoiceText.donTAskForThisCommand": {
    "zh": "这条命令不再问",
    "en": "Don't ask for this command"
  },
  "approvalChoiceText.donTAskToEdit": {
    "zh": "改 {what} 不再问",
    "en": "Don't ask to edit {what}"
  },
  "approvalChoiceText.donTAskToEditTheseFiles": {
    "zh": "改这些文件不再问",
    "en": "Don't ask to edit these files"
  },
  "approvalChoiceText.neverAllowAccessTo": {
    "zh": "都不许访问 {what}",
    "en": "Never allow access to {what}"
  },
  "approvalChoiceText.additionalRulesSuggestedByTheAgent": {
    "zh": "还有 Agent 建议的其他规则",
    "en": "Additional rules suggested by the Agent"
  },
  "approvalChoiceText.deny": {
    "zh": "拒绝",
    "en": "Deny"
  },
  "approvalChoiceText.allowOnce": {
    "zh": "允许这一次",
    "en": "Allow once"
  },
  "approvalChoiceText.allow": {
    "zh": "允许",
    "en": "Allow"
  },
  "approvalChoiceText.denyAndRemember": {
    "zh": "拒绝并记住",
    "en": "Deny and remember"
  },
  "approvalChoiceText.allowAndRemember": {
    "zh": "允许并记住",
    "en": "Allow and remember"
  },
  "approvalChoiceText.denied": {
    "zh": "已拒绝",
    "en": "Denied"
  },
  "approvalChoiceText.allowed": {
    "zh": "已允许",
    "en": "Allowed"
  },
  "attachmentImages.exceeds10mbAndWasNotAdded": {
    "zh": "「{value1}」超过 10MB，没有添加",
    "en": "“{value1}” exceeds 10MB and was not added"
  },
  "attention.agentExitedUnexpectedlyCodeSendAMessageTo": {
    "zh": "Agent 异常退出（code {value1}），发消息会重新启动它",
    "en": "Agent exited unexpectedly (code {value1}). Send a message to restart it"
  },
  "attention.agentNeedsYourApprovalOrAnswer": {
    "zh": "Agent 在等你允许或回答",
    "en": "Agent needs your approval or answer"
  },
  "attention.agentFinishedThisTurnAndHasAQuestion": {
    "zh": "Agent 这一轮做完了，有个问题等你回答",
    "en": "Agent finished this turn and has a question for you"
  },
  "attention.agentFinishedThisTurn": {
    "zh": "Agent 这一轮做完了",
    "en": "Agent finished this turn"
  },
  "browserActivity.openingPage": {
    "zh": "正在打开页面…",
    "en": "Opening page…"
  },
  "browserActivity.readingPage": {
    "zh": "正在读取页面…",
    "en": "Reading page…"
  },
  "browserActivity.interactingWithPage": {
    "zh": "正在操作页面…",
    "en": "Interacting with page…"
  },
  "browserActivity.typing": {
    "zh": "正在输入内容…",
    "en": "Typing…"
  },
  "browserActivity.scrolling": {
    "zh": "正在滚动页面…",
    "en": "Scrolling…"
  },
  "browserActivity.takingScreenshot": {
    "zh": "正在截取页面…",
    "en": "Taking screenshot…"
  },
  "browserActivity.managingTabs": {
    "zh": "正在管理标签页…",
    "en": "Managing tabs…"
  },
  "browserActivity.waitingForPage": {
    "zh": "正在等待页面…",
    "en": "Waiting for page…"
  },
  "browserActivity.usingBrowser": {
    "zh": "正在操作浏览器…",
    "en": "Using browser…"
  },
  "chatCommands.arguments": {
    "zh": "参数",
    "en": "Arguments"
  },
  "chatNotices.claudeSUsageLimitWasReachedResets": {
    "zh": "Claude 的用量到了上限，{value1}{time} 恢复",
    "en": "Claude's usage limit was reached. Resets {value1}{time}"
  },
  "chatState.listedToDos": {
    "zh": "列出 {value1} 项待办",
    "en": "Listed {value1} to-dos"
  },
  "chatState.completed": {
    "zh": "完成{value1}",
    "en": "Completed {value1}"
  },
  "chatState.started": {
    "zh": "开始{value1}",
    "en": "Started {value1}"
  },
  "chatState.addedItems": {
    "zh": "新增 {value1} 项",
    "en": "Added {value1} {value1, plural, one {item} other {items}}"
  },
  "chatTools.command": {
    "zh": "命令",
    "en": "Command"
  },
  "chatTools.monitor": {
    "zh": "监视",
    "en": "Monitor"
  },
  "chatTools.read": {
    "zh": "读取",
    "en": "Read"
  },
  "chatTools.viewImage": {
    "zh": "查看图片",
    "en": "View image"
  },
  "chatTools.generateImage": {
    "zh": "生成图片",
    "en": "Generate image"
  },
  "chatTools.write": {
    "zh": "写入",
    "en": "Write"
  },
  "chatTools.edit": {
    "zh": "编辑",
    "en": "Edit"
  },
  "chatTools.editNotebook": {
    "zh": "编辑笔记本",
    "en": "Edit notebook"
  },
  "chatTools.modifyFiles": {
    "zh": "修改文件",
    "en": "Modify files"
  },
  "chatTools.mcpTool": {
    "zh": "MCP 工具",
    "en": "MCP tool"
  },
  "chatTools.search": {
    "zh": "搜索",
    "en": "Search"
  },
  "chatTools.findFiles": {
    "zh": "查找文件",
    "en": "Find files"
  },
  "chatTools.readPage": {
    "zh": "读取网页",
    "en": "Read page"
  },
  "chatTools.searchWeb": {
    "zh": "搜索网页",
    "en": "Search web"
  },
  "chatTools.subAgent": {
    "zh": "子 Agent",
    "en": "Sub-agent"
  },
  "chatTools.toDos": {
    "zh": "待办",
    "en": "To-dos"
  },
  "chatTools.plan": {
    "zh": "计划",
    "en": "Plan"
  },
  "chatTools.openWebsite": {
    "zh": "打开网站",
    "en": "Open website"
  },
  "chatTools.deleteFile": {
    "zh": "删除文件",
    "en": "Delete file"
  },
  "chatTools.moveFile": {
    "zh": "移动文件",
    "en": "Move file"
  },
  "chatTools.thinking": {
    "zh": "思考",
    "en": "Thinking"
  },
  "chatTools.openPage": {
    "zh": "打开页面",
    "en": "Open page"
  },
  "chatTools.pageSnapshot": {
    "zh": "页面快照",
    "en": "Page snapshot"
  },
  "chatTools.screenshot": {
    "zh": "截图",
    "en": "Screenshot"
  },
  "chatTools.click": {
    "zh": "点击",
    "en": "Click"
  },
  "chatTools.type": {
    "zh": "输入",
    "en": "Type"
  },
  "chatTools.pressKey": {
    "zh": "按键",
    "en": "Press key"
  },
  "chatTools.hover": {
    "zh": "悬停",
    "en": "Hover"
  },
  "chatTools.scroll": {
    "zh": "滚动",
    "en": "Scroll"
  },
  "chatTools.select": {
    "zh": "选择",
    "en": "Select"
  },
  "chatTools.wait": {
    "zh": "等待",
    "en": "Wait"
  },
  "chatTools.tabs": {
    "zh": "标签页",
    "en": "Tabs"
  },
  "chatTools.console": {
    "zh": "控制台",
    "en": "Console"
  },
  "chatTools.runInTerminal": {
    "zh": "在终端运行",
    "en": "Run in terminal"
  },
  "chatTools.readTerminal": {
    "zh": "读终端",
    "en": "Read terminal"
  },
  "chatTools.stopTerminal": {
    "zh": "停终端",
    "en": "Stop terminal"
  },
  "chatTools.listToDos": {
    "zh": "查看待办",
    "en": "List to-dos"
  },
  "chatTools.addToDo": {
    "zh": "记下待办",
    "en": "Add to-do"
  },
  "chatTools.completeToDo": {
    "zh": "勾掉待办",
    "en": "Complete to-do"
  },
  "chatTools.preview": {
    "zh": "预览",
    "en": "Preview"
  },
  "chatTools.viewAntumiRecords": {
    "zh": "查看 Antumi 记录",
    "en": "View Antumi records"
  },
  "chatTools.readAntumiRecords": {
    "zh": "读取 Antumi 记录",
    "en": "Read Antumi records"
  },
  "chatTools.readFiles": {
    "zh": "读取 {count} 个文件",
    "en": "Read {count} {count, plural, one {file} other {files}}"
  },
  "chatTools.searchedTimes": {
    "zh": "搜索 {count} 次",
    "en": "Searched {count} {count, plural, one {time} other {times}}"
  },
  "chatTools.ranCommands": {
    "zh": "运行 {count} 个命令",
    "en": "Ran {count} {count, plural, one {command} other {commands}}"
  },
  "chatTools.readPages": {
    "zh": "读取 {count} 个网页",
    "en": "Read {count} {count, plural, one {page} other {pages}}"
  },
  "chatTools.usedBrowserTimes": {
    "zh": "浏览器操作 {count} 次",
    "en": "Used browser {count} {count, plural, one {time} other {times}}"
  },
  "chatTools.times": {
    "zh": "{value1} {count} 次",
    "en": "{value1} {count} {count, plural, one {time} other {times}}"
  },
  "chatTools.s": {
    "zh": "{value1} 秒",
    "en": "{value1}s"
  },
  "chatTools.s_98": {
    "zh": "{seconds} 秒",
    "en": "{seconds}s"
  },
  "chatTools.mS": {
    "zh": "{minutes} 分 {value2} 秒",
    "en": "{minutes}m {value2}s"
  },
  "chatTools.min": {
    "zh": "{minutes} 分钟",
    "en": "{minutes} min"
  },
  "chatTools.hM": {
    "zh": "{value1} 小时 {value2} 分",
    "en": "{value1}h {value2}m"
  },
  "chatTools.h": {
    "zh": "{value1} 小时",
    "en": "{value1}h"
  },
  "codeRun.terminalIsNotReadyTryAgainShortly": {
    "zh": "终端还没准备好，稍后再试",
    "en": "Terminal is not ready. Try again shortly"
  },
  "ActivityHeatmap.mon": {
    "zh": "一",
    "en": "Mon"
  },
  "ActivityHeatmap.wed": {
    "zh": "三",
    "en": "Wed"
  },
  "ActivityHeatmap.fri": {
    "zh": "五",
    "en": "Fri"
  },
  "ActivityHeatmap.sun": {
    "zh": "日",
    "en": "Sun"
  },
  "ActivityHeatmap.activity": {
    "zh": "活跃度",
    "en": "Activity"
  },
  "ActivityHeatmap.activeOnDaysOverThePastYearLongest": {
    "zh": "过去一年 {active} 天有运行、对话或轻量请求 · 最长连续 {longest} 天",
    "en": "Active on {active} {active, plural, one {day} other {days}} over the past year · Longest streak: {longest} {longest, plural, one {day} other {days}}"
  },
  "ActivityHeatmap.taskRunsConversationTurnsQuickRequests": {
    "zh": "{value1} · 任务运行 {value2} · 对话回合 {value3} · 轻量请求 {value4}",
    "en": "{value1} · Task runs {value2} · Conversation turns {value3} · Quick requests {value4}"
  },
  "ActivityHeatmap.lessmore": {
    "zh": "少{value1}多",
    "en": "Less{value1}More"
  },
  "AgentModelPicker.model": {
    "zh": "模型",
    "en": "Model"
  },
  "AgentModelPicker.loadingModels": {
    "zh": "正在读取模型…",
    "en": "Loading models…"
  },
  "AgentModelPicker.agentDefaultModel": {
    "zh": "Agent 默认模型",
    "en": "Agent default model"
  },
  "AgentPicker.chooseAgent": {
    "zh": "选择 Agent",
    "en": "Choose Agent"
  },
  "AgentPicker.recommended": {
    "zh": "推荐",
    "en": "Recommended"
  },
  "AgentPicker.notInstalled": {
    "zh": "未安装",
    "en": "Not installed"
  },
  "AgentPicker.unspecified": {
    "zh": "不指定",
    "en": "Unspecified"
  },
  "AgentPicker.agentCannotChangeNow": {
    "zh": "Agent：{value1}（这时不能换）",
    "en": "Agent: {value1} (cannot change now)"
  },
  "AgentPicker.notSelected": {
    "zh": "未选择",
    "en": "Not selected"
  },
  "AgentQuota.mayBeOutdated": {
    "zh": " · 可能已过时",
    "en": " · May be outdated"
  },
  "AgentQuota.resets": {
    "zh": " · {value1} 重置",
    "en": " · Resets {value1}"
  },
  "AgentQuota.limitReached": {
    "zh": "{value1} 已用完{reset}{stale}",
    "en": "{value1} limit reached{reset}{stale}"
  },
  "AgentQuota.remaining": {
    "zh": "剩 {value1}%",
    "en": "{value1}% remaining"
  },
  "AgentQuota.used": {
    "zh": "已用 {used}%",
    "en": "{used}% used"
  },
  "AgentQuota.stillHasQuotaYouCanSwitchToIt": {
    "zh": "\n{value1} 还有额度{value2}，可以先换成它。",
    "en": "\n{value1} still has quota{value2}. You can switch to it first."
  },
  "AgentQuota.youCanAlsoCancelAndUseTheClock": {
    "zh": "\n也可以取消，点旁边的时钟按钮预约，额度恢复后自动开始。",
    "en": "\nYou can also cancel and use the clock button to schedule a start when quota resets."
  },
  "AgentQuota.hasUsedItsQuotaStartWithAnyway": {
    "zh": "{value1} 已用完{value2}额度{value3}。{suggestion}{later}\n\n仍要用 {value6} 启动吗？",
    "en": "{value1} has used its {value2}quota{value3}.{suggestion}{later}\n\nStart with {value6} anyway?"
  },
  "ArchivedBar.thisIsArchivedAndCanOnlyBeViewed": {
    "zh": "这个{what}已归档，只能查看。",
    "en": "This {what} is archived and can only be viewed."
  },
  "ArchivedBar.unarchive": {
    "zh": "取消归档",
    "en": "Unarchive"
  },
  "AutoArchiveSettings.automaticallyArchiveInactiveConversations": {
    "zh": "自动归档不活跃的会话",
    "en": "Automatically archive inactive conversations"
  },
  "AutoArchiveSettings.archiveConversationsWithNoRecentMessagesFindThem": {
    "zh": "长时间没有新消息的会话移到归档，随时可以在会话列表的归档里找回。置顶的会话、任务和群聊里的会话不归档；Agent 正在工作，或在等你批准、回答问题的，等这一步结束再归档。",
    "en": "Archive conversations with no recent messages. Find them in the conversation list's archive anytime. Pinned conversations, task chats, and group chats are excluded. Working Agents and those awaiting approval or an answer are archived after that step finishes."
  },
  "AutoArchiveSettings.inactivityPeriod": {
    "zh": "多久没有活跃",
    "en": "Inactivity period"
  },
  "AutoArchiveSettings.measuredFromTheLastMessageOrWhenYou": {
    "zh": "从最后一条消息，或你把它从归档里取出时算起。",
    "en": "Measured from the last message or when you unarchived the conversation."
  },
  "AutoArchiveSettings.days": {
    "zh": "{each} 天",
    "en": "{each} {each, plural, one {day} other {days}}"
  },
  "BackdropPicker.close": {
    "zh": "关闭",
    "en": "Close"
  },
  "BackdropPicker.disableGradientBackground": {
    "zh": "关闭渐变背景",
    "en": "Disable gradient background"
  },
  "BackdropPicker.fromTheSlackThemeOfTheSameName": {
    "zh": "{name}：取自 Slack 的同名主题",
    "en": "{name}: from the Slack theme of the same name"
  },
  "BackdropPicker.fromSlackSTheme": {
    "zh": "取自 Slack 的 {name} 主题",
    "en": "From Slack's {name} theme"
  },
  "BranchStatus.noGitBranch": {
    "zh": "无 Git 分支",
    "en": "No Git branch"
  },
  "BranchStatus.detachedHead": {
    "zh": "{value1}（分离 HEAD）",
    "en": "{value1} (detached HEAD)"
  },
  "BranchStatus.copied": {
    "zh": "已复制",
    "en": "Copied"
  },
  "BranchStatus.copyBranchName": {
    "zh": "复制分支名",
    "en": "Copy branch name"
  },
  "BranchStatus.noGit": {
    "zh": "无 Git",
    "en": "No Git"
  },
  "BranchStatus.detachedHead_145": {
    "zh": "{branch}（分离 HEAD）",
    "en": "{branch} (detached HEAD)"
  },
  "BranchStatus.detached": {
    "zh": "分离",
    "en": "Detached"
  },
  "BranchStatus.primaryProject": {
    "zh": "主项目",
    "en": "Primary project"
  },
  "BranchStatus.additionalProject": {
    "zh": "附加项目{value1}",
    "en": "Additional project{value1}"
  },
  "BranchStatus.clean": {
    "zh": "干净",
    "en": "Clean"
  },
  "BranchStatus.changes": {
    "zh": "{value1} 个改动",
    "en": "{value1} {value1, plural, one {change} other {changes}}"
  },
  "BranchStatus.noUpstreamBranch": {
    "zh": "没有跟踪远程分支",
    "en": "No upstream branch"
  },
  "BranchStatus.commitsAhead": {
    "zh": "领先 {ahead} 个提交",
    "en": "{ahead} {ahead, plural, one {commit} other {commits}} ahead"
  },
  "BranchStatus.commitsBehind": {
    "zh": "落后 {behind} 个提交",
    "en": "{behind} {behind, plural, one {commit} other {commits}} behind"
  },
  "BranchStatus.upToDate": {
    "zh": "已同步",
    "en": "Up to date"
  },
  "BranchStatus.aheadBehindIsBasedOnTheLastFetched": {
    "zh": "领先 / 落后按上次 fetch 到的远程计算",
    "en": "Ahead / behind is based on the last fetched remote state"
  },
  "BranchStatus.primaryProjectViewGitStatus": {
    "zh": "主项目 {value1}：{value2}{value3}，查看 git 状态",
    "en": "Primary project {value1}: {value2}{value3}, view Git status"
  },
  "BranchStatus.withUncommittedChanges": {
    "zh": "，有未提交的改动",
    "en": ", with uncommitted changes"
  },
  "BranchStatus.gitStatus": {
    "zh": "git 状态",
    "en": "Git status"
  },
  "BrowserBookmarks.bookmarks": {"zh":"收藏","en":"Bookmarks"},
  "BrowserBookmarks.bookmarkThisPage": {"zh":"收藏这个页面","en":"Bookmark this page"},
  "BrowserBookmarks.removeBookmark": {"zh":"取消收藏","en":"Remove bookmark"},
  "BrowserBookmarks.deleteBookmark": {"zh":"删除收藏 {title}","en":"Delete bookmark {title}"},
  "BrowserBookmarks.searchBookmarks": {"zh":"搜索收藏，回车打开第一个","en":"Search bookmarks, Enter opens the first"},
  "BrowserBookmarks.noBookmarksYet": {"zh":"还没有收藏。点地址栏的星标收藏当前页面，或从其他浏览器导入。","en":"No bookmarks yet. Click the star in the address bar to keep a page, or import from another browser."},
  "BrowserBookmarks.noMatchingBookmarks": {"zh":"没有匹配的收藏","en":"No matching bookmarks"},
  "BrowserBookmarks.moreBookmarks": {"zh":"还有 {count} 个，搜索可以缩小范围","en":"{count} more. Search to narrow them down."},
  "BrowserBookmarks.importFromOtherBrowsers": {"zh":"从其他浏览器导入…","en":"Import from other browsers…"},
  "BrowserBookmarks.importBookmarks": {"zh":"导入收藏","en":"Import bookmarks"},
  "BrowserBookmarks.lookingForBrowsers": {"zh":"正在查找本机的浏览器…","en":"Looking for browsers on this computer…"},
  "BrowserBookmarks.noBrowserBookmarksFound": {"zh":"本机没有找到 Chrome、Edge、Brave、Arc 等浏览器的收藏。","en":"No bookmarks found from Chrome, Edge, Brave, Arc or similar browsers on this computer."},
  "BrowserBookmarks.profileCount": {"zh":"{profile} · {count} 个","en":"{profile} · {count}"},
  "BrowserBookmarks.fromHtmlFile": {"zh":"从 HTML 文件导入…","en":"Import from HTML file…"},
  "BrowserBookmarks.safariFirefoxExport": {"zh":"Safari、Firefox 等导出的收藏文件","en":"Bookmarks exported from Safari, Firefox and others"},
  "BrowserBookmarks.importedCount": {"zh":"已导入 {added} 个，跳过 {skipped} 个（已收藏或超出上限）","en":"Imported {added}, skipped {skipped} (already kept or over the limit)"},
  "BrowserBookmarks.couldNotReadBookmarks": {"zh":"没能读取这些收藏","en":"Could not read these bookmarks"},
  "BrowserBookmarks.backToBookmarks": {"zh":"返回收藏","en":"Back to bookmarks"},
  "chatTools.findBookmarks": {"zh":"查找收藏","en":"Find bookmarks"},
  "BrowserPanel.newTab": {
    "zh": "新标签页",
    "en": "New tab"
  },
  "BrowserPanel.closeTab": {
    "zh": "关闭标签页 {value1}",
    "en": "Close tab {value1}"
  },
  "BrowserPanel.youAreInControl": {
    "zh": "你在操作",
    "en": "You are in control"
  },
  "BrowserPanel.agentIsInControl": {
    "zh": "Agent 正在操作",
    "en": "Agent is in control"
  },
  "BrowserPanel.loadingPage": {
    "zh": "页面加载中",
    "en": "Loading page"
  },
  "BrowserPanel.keyboardInputGoesToThePage": {
    "zh": "键盘输入发给页面",
    "en": "Keyboard input goes to the page"
  },
  "BrowserPanel.watching": {
    "zh": "观看中",
    "en": "Watching"
  },
  "BrowserPanel.phone390844": {
    "zh": "手机 390×844",
    "en": "Phone 390×844"
  },
  "BrowserPanel.tablet7681024": {
    "zh": "平板 768×1024",
    "en": "Tablet 768×1024"
  },
  "BrowserPanel.desktop1280800": {
    "zh": "桌面 1280×800",
    "en": "Desktop 1280×800"
  },
  "BrowserPanel.wide19201080": {
    "zh": "宽屏 1920×1080",
    "en": "Wide 1920×1080"
  },
  "BrowserPanel.matchPanel": {
    "zh": "跟随面板",
    "en": "Match panel"
  },
  "BrowserPanel.pageMatchesPanelSize": {
    "zh": "页面和面板一样大",
    "en": "Page matches panel size"
  },
  "BrowserPanel.setByAgent": {
    "zh": "Agent 定的",
    "en": "Set by Agent"
  },
  "BrowserPanel.pageSize": {
    "zh": "页面尺寸",
    "en": "Page size"
  },
  "BrowserPanel.pagesAreDisplayedInTheAntumiApp": {
    "zh": "页面在 Antumi 应用里显示",
    "en": "Pages are displayed in the Antumi app"
  },
  "BrowserPanel.conversation": {
    "zh": "会话",
    "en": "Conversation"
  },
  "BrowserPanel.theBrowserRunsInTheAntumiAppCore": {
    "zh": "浏览器在 Antumi 应用里运行，core 还没有连上它。",
    "en": "The browser runs in the Antumi app. Core has not connected to it yet."
  },
  "BrowserPanel.isConnectingToTheBrowser": {
    "zh": "{value1} 正在连接浏览器…",
    "en": "{value1} is connecting to the browser…"
  },
  "BrowserPanel.connecting": {
    "zh": "正在连接",
    "en": "Connecting"
  },
  "BrowserPanel.browserError": {
    "zh": "浏览器出了问题：{value1}",
    "en": "Browser error: {value1}"
  },
  "BrowserPanel.unknownError": {
    "zh": "未知错误",
    "en": "Unknown error"
  },
  "BrowserPanel.back": {
    "zh": "后退",
    "en": "Back"
  },
  "BrowserPanel.forward": {
    "zh": "前进",
    "en": "Forward"
  },
  "BrowserPanel.reload": {
    "zh": "刷新",
    "en": "Reload"
  },
  "BrowserPanel.address": {
    "zh": "地址",
    "en": "Address"
  },
  "BrowserPanel.attachScreenshotToChat": {
    "zh": "截图到对话",
    "en": "Attach screenshot to chat"
  },
  "BrowserPanel.saveScreenshotAsImage": {
    "zh": "截图，存为图片",
    "en": "Save screenshot as image"
  },
  "BrowserPanel.returnControlToAgent": {
    "zh": "交还给 Agent",
    "en": "Return control to Agent"
  },
  "BrowserPanel.escToReturnToAppShiftEscTo": {
    "zh": "Esc 回到应用 · Shift+Esc 发给页面",
    "en": "Esc to return to app · Shift+Esc to send to page"
  },
  "BrowserPanel.noTabsOpenYet": {
    "zh": "还没有打开标签页。",
    "en": "No tabs open yet."
  },
  "BrowserSidePanel.browser": {
    "zh": "浏览器",
    "en": "Browser"
  },
  "BrowserSidePanel.restore": {
    "zh": "还原",
    "en": "Restore"
  },
  "BrowserSidePanel.maximize": {
    "zh": "最大化",
    "en": "Maximize"
  },
  "BrowserSidePanel.hideBrowser": {
    "zh": "隐藏浏览器",
    "en": "Hide browser"
  },
  "BrowserSidePanel.hideBrowserKeepsRunning": {
    "zh": "隐藏（浏览器继续运行）",
    "en": "Hide (browser keeps running)"
  },
  "ChatBrowserWindow.browserActionCompleted": {
    "zh": "浏览器操作已完成",
    "en": "Browser action completed"
  },
  "ChatBrowserWindow.browserActionFailed": {
    "zh": "浏览器操作失败",
    "en": "Browser action failed"
  },
  "ChatBrowserWindow.browserActionDenied": {
    "zh": "浏览器操作已拒绝",
    "en": "Browser action denied"
  },
  "ChatBrowserWindow.browserActionInterrupted": {
    "zh": "浏览器操作已中断",
    "en": "Browser action interrupted"
  },
  "ChatBrowserWindow.closed": { "zh": "已关闭", "en": "Closed" },
  "ChatBrowserWindow.closedTab": { "zh": "{title}（已关闭）", "en": "{title} (closed)" },
  "ChatBrowserWindow.openTab": {
    "zh": "在浏览器面板打开 {title}",
    "en": "Open {title} in the browser panel"
  },
  "ChatBrowserWindow.openInPanel": {
    "zh": "在浏览器面板打开",
    "en": "Open in the browser panel"
  },
  "backgroundWork.badge": {
    "zh": "后台",
    "en": "Background"
  },
  "backgroundWork.limitAt": {
    "zh": "{time} 到上限",
    "en": "Limit at {time}"
  },
  "backgroundWork.limitIn": {
    "zh": "{time}后到上限",
    "en": "Limit in {time}"
  },
  "backgroundWork.stoppedAtLimit": {
    "zh": "跑满 {time}上限，被停止",
    "en": "Stopped at its {time} limit"
  },
  "backgroundWork.stoppedAtTheLimit": {
    "zh": "到后台时长上限，被停止",
    "en": "Stopped at its background time limit"
  },
  "backgroundWork.ranFor": {
    "zh": "已运行 {time}",
    "en": "Running for {time}"
  },
  "backgroundWork.listTitle": {
    "zh": "后台运行中",
    "en": "Running in background"
  },
  "backgroundWork.listHint": {
    "zh": "点一行，跳到它在对话里的位置",
    "en": "Click a row to find it in the conversation"
  },
  "backgroundWork.stop": {
    "zh": "停止",
    "en": "Stop"
  },
  "backgroundWork.stopping": {
    "zh": "正在停止…",
    "en": "Stopping…"
  },
  "backgroundWork.stopNamed": {
    "zh": "停止 {name}",
    "en": "Stop {name}"
  },
  "backgroundWork.stoppedByYou": {
    "zh": "已手动停止",
    "en": "Stopped by you"
  },
  "ChatBrowserCard.viewFullPageScreenshot": {
    "zh": "查看完整的长截图",
    "en": "View full-page screenshot"
  },
  "ChatBrowserCard.viewScreenshot": {
    "zh": "查看截图",
    "en": "View screenshot"
  },
  "ChatBrowserCard.fullPageScreenshotClickToView": {
    "zh": "长截图 · 点击看全图",
    "en": "Full-page screenshot · Click to view"
  },
  "ChatBrowserCard.imageIsNoLongerAvailable": {
    "zh": "图片不在了：{path}",
    "en": "Image is no longer available: {path}"
  },
  "ChatBrowserCard.viewImage": {
    "zh": "查看图片 {path}",
    "en": "View image {path}"
  },
  "ChatBrowserCard.open": {
    "zh": "打开",
    "en": "Open"
  },
  "ChatBrowserCard.browserActions": {
    "zh": "浏览器操作 {value1} 次",
    "en": "Browser actions: {value1}"
  },
  "ChatCodeRun.runInThisConversationSTerminal": {
    "zh": "在这条会话的终端里运行",
    "en": "Run in this conversation's terminal"
  },
  "ChatCodeRun.pasteIntoThisConversationSTerminalThenPress": {
    "zh": "粘贴到这条会话的终端，确认后按回车运行",
    "en": "Paste into this conversation's terminal, then press Enter to run"
  },
  "ChatCodeRun.run": {
    "zh": "运行",
    "en": "Run"
  },
  "ChatCodeRun.pasteIntoTerminal": {
    "zh": "粘贴到终端",
    "en": "Paste into terminal"
  },
  "ChatCodeRun.moreRunOptions": {
    "zh": "更多运行方式",
    "en": "More run options"
  },
  "ChatCodeRun.runOptions": {
    "zh": "运行方式",
    "en": "Run options"
  },
  "ChatCodeRun.pasteOnlyPressEnterAfterReviewing": {
    "zh": "不执行，看过再按回车",
    "en": "Paste only; press Enter after reviewing"
  },
  "ChatCommandMenu.myCommands": {
    "zh": "我的命令",
    "en": "My commands"
  },
  "ChatCommandMenu.slashCommands": {
    "zh": "斜杠命令",
    "en": "Slash commands"
  },
  "ChatCommandMenu.commands": {
    "zh": "{agentLabel} 命令",
    "en": "{agentLabel} {agentLabel, plural, one {command} other {commands}}"
  },
  "ChatCommandMenu.navigateSelectCompleteClose": {
    "zh": "{value1} 选择 {value2} 选用 {value3} 补全 {value4} 关闭",
    "en": "{value1} Navigate {value2} Select {value3} Complete {value4} Close"
  },
  "ChatCommandSettings.name": {
    "zh": "名称",
    "en": "Name"
  },
  "ChatCommandSettings.useLettersNumbersStartingWithALetterOr": {
    "zh": "只能用字母、数字和 - _ :，并以字母或数字开头",
    "en": "Use letters, numbers, - _ :, starting with a letter or number"
  },
  "ChatCommandSettings.description": {
    "zh": "说明",
    "en": "Description"
  },
  "ChatCommandSettings.optionalShownInTheCommandList": {
    "zh": "可选，显示在命令列表里",
    "en": "Optional; shown in the command list"
  },
  "ChatCommandSettings.prompt": {
    "zh": "提示词",
    "en": "Prompt"
  },
  "ChatCommandSettings.forExampleFindWhyFailedFixItAnd": {
    "zh": "如：找出 {CHAT_COMMAND_ARGUMENTS} 失败的原因并修好，改完跑一遍测试",
    "en": "For example: Find why {CHAT_COMMAND_ARGUMENTS} failed, fix it, and run tests"
  },
  "ChatCommandSettings.expandsIntoTheComposerForEditingBeforeSending": {
    "zh": "选中后展开到输入框，改完再发送。{CHAT_COMMAND_ARGUMENTS} 换成命令名后面输入的内容；没写它时，那些内容接在末尾。",
    "en": "Expands into the composer for editing before sending. {CHAT_COMMAND_ARGUMENTS} is replaced with text after the command name; without it, that text is appended."
  },
  "ChatCommandSettings.showInConversations": {
    "zh": "在哪些会话里显示",
    "en": "Show in conversations"
  },
  "ChatCommandSettings.allConversations": {
    "zh": "所有会话",
    "en": "All conversations"
  },
  "ChatCommandSettings.only": {
    "zh": "仅 {value1}（{project}）",
    "en": "Only {value1} ({project})"
  },
  "ChatCommandSettings.cancel": {
    "zh": "取消",
    "en": "Cancel"
  },
  "ChatCommandSettings.save": {
    "zh": "保存{value1}",
    "en": "Save{value1}"
  },
  "ChatCommandSettings.delete": {
    "zh": "删除",
    "en": "Delete"
  },
  "ChatCommandSettings.connectToAntumiCoreToView": {
    "zh": "连接到 Antumi core 后才能查看。",
    "en": "Connect to Antumi core to view."
  },
  "ChatCommandSettings.noCommandsYetTypeInTheComposerTo": {
    "zh": "还没有命令。在聊天输入框里输入 / 就能选用这里的命令。",
    "en": "No commands yet. Type / in the composer to use commands from here."
  },
  "ChatCommandSettings.newCommand": {
    "zh": "新建命令",
    "en": "New command"
  },
  "ChatComposer.quotes": {
    "zh": "（引用 {value1} 段）",
    "en": "({value1} {value1, plural, one {quote} other {quotes}})"
  },
  "ChatComposer.imagesOnly": {
    "zh": "（只有图片）",
    "en": "(Images only)"
  },
  "ChatComposer.images": {
    "zh": "{value1} 张图片",
    "en": "{value1} {value1, plural, one {image} other {images}}"
  },
  "ChatComposer.quotes_242": {
    "zh": "{value1} 段引用",
    "en": "{value1} {value1, plural, one {quote} other {quotes}}"
  },
  "ChatComposer.scheduleMessage": {
    "zh": "预约发送",
    "en": "Schedule message"
  },
  "ChatComposer.scheduleSendWhenQuotaResetsOrAtA": {
    "zh": "预约发送：额度恢复后或到点再发",
    "en": "Schedule: send when quota resets or at a chosen time"
  },
  "ChatComposer.instructionsToSendToAgentWhenDue": {
    "zh": "到点后发给 Agent 的指令",
    "en": "Instructions to send to Agent when due"
  },
  "ChatComposer.messageToSendWhenDue": {
    "zh": "到点后发给 Agent 的消息",
    "en": "Message to send to the Agent when due"
  },
  "ChatComposer.instructionsWhenDueLeaveEmptyToImplementThe": {
    "zh": "到点后发给 Agent 的指令；留空就按定下的计划开始实现",
    "en": "Instructions when due; leave empty to implement the approved plan"
  },
  "ChatComposer.attach": {
    "zh": "附 {extra}",
    "en": "Attach {extra}"
  },
  "ChatComposer.sendThisMessage": {
    "zh": "发送这条",
    "en": "Send this message"
  },
  "ChatComposer.insertIntoTheCurrentTurnImmediately": {
    "zh": "立刻插入到进行中的回合",
    "en": "Insert into the current turn immediately"
  },
  "ChatComposer.insertNow": {
    "zh": "立刻插入",
    "en": "Insert now"
  },
  "ChatComposer.editInComposer": {
    "zh": "编辑，放回输入框",
    "en": "Edit in composer"
  },
  "ChatComposer.previousTurnUnfinishedNotSent": {
    "zh": "上一回合没有完成，还没发：",
    "en": "Previous turn unfinished; not sent:"
  },
  "ChatComposer.sendAfterThisTurn": {
    "zh": "回合结束后发送：",
    "en": "Send after this turn:"
  },
  "ChatComposer.unsentMessages": {
    "zh": "{value1} 条没发出",
    "en": "{value1} unsent messages"
  },
  "ChatComposer.queuedMessages": {
    "zh": "{value1} 条排队",
    "en": "{value1} queued messages"
  },
  "ChatComposer.next": {
    "zh": "下一条：{value1}",
    "en": "Next: {value1}"
  },
  "ChatComposer.resumeSendingTheFirstMessage": {
    "zh": "继续发送第 1 条",
    "en": "Resume sending the first message"
  },
  "ChatComposer.retryTheFirstMessageAboveFirst": {
    "zh": "请先重试上面的首条消息",
    "en": "Retry the first message above first"
  },
  "ChatComposer.sendingFirstMessage": {
    "zh": "正在发送首条消息…",
    "en": "Sending first message…"
  },
  "ChatComposer.starting": {
    "zh": "正在启动 {value1}…",
    "en": "Starting {value1}…"
  },
  "ChatComposer.messageToAgent": {
    "zh": "给 Agent 的消息",
    "en": "Message to Agent"
  },
  "ChatComposer.askHelper": {
    "zh": "交给小助手…",
    "en": "Ask helper…"
  },
  "ChatComposer.handOffToAddInstructionsOrPressEnter": {"zh": "交给 {value1} 接着做：写下要它做的事，也可以不写{send}", "en": "Hand off to {value1}: add instructions, or leave it empty{send}"},
  "ChatComposer.messageAgentEnterToSendShiftEnterFor": {"zh": "给 Agent 发消息{send}，Shift+Enter 换行{value1}{value2}", "en": "Message Agent{send}; Shift+Enter for a new line{value1}{value2}"},
  "ChatComposer.forCommands": {
    "zh": "，/ 选命令",
    "en": ", / for commands"
  },
  "ChatComposer.toReferenceFiles": {
    "zh": "，@ 引用文件",
    "en": ", @ to reference files"
  },
  "ChatComposer.useSuggestion": {
    "zh": "{value1} 填入建议",
    "en": "{value1} Use suggestion"
  },
  "ChatComposer.imagesAreStillUploading": {
    "zh": "图片还在上传",
    "en": "Images are still uploading"
  },
  "ChatComposer.thisCoreCannotScheduleMessagesWithImagesYet": {
    "zh": "这个 core 还不能预约带图片的消息",
    "en": "This core cannot schedule messages with images yet"
  },
  "ChatComposer.sendToAgentNowWithoutWaitingForThis": {
    "zh": "不等回合结束，现在就交给 Agent（{PRIMARY_KEY_LABEL}Enter）",
    "en": "Send to Agent now without waiting for this turn to end ({PRIMARY_KEY_LABEL}Enter)"
  },
  "ChatComposer.handOff": {
    "zh": "移交",
    "en": "Hand off"
  },
  "ChatComposer.handOffTo": {
    "zh": "移交给 {value1}",
    "en": "Hand off to {value1}"
  },
  "ChatComposer.cannotHandOffYet": {
    "zh": "还不能移交：{value1}",
    "en": "Cannot hand off yet: {value1}"
  },
  "ChatComposer.handOffToEnter": {"zh": "{value1}交给 {value2} 接着做{keys}", "en": "{value1}Hand off to {value2}{keys}"},
  "ChatComposer.stop": {
    "zh": "停止 {value1}，",
    "en": "Stop {value1}, "
  },
  "ChatComposer.interruptThisTurnEsc": {
    "zh": "中断这一回合（Esc）",
    "en": "Interrupt this turn (Esc)"
  },
  "ChatComposer.sendEnter": {
    "zh": "发送（Enter）",
    "en": "Send (Enter)"
  },
  "ChatComposer.waysToSend": {
    "zh": "发送方式",
    "en": "Ways to send"
  },
  "ChatComposer.send": {
    "zh": "发送",
    "en": "Send"
  },
  "ChatComposer.interrupt": {
    "zh": "中断",
    "en": "Interrupt"
  },
  "ChatComposer.sendAfterTheTurn": {
    "zh": "回合结束后发送",
    "en": "Send after this turn"
  },
  "ChatComposer.sendToNewConversation": {
    "zh": "发到新会话",
    "en": "Send to new conversation"
  },
  "ChatContextMenu.fileNotFound": {
    "zh": "找不到文件",
    "en": "File not found"
  },
  "ChatContextMenu.cannotAccessFile": {
    "zh": "无法访问文件",
    "en": "Cannot access file"
  },
  "ChatContextMenu.translationOfSelection": {
    "zh": "选中内容的翻译",
    "en": "Translation of selection"
  },
  "ChatContextMenu.chatContent": {
    "zh": "聊天内容",
    "en": "Chat content"
  },
  "ChatContextMenu.translate": {
    "zh": "翻译",
    "en": "Translate"
  },
  "ChatContextMenu.copySelection": {
    "zh": "复制选中内容",
    "en": "Copy selection"
  },
  "ChatContextMenu.copyContent": {
    "zh": "复制所在内容",
    "en": "Copy content"
  },
  "ChatContextMenu.copyCode": {
    "zh": "复制代码",
    "en": "Copy code"
  },
  "ChatContextMenu.copyLink": {
    "zh": "复制链接",
    "en": "Copy link"
  },
  "ChatContextMenu.showInFileManager": {
    "zh": "在文件管理器中显示",
    "en": "Show in file manager"
  },
  "ChatContextMenu.findingFile": {
    "zh": "正在查找文件…",
    "en": "Finding file…"
  },
  "ChatContextMenu.nothingToCopy": {
    "zh": "没有可复制的内容",
    "en": "Nothing to copy"
  },
  "ChatContextMenu.translateTo": {
    "zh": "译成{value1}{value2}",
    "en": "Translate to {value1}{value2}"
  },
  "ChatContextMenu.translatedBy": {
    "zh": " · 由 {value1} 翻译",
    "en": " · Translated by {value1}"
  },
  "ChatContextMenu.translating": {
    "zh": "{value1}翻译中…",
    "en": "{value1}Translating…"
  },
  "ChatContextMenu.copyTranslation": {
    "zh": "复制译文",
    "en": "Copy translation"
  },
  "ChatContextMenu.retry": {
    "zh": "重试",
    "en": "Retry"
  },
  "ChatContextMenu.askHelper": {
    "zh": "交给小助手",
    "en": "Ask helper"
  },
  "ChatDiagram.viewImage": {
    "zh": "看图",
    "en": "View image"
  },
  "ChatDiagram.viewSource": {
    "zh": "看源码",
    "en": "View source"
  },
  "ChatDiagram.mermaidDiagram": {
    "zh": "Mermaid 图表",
    "en": "Mermaid diagram"
  },
  "ChatDiagram.couldNotRenderDiagramSource": {
    "zh": "图表没能画出来，下面是源码：{value1}",
    "en": "Could not render diagram. Source: {value1}"
  },
  "ChatDock.filesChanged": {
    "zh": "{value1} 个文件改动",
    "en": "{value1} {value1, plural, one {file} other {files}} changed"
  },
  "ChatDock.question": {
    "zh": "提问{value1}",
    "en": "Question{value1}"
  },
  "ChatDock.requestsAwaitingYourResponse": {
    "zh": "等你处理的请求",
    "en": "Requests awaiting your response"
  },
  "ChatDock.scheduled": {
    "zh": "预约 · {value1}：",
    "en": "Scheduled · {value1}:"
  },
  "ChatDock.manageSchedule": {
    "zh": "管理预约",
    "en": "Manage schedule"
  },
  "ChatDock.cancelSchedule": {
    "zh": "取消预约",
    "en": "Cancel schedule"
  },
  "ChatDock.draft": {
    "zh": "草稿：{draft}",
    "en": "Draft: {draft}"
  },
  "ChatDock.replyInThisPane": {
    "zh": "回复这一列…",
    "en": "Reply in this pane…"
  },
  "ChatDock.previousMessage": {
    "zh": "上一条消息",
    "en": "Previous message"
  },
  "ChatFind.searchThisChat": {
    "zh": "当前聊天搜索",
    "en": "Search this chat"
  },
  "ChatFind.searchCurrentChat": {
    "zh": "搜索当前聊天",
    "en": "Search current chat"
  },
  "ChatFind.searchTemporarilyExpandsFoldedContentAndLoadsEarlier": {
    "zh": "搜索时临时展开折叠内容，并加载更早的聊天记录",
    "en": "Search temporarily expands folded content and loads earlier messages"
  },
  "ChatFind.loading": {
    "zh": "加载中…",
    "en": "Loading…"
  },
  "ChatFind.previousResult": {
    "zh": "上一个结果",
    "en": "Previous result"
  },
  "ChatFind.previousResultShiftEnter": {
    "zh": "上一个结果（Shift+Enter）",
    "en": "Previous result (Shift+Enter)"
  },
  "ChatFind.nextResult": {
    "zh": "下一个结果",
    "en": "Next result"
  },
  "ChatFind.nextResultEnter": {
    "zh": "下一个结果（Enter）",
    "en": "Next result (Enter)"
  },
  "ChatFind.closeSearch": {
    "zh": "关闭搜索",
    "en": "Close search"
  },
  "ChatFind.closeSearchEsc": {
    "zh": "关闭搜索（Esc）",
    "en": "Close search (Esc)"
  },
  "ChatFind.failedToLoadEarlierMessages": {
    "zh": "更早的聊天记录读取失败。{value1}",
    "en": "Failed to load earlier messages. {value1}"
  },
  "ChatFontPicker.cannotReadSystemFontsEnterAFontName": {
    "zh": "读不到系统字体，输入字体名，回车使用",
    "en": "Cannot read system fonts. Enter a font name and press Enter"
  },
  "ChatFontPicker.searchFontsEnterToSelectTheFirst": {
    "zh": "搜索字体，回车选第一个",
    "en": "Search fonts; Enter to select the first"
  },
  "ChatFontPicker.searchFonts": {
    "zh": "搜索字体",
    "en": "Search fonts"
  },
  "ChatFontPicker.loadingSystemFonts": {
    "zh": "正在读取系统字体…",
    "en": "Loading system fonts…"
  },
  "ChatFontPicker.use": {
    "zh": "使用「{typed}」",
    "en": "Use “{typed}”"
  },
  "ChatFontPicker.noMatchingFonts": {
    "zh": "没有匹配的字体",
    "en": "No matching fonts"
  },
  "ChatFontPicker.system": {
    "zh": "系统",
    "en": "System"
  },
  "ChatFontPicker.serif": {
    "zh": "衬线",
    "en": "Serif"
  },
  "ChatFontPicker.other": {
    "zh": "其他",
    "en": "Other"
  },
  "ChatFontPicker.chooseFont": {
    "zh": "选择字体",
    "en": "Choose font"
  },
  "ChatFontPicker.chooseChatFont": {
    "zh": "选择聊天字体",
    "en": "Choose chat font"
  },
  "ChatHandoff.stopTheCurrentAndHandOffTo": {
    "zh": "停止当前的 {value1}，然后交给 {value2} 接着做？",
    "en": "Stop the current {value1} and hand off to {value2}?"
  },
  "ChatHandoff.permissionMode": {
    "zh": "权限模式",
    "en": "Permission mode"
  },
  "ChatImages.upToImagesPerMessage": {
    "zh": "一条消息最多带 {MAX_CHAT_IMAGES} 张图片",
    "en": "Up to {MAX_CHAT_IMAGES} {MAX_CHAT_IMAGES, plural, one {image} other {images}} per message"
  },
  "ChatImages.addContent": {
    "zh": "添加内容",
    "en": "Add content"
  },
  "ChatImages.addImages": {
    "zh": "添加图片",
    "en": "Add images"
  },
  "ChatImages.youCanAlsoPasteOrDragThemInto": {
    "zh": "也可以直接粘贴或拖进输入框",
    "en": "You can also paste or drag them into the composer"
  },
  "ChatImages.zoomIn": {
    "zh": "放大",
    "en": "Zoom in"
  },
  "ChatImages.copyImage": {
    "zh": "复制图片",
    "en": "Copy image"
  },
  "ChatImages.failedToCopyImage": {
    "zh": "图片复制失败",
    "en": "Failed to copy image"
  },
  "ChatImages.removeImage": {
    "zh": "删除图片",
    "en": "Remove image"
  },
  "ChatImages.uploadingImages": {
    "zh": "正在上传 {uploading} 张…",
    "en": "Uploading {uploading} {uploading, plural, one {image} other {images}}…"
  },
  "ChatMarkdown.fileNotFound": {
    "zh": "找不到文件：{value1}",
    "en": "File not found: {value1}"
  },
  "ChatMarkdown.preview": {
    "zh": "预览 {value1}{value2}",
    "en": "Preview {value1}{value2}"
  },
  "ChatMarkdown.showIn": {
    "zh": "在{FILE_MANAGER}中显示 {value2}",
    "en": "Show {value2} in {FILE_MANAGER}"
  },
  "ChatMarkdown.imageIsNoLongerAvailable": {
    "zh": "图片不在了：{value1}",
    "en": "Image is no longer available: {value1}"
  },
  "ChatMarkdown.viewImage": {
    "zh": "查看图片 {value1}",
    "en": "View image {value1}"
  },
  "ChatMarkdown.image": {
    "zh": "图片：{value1}",
    "en": "Image: {value1}"
  },
  "ChatMentionMenu.referenceAFileOrProject": {
    "zh": "引用文件或项目",
    "en": "Reference a file or project"
  },
  "ChatMentionMenu.categories": {"zh": "引用类型", "en": "Reference categories"},
  "ChatMentionMenu.files": {"zh": "文件", "en": "Files"},
  "ChatMentionMenu.projects": {"zh": "项目", "en": "Projects"},
  "ChatMentionMenu.conversations": {"zh": "会话", "en": "Conversations"},
  "ConversationReference.open": {"zh": "打开引用的会话", "en": "Open referenced conversation"},
  "ConversationReference.unavailable": {"zh": "引用的会话已删除或不可用", "en": "The referenced conversation was deleted or is unavailable"},
  "ChatMentionMenu.matchingResults": {"zh": "当前匹配数量", "en": "Current matching results"},
  "ChatMentionMenu.searching": {"zh": "正在查找…", "en": "Searching…"},
  "ChatMentionMenu.noProject": {"zh": "当前会话没有项目目录。", "en": "This conversation has no project folders."},
  "ChatMentionMenu.noMatches": {"zh": "没有匹配结果，试试其他关键词。", "en": "No matches. Try another search."},
  "ChatMentionMenu.file": {
    "zh": "文件",
    "en": "File"
  },
  "ChatMentionMenu.project": {
    "zh": "项目",
    "en": "Project"
  },
  "ChatMentionMenu.navigateReferenceOpenFolderClose": {
    "zh": "{value1} 选择 {value2} 引用 {value3} 打开文件夹 {value4} 关闭",
    "en": "{value1} Navigate {value2} Reference {value3} Open folder {value4} Close"
  },
  "ChatMessageList.yourSentMessages": {
    "zh": "你发过的消息",
    "en": "Your sent messages"
  },
  "ChatOptionsBar.none": {
    "zh": "无",
    "en": "None"
  },
  "ChatOptionsBar.minimal": {
    "zh": "最低",
    "en": "Minimal"
  },
  "ChatOptionsBar.low": {
    "zh": "低",
    "en": "Low"
  },
  "ChatOptionsBar.medium": {
    "zh": "中",
    "en": "Medium"
  },
  "ChatOptionsBar.high": {
    "zh": "高",
    "en": "High"
  },
  "ChatOptionsBar.extraHigh": {
    "zh": "很高",
    "en": "Extra high"
  },
  "ChatOptionsBar.maximum": {
    "zh": "最高",
    "en": "Maximum"
  },
  "ChatOptionsBar.ultra": {
    "zh": "超高",
    "en": "Ultra"
  },
  "ChatOptionsBar.contextTokens": {
    "zh": "上下文 {value1} tokens",
    "en": "Context: {value1} {value1, plural, one {token} other {tokens}}"
  },
  "ChatOptionsBar.context": {
    "zh": "上下文 {value1}%（{value2} / {value3}）",
    "en": "Context: {value1}% ({value2} / {value3})"
  },
  "ChatOptionsBar.appliesWhenYouSendTheNextMessage": {
    "zh": "发下一条消息时按这个启动",
    "en": "Applies when you send the next message"
  },
  "ChatOptionsBar.readOnly": {
    "zh": "只读",
    "en": "Read only"
  },
  "ChatOptionsBar.readOnlyCoordination": {
    "zh": "只读协调",
    "en": "Read-only coordination"
  },
  "ChatOptionsBar.useThisSquadSConfiguration": {
    "zh": "沿用本次团队配置",
    "en": "Use this team's configuration"
  },
  "ChatOptionsBar.changeModelAndReasoningEffortAfterThisTurn": {
    "zh": "回合结束后才能换模型和推理强度",
    "en": "Change model and reasoning effort after this turn ends"
  },
  "ChatPicker.defaultModel": {
    "zh": "默认模型",
    "en": "Default model"
  },
  "ChatPicker.modelAndReasoningEffort": {
    "zh": "模型和推理强度",
    "en": "Model and reasoning effort"
  },
  "ChatPicker.model": {
    "zh": "模型：{modelLabel}{value2}",
    "en": "Model: {modelLabel}{value2}"
  },
  "ChatPicker.reasoningEffort": {
    "zh": "，推理强度：{effortLabel}",
    "en": ", reasoning effort: {effortLabel}"
  },
  "ChatPicker.reasoningEffort_373": {
    "zh": "推理强度",
    "en": "Reasoning effort"
  },
  "ChatPlan.scheduleApproval": {
    "zh": "预约批准",
    "en": "Schedule approval"
  },
  "ChatPlan.scheduleApprovalOfThisPlan": {
    "zh": "预约批准这个计划",
    "en": "Schedule approval of this plan"
  },
  "ChatPlan.approveAndStartWhenDueWithoutWaitingFor": {
    "zh": "到点后批准并开始执行，不会停下来等你确认。",
    "en": "Approve and start when due, without waiting for another confirmation."
  },
  "ChatPlan.implementPlanAskBeforeEachAction": {
    "zh": "按计划执行，逐项确认",
    "en": "Implement plan, ask before each action"
  },
  "ChatPlan.implementPlanAcceptEditsAutomatically": {
    "zh": "按计划执行，自动接受编辑",
    "en": "Implement plan, accept edits automatically"
  },
  "ChatPlan.continuePlanning": {
    "zh": "继续规划",
    "en": "Continue planning"
  },
  "ChatPlan.notExecuted": {
    "zh": "没有执行",
    "en": "Not executed"
  },
  "ChatPlan.automaticMode": {
    "zh": "自动模式",
    "en": "Automatic mode"
  },
  "ChatPlan.runSafeActionsDirectlyAskBeforeRiskyOnes": {
    "zh": "安全的操作直接执行，有风险的才问你",
    "en": "Run safe actions directly; ask before risky ones"
  },
  "ChatPlan.acceptEditsAutomatically": {
    "zh": "自动接受编辑",
    "en": "Accept edits automatically"
  },
  "ChatPlan.editFilesDirectlyAskBeforeRunningCommands": {
    "zh": "改文件不问，跑命令前问",
    "en": "Edit files directly; ask before running commands"
  },
  "ChatPlan.askEachTime": {
    "zh": "逐项确认",
    "en": "Ask each time"
  },
  "ChatPlan.askBeforeEditingFilesOrRunningCommands": {
    "zh": "改文件、跑命令前都问",
    "en": "Ask before editing files or running commands"
  },
  "ChatPlan.allowEverything": {
    "zh": "全部放行",
    "en": "Allow everything"
  },
  "ChatPlan.askNothingUseOnlyWhenYouTrustThis": {
    "zh": "什么都不问，只在你信任这次任务时用",
    "en": "Ask nothing. Use only when you trust this task"
  },
  "ChatPlan.awaitingYourApproval": {
    "zh": "等你确认",
    "en": "Awaiting your approval"
  },
  "ChatPlan.implementPlan": {
    "zh": "按计划执行，{value1}",
    "en": "Implement plan, {value1}"
  },
  "ChatPlan.run": {
    "zh": "执行 · {value1}{value2}",
    "en": "Run · {value1}{value2}"
  },
  "ChatPlan.choosePermissionsForExecution": {
    "zh": "选择执行时的权限",
    "en": "Choose permissions for execution"
  },
  "ChatPlan.executionPermissions": {
    "zh": "执行时的权限",
    "en": "Execution permissions"
  },
  "ChatPlan.planAwaitingApprovalViewOnTheRightRespond": {
    "zh": "计划等你确认 · 在右侧查看，在下方回答",
    "en": "Plan awaiting approval · View on the right, respond below"
  },
  "ChatPlan.planView": {
    "zh": "计划 · {value1} · 查看",
    "en": "Plan · {value1} · View"
  },
  "ChatPlan.implementPlan_396": {
    "zh": "按计划执行",
    "en": "Implement plan"
  },
  "ChatPlan.implementPlanAskBeforeEditingFilesOrRunning": {
    "zh": "按计划执行，改文件、跑命令前逐项确认",
    "en": "Implement plan; ask before editing files or running commands"
  },
  "ChatPlan.implementPlanAcceptFileEditsAutomatically": {
    "zh": "按计划执行，文件改动自动接受",
    "en": "Implement plan; accept file edits automatically"
  },
  "ChatPlan.savePlanFirstExecuteAfterDependenciesFinish": {
    "zh": "先保存计划，等依赖的任务完成后再执行",
    "en": "Save plan first; execute after dependencies finish"
  },
  "ChatPlan.stopWithoutExecuting": {
    "zh": "不执行，先停下",
    "en": "Stop without executing"
  },
  "ChatPlan.execute": {
    "zh": "执行",
    "en": "Execute"
  },
  "ChatPlan.startSquadDevelopment": {
    "zh": "开始团队开发",
    "en": "Start team development"
  },
  "ChatPlan.savePlan": {
    "zh": "保存计划",
    "en": "Save plan"
  },
  "ChatPlan.stop": {
    "zh": "停下",
    "en": "Stop"
  },
  "ChatPlan.planAwaitingYourApproval": {
    "zh": "计划等你确认{value1}{value2}{value3}{value4}",
    "en": "Plan awaiting your approval{value1}{value2}{value3}{value4}"
  },
  "ChatPlan.fullPlanOnTheRight": {
    "zh": "完整计划在右侧",
    "en": "Full plan on the right"
  },
  "ChatPlan.viewFullPlanInInspector": {
    "zh": "在检查器里看完整计划",
    "en": "View full plan in inspector"
  },
  "ChatPlan.assignToSquad": {
    "zh": "交给团队",
    "en": "Assign to team"
  },
  "ChatPlan.thisPlan": {
    "zh": "这份计划",
    "en": "This plan"
  },
  "ChatPlan.afterApprovalTheLeaderAssignsWorkToMembers": {
    "zh": "批准后，队长按这份计划给「{value1}」的成员派活。",
    "en": "After approval, the team lead assigns work to members of “{value1}” using this plan."
  },
  "ChatPlan.dependenciesAreUnfinishedSaveThePlanNowThen": {
    "zh": "依赖的任务还没完成：现在只能保存计划，等它们完成后开始执行时再按计划做。",
    "en": "Dependencies are unfinished. Save the plan now, then implement it when the dependencies finish."
  },
  "ChatPlan.collapse": {
    "zh": "收起",
    "en": "Collapse"
  },
  "ChatPlan.expandAll": {
    "zh": "展开全部",
    "en": "Expand all"
  },
  "ChatPlan.howToRespond": {
    "zh": "怎么回答",
    "en": "How to respond"
  },
  "ChatPlan.continuePlanningTellAgentWhatToChange": {
    "zh": "继续规划，告诉 Agent 要改哪里",
    "en": "Continue planning; tell Agent what to change"
  },
  "ChatPlan.continuePlanningWithCommentsAddMoreIfNeeded": {
    "zh": "继续规划：带上 {value1} 条评论，还可以再补充（可不填）",
    "en": "Continue planning with {value1} {value1, plural, one {comment} other {comments}}; add more if needed (optional)"
  },
  "ChatPlan.continuePlanningTellAgentWhatToChangeOptional": {
    "zh": "继续规划，告诉 Agent 要改哪里（可不填）",
    "en": "Continue planning; tell Agent what to change (optional)"
  },
  "ChatPlan.assignPlanTo": {
    "zh": "交给「{value1}」按计划开发",
    "en": "Assign plan to “{value1}”"
  },
  "ChatPlan.squad": {
    "zh": "团队",
    "en": "Team"
  },
  "ChatPlan.savePlanFirstAssignToSquadLater": {
    "zh": "先保存计划，稍后再交给团队",
    "en": "Save plan first; assign to team later"
  },
  "ChatPlan.numberKeysToSelectEnterToSubmitEsc": {
    "zh": "数字键选择 · Enter 提交 · Esc 停下",
    "en": "Number keys to select · Enter to submit · Esc to stop"
  },
  "ChatPlan.copyMarkdown": {
    "zh": "复制 Markdown",
    "en": "Copy Markdown"
  },
  "ChatPlan.downloadMarkdown": {
    "zh": "下载 Markdown",
    "en": "Download Markdown"
  },
  "ChatPlan.agentHasNotProposedAPlanYet": {
    "zh": "Agent 还没有提出计划。",
    "en": "Agent has not proposed a plan yet."
  },
  "ChatPlan.planVersions": {
    "zh": "计划的版本",
    "en": "Plan versions"
  },
  "ChatPlan.version": {
    "zh": "第 {version} 版",
    "en": "Version {version}"
  },
  "ChatPlan.version_427": {
    "zh": "第 {value1} 版 · {value2}",
    "en": "Version {value1} · {value2}"
  },
  "ChatPlan.confirmBelowTheChat": {
    "zh": " · 在对话下方确认",
    "en": " · Confirm below the chat"
  },
  "ChatPlan.comments": {
    "zh": "{comments} 条评论{value2}",
    "en": "{comments} {comments, plural, one {comment} other {comments}}{value2}"
  },
  "ChatPlan.chooseContinuePlanningBelowToSendThemTo": {
    "zh": "，在下方选「继续规划」交给 agent",
    "en": "; choose “Continue planning” below to send them to Agent"
  },
  "ChatPlan.inTheComposerSendThemSoAgentCan": {
    "zh": "，在输入框里，发送后 agent 据此修改",
    "en": "; in the composer, send them so Agent can revise"
  },
  "ChatPlan.thisPlanIsEmpty": {
    "zh": "这份计划是空的。",
    "en": "This plan is empty."
  },
  "ChatPreviewCard.viewImage": {
    "zh": "查看图片 {label}",
    "en": "View image {label}"
  },
  "ChatPreviewCard.reload": {
    "zh": "重新加载",
    "en": "Reload"
  },
  "ChatPreviewCard.openInBrowser": {
    "zh": "在浏览器中打开",
    "en": "Open in browser"
  },
  "ChatPreviewCard.openAtFullSizeInTheBuiltIn": {
    "zh": "在内置浏览器里打开，全尺寸，Agent 也能看到这个标签页",
    "en": "Open at full size in the built-in browser. Agent can see this tab too"
  },
  "ChatPreviewCard.showFile": {
    "zh": "显示文件",
    "en": "Show file"
  },
  "ChatPreviewCard.couldNotDisplayThisFile": {
    "zh": "没能展示这个文件。",
    "en": "Could not display this file."
  },
  "ChatPreviewCard.preparingPreview": {
    "zh": "正在准备预览…",
    "en": "Preparing preview…"
  },
  "ChatProjects.thisCoreCannotChangeConversationProjectsYet": {
    "zh": "这个 core 还不能改会话的项目",
    "en": "This core cannot change conversation projects yet"
  },
  "ChatProjects.changeTaskProjectsInTaskDetails": {
    "zh": "任务的项目在任务详情里改",
    "en": "Change task projects in task details"
  },
  "ChatProjects.appliesWhenTheMenuClosesAgentRestartsIn": {
    "zh": "菜单关上后生效，Agent 会在同一个会话里重启，拿到新的目录",
    "en": "Applies when the menu closes. Agent restarts in the same conversation with the new directories"
  },
  "ChatProjects.conversationProjects": {
    "zh": "会话的项目：{value1}",
    "en": "Conversation projects: {value1}"
  },
  "ChatProjects.primaryProject": {
    "zh": "主项目：{primary}",
    "en": "Primary project: {primary}"
  },
  "ChatProjects.conversationProjects_445": {
    "zh": "会话的项目",
    "en": "Conversation projects"
  },
  "ChatProjects.primaryProjectFixedAfterConversationStarts": {
    "zh": "主项目 · 会话开始后固定",
    "en": "Primary project · Fixed after conversation starts"
  },
  "ChatProjects.additionalProjects": {
    "zh": "额外项目",
    "en": "Additional projects"
  },
  "ChatProjects.clickToRemove": {
    "zh": "{each}\n点一下移除",
    "en": "{each}\nClick to remove"
  },
  "ChatProjects.chooseFolder": {
    "zh": "选择文件夹…",
    "en": "Choose folder…"
  },
  "ChatProjects.noRecentProjects": {
    "zh": "没有最近用过的项目",
    "en": "No recent projects"
  },
  "ChatQuoteCards.quotedPassage": {
    "zh": "引用的段落",
    "en": "Quoted passage"
  },
  "ChatQuoteCards.commentOnThisPassageOptional": {
    "zh": "对这段说点什么（可不填）",
    "en": "Comment on this passage (optional)"
  },
  "ChatQuoteCards.commentOnThisQuote": {
    "zh": "对这段引用的说明",
    "en": "Comment on this quote"
  },
  "ChatQuoteCards.removeQuote": {
    "zh": "移除这段引用",
    "en": "Remove quote"
  },
  "ChatQuoteCards.remove": {
    "zh": "移除",
    "en": "Remove"
  },
  "ChatRequestCards.allowForThisConversation": {
    "zh": "本会话都允许",
    "en": "Allow for this conversation"
  },
  "ChatRequestCards.allowOnce": {
    "zh": "允许一次",
    "en": "Allow once"
  },
  "ChatRequestCards.allowInThisConversation": {
    "zh": "本会话允许",
    "en": "Allow in this conversation"
  },
  "ChatRequestCards.runOnce": {
    "zh": "运行这一次",
    "en": "Run once"
  },
  "ChatRequestCards.allowTerminalCommandsForThisConversation": {
    "zh": "本会话都允许在终端运行",
    "en": "Allow terminal commands for this conversation"
  },
  "ChatRequestCards.allowedDoNotAskAgainInThisConversation": {
    "zh": "已允许，本会话不再询问",
    "en": "Allowed; do not ask again in this conversation"
  },
  "ChatRequestCards.cancelled": {
    "zh": "已取消",
    "en": "Cancelled"
  },
  "ChatRequestCards.agentAsksAnswerBelow": {
    "zh": "Agent 在问你：{value1} · 在下方回答",
    "en": "Agent asks: {value1} · Answer below"
  },
  "ChatRequestCards.approvalNeededRespondBelow": {
    "zh": "需要你确认：{what} · 在下方回答",
    "en": "Approval needed: {what} · Respond below"
  },
  "ChatRequestCards.agentWantsToOpen": {
    "zh": "Agent 想打开 {value1}",
    "en": "Agent wants to open {value1}"
  },
  "ChatRequestCards.agentWantsToRunInTheTerminal": {
    "zh": "Agent 想在终端里运行 {value1}",
    "en": "Agent wants to run {value1} in the terminal"
  },
  "ChatRequestCards.approvalNeeded": {
    "zh": "需要你确认：{value1}",
    "en": "Approval needed: {value1}"
  },
  "ChatRequestCards.whyAgentIsAsking": {
    "zh": "Agent 停下来问的原因：{value1}",
    "en": "Why Agent is asking: {value1}"
  },
  "ChatRequestCards.runInATabInAntumiSTerminal": {
    "zh": "在 Antumi 的终端面板里开一个标签运行，你能看到输出，随时可以停掉。{value1}",
    "en": "Run in a tab in Antumi's terminal panel. You can see output and stop it anytime.{value1}"
  },
  "ChatRequestCards.directory": {
    "zh": "目录：{value1}",
    "en": "Directory: {value1}"
  },
  "ChatRequestCards.denyWithAReason": {
    "zh": "拒绝，并说明理由",
    "en": "Deny with a reason"
  },
  "ChatRequestCards.denyAndTellAgentWhyOptional": {
    "zh": "拒绝，并告诉 Agent 为什么（可不填）",
    "en": "Deny and tell Agent why (optional)"
  },
  "ChatRequestCards.noRuleCanBeSavedForThisRequest": {
    "zh": "这次没有能记住的规则，同类调用之后还会问；想少问几次，可以在输入框下方换个权限模式。",
    "en": "No rule can be saved for this request. Similar calls will ask again. Change the permission mode below the composer to reduce prompts."
  },
  "ChatRequestCards.numberKeysToSelectEnterToSubmit": {
    "zh": "数字键选择 · Enter 提交",
    "en": "Number keys to select · Enter to submit"
  },
  "ChatRequestCards.question": {
    "zh": "问题",
    "en": "Question"
  },
  "ChatRequestCards.additionalNotes": {
    "zh": "✎ 补充说明{value1}",
    "en": "✎ Additional notes{value1}"
  },
  "ChatRequestCards.replyDirectly": {
    "zh": "⇄ 直接回复{value1}",
    "en": "⇄ Reply directly{value1}"
  },
  "ChatRequestCards.agentHasNotPausedYourAnswerWillBe": {
    "zh": "Agent 没停下来等 · 回答会作为消息发给它",
    "en": "Agent has not paused · Your answer will be sent as a message"
  },
  "ChatRequestCards.additionalNotesForAgentAppendedToEachAnswer": {
    "zh": "给 Agent 的补充说明，会附在每个问题的回答后面；Enter 提交，Shift+Enter 换行",
    "en": "Additional notes for Agent, appended to each answer. Enter to submit, Shift+Enter for a new line"
  },
  "ChatRequestCards.additionalNotes_480": {
    "zh": "补充说明",
    "en": "Additional notes"
  },
  "ChatRequestCards.answerAllQuestionsInYourOwnWordsEnter": {
    "zh": "不选选项，直接用一段话回答全部问题；Enter 提交，Shift+Enter 换行",
    "en": "Answer all questions in your own words. Enter to submit, Shift+Enter for a new line"
  },
  "ChatRequestCards.replyDirectly_482": {
    "zh": "直接回复",
    "en": "Reply directly"
  },
  "ChatRequestCards.selectMultiple": {
    "zh": "可多选",
    "en": "Select multiple"
  },
  "ChatRequestCards.otherWriteYourOwn": {
    "zh": "其他，自己填写",
    "en": "Other, write your own"
  },
  "ChatRequestCards.writeYourAnswerEnterToContinue": {
    "zh": "写下你的回答，Enter 继续",
    "en": "Write your answer; Enter to continue"
  },
  "ChatRequestCards.otherAnswerFor": {
    "zh": "{value1} 的其他回答",
    "en": "Other answer for {value1}"
  },
  "ChatRequestCards.skip": {
    "zh": "不回答{value1}",
    "en": "Skip{value1}"
  },
  "ChatRequestCards.previous": {
    "zh": "上一个",
    "en": "Previous"
  },
  "ChatRequestCards.submit": {
    "zh": "提交{value1}",
    "en": "Submit{value1}"
  },
  "ChatRequestCards.questionsUnanswered": {
    "zh": "还有 {unanswered} 个问题没回答",
    "en": "{unanswered} {unanswered, plural, one {question} other {questions}} unanswered"
  },
  "ChatRequestCards.next": {
    "zh": "下一个",
    "en": "Next"
  },
  "ChatRequestCards.answeredQuestions": {
    "zh": "回答了 {count} 个问题",
    "en": "Answered {count} {count, plural, one {question} other {questions}}"
  },
  "ChatRequestCards.answeredQuestion": {
    "zh": "回答了问题",
    "en": "Answered question"
  },
  "ChatRequestCards.answeredWithoutSelectingOptions": {
    "zh": "没有用选项回答",
    "en": "Answered without selecting options"
  },
  "ChatRequestCards.skippedQuestions": {
    "zh": "没有回答这 {count} 个问题",
    "en": "Skipped {count} {count, plural, one {question} other {questions}}"
  },
  "ChatRequestCards.skippedQuestion": {
    "zh": "没有回答这个问题",
    "en": "Skipped question"
  },
  "ChatRequestCards.customAnswer": {
    "zh": "自填",
    "en": "Custom answer"
  },
  "ChatSubagents.stillRunningItsReportWillAppearHereWhen": {
    "zh": "还在进行，回来后这里会有它的报告",
    "en": "Still running. Its report will appear here when it returns"
  },
  "ChatSubagents.unfinished": {
    "zh": "没有完成",
    "en": "Unfinished"
  },
  "ChatSubagents.done": {
    "zh": "完成",
    "en": "Done"
  },
  "ChatSubagents.took": {
    "zh": "用了 {value1}",
    "en": "Took {value1}"
  },
  "ChatSubagents.tookS": {
    "zh": "用了 {value1} 秒",
    "en": "Took {value1}s"
  },
  "ChatSubagents.tools": {
    "zh": "{value1} 工具",
    "en": "{value1} {value1, plural, one {tool} other {tools}}"
  },
  "ChatSubagents.subAgent": {
    "zh": "子 Agent: {value1}",
    "en": "Sub-agent: {value1}"
  },
  "ChatSubagents.instructions": {
    "zh": "指令",
    "en": "Instructions"
  },
  "ChatSubagents.result": {
    "zh": "结果",
    "en": "Result"
  },
  "ChatSubagents.stillRunning": {
    "zh": "还在进行…",
    "en": "Still running…"
  },
  "ChatSubagents.noResult": {
    "zh": "没有结果",
    "en": "No result"
  },
  "ChatSubagents.mainAgent": {
    "zh": "主 Agent",
    "en": "Main Agent"
  },
  "ChatSubagents.dispatched": {
    "zh": "派出 {value1} 个{value2}{value3}",
    "en": "Dispatched {value1} {value2}{value3}"
  },
  "ChatSubagents.running": {
    "zh": " · {running} 个进行中",
    "en": " · {running} running"
  },
  "ChatSubagents.unfinished_512": {
    "zh": " · {broken} 个没有完成",
    "en": " · {broken} unfinished"
  },
  "ChatTodos.currentStep": {
    "zh": "当前步骤",
    "en": "Current step"
  },
  "ChatTodos.allStepsCompleted": {
    "zh": "全部步骤已完成",
    "en": "All steps completed"
  },
  "ChatTodos.completed": {
    "zh": "已完成",
    "en": "Completed"
  },
  "ChatTodos.inProgress": {
    "zh": "进行中",
    "en": "In progress"
  },
  "ChatTodos.notStarted": {
    "zh": "未开始",
    "en": "Not started"
  },
  "ChatTodos.agentToDos": {
    "zh": "Agent 的待办",
    "en": "Agent to-dos"
  },
  "ChatToolCard.failed": {
    "zh": "失败",
    "en": "Failed"
  },
  "ChatToolCard.interrupted": {
    "zh": "已中断",
    "en": "Interrupted"
  },
  "ChatToolCard.moreCharacters": {
    "zh": "{value1}\n…（还有 {value2} 字）",
    "en": "{value1}\n…({value2} more characters)"
  },
  "ChatToolCard.exitCode": {
    "zh": "退出码 {code}",
    "en": "Exit code {code}"
  },
  "ChatToolCard.create": {
    "zh": "新建 ",
    "en": "Create "
  },
  "ChatToolCard.delete": {
    "zh": "删除 ",
    "en": "Delete "
  },
  "ChatToolCard.edit": {
    "zh": "编辑:",
    "en": "Edit:"
  },
  "ChatToolCard.times": {
    "zh": " · {value1} 次",
    "en": " · {value1} {value1, plural, one {time} other {times}}"
  },
  "ChatToolCard.attempt": {
    "zh": "第 {value1} 次{value2}{value3}",
    "en": "Attempt {value1}{value2}{value3}"
  },
  "ChatToolCard.errors": {
    "zh": "{value1} 项异常",
    "en": "{value1} errors"
  },
  "ChatToolCard.denied": {
    "zh": "{value1} 项已拒绝",
    "en": "{value1} denied"
  },
  "ChatToolCard.interrupted_530": {
    "zh": "{value1} 项已中断",
    "en": "{value1} interrupted"
  },
  "ChatToolCard.viewInTerminalPanel": {
    "zh": "在终端面板里看",
    "en": "View in terminal panel"
  },
  "ChatUsageLimit.quotaExhaustedResuming": {
    "zh": "额度已用完 · 正在继续…",
    "en": "Quota exhausted · Resuming…"
  },
  "ChatUsageLimit.quotaExhaustedResumed": {
    "zh": "额度已用完 · 已继续",
    "en": "Quota exhausted · Resumed"
  },
  "ChatUsageLimit.quotaExhaustedResumedAt": {
    "zh": "额度已用完 · 已于{value1} 继续",
    "en": "Quota exhausted · Resumed at {value1}"
  },
  "ChatUsageLimit.quotaExhaustedAutoResumeAt": {
    "zh": "额度已用完 · 将在{value1} 自动继续",
    "en": "Quota exhausted · Auto-resume at {value1}"
  },
  "ChatUsageLimit.quotaRestored": {
    "zh": "额度已恢复",
    "en": "Quota restored"
  },
  "ChatUsageLimit.quotaExhausted": {
    "zh": "额度已用完",
    "en": "Quota exhausted"
  },
  "ChatUsageLimit.quotaExhaustedResets": {
    "zh": "额度已用完 · {value1} 恢复",
    "en": "Quota exhausted · Resets {value1}"
  },
  "ChatUsageLimit.retrying": {
    "zh": "正在重试…",
    "en": "Retrying…"
  },
  "ChatUsageLimit.willResumeAsScheduledUnattendedInMode": {
    "zh": "将按预约{value1}继续，以「{value2}」无人值守运行",
    "en": "Will resume {value1} as scheduled, unattended in “{value2}” mode"
  },
  "ChatUsageLimit.at": {
    "zh": "在{value1} ",
    "en": "at {value1} "
  },
  "ChatUsageLimit.whenQuotaResets": {
    "zh": "在额度恢复后",
    "en": "when quota resets"
  },
  "ChatUsageLimit.willAutoResumeAt": {
    "zh": "将在{value1} 自动继续",
    "en": "Will auto-resume at {value1}"
  },
  "ChatUsageLimit.quotaResets": {
    "zh": "额度将在{value1} 恢复",
    "en": "Quota resets {value1}"
  },
  "ChatUsageLimit.quotaResetTimeIsUnknown": {
    "zh": "还不知道额度什么时候恢复",
    "en": "Quota reset time is unknown"
  },
  "ChatUsageLimit.conversationQuotaExhausted": {
    "zh": "会话额度已用完",
    "en": "Conversation quota exhausted"
  },
  "ChatUsageLimit.lastResumeFailed": {
    "zh": "上次没能继续：{value1}",
    "en": "Last resume failed: {value1}"
  },
  "ChatUsageLimit.autoResumeWhenQuotaResets": {
    "zh": "{value1}额度恢复后自动继续",
    "en": "{value1}Auto-resume when quota resets"
  },
  "ChatUsageLimit.viewInSchedules": {
    "zh": "在预约页查看",
    "en": "View in schedules"
  },
  "ChatUsageLimit.retryNow": {
    "zh": "立即重试",
    "en": "Retry now"
  },
  "ChatWorking.runningTools": {
    "zh": "运行工具",
    "en": "Running tools"
  },
  "ChatWorking.writingReply": {
    "zh": "写回复",
    "en": "Writing reply"
  },
  "ChatWorking.waitingForYourAnswer": {
    "zh": "等你回答",
    "en": "Waiting for your answer"
  },
  "ChatWorking.processing": {
    "zh": "处理",
    "en": "Processing"
  },
  "ChatWorking.subAgents": {
    "zh": "{value1} 个子 Agent",
    "en": "{value1} sub-agents"
  },
  "ChatWorking.commands": {
    "zh": "{value1} 个命令",
    "en": "{value1} {value1, plural, one {command} other {commands}}"
  },
  "ChatWorking.background": {
    "zh": "后台：{out}",
    "en": "Background: {out}"
  },
  "ChatWorking.runningInBackground": {
    "zh": "后台运行中：{out}",
    "en": "Running in background: {out}"
  },
  "CjkFontPicker.default": {
    "zh": "默认",
    "en": "Default"
  },
  "CodeFontPicker.chooseCodeFont": {
    "zh": "选择代码字体",
    "en": "Choose code font"
  },
  "CommitMessageButton.useThisAgentSSmallModelToDraft": {
    "zh": "让这个 Agent 用小模型根据改动写，写好后再看一眼",
    "en": "This Agent's small model drafts a message from the changes, for you to review"
  },
  "CommitMessageButton.generating": {
    "zh": "正在生成…",
    "en": "Generating…"
  },
  "CommitMessageButton.generateCommitMessage": {
    "zh": "生成提交信息",
    "en": "Generate message"
  },
  "ConversationActions.onlyWasFoundOnThisComputerInstallAnother": {
    "zh": "这台电脑上只找到了 {value1}。装好另一个外部智能体后，在 设置 → 外部智能体 里重新检测，就可以移交了。",
    "en": "Only {value1} was found on this computer. Install another external agent and scan again in Settings → External agents to enable handoffs."
  },
  "ConversationActions.deleteThisConversationAndItsChatHistoryProject": {
    "zh": "删除这条会话及其聊天记录？项目目录或 Antumi 托管目录都会保留，不会改动其中的文件。",
    "en": "Delete this conversation and its chat history? Project and Antumi-managed directories and their files will be kept."
  },
  "ConversationActions.actionsForConversation": {
    "zh": "会话「{value1}」的操作",
    "en": "Actions for conversation “{value1}”"
  },
  "ConversationActions.openInRightSplitPane": {
    "zh": "在右侧分屏打开",
    "en": "Open in right split pane"
  },
  "ConversationActions.openInOtherPane": {
    "zh": "在另一列打开",
    "en": "Open in other pane"
  },
  "ConversationActions.click": {
    "zh": "{PRIMARY_KEY_LABEL} 点击",
    "en": "{PRIMARY_KEY_LABEL} click"
  },
  "ConversationActions.unpin": {
    "zh": "取消置顶",
    "en": "Unpin"
  },
  "ConversationActions.pin": {
    "zh": "置顶",
    "en": "Pin"
  },
  "ConversationActions.rename": {
    "zh": "重命名",
    "en": "Rename"
  },
  "ConversationActions.newWithSameConfiguration": {
    "zh": "同配置新建",
    "en": "New with same configuration"
  },
  "ConversationActions.handOff": {
    "zh": "移交…",
    "en": "Hand off…"
  },
  "ConversationActions.stopConversation": {
    "zh": "停止会话",
    "en": "Stop conversation"
  },
  "ConversationActions.archive": {
    "zh": "归档",
    "en": "Archive"
  },
  "ConversationActions.waitUntilTheAgentFinishesThisTurn": {
    "zh": "等 Agent 这一轮结束",
    "en": "Wait until the Agent finishes this turn"
  },
  "ConversationActions.deleteConversation": {
    "zh": "删除会话",
    "en": "Delete conversation"
  },
  "ConversationBranches.switchedToAgentWillBeNotifiedWithYour": {
    "zh": "已切到 {branch}，下一条消息会告诉 Agent。",
    "en": "Switched to {branch}. Agent will be notified with your next message."
  },
  "ConversationBranches.thereAreUncommittedChangesCommitOrStashThem": {
    "zh": "有 {value1} 个未提交的改动，先提交或暂存再切换。",
    "en": "There are {value1} uncommitted changes. Commit or stash them before switching."
  },
  "ConversationBranches.alsoUseThisDirectoryAndWillSeeDifferent": {
    "zh": "{value1}也在用这个目录，切换后它们看到的文件也会变。",
    "en": "{value1} also use this directory and will see different files after switching."
  },
  "ConversationBranches.conversation": {
    "zh": "会话「{title}」",
    "en": "Conversation “{title}”"
  },
  "ConversationBranches.searchBranchesEnterToSwitchToTheFirst": {
    "zh": "搜索分支，回车切到第一个",
    "en": "Search branches; Enter to switch to the first"
  },
  "ConversationBranches.searchBranches": {
    "zh": "搜索分支",
    "en": "Search branches"
  },
  "ConversationBranches.checkedOutIn": {
    "zh": "已在 {holder} 里检出",
    "en": "Checked out in {holder}"
  },
  "ConversationBranches.in": {
    "zh": "在 {value1} 里",
    "en": "In {value1}"
  },
  "BranchHolder.inMainFolder": {
    "zh": "在主目录里",
    "en": "In the main folder"
  },
  "BranchHolder.inConversation": {
    "zh": "在会话「{title}」里",
    "en": "In “{title}”"
  },
  "BranchHolder.inArchivedConversation": {
    "zh": "在已归档的会话「{title}」里",
    "en": "In archived “{title}”"
  },
  "BranchHolder.heldByConversation": {
    "zh": "「{branch}」检出在会话「{title}」的 worktree 里，git 不允许同一个分支同时在两个地方检出。那个会话换了分支或不再需要这个 worktree 后，这里才能切过去。",
    "en": "{branch} is checked out in the worktree of “{title}”, and git checks a branch out in one place at a time. Switch to it here once that conversation moves to another branch or its worktree goes."
  },
  "BranchHolder.heldByArchivedConversation": {
    "zh": "「{branch}」检出在已归档会话「{title}」的 worktree 里。里面没有要留的改动的话，到 worktree 管理里把它清理掉，这里就能切过去。",
    "en": "{branch} is checked out in the worktree of archived “{title}”. If nothing there needs keeping, clean it up in worktree management and switch to it here."
  },
  "BranchHolder.heldByMainFolder": {
    "zh": "「{branch}」正在仓库主目录里检出，git 不允许同一个分支同时在两个地方检出。先在主目录切到别的分支，这里才能切过去。",
    "en": "{branch} is checked out in the repository's main folder, and git checks a branch out in one place at a time. Switch the main folder to another branch first."
  },
  "BranchHolder.heldElsewhere": {
    "zh": "「{branch}」检出在另一个 worktree 里：{folder}。它不是 Antumi 建的，用完后可以用 git worktree remove 删掉，这里就能切过去。",
    "en": "{branch} is checked out in another worktree: {folder}. Antumi did not make it; once done with it, remove it with git worktree remove and switch to the branch here."
  },
  "BranchHolder.manageWorktrees": {
    "zh": "去 worktree 管理",
    "en": "Manage worktrees"
  },
  "ConversationBranches.noMatchingBranches": {
    "zh": "没有匹配的分支",
    "en": "No matching branches"
  },
  "ConversationBranches.newBranchNameEGFixLogin": {
    "zh": "新分支名，如 fix/login",
    "en": "New branch name, e.g. fix/login"
  },
  "ConversationBranches.newBranchName": {
    "zh": "新分支名",
    "en": "New branch name"
  },
  "ConversationBranches.createAndSwitch": {
    "zh": "创建并切换",
    "en": "Create and switch"
  },
  "ConversationBranches.branchFromTheCurrentCommitCarryingUncommittedChanges": {
    "zh": "从当前提交拉出，未提交的改动会一起带过去。",
    "en": "Branch from the current commit, carrying uncommitted changes with you."
  },
  "ConversationBranches.commitMessageTitleOnTheFirstLineBlank": {
    "zh": "提交信息：第一行是标题，空一行再写说明。留空则由 Agent 用小模型写好后直接提交",
    "en": "Commit message: a title, a blank line, then details. Leave it empty and the Agent's small model writes one and commits"
  },
  "ConversationBranches.commitMessageTitleOnTheFirstLineBlank_595": {
    "zh": "提交信息：第一行是标题，空一行再写详细说明",
    "en": "Commit message: a title, a blank line, then details"
  },
  "ConversationBranches.commitMessage": {
    "zh": "提交信息",
    "en": "Commit message"
  },
  "ConversationBranches.commitAllChangesInThisRepositoryWithoutAn": {
    "zh": "提交这个仓库里的全部改动{value1}，没有 upstream 时推到 origin 并跟踪它。",
    "en": "Commits every change in this repository{value1}. A branch with no upstream is pushed to origin and tracks it."
  },
  "ConversationBranches.commitPushAlsoPushesTheCurrentBranch": {
    "zh": "；Commit & Push 再接着推送当前分支",
    "en": "; Commit & Push then pushes the current branch"
  },
  "ConversationBranches.thenPushTheCurrentBranch": {
    "zh": "，并推送当前分支",
    "en": ", then pushes the current branch"
  },
  "ConversationBranches.pushCommitsOnTo": {
    "zh": "把 {value1} 上的 {value2} 个提交推送到 {value3}。",
    "en": "Push {value2} {value2, plural, one {commit} other {commits}} on {value1} to {value3}."
  },
  "ConversationBranches.hasNoUpstreamItWillPushToOrigin": {
    "zh": "{value1} 还没有 upstream，会推送到 origin 并跟踪它。",
    "en": "{value1} has no upstream. It will push to origin and track it."
  },
  "ConversationBranches.uncommittedChangesWillNotBePushed": {
    "zh": "还有 {value1} 个未提交的改动，不会被推送。",
    "en": "{value1} uncommitted changes will not be pushed."
  },
  "ConversationBranches.switchBranch": {
    "zh": "切换分支",
    "en": "Switch branch"
  },
  "ConversationBranches.newBranch": {
    "zh": "新建分支",
    "en": "New branch"
  },
  "ConversationBranches.currentlyOn": {
    "zh": " · 当前在 {value1}",
    "en": " · Currently on {value1}"
  },
  "ConversationBranches.committedAndPushedTo": {
    "zh": "已提交 {value1}「{value2}」并推送到 {value3}。",
    "en": "Committed {value1} “{value2}” and pushed to {value3}."
  },
  "ConversationBranches.committedNotPushedYet": {
    "zh": "已提交 {value1}「{value2}」，还没推送。",
    "en": "Committed {value1} “{value2}”, not pushed yet."
  },
  "ConversationBranches.committedAndPushedTo_608": {
    "zh": "已提交 {value1} 并推送到 {value2}。",
    "en": "Committed {value1} and pushed to {value2}."
  },
  "ConversationBranches.committedNotPushedYet_609": {
    "zh": "已提交 {value1}，还没推送。",
    "en": "Committed {value1}, not pushed yet."
  },
  "ConversationBranches.pushedTo": {
    "zh": "已把 {value1} 推送到 {value2}。",
    "en": "Pushed {value1} to {value2}."
  },
  "ConversationBranches.noCurrentBranch": {
    "zh": "当前没有分支",
    "en": "No current branch"
  },
  "ConversationBranches.noChangesToCommit": {
    "zh": "没有可以提交的改动",
    "en": "No changes to commit"
  },
  "ConversationBranches.noCommitsToPush": {
    "zh": "没有要推送的提交",
    "en": "No commits to push"
  },
  "ConversationBranches.switch": {
    "zh": "{value1}切换",
    "en": "{value1}Switch"
  },
  "ConversationBranches.new": {
    "zh": "{value1}新建",
    "en": "{value1}New"
  },
  "ConversationBranches.writingCommitMessageThenCommitting": {
    "zh": "正在写提交信息，写好就提交…",
    "en": "Writing commit message, then committing…"
  },
  "ConversationBranches.pushing": {
    "zh": "正在推送 {value1}…",
    "en": "Pushing {value1}…"
  },
  "ConversationChat.totalTokens": {
    "zh": " · 总 {value1} tokens",
    "en": " · Total {value1} {value1, plural, one {token} other {tokens}}"
  },
  "ConversationChat.resumedAfterBackgroundCommand": {
    "zh": "后台命令结束后继续，",
    "en": "Resumed after background command, "
  },
  "ConversationChat.resumedAfterSubAgentReturned": {
    "zh": "子 Agent 回来后继续，",
    "en": "Resumed after sub-agent returned, "
  },
  "ConversationChat.autoResumed": {
    "zh": "自动继续，",
    "en": "Auto-resumed, "
  },
  "ConversationChat.completed": {
    "zh": "{why}完成{took}",
    "en": "{why}completed{took}"
  },
  "ConversationChat.interrupted": {
    "zh": "{why}已中断{took}{value3}",
    "en": "{why}interrupted{took}{value3}"
  },
  "ConversationChat.failed": {
    "zh": "{why}失败{took}{value3}",
    "en": "{why}failed{took}{value3}"
  },
  "ConversationChat.readOnlyPlanning": {
    "zh": " · 只读规划",
    "en": " · Read-only planning"
  },
  "ConversationChat.runningInWorktree": {
    "zh": " · 在 worktree 里执行",
    "en": " · Running in worktree"
  },
  "ConversationChat.attempt": {
    "zh": " · 第 {value1} 次尝试",
    "en": " · Attempt {value1}"
  },
  "ConversationChat.thinking": {
    "zh": "思考中",
    "en": "Thinking"
  },
  "ConversationChat.thoughtFor": {
    "zh": "思考了 {value1}",
    "en": "Thought for {value1}"
  },
  "ConversationChat.reasoning": {
    "zh": "思考过程",
    "en": "Reasoning"
  },
  "ConversationChat.loadingChatHistory": {
    "zh": "正在读取聊天记录",
    "en": "Loading chat history"
  },
  "ConversationChat.forkBeforeThisMessageCreateAConversationUp": {
    "zh": "从这条消息 fork：新会话到它之前为止，这条消息留在输入框里",
    "en": "Fork before this message: create a conversation up to it, with this message in the composer"
  },
  "ConversationChat.forkHereCreateAConversationThroughThisTurn": {
    "zh": "从这里 fork：新会话到这一轮为止",
    "en": "Fork here: create a conversation through this turn"
  },
  "ConversationChat.copyMessage": {
    "zh": "复制消息",
    "en": "Copy message"
  },
  "ConversationChat.jumpToOriginalQuote": {
    "zh": "跳到引用的原文",
    "en": "Jump to original quote"
  },
  "ConversationChat.handedOffToWithNoAdditionalInstructions": {
    "zh": "移交给 {value1}，没有补充说明",
    "en": "Handed off to {value1} with no additional instructions"
  },
  "ConversationChat.additionalInstructions": {
    "zh": "追加指令",
    "en": "Additional instructions"
  },
  "ConversationChat.messageInsertedDuringTheTurn": {
    "zh": "回合进行中插入的消息",
    "en": "Message inserted during the turn"
  },
  "ConversationChat.expandFullText": {
    "zh": "展开全文",
    "en": "Expand full text"
  },
  "ConversationChat.firstMessageNotSent": {
    "zh": "首条消息未发送：{value1}",
    "en": "First message not sent: {value1}"
  },
  "ConversationChat.contextCompacted": {
    "zh": "上下文已压缩",
    "en": "Context compacted"
  },
  "ConversationChat.stopping": {
    "zh": "正在停止…",
    "en": "Stopping…"
  },
  "ConversationChat.stopAndRetry": {
    "zh": "停止并重试",
    "en": "Stop and retry"
  },
  "ConversationChat.reconnecting": {
    "zh": "正在重连…",
    "en": "Reconnecting…"
  },
  "ConversationChat.reconnectAndRetry": {
    "zh": "重新连接并重试",
    "en": "Reconnect and retry"
  },
  "ConversationChat.workedForS": {
    "zh": "处理了 {value1} 秒",
    "en": "Worked for {value1}s"
  },
  "ConversationChat.copyReply": {
    "zh": "复制回复",
    "en": "Copy reply"
  },
  "ConversationChat.thisReply": {
    "zh": "这条回复",
    "en": "This reply"
  },
  "ConversationChat.quoteInMainConversation": {
    "zh": "引用到主会话",
    "en": "Quote in main conversation"
  },
  "ConversationChat.model": {
    "zh": "模型：{model}",
    "en": "Model: {model}"
  },
  "ConversationChat.reasoningEffort": {
    "zh": "推理程度：{value1}",
    "en": "Reasoning effort: {value1}"
  },
  "ConversationChat.steps": {
    "zh": "{steps} 步",
    "en": "{steps} {steps, plural, one {step} other {steps}}"
  },
  "ConversationChat.workDetails": {
    "zh": "工作过程",
    "en": "Work details"
  },
  "ConversationChat.modifiedFiles": {
    "zh": "修改了 {value1} 个文件",
    "en": "Modified {value1} {value1, plural, one {file} other {files}}"
  },
  "ConversationChat.review": {
    "zh": "审查",
    "en": "Review"
  },
  "ConversationChat.viewAllProjectChangesInInspector": {
    "zh": "在检查器里查看项目的全部改动",
    "en": "View all project changes in inspector"
  },
  "ConversationChat.outsideProjectClickToViewThisTurnS": {
    "zh": "{value1}\n项目外的文件，点开看这一轮的编辑",
    "en": "{value1}\nOutside project; click to view this turn's edits"
  },
  "ConversationChat.outsideProject": {
    "zh": "项目外",
    "en": "Outside project"
  },
  "ConversationChat.new": {
    "zh": "新建",
    "en": "New"
  },
  "ConversationChat.collapseFileList": {
    "zh": "收起文件列表",
    "en": "Collapse file list"
  },
  "ConversationChat.showMoreFiles": {
    "zh": "显示另外 {hidden} 个文件",
    "en": "Show {hidden} more files"
  },
  "ConversationChat.handoff": {
    "zh": "（移交）",
    "en": "(Handoff)"
  },
  "ConversationChat.loadEarlierMessages": {
    "zh": "加载更早的聊天记录",
    "en": "Load earlier messages"
  },
  "ConversationChat.jumpToLatest": {
    "zh": "{value1}回到最新",
    "en": "{value1}Jump to latest"
  },
  "ConversationChat.commentOnThisReply": {
    "zh": "评论这段回复",
    "en": "Comment on this reply"
  },
  "ConversationDraft.newConversation": {
    "zh": "新会话",
    "en": "New conversation"
  },
  "ConversationDraft.investigateIssue": {
    "zh": "排查 issue",
    "en": "Investigate issue"
  },
  "ConversationDraft.investigate": {
    "zh": "排查 {value1}",
    "en": "Investigate {value1}"
  },
  "ConversationDraft.openIn": {
    "zh": "在 {value1} 中打开",
    "en": "Open in {value1}"
  },
  "ConversationDraft.stopInvestigatingThisIssue": {
    "zh": "不排查这个 issue",
    "en": "Stop investigating this issue"
  },
  "ConversationDraft.switchToRegularConversation": {
    "zh": "改成普通会话",
    "en": "Switch to regular conversation"
  },
  "ConversationDraft.startANewConversation": {
    "zh": "开始新的会话",
    "en": "Start a new conversation"
  },
  "ConversationTip.referenceConversation": {"zh": "输入 @ 选择「会话」，让 Agent 参考之前的讨论。", "en": "Type @ and pick a conversation to let the agent build on an earlier discussion."},
  "ConversationTip.delegate": {"zh": "会话开始后，在消息里 @ 你的智能体，Agent 会把子任务交给它。", "en": "Once the conversation starts, @ one of your agents in a message to hand it a subtask."},
  "ConversationTip.handOff": {"zh": "额度用完或想换个思路时，可在会话菜单里「移交」给另一个 Agent 接着做。", "en": "Out of quota or want a second take? Hand off from the conversation menu and another agent picks up here."},
  "ConversationTip.images": {"zh": "截图可以直接粘贴，图片也能拖进输入框。", "en": "Paste a screenshot straight in, or drag images into the input."},
  "ConversationTip.sendWays": {"zh": "Agent 工作时发的消息会等这一回合结束再送达，按 {keys} 可立刻插入；鼠标停在发送按钮上能看到全部发送方式。", "en": "A message sent while the agent works waits for the turn to end; {keys} inserts it now. Hover the send button for every way to send."},
  "ConversationTip.sendToNewConversation": {"zh": "会话中按 {keys}，可把消息发到一个新会话，沿用原会话的 Agent 和设置。", "en": "In a conversation, {keys} sends the message to a new one with the same agent and settings."},
  "ConversationTip.schedule": {"zh": "额度不够或想晚点再做？会话中点输入框里的时钟「预约发送」，额度恢复后或到点自动发出。", "en": "Out of quota or want it later? In a conversation, click the clock in the input to schedule it for when quota resets or a time you pick."},
  "ConversationDraft.chooseAnAgentToStart": {
    "zh": "用哪个开始呢？",
    "en": "Which one to start with?"
  },
  "ConversationDraft.usingAgent": {
    "zh": "使用智能体",
    "en": "Using agent"
  },
  "ConversationDraft.agentReadsTheOriginalIssueAndInvestigatesIn": {
    "zh": "Agent 先读这个 issue 的原文，只读排查，给出原因和修复方案后停下；确认后可以切换模式，就在这个会话里修。",
    "en": "Agent reads the original issue and investigates in read-only mode, then stops with findings and a fix plan. After approval, switch modes to fix it in this conversation."
  },
  "ConversationDraft.usingTheConfigurationOfWithAFreshConversation": {
    "zh": "已沿用「{value1}」的配置，聊天上下文从空白开始。",
    "en": "Using the configuration of “{value1}” with a fresh conversation context."
  },
  "ConversationDraft.sendingTheFirstMessageCreatesTheConversationAnd": {
    "zh": "发出第一条消息时创建会话并启动 Agent。",
    "en": "Sending the first message creates the conversation and starts Agent."
  },
  "ConversationDraft.newWorktree": {
    "zh": "{value1}新 worktree",
    "en": "{value1}New worktree"
  },
  "ConversationDraft.createABranchAndWorktreeForEachProject": {
    "zh": "主项目从左边选的分支、其他项目从当前提交，各拉一个新分支和 worktree，互不干扰；未提交的改动不会带过去。不勾选就直接在项目目录里改",
    "en": "Create a branch and worktree for each project: primary from the selected branch, others from their current commit. Uncommitted changes are excluded. Uncheck to work in the project directories directly"
  },
  "ConversationDraft.createABranchAndWorktreeFromEachProject": {
    "zh": "每个项目从当前提交拉一个新分支和 worktree，互不干扰；未提交的改动不会带过去。不勾选就直接在项目目录里改",
    "en": "Create a branch and worktree from each project's current commit. Uncommitted changes are excluded. Uncheck to work in the project directories directly"
  },
  "ConversationDraft.firstMessage": {
    "zh": "第一条消息",
    "en": "First message"
  },
  "ConversationDraft.chooseAnAgentAboveFirst": {
    "zh": "先在上面选一个 Agent",
    "en": "Choose an Agent above first"
  },
  "ConversationDraft.additionalInstructionsOptionalEnterToInvestigate": {"zh": "补充说明（可选）{send}", "en": "Additional instructions (optional){send}"},
  "ConversationDraft.sendTheFirstMessageToEnterToSend": {"zh": "给 {value1} 发第一条消息{send}，Shift+Enter 换行", "en": "Send the first message to {value1}{send}; Shift+Enter for a new line"},
  "ConversationDraft.readingIssueAndStarting": {
    "zh": "正在读取 issue 并启动 {value1}…",
    "en": "Reading issue and starting {value1}…"
  },
  "ConversationDraft.creatingWorktreeAndStarting": {
    "zh": "正在建 worktree 并启动 {value1}…",
    "en": "Creating worktree and starting {value1}…"
  },
  "ConversationDraft.investigateEnter": {"zh": "开始排查", "en": "Investigate"},
  "ConversationInspector.loadingChanges": {
    "zh": "正在读取改动…",
    "en": "Loading changes…"
  },
  "ConversationInspector.thisConversationSProjectIsNotInA": {
    "zh": "这个会话的项目不在 git 仓库里，没有可以对比的改动。",
    "en": "This conversation's project is not in a Git repository. There are no changes to compare."
  },
  "ConversationInspector.noStartingCommitWasRecordedForThisConversation": {
    "zh": "会话开始时还没有记录起点，看不到这之后的提交",
    "en": "No starting commit was recorded for this conversation, so later commits cannot be shown"
  },
  "ConversationInspector.commitsInThisConversation": {
    "zh": "本次会话的提交",
    "en": "Commits in this conversation"
  },
  "ConversationInspector.uncommittedChanges": {
    "zh": "未提交的改动",
    "en": "Uncommitted changes"
  },
  "ConversationInspector.noUncommittedChanges": {
    "zh": "没有未提交的改动",
    "en": "No uncommitted changes"
  },
  "ConversationInspector.youShareTheProjectDirectoryUncommittedChangesMay": {
    "zh": "项目目录和你共用，未提交的改动里也可能有你自己的。",
    "en": "You share the project directory. Uncommitted changes may include your own work."
  },
  "ConversationInspector.conversationInspector": {
    "zh": "会话检查器",
    "en": "Conversation inspector"
  },
  "ConversationList.noGrouping": {
    "zh": "不分组",
    "en": "No grouping"
  },
  "ConversationList.agent": {
    "zh": "Agent",
    "en": "Agent"
  },
  "ConversationList.runStatus": {
    "zh": "运行状态",
    "en": "Run status"
  },
  "ConversationList.recentActivity": {
    "zh": "最近活动",
    "en": "Recent activity"
  },
  "ConversationList.created": {
    "zh": "创建时间",
    "en": "Created"
  },
  "ConversationList.title": {
    "zh": "标题",
    "en": "Title"
  },
  "ConversationList.running": {
    "zh": "运行中",
    "en": "Running"
  },
  "ConversationList.stopped": {
    "zh": "已停止",
    "en": "Stopped"
  },
  "ConversationList.pinned": {
    "zh": "已置顶",
    "en": "Pinned"
  },
  "ConversationList.groupAndSortConversations": {
    "zh": "会话的分组和排序",
    "en": "Group and sort conversations"
  },
  "ConversationList.density": {"zh": "列表样式", "en": "Rows"},
  "ConversationList.comfortable": {"zh": "标准", "en": "Comfortable"},
  "ConversationList.compact": {"zh": "紧凑", "en": "Compact"},
  "ConversationPeek.details": {"zh": "会话详情", "en": "Conversation details"},
  "ConversationPeek.agent": {"zh": "Agent", "en": "Agent"},
  "ConversationPeek.status": {"zh": "状态", "en": "Status"},
  "ConversationPeek.projects": {"zh": "项目", "en": "Projects"},
  "ConversationPeek.noProject": {"zh": "未选项目", "en": "No project"},
  "ConversationPeek.workspace": {"zh": "工作目录", "en": "Works in"},
  "ConversationPeek.branch": {"zh": "分支", "en": "Branch"},
  "ConversationPeek.detached": {"zh": "未在分支上", "en": "Detached HEAD"},
  "ConversationPeek.changes": {"zh": "{count} 处未提交改动", "en": "{count} uncommitted {count, plural, one {change} other {changes}}"},
  "ConversationPeek.time": {"zh": "时间", "en": "Time"},
  "ConversationPeek.createdUpdated": {"zh": "{created} 创建 · {updated}活动", "en": "Created {created} · active {updated}"},
  "ConversationList.groupBy": {
    "zh": "分组方式",
    "en": "Group by"
  },
  "ConversationList.sortBy": {
    "zh": "排序方式",
    "en": "Sort by"
  },
  "ConversationList.showArchived": {
    "zh": "显示已归档（{archived}）",
    "en": "Show archived ({archived})"
  },
  "ConversationList.conversationTitle": {
    "zh": "会话标题",
    "en": "Conversation title"
  },
  "ConversationList.inPane": {
    "zh": "在第 {value1} 列",
    "en": "In pane {value1}"
  },
  "ConversationList.conversations": {
    "zh": "会话列表",
    "en": "Conversations"
  },
  "ConversationList.searchConversations": {
    "zh": "搜索会话",
    "en": "Search conversations"
  },
  "ConversationList.groupAndSort": {
    "zh": "分组和排序",
    "en": "Group and sort"
  },
  "ConversationList.newConversation": {
    "zh": "新建会话",
    "en": "New conversation"
  },
  "ConversationList.titleProjectNameOrChatContent": {
    "zh": "标题、项目名或聊天内容",
    "en": "Title, project name, or chat content"
  },
  "ConversationList.noConversationsYetClickAtTheTopRight": {
    "zh": "还没有会话，点右上角的 ＋ 新建。",
    "en": "No conversations yet. Click ＋ at the top right to create one."
  },
  "ConversationList.noConversationsMatch": {
    "zh": "没有找到匹配「{needle}」的会话。",
    "en": "No conversations match “{needle}”."
  },
  "ConversationList.newConversationIn": {
    "zh": "在 {value1} 新建会话",
    "en": "New conversation in {value1}"
  },
  "ConversationList.archived": {
    "zh": "已归档",
    "en": "Archived"
  },
  "ConversationList.archived_718": {
    "zh": "{value1}已归档{value2}",
    "en": "{value1}Archived{value2}"
  },
  "ConversationList.showMore": {
    "zh": "显示更多（{hidden}）",
    "en": "Show {hidden} more"
  },
  "ConversationList.showLess": {
    "zh": "收起",
    "en": "Show less"
  },
  "GuideView.guide": {
    "zh": "使用指南",
    "en": "User guide"
  },
  "GuideView.backToOverview": {
    "zh": "回到总览",
    "en": "Back to Overview"
  },
  "ConversationSplit.rightPane": {
    "zh": "右列",
    "en": "Right pane"
  },
  "ConversationStatus.newActivity": {
    "zh": "有新动态",
    "en": "New activity"
  },
  "ConversationView.forkedFrom": {
    "zh": "从「{value1}」fork",
    "en": "Forked from “{value1}”"
  },
  "ConversationView.forkedFromADeletedConversation": {
    "zh": "fork 自一条已删除的会话",
    "en": "Forked from a deleted conversation"
  },
  "ConversationView.inspectorToDos": {
    "zh": "检查器 · {todoLeft} 项待办",
    "en": "Inspector · {todoLeft} to-dos"
  },
  "ConversationView.viewChanges": {
    "zh": "查看改动",
    "en": "View changes"
  },
  "ConversationView.viewPlan": {
    "zh": "查看计划",
    "en": "View plan"
  },
  "ConversationView.viewRawData": {
    "zh": "查看原始数据",
    "en": "View raw data"
  },
  "ConversationView.pane": {
    "zh": "第 {value1} 列：{value2}",
    "en": "Pane {value1}: {value2}"
  },
  "ConversationView.conversation": {
    "zh": "{value1} 的会话",
    "en": "{value1} conversation"
  },
  "ConversationView.pane_729": {
    "zh": "第 {value1} 列{value2}（{PRIMARY_KEY_LABEL}{value4}）",
    "en": "Pane {value1}{value2} ({PRIMARY_KEY_LABEL}{value4})"
  },
  "ConversationView.active": {
    "zh": "，当前",
    "en": ", active"
  },
  "ConversationView.clickToRename": {
    "zh": "{value1}\n点击重命名",
    "en": "{value1}\nClick to rename"
  },
  "ConversationView.investigate": {
    "zh": "排查 {value1}{value2}",
    "en": "Investigate {value1}{value2}"
  },
  "ConversationView.fromRoutine": {
    "zh": "来自定时任务{value1} ·{value2}",
    "en": "From routine {value1} ·{value2}"
  },
  "ConversationView.backToRoutine": {
    "zh": "回到定时任务",
    "en": "Back to routine"
  },
  "ConversationView.memberOfGroupChat": {
    "zh": "群聊{value1}的成员 ·{value2}",
    "en": "Member of group chat {value1} ·{value2}"
  },
  "ConversationView.messagesSentHereGoOnlyToThisMember": {
    "zh": "在这里发的消息只有这个成员看到，不进群聊",
    "en": "Messages sent here go only to this member, not the group"
  },
  "ConversationView.backToGroupChat": {
    "zh": "回到群聊",
    "en": "Back to group chat"
  },
  "ConversationView.startABlankConversationWithTheCurrentConfiguration": {
    "zh": "沿用当前配置，开启空白会话",
    "en": "Start a blank conversation with the current configuration"
  },
  "ConversationView.inspectorToDos_739": {
    "zh": "检查器，{todoLeft} 项待办",
    "en": "Inspector, {todoLeft} to-dos"
  },
  "ConversationView.inspector": {
    "zh": "检查器",
    "en": "Inspector"
  },
  "ConversationView.collapseInspector": {
    "zh": "收起检查器",
    "en": "Collapse inspector"
  },
  "ConversationView.helperNeedsYourResponse": {
    "zh": "小助手等你处理",
    "en": "Helper needs your response"
  },
  "ConversationView.closeThisPane": {
    "zh": "关闭这一列",
    "en": "Close this pane"
  },
  "ConversationView.releaseToOpenInARightSplitPane": {
    "zh": "松开，在右侧分屏打开",
    "en": "Release to open in a right split pane"
  },
  "CopyButton.copy": {
    "zh": "复制",
    "en": "Copy"
  },
  "DailyBars.count": {
    "zh": "次数",
    "en": "Count"
  },
  "DailyBars.dailyTrends": {
    "zh": "Antumi 里的工作",
    "en": "Work in Antumi"
  },
  "DailyBars.tasksconversationsquickRequests": {
    "zh": "{value1}任务{value2}对话{value3}轻量请求",
    "en": "{value1}Tasks{value2}Conversations{value3}Quick requests"
  },
  "DailyBars.tasksConversationsQuickRequests": {
    "zh": "{value1} · 任务 {value2} · 对话 {value3} · 轻量请求 {value4}",
    "en": "{value1} · Tasks {value2} · Conversations {value3} · Quick requests {value4}"
  },
  "DashboardKpis.comparedWithPreviousDays": {
    "zh": " 较前 {range} 天",
    "en": " compared with previous {range} {range, plural, one {day} other {days}}"
  },
  "DashboardKpis.noDataForThePreviousDays": {
    "zh": "前 {range} 天无数据",
    "en": "No data for the previous {range} {range, plural, one {day} other {days}}"
  },
  "DashboardKpis.taskRuns": {
    "zh": "任务运行",
    "en": "Task runs"
  },
  "DashboardKpis.agentRunsThatEndedInThisPeriod": {
    "zh": "这段时间结束的 Agent 运行",
    "en": "Agent runs that ended in this period"
  },
  "DashboardKpis.acceptanceRate": {
    "zh": "接受率",
    "en": "Acceptance rate"
  },
  "DashboardKpis.shareOfReviewedRunsAcceptedDirectly": {
    "zh": "你判定过的运行里，直接接受的比例",
    "en": "Share of reviewed runs accepted directly"
  },
  "DashboardKpis.onlyReviewsTooFewSamples": {
    "zh": "判定 {value1} 次，样本太少",
    "en": "Only {value1} reviews; too few samples"
  },
  "DashboardKpis.medianDuration": {
    "zh": "耗时中位",
    "en": "Median duration"
  },
  "DashboardKpis.fromRunStartToDeliveryIncludingYourResponse": {
    "zh": "一次运行从开始到交付，含你中间的时间",
    "en": "From run start to delivery, including your response time"
  },
  "DashboardKpis.totalTokens": {
    "zh": "token 合计",
    "en": "Total tokens"
  },
  "DashboardKpis.tokensReadAndWrittenByTaskRunsConversation": {
    "zh": "任务运行、对话回合、翻译和提交说明读写的 token",
    "en": "Tokens read and written by task runs, conversation turns, translations, and commit messages"
  },
  "DashboardKpis.conversationTurns": {
    "zh": "对话回合",
    "en": "Conversation turns"
  },
  "DashboardKpis.completedConversationTurnsExcludingTaskChats": {
    "zh": "对话里结束的回合，不含任务里的",
    "en": "Completed conversation turns, excluding task chats"
  },
  "DashboardKpis.failedInterrupted": {
    "zh": "失败 / 中断",
    "en": "Failed / interrupted"
  },
  "DashboardKpis.turnsEndingWithErrorsIncludingQuotaLimitsStopped": {
    "zh": "出错结束的回合（撞额度的也算）/ 被停下的回合",
    "en": "Turns ending with errors (including quota limits) / stopped turns"
  },
  "DashboardKpis.ofTurns": {
    "zh": "占回合的 {value1}",
    "en": "{value1} of turns"
  },
  "DashboardKpis.noTurns": {
    "zh": "没有回合",
    "en": "No turns"
  },
  "DashboardKpis.smallModelSavings": {
    "zh": "小模型省下",
    "en": "Small-model savings"
  },
  "DashboardKpis.estimatedAtApiListPricesModelPriceDifference": {
    "zh": "按 API 标价折算；模型差价加避免读取主上下文的成本，逐次最低为零。{value1}",
    "en": "Estimated at API list prices: model price difference plus avoided main-context reads, with each request's savings floored at zero.{value1}"
  },
  "DashboardKpis.about": {
    "zh": "约 {value1}",
    "en": "About {value1}"
  },
  "DashboardKpis.estimableRequests": {
    "zh": "可估算 {value1} / {value2} 次",
    "en": "Estimable: {value1} / {value2} {value2, plural, one {request} other {requests}}"
  },
  "DashboardPanel.days": {
    "zh": "{range} 天",
    "en": "{range} {range, plural, one {day} other {days}}"
  },
  "DashboardPanel.taskStatus": {
    "zh": "任务状态",
    "en": "Task status"
  },
  "DashboardPanel.totalNow": {
    "zh": "现在共 {value1} 个",
    "en": "{value1} total now"
  },
  "DashboardPanel.noTasksYet": {
    "zh": "还没有任务。",
    "en": "No tasks yet."
  },
  "DashboardPanel.taskRunsConversationsAndQuickRequestsGroupedBy": {
    "zh": "任务运行、对话和轻量请求的用量，按这台电脑的日期计{value1}",
    "en": "Task runs, conversations, and quick requests, grouped by this computer's local date{value1}"
  },
  "DashboardPanel.updated": {
    "zh": " · 更新于 {value1}",
    "en": " · Updated {value1}"
  },
  "DashboardPanel.timeRange": {
    "zh": "时间范围",
    "en": "Time range"
  },
  "DashboardPanel.loading": {
    "zh": "正在读取…",
    "en": "Loading…"
  },
  "DashboardPanel.noRunHistoryYetCompletedTaskRunsConversation": {
    "zh": "还没有运行记录。任务、对话回合或轻量请求结束后会计入这里。",
    "en": "No run history yet. Completed task runs, conversation turns, and quick requests appear here."
  },
  "DependencyPicker.waitingForTasks": {
    "zh": "{value1}，等待 {waiting} 个任务",
    "en": "{value1}, waiting for {waiting} {waiting, plural, one {task} other {tasks}}"
  },
  "DependencyPicker.clickToOpen": {
    "zh": "{status} · 点击打开",
    "en": "{status} · Click to open"
  },
  "DependencyPicker.removeDependency": {
    "zh": "移除依赖 {value1}",
    "en": "Remove dependency {value1}"
  },
  "DependencyPicker.addDependency": {
    "zh": "添加依赖",
    "en": "Add dependency"
  },
  "DependencyPicker.searchTitleOrIdEnterToAddThe": {
    "zh": "搜索标题或 id，回车添加第一个",
    "en": "Search title or ID; Enter to add the first"
  },
  "DependencyPicker.searchTasks": {
    "zh": "搜索任务",
    "en": "Search tasks"
  },
  "DependencyPicker.noMatchingTasks": {
    "zh": "没有匹配的任务",
    "en": "No matching tasks"
  },
  "DependencyPicker.noOtherTasksAvailableAsDependencies": {
    "zh": "没有其他可以依赖的任务",
    "en": "No other tasks available as dependencies"
  },
  "DependencyPicker.excludedTasksThatWouldCreateADependencyCycle": {
    "zh": "已排除 {looped} 个会形成循环依赖的任务",
    "en": "Excluded {looped} {looped, plural, one {task} other {tasks}} that would create a dependency cycle"
  },
  "DependencyPicker.addDependency_789": {
    "zh": "＋ 添加依赖",
    "en": "＋ Add dependency"
  },
  "DiffComments.commentOnLine": {
    "zh": "评论第 {line} 行",
    "en": "Comment on line {line}"
  },
  "DiffComments.commentOnThisLineShiftClickAnotherLine": {
    "zh": "评论这一行，按住 Shift 再点一行可以选一段",
    "en": "Comment on this line; Shift-click another line to select a range"
  },
  "DiffComments.quoteOnlyThisCode": {
    "zh": "只引用这段代码",
    "en": "Quote only this code"
  },
  "DiffComments.removeComment": {
    "zh": "移除这条评论",
    "en": "Remove comment"
  },
  "DiffComments.commentOnLine_794": {
    "zh": "对第 {line} 行说点什么",
    "en": "Comment on line {line}"
  },
  "DiffComments.commentOnTheseLines": {
    "zh": "对这几行说点什么",
    "en": "Comment on these lines"
  },
  "DiffComments.comments": {
    "zh": "评论",
    "en": "Comments"
  },
  "DiffComments.commentsInTheComposerWillBeSentWith": {
    "zh": "{value1} 条评论在输入框里，会随下一条消息发出。",
    "en": "{value1} {value1, plural, one {comment} other {comments}} in the composer will be sent with your next message."
  },
  "DiscussionDraft.supporter": {
    "zh": "支持方",
    "en": "Supporter"
  },
  "DiscussionDraft.opponent": {
    "zh": "反对方",
    "en": "Opponent"
  },
  "DiscussionDraft.focusOnSecurityAndRisk": {
    "zh": "关注安全和风险",
    "en": "Focus on security and risk"
  },
  "DiscussionDraft.focusOnPerformanceAndCost": {
    "zh": "关注性能和成本",
    "en": "Focus on performance and cost"
  },
  "DiscussionDraft.critic": {
    "zh": "挑毛病的人",
    "en": "Critic"
  },
  "DiscussionDraft.memberSNameUsedToMentionThem": {
    "zh": "成员 {value1} 的名字，消息里用它 @ 这个成员",
    "en": "Member {value1}'s name, used to @mention them"
  },
  "DiscussionDraft.memberSPositionOrPerspective": {
    "zh": "成员 {value1} 的立场或角度",
    "en": "Member {value1}'s position or perspective"
  },
  "DiscussionDraft.optionalEG": {
    "zh": "可不填，如：{value1}",
    "en": "Optional, e.g. {value1}"
  },
  "DiscussionDraft.chair": {
    "zh": "{value1}主持",
    "en": "{value1}Chair"
  },
  "DiscussionDraft.theChairSummarizesWhenTheDiscussionEnds": {
    "zh": "讨论结束后由主持人写总结",
    "en": "The chair summarizes when the discussion ends"
  },
  "DiscussionDraft.removeMember": {
    "zh": "移除成员 {value1}",
    "en": "Remove member {value1}"
  },
  "DiscussionDraft.newGroupChat": {
    "zh": "新群聊",
    "en": "New group chat"
  },
  "DiscussionDraft.reuseMembersProjectsAndSettingsFromEachMember": {
    "zh": "沿用群聊「{value1}」的成员、项目和设置，各成员从头开始，不带之前的讨论。",
    "en": "Reuse members, projects, and settings from “{value1}”. Each member starts fresh without the previous discussion."
  },
  "DiscussionDraft.agentsFirstAnswerIndependentlyThenReviewChallengeOr": {
    "zh": "几个 Agent 先各自独立作答，再一轮轮看彼此的观点、反驳或修正，最后由主持人总结共识和分歧。讨论始终只读：成员可以读所选项目的代码来佐证，不修改文件、不执行计划。",
    "en": "Agents first answer independently, then review, challenge, or revise each other's views over several rounds. The chair summarizes agreements and differences. Discussions stay read-only: members can read project code as evidence but cannot edit files or execute plans."
  },
  "DiscussionDraft.topic": {
    "zh": "主题",
    "en": "Topic"
  },
  "DiscussionDraft.whatShouldBeDiscussedDescribeTheQuestionAnd": {
    "zh": "要讨论什么？写清楚问题和背景，例如：本仓库的 chat-host 要不要拆成两层？各自的利弊是什么？",
    "en": "What should be discussed? Describe the question and context, e.g. should this repository's chat-host be split into two layers? What are the tradeoffs?"
  },
  "DiscussionDraft.projectsOptional": {
    "zh": "项目（可不选）",
    "en": "Projects (optional)"
  },
  "DiscussionDraft.members": {
    "zh": "成员",
    "en": "Members"
  },
  "DiscussionDraft.nameForMentions": {
    "zh": "名字（@ 它时用）",
    "en": "Name (for @mentions)"
  },
  "DiscussionDraft.positionOrPerspective": {
    "zh": "立场或角度",
    "en": "Position or perspective"
  },
  "DiscussionDraft.addMember": {
    "zh": "＋ 添加成员",
    "en": "＋ Add member"
  },
  "DiscussionDraft.twoMembersAreNamedRenameOneSoThey": {
    "zh": "有两个成员都叫「{clash}」，改一个名字，好在消息里 @ 它。",
    "en": "Two members are named “{clash}”. Rename one so they can be @mentioned."
  },
  "DiscussionDraft.upToSummarizeEarlyWhenPositionsRemainUnchanged": {
    "zh": "最多{value1}（大家都维持立场时提前总结）",
    "en": "Up to {value1} (summarize early when positions remain unchanged)"
  },
  "DiscussionDraft.maximumRounds": {
    "zh": "最多几轮",
    "en": "Maximum rounds"
  },
  "DiscussionDraft.rounds": {
    "zh": "{rounds} 轮",
    "en": "{rounds} {rounds, plural, one {round} other {rounds}}"
  },
  "DiscussionDraft.rounds_823": {
    "zh": "{value1} 轮",
    "en": "{value1} {value1, plural, one {round} other {rounds}}"
  },
  "DiscussionDraft.anonymousPeerReview": {
    "zh": "{value1}匿名互评",
    "en": "{value1}Anonymous peer review"
  },
  "DiscussionDraft.useMemberABWithoutRevealingAgentOr": {
    "zh": "互评时只用「成员 A / B」称呼，不透露是哪个 Agent 和模型，减少对品牌的偏向",
    "en": "Use “Member A / B” without revealing Agent or model names to reduce brand bias"
  },
  "DiscussionDraft.starting": {
    "zh": "正在启动…",
    "en": "Starting…"
  },
  "DiscussionDraft.startDiscussion": {
    "zh": "开始讨论",
    "en": "Start discussion"
  },
  "DiscussionMemberForm.addAMember": {
    "zh": "加一位成员",
    "en": "Add a member"
  },
  "DiscussionMemberForm.theySeeAllEarlierPostsAndJoinFrom": {
    "zh": "它先看到之前的全部发言，从下一轮开始参与。",
    "en": "They see all earlier posts and join from the next round."
  },
  "DiscussionMemberForm.optionalEGCritic": {
    "zh": "可不填，如：挑毛病的人",
    "en": "Optional, e.g. critic"
  },
  "DiscussionMemberForm.aMemberNamedAlreadyExistsChooseAnotherName": {
    "zh": "已经有成员叫「{value1}」，换个名字，好在消息里 @ 它。",
    "en": "A member named “{value1}” already exists. Choose another name for @mentions."
  },
  "DiscussionMemberForm.join": {
    "zh": "加入",
    "en": "Join"
  },
  "DiscussionMemberForm.member": {
    "zh": "＋ 成员",
    "en": "＋ Member"
  },
  "DiscussionMemberForm.upToMembers": {
    "zh": "最多 {MAX_DISCUSSION_MEMBERS} 位成员",
    "en": "Up to {MAX_DISCUSSION_MEMBERS} {MAX_DISCUSSION_MEMBERS, plural, one {member} other {members}}"
  },
  "DiscussionMemberForm.addAMemberToSpeakFromTheNext": {
    "zh": "加一位成员，下一轮开始发言",
    "en": "Add a member to speak from the next round"
  },
  "DiscussionMentions.askEveryMemberToAnswerNow": {
    "zh": "每位成员现在都回答",
    "en": "Ask every member to answer now"
  },
  "DiscussionMentions.stillSpeaking": {
    "zh": "还在发言",
    "en": "Still speaking"
  },
  "DiscussionMentions.askOnlyThem": {
    "zh": "只问它 · {value1}",
    "en": "Ask only them · {value1}"
  },
  "DiscussionMentions.mentionMember": {
    "zh": "提到成员",
    "en": "Mention member"
  },
  "DiscussionMentions.navigateSelectClose": {
    "zh": "{value1} 选择 {value2} 选用 {value3} 关闭",
    "en": "{value1} Navigate {value2} Select {value3} Close"
  },
  "DiscussionRequirements.discussionRequirementsOptional": {
    "zh": "讨论要求（可选）",
    "en": "Discussion requirements (optional)"
  },
  "DiscussionRequirements.usePreset": {
    "zh": "使用预设",
    "en": "Use preset"
  },
  "DiscussionRequirements.custom": {
    "zh": "自定义",
    "en": "Custom"
  },
  "DiscussionRequirements.choosingAPresetReplacesTheContentBelowYou": {
    "zh": "选择预设会替换下方内容，仍可继续编辑",
    "en": "Choosing a preset replaces the content below; you can still edit it"
  },
  "DiscussionRequirements.sharedRequirementsForLengthStyleReasoningOrOutput": {
    "zh": "填写篇幅、表达方式、论证或输出格式等共同要求",
    "en": "Shared requirements for length, style, reasoning, or output format"
  },
  "DiscussionRequirements.appliesToEveryMemberEveryRoundAndThe": {
    "zh": "应用于所有成员、每轮发言和主持人总结。清空后不加额外要求；选择预设会替换当前内容。",
    "en": "Applies to every member, every round, and the chair's summary. Clear to add no extra requirements. Choosing a preset replaces the current content."
  },
  "DiscussionView.pause": {
    "zh": "暂停",
    "en": "Pause"
  },
  "DiscussionView.pauseAfterThisRoundFinishes": {
    "zh": "这一轮说完后先停下",
    "en": "Pause after this round finishes"
  },
  "DiscussionView.continue": {
    "zh": "继续",
    "en": "Continue"
  },
  "DiscussionView.resumeTheDiscussionFromWhereItStopped": {
    "zh": "从停下的地方接着讨论",
    "en": "Resume the discussion from where it stopped"
  },
  "DiscussionView.anotherRound": {
    "zh": "再来一轮",
    "en": "Another round"
  },
  "DiscussionView.reviewEachOtherSViewsAgainThenSummarize": {
    "zh": "大家再看一遍彼此的观点，然后重新总结",
    "en": "Review each other's views again, then summarize"
  },
  "DiscussionView.summarizeNow": {
    "zh": "立即总结",
    "en": "Summarize now"
  },
  "DiscussionView.askTheChairToSummarizeAfterThisRound": {
    "zh": "这一轮说完就请主持人总结",
    "en": "Ask the chair to summarize after this round"
  },
  "DiscussionView.stop": {
    "zh": "停止",
    "en": "Stop"
  },
  "DiscussionView.interruptCurrentSpeakersAndPause": {
    "zh": "打断正在发言的成员并暂停",
    "en": "Interrupt current speakers and pause"
  },
  "DiscussionView.continueDiscussion": {
    "zh": "接着聊",
    "en": "Continue discussion"
  },
  "DiscussionView.addThoughtsOrQuestionsToTheCurrentTopic": {
    "zh": "在当前议题里补充或追问，发出后大家再讨论一轮",
    "en": "Add thoughts or questions to the current topic, then discuss for another round"
  },
  "DiscussionView.newTopic": {
    "zh": "新议题",
    "en": "New topic"
  },
  "DiscussionView.startANewTopicWithIndependentAnswersDiscussion": {
    "zh": "换一个议题：大家重新各自作答、讨论、总结，成员和项目不变",
    "en": "Start a new topic with independent answers, discussion, and summary, keeping members and projects"
  },
  "DiscussionView.independentAnswer": {
    "zh": "独立作答",
    "en": "Independent answer"
  },
  "DiscussionView.response": {
    "zh": "回应",
    "en": "Response"
  },
  "DiscussionView.answerToYou": {
    "zh": "回答你",
    "en": "Answer to you"
  },
  "DiscussionView.summary": {
    "zh": "总结",
    "en": "Summary"
  },
  "DiscussionView.conclusionsFromGroupChat": {
    "zh": "来自群聊「{value1}」的结论。",
    "en": "Conclusions from group chat “{value1}”."
  },
  "DiscussionView.discussionTopic": {
    "zh": "## 讨论主题",
    "en": "## Discussion topic"
  },
  "DiscussionView.sAnswerToYouInGroupChat": {
    "zh": "来自群聊「{value1}」里 {name} 对你的回答。",
    "en": "{name}'s answer to you in group chat “{value1}”."
  },
  "DiscussionView.yourQuestion": {
    "zh": "## 你的问题",
    "en": "## Your question"
  },
  "DiscussionView.sAnswer": {
    "zh": "## {name} 的回答",
    "en": "## {name}'s answer"
  },
  "DiscussionView.atLeast2MembersMustRemain": {
    "zh": "至少要留 2 位成员",
    "en": "At least 2 members must remain"
  },
  "DiscussionView.theChairMustStayToWriteTheSummary": {
    "zh": "主持人要写总结，不能离开",
    "en": "The chair must stay to write the summary"
  },
  "DiscussionView.theyAreStillSpeakingWaitUntilTheyFinish": {
    "zh": "它还在发言，等它说完",
    "en": "They are still speaking; wait until they finish"
  },
  "DiscussionView.removeFromTheDiscussionTheirPostsWillBe": {
    "zh": "让「{value1}」离开讨论？它说过的话会保留。",
    "en": "Remove “{value1}” from the discussion? Their posts will be kept."
  },
  "DiscussionView.clickToViewToolCallsAndApprovalRequests": {
    "zh": "{value1}点开看它的工具调用和确认请求",
    "en": "{value1}Click to view tool calls and approval requests"
  },
  "DiscussionView.position": {
    "zh": "立场：{value1}\n",
    "en": "Position: {value1}\n"
  },
  "DiscussionView.chair": {
    "zh": "主持",
    "en": "Chair"
  },
  "DiscussionView.askOnlyThem": {
    "zh": "只问它",
    "en": "Ask only them"
  },
  "DiscussionView.remove": {
    "zh": "让 {value1} 离开",
    "en": "Remove {value1}"
  },
  "DiscussionView.removeFromDiscussion": {
    "zh": "让它离开讨论",
    "en": "Remove from discussion"
  },
  "DiscussionView.removedMember": {
    "zh": "已移除的成员",
    "en": "Removed member"
  },
  "DiscussionView.left": {
    "zh": "已离开",
    "en": "Left"
  },
  "DiscussionView.couldNotPostThisTime": {
    "zh": "这次没有发言成功：{value1}",
    "en": "Could not post this time: {value1}"
  },
  "DiscussionView.unknownReason": {
    "zh": "未知原因",
    "en": "Unknown reason"
  },
  "DiscussionView.awaitingYourApproval": {
    "zh": "在等你确认，{value1}",
    "en": "Awaiting your approval, {value1}"
  },
  "DiscussionView.respond": {
    "zh": "去处理",
    "en": "Respond"
  },
  "DiscussionView.thinking": {
    "zh": "{value1}{value2}{value3}正在思考",
    "en": "{value1}{value2}{value3}Thinking"
  },
  "DiscussionView.me": {
    "zh": "我",
    "en": "Me"
  },
  "DiscussionView.discussionSummary": {
    "zh": "讨论总结",
    "en": "Discussion summary"
  },
  "DiscussionView.membersRounds": {
    "zh": "{value1} 位成员 · {value2} 轮",
    "en": "{value1} {value1, plural, one {member} other {members}} · {value2} {value2, plural, one {round} other {rounds}}"
  },
  "DiscussionView.createTaskFromConclusions": {
    "zh": "从结论新建任务",
    "en": "Create task from conclusions"
  },
  "DiscussionView.createTaskFromAnswer": {
    "zh": "从回答新建任务",
    "en": "Create task from answer"
  },
  "DiscussionView.copyPost": {
    "zh": "复制发言",
    "en": "Copy post"
  },
  "DiscussionView.independentAnswersHiddenFromEachOther": {
    "zh": "各自独立作答，彼此看不到",
    "en": "Independent answers, hidden from each other"
  },
  "DiscussionView.mutualResponses": {
    "zh": "互相回应",
    "en": "Mutual responses"
  },
  "DiscussionView.opening": {
    "zh": "开场",
    "en": "Opening"
  },
  "DiscussionView.round": {
    "zh": "第 {shown} 轮",
    "en": "Round {shown}"
  },
  "DiscussionView.round_897": {
    "zh": "第 {shown} 轮{value2}{value3}",
    "en": "Round {shown}{value2}{value3}"
  },
  "DiscussionView.viewSequentially": {
    "zh": "按顺序看",
    "en": "View sequentially"
  },
  "DiscussionView.compareSideBySide": {
    "zh": "并排对比",
    "en": "Compare side by side"
  },
  "DiscussionView.discussionEnded": {
    "zh": "讨论结束 · {value1}",
    "en": "Discussion ended · {value1}"
  },
  "DiscussionView.summary_901": {
    "zh": "{value1} 总结",
    "en": "{value1} summary"
  },
  "DiscussionView.groupChat": {
    "zh": "群聊「{value1}」",
    "en": "Group chat “{value1}”"
  },
  "DiscussionView.groupChatTitle": {
    "zh": "群聊标题",
    "en": "Group chat title"
  },
  "DiscussionView.anonymousPeerReview": {
    "zh": "匿名互评",
    "en": "Anonymous peer review"
  },
  "DiscussionView.newGroupWithSameMembers": {
    "zh": "同成员新群聊",
    "en": "New group with same members"
  },
  "DiscussionView.startAnotherGroupChatWithTheseMembersProjects": {
    "zh": "另开一个群聊，沿用这些成员、项目和设置，不带之前的讨论",
    "en": "Start another group chat with these members, projects, and settings, without previous discussion"
  },
  "DiscussionView.waitUntilThisRoundEndsToChangeProjects": {
    "zh": "成员发言时不能改项目，等这一轮说完",
    "en": "Wait until this round ends to change projects"
  },
  "DiscussionView.theFirstProjectIsFixedOtherProjectsCan": {
    "zh": "第一个项目不能换，其他项目可以增减",
    "en": "The first project is fixed; other projects can be added or removed"
  },
  "DiscussionView.loadingPosts": {
    "zh": "{value1} 正在读取发言…",
    "en": "{value1} Loading posts…"
  },
  "DiscussionView.groupChat_910": {
    "zh": "群聊",
    "en": "Group chat"
  },
  "DiscussionView.posts": {
    "zh": "发言",
    "en": "Posts"
  },
  "DiscussionView.writeANewTopicIndependentAnswersUpTo": {
    "zh": "写新的议题：大家先各自独立作答，再讨论最多 {value1} 轮，最后总结；之前的讨论只作背景",
    "en": "Write a new topic: independent answers, up to {value1} discussion rounds, then a summary. Earlier discussions provide background only"
  },
  "DiscussionView.addThoughtsOrQuestionsForAnotherRoundMember": {
    "zh": "补充看法或追问，发出后大家再讨论一轮；@成员 只问它，@所有人 让大家现在都回答",
    "en": "Add thoughts or questions for another round; @member asks only them, @everyone asks all members now"
  },
  "DiscussionView.addANoteForEveryoneToSeeNext": {
    "zh": "插一句话，下一轮大家都会看到；@成员 只问它，@所有人 让大家现在都回答",
    "en": "Add a note for everyone to see next round; @member asks only them, @everyone asks all members now"
  },
  "DiscussionView.sentMessages": {
    "zh": "发出的消息",
    "en": "Sent messages"
  },
  "DiscussionView.membersAreStillSpeakingPauseOrWaitUntil": {
    "zh": "成员还在发言；先暂停或等讨论结束，再换议题",
    "en": "Members are still speaking. Pause or wait until the discussion ends before changing topics"
  },
  "DiscussionView.membersAreStillSpeakingPauseOrWaitUntil_917": {
    "zh": "成员还在发言，先暂停或等讨论结束",
    "en": "Members are still speaking. Pause or wait until the discussion ends"
  },
  "DiscussionView.isStillSpeakingWaitBeforeAskingAgain": {
    "zh": "{value1} 还在发言，等它说完再问",
    "en": "{value1} is still speaking. Wait before asking again"
  },
  "DraftBranchPicker.branchTheNewWorktreeFromHere": {
    "zh": "新 worktree 从这个分支拉出",
    "en": "Branch the new worktree from here"
  },
  "DraftBranchPicker.workOnThisBranchChoosingAnotherSwitchesThe": {
    "zh": "在这个分支上工作；选别的分支，发送时会把项目目录切过去",
    "en": "Work on this branch. Choosing another switches the project directory when you send"
  },
  "DraftBranchPicker.from": {
    "zh": "从",
    "en": "From"
  },
  "DraftBranchPicker.chooseStartingBranch": {
    "zh": "选择起点分支",
    "en": "Choose starting branch"
  },
  "DraftBranchPicker.chooseBranch": {
    "zh": "选择分支",
    "en": "Choose branch"
  },
  "DraftBranchPicker.startingBranchForSNewWorktree": {
    "zh": "{value1} 的新 worktree 从哪个分支拉出",
    "en": "Starting branch for {value1}'s new worktree"
  },
  "DraftBranchPicker.branchToWorkOnIn": {
    "zh": "在 {value1} 的哪个分支上工作",
    "en": "Branch to work on in {value1}"
  },
  "DraftBranchPicker.searchBranchesEnterToSelectTheFirst": {
    "zh": "搜索分支，回车选第一个",
    "en": "Search branches; Enter to select the first"
  },
  "DraftBranchPicker.current": {
    "zh": "当前",
    "en": "Current"
  },
  "DraftBranchPicker.hasUncommittedChangesAndCannotSwitchCommitOr": {
    "zh": "{project} 有 {value2} 个未提交的改动，切不过去：先提交或暂存，或勾选新 worktree",
    "en": "{project} has {value2} uncommitted changes and cannot switch. Commit or stash them, or choose a new worktree"
  },
  "DraftBranchPicker.conversationsAlsoUseThisDirectory": {
    "zh": "；会话{value1}也在用这个目录",
    "en": "; conversations {value1} also use this directory"
  },
  "DraftBranchPicker.sendingSwitchesFromTo": {
    "zh": "发送时会把 {project} 从 {value2} 切到 {value3}{shared}",
    "en": "Sending switches {project} from {value2} to {value3}{shared}"
  },
  "DraftBranchPicker.currentCommit": {
    "zh": "当前提交",
    "en": "Current commit"
  },
  "EnvironmentNotice.view": {
    "zh": "查看",
    "en": "View"
  },
  "FileEditor.fileDoesNotExistItMayHaveBeen": {
    "zh": "文件不存在，可能已被移动或删除。",
    "en": "File does not exist. It may have been moved or deleted."
  },
  "FileEditor.thisIsADirectoryAndCannotBeOpened": {
    "zh": "这是一个目录，无法作为文本打开。",
    "en": "This is a directory and cannot be opened as text."
  },
  "FileEditor.thisFileIsNotUtf8TextAnd": {
    "zh": "此文件不是 UTF-8 文本，暂不支持内置编辑。",
    "en": "This file is not UTF-8 text and cannot be edited here."
  },
  "FileEditor.thisFileExceeds2MibAndCannotBe": {
    "zh": "文件超过 2 MiB，无法内置编辑。",
    "en": "This file exceeds 2 MiB and cannot be edited here."
  },
  "FileEditor.cannotReadFileCheckAccessPermissions": {
    "zh": "无法读取文件，请检查访问权限。",
    "en": "Cannot read file. Check access permissions."
  },
  "FileEditor.readingFile": {
    "zh": "正在读取文件…",
    "en": "Reading file…"
  },
  "FileEditor.fileLocation": {
    "zh": "文件位置",
    "en": "File location"
  },
  "FileEditor.resizeFileTree": {
    "zh": "调整文件树宽度",
    "en": "Resize file tree"
  },
  "FileEditor.hasUnsavedChangesCloseAndDiscardThem": {
    "zh": "{value1} 有未保存的修改，确定关闭并丢弃吗？",
    "en": "{value1} has unsaved changes. Close and discard them?"
  },
  "FileEditor.clickAFileInTheChatToPreview": {
    "zh": "点击聊天中的文件即可预览。",
    "en": "Click a file in the chat to preview it."
  },
  "FileEditor.collapseFileTree": {
    "zh": "收起文件树",
    "en": "Collapse file tree"
  },
  "FileEditor.openFileTree": {
    "zh": "打开文件树",
    "en": "Open file tree"
  },
  "FileEditor.openFiles": {
    "zh": "已打开的文件",
    "en": "Open files"
  },
  "FileEditor.unsaved": {
    "zh": "{value1}（未保存）",
    "en": "{value1} (unsaved)"
  },
  "FileEditor.closeFile": {
    "zh": "关闭文件 {value1}{value2}",
    "en": "Close file {value1}{value2}"
  },
  "FileEditor.unsaved_948": {
    "zh": "（未保存）",
    "en": "(unsaved)"
  },
  "FileEditor.searchFileContents": {
    "zh": "搜索文件内容",
    "en": "Search file contents"
  },
  "FileEditor.searchF": {
    "zh": "搜索 · {PRIMARY_KEY_LABEL}F",
    "en": "Search · {PRIMARY_KEY_LABEL}F"
  },
  "FileEditor.moreActions": {
    "zh": "更多操作",
    "en": "More actions"
  },
  "FileEditor.restoreFilePanel": {
    "zh": "还原文件面板",
    "en": "Restore file panel"
  },
  "FileEditor.maximizeFilePanel": {
    "zh": "最大化文件面板",
    "en": "Maximize file panel"
  },
  "FileEditor.fileActions": {
    "zh": "文件操作",
    "en": "File actions"
  },
  "FileEditor.save": {
    "zh": "保存",
    "en": "Save"
  },
  "FileEditor.disableWordWrap": {
    "zh": "关闭自动换行",
    "en": "Disable word wrap"
  },
  "FileEditor.wordWrap": {
    "zh": "自动换行",
    "en": "Word wrap"
  },
  "FileEditor.viewMode": {
    "zh": "{value1} 显示方式",
    "en": "{value1} view mode"
  },
  "FileEditor.source": {
    "zh": "源码",
    "en": "Source"
  },
  "FileEditor.selectAFileOnTheLeft": {
    "zh": "从左侧选择文件。",
    "en": "Select a file on the left."
  },
  "FileEditor.openTheFileTreeToSelectAFile": {
    "zh": "打开文件树选择文件。",
    "en": "Open the file tree to select a file."
  },
  "FileImage.imagePreview": {
    "zh": "图片预览",
    "en": "Image preview"
  },
  "FileImage.cannotPreviewImageItMayHaveBeenMoved": {
    "zh": "图片无法预览：文件可能已被移动、损坏，或超过 32 MiB。",
    "en": "Cannot preview image. It may have been moved, corrupted, or exceed 32 MiB."
  },
  "FileImage.viewFullImage": {
    "zh": "查看大图 {name}",
    "en": "View full image {name}"
  },
  "FileImage.clickToViewFullImage": {
    "zh": "点击查看大图",
    "en": "Click to view full image"
  },
  "FileImage.loadingImage": {
    "zh": "正在加载图片…",
    "en": "Loading image…"
  },
  "FileMarkdown.image": {
    "zh": "图片",
    "en": "Image"
  },
  "FileMenu.openInSidebar": {
    "zh": "在侧栏打开",
    "en": "Open in sidebar"
  },
  "FileMenu.copyAbsolutePath": {
    "zh": "复制绝对路径",
    "en": "Copy absolute path"
  },
  "FileMenu.copyProjectRelativePath": {
    "zh": "复制项目相对路径",
    "en": "Copy project-relative path"
  },
  "FileMenu.showIn": {
    "zh": "在{FILE_MANAGER}中显示",
    "en": "Show in {FILE_MANAGER}"
  },
  "FileMenu.openWithSystemDefaultApp": {
    "zh": "用系统默认应用打开",
    "en": "Open with system default app"
  },
  "FileSource.fold": {
    "zh": "折叠",
    "en": "Fold"
  },
  "FileSource.expand": {
    "zh": "展开",
    "en": "Expand"
  },
  "FileSource.foldedCode": {
    "zh": "已折叠的代码",
    "en": "Folded code"
  },
  "FileSource.saveFailedFileChangedOnDisk": {
    "zh": "保存失败：文件已在磁盘上被修改。",
    "en": "Save failed: file changed on disk."
  },
  "FileSource.fileChangedOnDiskAndYouHaveUnsaved": {
    "zh": "文件已在磁盘上被修改，你有未保存的修改。",
    "en": "File changed on disk and you have unsaved changes."
  },
  "FileSource.reload": {
    "zh": "重新载入",
    "en": "Reload"
  },
  "FileSource.discardUnsavedChangesAndReloadTheFileFrom": {
    "zh": "丢弃未保存的修改，重新载入磁盘上的文件？",
    "en": "Discard unsaved changes and reload the file from disk?"
  },
  "FileSource.overwrite": {
    "zh": "覆盖",
    "en": "Overwrite"
  },
  "FileSource.keepMyChanges": {
    "zh": "保留我的修改",
    "en": "Keep my changes"
  },
  "FileSource.markdownPreview": {
    "zh": "Markdown 预览",
    "en": "Markdown preview"
  },
  "FileSource.renderingMarkdown": {
    "zh": "正在渲染 Markdown…",
    "en": "Rendering Markdown…"
  },
  "FileSource.fileContent": {
    "zh": "文件内容",
    "en": "File content"
  },
  "FileSource.copyAllContent": {
    "zh": "复制全部内容",
    "en": "Copy all content"
  },
  "FileTree.filterOrTypeToSearchTheEntireProject": {
    "zh": "筛选，或输入 ? 搜索整个项目",
    "en": "Filter, or type ? to search the entire project"
  },
  "FileTree.filterFiles": {
    "zh": "筛选文件",
    "en": "Filter files"
  },
  "FileTree.projectFiles": {
    "zh": "项目文件",
    "en": "Project files"
  },
  "FileTree.cannotRead": {
    "zh": "无法读取",
    "en": "Cannot read"
  },
  "FileTree.noMatchingFiles": {
    "zh": "没有匹配的文件",
    "en": "No matching files"
  },
  "FileTree.noMatchesInExpandedFoldersStartWithTo": {
    "zh": "已展开的文件夹里没有匹配项，输入 ? 开头可搜索整个项目",
    "en": "No matches in expanded folders. Start with ? to search the entire project"
  },
  "GitInspector.loadingProject": {
    "zh": "正在读取项目…",
    "en": "Loading project…"
  },
  "GitInspector.gitProject": {
    "zh": "Git 项目",
    "en": "Git project"
  },
  "GitInspector.additionalProjects": {
    "zh": "附加项目",
    "en": "Additional projects"
  },
  "GitInspector.restoreGitPanel": {
    "zh": "还原 Git 面板",
    "en": "Restore Git panel"
  },
  "GitInspector.maximizeGitPanel": {
    "zh": "最大化 Git 面板",
    "en": "Maximize Git panel"
  },
  "GitInspector.notConnectedToCore": {
    "zh": "尚未连接 core",
    "en": "Not connected to core"
  },
  "GitInspector.mergeConflictsFoundResolveTheFilesListedBelow": {
    "zh": "Merge 出现冲突，请处理下面列出的文件。",
    "en": "Merge conflicts found. Resolve the files listed below."
  },
  "GitInspector.gitOperationCompleted": {
    "zh": "Git 操作已完成。",
    "en": "Git operation completed."
  },
  "GitInspector.committed": {
    "zh": "已提交「{value1}」{value2}。",
    "en": "Committed “{value1}”{value2}."
  },
  "GitInspector.andPushed": {
    "zh": "并推送",
    "en": "and pushed"
  },
  "GitInspector.viewHistory": {
    "zh": "查看历史",
    "en": "View history"
  },
  "GitInspector.switchToThisBranch": {
    "zh": "切换到此分支",
    "en": "Switch to this branch"
  },
  "GitInspector.newBranchFromHere": {
    "zh": "从此分支新建",
    "en": "New branch from here"
  },
  "GitInspector.compareWithCurrentBranch": {
    "zh": "与当前分支比较",
    "en": "Compare with current branch"
  },
  "GitInspector.mergeIntoCurrentBranch": {
    "zh": "合并到当前分支",
    "en": "Merge into current branch"
  },
  "GitInspector.deleteRemoteBranch": {
    "zh": "删除远端分支…",
    "en": "Delete remote branch…"
  },
  "GitInspector.deleteLocalBranch": {
    "zh": "删除本地分支…",
    "en": "Delete local branch…"
  },
  "GitInspector.copySha": {
    "zh": "复制 SHA",
    "en": "Copy SHA"
  },
  "GitInspector.copyCommitMessage": {
    "zh": "复制提交信息",
    "en": "Copy commit message"
  },
  "GitInspector.newBranchFromThisCommit": {
    "zh": "从此提交新建分支…",
    "en": "New branch from this commit…"
  },
  "GitInspector.newTag": {
    "zh": "新建标签…",
    "en": "New tag…"
  },
  "GitInspector.checkOutThisCommit": {
    "zh": "检出此提交…",
    "en": "Check out this commit…"
  },
  "GitInspector.loadingGit": {
    "zh": "正在读取 Git…",
    "en": "Loading Git…"
  },
  "GitInspector.thisProjectIsNotInAGitRepository": {
    "zh": "这个项目不在 Git 仓库中。",
    "en": "This project is not in a Git repository."
  },
  "GitInspector.noCommitsYet": {
    "zh": "尚无提交",
    "en": "No commits yet"
  },
  "GitInspector.noUpstream": {
    "zh": "无 upstream",
    "en": "No upstream"
  },
  "GitInspector.mergeIsUnfinished": {
    "zh": "Merge 尚未完成",
    "en": "Merge is unfinished"
  },
  "GitInspector.anotherGitOperationIsUnfinishedResolveItIn": {
    "zh": "其他 Git 操作尚未完成，请在终端处理",
    "en": "Another Git operation is unfinished. Resolve it in the terminal"
  },
  "GitInspector.openTerminal": {
    "zh": "打开终端",
    "en": "Open terminal"
  },
  "GitInspector.finishMerge": {
    "zh": "完成 Merge",
    "en": "Finish merge"
  },
  "GitInspector.abortMerge": {
    "zh": "中止 Merge…",
    "en": "Abort merge…"
  },
  "GitInspector.branches": {
    "zh": "▸ 分支",
    "en": "▸ Branches"
  },
  "GitInspector.branches_1024": {
    "zh": "▾ 分支",
    "en": "▾ Branches"
  },
  "GitInspector.allBranches": {
    "zh": "全部分支",
    "en": "All branches"
  },
  "GitInspector.addFavorite": {
    "zh": "添加收藏",
    "en": "Add to favorites"
  },
  "GitInspector.removeFavorite": {
    "zh": "取消收藏",
    "en": "Remove from favorites"
  },
  "GitInspector.addFavoriteFor": {
    "zh": "收藏分支 {name}",
    "en": "Add branch {name} to favorites"
  },
  "GitInspector.removeFavoriteFor": {
    "zh": "取消收藏分支 {name}",
    "en": "Remove branch {name} from favorites"
  },
  "GitInspector.favoritesOnly": {
    "zh": "仅显示收藏分支",
    "en": "Show favorite branches only"
  },
  "GitInspector.currentBranch": {
    "zh": "当前分支",
    "en": "Current branch"
  },
  "GitInspector.searchCommits": {
    "zh": "搜索提交",
    "en": "Search commits"
  },
  "GitInspector.subjectAuthorOrSha": {
    "zh": "标题、作者或 SHA",
    "en": "Subject, author, or SHA"
  },
  "GitInspector.backToHistory": {
    "zh": "← 返回历史",
    "en": "← Back to history"
  },
  "GitInspector.branches_1030": {
    "zh": "分支",
    "en": "Branches"
  },
  "GitInspector.commit": {
    "zh": "提交",
    "en": "Commit"
  },
  "GitInspector.selectACommitToViewItsMessageFiles": {
    "zh": "选择提交查看说明、文件和 diff。",
    "en": "Select a commit to view its message, files, and diff."
  },
  "GitInspector.markResolved": {
    "zh": "标记已解决",
    "en": "Mark resolved"
  },
  "GitInspector.taskBoundBranch": {
    "zh": "\n任务绑定分支",
    "en": "\nTask-bound branch"
  },
  "GitInspector.task": {
    "zh": "任务",
    "en": "Task"
  },
  "GitInspector.checkedOut": {
    "zh": "检出",
    "en": "Checked out"
  },
  "GitInspector.actionsFor": {
    "zh": "{value1} 的操作",
    "en": "Actions for {value1}"
  },
  "GitInspector.headCurrentBranch": {
    "zh": "HEAD · 当前分支",
    "en": "HEAD · Current branch"
  },
  "GitInspector.local": {
    "zh": "本地",
    "en": "Local"
  },
  "GitInspector.remote": {
    "zh": "远端",
    "en": "Remote"
  },
  "GitInspector.noMatchingBranches": {
    "zh": "没有匹配的分支。",
    "en": "No matching branches."
  },
  "GitInspector.branchActions": {
    "zh": "分支操作",
    "en": "Branch actions"
  },
  "GitInspector.noMatchingCommits": {
    "zh": "没有匹配的提交。",
    "en": "No matching commits."
  },
  "GitInspector.loadingHistory": {
    "zh": "正在读取历史…",
    "en": "Loading history…"
  },
  "GitInspector.loadMore": {
    "zh": "加载更多",
    "en": "Load more"
  },
  "GitInspector.commitActions": {
    "zh": "提交操作",
    "en": "Commit actions"
  },
  "GitInspector.findingContainingBranches": {
    "zh": "正在查找所在分支…",
    "en": "Finding containing branches…"
  },
  "GitInspector.notOnAnyBranch": {
    "zh": "不在任何分支上",
    "en": "Not on any branch"
  },
  "GitInspector.onBranches": {
    "zh": "在 {value1} 个分支上：",
    "en": "On {value1} {value1, plural, one {branch} other {branches}}:"
  },
  "GitInspector.loadingCommit": {
    "zh": "正在读取提交…",
    "en": "Loading commit…"
  },
  "GitInspector.copyFullSha": {
    "zh": "复制完整 SHA",
    "en": "Copy full SHA"
  },
  "GitInspector.compareParentCommit": {
    "zh": "比较父提交 {value1}",
    "en": "Compare parent commit {value1}"
  },
  "GitInspector.compareParentCommit_1053": {
    "zh": "比较父提交",
    "en": "Compare parent commit"
  },
  "GitInspector.parent1": {
    "zh": "父提交 1",
    "en": "Parent 1"
  },
  "GitInspector.parent": {
    "zh": "父提交 {value1} · {value2}",
    "en": "Parent {value1} · {value2}"
  },
  "GitInspector.noFileChanges": {
    "zh": "没有文件改动。",
    "en": "No file changes."
  },
  "GitInspector.compareEndpointsDirectly": {
    "zh": "{value1}两端直接比较",
    "en": "{value1}Compare endpoints directly"
  },
  "GitInspector.comparing": {
    "zh": "正在比较…",
    "en": "Comparing…"
  },
  "GitInspector.currentBranchHasUniqueCommitsSelectedHasUnique": {
    "zh": "当前分支独有 {value1} 个提交 · 所选{what}独有 {value3} 个提交",
    "en": "Current branch has {value1} unique commits · Selected {what} has {value3} unique commits"
  },
  "GitInspector.bothEndpoints": {
    "zh": "两端",
    "en": "Both endpoints"
  },
  "GitInspector.commonAncestorToSelected": {
    "zh": "共同祖先到所选{what}",
    "en": "Common ancestor to selected {what}"
  },
  "GitInspector.selected": {
    "zh": "所选{what}",
    "en": "Selected {what}"
  },
  "GitInspector.onlyTheFirst100CommitsAreShownOpen": {
    "zh": "这里只显示前 100 个提交，完整记录请查看历史。",
    "en": "Only the first 100 commits are shown. Open history for the full list."
  },
  "GitInspector.newTag_1064": {
    "zh": "新建标签",
    "en": "New tag"
  },
  "GitInspector.checkOutCommit": {
    "zh": "检出提交",
    "en": "Check out commit"
  },
  "GitInspector.renameLocalBranch": {
    "zh": "重命名本地分支",
    "en": "Rename local branch"
  },
  "GitInspector.deleteBranch": {
    "zh": "删除分支",
    "en": "Delete branch"
  },
  "GitInspector.abortMerge_1068": {
    "zh": "中止 Merge",
    "en": "Abort merge"
  },
  "GitInspector.detachedHead": {
    "zh": "分离 HEAD",
    "en": "Detached HEAD"
  },
  "GitInspector.tagName": {
    "zh": "标签名",
    "en": "Tag name"
  },
  "GitInspector.branchName": {
    "zh": "分支名",
    "en": "Branch name"
  },
  "GitInspector.startingPoint": {
    "zh": "起点{value1}",
    "en": "Starting point{value1}"
  },
  "GitInspector.headCurrentCommit": {
    "zh": "HEAD · 当前提交",
    "en": "HEAD · Current commit"
  },
  "GitInspector.switchAfterCreating": {
    "zh": "{value1} 创建后切换",
    "en": "{value1} Switch after creating"
  },
  "GitInspector.createALightweightTagAtTheTagStays": {
    "zh": "在 {value1} {value2} 上建一个轻量标签。标签只建在本地，不会推送到远端。",
    "en": "Create a lightweight tag at {value1} {value2}. The tag stays local and is not pushed."
  },
  "GitInspector.checkOutWithDetachedHeadCreateABranch": {
    "zh": "检出 {value1} {value2}。之后不在任何分支上（分离 HEAD）：在这里做的提交要新建分支才能留住，切回一个分支即可回来。",
    "en": "Check out {value1} {value2} with detached HEAD. Create a branch to keep commits made here. Switch back to a branch to return."
  },
  "GitInspector.commitTitleBlankLineThenDetailsLeaveEmpty": {
    "zh": "提交标题，空一行后填写说明。留空则由 Agent 用小模型写好后直接提交",
    "en": "Commit title, a blank line, then details. Leave it empty and the Agent's small model writes one and commits"
  },
  "GitInspector.commitTitleBlankLineThenDetails": {
    "zh": "提交标题，空一行后填写说明",
    "en": "Commit title, a blank line, then details"
  },
  "GitInspector.commitAllChangesInThisRepositoryLocalCommits": {
    "zh": "提交这个仓库的全部改动。推送失败时，本地提交保留。",
    "en": "Commits every change in this repository. If the push fails, the local commit stays."
  },
  "GitInspector.repository": {
    "zh": "仓库：{value1}{value2}{value3}",
    "en": "Repository: {value1}{value2}{value3}"
  },
  "GitInspector.deleteRemote": {
    "zh": "删除远端 {value1}/{value2}",
    "en": "Delete remote {value1}/{value2}"
  },
  "GitInspector.safelyDeleteLocalGitRefusesIfItIs": {
    "zh": "安全删除本地 {value1}，未合并时 Git 会拒绝。",
    "en": "Safely delete local {value1}. Git refuses if it is not merged."
  },
  "GitInspector.typeTheFullRemoteBranchNameToConfirm": {
    "zh": "输入完整远端分支名确认{value1}",
    "en": "Type the full remote branch name to confirm{value1}"
  },
  "GitInspector.mergeIntoDivergedBranchesCreateAMergeCommit": {
    "zh": "把 {value1} 合入 {value2}。分叉时产生合并提交；有冲突时保留现场供你处理。",
    "en": "Merge {value1} into {value2}. Diverged branches create a merge commit; conflicts are left for you to resolve."
  },
  "GitInspector.abortTheCurrentMergeAndDiscardItsConflict": {
    "zh": "中止当前 merge，撤销这次合并及解决冲突的改动。Git 无法安全恢复时会拒绝，请在终端检查。",
    "en": "Abort the current merge and discard its conflict-resolution changes. Git refuses if it cannot safely restore the previous state; check in the terminal."
  },
  "GitInspector.processing": {
    "zh": "处理中…",
    "en": "Processing…"
  },
  "GitRefLabel.localBranch": {
    "zh": "本地分支",
    "en": "Local branch"
  },
  "GitRefLabel.remoteBranch": {
    "zh": "远程分支",
    "en": "Remote branch"
  },
  "GitRefLabel.tag": {
    "zh": "标签",
    "en": "Tag"
  },
  "GitRefLabel.currentCheckoutDetached": {
    "zh": "当前检出（游离）",
    "en": "Current checkout (detached)"
  },
  "GitRefLabel.branchesAndTagsContainingThisCommit": {
    "zh": "提交所在的分支和标签",
    "en": "Branches and tags containing this commit"
  },
  "HelperPanel.askASmallModelAboutSelectedContentOr": {
    "zh": "把选中的内容交给一个小模型去问或去办，不占主会话的上下文。",
    "en": "Ask a small model about selected content or give it a task without using main-conversation context."
  },
  "HelperPanel.startingHelper": {
    "zh": "正在启动小助手…",
    "en": "Starting helper…"
  },
  "HelperPanel.clearHelperHistoryAndStartANewConversation": {
    "zh": "清空小助手的聊天记录，开始一段新对话？",
    "en": "Clear helper history and start a new conversation?"
  },
  "HelperPanel.helper": {
    "zh": "小助手",
    "en": "Helper"
  },
  "HelperPanel.newConversation": {
    "zh": "新对话",
    "en": "New conversation"
  },
  "HelperTurnCost.cost": {
    "zh": "花费 {value1}",
    "en": "Cost {value1}"
  },
  "HelperTurnCost.tokensCostUnavailable": {
    "zh": "{value1} token · 花费未提供",
    "en": "{value1} {value1, plural, one {token} other {tokens}} · Cost unavailable"
  },
  "HelperTurnCost.usageUnavailable": {
    "zh": "用量未提供",
    "en": "Usage unavailable"
  },
  "HelperTurnCost.savedAbout": {
    "zh": " · 约省 {value1}",
    "en": " · Saved about {value1}"
  },
  "ImageStrip.view": {
    "zh": "查看{label}",
    "en": "View {label}"
  },
  "ImageStrip.image": {
    "zh": "图 {value1}",
    "en": "Image {value1}"
  },
  "ImageStrip.remove": {
    "zh": "移除{label}",
    "en": "Remove {label}"
  },
  "ImageStrip.addImages": {
    "zh": "＋ 添加图片",
    "en": "＋ Add images"
  },
  "ImageStrip.youCanAlsoPasteOrDragThemHere": {
    "zh": "也可以直接粘贴或拖进来",
    "en": "You can also paste or drag them here"
  },
  "ImageViewer.nameThisImageOptional": {
    "zh": "给图片起个名字（可选）",
    "en": "Name this image (optional)"
  },
  "ImageViewer.imageName": {
    "zh": "图片名字",
    "en": "Image name"
  },
  "ImageViewer.previousImage": {
    "zh": "上一张",
    "en": "Previous image"
  },
  "ImageViewer.cannotOpenImageFileDoesNotExistOr": {
    "zh": "图片打不开：文件不存在，或不是能显示的图片",
    "en": "Cannot open image: file does not exist or is not a displayable image"
  },
  "ImageViewer.loading": {
    "zh": "正在加载…",
    "en": "Loading…"
  },
  "ImageViewer.nextImage": {
    "zh": "下一张",
    "en": "Next image"
  },
  "ImageViewer.zoomAndRotate": {
    "zh": "缩放和旋转",
    "en": "Zoom and rotate"
  },
  "ImageViewer.zoomOut": {
    "zh": "缩小",
    "en": "Zoom out"
  },
  "ImageViewer.zoomOut_1114": {
    "zh": "缩小（-）",
    "en": "Zoom out (-)"
  },
  "ImageViewer.fitToWindow": {
    "zh": "适应窗口",
    "en": "Fit to window"
  },
  "ImageViewer.fitToWindow0": {
    "zh": "适应窗口（0）",
    "en": "Fit to window (0)"
  },
  "ImageViewer.zoomIn": {
    "zh": "放大（+）",
    "en": "Zoom in (+)"
  },
  "ImageViewer.rotateLeft": {
    "zh": "向左旋转",
    "en": "Rotate left"
  },
  "ImageViewer.rotateLeftShiftR": {
    "zh": "向左旋转（Shift+R）",
    "en": "Rotate left (Shift+R)"
  },
  "ImageViewer.rotateRight": {
    "zh": "向右旋转",
    "en": "Rotate right"
  },
  "ImageViewer.rotateRightR": {
    "zh": "向右旋转（R）",
    "en": "Rotate right (R)"
  },
  "InboxEntry.inbox": {
    "zh": "收件箱{value1}",
    "en": "Inbox{value1}"
  },
  "InboxEntry.syncFailed": {
    "zh": "，同步失败",
    "en": ", sync failed"
  },
  "InboxEntry.pending": {
    "zh": "，{waiting} 个待处理",
    "en": ", {waiting} pending"
  },
  "InboxEntry.inbox_1125": {
    "zh": "收件箱",
    "en": "Inbox"
  },
  "Inspector.added": {
    "zh": "新增",
    "en": "Added"
  },
  "Inspector.modified": {
    "zh": "修改",
    "en": "Modified"
  },
  "Inspector.newFileNotYetTrackedByGit": {
    "zh": "新文件，还没加入 git",
    "en": "New file, not yet tracked by Git"
  },
  "Inspector.changes": {
    "zh": "变更",
    "en": "Changes"
  },
  "Inspector.rawData": {
    "zh": "原始数据",
    "en": "Raw data"
  },
  "Inspector.files": {
    "zh": "{value1} 个文件",
    "en": "{value1} {value1, plural, one {file} other {files}}"
  },
  "Inspector.newFile": {
    "zh": "新文件",
    "en": "New file"
  },
  "Inspector.binary": {
    "zh": "二进制",
    "en": "Binary"
  },
  "Inspector.backToFileList": {
    "zh": "返回文件列表",
    "en": "Back to file list"
  },
  "Inspector.loadingDiff": {
    "zh": "正在读取 diff…",
    "en": "Loading diff…"
  },
  "Inspector.thisFileIsNoLongerChangedItMay": {
    "zh": "这个文件已经不在改动里了，可能已经被还原或提交。",
    "en": "This file is no longer changed. It may have been reverted or committed."
  },
  "Inspector.failedToReadDiff": {
    "zh": "读取 diff 失败。",
    "en": "Failed to read diff."
  },
  "Inspector.viewThisTurnSEdits": {
    "zh": "查看本轮的编辑",
    "en": "View this turn's edits"
  },
  "Inspector.diffTruncatedToTheFirst256kb": {
    "zh": "diff 太长，只显示了前 256KB。",
    "en": "Diff truncated to the first 256KB."
  },
  "InstalledAgentsSettings.copyCommand": {
    "zh": "复制命令",
    "en": "Copy command"
  },
  "InstalledAgentsSettings.versionUnknown": {
    "zh": "版本未知",
    "en": "Version unknown"
  },
  "InstalledAgentsSettings.disabled": {
    "zh": "已禁用",
    "en": "Disabled"
  },
  "InstalledAgentsSettings.signedIn": {
    "zh": "已登录",
    "en": "Signed in"
  },
  "InstalledAgentsSettings.notSignedIn": {
    "zh": "未登录",
    "en": "Not signed in"
  },
  "InstalledAgentsSettings.checkWhetherTheCliCanStart": {
    "zh": "{value1}。请检查 CLI 是否能正常启动{value2}。",
    "en": "{value1}. Check whether the CLI can start{value2}."
  },
  "InstalledAgentsSettings.signIn": {
    "zh": "登录：",
    "en": "Sign in:"
  },
  "InstalledAgentsSettings.keepAtLeastOneAgentEnabled": {
    "zh": "至少保留一个启用的外部智能体",
    "en": "Keep at least one external agent enabled"
  },
  "InstalledAgentsSettings.cliNotFound": {
    "zh": "未找到 CLI",
    "en": "CLI not found"
  },
  "InstalledAgentsSettings.appDetectedInstallItsCliToUseIt": {
    "zh": "已检测到 {value1} App，安装 CLI 后即可在 Antumi 中使用。",
    "en": "{value1} app detected. Install its CLI to use it in Antumi."
  },
  "InstalledAgentsSettings.install": {
    "zh": "安装：",
    "en": "Install:"
  },
  "InstalledAgentsSettings.openingTerminal": {
    "zh": "正在打开终端…",
    "en": "Opening terminal…"
  },
  "InstalledAgentsSettings.viewInstallationProgress": {
    "zh": "查看安装进度",
    "en": "View installation progress"
  },
  "InstalledAgentsSettings.retryInstallation": {
    "zh": "重试安装",
    "en": "Retry installation"
  },
  "InstalledAgentsSettings.installInTerminal": {
    "zh": "在终端安装",
    "en": "Install in terminal"
  },
  "InstalledAgentsSettings.viewInstallationOutput": {
    "zh": "查看安装输出",
    "en": "View installation output"
  },
  "InstalledAgentsSettings.installationFailedExitCodeReviewOutputAndRetry": {
    "zh": "安装失败（退出码 {value1}），可查看输出后重试。",
    "en": "Installation failed (exit code {value1}). Review output and retry."
  },
  "InstalledAgentsSettings.unknown": {
    "zh": "未知",
    "en": "Unknown"
  },
  "InstalledAgentsSettings.installationCommandFinishedIfCliIsStillMissing": {
    "zh": "安装命令已完成；若仍未检测到 CLI，请检查 PATH 后重新检测。",
    "en": "Installation command finished. If CLI is still missing, check PATH and scan again."
  },
  "InstalledAgentsSettings.appFoundAgentCommandNotFound": {
    "zh": "仅发现应用 · 未找到外部智能体命令",
    "en": "App found · External agent command not found"
  },
  "InstalledAgentsSettings.commandResponded": {
    "zh": "命令已响应{value1}",
    "en": "Command responded{value1}"
  },
  "InstalledAgentsSettings.versionNotRecognized": {
    "zh": " · 版本未识别",
    "en": " · Version not recognized"
  },
  "InstalledAgentsSettings.commandFoundCannotVerifyVersionThroughWindowsCommand": {
    "zh": "找到命令 · Windows 命令垫片无法直接验证版本",
    "en": "Command found · Cannot verify version through Windows command shim"
  },
  "InstalledAgentsSettings.commandFoundVersionCheckFailedMayNotStart": {
    "zh": "找到命令 · 版本检测失败，可能无法启动",
    "en": "Command found · Version check failed; may not start"
  },
  "InstalledAgentsSettings.commandFoundVersionNotVerified": {
    "zh": "找到命令 · 尚未验证版本",
    "en": "Command found · Version not verified"
  },
  "InstalledAgentsSettings.notSupportedYet": {
    "zh": "暂未支持",
    "en": "Not supported yet"
  },
  "InstalledAgentsSettings.app": {
    "zh": "应用",
    "en": "App"
  },
  "InstalledAgentsSettings.agentsOnThisComputer": {
    "zh": "这台电脑上的外部智能体",
    "en": "External agents on this computer"
  },
  "InstalledAgentsSettings.scanAgainAfterInstallingOrSigningIn": {
    "zh": "装好或登录后，重新查一遍",
    "en": "Scan again after installing or signing in"
  },
  "InstalledAgentsSettings.scanning": {
    "zh": "检测中…",
    "en": "Scanning…"
  },
  "InstalledAgentsSettings.scanAgain": {
    "zh": "重新检测",
    "en": "Scan again"
  },
  "InstalledAgentsSettings.notScannedYet": {
    "zh": "还没有检测。",
    "en": "Not scanned yet."
  },
  "InstalledAgentsSettings.installed": {
    "zh": "已安装",
    "en": "Installed"
  },
  "InstalledAgentsSettings.availableToInstall": {
    "zh": "可安装",
    "en": "Available to install"
  },
  "InstalledAgentsSettings.foundOnThisComputerButCannotRunIn": {
    "zh": "在这台电脑上找到了，但还不能在 Antumi 里运行；命令能响应版本，不代表已登录或支持聊天。",
    "en": "Found on this computer but cannot run in Antumi yet. A version response does not confirm sign-in or chat support."
  },
  "InstalledAgentsSettings.antumiSearchesTheseDirectoriesForCommands": {
    "zh": "Antumi 在这些目录里找命令（{value1} 个）",
    "en": "Antumi searches these directories for commands ({value1})"
  },
  "InstalledAgentsSettings.pathUsedByCoreAndAgentsPlusCommon": {
    "zh": "core 和外部智能体启动时用的 PATH，另外也会查常见目录里的 App。CLI 装在别处时，把它的目录加进 PATH 后重启 Antumi。",
    "en": "PATH used by core and external agents, plus common app directories. If your CLI is elsewhere, add its directory to PATH and restart Antumi."
  },
  "KnowledgeBaseSettings.chooseObsidianVault": {
    "zh": "选择 Obsidian 知识库",
    "en": "Choose Obsidian vault"
  },
  "KnowledgeBaseSettings.chooseMarkdownFolder": {
    "zh": "选择 Markdown 文件夹",
    "en": "Choose Markdown folder"
  },
  "KnowledgeBaseSettings.agentCanReadMaterialsAndSaveSummariesAnd": {
    "zh": "Agent 可读取资料，并在你要求时保存总结和笔记；规划、只读和群聊阶段只读。下次启动起生效。",
    "en": "Agent can read materials and save summaries and notes when asked. Planning, read-only, and group discussions remain read-only. Applies at next start."
  },
  "KnowledgeBaseSettings.knowledgeBaseType": {
    "zh": "知识库类型",
    "en": "Knowledge base type"
  },
  "KnowledgeBaseSettings.useStandardMarkdownAndRelativeLinksFollowingExisting": {
    "zh": "使用普通 Markdown 和相对路径链接，遵循已有笔记格式。",
    "en": "Use standard Markdown and relative links, following existing note formats."
  },
  "KnowledgeBaseSettings.useObsidianMarkdownWithWikilinksAndProperties": {
    "zh": "使用 Obsidian Markdown，支持双链和属性。",
    "en": "Use Obsidian Markdown with wikilinks and properties."
  },
  "KnowledgeBaseSettings.markdownFolder": {
    "zh": "Markdown 文件夹",
    "en": "Markdown folder"
  },
  "KnowledgeBaseSettings.disable": {
    "zh": "停用",
    "en": "Disable"
  },
  "KnowledgeBaseSettings.thisFolderHasNoObsidianDirectoryObsidianMay": {
    "zh": "这个文件夹里没有 .obsidian，Obsidian 可能还没打开过它；Agent 一样能读写。",
    "en": "This folder has no .obsidian directory. Obsidian may not have opened it yet; Agent can still read and write."
  },
  "KnowledgeBaseSettings.installTheRecommendedObsidianSkillInSettingsSkills": {
    "zh": "在 设置 → 技能 里安装推荐的 Obsidian 技能后，Agent 会按 Obsidian 的 Markdown（双链、属性）写笔记。",
    "en": "Install the recommended Obsidian skill in Settings → Skills to write notes using Obsidian Markdown (wikilinks and properties)."
  },
  "KnowledgeBaseSettings.vaultContainsAgentLoadsTheseSkillsTooUsing": {
    "zh": "库里有 {value1}：Agent 会把里面的技能一并加载，每次启动多花 token；不需要就移出知识库。",
    "en": "Vault contains {value1}. Agent loads these skills too, using extra tokens at each start. Move them out if unnecessary."
  },
  "KnowledgeBaseSettings.allowWriting": {
    "zh": "允许写入",
    "en": "Allow writing"
  },
  "KnowledgeBaseSettings.whenOffAgentCanOnlyReadTheKnowledge": {
    "zh": "关掉后 Agent 只读知识库，不能新建或修改笔记。",
    "en": "When off, Agent can only read the knowledge base and cannot create or edit notes."
  },
  "KnowledgeBaseSettings.noKnowledgeBaseSelected": {
    "zh": "还没有选知识库。",
    "en": "No knowledge base selected."
  },
  "KnowledgeBaseSettings.obsidianVaults": {
    "zh": "Obsidian 里的库",
    "en": "Obsidian vaults"
  },
  "KnowledgeBaseSettings.open": {
    "zh": "（已打开）",
    "en": "(Open)"
  },
  "KnowledgeBaseSettings.use": {
    "zh": "使用",
    "en": "Use"
  },
  "KnowledgeBaseSettings.chooseMarkdownFolder_1194": {
    "zh": "选择 Markdown 文件夹…",
    "en": "Choose Markdown folder…"
  },
  "KnowledgeBaseSettings.chooseAnotherFolder": {
    "zh": "选择其他文件夹…",
    "en": "Choose another folder…"
  },
  "McpSettingsSection.invalidJson": {
    "zh": "不是有效的 JSON",
    "en": "Invalid JSON"
  },
  "McpSettingsSection.noServersFound": {
    "zh": "没有找到服务器",
    "en": "No servers found"
  },
  "McpSettingsSection.neitherCommandNorUrlSpecified": {
    "zh": "既没有 command 也没有 url",
    "en": "Neither command nor URL specified"
  },
  "McpSettingsSection.environmentVariables": {
    "zh": "环境变量",
    "en": "Environment variables"
  },
  "McpSettingsSection.requestHeaders": {
    "zh": "请求头",
    "en": "Request headers"
  },
  "McpSettingsSection.pasteJsonToFillFields": {
    "zh": "粘贴 JSON 填写",
    "en": "Paste JSON to fill fields"
  },
  "McpSettingsSection.fill": {
    "zh": "填入",
    "en": "Fill"
  },
  "McpSettingsSection.useLowercaseLettersNumbersStartingWithALetter": {
    "zh": "只能用小写字母、数字和 - _，以字母或数字开头；antumi 留给 Antumi 自己",
    "en": "Use lowercase letters, numbers, - _, starting with a letter or number; antumi is reserved"
  },
  "McpSettingsSection.agentToolNamesIncludeThisNameEG": {
    "zh": "Agent 里看到的工具名会带上它，如 github · create_issue",
    "en": "Agent tool names include this name, e.g. github · create_issue"
  },
  "McpSettingsSection.type": {
    "zh": "类型",
    "en": "Type"
  },
  "McpSettingsSection.localCommand": {
    "zh": "本地命令",
    "en": "Local command"
  },
  "McpSettingsSection.remoteUrl": {
    "zh": "远程地址",
    "en": "Remote URL"
  },
  "McpSettingsSection.onePerLinePassedDirectlyWithoutAShell": {
    "zh": "一行一个，原样传给命令，不经过 shell。",
    "en": "One per line, passed directly without a shell."
  },
  "McpSettingsSection.workingDirectory": {
    "zh": "工作目录",
    "en": "Working directory"
  },
  "McpSettingsSection.optionalAbsolutePathDefaultsToTheConversationS": {
    "zh": "可选，绝对路径；不填就在会话的项目里启动",
    "en": "Optional absolute path; defaults to the conversation's project"
  },
  "McpSettingsSection.streamableHttpHttpIsAllowedOnlyForLocalhost": {
    "zh": "Streamable HTTP。http:// 只能连本机。",
    "en": "Streamable HTTP. http:// is allowed only for localhost."
  },
  "McpSettingsSection.name": {
    "zh": "{what}名",
    "en": "{what} name"
  },
  "McpSettingsSection.alreadySetLeaveEmptyToKeep": {
    "zh": "已设置，留空不改",
    "en": "Already set; leave empty to keep"
  },
  "McpSettingsSection.value": {
    "zh": "值",
    "en": "Value"
  },
  "McpSettingsSection.valueFor": {
    "zh": "{value1}的值",
    "en": "Value for {value1}"
  },
  "McpSettingsSection.add": {
    "zh": "添加{what}",
    "en": "Add {what}"
  },
  "McpSettingsSection.valuesAreStoredOnlyInAntumiSLocal": {
    "zh": "值只存在本机 Antumi 的凭据文件里，之后这里只显示键名；Agent 的配置、命令行和 Antumi 的日志里都不会出现。",
    "en": "Values are stored only in Antumi's local credentials file. Only key names are shown afterward; values never appear in Agent config, command lines, or Antumi logs."
  },
  "McpSettingsSection.shareWithAgents": {
    "zh": "交给哪些 Agent",
    "en": "Share with Agents"
  },
  "McpSettingsSection.saving": {
    "zh": "保存中…",
    "en": "Saving…"
  },
  "McpSettingsSection.saveAndTest": {
    "zh": "保存并测试",
    "en": "Save and test"
  },
  "McpSettingsSection.connectingFirstUseOfNpxUvxMayRequire": {
    "zh": "正在连接…（第一次用 npx / uvx 时要先下载，可能要等一会儿）",
    "en": "Connecting… (first use of npx / uvx may require downloads)"
  },
  "McpSettingsSection.connectionFailed": {
    "zh": "没连上：{value1}",
    "en": "Connection failed: {value1}"
  },
  "McpSettingsSection.connectedTools": {
    "zh": "连上了，{value1} 个工具。{value2}",
    "en": "Connected, {value1} {value1, plural, one {tool} other {tools}}. {value2}"
  },
  "McpSettingsSection.sharedWith": {
    "zh": "交给 {value1}",
    "en": "Shared with {value1}"
  },
  "McpSettingsSection.notSharedWithAnyAgent": {
    "zh": "没有交给任何 Agent",
    "en": "Not shared with any Agent"
  },
  "McpSettingsSection.testConnection": {
    "zh": "测试连接",
    "en": "Test connection"
  },
  "McpSettingsSection.afterDeletionAgentsLoseTheseToolsAtTheir": {
    "zh": "删除后，用到它的 Agent 下次启动起就没有它的工具。",
    "en": "After deletion, Agents lose these tools at their next start."
  },
  "McpSettingsSection.confirmDeletion": {
    "zh": "确认删除",
    "en": "Confirm deletion"
  },
  "McpSettingsSection.codexConfigToml": {
    "zh": "Codex 的 config.toml",
    "en": "Codex config.toml"
  },
  "McpSettingsSection.readingAgentConfigurations": {
    "zh": "正在读取各 Agent 的配置…",
    "en": "Reading Agent configurations…"
  },
  "McpSettingsSection.noMcpServersInAnyAgentSUser": {
    "zh": "各 Agent 的用户配置里都没有 MCP 服务器。",
    "en": "No MCP servers in any Agent's user configuration."
  },
  "McpSettingsSection.aServerWithThisNameAlreadyExistsIn": {
    "zh": "同名的服务器已经在 Antumi 里了，勾选后改个名字",
    "en": "A server with this name already exists in Antumi. Select it and rename it"
  },
  "McpSettingsSection.import": {
    "zh": "导入 {value1}",
    "en": "Import {value1}"
  },
  "McpSettingsSection.nameForInAntumi": {
    "zh": "{value1} 在 Antumi 里的名字",
    "en": "Name for {value1} in Antumi"
  },
  "McpSettingsSection.notSharedBackToItsOriginalAgentIt": {
    "zh": "不会再交给它原来所在的 Agent：那里已经有了，交两次会启动两份。",
    "en": "Not shared back to its original Agent; it already loads it there, which would create duplicate processes."
  },
  "McpSettingsSection.importing": {
    "zh": "导入中…",
    "en": "Importing…"
  },
  "McpSettingsSection.import_1237": {
    "zh": "导入 {value1} 个",
    "en": "Import {value1}"
  },
  "McpSettingsSection.agentConfigurationsStayUntouchedAndTheirExistingServers": {
    "zh": "不改 Agent 自己的配置，它自己配的服务器照常加载；改动下次启动起生效。MCP 服务器能读写数据、能联网，只添加你信任的；需要确认的调用会在聊天里问你。",
    "en": "Agent configurations stay untouched and their existing servers still load. Changes apply at next start. MCP servers can access data and the network; add only trusted ones. Calls requiring approval appear in chat."
  },
  "McpSettingsSection.noMcpServersYet": {
    "zh": "还没有 MCP 服务器。",
    "en": "No MCP servers yet."
  },
  "McpSettingsSection.importFromClaudeCodexCursor": {
    "zh": "从 Claude / Codex / Cursor 导入",
    "en": "Import from Claude / Codex / Cursor"
  },
  "McpSettingsSection.addServer": {
    "zh": "添加服务器",
    "en": "Add server"
  },
  "ModelBreakdown.tasksReviewsAcceptedRevisionsRedone": {
    "zh": "任务：判定 {value1} 次，接受 {value2} · 继续修改 {value3} · 重做 {value4}",
    "en": "Tasks: {value1} reviews, {value2} accepted · {value3} revisions · {value4} redone"
  },
  "ModelBreakdown.conversationsFailed": {
    "zh": "对话：失败 {value1}{value2}",
    "en": "Conversations: {value1} failed{value2}"
  },
  "ModelBreakdown.quotaLimited": {
    "zh": "（撞额度 {limited}）",
    "en": " ({limited} quota-limited)"
  },
  "ModelBreakdown.interrupted": {
    "zh": "中断 {value1}",
    "en": "{value1} interrupted"
  },
  "ModelBreakdown.medianTurnDuration": {
    "zh": "每回合耗时中位 {value1}",
    "en": "Median turn duration {value1}"
  },
  "ModelBreakdown.byAgentAndModel": {
    "zh": "按 Agent 和模型",
    "en": "By Agent and model"
  },
  "ModelBreakdown.noRunsConversationsOrQuickRequestsInThis": {
    "zh": "这段时间没有运行、对话或轻量请求。",
    "en": "No runs, conversations, or quick requests in this period."
  },
  "ModelBreakdown.taskRunsEndedInThisPeriod": {
    "zh": "这段时间结束的任务运行",
    "en": "Task runs ended in this period"
  },
  "ModelBreakdown.shareOfReviewedRunsAcceptedDirectlyOmittedWhen": {
    "zh": "判定过的运行里直接接受的比例，判定太少时不算",
    "en": "Share of reviewed runs accepted directly; omitted when there are too few reviews"
  },
  "ModelBreakdown.turns": {
    "zh": "回合",
    "en": "Turns"
  },
  "ModelBreakdown.completedConversationTurns": {
    "zh": "对话里结束的回合",
    "en": "Completed conversation turns"
  },
  "ModelBreakdown.tokensReadAndWrittenByTaskRunsConversation": {
    "zh": "任务运行、对话回合和轻量请求读写的 token",
    "en": "Tokens read and written by task runs, conversation turns, and quick requests"
  },
  "ModelBreakdown.unknownModel": {
    "zh": "未知模型",
    "en": "Unknown model"
  },
  "NewTaskDialog.createdManually": {
    "zh": "手动创建",
    "en": "Created manually"
  },
  "NewTaskDialog.restoreWindow": {
    "zh": "还原窗口",
    "en": "Restore window"
  },
  "NewTaskDialog.expandWindow": {
    "zh": "展开窗口",
    "en": "Expand window"
  },
  "NewTaskDialog.taskTitle": {
    "zh": "任务标题",
    "en": "Task title"
  },
  "NewTaskDialog.taskDetails": {
    "zh": "任务详情",
    "en": "Task details"
  },
  "NewTaskDialog.addDetailsMarkdownSupported": {
    "zh": "添加详情...（支持 Markdown）",
    "en": "Add details… (Markdown supported)"
  },
  "NewTaskDialog.assignee": {
    "zh": "执行者",
    "en": "Assignee"
  },
  "NewTaskDialog.developmentSquad": {
    "zh": "团队",
    "en": "Team"
  },
  "NewTaskDialog.moreOptions": {
    "zh": "更多选项",
    "en": "More options"
  },
  "NewTaskDialog.moreTaskOptions": {
    "zh": "更多任务选项",
    "en": "More task options"
  },
  "NewTaskDialog.dependencies": {
    "zh": "依赖任务",
    "en": "Dependencies"
  },
  "NewTaskDialog.dependencies_1266": {
    "zh": "依赖 {value1} 项",
    "en": "{value1} {value1, plural, one {dependency} other {dependencies}}"
  },
  "NewTaskDialog.addImagesOrPasteOrDragThemHere": {
    "zh": "添加图片，也可以直接粘贴或拖入",
    "en": "Add images, or paste or drag them here"
  },
  "NewTaskDialog.createMore": {
    "zh": "{value1}{value2}创建更多",
    "en": "{value1}{value2}Create more"
  },
  "NewTaskDialog.created": {
    "zh": "已创建「{lastCreated}」",
    "en": "Created “{lastCreated}”"
  },
  "NewTaskDialog.createTask": {
    "zh": "创建任务{value1}",
    "en": "Create task{value1}"
  },
  "OpenWithButton.openWith": {
    "zh": "用 {value1} 打开",
    "en": "Open with {value1}"
  },
  "OpenWithButton.openWithDefaultApp": {
    "zh": "用默认应用打开",
    "en": "Open with default app"
  },
  "OpenWithButton.openWithAnotherApp": {
    "zh": "用其他方式打开",
    "en": "Open with another app"
  },
  "OverviewEntry.overview": {
    "zh": "总览{value1}",
    "en": "Overview{value1}"
  },
  "OverviewEntry.itemsNeedYourResponse": {
    "zh": "，{count} 项等你处理",
    "en": ", {count} {count, plural, one {item} other {items}} need your response"
  },
  "OverviewEntry.overview_1276": {
    "zh": "总览",
    "en": "Overview"
  },
  "OverviewView.routines": {
    "zh": "定时任务",
    "en": "Routines"
  },
  "OverviewView.schedules": {
    "zh": "预约",
    "en": "Schedules"
  },
  "SchedulePicker.schedule": {
    "zh": "预约",
    "en": "Schedule"
  },
  "OverviewView.respond": {
    "zh": "去处理：{value1}",
    "en": "Respond: {value1}"
  },
  "OverviewView.deny": {
    "zh": "拒绝：{value1}",
    "en": "Deny: {value1}"
  },
  "OverviewView.allowOnce": {
    "zh": "允许一次：{value1}",
    "en": "Allow once: {value1}"
  },
  "OverviewView.allowThisTimeOnlyWithoutSavingARule": {
    "zh": "只允许这一次，不记规则",
    "en": "Allow this time only, without saving a rule"
  },
  "OverviewView.reschedule": {
    "zh": "改期",
    "en": "Reschedule"
  },
  "OverviewView.reschedule_1284": {
    "zh": "改期：{value1}",
    "en": "Reschedule: {value1}"
  },
  "OverviewView.changeScheduledTime": {
    "zh": "改预约时间",
    "en": "Change scheduled time"
  },
  "OverviewView.findMember": {
    "zh": "定位成员 · {value1}",
    "en": "Find member · {value1}"
  },
  "OverviewView.more": {
    "zh": " · 还有 {value1} 项",
    "en": " · {value1} more"
  },
  "OverviewView.viewFailed": {
    "zh": "查看失败的{value1}：{value2}",
    "en": "View failed {value1}: {value2}"
  },
  "OverviewView.goToSchedules": {
    "zh": "去预约页",
    "en": "Go to schedules"
  },
  "OverviewView.markAsRead": {
    "zh": "标为已读",
    "en": "Mark as read"
  },
  "OverviewView.markAsRead_1291": {
    "zh": "标为已读：{value1}",
    "en": "Mark as read: {value1}"
  },
  "OverviewView.open": {
    "zh": "打开：{value1}",
    "en": "Open: {value1}"
  },
  "OverviewView.runNow": {
    "zh": "立即运行",
    "en": "Run now"
  },
  "OverviewView.runNow_1294": {
    "zh": "立即运行：{value1}",
    "en": "Run now: {value1}"
  },
  "OverviewView.markIncomplete": {
    "zh": "取消完成",
    "en": "Mark incomplete"
  },
  "OverviewView.assignToAgent": {
    "zh": "交给 Agent",
    "en": "Assign to Agent"
  },
  "OverviewView.assignToAgent_1297": {
    "zh": "交给 Agent：{value1}",
    "en": "Assign to Agent: {value1}"
  },
  "OverviewView.openConversationAndPutThisInTheComposer": {
    "zh": "打开会话，放进输入框，让 Agent 去做",
    "en": "Open conversation and put this in the composer for Agent"
  },
  "OverviewView.pleaseHandleThisToDoAndMarkIt": {
    "zh": "请处理这一项待办，做完后在待办里把它勾掉。",
    "en": "Please handle this to-do and mark it complete when finished."
  },
  "OverviewView.items": {
    "zh": "{value1} 项",
    "en": "{value1} {value1, plural, one {item} other {items}}"
  },
  "OverviewView.allDone": {
    "zh": "都做完了",
    "en": "All done"
  },
  "OverviewView.inactiveForDays": {
    "zh": "{value1} 天没动",
    "en": "Inactive for {value1} {value1, plural, one {day} other {days}}"
  },
  "OverviewView.more_1303": {
    "zh": "还有 {more} 项",
    "en": "{more} more"
  },
  "OverviewView.remainingConversations": {
    "zh": "其余 {value1} 个会话",
    "en": "{value1} more {value1, plural, one {conversation} other {conversations}}"
  },
  "OverviewView.now": {
    "zh": "现在",
    "en": "Now"
  },
  "OverviewView.statistics": {
    "zh": "统计",
    "en": "Statistics"
  },
  "OverviewView.waitingOnMe": {
    "zh": "等我",
    "en": "Waiting on me"
  },
  "OverviewView.running": {
    "zh": "在跑",
    "en": "Running"
  },
  "OverviewView.upNext": {
    "zh": "接下来",
    "en": "Up next"
  },
  "OverviewView.unread": {
    "zh": "未读",
    "en": "Unread"
  },
  "OverviewView.nothingWaitingOnYou": {
    "zh": "没有等你的事",
    "en": "Nothing waiting on you"
  },
  "OverviewView.itemsForYou": {
    "zh": "{value1} 件归你",
    "en": "{value1} {value1, plural, one {item} other {items}} for you"
  },
  "OverviewView.itemsAgentCanContinue": {
    "zh": "{value1} 件 Agent 可接着做",
    "en": "{value1} {value1, plural, one {item} other {items}} Agent can continue"
  },
  "OverviewView.noToDos": {
    "zh": "没有待办",
    "en": "No to-dos"
  },
  "OverviewView.starting": {
    "zh": "正在开始",
    "en": "Starting"
  },
  "OverviewView.nothingRunning": {
    "zh": "没有在跑的",
    "en": "Nothing running"
  },
  "OverviewView.next": {
    "zh": "下一个 {value1}",
    "en": "Next {value1}"
  },
  "OverviewView.waitingForConditions": {
    "zh": "{value1} 项等条件",
    "en": "{value1} waiting for conditions"
  },
  "OverviewView.nothingScheduled": {
    "zh": "没有安排",
    "en": "Nothing scheduled"
  },
  "OverviewView.latest": {
    "zh": "最近 {value1}",
    "en": "Latest {value1}"
  },
  "OverviewView.allRead": {
    "zh": "都看过了",
    "en": "All read"
  },
  "OverviewView.needsMe": {
    "zh": "需要我",
    "en": "Needs me"
  },
  "OverviewView.itemsInArchivedConversations": {
    "zh": "{value1}已归档会话的 {value2} 项",
    "en": "{value1}{value2} {value2, plural, one {item} other {items}} in archived conversations"
  },
  "OverviewView.hide": {
    "zh": "不看",
    "en": "Hide"
  },
  "OverviewView.include": {
    "zh": "也看",
    "en": "Include"
  },
  "OverviewView.today": {
    "zh": "今天",
    "en": "Today"
  },
  "OverviewView.itemsTomorrowOrLater": {
    "zh": "明天及以后 {value1} 项",
    "en": "{value1} {value1, plural, one {item} other {items}} tomorrow or later"
  },
  "OverviewView.waitingForConditions_1328": {
    "zh": "等条件",
    "en": "Waiting for conditions"
  },
  "OverviewView.overviewContent": {
    "zh": "总览的内容",
    "en": "Overview content"
  },
  "OverviewView.notConnectedToCoreItemsAreNotUp": {
    "zh": "尚未连接到 core，事项尚未更新。{value1}",
    "en": "Not connected to core. Items are not up to date. {value1}"
  },
  "OverviewView.showingTheLatestReceivedInformation": {
    "zh": "以下为最近收到的信息。",
    "en": "Showing the latest received information."
  },
  "OverviewView.workOverviewAppearsAfterConnecting": {
    "zh": "连接后将显示工作总览。",
    "en": "Work overview appears after connecting."
  },
  "OverviewView.loadingPendingItems": {
    "zh": "正在读取待处理事项…",
    "en": "Loading pending items…"
  },
  "OverviewView.currentCoreProvidesIncompleteTaskChatDetails": {
    "zh": "当前 core 的任务聊天详情不完整",
    "en": "Current core provides incomplete task-chat details"
  },
  "OverviewView.chatSummariesFailedToLoadItemsMayBe": {
    "zh": "聊天摘要加载失败，事项可能不完整。{value1}",
    "en": "Chat summaries failed to load. Items may be incomplete.{value1}"
  },
  "OverviewView.workScope": {
    "zh": "工作范围",
    "en": "Work scope"
  },
  "OverviewView.noWorkInProgress": {
    "zh": "暂时没有进行中的工作",
    "en": "No work in progress"
  },
  "PanelSeparator.resize": {
    "zh": "调整{panelName}宽度",
    "en": "Resize {panelName}"
  },
  "PanelSeparator.uses": {
    "zh": "{panelName}占 {value2}%",
    "en": "{panelName} uses {value2}%"
  },
  "PlanComments.commentOnThisPlanPassage": {
    "zh": "评论这段计划",
    "en": "Comment on this plan passage"
  },
  "PluginSettings.installNamedPlugin": {
    "zh": "安装 {name} 插件",
    "en": "Install {name} plugin"
  },
  "PluginSettings.openOnGitHub": {
    "zh": "在 GitHub 上查看",
    "en": "View on GitHub"
  },
  "PluginSettings.recommended": {
    "zh": "推荐插件",
    "en": "Recommended plugins"
  },
  "PluginSettings.installed": {
    "zh": "已安装",
    "en": "Installed"
  },
  "PluginSettings.installedPlugins": {
    "zh": "已安装的插件",
    "en": "Installed plugins"
  },
  "PluginSettings.installFromElsewhere": {
    "zh": "从其他位置安装",
    "en": "Install from another source"
  },
  "PluginSettings.pluginInstalled": {
    "zh": "插件已安装",
    "en": "Plugin installed"
  },
  "PluginSettings.installationSource": {
    "zh": "安装来源",
    "en": "Installation source"
  },
  "PluginSettings.localDirectoryOrZip": {
    "zh": "本地目录或 ZIP",
    "en": "Local directory or ZIP"
  },
  "PluginSettings.pluginPath": {
    "zh": "插件路径",
    "en": "Plugin path"
  },
  "PluginSettings.githubRepository": {
    "zh": "GitHub 仓库",
    "en": "GitHub repository"
  },
  "PluginSettings.fullPathToPluginDirectoryOrZip": {
    "zh": "插件目录或 ZIP 的完整路径",
    "en": "Full path to plugin directory or ZIP"
  },
  "PluginSettings.chooseDirectory": {
    "zh": "选择目录",
    "en": "Choose directory"
  },
  "PluginSettings.chooseZip": {
    "zh": "选择 ZIP",
    "en": "Choose ZIP"
  },
  "PluginSettings.releaseTagOptional": {
    "zh": "Release 标签（可选）",
    "en": "Release tag (optional)"
  },
  "PluginSettings.leaveEmptyForTheLatestStableRelease": {
    "zh": "留空使用最新正式版",
    "en": "Leave empty for the latest stable release"
  },
  "PluginSettings.zipAssetNameOptional": {
    "zh": "ZIP 附件名称（可选）",
    "en": "ZIP asset name (optional)"
  },
  "PluginSettings.specifyIfTheReleaseHasMultipleZipFiles": {
    "zh": "有多个 ZIP 时填写",
    "en": "Specify if the release has multiple ZIP files"
  },
  "PluginSettings.pluginsRunLocalCodeAndReceiveCredentialsFor": {
    "zh": "插件会运行本机代码，并接收对应来源的登录凭据。请只安装你信任的插件。",
    "en": "Plugins run local code and receive credentials for their sources. Install only plugins you trust."
  },
  "PluginSettings.iTrustThisPluginAndItsSource": {
    "zh": "{value1}我信任这个插件及其来源",
    "en": "{value1}I trust this plugin and its source"
  },
  "PluginSettings.processing": {
    "zh": "正在处理…",
    "en": "Processing…"
  },
  "PluginSettings.installPlugin": {
    "zh": "安装插件",
    "en": "Install plugin"
  },
  "PluginSettings.loadingPlugins": {
    "zh": "正在读取插件…",
    "en": "Loading plugins…"
  },
  "PluginSettings.noPluginsInstalledYet": {
    "zh": "还没有安装插件。",
    "en": "No plugins installed yet."
  },
  "PluginSettings.failedToStart": {
    "zh": "启动失败",
    "en": "Failed to start"
  },
  "PluginSettings.enabled": {
    "zh": "已启用",
    "en": "Enabled"
  },
  "PluginSettings.disabled": {
    "zh": "已停用",
    "en": "Disabled"
  },
  "PluginSettings.bundledWithAntumi": {
    "zh": "旧版随 Antumi 安装",
    "en": "Installed by an earlier Antumi version"
  },
  "PluginSettings.pluginEnabled": {
    "zh": "插件已启用",
    "en": "Plugin enabled"
  },
  "PluginSettings.pluginDisabled": {
    "zh": "插件已停用",
    "en": "Plugin disabled"
  },
  "PluginSettings.checkAndUpdate": {
    "zh": "检查并更新",
    "en": "Check and update"
  },
  "PluginSettings.checkedAndAppliedAvailableUpdates": {
    "zh": "已检查并应用可用更新",
    "en": "Checked and applied available updates"
  },
  "PluginSettings.retryLoading": {
    "zh": "重试加载",
    "en": "Retry loading"
  },
  "PluginSettings.pluginReloaded": {
    "zh": "插件已重新加载",
    "en": "Plugin reloaded"
  },
  "PluginSettings.switchVersion": {
    "zh": "{value1} 切换版本",
    "en": "{value1} Switch version"
  },
  "PluginSettings.chooseVersion": {
    "zh": "选择版本",
    "en": "Choose version"
  },
  "PluginSettings.current": {
    "zh": "（当前）",
    "en": "(Current)"
  },
  "PluginSettings.pluginVersionSwitched": {
    "zh": "插件版本已切换",
    "en": "Plugin version switched"
  },
  "PluginSettings.uninstall": {
    "zh": "卸载",
    "en": "Uninstall"
  },
  "PluginSettings.sourceSettingsCredentialsAndImportedTasksAreKept": {
    "zh": "卸载后保留来源配置、凭据和已导入任务。",
    "en": "Source settings, credentials, and imported tasks are kept after uninstalling."
  },
  "PluginSettings.confirmUninstall": {
    "zh": "确认卸载",
    "en": "Confirm uninstall"
  },
  "PluginSettings.pluginUninstalled": {
    "zh": "插件已卸载",
    "en": "Plugin uninstalled"
  },
  "PortsPanel.listening": {
    "zh": "监听中",
    "en": "Listening"
  },
  "PortsPanel.openPage": {
    "zh": "{value1}打开页面",
    "en": "{value1}Open page"
  },
  "PortsPanel.terminal": {
    "zh": "{value1}终端",
    "en": "{value1}Terminal"
  },
  "PortsPanel.thisIsAnAgentProcessAndCannotBe": {
    "zh": "这是 Agent 的进程，不能从端口面板停止",
    "en": "This is an Agent process and cannot be stopped from the ports panel"
  },
  "PortsPanel.stopServiceOnPort": {
    "zh": "停止端口 {value1} 的服务",
    "en": "Stop service on port {value1}"
  },
  "PortsPanel.stop": {
    "zh": "停止 {value1} :{value2}？",
    "en": "Stop {value1} :{value2}?"
  },
  "PortsPanel.service": {
    "zh": "服务",
    "en": "Service"
  },
  "PortsPanel.theTerminalTabWillBeKept": {
    "zh": "终端标签保留。",
    "en": "The terminal tab will be kept."
  },
  "PortsPanel.stopService": {
    "zh": "停止服务",
    "en": "Stop service"
  },
  "PortsPanel.ports": {
    "zh": "端口",
    "en": "Ports"
  },
  "PortsPanel.port": {
    "zh": "{value1}端口 {value2}",
    "en": "{value1}Port {value2}"
  },
  "PortsPanel.hidePorts": {
    "zh": "隐藏端口",
    "en": "Hide ports"
  },
  "PortsPanel.portScope": {
    "zh": "端口范围",
    "en": "Port scope"
  },
  "PortsPanel.allTasksAndConversations": {
    "zh": "全部任务与会话",
    "en": "All tasks and conversations"
  },
  "PortsPanel.currentTask": {
    "zh": "当前任务",
    "en": "Current task"
  },
  "PortsPanel.currentConversation": {
    "zh": "当前会话",
    "en": "Current conversation"
  },
  "PortsPanel.discovering": {
    "zh": "正在发现…",
    "en": "Discovering…"
  },
  "PortsPanel.updatesEvery2Seconds": {
    "zh": "每 2 秒更新",
    "en": "Updates every 2 seconds"
  },
  "PortsPanel.findingListeningPorts": {
    "zh": "正在查找监听端口…",
    "en": "Finding listening ports…"
  },
  "PortsPanel.noListeningPortsFoundStartADevelopmentService": {
    "zh": "没有发现监听端口。可在 Antumi 终端中启动开发服务。",
    "en": "No listening ports found. Start a development service in Antumi's terminal."
  },
  "PortsPanel.listeningPortsGroups": {
    "zh": "{value1} 个监听端口 · {value2} 个分组",
    "en": "{value1} listening ports · {value2} {value2, plural, one {group} other {groups}}"
  },
  "ProjectConfigDialog.copyFiles": {
    "zh": "复制 {value1} 个文件",
    "en": "Copy {value1} {value1, plural, one {file} other {files}}"
  },
  "ProjectConfigDialog.filesToCopy": {
    "zh": "复制的文件",
    "en": "Files to copy"
  },
  "ProjectConfigDialog.projectTypeNotRecognizedUseTheExamplesIn": {
    "zh": "没认出项目类型，可以参考输入框里的示例自己填。",
    "en": "Project type not recognized. Use the examples in the fields as a guide."
  },
  "ProjectConfigDialog.allFieldsAlreadyHaveValuesNothingChangedClear": {
    "zh": "要填的项都已有内容，没有改动；清空某一项再点，可以换成建议的命令。",
    "en": "All fields already have values; nothing changed. Clear a field to replace it with a suggested command."
  },
  "ProjectConfigDialog.basedOn": {
    "zh": "按 {value1} ",
    "en": "Based on {value1} "
  },
  "ProjectConfigDialog.filledReviewTheCommandsBeforeSaving": {
    "zh": "{by}填入了{value2}，保存前看一眼命令对不对。",
    "en": "{by}filled {value2}. Review the commands before saving."
  },
  "ProjectConfigDialog.projectConfiguration": {
    "zh": "项目配置",
    "en": "Project configuration"
  },
  "ProjectConfigDialog.inspectingProject": {
    "zh": "正在看项目…",
    "en": "Inspecting project…"
  },
  "ProjectConfigDialog.suggestFromProject": {
    "zh": "按项目填入建议",
    "en": "Suggest from project"
  },
  "ProjectConfigDialog.cannotReadExistingFileSavingOverwritesItWith": {
    "zh": "现有文件读不了：{value1}。保存会用下面填的内容覆盖它。",
    "en": "Cannot read existing file: {value1}. Saving overwrites it with the contents below."
  },
  "ProjectConfigDialog.filesToCopyIntoANewWorktree": {
    "zh": "新建 worktree 时复制的文件 {value1}",
    "en": "Files to copy into a new worktree {value1}"
  },
  "ProjectConfigDialog.onePerLineRelativeToProjectRootE": {
    "zh": "· 每行一个，相对项目根目录，如 .env",
    "en": "· One per line, relative to project root, e.g. .env"
  },
  "ProjectConfigDialog.setupRunOnceAfterCreatingAWorktree": {
    "zh": "setup · 新建 worktree 后运行一次 {value1}",
    "en": "setup · Run once after creating a worktree {value1}"
  },
  "ProjectConfigDialog.forExampleInstallDependencies": {
    "zh": "· 如安装依赖",
    "en": "· For example, install dependencies"
  },
  "ProjectConfigDialog.checkRunBeforeSubmittingATaskForReview": {
    "zh": "check · 任务提交验收前运行 {value1}",
    "en": "check · Run before submitting a task for review {value1}"
  },
  "ProjectConfigDialog.onFailureKeepRunningAndSendOutputTo": {
    "zh": "· 不通过就留在执行中，输出交给 Agent 修",
    "en": "· On failure, keep running and send output to Agent to fix"
  },
  "ProjectConfigDialog.commandsRunInYourLoginShellAtThe": {
    "zh": "命令由你的登录 shell 在 worktree 根目录运行，可用 $ANTUMI_ROOT_PATH（项目）和 $ANTUMI_WORKTREE_PATH。文件保存在项目里，建议提交到 Git，同项目的人用 Antumi 也会生效；都清空则删除这个文件。",
    "en": "Commands run in your login shell at the worktree root. $ANTUMI_ROOT_PATH (project) and $ANTUMI_WORKTREE_PATH are available. Configuration is saved in the project; commit it to share with teammates using Antumi. Clearing all fields deletes this file."
  },
  "ProjectPicker.noProject": {
    "zh": "无项目",
    "en": "No project"
  },
  "ProjectPicker.absoluteProjectPathEGIdeaprojectsApp": {
    "zh": "项目的绝对路径，如 ~/IdeaProjects/app",
    "en": "Absolute project path, e.g. ~/IdeaProjects/app"
  },
  "ProjectPicker.projectPath": {
    "zh": "项目路径",
    "en": "Project path"
  },
  "ProjectPicker.add": {
    "zh": "添加",
    "en": "Add"
  },
  "ProjectPicker.addProject": {
    "zh": "添加项目",
    "en": "Add project"
  },
  "ProjectPicker.recent": {
    "zh": "最近使用",
    "en": "Recent"
  },
  "ProjectPicker.removeFromRecentProjectsExistingTasksAndConversations": {
    "zh": "从最近使用中移除（不影响已有任务或会话）",
    "en": "Remove from recent projects (existing tasks and conversations are unaffected)"
  },
  "ProjectPicker.removeFromRecentProjects": {
    "zh": "从最近使用中移除 {value1}",
    "en": "Remove {value1} from recent projects"
  },
  "ProjectPicker.primaryProject": {
    "zh": "主项目：{value1}",
    "en": "Primary project: {value1}"
  },
  "ProjectPicker.rightClickToMakePrimary": {
    "zh": "右键可设为主项目",
    "en": "Right-click to make primary"
  },
  "ProjectPicker.primaryProjectIsFixedAfterTheConversationStarts": {
    "zh": "对话开始后不能更换主项目",
    "en": "Primary project is fixed after the conversation starts"
  },
  "ProjectPicker.primaryProject_1427": {
    "zh": "（主项目）",
    "en": "(Primary project)"
  },
  "ProjectPicker.removeProjectKeepsDirectoryAndExistingWorktrees": {
    "zh": "移除项目（不会删除目录或已有 worktree）",
    "en": "Remove project (keeps directory and existing worktrees)"
  },
  "ProjectPicker.remove": {
    "zh": "移除 {value1}",
    "en": "Remove {value1}"
  },
  "ProjectPicker.makePrimaryProject": {
    "zh": "设为主项目",
    "en": "Make primary project"
  },
  "ProjectPicker.noProject_1431": {
    "zh": "{value1}无项目",
    "en": "{value1}No project"
  },
  "ProjectPicker.addProject_1432": {
    "zh": "＋ 添加项目",
    "en": "＋ Add project"
  },
  "ProjectPicker.notSet": {
    "zh": "未设置",
    "en": "Not set"
  },
  "ProjectRunNotice.runningProjectSetupAgentStartsAfterward": {
    "zh": "正在运行项目的 setup，完成后 Agent 才开始",
    "en": "Running project setup; Agent starts afterward"
  },
  "ProjectRunNotice.runningProjectChecksSubmittingForReviewAfterThey": {
    "zh": "正在运行项目的检查，通过后提交验收",
    "en": "Running project checks; submitting for review after they pass"
  },
  "ProjectTrustDialog.runAfterCreatingAWorktree": {
    "zh": "新建 worktree 后运行",
    "en": "Run after creating a worktree"
  },
  "ProjectTrustDialog.runBeforeSubmittingForReview": {
    "zh": "提交验收前运行",
    "en": "Run before submitting for review"
  },
  "ProjectTrustDialog.runCommandsFromProjectConfiguration": {
    "zh": "运行项目配置的命令？",
    "en": "Run commands from project configuration?"
  },
  "ProjectTrustDialog.filesCopiedToTheNewWorktree": {
    "zh": "复制到新 worktree 的文件",
    "en": "Files copied to the new worktree"
  },
  "ProjectTrustDialog.commandsRunInYourLoginShellInsideThe": {
    "zh": "命令由你的登录 shell 在 worktree 中运行，和你在终端里运行一样。命令改动后会再问一次。",
    "en": "Commands run in your login shell inside the worktree, just like in your terminal. You will be asked again if the commands change."
  },
  "ProjectTrustDialog.allowAndContinue": {
    "zh": "允许并继续",
    "en": "Allow and continue"
  },
  "RequestPopup.openInAntumi": {
    "zh": "在 Antumi 中打开",
    "en": "Open in Antumi"
  },
  "RequestPopup.collapseShowAgainForNewRequests": {
    "zh": "收起，有新的请求再弹出",
    "en": "Collapse; show again for new requests"
  },
  "RoutineEditor.daily": {
    "zh": "每天",
    "en": "Daily"
  },
  "RoutineEditor.weekdays": {
    "zh": "工作日",
    "en": "Weekdays"
  },
  "RoutineEditor.weekly": {
    "zh": "每周",
    "en": "Weekly"
  },
  "RoutineEditor.hourly": {
    "zh": "每小时",
    "en": "Hourly"
  },
  "RoutineEditor.manual": {
    "zh": "手动",
    "en": "Manual"
  },
  "RoutineEditor.editRoutine": {
    "zh": "编辑定时任务",
    "en": "Edit routine"
  },
  "RoutineEditor.newRoutine": {
    "zh": "新建定时任务",
    "en": "New routine"
  },
  "RoutineEditor.name": {
    "zh": "名称 {value1}",
    "en": "Name {value1}"
  },
  "RoutineEditor.useTheFirstInstructionLineIfEmpty": {
    "zh": "[留空则取指令的第一行]",
    "en": "[Use the first instruction line if empty]"
  },
  "RoutineEditor.forExampleDailyCodeReview": {
    "zh": "比如：每日代码审查",
    "en": "For example: Daily code review"
  },
  "RoutineEditor.whatAgentShouldDoEachRun": {
    "zh": "每次运行时让 Agent 做什么",
    "en": "What Agent should do each run"
  },
  "RoutineEditor.writeInstructionsAsInChatEachScheduledRun": {
    "zh": "像在聊天里一样写指令。到点会新开一个会话，把这段话发给 Agent，无人值守地做完。",
    "en": "Write instructions as in chat. Each scheduled run opens a new conversation and completes them unattended."
  },
  "RoutineEditor.useAnAgentWithAvailableQuotaWhenDue": {
    "zh": "到点时用有额度的那个",
    "en": "Use an Agent with available quota when due"
  },
  "RoutineEditor.useWhicheverAgentHasAvailableQuotaWhenDue": {
    "zh": "到点时用有额度的那个 Agent。",
    "en": "Use whichever Agent has available quota when due."
  },
  "RoutineEditor.when": {
    "zh": "什么时候",
    "en": "When"
  },
  "RoutineEditor.time": {
    "zh": "时间",
    "en": "Time"
  },
  "RoutineEditor.weekday": {
    "zh": "星期",
    "en": "Weekday"
  },
  "RoutineEditor.everyHoursStartingAtMidnight": {
    "zh": "每{value1}小时，从 0 点起算",
    "en": "Every {value1} {value1, plural, one {hour} other {hours}}, starting at midnight"
  },
  "RoutineEditor.runsOnlyWhenYouClickRunNow": {
    "zh": "只在你点「立即运行」时运行。",
    "en": "Runs only when you click “Run now”."
  },
  "RoutineEditor.chooseAWeekday": {
    "zh": "选一个星期几。",
    "en": "Choose a weekday."
  },
  "RoutineEditor.next": {
    "zh": "下次：{value1}",
    "en": "Next: {value1}"
  },
  "RoutineEditor.runsUnattendedInModeNothingRunsWhileThe": {
    "zh": "以「{value1}」无人值守运行，{value2}。电脑睡着时到点不会运行，醒来后只补最近错过的一次。",
    "en": "Runs unattended in “{value1}” mode, {value2}. Nothing runs while the computer sleeps; only the latest missed run is made up after waking."
  },
  "RoutineEditor.create": {
    "zh": "创建",
    "en": "Create"
  },
  "RoutinesEntry.scheduled": {
    "zh": "定时",
    "en": "Routines"
  },
  "RoutinesEntry.unreadRuns": {
    "zh": "{unread} 次运行未看",
    "en": "{unread} unread runs"
  },
  "RoutinesEntry.schedulesFailedToStart": {
    "zh": "{failed} 个预约没能开始",
    "en": "{failed} {failed, plural, one {schedule} other {schedules}} failed to start"
  },
  "RoutinesSection.noRunsYet": {
    "zh": "还没有运行过。",
    "en": "No runs yet."
  },
  "RoutinesSection.read": {
    "zh": "已读",
    "en": "Read"
  },
  "RoutinesSection.earlier": {
    "zh": "更早的",
    "en": "Earlier"
  },
  "RoutinesSection.collapseHistory": {
    "zh": "收起历史",
    "en": "Collapse history"
  },
  "RoutinesSection.expandHistory": {
    "zh": "展开历史",
    "en": "Expand history"
  },
  "RoutinesSection.unreadRuns": {
    "zh": "{value1} 次运行未看",
    "en": "{value1} unread runs"
  },
  "RoutinesSection.last": {
    "zh": " · 上次：{value1}",
    "en": " · Last: {value1}"
  },
  "RoutinesSection.conversationsCreatedByThisRoutineReturnToThe": {
    "zh": "删除后它开过的会话回到会话列表",
    "en": "Conversations created by this routine return to the conversation list after deletion"
  },
  "RoutinesSection.markAllAsRead": {
    "zh": "全部已读",
    "en": "Mark all as read"
  },
  "RoutinesSection.enable": {
    "zh": "启用",
    "en": "Enable"
  },
  "RoutinesSection.runImmediatelyIgnoringTimeAndQuota": {
    "zh": "立即运行，不等时间和额度",
    "en": "Run immediately, ignoring time and quota"
  },
  "RoutinesSection.templates": {
    "zh": "模板",
    "en": "Templates"
  },
  "RoutinesSection.useThis": {
    "zh": "用这个",
    "en": "Use this"
  },
  "RoutinesSection.mine": {
    "zh": "我的",
    "en": "Mine"
  },
  "RoutinesSection.routineList": {
    "zh": "定时任务列表",
    "en": "Routine list"
  },
  "RoutinesSection.mine_1485": {
    "zh": "我的 · {value1}",
    "en": "Mine · {value1}"
  },
  "RoutinesSection.show": {
    "zh": "显示",
    "en": "Show"
  },
  "RoutinesSection.noRoutinesYetClickNewToSetRecurring": {
    "zh": "还没有定时任务。点「新建定时」写下要重复做的事和什么时候做，或者从「模板」里挑一个。",
    "en": "No routines yet. Click “New routine” to set recurring instructions and timing, or choose a template."
  },
  "RoutinesView.repeatingTasksEachRunOpensANewConversation": {
    "zh": "到点新开一个会话，以「{value1}」无人值守地做完（{value2}）；结果在每条规则的历史里看，不进左侧会话列表。",
    "en": "Each run opens a new conversation that works unattended in “{value1}” mode ({value2}); see results in each routine's history, not the sidebar."
  },
  "RoutinesView.nothingRunsWhileTheComputerSleepsOnlyThe": {
    "zh": "电脑睡着时到点不会运行，醒来后只补最近错过的一次。{value1}",
    "en": "Nothing runs while the computer sleeps; only the latest missed run is made up after waking.{value1}"
  },
  "RoutinesView.switchToAlwaysAwake": {
    "zh": "改为始终保持唤醒",
    "en": "Switch to always awake"
  },
  "RoutinesView.scheduledPageContent": {
    "zh": "定时页的内容",
    "en": "Routines page content"
  },
  "RoutinesView.newRoutine": {
    "zh": "新建定时",
    "en": "New routine"
  },
  "RoutinesSection.blankHint": {
    "zh": "自己写要做的事和什么时候做",
    "en": "Write what to do and when"
  },
  "SchedulePicker.waitsIfQuotaOrRunSlotsAreUnavailable": {
    "zh": "额度不足或运行位置已满时会等待；同一个 Agent 的预约一个接一个运行；电脑睡着时不会运行。",
    "en": "Waits if quota or run slots are unavailable. Schedules for the same Agent run sequentially. Nothing runs while the computer sleeps."
  },
  "SchedulePicker.changeInSettings": {
    "zh": "在设置里改",
    "en": "Change in settings"
  },
  "SchedulePicker.whenQuotaResets": {
    "zh": "额度恢复后",
    "en": "When quota resets"
  },
  "SchedulePicker.atASpecificTime": {
    "zh": "指定时间",
    "en": "At a specific time"
  },
  "SchedulePicker.notBefore": {
    "zh": "不早于",
    "en": "Not before"
  },
  "SchedulePicker.runsUnattendedInMode": {
    "zh": "以「{value1}」无人值守运行 · {value2}{value3}",
    "en": "Runs unattended in “{value1}” mode · {value2}{value3}"
  },
  "SchedulesPanel.changeTime": {
    "zh": "改时间",
    "en": "Change time"
  },
  "SchedulesPanel.moveEarlier": {
    "zh": "提前",
    "en": "Move earlier"
  },
  "SchedulesPanel.moveLater": {
    "zh": "推后",
    "en": "Move later"
  },
  "SchedulesPanel.startNow": {
    "zh": "现在开始",
    "en": "Start now"
  },
  "SchedulesPanel.startNowIgnoringTimeAndQuota": {
    "zh": "现在开始，不等时间和额度",
    "en": "Start now, ignoring time and quota"
  },
  "SchedulesPanel.runASpecifiedTaskOrConversationOnceStarts": {
    "zh": "任务或会话到点、额度够时跑一次，同一个 agent 的按下面的顺序一个接一个运行，以「{value1}」无人值守（{value2}）。",
    "en": "A task or conversation runs once when due and its agent has quota, one agent's in the order below, unattended in “{value1}” mode ({value2})."
  },
  "SchedulesPanel.keepComputerAwakeIsOffSchedulesWillNot": {
    "zh": "「保持电脑唤醒」已关闭，电脑睡着时预约不会运行。{value1}",
    "en": "“Keep computer awake” is off. Schedules will not run while it sleeps.{value1}"
  },
  "SchedulesPanel.keepAwakeWhenSchedulesArePending": {
    "zh": "改为有预约时保持唤醒",
    "en": "Keep awake when schedules are pending"
  },
  "SchedulesPanel.waiting": {
    "zh": "等待中",
    "en": "Waiting"
  },
  "SchedulesPanel.waiting_1507": {
    "zh": "等待中 · {value1}",
    "en": "Waiting · {value1}"
  },
  "SchedulesPanel.noWaitingSchedulesUseTheClockIconIn": {
    "zh": "没有等待中的预约。在任务的工具栏或聊天输入框旁点时钟图标预约。",
    "en": "No waiting schedules. Use the clock icon in a task toolbar or beside the chat composer."
  },
  "SchedulesPanel.recent": {
    "zh": "最近",
    "en": "Recent"
  },
  "SchedulesPanel.recent_1510": {
    "zh": "最近 · {value1}{value2}",
    "en": "Recent · {value1}{value2}"
  },
  "SchedulesPanel.clearHistory": {
    "zh": "清除记录",
    "en": "Clear history"
  },
  "SelectionComment.commentOnThisPassage": {
    "zh": "评论这段…",
    "en": "Comment on this passage…"
  },
  "SelectionComment.commentOnThisPassageEnterToAddQuote": {
    "zh": "评论这段，回车加入引用",
    "en": "Comment on this passage; Enter to add quote"
  },
  "SelectionComment.addQuote": {
    "zh": "加入引用",
    "en": "Add quote"
  },
  "SelectionComment.addQuoteEnter": {
    "zh": "加入引用（Enter）",
    "en": "Add quote (Enter)"
  },
  "SelectionComment.selectedText": {
    "zh": "所选文字",
    "en": "Selected text"
  },
  "SessionTerminal.2mProcessExitedCode0m": {
    "zh": "\r\n\u001b[2m[进程已退出，code {value1}]\u001b[0m\r\n",
    "en": "\r\n\u001b[2m[Process exited, code {value1}]\u001b[0m\r\n"
  },
  "SessionTerminal.2mSessionEnded0m": {
    "zh": "\r\n\u001b[2m[会话已结束]\u001b[0m\r\n",
    "en": "\r\n\u001b[2m[Session ended]\u001b[0m\r\n"
  },
  "SessionTerminal.cannotConnectToSession": {
    "zh": "\r\n[无法连接会话：{value1}]\r\n",
    "en": "\r\n[Cannot connect to session: {value1}]\r\n"
  },
  "SettingsControls.decrease": {
    "zh": "减小",
    "en": "Decrease"
  },
  "SettingsControls.increase": {
    "zh": "增大",
    "en": "Increase"
  },
  "SettingsControls.resetToDefault": {
    "zh": "{label}恢复默认",
    "en": "Reset {label} to default"
  },
  "SettingsControls.resetToDefault_1523": {
    "zh": "恢复默认",
    "en": "Reset to default"
  },
  "SettingsPage.colors": {
    "zh": "颜色",
    "en": "Colors"
  },
  "SettingsPage.withSystemSelectedFollowsTheSystemSLight": {
    "zh": "跟随系统时，随系统的浅色、深色设置切换。",
    "en": "With system selected, follows the system's light or dark setting."
  },
  "SettingsPage.system": {
    "zh": "跟随系统",
    "en": "System"
  },
  "SettingsPage.light": {
    "zh": "浅色",
    "en": "Light"
  },
  "SettingsPage.dark": {
    "zh": "深色",
    "en": "Dark"
  },
  "SettingsPage.palette": {
    "zh": "配色",
    "en": "Palette"
  },
  "SettingsPage.colorsForTheEntireInterfaceWithLightAnd": {
    "zh": "整套界面颜色，随主题切换浅色或深色；色卡左浅右深。",
    "en": "Colors for the entire interface, with light and dark variants. Swatches show light on the left, dark on the right."
  },
  "SettingsPage.gradientBackgroundExperimental": {
    "zh": "渐变背景（实验）",
    "en": "Gradient background (experimental)"
  },
  "SettingsPage.aGradientBehindTheSidebarAndWindowEdges": {
    "zh": "侧边栏和窗口四周铺一层渐变，内容区浮在上面。取自 Slack 的主题，和配色分开选，左浅右深。",
    "en": "A gradient behind the sidebar and window edges, with content above it. From Slack themes, independent of palette; light on the left, dark on the right."
  },
  "SettingsPage.chat": {
    "zh": "聊天",
    "en": "Chat"
  },
  "SettingsPage.fontSize": {
    "zh": "字号",
    "en": "Font size"
  },
  "SettingsPage.textSizeForMessagesWorkDetailsAndComposer": {
    "zh": "消息、过程信息和输入框的文字大小。",
    "en": "Text size for messages, work details, and composer."
  },
  "SettingsPage.chatFontSize": {
    "zh": "聊天字号",
    "en": "Chat font size"
  },
  "SettingsPage.font": {
    "zh": "字体",
    "en": "Font"
  },
  "SettingsPage.serifChangesProseOnlyLeavingCodeUnchanged": {
    "zh": "衬线只改正文，代码不变。",
    "en": "Serif changes prose only, leaving code unchanged."
  },
  "SettingsPage.chineseFont": {
    "zh": "中文字体",
    "en": "Chinese font"
  },
  "SettingsPage.chineseTextInChatUsesThisFontEnglish": {
    "zh": "聊天里的中文用它显示，英文仍用上面的字体。默认是苹方，选衬线时是宋体。",
    "en": "Chinese text in chat uses this font; English keeps the font above. Defaults to PingFang, or Songti with serif."
  },
  "SettingsPage.chooseChineseChatFont": {
    "zh": "选择聊天的中文字体",
    "en": "Choose Chinese chat font"
  },
  "SettingsPage.pageWidth": {
    "zh": "页面宽度",
    "en": "Page width"
  },
  "SettingsPage.maximumMessageAndComposerWidthNarrow800pxMedium": {
    "zh": "消息和输入框的最大宽度：窄 800px，中等 1200px。",
    "en": "Maximum message and composer width: narrow 800px, medium 1200px."
  },
  "SettingsPage.narrow": {
    "zh": "窄",
    "en": "Narrow"
  },
  "SettingsPage.medium": {
    "zh": "中等",
    "en": "Medium"
  },
  "SettingsPage.fullWidth": {
    "zh": "全宽",
    "en": "Full width"
  },
  "SettingsPage.foldCompletedTurns": {
    "zh": "折叠做完的回合",
    "en": "Fold completed turns"
  },
  "SettingsPage.foldReasoningCommandsAndInterimRepliesUnderWorked": {
    "zh": "把思考、命令和中间回复收进「工作了 N 秒」，只留最终回答，点开可看。",
    "en": "Fold reasoning, commands, and interim replies under “Worked for N seconds”, leaving the final answer visible. Click to expand."
  },
  "SettingsPage.terminalAndCode": {
    "zh": "终端与代码",
    "en": "Terminal and code"
  },
  "SettingsPage.codeFont": {
    "zh": "代码字体",
    "en": "Code font"
  },
  "SettingsPage.fontForTerminalsCodeBlocksChangesAndFile": {
    "zh": "终端、代码块、改动和文件预览的字体。默认 Geist Mono，也可选本机等宽字体。",
    "en": "Font for terminals, code blocks, changes, and file previews. Defaults to Geist Mono; installed monospace fonts are also available."
  },
  "SettingsPage.chineseCodeFont": {
    "zh": "代码中文字体",
    "en": "Chinese code font"
  },
  "SettingsPage.fallbackForChineseInTerminalsCodeAndPreviews": {
    "zh": "终端、代码和文件预览里的中文用它显示，代码字体里没有中文时才用到。默认是苹方。",
    "en": "Fallback for Chinese in terminals, code, and previews when the code font lacks Chinese glyphs. Defaults to PingFang."
  },
  "SettingsPage.chooseChineseCodeFont": {
    "zh": "选择代码的中文字体",
    "en": "Choose Chinese code font"
  },
  "SettingsPage.terminalFontSize": {
    "zh": "终端字号",
    "en": "Terminal font size"
  },
  "SettingsPage.appliesImmediatelyToOpenTerminals": {
    "zh": "对已打开的终端立即生效。",
    "en": "Applies immediately to open terminals."
  },
  "SettingsPage.terminalLineHeight": {
    "zh": "终端行高",
    "en": "Terminal line height"
  },
  "SettingsPage.multiplierOfTheFontSOwnLineHeight": {
    "zh": "字体自身行高的倍数。Geist Mono 用 1.0 即可，Menlo 这类行距紧的字体可调大。",
    "en": "Multiplier of the font's own line height. Use 1.0 for Geist Mono; increase for tighter fonts such as Menlo."
  },
  "SettingsPage.coloredPrompt": {
    "zh": "彩色提示符",
    "en": "Colored prompt"
  },
  "SettingsPage.forZshWithoutACustomPromptUseColors": {
    "zh": "zsh 未自定义提示符时，换成带颜色和 git 分支的提示符，命令失败时 % 变红。只影响 Antumi 新开的终端，不改 ~/.zshrc。",
    "en": "For zsh without a custom prompt, use colors and Git branch information, with a red % after command failures. Affects new Antumi terminals only; does not edit ~/.zshrc."
  },
  "SettingsPage.systemNotifications": {
    "zh": "系统通知",
    "en": "System notifications"
  },
  "SettingsPage.whenTheWindowIsInTheBackgroundNotify": {
    "zh": "窗口不在前台时，Agent 等你确认、做完一轮、异常退出或定时任务完成时通知你，点击回到对应会话。",
    "en": "When the window is in the background, notify you when Agent needs approval, finishes a turn, exits unexpectedly, or a routine finishes. Click to open the conversation."
  },
  "SettingsPage.showPendingRequestsAtTheTopOfThe": {
    "zh": "离开时在屏幕顶部弹出待处理的请求",
    "en": "Show pending requests at the top of the screen when away"
  },
  "SettingsPage.whileUsingAnotherAppApprovalRequestsAppearAs": {
    "zh": "在别的应用里时，待确认的请求以卡片弹出，可直接选择，不抢焦点；这类请求不再另发系统通知。",
    "en": "While using another app, approval requests appear as cards you can answer without stealing focus. These requests do not also trigger system notifications."
  },
  "SettingsPage.automatic": {
    "zh": "自动（{cheapestLabel}）",
    "en": "Automatic ({cheapestLabel})"
  },
  "SettingsPage.cheapestSmallModel": {
    "zh": "最便宜的小模型",
    "en": "Cheapest small model"
  },
  "SettingsPage.unavailableUsingAutomatic": {
    "zh": "{picked}（已下线，改用自动：{cheapestLabel}）",
    "en": "{picked} (unavailable; using automatic: {cheapestLabel})"
  },
  "SettingsPage.modelForQuickTasks": {
    "zh": "{value1} 做轻量任务用的模型",
    "en": "Model for {value1} quick tasks"
  },
  "SettingsPage.automatic_1569": {
    "zh": "自动",
    "en": "Automatic"
  },
  "SettingsPage.theConnectedCoreIsTooOldToTranslate": {
    "zh": "正在连接的 core 版本较旧，还不能翻译；更新后可用。",
    "en": "The connected core is too old to translate. Update it to enable this feature."
  },
  "SettingsPage.translateTo": {
    "zh": "翻译成",
    "en": "Translate to"
  },
  "SettingsPage.aTranslateButtonAppearsWhenAReplyIs": {
    "zh": "回复不是这种语言时，会出现「翻译」按钮。",
    "en": "A “Translate” button appears when a reply is in another language."
  },
  "SettingsPage.autoTranslate": {
    "zh": "自动翻译",
    "en": "Auto-translate"
  },
  "SettingsPage.translateOnlyRepliesVisibleOnScreenClickOriginal": {
    "zh": "只翻译显示在屏幕上的回复，点「原文」查看原文。",
    "en": "Translate only replies visible on screen. Click “Original” to see the source."
  },
  "SettingsPage.usesTheConversationSAgentChooseTheModel": {
    "zh": "由会话所用的 Agent 翻译，模型在 设置 → 会话 →「轻量任务用的模型」里选。翻译单独请求，不占会话上下文，但计入该 Agent 的用量；同一条回复只翻一次。",
    "en": "Uses the conversation's Agent. Choose the model in Settings → Conversations → “Model for quick tasks”. Translation is a separate request and uses no conversation context, but counts toward the Agent's usage. Each reply is translated only once."
  },
  "SettingsPage.showUsageQuotaInStatusBar": {
    "zh": "显示使用情况",
    "en": "Show usage"
  },
  "SettingsPage.subscriptionQuotaWindowsForEachAgentSuchAs": {
    "zh": "选择在底部状态栏显示用量的 Agent，关闭总开关可全部隐藏。",
    "en": "Choose which Agents show usage in the bottom status bar. Turn off the main switch to hide them all."
  },
  "SettingsPage.percentageDisplay": {
    "zh": "百分比显示",
    "en": "Percentage display"
  },
  "SettingsPage.changesTheDisplayedNumberOnlyLowQuotaWarning": {
    "zh": "只改显示的数字，不影响快用完时的颜色提醒。",
    "en": "Changes the displayed number only; low-quota warning colors stay the same."
  },
  "SettingsPage.used": {
    "zh": "已用",
    "en": "Used"
  },
  "SettingsPage.remaining": {
    "zh": "剩余",
    "en": "Remaining"
  },
  "SettingsPage.quotaAdviceAndAlerts": {
    "zh": "额度建议与提醒",
    "en": "Quota advice and alerts"
  },
  "SettingsPage.estimateUsagePaceAgainstResetTimesShowAdvice": {
    "zh": "按各窗口的重置时间估算用量节奏：用量卡片里给出建议，选 Agent 时标出现在最该用的那个；额度快重置还剩很多、或照现在的速度会提前用完时，发一次系统通知。",
    "en": "Estimate usage pace against reset times: show advice in usage cards and recommend which Agent to use now. Notify once when substantial quota may expire unused or usage is likely to run out early."
  },
  "SettingsPage.showServiceWideResetAnnouncements": {
    "zh": "显示全员重置预告",
    "en": "Show service-wide reset announcements"
  },
  "SettingsPage.showUpcomingAndRecentResetsWhenServicesSuch": {
    "zh": "OpenAI 等在 X 上宣布给所有人重置额度时，在用量卡片里显示预告和最近一次重置。由社区网站 LimitReset 汇总，每小时问一次，请求不带你的账号信息。",
    "en": "Show upcoming and recent resets when services such as OpenAI announce them on X. Aggregated by the community site LimitReset and checked hourly, without sending account information."
  },
  "SettingsPage.checking": {
    "zh": "正在询问…",
    "en": "Checking…"
  },
  "SettingsPage.notConnectedTheBrowserRunsInTheAntumi": {
    "zh": "没有连上：浏览器在 Antumi 应用里运行",
    "en": "Not connected: the browser runs in the Antumi app"
  },
  "SettingsPage.starting": {
    "zh": "正在启动",
    "en": "Starting"
  },
  "SettingsPage.readyAndRunning": {
    "zh": "就绪，正在运行",
    "en": "Ready and running"
  },
  "SettingsPage.ready": {
    "zh": "就绪",
    "en": "Ready"
  },
  "SettingsPage.error": {
    "zh": "出错：{value1}",
    "en": "Error: {value1}"
  },
  "SettingsPage.agentOpensScreenshotsAndInteractsWithPagesIn": {
    "zh": "Agent 用内置浏览器打开、截图和点击页面，显示在右侧面板。本地地址直接打开，其他网站首次访问先问你。",
    "en": "Agent opens, screenshots, and interacts with pages in the built-in browser, shown in the right panel. Local addresses open directly; other sites require first-visit approval."
  },
  "SettingsPage.showBrowserAutomaticallyWhenAgentOpensAPage": {
    "zh": "Agent 打开页面时自动显示浏览器",
    "en": "Show browser automatically when Agent opens a page"
  },
  "SettingsPage.whenOffClickOpenOnThePageCard": {
    "zh": "关闭后，在页面卡片上点「打开」才显示。",
    "en": "When off, click “Open” on the page card to show it."
  },
  "SettingsPage.maximumConcurrentAgents": {
    "zh": "同时运行的 Agent 总数",
    "en": "Maximum concurrent Agents"
  },
  "SettingsPage.atTheLimitNewConversationsMustWaitAnd": {
    "zh": "到上限后新会话需稍后再试，预约任务排队。等你确认的也占名额；调低不会停掉运行中的会话。下面各 Agent 的上限同样受此约束。",
    "en": "At the limit, new conversations must wait and schedules queue. Agents awaiting approval count too. Lowering the limit does not stop running conversations. Per-Agent limits below also follow this total limit."
  },
  "SettingsPage.items": {
    "zh": "个",
    "en": "items"
  },
  "SettingsPage.concurrency": {
    "zh": "{value1} 同时运行",
    "en": "{value1} concurrency"
  },
  "SettingsPage.keepComputerAwake": {
    "zh": "保持电脑唤醒",
    "en": "Keep computer awake"
  },
  "SettingsPage.agentsWaitingForYourInputDoNotPrevent": {
    "zh": "Agent 等你输入时不阻止睡眠；合上笔记本仍会睡眠。",
    "en": "Agents waiting for your input do not prevent sleep. Closing the laptop lid still puts it to sleep."
  },
  "SettingsPage.always": {
    "zh": "始终",
    "en": "Always"
  },
  "SettingsPage.whileAgentsWorkOrSchedulesArePending": {
    "zh": "Agent 工作或有预约时",
    "en": "While Agents work or schedules are pending"
  },
  "SettingsPage.scheduledRunPermissions": {
    "zh": "预约运行的权限",
    "en": "Scheduled run permissions"
  },
  "SettingsPage.scheduledTasksAndConversationsStartUnattendedInThis": {
    "zh": "预约的任务和会话到点后以此模式无人值守地开始。「自动接受编辑」遇到其他确认会停下；「全部放行」什么都不问、不受沙箱限制，只用于信任的任务。",
    "en": "Scheduled tasks and conversations start unattended in this mode. “Accept edits automatically” pauses for other approvals. “Allow everything” asks nothing and bypasses the sandbox; use for trusted tasks only."
  },
  "SettingsPage.suggestNextStepsAfterEachTurn": {
    "zh": "回合结束后建议下一步",
    "en": "Suggest next steps after each turn"
  },
  "SettingsPage.predictYourNextMessageInGrayAfterEach": {
    "zh": "每轮回复后用灰字预测你的下一句，按 Tab 或 → 填入。每轮多一次简短请求。仅 Claude Code 支持，下次启动起生效。",
    "en": "Predict your next message in gray after each reply. Press Tab or → to insert it. Adds a short request per turn. Claude Code only; applies at next start."
  },
  "SettingsPage.trackToDos": {
    "zh": "记录待办",
    "en": "Track to-dos"
  },
  "SettingsPage.agentRecordsThingsYouNeedToDoLater": {
    "zh": "Agent 把需要你之后去做的事（上线前要做的、要你验证或配置的）记成会话的待办，在检查器和总览里逐项勾掉。关闭后立即生效：界面不再显示待办，正在运行的 Agent 再去记也会被拒绝。",
    "en": "Agent records things you need to do later, such as pre-release work, verification, or configuration. Check them off in the inspector or overview. Disabling takes effect immediately: to-dos disappear and running Agents cannot add more."
  },
  "SettingsPage.modelForQuickTasks_1609": {
    "zh": "轻量任务用的模型",
    "en": "Model for quick tasks"
  },
  "SettingsPage.useThisAgentSModelForTranslationCommit": {
    "zh": "翻译、提交信息、会话标题等小活用同一 Agent 的这个模型；默认用它最便宜的模型。",
    "en": "Use this Agent's model for translation, commit messages, conversation titles, and other small jobs. Defaults to its cheapest model."
  },
  "SettingsPage.access": {
    "zh": "访问",
    "en": "Access"
  },
  "SettingsPage.letClaudeCodeUseYourChrome": {
    "zh": "让 Claude Code 操作你的 Chrome",
    "en": "Let Claude Code use your Chrome"
  },
  "SettingsPage.useTheClaudeInChromeExtensionToOpen": {
    "zh": "通过 Claude in Chrome 扩展，用你已登录的 Chrome 打开、点击和填写网页。需先装好扩展，下次启动起生效。",
    "en": "Use the Claude in Chrome extension to open, click, and fill pages in your signed-in Chrome. Requires the extension; applies at next start."
  },
  "SettingsPage.letAgentsReadYourAntumiRecords": {
    "zh": "让 Agent 读你在 Antumi 里的记录",
    "en": "Let Agents read your Antumi records"
  },
  "SettingsPage.agentsCanListAndReadYourConversationsTasks": {
    "zh": "Agent 可只读地列出和读取你的会话、任务和群聊（含其他 Agent 的），比如让定时任务总结本周工作。关闭后立即生效，正在运行的 Agent 也读不到。",
    "en": "Agents can list and read your conversations, tasks, and group chats, including those of other Agents. For example, a routine can summarize your week. Disabling immediately blocks access, including for running Agents."
  },
  "SettingsPage.noRecentProjectsProjectsAddedToTasksOr": {
    "zh": "还没有用过的项目。给任务或会话添加项目后，会出现在这里。",
    "en": "No recent projects. Projects added to tasks or conversations appear here."
  },
  "SettingsPage.projectConfigurationIsStoredInAntumiProjectJson": {
    "zh": "「项目配置」写在项目里的 .antumi/project.json：新建 worktree 时复制哪些文件、运行什么准备命令，任务提交验收前跑什么检查。移除只是不在最近列表里显示，不影响已有任务和会话。",
    "en": "“Project configuration” is stored in .antumi/project.json: files to copy and setup commands for new worktrees, plus checks before task review. Removing a recent entry does not affect existing tasks or conversations."
  },
  "SettingsPage.invalidFormat": {
    "zh": "格式有误",
    "en": "Invalid format"
  },
  "SettingsPage.recordRawAgentTraffic": {
    "zh": "记录和 Agent 之间的原始数据",
    "en": "Record raw Agent traffic"
  },
  "SettingsPage.recordEveryIncomingAndOutgoingLineIncludingStderr": {
    "zh": "原样记录收发的每一行（含 stderr、启动命令和退出码），在检查器的「原始数据」里查看。运行中的 Agent 从下一行开始记。",
    "en": "Record every incoming and outgoing line, including stderr, launch commands, and exit codes. View them in the inspector's “Raw data” tab. Running Agents start recording from the next line."
  },
  "SettingsPage.alreadyRecorded": {
    "zh": "已经记下的",
    "en": "Already recorded"
  },
  "SettingsPage.storedInAntumiSessionsSessionWireUpTo": {
    "zh": "{value1}存在 ~/.antumi/sessions/<会话>/wire/，每段最多 50 MB，7 天后自动删除。含文件内容和命令输出，分享前请检查。",
    "en": "{value1}Stored in ~/.antumi/sessions/<session>/wire/, up to 50 MB per segment, automatically deleted after 7 days. Contains file content and command output; review before sharing."
  },
  "SettingsPage.segmentsTotal": {
    "zh": "{value1} 段，共 {value2}。",
    "en": "{value1} {value1, plural, one {segment} other {segments}}, {value2} total."
  },
  "SettingsPage.deleteAll": {
    "zh": "全部删除",
    "en": "Delete all"
  },
  "SettingsPage.connected": {
    "zh": "已连接",
    "en": "Connected"
  },
  "SettingsPage.connecting": {
    "zh": "连接中…",
    "en": "Connecting…"
  },
  "SettingsPage.waitingForCoreToStart": {
    "zh": "等待 core 启动",
    "en": "Waiting for core to start"
  },
  "SettingsPage.eachTaskRunsInItsOwnWorktreeWhich": {
    "zh": "每个任务在自己的 worktree 里执行，没有 Git 就建不了。",
    "en": "Each task runs in its own worktree, which requires Git."
  },
  "SettingsPage.newTask": {
    "zh": "新建任务",
    "en": "New task"
  },
  "SettingsPage.projectWebsite": {
    "zh": "项目地址",
    "en": "Project website"
  },
  "SettingsPage.desktopVersion": {
    "zh": "桌面端版本",
    "en": "Desktop version"
  },
  "SettingsPage.protocolVersion": {
    "zh": "协议版本",
    "en": "Protocol version"
  },
  "SettingsPage.interface": {
    "zh": "界面",
    "en": "Interface"
  },
  "SettingsPage.appearance": {
    "zh": "外观",
    "en": "Appearance"
  },
  "SettingsPage.colorsChatAndTerminalDisplay": {
    "zh": "颜色、聊天页和终端的显示。",
    "en": "Colors, chat, and terminal display."
  },
  "SettingsPage.terminal": {
    "zh": "终端",
    "en": "Terminal"
  },
  "SettingsPage.code": {
    "zh": "代码",
    "en": "Code"
  },
  "SettingsPage.lineHeight": {
    "zh": "行高",
    "en": "Line height"
  },
  "SettingsPage.prompt": {
    "zh": "提示符",
    "en": "Prompt"
  },
  "SettingsPage.width": {
    "zh": "宽度",
    "en": "Width"
  },
  "SettingsPage.worked": {
    "zh": "工作了",
    "en": "Worked"
  },
  "SettingsPage.translateAgentRepliesIntoYourLanguage": {
    "zh": "把 Agent 的回复翻译成你的语言。",
    "en": "Translate Agent replies into your language."
  },
  "SettingsPage.language": {
    "zh": "语言",
    "en": "Language"
  },
  "SettingsPage.chinese": {
    "zh": "中文",
    "en": "Chinese"
  },
  "SettingsPage.english": {
    "zh": "英文",
    "en": "English"
  },
  "SettingsPage.japanese": {
    "zh": "日语",
    "en": "Japanese"
  },
  "SettingsPage.korean": {
    "zh": "韩语",
    "en": "Korean"
  },
  "SettingsPage.original": {
    "zh": "原文",
    "en": "Original"
  },
  "SettingsPage.translation": {
    "zh": "译文",
    "en": "Translation"
  },
  "SettingsPage.usageQuota": {
    "zh": "用量额度",
    "en": "Usage quota"
  },
  "SettingsPage.agentSubscriptionQuotaInTheStatusBar": {
    "zh": "状态栏里的 Agent 订阅额度。",
    "en": "Agent subscription quota in the status bar."
  },
  "SettingsPage.statusBar": {
    "zh": "状态栏",
    "en": "Status bar"
  },
  "SettingsPage.quota": {
    "zh": "额度",
    "en": "Quota"
  },
  "SettingsPage.percentage": {
    "zh": "百分比",
    "en": "Percentage"
  },
  "SettingsPage.reset": {
    "zh": "重置",
    "en": "Reset"
  },
  "SettingsPage.serviceWideReset": {
    "zh": "全员重置",
    "en": "Service-wide reset"
  },
  "SettingsPage.announcement": {
    "zh": "预告",
    "en": "Announcement"
  },
  "SettingsPage.notifications": {
    "zh": "通知",
    "en": "Notifications"
  },
  "SettingsPage.howToNotifyYouWhenAgentsNeedYou": {
    "zh": "Agent 需要你时如何提醒。",
    "en": "How to notify you when Agents need you."
  },
  "SettingsPage.alert": {
    "zh": "提醒",
    "en": "Alert"
  },
  "SettingsPage.badge": {
    "zh": "角标",
    "en": "Badge"
  },
  "SettingsPage.foreground": {
    "zh": "前台",
    "en": "Foreground"
  },
  "SettingsPage.confirm": {
    "zh": "确认",
    "en": "Confirm"
  },
  "SettingsPage.finished": {
    "zh": "做完",
    "en": "Finished"
  },
  "SettingsPage.unexpectedExit": {
    "zh": "异常退出",
    "en": "Unexpected exit"
  },
  "SettingsPage.popup": {
    "zh": "弹窗",
    "en": "Popup"
  },
  "SettingsPage.card": {
    "zh": "卡片",
    "en": "Card"
  },
  "SettingsPage.top": {
    "zh": "顶部",
    "en": "Top"
  },
  "SettingsPage.approval": {
    "zh": "审批",
    "en": "Approval"
  },
  "SettingsPage.runDescription": {"zh": "同时运行的 Agent 数量，以及 Agent 工作时是否保持电脑唤醒。", "en": "How many agents run at once, and whether the computer stays awake while they work."},
  "SettingsPage.perAgentLimits": {"zh": "各 Agent 的上限", "en": "Per-agent limits"},
  "SettingsPage.adjust": {"zh": "调整", "en": "Adjust"},
  "SettingsPage.permissions": {"zh": "权限", "en": "Permissions"},
  "SettingsPage.permissionsDescription": {"zh": "无人值守时 Agent 能做什么，以及能用你的哪些东西。", "en": "What agents may do unattended, and what of yours they can use."},
  "SettingsPage.conversationDescription": {"zh": "下一步建议、待办、标题、自动归档和轻量任务用的模型。", "en": "Next-step suggestions, to-dos, titles, auto-archive, and the model for quick tasks."},
  "SettingsPage.extensions": {"zh": "扩展", "en": "Extensions"},
  "SettingsPage.localAgents": {
    "zh": "外部智能体",
    "en": "External agents"
  },
  "SettingsPage.installationSignInAndDefaultsForAgentExecution": {
    "zh": "管理 Claude Code、Codex、Cursor 等外部智能体的安装、登录和可用状态。",
    "en": "Manage installation, sign-in and availability for external agents such as Claude Code, Codex and Cursor."
  },
  "SettingsPage.local": {
    "zh": "本机",
    "en": "Local"
  },
  "SettingsPage.install": {
    "zh": "安装",
    "en": "Install"
  },
  "SettingsPage.signIn": {
    "zh": "登录",
    "en": "Sign in"
  },
  "SettingsPage.version": {
    "zh": "版本",
    "en": "Version"
  },
  "SettingsPage.scan": {
    "zh": "检测",
    "en": "Scan"
  },
  "SettingsPage.environment": {
    "zh": "环境",
    "en": "Environment"
  },
  "SettingsPage.check": {
    "zh": "检查",
    "en": "Check"
  },
  "SettingsPage.notFound": {
    "zh": "找不到",
    "en": "Not found"
  },
  "SettingsPage.disable": {
    "zh": "禁用",
    "en": "Disable"
  },
  "SettingsPage.planning": {
    "zh": "规划",
    "en": "Planning"
  },
  "SettingsPage.unattended": {
    "zh": "无人值守",
    "en": "Unattended"
  },
  "SettingsPage.records": {
    "zh": "记录",
    "en": "Records"
  },
  "SettingsPage.history": {
    "zh": "历史",
    "en": "History"
  },
  "SettingsPage.quick": {
    "zh": "轻量",
    "en": "Quick"
  },
  "SettingsPage.naming": {
    "zh": "命名",
    "en": "Naming"
  },
  "SettingsPage.firstTurn": {
    "zh": "首轮",
    "en": "First turn"
  },
  "SettingsPage.everyTurn": {
    "zh": "每轮",
    "en": "Every turn"
  },
  "SettingsPage.autoArchive": {
    "zh": "自动归档",
    "en": "Auto-archive"
  },
  "SettingsPage.inactive": {
    "zh": "不活跃",
    "en": "Inactive"
  },
  "SettingsPage.cleanup": {
    "zh": "清理",
    "en": "Cleanup"
  },
  "SettingsPage.recentProjectsFilesCopiedIntoNewWorktreesSetup": {
    "zh": "最近使用的项目，以及每个项目新建 worktree 时复制的文件、准备和验收命令。",
    "en": "Recent projects, files copied into new worktrees, setup commands, and review checks."
  },
  "SettingsPage.repository": {
    "zh": "仓库",
    "en": "Repository"
  },
  "SettingsPage.path": {
    "zh": "路径",
    "en": "Path"
  },
  "SettingsPage.folder": {
    "zh": "文件夹",
    "en": "Folder"
  },
  "SettingsPage.installDependencies": {
    "zh": "安装依赖",
    "en": "Install dependencies"
  },
  "SettingsPage.tests": {
    "zh": "测试",
    "en": "Tests"
  },
  "SettingsPage.review": {
    "zh": "验收",
    "en": "Review"
  },
  "SettingsPage.versionsUpdatesConnectionAndGit": {
    "zh": "版本、更新、连接状态与 Git。",
    "en": "Versions, updates, connection status and Git."
  },
  "SettingsPage.protocol": {
    "zh": "协议",
    "en": "Protocol"
  },
  "SettingsPage.connection": {
    "zh": "连接",
    "en": "Connection"
  },
  "SettingsPage.chatCommands": {
    "zh": "聊天命令",
    "en": "Chat commands"
  },
  "SettingsPage.savedPromptsAvailableWithInTheComposerEdit": {
    "zh": "存好的提示词，在输入框输入 / 选用，填入后可改再发；所有 Agent 通用。",
    "en": "Saved prompts available with / in the composer. Edit before sending. Works with every Agent."
  },
  "SettingsPage.slash": {
    "zh": "斜杠",
    "en": "Slash"
  },
  "SettingsPage.shortcut": {
    "zh": "快捷",
    "en": "Shortcut"
  },
  "SettingsPage.skills": {
    "zh": "技能",
    "en": "Skills"
  },
  "SettingsPage.installAgentSkillsSkillMdFromGitRepositories": {
    "zh": "从 Git 仓库安装 Agent Skills（SKILL.md），Agent 启动时带上。",
    "en": "Install Agent Skills (SKILL.md) from Git repositories and load them when Agents start."
  },
  "SettingsPage.plugins": {
    "zh": "插件",
    "en": "Plugins"
  },
  "SettingsPage.update": {
    "zh": "更新",
    "en": "Update"
  },
  "SettingsPage.rollback": {
    "zh": "回退",
    "en": "Rollback"
  },
  "SettingsPage.manageMcpServersShareThemWithSelectedAgents": {
    "zh": "统一管理 MCP 服务器，启动时交给你选的 Agent，也可从各 Agent 的配置导入。",
    "en": "Manage MCP servers, share them with selected Agents at startup, and import from Agent configurations."
  },
  "SettingsPage.servers": {
    "zh": "服务器",
    "en": "Servers"
  },
  "SettingsPage.tools": {
    "zh": "工具",
    "en": "Tools"
  },
  "SettingsPage.import": {
    "zh": "导入",
    "en": "Import"
  },
  "SettingsPage.token": {
    "zh": "令牌",
    "en": "Token"
  },
  "SettingsPage.debug": {
    "zh": "调试",
    "en": "Debug"
  },
  "SettingsPage.rawDataExchangedBetweenAntumiAndAgents": {
    "zh": "Antumi 与 Agent 之间的原始数据。",
    "en": "Raw data exchanged between Antumi and Agents."
  },
  "SettingsPage.logs": {
    "zh": "日志",
    "en": "Logs"
  },
  "SettingsPage.traffic": {
    "zh": "抓包",
    "en": "Traffic"
  },
  "SettingsPage.integrations": {
    "zh": "集成",
    "en": "Integrations"
  },
  "SettingsPage.knowledgeBase": {
    "zh": "知识库",
    "en": "Knowledge base"
  },
  "SettingsPage.connectAMarkdownFolderOrObsidianVaultSo": {
    "zh": "连接 Markdown 文件夹或 Obsidian 库，让 Agent 读资料、记笔记。",
    "en": "Connect a Markdown folder or Obsidian vault so Agents can read materials and write notes."
  },
  "SettingsPage.notes": {
    "zh": "笔记",
    "en": "Notes"
  },
  "SettingsPage.wikilinks": {
    "zh": "双链",
    "en": "Wikilinks"
  },
  "SettingsPage.builtInBrowserUsedByAgents": {
    "zh": "Agent 使用的内置浏览器。",
    "en": "Built-in browser used by Agents."
  },
  "SettingsPage.webPages": {
    "zh": "网页",
    "en": "Web pages"
  },
  "SettingsPage.panel": {
    "zh": "面板",
    "en": "Panel"
  },
  "SettingsPage.taskSourcePluginsConfigureSignInAndFilters": {
    "zh": "任务来源插件。登录和筛选在对应的集成页设置。",
    "en": "Task source plugins. Configure sign-in and filters on each integration page."
  },
  "SettingsPage.syncIssuesAssignedToYouInToThe": {
    "zh": "把 {value1} 里分给你的 issue 同步到收件箱，挑选后导入为任务。",
    "en": "Sync issues assigned to you in {value1} to the inbox, then select issues to import as tasks."
  },
  "SettingsPage.settingsCategories": {
    "zh": "设置分类",
    "en": "Settings categories"
  },
  "SettingsPage.back": {
    "zh": "{value1}返回",
    "en": "{value1}Back"
  },
  "SettingsPage.searchSettings": {
    "zh": "搜索设置",
    "en": "Search settings"
  },
  "SettingsPage.noSettingsFoundFor": {
    "zh": "没有找到与「{value1}」相关的设置",
    "en": "No settings found for “{value1}”"
  },
  "Sidebar.resizeSidebar": {
    "zh": "调整侧边栏宽度",
    "en": "Resize sidebar"
  },
  "Sidebar.sidebarWidthPixels": {
    "zh": "侧边栏宽 {shown} 像素",
    "en": "Sidebar width {shown} pixels"
  },
  "Sidebar.dragToResizeDoubleClickToReset": {
    "zh": "拖动调整宽度，双击恢复默认",
    "en": "Drag to resize; double-click to reset"
  },
  "SidebarDiscussions.deleteGroupChatMemberConversationsAndPostsAre": {
    "zh": "删除群聊「{value1}」？各成员的会话和发言记录一起删除，项目目录不会改动。",
    "en": "Delete group chat “{value1}”? Member conversations and posts are deleted together; project directories stay untouched."
  },
  "SidebarDiscussions.aMemberNeedsYourApproval": {
    "zh": "有成员在等你确认",
    "en": "A member needs your approval"
  },
  "SidebarDiscussions.aMemberIsSpeaking": {
    "zh": "有成员在发言",
    "en": "A member is speaking"
  },
  "SidebarDiscussions.listOptions": {
    "zh": "列表选项",
    "en": "List options"
  },
  "SidebarDiscussions.newGroupChat": {
    "zh": "新建群聊",
    "en": "New group chat"
  },
  "SidebarDiscussions.groupChatListOptions": {
    "zh": "群聊的列表选项",
    "en": "Group chat list options"
  },
  "SidebarDiscussions.showArchived": {
    "zh": "显示已归档（{value1}）",
    "en": "Show archived ({value1})"
  },
  "SidebarDiscussions.archivedGroupChats": {
    "zh": "已归档的群聊",
    "en": "Archived group chats"
  },
  "SidebarDiscussions.actionsForGroupChat": {
    "zh": "群聊「{value1}」的操作",
    "en": "Actions for group chat “{value1}”"
  },
  "SidebarDiscussions.newGroupChatWithTheSameMembers": {
    "zh": "用相同成员新建群聊",
    "en": "New group chat with the same members"
  },
  "SidebarDiscussions.waitUntilMembersFinishOrPauseFirst": {
    "zh": "等成员说完，或先暂停",
    "en": "Wait until members finish, or pause first"
  },
  "SidebarDiscussions.deleteGroupChat": {
    "zh": "删除群聊",
    "en": "Delete group chat"
  },
  "SidebarSearch.clear": {
    "zh": "清空",
    "en": "Clear"
  },
  "SidebarTasks.tasks": {
    "zh": "任务{value1}",
    "en": "Tasks{value1}"
  },
  "SidebarTasks.needYourResponse": {
    "zh": "，{waiting} 个等你处理",
    "en": ", {waiting} need your response"
  },
  "SidebarTasks.tasksNeedYourResponse": {
    "zh": "{waiting} 个任务等你处理",
    "en": "{waiting} {waiting, plural, one {task} other {tasks}} need your response"
  },
  "SidebarTasks.newTaskN": {
    "zh": "新建任务 {PRIMARY_KEY_LABEL}N",
    "en": "New task {PRIMARY_KEY_LABEL}N"
  },
  "SkillsSettingsSection.noReadme": {
    "zh": "（没有 README）",
    "en": "(No README)"
  },
  "SkillsSettingsSection.removeAgentsUsingItLoseTheseSkillsAt": {
    "zh": "移除 {value1}？用到它的 Agent 下次启动起就没有这些技能。",
    "en": "Remove {value1}? Agents using it lose these skills at their next start."
  },
  "SkillsSettingsSection.checkForUpdates": {
    "zh": "检查更新",
    "en": "Check for updates"
  },
  "SkillsSettingsSection.rollBackTo": {
    "zh": "回退到 {value1}",
    "en": "Roll back to {value1}"
  },
  "SkillsSettingsSection.alreadyUpToDate": {
    "zh": "已是最新。",
    "en": "Already up to date."
  },
  "SkillsSettingsSection.commitsBehindUpdatedSkills": {
    "zh": "落后 {value1} 次提交，{value2} → {value3}；更新后的技能：{value4}。{value5}{value6}",
    "en": "{value1} {value1, plural, one {commit} other {commits}} behind, {value2} → {value3}; updated skills: {value4}.{value5}{value6}"
  },
  "SkillsSettingsSection.installing": {
    "zh": "安装中…",
    "en": "Installing…"
  },
  "SkillsSettingsSection.pinnedToTheInstalledCommitPreviewChangesBefore": {
    "zh": "固定在安装时的提交，更新前可预览变化，也能回退；不改 Agent 自己的配置。技能是第三方代码，可能带脚本，只装你信任的。{value1}。",
    "en": "Pinned to the installed commit. Preview changes before updating and roll back anytime. Agent configurations stay untouched. Skills are third-party code and may include scripts; install only trusted ones.{value1}."
  },
  "SkillsSettingsSection.supported": {
    "zh": "{value1} 支持",
    "en": "{value1} supported"
  },
  "SkillsSettingsSection.notSupportedYet": {
    "zh": "{value1} 暂不支持",
    "en": "{value1} not supported yet"
  },
  "SkillsSettingsSection.installed": {
    "zh": "已安装 · {value1}",
    "en": "Installed · {value1}"
  },
  "SkillsSettingsSection.noSkillsInstalledChooseARecommendationBelowOr": {
    "zh": "还没有安装技能，可以从下面的推荐里装，或填一个仓库地址。",
    "en": "No skills installed. Choose a recommendation below or enter a repository URL."
  },
  "SkillsSettingsSection.installFromAnotherRepository": {
    "zh": "从其他仓库安装",
    "en": "Install from another repository"
  },
  "SkillsSettingsSection.addASkill": {
    "zh": "添加技能",
    "en": "Add a skill"
  },
  "SkillsSettingsSection.searchTheSkillMarket": {
    "zh": "搜索技能市场",
    "en": "Search the skill market"
  },
  "SkillsSettingsSection.searchSkillsShPlaceholder": {
    "zh": "搜 skills.sh 上的技能…",
    "en": "Search skills on skills.sh…"
  },
  "SkillsSettingsSection.search": {
    "zh": "搜索",
    "en": "Search"
  },
  "SkillsSettingsSection.searching": {
    "zh": "搜索中…",
    "en": "Searching…"
  },
  "SkillsSettingsSection.noMatchingSkillsFound": {
    "zh": "没有找到匹配的技能。",
    "en": "No matching skills found."
  },
  "SkillsSettingsSection.installsCount": {
    "zh": "{value1} 次安装",
    "en": "{value1} installs"
  },
  "SkillsSettingsSection.resultsFromSkillsShInstallsTheWholeRepository": {
    "zh": "结果来自 skills.sh 的开放索引；安装的是技能所在的整个 GitHub 仓库，和其他安装一样固定在提交。",
    "en": "Results come from the open skills.sh index. Installing clones the whole GitHub repository the skill lives in, pinned to a commit like every other install."
  },
  "SkillsSettingsSection.repositoryUrl": {
    "zh": "仓库地址",
    "en": "Repository URL"
  },
  "SkillsSettingsSection.onlyHttpsUrlsTheRepositoryMustContainSkills": {
    "zh": "只接受 https:// 仓库地址，自动识别根目录、技能目录与分类子目录中的 SKILL.md。安装后选择要启用的技能。",
    "en": "Only https:// repository URLs. Discovers SKILL.md at the root and inside skill or category directories. Choose which skills to enable after installing."
  },
  "SmallModelStats.smallModelUsage": {
    "zh": "小模型用量",
    "en": "Small-model usage"
  },
  "SmallModelStats.estimatedAtApiListPrices": {
    "zh": "按 API 标价折算",
    "en": "Estimated at API list prices"
  },
  "SmallModelStats.savingsAreCalculatedPerRequestAndFlooredAt": {
    "zh": "{value1}。约省逐次计算，最低为零；未提供金额的记录不计入金额合计。",
    "en": "{value1}. Savings are calculated per request and floored at zero; records without reported costs are excluded from cost totals."
  },
  "SmallModelStats.purpose": {
    "zh": "用途",
    "en": "Purpose"
  },
  "SmallModelStats.cost": {
    "zh": "花费",
    "en": "Cost"
  },
  "SmallModelStats.estimatedSavings": {
    "zh": "约省",
    "en": "Estimated savings"
  },
  "SmallModelStats.unavailable": {
    "zh": "未提供",
    "en": "Unavailable"
  },
  "SmallModelStats.translationCountsOnlyTheModelPriceDifferenceCommit": {
    "zh": "翻译只算模型差价；提交说明和小助手另计避免读取主上下文的成本。未报告的 token 与金额显示为未提供；当前 Cursor 小助手不报告回合用量。",
    "en": "Translation counts only the model price difference. Commit messages and helpers also count avoided main-context reads. Unreported tokens and costs show as unavailable; Cursor helpers currently do not report turn usage."
  },
  "SourceInboxView._1782": {
    "zh": "{value1}年{day}",
    "en": "{day}/{value1}"
  },
  "SourceInboxView.openIn": {
    "zh": "在 {name} 中打开",
    "en": "Open in {name}"
  },
  "SourceInboxView.updated": {
    "zh": "更新于 {value1}",
    "en": "Updated {value1}"
  },
  "SourceInboxView.investigating": {
    "zh": "排查中",
    "en": "Investigating"
  },
  "SourceInboxView.taskSources": {
    "zh": "任务来源",
    "en": "Task sources"
  },
  "SourceInboxView.syncFailed": {
    "zh": "同步失败",
    "en": "Sync failed"
  },
  "SourceInboxView.inbox": {
    "zh": "{name} 收件箱",
    "en": "{name} inbox"
  },
  "SourceInboxView.pending": {
    "zh": "{value1} 个待处理",
    "en": "{value1} pending"
  },
  "SourceInboxView.syncing": {
    "zh": "同步中…",
    "en": "Syncing…"
  },
  "SourceInboxView.sync": {
    "zh": "{value1} 同步",
    "en": "{value1} Sync"
  },
  "SourceInboxView.syncNow": {
    "zh": "立即同步",
    "en": "Sync now"
  },
  "SourceInboxView.settings": {
    "zh": "{name} 设置",
    "en": "{name} settings"
  },
  "SourceInboxView.syncFailed_1794": {
    "zh": "同步失败：{value1}{value2}",
    "en": "Sync failed: {value1}{value2}"
  },
  "SourceInboxView.checkSettings": {
    "zh": "检查设置",
    "en": "Check settings"
  },
  "SourceInboxView.viewConversation": {
    "zh": "看会话",
    "en": "View conversation"
  },
  "SourceInboxView.importTask": {
    "zh": "导入任务",
    "en": "Import task"
  },
  "SourceInboxView.investigateInChat": {
    "zh": "会话排查",
    "en": "Investigate in chat"
  },
  "SourceInboxView.openAReadOnlyConversationToInvestigateFix": {
    "zh": "开一个只读会话查清原因，确认后可以就在会话里修",
    "en": "Open a read-only conversation to investigate; fix in the same conversation after approval"
  },
  "SourceInboxView.dismiss": {
    "zh": "忽略",
    "en": "Dismiss"
  },
  "SourceInboxView.noNewIssuesAllMatchingIssuesHaveBeen": {
    "zh": "没有新的 issue：符合条件的都已经导入或忽略了。",
    "en": "No new issues: all matching issues have been imported or dismissed."
  },
  "SourceInboxView.issuesAppearHereAfterASuccessfulSync": {
    "zh": "同步成功后，issue 会出现在这里。",
    "en": "Issues appear here after a successful sync."
  },
  "SourceInboxView.runningFirstSync": {
    "zh": "正在第一次同步…",
    "en": "Running first sync…"
  },
  "SourceInboxView.dismissed": {
    "zh": "{value1}已忽略的 {value2} 个",
    "en": "{value1}{value2} dismissed"
  },
  "SourceInboxView.restore": {
    "zh": "恢复",
    "en": "Restore"
  },
  "SourceInboxView.issuesSyncedFromTaskSourcesImportAsTasks": {
    "zh": "从任务来源同步来的 issue：导入成任务，或先开会话排查。",
    "en": "Issues synced from task sources: import as tasks or investigate in a conversation first."
  },
  "SourceInboxView.noTaskSourceConnectedConfigureASiteAnd": {
    "zh": "还没有连接任务来源。在对应的集成页保存筛选条件、登录并开启「同步到收件箱」，符合条件的事项会出现在这里。",
    "en": "No task source connected. Save your filters and sign in on the source's integration page, then enable Sync to inbox to see matching issues here."
  },
  "SourceInboxView.installASourcePluginFirst": {
    "zh": "先在「设置 → 插件」安装任务或 Bug 来源，再到对应的集成页配置并登录。",
    "en": "Install a task or bug source in Settings → Plugins, then configure it and sign in on its integration page."
  },
  "SourceInboxView.goToSettings": {
    "zh": "去设置",
    "en": "Go to settings"
  },
  "SourceInboxView.importedAsTaskChooseItsProjectsNext": {
    "zh": "已导入为任务「{value1}」，下一步给它选上项目。{value2}",
    "en": "Imported as task “{value1}”. Choose its projects next.{value2}"
  },
  "SourceInboxView.openTask": {
    "zh": "打开任务",
    "en": "Open task"
  },
  "SourceLoginDialog.signInTo": {
    "zh": "登录 {value1}",
    "en": "Sign in to {value1}"
  },
  "SourceLoginDialog.signInFailed": {
    "zh": "登录失败：{value1}",
    "en": "Sign-in failed: {value1}"
  },
  "SourceLoginDialog.signedIn": {
    "zh": "已登录：{value1}",
    "en": "Signed in: {value1}"
  },
  "SourceLoginDialog.connecting": {
    "zh": "正在连接…",
    "en": "Connecting…"
  },
  "SourceSettingsSection.signedInFromEnvironmentVariables": {
    "zh": "已登录（来自环境变量）",
    "en": "Signed in (from environment variables)"
  },
  "SourceSettingsSection.unknownAccount": {
    "zh": "未知账号",
    "en": "Unknown account"
  },
  "SourceSettingsSection.changingThisRequiresSigningInAgainSavedCredentials": {
    "zh": "修改后需要重新登录，保存的凭据不会发往新的地址。",
    "en": "Changing this requires signing in again. Saved credentials are never sent to a new address."
  },
  "SourceSettingsSection.account": {
    "zh": "账号",
    "en": "Account"
  },
  "SourceSettingsSection.syncFailed": {
    "zh": "同步失败：{value1}",
    "en": "Sync failed: {value1}"
  },
  "SourceSettingsSection.signOut": {
    "zh": "退出登录",
    "en": "Sign out"
  },
  "SourceSettingsSection.signInAgain": {
    "zh": "重新登录",
    "en": "Sign in again"
  },
  "SourceSettingsSection.syncToInbox": {
    "zh": "同步到收件箱",
    "en": "Sync to inbox"
  },
  "SourceSettingsSection.saving": {
    "zh": "正在保存…",
    "en": "Saving…"
  },
  "SourceSettingsSection.saveSettings": {
    "zh": "保存设置",
    "en": "Save settings"
  },
  "SourceSnapshotCard.original": {
    "zh": "{value1} 原文",
    "en": "{value1} original"
  },
  "SourceSnapshotCard.original_1826": {
    "zh": "{value1}{value2} 原文",
    "en": "{value1}{value2} original"
  },
  "SourceSnapshotCard.fetched": {
    "zh": "拉取于 {value1}",
    "en": "Fetched {value1}"
  },
  "SourceSnapshotCard.fetchAgain": {
    "zh": "重新拉取",
    "en": "Fetch again"
  },
  "SourceSnapshotCard.originalContentIsEmpty": {
    "zh": "（原文是空的）",
    "en": "(Original content is empty)"
  },
  "SourceSnapshotCard.original_1830": {
    "zh": "{value1} {value2} 原文",
    "en": "{value1} {value2} original"
  },
  "SourceSnapshotCard.imagesFromProvidedAsReferenceLikeTheOriginal": {
    "zh": "来自 {value1} 的 {value2} 张图片，和原文一样只作参考",
    "en": "{value2} {value2, plural, one {image} other {images}} from {value1}, provided as reference like the original content"
  },
  "SourceSnapshotCard.from": {
    "zh": "来自 {value1}",
    "en": "From {value1}"
  },
  "SquadLaunchDialog.assignPlanningToSquad": {
    "zh": "交给团队执行规划",
    "en": "Assign planning to team"
  },
  "SquadLaunchDialog.assignToDevelopmentSquad": {
    "zh": "交给团队",
    "en": "Assign to team"
  },
  "SquadLaunchDialog.useASingleAgent": {
    "zh": "改用单 Agent",
    "en": "Use a single Agent"
  },
  "SquadLaunchDialog.chooseSquad": {
    "zh": "选择团队",
    "en": "Choose team"
  },
  "SquadLaunchDialog.members": {
    "zh": "{value1} 名成员",
    "en": "{value1} {value1, plural, one {member} other {members}}"
  },
  "SquadLaunchDialog.developmentPermissions": {
    "zh": "开发权限",
    "en": "Development permissions"
  },
  "SquadLaunchDialog.automatic": {
    "zh": "自动判断",
    "en": "Automatic"
  },
  "SquadLaunchDialog.recommended": {
    "zh": "{value1}（推荐）{value2}",
    "en": "{value1} (recommended){value2}"
  },
  "SquadLaunchDialog.planWithTheLeaderFirst": {
    "zh": "先和队长规划",
    "en": "Plan with the team lead first"
  },
  "SquadLaunchDialog.theLeaderReadsCodeAndDiscussesThePlan": {
    "zh": "队长读代码，和你商量出计划和分工；你批准后，它接着带成员开发。",
    "en": "The team lead reads code and discusses the plan and assignments with you, then leads development after approval."
  },
  "SquadLaunchDialog.startDirectly": {
    "zh": "直接开始",
    "en": "Start directly"
  },
  "SquadLaunchDialog.theLeaderBreaksDownTaskDetailsAndAssigns": {
    "zh": "队长按任务详情自己拆分，边做边派活。",
    "en": "The team lead breaks down task details and assigns work as it proceeds."
  },
  "SquadLaunchDialog.coordinatesMembersUsingTheSquadSModelsAnd": {
    "zh": "{value1} 协调 {value2} 名成员；模型与成员配置沿用团队设置。{value3}",
    "en": "{value1} coordinates {value2} {value2, plural, one {member} other {members}} using the team's models and member settings.{value3}"
  },
  "SquadLaunchDialog.developmentPermissionsApplyAfterPlanApproval": {
    "zh": "开发权限在批准计划后生效。",
    "en": "Development permissions apply after plan approval."
  },
  "SquadLaunchDialog.thisProjectIsNotAGitRepositoryChanges": {
    "zh": "此项目不是 Git 仓库，修改会直接写入原目录。",
    "en": "This project is not a Git repository. Changes are written directly to the original directory."
  },
  "SquadLaunchDialog.createADevelopmentSquadFirst": {
    "zh": "先创建团队",
    "en": "Create a team first"
  },
  "SquadLaunchDialog.startPlanning": {
    "zh": "开始规划",
    "en": "Start planning"
  },
  "SquadWorkPanel.developing": {
    "zh": "开发中",
    "en": "Developing"
  },
  "SquadWorkPanel.awaitingReview": {
    "zh": "待验收",
    "en": "Awaiting review"
  },
  "SquadWorkPanel.paused": {
    "zh": "已暂停",
    "en": "Paused"
  },
  "SquadWorkPanel.ended": {
    "zh": "已结束",
    "en": "Ended"
  },
  "SquadWorkPanel.working": {
    "zh": "在执行",
    "en": "Working"
  },
  "SquadWorkPanel.preparing": {
    "zh": "准备中",
    "en": "Preparing"
  },
  "SquadWorkPanel.queued": {
    "zh": "排队",
    "en": "Queued"
  },
  "SquadWorkPanel.idle": {
    "zh": "空闲",
    "en": "Idle"
  },
  "SquadWorkPanel.waitingForYourAnswer": {
    "zh": "{value1}等你回答",
    "en": "{value1}Waiting for your answer"
  },
  "SquadWorkPanel.queued_1859": {
    "zh": "{value1}排队",
    "en": "{value1}Queued"
  },
  "SquadWorkPanel.done": {
    "zh": "✓ 完成",
    "en": "✓ Done"
  },
  "SquadWorkPanel.failed": {
    "zh": "✕ 失败",
    "en": "✕ Failed"
  },
  "SquadWorkPanel.retried": {
    "zh": "已重试",
    "en": "Retried"
  },
  "SquadWorkPanel.openSConversation": {
    "zh": "打开{value1}的会话",
    "en": "Open {value1}'s conversation"
  },
  "SquadWorkPanel.leader": {
    "zh": "队长",
    "en": "Team lead"
  },
  "SquadWorkPanel.working_1865": {
    "zh": "{working} 人在干",
    "en": "{working} working"
  },
  "SquadWorkPanel.queued_1866": {
    "zh": "{queued} 人排队",
    "en": "{queued} queued"
  },
  "SquadWorkPanel.completed": {
    "zh": "完成 {done} 项",
    "en": "{done} completed"
  },
  "SquadWorkPanel.pastRuns": {
    "zh": "历史运行",
    "en": "Past runs"
  },
  "SquadWorkPanel.resumeSquad": {
    "zh": "继续团队",
    "en": "Resume team"
  },
  "SquadWorkPanel.stopSquad": {
    "zh": "停止团队",
    "en": "Stop team"
  },
  "SquadWorkPanel.work": {
    "zh": "工作",
    "en": "Work"
  },
  "SquadWorkPanel.inProgress": {
    "zh": "{value1} 进行中",
    "en": "{value1} in progress"
  },
  "SquadWorkPanel.ended_1873": {
    "zh": "{value1} 已结束",
    "en": "{value1} ended"
  },
  "SquadWorkPanel.earlierEntries": {
    "zh": "更早的 {value1} 条",
    "en": "{value1} earlier entries"
  },
  "SquadWorkPanel.deliverySummary": {
    "zh": "交付摘要",
    "en": "Delivery summary"
  },
  "SquadWorkPanel.noSquadRunHistoryYet": {
    "zh": "还没有团队运行记录。",
    "en": "No team run history yet."
  },
  "Squads.readOnlyLeaderBreaksDownWorkAssignsMembers": {
    "zh": "队长只读：拆分工作、分派给成员、汇总验证结果，自己不改代码。",
    "en": "Read-only team lead: breaks down work, assigns members, and summarizes verification; does not edit code."
  },
  "Squads.leaderReadOnly": {
    "zh": "队长 · 只读",
    "en": "Team lead · Read only"
  },
  "Squads.developmentTesting": {
    "zh": "开发 / 测试",
    "en": "Development / testing"
  },
  "Squads.readOnlyAnalysis": {
    "zh": "只读分析",
    "en": "Read-only analysis"
  },
  "Squads.developers": {
    "zh": "开发 {developers}",
    "en": "Developers {developers}"
  },
  "Squads.readOnly": {
    "zh": "只读 {readers}",
    "en": "Read only {readers}"
  },
  "Squads.developmentSquads": {
    "zh": "团队",
    "en": "Teams"
  },
  "Squads.inUse": {
    "zh": "使用中 · {value1}",
    "en": "In use · {value1}"
  },
  "Squads.archived": {
    "zh": "已归档 · {value1}",
    "en": "Archived · {value1}"
  },
  "Squads.noArchivedSquads": {
    "zh": "没有归档的团队。",
    "en": "No archived teams."
  },
  "Squads.newSquad": {
    "zh": "{value1}新建团队{value2}",
    "en": "{value1}New team{value2}"
  },
  "Squads.preFillLeaderDeveloperReviewerRoles": {
    "zh": "按 队长 / 开发 / 审查 预填好成员",
    "en": "Start with a team lead, developer and reviewer"
  },
  "Squads.noDescription": {
    "zh": "没有说明",
    "en": "No description"
  },
  "Squads.restoreSquad": {
    "zh": "恢复团队",
    "en": "Restore team"
  },
  "Squads.archiveSquad": {
    "zh": "归档团队",
    "en": "Archive team"
  },
  "Squads.edit": {
    "zh": "{value1}编辑",
    "en": "{value1}Edit"
  },
  "Squads.member": {
    "zh": "成员 {value1}",
    "en": "Member {value1}"
  },
  "Squads.teamMembers": {"zh": "团队成员", "en": "Team members"},
  "Squads.developmentAndTestingRunSequentiallyReadOnlyAnalysis": {
    "zh": "开发和测试串行执行，只读分析可以并行。",
    "en": "Development and testing run sequentially; read-only analysis can run in parallel."
  },
  "Squads.instructionsForTheLeader": {
    "zh": "发给队长的指令",
    "en": "Instructions for the team lead"
  },
  "Squads.noneTheLeaderAssignsWorkBasedOnThe": {
    "zh": "没有写。队长按任务和各成员的职责说明分工。",
    "en": "None. The team lead assigns work based on the task and member responsibilities."
  },
  "Squads.runningTasksKeepTheirStartupConfigurationChangesHere": {
    "zh": "运行中的任务沿用启动时的团队配置，这里的改动从下一次交给团队起生效。",
    "en": "Running tasks keep their startup configuration. Changes here apply the next time a task is assigned to this team."
  },
  "Squads.collapse": {
    "zh": "收起 {value1}",
    "en": "Collapse {value1}"
  },
  "Squads.expand": {
    "zh": "展开 {value1}",
    "en": "Expand {value1}"
  },
  "Squads.untitled": {
    "zh": "未命名",
    "en": "Untitled"
  },
  "Squads.makeLeader": {
    "zh": "设为队长",
    "en": "Make team lead"
  },
  "Squads.name": {
    "zh": "名称{value1}",
    "en": "Name{value1}"
  },
  "Squads.model": {
    "zh": "模型{value1}",
    "en": "Model{value1}"
  },
  "Squads.capability": {
    "zh": "能力{value1}",
    "en": "Capability{value1}"
  },
  "Squads.capability_1905": {
    "zh": "能力",
    "en": "Capability"
  },
  "Squads.readOnlyAnalysisReview": {
    "zh": "只读分析 / 审查",
    "en": "Read-only analysis / review"
  },
  "Squads.readAnalyzeAndReviewCodeWithoutEditingMultiple": {
    "zh": "读代码、分析和审查，不改文件，可以几个并行",
    "en": "Read, analyze, and review code without editing; multiple members can run in parallel"
  },
  "Squads.editCodeAndRunTestsSequentiallyWithOther": {
    "zh": "改代码、跑测试，和其他开发成员依次进行",
    "en": "Edit code and run tests, sequentially with other developers"
  },
  "Squads.roleDescription": {
    "zh": "职责说明{value1}",
    "en": "Responsibilities{value1}"
  },
  "Squads.responsibilitiesExpertiseAndDeliveryRequirements": {
    "zh": "职责、专长与交付要求",
    "en": "Responsibilities, expertise, and delivery requirements"
  },
  "Squads.breakDownWorkCoordinateDevelopmentAndReviewSummarize": {
    "zh": "拆分工作、协调开发与审查，汇总验证并提交成果。",
    "en": "Break down work, coordinate development and review, summarize verification, and submit results."
  },
  "Squads.development": {
    "zh": "开发",
    "en": "Development"
  },
  "Squads.implementFeaturesAndRunRelevantChecksAndTests": {
    "zh": "实现功能并运行相关检查和测试。",
    "en": "Implement features and run relevant checks and tests."
  },
  "Squads.reviewCorrectnessEdgeCasesAndCodeQualityReport": {
    "zh": "检查正确性、边界情况与代码质量，反馈问题。",
    "en": "Review correctness, edge cases, and code quality; report findings."
  },
  "Squads.checkSquadConfiguration": {
    "zh": "请检查团队配置",
    "en": "Check team configuration"
  },
  "Squads.squadName": {
    "zh": "团队名称{value1}",
    "en": "Team name{value1}"
  },
  "Squads.forExampleWebsiteTeam": {
    "zh": "例如：网站团队",
    "en": "For example: Website team"
  },
  "Squads.shortDescription": {
    "zh": "一句话说明{value1}",
    "en": "Short description{value1}"
  },
  "Squads.whatThisSquadDoesShownInTheSquad": {
    "zh": "这个团队负责什么，显示在团队列表里",
    "en": "What this team does; shown in the team list"
  },
  "Squads.atLeastOneDevelopmentTestingMemberDevelopersRun": {
    "zh": "至少一名「开发 / 测试」成员。开发和测试串行执行，只读分析可以并行；点一行展开设置。",
    "en": "At least one development / testing member. Developers run sequentially; read-only analysis can run in parallel. Click a row to configure."
  },
  "Squads.upToMembersIncludingTheLeader": {
    "zh": "最多 {MAX_MEMBERS} 人（含队长）",
    "en": "Up to {MAX_MEMBERS} {MAX_MEMBERS, plural, one {member} other {members}} including the team lead"
  },
  "Squads.addMember": {
    "zh": "添加成员",
    "en": "Add member"
  },
  "Squads.optional": {
    "zh": "（可选）",
    "en": "(Optional)"
  },
  "Squads.assignmentRulesCollaborationAndAcceptanceCriteriaReadBy": {
    "zh": "分工规则、协作方式与验收要求，队长每次接手任务时都会读到",
    "en": "Assignment rules, collaboration, and acceptance criteria; read by the team lead whenever it takes a task"
  },
  "Squads.createSquad": {
    "zh": "创建团队",
    "en": "Create team"
  },
  "Squads.edit_1926": {
    "zh": "配置团队「{value1}」",
    "en": "Configure team “{value1}”"
  },
  "Squads.backToSquadList": {
    "zh": "返回团队列表",
    "en": "Back to team list"
  },
  "Squads.newDevelopmentSquad": {
    "zh": "新建团队",
    "en": "New team"
  },
  "Squads.preFilledWithLeaderDeveloperAndReviewerChange": {
    "zh": "先按 队长 / 开发 / 审查 三名成员预填好了，改名字、换外部智能体或模型都可以。",
    "en": "Pre-filled with a team lead, developer, and reviewer. Change names, external agents, or models as needed."
  },
  "Squads.aReadOnlyLeaderCoordinatesMembersBreaksDown": {
    "zh": "由只读的队长拆分任务、分派给成员并汇总结果。开始任务时选「交给团队」，或在任务的执行者里选择团队。",
    "en": "A read-only team lead breaks down tasks, assigns work, and summarizes results. Choose “Assign to team” when starting a task, or select the team as its assignee."
  },
  "Squads.newSquad_1931": {
    "zh": "{value1}新建团队",
    "en": "{value1}New team"
  },
  "StatusBar.connectingToAntumiCoreReconnectsAutomaticallyAfterDisconnection": {
    "zh": "正在连接 Antumi core，断开后会自动重连",
    "en": "Connecting to Antumi core; reconnects automatically after disconnection"
  },
  "StatusBar.noRunningAntumiCoreFoundStartPnpmDev": {
    "zh": "没有找到正在运行的 Antumi core，先启动 pnpm dev:core",
    "en": "No running Antumi core found. Start pnpm dev:core first"
  },
  "StatusBar.help": {
    "zh": "帮助",
    "en": "Help"
  },
  "StatusBar.settings": {
    "zh": "设置",
    "en": "Settings"
  },
  "StatusBar.settings_1935": {
    "zh": "设置 {PRIMARY_KEY_LABEL},",
    "en": "Settings {PRIMARY_KEY_LABEL},"
  },
  "StatusBar.hideBrowserCtrlShift": {
    "zh": "隐藏浏览器 Ctrl+Shift+`",
    "en": "Hide browser Ctrl+Shift+`"
  },
  "StatusBar.browserCtrlShift": {
    "zh": "浏览器 Ctrl+Shift+`",
    "en": "Browser Ctrl+Shift+`"
  },
  "StatusBar.hideTerminalCtrl": {
    "zh": "隐藏终端 Ctrl+`",
    "en": "Hide terminal Ctrl+`"
  },
  "StatusBar.terminalCtrl": {
    "zh": "终端 Ctrl+`",
    "en": "Terminal Ctrl+`"
  },
  "StatusBar.manageDevelopmentServicePorts": {
    "zh": "管理开发服务端口",
    "en": "Manage development service ports"
  },
  "StatusBar.agentsWorking": {
    "zh": "{value1} 个 Agent 工作中",
    "en": "{value1} Agents working"
  },
  "StatusBar.schedulesPending": {
    "zh": "{value1} 个预约等着运行",
    "en": "{value1} {value1, plural, one {schedule} other {schedules}} pending"
  },
  "StatusBar.keepingAwake": {
    "zh": "正在保持唤醒{value1}",
    "en": "Keeping awake{value1}"
  },
  "StatusBar.keepAwake": {
    "zh": "保持唤醒：{value1}",
    "en": "Keep awake: {value1}"
  },
  "StatusBar.manageAntumiWorktrees": {
    "zh": "管理 Antumi 建的 worktree",
    "en": "Manage Antumi worktrees"
  },
  "StatusBar.worktrees": {
    "zh": "{count} 个 worktree{value2}",
    "en": "{count} {count, plural, one {worktree} other {worktrees}}{value2}"
  },
  "StatusBar.cleanable": {
    "zh": "· {cleanable} 个可清理",
    "en": "· {cleanable} cleanable"
  },
  "StatusBar.manageScheduledTasksAndConversations": {
    "zh": "管理预约的任务和会话",
    "en": "Manage scheduled tasks and conversations"
  },
  "StatusBar.schedules": {
    "zh": "{waiting} 个预约",
    "en": "{waiting} {waiting, plural, one {schedule} other {schedules}}"
  },
  "StatusBar.failedToStart": {
    "zh": "· {failed} 个没能开始",
    "en": "· {failed} failed to start"
  },
  "StatusIcon.waitingForTasksToFinish": {
    "zh": "等待 {waiting} 个任务完成",
    "en": "Waiting for {waiting} {waiting, plural, one {task} other {tasks}} to finish"
  },
  "TaskActions.waitingFor": {
    "zh": "等待{value1}",
    "en": "Waiting for {value1}"
  },
  "TaskActions.acceptReview": {
    "zh": "验收通过",
    "en": "Accept review"
  },
  "TaskActions.accept": {
    "zh": "接受",
    "en": "Accept"
  },
  "TaskActions.markDone": {
    "zh": "标记完成",
    "en": "Mark done"
  },
  "TaskActions.cannotYet": {
    "zh": "还不能{label}：{reason}",
    "en": "Cannot {label} yet: {reason}"
  },
  "TaskActions.cannotYet_1957": {
    "zh": "还不能{label}",
    "en": "Cannot {label} yet"
  },
  "TaskActions.viewPlanning": {
    "zh": "查看规划",
    "en": "View planning"
  },
  "TaskActions.startExecution": {
    "zh": "开始执行",
    "en": "Start execution"
  },
  "TaskActions.answer": {
    "zh": "回答",
    "en": "Answer"
  },
  "TaskActions.submitForReview": {
    "zh": "提交验收",
    "en": "Submit for review"
  },
  "TaskActions.deleteTaskExistingWorktreesAreKept": {
    "zh": "删除任务「{value1}」？{value2}已有的 worktree 会保留。",
    "en": "Delete task “{value1}”? {value2}Existing worktrees are kept."
  },
  "TaskActions.theRunningAgentWillBeStopped": {
    "zh": "正在运行的 agent 会被停止，",
    "en": "The running Agent will be stopped; "
  },
  "TaskActions.agentWillStop": {
    "zh": "Agent 会停下，",
    "en": "Agent will stop; "
  },
  "TaskActions.cancelTaskChatHistoryAndWorktreesAreKept": {
    "zh": "取消任务「{value1}」？{stops}聊天记录和 worktree 都保留，之后可以重新打开。",
    "en": "Cancel task “{value1}”? {stops}Chat history and worktrees are kept. You can reopen it later."
  },
  "TaskActions.reopen": {
    "zh": "重新打开",
    "en": "Reopen"
  },
  "TaskActions.cancelTask": {
    "zh": "取消任务",
    "en": "Cancel task"
  },
  "TaskActions.redo": {
    "zh": "重做",
    "en": "Redo"
  },
  "TaskActions.redoFromScratchSaveThisAttemptSChanges": {
    "zh": "重做：从头再来，这次的改动另存到一个分支",
    "en": "Redo from scratch; save this attempt's changes on another branch"
  },
  "TaskActions.discardThisResultAndCreateASuccessorTask": {
    "zh": "重做：放弃这次结果，新建一个继承它的任务",
    "en": "Discard this result and create a successor task"
  },
  "TaskActions.redoTask": {
    "zh": "重做任务",
    "en": "Redo task"
  },
  "TaskActions.redoFromScratch": {
    "zh": "从头重做",
    "en": "Redo from scratch"
  },
  "TaskActions.agentStopsThisAttemptSChangesIncludingUncommitted": {
    "zh": "Agent 会停下，这次的改动（包括没提交的）另存到分支 {value1}，任务分支从头开始，任务回到「未执行」。聊天记录保留，下次开始时 Agent 重新起步，并会知道原因和上次的分支。",
    "en": "Agent stops. This attempt's changes, including uncommitted edits, are saved on branch {value1}. The task branch starts over and returns to Pending. Chat history is kept; next time Agent starts fresh with the reason and previous branch."
  },
  "TaskActions.createATaskInheritingTheTitleDetailsProjects": {
    "zh": "会新建一个继承标题、详情、项目和依赖的任务，从干净的分支开始。这次的 worktree 会保留，依赖本任务的任务改为依赖新任务。",
    "en": "Create a task inheriting the title, details, projects, and dependencies, starting on a clean branch. This worktree is kept, and dependent tasks are updated to depend on the new task."
  },
  "TaskActions.whyRedoOptionalSharedWithTheNextAgent": {
    "zh": "为什么重做？（可选，会告诉下次的 Agent）",
    "en": "Why redo? (Optional; shared with the next Agent)"
  },
  "TaskActions.back": {
    "zh": "返回",
    "en": "Back"
  },
  "TaskActions.redoing": {
    "zh": "正在重做…",
    "en": "Redoing…"
  },
  "TaskActions.planningViewConversation": {
    "zh": "{value1}规划中，查看对话",
    "en": "{value1}Planning; view conversation"
  },
  "TaskActions.planningViewConversation_1979": {
    "zh": "规划中，查看对话",
    "en": "Planning; view conversation"
  },
  "TaskActions.use": {
    "zh": "用 {value1}{value2}。",
    "en": "Use {value1}{value2}."
  },
  "TaskActions.scheduled": {
    "zh": "{value1}已预约：{state}",
    "en": "{value1}Scheduled: {state}"
  },
  "TaskActions.viewScheduledExecution": {
    "zh": "查看预约的执行",
    "en": "View scheduled execution"
  },
  "TaskActions.scheduled_1983": {
    "zh": "已预约：{state}",
    "en": "Scheduled: {state}"
  },
  "TaskActions.scheduleExecution": {
    "zh": "预约执行",
    "en": "Schedule execution"
  },
  "TaskActions.cannotScheduleYet": {
    "zh": "还不能预约：{reason}",
    "en": "Cannot schedule yet: {reason}"
  },
  "TaskActions.scheduleExecutionWhenQuotaResetsOrAtA": {
    "zh": "预约执行：额度恢复后或到点自动开始",
    "en": "Schedule execution when quota resets or at a chosen time"
  },
  "TaskActions.cannotScheduleYet_1987": {
    "zh": "还不能预约",
    "en": "Cannot schedule yet"
  },
  "TaskActions.implementTheSavedPlanWhenDueWithoutPlanning": {
    "zh": "到点后按保存的计划直接实现，不再先规划。",
    "en": "Implement the saved plan when due, without planning again."
  },
  "TaskActions.implementTaskDetailsWhenDueWithoutPlanningAgain": {
    "zh": "到点后按任务详情直接实现，不再先规划。",
    "en": "Implement task details when due, without planning again."
  },
  "TaskActions.startAnalysis": {
    "zh": "开始分析",
    "en": "Start analysis"
  },
  "TaskActions.executeDirectly": {
    "zh": "直接执行",
    "en": "Execute directly"
  },
  "TaskActions.chooseHowToStart": {
    "zh": "选择怎么开始",
    "en": "Choose how to start"
  },
  "TaskActions.howToStart": {
    "zh": "怎么开始",
    "en": "How to start"
  },
  "TaskActions.dependenciesAreUnfinishedOnlyPlanningIsAvailableNow": {
    "zh": "依赖的任务还没完成，现在只能先规划。",
    "en": "Dependencies are unfinished. Only planning is available now."
  },
  "TaskActions.planFirst": {
    "zh": "先规划",
    "en": "Plan first"
  },
  "TaskActions.thisTaskSWorktrees": {
    "zh": "这个任务的 {value1} 个 worktree",
    "en": "This task's {value1} {value1, plural, one {worktree} other {worktrees}}"
  },
  "TaskActions.thisTaskSWorktree": {
    "zh": "这个任务的 worktree",
    "en": "This task's worktree"
  },
  "TaskActions.copyTaskId": {
    "zh": "{value1}复制任务 id{value2}",
    "en": "{value1}Copy task ID{value2}"
  },
  "TaskActions.cleanWorktree": {
    "zh": "{value1}清理 worktree{value2}",
    "en": "{value1}Clean worktree{value2}"
  },
  "TaskActions.branchKept": {
    "zh": "分支保留",
    "en": "Branch kept"
  },
  "TaskActions.deleteTask": {
    "zh": "{value1}删除任务",
    "en": "{value1}Delete task"
  },
  "TaskActions.viewDetails": {
    "zh": "查看详情",
    "en": "View details"
  },
  "TaskActions.viewChat": {
    "zh": "查看聊天",
    "en": "View chat"
  },
  "TaskActions.handOffToAnotherAgent": {
    "zh": "移交给其他 Agent",
    "en": "Hand off to another Agent"
  },
  "TaskActions.cannotHandOffYet": {
    "zh": "还不能移交：{blocker}",
    "en": "Cannot hand off yet: {blocker}"
  },
  "TaskActions.status": {
    "zh": "状态",
    "en": "Status"
  },
  "TaskActions.actionsForTask": {
    "zh": "任务「{value1}」的操作",
    "en": "Actions for task “{value1}”"
  },
  "TaskActions.copyTaskId_2008": {
    "zh": "复制任务 id",
    "en": "Copy task ID"
  },
  "TaskActions.cleanWorktree_2009": {
    "zh": "清理 worktree",
    "en": "Clean worktree"
  },
  "TaskActions.deleteTask_2010": {
    "zh": "删除任务",
    "en": "Delete task"
  },
  "TaskActivity.running": {
    "zh": "执行中",
    "en": "Running"
  },
  "TaskActivity.agentsRunning": {
    "zh": "{value1} 个 Agent 执行中",
    "en": "{value1} Agents running"
  },
  "TaskAlerts.waitingForYourReply": {
    "zh": "等你回复",
    "en": "Waiting for your reply"
  },
  "TaskAlerts.agentFinishedThisTurnAndAwaitsYourReply": {
    "zh": "Agent 这一轮做完了，等你回复或确认",
    "en": "Agent finished this turn and awaits your reply or approval"
  },
  "TaskBoard.backToTaskBoardEsc": {
    "zh": "回到任务看板 Esc",
    "en": "Back to task board Esc"
  },
  "TaskBoard.byRecentActivity": {
    "zh": "按最近活动",
    "en": "By recent activity"
  },
  "TaskBoard.byCreationTime": {
    "zh": "按创建时间",
    "en": "By creation time"
  },
  "TaskBoard.byTitle": {
    "zh": "按标题",
    "en": "By title"
  },
  "TaskBoard.titleSourceKeyOrTaskId": {
    "zh": "标题、来源编号或任务 id",
    "en": "Title, source key, or task ID"
  },
  "TaskBoard.newTask": {
    "zh": "新建任务 {value1}",
    "en": "New task {value1}"
  },
  "TaskBoard.empty": {
    "zh": "空",
    "en": "Empty"
  },
  "TaskBoard.showEarlier": {
    "zh": "显示更早的 {hidden} 个",
    "en": "Show {hidden} earlier"
  },
  "TaskBoard.planSaved": {
    "zh": "计划已保存",
    "en": "Plan saved"
  },
  "TaskBoard.planning": {
    "zh": "规划中",
    "en": "Planning"
  },
  "TaskBoard.waitingForDependencies": {
    "zh": "等待依赖",
    "en": "Waiting for dependencies"
  },
  "TaskBoard.dependencies": {
    "zh": "，依赖：{titles}",
    "en": ", depends on: {titles}"
  },
  "TaskDetail.autoRun": {
    "zh": "自动执行",
    "en": "Auto-run"
  },
  "TaskDetail.autoRunHint": {
    "zh": "全部依赖完成后，自动开始此任务。",
    "en": "Start this task automatically once all dependencies are complete."
  },
  "TaskDetail.autoRunNeedsDependencies": {
    "zh": "添加依赖后可开启自动执行。",
    "en": "Add a dependency to enable auto-run."
  },
  "TaskDetail.autoRunUnsupportedAgent": {
    "zh": "此 Agent 暂不支持自动执行。",
    "en": "This Agent does not support unattended execution."
  },
  "TaskDetail.autoRunCancelled": {
    "zh": "自动执行已关闭",
    "en": "Auto-run turned off"
  },
  "schedules.executeAfterDependencies": {
    "zh": "依赖完成后自动执行",
    "en": "Run automatically after dependencies complete"
  },
  "TaskBoard.cannotYet": {
    "zh": "还不能{value1}：{value2}",
    "en": "Cannot {value1} yet: {value2}"
  },
  "TaskBoard.filterByProject": {
    "zh": "按项目筛选",
    "en": "Filter by project"
  },
  "TaskBoard.allProjects": {
    "zh": "全部项目",
    "en": "All projects"
  },
  "TaskBoard.filterByAgent": {
    "zh": "按 Agent 筛选",
    "en": "Filter by Agent"
  },
  "TaskBoard.allAgents": {
    "zh": "全部 Agent",
    "en": "All Agents"
  },
  "TaskChat.assignedToDevelopmentSquad": {
    "zh": "已交给团队执行",
    "en": "Assigned to team"
  },
  "TaskChat.savedExecuteAfterDependenciesFinish": {
    "zh": "已保存，依赖完成后执行",
    "en": "Saved; execute after dependencies finish"
  },
  "TaskChat.uncommittedTaskWorktreeChangesClickToViewIn": {
    "zh": "任务 worktree 里还没提交的改动；点开检查器看",
    "en": "Uncommitted task worktree changes; click to view in inspector"
  },
  "TaskChat.chat": {
    "zh": "{value1} 的聊天",
    "en": "{value1} chat"
  },
  "TaskChat.leaderIsPlanning": {
    "zh": "队长规划中",
    "en": "Team lead is planning"
  },
  "TaskChat.readOnlyPlanning": {
    "zh": "只读规划",
    "en": "Read-only planning"
  },
  "TaskChat.viewSquadInInspector": {
    "zh": "在检查器里看团队",
    "en": "View team in inspector"
  },
  "TaskChat.backToLeader": {
    "zh": "返回队长",
    "en": "Back to team lead"
  },
  "TaskChat.loadingMemberConversation": {
    "zh": "正在读取成员会话…",
    "en": "Loading member conversation…"
  },
  "TaskChat.theLeaderCoordinatesMemberAssignmentsReturnToThe": {
    "zh": "成员的分工由队长协调；请返回队长交流。",
    "en": "The team lead coordinates member assignments. Return to the team lead to discuss."
  },
  "TaskChat.startingSyncingCodeAndPreparingWorkspaceThisMay": {
    "zh": "正在启动 {value1}：同步最新代码、准备工作区，稍等几秒…",
    "en": "Starting {value1}: syncing code and preparing workspace. This may take a few seconds…"
  },
  "TaskChat.loadingChatHistory": {
    "zh": "正在读取聊天记录…",
    "en": "Loading chat history…"
  },
  "TaskDetail.saved": {
    "zh": "已保存",
    "en": "Saved"
  },
  "TaskDetail.saveFailedRetriesAutomaticallyAfterCoreReconnects": {
    "zh": "保存失败，连上 core 后会自动重试",
    "en": "Save failed; retries automatically after core reconnects"
  },
  "TaskDetail.cancelled": {
    "zh": "已取消{value1}。{value2}",
    "en": "Cancelled{value1}.{value2}"
  },
  "TaskDetail.continuedByThisWorktreeRemainsOnDisk": {
    "zh": "由{value1}接着做，这次的 worktree 仍保留在磁盘上。",
    "en": "Continued by {value1}; this worktree remains on disk."
  },
  "TaskDetail.redoneTimes": {
    "zh": "已重做 {value1} 次{value2}。{value3}",
    "en": "Redone {value1} {value1, plural, one {time} other {times}}{value2}.{value3}"
  },
  "TaskDetail.lastReason": {
    "zh": "，上次的原因：{value1}",
    "en": "; last reason: {value1}"
  },
  "TaskDetail.previousChangesAreOnBranch": {
    "zh": "之前的改动在分支 {value1}。",
    "en": "Previous changes are on branch {value1}."
  },
  "TaskDetail.redoneFromAbandoned": {
    "zh": "重做自{value1}（已放弃{value2}）",
    "en": "Redone from {value1} (abandoned{value2})"
  },
  "TaskDetail.taskProperties": {
    "zh": "任务属性",
    "en": "Task properties"
  },
  "TaskDetail.dependencies": {
    "zh": "依赖",
    "en": "Dependencies"
  },
  "TaskDetail.dependents": {
    "zh": "被依赖",
    "en": "Dependents"
  },
  "TaskDetail.created": {
    "zh": "创建于 {value1}",
    "en": "Created {value1}"
  },
  "TaskDetail.goalContextAcceptanceCriteriaImportantFilesMarkdownSupported": {
    "zh": "目标、背景、验收标准、需要注意的文件…支持 Markdown，写下后会作为 prompt 交给 Agent",
    "en": "Goal, context, acceptance criteria, important files… Markdown supported. Passed to Agent as the task prompt"
  },
  "TaskExecutorPicker.chooseLater": {
    "zh": "以后再选",
    "en": "Choose later"
  },
  "TaskExecutorPicker.recommendedSingleAgent": {
    "zh": "推荐 · 单 Agent",
    "en": "Recommended · Single Agent"
  },
  "TaskExecutorPicker.singleAgent": {
    "zh": "单 Agent",
    "en": "Single Agent"
  },
  "TaskExecutorPicker.developmentSquadMembers": {
    "zh": "团队 · {value1} 名成员{value2}",
    "en": "Team · {value1} {value1, plural, one {member} other {members}}{value2}"
  },
  "TaskExecutorPicker.archived": {
    "zh": " · 已归档",
    "en": " · Archived"
  },
  "TaskExecutorPicker.taskAssignee": {
    "zh": "任务执行者",
    "en": "Task assignee"
  },
  "TaskInspector.thisTaskHasNoWorktreeYetAgentChanges": {
    "zh": "任务还没有 worktree，执行过之后这里会列出 Agent 的改动。",
    "en": "This task has no worktree yet. Agent changes appear here after execution."
  },
  "TaskInspector.since": {
    "zh": "从 {value1} 起",
    "en": "Since {value1}"
  },
  "TaskInspector.changes": {
    "zh": "改动",
    "en": "Changes"
  },
  "TaskInspector.noChangesFromStartingPoint": {
    "zh": "和起点相比没有改动",
    "en": "No changes from starting point"
  },
  "TaskInspector.taskInspector": {
    "zh": "任务检查器",
    "en": "Task inspector"
  },
  "TaskLaunchDialog.startTask": {
    "zh": "开始任务",
    "en": "Start task"
  },
  "TaskLaunchDialog.mode": {
    "zh": "模式",
    "en": "Mode"
  },
  "TaskLaunchDialog.dependenciesAreUnfinishedOnlyPlanningIsAvailableNow": {
    "zh": "依赖任务尚未完成，现在只能规划。",
    "en": "Dependencies are unfinished. Only planning is available now."
  },
  "TaskLaunchDialog.planFirstThenExecuteAfterApproval": {
    "zh": "先制定计划，确认后执行。",
    "en": "Plan first, then execute after approval."
  },
  "TaskPlanCard.approvedPlan": {
    "zh": "已确认的计划",
    "en": "Approved plan"
  },
  "TaskPlanCard.savedPlan": {
    "zh": "已保存的计划",
    "en": "Saved plan"
  },
  "TaskPlanCard.sharedWithAgentWhenExecutionStarts": {
    "zh": " · 开始执行时交给 Agent",
    "en": " · Shared with Agent when execution starts"
  },
  "TaskPlanCard.chooseDevelopmentSquad": {
    "zh": "选择团队",
    "en": "Choose team"
  },
  "TaskQuickAdd.writeATask": {
    "zh": "＋ 写下一个任务{value1}",
    "en": "＋ Write a task{value1}"
  },
  "TaskQuickAdd.newTaskTitle": {
    "zh": "新任务的标题",
    "en": "New task title"
  },
  "TaskQuickAdd.whatNeedsDoingOneSentenceIsEnough": {
    "zh": "要做什么？一句话就够",
    "en": "What needs doing? One sentence is enough"
  },
  "TaskQuickAdd.create": {
    "zh": "{value1} 创建",
    "en": "{value1} Create"
  },
  "TaskQuickAdd.moreOptions": {
    "zh": "{value1} 更多选项",
    "en": "{value1} More options"
  },
  "TaskQuickAdd.collapse": {
    "zh": "{value1} 收起",
    "en": "{value1} Collapse"
  },
  "TaskQuickAdd.projectsForNewTask": {
    "zh": "新任务的项目",
    "en": "Projects for new task"
  },
  "TaskQuickAdd.chooseProject": {
    "zh": "选择项目",
    "en": "Choose project"
  },
  "TaskQuickAdd.noProjectChooseLater": {
    "zh": "无项目，之后再选",
    "en": "No project; choose later"
  },
  "TaskQuickAdd.agentForNewTask": {
    "zh": "新任务的 Agent",
    "en": "Agent for new task"
  },
  "TaskQuickAdd.chooseLater": {
    "zh": "之后再选",
    "en": "Choose later"
  },
  "TaskStarts.chooseStartingPoint": {
    "zh": "选择起点",
    "en": "Choose starting point"
  },
  "TaskStarts.default": {
    "zh": "默认：{value1}",
    "en": "Default: {value1}"
  },
  "TaskStarts.projectSCurrentBranch": {
    "zh": "项目当前的分支：{value1}",
    "en": "Project's current branch: {value1}"
  },
  "TaskStarts.useWhicheverBranchIsCheckedOutInThis": {
    "zh": "你在这个项目里检出的是哪个就用哪个",
    "en": "Use whichever branch is checked out in this project"
  },
  "TaskStarts.task": {
    "zh": "任务「{value1}」",
    "en": "Task “{value1}”"
  },
  "TaskStarts.localAndRemoteBranchesRemoteBranchesAreFetched": {
    "zh": "本地和远端的分支；选远端分支时，开始前先拉取最新的",
    "en": "Local and remote branches; remote branches are fetched before starting"
  },
  "TaskStarts.startingPointFor": {
    "zh": "{value1} 的起点：{value2}",
    "en": "Starting point for {value1}: {value2}"
  },
  "TaskStarts.whereToBranchTheTaskFor": {
    "zh": "{value1} 的任务分支从哪里拉出",
    "en": "Where to branch the task for {value1}"
  },
  "TaskStarts.dependencyTaskChangesAreNotIncluded": {
    "zh": "不会带上依赖任务的改动",
    "en": "Dependency task changes are not included"
  },
  "TaskStarts.reference": {
    "zh": "只读参考",
    "en": "Reference only"
  },
  "TaskStarts.referenceDescription": {
    "zh": "不建 worktree，Agent 只读不改",
    "en": "No worktree; the agent reads it and changes nothing"
  },
  "TaskStarts.needsReference": {
    "zh": "需设为只读参考",
    "en": "Set as reference"
  },
  "TaskStarts.aFolderThatIsNoGitRepository": {
    "zh": "多项目任务里，非 Git 文件夹只能作为只读参考",
    "en": "In a task with several projects, a folder outside Git can only be a reference"
  },
  "OtherProjectsHint.summary": {
    "zh": "{value1} 只能用命令访问附加项目",
    "en": "{value1} reaches other projects only through commands"
  },
  "OtherProjectsHint.detail": {
    "zh": "{value1} 的文件工具只能读写主项目。附加项目和只读参考项目要靠运行命令访问，多数模式下每条命令都要你批准。",
    "en": "{value1}'s file tools reach only the primary project. It gets at other projects, reference ones included, by running commands, which most modes ask you to approve."
  },
  "TaskStarts.startingPoint": {
    "zh": "起点",
    "en": "Starting point"
  },
  "TerminalCommandsMenu.insertIntoCommandLineWithoutPressingEnter": {
    "zh": "{value1}\n只填到命令行，不按回车",
    "en": "{value1}\nInsert into command line without pressing Enter"
  },
  "TerminalCommandsMenu.insert": {
    "zh": "插入",
    "en": "Insert"
  },
  "TerminalCommandsMenu.edit": {
    "zh": "编辑 {title}",
    "en": "Edit {title}"
  },
  "TerminalCommandsMenu.confirmDeletionOf": {
    "zh": "确认删除 {title}",
    "en": "Confirm deletion of {title}"
  },
  "TerminalCommandsMenu.delete": {
    "zh": "删除 {title}",
    "en": "Delete {title}"
  },
  "TerminalCommandsMenu.clickAgainToDelete": {
    "zh": "再点一次删除",
    "en": "Click again to delete"
  },
  "TerminalCommandsMenu.editSavedCommand": {
    "zh": "编辑常用命令",
    "en": "Edit saved command"
  },
  "TerminalCommandsMenu.addSavedCommand": {
    "zh": "添加常用命令",
    "en": "Add saved command"
  },
  "TerminalCommandsMenu.commandEGPnpmDevCore": {
    "zh": "命令，如 pnpm dev:core",
    "en": "Command, e.g. pnpm dev:core"
  },
  "TerminalCommandsMenu.nameOptionalEGStartCore": {
    "zh": "名称（可选），如「启动 core」",
    "en": "Name (optional), e.g. “Start core”"
  },
  "TerminalCommandsMenu.runDirectly": {
    "zh": "直接执行{value1}",
    "en": "Run directly{value1}"
  },
  "TerminalCommandsMenu.clickToRun": {
    "zh": "：点一下就运行",
    "en": ": click to run"
  },
  "TerminalCommandsMenu.insertIntoCommandLineEditBeforePressingEnter": {
    "zh": "：只填到命令行，按回车前还能改",
    "en": ": insert into command line; edit before pressing Enter"
  },
  "TerminalCommandsMenu.showInTerminals": {
    "zh": "在哪些终端里显示",
    "en": "Show in terminals"
  },
  "TerminalCommandsMenu.allTerminals": {
    "zh": "所有终端",
    "en": "All terminals"
  },
  "TerminalCommandsMenu.only": {
    "zh": "仅 {value1}",
    "en": "Only {value1}"
  },
  "TerminalCommandsMenu.currentProject": {
    "zh": "当前项目",
    "en": "Current project"
  },
  "TerminalCommandsMenu.terminalIsNotConnectedYetTryAgainShortly": {
    "zh": "终端还没连上，稍后再试",
    "en": "Terminal is not connected yet. Try again shortly"
  },
  "TerminalCommandsMenu.savedCommands": {
    "zh": "常用命令",
    "en": "Saved commands"
  },
  "TerminalCommandsMenu.searchSavedCommandsEnterToRunTheFirst": {
    "zh": "搜索常用命令，回车运行第一条",
    "en": "Search saved commands; Enter to run the first"
  },
  "TerminalCommandsMenu.searchSavedCommands": {
    "zh": "搜索常用命令",
    "en": "Search saved commands"
  },
  "TerminalCommandsMenu.noMatchingCommands": {
    "zh": "没有匹配的命令",
    "en": "No matching commands"
  },
  "TerminalCommandsMenu.noSavedCommandsAvailableForThisTerminal": {
    "zh": "这个终端还没有可用的常用命令",
    "en": "No saved commands available for this terminal"
  },
  "TerminalCommandsMenu.addSavedCommand_2121": {
    "zh": "{value1}添加常用命令{value2}",
    "en": "{value1}Add saved command{value2}"
  },
  "TerminalCommandsMenu.selectedTerminalTextIsFilledInAutomatically": {
    "zh": "选中终端里的文字可直接带入",
    "en": "Selected terminal text is filled in automatically"
  },
  "TerminalPanel.quotedIn": {
    "zh": "已引用到「{title}」",
    "en": "Quoted in “{title}”"
  },
  "TerminalPanel.quotedInComposer": {
    "zh": "已引用到输入框",
    "en": "Quoted in composer"
  },
  "TerminalPanel.quoteInChat": {
    "zh": "{value1}引用到对话",
    "en": "{value1}Quote in chat"
  },
  "TerminalPanel.quoteInComposer": {
    "zh": "引用到「{title}」的输入框",
    "en": "Quote in “{title}” composer"
  },
  "TerminalPanel.quoteInChatComposer": {
    "zh": "引用到对话的输入框",
    "en": "Quote in chat composer"
  },
  "TerminalPanel.openAConversationBeforeQuoting": {
    "zh": "先打开一个会话，再引用",
    "en": "Open a conversation before quoting"
  },
  "TerminalPanel.ended": {
    "zh": "\n已结束{value1}",
    "en": "\nEnded{value1}"
  },
  "TerminalPanel.exitCode": {
    "zh": "，退出码 {value1}",
    "en": ", exit code {value1}"
  },
  "TerminalPanel.agentRun": {
    "zh": "{value1} 的 Agent 运行：",
    "en": "{value1} Agent run:"
  },
  "TerminalPanel.closeTerminal": {
    "zh": "关闭终端 {value1}",
    "en": "Close terminal {value1}"
  },
  "TerminalPanel.closeEndThisTerminal": {
    "zh": "关闭：结束这个终端",
    "en": "Close: end this terminal"
  },
  "TerminalPanel.newTerminal": {
    "zh": "新建终端",
    "en": "New terminal"
  },
  "TerminalPanel.hideTerminal": {
    "zh": "隐藏终端",
    "en": "Hide terminal"
  },
  "TerminalPanel.hideTerminalKeepsRunning": {
    "zh": "隐藏（终端继续运行）",
    "en": "Hide (terminal keeps running)"
  },
  "TitleNamingSettings.conversationTitleNaming": {
    "zh": "会话标题命名",
    "en": "Conversation title naming"
  },
  "TitleNamingSettings.whenOffUseTheFirstMessageWhenOn": {
    "zh": "关闭时沿用首条消息；开启后由同一 Agent 的轻量模型总结。手动重命名优先，每次总结计入少量用量。",
    "en": "When off, use the first message. When on, the same Agent's quick model summarizes it. Manual names take priority; each summary uses a small amount of quota."
  },
  "TitleNamingSettings.summarizeFirstTurn": {
    "zh": "首轮总结",
    "en": "Summarize first turn"
  },
  "TitleNamingSettings.updateEveryTurn": {
    "zh": "每轮更新",
    "en": "Update every turn"
  },
  "TodoPanel.needsYou": {
    "zh": "需要你",
    "en": "Needs you"
  },
  "TodoPanel.agentCanDo": {
    "zh": "Agent 可做",
    "en": "Agent can do"
  },
  "TodoPanel.incompleteGroups": {
    "zh": "{left} 项未完成 · {value2} 组",
    "en": "{left} incomplete · {value2} {value2, plural, one {group} other {groups}}"
  },
  "TodoPanel.add": {
    "zh": "＋ 添加",
    "en": "＋ Add"
  },
  "TodoPanel.noToDosYetWhenAgentListsThings": {
    "zh": "还没有待办。Agent 在回复里列出要你之后处理的事（上线前要做的、要和人对齐的、要你去验证的）时会记在这里，你也可以自己添加。",
    "en": "No to-dos yet. When Agent lists things for you to do later, such as pre-release work, coordination, or verification, it records them here. You can also add your own."
  },
  "TodoPanel.completedGroups": {
    "zh": "已完成 {value1} 组",
    "en": "{value1} completed groups"
  },
  "TodoPanel.deleteToDoGroup": {
    "zh": "删除「{value1}」这一组待办？",
    "en": "Delete to-do group “{value1}”?"
  },
  "TodoPanel.markAllOfIncomplete": {
    "zh": "把「{value1}」整组改回未完成",
    "en": "Mark all of “{value1}” incomplete"
  },
  "TodoPanel.markAllOfComplete": {
    "zh": "把「{value1}」整组标成完成",
    "en": "Mark all of “{value1}” complete"
  },
  "TodoPanel.groupTitle": {
    "zh": "这一组的标题",
    "en": "Group title"
  },
  "TodoPanel.clickToEditTitle": {
    "zh": "点击修改标题",
    "en": "Click to edit title"
  },
  "TodoPanel.addItem": {
    "zh": "添加一项",
    "en": "Add item"
  },
  "TodoPanel.deleteGroup": {
    "zh": "删除这一组",
    "en": "Delete group"
  },
  "TodoPanel.newItem": {
    "zh": "新的一项",
    "en": "New item"
  },
  "TodoPanel.markIncomplete": {
    "zh": "改回未完成",
    "en": "Mark incomplete"
  },
  "TodoPanel.markComplete": {
    "zh": "标成完成",
    "en": "Mark complete"
  },
  "TodoPanel.thisItem": {
    "zh": "这一项",
    "en": "This item"
  },
  "TodoPanel.assignToAgentPutInComposerForIt": {
    "zh": "交给 Agent：放进输入框，让它去做",
    "en": "Assign to Agent: put in composer for it to handle"
  },
  "TodoPanel.titleEGBeforeRelease": {
    "zh": "标题，如「上线前」",
    "en": "Title, e.g. “Before release”"
  },
  "TodoPanel.items": {
    "zh": "每一项",
    "en": "Items"
  },
  "TodoPanel.oneItemPerLine": {
    "zh": "每行一项",
    "en": "One item per line"
  },
  "TranslateButton.translatedBy": {
    "zh": "由 {value1} 翻译",
    "en": "Translated by {value1}"
  },
  "TranslateButton.translatedByThisAgentSDefaultModel": {
    "zh": "由这个 Agent 的默认模型翻译",
    "en": "Translated by this Agent's default model"
  },
  "TranslateButton.viewTranslation": {
    "zh": "看译文（{by}）",
    "en": "View translation ({by})"
  },
  "TranslateButton.viewOriginalTranslationBy": {
    "zh": "看原文（这是{by}的译文）",
    "en": "View original (translation by {by})"
  },
  "TranslateButton.clickToRetry": {
    "zh": "{value1}，点击重试",
    "en": "{value1}; click to retry"
  },
  "TranslateButton.translateUsingThisAgentSSmallModel": {
    "zh": "用这个 Agent 的小模型翻译{what}",
    "en": "Translate {what} using this Agent's small model"
  },
  "TranslateButton.retryTranslation": {
    "zh": "重试翻译",
    "en": "Retry translation"
  },
  "UsageBar.signInCredentialsExpiredRunToRefresh": {
    "zh": "登录凭据已过期，运行一次 {value1} 即可刷新",
    "en": "Sign-in credentials expired. Run {value1} to refresh"
  },
  "UsageBar.failedToLoadRetriesAutomatically": {
    "zh": "读取失败，稍后自动重试",
    "en": "Failed to load; retries automatically"
  },
  "UsageBar.noExpirationDate": {
    "zh": "没有过期时间",
    "en": "No expiration date"
  },
  "UsageBar.expired": {
    "zh": "已过期",
    "en": "Expired"
  },
  "UsageBar.expiresLeft": {
    "zh": "{value1}月{value2}日 {time} 过期（还有 {value4}）",
    "en": "Expires {value1}/{value2} {time} ({value4} left)"
  },
  "UsageBar.usingResetCard": {
    "zh": "{value1}正在使用重置卡…",
    "en": "{value1}Using reset card…"
  },
  "UsageBar.confirmUse": {
    "zh": "确认使用",
    "en": "Confirm use"
  },
  "UsageBar.upgradeClaudeCodeToSeeAvailableResetCards": {
    "zh": "升级 Claude Code 后，这里会显示可用的重置卡",
    "en": "Upgrade Claude Code to see available reset cards here"
  },
  "UsageBar.resetCardsAvailable": {
    "zh": "可用重置卡 {value1} 张",
    "en": "{value1} reset cards available"
  },
  "UsageBar.resetCards": {
    "zh": "重置卡",
    "en": "Reset cards"
  },
  "UsageBar.moreWithoutExpirationDates": {
    "zh": "另有 {unlisted} 张没有给出过期时间",
    "en": "{unlisted} more without expiration dates"
  },
  "UsageBar.useOneResetCard": {
    "zh": "使用一张重置卡",
    "en": "Use one reset card"
  },
  "UsageBar.upcomingSource": {
    "zh": "预告来源",
    "en": "Announcement source"
  },
  "UsageBar.latestSource": {
    "zh": "上次来源",
    "en": "Previous reset source"
  },
  "UsageBar.basedOnAnnouncementsOnXUnofficialInformationData": {
    "zh": "据 X 上的公告，非官方消息。数据来自 {value1} 和 {value2}",
    "en": "Based on announcements on X; unofficial information. Data from {value1} and {value2}"
  },
  "UsageBar.dataSources": {
    "zh": "数据来源",
    "en": "Data sources"
  },
  "UsageBar.advice": {
    "zh": "建议",
    "en": "Advice"
  },
  "UsageBar.dataAsOf": {
    "zh": "（数据停留在 {value1}）",
    "en": "(Data as of {value1})"
  },
  "UsageBar.runsOutAt": {
    "zh": "按目前速度，约{value1}用完",
    "en": "At this rate, runs out around {value1}"
  },
  "UsageBar.updatedAgo": {
    "zh": "{value1}前更新",
    "en": "Updated {value1} ago"
  },
  "UsageBar.usageQuota": {
    "zh": "{value1} 用量额度",
    "en": "{value1} usage quota"
  },
  "UsageBar.usedRemaining": {
    "zh": "已用 {used}%，剩余 {value2}%{value3}",
    "en": "{used}% used, {value2}% remaining{value3}"
  },
  "UsageBar.refreshing": {
    "zh": "刷新中…",
    "en": "Refreshing…"
  },
  "UsageBar.refreshNow": {
    "zh": "立即刷新",
    "en": "Refresh now"
  },
  "UsageBar.resetCards_2190": {
    "zh": "重置卡 {value1}",
    "en": "Reset cards {value1}"
  },
  "UsageBar.resettingSoon": {
    "zh": "即将重置",
    "en": "Resetting soon"
  },
  "UsageBar.quotaAdviceAvailable": {
    "zh": "有额度建议",
    "en": "Quota advice available"
  },
  "UsageBar.agentUsageQuota": {
    "zh": "Agent 用量额度",
    "en": "Agent usage quota"
  },
  "UsageBar.loadingUsageQuota": {
    "zh": "正在读取用量额度…",
    "en": "Loading usage quota…"
  },
  "UsageBar.noSignInDetectedForUsageQuotaAppears": {
    "zh": "未检测到 {value1} 的登录，登录后这里会显示用量额度",
    "en": "No sign-in detected for {value1}. Usage quota appears after signing in"
  },
  "UtilityPanelDock.resizeAnd": {
    "zh": "调整{value1}和{value2}高度",
    "en": "Resize {value1} and {value2}"
  },
  "UtilityPanelDock.uses": {
    "zh": "{value1}占 {value2}%",
    "en": "{value1} uses {value2}%"
  },
  "UtilityPanelDock.andToolbar": {
    "zh": "{value1}与{value2}工具栏",
    "en": "{value1} and {value2} toolbar"
  },
  "UtilityPanelDock.panel": {
    "zh": "{value1}栏",
    "en": "{value1} panel"
  },
  "UtilityPanelDock.toolbar": {
    "zh": "工具栏",
    "en": "Toolbar"
  },
  "WindowBrand.expandSidebar": {
    "zh": "展开侧边栏",
    "en": "Expand sidebar"
  },
  "WindowBrand.collapseSidebar": {
    "zh": "收起侧边栏",
    "en": "Collapse sidebar"
  },
  "WireLogView.failedToStart": {
    "zh": "没能启动",
    "en": "Failed to start"
  },
  "WireLogView.running": {
    "zh": "（运行中）",
    "en": "(Running)"
  },
  "WireLogView.truncated": {
    "zh": "已截断 · ",
    "en": "Truncated · "
  },
  "WireLogView.streamDeltas": {
    "zh": "流式增量",
    "en": "Stream deltas"
  },
  "WireLogView.incrementalStreamedTextCombined": {
    "zh": "一段段流出来的增量，已合在一起",
    "en": "Incremental streamed text, combined"
  },
  "WireLogView.copyCombinedText": {
    "zh": "复制合起来的文字",
    "en": "Copy combined text"
  },
  "WireLogView.entriesTo": {
    "zh": "{value1} 条，{value2} 到 {value3}",
    "en": "{value1} {value1, plural, one {entry} other {entries}}, {value2} to {value3}"
  },
  "WireLogView.loadingRawData": {
    "zh": "正在读取原始数据…",
    "en": "Loading raw data…"
  },
  "WireLogView.noRawDataForThisConversationYetWhen": {
    "zh": "这个会话还没有原始数据。记录打开后，Agent 收发的每一行都会记下来：正在运行的 Agent 从下一行开始，新启动的从启动命令开始。",
    "en": "No raw data for this conversation yet. When recording is on, every Agent line is saved: from the next line for running Agents, or from the launch command for new Agents."
  },
  "WireLogView.agentStage": {
    "zh": "Agent 的哪一段",
    "en": "Agent stage"
  },
  "WireLogView.latestStage": {
    "zh": "最新一段",
    "en": "Latest stage"
  },
  "WireLogView.searchRawData": {
    "zh": "搜索原始数据",
    "en": "Search raw data"
  },
  "WireLogView.streamDeltas_2215": {
    "zh": "流式增量 {streamCount}",
    "en": "Stream deltas {streamCount}"
  },
  "WireLogView.claudeStreamEventKeepAliveAndCodexDelta": {
    "zh": "Claude 的 stream_event、keep_alive 和 Codex 的 …/delta：一段段流出来的文字，数量很多。显示时连续的合成一行",
    "en": "Claude stream_event, keep_alive, and Codex …/delta: many small pieces of streamed text. Consecutive deltas are combined into one row"
  },
  "WireLogView.copyDisplayedLinesJsonl": {
    "zh": "复制显示的 {value1} 行（jsonl）",
    "en": "Copy {value1} displayed lines (jsonl)"
  },
  "WireLogView.showInFileManager": {
    "zh": "在文件管理器里显示",
    "en": "Show in file manager"
  },
  "WireLogView.loadEarlier": {
    "zh": "读取更早的",
    "en": "Load earlier"
  },
  "WireLogView.noLinesContain": {
    "zh": "没有包含「{value1}」的行",
    "en": "No lines contain “{value1}”"
  },
  "WireLogView.onlyStreamDeltasEnableStreamDeltasAboveTo": {
    "zh": "只有流式增量，打开上面的「流式增量」查看",
    "en": "Only stream deltas; enable “Stream deltas” above to view"
  },
  "WireLogView.sentToAgentAgentOutputStderrCombinedStream": {
    "zh": "→ 发给 Agent　← Agent 输出　! stderr　≋ 合在一起的流式增量。点一行展开。",
    "en": "→ Sent to Agent　← Agent output　! stderr　≋ Combined stream deltas. Click a row to expand."
  },
  "WorkingSummary.membersWorking": {
    "zh": "{value1} 人工作中",
    "en": "{value1} {value1, plural, one {member} other {members}} working"
  },
  "WorkingSummary.working": {
    "zh": "{value1} 工作中",
    "en": "{value1} working"
  },
  "WorktreeManager.cleanable": {
    "zh": "可以清理",
    "en": "Cleanable"
  },
  "WorktreeManager.taskCompletedOrCancelledWithNoUncommittedChanges": {
    "zh": "任务已完成或已取消，没有未提交的改动",
    "en": "Task completed or cancelled, with no uncommitted changes"
  },
  "WorktreeManager.taskOrConversationNotFound": {
    "zh": "找不到任务或会话",
    "en": "Task or conversation not found"
  },
  "WorktreeManager.taskOrConversationDeletedWorktreeRemains": {
    "zh": "任务或会话删了，worktree 还在",
    "en": "Task or conversation deleted; worktree remains"
  },
  "WorktreeManager.needsYourAttention": {
    "zh": "需要你处理",
    "en": "Needs your attention"
  },
  "WorktreeManager.cleanupWouldLoseWorkCommitMoveOrDiscard": {
    "zh": "清理会丢东西，先在终端里提交、移走或丢弃",
    "en": "Cleanup would lose work. Commit, move, or discard it in the terminal first"
  },
  "WorktreeManager.taskUnfinishedOrConversationStillExistsShowingDisk": {
    "zh": "任务还没完成或会话还在，只看占用",
    "en": "Task unfinished or conversation still exists; showing disk usage only"
  },
  "WorktreeManager.branchesAndCommitsAreKeptWorktreesAreRecreated": {
    "zh": "分支和提交都会保留，任务之后继续修改时会重建 worktree。被 .gitignore 忽略的文件（如 node_modules、.env）会一起删除。",
    "en": "Branches and commits are kept. Worktrees are recreated if you continue the task. Ignored files such as node_modules and .env are deleted with the directory."
  },
  "WorktreeManager.clean": {
    "zh": "清理{subject}？\n\n{CLEAN_NOTE}",
    "en": "Clean {subject}?\n\n{CLEAN_NOTE}"
  },
  "WorktreeManager.worktreesWereNotCleaned": {
    "zh": "有 {value1} 个 worktree 没有清理：{value2}",
    "en": "{value1} {value1, plural, one {worktree} other {worktrees}} were not cleaned: {value2}"
  },
  "WorktreeManager.clean_2235": {
    "zh": "清理 {value1}",
    "en": "Clean {value1}"
  },
  "WorktreeManager.taskOrConversationDeleted": {
    "zh": "任务或会话已删除",
    "en": "Task or conversation deleted"
  },
  "WorktreeManager.planningCheckout": {
    "zh": "规划副本",
    "en": "Planning checkout"
  },
  "WorktreeManager.noBranch": {
    "zh": "没有分支",
    "en": "No branch"
  },
  "WorktreeManager.openConversation": {
    "zh": "打开会话",
    "en": "Open conversation"
  },
  "WorktreeManager.openInTerminal": {
    "zh": "在终端里打开",
    "en": "Open in terminal"
  },
  "WorktreeManager.worktrees": {
    "zh": " {value1} 个 worktree",
    "en": " {value1} {value1, plural, one {worktree} other {worktrees}}"
  },
  "WorktreeManager.totalUsedCleanable": {
    "zh": "共 {value1} 个 · 占用 {value2}{value3} · {value4} 个可以清理",
    "en": "{value1} total · {value2} used{value3} · {value4} cleanable"
  },
  "WorktreeManager.stillCalculating": {
    "zh": "（还在统计）",
    "en": "(Still calculating)"
  },
  "WorktreeManager.cleanupDeletesOnlyWorktreeDirectories": {
    "zh": "清理只删 worktree 目录。{CLEAN_NOTE}",
    "en": "Cleanup deletes only worktree directories.{CLEAN_NOTE}"
  },
  "WorktreeManager.cleanSelected": {
    "zh": "清理所选（{value1} 个）",
    "en": "Clean selected ({value1})"
  },
  "WorktreeManager.noAntumiWorktrees": {
    "zh": "没有 Antumi 建的 worktree。",
    "en": "No Antumi worktrees."
  },
  "chatSurface.uncommittedProjectChangesMayIncludeYourOwnClick": {
    "zh": "项目里还没提交的改动，也可能有你自己的；点开检查器看",
    "en": "Uncommitted project changes may include your own; click to view in inspector"
  },
  "markdownLivePreview.clickToOpen": {
    "zh": "{PRIMARY_KEY_LABEL}点击打开",
    "en": "{PRIMARY_KEY_LABEL}click to open"
  },
  "composerPlaceholder.answerTheRequestAboveFirst": {
    "zh": "先回答上面的请求",
    "en": "Answer the request above first"
  },
  "composerPlaceholder.agentIsWorkingDraftTheNextMessageNow": {
    "zh": "Agent 正在处理，可以先写下一条；Esc 中断",
    "en": "Agent is working. Draft the next message now; Esc to interrupt"
  },
  "composerPlaceholder.draftAnotherMessageEnterQueuesItAfterThis": {
    "zh": "{value1}也可以写下一条，Enter 排到回合结束后发送{value2}；Esc 中断",
    "en": "{value1}Draft another message; Enter queues it after this turn{value2}; Esc to interrupt"
  },
  "composerPlaceholder.answerTheRequestAboveFirst_2252": {
    "zh": "先回答上面的请求，",
    "en": "Answer the request above first, "
  },
  "composerPlaceholder.enterToInsertImmediately": {
    "zh": "，{primaryKey}Enter 立刻插入",
    "en": ", {primaryKey}Enter to insert immediately"
  },
  "conversationState.justNow": {
    "zh": "刚刚",
    "en": "Just now"
  },
  "conversationState.minutesAgo": {
    "zh": "{minutes} 分钟前",
    "en": "{minutes} {minutes, plural, one {minute} other {minutes}} ago"
  },
  "conversationState.hoursAgo": {
    "zh": "{hours} 小时前",
    "en": "{hours} {hours, plural, one {hour} other {hours}} ago"
  },
  "conversationState.daysAgo": {
    "zh": "{days} 天前",
    "en": "{days} {days, plural, one {day} other {days}} ago"
  },
  "conversationState.starting": {
    "zh": "启动中",
    "en": "Starting"
  },
  "conversationState.preparingAgentYourMessageWillBeSentAfterward": {
    "zh": "正在准备 Agent，完成后发送消息",
    "en": "Preparing Agent; your message will be sent afterward"
  },
  "conversationState.awaitingApproval": {
    "zh": "等待确认",
    "en": "Awaiting approval"
  },
  "conversationState.agentHasAQuestionForYouAnswerIn": {
    "zh": "Agent 问了你一个问题，在对话里回答",
    "en": "Agent has a question for you. Answer in the conversation"
  },
  "conversationState.sendAMessageToContinue": {
    "zh": "发消息就会接着聊",
    "en": "Send a message to continue"
  },
  "coreStore.notConnectedToAntumiCore": {
    "zh": "尚未连接到 Antumi core",
    "en": "Not connected to Antumi core"
  },
  "dashboardModel.unchanged": {
    "zh": "持平",
    "en": "Unchanged"
  },
  "dashboardModel.percentagePoints": {
    "zh": "{value1} 个百分点",
    "en": "{value1} percentage points"
  },
  "dashboardModel.month": {
    "zh": "{value1}月",
    "en": "Month {value1}"
  },
  "desktopBridge.thisClientCannotOpenFilesWithTheSystem": {
    "zh": "当前客户端不支持系统打开",
    "en": "This client cannot open files with the system"
  },
  "desktopBridge.thisClientCannotOpenFilesWithOtherApps": {
    "zh": "当前客户端不支持用其他应用打开",
    "en": "This client cannot open files with other apps"
  },
  "discussionRequirements.conciseDiscussion": {
    "zh": "简洁讨论",
    "en": "Concise discussion"
  },
  "discussionRequirements.beSpecificExplainReasoningAndAimForUnder": {
    "zh": "观点具体、说明理由，每次尽量在 600 字以内",
    "en": "Be specific, explain reasoning, and aim for under 600 characters per response"
  },
  "discussionRequirements.compareApproaches": {
    "zh": "方案对比",
    "en": "Compare approaches"
  },
  "discussionRequirements.compareBenefitsCostsRisksAndApplicability": {
    "zh": "比较收益、成本、风险和适用条件",
    "en": "Compare benefits, costs, risks, and applicability"
  },
  "discussionRequirements.inDepthAnalysis": {
    "zh": "深入分析",
    "en": "In-depth analysis"
  },
  "discussionRequirements.developArgumentsFullyWithEvidenceCounterexamplesAndUncertainty": {
    "zh": "充分论证，列出证据、反例与不确定性",
    "en": "Develop arguments fully, with evidence, counterexamples, and uncertainty"
  },
  "discussions.discussing": {
    "zh": "讨论中",
    "en": "Discussing"
  },
  "discussions.pauseAfterThisRound": {
    "zh": "本轮结束后暂停",
    "en": "Pause after this round"
  },
  "discussions.summarized": {
    "zh": "已总结",
    "en": "Summarized"
  },
  "discussions.speaking": {
    "zh": "发言中",
    "en": "Speaking"
  },
  "discussions.round": {
    "zh": "第 {value1} / {value2} 轮",
    "en": "Round {value1} / {value2}"
  },
  "discussions.everyone": {
    "zh": "所有人",
    "en": "Everyone"
  },
  "environmentText.installGitWithYourSystemPackageManager": {
    "zh": "用系统的包管理器安装 git",
    "en": "Install git with your system package manager"
  },
  "environmentText.or": {
    "zh": "{value1} 或 {value2}",
    "en": "{value1} or {value2}"
  },
  "environmentText.foundVersionUnknown": {
    "zh": "已找到，版本未知",
    "en": "Found; version unknown"
  },
  "environmentText.installed": {
    "zh": "已安装 {value1}",
    "en": "Installed {value1}"
  },
  "environmentText.gitNotFoundTaskWorktreesCannotBeCreated": {
    "zh": "没有找到 Git，任务建不了 worktree",
    "en": "Git not found; task worktrees cannot be created"
  },
  "environmentText.notFound": {
    "zh": "没有找到 {value1}",
    "en": "{value1} not found"
  },
  "environmentText.agentsAreInstalledButNoneAreSignedIn": {
    "zh": "装了 Agent，但都还没登录",
    "en": "Agents are installed, but none are signed in"
  },
  "environmentText.isNotSignedIn": {
    "zh": "{value1} 还没登录",
    "en": "{value1} is not signed in"
  },
  "fileActions.finder": {
    "zh": "访达",
    "en": "Finder"
  },
  "fileActions.fileExplorer": {
    "zh": "资源管理器",
    "en": "File Explorer"
  },
  "fileActions.fileManager": {
    "zh": "文件管理器",
    "en": "File manager"
  },
  "fileActions.cannotShowIn": {
    "zh": "无法在{FILE_MANAGER}中显示：{value2}",
    "en": "Cannot show in {FILE_MANAGER}: {value2}"
  },
  "fileActions.copyFailedTryAgain": {
    "zh": "复制失败，请重试",
    "en": "Copy failed. Try again"
  },
  "fileSearchPanel.replace": {
    "zh": "替换",
    "en": "Replace"
  },
  "fileSearchPanel.matchCase": {
    "zh": "区分大小写",
    "en": "Match case"
  },
  "fileSearchPanel.wholeWord": {
    "zh": "全词匹配",
    "en": "Whole word"
  },
  "fileSearchPanel.regularExpression": {
    "zh": "正则表达式",
    "en": "Regular expression"
  },
  "fileSearchPanel.replaceAll": {
    "zh": "全部替换",
    "en": "Replace all"
  },
  "fileSearchPanel.previousShiftEnter": {
    "zh": "上一个（Shift+Enter）",
    "en": "Previous (Shift+Enter)"
  },
  "fileSearchPanel.nextEnter": {
    "zh": "下一个（Enter）",
    "en": "Next (Enter)"
  },
  "fileSearchPanel.closeEsc": {
    "zh": "关闭（Esc）",
    "en": "Close (Esc)"
  },
  "fileSearchPanel.invalidExpression": {
    "zh": "无效正则",
    "en": "Invalid expression"
  },
  "fileTreeRows.onlyTheFirstEntriesAreShown": {
    "zh": "只显示了前面的条目",
    "en": "Only the first entries are shown"
  },
  "initialMessages.sendIsUnfinishedTryAgain": {
    "zh": "发送尚未完成，请重试",
    "en": "Send is unfinished. Try again"
  },
  "labels.pending": {
    "zh": "未执行",
    "en": "Pending"
  },
  "labels.notAssignedToAgentYet": {
    "zh": "还没交给 Agent",
    "en": "Not assigned to Agent yet"
  },
  "labels.agentIsExecuting": {
    "zh": "Agent 正在执行",
    "en": "Agent is executing"
  },
  "labels.agentFinishedReviewTheResultThenAcceptRequest": {
    "zh": "Agent 已结束，等你看过结果后接受、继续修改或重做",
    "en": "Agent finished. Review the result, then accept, request changes, or redo"
  },
  "labels.resultAcceptedDependentTasksCanNowRun": {
    "zh": "结果已接受，依赖它的任务可以执行了",
    "en": "Result accepted; dependent tasks can now run"
  },
  "labels.cancelledCanBeReopened": {
    "zh": "已取消，不再做了；可以重新打开",
    "en": "Cancelled; can be reopened"
  },
  "labels.notConfiguredOrNotSignedIn": {
    "zh": "还没有设置好或没有登录",
    "en": "Not configured or not signed in"
  },
  "labels.invalidSettings": {
    "zh": "设置不对",
    "en": "Invalid settings"
  },
  "labels.authenticationFailedAccountOrTokenIsInvalidOr": {
    "zh": "认证失败：账号或 token 不对，或者已经过期",
    "en": "Authentication failed: account or token is invalid or expired"
  },
  "labels.noPermissionToAccessTheseIssues": {
    "zh": "没有权限访问这些 issue",
    "en": "No permission to access these issues"
  },
  "labels.invalidFilterQuery": {
    "zh": "筛选条件写得不对",
    "en": "Invalid filter query"
  },
  "labels.issueNotFoundItMayBeDeletedOr": {
    "zh": "找不到这个 issue，可能已被删除，或者你没有权限查看",
    "en": "Issue not found; it may be deleted or inaccessible"
  },
  "labels.cannotConnect": {
    "zh": "连不上",
    "en": "Cannot connect"
  },
  "labels.responseIsTooLargeAndWasRejected": {
    "zh": "返回的内容太大，已拒绝接收",
    "en": "Response is too large and was rejected"
  },
  "labels.signInCancelled": {
    "zh": "登录已取消",
    "en": "Sign-in cancelled"
  },
  "labels.signInEndedAfterWaitingTooLong": {
    "zh": "太久没有回应，登录已结束",
    "en": "Sign-in ended after waiting too long"
  },
  "labels.squadIsDevelopingStopItOrWaitUntil": {
    "zh": "团队正在开发，请先停止或等待工作完成",
    "en": "Team is developing. Stop it or wait until work finishes"
  },
  "labels.squadIsArchivedRestoreItOrChooseAnother": {
    "zh": "团队已归档，请恢复或选择其他团队",
    "en": "Team is archived. Restore it or choose another"
  },
  "labels.memberExecutionIsCoordinatedByTheSquadUse": {
    "zh": "成员执行由团队协调，请从任务的团队面板操作",
    "en": "Member execution is coordinated by the team. Use the task's team panel"
  },
  "labels.onlyTheLeaderExecutingThisTaskCanAssign": {
    "zh": "只有正在执行任务的队长可以派活和提交",
    "en": "Only the team lead executing this task can assign work or submit"
  },
  "labels.noSquadRunToResumeStartSquadDevelopment": {
    "zh": "还没有可继续的团队运行，请开始团队开发",
    "en": "No team run to resume. Start team development first"
  },
  "labels.handleUnfinishedOrFailedWorkFirst": {
    "zh": "还有未完成或失败的工作，请先处理",
    "en": "Handle unfinished or failed work first"
  },
  "labels.thisMemberCannotTakeThisAssignment": {
    "zh": "该成员不能承担这次工作",
    "en": "This member cannot take this assignment"
  },
  "labels.schedulingSquadTasksIsNotSupportedYet": {
    "zh": "团队任务暂不支持预约执行",
    "en": "Scheduling team tasks is not supported yet"
  },
  "labels.thisMemberCanOnlyReadTheWorkspaceAssign": {
    "zh": "此成员只能读取工作区，请交给开发成员执行",
    "en": "This member can only read the workspace. Assign execution to a developer"
  },
  "labels.thisIssueHasAlreadyBeenImportedAsA": {
    "zh": "这个 issue 已经导入成任务了",
    "en": "This issue has already been imported as a task"
  },
  "labels.onlyPngJpegGifAndWebpImagesAre": {
    "zh": "只支持 PNG、JPEG、GIF 和 WebP 图片",
    "en": "Only PNG, JPEG, GIF, and WebP images are supported"
  },
  "labels.imageDimensionsExceed40MillionPixelsOr16384": {
    "zh": "图片尺寸太大（超过 4000 万像素或单边超过 16384）",
    "en": "Image dimensions exceed 40 million pixels or 16384 pixels on one side"
  },
  "labels.imageExceeds10mb": {
    "zh": "图片超过 10MB",
    "en": "Image exceeds 10MB"
  },
  "labels.imageFileNoLongerExists": {
    "zh": "图片文件已经不存在了",
    "en": "Image file no longer exists"
  },
  "labels.tooManySimultaneousImageUploadsTryAgainShortly": {
    "zh": "同时上传的图片太多，请稍后再试",
    "en": "Too many simultaneous image uploads. Try again shortly"
  },
  "labels.upTo20ImagesPerTask": {
    "zh": "一个任务最多 20 张图片",
    "en": "Up to 20 images per task"
  },
  "labels.invalidIssueKey": {
    "zh": "这不是一个有效的 issue key",
    "en": "Invalid issue key"
  },
  "labels.taskSourceNotFound": {
    "zh": "没有这个任务来源",
    "en": "Task source not found"
  },
  "labels.thisTaskWasNotImportedFromASource": {
    "zh": "这个任务不是从任务来源导入的",
    "en": "This task was not imported from a source"
  },
  "labels.aSignInIsAlreadyInProgressFor": {
    "zh": "这个来源已经有一个登录在进行",
    "en": "A sign-in is already in progress for this source"
  },
  "labels.signInHasEnded": {
    "zh": "登录已经结束",
    "en": "Sign-in has ended"
  },
  "labels.thisQuestionHasExpiredSignInAgain": {
    "zh": "这个问题已经过期，请重新登录",
    "en": "This question has expired. Sign in again"
  },
  "labels.thisMoveIsUnavailableInTheCurrentState": {
    "zh": "当前状态不能这样移动",
    "en": "This move is unavailable in the current state"
  },
  "labels.onlyPendingTasksCanStartPreviouslyExecutedTasks": {
    "zh": "只有未执行的任务可以执行；执行过的任务可以继续或重做",
    "en": "Only pending tasks can start; previously executed tasks can be continued or redone"
  },
  "labels.onlyTasksAwaitingReviewOrCompletedTasksCan": {
    "zh": "只有待验收或已完成的任务可以继续或重做",
    "en": "Only tasks awaiting review or completed tasks can be continued or redone"
  },
  "labels.addAProjectFirst": {
    "zh": "请先添加项目",
    "en": "Add a project first"
  },
  "labels.chooseAnAgentFirst": {
    "zh": "请先选择执行的 Agent",
    "en": "Choose an Agent first"
  },
  "labels.projectPathDoesNotExist": {
    "zh": "项目路径不存在",
    "en": "Project path does not exist"
  },
  "labels.projectPathMustBeAbsoluteIsSupported": {
    "zh": "项目路径需要是绝对路径（可以用 ~/ 开头）",
    "en": "Project path must be absolute (~/ is supported)"
  },
  "labels.everyDirectoryMustBeAGitRepositoryWhen": {
    "zh": "涉及多个项目时，每个目录都必须是 Git 仓库",
    "en": "Every directory must be a Git repository when using multiple projects"
  },
  "labels.twoProjectPathsPointToTheSameGit": {
    "zh": "有两个项目路径指向同一个 Git 仓库",
    "en": "Two project paths point to the same Git repository"
  },
  "labels.cannotChangeProjectsWhileExecuting": {
    "zh": "执行中不能修改项目",
    "en": "Cannot change projects while executing"
  },
  "labels.reopenTheCancelledTaskBeforeChangingProjects": {
    "zh": "已取消的任务不能修改项目，先重新打开",
    "en": "Reopen the cancelled task before changing projects"
  },
  "labels.thePrimaryProjectIsFixedAfterChatStarts": {
    "zh": "任务的对话开始后不能更换主项目，附加项目仍可增删",
    "en": "The primary project is fixed after chat starts; additional projects can still be added or removed"
  },
  "labels.thePrimaryProjectCannotBeAReference": {
    "zh": "主项目不能设为只读参考",
    "en": "The primary project cannot be a reference"
  },
  "labels.thisProjectAlreadyHasAWorktree": {
    "zh": "这个项目已经建了 worktree，不能再设为只读参考",
    "en": "This project already has a worktree and cannot become a reference"
  },
  "labels.aReferenceProjectHasNoStartingPoint": {
    "zh": "只读参考的项目没有起点可选",
    "en": "A reference project has no starting point"
  },
  "labels.theTaskBranchAlreadyExistsItsStartingPoint": {
    "zh": "任务分支已经建好，起点不能再改",
    "en": "The task branch already exists; its starting point cannot change"
  },
  "labels.taskIsNotCompletedOrCancelled": {
    "zh": "任务还没完成或取消",
    "en": "Task is not completed or cancelled"
  },
  "labels.conversationStillExistsDeleteItBeforeCleaningIts": {
    "zh": "会话还在，删除会话后才能清理它的 worktree",
    "en": "Conversation still exists. Delete it before cleaning its worktree"
  },
  "labels.eachProjectMustBeAGitRepositoryTo": {
    "zh": "新建 worktree 时，每个项目都必须是 Git 仓库",
    "en": "Each project must be a Git repository to create worktrees"
  },
  "labels.lockedWithGitWorktreeLock": {
    "zh": "已用 git worktree lock 锁定",
    "en": "Locked with git worktree lock"
  },
  "labels.cannotReadItsGitStatus": {
    "zh": "读不了它的 git 状态",
    "en": "Cannot read its Git status"
  },
  "labels.hasUncommittedChanges": {
    "zh": "有没提交的改动",
    "en": "Has uncommitted changes"
  },
  "labels.hasCommitsNotReachableFromAnotherReference": {
    "zh": "有只在它里面的提交",
    "en": "Has commits not reachable from another reference"
  },
  "labels.worktreeNotFoundItMayHaveBeenDeleted": {
    "zh": "找不到这个 worktree，可能已经删了",
    "en": "Worktree not found; it may have been deleted"
  },
  "labels.agentIsWorkingInThisDirectory": {
    "zh": "Agent 正在里面工作",
    "en": "Agent is working in this directory"
  },
  "labels.commitOrStashUncommittedChangesFirst": {
    "zh": "有未提交的改动，请先提交或暂存",
    "en": "Commit or stash uncommitted changes first"
  },
  "labels.thisBranchIsCheckedOutInAnotherWorktree": {
    "zh": "这个分支已在另一个 worktree 里检出",
    "en": "This branch is checked out in another worktree"
  },
  "labels.branchNotFound": {
    "zh": "找不到这个分支",
    "en": "Branch not found"
  },
  "labels.failedToSwitchBranch": {
    "zh": "切换分支失败",
    "en": "Failed to switch branch"
  },
  "labels.invalidBranchName": {
    "zh": "分支名不合法",
    "en": "Invalid branch name"
  },
  "labels.invalidTagName": {
    "zh": "标签名不合法",
    "en": "Invalid tag name"
  },
  "labels.aBranchWithThisNameAlreadyExists": {
    "zh": "已经有同名的分支",
    "en": "A branch with this name already exists"
  },
  "labels.noLocalBranchIsCheckedOutSwitchTo": {
    "zh": "当前没有检出的本地分支，请先切换或新建分支",
    "en": "No local branch is checked out. Switch to or create one first"
  },
  "labels.currentBranchHasNoUpstreamAndProjectHas": {
    "zh": "当前分支没有 upstream，项目也没有 origin",
    "en": "Current branch has no upstream and project has no origin"
  },
  "labels.startingPointMustBeABranch": {
    "zh": "起点必须是一个分支",
    "en": "Starting point must be a branch"
  },
  "labels.selectedStartingBranchNotFoundChooseAnotherIn": {
    "zh": "找不到选的起点分支，请在任务详情里重新选择",
    "en": "Selected starting branch not found. Choose another in task details"
  },
  "labels.dependenciesAreNotCompletedAndAcceptedYet": {
    "zh": "依赖的任务还没完成（执行完并验收通过）",
    "en": "Dependencies are not completed and accepted yet"
  },
  "labels.dependencyCyclesAreNotAllowed": {
    "zh": "不能形成循环依赖",
    "en": "Dependency cycles are not allowed"
  },
  "labels.failedToCreateGitWorktree": {
    "zh": "创建 git worktree 失败",
    "en": "Failed to create Git worktree"
  },
  "labels.terminalDaemonIsNotRunningPnpmDevDaemon": {
    "zh": "终端守护进程没有运行（pnpm dev:daemon）",
    "en": "Terminal daemon is not running (pnpm dev:daemon)"
  },
  "labels.serviceStoppedOrPortOwnershipChangedRefreshAnd": {
    "zh": "服务已结束或端口归属发生变化，请刷新后重试",
    "en": "Service stopped or port ownership changed. Refresh and retry"
  },
  "labels.agentCommandClaudeOrCodexNotFoundInstall": {
    "zh": "找不到 Agent 命令（claude 或 codex），请先安装并确认它在 PATH 里",
    "en": "Agent command (claude or codex) not found. Install it and ensure it is on PATH"
  },
  "labels.thisWindowsCommandRequiresCmdAntumiStartsAgents": {
    "zh": "Windows 上这个命令只能经由 cmd 运行，Antumi 不经过 shell 启动 Agent；请改用 npm 或 pnpm 安装，或安装原生 .exe 版本",
    "en": "This Windows command requires cmd. Antumi starts Agents without a shell; install through npm or pnpm, or use a native .exe"
  },
  "labels.taskIsStartingPleaseWait": {
    "zh": "任务正在启动，请稍候",
    "en": "Task is starting. Please wait"
  },
  "labels.taskNotFound": {
    "zh": "任务不存在",
    "en": "Task not found"
  },
  "labels.conversationNoLongerExists": {
    "zh": "会话已不存在",
    "en": "Conversation no longer exists"
  },
  "labels.conversationNotFound": {
    "zh": "会话不存在",
    "en": "Conversation not found"
  },
  "labels.thisConversationSAgentIsStartingTryAgain": {
    "zh": "这条会话的 Agent 正在启动，稍后再试",
    "en": "This conversation's Agent is starting. Try again shortly"
  },
  "labels.agentConcurrencyLimitReachedWaitForOtherConversations": {
    "zh": "Agent 运行数量已达到上限；请等其他会话结束，或预约稍后执行",
    "en": "Agent concurrency limit reached. Wait for other conversations or schedule execution"
  },
  "labels.chooseAnotherAgentForHandoff": {
    "zh": "请选择另一个 Agent 进行移交",
    "en": "Choose another Agent for handoff"
  },
  "labels.projectMustBeAnExistingAbsoluteDirectory": {
    "zh": "项目必须是已存在的绝对目录",
    "en": "Project must be an existing absolute directory"
  },
  "labels.upTo10ProjectsPerConversation": {
    "zh": "一条会话最多选择 10 个项目",
    "en": "Up to 10 projects per conversation"
  },
  "labels.theSameProjectDirectoryCannotBeSelectedTwice": {
    "zh": "不能重复选择同一个项目目录",
    "en": "The same project directory cannot be selected twice"
  },
  "labels.thisCoreHasNoSkillsLibrary": {
    "zh": "这个 core 没有技能库",
    "en": "This core has no skills library"
  },
  "labels.onlyHttpsGitRepositoryUrlsAreAccepted": {
    "zh": "只接受 https:// 的 Git 仓库地址",
    "en": "Only https:// Git repository URLs are accepted"
  },
  "labels.thisRepositoryIsAlreadyInstalled": {
    "zh": "这个仓库已经安装",
    "en": "This repository is already installed"
  },
  "labels.noUsableSkillsFoundSkillsNameSkillMd": {
    "zh": "仓库里没有可用的技能",
    "en": "No usable skills found in the repository"
  },
  "labels.skillMarketSearchFailed": {
    "zh": "技能市场搜索失败，稍后重试",
    "en": "Skill market search failed. Try again later"
  },
  "labels.skillRepositoryNotFound": {
    "zh": "没有这个技能仓库",
    "en": "Skill repository not found"
  },
  "labels.noVersionToRollBackTo": {
    "zh": "没有可回退的版本",
    "en": "No version to roll back to"
  },
  "labels.commitNotFoundInRepositoryCheckForUpdates": {
    "zh": "仓库里没有这个提交，请重新检查更新",
    "en": "Commit not found in repository. Check for updates again"
  },
  "labels.twoRepositoriesContainSkillsWithTheSameName": {
    "zh": "两个仓库有同名技能",
    "en": "Two repositories contain skills with the same name"
  },
  "labels.skillFileIsTooLarge": {
    "zh": "技能文件过大",
    "en": "Skill file is too large"
  },
  "labels.thisCoreCannotManageMcpServers": {
    "zh": "这个 core 不能管理 MCP 服务器",
    "en": "This core cannot manage MCP servers"
  },
  "labels.mcpServerNotFound": {
    "zh": "没有这个 MCP 服务器",
    "en": "MCP server not found"
  },
  "labels.anMcpServerWithThisNameAlreadyExists": {
    "zh": "已经有同名的 MCP 服务器",
    "en": "An MCP server with this name already exists"
  },
  "labels.theSameKeyWasEnteredTwice": {
    "zh": "同一个键填了两次",
    "en": "The same key was entered twice"
  },
  "labels.workingDirectoryMustBeAnAbsolutePath": {
    "zh": "工作目录要写绝对路径",
    "en": "Working directory must be an absolute path"
  },
  "labels.remoteServersRequireHttpsHttpIsAllowedOnly": {
    "zh": "远程服务器只接受 https://，http:// 只能连本机",
    "en": "Remote servers require https://; http:// is allowed only for localhost"
  },
  "labels.thisServerIsNoLongerInTheOriginal": {
    "zh": "这个服务器已经不在原来的配置里了",
    "en": "This server is no longer in the original configuration"
  },
  "labels.thisServerCannotBeImported": {
    "zh": "这个服务器不能导入",
    "en": "This server cannot be imported"
  },
  "labels.agentIsStillStartingWaitBeforeSending": {
    "zh": "Agent 还在启动，稍等再发",
    "en": "Agent is still starting. Wait before sending"
  },
  "labels.agentIsStillProcessingThePreviousMessage": {
    "zh": "Agent 还在处理上一条消息",
    "en": "Agent is still processing the previous message"
  },
  "labels.claudeCodeAcceptsImagesUpTo5mb": {
    "zh": "Claude Code 只接受 5MB 以内的图片",
    "en": "Claude Code accepts images up to 5MB"
  },
  "labels.noTurnIsCurrentlyRunning": {
    "zh": "现在没有进行中的回合",
    "en": "No turn is currently running"
  },
  "labels.thisRequestIsNoLongerAwaitingAnAnswer": {
    "zh": "这个请求已经不再等待回答",
    "en": "This request is no longer awaiting an answer"
  },
  "labels.browserIsNotRunning": {
    "zh": "浏览器没有运行",
    "en": "Browser is not running"
  },
  "labels.theBrowserRunsInTheAntumiAppOpen": {
    "zh": "浏览器在 Antumi 应用里运行，先打开 Antumi 应用",
    "en": "The browser runs in the Antumi app. Open Antumi first"
  },
  "labels.antumiAppAndCoreVersionsDifferUpdateThem": {
    "zh": "Antumi 应用和 core 版本不一致，请一起升级",
    "en": "Antumi app and core versions differ. Update them together"
  },
  "labels.tabHasBeenClosed": {
    "zh": "标签页已经关闭",
    "en": "Tab has been closed"
  },
  "labels.openThisConversationSBrowserPanelFirst": {
    "zh": "先打开这个会话的浏览器面板",
    "en": "Open this conversation's browser panel first"
  },
  "labels.youAreControllingThisTab": {
    "zh": "你正在操作这个标签页",
    "en": "You are controlling this tab"
  },
  "labels.elementIsNoLongerOnThePage": {
    "zh": "页面上找不到这个元素了",
    "en": "Element is no longer on the page"
  },
  "labels.thisConversationSAgentIsNotRunningIn": {
    "zh": "这条会话的 Agent 没有以聊天界面运行",
    "en": "This conversation's Agent is not running in chat mode"
  },
  "labels.thisIsNotATerminalPanelShellAnd": {
    "zh": "这不是终端面板里的 shell，不能连接",
    "en": "This is not a terminal-panel shell and cannot be connected"
  },
  "labels.agentStartupTimedOut": {
    "zh": "Agent 太久没有完成启动",
    "en": "Agent startup timed out"
  },
  "labels.runningDaemonIsTooOldForChatRestart": {
    "zh": "正在运行的终端守护进程版本太旧，不支持聊天界面，请重启它（pnpm dev:daemon）",
    "en": "Running daemon is too old for chat. Restart it (pnpm dev:daemon)"
  },
  "labels.earlierChatHistoryNotFound": {
    "zh": "找不到更早的聊天记录",
    "en": "Earlier chat history not found"
  },
  "labels.thisOptionIsUnavailableHere": {
    "zh": "这里用不了这个选项",
    "en": "This option is unavailable here"
  },
  "labels.noQueuedMessages": {
    "zh": "没有排队的消息",
    "en": "No queued messages"
  },
  "labels.thisAgentCannotStopBackgroundWork": {
    "zh": "这个 Agent 不能单独停止后台任务",
    "en": "This agent cannot stop background work on its own"
  },
  "labels.noLongerRunningInBackground": {
    "zh": "它已经不在后台运行了",
    "en": "It is no longer running in the background"
  },
  "labels.thisAgentCannotAcceptInstructionsDuringATurn": {
    "zh": "这个 Agent 不接受回合中的追加指令，先排队吧",
    "en": "This Agent cannot accept instructions during a turn. Queue the message instead"
  },
  "labels.dependenciesAreUnfinishedContinuePlanningInChatOr": {
    "zh": "依赖的任务还没完成，现在只能规划；在聊天里继续，或保存计划等它们完成",
    "en": "Dependencies are unfinished. Continue planning in chat or save the plan until they finish"
  },
  "labels.dependenciesAreUnfinishedYouCanPlanButCannot": {
    "zh": "依赖的任务还没完成，现在只能规划，不能动手改",
    "en": "Dependencies are unfinished. You can plan but cannot make changes yet"
  },
  "labels.onlyReadOnlyPlansNeedSavingApprovedExecution": {
    "zh": "只有只读规划时的计划需要保存，执行中的计划确认后就会开始做",
    "en": "Only read-only plans need saving; approved execution plans start immediately"
  },
  "labels.onlyRunningTasksCanBeSubmittedForReview": {
    "zh": "只有执行中的任务可以提交验收",
    "en": "Only running tasks can be submitted for review"
  },
  "labels.thisTaskHasNoChatAndCannotBe": {
    "zh": "这个任务没有聊天，不能提交验收",
    "en": "This task has no chat and cannot be submitted for review"
  },
  "labels.agentIsStillWorkingSubmitAfterThisTurn": {
    "zh": "Agent 还在处理，等这一轮结束再提交",
    "en": "Agent is still working. Submit after this turn ends"
  },
  "labels.projectChecksAreRunningWaitUntilTheyFinish": {
    "zh": "项目检查正在运行，等它结束",
    "en": "Project checks are running. Wait until they finish"
  },
  "labels.projectChecksFailedOutputWasSentToAgent": {
    "zh": "项目检查没通过，输出已交给 Agent 修复，修好后再提交",
    "en": "Project checks failed. Output was sent to Agent to fix; submit again afterward"
  },
  "labels.commandsInProjectConfigurationHaveNotBeenApproved": {
    "zh": "项目配置里的命令还没有允许运行",
    "en": "Commands in project configuration have not been approved"
  },
  "labels.projectConfigurationChangedConfirmItAgain": {
    "zh": "项目配置已经变了，请重新确认",
    "en": "Project configuration changed. Confirm it again"
  },
  "labels.thisCoreDoesNotSupportProjectConfiguration": {
    "zh": "这个 core 不支持项目配置",
    "en": "This core does not support project configuration"
  },
  "labels.thisTaskHasNotStartedAChat": {
    "zh": "这个任务还没有开始聊天",
    "en": "This task has not started a chat"
  },
  "labels.reopenTheCancelledTaskBeforeContinuing": {
    "zh": "已取消的任务不能继续，先重新打开",
    "en": "Reopen the cancelled task before continuing"
  },
  "labels.completedTasksCannotBeCancelled": {
    "zh": "已完成的任务不能取消",
    "en": "Completed tasks cannot be cancelled"
  },
  "labels.thisAgentDoesNotSupportThisOperationYet": {
    "zh": "这个 Agent 还做不了这件事",
    "en": "This Agent does not support this operation yet"
  },
  "labels.agentReturnedNoResult": {
    "zh": "Agent 没给出结果",
    "en": "Agent returned no result"
  },
  "labels.agentResponseTimedOut": {
    "zh": "Agent 太久没回应",
    "en": "Agent response timed out"
  },
  "labels.taskHasBeenCancelled": {
    "zh": "任务已经取消了",
    "en": "Task has been cancelled"
  },
  "labels.onlyCancelledTasksCanBeReopened": {
    "zh": "只有已取消的任务可以重新打开",
    "en": "Only cancelled tasks can be reopened"
  },
  "labels.aSuccessorTaskAlreadyContinuesThisTaskIt": {
    "zh": "它已经由重做出来的新任务接着做，不能重新打开",
    "en": "A successor task already continues this task; it cannot be reopened"
  },
  "labels.thisConversationBelongsToATaskContinueFrom": {
    "zh": "这条会话属于一个任务，请从任务那里继续",
    "en": "This conversation belongs to a task. Continue from the task"
  },
  "labels.conversationsWithoutAProjectRunInAntumiS": {
    "zh": "没选项目的会话在 Antumi 的临时目录里运行，不能再添加项目",
    "en": "Conversations without a project run in Antumi's temporary directory; projects cannot be added later"
  },
  "labels.thisCoreDoesNotSupportChat": {
    "zh": "这个 core 不支持聊天界面",
    "en": "This core does not support chat"
  },
  "labels.dependenciesAreUnfinishedOnlyPlanningIsAvailable": {
    "zh": "依赖的任务还没完成，现在只能规划，不能直接执行",
    "en": "Dependencies are unfinished. Only planning is available"
  },
  "labels.thisTaskIsAlreadyScheduled": {
    "zh": "这个任务已经预约了",
    "en": "This task is already scheduled"
  },
  "labels.thisScheduleIsNoLongerWaiting": {
    "zh": "这条预约已经不在等待了",
    "en": "This schedule is no longer waiting"
  },
  "labels.thisScheduleIsStarting": {
    "zh": "这条预约正在开始",
    "en": "This schedule is starting"
  },
  "labels.scheduleNotFound": {
    "zh": "找不到这条预约",
    "en": "Schedule not found"
  },
  "labels.onlyConversationSchedulesCarryMessages": {
    "zh": "只有会话的预约带消息",
    "en": "Only conversation schedules carry messages"
  },
  "labels.routineNotFound": {
    "zh": "找不到这个定时任务",
    "en": "Routine not found"
  },
  "labels.groupChatNotFound": {
    "zh": "找不到这个群聊",
    "en": "Group chat not found"
  },
  "labels.groupMembersCannotBeHandedOffToAnother": {
    "zh": "群聊成员不能移交给其他 Agent",
    "en": "Group members cannot be handed off to another Agent"
  },
  "labels.memberNotFoundInGroupChat": {
    "zh": "群聊里没有这个成员",
    "en": "Member not found in group chat"
  },
  "labels.theMentionedMemberIsStillAnsweringWaitUntil": {
    "zh": "点名的成员还在回答上一条，等它说完再问",
    "en": "The mentioned member is still answering. Wait until they finish"
  },
  "labels.groupChatIsNotRunning": {
    "zh": "群聊现在没有在进行",
    "en": "Group chat is not running"
  },
  "labels.groupChatIsRunningPauseItOrWait": {
    "zh": "群聊还在进行，先暂停或等它结束",
    "en": "Group chat is running. Pause it or wait until it finishes"
  },
  "labels.theChairIsWritingASummary": {
    "zh": "主持人正在写总结",
    "en": "The chair is writing a summary"
  },
  "labels.groupChatHasAlreadyBeenSummarized": {
    "zh": "群聊已经总结过了",
    "en": "Group chat has already been summarized"
  },
  "labels.membersAreSpeakingPauseOrWaitBeforeChanging": {
    "zh": "成员还在发言，先暂停或等讨论结束，再换议题",
    "en": "Members are speaking. Pause or wait before changing topics"
  },
  "labels.agentReturnedNoTextAnswer": {
    "zh": "Agent 没有给出文字回答",
    "en": "Agent returned no text answer"
  },
  "labels.thisTurnIsUnfinishedWaitBeforeForking": {
    "zh": "这一轮还没结束，等它结束再 fork",
    "en": "This turn is unfinished. Wait before forking"
  },
  "labels.messageNotFound": {
    "zh": "找不到这条消息",
    "en": "Message not found"
  },
  "labels.routineIsPaused": {
    "zh": "定时任务已暂停",
    "en": "Routine is paused"
  },
  "labels.previousRunIsUnfinishedSkippingThisRun": {
    "zh": "上一次运行还没结束，这次跳过",
    "en": "Previous run is unfinished; skipping this run"
  },
  "labels.recurringRuleHasNoTimeSpecified": {
    "zh": "重复规则没有指定时间",
    "en": "Recurring rule has no time specified"
  },
  "labels.routineNeedsInstructionsOrAnImage": {
    "zh": "定时任务需要一条指令或图片",
    "en": "Routine needs instructions or an image"
  },
  "labels.agentExitedWithoutLeavingAResult": {
    "zh": "Agent 没有留下结果就退出了",
    "en": "Agent exited without leaving a result"
  },
  "labels.taskHasAlreadyStarted": {
    "zh": "任务已经开始了",
    "en": "Task has already started"
  },
  "labels.taskIsNoLongerRunning": {
    "zh": "任务已经不在执行了",
    "en": "Task is no longer running"
  },
  "labels.youResumedThisConversationYourself": {
    "zh": "你自己继续了这条会话",
    "en": "You resumed this conversation yourself"
  },
  "labels.conversationHandedOffToAnotherAgent": {
    "zh": "会话已移交给另一个 Agent",
    "en": "Conversation handed off to another Agent"
  },
  "labels.quotaLimitReachedAgainUsingTheLatestLimit": {
    "zh": "又一次撞到了额度，以新的为准",
    "en": "Quota limit reached again; using the latest limit"
  },
  "labels.autoResumeAfterQuotaResetWasDisabled": {
    "zh": "关掉了额度恢复后自动继续",
    "en": "Auto-resume after quota reset was disabled"
  },
  "labels.thisQuotaLimitEventIsAlreadySettled": {
    "zh": "这次额度用完的处理已经结束",
    "en": "This quota-limit event is already settled"
  },
  "labels.retryingPleaseWait": {
    "zh": "正在重试，稍等",
    "en": "Retrying. Please wait"
  },
  "labels.quotaLimitRecordNotFound": {
    "zh": "找不到这次额度用完的记录",
    "en": "Quota-limit record not found"
  },
  "labels.retryCouldNotResume": {
    "zh": "重试没能继续",
    "en": "Retry could not resume"
  },
  "labels.agentCouldNotStartInChatMode": {
    "zh": "Agent 没能以聊天界面启动",
    "en": "Agent could not start in chat mode"
  },
  "labels.agentSOriginalSessionNoLongerExists": {
    "zh": "Agent 原来的会话已经不在了",
    "en": "Agent's original session no longer exists"
  },
  "labels.cannotOpenPage": {
    "zh": "页面打不开",
    "en": "Cannot open page"
  },
  "labels.commitFailed": {
    "zh": "提交失败",
    "en": "Commit failed"
  },
  "labels.commitWasKeptLocallyButPushFailed": {
    "zh": "提交已经保留在本地，但推送失败",
    "en": "Commit was kept locally, but push failed"
  },
  "labels.gitOperationFailed": {
    "zh": "Git 操作失败",
    "en": "Git operation failed"
  },
  "labels.invalidProjectConfigurationAntumiProjectJson": {
    "zh": "项目配置 .antumi/project.json 有误",
    "en": "Invalid project configuration .antumi/project.json"
  },
  "labels._2502": {
    "zh": "{year}年{value2}",
    "en": "{value2}/{year}"
  },
  "labels.hoursAgo": {
    "zh": "{value1} 小时前",
    "en": "{value1} {value1, plural, one {hour} other {hours}} ago"
  },
  "labels.yesterday": {
    "zh": "昨天",
    "en": "Yesterday"
  },
  "labels.weeksAgo": {
    "zh": "{value1} 周前",
    "en": "{value1} {value1, plural, one {week} other {weeks}} ago"
  },
  "modelCostFormat.commitMessage": {
    "zh": "提交说明",
    "en": "Commit message"
  },
  "modelCostFormat.totalPricedEstimable": {
    "zh": "共 {value1} 次 · 可计价 {value2} 次 · 可估算 {value3} 次",
    "en": "{value1} total · {value2} priced · {value3} estimable"
  },
  "modelCostFormat.estimatedAtApiListPricesSubscriptionUsageIs": {
    "zh": "按 API 标价折算，订阅额度不等于实际美元扣款。",
    "en": "Estimated at API list prices; subscription usage is not actual dollar billing."
  },
  "modelCostFormat.costMainModel": {
    "zh": "花费：{value1}；主模型：{value2}。",
    "en": "Cost: {value1}; main model: {value2}."
  },
  "modelCostFormat.modelDifferenceSameUsagePricedAtMainModel": {
    "zh": "模型差价 = 同用量按主模型计价 {value1} − 小模型花费 {value2}：{value3}。",
    "en": "Model difference = same usage priced at main model {value1} − small-model cost {value2}: {value3}."
  },
  "modelCostFormat.mainContextOrCallDataMissingEstimatingModel": {
    "zh": "缺少主上下文或调用数据，仅估算模型差价。",
    "en": "Main context or call data missing; estimating model difference only."
  },
  "modelCostFormat.contextSavingsTokensCallsMillionTokens": {
    "zh": "上下文节省 = {value1} token × {value2} 次调用 × {value3}/百万 token：{value4}。",
    "en": "Context savings = {value1} {value1, plural, one {token} other {tokens}} × {value2} calls × {value3}/million tokens: {value4}."
  },
  "modelCostFormat.estimatedSavingsMax0ModelDifferenceContextSavings": {
    "zh": "约省 = max(0, 模型差价 + 上下文节省)：{value1}；不计负值。",
    "en": "Estimated savings = max(0, model difference + context savings): {value1}; negative values excluded."
  },
  "modelCostFormat.modelCallCountsAreConservativeEstimatesAssumeOne": {
    "zh": "模型调用次数为保守估算；无法可靠识别时按一次计算。",
    "en": "Model call counts are conservative estimates; assume one call when uncertain."
  },
  "modelCostFormat.failedOrInterruptedRequestsCountReportedCostsOnly": {
    "zh": "失败或中断只计已报告花费，不计节省。",
    "en": "Failed or interrupted requests count reported costs only, without savings."
  },
  "modelCostFormat.assumesAWarmCacheExcludesFutureCostsOf": {
    "zh": "按缓存仍热估算；不计算这些问答以后留在主上下文里的开销。",
    "en": "Assumes a warm cache; excludes future costs of keeping these exchanges in main context."
  },
  "modelCostFormat.pricesUpdated": {
    "zh": "价格更新日期：{value1}。",
    "en": "Prices updated: {value1}."
  },
  "modelCostFormat.verifiablePricesOrFullBillingDetailsAreMissing": {
    "zh": "缺少可核实价格或完整计价明细，金额未提供。",
    "en": "Verifiable prices or full billing details are missing; cost unavailable."
  },
  "overview.awaitingApprovalAnswer": {
    "zh": "等待确认／回答",
    "en": "Awaiting approval / answer"
  },
  "overview.running": {
    "zh": "{running} 名运行",
    "en": "{running} running"
  },
  "overview.approvalsPending": {
    "zh": "{approvals} 项待审批",
    "en": "{approvals} {approvals, plural, one {approval} other {approvals}} pending"
  },
  "overview.awaitingAnswers": {
    "zh": "{questions} 名等回答",
    "en": "{questions} awaiting answers"
  },
  "overview.awaitingReplies": {
    "zh": "{replies} 名等回复",
    "en": "{replies} awaiting replies"
  },
  "overview.runFailed": {
    "zh": "运行失败",
    "en": "Run failed"
  },
  "overview.unreadRuns": {
    "zh": "{value1} 次运行未读",
    "en": "{value1} unread runs"
  },
  "overview.next": {
    "zh": "下次 {value1}",
    "en": "Next {value1}"
  },
  "overview.byTime": {
    "zh": "按时间",
    "en": "By time"
  },
  "overview.running_2528": {
    "zh": "{members} 名运行",
    "en": "{members} running"
  },
  "overview.waitingForDependencies": {
    "zh": "等 {dependencies} 个依赖",
    "en": "Waiting for {dependencies} {dependencies, plural, one {dependency} other {dependencies}}"
  },
  "overview.error": {
    "zh": "异常",
    "en": "Error"
  },
  "overview.awaitingAnswer": {
    "zh": "等回答",
    "en": "Awaiting answer"
  },
  "overview.awaitingApproval": {
    "zh": "等确认",
    "en": "Awaiting approval"
  },
  "overview.awaitingReply": {
    "zh": "等回复",
    "en": "Awaiting reply"
  },
  "overview.tomorrow": {
    "zh": "明天",
    "en": "Tomorrow"
  },
  "palettes.terracotta": {
    "zh": "赤陶",
    "en": "Terracotta"
  },
  "palettes.antumiDefaultNeutralGraysWithTerracotta": {
    "zh": "Antumi 的默认，中性灰阶配赤陶色",
    "en": "Antumi default: neutral grays with terracotta"
  },
  "palettes.indigo": {
    "zh": "靛蓝",
    "en": "Indigo"
  },
  "palettes.fromLinearCoolGraysWithIndigo": {
    "zh": "取自 Linear：冷灰和一点靛蓝",
    "en": "From Linear: cool grays with indigo"
  },
  "palettes.nord": {
    "zh": "极夜",
    "en": "Nord"
  },
  "palettes.fromNordPolarBlueGraysAndFrost": {
    "zh": "取自 Nord：极地的蓝灰和霜色",
    "en": "From Nord: polar blue-grays and frost"
  },
  "palettes.paper": {
    "zh": "宣纸",
    "en": "Paper"
  },
  "palettes.warmPaperInspiredByNotionAndReadersWith": {
    "zh": "取自 Notion 和阅读器的暖纸色，配古铜",
    "en": "Warm paper inspired by Notion and readers, with bronze"
  },
  "palettes.catppuccin": {
    "zh": "猫爪",
    "en": "Catppuccin"
  },
  "palettes.fromCatppuccinLatteAndMochaWithLavender": {
    "zh": "取自 Catppuccin：Latte 与 Mocha，配淡紫",
    "en": "From Catppuccin: Latte and Mocha with lavender"
  },
  "planMarkdown.version": {
    "zh": "-第{version}版",
    "en": "-version-{version}"
  },
  "quotaAdviceText.quota": {
    "zh": "{value1}额度",
    "en": "{value1} quota"
  },
  "quotaAdviceText.isAlsoAvailable": {
    "zh": "，也可以放心用 {value1}",
    "en": "; {value1} is also available"
  },
  "quotaAdviceText.leftResetsAtThisPaceAboutMayGo": {
    "zh": "{value1}还剩 {left}%，{reset} 重置，照现在的速度约 {waste}% 会用不上：适合现在跑大任务或并行任务{model}",
    "en": "{value1}{left}% left, resets {reset}. At this pace, about {waste}% may go unused: a good time for large or parallel tasks{model}"
  },
  "quotaAdviceText.beforeReset": {
    "zh": "，比重置早 {value1}",
    "en": ", {value1} before reset"
  },
  "quotaAdviceText.at": {
    "zh": "会在 {value1} ",
    "en": "at {value1} "
  },
  "quotaAdviceText.atThisPaceQuotaRunsOut": {
    "zh": "照现在的速度{value1}{at}用完{early}：{value4}",
    "en": "At this pace, {value1}{at}quota runs out{early}: {value4}"
  },
  "quotaAdviceText.useForLighterWork": {
    "zh": "轻活可以交给 {other}",
    "en": "Use {other} for lighter work"
  },
  "quotaAdviceText.useASmallerModelForLighterWork": {
    "zh": "轻活可以换小一点的模型",
    "en": "Use a smaller model for lighter work"
  },
  "quotaAdviceText.5hQuotaExhaustedResets": {
    "zh": "5h 额度已用完，{reset} 重置",
    "en": "5h quota exhausted; resets {reset}"
  },
  "quotaAdviceText.atThisPace5hQuotaRunsOutBefore": {
    "zh": "照现在的速度 5h 额度会在重置（{reset}）前用完",
    "en": "At this pace, 5h quota runs out before reset ({reset})"
  },
  "quotaAdviceText.useInTheMeantime": {
    "zh": "；在那之前可以先用 {other}",
    "en": "; use {other} in the meantime"
  },
  "quotaAdviceText.waitUntilResetForLargeTasks": {
    "zh": "；大任务可以等重置后再开",
    "en": "; wait until reset for large tasks"
  },
  "quotaAdviceText.exhaustedResetsSwitchModelsFirst": {
    "zh": "{value1}已用完，{reset} 重置：先换其他模型",
    "en": "{value1} exhausted; resets {reset}: switch models first"
  },
  "quotaAdviceText.isUsedSwitchModelsForRoutineWorkAnd": {
    "zh": "{value1}已用 {value2}%：日常改动可以换其他模型，把 {model} 留给难题",
    "en": "{value1} is {value2}% used: switch models for routine work and save {model} for harder tasks"
  },
  "quotaAdviceText.fastPace": {
    "zh": "偏快",
    "en": "Fast pace"
  },
  "quotaAdviceText.atThisPaceRunsOutBeforeReset": {
    "zh": "照现在的速度会在{value1}用完，早于重置",
    "en": "At this pace, runs out {value1}, before reset"
  },
  "quotaAdviceText.mayGoUnused": {
    "zh": "用不完",
    "en": "May go unused"
  },
  "quotaAdviceText.atThisPaceAboutRemainsUnusedAtReset": {
    "zh": "照现在的速度重置时约{value1}%用不上",
    "en": "At this pace, about {value1}% remains unused at reset"
  },
  "quotaAdviceText.quotaResetsSoonWithPlentyLeftUseThis": {
    "zh": "额度快重置了，还剩不少，先用它",
    "en": "Quota resets soon with plenty left; use this Agent first"
  },
  "quotaAdviceText.moreQuotaAvailableThanOtherAgents": {
    "zh": "额度比其他 Agent 宽裕",
    "en": "More quota available than other Agents"
  },
  "quotaNotices.quotaAdvice": {
    "zh": "{value1} 额度建议",
    "en": "{value1} quota advice"
  },
  "quotaNotices.quotaRestored": {
    "zh": "{value1} 额度已恢复",
    "en": "{value1} quota restored"
  },
  "quotaNotices.quotaHasResetAndIsReadyToUse": {
    "zh": "{value1}额度已重置，可以继续用了",
    "en": "{value1} quota has reset and is ready to use"
  },
  "requestPopup.hasAQuestion": {
    "zh": "有个问题",
    "en": "Has a question"
  },
  "requestPopup.planAwaitingApproval": {
    "zh": "计划待批准",
    "en": "Plan awaiting approval"
  },
  "requestPopup.awaitingYourPermission": {
    "zh": "等你允许",
    "en": "Awaiting your permission"
  },
  "routineTemplates.dailyCodeReview": {
    "zh": "每日代码审查",
    "en": "Daily code review"
  },
  "routineTemplates.reviewCommitsMergedIntoTheMainBranchOver": {
    "zh": "审查过去一天合进主分支的提交，指出问题和风险。",
    "en": "Review commits merged into the main branch over the past day and flag issues and risks."
  },
  "routineTemplates.testHealthCheck": {
    "zh": "测试健康检查",
    "en": "Test health check"
  },
  "routineTemplates.runTestsAndReportFailuresAndFlakyCases": {
    "zh": "跑一遍测试，报告失败和时好时坏的用例。",
    "en": "Run tests and report failures and flaky cases."
  },
  "routineTemplates.prActionSummary": {
    "zh": "PR 待办摘要",
    "en": "PR action summary"
  },
  "routineTemplates.listPullRequestsNeedingAttentionAndWhoShould": {
    "zh": "列出等着处理的 pull request，标出谁该动。",
    "en": "List pull requests needing attention and who should act."
  },
  "routineTemplates.dependencyUpdateCheck": {
    "zh": "依赖更新检查",
    "en": "Dependency update check"
  },
  "routineTemplates.findAvailableUpdatesAndSecurityAdvisoriesWithoutUpgrading": {
    "zh": "找出能升级的依赖和安全通告，不直接升级。",
    "en": "Find available updates and security advisories without upgrading."
  },
  "routineTemplates.repositoryInspection": {
    "zh": "仓库巡检",
    "en": "Repository inspection"
  },
  "routineTemplates.findStaleBranchesUncommittedChangesAndScatteredTodos": {
    "zh": "清点过期分支、没提交的改动和散落的 TODO。",
    "en": "Find stale branches, uncommitted changes, and scattered TODOs."
  },
  "routineTemplates.releaseNotesDraft": {
    "zh": "发布说明草稿",
    "en": "Release notes draft"
  },
  "routineTemplates.draftUserFacingReleaseNotesFromCommitsSince": {
    "zh": "根据上个版本以来的提交起草面向用户的更新说明。",
    "en": "Draft user-facing release notes from commits since the last version."
  },
  "routineTemplates.documentationSyncCheck": {
    "zh": "文档同步检查",
    "en": "Documentation sync check"
  },
  "routineTemplates.checkWhetherReadmeAndDocsMatchTheCode": {
    "zh": "对照代码检查 README 和文档有没有过时。",
    "en": "Check whether README and docs match the code."
  },
  "routineTemplates.weeklyReport": {
    "zh": "周报",
    "en": "Weekly report"
  },
  "routineTemplates.summarizeThisWeekSCommitsAndPrsBy": {
    "zh": "汇总这一周的提交和 PR，按主题写成一段话。",
    "en": "Summarize this week's commits and PRs by theme."
  },
  "routines.tue": {
    "zh": "二",
    "en": "Tue"
  },
  "routines.thu": {
    "zh": "四",
    "en": "Thu"
  },
  "routines.sat": {
    "zh": "六",
    "en": "Sat"
  },
  "routines.everyHours": {
    "zh": "每 {value1} 小时",
    "en": "Every {value1} {value1, plural, one {hour} other {hours}}"
  },
  "routines.dailyAt": {
    "zh": "每天 {value1}",
    "en": "Daily at {value1}"
  },
  "routines.weekdaysAt": {
    "zh": "工作日 {value1}",
    "en": "Weekdays at {value1}"
  },
  "routines.weeklyOnAt": {
    "zh": "每周{value1} {value2}",
    "en": "Weekly on {value1} at {value2}"
  },
  "routines.runsOnlyWhenStartedManually": {
    "zh": "只在手动开始时运行",
    "en": "Runs only when started manually"
  },
  "routines.noNextRun": {
    "zh": "没有下一次",
    "en": "No next run"
  },
  "routines.catchUpOriginally": {
    "zh": "（补跑，原定 {value1}）",
    "en": " (catch-up; originally {value1})"
  },
  "routines.couldNotStart": {
    "zh": "没能开始：{value1}",
    "en": "Could not start: {value1}"
  },
  "routines.skippedPreviousRunUnfinished": {
    "zh": "跳过：上一次还没结束",
    "en": "Skipped: previous run unfinished"
  },
  "routines.cancelled": {
    "zh": "已取消：{value1}",
    "en": "Cancelled: {value1}"
  },
  "routines.completed": {
    "zh": "{at} 完成{late}",
    "en": "{at} completed{late}"
  },
  "routines.failed": {
    "zh": "失败：{value1}{late}",
    "en": "Failed: {value1}{late}"
  },
  "routines.interrupted": {
    "zh": "中断：{value1}",
    "en": "Interrupted: {value1}"
  },
  "routines.interrupted_2626": {
    "zh": "中断",
    "en": "Interrupted"
  },
  "routines.awaitingYourAnswer": {
    "zh": "在等你回答{late}",
    "en": "Awaiting your answer{late}"
  },
  "routines.startedRunning": {
    "zh": "{value1} 开始，进行中{late}",
    "en": "{value1} started; running{late}"
  },
  "routines.done": {
    "zh": "做完了",
    "en": "Done"
  },
  "routines.failed_2630": {
    "zh": "失败：{value1}",
    "en": "Failed: {value1}"
  },
  "routines.interrupted_2631": {
    "zh": "中断了",
    "en": "Interrupted"
  },
  "routines.routine": {
    "zh": "定时任务「{value1}」",
    "en": "Routine “{value1}”"
  },
  "schedules.tomorrow": {
    "zh": "明天 {clock}",
    "en": "Tomorrow {clock}"
  },
  "schedules.startAfter": {
    "zh": "{value1} 之后开始",
    "en": "Start after {value1}"
  },
  "schedules.waitingForQuotaReset": {
    "zh": "等额度恢复（{value1}）",
    "en": "Waiting for quota reset ({value1})"
  },
  "schedules.couldNotStartRetryingLater": {
    "zh": "没能开始，稍后再试（{value1}）",
    "en": "Could not start; retrying later ({value1})"
  },
  "schedules.waitingBehind": {
    "zh": "排在「{value1}」后面",
    "en": "Waiting behind \"{value1}\""
  },
  "schedules.startWhenQuotaResets": {
    "zh": "额度恢复后开始",
    "en": "Start when quota resets"
  },
  "schedules.startingSoonSchedulesForTheSameAgentRun": {
    "zh": "即将开始（同一个 Agent 的预约依次运行）",
    "en": "Starting soon (schedules for the same Agent run sequentially)"
  },
  "schedules.started": {
    "zh": "{value1} 已开始",
    "en": "{value1} started"
  },
  "schedules.executeTask": {
    "zh": "执行任务",
    "en": "Execute task"
  },
  "schedules.openAConversationWithInstructions": {
    "zh": "新开会话执行指令",
    "en": "Open a conversation with instructions"
  },
  "schedules.resumeFromInterruptionAfterQuotaResets": {
    "zh": "额度恢复后从中断处继续",
    "en": "Resume from interruption after quota resets"
  },
  "schedules.resumeAndSend": {
    "zh": "从中断处继续，并发送：",
    "en": "Resume and send:"
  },
  "schedules.send": {
    "zh": "发送：",
    "en": "Send:"
  },
  "schedules.with": {
    "zh": "（附 {pictures}）",
    "en": " (with {pictures})"
  },
  "schedules.resumeAndSend_2646": {
    "zh": "从中断处继续，并发送",
    "en": "Resume and send"
  },
  "schedules.send_2647": {
    "zh": "发送",
    "en": "Send"
  },
  "schedules.resumeFromInterruption": {
    "zh": "从中断处继续",
    "en": "Resume from interruption"
  },
  "schedules.approvePlanOrStartImplementation": {
    "zh": "批准计划或按计划开始实现",
    "en": "Approve plan or start implementation"
  },
  "schedules.resume": {
    "zh": "续跑",
    "en": "Resume"
  },
  "schedules.couldNotResumeAfterQuotaReset": {
    "zh": "额度恢复后没能继续",
    "en": "Could not resume after quota reset"
  },
  "schedules.scheduleFailedToStart": {
    "zh": "预约没能开始",
    "en": "Schedule failed to start"
  },
  "squadProgress.waitingForMemberDelivery": {
    "zh": "等成员交付",
    "en": "Waiting for member delivery"
  },
  "squadProgress.assignmentsQueued": {
    "zh": "{value1} 项工作排队",
    "en": "{value1} {value1, plural, one {assignment} other {assignments}} queued"
  },
  "statFormat.lessThan1Minute": {
    "zh": "不到 1 分钟",
    "en": "Less than 1 minute"
  },
  "statFormat.hM": {
    "zh": "{hours} 小时 {value2} 分",
    "en": "{hours}h {value2}m"
  },
  "statFormat.h": {
    "zh": "{hours} 小时",
    "en": "{hours}h"
  },
  "taskStarts.couldNotFetchLatestCodeUsingTheLocal": {
    "zh": "没能拉取最新的，用的是本地已有的",
    "en": "Could not fetch latest code; using the local copy"
  },
  "taskStarts.noOriginDefaultBranchBranchingFromTheProject": {
    "zh": "没有 origin 的默认分支，从项目当前的分支拉出",
    "en": "No origin default branch; branching from the project's current branch"
  },
  "taskStarts.noOriginDefaultBranchUsingTheProjectS": {
    "zh": "没有 origin 的默认分支，用项目当前的分支",
    "en": "No origin default branch; using the project's current branch"
  },
  "taskStarts.originDefaultBranchFetchedBeforeStarting": {
    "zh": "origin 的默认分支，开始前先拉取",
    "en": "Origin default branch; fetched before starting"
  },
  "taskStarts.dependencyTaskBranch": {
    "zh": "依赖任务「{title}」的分支",
    "en": "Dependency task “{title}” branch"
  },
  "taskStarts.dependencyTaskBranch_2664": {
    "zh": "依赖任务的分支",
    "en": "Dependency task branch"
  },
  "taskStarts.projectSCurrentBranch": {
    "zh": "项目当前的分支",
    "en": "Project's current branch"
  },
  "taskStarts.fetchBeforeStarting": {
    "zh": "开始前先拉取",
    "en": "Fetch before starting"
  },
  "unifiedDiff.lineBeforeDeletion": {
    "zh": "{path}（删除前第 {value2} 行）",
    "en": "{path} (line {value2} before deletion)"
  },
  "unifiedDiff.linesTotal": {
    "zh": "…（共 {value1} 行）",
    "en": "…({value1} {value1, plural, one {line} other {lines}} total)"
  },
  "unsavedEdits.couldNotSave": {
    "zh": "没能保存：{value1}",
    "en": "Could not save: {value1}"
  },
  "usageFormat.dH": {
    "zh": "{value1} 天 {value2} 小时",
    "en": "{value1}d {value2}h"
  },
  "usageFormat.d": {
    "zh": "{value1} 天",
    "en": "{value1}d"
  },
  "usageFormat.today": {
    "zh": "今天 {time}",
    "en": "Today {time}"
  },
  "usageFormat.thisMonth": {
    "zh": "本月",
    "en": "This month"
  },
  "usageFormat.thisDay": {
    "zh": "今天",
    "en": "Today"
  },
  "usageFormat.thisWeek": {
    "zh": "本周",
    "en": "This week"
  },
  "usageFormat.resetsIn": {
    "zh": "{value1}后重置（{value2}）",
    "en": "Resets in {value1} ({value2})"
  },
  "usageFormat.remaining": {
    "zh": "剩 {value}%",
    "en": "{value}% remaining"
  },
  "usageFormat.reset5hAndWeeklyUsage": {
    "zh": "清零 5h 和每周额度",
    "en": "Reset 5h and weekly usage"
  },
  "usageFormat.reset5hUsage": {
    "zh": "清零 5h 额度",
    "en": "Reset 5h usage"
  },
  "usageFormat.resetWeeklyUsage": {
    "zh": "清零每周额度",
    "en": "Reset weekly usage"
  },
  "usageFormat.quotaRemainsUsingTheCardAfterExhaustionOffers": {
    "zh": "现在额度还剩 {value1}%，用完再用更划算。",
    "en": "{value1}% quota remains. Using the card after exhaustion offers more value."
  },
  "usageFormat.useOneCardToImmediatelyThisCannotBe": {
    "zh": "用掉一张，立即{value1}，用掉后不能退回。{room}",
    "en": "Use one card to immediately {value1}. This cannot be undone.{room}"
  },
  "usageFormat.restoreQuota": {
    "zh": "恢复额度",
    "en": "Restore quota"
  },
  "usageFormat.usedOneResetCardQuotaRestored": {
    "zh": "已使用一张重置卡，额度已恢复",
    "en": "Used one reset card; quota restored"
  },
  "usageFormat.noUsedQuotaToResetNoCardConsumed": {
    "zh": "现在没有用掉的额度需要清零，重置卡没有扣",
    "en": "No used quota to reset; no card consumed"
  },
  "usageFormat.noResetCardsAvailable": {
    "zh": "没有可用的重置卡了",
    "en": "No reset cards available"
  },
  "usageFormat.thisResetCardWasAlreadyUsedQuotaRestored": {
    "zh": "这张重置卡已经用过了，额度已恢复",
    "en": "This reset card was already used; quota restored"
  },
  "usageFormat.ago": {
    "zh": "{value1}前",
    "en": "{value1} ago"
  },
  "usageFormat.serviceWideResetAnnouncedPosted": {
    "zh": "已预告全员重置{value1} · {value2}发布",
    "en": "Service-wide reset announced{value1} · Posted {value2}"
  },
  "usageFormat.expected": {
    "zh": "，预计{value1}",
    "en": ", expected {value1}"
  },
  "usageFormat.latestResetCardDistributionToAllPaidAccounts": {
    "zh": "最近一次给每个付费账号发重置卡",
    "en": "Latest reset card distribution to all paid accounts"
  },
  "usageFormat.latestServiceWideReset": {
    "zh": "最近一次全员重置",
    "en": "Latest service-wide reset"
  },
  "usageFormat.aboutChanceOfAnotherResetWithin48Hours": {
    "zh": "48 小时内再次重置的可能约 {value1}%，按以往间隔估算",
    "en": "About {value1}% chance of another reset within 48 hours, estimated from previous intervals"
  },
  "wireEntries.start": {
    "zh": "启动",
    "en": "Start"
  },
  "wireEntries.sentToAgent": {
    "zh": "发给 Agent",
    "en": "Sent to Agent"
  },
  "wireEntries.agentOutput": {
    "zh": "Agent 输出",
    "en": "Agent output"
  },
  "wireEntries.exit": {
    "zh": "退出",
    "en": "Exit"
  },
  "wireEntries.start_2697": {
    "zh": "启动 {value1}",
    "en": "Start {value1}"
  },
  "wireEntries.exitedWithCode": {
    "zh": "退出，代码 {value1}",
    "en": "Exited with code {value1}"
  },
  "wireEntries.streamDeltas": {
    "zh": "流式增量 × {value1}{value2}",
    "en": "Stream deltas × {value1}{value2}"
  },
  "wireEntries.originallyCharactersOnlyTheBeginningWasRecorded": {
    "zh": "{text}\n…（原本 {value2} 个字符，只记了前面这些）",
    "en": "{text}\n…(Originally {value2} characters; only the beginning was recorded)"
  },
  "worktreeGroups.itsRepositoryCannotBeFound": {
    "zh": "找不到它所属的仓库",
    "en": "Its repository cannot be found"
  },
  "worktreeGroups.agentIsStillOpen": {
    "zh": "Agent 还开着",
    "en": "Agent is still open"
  },
  "worktreeGroups.uncommittedFiles": {
    "zh": "{value1} 个文件没提交",
    "en": "{value1} uncommitted files"
  },
  "worktreeGroups.hasCommitsThatExistOnlyHere": {
    "zh": "有只在这里的提交",
    "en": "Has commits that exist only here"
  },
  "worktreeGroups.readOnlyPlanningCheckout": {
    "zh": "规划用的只读副本",
    "en": "Read-only planning checkout"
  },
  "worktreeGroups.commitsNotMergedInto": {
    "zh": "{count} 个提交还没合进 {into}",
    "en": "{count} {count, plural, one {commit} other {commits}} not merged into {into}"
  },
  "worktreeGroups.mergedInto": {
    "zh": "已合进 {into}",
    "en": "Merged into {into}"
  },
  "chatNotices.resetDate": {
    "zh": "{value1}月{value2}日 ",
    "en": "{value1}/{value2} "
  },
  "ChatWorking.inProgressSuffix": {
    "zh": "中…",
    "en": "…"
  },
  "OverviewView.todayDate": {
    "zh": "{value1}月{value2}日 周{value3}",
    "en": "{value1}/{value2} {value3}"
  },
  "SourceInboxView.monthAndDay": {
    "zh": "{value1}月{value2}日",
    "en": "{value1}/{value2}"
  },
  "labels.dateAndTime": {
    "zh": "{value1}月{value2}日 {value3}",
    "en": "{value1}/{value2} {value3}"
  },
  "AppUpdate.newVersion": {
    "zh": "新版本 {version}",
    "en": "New version {version}"
  },
  "AppUpdate.available": {
    "zh": "Antumi {version} 可以更新了",
    "en": "Antumi {version} is available"
  },
  "AppUpdate.current": {
    "zh": "当前版本 {version}",
    "en": "You have {version}"
  },
  "AppUpdate.installAndRestart": {
    "zh": "下载并安装",
    "en": "Download and install"
  },
  "AppUpdate.installDownloaded": {
    "zh": "安装并重启",
    "en": "Install and restart"
  },
  "AppUpdate.downloadInstaller": {
    "zh": "下载安装包",
    "en": "Download installer"
  },
  "AppUpdate.details": {
    "zh": "更新详情",
    "en": "Update details"
  },
  "AppUpdate.releasePage": {
    "zh": "发布页",
    "en": "Release page"
  },
  "AppUpdate.skipVersion": {
    "zh": "跳过此版本",
    "en": "Skip this version"
  },
  "AppUpdate.downloading": {
    "zh": "正在下载 {percent}%",
    "en": "Downloading {percent}%"
  },
  "AppUpdate.installing": {
    "zh": "正在安装，完成后自动重启…",
    "en": "Installing; Antumi restarts when done…"
  },
  "AppUpdate.restartNote": {
    "zh": "只重启 Antumi 的窗口，正在运行的 Agent 和终端不受影响。",
    "en": "Only the Antumi window restarts; running agents and terminals carry on."
  },
  "AppUpdate.manualMac": {
    "zh": "下载后打开 dmg，把 Antumi 拖进「应用程序」替换旧版本。打开时被拦的话，到 系统设置 → 隐私与安全性 点「仍要打开」。",
    "en": "Open the dmg and drag Antumi into Applications to replace the old version. If macOS blocks it, go to System Settings → Privacy & Security and click Open Anyway."
  },
  "AppUpdate.manualWindows": {
    "zh": "下载后运行安装程序，它会替换旧版本。",
    "en": "Run the installer once downloaded; it replaces the old version."
  },
  "AppUpdate.failed": {
    "zh": "更新失败：{reason}",
    "en": "Update failed: {reason}"
  },
  "AppUpdate.retry": {
    "zh": "重试",
    "en": "Retry"
  },
  "AppUpdate.errorDownload": {
    "zh": "下载失败，请检查网络",
    "en": "the download failed; check your connection"
  },
  "AppUpdate.errorNetwork": {
    "zh": "连不上 GitHub，换个网络或开关 VPN 后再试",
    "en": "could not reach GitHub; try another network, or turn your VPN on or off"
  },
  "AppUpdate.errorRateLimited": {
    "zh": "GitHub 暂时拒绝了查询，多半是同一网络查得太频繁，稍后再试或换个网络",
    "en": "GitHub refused for now, usually because this network asked too often; try later or on another network"
  },
  "AppUpdate.errorIncomplete": {
    "zh": "安装包没有下载完整",
    "en": "the installer did not download completely"
  },
  "AppUpdate.errorDigest": {
    "zh": "安装包校验不通过",
    "en": "the installer failed its checksum"
  },
  "AppUpdate.errorBadInstaller": {
    "zh": "安装包内容不对",
    "en": "the installer is not the expected Antumi build"
  },
  "AppUpdate.updates": {
    "zh": "更新",
    "en": "Updates"
  },
  "AppUpdate.checkNow": {
    "zh": "检查更新",
    "en": "Check for updates"
  },
  "AppUpdate.checking": {
    "zh": "正在检查…",
    "en": "Checking…"
  },
  "AppUpdate.upToDate": {
    "zh": "已是最新版本",
    "en": "Up to date"
  },
  "AppUpdate.checkFailed": {
    "zh": "检查失败：{reason}",
    "en": "Check failed: {reason}"
  },
  "AppUpdate.lastChecked": {
    "zh": "上次检查 {time}",
    "en": "Last checked {time}"
  },
  "AppUpdate.skipped": {
    "zh": "已跳过 {version}",
    "en": "Skipped {version}"
  },
  "AppUpdate.unskip": {
    "zh": "取消跳过",
    "en": "Undo skip"
  },
  "AppUpdate.automatic": {
    "zh": "后台自动更新",
    "en": "Automatic background updates"
  },
  "AppUpdate.automaticDescription": {
    "zh": "自动检查并下载新版本，下次启动时安装。下载后也可点击左下角「安装并重启」立即更新。",
    "en": "Check for updates and download them in the background. Install on the next launch, or click “Install and restart” in the bottom-left corner to update now."
  },
  "AppUpdate.installOnNextLaunch": {
    "zh": "更新已下载，下次启动时自动安装，也可以立即安装并重启。",
    "en": "Update downloaded. It will install on the next launch, or you can install and restart now."
  },
  "AppUpdate.automaticSaveFailed": {
    "zh": "自动更新设置未能保存，请重试。",
    "en": "Could not save the automatic update preference. Please try again."
  },
  "AppUpdate.prerelease": {
    "zh": "接收测试版",
    "en": "Include pre-releases"
  },
  "AppUpdate.prereleaseDescription": {
    "zh": "也提示带 beta 等后缀的预发布版本，可能不稳定。",
    "en": "Also offer beta and other pre-release versions, which may be unstable."
  },
  "AppUpdate.updatesDescription": {
    "zh": "每 6 小时到 GitHub 查一次新版本。",
    "en": "Looks for a new version on GitHub every 6 hours."
  },
  "AppUpdate.restartNoteWindows": {
    "zh": "安装时 Antumi 会关闭，装好后自动重新打开。所有 Agent 和终端都停下后才能安装。",
    "en": "Antumi closes while it installs and reopens when done. It installs only once no agent or terminal is running."
  },
  "AppUpdate.errorBackendUnresponsive": {
    "zh": "Antumi 后台没有按时退出，安装程序没有运行；稍后重试",
    "en": "the Antumi backend did not stop in time, so the installer did not run; try again shortly"
  },
  "AppUpdate.blockerTerminal": {
    "zh": "终端：{title}",
    "en": "Terminal: {title}"
  },
  "AppUpdate.blockerConversation": {
    "zh": "会话：{title}",
    "en": "Conversation: {title}"
  },
  "AppUpdate.blockerAgent": {
    "zh": "{agent} 的临时进程（登录、查询等），稍后重试",
    "en": "A short-lived {agent} process (sign-in, a lookup); try again shortly"
  },
  "AppUpdate.blockerUnknown": {
    "zh": "无法识别的进程",
    "en": "An unrecognised process"
  },
  "AppUpdate.open": {
    "zh": "打开",
    "en": "Open"
  },
  "AppUpdate.closeTerminal": {
    "zh": "关闭",
    "en": "Close"
  },
  "AppUpdate.errorAgentsRunning": {
    "zh": "还有 Agent 或终端在运行，等它们都停下后再重试",
    "en": "agents or terminals are still running; retry once they have stopped"
  },
  "ModelProviderSettings.plan": { "zh": "套餐", "en": "Plan" },
  "ModelProviderSettings.custom": { "zh": "自定义", "en": "Custom" },
  "ModelProviderSettings.customHint": { "zh": "自己填地址、Key 和模型", "en": "Your own address, key and models" },
  "ModelProviderSettings.verified": { "zh": "已验证", "en": "Verified" },
  "ModelProviderSettings.unverified": { "zh": "未验证", "en": "Unverified" },
  "ModelProviderSettings.unverifiedHint": { "zh": "「未验证」的预设按各家文档填好，还没在 Antumi 里用真 Key 实测过。", "en": "Unverified presets follow each vendor's docs and have not been tried with a real key in Antumi yet." },
  "ModelProviderSettings.keyHint": { "zh": "只存在本机的 Antumi 里，不进 Agent 的配置、命令行和日志。", "en": "Kept only in Antumi on this machine, never in an agent's configuration, command line or logs." },
  "ModelProviderSettings.getKey": { "zh": "去控制台获取 ↗", "en": "Get one in the console ↗" },
  "ModelProviderSettings.models": { "zh": "模型", "en": "Models" },
  "ModelProviderSettings.modelsHint": { "zh": "一行一个，用服务商给的模型名。新建会话时可以在这些里面换。", "en": "One per line, named as the provider names them. A new conversation can switch among these." },
  "ModelProviderSettings.modelsFollowPreset": { "zh": "这是预设的列表，Antumi 更新预设时会跟着更新；改了就以你的为准。", "en": "This is the preset's list, updated with Antumi's presets; once edited, yours stands." },
  "ModelProviderSettings.restorePresetModels": { "zh": "恢复预设的模型列表", "en": "Restore the preset's models" },
  "ModelProviderSettings.defaultModel": { "zh": "默认模型", "en": "Default model" },
  "ModelProviderSettings.smallModel": { "zh": "小模型", "en": "Small model" },
  "ModelProviderSettings.smallModelHint": { "zh": "标题、翻译、提交说明这类小任务用它。", "en": "Used for small jobs such as titles, translations and commit messages." },
  "ModelProviderSettings.agents": { "zh": "给哪些 Agent 用", "en": "Agents that use it" },
  "ModelProviderSettings.agentsUnservable": { "zh": "{value1} 用不了这个服务商的接口，只能用自己的账号。", "en": "{value1} cannot use this provider's endpoints and keep their own accounts." },
  "ModelProviderSettings.addresses": { "zh": "地址", "en": "Addresses" },
  "ModelProviderSettings.anthropicUrl": { "zh": "Anthropic 协议地址", "en": "Anthropic endpoint" },
  "ModelProviderSettings.anthropicUrlHint": { "zh": "给 Claude Code 用，例如 https://api.example.com/anthropic。不用加 /v1。", "en": "For Claude Code, such as https://api.example.com/anthropic, without /v1." },
  "ModelProviderSettings.keyHeader": { "zh": "Key 放在", "en": "Key goes in" },
  "ModelProviderSettings.responsesUrl": { "zh": "OpenAI Responses 地址", "en": "OpenAI Responses endpoint" },
  "ModelProviderSettings.chatUrl": { "zh": "OpenAI Chat Completions 地址", "en": "OpenAI Chat Completions endpoint" },
  "ModelProviderSettings.openaiUrlHint": { "zh": "Codex 要 Responses，OpenCode 两种都行。填到 /responses 或 /chat/completions 之前那一级。", "en": "Codex needs Responses; OpenCode takes either. Give the address up to, not including, /responses or /chat/completions." },
  "ModelProviderSettings.badUrl": { "zh": "地址要用 https://（http:// 只能连本机），不能带账号密码、? 参数或 # 片段。", "en": "Use https:// (http:// only for this machine), with no user name, password, ? query or # fragment." },
  "ModelProviderSettings.testing": { "zh": "正在测试，每个接口和模型各发一个很短的请求……", "en": "Testing: one short request per endpoint and model…" },
  "ModelProviderSettings.noResponse": { "zh": "没有回应", "en": "no response" },
  "ModelProviderSettings.probeFailedHint": { "zh": "可能是 Key、地址或模型名不对，以服务商返回的原话为准。", "en": "The key, address or model name may be wrong; the provider's own words above say which." },
  "ModelProviderSettings.summary": { "zh": "给 {value1} 用 · 默认模型 {value2}", "en": "For {value1} · default model {value2}" },
  "ModelProviderSettings.noKey": { "zh": "还没有 API Key", "en": "No API key yet" },
  "ModelProviderSettings.console": { "zh": "控制台看用量 ↗", "en": "Usage in the console ↗" },
  "ModelProviderSettings.removeWarning": { "zh": "删除后，用它的会话和任务不能再继续，直到重新添加。", "en": "Conversations and tasks on it cannot go on until it is added again." },
  "ModelProviderSettings.intro": { "zh": "不改 Agent 自己的配置。没选服务商的会话照常用 Agent 自己登录的账号；选了服务商的会话，用量按服务商算，不占官方账号的额度。", "en": "Agents' own configuration is left as it is. A conversation without a provider uses the agent's own account; one on a provider spends the provider's plan, not the account's quota." },
  "ModelProviderSettings.none": { "zh": "还没有服务商", "en": "No providers yet" },
  "ModelProviderSettings.add": { "zh": "添加服务商", "en": "Add provider" },
  "SettingsPage.modelProviders": { "zh": "服务商", "en": "Model providers" },
  "SettingsPage.modelProvidersDescription": { "zh": "让 Agent 用第三方编程套餐的模型，比如火山方舟、智谱 GLM。新建会话时选用哪一个。", "en": "Let agents use a third-party coding plan's models, such as Volcengine Ark or Zhipu GLM. Pick one when starting a conversation." },
  "ProviderPicker.provider": { "zh": "服务商", "en": "Provider" },
  "ProviderPicker.ownAccount": { "zh": "{value1} 账号", "en": "{value1} account" },
  "ProviderPicker.ownAccountDescription": { "zh": "用 {value1} 自己登录的账号", "en": "The account {value1} is signed in with" },
  "ProviderPicker.manage": { "zh": "管理服务商…", "en": "Manage providers…" },
  "RouteBadge.onProvider": { "zh": "在服务商「{value1}」上运行，这个会话固定用它", "en": "Runs on {value1}, fixed for this conversation" },
  "RouteBadge.ownAccount": { "zh": "服务商「{value2}」不服务 {value1}，它用自己的账号", "en": "{value2} does not serve {value1}, which uses its own account" },
  "RouteBadge.ownAccountShort": { "zh": "{value1} 账号", "en": "{value1} account" },
  "RouteBadge.unavailable": { "zh": "服务商「{value1}」已删除或没有 Key，补上之前 Agent 不能继续", "en": "{value1} is gone or has no key; the agent cannot go on until it is back" },
  "RouteBadge.removedProvider": { "zh": "已删除的服务商", "en": "Removed provider" },
  "ChatHandoff.keepsProvider": { "zh": "沿用服务商「{value1}」", "en": "Keeps {value1}" },
  "AgentAccounts.title": { "zh": "账号", "en": "Accounts" },
  "AgentAccounts.description": { "zh": "登录多个 Claude、Codex 账号，在状态栏切换，额度用完时自动换下一个。", "en": "Sign in to several Claude and Codex accounts, switch in the status bar, and move on to the next when one runs out." },
  "AgentAccounts.intro": { "zh": "每个账号在自己的配置目录里运行，会话历史、设置、技能和 MCP 服务器与本机账号共享，所以换号后会话原样接着跑。正在运行的会话保持原账号，之后启动的用当前账号。", "en": "Each account runs in a config folder of its own that shares conversation history, settings, skills and MCP servers with your own, so a conversation carries on as it was after a switch. Running conversations keep their account; whatever starts next uses the active one." },
  "AgentAccounts.own": { "zh": "本机账号", "en": "Default account" },
  "AgentAccounts.unnamed": { "zh": "账号 {value1}", "en": "Account {value1}" },
  "AgentAccounts.active": { "zh": "当前", "en": "Active" },
  "AgentAccounts.makeActive": { "zh": "设为当前", "en": "Make active" },
  "AgentAccounts.signIn": { "zh": "登录", "en": "Sign in" },
  "AgentAccounts.signInAgain": { "zh": "重新登录", "en": "Sign in again" },
  "AgentAccounts.add": { "zh": "添加 {value1} 账号", "en": "Add {value1} account" },
  "AgentAccounts.namePlaceholder": { "zh": "名称（可选），比如「工作」", "en": "Name (optional), such as Work" },
  "AgentAccounts.addAndSignIn": { "zh": "添加并登录", "en": "Add and sign in" },
  "AgentAccounts.signInHint": { "zh": "在下方终端里按提示完成登录；登录结束后，这里会显示账号的邮箱。", "en": "Finish signing in in the terminal below; the account’s email shows here once it is done." },
  "AgentAccounts.rename": { "zh": "改名", "en": "Rename" },
  "AgentAccounts.removeWarning": { "zh": "会退出这个账号并删掉它的配置目录；会话历史留在本机账号里。", "en": "Signs this account out and deletes its config folder; conversation history stays with your own." },
  "AgentAccounts.autoSwitch": { "zh": "额度用完时自动换下一个账号", "en": "Move to the next account when one runs out" },
  "AgentAccounts.autoSwitchDescription": { "zh": "撞上额度上限的会话立即在有额度的账号上接着跑，状态栏的当前账号也跟着换；所有账号都用完时，等最早的那次重置。", "en": "A conversation that hits a usage limit goes on at once on an account with quota, which becomes the active one; with every account spent, it waits for the earliest reset." },
  "AgentAccounts.manage": { "zh": "管理账号…", "en": "Manage accounts…" },
  "AgentAccounts.switchTo": { "zh": "切换到 {value1}", "en": "Switch to {value1}" },
  "AgentAccounts.noUsage": { "zh": "还没有额度数据", "en": "No usage yet" },
  "AgentAccounts.spent": { "zh": "已用完", "en": "Spent" },
  "AgentAccounts.switchedTo": { "zh": "已换到账号「{value1}」继续", "en": "Moved to {value1} and went on" },
  "AgentAccounts.switchingTo": { "zh": "额度用完，正在换到账号「{value1}」继续", "en": "Usage limit reached; going on with {value1}" },
  "AgentAccounts.onAccount": { "zh": "在账号「{value1}」上运行", "en": "Runs on {value1}" },
  "ChatHandoff.ownAccountInstead": { "zh": "用自己的账号：「{value1}」不服务它", "en": "Its own account: {value1} does not serve it" },
  "GitInspector.updateFromRemote": {
    "zh": "从远端更新",
    "en": "Update from remote"
  },
  "GitInspector.updateBranch": {
    "zh": "更新 {branch}",
    "en": "Update {branch}"
  },
  "GitInspector.updateDiverged": {
    "zh": "{branch} 和 {upstream} 已分叉：本地有 {ahead} 个提交还没推送，远端有 {behind} 个新提交。选择怎样把远端的提交并进来：",
    "en": "{branch} and {upstream} have diverged: {ahead} local commits are not pushed and the remote has {behind} new ones. Choose how to bring the remote commits in:"
  },
  "GitInspector.updateMerge": {
    "zh": "合并（Merge）",
    "en": "Merge"
  },
  "GitInspector.updateMergeDescription": {
    "zh": "多出一个合并提交，本地提交保持原样。",
    "en": "Adds a merge commit and leaves your local commits as they are."
  },
  "GitInspector.updateRebase": {
    "zh": "变基（Rebase）",
    "en": "Rebase"
  },
  "GitInspector.updateRebaseDescription": {
    "zh": "把本地的提交重新接到远端之后，历史是一条直线。已经推送出去的提交不要变基。",
    "en": "Replays your local commits on top of the remote ones for a straight history. Do not rebase commits you have already pushed."
  },
  "GitInspector.updateStashNote": {
    "zh": "有未提交的改动时，会先暂存起来，更新完再放回。",
    "en": "Uncommitted changes are stashed first and put back afterwards."
  },
  "GitInspector.upToDate": {
    "zh": "{branch} 已是最新。",
    "en": "{branch} is up to date."
  },
  "GitInspector.updated": {
    "zh": "{branch} 已更新，拉入 {count} 个提交。",
    "en": "{branch} updated with {count} incoming commits."
  },
  "GitInspector.stashKept": {
    "zh": "未提交的改动没能自动放回，留在 stash 里（antumi-update:{branch}），请在终端用 git stash pop 处理。",
    "en": "Your uncommitted changes did not apply cleanly and wait in the stash (antumi-update:{branch}); run git stash pop in a terminal."
  },
  "GitInspector.rebaseConflicts": {
    "zh": "变基出现冲突，请处理下面列出的文件。",
    "en": "Rebase conflicts found. Resolve the files listed below."
  },
  "GitInspector.rebaseIsUnfinished": {
    "zh": "变基尚未完成",
    "en": "Rebase is unfinished"
  },
  "GitInspector.continueRebase": {
    "zh": "继续变基",
    "en": "Continue rebase"
  },
  "GitInspector.abortRebase": {
    "zh": "中止变基…",
    "en": "Abort rebase…"
  },
  "GitInspector.abortRebaseTitle": {
    "zh": "中止变基",
    "en": "Abort rebase"
  },
  "GitInspector.abortRebaseExplained": {
    "zh": "中止这次变基，分支回到更新之前的样子。",
    "en": "Abort this rebase and return the branch to where it was before the update."
  },
  "GitInspector.aheadBehind": {
    "zh": "落后 {behind} 个提交 · 领先 {ahead} 个提交",
    "en": "{behind} behind · {ahead} ahead"
  },
  "labels.branchDivergedSwitchToUpdate": {
    "zh": "这个分支和远端已分叉，切换到这个分支后再更新。",
    "en": "This branch has diverged from its remote; switch to it to update it."
  },
  "GitPush.pushTo": {
    "zh": "推送到 {name}",
    "en": "Push to {name}"
  },
  "GitPush.remote": {
    "zh": "远端",
    "en": "Remote"
  },
  "GitPush.target": {
    "zh": "远端分支",
    "en": "Remote branch"
  },
  "GitPush.otherName": {
    "zh": "目标是 {name}，不是同名分支：这个分支的上游是 {upstream}。",
    "en": "The target is {name}, not a branch of the same name: this branch's upstream is {upstream}."
  },
  "GitPush.otherNameNoUpstream": {
    "zh": "目标是 {name}，不是同名分支。",
    "en": "The target is {name}, not a branch of the same name."
  },
  "GitPush.newAndUpstream": {
    "zh": "新分支并跟踪",
    "en": "New, and tracked"
  },
  "GitPush.new": {
    "zh": "新分支",
    "en": "New"
  },
  "GitPush.commits": {
    "zh": "将推送 {count} 个提交",
    "en": "{count} {count, plural, one {commit} other {commits}} to push"
  },
  "GitPush.loading": {
    "zh": "正在计算要推送的提交…",
    "en": "Working out what to push…"
  },
  "GitPush.nothing": {
    "zh": "没有要推送的提交，远端已是最新。",
    "en": "Nothing to push: the remote is up to date."
  },
  "GitPush.more": {
    "zh": "还有 {count} 个…",
    "en": "{count} more…"
  },
  "GitPush.keepsUpstream": {
    "zh": "跟踪关系不变（仍是 {upstream}）。",
    "en": "The upstream stays {upstream}."
  },
  "GitPush.setsUpstream": {
    "zh": "推送后设为这个分支的上游。",
    "en": "It becomes this branch's upstream."
  },
  "GitPush.createsUpstream": {
    "zh": "远端还没有 {name}：推送后新建，并设为这个分支的上游。",
    "en": "The remote has no {name} yet: the push creates it and makes it this branch's upstream."
  },
  "GitPush.creates": {
    "zh": "远端还没有 {name}：推送后新建。",
    "en": "The remote has no {name} yet: the push creates it."
  },
  "GitPush.rememberedMerge": {
    "zh": "推送被拒时会自动合并后重推。",
    "en": "A rejected push is merged and pushed again automatically."
  },
  "GitPush.rememberedRebase": {
    "zh": "推送被拒时会自动变基后重推。",
    "en": "A rejected push is rebased and pushed again automatically."
  },
  "GitPush.askEachTime": {
    "zh": "改为每次询问",
    "en": "Ask each time"
  },
  "GitPush.rejectedTitle": {
    "zh": "推送被拒",
    "en": "Push rejected"
  },
  "GitPush.rejectedExplained": {
    "zh": "远端 {target} 有本地没有的提交，需要先并进来再推。",
    "en": "{target} has commits this branch lacks; bring them in before pushing."
  },
  "GitPush.rememberChoice": {
    "zh": "记住这次的选择，以后自动这样更新",
    "en": "Remember this choice and update this way from now on"
  },
  "GitPush.mergeAndPush": {
    "zh": "合并后重推",
    "en": "Merge and push"
  },
  "GitPush.rebaseAndPush": {
    "zh": "变基后重推",
    "en": "Rebase and push"
  },
  "GitPush.pushed": {
    "zh": "已推送到 {target}。",
    "en": "Pushed to {target}."
  },
  "GitPush.updateStopped": {
    "zh": "更新停在冲突上，没有重推；解决后再推送。",
    "en": "The update stopped on conflicts and nothing was pushed; push again once they are resolved."
  },
  "GitInspector.trackedBranch": {
    "zh": "跟踪的远端分支",
    "en": "Tracked branch"
  },
  "GitInspector.noTrackedBranch": {
    "zh": "无",
    "en": "None"
  },
  "GitInspector.untrack": {
    "zh": "取消跟踪",
    "en": "Track none"
  },
  "SettingsPage.sessionImport": {
    "zh": "导入会话",
    "en": "Import sessions"
  },
  "SettingsPage.sessionImportDescription": {
    "zh": "导入在终端或 ZCode 里跑过的 Claude Code、Codex、ZCode 会话，在 Antumi 里接着聊",
    "en": "Bring in Claude Code, Codex and ZCode sessions you ran in a terminal or in ZCode, and continue them in Antumi"
  },
  "SessionImportSettings.note": {
    "zh": "导入后保留之前的对话；之后发消息时，Agent 在原目录里恢复同一个会话接着聊。在终端里又聊过的会话会标为「有更新」，再导入一次只补上新的部分。",
    "en": "Imported sessions keep their history. Your next message resumes the same session in its original folder. Sessions you continued in a terminal show as Updated; importing again adds only what is new."
  },
  "SessionImportSettings.agentFilter": {
    "zh": "Agent",
    "en": "Agent"
  },
  "SessionImportSettings.allAgents": {
    "zh": "全部",
    "en": "All"
  },
  "SessionImportSettings.search": {
    "zh": "搜索标题、内容或目录",
    "en": "Search titles, prompts or folders"
  },
  "SessionImportSettings.hideImported": {
    "zh": "隐藏已导入",
    "en": "Hide imported"
  },
  "SessionImportSettings.rescan": {
    "zh": "重新扫描",
    "en": "Scan again"
  },
  "SessionImportSettings.expandAll": {
    "zh": "全部展开",
    "en": "Expand all"
  },
  "SessionImportSettings.collapseAll": {
    "zh": "全部折叠",
    "en": "Collapse all"
  },
  "SessionImportSettings.summary": {
    "zh": "{folders} 个目录 · {count} 个会话",
    "en": "{folders} {folders, plural, one {folder} other {folders}} · {count} {count, plural, one {session} other {sessions}}"
  },
  "SessionImportSettings.sessionCount": {
    "zh": "{count} 个会话",
    "en": "{count} {count, plural, one {session} other {sessions}}"
  },
  "SessionImportSettings.selectedCount": {
    "zh": "已选 {count}",
    "en": "{count} selected"
  },
  "SessionImportSettings.hiddenSelected": {
    "zh": "其中 {count} 个不在当前筛选中",
    "en": "{count} outside current filters"
  },
  "SessionImportSettings.clearSelection": {
    "zh": "清空选择",
    "en": "Clear selection"
  },
  "SessionImportSettings.scanning": {
    "zh": "正在读取会话…",
    "en": "Reading sessions…"
  },
  "SessionImportSettings.none": {
    "zh": "没有找到在 Antumi 之外跑过的会话",
    "en": "No sessions run outside Antumi were found"
  },
  "SessionImportSettings.noneMatch": {
    "zh": "没有符合条件的会话",
    "en": "No sessions match"
  },
  "SessionImportSettings.selectFolder": {
    "zh": "选择 {value1} 里的全部会话",
    "en": "Select every session in {value1}"
  },
  "SessionImportSettings.select": {
    "zh": "选择 {value1}",
    "en": "Select {value1}"
  },
  "SessionImportSettings.missingFolder": {
    "zh": "目录已不存在",
    "en": "Folder is gone"
  },
  "SessionImportSettings.statusImported": {
    "zh": "已导入",
    "en": "Imported"
  },
  "SessionImportSettings.statusUpdated": {
    "zh": "有更新",
    "en": "Updated"
  },
  "SessionImportSettings.open": {
    "zh": "打开",
    "en": "Open"
  },
  "SessionImportSettings.importing": {
    "zh": "正在导入…",
    "en": "Importing…"
  },
  "SessionImportSettings.importSelected": {
    "zh": "导入所选（{count}）",
    "en": "Import selected ({count})"
  },
  "SessionImportSettings.imported": {
    "zh": "已导入 {count} 个会话",
    "en": "Imported {count} {count, plural, one {session} other {sessions}}"
  },
  "labels.notPushed": {
    "zh": "没有推送",
    "en": "Not pushed"
  },
  "labels.pushRejected": {
    "zh": "推送被拒",
    "en": "Push rejected"
  },
  "UsageRings.tokenMix": {"zh": "token 构成", "en": "Token mix"},
  "UsageRings.requests": {"zh": "{count} 次请求", "en": "{count} {count, plural, one {request} other {requests}}"},
  "UsageRings.total": {"zh": "合计", "en": "Total"},
  "UsageRings.cacheRead": {"zh": "缓存读取", "en": "Cache reads"},
  "UsageRings.cacheWrite": {"zh": "缓存写入", "en": "Cache writes"},
  "UsageRings.uncachedInput": {"zh": "未缓存输入", "en": "Uncached input"},
  "UsageRings.output": {"zh": "输出", "en": "Output"},
  "UsageRings.outputDetail": {"zh": "{tokens} · 含推理", "en": "{tokens} \u00b7 incl. reasoning"},
  "UsageRings.byAgent": {"zh": "按 Agent", "en": "By agent"},
  "UsageRings.pickToNarrow": {"zh": "点一项只看它", "en": "Pick one to see it alone"},
  "UsageRings.cost": {"zh": "金额", "en": "Cost"},
  "UsageDays.title": {"zh": "近 {range} 天用量", "en": "Usage, last {range} {range, plural, one {day} other {days}}"},
  "UsageDays.dayTooltip": {"zh": "{day} · {tokens} token · {cost}", "en": "{day} \u00b7 {tokens} tokens \u00b7 {cost}"},
  "UsageDays.pricedCost": {"zh": "金额（已计价的请求）", "en": "Cost (priced requests)"},
  "UsageTables.byTokens": {"zh": "所有来源 · 按 token 排", "en": "All sources \u00b7 by tokens"},
  "UsageTables.requests": {"zh": "请求", "en": "Requests"},
  "UsageTables.allModels": {"zh": "显示全部 {count} 个模型", "en": "Show all {count} models"},
  "UsageTables.fewerModels": {"zh": "收起", "en": "Show fewer"},
  "DashboardKpis.tokensTheAgentsReadAndWrote": {"zh": "各 Agent 日志里记下的读写 token，含 Antumi 之外的使用", "en": "Tokens read and written as the agents' own logs record them, including use outside Antumi"},
  "DashboardKpis.pricedRequests": {"zh": "已计价 {share} 的请求", "en": "{share} of requests priced"},
  "DashboardKpis.cacheHit": {"zh": "缓存命中", "en": "Cache hits"},
  "DashboardKpis.shareOfInputReadFromTheCache": {"zh": "输入 token 里从缓存读取的比例", "en": "Share of input tokens read from the cache"},
  "DashboardKpis.cacheRead": {"zh": "读取 {tokens}", "en": "{tokens} read"},
  "DashboardPanel.scanAndRefresh": {"zh": "扫描日志并刷新", "en": "Scan logs and refresh"},
  "UsageAnalytics.all": {"zh": "全部", "en": "All"},
  "UsageAnalytics.external": {"zh": "外部", "en": "External"},
  "UsageAnalytics.source": {"zh": "用量来源", "en": "Usage source"},
  "UsageAnalytics.clearFilters": {"zh": "返回全部", "en": "Clear filters"},
  "UsageAnalytics.unknownAccount": {"zh": "未知账号", "en": "Unknown account"},
  "UsageAnalytics.unknownModel": {"zh": "未知模型", "en": "Unknown model"},
  "UsageAnalytics.failed": {"zh": "读取用量失败，可刷新重试", "en": "Could not load usage. Refresh to retry."},
  "UsageAnalytics.costNote": {"zh": "已计价 {priced}/{total} 条记录；折算金额不代表订阅扣款", "en": "{priced}/{total} records priced; estimates are not subscription charges"},
  "UsageAnalytics.reportedEstimated": {"zh": "报告 {reported} · 折算 {estimated}", "en": "Reported {reported} · Estimated {estimated}"},
  "UsageAnalytics.dailyTokens": {"zh": "每日 token 消耗", "en": "Daily token usage"},
  "UsageAnalytics.models": {"zh": "按模型", "en": "By model"},
  "UsageAnalytics.accounts": {"zh": "按账号", "en": "By account"},
  "UsageAnalytics.sessions": {"zh": "会话明细", "en": "Session details"},
  "UsageAnalytics.background": {"zh": "后台请求", "en": "Background request"},
  "UsageAnalytics.sessionLimit": {"zh": "最多显示最近 100 个会话；会话级汇总不分配到每日趋势。", "en": "Shows up to 100 recent sessions; session aggregates are excluded from daily trends."},
  "UsageAnalytics.partial": {"zh": "部分来源暂不可读，保留上次记录", "en": "Some sources are unavailable; previous records are retained"},
  "UsageAnalytics.scanNote": {"zh": "已检查 {files} 个文件 · {at}", "en": "Checked {files} files · {at}"},
  "UsageAnalytics.empty": {"zh": "此范围没有用量记录", "en": "No usage records in this range"},
  "UsageAnalytics.forecasts": {"zh": "额度耗尽预测", "en": "Quota forecasts"},
  "UsageAnalytics.stale": {"zh": "额度数据已过时", "en": "Quota reading is stale"},
  "UsageAnalytics.idle": {"zh": "近期额度无增长", "en": "No recent quota growth"},
  "UsageAnalytics.insufficient": {"zh": "样本不足", "en": "Not enough samples"},
  "UsageAnalytics.windowAverage": {"zh": "按窗口平均速度", "en": "Window average rate"},
  "UsageAnalytics.recentRate": {"zh": "按最近一小时速度", "en": "Rate over the last hour"},
  "UsageAnalytics.resetFirst": {"zh": "预计重置前不会用完", "en": "Not expected to run out before reset"},
  "UsageAnalytics.exhaustsAt": {"zh": "预计 {at} 用完", "en": "Expected to run out at {at}"},
  "UsageAnalytics.automation": {"zh": "额度预热与自动用卡", "en": "Quota warmup and automatic resets"},
  "UsageAnalytics.account": {"zh": "账号", "en": "Account"},
  "UsageAnalytics.dailyWarmup": {"zh": "每日预热时间", "en": "Daily warmup times"},
  "UsageAnalytics.dailyHint": {"zh": "多个时间用英文逗号分隔；留空关闭定时预热。", "en": "Separate times with commas. Leave empty to disable daily warmup."},
  "UsageAnalytics.timeZone": {"zh": "时区", "en": "Time zone"},
  "UsageAnalytics.afterReset": {"zh": "窗口重置后预热", "en": "Warm up after a window resets"},
  "UsageAnalytics.weekReset": {"zh": "周额度用完后自动用卡", "en": "Use a reset when weekly quota runs out"},
  "UsageAnalytics.weekHint": {"zh": "有工作等待时先尝试自动换号；无替代账号时才用卡，每个原周窗口最多一张。", "en": "For waiting work, try account switching first. Spend at most one reset per original weekly window when no alternative is available."},
  "UsageAnalytics.expiringReset": {"zh": "重置卡临期自动使用", "en": "Use expiring reset credits"},
  "UsageAnalytics.expiringHint": {"zh": "剩余 24 小时内、可清除的额度已有消耗时，优先使用最早到期卡。", "en": "Within 24 hours of expiry, spend the earliest credit when its eligible windows have usage."},
  "UsageAnalytics.invalidPolicy": {"zh": "请填写 HH:mm 时间和有效的 IANA 时区。", "en": "Enter HH:mm times and a valid IANA time zone."},
  "UsageAnalytics.warmupNote": {"zh": "预热会消耗少量额度，仅在 Antumi core 运行时执行；所有主动操作默认关闭。", "en": "Warmup uses a small amount of quota and runs while Antumi core is running. All active operations default to off."},
  "UsageAnalytics.recentActions": {"zh": "最近执行记录", "en": "Recent actions"},
  "UsageAnalytics.action.warmup": {"zh": "预热", "en": "Warmup"},
  "UsageAnalytics.action.week": {"zh": "周额度重置", "en": "Weekly quota reset"},
  "UsageAnalytics.action.expiring": {"zh": "临期用卡", "en": "Expiring credit"},
  "UsageAnalytics.action.manual": {"zh": "手动用卡", "en": "Manual reset"},
  "UsageAnalytics.state.pending": {"zh": "结果待确认", "en": "Outcome pending"},
  "UsageAnalytics.state.completed": {"zh": "已完成", "en": "Completed"},
  "UsageAnalytics.state.failed": {"zh": "未完成", "en": "Not completed"},
  "FilesPanel.files": {"zh": "文件", "en": "Files"},
  "FilesPanel.hideFiles": {"zh": "隐藏文件", "en": "Hide files"},
  "FilesPanel.whichFolders": {"zh": "查看哪份代码", "en": "Which checkout to show"},
  "FilesPanel.followsWhatYouLookAt": {"zh": "当前会话或任务的目录，跟随切换", "en": "The open conversation's or task's folders; follows as you switch"},
  "FilesPanel.pickAProject": {"zh": "选择项目", "en": "Pick a project"},
  "FilesPanel.pickAProjectAbove": {"zh": "在上方选择一个项目来浏览文件。", "en": "Pick a project above to browse its files."},
  "FilesPanel.openAConversationWithAProject": {"zh": "打开一个带项目的会话或任务，即可浏览它的文件。", "en": "Open a conversation or task with a project to browse its files."},
  "FilesPanel.updateCoreToBrowseProjects": {"zh": "当前 core 版本不支持直接浏览项目，请更新后重试。", "en": "This core can't browse a project directly. Update it and try again."},
  "FilesPanel.goToFile": {"zh": "转到文件", "en": "Go to file"},
  "FilesPanel.searchFilesIn": {"zh": "在 {value1} 中按名称查找文件", "en": "Search files in {value1} by name"},
  "FilesPanel.matchingFiles": {"zh": "匹配的文件", "en": "Matching files"},
} as const
