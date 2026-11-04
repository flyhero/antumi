import type { AgentDescriptor } from './agent-descriptor'
import { CODEX_PRICES } from './model-prices'

// Its default mode reads "auto" to Codex users.
export const codex: AgentDescriptor = {
  quotaAutomation: { model: 'gpt-6-luna', resetCredits: true },
  translations: { en: {
    modes: {
      ask: { label: 'Ask each time', description: 'Ask before every action' },
      acceptEdits: { label: 'Automatic', description: 'Work freely in the project; ask before going beyond it' },
      plan: { label: 'Plan', description: 'Read code and propose a plan; execute after your approval' },
      readOnly: { label: 'Read only', description: 'Read files without modifying them' },
      bypass: { label: 'Allow everything', description: 'No approval prompts or sandbox restrictions' }
    },
    environment: { role: 'Runs with `codex app-server` in chat. Other Agents can be used without it.', install: 'npm install -g @openai/codex', signIn: 'Run codex login in a terminal' },
    usageWhere: 'Use in Codex usage settings'
  } },
  label: 'Codex',
  inlineVisualizations: 'codex',
  cli: 'codex',
  setup: 'account',
  modes: {
    ask: { label: '逐项确认', description: '每一步都先问你' },
    acceptEdits: { label: '自动', description: '在项目里自由修改，越界时才问' },
    plan: { label: '规划', description: '只读代码、给出计划，你确认后才动手' },
    readOnly: { label: '只读', description: '只能读，不能修改文件' },
    bypass: { label: '全部放行', description: '什么都不问，也不受沙箱限制' }
  },
  startModes: ['acceptEdits', 'ask', 'plan', 'readOnly'],
  defaultStartMode: 'acceptEdits',
  discussionMode: 'readOnly',
  readOnlyMode: 'readOnly',
  // skills: it reads only .agents/skills under the working folder and ~/.agents/skills, neither of
  // which Antumi writes; whether skills.config or skills/list can add a folder is unverified.
  capabilities: { unattended: true, bypass: true, autoMode: false, pathMentions: false, optionsWhileBusy: true, skills: false, userMcp: true, modelProviders: ['openai-responses'], accounts: true },
  environment: {
    role: '聊天界面以 `codex app-server` 运行它；没装也可以使用其他 Agent。',
    install: 'npm install -g @openai/codex',
    signIn: '在终端里运行 codex login'
  },
  usageWhere: '在 Codex 的用量设置里使用',
  resetTracker: 'codex',
  quickModels: [/-luna$/, /mini/, /nano/],
  prices: CODEX_PRICES
}
