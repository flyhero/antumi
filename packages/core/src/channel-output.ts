import { MAX_CHANNEL_ANSWER_CHARS, channelPlatform, type ChannelPlatform } from '@antumi/protocol'

// What an agent answered, made fit to post where a stranger reads it: nothing that looks like a
// secret, no path that tells of the machine, nothing the platform would read as a mention or a
// link of its own, and in pieces a message can hold. How long it runs is the agent's instructions'
// to say; here is only the ceiling (MAX_CHANNEL_ANSWER_CHARS).

const HIDDEN = '[已隐藏]'
const SECRETS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\bxox[abeoprs]-[A-Za-z0-9-]{10,}/g,
  /\bxapp-[A-Za-z0-9-]{10,}/g,
  /\bsk-[A-Za-z0-9_-]{20,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bAIza[A-Za-z0-9_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g
]

const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// also: values to hide wherever they appear, such as the account the agent runs on.
export function redact(text: string, also: readonly string[] = []): { text: string; redacted: boolean } {
  let out = text
  for (const pattern of SECRETS) out = out.replace(pattern, HIDDEN)
  for (const value of also) if (value.length >= 4) out = out.replace(new RegExp(literal(value), 'gi'), HIDDEN)
  return { text: out, redacted: out !== text }
}

// A project's folder becomes its name and the home folder ~, so an answer does not say where
// things are on the machine. roots: each project's path and the name the agent knows it by.
export function withoutMachinePaths(text: string, home: string, roots: readonly { name: string; root: string }[]): string {
  let out = text
  for (const { name, root } of [...roots].sort((a, b) => b.root.length - a.root.length)) out = out.replaceAll(root, name)
  return home.length > 1 ? out.replaceAll(home, '~') : out
}

const escapeSlack = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

// Markdown outside code, as Slack writes it. The text is already escaped, so nothing in it is a
// mention or a link until one is made here, and only for an http(s) address.
function slackInline(text: string): string {
  return text
    .replace(/!?\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_all, label: string, url: string) => (/^https?:\/\//i.test(url) ? `<${url.replaceAll('|', '%7C')}|${label}>` : `${label} (${url})`))
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/__([^_\n]+)__/g, '*$1*')
    .replace(/~~([^~\n]+)~~/g, '~$1~')
}

const TABLE_ROW = /^\s*\|.*\|\s*$/

export function toSlack(markdown: string): string {
  const out: string[] = []
  let fenced = false
  let table: string[] = []
  const flush = () => {
    if (table.length) out.push('```', ...table, '```')
    table = []
  }
  for (const raw of escapeSlack(markdown).split('\n')) {
    if (/^\s*```/.test(raw)) {
      flush()
      fenced = !fenced
      out.push('```')
      continue
    }
    if (fenced) {
      out.push(raw)
      continue
    }
    // A table has no form in Slack: kept as typed, in a block that lines its columns up.
    if (TABLE_ROW.test(raw)) {
      table.push(raw.trim())
      continue
    }
    flush()
    const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(raw)
    if (heading) {
      out.push(`*${slackInline(heading[1] ?? '').replaceAll('*', '')}*`)
      continue
    }
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(raw)
    // Inline code is left as typed; the rest of the line is converted around it.
    const convert = (line: string) => line.split(/(`[^`\n]*`)/).map((part, index) => (index % 2 ? part : slackInline(part))).join('')
    out.push(bullet ? `${bullet[1]}• ${convert(bullet[2] ?? '')}` : convert(raw))
  }
  if (fenced) out.push('```')
  flush()
  return out.join('\n')
}

// Markdown outside code, as Feishu's md tag reads it: a link or picture only to an http(s) address,
// and no tag, so <at user_id="all"> mentions nobody. Autolinks (<https://…>) stay.
function feishuInline(text: string): string {
  return text
    .replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (_all, label: string, url: string) => (/^https?:\/\//i.test(url) ? `[${label || url}](${url})` : label))
    .replace(/(?<!!)\[([^\]\n]+)\]\(([^)\s]+)\)/g, (all, label: string, url: string) => (/^https?:\/\//i.test(url) ? all : `${label} (${url})`))
    .replace(/<(?=\/?[a-z])(?!https?:\/\/)/gi, '<​')
}

// Feishu's md tag has headings, lists, quotes and tables of its own, so the Markdown mostly stays.
export function toFeishu(markdown: string): string {
  const out: string[] = []
  let fenced = false
  let inTable = false
  for (const raw of markdown.split('\n')) {
    if (/^\s*```/.test(raw)) {
      fenced = !fenced
      out.push(raw)
      continue
    }
    if (fenced) {
      out.push(raw)
      continue
    }
    // A table it draws only with a blank line on either side.
    const row = TABLE_ROW.test(raw)
    if (row !== inTable && raw.trim() !== '' && out.length > 0 && out.at(-1)?.trim() !== '') out.push('')
    inTable = row
    out.push(raw.split(/(`[^`\n]*`)/).map((part, index) => (index % 2 ? part : feishuInline(part))).join(''))
  }
  if (fenced) out.push('```')
  return out.join('\n')
}

// Markdown outside code, as DingTalk's subset reads it: no strikethrough, a link only to an
// http(s) address, and a picture as a link, so an answer loads nothing from anywhere by itself.
function dingtalkInline(text: string): string {
  return text
    .replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, (_all, label: string, url: string) => (/^https?:\/\//i.test(url) ? `[${label || url}](${url})` : label))
    .replace(/(?<!!)\[([^\]\n]+)\]\(([^)\s]+)\)/g, (all, label: string, url: string) => (/^https?:\/\//i.test(url) ? all : `${label} (${url})`))
    .replace(/~~([^~\n]+)~~/g, '$1')
}

// DingTalk's Markdown has headings, quotes, emphasis, links and lists, but no code block or table:
// code is kept as a quote, line for line, and a table as its rows without the rule under the header.
export function toDingtalk(markdown: string): string {
  const out: string[] = []
  let fenced = false
  for (const raw of markdown.split('\n')) {
    if (/^\s*```/.test(raw)) {
      fenced = !fenced
      continue
    }
    if (fenced) {
      out.push(raw.trim() ? `> ${raw}` : '>')
      continue
    }
    if (TABLE_ROW.test(raw)) {
      if (/^\s*\|[\s|:-]+\|\s*$/.test(raw)) continue
      out.push(dingtalkInline(raw.trim().replace(/^\|\s*|\s*\|$/g, '').split(/\s*\|\s*/).join(' · ')))
      continue
    }
    out.push(raw.split(/(`[^`\n]*`)/).map((part, index) => (index % 2 ? part : dingtalkInline(part))).join(''))
  }
  return out.join('\n')
}

// As the platform writes text: its escaping and its marks for bold, links and code.
const FORMATTERS = { slack: toSlack, feishu: toFeishu, lark: toFeishu, dingtalk: toDingtalk, wecom: (text) => toFeishu(text)
  .replace(/@(all|everyone)\b/gi, '@\u200b$1')
  .replace(/<@/g, '<\u200b@') } satisfies Record<ChannelPlatform, (markdown: string) => string>

// In pieces of at most limit, cut between paragraphs, else lines, else anywhere; a code block cut
// in two is closed in one piece and opened again in the next.
export function inPieces(text: string, limit: number, bytes = false): string[] {
  const length = (value: string) => bytes ? Buffer.byteLength(value) : value.length
  const pieces: string[] = []
  let rest = text
  const room = Math.max(limit - 8, 1)
  while (length(rest) > limit) {
    let end = Math.min(room, rest.length)
    while (bytes && length(rest.slice(0, end)) > room) end -= 1
    if (end > 0 && /[\uD800-\uDBFF]/.test(rest[end - 1] ?? '')) end -= 1
    const window = rest.slice(0, end)
    const cut = [window.lastIndexOf('\n\n'), window.lastIndexOf('\n')].find((at) => at > end / 2) ?? Math.max(1, end)
    let piece = rest.slice(0, cut)
    rest = rest.slice(cut).replace(/^\n+/, '')
    if ((piece.match(/```/g) ?? []).length % 2 === 1) {
      piece += '\n```'
      rest = `\`\`\`\n${rest}`
    }
    pieces.push(piece)
  }
  if (rest.trim()) pieces.push(rest)
  return pieces
}

export const TOO_LONG = '\n\n（回答过长，已截断）'

// An agent's answer as the messages to post for it.
export function channelMessages(platform: ChannelPlatform, answer: string, context: { home: string; roots: readonly { name: string; root: string }[]; hide: readonly string[] }): { messages: string[]; redacted: boolean } {
  const cut = answer.length > MAX_CHANNEL_ANSWER_CHARS ? answer.slice(0, MAX_CHANNEL_ANSWER_CHARS).replace(/[\uD800-\uDBFF]$/, '') + TOO_LONG : answer
  const safe = redact(withoutMachinePaths(cut, context.home, context.roots), context.hide)
  return { messages: inPieces(FORMATTERS[platform](safe.text), channelPlatform(platform).textLimit, channelPlatform(platform).textBytes), redacted: safe.redacted }
}

// A sentence of core's own (a refusal, a failure), which needs no more than escaping.
export function channelNotice(platform: ChannelPlatform, text: string): string {
  return FORMATTERS[platform](text)
}
