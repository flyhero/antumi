import { afterEach, describe, expect, it } from 'vitest'
import { AgentProfileFields, type ChatCatalog } from '@antumi/protocol'
import { AGENT_PROFILE_TEMPLATES, agentProfileTemplateModel, agentProfileTemplateSeed } from './agent-profile-templates'
import { setLocale } from './i18n'

afterEach(() => setLocale('zh-CN'))

const catalog: ChatCatalog = { models: [
  { id: 'default', label: 'Default', description: null, isDefault: true, efforts: ['low', 'medium', 'high'] },
  { id: 'haiku', label: 'Small', description: null, isDefault: false, efforts: [] },
  { id: 'vendor/small', label: 'Provider small', description: null, isDefault: false, efforts: ['low'] }
] }

describe('agent role templates', () => {
  it.each(['zh-CN', 'en'] as const)('creates five valid independent drafts in %s without inheriting tools', (locale) => {
    setLocale(locale)
    expect(new Set(AGENT_PROFILE_TEMPLATES.map((item) => item.id)).size).toBe(5)
    for (const template of AGENT_PROFILE_TEMPLATES) {
      const first = AgentProfileFields.parse(agentProfileTemplateSeed(template, ['codex']))
      expect(first.agent).toBe('codex')
      expect(first.instructions.length).toBeGreaterThan(300)
      expect(first).toMatchObject({ skills: [], mcpServers: [], callableProfiles: [], modelProvider: null, model: null })
      first.name = 'Customized'
      first.callableProfiles.push('11111111-1111-4111-8111-111111111111')
      const second = AgentProfileFields.parse(agentProfileTemplateSeed(template, ['codex']))
      expect(second.name).toBe(template.name)
      expect(second.callableProfiles).toEqual([])
    }
    expect(AGENT_PROFILE_TEMPLATES.filter((item) => item.capability === 'develop').map((item) => item.id)).toEqual(['tester'])
  })

  it('prefers an installed tool that can run a read-only role', () => {
    const explorer = AGENT_PROFILE_TEMPLATES[0]!
    const tester = AGENT_PROFILE_TEMPLATES.find((item) => item.id === 'tester')!
    expect(agentProfileTemplateSeed(explorer, ['antigravity', 'codex']).agent).toBe('codex')
    expect(agentProfileTemplateSeed(tester, ['antigravity', 'codex']).agent).toBe('antigravity')
  })

  it('selects a real lightweight model independently of effort, respecting a valid preference', () => {
    const explorer = AGENT_PROFILE_TEMPLATES[0]!
    expect(agentProfileTemplateModel(explorer, 'claude', catalog)).toEqual({ model: 'haiku', effort: null })
    expect(agentProfileTemplateModel(explorer, 'claude', catalog, 'vendor/small')).toEqual({ model: 'vendor/small', effort: 'low' })
    expect(agentProfileTemplateModel(explorer, 'claude', catalog, 'unavailable')).toEqual({ model: 'haiku', effort: null })
  })

  it('uses a provider small model without accidentally borrowing native model preferences', () => {
    const explorer = AGENT_PROFILE_TEMPLATES[0]!
    expect(agentProfileTemplateModel(explorer, 'claude', catalog, 'small', true).model).toBe('vendor/small')
    expect(agentProfileTemplateModel(explorer, 'claude', catalog, 'unavailable', true).model).toBe('default')
    const providerCatalog: ChatCatalog = { models: [{ ...catalog.models[0]!, id: 'small[1m]' }] }
    expect(agentProfileTemplateModel(explorer, 'claude', providerCatalog, 'small', true).model).toBe('small[1m]')
  })

  it('keeps unsupported effort and missing catalogs unset instead of inventing model options', () => {
    const reviewer = AGENT_PROFILE_TEMPLATES.find((item) => item.id === 'reviewer')!
    const noEffort: ChatCatalog = { models: [{ ...catalog.models[0]!, efforts: [] }] }
    expect(agentProfileTemplateModel(reviewer, 'codex', catalog)).toEqual({ model: 'default', effort: 'high' })
    expect(agentProfileTemplateModel(reviewer, 'codex', noEffort)).toEqual({ model: 'default', effort: null })
    expect(agentProfileTemplateModel(reviewer, 'codex', null)).toEqual({ model: null, effort: null })
  })
})
