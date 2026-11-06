import path from 'node:path'
import { RESERVED_MCP_SERVER_NAME } from '@antumi/protocol'
import { antumiReadTools, type AgentCommand } from '../../agent-command'
import { startNote } from '../../agent-prompt'
import type { AgentLaunch } from '../agent-adapter'
import { anthropicBaseUrl } from '../../provider-request'
import { PROVIDER_KEY_ENV, PROVIDER_MARK_ENV, type ProviderLaunch } from '../../provider-launch'
import { PI_CONFIG_ENV, type PiExtensionConfig, type PiMcpServer, type PiProvider } from './pi-extension'
import { piProviderEntries, piProviderName } from './pi-models'
import { isPiMode, type PiMode } from './pi-modes'

// Not a moment spent asking pi.dev for a newer release.
export const PI_ENV = { PI_SKIP_VERSION_CHECK: '1' }

// The mode a start runs in: a fenced stage's own whatever was remembered, and bypass only where
// allowed. Asked by the command and the driver alike, which must agree.
export function piStartMode(launch: { preferred?: AgentLaunch['preferred']; planOnly?: unknown; readOnly?: unknown; allowBypass?: boolean | undefined }): PiMode {
  if (launch.planOnly) return 'plan'
  if (launch.readOnly) return 'readOnly'
  const wanted = launch.preferred?.permissionMode
  if (!wanted || !isPiMode(wanted) || (wanted === 'bypass' && !launch.allowBypass)) return 'ask'
  return wanted
}

// What the extension (pi-extension.ts) is told for this start.
export function piExtensionConfig(launch: AgentLaunch): PiExtensionConfig {
  const { mcp, userMcp = [], knowledgeBase, todos = true } = launch
  const fenced = launch.planOnly ?? launch.readOnly
  const servers: Record<string, PiMcpServer> = {
    ...(mcp ? { [RESERVED_MCP_SERVER_NAME]: { command: mcp.command, args: mcp.args, ...(mcp.env ? { env: mcp.env } : {}) } } : {}),
    ...Object.fromEntries(userMcp.map((server) => [server.name, server.type === 'stdio' ? { command: server.command, args: server.args, ...(server.env ? { env: server.env } : {}) } : { url: server.url }]))
  }
  return {
    mode: piStartMode(launch),
    servers,
    noEdit: [...(fenced?.dirs ?? []), ...(launch.references ?? []), ...(knowledgeBase && !knowledgeBase.write ? [knowledgeBase.path] : [])],
    workDirs: [...launch.extraProjects, ...(knowledgeBase?.write ? [knowledgeBase.path] : [])],
    readTools: mcp ? antumiReadTools(todos).map((tool) => `mcp__${RESERVED_MCP_SERVER_NAME}__${tool}`) : [],
    ...(launch.provider ? { provider: piProvider(launch.provider) } : {})
  }
}

// The provider as the extension registers it with Pi, on the wire this stage reaches it over.
// Pi's Anthropic API appends /v1/messages to its base, as Anthropic's SDK does.
export function piProvider(provider: ProviderLaunch): PiProvider {
  const { endpoint } = provider
  const anthropic = endpoint.wire === 'anthropic'
  return {
    name: piProviderName(provider),
    baseUrl: anthropic ? anthropicBaseUrl(endpoint.baseUrl) : endpoint.baseUrl.replace(/\/+$/, ''),
    api: anthropic ? 'anthropic-messages' : endpoint.wire === 'openai-responses' ? 'openai-responses' : 'openai-completions',
    bearer: anthropic && endpoint.anthropic?.auth === 'auth_token',
    headers: { ...provider.headers },
    models: piProviderEntries(provider)
  }
}

// What Pi is told once, in its system prompt: Antumi's start note, and the folders it may work in
// besides its own, which it reaches by their paths (Pi has no option for more folders).
export function piSystemNote(launch: AgentLaunch): string | null {
  const { extraProjects, knowledgeBase, instructions, mcp, todos = true } = launch
  const fenced = launch.planOnly ?? launch.readOnly
  const notes = [
    startNote({ knowledgeBase, instructions, todos: Boolean(mcp) && todos }),
    extraProjects.length ? `这个会话还涉及以下项目文件夹，需要时按绝对路径访问：\n${extraProjects.map((dir) => `- ${dir}`).join('\n')}` : null,
    fenced ? `以下文件夹只读，不能修改其中的文件：\n${fenced.dirs.map((dir) => `- ${dir}`).join('\n')}` : null
  ]
  const text = notes.filter((note): note is string => Boolean(note)).join('\n\n')
  return text || null
}

// Pi in RPC mode. Its model and thinking level are set over RPC once it has listed them, so a
// remembered one it no longer offers is a notice rather than a failed start. Antumi's extension
// comes from launch.prepare, which writes it.
export function piCommand(launch: AgentLaunch): AgentCommand {
  const { providerSessionId, resume, forkAt, skills } = launch
  const note = piSystemNote(launch)
  return {
    command: 'pi',
    args: [
      '--mode', 'rpc',
      // Its sessions are files; a fork copies one whole into a new session.
      ...(resume && providerSessionId ? [forkAt ? '--fork' : '--session', providerSessionId] : []),
      // Antumi's skills bundle, in the Agent Skills layout.
      ...(skills ? ['--skill', path.join(skills.dir, '.agents', 'skills')] : []),
      ...(note ? ['--append-system-prompt', note] : [])
    ],
    env: {
      ...PI_ENV,
      [PI_CONFIG_ENV]: JSON.stringify(piExtensionConfig(launch)),
      // The key in the environment only, which the extension takes it out of.
      ...(launch.provider ? { [PROVIDER_KEY_ENV]: launch.provider.apiKey, [PROVIDER_MARK_ENV]: launch.provider.providerId } : {})
    }
  }
}
