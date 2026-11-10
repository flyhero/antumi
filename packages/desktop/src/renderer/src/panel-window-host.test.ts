import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BrowserTab, Conversation } from '@antumi/protocol'
import { type PanelDelivery, type PanelWindowsMessage } from '../../shared/panel-window'
import { takeComposerInsertions } from './composer-insertions'
import { useCore } from './core-store'
import { exportFileTabs, fileDraft, importFileTabs } from './file-tabs'
import { panelContext } from './panel-window-context'
import { addQuote, setQuotes } from './chat-quotes'
import { detachPanel, startPanelWindowHost } from './panel-window-host'

vi.mock('./helper-conversations', () => ({ focusChatInput: vi.fn() }))
vi.mock('./chat-quotes', async (original) => {
  const actual = await original<typeof import('./chat-quotes')>()
  return { ...actual, addQuote: vi.fn(actual.addQuote) }
})

const conversation = Conversation.parse({ id: '11111111-1111-4111-8111-111111111111', title: 'Project', titleLocked: false, agent: 'claude', workspacePath: '/project', managedWorkspace: false, sessionId: null, projectPaths: ['/project'], createdAt: 1, updatedAt: 1 })
const tab = BrowserTab.parse({ id: '55555555-5555-4555-8555-555555555555', conversationId: conversation.id, userOwned: false, url: 'http://localhost/', title: 'Page', loading: false, active: true, createdAt: 1 })
let receive: ((message: unknown) => void) | undefined
let stop = () => {}
const receipt = vi.fn()
const ready = vi.fn()

function emit(deliveries: PanelDelivery[], open: PanelWindowsMessage['open'] = []): void {
  if (!receive) throw new Error('Host has not subscribed')
  receive({ open, deliveries })
}

beforeEach(() => {
  useCore.setState(useCore.getInitialState(), true)
  importFileTabs({ tabs: {}, drafts: [] })
  takeComposerInsertions(conversation.id)
  takeComposerInsertions(null)
  receipt.mockClear()
  ready.mockClear()
  vi.mocked(addQuote).mockClear()
  setQuotes(conversation.id, [])
  vi.stubGlobal('location', { hash: '' })
  vi.stubGlobal('window', { antumi: {
    onPanelWindows: (listener: (message: unknown) => void) => { receive = listener; return () => { receive = undefined } },
    panelHostReady: ready,
    panelReceipt: receipt
  } })
})

afterEach(() => { stop(); stop = () => {}; vi.unstubAllGlobals() })

it('delivers a file selection with its comment once, while accepting older quotes without comments', () => {
  useCore.setState({ connection: 'connected', conversations: { [conversation.id]: conversation } })
  stop = startPanelWindowHost()
  const delivery: PanelDelivery = { id: 1, action: { type: 'quote', conversationId: conversation.id, text: '/project/a.ts:2\nconst x = 1', note: 'Rename x' } }
  emit([delivery])
  emit([delivery])
  expect(addQuote).toHaveBeenCalledExactlyOnceWith(conversation.id, null, '/project/a.ts:2\nconst x = 1', 'Rename x')
  emit([{ id: 2, action: { type: 'quote', conversationId: conversation.id, text: 'terminal output' } }])
  expect(addQuote).toHaveBeenLastCalledWith(conversation.id, null, 'terminal output', undefined)
  expect(receipt).toHaveBeenLastCalledWith({ id: 2, accepted: true })
})

it('subscribes before requesting retained deliveries and adds browser text and images exactly once', () => {
  ready.mockImplementationOnce(() => expect(receive).toBeTypeOf('function'))
  useCore.setState({ connection: 'connected', conversations: { [conversation.id]: conversation } })
  stop = startPanelWindowHost()
  const images = [{ id: `${'a'.repeat(64)}.jpg`, width: 100, height: 60 }]
  const delivery: PanelDelivery = { id: 1, action: { type: 'browser-context', tab, text: 'Selected element', images } }
  emit([delivery], ['browser'])
  emit([delivery], ['browser'])
  expect(takeComposerInsertions(conversation.id)).toEqual([{ text: 'Selected element', images }])
  expect(receipt.mock.calls).toEqual([[{ id: 1, accepted: true }], [{ id: 1, accepted: true }]])
})

it('waits for conversations to load before resolving a browser context target', () => {
  stop = startPanelWindowHost()
  emit([{ id: 1, action: { type: 'browser-context', tab, text: 'Feedback', images: [] } }])
  expect(receipt).not.toHaveBeenCalled()
  useCore.setState({ connection: 'connected', conversations: { [conversation.id]: conversation } })
  expect(takeComposerInsertions(conversation.id)).toEqual([{ text: 'Feedback', images: [] }])
  expect(takeComposerInsertions(null)).toEqual([])
  expect(receipt).toHaveBeenCalledWith({ id: 1, accepted: true })
})

