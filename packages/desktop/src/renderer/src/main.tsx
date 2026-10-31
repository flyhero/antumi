import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist-mono/wght.css'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { App } from './App'
import { PetPlayground } from './components/PetPlayground'
import { startAppearance } from './appearance'
import { startBackgroundRest } from './background-rest'
import { startCodeFont } from './code-font'
import { followRequestPopup, RequestPopup } from './components/RequestPopup'
import { startCoreConnection, useCore } from './core-store'
import { startPanelWindowHost } from './panel-window-host'
import { startPanelWindowPage, thisPanelKind } from './panel-window-page'
import { PanelWindow } from './components/PanelWindow'
import { ConfirmDialog } from './components/ConfirmDialog'
import { SettingsPage } from './components/SettingsPage'
import { applyTitleBar } from './desktop-bridge'
import { startNotifications } from './notifications'
import { startDisabledAgentsMirror } from './installed-agents'
import { followPreferences } from './preferences'
import { startUnsavedEditRetries } from './unsaved-edits'
import { startUiLanguage } from './language'
import { startWorktreeUpdates } from './worktree-store'

// The card of waiting requests (main's request-popup.ts) is this page too, with only what it needs:
// the main window alone tells the user things, counts on the dock and keeps worktrees current.
const popup = location.hash === '#request-popup'
const panelKind = thisPanelKind()
// The pet's playground (components/PetPlayground.tsx): the stage with a stand-in for the app, no core.
const settingsPreview = import.meta.env.DEV && ['#pet-settings', '#settings'].includes(location.hash)
const playground = location.hash === '#pet-playground' || settingsPreview
if (settingsPreview) useCore.setState({ settingsOpen: true, settingsSection: location.hash === '#pet-settings' ? 'pet' : 'appearance' })

startUiLanguage()
followPreferences()

// Outside React so StrictMode's double-mount can't start two loops.
if (playground) {
  if (new URLSearchParams(location.search).has('port')) startCoreConnection('requests')
  startAppearance()
  startBackgroundRest()
  startCodeFont()
} else if (popup) {
  document.documentElement.dataset.window = 'request-popup'
  followRequestPopup()
  startCoreConnection('requests')
  startAppearance()
  startCodeFont()
} else if (panelKind) {
  startPanelWindowPage()
  startCoreConnection()
  startAppearance()
  startBackgroundRest()
  startCodeFont()
} else {
  startCoreConnection()
  startAppearance()
  startBackgroundRest()
  startCodeFont()
  applyTitleBar()
  startUnsavedEditRetries()
  startWorktreeUpdates()
  startNotifications()
  startDisabledAgentsMirror()
  startPanelWindowHost()
}

const root = document.getElementById('root')
if (!root) {
  throw new Error('missing #root')
}
createRoot(root).render(
  <StrictMode>
    {settingsPreview ? <div className="app"><SettingsPage /></div> : playground ? <PetPlayground /> : popup ? <RequestPopup /> : panelKind ? <PanelWindow kind={panelKind} /> : <App />}
    <ConfirmDialog />
  </StrictMode>
)
