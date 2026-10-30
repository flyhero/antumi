import { agentToolsOverCore } from './mcp-agent-tools'
import { bookmarkToolsOverCore } from './mcp-bookmark-tools'
import { squadToolsOverCore, type SquadTools } from './mcp-squad-tools'
import { todoToolsOverCore } from './mcp-todo-tools'
import { managementToolsOverCore } from './mcp-management-tools'
import readline from 'node:readline'
import { stat } from 'node:fs/promises'
import { extname, isAbsolute } from 'node:path'
import { z } from 'zod'
import { connectRpc, coreUrl, isPreviewImage, PREVIEW_EXTENSIONS, PREVIEW_FILES_MAX, PREVIEW_LAYOUTS, previewLayout, PreviewInput, SHOW_PREVIEW_TOOL, type Conversation, type PreviewLayout, type RpcConnection } from '@antumi/protocol'
import { readCoreEndpoint, antumiPaths } from '@antumi/protocol/node'
import { AttachmentStore } from './attachment-store'
import { BROWSER_ARGUMENTS, BROWSER_TOOL_SPECS, browserToolsOverCore, type BrowserTools, type ToolOutcome } from './mcp-browser-tools'
import { HISTORY_ARGUMENTS, HISTORY_TOOL_SPECS, historyToolsOverCore, type HistoryTools } from './mcp-history-tools'
import { TERMINAL_ARGUMENTS, TERMINAL_TOOL_SPECS, terminalToolsOverCore, type TerminalTools } from './mcp-terminal-tools'

// A tools-only MCP server over stdio, giving an agent Antumi's own tools: showing a file it wrote in
// the chat, the browser Antumi hosts, terminals of its own in the app's panel, and, unless the user
// turned it off, reading their history in Antumi.
// Messages are newline-delimited JSON-RPC 2.0; stdout is the channel, so logs go to stderr.

const Message = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional()
})
const InitializeParams = z.object({ protocolVersion: z.string() })
const CallParams = z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).optional() })

// Tools and basic lifecycle are the same in every published MCP revision.
const FALLBACK_PROTOCOL_VERSION = '2025-06-18'

const LAYOUT_NAMES: Record<PreviewLayout, string> = { compare: '并排', tabs: '页签', grid: '网格' }

const PREVIEW_TOOL = {
  name: SHOW_PREVIEW_TOOL,
  title: '在对话里展示网页或图片',
  description:
    '把磁盘上的文件直接展示在用户的对话里：HTML 或 SVG 渲染成页面，用户能看到、能点；' +
    'PNG、JPEG、GIF、WebP 显示成图片，用户点开能放大。做完样稿、原型、图表，或截了图想让用户看时调用；中间产物不要调。' +
    '一个文件用 path。几个相关的（改动前后、几种方案、一组截图）放进 files 一次展示，每个配一句 title；不要分开调多次，也不要自己把图拼成一张。' +
    'layout 可选：compare 并排（2–4 张图）、tabs 一次一个来回切换、grid 缩略图网格；不填就按数量选。一组里有 HTML 时只能是 tabs。' +
    '文件要已经写到磁盘上，用绝对路径。HTML 里可以用相对路径引用同目录的样式和图片；页面跟随用户的浅色/深色主题，不能访问网络。' +
    '要给用户看截图就用它，不要只在回复里写文件路径。',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '一个文件时：文件的绝对路径，.html / .htm / .svg，或 .png / .jpg / .jpeg / .gif / .webp' },
      files: {
        type: 'array',
        description: `几个文件时用它代替 path，最多 ${PREVIEW_FILES_MAX} 个，按给用户看的顺序`,
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件的绝对路径' },
            title: { type: 'string', description: '这一个的说明，比如「改动前」「方案 A」' }
          },
          required: ['path'],
          additionalProperties: false
        },
        minItems: 1,
        maxItems: PREVIEW_FILES_MAX
      },
      title: { type: 'string', description: '给用户看的标题，可选' },
      layout: { type: 'string', enum: [...PREVIEW_LAYOUTS], description: '几个文件怎么排，可选：compare 并排、tabs 切换、grid 网格' }
    },
    additionalProperties: false
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
} as const

export type McpTools = {
  planOnly?: boolean
  initialized?: () => Promise<void>
  // The client has its tools: an agent that loads the server alongside its session (OpenCode) can
  // offer them only from then on.
  listed?: () => Promise<void>
  // Checks the file may be shown (it exists, and is a page, an SVG or a picture); throws with the reason if not.
  preview: (path: string) => Promise<void>
  // The browser tools, there when the server was started for a conversation.
  browser?: BrowserTools
  // The user's bookmarks, there with the browser.
  bookmarks?: ReturnType<typeof bookmarkToolsOverCore>
  // Terminals of the conversation's own in the app's panel, there likewise.
  terminal?: TerminalTools
  // The user's conversations, tasks and group chats, read-only; there unless turned off.
  history?: HistoryTools
  agents?: ReturnType<typeof agentToolsOverCore>
  squad?: SquadTools
  management?: Awaited<ReturnType<typeof managementToolsOverCore>>
  // The conversation's to-dos, there when the server was started for one.
  todo?: ReturnType<typeof todoToolsOverCore>
}

