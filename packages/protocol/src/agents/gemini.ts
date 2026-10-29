import type { AgentDescriptor } from './agent-descriptor'
import { GEMINI_PRICES } from './model-prices'

export const gemini: AgentDescriptor = {
  label: 'Gemini CLI', cli: 'gemini', setup: 'account',
  translations: { en: {
    modes: {
      ask: { label: 'Default', description: 'Ask before running tools that need approval' },
      acceptEdits: { label: 'Auto Edit', description: 'Approve file edits automatically; other tools may ask' },
      plan: { label: 'Plan', description: 'Explore code and propose a plan before making changes' },
      bypass: { label: 'YOLO', description: 'Run every tool without approval prompts' }
    },
    environment: {
      role: 'Runs with `gemini --acp` in chat. Requires Node.js 20 or later.',
      install: 'npm install -g @google/gemini-cli@latest',
      signIn: 'Run gemini in a terminal to sign in with Google, or set GEMINI_API_KEY',
      outdated: { status: 'Requires Gemini CLI 0.66.0', hint: ', version 0.66.0 or later' }
    },
    usageWhere: 'Google account daily quota; API key and Vertex usage is available in Google’s console'
  } },
  modes: {
    ask: { label: 'Default', description: '需要授权的工具运行前询问' },
    acceptEdits: { label: 'Auto Edit', description: '自动批准文件编辑，其他工具仍可能询问' },
    plan: { label: 'Plan', description: '探索代码、制定计划，确认后再修改' },
    bypass: { label: 'YOLO', description: '所有工具直接运行，不再询问' }
  },
  startModes: ['ask', 'acceptEdits', 'plan'], defaultStartMode: 'ask', discussionMode: 'plan', readOnlyMode: 'plan',
  capabilities: { readOnly: false, unattended: true, bypass: true, autoMode: false, pathMentions: true, optionsWhileBusy: false, skills: false, userMcp: true, modelProviders: [], accounts: false },
  environment: {
    role: '聊天界面以 `gemini --acp` 运行它，需要 Node.js 20 以上版本。',
    install: 'npm install -g @google/gemini-cli@latest',
    signIn: '在终端运行 gemini 用 Google 账号登录，或设置 GEMINI_API_KEY',
    outdated: { status: '需要 Gemini CLI 0.66.0', hint: '，请使用 0.66.0 以上版本' }
  },
  usageWhere: 'Google 账号的每日额度；API key 和 Vertex 用量请在 Google 控制台查看',
  prices: GEMINI_PRICES
}
