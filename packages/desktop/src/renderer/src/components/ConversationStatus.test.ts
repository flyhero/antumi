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
  it('holds a robot for a chat with one of the user\'s agents, in the state its dot would show', () => {
    const idle = mark({ profile })
    expect(idle).toMatch(/^<span class="profile-mark" data-glyph="idle" role="img" aria-label="审查员 · [^"]+"[^>]*><svg/)
    expect(mark({ profile, lastExit: { code: 1, at: 1 } })).toContain('data-glyph="failed"')
  })

  it('keeps the dot for any other chat, and in the conversation\'s own header', () => {
    expect(mark({})).toMatch(/^<span class="conversation-status" data-glyph="idle"/)
    expect(renderToStaticMarkup(createElement(ConversationStatus, { conversation: { ...conversation, profile } }))).toMatch(/^<span class="conversation-status"/)
  })
})
