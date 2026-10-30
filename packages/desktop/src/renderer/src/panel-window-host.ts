import { z } from 'zod'
import { ShortcutAction } from '../../shared/keyboard-shortcuts'
import { FilesSnapshot, PanelWindowsMessage, panelKindFromHash, type PanelCommand, type PanelDelivery, type PanelKind } from '../../shared/panel-window'
import { focusBrowserTab, useBrowserTabs, ALL_TABS } from './browser-state'
import { addQuote } from './chat-quotes'
import { focusPanelWindow, onPanelShortcut, onPanelWindows, openPanelWindow, panelHostReady, panelReceipt, sendPanelCommand } from './desktop-bridge'
import { exportFileTabs, importFileTabs } from './file-tabs'
import { runForwardedShortcut } from './panel-shortcuts'
import { hiddenUtilityPanel, shownUtilityPanel, showError, useCore, type CoreState } from './core-store'
import { panelContext } from './panel-window-context'
import { insertBrowserContext } from './browser-context'
import { t } from './i18n'

function isOpen(state: CoreState, kind: PanelKind): boolean {
  if (kind === 'browser') return state.browserPanelOpen
  if (kind === 'files') return state.filesPanelOpen
  return state.terminalPanelOpen
}

function selectionContext(state: CoreState): PanelCommand {
  return { type: 'context', ...panelContext(state) }
}

function filesSnapshot(): z.infer<typeof FilesSnapshot> {
  return FilesSnapshot.parse({ ...exportFileTabs(), filesFolders: useCore.getState().filesFolders })
}

function commandsFor(kind: PanelKind): PanelCommand[] {
  const state = useCore.getState()
  const commands: PanelCommand[] = [selectionContext(state)]
  if (kind === 'files') commands.push({ type: 'files-state', snapshot: filesSnapshot() })
  if (kind === 'terminal') commands.push({ type: 'select-terminal', id: state.activeTerminalId })
  if (kind === 'browser') {
    const tabId = useBrowserTabs.getState()[ALL_TABS]?.selectedId
    if (tabId) commands.push({ type: 'focus-tab', tabId })
  }
  return commands
}

// Moves a docked panel into a window. Asking again brings that window forward.
export async function detachPanel(kind: PanelKind): Promise<void> {
  if (useCore.getState().panelWindows.includes(kind)) {
    focusPanelWindow(kind)
    return
  }
  const commands = commandsFor(kind)
  useCore.setState((state) => ({
    ...hiddenUtilityPanel(state, kind),
    panelWindows: state.panelWindows.includes(kind) ? state.panelWindows : [...state.panelWindows, kind]
  }))
  try {
    if (await openPanelWindow(kind, commands)) return
    throw new Error(t('PanelWindow.openFailed'))
  } catch (error) {
    useCore.setState((state) => ({ panelWindows: state.panelWindows.filter((each) => each !== kind), ...shownUtilityPanel(state, kind) }))
    showError(error instanceof Error ? error.message : String(error))
  }
}

function applyPanelWindows(message: PanelWindowsMessage): void {
  useCore.setState((state) => {
    let next: CoreState = { ...state, panelWindows: message.open }
    for (const kind of message.open) {
      if (isOpen(next, kind)) next = { ...next, ...hiddenUtilityPanel(next, kind) }
    }
    return next
  })
}

function applyDelivery(action: PanelDelivery['action']): boolean {
  if (action.type === 'quote') return addQuote(action.conversationId, null, action.text) !== null
  if (action.type === 'browser-context') return insertBrowserContext(action.tab, action.text, action.images)
  const { handoff, kind, docked } = action
  if (handoff.files) importFileTabs(handoff.files)
  useCore.setState((state) => {
    const next = {
      ...state,
      ...(docked ? handoff.context : {}),
      ...(handoff.files ? { filesFolders: handoff.files.filesFolders } : {}),
      ...(kind === 'terminal' ? { activeTerminalId: handoff.terminalId } : {})
    }
    return docked && !state.panelWindows.includes(kind) ? { ...next, ...shownUtilityPanel(next, kind) } : next
  })
  if (handoff.browserTabId) focusBrowserTab(handoff.browserTabId)
  return true
}

const Forwarded = z.object({ action: ShortcutAction, addressFocused: z.boolean() })

// The main window's half: which panels are out, and the selection those windows follow.
export function startPanelWindowHost(): () => void {
  if (panelKindFromHash(location.hash)) return () => {}
  const pending = new Map<number, PanelDelivery>()
  const received = new Map<number, boolean>()
  let draining = false
  const drain = () => {
    if (draining) return
    draining = true
    try {
      for (const [id, delivery] of pending) {
        if (delivery.action.type !== 'handoff' && useCore.getState().connection !== 'connected') break
        pending.delete(id)
        let accepted = false
        try { accepted = applyDelivery(delivery.action) } catch (error) { showError(error instanceof Error ? error.message : String(error)) }
        received.set(id, accepted)
        panelReceipt(id, accepted)
      }
    } finally { draining = false }
  }
  const offWindows = onPanelWindows((raw) => {
    const parsed = PanelWindowsMessage.safeParse(raw)
    if (!parsed.success) return
    applyPanelWindows(parsed.data)
    for (const delivery of parsed.data.deliveries) {
      const accepted = received.get(delivery.id)
      if (accepted !== undefined) panelReceipt(delivery.id, accepted)
      else pending.set(delivery.id, delivery)
    }
    drain()
  })
  const offShortcuts = onPanelShortcut((raw) => {
    const parsed = Forwarded.safeParse(raw)
    if (parsed.success) runForwardedShortcut(parsed.data.action, parsed.data.addressFocused)
  })
  let last = ''
  const offCore = useCore.subscribe(() => {
    drain()
    const state = useCore.getState()
    const watching = state.panelWindows
    if (watching.length === 0) return
    const command = selectionContext(state)
    const key = JSON.stringify(command)
    if (key === last) return
    last = key
    for (const kind of watching) sendPanelCommand(kind, command)
  })
  panelHostReady()
  return () => { offWindows(); offShortcuts(); offCore() }
}
