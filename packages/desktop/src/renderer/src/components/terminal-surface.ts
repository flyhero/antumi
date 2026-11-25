import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import type { RpcConnection } from '@antumi/protocol'
import { onThemeChange } from '../appearance'
import { codeFontStack } from '../code-font'
import { usePreferences } from '../preferences'
import { pastedCommand } from '../terminal-commands'
import { showError } from '../core-store'
import { t } from '../i18n'
import { terminalCopyHandler } from './terminal-copy'
import { terminalTheme } from './terminal-theme'

// Each session's terminal on screen, so a control outside it can type into it or read what is selected.
const shown = new Map<string, Terminal>()

// Typed as a paste would be, so a shell with bracketed paste takes every line at its prompt
// before Enter runs them.
export function typeIntoTerminal(sessionId: string, command: string, run: boolean): boolean {
  const term = shown.get(sessionId)
  if (!term) return false
  term.paste(pastedCommand(command, term.modes.bracketedPasteMode))
  if (run) term.input('\r')
  term.focus()
  return true
}

// Resolves once the session's terminal is on screen and its shell has printed something, its prompt
// most likely, so what is typed next lands at that prompt; false if neither comes in time.
export async function terminalReady(sessionId: string, timeoutMs = 3000): Promise<boolean> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const term = shown.get(sessionId)
    const buffer = term?.buffer.active
    if (buffer && (buffer.length > 1 || buffer.cursorX > 0)) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return shown.has(sessionId)
}

export function terminalSelection(sessionId: string): string {
  return shown.get(sessionId)?.getSelection() ?? ''
}

export function createTerminalSurface(element: HTMLElement, rpc: RpcConnection, sessionId: string | null) {
  const preferences = usePreferences.getState()
  const term = new Terminal({
    fontSize: preferences.terminalFontSize,
    fontFamily: codeFontStack(preferences.codeFontFamily, preferences.codeCjkFontFamily),
    lineHeight: preferences.terminalLineHeight,
    cursorBlink: Boolean(sessionId), theme: terminalTheme()
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open(element)
  fit.fit()
  term.attachCustomKeyEventHandler(terminalCopyHandler({
    getSelection: () => term.getSelection(),
    writeText: (text) => { void navigator.clipboard.writeText(text).catch(() => showError(t('fileActions.copyFailedTryAgain'))) }
  }))
  if (sessionId) shown.set(sessionId, term)
  const sendSize = () => {
    if (sessionId) void rpc.call('sessions.resize', { sessionId, cols: term.cols, rows: term.rows }).catch(() => {})
  }
  const stopAppearance = followTerminalAppearance({ term, fit, sendSize })
  const observer = new ResizeObserver(() => { fit.fit(); sendSize() })
  observer.observe(element)
  return {
    term, sendSize,
    dispose: () => {
      stopAppearance()
      observer.disconnect()
      if (sessionId && shown.get(sessionId) === term) shown.delete(sessionId)
      term.dispose()
    }
  }
}

function followTerminalAppearance({ term, fit, sendSize }: { term: Terminal; fit: FitAddon; sendSize: () => void }) {
  const stopTheming = onThemeChange(() => { term.options.theme = terminalTheme() })
  let disposed = false
  const refit = () => {
    if (disposed) return
    fit.fit()
    sendSize()
  }
  // xterm sizes its cells once, by the font as it is then, and a bundled font may still be loading:
  // once it is in, the cells are measured again.
  const remeasure = () => {
    const { fontFamily } = term.options
    void document.fonts.load(`${term.options.fontSize}px ${fontFamily}`).then(() => {
      if (disposed || term.options.fontFamily !== fontFamily) return
      term.options.fontFamily = 'monospace'
      term.options.fontFamily = fontFamily
      refit()
    }, () => {})
  }
  if (!document.fonts.check(`${term.options.fontSize}px ${term.options.fontFamily}`)) remeasure()
  const stopFontSizing = usePreferences.subscribe((next, previous) => {
    if (next.terminalFontSize !== previous.terminalFontSize) term.options.fontSize = next.terminalFontSize
    if (next.terminalLineHeight !== previous.terminalLineHeight) term.options.lineHeight = next.terminalLineHeight
    const fontChanged = next.codeFontFamily !== previous.codeFontFamily || next.codeCjkFontFamily !== previous.codeCjkFontFamily
    if (fontChanged) {
      term.options.fontFamily = codeFontStack(next.codeFontFamily, next.codeCjkFontFamily)
      remeasure()
    }
    if (next.terminalFontSize !== previous.terminalFontSize || next.terminalLineHeight !== previous.terminalLineHeight || fontChanged) refit()
  })
  return () => {
    disposed = true
    stopTheming()
    stopFontSizing()
  }
}
