import { AgentsView } from './components/AgentProfiles'
import { t, useLocale } from './i18n'
import { onBrowserShortcut } from './desktop-bridge'
import { useEffect } from 'react'
import { focusSplitPane, selectTask, setFileQuickOpen, setNewTaskOpen, setSettingsOpen, toggleBrowserPanel, toggleFilesPanel, toggleSplit, toggleTerminalPanel, useCore, useSplitPanes } from './core-store'
import { NewTaskDialog } from './components/NewTaskDialog'
import { SettingsPage } from './components/SettingsPage'
import { SourceInboxView } from './components/SourceInboxView'
import { InboxEntry } from './components/InboxEntry'
import { SourceLoginDialog } from './components/SourceLoginDialog'
import { ProjectTrustDialog } from './components/ProjectTrustDialog'
import { TaskDetail } from './components/TaskDetail'
import { TaskBoard } from './components/TaskBoard'
import { SquadsEntry } from './components/Squads'
import { SidebarTasks } from './components/SidebarTasks'
import { TaskChat } from './components/TaskChat'
import { ConversationList } from './components/ConversationList'
import { Sidebar } from './components/Sidebar'
import { ConversationView } from './components/ConversationView'
import { ConversationSplit } from './components/ConversationSplit'
import { ConversationDraft } from './components/ConversationDraft'
import { EnvironmentNotice } from './components/EnvironmentNotice'
import { StatusBar } from './components/StatusBar'
import { hasPrimaryModifier } from './shortcut-keys'
import { UtilityPanelDock } from './components/UtilityPanelDock'
import { FileQuickOpen } from './components/FileQuickOpen'
import { WorktreeManager } from './components/WorktreeManager'
import { RoutinesView } from './components/RoutinesView'
import { RoutinesEntry } from './components/RoutinesEntry'
import { SidebarDiscussions } from './components/SidebarDiscussions'
import { DiscussionView } from './components/DiscussionView'
import { DiscussionDraft } from './components/DiscussionDraft'
import { OverviewEntry } from './components/OverviewEntry'
import { OverviewView } from './components/OverviewView'
import { GuideView } from './components/GuideView'
import { SetupGuide } from './components/SetupGuide'
import { useFirstRunSetup } from './setup-controller'
import { WindowBrand } from './components/WindowBrand'
import { ErrorToast } from './components/ErrorToast'
import { TaskLaunchDialog } from './components/TaskLaunchDialog'
import { usePreferences } from './preferences'
import { usePortPolling } from './port-state'
import { useUpdateFeed } from './update-state'
import { AppPet } from './components/AppPet'

// Esc goes from a task back to the board, unless it is meant for what has the focus:
// typing (the composer interrupts the agent with it), a terminal, or a menu or dialog, which close first.
function leavesTask(event: KeyboardEvent): boolean {
  const s = useCore.getState()
  if (event.defaultPrevented || s.section !== 'tasks' || s.selectedId === null) return false
  if (s.settingsOpen || s.newTaskOpen || s.taskLaunchId || s.worktreesOpen || s.routinesOpen || s.overviewOpen || s.inboxOpen) return false
  const typing = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], .xterm, [role="menu"], dialog')
  return !typing && !document.querySelector('dialog[open]')
}

function inTerminal(event: KeyboardEvent): boolean {
  return event.target instanceof Element && event.target.closest('.xterm') !== null
}

