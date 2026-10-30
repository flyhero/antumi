import { ALL_TABS, focusBrowserConversation, focusBrowserTab, useBrowserTabs } from './browser-state'
import { dockPanelWindow, hidePanelWindow, onPanelCommand, onPanelRequestClose, sendPanelQuote } from './desktop-bridge'
import { exportFileTabs, fileScopeKey, importFileTabs, revealedFolder, updateFileTabs } from './file-tabs'
import { showResolvedFile } from './file-actions'
import { showFilesPanel, useCore } from './core-store'
import { FilesSnapshot, PanelCommand, panelKindFromHash, type PanelHandoff, type PanelKind } from '../../shared/panel-window'
import { panelContext } from './panel-window-context'

export function thisPanelKind(): PanelKind | null {
  return panelKindFromHash(location.hash)
}

function filesSnapshot(): PanelHandoff['files'] {
  return FilesSnapshot.parse({ ...exportFileTabs(), filesFolders: useCore.getState().filesFolders })
}

function handoff(): PanelHandoff {
  const kind = thisPanelKind()
  return {
    context: panelContext(useCore.getState()),
    files: kind === 'files' ? filesSnapshot() : null,
    terminalId: kind === 'terminal' ? useCore.getState().activeTerminalId : null,
    browserTabId: kind === 'browser' ? useBrowserTabs.getState()[ALL_TABS]?.selectedId ?? null : null
  }
}

// The panel window asking to sit in the dock again, with the tabs and selection it holds.
export function dockThisPanel(): void {
  const kind = thisPanelKind()
  if (!kind) return
  dockPanelWindow({ docked: kind, ...handoff() })
}

export function hideThisPanel(): void {
  hidePanelWindow(handoff())
}

function focusAddress(): void {
  const focus = (tries: number) => {
    const bar = document.querySelector<HTMLInputElement>('.browser-url')
    if (bar) bar.focus()
    else if (tries > 0) setTimeout(() => focus(tries - 1), 50)
  }
  focus(20)
}

function apply(command: PanelCommand): void {
  if (command.type === 'context') {
    useCore.setState({
      section: command.section,
      selectedConversationId: command.selectedConversationId,
      selectedId: command.selectedId,
      selectedDiscussionId: command.selectedDiscussionId,
      settingsOpen: command.settingsOpen,
      overviewOpen: command.overviewOpen,
      inboxOpen: command.inboxOpen,
      gitOpen: command.gitOpen,
      worktreesOpen: command.worktreesOpen,
      routinesOpen: command.routinesOpen
    })
    return
  }
  if (command.type === 'focus-address') {
    focusAddress()
    return
  }
  if (command.type === 'focus-conversation') {
    focusBrowserConversation(command.conversationId)
    return
  }
  if (command.type === 'focus-tab') {
    focusBrowserTab(command.tabId)
    return
  }
  if (command.type === 'select-terminal') {
    useCore.setState({ activeTerminalId: command.id })
    return
  }
  if (command.type === 'show-files') {
    showFilesPanel(command.scope)
    return
  }
  if (command.type === 'open-file') {
    showResolvedFile(command.scope, command.file, command.line)
    return
  }
  if (command.type === 'reveal-folder') {
    updateFileTabs(fileScopeKey(command.scope), (state) => revealedFolder({ ...state, tree: true }, command.scope.roots, command.folder))
    showFilesPanel(command.scope)
    return
  }
  importFileTabs(command.snapshot)
  useCore.setState({ filesFolders: command.snapshot.filesFolders })
}

// Commands from the main window. Registered before the first paint, so the opening snapshot is not missed.
export function startPanelWindowPage(): void {
  if (!thisPanelKind()) return
  document.documentElement.dataset.window = 'panel'
  onPanelCommand((raw) => {
    const parsed = PanelCommand.safeParse(raw)
    if (parsed.success) apply(parsed.data)
  })
  onPanelRequestClose(() => hideThisPanel())
}

export function quoteFromPanel(conversationId: string, text: string): Promise<boolean> {
  return sendPanelQuote({ conversationId, text })
}
