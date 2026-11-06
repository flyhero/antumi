import { describe, expect, it } from 'vitest'
import { DSH_CONFIG_ENV, DSH_PROVIDER_KEY_ENV } from '@antumi/protocol'
import type { AgentLaunch } from '../agent-adapter'
import type { ProviderLaunch } from '../../provider-launch'
import { dshCommand, dshProvider, dshProviderModels, dshRuntimeConfig, DSH_PROVIDER_ENV } from './dsh-command'
import { dshCompatible, dshInstallation } from './dsh-cli'

const launch: AgentLaunch = { providerSessionId: null, resume: false, handoffPath: null, extraProjects: ['/extra'] }
const provider: ProviderLaunch = {
  headers: {},
  providerId: 'test', apiKey: 'secret-test-key',
  endpoint: { wire: 'openai-chat', baseUrl: 'https://provider.example/v1/', anthropic: null },
  defaultModel: 'model', smallModel: 'model',
  models: [{ id: 'model', label: 'Test model', contextWindow: 32000, maxOutput: 4096, efforts: ['high', 'turbo'] }]
}

describe('DSH launch configuration', () => {
  it('keeps the provider key out of argv and configuration, with stable opaque model ids', () => {
    const command = dshCommand({ ...launch, provider })
    expect(command.args).toEqual(['--profile', 'antumi'])
    expect(command.env?.[DSH_PROVIDER_KEY_ENV]).toBe(provider.apiKey)
    expect(command.env?.[DSH_CONFIG_ENV]).not.toContain(provider.apiKey)
    expect(command.env?.[DSH_PROVIDER_ENV]).not.toContain(provider.apiKey)
    expect(JSON.stringify(command.args)).not.toContain(provider.apiKey)
    expect(dshProviderModels(provider)).toEqual([{ id: '["antumi-test","model"]', label: 'Test model', description: null, efforts: ['high'], isDefault: true }])
    expect(dshProvider(provider)).toMatchObject({ 'antumi-test': { api: 'openai-completions', apiKeyEnv: DSH_PROVIDER_KEY_ENV, models: [{ reasoningEfforts: { high: 'high' } }] } })
  })

  it('selects the DSH adapter and endpoint for all three provider wires', () => {
    expect(dshProvider(provider)).toMatchObject({ 'antumi-test': { baseURL: 'https://provider.example/v1', api: 'openai-completions' } })
    expect(dshProvider({ ...provider, endpoint: { ...provider.endpoint, wire: 'openai-responses' } })).toMatchObject({ 'antumi-test': { api: 'openai-responses' } })
    const anthropic = dshProvider({ ...provider, endpoint: { wire: 'anthropic', baseUrl: 'https://provider.example/v1', anthropic: { baseUrl: 'https://provider.example/v1', auth: 'auth_token', env: {} } } })
    expect(anthropic).toMatchObject({ 'antumi-test': { api: 'anthropic-messages', baseURL: 'https://provider.example', headers: { authorization: 'Bearer ${ANTUMI_MODEL_PROVIDER_KEY}' } } })
    expect(JSON.stringify(anthropic)).not.toContain(provider.apiKey)
  })

  it('locks planning and read-only stages and gives the knowledge base only its configured access', () => {
    expect(dshRuntimeConfig({ ...launch, planOnly: { dirs: ['/project', '/extra'] }, allowBypass: true, preferred: { permissionMode: 'bypass' } })).toMatchObject({ mode: 'plan', lock: 'plan', allowBypass: false, noEdit: ['/project', '/extra'] })
    expect(dshRuntimeConfig({ ...launch, readOnly: { dirs: ['/project'] }, preferred: { permissionMode: 'acceptEdits' } })).toMatchObject({ mode: 'readOnly', lock: 'readOnly' })
    expect(dshRuntimeConfig({ ...launch, knowledgeBase: { path: '/vault', write: false } })).toMatchObject({ workDirs: ['/extra'], noEdit: ['/vault'] })
    expect(dshRuntimeConfig({ ...launch, knowledgeBase: { path: '/vault', write: true } })).toMatchObject({ workDirs: ['/extra', '/vault'], noEdit: [] })
  })

  it('requires the tested release and offers the matching installation on each host platform', () => {
    expect(dshCompatible('0.2.1-rc.2')).toBe(true)
    expect(dshCompatible('0.2.0')).toBe(false)
    expect(dshCompatible(null)).toBe(false)
    expect(dshInstallation('win32')).toMatchObject({ agent: 'dsh', shell: 'powershell', command: expect.stringContaining('@0.2.1-rc.2') })
    expect(dshInstallation('linux')?.shell).toBe('bash')
    expect(dshInstallation('freebsd')).toBeNull()
  })
})
