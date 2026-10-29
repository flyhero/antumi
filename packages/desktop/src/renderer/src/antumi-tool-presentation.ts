import { AGENT_CALL_TOOLS, MANAGEMENT_TOOLS, SQUAD_TOOL_NAMES, antumiToolName, type ChatItem } from '@antumi/protocol'
import { t, type MessageKey } from './i18n'

type ToolName = typeof MANAGEMENT_TOOLS[keyof typeof MANAGEMENT_TOOLS]
  | typeof AGENT_CALL_TOOLS[keyof typeof AGENT_CALL_TOOLS] | typeof SQUAD_TOOL_NAMES[keyof typeof SQUAD_TOOL_NAMES]
type Definition = { label: MessageKey; icon: 'agent' | 'list' | 'edit' | 'search'; subject: 'name' | 'title' | 'id' | 'query' | 'url' | 'delegation' | 'member' | 'schedule' | 'summary' | null }

const definitions = {
  [MANAGEMENT_TOOLS.profileList]: { label: 'antumiTools.profileList', icon: 'agent', subject: null },
  [MANAGEMENT_TOOLS.profileCreate]: { label: 'antumiTools.profileCreate', icon: 'agent', subject: 'name' },
  [MANAGEMENT_TOOLS.profileUpdate]: { label: 'antumiTools.profileUpdate', icon: 'agent', subject: 'name' },
  [MANAGEMENT_TOOLS.squadList]: { label: 'antumiTools.squadList', icon: 'agent', subject: null },
  [MANAGEMENT_TOOLS.squadCreate]: { label: 'antumiTools.squadCreate', icon: 'agent', subject: 'name' },
  [MANAGEMENT_TOOLS.squadUpdate]: { label: 'antumiTools.squadUpdate', icon: 'agent', subject: 'name' },
  [MANAGEMENT_TOOLS.scheduleList]: { label: 'antumiTools.scheduleList', icon: 'list', subject: null },
  [MANAGEMENT_TOOLS.scheduleCreate]: { label: 'antumiTools.scheduleCreate', icon: 'list', subject: 'schedule' },
  [MANAGEMENT_TOOLS.scheduleUpdate]: { label: 'antumiTools.scheduleUpdate', icon: 'edit', subject: 'schedule' },
  [MANAGEMENT_TOOLS.routineList]: { label: 'antumiTools.routineList', icon: 'list', subject: null },
  [MANAGEMENT_TOOLS.routineCreate]: { label: 'antumiTools.routineCreate', icon: 'list', subject: 'title' },
  [MANAGEMENT_TOOLS.routineUpdate]: { label: 'antumiTools.routineUpdate', icon: 'edit', subject: 'title' },
  [MANAGEMENT_TOOLS.skillList]: { label: 'antumiTools.skillList', icon: 'list', subject: null },
  [MANAGEMENT_TOOLS.skillSearch]: { label: 'antumiTools.skillSearch', icon: 'search', subject: 'query' },
  [MANAGEMENT_TOOLS.skillInstall]: { label: 'antumiTools.skillInstall', icon: 'edit', subject: 'url' },
  [MANAGEMENT_TOOLS.skillSetActivation]: { label: 'antumiTools.skillSetActivation', icon: 'edit', subject: 'id' },
  [MANAGEMENT_TOOLS.commandList]: { label: 'antumiTools.commandList', icon: 'list', subject: null },
  [MANAGEMENT_TOOLS.commandCreate]: { label: 'antumiTools.commandCreate', icon: 'edit', subject: 'name' },
  [MANAGEMENT_TOOLS.commandUpdate]: { label: 'antumiTools.commandUpdate', icon: 'edit', subject: 'name' },
  [AGENT_CALL_TOOLS.list]: { label: 'antumiTools.agentList', icon: 'agent', subject: null },
  [AGENT_CALL_TOOLS.dispatch]: { label: 'antumiTools.agentDispatch', icon: 'agent', subject: 'delegation' },
  [AGENT_CALL_TOOLS.status]: { label: 'antumiTools.agentStatus', icon: 'agent', subject: null },
  [AGENT_CALL_TOOLS.cancel]: { label: 'antumiTools.agentCancel', icon: 'agent', subject: 'delegation' },
  [SQUAD_TOOL_NAMES.roster]: { label: 'antumiTools.squadRoster', icon: 'agent', subject: null },
  [SQUAD_TOOL_NAMES.dispatch]: { label: 'antumiTools.squadDispatch', icon: 'agent', subject: 'member' },
  [SQUAD_TOOL_NAMES.finish]: { label: 'antumiTools.squadFinish', icon: 'agent', subject: 'summary' }
} as const satisfies Record<ToolName, Definition>

const tools = new Map(Object.entries(definitions))

// Exact ownership keeps a third-party tool with the same name on its normal MCP path.
export function antumiToolPresentation(name: string) {
  return tools.get(antumiToolName(name) ?? '') ?? null
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parsed(text: string | null): unknown {
  try { return JSON.parse(text ?? 'null') } catch { return null }
}

function text(value: unknown, field: string): string {
  const result = record(value) ? value[field] : null
  return typeof result === 'string' ? result.trim().split(/\r?\n/)[0] ?? '' : ''
}

function field(value: unknown, key: string): unknown {
  return record(value) ? value[key] : null
}

// Drivers usually unwrap MCP content; tolerate the envelope when replaying older transcripts.
function resultOf(output: string | null): unknown {
  const result = parsed(output)
  if (!record(result) || !Array.isArray(result.content)) return result
  if (result.isError === true) return null
  const blocks = result.content.filter(record)
  return parsed(blocks.filter((block) => block.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('\n'))
}

export function antumiToolTitle(tool: Pick<Extract<ChatItem, { kind: 'tool' }>, 'name' | 'title' | 'input' | 'output' | 'status'>): string | null {
  const definition = antumiToolPresentation(tool.name)
  if (!definition) return null
  const input = parsed(tool.input)
  const result = tool.status === 'done' ? resultOf(tool.output) : null
  if (definition.subject === null) return Array.isArray(result) ? t('antumiTools.resultCount', { count: result.length }) : ''
  let subject = ''
  switch (definition.subject) {
    case 'delegation':
      subject = text(input, 'ref') || text(field(result, 'profile'), 'name') || text(input, 'profileId') || text(input, 'callId')
      break
    case 'member':
      subject = text(input, 'memberId')
      break
    case 'schedule': {
      const target = field(input, 'target') ?? field(result, 'target')
      subject = text(input, 'text') || text(target, 'text') || text(target, 'taskId') || text(target, 'conversationId')
      break
    }
    default:
      subject = text(input, definition.subject) || text(result, definition.subject)
  }
  if (!subject) subject = text(input, 'id') || text(result, 'id')
  if (subject && (antumiToolName(tool.name) === MANAGEMENT_TOOLS.commandCreate || antumiToolName(tool.name) === MANAGEMENT_TOOLS.commandUpdate)
    && (text(input, 'name') || text(result, 'name'))) return `/${subject.replace(/^\//, '')}`
  // A cut-off argument still has the driver's original title; raw parameters stay in the disclosure.
  return subject || tool.title
}
