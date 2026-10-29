import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserTab, Conversation, Task } from '@antumi/protocol'
import { browserContextText, browserConversationChoices, browserConversationTarget, sendBrowserContextToComposer } from './browser-context'
import { useCore } from './core-store'
import { takeComposerInsertions } from './composer-insertions'

vi.mock('./helper-conversations', () => ({ focusChatInput: vi.fn() }))

const conversation = Conversation.parse({ id: '11111111-1111-4111-8111-111111111111', title: 'Web app', titleLocked: false, agent: 'claude', workspacePath: '/project', managedWorkspace: false, sessionId: null, projectPaths: [], createdAt: 1, updatedAt: 1 })
const tab = BrowserTab.parse({ id: '55555555-5555-4555-8555-555555555555', conversationId: null, userOwned: true, url: 'http://localhost/', title: 'Example', loading: false, active: true, createdAt: 1 })

beforeEach(() => { useCore.setState(useCore.getInitialState(), true); takeComposerInsertions(null); takeComposerInsertions(conversation.id) })

describe('browser feedback in the chat composer', () => {
  it('queues page context and its image without starting a conversation or replacing existing input', () => {
    useCore.setState({ section: 'conversations', selectedConversationId: conversation.id, overviewOpen: false, conversations: { [conversation.id]: conversation } })
    const context = { url: tab.url, title: 'Example', text: 'Selected text', selector: '#buy', html: '<button id="buy">Buy</button>', styles: { display: 'flex' } }
    const text = browserContextText(context, tab.id)
    sendBrowserContextToComposer(tab, text, [{ id: `${'a'.repeat(64)}.jpg`, width: 100, height: 60 }])
    const pending = takeComposerInsertions(conversation.id)
    expect(pending).toHaveLength(1)
    expect(pending[0]?.text).toContain('#buy')
    expect(pending[0]?.text).toContain('display: flex;')
    expect(pending[0]?.images).toHaveLength(1)
    expect(takeComposerInsertions(conversation.id)).toEqual([])
    expect(useCore.getState().conversationDraft).toBe(false)
  })

  it('uses the task conversation even if it is not listed as a free conversation', () => {
    const task = Task.parse({ id: 'task', title: 'Fix checkout', details: '', status: 'running', agent: 'claude', repos: [], dependsOn: [], conversationId: 'task-conversation', createdAt: 1, updatedAt: 1 })
    useCore.setState({ section: 'tasks', overviewOpen: false, selectedId: task.id, tasks: { [task.id]: task } })
    expect(browserConversationTarget(useCore.getState(), tab)).toBe('task-conversation')
    expect(browserConversationChoices(useCore.getState())).toContainEqual({ id: 'task-conversation', title: 'Fix checkout' })
  })

  it('offers context on the new-conversation page when no existing conversation is selected', () => {
    sendBrowserContextToComposer(tab, 'Page feedback')
    expect(useCore.getState().conversationDraft).toBe(true)
    expect(takeComposerInsertions(null)).toEqual([{ text: 'Page feedback', images: [] }])
  })
  it('keeps context in an open new-conversation draft even if the page belongs to another chat', () => {
    useCore.setState({ section: 'conversations', overviewOpen: false, conversationDraft: true, conversations: { [conversation.id]: conversation } })
    sendBrowserContextToComposer({ ...tab, conversationId: conversation.id }, 'Draft feedback')
    expect(takeComposerInsertions(null)).toEqual([{ text: 'Draft feedback', images: [] }])
    expect(takeComposerInsertions(conversation.id)).toEqual([])
  })

})
