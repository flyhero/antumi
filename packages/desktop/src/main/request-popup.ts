import { screen, type BrowserWindow, type BrowserWindowConstructorOptions, type WebContents } from 'electron'
import { islandDisplay, POPUP_WIDTH, popupArea, popupBounds, type PopupPlacement } from './popup-placement'

// Up only when a request comes while the user is away, or kept up always, as an island at the
// notch (macOS) that the page draws small until pointed at or asked to expand.
export type PopupMode = 'requests' | 'always'

// The card at the top of the screen with what agents wait on, for answering from another app.
// The main window's renderer asks for it when a request comes in while the user is away; the
// card's own renderer, a client of core like any window, says whether it has anything to show
// and how tall it is. Main only places the window: what is asked and answered is core's.
export class RequestPopup {
  private window: BrowserWindow | null = null
  private wanted = false
  private mode: PopupMode = 'requests'
  // The display it came up on, kept while it shows so a new height does not move it.
  private placement: PopupPlacement | null = null
  // The page's last height, to put the window back together after the displays change.
  private height = 0
  // The chats with a reply the user has not looked at, from the main window, which alone knows.
  private unseen: string[] = []

  constructor(private readonly create: () => BrowserWindow) {}

  // Asked for (a request came while the user was away) or put away (the user is back). An
  // island kept up always only expands and folds: the page does that on this word.
  want(wanted: boolean): void {
    this.wanted = wanted
    if (!wanted && this.mode === 'requests') this.hide()
    if (wanted && !this.window) {
      this.place()
      this.open()
      return
    }
    this.window?.webContents.send('antumi:request-popup-wanted', wanted)
  }

  // Only macOS has the island, over the menu bar: elsewhere always means when asked.
  setMode(mode: PopupMode): void {
    const next = process.platform === 'darwin' ? mode : 'requests'
    if (this.mode === next) return
    this.mode = next
    this.placement = null
    if (next === 'always') {
      this.place()
      if (!this.window) this.open()
    } else if (!this.wanted) {
      this.hide()
    }
  }

  // The card's say: shown at its height, or put away with nothing left to show.
  layout(visible: boolean, height: number): void {
    const window = this.window
    if (!window) return
    // Down while it loads or between chats, it may still come up; once put away, a late word from
    // the card does not bring it back.
    if (!visible || (!this.wanted && this.mode === 'requests')) {
      this.hide()
      return
    }
    this.height = height
    const { area, gap } = this.place()
    window.setBounds(popupBounds(area, height, gap))
    // Never takes the keyboard from the app the user is in: a number key there must not answer.
    if (!window.isVisible()) window.showInactive()
  }

  // From the card: whether the pointer is on it. An island's window lies over the menu bar and
  // whatever is under the card, so its clear parts let clicks through until the card is pointed
  // at. Pointer moves still reach the page, which is how it knows.
  setInteractive(interactive: boolean): void {
    if (this.placement?.island) this.window?.setIgnoreMouseEvents(!interactive, { forward: true })
  }

  setAttention(unseen: string[]): void {
    this.unseen = unseen
    this.window?.webContents.send('antumi:request-popup-attention', unseen)
  }

  owns(contents: WebContents): boolean {
    return this.window !== null && this.window.webContents === contents
  }

  destroy(): void {
    this.window?.destroy()
    this.window = null
    this.placement = null
  }

  private hide(): void {
    this.setInteractive(false)
    this.placement = null
    if (this.window?.isVisible()) this.window.hide()
  }

  // The display the card is on, chosen once per showing and told to the page, which draws the
  // card to fit: an island joined to the notch, or a plain card. When asked for, the display
  // under the pointer, where the user is; kept up always, the built-in one with the notch.
  private place(): PopupPlacement {
    if (!this.placement) {
      const display = this.mode === 'always' ? islandDisplay(screen.getAllDisplays(), screen.getPrimaryDisplay()) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
      this.placement = popupArea(display, process.platform)
      this.tellGeometry()
    }
    return this.placement
  }

  private tellGeometry(): void {
    if (!this.window || !this.placement) return
    const { island, notch } = this.placement
    this.window.webContents.send('antumi:request-popup-geometry', { island, notch })
    // Clear until pointed at; a page that never asks (one too old to) keeps the whole window.
    this.setInteractive(false)
  }

  // The displays changed under an island kept up always: back onto the built-in one, where it
  // belongs now. The page hears the new geometry and lays itself out again.
  private readonly displaysChanged = (): void => {
    if (this.mode !== 'always' || !this.window || !this.window.isVisible()) return
    this.placement = null
    const { area, gap } = this.place()
    this.window.setBounds(popupBounds(area, this.height, gap))
  }

  private open(): void {
    const window = this.create()
    this.window = window
    // Above other apps' windows. On macOS a panel also floats over a full-screen app, on every
    // Space; at the status level it draws over the menu bar too, where the island sits. Wayland
    // lets no app place or raise its own window: there the card is a plain window wherever the
    // compositor puts it. Left to itself, Electron turns the whole app into a UI element to reach
    // full-screen Spaces, and does not always turn it back: the app lost its Dock icon. A panel
    // reaches them as it is, so the app's type is left alone.
    if (process.platform === 'darwin') {
      window.setAlwaysOnTop(true, 'status')
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
    } else {
      window.setAlwaysOnTop(true)
    }
    // A fresh page is a fresh showing: placed again, so it hears where it is even after the last
    // one was put away (which forgets the display).
    window.webContents.on('did-finish-load', () => {
      window.webContents.send('antumi:request-popup-wanted', this.wanted)
      window.webContents.send('antumi:request-popup-attention', this.unseen)
      this.placement = null
      this.place()
    })
    screen.on('display-added', this.displaysChanged)
    screen.on('display-removed', this.displaysChanged)
    screen.on('display-metrics-changed', this.displaysChanged)
    window.once('closed', () => {
      screen.off('display-added', this.displaysChanged)
      screen.off('display-removed', this.displaysChanged)
      screen.off('display-metrics-changed', this.displaysChanged)
      if (this.window === window) {
        this.window = null
        this.placement = null
      }
    })
  }
}

// The window itself; the caller loads the page and keeps it from navigating.
export function popupWindowOptions(preload: string): BrowserWindowConstructorOptions {
  return {
    width: POPUP_WIDTH,
    height: 200,
    show: false,
    frame: false,
    // The card draws its own corners and shadow (styles.css), on a window that is clear around it.
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    title: 'Antumi',
    // An NSPanel: floats over full-screen apps without bringing Antumi's other windows forward.
    // macOS keeps a window out of the menu bar unless told it may be larger than the screen, and
    // Electron rounds a frameless window's corners by itself, which would clip the island's top
    // corners where it is flush with the screen's edge.
    ...(process.platform === 'darwin' ? { type: 'panel', enableLargerThanScreen: true, roundedCorners: false } : {}),
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  }
}
