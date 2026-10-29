import { z } from 'zod'
import type { AcpDialect } from '../acp/acp-dialect'

const Permission = z.looseObject({ toolCall: z.looseObject({ title: z.string() }) })

export const geminiDialect: AcpDialect = {
  name: 'Gemini CLI', idPrefix: 'gemini',
  modes: { ask: 'default', acceptEdits: 'autoEdit', plan: 'plan', bypass: 'yolo' },
  inputIncludesCache: true,
  modeUpdate: (text) => /^\[MODE_UPDATE\] (default|autoEdit|plan|yolo)$/.exec(text.trim())?.[1] ?? null,
  toolName: (_input, _name, title, callId) => {
    const registered = callId?.split('__')[0]
    if (registered?.startsWith('mcp_antumi_')) return `antumi.${registered.slice('mcp_antumi_'.length)}`
    if (registered?.startsWith('mcp_')) return registered
    if (registered === 'google_web_search') return 'webSearch'
    if (registered === 'web_fetch') return 'webFetch'
    // Titles remain useful on calls recorded before Gemini included the registered name in ids.
    if (title?.startsWith('Fetching content from: ')) return 'webFetch'
    if (title?.startsWith('Searching the web for: ')) return 'webSearch'
    return null
  },
  toolInput: (raw, { kind, title, locations }) => {
    if (raw !== undefined) return raw
    if (kind === 'execute' && title) return { command: title }
    const location = locations?.[0]
    if (location) return { path: location.path, ...(location.line !== undefined ? { line: location.line } : {}) }
    if (title?.startsWith('Fetching content from: ')) return { url: title.slice('Fetching content from: '.length) }
    const query = /^Searching the web for: "([\s\S]*)"$/.exec(title ?? '')?.[1]
    return query !== undefined ? { query } : undefined
  },
  permissionPrompt: (request) => {
    const title = Permission.safeParse(request).data?.toolCall.title
    const path = title?.startsWith('Requesting plan approval for: ') ? title.slice('Requesting plan approval for: '.length) : null
    return path ? { kind: 'plan', path, runMode: 'ask' } : null
  },
  startNote: (options) => options.extraDirs.length ? `此会话还包含以下项目，请按绝对路径访问；命令分别指定各项目的工作目录：\n${options.extraDirs.map((dir) => `- ${dir}`).join('\n')}` : null
}
