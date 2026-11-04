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

  it('holds any other chat\'s agent logo, with how it stands as a badge only when something is going on', () => {
    const idle = mark({})
    expect(idle).toMatch(/^<span class="agent-status-mark" data-glyph="idle" role="img" aria-label="Claude Code · [^"]+"[^>]*><svg class="agent-mark agent-mark-claude"/)
    expect(idle).not.toContain('agent-status-badge')
    expect(mark({ lastExit: { code: 1, at: 1 } })).toMatch(/data-glyph="failed".*<span class="agent-status-badge"><\/span>/)
    expect(mark({ sessionId: 's', chat: { turn: 'running' } })).toMatch(/data-glyph="running".*<span class="agent-status-badge"><span class="chat-spinner"/)
  })

  it('keeps the dot in the conversation\'s own header', () => {
    expect(renderToStaticMarkup(createElement(ConversationStatus, { conversation: { ...conversation, profile } }))).toMatch(/^<span class="conversation-status"/)
  })
})
