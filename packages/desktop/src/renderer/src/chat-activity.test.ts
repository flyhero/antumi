import { describe, expect, it } from 'vitest'
import { CODEX_IMAGE_GENERATION, type ChatItem } from '@antumi/protocol'
import { activityOf } from './chat-activity'
import type { ChatBlock } from './chat-state'

const tool = (name: string, title: string): ChatItem =>
  ({ stageId: 's', revision: 1, at: 0, id: title, kind: 'tool', name, title, input: null, status: 'done', output: null, diffs: [] })
const block = (item: ChatItem): ChatBlock => ({ kind: 'entry', key: item.id, entry: { kind: 'item', item } })

describe('activityOf', () => {
  it('puts a picture the agent looked at on the rail, and keeps what it made for the user off it', () => {
    expect(activityOf(block(tool('Read', '/tmp/before.png')))).toMatchObject({ kind: 'tool', status: 'done' })
    expect(activityOf(block(tool(CODEX_IMAGE_GENERATION, '/tmp/drawn.png')))).toBeNull()
    expect(activityOf(block(tool('mcp__antumi__show_preview', '/tmp/page.html')))).toBeNull()
  })
})
