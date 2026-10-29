import type { BrowserCaptureMode, BrowserPageContext } from '@antumi/protocol'

export function captureBrowserPage(root: unknown, options: { mode: BrowserCaptureMode; key: string; accent: string }): Promise<{
  context: Omit<BrowserPageContext, 'image'>
  clip: { x: number; y: number; width: number; height: number } | null
} | null>
