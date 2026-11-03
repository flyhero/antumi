import type { AgentDescriptor } from './agent-descriptor'
import { CLAUDE_PRICES } from './model-prices'

export const claude: AgentDescriptor = {
  quotaAutomation: { model: 'haiku', resetCredits: false },
  translations: { en: {
    modes: {
      ask: { label: 'Ask each time', description: 'Ask before editing files or running commands' },
      acceptEdits: { label: 'Accept edits', description: 'Edit files directly; ask before running commands' },
      plan: { label: 'Plan', description: 'Read code and propose a plan; execute after your approval' },
      auto: { label: 'Automatic', description: 'Let the model decide which actions need approval' },
      bypass: { label: 'Allow everything', description: 'No approval prompts or restrictions' }
    },
    environment: { role: 'Runs with `claude -p` in chat. Other Agents can be used without it.', install: 'npm install -g @anthropic-ai/claude-code', signIn: 'Run claude in a terminal and follow the sign-in steps' },
    usageWhere: 'Use at claude.ai or in Claude Desktop Settings → Usage'
  } },
  label: 'Claude Code',
  cli: 'claude',
  setup: 'account',
  modes: {
    ask: { label: '逐项确认', description: '改文件、运行命令前都先问你' },
    acceptEdits: { label: '自动接受编辑', description: '改文件不再问，运行命令仍会问' },
    plan: { label: '规划', description: '只读代码、给出计划，你确认后才动手' },
    auto: { label: '自动判断', description: '由模型判断哪些操作要先问你' },
    bypass: { label: '全部放行', description: '什么都不问，也不受限制' }
  },
  startModes: ['ask', 'acceptEdits', 'plan'],
  defaultStartMode: 'auto',
  discussionMode: 'plan',
  readOnlyMode: 'ask',
  // Its classifier decides what needs asking; edits alone where the model lacks it.
  unattendedModes: ['auto', 'acceptEdits'],
  capabilities: { unattended: true, bypass: true, autoMode: true, pathMentions: true, optionsWhileBusy: true, skills: true, userMcp: true, modelProviders: ['anthropic'], accounts: true },
  environment: {
    role: '聊天界面以 `claude -p` 运行它；没装也可以只用 Codex。',
    install: 'npm install -g @anthropic-ai/claude-code',
    signIn: '在终端里运行 claude，按提示登录'
  },
  usageWhere: '在 claude.ai 网页版或 Claude Desktop 的 设置 → Usage 里使用',
  resetTracker: 'claude',
  quickModels: [/^haiku$/],
  prices: CLAUDE_PRICES
}
