import type { Rectangle, WebContents } from 'electron'
import type { BrowserViewport } from '@antumi/protocol'
import { mobileUserAgent } from './user-agent'

export type DeviceClass = 'phone' | 'tablet' | 'desktop'

// What a size stands for, by its width as sites' own breakpoints split them; an agent's own size
// lands in the same classes as the presets.
export function deviceOf(viewport: BrowserViewport | null): DeviceClass {
  if (!viewport) return 'desktop'
  return viewport.width < 600 ? 'phone' : viewport.width < 1024 ? 'tablet' : 'desktop'
}

// Holds the page at a size of its own, or lets it fill its view again. The debugger is the
// tab's (attached by its proxy); deviceScaleFactor 0 keeps the screen's own density. A phone or a
// tablet is that device, as DevTools' device mode makes it: Android Chrome's user agent and client
// hints, the page's <meta viewport> honoured, touch. A site that chose its layout from the user
// agent chose it when it was loaded, so a change of device loads the page again.
export async function applyViewport(webContents: WebContents, viewport: BrowserViewport | null, previous: BrowserViewport | null = null): Promise<void> {
  const debug = webContents.debugger
  if (!debug.isAttached()) debug.attach('1.3')
  const device = deviceOf(viewport)
  const mobile = device !== 'desktop'
  if (viewport) {
    await debug.sendCommand('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 0, mobile })
  } else {
    await debug.sendCommand('Emulation.clearDeviceMetricsOverride')
  }
  await debug.sendCommand('Emulation.setTouchEmulationEnabled', { enabled: mobile, ...(mobile ? { maxTouchPoints: 5 } : {}) })
  // An empty user agent lifts the override: the session's own, Chrome on this machine, again.
  await debug.sendCommand('Emulation.setUserAgentOverride', mobile
    ? { userAgent: mobileUserAgent(process.versions.chrome, device === 'phone'), platform: 'Linux armv8l', userAgentMetadata: clientHints(device === 'phone') }
    : { userAgent: '' })
  if (device !== deviceOf(previous) && /^https?:\/\//i.test(webContents.getURL())) webContents.reload()
}

function clientHints(phone: boolean) {
  const major = process.versions.chrome.split('.')[0] ?? '0'
  return {
    brands: [{ brand: 'Chromium', version: major }, { brand: 'Google Chrome', version: major }, { brand: 'Not.A/Brand', version: '99' }],
    platform: 'Android',
    platformVersion: '10.0.0',
    architecture: '',
    model: phone ? 'K' : '',
    mobile: phone
  }
}

// Where a view held at a size goes within the panel: as large as fits at that aspect, centred,
// so a phone-sized page stands in the middle of a wide panel rather than stretching across it.
export function fitViewport(bounds: Rectangle, viewport: BrowserViewport | null): Rectangle {
  if (!viewport) return bounds
  const scale = Math.min(1, bounds.width / viewport.width, bounds.height / viewport.height)
  const width = Math.round(viewport.width * scale)
  const height = Math.round(viewport.height * scale)
  return { x: bounds.x + Math.round((bounds.width - width) / 2), y: bounds.y + Math.round((bounds.height - height) / 2), width, height }
}