it('restores files and selection when docking into a newly created main window', () => {
  stop = startPanelWindowHost()
  emit([{ id: 1, action: {
    type: 'handoff', kind: 'files', docked: true,
    handoff: {
      context: { ...panelContext(useCore.getState()), section: 'conversations', selectedConversationId: conversation.id, overviewOpen: false },
      files: { tabs: {}, drafts: [{ id: '/project', path: '/project/a.ts', text: 'unsaved', base: 'disk', mtimeMs: 1 }], filesFolders: null },
      terminalId: null, browserTabId: null
    }
  } }])
  expect(fileDraft('/project', '/project/a.ts')?.text).toBe('unsaved')
  expect(useCore.getState()).toMatchObject({ filesPanelOpen: true, section: 'conversations', selectedConversationId: conversation.id, overviewOpen: false })
  expect(receipt).toHaveBeenCalledWith({ id: 1, accepted: true })
})

it('restores the docked panel and its files when creating the native window fails', async () => {
  vi.stubGlobal('window', { antumi: { openPanelWindow: vi.fn().mockRejectedValue(new Error('Window creation failed')) } })
  useCore.setState({ filesPanelOpen: true, utilityPanelOrder: ['files'] })
  const before = exportFileTabs()
  await detachPanel('files')
  expect(useCore.getState()).toMatchObject({ filesPanelOpen: true, panelWindows: [], error: 'Window creation failed' })
  expect(exportFileTabs()).toEqual(before)
})

it('moves the selected Git checkout into its window', async () => {
  const open = vi.fn().mockResolvedValue(true)
  vi.stubGlobal('window', { antumi: { openPanelWindow: open } })
  const gitLocation = { project: '/project', workspace: '/project/feature' }
  useCore.setState({ gitPanelOpen: true, gitMaximized: true, utilityPanelOrder: ['git'], gitLocation })
  await detachPanel('git')
  expect(open).toHaveBeenCalledWith('git', [{ type: 'context', ...panelContext(useCore.getState()) }, { type: 'show-git', location: gitLocation }])
  expect(useCore.getState()).toMatchObject({ gitPanelOpen: false, gitMaximized: false, panelWindows: ['git'], utilityPanelOrder: [] })
})

it.each([true, false])('retains the Git checkout when its window returns with docked=%s', (docked) => {
  stop = startPanelWindowHost()
  const gitLocation = { project: '/other', workspace: '/other/worktree' }
  emit([{ id: 1, action: { type: 'handoff', kind: 'git', docked, handoff: {
    context: panelContext(useCore.getState()), gitLocation, files: null, terminalId: null, browserTabId: null
  } } }])
  expect(useCore.getState()).toMatchObject({ gitPanelOpen: docked, gitLocation, utilityPanelOrder: docked ? ['git'] : [] })
})

it('restores Git and its checkout if the native window cannot open', async () => {
  vi.stubGlobal('window', { antumi: { openPanelWindow: vi.fn().mockRejectedValue(new Error('Window creation failed')) } })
  const gitLocation = { project: '/project', workspace: '/project/feature' }
  useCore.setState({ gitPanelOpen: true, utilityPanelOrder: ['git'], gitLocation })
  await detachPanel('git')
  expect(useCore.getState()).toMatchObject({ gitPanelOpen: true, gitLocation, panelWindows: [], utilityPanelOrder: ['git'], error: 'Window creation failed' })
})

it('opens a conflict investigation handed back by the Git window', () => {
  stop = startPanelWindowHost()
  emit([{ id: 1, action: { type: 'handoff', kind: 'git', docked: true, handoff: {
    context: panelContext(useCore.getState()), files: null, terminalId: null, browserTabId: null,
    gitNavigation: { type: 'conversation-draft', project: '/project/feature', text: 'Resolve this merge' }
  } } }])
  expect(useCore.getState()).toMatchObject({
    gitPanelOpen: true, conversationDraft: true, overviewOpen: false,
    conversationDraftProjects: { paths: ['/project/feature'] },
    conversationDraftCarry: { text: 'Resolve this merge', projects: ['/project/feature'] }
  })
})

it('shows a conflict terminal handed back by the Git window alongside Git', () => {
  stop = startPanelWindowHost()
  emit([{ id: 1, action: { type: 'handoff', kind: 'git', docked: true, handoff: {
    context: panelContext(useCore.getState()), files: null, terminalId: null, browserTabId: null,
    gitNavigation: { type: 'terminal', id: 'conflict-terminal' }
  } } }])
  expect(useCore.getState()).toMatchObject({ gitPanelOpen: true, terminalPanelOpen: true, activeTerminalId: 'conflict-terminal', utilityPanelOrder: ['git', 'terminal'] })
})
