import { t, tr } from '../i18n'
import { agentLabel } from '../labels'
import { useCallback, useEffect, useState } from 'react'
import type { ListeningPort } from '@antumi/protocol'
import { setPortsMaximized, showTerminal, togglePortsPanel, useCore } from '../core-store'
import { openPort, portGroups, portKey, stopPort, usePorts } from '../port-state'
import { ChatPicker } from './ChatPicker'
import { Popover } from './Popover'
import { AgentIcon, CloseIcon, GlobeIcon, MaximizeIcon, PortsIcon, RestoreIcon, TerminalIcon } from './icons'
import './ports-panel.css'

function PortRow({ port }: { port: ListeningPort }) {
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const browserSupported = useCore((s) => s.rpc?.features.includes('browser') ?? false)
  const connected = useCore((s) => s.connection === 'connected')
  const processName = port.command.split(/[\\/]/).at(-1) ?? port.command
  const terminalExists = useCore((s) => s.terminals.some((each) => each.id === port.terminalId))
  // Stable, as Popover re-binds its outside-click listener whenever onClose changes.
  const closeConfirm = useCallback(() => setConfirm(false), [])
  const stop = async () => {
    setBusy(true)
    try { if (await stopPort(port)) setConfirm(false) } finally { setBusy(false) }
  }
  return (
    <div className="port-row">
      <div className="port-row-title"><span className="port-listening-dot" aria-hidden="true" /><span className="port-number">{port.port}</span><span>{port.label ?? processName}</span><span className="port-state">{t('PortsPanel.listening')}</span></div>
      <div className="port-process" data-tooltip={port.command}>{port.address} · PID {port.pid} · {processName}</div>
      <div className="port-actions">
        {browserSupported && <button type="button" className="link-button" disabled={busy || !connected} onClick={() => void openPort(port)}>{tr('PortsPanel.openPage', { value1: <GlobeIcon /> })}</button>}
        {port.terminalId && <button type="button" className="link-button" disabled={busy || !terminalExists} onClick={() => port.terminalId && showTerminal(port.terminalId)}>{tr('PortsPanel.terminal', { value1: <TerminalIcon /> })}</button>}
        <span className="menu-anchor">
          <button type="button" className="link-button port-stop" aria-haspopup="dialog" aria-expanded={confirm} disabled={busy || !connected || !port.canStop} data-tooltip={!port.canStop ? t('PortsPanel.thisIsAnAgentProcessAndCannotBe') : undefined} onClick={() => setConfirm(!confirm)}>{busy ? t('ConversationChat.stopping') : t('DiscussionView.stop')}</button>
          {confirm && <Popover label={t('PortsPanel.stopServiceOnPort', { value1: port.port })} onClose={closeConfirm} side="above"><div className="port-confirm"><span>{tr('PortsPanel.stop', { value1: port.label ?? t('PortsPanel.service'), value2: port.port })}</span><span className="muted">{t('PortsPanel.theTerminalTabWillBeKept')}</span><div><button type="button" className="button danger small" disabled={busy} onClick={() => void stop()}>{t('PortsPanel.stopService')}</button><button type="button" className="button ghost small" disabled={busy} onClick={closeConfirm}>{t('ChatCommandSettings.cancel')}</button></div></div></Popover>}
        </span>
      </div>
    </div>
  )
}

export function PortsPanel() {
  const { list, loading } = usePorts()
  const tasks = useCore((s) => s.tasks)
  const conversations = useCore((s) => s.conversations)
  const terminals = useCore((s) => s.terminals)
  const section = useCore((s) => s.section)
  const selectedTask = useCore((s) => s.selectedId)
  const selectedConversation = useCore((s) => s.selectedConversationId)
  const maximized = useCore((s) => s.portsMaximized)
  const [scope, setScope] = useState('all')
  const current = section === 'tasks' ? selectedTask : selectedConversation
  useEffect(() => { if (!current) setScope('all') }, [current])
  const ports = list.ports.filter((port) => scope === 'all' || (section === 'tasks' ? port.taskId === selectedTask : port.conversationId === selectedConversation))
  const groups = portGroups(ports, tasks, conversations, terminals)
  return (
    <aside className="side-panel ports-panel" aria-label={t('PortsPanel.ports')} data-maximized={maximized || undefined}>
      <header className="terminal-panel-header ports-panel-header"><h2 className="port-panel-title">{tr('PortsPanel.port', { value1: <PortsIcon />, value2: <span className="count">{list.ports.length}</span> })}</h2><button type="button" className="tool-button" aria-label={maximized ? t('BrowserSidePanel.restore') : t('BrowserSidePanel.maximize')} data-tooltip={maximized ? t('BrowserSidePanel.restore') : t('BrowserSidePanel.maximize')} onClick={() => setPortsMaximized(!maximized)}>{maximized ? <RestoreIcon /> : <MaximizeIcon />}</button><button type="button" className="tool-button" aria-label={t('PortsPanel.hidePorts')} data-tooltip={t('PortsPanel.hidePorts')} onClick={togglePortsPanel}><CloseIcon /></button></header>
      <div className="ports-panel-body"><div className="ports-toolbar"><ChatPicker label={t('PortsPanel.portScope')} placement="below" value={scope} placeholder={t('PortsPanel.allTasksAndConversations')} onChange={setScope} options={[{ value: 'all', label: t('PortsPanel.allTasksAndConversations') }, { value: 'current', label: section === 'tasks' ? t('PortsPanel.currentTask') : t('PortsPanel.currentConversation'), disabled: !current }]} /><span className="muted">{loading ? t('PortsPanel.discovering') : t('PortsPanel.updatesEvery2Seconds')}</span></div>
        {list.problem ? <p className="port-problem" role="alert">{list.problem}</p> : groups.length === 0 ? <p className="inspector-empty muted">{loading ? t('PortsPanel.findingListeningPorts') : t('PortsPanel.noListeningPortsFoundStartADevelopmentService')}</p> : groups.map((group) => <section key={group.id} className="port-group"><div className="port-group-title"><span>{group.title}</span>{group.conversation && <span className="port-owner"><AgentIcon agent={group.conversation.agent} />{agentLabel(group.conversation.agent)}</span>}</div>{group.ports.map((port) => <PortRow key={portKey(port)} port={port} />)}</section>)}
      </div><footer className="ports-panel-footer">{tr('PortsPanel.listeningPortsGroups', { value1: ports.length, value2: groups.length })}</footer>
    </aside>
  )
}
