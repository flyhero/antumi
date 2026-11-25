import type { AgentDescriptor } from './agent-descriptor'

const install = 'npm install -g @deepseek-ai/dsh'

export const dsh: AgentDescriptor = {
  label: 'DeepSeek Harness',
  cli: 'dsh',
  setup: 'provider',
  modes: {
    ask: { label: '默认', description: '在项目沙箱内编辑和运行命令；扩大权限前先问你' },
    acceptEdits: { label: '自动', description: '在项目里编辑和运行命令；越界操作直接拒绝，不会停下来问' },
    plan: { label: '规划', description: '只读探索并提交计划，你批准后才执行' },
    readOnly: { label: '只读', description: '只读和搜索文件，拒绝修改及有副作用的工具' },
    bypass: { label: '全部放行', description: '不限制文件访问，也不请求工具审批' }
  },
  startModes: ['ask', 'acceptEdits', 'plan', 'readOnly'],
  defaultStartMode: 'ask',
  discussionMode: 'readOnly',
  readOnlyMode: 'readOnly',
  capabilities: { unattended: true, bypass: true, autoMode: false, pathMentions: false, optionsWhileBusy: false, skills: true, userMcp: true, modelProviders: ['openai-chat', 'openai-responses', 'anthropic'], accounts: false },
  environment: {
    role: '通过 Antumi 专用 profile 运行；首次使用时准备随应用提供的运行时插件。',
    install,
    verifyNativeModels: true,
    signIn: '在 DSH 中配置模型服务商，或在 Antumi 的服务商设置中添加 API Key'
  },
  usageWhere: '在所用模型服务商处查看',
  translations: { en: {
    modes: {
      ask: { label: 'Default', description: 'Edit and run commands in project sandboxes; ask before widening permissions' },
      acceptEdits: { label: 'Automatic', description: 'Edit and run commands in projects; refuse operations outside them without prompting' },
      plan: { label: 'Plan', description: 'Explore read-only and submit a plan; execute after approval' },
      readOnly: { label: 'Read only', description: 'Read and search files; refuse edits and tools with side effects' },
      bypass: { label: 'Allow everything', description: 'Unrestricted file access without tool approval prompts' }
    },
    environment: {
      role: 'Runs in an Antumi profile; prepares the bundled runtime plugin on first use.',
      install,
      verifyNativeModels: true,
      signIn: 'Configure a model provider in DSH, or add an API key in Antumi provider settings'
    },
    usageWhere: 'Check with your model provider'
  } }
}
