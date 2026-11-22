import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { parseSkillFrontmatter } from '../../skill-manifest'

// CodeArts' CLI ships OpenCode 1's ACP server but refuses to start it (`codearts acp` is on its
// list of commands the CLI does not support). Its local server (`codearts serve`, documented) is
// the one its TUI uses: this bridge speaks ACP to Antumi on one side and that server's HTTP API and
// event stream on the other, as the ACP server it ships would have, so Antumi's ACP driver runs it.
// No process or socket here: codearts-bridge-main.ts gives it the server and the stdio.

// A request to the server, for the folder a session works in; throws CodeartsApiError.
export type CodeartsApi = (method: 'GET' | 'POST', path: string, directory: string, body?: unknown) => Promise<unknown>

export class CodeartsApiError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

class AcpError extends Error {
  constructor(readonly code: number, message: string) { super(message) }
}

const Frame = z.looseObject({ id: z.union([z.string(), z.number()]).optional(), method: z.string().optional(), params: z.unknown().optional(), result: z.unknown().optional(), error: z.unknown().optional() })
const Pairs = z.array(z.looseObject({ name: z.string(), value: z.string() })).catch([])
const RemoteMcp = z.looseObject({ type: z.enum(['http', 'sse']), name: z.string(), url: z.string(), headers: Pairs })
const LocalMcp = z.looseObject({ name: z.string(), command: z.string(), args: z.array(z.string()).catch([]), env: Pairs })
const Opening = z.looseObject({ cwd: z.string(), mcpServers: z.array(z.unknown()).catch([]), sessionId: z.string().optional() })
const SessionRef = z.looseObject({ sessionId: z.string() })
const ConfigChange = z.looseObject({ sessionId: z.string(), configId: z.string(), value: z.unknown() })
const PromptBlock = z.looseObject({ type: z.string(), text: z.string().optional(), data: z.string().optional(), mimeType: z.string().optional(), uri: z.string().optional() })
const Prompt = z.looseObject({ sessionId: z.string(), prompt: z.array(PromptBlock) })
const Outcome = z.looseObject({ outcome: z.looseObject({ outcome: z.string(), optionId: z.string().optional() }) })

const Info = z.looseObject({ id: z.string(), parentID: z.string().optional() })
const Model = z.looseObject({
  id: z.string(),
  name: z.string().catch(''),
  // The display name its `models --verbose` prints; `name` is often empty.
  model_name: z.string().optional(),
  limit: z.looseObject({ context: z.number() }).optional(),
  // Its billing rate, as CodeArts' own UI shows it (`0.12x`).
  options: z.looseObject({ creditRatioDisplay: z.string().optional() }).optional(),
  // The reasoning levels it takes, by name; the service fills each with its reasoningEffort.
  variants: z.record(z.string(), z.unknown()).optional()
})
const Providers = z.looseObject({ providers: z.array(z.looseObject({ id: z.string(), name: z.string().catch(''), models: z.record(z.string(), Model).catch({}) })).catch([]), default: z.record(z.string(), z.string()).catch({}) })
const Command = z.looseObject({ name: z.string(), description: z.string().catch(''), template: z.string().optional() })
const Commands = z.array(Command).catch([])
const Agents = z.array(z.looseObject({ name: z.string(), description: z.string().optional(), mode: z.string().optional(), hidden: z.boolean().optional() }))
const Config = z.looseObject({ model: z.string().optional(), default_agent: z.string().optional() })
const ToolState = z.looseObject({ status: z.string(), input: z.record(z.string(), z.unknown()).catch({}), output: z.unknown().optional(), title: z.string().optional(), error: z.string().optional(), metadata: z.record(z.string(), z.unknown()).catch({}) })
const Part = z.looseObject({ id: z.string(), sessionID: z.string(), messageID: z.string(), type: z.string(), text: z.string().optional(), synthetic: z.boolean().optional(), ignored: z.boolean().optional(), callID: z.string().optional(), tool: z.string().optional(), state: ToolState.optional() })
const Tokens = z.looseObject({ input: z.number().catch(0), output: z.number().catch(0), reasoning: z.number().catch(0), cache: z.looseObject({ read: z.number().catch(0), write: z.number().catch(0) }).catch({ read: 0, write: 0 }) })
const MessageInfo = z.looseObject({ id: z.string(), role: z.string(), sessionID: z.string(), agent: z.string().optional(), model: z.looseObject({ providerID: z.string(), modelID: z.string() }).optional(), providerID: z.string().optional(), modelID: z.string().optional(), cost: z.number().catch(0), tokens: Tokens.optional(), error: z.looseObject({ name: z.string().optional(), data: z.looseObject({ message: z.string().optional() }).optional() }).optional() })
const Message = z.looseObject({ info: MessageInfo, parts: z.array(Part).catch([]) })
const Permission = z.looseObject({ id: z.string(), sessionID: z.string(), permission: z.string(), patterns: z.array(z.string()).catch([]), metadata: z.record(z.string(), z.unknown()).catch({}), tool: z.looseObject({ callID: z.string() }).optional() })
const Todos = z.array(z.looseObject({ content: z.string(), status: z.string() }))
const GlobalEvent = z.looseObject({ payload: z.looseObject({ type: z.string(), properties: z.unknown() }) })

