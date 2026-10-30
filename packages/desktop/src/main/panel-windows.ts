import { PanelCommand, PanelDockPayload, PanelHandoff, PanelKind, type PanelCommand as PanelCommandValue, type PanelDockPayload as PanelDockPayloadValue, type PanelHandoff as PanelHandoffValue, type PanelKind as PanelKindValue, type PanelDelivery, type PanelWindowsMessage } from '../shared/panel-window'

interface PanelWindow {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
  close(): void
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): void
  once(event: 'closed', listener: () => void): void
  webContents: {
    isDestroyed(): boolean
    send(channel: string, payload?: unknown): void
    once(event: 'did-finish-load', listener: () => void): void
  }
}

type ClosingHandoff = Extract<PanelDelivery['action'], { type: 'handoff' }>

// One window each for the browser, files and terminal. Commands that arrive while the page is
// still loading wait, so a selection made during that moment is not lost.
export class PanelWindows {
  private readonly windows = new Map<PanelKindValue, PanelWindow>()
  private readonly pending = new Map<PanelKindValue, PanelCommandValue[]>()
  private readonly ready = new Set<PanelKindValue>()
  private readonly closing = new Map<PanelKindValue, ClosingHandoff>()
  private readonly deliveries = new Map<number, PanelDelivery>()
  private readonly receipts = new Map<number, (accepted: boolean) => void>()
  private nextDelivery = 0
  private quitting = false
  // A window's own close asks the page to hand its state back before it actually goes.
  private readonly handing = new Set<PanelKindValue>()

  constructor(
    private readonly create: (kind: PanelKindValue, slot: number) => PanelWindow,
    private readonly notify: (message: PanelWindowsMessage) => void
  ) {}

  kinds(): PanelKindValue[] {
    return [...this.windows.keys()]
  }

  owns(contents: unknown): PanelKindValue | null {
    for (const [kind, window] of this.windows) {
      if (!window.isDestroyed() && window.webContents === contents) return kind
    }
    return null
  }

  open(kind: PanelKindValue, commands: readonly PanelCommandValue[]): void {
    const existing = this.windows.get(kind)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
      for (const command of commands) this.send(kind, command)
      return
    }
    const window = this.create(kind, this.windows.size)
    this.windows.set(kind, window)
    this.pending.set(kind, [...commands])
    window.webContents.once('did-finish-load', () => this.flush(kind, window))
    window.on('close', (event) => {
      if (this.quitting || this.closing.has(kind) || window.isDestroyed() || window.webContents.isDestroyed()) return
      event.preventDefault()
      if (this.handing.has(kind)) return
      this.handing.add(kind)
      if (this.ready.has(kind)) window.webContents.send('antumi:panel-request-close')
    })
    window.once('closed', () => {
      if (this.windows.get(kind) === window) this.finish(kind)
    })
    this.announce()
  }

  send(kind: PanelKindValue, command: PanelCommandValue): void {
    const window = this.windows.get(kind)
    if (!window || window.isDestroyed()) return
    if (!this.ready.has(kind)) {
      const queued = this.pending.get(kind) ?? []
      queued.push(command)
      this.pending.set(kind, queued)
      return
    }
    window.webContents.send('antumi:panel-command', command)
  }

  announce(): void {
    this.notify({ open: this.kinds(), deliveries: [...this.deliveries.values()] })
  }

  // Main retains transfers until the receiving renderer confirms them, even across window loads.
  deliver(action: PanelDelivery['action']): Promise<boolean> {
    return new Promise((resolve) => {
      this.queue(action, resolve)
      this.announce()
    })
  }

  acknowledge(id: number, accepted: boolean): void {
    this.deliveries.delete(id)
    this.receipts.get(id)?.(accepted)
    this.receipts.delete(id)
  }

  beginQuit(): void {
    this.quitting = true
  }

  focus(kind: PanelKindValue): void {
    const window = this.windows.get(kind)
    if (!window || window.isDestroyed()) return
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  // The main window putting the panel away. The page hands its state back, then the window goes.
  dismiss(kind: PanelKindValue): void {
    const window = this.windows.get(kind)
    if (window && !window.isDestroyed()) window.close()
  }

  // Puts the panel away. The page's handoff keeps its files and which tab was showing.
  hide(kind: PanelKindValue, handoff: PanelHandoffValue): void {
    this.shutdown(kind, false, handoff)
  }

  dock(kind: PanelKindValue, payload: PanelDockPayloadValue): void {
    this.shutdown(kind, true, payload)
  }

  private shutdown(kind: PanelKindValue, docked: boolean, handoff: PanelHandoffValue): void {
    if (this.closing.has(kind)) return
    this.closing.set(kind, { type: 'handoff', kind, docked, handoff })
    const window = this.windows.get(kind)
    if (!window || window.isDestroyed()) this.finish(kind)
    else window.close()
  }

  private finish(kind: PanelKindValue): void {
    this.windows.delete(kind)
    this.pending.delete(kind)
    this.ready.delete(kind)
    this.handing.delete(kind)
    const handoff = this.closing.get(kind)
    this.closing.delete(kind)
    if (handoff) this.queue(handoff)
    this.announce()
  }

  private flush(kind: PanelKindValue, window: PanelWindow): void {
    if (window.isDestroyed()) return
    this.ready.add(kind)
    const commands = coalesce(this.pending.get(kind) ?? [])
    this.pending.delete(kind)
    for (const command of commands) window.webContents.send('antumi:panel-command', command)
    if (this.handing.has(kind)) window.webContents.send('antumi:panel-request-close')
  }

  private queue(action: PanelDelivery['action'], receipt?: (accepted: boolean) => void): void {
    const id = ++this.nextDelivery
    this.deliveries.set(id, { id, action })
    if (receipt) this.receipts.set(id, receipt)
  }
}

// Repeated context updates while the page loads collapse to the latest of each kind.
export function coalesce(commands: readonly PanelCommandValue[]): PanelCommandValue[] {
  const latest = new Map<string, PanelCommandValue>()
  const rest: PanelCommandValue[] = []
  for (const command of commands) {
    if (command.type === 'context' || command.type === 'files-state' || command.type === 'select-terminal') latest.set(command.type, command)
    else rest.push(command)
  }
  return [...latest.values(), ...rest]
}

export function parsePanelCommands(value: unknown): PanelCommandValue[] | null {
  const parsed = PanelCommand.array().safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parsePanelKind(value: unknown): PanelKindValue | null {
  const parsed = PanelKind.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseDockPayload(value: unknown): PanelDockPayloadValue | null {
  const parsed = PanelDockPayload.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseHandoff(value: unknown): PanelHandoffValue | null {
  const parsed = PanelHandoff.safeParse(value)
  return parsed.success ? parsed.data : null
}
