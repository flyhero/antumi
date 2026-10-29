import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => vi.stubGlobal('navigator', { platform: 'MacIntel' }))

const { withShortcut } = await import('../../shared/keyboard-shortcuts')

const { sendWayKeys, sendWays } = await import('./chat-send-ways')

describe('ways to send', () => {
  const idle = { working: false, queueable: false, steerable: false, reusable: true }

  it('leads with what the button does: send while idle, stop while the agent works', () => {
    expect(sendWays(idle)).toEqual(['send', 'newConversation'])
    expect(sendWays({ ...idle, working: true, queueable: true, steerable: true })).toEqual(['interrupt', 'queue', 'steer', 'newConversation'])
  })

  it('offers only what the agent and the conversation take', () => {
    expect(sendWays({ ...idle, working: true, queueable: true })).toEqual(['interrupt', 'queue', 'newConversation'])
    // An older core takes nothing between turns, so there is nothing to steer either.
    expect(sendWays({ ...idle, working: true, steerable: true })).toEqual(['interrupt', 'newConversation'])
    expect(sendWays({ ...idle, reusable: false })).toEqual(['send'])
  })

  it('displays saved bindings and omits disabled shortcuts', () => {
    const settings = withShortcut({ version: 1 }, 'darwin', 'send-message', { key: 'F6', ctrl: false, meta: false, alt: false, shift: false })
    expect(sendWayKeys('send', settings)).toEqual(['F6'])
    expect(sendWayKeys('queue', settings)).toEqual(['F6'])
    expect(sendWayKeys('interrupt', withShortcut(settings, 'darwin', 'interrupt-turn', null))).toEqual([])
  })

  it('names the keys the composer reads', () => {
    expect(sendWayKeys('send')).toEqual(['↩'])
    expect(sendWayKeys('steer')).toEqual(['⌘', '↩'])
    expect(sendWayKeys('newConversation')).toEqual(['⌘', '⇧', '↩'])
    expect(sendWayKeys('interrupt')).toEqual(['Esc'])
  })
})