export type McpResponse = {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

type McpResult = { content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; isError: boolean }

function textResult(text: string, isError = false): McpResult {
  return { content: [{ type: 'text', text }], isError }
}

function outcomeResult(outcome: ToolOutcome): McpResult {
  return {
    content: [...(outcome.image ? [{ type: 'image' as const, data: outcome.image.data, mimeType: outcome.image.mimeType }] : []), { type: 'text', text: outcome.text }],
    isError: outcome.isError ?? false
  }
}

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error))

// What the model may call: the tool as listed, and what a call with its arguments does. Bad
// arguments are the model's to fix, so they come back as a tool error it can read.
type ToolEntry = { spec: object & { name: string }; run(args: Record<string, unknown>): Promise<McpResult> }

function toolTable({ preview, browser, bookmarks, terminal, history, squad, agents, management, todo, planOnly }: McpTools): ToolEntry[] {
  const entries: ToolEntry[] = [
    {
      spec: PREVIEW_TOOL,
      run: async (raw) => {
        const args = PreviewInput.safeParse(raw)
        if (!args.success) return textResult(`path 需要是文件的绝对路径；files 是 1–${PREVIEW_FILES_MAX} 个 { path, title }。`, true)
        const { path, files, layout } = args.data
        if (Boolean(path) === Boolean(files)) return textResult('path 和 files 二选一：一个文件用 path，几个用 files。', true)
        if (path) {
          try {
            await preview(path)
            return textResult(isPreviewImage(path)
              ? '已在对话里展示给用户。用户会在这一条下面看到这张图片。'
              : '已在对话里展示给用户，不用再截图。用户会在这一条下面看到页面。')
          } catch (error) {
            return textResult(`没能展示：${describe(error)}`, true)
          }
        }
        const paths = (files ?? []).map((file) => file.path)
        const refused = (await Promise.all(paths.map((each) => preview(each).then(() => null, (error: unknown) => `${each}：${describe(error)}`)))).filter((reason) => reason !== null)
        if (refused.length > 0) return textResult(`没能展示，一个都没放出来：${refused.join('；')}`, true)
        const used = previewLayout(paths, layout ?? null)
        const changed = layout && layout !== used ? `（${LAYOUT_NAMES[layout]}放不下这一组，改成了${LAYOUT_NAMES[used]}）` : ''
        return textResult(`已在对话里展示给用户：${paths.length} 个文件，${LAYOUT_NAMES[used]}排列${changed}。用户会在这一条下面看到它们。`)
      }
    }
  ]
  if (browser) {
    for (const { kind, ...spec } of BROWSER_TOOL_SPECS) {
      if (planOnly && !spec.annotations.readOnlyHint) continue
      entries.push({
        spec,
        run: async (raw) => {
          const args = BROWSER_ARGUMENTS[kind].safeParse(raw)
          if (!args.success) return textResult(`参数不对：${args.error.issues.map((issue) => `${issue.path.join('.') || '参数'} ${issue.message}`).join('；')}`, true)
          return outcomeResult(await browser.call(kind, args.data))
        }
      })
    }
  }
  if (bookmarks) entries.push(...bookmarks)
  if (terminal) {
    for (const { kind, ...spec } of TERMINAL_TOOL_SPECS) {
      if (planOnly && !spec.annotations.readOnlyHint) continue
      entries.push({
        spec,
        run: async (raw) => {
          const args = TERMINAL_ARGUMENTS[kind].safeParse(raw)
          if (!args.success) return textResult(`参数不对：${args.error.issues.map((issue) => `${issue.path.join('.') || '参数'} ${issue.message}`).join('；')}`, true)
          return outcomeResult(await terminal.call(kind, args.data))
        }
      })
    }
  }
  if (history) {
    for (const { kind, ...spec } of HISTORY_TOOL_SPECS) {
      entries.push({
        spec,
        run: async (raw) => {
          const args = HISTORY_ARGUMENTS[kind].safeParse(raw)
          if (!args.success) return textResult(`参数不对：${args.error.issues.map((issue) => `${issue.path.join('.') || '参数'} ${issue.message}`).join('；')}`, true)
          return outcomeResult(await history.call(kind, args.data))
        }
      })
    }
  }
  if (squad) entries.push(...squad)
  if (agents) entries.push(...agents)
  if (management) entries.push(...management.filter((entry) => !planOnly || entry.spec.annotations.readOnlyHint))
  // Antumi's list, not the checkout: a planning agent writes to it too.
  if (todo) entries.push(...todo)
  return entries
}

