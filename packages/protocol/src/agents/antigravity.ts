import type { AgentDescriptor } from './agent-descriptor'

// Google's Antigravity runs over either agy's native ACP (default, accept-edits, auto, plan, plus
// process-level --dangerously-skip-permissions for bypass) or the standalone Antigravity ACP server
// (default, auto_edit, yolo). Read-only stages stay locked in default (ask) mode while Antumi
// automatically denies file-write permission requests over ACP.
export const antigravity: AgentDescriptor = {
  translations: { en: {
    modes: {
      ask: { label: 'Ask each time', description: 'Ask before edits and commands, per your permission settings' },
      acceptEdits: { label: 'Accept edits', description: 'Approve file edits in the workspace without asking' },
      auto: { label: 'Automatic', description: 'Approve edits and safe commands; ask before irreversible actions' },
      plan: { label: 'Plan', description: 'Plan carefully before executing a task' },
      bypass: { label: 'Allow everything', description: 'Run every tool without asking' }
    },
    environment: {
      role: "Runs Google's Antigravity ACP server (the one behind its Zed and JetBrains extensions), which Antumi downloads into its own folder. Neither agy nor the Antigravity editor is needed.",
      install: 'Download the Antigravity ACP server from Settings → Local agents',
      signIn: 'Your first chat opens the Google sign-in page in the browser',
      missing: { status: 'Not downloaded', hint: "Antumi runs Antigravity through Google's Antigravity ACP server, which it downloads first (110–340 MB). Neither agy nor the Antigravity editor is needed." }
    },
    backendNames: { 'agy-cli': 'agy native ACP', 'managed-acp': 'Standalone ACP Server' },
    usageWhere: 'Send /usage in an Antigravity chat'
  } },
  label: 'Antigravity',
  cli: 'agy',
  setup: 'first-use',
  modes: {
    ask: { label: '逐项确认', description: '按权限设置执行，改文件、运行命令前先问你' },
    acceptEdits: { label: '自动接受编辑', description: '直接批准工作区内的文件修改，其他操作仍会问' },
    auto: { label: '自动判断', description: '自动批准文件修改和安全命令，不可逆操作前先问你' },
    plan: { label: '规划', description: '先分析并制定执行计划，再开始动手' },
    bypass: { label: '全部放行', description: '所有工具直接运行，不再询问' }
  },
  startModes: ['ask', 'acceptEdits'],
  backendModes: {
    'agy-cli': ['ask', 'acceptEdits', 'auto', 'plan', 'bypass'],
    'managed-acp': ['ask', 'acceptEdits', 'bypass']
  },
  backendNames: { 'agy-cli': 'agy 原生 ACP', 'managed-acp': '独立 ACP Server' },
  legacyBackend: 'managed-acp',
  defaultStartMode: 'ask',
  discussionMode: 'ask',
  readOnlyMode: 'ask',
  // Signed in with a personal account, its file tools refuse anything outside its cwd.
  primaryOnlyFiles: true,
  capabilities: { unattended: false, bypass: true, autoMode: true, pathMentions: false, optionsWhileBusy: false, skills: false, userMcp: true, modelProviders: [], accounts: true },
  environment: {
    role: '聊天界面运行 Google 的 Antigravity ACP 服务（Zed、JetBrains 扩展用的同一个），由 Antumi 下载到自己的目录；不需要 agy 或 Antigravity 编辑器。',
    install: '在 设置 → 外部智能体 里下载 Antigravity ACP 服务',
    signIn: '第一次对话时会在浏览器打开 Google 登录页',
    missing: { status: '未下载', hint: 'Antumi 通过 Google 的 Antigravity ACP 服务运行 Antigravity，需要先下载它（110–340 MB）；不需要 agy 或 Antigravity 编辑器。' }
  },
  usageWhere: '在 Antigravity 会话里发送 /usage 查看'
}