// Its tools that only lead to another: an MCP tool is called through tool_call, which CodeArts also
// records as a call of the tool itself.
const WRAPPERS: ReadonlySet<string> = new Set(['tool_call'])
// Its permissions for a command: running one, and one its blacklist or sandbox flags as risky.
const COMMANDS: ReadonlySet<string> = new Set(['bash', 'blacklisted_bash', 'sandbox_risk_command'])
const Risk = z.looseObject({ command: z.string().optional(), warning: z.string().optional(), blacklisted: z.looseObject({ command: z.string().optional(), message: z.string().optional() }).optional() })
const OPTIONS = [{ optionId: 'once', kind: 'allow_once', name: 'Allow once' }, { optionId: 'always', kind: 'allow_always', name: 'Always allow' }, { optionId: 'reject', kind: 'reject_once', name: 'Reject' }]

function kindOf(tool: string): string {
  switch (tool.toLowerCase()) {
    case 'bash': return 'execute'
    case 'webfetch': return 'fetch'
    case 'edit': case 'patch': case 'apply_patch': case 'write': case 'deletefile': return 'edit'
    case 'grep': case 'glob': return 'search'
    case 'list': case 'read': return 'read'
    default: return 'other'
  }
}

function locationsOf(tool: string, input: Record<string, unknown>): { path: string }[] {
  const file = typeof input.filePath === 'string' ? input.filePath : typeof input.path === 'string' && tool !== 'bash' ? input.path : null
  return file ? [{ path: file }] : []
}

const text = (value: unknown) => typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value)

type SessionState = { id: string; cwd: string; model: string | null; variant: string | null; mode: string | null; cancelled: boolean; error: string | null; busy: boolean; idle: (() => void) | null }
type Skill = { name: string; display: string; description: string; path: string }



export class CodeartsBridge {
  private readonly sessions = new Map<string, SessionState>()
  // A subagent's session, by the session it runs for: its calls show in that one.
  private readonly roots = new Map<string, string>()
  private readonly parts = new Map<string, { type: string; role: string | null; hidden: boolean }>()
  private readonly roles = new Map<string, string>()
  private readonly announced = new Set<string>()
  private readonly asked = new Map<string, (result: unknown) => void>()
  private readonly queues = new Map<string, Promise<void>>()
  // Each model's context window, as its provider list says.
  private readonly contexts = new Map<string, number>()
  // Each model's reasoning levels, by name.
  private readonly variants = new Map<string, string[]>()
  private commands: z.infer<typeof Command>[] = []
  private skills: Skill[] = []
  private offeredRead = false
  private serial = 0

