import type { AgentKind } from './agent'
import type { AnthropicEndpoint, ModelProviderPresetId, OpenAiEndpoint, ProviderModel } from './model-provider'

// Coding plans, and pay-as-you-go APIs people run coding agents on, that Antumi knows the endpoints
// of, as each vendor's own docs give them for Claude Code, Codex and OpenCode. A saved preset provider takes its endpoints from here at each start, so a fix
// in a release reaches every provider made from it. verified: run with a real key through Antumi,
// with which CLI versions and when; none is yet, so each shows as unverified.

const CHECKED = '2026-10-21'

export type ModelProviderPresetEntry = {
  name: string
  translations: { en: { name: string } }
  anthropic: AnthropicEndpoint | null
  openai: OpenAiEndpoint | null
  models: readonly ProviderModel[]
  defaultModel: string
  smallModel: string
  agents: readonly AgentKind[]
  // Where the key is made, and where usage is read: Antumi doesn't read a plan's quota.
  keyUrl: string
  consoleUrl: string
  docsUrl: string
  checked: string
  verified: { agents: readonly AgentKind[]; versions: string; on: string } | null
  notes: readonly { zh: string; en: string }[]
}

const model = (id: string, contextWindow: number | null = null, more: Partial<ProviderModel> = {}): ProviderModel =>
  ({ id, label: null, contextWindow, maxOutput: null, efforts: [], ...more })

// Volcengine's plans share the same model names; ark-code-latest is whichever one the console picks.
// kimi-k2.7-code takes no reasoning summaries on the Responses endpoint (its Codex page says so).
const ARK_MODELS: readonly ProviderModel[] = [
  model('ark-code-latest'),
  ...['doubao-seed-2.1-pro', 'doubao-seed-evolving', 'doubao-seed-2.1-lite', 'doubao-seed-2.0-mini', 'glm-5.3', 'glm-5.3-flash',
    'deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-v4.1-flash', 'minimax-m3', 'kimi-k3', 'kimi-k2.8-preview'].map((id) => model(id, null, { reasoningSummaries: true })),
  model('kimi-k2.7-code', null, { reasoningSummaries: false })
]
const ARK_NOTES = [
  { zh: '只用套餐专属地址：填成 /api/v3 不走套餐，会另外按量计费。', en: 'Use the plan\'s own address only: /api/v3 bypasses the plan and is billed separately.' },
  { zh: 'ark-code-latest 实际用哪个模型，在方舟控制台里选。', en: 'Which model ark-code-latest runs is picked in the Ark console.' }
]

const GLM_MODELS: readonly ProviderModel[] = [
  model('glm-5.3', 1_000_000, { reasoningSummaries: true }),
  model('glm-5.3-flash', 1_000_000, { reasoningSummaries: true })
]
const GLM_NOTES = [
  { zh: 'Coding Plan 的 Key 只能用在编程套餐地址上；填成按量计费的地址会提示余额不足。', en: 'A Coding Plan key works only at the plan\'s addresses; the pay-as-you-go ones report no balance.' }
]

const MINIMAX_MODELS: readonly ProviderModel[] = [model('MiniMax-M2.7')]

// Alibaba Cloud Model Studio's Token Plan: personal and team plans share these addresses, each with
// its own key. auto lets the plan pick the model. Only its Beijing region serves the plan.
const TOKEN_PLAN = 'https://token-plan.cn-beijing.maas.aliyuncs.com'
const TOKEN_PLAN_MODELS: readonly ProviderModel[] = ['auto', 'qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-flash',
  'deepseek-v4.1-flash', 'deepseek-v4-pro', 'glm-5.3', 'glm-5.2'].map((id) => model(id))
const TOKEN_PLAN_NOTES = [
  { zh: '个人版和团队版用同一个地址；团队版的 Key 在百炼控制台的团队成员页生成。', en: 'Personal and team plans share this address; a team plan\'s key is made on the team members page of the Model Studio console.' },
  { zh: '只用 token-plan 开头的地址：按量付费的地址不扣套餐额度，会另外计费。', en: 'Use the token-plan address only: the pay-as-you-go one is billed apart from the plan.' }
]

