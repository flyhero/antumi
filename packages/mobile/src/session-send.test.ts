import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ AppState: {}, Platform: { OS: 'android' } }))
vi.mock('expo-application', () => ({}))
vi.mock('expo-device', () => ({}))
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }))
vi.mock('./storage', () => ({ saveSettings: vi.fn() }))

import { setDraft, submitDraft, restoreDelivery, useSession, rememberProvider } from './session'

beforeEach(() => useSession.setState({ drafts: {}, deliveries: {}, chats: {}, conversations: {} }))

describe('submitting a phone draft', () => {
  it('immediately clears the input, preserves images and does not clear newly typed text on failure', async () => {
    setDraft('chat', () => ({ text: 'hello', images: [{ id: 'image', width: 10, height: 20 }] }))
    submitDraft('chat')
    expect(useSession.getState().drafts.chat).toBeUndefined()
    expect(useSession.getState().deliveries.chat).toMatchObject([{ text: 'hello', phase: 'sending', images: [{ id: 'image' }] }])
    setDraft('chat', () => ({ text: 'next message', images: [] }))
    await vi.waitFor(() => expect(useSession.getState().deliveries.chat?.[0]?.phase).toBe('failed'))
    expect(useSession.getState().drafts.chat?.text).toBe('next message')
  })

  it('restores a failed message without overwriting the current draft or duplicating attachments', async () => {
    const image = { id: 'image', width: 10, height: 20 }
    setDraft('chat', () => ({ text: 'hello', images: [image] }))
    submitDraft('chat')
    await vi.waitFor(() => expect(useSession.getState().deliveries.chat?.[0]?.phase).toBe('failed'))
    setDraft('chat', () => ({ text: 'new text', images: [image] }))
    restoreDelivery('chat', useSession.getState().deliveries.chat![0]!.ref)
    expect(useSession.getState().drafts.chat).toEqual({ text: 'new text\nhello', images: [image] })
    expect(useSession.getState().deliveries.chat).toEqual([])
  })

  it('ignores repeated submits after the draft was cleared', () => {
    setDraft('chat', () => ({ text: 'hello', images: [] }))
    submitDraft('chat')
    submitDraft('chat')
    expect(useSession.getState().deliveries.chat).toHaveLength(1)
  })
})

describe('phone provider preferences', () => {
  it('keeps defaults separate per computer and retains explicit native configuration', async () => {
    useSession.setState({ current: 'computer-a', settings: { lock: false } })
    await rememberProvider('claude', 'gateway-a')
    useSession.setState({ current: 'computer-b' })
    await rememberProvider('claude', null)
    expect(useSession.getState().settings.defaultProviders).toEqual({
      'computer-a': { claude: 'gateway-a' }, 'computer-b': { claude: null }
    })
  })
})
