import { ALLOW_SITE_ALWAYS, BROWSER_HOST_TOOL, PULL_REQUEST_TOOLS, TERMINAL_RUN_TOOL, type ApprovalChoice } from '@antumi/protocol'
import type { ChatRecord } from './chat-driver'
import type { ChatItems } from './chat-items'

export type AntumiAsk = Extract<ChatRecord, { dir: 'ask' }>['ask']
export type AntumiResolution = Extract<ChatRecord, { dir: 'answer' }>['resolution']

// Questions Antumi itself puts to the user mid-chat (the site its browser may open, a command an
// agent wants run in a terminal of its own), shown as
// approvals beside the agent's own. Both drivers hold one, fed from the stage's records, so a
// replayed stage shows them answered as they were.
export class AntumiRequests {
  private readonly open = new Set<string>()

  constructor(private readonly items: ChatItems) {}

  get pending(): number {
    return this.open.size
  }

  apply(record: Extract<ChatRecord, { dir: 'ask' | 'answer' }>): void {
    const id = `a:${record.requestId}`
    if (record.dir === 'ask') {
      this.open.add(record.requestId)
      const { ask } = record
      this.items.put({
        id,
        kind: 'approval',
        requestId: record.requestId,
        tool: ask.kind === 'terminal-run' ? TERMINAL_RUN_TOOL : ask.kind === 'pull-request' ? PULL_REQUEST_TOOLS.create : BROWSER_HOST_TOOL,
        title: ask.kind === 'terminal-run' ? ask.command : ask.kind === 'pull-request' ? ask.title : ask.host,
        detail: ask.kind === 'terminal-run' ? ask.cwd : ask.kind === 'pull-request' ? ask.detail : ask.url,
        toolItemId: null,
        decisions: ['allow', 'allowForSession', 'deny'],
        ...(ask.kind === 'browser-host' ? { choices: siteChoices(ask.host) } : {}),
        resolution: null
      }, record.at)
      return
    }
    const item = this.items.get(id)
    if (item?.kind !== 'approval') return
    this.open.delete(record.requestId)
    this.items.put({ ...item, resolution: record.resolution, ...(record.chosen && item.choices?.some((choice) => choice.id === record.chosen) ? { chosen: record.chosen } : {}) }, record.at)
  }

  // The agent is gone: nothing is left for an answer to reach.
  cancelAll(at: number): void {
    for (const requestId of [...this.open]) this.apply({ dir: 'answer', at, requestId, resolution: 'cancelled' })
  }
}

// A site the browser would open: once, for this conversation, or in every conversation from now on.
function siteChoices(host: string): ApprovalChoice[] {
  return [
    { id: 'allow', decision: 'allow', grants: [] },
    { id: 'allowForSession', decision: 'allowForSession', grants: [{ kind: 'host', values: [host], scope: 'run', behavior: 'allow' }] },
    { id: ALLOW_SITE_ALWAYS, decision: 'allowForSession', grants: [{ kind: 'host', values: [host], scope: 'user', behavior: 'allow' }] },
    { id: 'deny', decision: 'deny', grants: [] }
  ]
}
