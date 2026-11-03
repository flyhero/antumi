import type { AgentDescriptor } from './agent-descriptor'

// These are Kimi Code's native ACP modes. Plan is not a general read-only worker mode.
export const kimi: AgentDescriptor = {
  translations: { en: {
    modes: {
      ask: { label: 'Default', description: 'Use Kimi Code’s manual approval rules' },
      plan: { label: 'Plan', description: 'Explore code and propose a plan before making changes' },
      auto: { label: 'Auto', description: 'Kimi Code approves safe operations; other actions still ask' },
      bypass: { label: 'YOLO', description: 'Run every tool without approval prompts' }
    },
    environment: {
      role: 'Runs with `kimi acp` in chat. Requires the Node.js version of Kimi Code CLI.',
      install: 'npm install -g @moonshot-ai/kimi-code@latest (Node.js 22.19 or later)',
      signIn: 'Run kimi login in a terminal, or configure a provider in Kimi Code',
      outdated: { status: 'Requires Kimi Code 2.3.2', hint: ', version 2.3.2 or later; the legacy Python kimi-cli is unsupported' }
    },
    usageWhere: 'Check in the Kimi Code console'
  } },
  label: 'Kimi Code',
  cli: 'kimi',
  setup: 'account',
  modes: {
    ask: { label: 'Default', description: '按 Kimi Code 的手动审批规则执行' },
    plan: { label: 'Plan', description: '探索代码、制定计划，确认后再修改' },
    auto: { label: 'Auto', description: '由 Kimi Code 自动批准安全操作，其他操作仍会询问' },
    bypass: { label: 'YOLO', description: '所有工具直接运行，不再询问' }
  },
  startModes: ['ask', 'plan', 'auto'],
  defaultStartMode: 'ask',
  discussionMode: 'plan',
  readOnlyMode: 'plan',
  unattendedModes: ['auto'],
  capabilities: { unattended: true, bypass: true, autoMode: true, pathMentions: false, optionsWhileBusy: false, skills: false, userMcp: true, modelProviders: [], accounts: false },
  environment: {
    role: '聊天界面以 `kimi acp` 运行它，需要 Node.js 版 Kimi Code CLI。',
    install: 'npm install -g @moonshot-ai/kimi-code@latest（需要 Node.js 22.19 以上）',
    signIn: '在终端里运行 kimi login，或在 Kimi Code 里配置模型服务商',
    outdated: { status: '需要 Kimi Code 2.3.2', hint: '，并使用 2.3.2 以上版本；不支持旧 Python 版 kimi-cli' }
  },
  usageWhere: '在 Kimi Code 控制台查看'
}
