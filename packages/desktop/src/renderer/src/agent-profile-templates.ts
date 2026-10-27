import { AGENT_KINDS, agentDescriptor, quickModel, type AgentKind, type AgentProfileFields, type ChatCatalog } from '@antumi/protocol'
import { localized, t } from './i18n'

export type AgentProfileTemplate = {
  id: 'explorer' | 'reviewer' | 'debugger' | 'tester' | 'planner'
  name: string
  description: string
  instructions: string
  example: string
  capability: 'readOnly' | 'develop'
  model: 'quick' | 'balanced' | 'strong'
}

export const AGENT_PROFILE_TEMPLATES: readonly AgentProfileTemplate[] = localized(() => [
  { id: 'explorer', name: t('AgentTemplates.explorerName'), description: t('AgentTemplates.explorerDescription'), instructions: t('AgentTemplates.explorerInstructions'), example: t('AgentTemplates.explorerExample'), capability: 'readOnly', model: 'quick' },
  { id: 'reviewer', name: t('AgentTemplates.reviewerName'), description: t('AgentTemplates.reviewerDescription'), instructions: t('AgentTemplates.reviewerInstructions'), example: t('AgentTemplates.reviewerExample'), capability: 'readOnly', model: 'strong' },
  { id: 'debugger', name: t('AgentTemplates.debuggerName'), description: t('AgentTemplates.debuggerDescription'), instructions: t('AgentTemplates.debuggerInstructions'), example: t('AgentTemplates.debuggerExample'), capability: 'readOnly', model: 'strong' },
  { id: 'tester', name: t('AgentTemplates.testerName'), description: t('AgentTemplates.testerDescription'), instructions: t('AgentTemplates.testerInstructions'), example: t('AgentTemplates.testerExample'), capability: 'develop', model: 'balanced' },
  { id: 'planner', name: t('AgentTemplates.plannerName'), description: t('AgentTemplates.plannerDescription'), instructions: t('AgentTemplates.plannerInstructions'), example: t('AgentTemplates.plannerExample'), capability: 'readOnly', model: 'strong' }
])

// Templates stay presentation data until the user saves an independent copy.
export function agentProfileTemplateSeed(template: AgentProfileTemplate, installed: readonly AgentKind[]): AgentProfileFields {
  const agent = installed.find((kind) => template.capability !== 'readOnly' || agentDescriptor(kind).capabilities.readOnly !== false) ?? installed[0] ?? AGENT_KINDS[0]
  return {
    name: template.name,
    description: template.description,
    instructions: [template.instructions, t('AgentTemplates.contextInstructions'), ...(template.capability === 'readOnly' ? [t('AgentTemplates.readOnlyInstructions')] : []), t('AgentTemplates.outputInstructions')].join('\n\n'),
    agent, capability: template.capability, model: null, effort: null, modelProvider: null,
    skills: [], mcpServers: [], callableProfiles: []
  }
}

// Only choose real catalog entries. Effort is independent of the model's size or price.
export function agentProfileTemplateModel(template: AgentProfileTemplate, agent: AgentKind, catalog: ChatCatalog | null, smallModel?: string | null, onProvider = false): { model: string | null; effort: string | null } {
  const small = smallModel ? catalog?.models.find((item) => item.id === smallModel || item.id === `${smallModel}[1m]` || item.id.endsWith(`/${smallModel}`)) : undefined
  const quick = small?.id ?? (onProvider ? null : quickModel(agentDescriptor(agent).quickModels, catalog))
  const chosen = catalog?.models.find((item) => item.id === (template.model === 'quick' ? quick : null)) ?? catalog?.models.find((item) => item.isDefault) ?? catalog?.models[0]
  const effort = template.model === 'quick' ? 'low' : template.model === 'strong' ? 'high' : 'medium'
  return { model: chosen?.id ?? null, effort: chosen?.efforts.includes(effort) ? effort : null }
}