export function createMcpHandler(tools: McpTools) {
  const table = toolTable(tools)
  const specs = table.map((entry) => entry.spec)
  return async (line: string): Promise<McpResponse | null> => {
    let raw: unknown
    try {
      raw = JSON.parse(line)
    } catch {
      return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }
    }
    const message = Message.safeParse(raw)
    if (!message.success) {
      return { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'invalid request' } }
    }
    const { id, method, params } = message.data
    // Notifications (no id), such as notifications/initialized, need no answer.
    if (id === undefined) {
      return null
    }
    const reply = (result: unknown): McpResponse => ({ jsonrpc: '2.0', id, result })
    switch (method) {
      case 'initialize': {
        const requested = InitializeParams.safeParse(params)
        await tools.initialized?.()
        return reply({
          protocolVersion: requested.success ? requested.data.protocolVersion : FALLBACK_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'antumi', version: '0.0.0' }
        })
      }
      case 'ping':
        return reply({})
      case 'tools/list': {
        const listed = reply({ tools: specs })
        void tools.listed?.()
        return listed
      }
      case 'tools/call': {
        const call = CallParams.safeParse(params)
        const entry = call.success ? table.find((candidate) => candidate.spec.name === call.data.name) : undefined
        if (!call.success || !entry) {
          return { jsonrpc: '2.0', id, error: { code: -32602, message: `unknown tool` } }
        }
        return reply(await entry.run(call.data.arguments ?? {}))
      }
      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } }
    }
  }
}

// A file the agent wants shown: it exists, is a file, and is the kind the desktop renders.
export async function checkPreviewFile(path: string): Promise<void> {
  if (!isAbsolute(path)) throw new Error('要用绝对路径')
  const extension = extname(path).slice(1).toLowerCase()
  if (!PREVIEW_EXTENSIONS.has(extension)) throw new Error('只能展示 .html、.htm、.svg，或 .png、.jpg、.jpeg、.gif、.webp 图片')
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) throw new Error(`文件不存在：${path}`)
}

// A group chat member only talks: like a read-only workspace it gets no tool that acts, and no to-dos,
// since its findings go to the group's summary, not onto a list of the user's.
export function conversationToolLimits(conversation: Pick<Conversation, 'workspaceReadOnly' | 'discussionId' | 'parentConversationId'>): { readOnly: boolean; todos: boolean } {
  const member = Boolean(conversation.discussionId)
  return { readOnly: Boolean(conversation.workspaceReadOnly) || member, todos: !member && !conversation.parentConversationId }
}

// A server started for a conversation has the browser tools, acting for that conversation alone;
// one without has the preview tool alone. `history` adds the tools that read the user's history.
// Each call connects anew, so a core restart between calls is harmless.
export async function serveMcp(home: string | undefined, conversationId?: string, planOnly = false, initialized?: () => Promise<void>, history = false, todos = true, listed?: () => Promise<void>): Promise<void> {
  const withCore = async <T>(work: (rpc: RpcConnection) => Promise<T>): Promise<T> => {
    const endpoint = await readCoreEndpoint(home)
    if (!endpoint) {
      throw new Error('Antumi core 没有运行')
    }
    const rpc = await connectRpc(coreUrl(endpoint))
    try {
      return await work(rpc)
    } finally {
      rpc.close()
    }
  }
  const scope = conversationId ? await withCore(async (rpc) => {
    const conversation = await rpc.call('conversations.get', { id: conversationId })
    const run = rpc.features.includes('squads') ? await rpc.call('squads.roster', { id: conversationId }) : null
    return { ...conversationToolLimits(conversation), run, delegate: !run && rpc.features.includes('agent-profiles') && !conversation.parentConversationId && !conversation.discussionId && !conversation.squadRunId && !conversation.routineId && !conversation.helperOf }
  }) : null
  const handle = createMcpHandler({
    planOnly: planOnly || scope?.readOnly,
    ...(conversationId ? { management: await managementToolsOverCore(withCore, conversationId, planOnly) } : {}),
    ...(conversationId && scope?.run ? { squad: squadToolsOverCore(withCore, conversationId, scope.run) } : {}),
    ...(conversationId && scope?.delegate ? { agents: agentToolsOverCore(withCore, conversationId) } : {}),
    initialized,
    ...(listed ? { listed } : {}),
    preview: checkPreviewFile,
    ...(conversationId ? {
      browser: browserToolsOverCore(withCore, conversationId, new AttachmentStore(antumiPaths(home).attachments)),
      bookmarks: bookmarkToolsOverCore(withCore),
      terminal: terminalToolsOverCore(withCore, conversationId),
      ...(todos && scope?.todos !== false ? { todo: todoToolsOverCore(withCore, conversationId) } : {})
    } : {}),
    ...(history ? { history: historyToolsOverCore(withCore, conversationId ?? null) } : {})
  })
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })
  for await (const line of lines) {
    if (line.trim()) {
      const response = await handle(line)
      if (response) {
        process.stdout.write(`${JSON.stringify(response)}\n`)
      }
    }
  }
}
