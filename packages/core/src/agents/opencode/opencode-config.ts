import path from 'node:path'
import { RESERVED_MCP_SERVER_NAME } from '@antumi/protocol'
import { PROVIDER_KEY_ENV, providerChatModels, type ProviderLaunch } from '../../provider-launch'
import { anthropicBaseUrl } from '../../provider-request'
import type { AgentLaunch } from '../agent-adapter'

// The primary agents Antumi adds for its own modes. An agent starts from allowing everything
// (OpenCode's Build does no more), and its own rules, last, decide.
// readOnly: OpenCode's Plan stops edits but still runs shell commands, so this one denies edits
// and asks before anything that runs or reaches outside the project.
export const OPENCODE_READ_ONLY_AGENT = 'antumi-readonly'
// acceptEdits: edits and commands in the project go ahead; reaching outside it, or into a .env
// file, is refused rather than asked. OpenCode ends the whole turn when a request is rejected, but
// takes a rule's refusal as the tool's error and goes on: so a run nobody watches, in this mode,
// is never stopped by a request.
export const OPENCODE_AUTO_AGENT = 'antumi-auto'
// bypass: nothing is asked, whatever the user's own rules say.
export const OPENCODE_BYPASS_AGENT = 'antumi-bypass'

const rule = (action: string, effect: 'allow' | 'ask' | 'deny', resource = '*') => ({ action, resource, effect })

// The provider as OpenCode names it, and its models under it.
const DEFAULT_OUTPUT = 16_384

const providerName = (provider: Pick<ProviderLaunch, 'providerId'>) => `antumi-${provider.providerId}`
export const opencodeProviderModels = (provider: Pick<ProviderLaunch, 'providerId' | 'models' | 'defaultModel'>) =>
  providerChatModels(provider, (model) => `${providerName(provider)}/${model.id}`)

// A provider entry in OpenCode's config, through the AI SDK package for its wire. The key is a
// reference OpenCode fills from the environment, so the config text holds none. Its Anthropic
// package sends the key as x-api-key; a provider that takes a bearer token gets that header too.
function opencodeProvider(provider: ProviderLaunch): Record<string, unknown> {
  const { endpoint } = provider
  const key = `{env:${PROVIDER_KEY_ENV}}`
  const anthropic = endpoint.wire === 'anthropic'
  return {
    npm: anthropic ? '@ai-sdk/anthropic' : endpoint.wire === 'openai-responses' ? '@ai-sdk/openai' : '@ai-sdk/openai-compatible',
    name: providerName(provider),
    options: {
      // The Anthropic package adds /messages only.
      baseURL: anthropic ? `${anthropicBaseUrl(endpoint.baseUrl)}/v1` : endpoint.baseUrl.replace(/\/+$/, ''),
      apiKey: key,
      ...(Object.keys(provider.headers).length || (anthropic && endpoint.anthropic?.auth === 'auth_token')
        ? { headers: { ...provider.headers, ...(anthropic && endpoint.anthropic?.auth === 'auth_token' ? { authorization: `Bearer ${key}` } : {}) } }
        : {})
    },
    models: Object.fromEntries(provider.models.map((model) => [model.id, {
      name: model.label ?? model.id,
      // OpenCode takes a limit only with both halves; an output not known is what pi and dsh assume.
      ...(model.contextWindow !== null ? { limit: { context: model.contextWindow, output: model.maxOutput ?? Math.min(DEFAULT_OUTPUT, model.contextWindow) } } : {}),
      ...(model.efforts.length ? { reasoning: true } : {}),
      ...(model.images ? { modalities: { input: ['text', 'image'], output: ['text'] } } : {})
    }]))
  }
}

// What Antumi adds to the user's OpenCode config for one process, through OPENCODE_CONFIG_CONTENT:
// merged over their own, which stays as it is. The bypass agent exists only where the stage may
// bypass, so it is never there to switch to otherwise.
export function opencodeConfig(launch: Pick<AgentLaunch, 'skills' | 'allowBypass' | 'planOnly' | 'readOnly' | 'mcp' | 'provider' | 'references'>): string {
  const bypass = Boolean(launch.allowBypass) && !launch.planOnly && !launch.readOnly
  const { mcp, provider } = launch
  // Reference projects lie outside the project, which Antumi's agents keep out of: they may read
  // there, never edit, whatever else their rules allow. OpenCode's own Build asks nothing by
  // default, so it gets the same rules, added only then: OpenCode merges them over the user's.
  const references = (launch.references ?? []).map((dir) => `${dir}/*`)
  const readable = references.map((resource) => rule('external_directory', 'allow', resource))
  const fenced = references.map((resource) => rule('edit', 'deny', resource))
  return JSON.stringify({
    // On a provider, the one model provider it starts on, with its small model for titles.
    ...(provider ? {
      provider: { [providerName(provider)]: opencodeProvider(provider) },
      model: `${providerName(provider)}/${provider.defaultModel}`,
      small_model: `${providerName(provider)}/${provider.smallModel}`
    } : {}),
    // Antumi's own server, here rather than in session/new, which cannot turn off OpenCode's Code
    // Mode: under it the model calls every tool of a server from one `execute` script, and Antumi
    // could no longer tell its own tools (a preview, a screenshot) in the chat. The server comes
    // as the adapter starts it (launch.mcp): reporting when it is loaded, read-only where need be.
    // OpenCode 2's shape, servers under `servers`: a server named at the top is read as 1's, which
    // drops codemode.
    ...(mcp ? {
      mcp: {
        servers: {
          [RESERVED_MCP_SERVER_NAME]: {
            type: 'local',
            command: [mcp.command, ...mcp.args],
            environment: mcp.env ?? {},
            codemode: false
          }
        }
      }
    } : {}),
    agents: {
      ...(fenced.length ? { build: { permissions: [...readable, ...fenced] } } : {}),
      [OPENCODE_READ_ONLY_AGENT]: {
        description: 'Read-only: reads files and answers; edits nothing (Antumi)',
        mode: 'primary',
        permissions: [rule('edit', 'deny'), rule('shell', 'ask'), rule('external_directory', 'ask'), ...readable]
      },
      [OPENCODE_AUTO_AGENT]: {
        description: 'Automatic: edits and runs commands in the project; never reaches outside it (Antumi)',
        mode: 'primary',
        permissions: [
          rule('edit', 'allow'), rule('shell', 'allow'), rule('external_directory', 'deny'),
          rule('read', 'deny', '*.env'), rule('read', 'deny', '*.env.*'), rule('read', 'allow', '*.env.example'),
          ...readable, ...fenced
        ]
      },
      ...(bypass ? {
        [OPENCODE_BYPASS_AGENT]: {
          description: 'Allow everything: nothing is asked (Antumi)',
          mode: 'primary',
          permissions: [rule('*', 'allow'), ...fenced]
        }
      } : {})
    },
    // Antumi's skills bundle, in the Agent Skills layout OpenCode scans for SKILL.md.
    ...(launch.skills ? { skills: [path.join(launch.skills.dir, '.agents', 'skills')] } : {})
  })
}
