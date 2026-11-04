import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AgentProfile, type Conversation } from '@antumi/protocol'
import { ConversationMark, ConversationStatus } from './ConversationStatus'

const conversation: Conversation = {
  id: '11111111-1111-4111-8111-111111111111', title: 't', titleLocked: false, agent: 'claude', workspacePath: '/w',
  projectPaths: [], managedWorkspace: true, sessionId: null, createdAt: 0, updatedAt: 0
}
const profile = AgentProfile.parse({ id: '44444444-4444-4444-8444-444444444444', name: '审查员', agent: 'claude', archivedAt: null, createdAt: 0, updatedAt: 0 })
const mark = (patch: Partial<Conversation>) => renderToStaticMarkup(createElement(ConversationMark, { conversation: { ...conversation, ...patch } }))

describe('the status column in the list', () => {
  it('keeps the agent\'s logo for a direct call, whose stand-in profile is saved nowhere', () => {
    expect(mark({ profile })).toMatch(/aria-label="审查员 · [^"]+"[^>]*><svg class="agent-mark agent-mark-claude"/)
  })

  it('keeps the agent logo inside a status ring only when something is going on', () => {
    const idle = mark({})
    expect(idle).toMatch(/^<span class="agent-status-mark" data-glyph="idle" role="img" aria-label="Claude Code · [^"]+"[^>]*><svg class="agent-mark agent-mark-claude"/)
    expect(idle).not.toContain('agent-status-ring')
    for (const [glyph, patch] of [
      ['failed', { lastExit: { code: 1, at: 1 } }],
      ['running', { sessionId: 's', chat: { turn: 'running' } }],
      ['awaiting', { sessionId: 's', chat: { turn: 'awaiting' } }]
    ] as const) {
      const active = mark(patch)
      expect(active).toContain(`data-glyph="${glyph}"`)
      expect(active).toContain('<span class="agent-status-ring" aria-hidden="true"></span>')
    }
  })

  it('keeps the dot in the conversation\'s own header', () => {
    expect(renderToStaticMarkup(createElement(ConversationStatus, { conversation: { ...conversation, profile } }))).toMatch(/^<span class="conversation-status"/)
  })
})