// DeepSeek's own platform, billed per token from the account's balance. Both models take 1M; its
// Claude Code page sets compaction at 768K.
const DEEPSEEK_MODELS: readonly ProviderModel[] = [model('deepseek-flash', 1_000_000), model('deepseek-v4-pro', 1_000_000)]
const DEEPSEEK_NOTES = [
  { zh: '按量计费，不是包月套餐：每次请求从账户余额扣费，余额和用量在控制台看。', en: 'Pay as you go, not a plan: each request is billed to the account balance, shown in the console.' },
  { zh: 'deepseek-v4-pro 不处理图片；联网搜索另按搜索接口计费。', en: 'deepseek-v4-pro takes no images; web search is billed separately as search requests.' }
]

export const MODEL_PROVIDER_PRESETS: Record<ModelProviderPresetId, ModelProviderPresetEntry> = {
  'volcengine-agent-plan': {
    name: '火山方舟 Agent Plan',
    translations: { en: { name: 'Volcengine Ark Agent Plan' } },
    anthropic: { baseUrl: 'https://ark.cn-beijing.volces.com/api/plan', auth: 'auth_token', env: {} },
    openai: { chatUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3', responsesUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3' },
    models: ARK_MODELS,
    defaultModel: 'ark-code-latest',
    smallModel: 'ark-code-latest',
    agents: ['claude', 'codex', 'opencode', 'pi', 'zcode'],
    keyUrl: 'https://ark.volcengine.com/region:cn-beijing/apikey',
    consoleUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement',
    docsUrl: 'https://docs.volcengine.com/docs/ark/agent-plan-personal-claude-code?lang=zh',
    checked: CHECKED,
    verified: null,
    notes: [{ zh: '要用 Agent Plan 专属的 API Key，方舟的其他 Key 用不了。', en: 'Needs the Agent Plan\'s own API key; other Ark keys don\'t work.' }, ...ARK_NOTES]
  },
  'volcengine-coding-plan': {
    name: '火山方舟 Coding Plan',
    translations: { en: { name: 'Volcengine Ark Coding Plan' } },
    anthropic: { baseUrl: 'https://ark.cn-beijing.volces.com/api/coding', auth: 'auth_token', env: {} },
    openai: { chatUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3', responsesUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3' },
    models: ARK_MODELS,
    defaultModel: 'ark-code-latest',
    smallModel: 'ark-code-latest',
    agents: ['claude', 'codex', 'opencode', 'pi', 'zcode'],
    keyUrl: 'https://ark.volcengine.com/region:cn-beijing/apikey',
    consoleUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/openManagement',
    docsUrl: 'https://www.volcengine.com/docs/82379/1928261',
    checked: CHECKED,
    verified: null,
    notes: ARK_NOTES
  },
  'zhipu-glm-coding': {
    name: '智谱 GLM Coding Plan',
    translations: { en: { name: 'Zhipu GLM Coding Plan' } },
    anthropic: { baseUrl: 'https://open.bigmodel.cn/api/anthropic', auth: 'auth_token', env: { API_TIMEOUT_MS: '3000000' } },
    openai: { chatUrl: 'https://open.bigmodel.cn/api/coding/paas/v4', responsesUrl: 'https://open.bigmodel.cn/api/v1' },
    models: GLM_MODELS,
    defaultModel: 'glm-5.3',
    smallModel: 'glm-5.3-flash',
    agents: ['claude', 'codex', 'opencode', 'pi', 'zcode'],
    keyUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    consoleUrl: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
    docsUrl: 'https://docs.bigmodel.cn/cn/coding-plan/tool/claude',
    checked: CHECKED,
    verified: null,
    notes: GLM_NOTES
  },
  'zai-glm-coding': {
    name: 'Z.ai GLM Coding Plan',
    translations: { en: { name: 'Z.ai GLM Coding Plan' } },
    anthropic: { baseUrl: 'https://api.z.ai/api/anthropic', auth: 'auth_token', env: { API_TIMEOUT_MS: '3000000' } },
    openai: { chatUrl: 'https://api.z.ai/api/coding/paas/v4', responsesUrl: 'https://api.z.ai/api/v1' },
    models: GLM_MODELS,
    defaultModel: 'glm-5.3',
    smallModel: 'glm-5.3-flash',
    agents: ['claude', 'codex', 'opencode', 'pi', 'zcode'],
    keyUrl: 'https://z.ai/manage-apikey/apikey-list',
    consoleUrl: 'https://z.ai/manage-apikey/apikey-list',
    docsUrl: 'https://docs.z.ai/devpack/tool/claude',
    checked: CHECKED,
    verified: null,
    notes: GLM_NOTES
  },
  'kimi-code': {
    name: 'Kimi Code',
    translations: { en: { name: 'Kimi Code' } },
    // Its coding endpoint takes the key as x-api-key, and fails tool search.
    anthropic: { baseUrl: 'https://api.kimi.com/coding/', auth: 'api_key', env: { ENABLE_TOOL_SEARCH: 'false' } },
    openai: null,
    models: [model('kimi-for-coding')],
    defaultModel: 'kimi-for-coding',
    smallModel: 'kimi-for-coding',
    agents: ['claude', 'opencode', 'pi', 'zcode'],
    keyUrl: 'https://www.kimi.com/code/console',
    consoleUrl: 'https://www.kimi.com/code/console',
    docsUrl: 'https://www.kimi.com/code/docs/more/third-party-agents.html',
    checked: CHECKED,
    verified: null,
    notes: []
  },
  'minimax-cn': {
    name: 'MiniMax（国内）',
    translations: { en: { name: 'MiniMax (China)' } },
    anthropic: { baseUrl: 'https://api.minimaxi.com/anthropic', auth: 'auth_token', env: { API_TIMEOUT_MS: '3000000' } },
    openai: null,
    models: MINIMAX_MODELS,
    defaultModel: 'MiniMax-M2.7',
    smallModel: 'MiniMax-M2.7',
    agents: ['claude', 'opencode', 'pi', 'zcode'],
    keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    consoleUrl: 'https://platform.minimaxi.com/user-center/payment/token-plan',
    docsUrl: 'https://platform.minimaxi.com/docs/token-plan/claude-code',
    checked: CHECKED,
    verified: null,
    notes: []
  },
  minimax: {
    name: 'MiniMax（海外）',
    translations: { en: { name: 'MiniMax (Global)' } },
    anthropic: { baseUrl: 'https://api.minimax.io/anthropic', auth: 'auth_token', env: { API_TIMEOUT_MS: '3000000' } },
    openai: null,
    models: MINIMAX_MODELS,
    defaultModel: 'MiniMax-M2.7',
    smallModel: 'MiniMax-M2.7',
    agents: ['claude', 'opencode', 'pi', 'zcode'],
    keyUrl: 'https://platform.minimax.io/user-center/basic-information/interface-key',
    consoleUrl: 'https://platform.minimax.io/user-center/payment/token-plan',
    docsUrl: 'https://platform.minimax.io/docs/token-plan/opencode',
    checked: CHECKED,
    verified: null,
    notes: []
  },
  'bailian-token-plan': {
    name: '阿里云百炼 Token Plan',
    translations: { en: { name: 'Alibaba Cloud Model Studio Token Plan' } },
    anthropic: { baseUrl: `${TOKEN_PLAN}/apps/anthropic`, auth: 'auth_token', env: {} },
    openai: { chatUrl: `${TOKEN_PLAN}/compatible-mode/v1`, responsesUrl: `${TOKEN_PLAN}/compatible-mode/v1` },
    models: TOKEN_PLAN_MODELS,
    defaultModel: 'qwen3.8-max',
    smallModel: 'qwen3.6-flash',
    agents: ['claude', 'codex', 'opencode', 'pi', 'zcode'],
    keyUrl: 'https://bailian.console.aliyun.com/cn-beijing/subscription/token-plan/personal',
    consoleUrl: 'https://bailian.console.aliyun.com/cn-beijing/subscription/overview',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/token-plan-personal-overview',
    checked: '2026-10-22',
    verified: null,
    notes: TOKEN_PLAN_NOTES
  },
  deepseek: {
    name: 'DeepSeek（按量计费）',
    translations: { en: { name: 'DeepSeek (pay as you go)' } },
    anthropic: { baseUrl: 'https://api.deepseek.com/anthropic', auth: 'auth_token', env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: '786432' } },
    openai: { chatUrl: 'https://api.deepseek.com', responsesUrl: 'https://api.deepseek.com' },
    models: DEEPSEEK_MODELS,
    defaultModel: 'deepseek-flash',
    smallModel: 'deepseek-flash',
    agents: ['claude', 'codex', 'opencode', 'pi', 'zcode'],
    keyUrl: 'https://platform.deepseek.com/api_keys',
    consoleUrl: 'https://platform.deepseek.com/usage',
    docsUrl: 'https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code',
    checked: '2026-11-03',
    verified: null,
    notes: DEEPSEEK_NOTES
  }
}
