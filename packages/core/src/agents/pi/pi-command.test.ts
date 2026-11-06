import { describe, expect, it } from 'vitest'
import type { AgentLaunch } from '../agent-adapter'
import type { ProviderLaunch } from '../../provider-launch'
import { piCommand, piStartMode } from './pi-command'
import { PI_CONFIG_ENV } from './pi-extension'

const LAUNCH: AgentLaunch = { providerSessionId: null, resume: false, handoffPath: null, extraProjects: [] }
const config = (launch: AgentLaunch) => JSON.parse(piCommand(launch).env?.[PI_CONFIG_ENV] ?? '{}')

const PROVIDER: ProviderLaunch = {
  headers: {},
  providerId: 'glm', apiKey: 'sk-secret',
  endpoint: { wire: 'openai-chat', baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4/', anthropic: null },
  models: [{ id: 'glm-5', label: 'GLM 5', contextWindow: 200_000, maxOutput: null, efforts: ['low', 'high', 'turbo'] }],
  defaultModel: 'glm-5', smallModel: 'glm-5'
}

describe('Pi command', () => {
  it('hands a model provider to the extension, its key only in the environment', () => {
    const command = piCommand({ ...LAUNCH, provider: PROVIDER })
    expect(config({ ...LAUNCH, provider: PROVIDER }).provider).toEqual({
      name: 'antumi-glm', baseUrl: 'https://open.bigmodel.cn/api/coding/paas/v4', api: 'openai-completions', bearer: false, headers: {},
      models: [{ id: 'glm-5', name: 'GLM 5', reasoning: true, input: ['text'], contextWindow: 200_000, maxTokens: 16_384, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: null, high: 'high', xhigh: null, max: null } }]
    })
    expect(command.env).toMatchObject({ ANTUMI_MODEL_PROVIDER_KEY: 'sk-secret', ANTUMI_MODEL_PROVIDER: 'glm' })
    expect([...command.args, command.env?.[PI_CONFIG_ENV] ?? ''].some((value) => value.includes('sk-secret'))).toBe(false)
  })

  it('tells Pi which models read images', () => {
    const seeing = { ...PROVIDER, models: PROVIDER.models.map((model) => ({ ...model, images: true })) }
    expect(config({ ...LAUNCH, provider: seeing }).provider.models[0].input).toEqual(['text', 'image'])
  })

  it('reaches a provider over the API its wire names, Anthropic without its /v1 and with a bearer token where it takes one', () => {
    const anthropic = { wire: 'anthropic' as const, baseUrl: 'https://open.bigmodel.cn/api/anthropic/v1', anthropic: { baseUrl: 'https://open.bigmodel.cn/api/anthropic/v1', auth: 'auth_token' as const, env: {} } }
    expect(config({ ...LAUNCH, provider: { ...PROVIDER, endpoint: anthropic } }).provider).toMatchObject({ baseUrl: 'https://open.bigmodel.cn/api/anthropic', api: 'anthropic-messages', bearer: true })
    expect(config({ ...LAUNCH, provider: { ...PROVIDER, endpoint: { ...anthropic, anthropic: { ...anthropic.anthropic, auth: 'api_key' } } } }).provider).toMatchObject({ bearer: false })
    expect(config({ ...LAUNCH, provider: { ...PROVIDER, endpoint: { wire: 'openai-responses', baseUrl: 'https://api.example/v1', anthropic: null } } }).provider).toMatchObject({ api: 'openai-responses' })
  })

  it('runs Pi in RPC mode, resuming its session file or forking it whole', () => {
    expect(piCommand(LAUNCH).args).toEqual(['--mode', 'rpc'])
    expect(piCommand({ ...LAUNCH, providerSessionId: '/s/a.jsonl', resume: true }).args).toEqual(['--mode', 'rpc', '--session', '/s/a.jsonl'])
    expect(piCommand({ ...LAUNCH, providerSessionId: '/s/a.jsonl', resume: true, forkAt: 'whole-session' }).args).toEqual(['--mode', 'rpc', '--fork', '/s/a.jsonl'])
    expect(piCommand({ ...LAUNCH, providerSessionId: '/s/a.jsonl' }).args).toEqual(['--mode', 'rpc'])
  })

  it('gives it the skills bundle and tells it of the other projects and the read-only folders', () => {
    expect(config({ ...LAUNCH, extraProjects: ['/work/other'], knowledgeBase: { path: '/vault', write: true } }).workDirs).toEqual(['/work/other', '/vault'])
    const args = piCommand({ ...LAUNCH, extraProjects: ['/work/other'], readOnly: { dirs: ['/work/repo'] }, skills: { dir: '/antumi/skills/b' } }).args
    expect(args).toContain('/antumi/skills/b/.agents/skills')
    const note = args[args.indexOf('--append-system-prompt') + 1]
    expect(note).toContain('- /work/other')
    expect(note).toMatch(/只读[\s\S]*- \/work\/repo/)
  })

  it('hands the extension its servers, fences and mode, with no secret in sight', () => {
    const launch: AgentLaunch = {
      ...LAUNCH,
      mcp: { command: 'node', args: ['mcp.mjs', '--ready-file', '/r.json'] },
      userMcp: [{ name: 'github', type: 'stdio', command: 'antumi', args: ['mcp', '--run', 'github'] }, { name: 'docs', type: 'http', url: 'https://docs.example/mcp' }],
      planOnly: { dirs: ['/work/repo'] },
      knowledgeBase: { path: '/vault', write: false }
    }
    expect(config(launch)).toMatchObject({
      mode: 'plan',
      servers: { antumi: { command: 'node', args: ['mcp.mjs', '--ready-file', '/r.json'] }, github: { command: 'antumi', args: ['mcp', '--run', 'github'] }, docs: { url: 'https://docs.example/mcp' } },
      noEdit: ['/work/repo', '/vault']
    })
    expect(config(launch).readTools).toContain('mcp__antumi__show_preview')
    expect(config(launch).readTools).not.toContain('mcp__antumi__terminal_run')
  })

  it('starts in the mode remembered, bypass only where allowed, a fenced stage in its own', () => {
    expect(piStartMode({ preferred: { permissionMode: 'readOnly' } })).toBe('readOnly')
    expect(piStartMode({ preferred: { permissionMode: 'bypass' } })).toBe('ask')
    expect(piStartMode({ preferred: { permissionMode: 'bypass' }, allowBypass: true })).toBe('bypass')
    expect(piStartMode({ preferred: { permissionMode: 'acceptEdits' } })).toBe('acceptEdits')
    expect(piStartMode({ preferred: { permissionMode: 'auto' } })).toBe('ask')
    expect(piStartMode({ preferred: { permissionMode: 'ask' }, planOnly: true })).toBe('plan')
  })
})
