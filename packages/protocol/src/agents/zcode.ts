import type { AgentDescriptor } from './agent-descriptor'

// Antumi's modes are ZCode's collaboration modes: ask is its build mode, auto its guarded mode
// ("autonomous"), bypass its yolo; plan is its plan flag over build, and readOnly build with every
// file edit refused by Antumi.
export const zcode: AgentDescriptor = {
  translations: { en: {
    modes: {
      ask: { label: 'Ask before changes', description: 'Ask before each file change or risky command' },
      acceptEdits: { label: 'Edit freely', description: 'Edit files in the project without asking; other actions still ask' },
      plan: { label: 'Plan', description: 'Read code and propose a plan; carry it out after your approval' },
      auto: { label: 'Autonomous', description: 'Work on its own; ask only where there is risk' },
      readOnly: { label: 'Read only', description: 'Read files without modifying them; ask before risky commands' },
      bypass: { label: 'Full access', description: 'Edit and run commands with no approval prompts' }
    },
    environment: { role: 'Runs with `zcode app-server` in chat. Other Agents can be used without it.', install: 'Install the ZCode desktop app, or npm install -g zcode-app-cli', signIn: 'Run zcode login in a terminal, or set up a model provider in ZCode' },
    usageWhere: 'Check in the Z.ai console'
  } },
  label: 'ZCode',
  cli: 'zcode',
  setup: 'account',
  modes: {
    ask: { label: '修改前询问', description: '每次修改文件或运行有风险的命令前先问你' },
    acceptEdits: { label: '自由编辑', description: '直接修改项目里的文件，其他操作仍会询问' },
    plan: { label: '规划', description: '只读代码、给出计划，你确认后才动手' },
    auto: { label: '自主', description: '自己往下做，有风险时才问你' },
    readOnly: { label: '只读', description: '只能读，不能修改文件；运行有风险的命令前先问你' },
    bypass: { label: '全部放行', description: '修改和运行命令都不再询问' }
  },
  startModes: ['ask', 'acceptEdits', 'plan', 'readOnly'],
  defaultStartMode: 'ask',
  discussionMode: 'readOnly',
  readOnlyMode: 'readOnly',
  unattendedModes: ['auto', 'acceptEdits'],
  // skills: it loads skills from its own settings file, which Antumi leaves alone.
  capabilities: { unattended: true, bypass: true, autoMode: true, pathMentions: false, optionsWhileBusy: true, skills: false, userMcp: true, modelProviders: ['anthropic', 'openai-chat', 'openai-responses'], accounts: false },
  environment: {
    role: '聊天界面以 `zcode app-server` 运行它；没装也可以使用其他 Agent。',
    install: '安装 ZCode 桌面版，或 npm install -g zcode-app-cli',
    signIn: '在终端里运行 zcode login，或在 ZCode 里配置模型服务商'
  },
  usageWhere: '在 Z.ai 控制台查看'
}