export function App() {
  useLocale((state) => state.locale)
  usePortPolling()
  useUpdateFeed()
  const selectedId = useCore((s) => s.selectedId)
  const section = useCore((s) => s.section)
  const selectedConversationId = useCore((s) => s.selectedConversationId)
  const splitPanes = useSplitPanes()
  const conversationDraft = useCore((s) => s.conversationDraft)
  const conversationDraftFrom = useCore((s) => s.conversationDraftFrom)
  const selectedDiscussionId = useCore((s) => s.selectedDiscussionId)
  const discussionDraft = useCore((s) => s.discussionDraft)
  const discussionDraftFrom = useCore((s) => s.discussionDraftFrom)
  const view = useCore((s) => s.view)
  const error = useCore((s) => s.error)
  const newTaskOpen = useCore((s) => s.newTaskOpen)
  const taskLaunchId = useCore((s) => s.taskLaunchId)
  const settingsOpen = useCore((s) => s.settingsOpen)
  const worktreesOpen = useCore((s) => s.worktreesOpen)
  const routinesOpen = useCore((s) => s.routinesOpen)
  const overviewOpen = useCore((s) => s.overviewOpen)
  const guideOpen = useCore((s) => s.guideOpen)
  useFirstRunSetup()
  const inboxOpen = useCore((s) => s.inboxOpen)
  const loginOpen = useCore((s) => s.login !== null)
  const terminalPanelOpen = useCore((s) => s.terminalPanelOpen)
  const terminalMaximized = useCore((s) => s.terminalMaximized)
  const browserPanelOpen = useCore((s) => s.browserPanelOpen)
  const browserMaximized = useCore((s) => s.browserMaximized)
  const portsPanelOpen = useCore((s) => s.portsPanelOpen)
  const portsMaximized = useCore((s) => s.portsMaximized)
  const filesPanelOpen = useCore((s) => s.filesPanelOpen)
  const filesMaximized = useCore((s) => s.filesMaximized)
  const fileQuickOpen = useCore((s) => s.fileQuickOpen)
  const utilityPanelOrder = useCore((s) => s.utilityPanelOrder)
  const sidebarHidden = usePreferences((s) => s.sidebarHidden)
  const maximizedUtility = browserPanelOpen && browserMaximized
    ? 'browser'
    : terminalPanelOpen && terminalMaximized
      ? 'terminal'
      : portsPanelOpen && portsMaximized
        ? 'ports'
        : filesPanelOpen && filesMaximized
          ? 'files'
          : undefined

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const plain = hasPrimaryModifier(event) && !event.shiftKey && !event.altKey
      if (plain && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setNewTaskOpen(true)
      } else if (plain && event.key.toLowerCase() === 'p' && !inTerminal(event)) {
        // ⌘P as in VS Code; Ctrl+P inside a shell is its own (previous command).
        event.preventDefault()
        if (!useCore.getState().settingsOpen) setFileQuickOpen(true)
      } else if (hasPrimaryModifier(event) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'e') {
        event.preventDefault()
        toggleFilesPanel()
      } else if (plain && event.key === ',') {
        event.preventDefault()
        setSettingsOpen(!useCore.getState().settingsOpen)
      } else if (plain && (event.key === '1' || event.key === '2') && focusSplitPane(event.key === '1' ? 0 : 1)) {
        event.preventDefault()
      } else if (plain && event.key === '\\' && useCore.getState().section === 'conversations' && !useCore.getState().settingsOpen) {
        event.preventDefault()
        toggleSplit()
      } else if (event.key === 'Escape' && useCore.getState().settingsOpen && !useCore.getState().newTaskOpen) {
        setSettingsOpen(false)
      } else if (event.key === 'Escape' && leavesTask(event)) {
        selectTask(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Ctrl+` everywhere, as in VS Code. Caught before the focused terminal sees it, which would
  // otherwise send the shell a NUL.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key === '`') {
        event.preventDefault()
        event.stopPropagation()
        void toggleTerminalPanel()
      } else if (event.ctrlKey && !event.metaKey && !event.altKey && event.shiftKey && event.key === '~') {
        // Ctrl+Shift+` beside it, for the browser panel.
        event.preventDefault()
        event.stopPropagation()
        toggleBrowserPanel()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  // The same shortcuts pressed while a browser tab has the keyboard: the page's view sees them,
  // not this window, so main passes them on.
  useEffect(() => onBrowserShortcut((kind) => {
    if (kind === 'toggle-browser') toggleBrowserPanel()
    else setSettingsOpen(!useCore.getState().settingsOpen)
  }), [])

  // Files dragged anywhere but a drop target are swallowed here rather than opened by the window.
  useEffect(() => {
    const swallow = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes('Files')) {
        event.preventDefault()
      }
    }
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  return (
    <div className="app" data-sidebar-hidden={(sidebarHidden && !settingsOpen) || undefined}>
      <main className="workspace" data-utility-maximized={maximizedUtility}>
        {settingsOpen ? (
          <SettingsPage />
        ) : (
          <>
            <Sidebar hidden={sidebarHidden}>
              <OverviewEntry />
              <InboxEntry />
              <RoutinesEntry />
              <SquadsEntry />
              <EnvironmentNotice />
              <SidebarTasks />
              <SidebarDiscussions />
              <ConversationList />
            </Sidebar>
            {overviewOpen ? (
              guideOpen ? <GuideView /> : <OverviewView />
            ) : inboxOpen ? (
              <SourceInboxView />
            ) : worktreesOpen ? (
              <WorktreeManager />
            ) : routinesOpen ? (
              <RoutinesView />
            ) : section === 'squads' ? (
              <AgentsView />
            ) : section === 'discussions' ? (
              selectedDiscussionId ? <DiscussionView key={selectedDiscussionId} id={selectedDiscussionId} /> :
                discussionDraft ? <DiscussionDraft key={discussionDraftFrom?.discussion.id ?? 'blank'} from={discussionDraftFrom?.discussion ?? null} /> :
                <section className="detail-empty"><div className="detail-empty-body">{t('App.chooseOrCreateAGroupChat')}</div></section>
            ) : section === 'conversations' ? (
              splitPanes && selectedConversationId ? <ConversationSplit panes={splitPanes} active={selectedConversationId} /> :
              selectedConversationId ? <ConversationView key={selectedConversationId} id={selectedConversationId} /> :
                conversationDraft ? <ConversationDraft key={conversationDraftFrom?.key ?? 'blank'} /> :
                <section className="detail-empty"><div className="detail-empty-body">{t('App.chooseOrCreateAConversation')}</div></section>
            ) : selectedId && view === 'chat' ? (
              <TaskChat key={selectedId} taskId={selectedId} />
            ) : selectedId ? (
              <TaskDetail key={selectedId} taskId={selectedId} />
            ) : (
              <TaskBoard />
            )}
          </>
        )}
        {(portsPanelOpen || browserPanelOpen || terminalPanelOpen || filesPanelOpen) && (
          <UtilityPanelDock
            open={{ browser: browserPanelOpen, terminal: terminalPanelOpen, ports: portsPanelOpen, files: filesPanelOpen }}
            maximized={maximizedUtility}
            order={utilityPanelOrder}
          />
        )}
      </main>
      <SetupGuide />
      {/* After the workspace: where drag regions overlap, the later one wins, and the sidebar and
          pane headers under it are drag regions. */}
      {!settingsOpen && !maximizedUtility && <WindowBrand />}
      <StatusBar />
      {fileQuickOpen && <FileQuickOpen />}
      {newTaskOpen && <NewTaskDialog />}
      {taskLaunchId && <TaskLaunchDialog key={taskLaunchId} taskId={taskLaunchId} />}
      {loginOpen && <SourceLoginDialog />}
      <ProjectTrustDialog />
      {error && !newTaskOpen && !taskLaunchId && <ErrorToast message={error} />}
      <AppPet />
    </div>
  )
}
