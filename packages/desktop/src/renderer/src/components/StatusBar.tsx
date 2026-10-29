import { localized, t, tr } from '../i18n'
import { useRef, useState } from 'react'
import { openGuide, setAwakeMode, setSchedulesOpen, setSettingsOpen, setWorktreesOpen, toggleBrowserPanel, toggleFilesPanel, togglePortsPanel, toggleTerminalPanel, useAwakeSupported, useBrowserSupported, useCore, useSchedulesOpen, useSchedulesSupported, useWorktreesSupported, type ConnectionState } from '../core-store'
import { ALL_TABS, useBrowserTabs } from '../browser-state'
import { formatBytes, worktreeRows, worktreeSummary } from '../worktree-groups'
import { useWorktrees } from '../worktree-store'
import { useShortcutLabel } from '../keyboard-shortcuts'
import { usePanelShortcut } from '../panel-shortcuts'
import { BoltIcon, BookIcon, BranchIcon, ChatIcon, CheckIcon, ClockIcon, CoffeeIcon, FolderIcon, GearIcon, GlobeIcon, HelpIcon, PortsIcon, PulseIcon, TerminalIcon } from './icons'
import { usePorts } from '../port-state'
import { UsageBar } from './UsageBar'
import { openRuns } from '../schedules'
import { Popover } from './Popover'
import { UpdateButton } from './UpdateNotice'
import { openSetup } from '../setup-controller'
import { ContextMenu, MenuItem, type MenuPoint } from './ContextMenu'

type ConnectionIssue = Exclude<ConnectionState, 'connected'>

const CONNECTION_LABEL: Record<ConnectionIssue, string> = localized(() => ({
  connecting: t('SettingsPage.connecting'),
  'waiting-for-core': t('SettingsPage.waitingForCoreToStart')
}))

const CONNECTION_HINT: Record<ConnectionIssue, string> = localized(() => ({
  connecting: t('StatusBar.connectingToAntumiCoreReconnectsAutomaticallyAfterDisconnection'),
  'waiting-for-core': t('StatusBar.noRunningAntumiCoreFoundStartPnpmDev')
}))

// Only interruptions need a status-bar indicator; healthy is the default.
function ConnectionStatus() {
  const connection = useCore((s) => s.connection)
  if (connection === 'connected') return null
  return (
    <span
      className="connection"
      data-state={connection}
      role="status"
      title={CONNECTION_HINT[connection]}
      aria-label={CONNECTION_HINT[connection]}
    >
      <span className="connection-dot" aria-hidden="true" />
      <span>{CONNECTION_LABEL[connection]}</span>
    </span>
  )
}

function SettingsButton() {
  const shortcut = useShortcutLabel('open-settings')
  const open = useCore((s) => s.settingsOpen)
  return (
    <button
      type="button"
      className="tool-button statusbar-settings"
      aria-label={t('StatusBar.settings')}
      aria-pressed={open}
      data-tooltip={[t('StatusBar.settings'), shortcut].filter(Boolean).join(' · ')}
      data-tooltip-side="top"
      onClick={() => setSettingsOpen(!open)}
    >
      <GearIcon />
    </button>
  )
}

function HelpButton() {
  const trigger = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<MenuPoint | null>(null)
  const select = (action: () => void) => { setAt(null); action() }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="tool-button statusbar-help"
        aria-label={t('StatusBar.help')}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        data-tooltip={t('StatusBar.help')}
        data-tooltip-side="top"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          setAt(at ? null : { x: box.left, y: box.top })
        }}
      >
        <HelpIcon />
      </button>
      {at && <ContextMenu at={at} above trigger={trigger.current} label={t('StatusBar.help')} onClose={() => setAt(null)}>
        <MenuItem icon={<BookIcon />} label={t('GuideView.guide')} onSelect={() => select(openGuide)} />
        <MenuItem icon={<PulseIcon />} label={t('SetupGuide.title')} onSelect={() => select(openSetup)} />
        <MenuItem icon={<BoltIcon />} label={t('KeyboardShortcuts.title')} onSelect={() => select(() => setSettingsOpen(true, 'keyboard-shortcuts'))} />
        <div className="menu-separator" role="separator" />
        {/* The icon its Settings section shows. */}
        <MenuItem icon={<ChatIcon />} label={t('SupportSettings.title')} onSelect={() => select(() => setSettingsOpen(true, 'support'))} />
      </ContextMenu>}
    </>
  )
}

