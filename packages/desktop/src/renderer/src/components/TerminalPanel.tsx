import { t, tr } from '../i18n'
import { useEffect, useState } from 'react'
import type { Terminal } from '@antumi/protocol'
import { addQuote } from '../chat-quotes'
import { closeTerminal, openTerminal, selectTerminal, setTerminalMaximized, toggleTerminalPanel, useCore, useTerminalCommandsSupported, type CoreState } from '../core-store'
import { hideThisPanel, quoteFromPanel, thisPanelKind } from '../panel-window-page'
import { AgentIcon, CloseIcon, MaximizeIcon, PlusIcon, QuoteIcon, RestoreIcon } from './icons'
import { PanelWindowButton } from './PanelWindowButton'
import { SessionTerminal } from './SessionTerminal'
import { TerminalCommandsButton } from './TerminalCommandsMenu'
import { terminalSelection } from './terminal-surface'
import { usePanelShortcut } from '../panel-shortcuts'

// Where a passage of the terminal goes: the conversation whose agent runs it, else the chat the
// user has open, a task's included.
function quoteTarget(state: CoreState, terminal: Terminal | undefined): string | null {
  if (terminal?.conversationId) return terminal.conversationId
  if (state.selectedConversationId) return state.selectedConversationId
  return state.selectedId ? state.tasks[state.selectedId]?.conversationId ?? null : null
}

// What the terminal shows, as text to quote: the spaces it pads each row with dropped.
function selectedLines(sessionId: string): string {
  return terminalSelection(sessionId).split('\n').map((line) => line.trimEnd()).join('\n').trim()
}

// Quotes what is selected in the terminal into a chat's input, to ask the agent about it; shown by
// the selection itself. It says where the passage went, then goes.
function QuoteSelection({ terminal, dismiss }: { terminal: Terminal; dismiss: () => void }) {
  const target = useCore((s) => quoteTarget(s, terminal))
  const title = useCore((s) => (target ? s.conversations[target]?.title ?? null : null))
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const timer = setTimeout(dismiss, 1200)
    return () => clearTimeout(timer)
  }, [done, dismiss])
  const quote = async () => {
    const text = selectedLines(terminal.sessionId)
    if (!target || !text) return
    try {
      if (thisPanelKind()) {
        const accepted = await quoteFromPanel(target, text)
        setDone(accepted)
        if (!accepted) useCore.setState({ error: t('PanelWindow.sendFailed') })
      } else setDone(addQuote(target, null, text) !== null)
    } catch (error) {
      useCore.setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }
  if (done) return <span className="terminal-quote-done" role="status">{title ? t('TerminalPanel.quotedIn', { title: title }) : t('TerminalPanel.quotedInComposer')}</span>
  return (
    <button
      type="button"
      className="button terminal-quote-button"
      disabled={!target}
      title={target ? (title ? t('TerminalPanel.quoteInComposer', { title: title }) : t('TerminalPanel.quoteInChatComposer')) : t('TerminalPanel.openAConversationBeforeQuoting')}
      // Keeps the terminal's selection and focus while the click reads it.
      onMouseDown={(event) => event.preventDefault()}
      onClick={quote}
    >{tr('TerminalPanel.quoteInChat', { value1: <QuoteIcon /> })}</button>
  )
}

// Finite commands show how they ended; agent terminals also show whose they are.
function TabLabel({ terminal }: { terminal: Terminal }) {
  const owner = useCore((s) => (terminal.conversationId ? s.conversations[terminal.conversationId] : undefined))
  if (!terminal.command) return <>{terminal.title}</>
  const failed = terminal.exited && terminal.exitCode !== 0
  return (
    <>
      {terminal.conversationId && <span className="terminal-tab-agent" aria-hidden="true"><AgentIcon agent={owner?.agent ?? null} /></span>}
      {/* Before the command, which a narrow tab cuts short. */}
      {terminal.exited && <span className="terminal-tab-exit" data-failed={failed || undefined}>{failed ? terminal.exitCode ?? t('SquadWorkPanel.ended') : '✓'}</span>}
      {terminal.title}
    </>
  )
}