  constructor(private readonly api: CodeartsApi, private readonly send: (frame: unknown) => void, private readonly ready: Promise<void>, private readonly version = '0', private readonly skillDirs: readonly string[] = []) {}

  // A frame from Antumi.
  async receive(raw: unknown): Promise<void> {
    const frame = Frame.safeParse(raw).data
    if (!frame) return
    if (frame.method === undefined) {
      if (frame.id !== undefined) this.asked.get(String(frame.id))?.(frame.result ?? null)
      return
    }
    if (frame.id === undefined) {
      if (frame.method === 'session/cancel') await this.cancel(SessionRef.parse(frame.params).sessionId).catch(() => {})
      return
    }
    const id = frame.id
    try {
      this.send({ jsonrpc: '2.0', id, result: await this.handle(frame.method, frame.params) })
    } catch (error) {
      const code = error instanceof AcpError ? error.code : error instanceof CodeartsApiError && error.status === 404 ? -32002 : -32603
      this.send({ jsonrpc: '2.0', id, error: { code, message: error instanceof Error ? error.message : String(error) } })
    }
  }

  private async handle(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case 'initialize':
        await this.ready
        return {
          protocolVersion: 1,
          agentCapabilities: { loadSession: true, mcpCapabilities: { http: true, sse: false }, promptCapabilities: { image: true, embeddedContext: true }, sessionCapabilities: { fork: {} } },
          authMethods: [],
          agentInfo: { name: 'antumi-codearts-bridge', version: this.version }
        }
      case 'session/new': return this.open(Opening.parse(params), 'new')
      case 'session/load': return this.open(Opening.parse(params), 'load')
      case 'session/fork': return this.open(Opening.parse(params), 'fork')
      case 'session/set_config_option': {
        const change = ConfigChange.parse(params)
        const session = this.session(change.sessionId)
        if (typeof change.value !== 'string') throw new AcpError(-32602, `${change.configId} must be a string`)
        if (change.configId === 'model') {
          session.model = change.value
          session.variant = null
        } else if (change.configId === 'mode') session.mode = await this.agent(session.cwd, change.value)
        else if (change.configId === 'variant') {
          if (!(this.variants.get(session.model ?? '') ?? []).includes(change.value)) throw new AcpError(-32602, `Unknown reasoning level: ${change.value}`)
          session.variant = change.value
        } else throw new AcpError(-32602, `Unknown config option: ${change.configId}`)
        return { configOptions: await this.configOptions(session) }
      }
      case 'session/set_mode': {
        const change = z.looseObject({ sessionId: z.string(), modeId: z.string() }).parse(params)
        const session = this.session(change.sessionId)
        session.mode = await this.agent(session.cwd, change.modeId)
        return {}
      }
      case 'session/prompt': return this.prompt(Prompt.parse(params))
      default: throw new AcpError(-32601, `Method not found: ${method}`)
    }
  }

  private session(id: string): SessionState {
    const session = this.sessions.get(id)
    if (!session) throw new AcpError(-32602, `Session not found: ${id}`)
    return session
  }

  private async agent(cwd: string, name: string): Promise<string> {
    if (!(await this.agents(cwd)).some((agent) => agent.name === name)) throw new AcpError(-32602, `Mode not found: ${name}`)
    return name
  }

  private async agents(cwd: string) {
    return Agents.parse(await this.api('GET', '/agent', cwd)).filter((agent) => agent.mode !== 'subagent' && !agent.hidden)
  }

  private async open(params: z.infer<typeof Opening>, how: 'new' | 'load' | 'fork') {
    await this.ready
    const { cwd } = params
    let id: string
    if (how === 'new') id = Info.parse(await this.api('POST', '/session', cwd, {})).id
    else if (!params.sessionId) throw new AcpError(-32602, 'sessionId is required')
    else if (how === 'fork') id = Info.parse(await this.api('POST', `/session/${params.sessionId}/fork`, cwd, {})).id
    else id = Info.parse(await this.api('GET', `/session/${params.sessionId}`, cwd)).id
    const session: SessionState = { id, cwd, model: null, variant: null, mode: null, cancelled: false, error: null, busy: false, idle: null }
    this.sessions.set(id, session)
    // Added to this server alone, never to its config: each process has its own.
    for (const entry of params.mcpServers) {
      const remote = RemoteMcp.safeParse(entry).data
      const local = LocalMcp.safeParse(entry).data
      if (remote) await this.api('POST', '/mcp', cwd, { name: remote.name, config: { type: 'remote', url: remote.url, headers: Object.fromEntries(remote.headers.map((header) => [header.name, header.value])) } })
      else if (local) await this.api('POST', '/mcp', cwd, { name: local.name, config: { type: 'local', command: [local.command, ...local.args], environment: Object.fromEntries(local.env.map((pair) => [pair.name, pair.value])) } })
    }
    if (how !== 'new') {
      const messages = z.array(Message).parse(await this.api('GET', `/session/${id}/message`, cwd))
      const last = messages.findLast((message) => message.info.role === 'user')?.info
      if (last?.model) session.model = `${last.model.providerID}/${last.model.modelID}`
      if (last?.agent && (await this.agents(cwd)).some((agent) => agent.name === last.agent)) session.mode = last.agent
      for (const message of messages) this.replay(id, message)
    }
    await this.readOffered(cwd)
    const opened = { ...(how === 'load' ? {} : { sessionId: id }), configOptions: await this.configOptions(session) }
    this.announce(session)
    return opened
  }

  // The commands it offers and the skills it loads, as ACP names them: once per bridge, then told
  // to each session as it opens.
  private async readOffered(cwd: string): Promise<void> {
    if (this.offeredRead) return
    this.offeredRead = true
    this.commands = Commands.parse(await this.api('GET', '/command', cwd).catch(() => []))
    const seen = new Set<string>()
    for (const dir of this.skillDirs) {
      for (const folder of await readdir(dir).catch(() => [])) {
        if (folder.startsWith('.')) continue
        const at = path.join(dir, folder)
        const content = await readFile(path.join(at, 'SKILL.md'), 'utf8').catch(() => null)
        if (content === null) continue
        const fields = parseSkillFrontmatter(content)
        const display = (fields?.name ?? folder).trim()
        const name = display.replace(/\s+/g, '-')
        if (!name || seen.has(name)) continue
        seen.add(name)
        this.skills.push({ name, display, description: (fields?.description ?? '').replace(/\s+/g, ' ').trim(), path: path.join(at, 'SKILL.md') })
      }
    }
  }

  private announce(session: SessionState): void {
    const availableCommands = [
      ...this.commands.map((command) => ({ name: command.name, description: command.description })),
      ...this.skills.map((skill) => ({ name: skill.name, description: skill.description, kind: 'skill' }))
    ]
    if (availableCommands.length) this.send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: session.id, update: { sessionUpdate: 'available_commands_update', availableCommands } } })
  }

  // A slash command of its own expands as its TUI expands it; a skill names its SKILL.md instead,
  // which its server would not take as a command.
  private expanded(text: string): string {
    const match = /(?:^|\n\n)\/([^\s/][^\s]*)(?:[ \t]+([\s\S]*))?$/.exec(text)
    const name = match?.[1]
    if (!match || !name) return text
    const args = (match[2] ?? '').trim()
    const at = match.index + match[0].indexOf('/')
    const command = this.commands.find((entry) => entry.name === name)
    if (command?.template) {
      const body = command.template.includes('$ARGUMENTS') ? command.template.split('$ARGUMENTS').join(args) : args ? `${command.template}\n\n${args}` : command.template
      return `${text.slice(0, at)}${body}`
    }
    const skill = this.skills.find((entry) => entry.name === name)
    if (!skill) return text
    const note = `请使用技能「${skill.display}」，说明在 ${skill.path}`
    return `${text.slice(0, at)}${args ? `${note}。${args}` : note}`
  }

  // The session's model and mode as ACP config options, filling in what it has not chosen yet from
  // CodeArts' own defaults.
  private async configOptions(session: SessionState) {
    const providers = Providers.parse(await this.api('GET', '/config/providers', session.cwd))
    this.variants.clear()
    for (const provider of providers.providers) for (const model of Object.values(provider.models)) {
      const value = `${provider.id}/${model.id}`
      if (model.limit) this.contexts.set(value, model.limit.context)
      const variants = Object.keys(model.variants ?? {})
      if (variants.length) this.variants.set(value, variants)
    }
    const models = providers.providers.flatMap((provider) => Object.values(provider.models).map((model) => ({ value: `${provider.id}/${model.id}`, name: model.model_name || model.name || model.id, ...(model.limit ? { contextWindow: model.limit.context } : {}), ...(model.options?.creditRatioDisplay ? { costRate: model.options.creditRatioDisplay } : {}) })))
    if (!session.model) {
      const configured = Config.parse(await this.api('GET', '/config', session.cwd))
      const [provider, model] = Object.entries(providers.default)[0] ?? []
      session.model = configured.model && models.some((entry) => entry.value === configured.model) ? configured.model : provider && model ? `${provider}/${model}` : models[0]?.value ?? null
    }
    const agents = await this.agents(session.cwd)
    if (!session.mode) {
      const configured = Config.parse(await this.api('GET', '/config', session.cwd)).default_agent
      session.mode = agents.find((agent) => agent.name === configured)?.name ?? agents.find((agent) => agent.name === 'build')?.name ?? agents[0]?.name ?? null
    }
    const levels = this.variants.get(session.model ?? '') ?? []
    const level = levels.includes(session.variant ?? '') ? session.variant : levels[0] ?? null
    session.variant = level
    return [
      { id: 'model', name: 'Model', category: 'model', type: 'select', currentValue: session.model ?? '', options: models },
      { id: 'mode', name: 'Session Mode', category: 'mode', type: 'select', currentValue: session.mode ?? '', options: agents.map((agent) => ({ value: agent.name, name: agent.name, ...(agent.description ? { description: agent.description } : {}) })) },
      ...(levels.length ? [{ id: 'variant', name: 'Reasoning', category: 'thought_level', type: 'select', currentValue: level ?? '', options: levels.map((value) => ({ value, name: value })) }] : [])
    ]
  }

  // Sent without waiting on the request, which would be held open for the whole turn: the stream
  // says when the session is idle again, after the turn's every update, and the turn's answer is
  // then its last message.
  private async prompt(params: z.infer<typeof Prompt>) {
    const session = this.session(params.sessionId)
    if (session.busy) throw new AcpError(-32603, 'CodeArts is still running this session’s previous message')
    session.busy = true
    session.cancelled = false
    session.error = null
    const idle = new Promise<void>((resolve) => { session.idle = resolve })
    try {
      const parts = params.prompt.flatMap((block): Record<string, string>[] => {
        if (block.type === 'text' && block.text) return [{ type: 'text', text: this.expanded(block.text) }]
        if (block.type === 'image' && block.data && block.mimeType) return [{ type: 'file', url: `data:${block.mimeType};base64,${block.data}`, filename: 'image', mime: block.mimeType }]
        return []
      })
      const [providerID, ...rest] = (session.model ?? '').split('/')
      await this.api('POST', `/session/${session.id}/prompt_async`, session.cwd, {
        parts,
        ...(providerID && rest.length ? { model: { providerID, modelID: rest.join('/') } } : {}),
        ...(session.mode ? { agent: session.mode } : {}),
        ...(session.variant ? { variant: session.variant } : {})
      })
      await idle
      const messages = z.array(Message).safeParse(await this.api('GET', `/session/${session.id}/message`, session.cwd).catch(() => [])).data ?? []
      const info = messages.findLast((message) => message.info.role === 'assistant')?.info
      if (info?.tokens) this.usage(session, info, messages)
      if (session.cancelled || info?.error?.name === 'MessageAbortedError') return { stopReason: 'cancelled' }
      const failure = session.error ?? info?.error?.data?.message ?? null
      if (failure) throw new AcpError(-32603, failure)
      return {
        stopReason: 'end_turn',
        ...(info?.tokens ? { usage: { inputTokens: info.tokens.input, outputTokens: info.tokens.output, ...(info.tokens.reasoning ? { thoughtTokens: info.tokens.reasoning } : {}), ...(info.tokens.cache.read ? { cachedReadTokens: info.tokens.cache.read } : {}), ...(info.tokens.cache.write ? { cachedWriteTokens: info.tokens.cache.write } : {}), totalTokens: info.tokens.input + info.tokens.output + info.tokens.reasoning + info.tokens.cache.read + info.tokens.cache.write } } : {})
      }
    } finally {
      session.busy = false
      session.idle = null
    }
  }

  // How full its context is, from the turn's last answer, and what the session has cost.
  private usage(session: SessionState, info: z.infer<typeof MessageInfo>, messages: z.infer<typeof Message>[]): void {
    const size = info.providerID && info.modelID ? this.contexts.get(`${info.providerID}/${info.modelID}`) : undefined
    if (!info.tokens || !size) return
    const cost = messages.reduce((sum, message) => sum + (message.info.role === 'assistant' ? message.info.cost : 0), 0)
    this.update(session.id, { sessionUpdate: 'usage_update', used: info.tokens.input + info.tokens.cache.read, size, cost: { amount: cost, currency: 'USD' } })
  }

  private async cancel(id: string): Promise<void> {
    const session = this.sessions.get(id)
    if (!session) return
    session.cancelled = true
    await this.api('POST', `/session/${id}/abort`, session.cwd, {})
  }

  private update(sessionId: string, update: Record<string, unknown>): void {
    this.send({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update } })
  }

  // The session an event belongs to as Antumi knows it: its own, or for a subagent's, the one it
  // runs for, which the server is asked once.
  private async owner(sessionId: string, directory: string): Promise<SessionState | null> {
    const known = this.sessions.get(sessionId) ?? this.sessions.get(this.roots.get(sessionId) ?? '')
    if (known) return known
    if (this.roots.has(sessionId)) return null
    this.roots.set(sessionId, '')
    const parent = Info.safeParse(await this.api('GET', `/session/${sessionId}`, directory).catch(() => null)).data?.parentID
    if (!parent) return null
    const root = this.sessions.has(parent) ? parent : this.roots.get(parent) ?? ''
    this.roots.set(sessionId, root)
    return this.sessions.get(root) ?? null
  }

  // An event from the server's stream.
  async event(raw: unknown): Promise<void> {
    const event = GlobalEvent.safeParse(raw).data?.payload
    if (!event) return
    const properties = z.looseObject({}).catch({}).parse(event.properties)
    const directory = z.looseObject({ directory: z.string() }).safeParse(raw).data?.directory ?? ''
    switch (event.type) {
      case 'session.created': case 'session.updated': {
        const info = Info.safeParse(z.looseObject({ info: z.unknown() }).safeParse(properties).data?.info).data
        if (info?.parentID) this.roots.set(info.id, this.sessions.has(info.parentID) ? info.parentID : this.roots.get(info.parentID) ?? '')
        return
      }
      case 'message.updated': {
        const info = MessageInfo.safeParse(z.looseObject({ info: z.unknown() }).safeParse(properties).data?.info).data
        if (info) this.roles.set(info.id, info.role)
        return
      }
      case 'message.part.updated': {
        const part = Part.safeParse(z.looseObject({ part: z.unknown() }).safeParse(properties).data?.part).data
        if (!part) return
        this.parts.set(part.id, { type: part.type, role: this.roles.get(part.messageID) ?? null, hidden: Boolean(part.synthetic || part.ignored) })
        if (part.type !== 'tool') return
        const owner = await this.owner(part.sessionID, directory)
        if (owner) this.tool(owner.id, part, true)
        return
      }
      case 'message.part.delta': {
        const delta = z.looseObject({ sessionID: z.string(), messageID: z.string(), partID: z.string(), field: z.string(), delta: z.string() }).safeParse(properties).data
        if (!delta || delta.field !== 'text') return
        const owner = this.sessions.get(delta.sessionID)
        if (!owner) return
        const part = this.parts.get(delta.partID)
        const role = part?.role ?? this.roles.get(delta.messageID) ?? 'assistant'
        if (role !== 'assistant' || part?.hidden) return
        if (part?.type === 'reasoning') this.update(owner.id, { sessionUpdate: 'agent_thought_chunk', messageId: delta.messageID, content: { type: 'text', text: delta.delta } })
        else if (!part || part.type === 'text') this.update(owner.id, { sessionUpdate: 'agent_message_chunk', messageId: delta.messageID, content: { type: 'text', text: delta.delta } })
        return
      }
      case 'permission.asked': {
        const request = Permission.safeParse(properties).data
        if (!request) return
        const owner = await this.owner(request.sessionID, directory)
        if (!owner) return
        // One at a time per session, as CodeArts' own ACP server asks.
        const queued = (this.queues.get(owner.id) ?? Promise.resolve()).then(() => this.askPermission(owner, request))
        this.queues.set(owner.id, queued.catch(() => {}))
        return
      }
      case 'session.idle': case 'session.status': {
        const status = z.looseObject({ sessionID: z.string(), status: z.looseObject({ type: z.string() }).optional() }).safeParse(properties).data
        if (status && (event.type === 'session.idle' || status.status?.type === 'idle')) this.sessions.get(status.sessionID)?.idle?.()
        return
      }
      case 'question.asked': {
        // Its ACP server never passed questions on; Antumi's agents go without the tool.
        const id = z.looseObject({ id: z.string() }).safeParse(properties).data?.id
        if (id) await this.api('POST', `/question/${id}/reject`, directory).catch(() => {})
        return
      }
      case 'session.error': {
        const failure = z.looseObject({ sessionID: z.string().optional(), error: z.looseObject({ name: z.string().optional(), data: z.looseObject({ message: z.string().optional() }).optional() }).optional() }).safeParse(properties).data
        const session = failure?.sessionID ? this.sessions.get(failure.sessionID) : undefined
        if (session && failure?.error?.name !== 'MessageAbortedError') session.error = failure?.error?.data?.message ?? failure?.error?.name ?? 'CodeArts 出错了'
        return
      }
    }
  }

  private async askPermission(owner: SessionState, request: z.infer<typeof Permission>): Promise<void> {
    const id = `codearts-bridge-${++this.serial}`
    // A command's request shows the command, with why it is asked, as a call of bash would.
    const risk = COMMANDS.has(request.permission) ? Risk.safeParse(request.metadata).data : undefined
    const command = risk?.blacklisted?.command ?? risk?.command ?? (request.patterns.join(' ') || undefined)
    const reason = risk?.blacklisted?.message ?? risk?.warning
    const answered = new Promise<unknown>((resolve) => this.asked.set(id, resolve))
    this.send({
      jsonrpc: '2.0', id, method: 'session/request_permission', params: {
        sessionId: owner.id,
        toolCall: risk
          ? { toolCallId: request.tool?.callID ?? request.id, status: 'pending', title: 'bash', rawInput: { command, ...(reason ? { description: reason } : {}) }, kind: 'execute', locations: [] }
          : { toolCallId: request.tool?.callID ?? request.id, status: 'pending', title: request.permission, rawInput: request.metadata, kind: kindOf(request.permission), locations: locationsOf(request.permission, request.metadata) },
        options: OPTIONS
      }
    })
    const outcome = Outcome.safeParse(await answered).data?.outcome
    this.asked.delete(id)
    const reply = outcome?.outcome === 'selected' && (outcome.optionId === 'once' || outcome.optionId === 'always') ? outcome.optionId : 'reject'
    await this.api('POST', `/permission/${request.id}/reply`, owner.cwd, { reply }).catch(() => {})
  }

  // A tool part as ACP tool call updates: announced once, then its progress and its result.
  private tool(sessionId: string, part: z.infer<typeof Part>, live: boolean): void {
    const state = part.state
    const name = part.tool ?? 'tool'
    const callId = part.callID ?? part.id
    if (!state || WRAPPERS.has(name)) return
    const kind = kindOf(name)
    if (!this.announced.has(callId)) {
      this.announced.add(callId)
      this.update(sessionId, { sessionUpdate: 'tool_call', toolCallId: callId, title: name, kind, status: 'pending', locations: [], rawInput: {} })
    }
    if (state.status === 'running') {
      const output = name === 'bash' && typeof state.metadata.output === 'string' ? state.metadata.output : null
      this.update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId: callId, status: 'in_progress', kind, title: name, locations: locationsOf(name, state.input), rawInput: state.input, ...(output ? { content: [{ type: 'content', content: { type: 'text', text: output } }] } : {}) })
    } else if (state.status === 'completed') {
      const output = text(state.output)
      const content: unknown[] = [{ type: 'content', content: { type: 'text', text: output } }]
      if (kind === 'edit' && typeof state.input.filePath === 'string') {
        const newText = typeof state.input.newString === 'string' ? state.input.newString : typeof state.input.content === 'string' ? state.input.content : ''
        // Without the text it replaced, a file it wrote whole: added.
        content.push({ type: 'diff', path: state.input.filePath, ...(typeof state.input.oldString === 'string' ? { oldText: state.input.oldString } : {}), newText })
      }
      if (name === 'todowrite') {
        const todos = Todos.safeParse((() => { try { return JSON.parse(output) } catch { return null } })()).data
        if (todos) this.update(sessionId, { sessionUpdate: 'plan', entries: todos.map((todo) => ({ priority: 'medium', status: todo.status === 'cancelled' ? 'completed' : todo.status, content: todo.content })) })
      }
      // Its output is the content; the raw output only adds a command's exit code, and with nothing
      // printed is empty too, as Antumi shows a raw output where the content says nothing.
      const exitCode = typeof state.metadata.exit === 'number' ? state.metadata.exit : null
      this.update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId: callId, status: 'completed', kind, title: state.title || name, content, rawInput: state.input, rawOutput: output && exitCode !== null ? { exitCode } : output })
      if (live) this.announced.delete(callId)
    } else if (state.status === 'error') {
      this.update(sessionId, { sessionUpdate: 'tool_call_update', toolCallId: callId, status: 'failed', kind, title: name, rawInput: state.input, content: [{ type: 'content', content: { type: 'text', text: state.error ?? '' } }], rawOutput: { error: state.error ?? '' } })
      if (live) this.announced.delete(callId)
    }
  }

  // A stored message as the updates that told it, for a loaded or forked session.
  private replay(sessionId: string, message: z.infer<typeof Message>): void {
    const { role, id } = message.info
    if (role !== 'user' && role !== 'assistant') return
    for (const part of message.parts) {
      if (part.type === 'tool') this.tool(sessionId, part, false)
      else if (part.type === 'text' && part.text && !part.synthetic && !part.ignored) this.update(sessionId, { sessionUpdate: role === 'user' ? 'user_message_chunk' : 'agent_message_chunk', messageId: id, content: { type: 'text', text: part.text } })
      else if (part.type === 'reasoning' && part.text && role === 'assistant') this.update(sessionId, { sessionUpdate: 'agent_thought_chunk', messageId: id, content: { type: 'text', text: part.text } })
    }
  }
}