// The browser panel, on a core that hosts one; keep the latest known tab count visible while the
// panel is closed, as terminals do.
function BrowserButton() {
  const shortcut = usePanelShortcut('toggle-browser')
  const supported = useBrowserSupported()
  const open = useCore((s) => s.browserPanelOpen)
  const count = useBrowserTabs((s) => s[ALL_TABS]?.tabs.length ?? 0)
  if (!supported) return null
  return (
    <button
      type="button"
      className="tool-button statusbar-browser"
      aria-label={t('BrowserSidePanel.browser')}
      aria-pressed={open}
      data-tooltip={[open ? t('BrowserSidePanel.hideBrowser') : t('BrowserSidePanel.browser'), shortcut].filter(Boolean).join(' ')}
      data-tooltip-side="top-end"
      onClick={toggleBrowserPanel}
    >
      <GlobeIcon />
      {count > 0 && <span className="count">{count}</span>}
    </button>
  )
}

function FilesButton() {
  const shortcut = usePanelShortcut('toggle-files')
  const open = useCore((s) => s.filesPanelOpen)
  return (
    <button
      type="button"
      className="tool-button statusbar-files"
      aria-label={t('FilesPanel.files')}
      aria-pressed={open}
      data-tooltip={[open ? t('FilesPanel.hideFiles') : t('FilesPanel.files'), shortcut].filter(Boolean).join(' ')}
      data-tooltip-side="top-end"
      onClick={toggleFilesPanel}
    >
      <FolderIcon />
    </button>
  )
}

function TerminalButton() {
  const shortcut = usePanelShortcut('toggle-terminal')
  const open = useCore((s) => s.terminalPanelOpen)
  const count = useCore((s) => s.terminals.length)
  return (
    <button
      type="button"
      className="tool-button statusbar-terminal"
      aria-label={t('SettingsPage.terminal')}
      aria-pressed={open}
      data-tooltip={[open ? t('TerminalPanel.hideTerminal') : t('SettingsPage.terminal'), shortcut].filter(Boolean).join(' ')}
      data-tooltip-side="top-end"
      onClick={() => void toggleTerminalPanel()}
    >
      <TerminalIcon />
      {count > 0 && <span className="count">{count}</span>}
    </button>
  )
}

function PortsButton() {
  const supported = useCore((s) => s.rpc?.features.includes('ports') ?? false)
  const open = useCore((s) => s.portsPanelOpen)
  const count = usePorts((s) => s.list.ports.length)
  if (!supported) return null
  return <button type="button" className="tool-button statusbar-ports" aria-label={t('PortsPanel.ports')} aria-pressed={open} data-tooltip={open ? t('PortsPanel.hidePorts') : t('StatusBar.manageDevelopmentServicePorts')} data-tooltip-side="top-end" onClick={togglePortsPanel}><PortsIcon />{count > 0 && <span className="count">{count}</span>}</button>
}

const AWAKE_LABEL = localized(() => ({ on: t('SettingsPage.always'), auto: t('SettingsPage.whileAgentsWorkOrSchedulesArePending'), off: t('BackdropPicker.close') } as const))

