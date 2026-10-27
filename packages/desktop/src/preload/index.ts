import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

contextBridge.exposeInMainWorld('antumi', {
  platform: process.platform,
  onFullScreenChange: (listener: (fullScreen: boolean) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, fullScreen: unknown) => listener(fullScreen === true)
    ipcRenderer.on('antumi:full-screen', handler)
    return () => ipcRenderer.removeListener('antumi:full-screen', handler)
  },
  getCoreEndpoint: (): Promise<unknown> => ipcRenderer.invoke('antumi:core-endpoint'),
  appVersion: (): Promise<unknown> => ipcRenderer.invoke('antumi:app-version'),
  pickPlugin: (kind: 'directory' | 'zip'): Promise<unknown> => ipcRenderer.invoke('antumi:pick-plugin', kind),
  pickFolder: (defaultPath?: string, title?: string): Promise<unknown> => ipcRenderer.invoke('antumi:pick-folder', defaultPath, title),
  setLanguage: (locale: string): Promise<unknown> => ipcRenderer.invoke('antumi:set-language', locale),
  setTheme: (theme: string): Promise<unknown> => ipcRenderer.invoke('antumi:set-theme', theme),
  revealFile: (candidates: string[]): Promise<unknown> => ipcRenderer.invoke('antumi:reveal-file', candidates),
  openFile: (path: string): Promise<unknown> => ipcRenderer.invoke('antumi:open-file', path),
  openWithApps: (): Promise<unknown> => ipcRenderer.invoke('antumi:open-with-apps'),
  openWith: (path: string, app: string): Promise<unknown> => ipcRenderer.invoke('antumi:open-with', path, app),
  notify: (notice: unknown): Promise<unknown> => ipcRenderer.invoke('antumi:notify', notice),
  setBadge: (count: number): Promise<unknown> => ipcRenderer.invoke('antumi:set-badge', count),
  onNotificationClick: (listener: (target: unknown) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, target: unknown) => listener(target)
    ipcRenderer.on('antumi:notification-click', handler)
    return () => ipcRenderer.removeListener('antumi:notification-click', handler)
  },
  // The card of waiting requests: the main window asks for it, the card lays itself out.
  requestPopup: (wanted: boolean): Promise<unknown> => ipcRenderer.invoke('antumi:request-popup', wanted),
  onRequestPopupWanted: (listener: (wanted: boolean) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, wanted: unknown) => listener(wanted === true)
    ipcRenderer.on('antumi:request-popup-wanted', handler)
    return () => ipcRenderer.removeListener('antumi:request-popup-wanted', handler)
  },
  requestPopupLayout: (layout: { visible: boolean; height: number }): void => ipcRenderer.send('antumi:request-popup-layout', layout),
  openFromRequestPopup: (target: unknown): Promise<unknown> => ipcRenderer.invoke('antumi:request-popup-open', target),
  // The built-in browser's tab on show, placed over the panel by main.
  browserShow: (tabId: string | null): Promise<unknown> => ipcRenderer.invoke('antumi:browser-show', tabId),
  browserBounds: (bounds: { x: number; y: number; width: number; height: number }): void => ipcRenderer.send('antumi:browser-bounds', bounds),
  browserOccluded: (occluded: boolean): Promise<unknown> => ipcRenderer.invoke('antumi:browser-occluded', occluded),
  bookmarkSources: (): Promise<unknown> => ipcRenderer.invoke('antumi:bookmark-sources'),
  readBookmarks: (id: string): Promise<unknown> => ipcRenderer.invoke('antumi:bookmark-read', id),
  pickBookmarksFile: (): Promise<unknown> => ipcRenderer.invoke('antumi:bookmark-pick-html'),
  onBrowserFocused: (listener: (event: unknown) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on('antumi:browser-focused', handler)
    return () => ipcRenderer.removeListener('antumi:browser-focused', handler)
  },
  updateState: (): Promise<unknown> => ipcRenderer.invoke('antumi:update-state'),
  checkForUpdate: (): Promise<unknown> => ipcRenderer.invoke('antumi:update-check'),
  installUpdate: (): Promise<unknown> => ipcRenderer.invoke('antumi:update-install'),
  skipUpdate: (version: string | null): Promise<unknown> => ipcRenderer.invoke('antumi:update-skip', version),
  setUpdateAutomatic: (automatic: boolean): Promise<unknown> => ipcRenderer.invoke('antumi:update-automatic', automatic),
  setUpdatePrerelease: (prerelease: boolean): Promise<unknown> => ipcRenderer.invoke('antumi:update-prerelease', prerelease),
  onUpdate: (listener: (state: unknown) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, state: unknown) => listener(state)
    ipcRenderer.on('antumi:update', handler)
    return () => ipcRenderer.removeListener('antumi:update', handler)
  },
  onBrowserShortcut: (listener: (event: unknown) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, payload: unknown) => listener(payload)
    ipcRenderer.on('antumi:browser-shortcut', handler)
    return () => ipcRenderer.removeListener('antumi:browser-shortcut', handler)
  }
})
