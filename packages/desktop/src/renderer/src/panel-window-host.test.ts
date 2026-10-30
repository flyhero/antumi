import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BrowserTab, Conversation } from '@antumi/protocol'
import { type PanelDelivery, type PanelWindowsMessage } from '../../shared/panel-window'
import { takeComposerInsertions } from './composer-insertions'
import { useCore } from './core-store'
import { exportFileTabs, fileDraft, importFileTabs } from './file-tabs'
import { panelContext } from './panel-window-context'
import { detachPanel, startPanelWindowHost } from './panel-window-host'

vi.mock('./helper-conversations', () => ({ focusChatInput: vi.fn() }))

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
  vi.stubGlobal('location', { hash: '' })
  vi.stubGlobal('window', { antumi: {
    onPanelWindows: (listener: (message: unknown) => void) => { receive = listener; return () => { receive = undefined } },
    panelHostReady: ready,
    panelReceipt: receipt
  } })
})

afterEach(() => { stop(); stop = () => {}; vi.unstubAllGlobals() })

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