function AwakeButton() {
  const supported = useAwakeSupported()
  const status = useCore((s) => s.awake)
  const [open, setOpen] = useState(false)
  if (!supported || !status) return null
  const reasons = [
    status.workingAgents > 0 && t('StatusBar.agentsWorking', { value1: status.workingAgents }),
    (status.scheduledRuns ?? 0) > 0 && t('StatusBar.schedulesPending', { value1: status.scheduledRuns })
  ].filter(Boolean).join('，')
  const detail = status.problem ?? (status.active ? t('StatusBar.keepingAwake', { value1: reasons ? ` · ${reasons}` : '' }) : t('StatusBar.keepAwake', { value1: AWAKE_LABEL[status.mode] }))
  return (
    <span className="menu-anchor statusbar-awake-anchor">
      <button
        type="button"
        className="tool-button statusbar-awake"
        aria-label={detail}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-active={status.active}
        data-tooltip={detail}
        data-tooltip-side="top-end"
        onClick={() => setOpen((value) => !value)}
      >
        <CoffeeIcon />
        {status.active && <span className="awake-dot" aria-hidden="true" />}
      </button>
      {open && (
        <Popover label={t('SettingsPage.keepComputerAwake')} onClose={() => setOpen(false)}>
          <div className="menu-label">{t('SettingsPage.keepComputerAwake')}</div>
          {(['on', 'auto', 'off'] as const).map((mode) => (
            <button key={mode} type="button" className="menu-item" onClick={() => { void setAwakeMode(mode); setOpen(false) }}>
              <span>{AWAKE_LABEL[mode]}</span>
              <span className="menu-check">{status.mode === mode && <CheckIcon />}</span>
            </button>
          ))}
          {status.problem && <div className="menu-note">{status.problem}</div>}
        </Popover>
      )}
    </span>
  )
}

// How many worktrees Antumi has laid out and what they take, and how many could go: they are never
// removed of Antumi's own accord, so this is where the user sees them pile up.
function WorktreeButton() {
  const supported = useWorktreesSupported()
  const list = useWorktrees((s) => s.list)
  const tasks = useCore((s) => s.tasks)
  const open = useCore((s) => s.worktreesOpen)
  if (!supported || !list || list.length === 0) return null
  const { count, bytes, cleanable } = worktreeSummary(worktreeRows(list, tasks))
  return (
    <button
      type="button"
      className="tool-button statusbar-worktrees"
      aria-pressed={open}
      data-tooltip={t('StatusBar.manageAntumiWorktrees')}
      data-tooltip-side="top-end"
      onClick={() => setWorktreesOpen(!open)}
    >
      <BranchIcon />
      <span>{tr('StatusBar.worktrees', { count: count, value2: bytes > 0 ? ` · ${formatBytes(bytes)}` : '' })}</span>
      {cleanable > 0 && <span className="statusbar-worktrees-cleanable">{tr('StatusBar.cleanable', { cleanable: cleanable })}</span>}
    </button>
  )
}

// What is scheduled to start later, and whether any of it failed: the way to the page that manages
// them. Shown while there is anything to show there.
function ScheduleButton() {
  const supported = useSchedulesSupported()
  // A routine's runs are the routine's, shown on its own page.
  const runs = useCore((s) => s.schedules).filter((run) => run.target.kind !== 'routine')
  const open = useSchedulesOpen()
  if (!supported || (runs.length === 0 && !open)) return null
  const waiting = openRuns(runs).length
  const failed = runs.filter((run) => run.status === 'failed').length
  return (
    <button
      type="button"
      className="tool-button statusbar-schedules"
      aria-pressed={open}
      data-tooltip={t('StatusBar.manageScheduledTasksAndConversations')}
      data-tooltip-side="top-end"
      onClick={() => setSchedulesOpen(!open)}
    >
      <ClockIcon />
      <span>{waiting > 0 ? t('StatusBar.schedules', { waiting: waiting }) : t('OverviewView.schedules')}</span>
      {failed > 0 && <span className="statusbar-schedules-failed">{tr('StatusBar.failedToStart', { failed: failed })}</span>}
    </button>
  )
}

export function StatusBar() {
  return (
    <footer className="statusbar">
      <SettingsButton />
      <HelpButton />
      <ConnectionStatus />
      <UpdateButton />
      <UsageBar />
      <ScheduleButton />
      <WorktreeButton />
      <FilesButton />
      <BrowserButton />
      <TerminalButton />
      <PortsButton />
      <AwakeButton />
    </footer>
  )
}
