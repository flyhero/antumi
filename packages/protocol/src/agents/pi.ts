import type { AgentDescriptor } from './agent-descriptor'

// Pi asks nothing before a tool runs, so ask and bypass are both Pi as it comes. acceptEdits, plan
// and readOnly are Antumi's, held by the extension it loads into Pi (core agents/pi/pi-extension.ts):
// it refuses rather than asks, so acceptEdits also serves runs with nobody to answer.
export const pi: AgentDescriptor = {
  translations: { en: {
    modes: {
      ask: { label: 'Default', description: 'Pi as it comes: runs every tool without asking' },
      acceptEdits: { label: 'Automatic', description: 'Edit and run commands in the project; edits to files outside it are refused, not asked' },
      plan: { label: 'Plan', description: 'Read code and propose a plan; execute after your approval' },
      readOnly: { label: 'Read only', description: 'Read and search files; edits and commands that change things are refused, not asked' },
      bypass: { label: 'Allow everything', description: 'Pi as it comes: nothing asked, whatever the project' }
    },
    environment: { role: 'Runs with `pi --mode rpc` in chat. Other Agents can be used without it.', install: 'npm install -g @earendil-works/pi-coding-agent', signIn: 'Run pi in a terminal and use /login, or set your model provider API key', outdated: { status: 'Requires Pi 0.99', hint: ', version 0.99 or later' } },
    usageWhere: 'Check with your model provider'
  } },
  label: 'Pi',
  cli: 'pi',
  setup: 'provider',
  modes: {
    ask: { label: '默认', description: 'Pi 原本的工作方式：所有工具直接运行，不会停下来问' },
    acceptEdits: { label: '自动', description: '在项目里自由修改、运行命令；改项目外的文件直接拒绝，不会停下来问' },
    plan: { label: '规划', description: '只读代码、给出计划，你确认后才动手' },
    readOnly: { label: '只读', description: '只能读和搜索文件；改文件和会改东西的命令直接拒绝，不会问' },
    bypass: { label: '全部放行', description: '和默认一样，什么都不问，项目外也照样改' }
  },
  startModes: ['ask', 'acceptEdits', 'plan', 'readOnly'],
  defaultStartMode: 'ask',
  discussionMode: 'readOnly',
  readOnlyMode: 'readOnly',
  capabilities: { unattended: true, bypass: true, autoMode: false, pathMentions: false, optionsWhileBusy: false, skills: true, userMcp: true, modelProviders: ['openai-chat', 'openai-responses', 'anthropic'], accounts: false, lockdown: { images: true }, managedSteer: true },
  environment: {
    role: '聊天界面以 `pi --mode rpc` 运行它；没装也可以使用其他 Agent。',
    install: 'npm install -g @earendil-works/pi-coding-agent',
    signIn: '在终端运行 pi，用 /login 登录模型服务商，或设置服务商的 API key',
    outdated: { status: '需要 Pi 0.99', hint: '，并使用 0.99 以上版本' }
  },
  usageWhere: '在所用模型服务商处查看'
}