function tabTitle(terminal: Terminal, owner: string | null): string {
  if (!terminal.command) return terminal.cwd
  const ended = terminal.exited ? t('TerminalPanel.ended', { value1: terminal.exitCode === null || terminal.exitCode === undefined ? '' : t('TerminalPanel.exitCode', { value1: terminal.exitCode }) }) : ''
  return `${terminal.conversationId ? t('TerminalPanel.agentRun', { value1: owner ?? t('BrowserPanel.conversation') }) : ''}${terminal.command}\n${terminal.cwd}${ended}`
}

// The app's own terminals: the user's shells, and commands agents run where the user can watch.
// The dock puts them below the browser when both are open. Hiding the panel leaves them running in
// the daemon; closing a tab ends what runs in it.
export function TerminalPanel({ windowed = false }: { windowed?: boolean }) {
  const shortcut = usePanelShortcut('toggle-terminal')
  const terminals = useCore((s) => s.terminals)
  const activeId = useCore((s) => s.activeTerminalId)
  const maximized = useCore((s) => s.terminalMaximized)
  const commandsSupported = useTerminalCommandsSupported()
  const conversations = useCore((s) => s.conversations)
  const active = terminals.find((terminal) => terminal.id === activeId) ?? terminals.at(-1)
  return (
    <aside className="side-panel terminal-panel" aria-label={t('SettingsPage.terminal')} data-maximized={maximized || undefined}>
      <header className="terminal-panel-header">
        <div className="terminal-tab-strip">
          <div className="terminal-tabs" role="tablist" aria-label={t('SettingsPage.terminal')}>
            {terminals.map((terminal) => (
              <div key={terminal.id} className="terminal-tab" data-active={terminal.id === active?.id || undefined} data-agent={terminal.conversationId ? true : undefined}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={terminal.id === active?.id}
                  title={tabTitle(terminal, terminal.conversationId ? conversations[terminal.conversationId]?.title ?? null : null)}
                  onClick={() => selectTerminal(terminal.id)}
                >
                  <TabLabel terminal={terminal} />
                </button>
                <button type="button" className="terminal-tab-close" aria-label={t('TerminalPanel.closeTerminal', { value1: terminal.title })} title={t('TerminalPanel.closeEndThisTerminal')} onClick={() => closeTerminal(terminal.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="tool-button terminal-tab-add" aria-label={t('TerminalPanel.newTerminal')} data-tooltip={t('TerminalPanel.newTerminal')} onClick={() => void openTerminal()}>
            <PlusIcon />
          </button>
        </div>
        {commandsSupported && <TerminalCommandsButton terminal={active} />}
        <PanelWindowButton kind="terminal" windowed={windowed} />
        {!windowed && (
          <button
            type="button"
            className="tool-button"
            aria-label={maximized ? t('BrowserSidePanel.restore') : t('BrowserSidePanel.maximize')}
            data-tooltip={maximized ? t('BrowserSidePanel.restore') : t('BrowserSidePanel.maximize')}
            onClick={() => setTerminalMaximized(!maximized)}
          >
            {maximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
        )}
        <button type="button" className="tool-button" aria-label={t('TerminalPanel.hideTerminal')} data-tooltip={[t('TerminalPanel.hideTerminalKeepsRunning'), shortcut].filter(Boolean).join(' ')} onClick={windowed ? hideThisPanel : () => void toggleTerminalPanel()}>
          <CloseIcon />
        </button>
      </header>
      <div className="terminal-panel-body">
        {active ? (
          <SessionTerminal key={active.sessionId} sessionId={active.sessionId} selectionAction={(dismiss) => <QuoteSelection terminal={active} dismiss={dismiss} />} />
        ) : (
          <p className="inspector-empty muted">{t('InstalledAgentsSettings.openingTerminal')}</p>
        )}
      </div>
    </aside>
  )
}
