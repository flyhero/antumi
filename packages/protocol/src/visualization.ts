import { z } from 'zod'

export const MAX_VISUALIZATION_BYTES = 5_000_000
export const VisualizationFile = z.object({ path: z.string(), contents: z.string().max(MAX_VISUALIZATION_BYTES) })
export type VisualizationFile = z.infer<typeof VisualizationFile>

export const VisualizationReference = z.object({
  path: z.string().min(1).max(32_768),
  title: z.string().max(200).optional(),
  mode: z.literal('wide').optional()
})
export type VisualizationReference = z.infer<typeof VisualizationReference>

export function visualizationPath(name: string): boolean {
  const file = name.replaceAll('\\', '/').split('/').at(-1) ?? ''
  return /^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/.test(file) && !/(?:^|[\\/])\.\.(?:[\\/]|$)|["\r\n\0]/.test(name)
}

function absolute(name: string): boolean {
  return name.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(name) || name.startsWith('\\\\')
}

function reference(line: string): VisualizationReference | null {
  const marker = /^ {0,3}\uE200visualize\uE202([^\uE201]+)\uE201[ \t]*$/.exec(line)
  const directive = /^ {0,3}::codex-inline-vis\{(path|file)="([^"\r\n]+)"((?:[ \t]+(?:title="[^"\r\n]*"|mode="wide"))*)\}[ \t]*$/.exec(line)
  let raw: unknown
  if (marker?.[1]) {
    const payload = marker[1]
    if (payload.startsWith('{')) {
      try {
        raw = JSON.parse(payload)
      } catch { return null }
      if (!raw || typeof raw !== 'object' || !('path' in raw) || typeof raw.path !== 'string' || !absolute(raw.path) || ('type' in raw && raw.type !== undefined && raw.type !== 'inline')) return null
    } else raw = { path: payload }
  } else if (directive) {
    raw = { path: directive[2], title: /title="([^"]*)"/.exec(directive[3] ?? '')?.[1], mode: /mode="wide"/.test(directive[3] ?? '') ? 'wide' : undefined }
  } else return null
  const parsed = VisualizationReference.safeParse(raw)
  if (!parsed.success || !visualizationPath(parsed.data.path) || (!absolute(parsed.data.path) && /[\\/]/.test(parsed.data.path))) return null
  return parsed.data
}

export type VisualizationPart = { kind: 'markdown'; text: string } | { kind: 'visualization'; reference: VisualizationReference }

// References occupy their own line; fenced and indented examples remain ordinary Markdown.
export function codexVisualizations(text: string, streaming = false): VisualizationPart[] {
  const parts: VisualizationPart[] = []
  let markdown = ''
  let fence: { character: string; length: number } | null = null
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? []
  for (const [index, raw] of lines.entries()) {
    const line = raw.replace(/\r?\n$/, '')
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence) {
      markdown += raw
      if (delimiter?.[1]?.[0] === fence.character && delimiter[1].length >= fence.length && !delimiter[2]?.trim()) fence = null
      continue
    }
    if (delimiter?.[1]) {
      fence = { character: delimiter[1][0] ?? '`', length: delimiter[1].length }
      markdown += raw
      continue
    }
    const found = reference(line)
    if (found) {
      if (markdown) parts.push({ kind: 'markdown', text: markdown })
      parts.push({ kind: 'visualization', reference: found })
      markdown = ''
      continue
    }
    const tail = line.trimStart()
    if (streaming && index === lines.length - 1 && (tail.startsWith('\uE200visualize\uE202') && !tail.endsWith('\uE201') || tail.length > 0 && '\uE200visualize\uE202'.startsWith(tail) || tail.startsWith('::codex-inline-vis') && !tail.endsWith('}'))) continue
    markdown += raw
  }
  if (markdown) parts.push({ kind: 'markdown', text: markdown })
  return parts
}
