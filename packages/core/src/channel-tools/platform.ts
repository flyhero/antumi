import { z } from 'zod'
import { channelPlatform, type ChannelPlatform, type ChannelToolSpec, type DocLocation } from '@antumi/protocol'

// The platform's own tools a channel gives its agent, used as the bot through the platform's hosted
// MCP (docs/CHANNEL-LOOP.md, 三). Core runs every call: the agent names the tool, core checks the
// asker and the channel, fixes where a document goes, and the gateway adds the bot's token.

export const PLATFORM_PREFIX = 'lark_'
// What a platform tool returns to the agent, at most.
export const MAX_PLATFORM_TEXT = 20_000

// A platform tool's name as the agent sees it: lark_, then the platform's own with - as _.
export function agentToolName(name: string): string {
  return `${PLATFORM_PREFIX}${name.replaceAll('-', '_')}`
}

// The tools a channel gives: those picked that its platform's catalog has.
export function givenTools(platform: ChannelPlatform, picked: readonly string[] | undefined): string[] {
  const catalog = channelPlatform(platform).tools?.catalog ?? []
  return [...new Set(picked ?? [])].filter((name) => catalog.some((tool) => tool.name === name))
}

// The platform's name for a tool the agent called, if the channel gives it.
export function platformToolOf(agentName: string, given: readonly string[]): string | null {
  return given.find((name) => agentToolName(name) === agentName) ?? null
}

export function writesWith(platform: ChannelPlatform, name: string): boolean {
  return channelPlatform(platform).tools?.catalog.find((tool) => tool.name === name)?.write ?? true
}

// A folder's token out of its link, or the token as given.
function folderToken(value: string): string {
  return /\/folder\/([A-Za-z0-9_-]+)/.exec(value)?.[1] ?? value
}

// Where create-doc puts a document: the channel's place, whatever the agent asked for. With no place
// set it goes to the app's own space. A check on an earlier create (task_id) names no place.
export function placed(args: Record<string, unknown>, location: DocLocation | null | undefined): Record<string, unknown> {
  const { wiki_node: _node, wiki_space: _space, folder_token: _folder, ...rest } = args
  if (rest.task_id !== undefined || !location) return rest
  if (location.kind === 'wikiNode') return { ...rest, wiki_node: location.value }
  if (location.kind === 'wikiSpace') return { ...rest, wiki_space: location.value }
  return { ...rest, folder_token: folderToken(location.value) }
}

const ToolResult = z.object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() }).loose()).optional(), isError: z.boolean().optional() }).loose()

// A tools/call result as text for the agent, cut to what it may have.
export function resultText(result: unknown): { text: string; isError: boolean } {
  const parsed = ToolResult.safeParse(result)
  const text = parsed.success ? (parsed.data.content ?? []).flatMap((part) => (part.type === 'text' && part.text ? [part.text] : [])).join('\n') : ''
  const cut = text.length > MAX_PLATFORM_TEXT ? `${text.slice(0, MAX_PLATFORM_TEXT)}\n（内容过长，已截断）` : text
  return { text: cut || '（没有返回内容）', isError: !parsed.success || parsed.data.isError === true }
}

const Created = z.object({ doc_id: z.string().min(1), doc_url: z.string().optional() }).loose()

// The document create-doc made, out of its answer: its token and link.
export function createdDoc(text: string): { token: string; url: string | null } | null {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return null }
  const doc = Created.safeParse(raw)
  return doc.success ? { token: doc.data.doc_id, url: doc.data.doc_url ?? null } : null
}

// What a call was about, for the question's record: the document's link or id, else the tool.
export function callTarget(name: string, args: Record<string, unknown>, text: string): string {
  const created = name === 'create-doc' ? createdDoc(text) : null
  const doc = created?.url ?? created?.token ?? (typeof args.doc_id === 'string' ? args.doc_id : null) ?? (typeof args.title === 'string' ? args.title : null)
  return (doc ? `${name} ${doc}` : name).slice(0, 300)
}

const Listed = z.object({ tools: z.array(z.object({ name: z.string(), description: z.string().optional(), inputSchema: z.record(z.string(), z.unknown()).optional() }).loose()) }).loose()

// The platform's tools as the agent's MCP server lists them: only those given, named for the agent,
// described as the platform describes them.
export function platformSpecs(platform: ChannelPlatform, given: readonly string[], listed: unknown): ChannelToolSpec[] {
  const tools = Listed.safeParse(listed)
  if (!tools.success) return []
  return tools.data.tools.flatMap((tool) => (given.includes(tool.name) ? [{
    name: agentToolName(tool.name),
    description: `飞书工具（以机器人身份）：${tool.description ?? tool.name}`,
    inputSchema: tool.inputSchema ?? { type: 'object' },
    readOnly: !writesWith(platform, tool.name)
  }] : []))
}
